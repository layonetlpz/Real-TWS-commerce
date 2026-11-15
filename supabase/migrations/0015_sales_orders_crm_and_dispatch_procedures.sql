-- =============================================================================
-- MIGRACIÓN 0015: SALES, ORDERS & CRM — PROCEDIMIENTOS TRANSACCIONALES,
--                 PREVENCIÓN DE DUPLICADOS DE CLIENTES, RESERVA CONCURRENTE,
--                 DIVISIÓN MULTIPROPIETARIO POR LÍNEA, DESPACHOS Y RENTABILIDAD
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. PREVENCIÓN DE DUPLICADOS EN CLIENTES Y PROTECCIÓN DE DATOS PERSONALES
-- -----------------------------------------------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT GENERATED ALWAYS AS (
    NULLIF(regexp_replace(COALESCE(phone_whatsapp, ''), '[^0-9]', '', 'g'), '')
  ) STORED,
  ADD COLUMN IF NOT EXISTS privacy_consent_at TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_phone_normalized
  ON public.customers (phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_document_normalized
  ON public.customers (UPPER(btrim(document_type)), UPPER(btrim(document_number)))
  WHERE document_number IS NOT NULL AND btrim(document_number) <> '';

-- -----------------------------------------------------------------------------
-- 2. HISTORIAL DE SEGUIMIENTO CRM (public.lead_followups)
--    Nota: Sin envíos de mensajes automáticos (prohibidos en esta fase).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL CHECK (
    interaction_type IN ('call', 'whatsapp_manual_note', 'store_visit', 'quote_sent', 'status_change', 'note')
  ),
  previous_stage TEXT,
  new_stage TEXT,
  summary TEXT NOT NULL CHECK (btrim(summary) <> ''),
  next_followup_at TIMESTAMPTZ,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_followups_lead ON public.lead_followups(lead_id, created_at DESC);

ALTER TABLE public.lead_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_followups FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_lead_followups_select ON public.lead_followups;
CREATE POLICY pol_lead_followups_select
  ON public.lead_followups
  FOR SELECT
  TO authenticated
  USING (public.fn_has_any_role(ARRAY['ADMIN', 'SALES_OPERATOR']));

DROP POLICY IF EXISTS pol_lead_followups_write ON public.lead_followups;
CREATE POLICY pol_lead_followups_write
  ON public.lead_followups
  FOR ALL
  TO authenticated
  USING (public.fn_has_any_role(ARRAY['ADMIN', 'SALES_OPERATOR']))
  WITH CHECK (public.fn_has_any_role(ARRAY['ADMIN', 'SALES_OPERATOR']));

-- -----------------------------------------------------------------------------
-- 3. AMPLIACIÓN DE ESTADOS DE PEDIDO Y TRAZABILIDAD EN ASIGNACIONES DE VENTA
-- -----------------------------------------------------------------------------
ALTER TABLE public.sales_orders
  DROP CONSTRAINT IF EXISTS sales_orders_order_status_check;

ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_order_status_check CHECK (
    order_status IN (
      'draft',
      'reserved',
      'confirmed',
      'preparing',
      'dispatched',
      'delivered',
      'partially_returned',
      'returned',
      'cancelled'
    )
  );

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS shipping_real_cost_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (shipping_real_cost_cop >= 0),
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

ALTER TABLE public.sales_item_allocations
  ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES public.stock_reservations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allocation_status TEXT NOT NULL DEFAULT 'draft' CHECK (
    allocation_status IN ('draft', 'reserved', 'dispatched', 'partially_returned', 'returned', 'cancelled_released')
  );

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS tracking_events JSONB NOT NULL DEFAULT '[]'::jsonb;

-- -----------------------------------------------------------------------------
-- 4. TRIGGER QUE IMPIDE EDITAR LÍNEAS DE UN PEDIDO YA CONFIRMADO O DESPACHADO
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_guard_unconfirmed_order_item_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT order_status INTO v_status
  FROM public.sales_orders
  WHERE id = COALESCE(NEW.sales_order_id, OLD.sales_order_id);

  IF TG_OP = 'DELETE' AND v_status NOT IN ('draft', 'reserved') THEN
    RAISE EXCEPTION 'No se pueden eliminar líneas de un pedido en estado % (solo permitido mientras no esté confirmado).', v_status;
  END IF;

  IF TG_OP = 'INSERT' AND v_status NOT IN ('draft', 'reserved') THEN
    RAISE EXCEPTION 'No se pueden agregar líneas a un pedido ya confirmado o despachado (estado %).', v_status;
  END IF;

  IF TG_OP = 'UPDATE' AND v_status NOT IN ('draft', 'reserved') THEN
    -- Una vez confirmado/despachado, solo se permite actualizar qty_returned por proceso de devolución
    IF NEW.qty_ordered <> OLD.qty_ordered
       OR NEW.unit_sale_price_cop <> OLD.unit_sale_price_cop
       OR NEW.line_discount_cop <> OLD.line_discount_cop
       OR NEW.sku <> OLD.sku THEN
      RAISE EXCEPTION 'El pedido ya fue confirmado (estado %) y sus cantidades, precios o SKUs no pueden editarse.', v_status;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_unconfirmed_order_item_edit ON public.sales_order_items;
CREATE TRIGGER trg_guard_unconfirmed_order_item_edit
  BEFORE INSERT OR UPDATE OR DELETE ON public.sales_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_unconfirmed_order_item_edit();

-- -----------------------------------------------------------------------------
-- 5. PROCEDIMIENTO TRANSACCIONAL: RESERVAR INVENTARIO POR ASIGNACIÓN DE PEDIDO
--    Previene condición de carrera cuando dos vendedores intentan reservar
--    la última unidad disponible (SELECT ... FOR UPDATE).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tx_reserve_order_allocations(
  p_sales_order_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_alloc RECORD;
  v_lot_alloc RECORD;
  v_reservation_id UUID;
  v_res_code TEXT;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_order
  FROM public.sales_orders
  WHERE id = p_sales_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % no encontrado.', p_sales_order_id;
  END IF;

  IF v_order.order_status NOT IN ('draft', 'reserved') THEN
    RAISE EXCEPTION 'Solo se puede reservar inventario para pedidos en borrador o reserva pendiente (estado actual: %).', v_order.order_status;
  END IF;

  FOR v_alloc IN
    SELECT *
    FROM public.sales_item_allocations
    WHERE sales_order_id = p_sales_order_id
      AND allocation_status = 'draft'
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    SELECT * INTO v_lot_alloc
    FROM public.lot_owner_allocations
    WHERE id = v_alloc.lot_allocation_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Asignación de lote % no encontrada.', v_alloc.lot_allocation_id;
    END IF;

    IF v_lot_alloc.qty_available < v_alloc.qty_allocated THEN
      RAISE EXCEPTION 'CONFLICTO DE CONCURRENCIA / STOCK INSUFICIENTE: El SKU % en el lote % (Propietario %) solo tiene % unidad(es) disponible(s) y se intentaron reservar %.',
        v_alloc.sku, v_alloc.lot_id, v_alloc.owner_id, v_lot_alloc.qty_available, v_alloc.qty_allocated;
    END IF;

    v_res_code := 'RES-' || v_order.order_number || '-' || substr(replace(v_alloc.id::text, '-', ''), 1, 6);

    INSERT INTO public.stock_reservations (
      reservation_code,
      lot_allocation_id,
      owner_id,
      sku,
      sales_order_ref,
      qty_reserved,
      qty_fulfilled,
      qty_released,
      reservation_status,
      reason,
      created_by
    ) VALUES (
      v_res_code,
      v_alloc.lot_allocation_id,
      v_alloc.owner_id,
      v_alloc.sku,
      v_order.order_number,
      v_alloc.qty_allocated,
      0,
      0,
      'active',
      'Reserva de inventario para pedido ' || v_order.order_number,
      p_actor_id
    )
    RETURNING id INTO v_reservation_id;

    UPDATE public.lot_owner_allocations
    SET qty_reserved = qty_reserved + v_alloc.qty_allocated,
        lock_version = COALESCE(lock_version, 1) + 1
    WHERE id = v_alloc.lot_allocation_id;

    INSERT INTO public.stock_movements (
      lot_allocation_id,
      lot_id,
      variant_id,
      sku,
      owner_id,
      movement_type,
      delta_physical,
      delta_good,
      delta_defective,
      delta_pending,
      delta_reserved,
      balance_physical_after,
      balance_good_after,
      balance_defective_after,
      balance_pending_after,
      balance_reserved_after,
      unit_cost_snapshot_cop,
      reference_entity,
      reference_id,
      reason,
      performed_by
    ) VALUES (
      v_lot_alloc.id,
      v_lot_alloc.lot_id,
      v_lot_alloc.variant_id,
      v_lot_alloc.sku,
      v_lot_alloc.owner_id,
      'RESERVATION_HOLD',
      0,
      0,
      0,
      0,
      v_alloc.qty_allocated,
      v_lot_alloc.qty_physical,
      v_lot_alloc.qty_good,
      v_lot_alloc.qty_defective,
      v_lot_alloc.qty_pending_inspection,
      v_lot_alloc.qty_reserved + v_alloc.qty_allocated,
      v_alloc.unit_cost_cop,
      'sales_order',
      v_order.order_number,
      'Reserva pedido ' || v_order.order_number,
      p_actor_id
    );

    UPDATE public.sales_item_allocations
    SET reservation_id = v_reservation_id,
        allocation_status = 'reserved'
    WHERE id = v_alloc.id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.sales_orders
  SET order_status = CASE WHEN order_status = 'draft' THEN 'reserved' ELSE order_status END
  WHERE id = p_sales_order_id;

  RETURN jsonb_build_object(
    'sales_order_id', p_sales_order_id,
    'order_number', v_order.order_number,
    'reservations_created', v_count
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. PROCEDIMIENTO TRANSACCIONAL: CANCELAR PEDIDO Y LIBERAR RESERVAS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tx_cancel_sales_order(
  p_sales_order_id UUID,
  p_reason TEXT,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_alloc RECORD;
  v_lot_alloc RECORD;
  v_released_count INTEGER := 0;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Debe indicar el motivo de cancelación del pedido.';
  END IF;

  SELECT * INTO v_order
  FROM public.sales_orders
  WHERE id = p_sales_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % no encontrado.', p_sales_order_id;
  END IF;

  IF v_order.order_status IN ('dispatched', 'delivered', 'returned', 'partially_returned') THEN
    RAISE EXCEPTION 'Un pedido ya despachado o entregado (%) no puede cancelarse directamente; debe procesarse una devolución.', v_order.order_status;
  END IF;

  IF v_order.order_status = 'cancelled' THEN
    RAISE EXCEPTION 'El pedido % ya se encuentra cancelado.', v_order.order_number;
  END IF;

  FOR v_alloc IN
    SELECT *
    FROM public.sales_item_allocations
    WHERE sales_order_id = p_sales_order_id
      AND allocation_status = 'reserved'
    FOR UPDATE
  LOOP
    SELECT * INTO v_lot_alloc
    FROM public.lot_owner_allocations
    WHERE id = v_alloc.lot_allocation_id
    FOR UPDATE;

    UPDATE public.lot_owner_allocations
    SET qty_reserved = GREATEST(0, qty_reserved - v_alloc.qty_allocated),
        lock_version = COALESCE(lock_version, 1) + 1
    WHERE id = v_lot_alloc.id;

    IF v_alloc.reservation_id IS NOT NULL THEN
      UPDATE public.stock_reservations
      SET qty_released = qty_reserved,
          reservation_status = 'released'
      WHERE id = v_alloc.reservation_id;
    END IF;

    INSERT INTO public.stock_movements (
      lot_allocation_id,
      lot_id,
      variant_id,
      sku,
      owner_id,
      movement_type,
      delta_physical,
      delta_good,
      delta_defective,
      delta_pending,
      delta_reserved,
      balance_physical_after,
      balance_good_after,
      balance_defective_after,
      balance_pending_after,
      balance_reserved_after,
      unit_cost_snapshot_cop,
      reference_entity,
      reference_id,
      reason,
      performed_by
    ) VALUES (
      v_lot_alloc.id,
      v_lot_alloc.lot_id,
      v_lot_alloc.variant_id,
      v_lot_alloc.sku,
      v_lot_alloc.owner_id,
      'RESERVATION_RELEASE',
      0,
      0,
      0,
      0,
      -v_alloc.qty_allocated,
      v_lot_alloc.qty_physical,
      v_lot_alloc.qty_good,
      v_lot_alloc.qty_defective,
      v_lot_alloc.qty_pending_inspection,
      GREATEST(0, v_lot_alloc.qty_reserved - v_alloc.qty_allocated),
      v_alloc.unit_cost_cop,
      'sales_order_cancel',
      v_order.order_number,
      'Liberación por cancelación de pedido: ' || p_reason,
      p_actor_id
    );

    UPDATE public.sales_item_allocations
    SET allocation_status = 'cancelled_released'
    WHERE id = v_alloc.id;

    v_released_count := v_released_count + 1;
  END LOOP;

  UPDATE public.sales_orders
  SET order_status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = btrim(p_reason)
  WHERE id = p_sales_order_id;

  RETURN jsonb_build_object(
    'sales_order_id', p_sales_order_id,
    'order_number', v_order.order_number,
    'released_allocations', v_released_count
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. VISTA DE RENTABILIDAD POR PEDIDO (public.v_sales_order_profitability)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_sales_order_profitability AS
SELECT
  so.id AS sales_order_id,
  so.order_number,
  so.order_date,
  so.order_status,
  so.payment_status,
  so.subtotal_gross_cop,
  so.discount_total_cop,
  so.returned_total_cop,
  (so.subtotal_gross_cop - so.discount_total_cop - so.returned_total_cop) AS net_merchandise_revenue_cop,
  so.shipping_charged_cop,
  so.shipping_real_cost_cop,
  so.net_order_total_cop,
  so.total_collected_cop,
  GREATEST(0, so.net_order_total_cop - so.total_collected_cop) AS pending_receivable_cop,
  COALESCE(SUM(sia.cogs_total_cop), 0) AS total_cogs_cop,
  COUNT(DISTINCT sia.owner_id) AS distinct_owners_count,
  (
    (so.subtotal_gross_cop - so.discount_total_cop - so.returned_total_cop)
    - COALESCE(SUM(sia.cogs_total_cop), 0)
    + (so.shipping_charged_cop - so.shipping_real_cost_cop)
  ) AS order_net_operating_profit_cop
FROM public.sales_orders so
LEFT JOIN public.sales_item_allocations sia
  ON sia.sales_order_id = so.id
  AND sia.allocation_status <> 'cancelled_released'
GROUP BY so.id;

COMMIT;
