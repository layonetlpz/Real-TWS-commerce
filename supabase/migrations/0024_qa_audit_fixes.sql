-- =============================================================================
-- MIGRACIÓN 0024: CORRECCIONES DE AUDITORÍA QA/QC (RPCs, RLS STORAGE E ÍNDICES)
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Regla: Migración aditiva e idempotente (sin DROP DATABASE, DROP SCHEMA ni TRUNCATE)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. CORREGIR movement_type EN fn_tx_reserve_order_allocations y fn_tx_cancel_sales_order
--    En 0003/0012 el CHECK constraint exige minúsculas: 'reservation_hold' y
--    'reservation_release'. La migración 0015 insertaba 'RESERVATION_HOLD' /
--    'RESERVATION_RELEASE' en mayúsculas, lo cual fallaría en tiempo de ejecución.
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
      'reservation_hold',
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
      'reservation_release',
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
-- 2. ALINEAR STORAGE POLICY DE 'private-documents' CON fn_authorize_private_document_access
--    Permite lectura scoped por propietario autorizado (OWNER con portal habilitado)
--    además de administración completa por ADMIN.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS pol_private_docs_admin_operator ON storage.objects;
DROP POLICY IF EXISTS pol_private_docs_select_authorized ON storage.objects;
DROP POLICY IF EXISTS pol_private_docs_admin_write ON storage.objects;

CREATE POLICY pol_private_docs_select_authorized ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'private-documents'
    AND (
      public.fn_is_admin()
      OR public.fn_can_owner_view(split_part(name, '/', 1))
    )
  );

CREATE POLICY pol_private_docs_admin_write ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'private-documents'
    AND public.fn_is_admin()
  )
  WITH CHECK (
    bucket_id = 'private-documents'
    AND public.fn_is_admin()
  );

-- -----------------------------------------------------------------------------
-- 3. ALINEAR DEFAULT EN fn_dispatch_idempotent_automation_event (p_triggered_by)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_dispatch_idempotent_automation_event(
  p_idempotency_key TEXT,
  p_event_type TEXT,
  p_reference_entity TEXT,
  p_reference_id TEXT,
  p_sku TEXT,
  p_owner_id TEXT,
  p_payload JSONB,
  p_triggered_by TEXT DEFAULT 'client_rpc'
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
    'idempotency_key', btrim(p_idempotency_key),
    'triggered_by', COALESCE(NULLIF(btrim(p_triggered_by), ''), 'client_rpc')
  );
END;
$$;

COMMIT;
