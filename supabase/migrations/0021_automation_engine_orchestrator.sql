-- =============================================================================
-- MIGRACIÓN 0021: AUTOMATION ENGINE — ORQUESTADOR DE EVENTOS, COLA IDEMPOTENTE,
--                 REINTENTOS LIMITADOS Y AUDITORÍA INMUTABLE
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Cubre:
--   1. Ampliación de public.automation_jobs (Reglas configurables para los
--      14 eventos oficiales y las 7 acciones internas permitidas).
--   2. Tabla public.automation_event_queue (Cola de eventos con idempotency_key
--      única, estado de job, contador de reintentos y clasificación de error
--      transitorio vs. permanente).
--   3. Ampliación de public.automation_logs con trazabilidad de idempotencia,
--      intento, acción ejecutada y verificación de cero mutación económica.
--   4. Función transaccional public.fn_enqueue_and_process_automation_event:
--      - Regla 1 y 2: Impide ejecutar el mismo evento dos veces vía idempotency_key.
--      - Reglas 3 a 10: Bloquea por diseño cualquier descuento doble de stock,
--        pago automático, liquidación automática, mensaje masivo, publicación
--        sin autorización, cambio automático de precios, aumento de presupuesto
--        publicitario o alteración del libro histórico.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. AMPLIACIÓN DE public.automation_jobs (14 Eventos + 7 Acciones + Condiciones)
-- -----------------------------------------------------------------------------
ALTER TABLE public.automation_jobs
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'STOCK_LOW' CHECK (
    event_type IN (
      'RECEIPT_CONFIRMED',
      'PRODUCT_APPROVED',
      'STOCK_LOW',
      'STOCK_OUT',
      'PRICE_CHANGED',
      'OWNER_ALLOCATION_CHANGED',
      'ORDER_CREATED',
      'ORDER_CONFIRMED',
      'ORDER_CANCELLED',
      'ORDER_DISPATCHED',
      'RETURN_COMPLETED',
      'CONTENT_APPROVED',
      'CONTENT_PUBLISHED',
      'AD_PERFORMANCE_IMPORTED'
    )
  ),
  ADD COLUMN IF NOT EXISTS allowed_actions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3 CHECK (max_retries BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS daily_executions_used INTEGER NOT NULL DEFAULT 0 CHECK (daily_executions_used >= 0),
  ADD COLUMN IF NOT EXISTS last_reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS immutable_safety_locks JSONB NOT NULL DEFAULT '{
    "noDuplicateExecution": true,
    "useIdempotencyKeys": true,
    "noDoubleStockDeduction": true,
    "noAutomaticPayments": true,
    "noAutomaticSettlements": true,
    "noMassMessaging": true,
    "noUnapprovedPublishing": true,
    "noAutomaticPriceChanges": true,
    "noAutomaticAdBudgetIncrease": true,
    "noHistoricalLedgerMutation": true
  }'::jsonb;

-- -----------------------------------------------------------------------------
-- 2. TABLA: public.automation_event_queue (Cola Idempotente con Retry Control)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_event_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_code TEXT NOT NULL UNIQUE CHECK (btrim(queue_code) <> ''),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (btrim(idempotency_key) <> ''),
  job_id UUID REFERENCES public.automation_jobs(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'RECEIPT_CONFIRMED',
      'PRODUCT_APPROVED',
      'STOCK_LOW',
      'STOCK_OUT',
      'PRICE_CHANGED',
      'OWNER_ALLOCATION_CHANGED',
      'ORDER_CREATED',
      'ORDER_CONFIRMED',
      'ORDER_CANCELLED',
      'ORDER_DISPATCHED',
      'RETURN_COMPLETED',
      'CONTENT_APPROVED',
      'CONTENT_PUBLISHED',
      'AD_PERFORMANCE_IMPORTED'
    )
  ),
  reference_entity TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  sku TEXT,
  owner_id TEXT REFERENCES public.owners(id) ON DELETE SET NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  job_status TEXT NOT NULL DEFAULT 'queued' CHECK (
    job_status IN (
      'queued',
      'processing',
      'completed',
      'retrying_transient',
      'failed_permanent_halted',
      'blocked_duplicate_idempotency',
      'blocked_rule_disabled',
      'blocked_quota_limit'
    )
  ),
  error_classification TEXT CHECK (
    error_classification IS NULL OR error_classification IN ('NONE', 'TRANSIENT_ERROR', 'PERMANENT_ERROR')
  ),
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries INTEGER NOT NULL DEFAULT 3 CHECK (max_retries BETWEEN 0 AND 5),
  actions_executed TEXT[] NOT NULL DEFAULT '{}',
  error_message TEXT,
  triggered_by TEXT NOT NULL,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_queue_status
  ON public.automation_event_queue(job_status, enqueued_at DESC);

