-- =============================================================================
-- MIGRACIÓN 0007: VISTAS ANALÍTICAS Y FUNCIONES TRANSACCIONALES ATÓMICAS (RPC)
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Garantiza operaciones atómicas (FOR UPDATE) con trazabilidad en stock_movements,
-- prevención de doble conteo y respeto estricto de las reglas multipropietario.
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECCIÓN A: VISTAS OPERATIVAS Y FINANCIERAS
-- =============================================================================

-- 1. Vista consolidada de inventario por SKU (independiente del propietario)
CREATE OR REPLACE VIEW public.v_inventory_consolidated_by_sku
WITH (security_invoker = true)
AS
SELECT
  pv.sku,
  p.product_code,
  p.category,
  p.name AS product_name,
  pv.variant_name,
  pv.color,
  pv.current_approved_price_cop,
  COUNT(DISTINCT loa.owner_id) AS distinct_owners_count,
  COUNT(DISTINCT loa.lot_id) AS active_lots_count,
  COALESCE(SUM(loa.qty_physical), 0) AS total_physical_units,
  COALESCE(SUM(loa.qty_good), 0) AS total_good_units,
  COALESCE(SUM(loa.qty_defective), 0) AS total_defective_units,
  COALESCE(SUM(loa.qty_pending_inspection), 0) AS total_pending_inspection_units,
  COALESCE(SUM(loa.qty_reserved), 0) AS total_reserved_units,
  COALESCE(SUM(loa.qty_available), 0) AS total_available_units
FROM public.product_variants pv
JOIN public.products p ON p.id = pv.product_id
LEFT JOIN public.lot_owner_allocations loa ON loa.sku = pv.sku
GROUP BY
  pv.sku,
  p.product_code,
  p.category,
  p.name,
  pv.variant_name,
  pv.color,
  pv.current_approved_price_cop;

-- 2. Vista detallada de inventario y valorización por Propietario y Lote
CREATE OR REPLACE VIEW public.v_inventory_by_owner_and_lot
WITH (security_invoker = true)
AS
SELECT
  loa.id AS lot_allocation_id,
  loa.allocation_code,
  loa.owner_id,
  o.full_name AS owner_name,
  loa.lot_id,
  sl.received_date,
  loa.sku,
  p.name AS product_name,
  pv.variant_name,
  loa.storage_bin,
  loa.qty_physical,
  loa.qty_good,
  loa.qty_defective,
  loa.qty_pending_inspection,
  loa.qty_reserved,
  loa.qty_available,
  loa.purchase_unit_cost_cop,
  loa.inbound_shipping_unit_cost_cop,
  loa.other_unit_cost_cop,
  loa.effective_unit_cost_cop,
  CASE
    WHEN loa.effective_unit_cost_cop IS NULL OR loa.qty_physical IS NULL THEN NULL
    ELSE ROUND(loa.qty_physical * loa.effective_unit_cost_cop, 2)
  END AS total_physical_inventory_cost_cop,
  loa.reconciliation_state
FROM public.lot_owner_allocations loa
JOIN public.owners o ON o.id = loa.owner_id
JOIN public.stock_lots sl ON sl.id = loa.lot_id
JOIN public.product_variants pv ON pv.sku = loa.sku
JOIN public.products p ON p.id = pv.product_id;

