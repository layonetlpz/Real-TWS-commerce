-- =============================================================================
-- MIGRACIÓN 0013: GESTIÓN INTEGRAL DE INVENTARIO, PRODUCTOS, PROVEEDORES,
--                 COMPRAS, RECEPCIONES Y PROCEDIMIENTOS TRANSACCIONALES
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Objetivo:
--   1. Ampliar catálogo de productos/variantes con fotografías (photo_urls)
--      y control de versión optimista (lock_version) en lot_owner_allocations.
--   2. Soportar órdenes de compra con recepción parcial y recepción completa
--      en public.purchase_receipts y public.purchase_receipt_lines.
--   3. Incorporar clave de idempotencia (idempotency_key) en operaciones de
--      inventario para prevenir doble contabilización.
--   4. Implementar procedimientos transaccionales atómicos con bloqueo
--      pesimista (SELECT ... FOR UPDATE), prevención de stock negativo y
--      validación multipropietario estricta (sin autoasignar propietario):
--        - public.fn_tx_receive_purchase_order()
--        - public.fn_tx_reserve_stock()
--        - public.fn_tx_release_reservation()
--        - public.fn_tx_dispatch_stock()
--        - public.fn_tx_process_customer_return()
--        - public.fn_tx_record_inventory_adjustment()
--   5. Crear vistas de reportes por SKU, Categoría, Propietario, Lote,
--      Proveedor y Estado de Calidad.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. FOTOGRAFÍAS EN CATÁLOGO Y CONTROL DE CONCURRENCIA / IDEMPOTENCIA
-- -----------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS photo_urls TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS photo_urls TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS reference_Overlay_notes TEXT,
  ADD COLUMN IF NOT EXISTS reference_codes TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.purchase_receipts
  DROP CONSTRAINT IF EXISTS purchase_receipts_receipt_status_check;

ALTER TABLE public.purchase_receipts
  ADD CONSTRAINT purchase_receipts_receipt_status_check CHECK (
    receipt_status IN (
      'draft',
      'ordered',
      'partial_received',
      'received',
      'confirmed',
      'reconciled',
      'cancelled'
    )
  );

ALTER TABLE public.purchase_receipts
  ADD COLUMN IF NOT EXISTS document_urls TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

ALTER TABLE public.lot_owner_allocations
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS lock_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

ALTER TABLE public.stock_reservations
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

ALTER TABLE public.quality_inspections
  ADD COLUMN IF NOT EXISTS evidence_urls TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