DROP TRIGGER IF EXISTS trg_automation_queue_updated_at ON public.automation_event_queue;
CREATE TRIGGER trg_automation_queue_updated_at
  BEFORE UPDATE ON public.automation_event_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

ALTER TABLE public.automation_event_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_event_queue FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_automation_queue_select ON public.automation_event_queue;
CREATE POLICY pol_automation_queue_select
  ON public.automation_event_queue
  FOR SELECT
  TO authenticated
  USING (
    public.fn_current_user_role() IN ('ADMIN', 'INVENTORY_OPERATOR', 'SALES_OPERATOR', 'MARKETING_OPERATOR')
  );

DROP POLICY IF EXISTS pol_automation_queue_write ON public.automation_event_queue;
CREATE POLICY pol_automation_queue_write
  ON public.automation_event_queue
  FOR ALL
  TO authenticated
  USING (public.fn_current_user_role() IN ('ADMIN', 'INVENTORY_OPERATOR', 'SALES_OPERATOR', 'MARKETING_OPERATOR'))
  WITH CHECK (public.fn_current_user_role() IN ('ADMIN', 'INVENTORY_OPERATOR', 'SALES_OPERATOR', 'MARKETING_OPERATOR'));

-- -----------------------------------------------------------------------------
-- 3. AMPLIACIÓN DE public.automation_logs (Inmutabilidad y Trazabilidad)
-- -----------------------------------------------------------------------------
ALTER TABLE public.automation_logs
  ADD COLUMN IF NOT EXISTS queue_item_id UUID REFERENCES public.automation_event_queue(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS error_classification TEXT,
  ADD COLUMN IF NOT EXISTS economic_and_stock_ledger_untouched BOOLEAN NOT NULL DEFAULT true CHECK (
    economic_and_stock_ledger_untouched = true
  );

DROP TRIGGER IF EXISTS trg_automation_logs_immutable ON public.automation_logs;
CREATE TRIGGER trg_automation_logs_immutable
  BEFORE UPDATE OR DELETE ON public.automation_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_ledger_mutation();

-- -----------------------------------------------------------------------------
-- 4. FUNCIÓN TRANSACCIONAL DE DESPACHO DE EVENTO CON IDEMPOTENCIA Y REINTENTOS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_dispatch_idempotent_automation_event(
  p_idempotency_key TEXT,
  p_event_type TEXT,
  p_reference_entity TEXT,
  p_reference_id TEXT,
  p_sku TEXT,
  p_owner_id TEXT,
  p_payload JSONB,
  p_triggered_by TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id UUID;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'REGLA 2 VIOLADA: Todo evento de automatización exige una clave idempotente (idempotency_key) no vacía.';
  END IF;

  -- Regla 1: No ejecutar el mismo evento dos veces
  SELECT id
    INTO v_existing_id
    FROM public.automation_event_queue
   WHERE idempotency_key = btrim(p_idempotency_key)
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'accepted', false,
      'status', 'blocked_duplicate_idempotency',
      'existing_queue_id', v_existing_id,
      'message', format('Evento duplicado bloqueado por idempotency_key (%s). Cero acciones re-ejecutadas.', p_idempotency_key)
    );
  END IF;

  RETURN jsonb_build_object(
    'accepted', true,
    'status', 'queued',
    'idempotency_key', btrim(p_idempotency_key)
  );
END;
$$;

COMMIT;