-- 3. Vista de Estado de Resultados (P&L) y Saldos por Propietario
CREATE OR REPLACE VIEW public.v_owner_financial_pnl
WITH (security_invoker = true)
AS
WITH sales_agg AS (
  SELECT
    owner_id,
    COALESCE(SUM(qty_allocated - qty_returned), 0) AS net_units_sold,
    COALESCE(SUM(gross_revenue_cop), 0) AS gross_sales_cop,
    COALESCE(SUM(discount_allocated_cop), 0) AS discounts_cop,
    COALESCE(SUM(return_amount_cop), 0) AS returns_cop,
    COALESCE(SUM(net_revenue_cop), 0) AS net_sales_cop,
    COALESCE(SUM(cogs_total_cop), 0) AS total_cogs_cop,
    COALESCE(SUM(direct_selling_expense_cop), 0) AS direct_selling_expenses_cop,
    COALESCE(SUM(gross_profit_cop), 0) AS gross_profit_cop,
    COALESCE(SUM(store_commission_cop), 0) AS store_commission_cop,
    COALESCE(SUM(attributable_owner_profit_cop), 0) AS attributable_sales_profit_cop
  FROM public.sales_item_allocations
  GROUP BY owner_id
),
expenses_agg AS (
  SELECT
    ea.owner_id,
    COALESCE(SUM(CASE WHEN e.expense_scope = 'direct_owner' THEN ea.allocated_amount_cop ELSE 0 END), 0) AS allocated_direct_expenses_cop,
    COALESCE(SUM(CASE WHEN e.expense_scope = 'shared_multi_owner' THEN ea.allocated_amount_cop ELSE 0 END), 0) AS allocated_shared_expenses_cop
  FROM public.expense_allocations ea
  JOIN public.expenses e ON e.id = ea.expense_id
  WHERE e.approval_status = 'approved'
  GROUP BY ea.owner_id
),
settlements_agg AS (
  SELECT
    owner_id,
    COALESCE(SUM(amount_settled_cop), 0) AS total_settled_cop
  FROM public.owner_settlements
  WHERE settlement_status IN ('approved', 'paid')
  GROUP BY owner_id
),
stock_agg AS (
  SELECT
    owner_id,
    COUNT(DISTINCT sku) AS associated_skus,
    COALESCE(SUM(qty_physical), 0) AS physical_units,
    COALESCE(SUM(qty_available), 0) AS available_units,
    COALESCE(SUM(qty_pending_inspection), 0) AS pending_inspection_units
  FROM public.lot_owner_allocations
  GROUP BY owner_id
)
SELECT
  o.id AS owner_id,
  o.internal_code,
  o.full_name AS owner_name,
  o.status AS owner_status,
  COALESCE(oa.status, 'pending_configuration') AS agreement_status,
  oa.distribution_model,
  COALESCE(st.associated_skus, 0) AS associated_skus,
  COALESCE(st.physical_units, 0) AS physical_units,
  COALESCE(st.available_units, 0) AS available_units,
  COALESCE(st.pending_inspection_units, 0) AS pending_inspection_units,
  COALESCE(sa.net_units_sold, 0) AS net_units_sold,
  COALESCE(sa.gross_sales_cop, 0) AS gross_sales_cop,
  COALESCE(sa.discounts_cop, 0) AS discounts_cop,
  COALESCE(sa.returns_cop, 0) AS returns_cop,
  COALESCE(sa.net_sales_cop, 0) AS net_sales_cop,
  COALESCE(sa.total_cogs_cop, 0) AS total_cogs_cop,
  COALESCE(sa.gross_profit_cop, 0) AS gross_profit_cop,
  COALESCE(ea.allocated_direct_expenses_cop, 0) AS allocated_direct_expenses_cop,
  COALESCE(ea.allocated_shared_expenses_cop, 0) AS allocated_shared_expenses_cop,
  COALESCE(sa.store_commission_cop, 0) AS store_commission_cop,
  (
    COALESCE(sa.gross_profit_cop, 0)
    - COALESCE(ea.allocated_direct_expenses_cop, 0)
    - COALESCE(ea.allocated_shared_expenses_cop, 0)
    - COALESCE(sa.store_commission_cop, 0)
  ) AS net_attributable_profit_cop,
  COALESCE(se.total_settled_cop, 0) AS total_settled_cop,
  (
    (
      COALESCE(sa.gross_profit_cop, 0)
      - COALESCE(ea.allocated_direct_expenses_cop, 0)
      - COALESCE(ea.allocated_shared_expenses_cop, 0)
      - COALESCE(sa.store_commission_cop, 0)
    ) - COALESCE(se.total_settled_cop, 0)
  ) AS pending_settlement_balance_cop
FROM public.owners o
LEFT JOIN public.owner_agreements oa ON oa.owner_id = o.id AND oa.status = 'active'
LEFT JOIN stock_agg st ON st.owner_id = o.id
LEFT JOIN sales_agg sa ON sa.owner_id = o.id
LEFT JOIN expenses_agg ea ON ea.owner_id = o.id
LEFT JOIN settlements_agg se ON se.owner_id = o.id;

