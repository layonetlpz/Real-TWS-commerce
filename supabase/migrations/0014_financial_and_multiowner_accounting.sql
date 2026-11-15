-- =============================================================================
-- MIGRACIÓN 0014: CONTABILIDAD FINANCIERA Y MULTIPROPIETARIO (FASE 6)
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Cubre:
--   1. Costos completos por lote (compra, transporte de entrada, otros costos,
--      empaque directo y publicidad atribuible).
--   2. Estructura comercial de Precios (precio normal, promocional, precio
--      mínimo, descuento máximo e historial inmutable en price_history).
--   3. Ampliación de Acuerdos Multipropietario (public.owner_agreements):
--      comisión REAL TWS, precio mínimo, descuento máximo, autorización
--      comercial, método de liquidación, responsable de publicidad y política
--      de gastos compartidos.
--   4. Ampliación de Liquidaciones (public.owner_settlements):
--      saldo anterior, pagos anteriores, saldo final, separación entre
--      utilidad devengada y dinero cobrado, e inmutabilidad una vez aprobada.
--   5. Funciones transaccionales para prorrateo aprobado de gastos compartidos
--      y conciliación de liquidaciones sin pagos automáticos.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. COSTO DE EMPAQUE EN LOTES Y PUBLICIDAD ATRIBUIBLE EN CATEGORÍAS DE COSTO
-- -----------------------------------------------------------------------------
ALTER TABLE public.lot_owner_allocations
  ADD COLUMN IF NOT EXISTS packaging_unit_cost_cop NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (packaging_unit_cost_cop >= 0);

ALTER TABLE public.cost_records
  DROP CONSTRAINT IF EXISTS cost_records_cost_type_check;

ALTER TABLE public.cost_records
  ADD CONSTRAINT cost_records_cost_type_check CHECK (
    cost_type IN (
      'purchase_base',
      'inbound_freight',
      'other_acquisition',
      'packaging_direct',
      'commission_fee',
      'direct_expense',
      'shared_expense',
      'attributable_advertising',
      'warranty_repair',
      'cost_confirmation_update'
    )
  );

-- Hacer inmutable el historial de registros de costos auditados (append-only)
DROP TRIGGER IF EXISTS trg_cost_records_immutable ON public.cost_records;
CREATE TRIGGER trg_cost_records_immutable
  BEFORE UPDATE OR DELETE ON public.cost_records
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_ledger_mutation();

-- -----------------------------------------------------------------------------
-- 2. PRECIOS: PRECIO NORMAL, PROMOCIONAL, MÍNIMO Y DESCUENTO MÁXIMO
-- -----------------------------------------------------------------------------
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS promotional_price_cop NUMERIC(12,2)
    CHECK (promotional_price_cop IS NULL OR promotional_price_cop >= 0),
  ADD COLUMN IF NOT EXISTS minimum_price_cop NUMERIC(12,2)
    CHECK (minimum_price_cop IS NULL OR minimum_price_cop >= 0),
  ADD COLUMN IF NOT EXISTS max_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (max_discount_pct >= 0 AND max_discount_pct <= 100);

ALTER TABLE public.price_history
  ADD COLUMN IF NOT EXISTS promotional_price_cop NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS minimum_price_cop NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS max_discount_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS base_unit_cost_snapshot_cop NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS expected_margin_pct NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS expected_markup_pct NUMERIC(7,2);

-- -----------------------------------------------------------------------------
-- 3. ACUERDOS MULTIPROPIETARIO (public.owner_agreements)
--    Regla crítica: No inventar porcentajes. Mientras no esté configurado,
--    permanece en 'pending_configuration' ("PENDIENTE DE CONFIGURAR").
-- -----------------------------------------------------------------------------
ALTER TABLE public.owner_agreements
  ADD COLUMN IF NOT EXISTS minimum_price_guard_pct NUMERIC(5,2)
    CHECK (minimum_price_guard_pct IS NULL OR (minimum_price_guard_pct >= 0 AND minimum_price_guard_pct <= 100)),
  ADD COLUMN IF NOT EXISTS max_discount_allowed_pct NUMERIC(5,2)
    CHECK (max_discount_allowed_pct IS NULL OR (max_discount_allowed_pct >= 0 AND max_discount_allowed_pct <= 100)),
  ADD COLUMN IF NOT EXISTS commercial_authorization_mode TEXT NOT NULL DEFAULT 'explicit_owner_approval'
    CHECK (
      commercial_authorization_mode IN (
        'explicit_owner_approval',
        'store_delegated_within_limits',
        'admin_joint_signature'
      )
    ),
  ADD COLUMN IF NOT EXISTS settlement_method TEXT
    CHECK (
      settlement_method IS NULL OR settlement_method IN (
        'conciliated_period_cutoff',
        'per_collected_order',
        'monthly_conciliated'
      )
    ),
  ADD COLUMN IF NOT EXISTS advertising_responsibility TEXT
    CHECK (
      advertising_responsibility IS NULL OR advertising_responsibility IN (
        'owner_100_direct',
        'store_100_assumed',
        'shared_by_agreement_pct',
        'per_campaign_explicit'
      )
    ),
  ADD COLUMN IF NOT EXISTS shared_expense_policy TEXT
    CHECK (
      shared_expense_policy IS NULL OR shared_expense_policy IN (
        'proportional_net_sales',
        'proportional_cogs',
        'proportional_units_sold',
        'manual_explicit_only',
        'excluded_from_shared'
      )
    );