-- -----------------------------------------------------------------------------
-- 2. PROCEDIMIENTO TRANSACCIONAL: RECIBIR MERCANCÍA (COMPLETA O PARCIAL)
--    - Nunca autoasigna propietario por defecto (exige owner_id explícito activo).
--    - Soporta recepción parcial (actualiza estado a 'partial_received') o
--      recepción completa ('received' / 'confirmed').
--    - Separa cantidades recibidas en apto, defectuoso y pendiente de revisión.
--    - Registra lote, asignación por propietario, costo e inspección inicial.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tx_receive_purchase_order(
  p_idempotency_key TEXT,
  p_receipt_id UUID,
  p_line_id UUID,
  p_lot_id TEXT,
  p_allocation_code TEXT,
  p_owner_id TEXT,
  p_storage_bin TEXT,
  p_qty_received_now INTEGER,
  p_qty_good INTEGER,
  p_qty_defective INTEGER,
  p_qty_pending INTEGER,
  p_unit_cost_cop NUMERIC(12,2),
  p_unit_shipping_cop NUMERIC(12,2) DEFAULT 0,
  p_evidence_urls TEXT[] DEFAULT '{}',
  p_inspector_name TEXT DEFAULT 'OPERADOR_RECEPCION',
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt public.purchase_receipts%ROWTYPE;
  v_line public.purchase_receipt_lines%ROWTYPE;
  v_alloc_id UUID;
  v_new_line_received INTEGER;
  v_total_ordered INTEGER;
  v_total_received INTEGER;
  v_new_receipt_status TEXT;
BEGIN
  IF NOT public.fn_is_operator_or_admin() THEN
    RAISE EXCEPTION 'ACCESO DENEGADO: Solo ADMIN o INVENTORY_OPERATOR pueden recibir mercancía.';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'IDEMPOTENCIA REQUERIDA: Debe enviar p_idempotency_key.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.stock_movements WHERE idempotency_key = p_idempotency_key) THEN
    RAISE EXCEPTION 'OPERACIÓN DUPLICADA BLOQUEADA: La clave de idempotencia "%" ya fue procesada.', p_idempotency_key;
  END IF;

  IF p_owner_id IS NULL OR btrim(p_owner_id) = '' THEN
    RAISE EXCEPTION 'REGLA MULTIPROPIETARIO (Regla 11 y 12): El propietario es obligatorio. Prohibido autoasignar propietario futuro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.owners WHERE id = p_owner_id AND status = 'active') THEN
    RAISE EXCEPTION 'PROPIETARIO INVÁLIDO: El propietario "%" no existe o no está activo.', p_owner_id;
  END IF;

  IF p_qty_received_now <= 0 OR p_qty_good < 0 OR p_qty_defective < 0 OR p_qty_pending < 0 THEN
    RAISE EXCEPTION 'CANTIDAD INVÁLIDA: La cantidad recibida debe ser > 0 y los subtotales >= 0.';
  END IF;

  IF p_qty_received_now <> (p_qty_good + p_qty_defective + p_qty_pending) THEN
    RAISE EXCEPTION 'DESCUADRE DE RECEPCIÓN (Regla 6): Recibido (%) != Apto (%) + Defectuoso (%) + Pendiente (%).',
      p_qty_received_now, p_qty_good, p_qty_defective, p_qty_pending;
  END IF;

  SELECT * INTO v_receipt
  FROM public.purchase_receipts
  WHERE id = p_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la orden de compra / recepción %.', p_receipt_id;
  END IF;

  SELECT * INTO v_line
  FROM public.purchase_receipt_lines
  WHERE id = p_line_id AND purchase_receipt_id = p_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la línea de compra % en la orden %.', p_line_id, p_receipt_id;
  END IF;

  v_new_line_received := COALESCE(v_line.qty_received, 0) + p_qty_received_now;
  IF v_line.qty_invoiced IS NOT NULL AND v_new_line_received > v_line.qty_invoiced THEN
    RAISE EXCEPTION 'SOBRE-RECEPCIÓN BLOQUEADA: La cantidad acumulada recibida (%) supera la cantidad solicitada en la orden (%).',
      v_new_line_received, v_line.qty_invoiced;
  END IF;

  UPDATE public.purchase_receipt_lines
  SET qty_received = v_new_line_received,
      owner_id = p_owner_id,
      unit_purchase_cost_cop = COALESCE(p_unit_cost_cop, unit_purchase_cost_cop),
      allocated_unit_shipping_cop = COALESCE(p_unit_shipping_cop, allocated_unit_shipping_cop),
      cost_status = CASE WHEN COALESCE(p_unit_cost_cop, unit_purchase_cost_cop) IS NULL THEN 'pending_info' ELSE 'confirmed' END
  WHERE id = v_line.id;

  -- Crear lote físico trazable a la recepción
  INSERT INTO public.stock_lots (
    id,
    purchase_receipt_id,
    purchase_receipt_line_id,
    variant_id,
    sku,
    lot_origin,
    received_date,
    warehouse_location,
    lot_status,
    notes
  ) VALUES (
    p_lot_id,
    v_receipt.id,
    v_line.id,
    v_line.variant_id,
    v_line.sku,
    'purchase_receipt',
    CURRENT_DATE,
    COALESCE(NULLIF(btrim(p_storage_bin), ''), 'BODEGA-RECEPCION'),
    'open',
    COALESCE(p_notes, 'Lote ingresado por recepción de compra ' || v_receipt.receipt_number)
  )
  ON CONFLICT (id) DO NOTHING;

  -- Crear asignación multipropietario por lote y propietario
  INSERT INTO public.lot_owner_allocations (
    allocation_code,
    lot_id,
    variant_id,
    sku,
    owner_id,
    supplier_id,
    storage_bin,
    qty_initial_assigned,
    qty_physical,
    qty_good,
    qty_defective,
    qty_pending_inspection,
    qty_reserved,
    purchase_unit_cost_cop,
    inbound_shipping_unit_cost_cop,
    reconciliation_state,
    notes
  ) VALUES (
    p_allocation_code,
    p_lot_id,
    v_line.variant_id,
    v_line.sku,
    p_owner_id,
    v_receipt.supplier_id,
    COALESCE(NULLIF(btrim(p_storage_bin), ''), 'BODEGA-RECEPCION'),
    p_qty_received_now,
    p_qty_received_now,
    p_qty_good,
    p_qty_defective,
    p_qty_pending,
    0,
    p_unit_cost_cop,
    COALESCE(p_unit_shipping_cop, 0),
    CASE
      WHEN p_unit_cost_cop IS NULL THEN 'pending_cost_info'
      WHEN p_qty_pending > 0 THEN 'pending_inspection'
      ELSE 'reconciled'
    END,
    p_notes
  )
  RETURNING id INTO v_alloc_id;

  -- Registrar costo en public.cost_records
  INSERT INTO public.cost_records (
    lot_allocation_id,
    lot_id,
    owner_id,
    sku,
    cost_type,
    cost_status,
    unit_amount_cop,
    total_amount_cop,
    qty_basis,
    source_document_ref,
    recorded_by,
    notes
  ) VALUES (
    v_alloc_id,
    p_lot_id,
    p_owner_id,
    v_line.sku,
    'purchase_base',
    CASE WHEN p_unit_cost_cop IS NULL THEN 'PENDING_COST' ELSE 'CONFIRMED' END,
    p_unit_cost_cop,
    CASE WHEN p_unit_cost_cop IS NULL THEN NULL ELSE p_unit_cost_cop * p_qty_received_now END,
    p_qty_received_now,
    v_receipt.receipt_number,
    auth.uid(),
    COALESCE(p_notes, 'Costo base registrado en recepción de compra')
  );

  -- Registrar inspección de recepción
  INSERT INTO public.quality_inspections (
    inspection_code,
    idempotency_key,
    lot_allocation_id,
    lot_id,
    sku,
    owner_id,
    qty_inspected,
    qty_approved_good,
    qty_marked_defective,
    qty_remaining_pending,
    visual_check_passed,
    functional_test_passed,
    accessories_complete,
    inspection_status,
    evidence_urls,
    inspected_by,
    inspector_name,
    notes
  ) VALUES (
    'QCI-' || p_allocation_code,
    p_idempotency_key || ':QCI',
    v_alloc_id,
    p_lot_id,
    v_line.sku,
    p_owner_id,
    p_qty_received_now,
    p_qty_good,
    p_qty_defective,
    p_qty_pending,
    (p_qty_defective = 0),
    (p_qty_pending = 0 AND p_qty_defective = 0),
    true,
    CASE
      WHEN p_qty_pending > 0 THEN 'pending_recheck'
      WHEN p_qty_defective = 0 THEN 'approved'
      WHEN p_qty_good = 0 THEN 'rejected'
      ELSE 'partially_approved'
    END,
    COALESCE(p_evidence_urls, '{}'),
    auth.uid(),
    p_inspector_name,
    p_notes
  );

  -- Movimiento inmutable en public.stock_movements
  INSERT INTO public.stock_movements (
    idempotency_key,
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
    p_idempotency_key,
    v_alloc_id,
    p_lot_id,
    v_line.variant_id,
    v_line.sku,
    p_owner_id,
    'purchase_reception',
    p_qty_received_now,
    p_qty_good,
    p_qty_defective,
    p_qty_pending,
    0,
    p_qty_received_now,
    p_qty_good,
    p_qty_defective,
    p_qty_pending,
    0,
    p_unit_cost_cop,
    'purchase_receipts',
    v_receipt.receipt_number,
    COALESCE(p_notes, 'Recepción de compra verificada en bodega'),
    auth.uid()
  );

  -- Calcular si la orden quedó en recepción parcial o completa
  SELECT
    COALESCE(SUM(qty_invoiced), 0),
    COALESCE(SUM(qty_received), 0)
  INTO v_total_ordered, v_total_received
  FROM public.purchase_receipt_lines
  WHERE purchase_receipt_id = v_receipt.id;

  v_new_receipt_status := CASE
    WHEN v_total_received < v_total_ordered THEN 'partial_received'
    ELSE 'received'
  END;

  UPDATE public.purchase_receipts
  SET receipt_status = v_new_receipt_status
  WHERE id = v_receipt.id;

  RETURN jsonb_build_object(
    'allocation_id', v_alloc_id,
    'receipt_status', v_new_receipt_status,
    'total_ordered', v_total_ordered,
    'total_received', v_total_received
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. PROCEDIMIENTO TRANSACCIONAL: RESERVAR MERCANCÍA (CON BLOQUEO CONCURRENTE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tx_reserve_stock(
  p_idempotency_key TEXT,
  p_reservation_code TEXT,
  p_lot_allocation_id UUID,
  p_qty_to_reserve INTEGER,
  p_sales_order_ref TEXT,
  p_reason TEXT,
  p_expected_lock_version INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alloc public.lot_owner_allocations%ROWTYPE;
  v_res_id UUID;
  v_new_reserved INTEGER;
BEGIN
  IF NOT public.fn_is_sales_or_above() THEN
    RAISE EXCEPTION 'ACCESO DENEGADO: Sin permisos para reservar inventario.';
  END IF;

  IF p_qty_to_reserve <= 0 THEN
    RAISE EXCEPTION 'CANTIDAD INVÁLIDA: La cantidad a reservar debe ser > 0.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.stock_reservations WHERE idempotency_key = p_idempotency_key) THEN
    RAISE EXCEPTION 'IDEMPOTENCIA BLOQUEADA: La reserva con clave "%" ya fue registrada.', p_idempotency_key;
  END IF;

  SELECT * INTO v_alloc
  FROM public.lot_owner_allocations
  WHERE id = p_lot_allocation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote/asignación % no encontrado.', p_lot_allocation_id;
  END IF;

  IF p_expected_lock_version IS NOT NULL AND v_alloc.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'CONFLICTO DE CONCURRENCIA: El lote % fue modificado por otra transacción concurrente (versión esperada %, actual %).',
      v_alloc.lot_id, p_expected_lock_version, v_alloc.lock_version;
  END IF;

  IF v_alloc.qty_available < p_qty_to_reserve THEN
    RAISE EXCEPTION 'STOCK DISPONIBLE INSUFICIENTE: Lote % (%): Disponible %, Solicitado %.',
      v_alloc.lot_id, v_alloc.owner_id, v_alloc.qty_available, p_qty_to_reserve;
  END IF;

  v_new_reserved := v_alloc.qty_reserved + p_qty_to_reserve;

  UPDATE public.lot_owner_allocations
  SET qty_reserved = v_new_reserved,
      lock_version = lock_version + 1
  WHERE id = v_alloc.id;

  INSERT INTO public.stock_reservations (
    reservation_code,
    idempotency_key,
    lot_allocation_id,
    owner_id,
    sku,
    sales_order_ref,
    qty_reserved,
    reservation_status,
    reason,
    created_by
  ) VALUES (
    p_reservation_code,
    p_idempotency_key,
    v_alloc.id,
    v_alloc.owner_id,
    v_alloc.sku,
    p_sales_order_ref,
    p_qty_to_reserve,
    'active',
    p_reason,
    auth.uid()
  )
  RETURNING id INTO v_res_id;

  INSERT INTO public.stock_movements (
    idempotency_key,
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
    p_idempotency_key,
    v_alloc.id,
    v_alloc.lot_id,
    v_alloc.variant_id,
    v_alloc.sku,
    v_alloc.owner_id,
    'reservation_hold',
    0,
    0,
    0,
    0,
    p_qty_to_reserve,
    v_alloc.qty_physical,
    v_alloc.qty_good,
    v_alloc.qty_defective,
    v_alloc.qty_pending_inspection,
    v_new_reserved,
    v_alloc.effective_unit_cost_cop,
    'stock_reservations',
    p_reservation_code,
    p_reason,
    auth.uid()
  );

  RETURN v_res_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. PROCEDIMIENTO TRANSACCIONAL: LIBERAR / CANCELAR RESERVA
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tx_release_reservation(
  p_idempotency_key TEXT,
  p_reservation_id UUID,
  p_qty_to_release INTEGER,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res public.stock_reservations%ROWTYPE;
  v_alloc public.lot_owner_allocations%ROWTYPE;
  v_pending_res INTEGER;
  v_new_reserved INTEGER;
BEGIN
  IF NOT public.fn_is_sales_or_above() THEN
    RAISE EXCEPTION 'ACCESO DENEGADO: Sin permisos para liberar reservas.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.stock_movements WHERE idempotency_key = p_idempotency_key) THEN
    RAISE EXCEPTION 'IDEMPOTENCIA BLOQUEADA: La liberación "%" ya fue ejecutada.', p_idempotency_key;
  END IF;

  SELECT * INTO v_res
  FROM public.stock_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la reserva %.', p_reservation_id;
  END IF;

  IF v_res.reservation_status <> 'active' THEN
    RAISE EXCEPTION 'La reserva % no está activa (estado actual: %).', v_res.reservation_code, v_res.reservation_status;
  END IF;

  v_pending_res := v_res.qty_reserved - v_res.qty_fulfilled - v_res.qty_released;
  IF p_qty_to_release <= 0 OR p_qty_to_release > v_pending_res THEN
    RAISE EXCEPTION 'Cantidad a liberar inválida (solicitada %, pendiente en reserva %).', p_qty_to_release, v_pending_res;
  END IF;

  SELECT * INTO v_alloc
  FROM public.lot_owner_allocations
  WHERE id = v_res.lot_allocation_id
  FOR UPDATE;

  v_new_reserved := GREATEST(0, v_alloc.qty_reserved - p_qty_to_release);

  UPDATE public.lot_owner_allocations
  SET qty_reserved = v_new_reserved,
      lock_version = lock_version + 1
  WHERE id = v_alloc.id;

  UPDATE public.stock_reservations
  SET qty_released = qty_released + p_qty_to_release,
      reservation_status = CASE
        WHEN (qty_fulfilled + qty_released + p_qty_to_release) >= qty_reserved THEN 'released'
        ELSE 'active'
      END
  WHERE id = v_res.id;

  INSERT INTO public.stock_movements (
    idempotency_key,
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
    p_idempotency_key,
    v_alloc.id,
    v_alloc.lot_id,
    v_alloc.variant_id,
    v_alloc.sku,
    v_alloc.owner_id,
    'reservation_release',
    0,
    0,
    0,
    0,
    -p_qty_to_release,
    v_alloc.qty_physical,
    v_alloc.qty_good,
    v_alloc.qty_defective,
    v_alloc.qty_pending_inspection,
    v_new_reserved,
    v_alloc.effective_unit_cost_cop,
    'stock_reservations',
    v_res.reservation_code,
    p_reason,
    auth.uid()
  );

  RETURN v_res.id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. PROCEDIMIENTO TRANSACCIONAL: DESPACHAR MERCANCÍA (CON CONTROL CONCURRENTE)
--    Previene venta doble de última unidad concurrente y stock negativo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tx_dispatch_stock(
  p_idempotency_key TEXT,
  p_dispatch_code TEXT,
  p_lot_allocation_id UUID,
  p_qty_to_dispatch INTEGER,
  p_reservation_id UUID DEFAULT NULL,
  p_expected_lock_version INTEGER DEFAULT NULL,
  p_reason TEXT DEFAULT 'Despacho comercial verificado'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alloc public.lot_owner_allocations%ROWTYPE;
  v_res public.stock_reservations%ROWTYPE;
  v_new_physical INTEGER;
  v_new_good INTEGER;
  v_new_reserved INTEGER;
  v_mov_id UUID;
BEGIN
  IF NOT public.fn_is_sales_or_above() THEN
    RAISE EXCEPTION 'ACCESO DENEGADO: Sin permisos para despachar mercancía.';
  END IF;

  IF p_qty_to_dispatch <= 0 THEN
    RAISE EXCEPTION 'La cantidad a despachar debe ser mayor a cero.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.stock_movements WHERE idempotency_key = p_idempotency_key) THEN
    RAISE EXCEPTION 'IDEMPOTENCIA BLOQUEADA: El despacho "%" ya fue registrado.', p_idempotency_key;
  END IF;

  SELECT * INTO v_alloc
  FROM public.lot_owner_allocations
  WHERE id = p_lot_allocation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asignación de lote % no existe.', p_lot_allocation_id;
  END IF;

  IF p_expected_lock_version IS NOT NULL AND v_alloc.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'CONFLICTO DE CONCURRENCIA (Última Unidad): El lote % cambió de versión (esperada %, actual %). Otra venta concurrente tomó las unidades antes.',
      v_alloc.lot_id, p_expected_lock_version, v_alloc.lock_version;
  END IF;

  IF p_reservation_id IS NOT NULL THEN
    SELECT * INTO v_res
    FROM public.stock_reservations
    WHERE id = p_reservation_id AND lot_allocation_id = v_alloc.id
    FOR UPDATE;

    IF NOT FOUND OR v_res.reservation_status <> 'active' THEN
      RAISE EXCEPTION 'Reserva % inválida o inactiva para despacho.', p_reservation_id;
    END IF;

    IF (v_res.qty_reserved - v_res.qty_fulfilled - v_res.qty_released) < p_qty_to_dispatch THEN
      RAISE EXCEPTION 'La cantidad a despachar supera las unidades reservadas activas.';
    END IF;

    v_new_reserved := v_alloc.qty_reserved - p_qty_to_dispatch;

    UPDATE public.stock_reservations
    SET qty_fulfilled = qty_fulfilled + p_qty_to_dispatch,
        reservation_status = CASE
          WHEN (qty_fulfilled + p_qty_to_dispatch + qty_released) >= qty_reserved THEN 'fulfilled'
          ELSE 'active'
        END
    WHERE id = v_res.id;
  ELSE
    IF v_alloc.qty_available < p_qty_to_dispatch THEN
      RAISE EXCEPTION 'PREVENCIÓN DE STOCK NEGATIVO: Unidades disponibles insuficientes en lote % del propietario % (Disponible: %, Solicitado: %).',
        v_alloc.lot_id, v_alloc.owner_id, v_alloc.qty_available, p_qty_to_dispatch;
    END IF;
    v_new_reserved := v_alloc.qty_reserved;
  END IF;

  v_new_good := v_alloc.qty_good - p_qty_to_dispatch;
  v_new_physical := v_alloc.qty_physical - p_qty_to_dispatch;

  UPDATE public.lot_owner_allocations
  SET qty_physical = v_new_physical,
      qty_good = v_new_good,
      qty_reserved = v_new_reserved,
      lock_version = lock_version + 1
  WHERE id = v_alloc.id;

  INSERT INTO public.stock_movements (
    idempotency_key,
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
    p_idempotency_key,
    v_alloc.id,
    v_alloc.lot_id,
    v_alloc.variant_id,
    v_alloc.sku,
    v_alloc.owner_id,
    'sale_dispatch',
    -p_qty_to_dispatch,
    -p_qty_to_dispatch,
    0,
    0,
    CASE WHEN p_reservation_id IS NOT NULL THEN -p_qty_to_dispatch ELSE 0 END,
    v_new_physical,
    v_new_good,
    v_alloc.qty_defective,
    v_alloc.qty_pending_inspection,
    v_new_reserved,
    v_alloc.effective_unit_cost_cop,
    'dispatch',
    p_dispatch_code,
    p_reason,
    auth.uid()
  )
  RETURNING id INTO v_mov_id;

  RETURN v_mov_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. PROCEDIMIENTO TRANSACCIONAL: DEVOLUCIÓN DE CLIENTE Y AJUSTE CONCILIADO
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tx_process_customer_return(
  p_idempotency_key TEXT,
  p_return_code TEXT,
  p_lot_allocation_id UUID,
  p_qty_returned INTEGER,
  p_return_condition TEXT, -- 'good_restock' | 'defective'
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alloc public.lot_owner_allocations%ROWTYPE;
  v_new_physical INTEGER;
  v_new_good INTEGER;
  v_new_defective INTEGER;
  v_mov_type TEXT;
  v_mov_id UUID;
BEGIN
  IF NOT public.fn_is_operator_or_admin() THEN
    RAISE EXCEPTION 'ACCESO DENEGADO: Solo ADMIN o INVENTORY_OPERATOR pueden procesar reingresos por devolución.';
  END IF;

  IF p_qty_returned <= 0 THEN
    RAISE EXCEPTION 'La cantidad devuelta debe ser > 0.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.stock_movements WHERE idempotency_key = p_idempotency_key) THEN
    RAISE EXCEPTION 'IDEMPOTENCIA BLOQUEADA: La devolución "%" ya fue procesada.', p_idempotency_key;
  END IF;

  SELECT * INTO v_alloc
  FROM public.lot_owner_allocations
  WHERE id = p_lot_allocation_id
  FOR UPDATE;

  v_new_physical := v_alloc.qty_physical + p_qty_returned;
  IF p_return_condition = 'good_restock' THEN
    v_new_good := v_alloc.qty_good + p_qty_returned;
    v_new_defective := v_alloc.qty_defective;
    v_mov_type := 'customer_return_restock';
  ELSE
    v_new_good := v_alloc.qty_good;
    v_new_defective := v_alloc.qty_defective + p_qty_returned;
    v_mov_type := 'customer_return_defective';
  END IF;

  UPDATE public.lot_owner_allocations
  SET qty_physical = v_new_physical,
      qty_good = v_new_good,
      qty_defective = v_new_defective,
      lock_version = lock_version + 1
  WHERE id = v_alloc.id;

  INSERT INTO public.stock_movements (
    idempotency_key,
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
    p_idempotency_key,
    v_alloc.id,
    v_alloc.lot_id,
    v_alloc.variant_id,
    v_alloc.sku,
    v_alloc.owner_id,
    v_mov_type,
    p_qty_returned,
    CASE WHEN p_return_condition = 'good_restock' THEN p_qty_returned ELSE 0 END,
    CASE WHEN p_return_condition <> 'good_restock' THEN p_qty_returned ELSE 0 END,
    0,
    0,
    v_new_physical,
    v_new_good,
    v_new_defective,
    v_alloc.qty_pending_inspection,
    v_alloc.qty_reserved,
    v_alloc.effective_unit_cost_cop,
    'returns',
    p_return_code,
    p_reason,
    auth.uid()
  )
  RETURNING id INTO v_mov_id;

  RETURN v_mov_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_tx_record_inventory_adjustment(
  p_idempotency_key TEXT,
  p_adjustment_code TEXT,
  p_lot_allocation_id UUID,
  p_delta_good INTEGER,
  p_delta_defective INTEGER,
  p_delta_pending INTEGER,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alloc public.lot_owner_allocations%ROWTYPE;
  v_delta_physical INTEGER;
  v_new_physical INTEGER;
  v_new_good INTEGER;
  v_new_defective INTEGER;
  v_new_pending INTEGER;
  v_mov_id UUID;
BEGIN
  IF NOT public.fn_is_admin() THEN
    RAISE EXCEPTION 'ACCESO DENEGADO: Solo ADMIN puede autorizar ajustes de inventario.';
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'MOTIVO OBLIGATORIO: Todo ajuste de inventario exige un motivo documentado.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.stock_movements WHERE idempotency_key = p_idempotency_key) THEN
    RAISE EXCEPTION 'IDEMPOTENCIA BLOQUEADA: El ajuste "%" ya fue procesado.', p_idempotency_key;
  END IF;

  SELECT * INTO v_alloc
  FROM public.lot_owner_allocations
  WHERE id = p_lot_allocation_id
  FOR UPDATE;

  v_delta_physical := p_delta_good + p_delta_defective + p_delta_pending;
  v_new_good := v_alloc.qty_good + p_delta_good;
  v_new_defective := v_alloc.qty_defective + p_delta_defective;
  v_new_pending := v_alloc.qty_pending_inspection + p_delta_pending;
  v_new_physical := v_alloc.qty_physical + v_delta_physical;

  IF v_new_good < v_alloc.qty_reserved OR v_new_good < 0 OR v_new_defective < 0 OR v_new_pending < 0 OR v_new_physical < 0 THEN
    RAISE EXCEPTION 'PREVENCIÓN DE STOCK NEGATIVO: El ajuste dejaría saldos negativos o inferiores a las unidades reservadas.';
  END IF;

  UPDATE public.lot_owner_allocations
  SET qty_physical = v_new_physical,
      qty_good = v_new_good,
      qty_defective = v_new_defective,
      qty_pending_inspection = v_new_pending,
      lock_version = lock_version + 1
  WHERE id = v_alloc.id;

  INSERT INTO public.stock_movements (
    idempotency_key,
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
    p_idempotency_key,
    v_alloc.id,
    v_alloc.lot_id,
    v_alloc.variant_id,
    v_alloc.sku,
    v_alloc.owner_id,
    'reconciliation_adjustment',
    v_delta_physical,
    p_delta_good,
    p_delta_defective,
    p_delta_pending,
    0,
    v_new_physical,
    v_new_good,
    v_new_defective,
    v_new_pending,
    v_alloc.qty_reserved,
    v_alloc.effective_unit_cost_cop,
    'adjustments',
    p_adjustment_code,
    p_reason,
    auth.uid()
  )
  RETURNING id INTO v_mov_id;

  RETURN v_mov_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. VISTAS ANALÍTICAS PARA LOS 6 REPORTES DE INVENTARIO Y COMPRAS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_report_inventory_by_category
WITH (security_invoker = true)
AS
SELECT
  p.category,
  COUNT(DISTINCT pv.sku) AS total_skus,
  COUNT(DISTINCT loa.lot_id) AS total_lots,
  COUNT(DISTINCT loa.owner_id) AS total_owners,
  COALESCE(SUM(loa.qty_physical), 0) AS qty_physical,
  COALESCE(SUM(loa.qty_good), 0) AS qty_good,
  COALESCE(SUM(loa.qty_defective), 0) AS qty_defective,
  COALESCE(SUM(loa.qty_pending_inspection), 0) AS qty_pending,
  COALESCE(SUM(loa.qty_reserved), 0) AS qty_reserved,
  COALESCE(SUM(loa.qty_available), 0) AS qty_available,
  COALESCE(SUM(COALESCE(loa.effective_unit_cost_cop, 0) * COALESCE(loa.qty_physical, 0)), 0) AS total_valuation_cop
FROM public.products p
JOIN public.product_variants pv ON pv.product_id = p.id
LEFT JOIN public.lot_owner_allocations loa ON loa.sku = pv.sku
GROUP BY p.category;

CREATE OR REPLACE VIEW public.v_report_inventory_by_quality_state
WITH (security_invoker = true)
AS
SELECT
  loa.reconciliation_state,
  COUNT(DISTINCT loa.sku) AS total_skus,
  COUNT(DISTINCT loa.lot_id) AS total_lots,
  COALESCE(SUM(loa.qty_physical), 0) AS qty_physical,
  COALESCE(SUM(loa.qty_good), 0) AS qty_good,
  COALESCE(SUM(loa.qty_defective), 0) AS qty_defective,
  COALESCE(SUM(loa.qty_pending_inspection), 0) AS qty_pending,
  COALESCE(SUM(loa.qty_reserved), 0) AS qty_reserved,
  COALESCE(SUM(loa.qty_available), 0) AS qty_available
FROM public.lot_owner_allocations loa
GROUP BY loa.reconciliation_state;

COMMIT;