-- 4. Vista Pública Segura para Catálogo Comercial (Solo SKUs disponibles y con precio aprobado)
CREATE OR REPLACE VIEW public.v_public_available_catalog AS
SELECT
  pv.sku,
  p.category,
  p.name AS product_name,
  p.brand,
  p.model,
  pv.variant_name,
  pv.color,
  pv.current_approved_price_cop,
  SUM(loa.qty_available) AS total_available_units
FROM public.product_variants pv
JOIN public.products p ON p.id = pv.product_id
JOIN public.lot_owner_allocations loa ON loa.sku = pv.sku
WHERE pv.status = 'active'
  AND pv.is_published_in_catalog = true
  AND pv.current_approved_price_cop IS NOT NULL
  AND pv.current_approved_price_cop > 0
  AND loa.qty_available > 0
GROUP BY
  pv.sku,
  p.category,
  p.name,
  p.brand,
  p.model,
  pv.variant_name,
  pv.color,
  pv.current_approved_price_cop
HAVING SUM(loa.qty_available) > 0;

-- =============================================================================
-- SECCIÓN B: FUNCIONES TRANSACCIONALES ATÓMICAS (PL/pgSQL)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. FUNCIÓN: public.fn_record_quality_inspection
--    Libera unidades de Pendiente -> Apta o Defectuosa en una sola transacción
--    y registra el movimiento inmutable en stock_movements.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_record_quality_inspection(
  p_inspection_code TEXT,
  p_lot_allocation_id UUID,
  p_qty_inspected INTEGER,
  p_qty_approved_good INTEGER,
  p_qty_marked_defective INTEGER,
  p_visual_check_passed BOOLEAN,
  p_functional_test_passed BOOLEAN,
  p_accessories_complete BOOLEAN,
  p_inspector_name TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alloc public.lot_owner_allocations%ROWTYPE;
  v_inspection_id UUID;
  v_new_good INTEGER;
  v_new_defective INTEGER;
  v_new_pending INTEGER;
  v_status TEXT;
BEGIN
  IF NOT public.fn_is_operator_or_admin() THEN
    RAISE EXCEPTION 'Permiso denegado: Solo administrador u operador pueden registrar inspecciones de calidad.';
  END IF;

  IF p_qty_inspected <= 0 OR p_qty_approved_good < 0 OR p_qty_marked_defective < 0 THEN
    RAISE EXCEPTION 'Cantidades inválidas en la inspección de calidad.';
  END IF;

  IF (p_qty_approved_good + p_qty_marked_defective) <> p_qty_inspected THEN
    RAISE EXCEPTION 'La suma de unidades aprobadas (%) y defectuosas (%) debe ser igual a las unidades inspeccionadas (%).',
      p_qty_approved_good, p_qty_marked_defective, p_qty_inspected;
  END IF;

  SELECT * INTO v_alloc
  FROM public.lot_owner_allocations
  WHERE id = p_lot_allocation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la asignación de lote %.', p_lot_allocation_id;
  END IF;

  IF v_alloc.qty_pending_inspection < p_qty_inspected THEN
    RAISE EXCEPTION 'Las unidades a inspeccionar (%) superan las unidades pendientes de revisión (%).',
      p_qty_inspected, v_alloc.qty_pending_inspection;
  END IF;

  v_new_good := v_alloc.qty_good + p_qty_approved_good;
  v_new_defective := v_alloc.qty_defective + p_qty_marked_defective;
  v_new_pending := v_alloc.qty_pending_inspection - p_qty_inspected;

  IF p_qty_marked_defective = 0 THEN
    v_status := 'approved';
  ELSIF p_qty_approved_good = 0 THEN
    v_status := 'rejected';
  ELSE
    v_status := 'partially_approved';
  END IF;

  INSERT INTO public.quality_inspections (
    inspection_code,
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
    inspected_by,
    inspector_name,
    notes
  ) VALUES (
    p_inspection_code,
    v_alloc.id,
    v_alloc.lot_id,
    v_alloc.sku,
    v_alloc.owner_id,
    p_qty_inspected,
    p_qty_approved_good,
    p_qty_marked_defective,
    0,
    p_visual_check_passed,
    p_functional_test_passed,
    p_accessories_complete,
    v_status,
    auth.uid(),
    p_inspector_name,
    p_notes
  )
  RETURNING id INTO v_inspection_id;

  UPDATE public.lot_owner_allocations
  SET
    qty_good = v_new_good,
    qty_defective = v_new_defective,
    qty_pending_inspection = v_new_pending,
    reconciliation_state = CASE
      WHEN v_new_pending = 0 AND effective_unit_cost_cop IS NOT NULL THEN 'reconciled'
      WHEN effective_unit_cost_cop IS NULL AND NOT is_bonus_zero_cost THEN 'pending_cost_info'
      ELSE 'pending_inspection'
    END
  WHERE id = v_alloc.id;

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
    v_alloc.id,
    v_alloc.lot_id,
    v_alloc.variant_id,
    v_alloc.sku,
    v_alloc.owner_id,
    'quality_approve',
    0,
    p_qty_approved_good,
    p_qty_marked_defective,
    -p_qty_inspected,
    0,
    v_alloc.qty_physical,
    v_new_good,
    v_new_defective,
    v_new_pending,
    v_alloc.qty_reserved,
    v_alloc.effective_unit_cost_cop,
    'quality_inspections',
    p_inspection_code,
    COALESCE(p_notes, 'Inspección de calidad ejecutada'),
    auth.uid()
  );

  RETURN v_inspection_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. FUNCIÓN: public.fn_allocate_sale_item_to_lot