-- -----------------------------------------------------------------------------
-- 4. LIQUIDACIONES MULTIPROPIETARIO (public.owner_settlements)
--    Incluye saldo anterior, pagos anteriores, saldo final, dinero cobrado vs
--    utilidad devengada y prohibición de pago automático.
-- -----------------------------------------------------------------------------
ALTER TABLE public.owner_settlements
  ADD COLUMN IF NOT EXISTS packaging_and_ad_expenses_cop NUMERIC(14,2) NOT NULL DEFAULT 0
    CHECK (packaging_and_ad_expenses_cop >= 0),
  ADD COLUMN IF NOT EXISTS collected_sales_cash_cop NUMERIC(14,2) NOT NULL DEFAULT 0
    CHECK (collected_sales_cash_cop >= 0),
  ADD COLUMN IF NOT EXISTS uncollected_receivable_cop NUMERIC(14,2) NOT NULL DEFAULT 0
    CHECK (uncollected_receivable_cop >= 0),
  ADD COLUMN IF NOT EXISTS previous_balance_cop NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS previous_payments_cop NUMERIC(14,2) NOT NULL DEFAULT 0
    CHECK (previous_payments_cop >= 0),
  ADD COLUMN IF NOT EXISTS is_conciliated BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.owner_settlements
  DROP CONSTRAINT IF EXISTS owner_settlements_settlement_status_check;

ALTER TABLE public.owner_settlements
  ADD CONSTRAINT owner_settlements_settlement_status_check CHECK (
    settlement_status IN (
      'draft',
      'conciliated_pending_approval',
      'approved',
      'paid',
      'annulled'
    )
  );

-- -----------------------------------------------------------------------------
-- 5. FUNCIÓN TRANSACCIONAL: PRORRATEO APROBADO DE GASTOS COMPARTIDOS
--    Bloquea cualquier intento de aplicar un criterio no aprobado.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_allocate_approved_expense(
  p_expense_id TEXT,
  p_allocations JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exp public.expenses%ROWTYPE;
  v_item JSONB;
  v_sum_allocated NUMERIC(14,2) := 0;
  v_count INTEGER := 0;
BEGIN
  IF NOT public.fn_is_admin() THEN
    RAISE EXCEPTION 'ACCESO DENEGADO: Solo ADMIN puede aprobar y distribuir gastos entre propietarios.';
  END IF;

  SELECT * INTO v_exp
  FROM public.expenses
  WHERE id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe el gasto %.', p_expense_id;
  END IF;

  IF v_exp.approval_status <> 'approved' THEN
    RAISE EXCEPTION 'CRITERIO NO APROBADO BLOQUEADO: No se puede distribuir el gasto % porque su estado es "%" (debe estar explícitamente en "approved").',
      p_expense_id, v_exp.approval_status;
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'Debe enviar al menos una asignación de propietario para el gasto %. ', p_expense_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_sum_allocated := v_sum_allocated + COALESCE((v_item->>'allocated_amount_cop')::NUMERIC(14,2), 0);
  END LOOP;

  IF ABS(v_sum_allocated - v_exp.total_amount_cop) > 1.00 THEN
    RAISE EXCEPTION 'DESCUADRE DE PRORRATEO: La suma asignada a propietarios (% COP) no coincide con el total del gasto (% COP).',
      v_sum_allocated, v_exp.total_amount_cop;
  END IF;

  DELETE FROM public.expense_allocations WHERE expense_id = p_expense_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    INSERT INTO public.expense_allocations (
      expense_id,
      owner_id,
      allocated_amount_cop,
      allocation_percentage,
      calculation_snapshot,
      justification_note
    ) VALUES (
      p_expense_id,
      v_item->>'owner_id',
      (v_item->>'allocated_amount_cop')::NUMERIC(14,2),
      (v_item->>'allocation_percentage')::NUMERIC(7,4),
      COALESCE(v_item->'calculation_snapshot', '{}'::jsonb),
      COALESCE(v_item->>'justification_note', 'Prorrateo auditado según política ' || v_exp.allocation_policy)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMIT;