--    Descompone y atribuye atómicamente una línea de venta (sales_order_item)
--    a un lote y propietario explícito, descontando el stock disponible y
--    registrando el movimiento en stock_movements sin doble conteo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_allocate_sale_item_to_lot(
  p_allocation_sale_code TEXT,
  p_sales_order_item_id UUID,
  p_lot_allocation_id UUID,
  p_qty_to_allocate INTEGER,
  p_discount_allocated_cop NUMERIC DEFAULT 0,
  p_direct_selling_expense_cop NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.sales_order_items%ROWTYPE;
  v_alloc public.lot_owner_allocations%ROWTYPE;
  v_agreement public.owner_agreements%ROWTYPE;
  v_already_allocated INTEGER;
  v_new_good INTEGER;
  v_new_physical INTEGER;
  v_gross_profit NUMERIC(14,2);
  v_store_commission NUMERIC(14,2) := NULL;
  v_owner_profit NUMERIC(14,2) := NULL;
  v_comm_status TEXT := 'pending_agreement';
  v_sale_alloc_id UUID;
BEGIN
  IF NOT public.fn_is_sales_or_above() THEN
    RAISE EXCEPTION 'Permiso denegado para atribuir ventas.';
  END IF;

  IF p_qty_to_allocate <= 0 THEN
    RAISE EXCEPTION 'La cantidad a atribuir debe ser mayor a cero.';
  END IF;

  SELECT * INTO v_item
  FROM public.sales_order_items
  WHERE id = p_sales_order_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la línea de pedido %.', p_sales_order_item_id;
  END IF;

  SELECT COALESCE(SUM(qty_allocated), 0) INTO v_already_allocated
  FROM public.sales_item_allocations
  WHERE sales_order_item_id = p_sales_order_item_id;

  IF (v_already_allocated + p_qty_to_allocate) > v_item.qty_ordered THEN
    RAISE EXCEPTION 'Prevención de doble conteo: La cantidad acumulada atribuida (% + %) supera la cantidad vendida en la línea (%).',
      v_already_allocated, p_qty_to_allocate, v_item.qty_ordered;
  END IF;

  SELECT * INTO v_alloc
  FROM public.lot_owner_allocations
  WHERE id = p_lot_allocation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la asignación de lote %.', p_lot_allocation_id;
  END IF;

  IF v_alloc.sku <> v_item.sku THEN
    RAISE EXCEPTION 'Inconsistencia de SKU: la línea pide % pero el lote pertenece a %.',
      v_item.sku, v_alloc.sku;
  END IF;

  IF v_alloc.qty_available < p_qty_to_allocate THEN
    RAISE EXCEPTION 'Stock disponible insuficiente en el lote % del propietario % (Disponible: %, Solicitado: %).',
      v_alloc.lot_id, v_alloc.owner_id, v_alloc.qty_available, p_qty_to_allocate;
  END IF;

  IF v_alloc.effective_unit_cost_cop IS NULL THEN
    RAISE EXCEPTION 'No se puede atribuir venta sobre el lote % porque su costo unitario está PENDIENTE DE INFORMACIÓN.',
      v_alloc.lot_id;
  END IF;

  v_gross_profit :=
    ((p_qty_to_allocate * v_item.unit_sale_price_cop) - p_discount_allocated_cop)
    - (p_qty_to_allocate * v_alloc.effective_unit_cost_cop)
    - p_direct_selling_expense_cop;

  -- Verificar si el propietario tiene acuerdo activo configurado (No asumir porcentajes)
  SELECT * INTO v_agreement
  FROM public.owner_agreements
  WHERE owner_id = v_alloc.owner_id
    AND status = 'active'
  LIMIT 1;

  IF FOUND THEN
    IF v_agreement.distribution_model = 'attributable_profit' THEN
      v_store_commission := 0;
      v_owner_profit := v_gross_profit;
      v_comm_status := 'direct_100_owner';
    ELSIF v_agreement.distribution_model = 'profit_split_pct' THEN
      v_store_commission := ROUND(GREATEST(0, v_gross_profit) * (v_agreement.store_commission_pct / 100.0), 2);
      v_owner_profit := v_gross_profit - v_store_commission;
      v_comm_status := 'calculated_by_agreement';
    ELSIF v_agreement.distribution_model = 'store_commission_pct' THEN
      v_store_commission := ROUND(((p_qty_to_allocate * v_item.unit_sale_price_cop) - p_discount_allocated_cop) * (v_agreement.store_commission_pct / 100.0), 2);
      v_owner_profit := v_gross_profit - v_store_commission;
      v_comm_status := 'calculated_by_agreement';
    END IF;
  END IF;

  v_new_good := v_alloc.qty_good - p_qty_to_allocate;
  v_new_physical := v_alloc.qty_physical - p_qty_to_allocate;

  UPDATE public.lot_owner_allocations
  SET
    qty_good = v_new_good,
    qty_physical = v_new_physical
  WHERE id = v_alloc.id;

  INSERT INTO public.sales_item_allocations (
    allocation_sale_code,
    sales_order_id,
    sales_order_item_id,
    lot_allocation_id,
    lot_id,
    owner_id,
    agreement_id,
    variant_id,
    sku,
    qty_allocated,
    unit_sale_price_cop,
    discount_allocated_cop,
    unit_cost_cop,
    direct_selling_expense_cop,
    store_commission_cop,
    attributable_owner_profit_cop,
    commission_calculation_status,
    notes
  ) VALUES (
    p_allocation_sale_code,
    v_item.sales_order_id,
    v_item.id,
    v_alloc.id,
    v_alloc.lot_id,
    v_alloc.owner_id,
    v_agreement.id,
    v_alloc.variant_id,
    v_alloc.sku,
    p_qty_to_allocate,
    v_item.unit_sale_price_cop,
    p_discount_allocated_cop,
    v_alloc.effective_unit_cost_cop,
    p_direct_selling_expense_cop,
    v_store_commission,
    v_owner_profit,
    v_comm_status,
    p_notes
  )
  RETURNING id INTO v_sale_alloc_id;

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
    v_alloc.id,
    v_alloc.lot_id,
    v_alloc.variant_id,
    v_alloc.sku,
    v_alloc.owner_id,
    'sale_dispatch',
    -p_qty_to_allocate,
    -p_qty_to_allocate,
    0,
    0,
    0,
    v_new_physical,
    v_new_good,
    v_alloc.qty_defective,
    v_alloc.qty_pending_inspection,
    v_alloc.qty_reserved,
    v_alloc.effective_unit_cost_cop,
    'sales_item_allocations',
    p_allocation_sale_code,
    'Despacho de venta atribuida a lote y propietario',
    auth.uid()
  );

  RETURN v_sale_alloc_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. FUNCIÓN: public.fn_execute_ownership_transfer
--    Transfiere existencias disponibles de un propietario origen a un
--    propietario destino dentro de un lote sin alterar el historial pasado.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_execute_ownership_transfer(
  p_transfer_id TEXT,
  p_source_lot_allocation_id UUID,
  p_to_owner_id TEXT,
  p_target_allocation_code TEXT,
  p_qty_to_transfer INTEGER,
  p_reason TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src public.lot_owner_allocations%ROWTYPE;
  v_tgt public.lot_owner_allocations%ROWTYPE;
  v_tgt_id UUID;
BEGIN
  IF NOT public.fn_is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede autorizar transferencias de propiedad.';
  END IF;

  IF p_qty_to_transfer <= 0 THEN
    RAISE EXCEPTION 'La cantidad a transferir debe ser mayor a cero.';
  END IF;

  SELECT * INTO v_src
  FROM public.lot_owner_allocations
  WHERE id = p_source_lot_allocation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asignación de origen % no encontrada.', p_source_lot_allocation_id;
  END IF;

  IF v_src.owner_id = p_to_owner_id THEN
    RAISE EXCEPTION 'El propietario destino debe ser diferente al propietario origen.';
  END IF;

  IF v_src.qty_available < p_qty_to_transfer THEN
    RAISE EXCEPTION 'Unidades disponibles insuficientes para transferir (Disponibles: %, Solicitadas: %).',
      v_src.qty_available, p_qty_to_transfer;
  END IF;

  -- Buscar o crear la asignación destino en el mismo lote y ubicación
  SELECT * INTO v_tgt
  FROM public.lot_owner_allocations
  WHERE lot_id = v_src.lot_id
    AND sku = v_src.sku
    AND owner_id = p_to_owner_id
    AND storage_bin = v_src.storage_bin
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.lot_owner_allocations (
      allocation_code,
      lot_id,
      variant_id,
      sku,
      owner_id,
      storage_bin,
      qty_initial_assigned,
      qty_physical,
      qty_good,
      qty_defective,
      qty_pending_inspection,
      qty_reserved,
      purchase_unit_cost_cop,
      inbound_shipping_unit_cost_cop,
      other_unit_cost_cop,
      is_bonus_zero_cost,
      reconciliation_state,
      notes
    ) VALUES (
      p_target_allocation_code,
      v_src.lot_id,
      v_src.variant_id,
      v_src.sku,
      p_to_owner_id,
      v_src.storage_bin,
      p_qty_to_transfer,
      p_qty_to_transfer,
      p_qty_to_transfer,
      0,
      0,
      0,
      v_src.purchase_unit_cost_cop,
      v_src.inbound_shipping_unit_cost_cop,
      v_src.other_unit_cost_cop,
      v_src.is_bonus_zero_cost,
      'reconciled',
      'Creado por transferencia ' || p_transfer_id
    )
    RETURNING * INTO v_tgt;
  ELSE
    UPDATE public.lot_owner_allocations
    SET
      qty_physical = qty_physical + p_qty_to_transfer,
      qty_good = qty_good + p_qty_to_transfer
    WHERE id = v_tgt.id
    RETURNING * INTO v_tgt;
  END IF;

  UPDATE public.lot_owner_allocations
  SET
    qty_physical = qty_physical - p_qty_to_transfer,
    qty_good = qty_good - p_qty_to_transfer
  WHERE id = v_src.id
  RETURNING * INTO v_src;

  INSERT INTO public.ownership_transfers (
    id,
    lot_id,
    sku,
    source_lot_allocation_id,
    target_lot_allocation_id,
    from_owner_id,
    to_owner_id,
    qty_transferred,
    unit_cost_transferred_cop,
    reason,
    transfer_status,
    authorized_by
  ) VALUES (
    p_transfer_id,
    v_src.lot_id,
    v_src.sku,
    v_src.id,
    v_tgt.id,
    v_src.owner_id,
    p_to_owner_id,
    p_qty_to_transfer,
    COALESCE(v_src.effective_unit_cost_cop, 0),
    p_reason,
    'completed',
    auth.uid()
  );

  -- Movimiento de salida al propietario origen
  INSERT INTO public.stock_movements (
    lot_allocation_id, lot_id, variant_id, sku, owner_id,
    movement_type, delta_physical, delta_good, delta_defective, delta_pending, delta_reserved,
    balance_physical_after, balance_good_after, balance_defective_after, balance_pending_after, balance_reserved_after,
    unit_cost_snapshot_cop, reference_entity, reference_id, reason, performed_by
  ) VALUES (
    v_src.id, v_src.lot_id, v_src.variant_id, v_src.sku, v_src.owner_id,
    'transfer_out', -p_qty_to_transfer, -p_qty_to_transfer, 0, 0, 0,
    v_src.qty_physical, v_src.qty_good, v_src.qty_defective, v_src.qty_pending_inspection, v_src.qty_reserved,
    v_src.effective_unit_cost_cop, 'ownership_transfers', p_transfer_id, p_reason, auth.uid()
  );

  -- Movimiento de entrada al propietario destino
  INSERT INTO public.stock_movements (
    lot_allocation_id, lot_id, variant_id, sku, owner_id,
    movement_type, delta_physical, delta_good, delta_defective, delta_pending, delta_reserved,
    balance_physical_after, balance_good_after, balance_defective_after, balance_pending_after, balance_reserved_after,
    unit_cost_snapshot_cop, reference_entity, reference_id, reason, performed_by
  ) VALUES (
    v_tgt.id, v_tgt.lot_id, v_tgt.variant_id, v_tgt.sku, v_tgt.owner_id,
    'transfer_in', p_qty_to_transfer, p_qty_to_transfer, 0, 0, 0,
    v_tgt.qty_physical, v_tgt.qty_good, v_tgt.qty_defective, v_tgt.qty_pending_inspection, v_tgt.qty_reserved,
    v_tgt.effective_unit_cost_cop, 'ownership_transfers', p_transfer_id, p_reason, auth.uid()
  );

  RETURN p_transfer_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. FUNCIÓN: public.fn_create_owner_settlement
--    Valida que el propietario tenga un acuerdo ACTIVO configurado y saldo
--    pendiente positivo antes de autorizar cualquier liquidación.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_create_owner_settlement(
  p_settlement_id TEXT,
  p_owner_id TEXT,
  p_period_start DATE,
  p_period_end DATE,
  p_amount_to_settle_cop NUMERIC,
  p_payment_method TEXT,
  p_voucher_reference TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agreement public.owner_agreements%ROWTYPE;
  v_pnl RECORD;
BEGIN
  IF NOT public.fn_is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede autorizar liquidaciones a propietarios.';
  END IF;

  SELECT * INTO v_agreement
  FROM public.owner_agreements
  WHERE owner_id = p_owner_id
    AND status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bloqueo de Regla Multipropietario: El propietario % no tiene un acuerdo de distribución ACTIVO configurado (estado actual: PENDIENTE DE CONFIGURAR ACUERDO).',
      p_owner_id;
  END IF;

  SELECT * INTO v_pnl
  FROM public.v_owner_financial_pnl
  WHERE owner_id = p_owner_id;

  IF v_pnl.pending_settlement_balance_cop <= 0 THEN
    RAISE EXCEPTION 'El propietario % no posee saldo pendiente positivo para liquidar (Saldo actual: % COP).',
      p_owner_id, v_pnl.pending_settlement_balance_cop;
  END IF;

  IF p_amount_to_settle_cop <= 0 OR p_amount_to_settle_cop > v_pnl.pending_settlement_balance_cop THEN
    RAISE EXCEPTION 'El monto a liquidar (% COP) debe ser mayor a cero y no puede superar el saldo pendiente conciliado (% COP).',
      p_amount_to_settle_cop, v_pnl.pending_settlement_balance_cop;
  END IF;

  INSERT INTO public.owner_settlements (
    id,
    settlement_date,
    owner_id,
    agreement_id,
    period_start,
    period_end,
    gross_sales_period_cop,
    returns_period_cop,
    net_sales_period_cop,
    cogs_period_cop,
    direct_expenses_period_cop,
    shared_expenses_period_cop,
    store_commission_period_cop,
    attributable_profit_before_cop,
    amount_settled_cop,
    payment_method,
    voucher_reference,
    settlement_status,
    authorized_by,
    notes
  ) VALUES (
    p_settlement_id,
    CURRENT_DATE,
    p_owner_id,
    v_agreement.id,
    p_period_start,
    p_period_end,
    v_pnl.gross_sales_cop,
    v_pnl.returns_cop,
    v_pnl.net_sales_cop,
    v_pnl.total_cogs_cop,
    v_pnl.allocated_direct_expenses_cop,
    v_pnl.allocated_shared_expenses_cop,
    v_pnl.store_commission_cop,
    v_pnl.pending_settlement_balance_cop,
    p_amount_to_settle_cop,
    p_payment_method,
    p_voucher_reference,
    'paid',
    auth.uid(),
    p_notes
  );

  RETURN p_settlement_id;
END;
$$;

COMMIT;
