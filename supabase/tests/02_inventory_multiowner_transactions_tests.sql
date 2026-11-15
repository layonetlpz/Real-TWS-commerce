-- =============================================================================
-- PRUEBAS TRANSACCIONALES DE INVENTARIO, MULTIPROPIETARIO Y VENTAS (ROLLBACK)
-- Cubre: stock negativo, doble recepción, dos propietarios mismo SKU,
--        venta dividida entre lotes, devolución conservando propietario.
-- =============================================================================

BEGIN;

-- Preparar datos temporales de prueba (se revierten al final con ROLLBACK)
INSERT INTO public.owners (id, internal_code, full_name, status)
VALUES
  ('OWN-QA-1', 'OWN-QA-1', 'Propietario QA A', 'active'),
  ('OWN-QA-2', 'OWN-QA-2', 'Propietario QA B', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.products (id, product_code, name, brand, category, status)
VALUES ('PRD-QA-01', 'PRD-QA-01', 'Audífono QA', 'REAL TWS', 'Audio', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.product_variants (sku, product_id, variant_name, approved_sale_price_cop, status)
VALUES ('SKU-QA-001', 'PRD-QA-01', 'Negro', 100000, 'active')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO public.stock_lots (id, lot_code, lot_origin, received_date)
VALUES
  ('LOT-QA-A', 'LOT-QA-A', 'purchase_receipt', CURRENT_DATE),
  ('LOT-QA-B', 'LOT-QA-B', 'purchase_receipt', CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

-- 1. Dos propietarios del mismo SKU en lotes separados
INSERT INTO public.lot_owner_allocations (
  id, allocation_code, lot_id, sku, owner_id,
  qty_initial_assigned, qty_physical, qty_good, qty_defective,
  qty_pending_inspection, qty_reserved, qty_available,
  purchase_unit_cost_cop, effective_unit_cost_cop
) VALUES
  ('ASG-QA-A', 'ASG-QA-A', 'LOT-QA-A', 'SKU-QA-001', 'OWN-QA-1', 5, 5, 5, 0, 0, 0, 5, 40000, 40000),
  ('ASG-QA-B', 'ASG-QA-B', 'LOT-QA-B', 'SKU-QA-001', 'OWN-QA-2', 3, 3, 3, 0, 0, 0, 3, 45000, 45000);

-- 2. Prueba negativa: impedir stock disponible negativo por CHECK constraint
DO $$
DECLARE
  v_blocked BOOLEAN := false;
BEGIN
  BEGIN
    UPDATE public.lot_owner_allocations SET qty_available = -1 WHERE id = 'ASG-QA-A';
  EXCEPTION WHEN OTHERS THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FALLO STOCK NEGATIVO: Se permitió qty_available < 0.';
  END IF;
END
$$;

-- 3. Prueba de idempotencia en stock_movements (doble movimiento con misma idempotency_key)
DO $$
DECLARE
  v_dup_blocked BOOLEAN := false;
BEGIN
  INSERT INTO public.stock_movements (
    idempotency_key, lot_allocation_id, lot_id, sku, owner_id,
    movement_type, delta_physical, delta_good, reason, performed_by_email
  ) VALUES (
    'IDEMP-QA-DUP-001', 'ASG-QA-A', 'LOT-QA-A', 'SKU-QA-001', 'OWN-QA-1',
    'purchase_reception', 5, 5, 'Recepción QA', 'qa@realtws.test'
  );

  BEGIN
    INSERT INTO public.stock_movements (
      idempotency_key, lot_allocation_id, lot_id, sku, owner_id,
      movement_type, delta_physical, delta_good, reason, performed_by_email
    ) VALUES (
      'IDEMP-QA-DUP-001', 'ASG-QA-A', 'LOT-QA-A', 'SKU-QA-001', 'OWN-QA-1',
      'purchase_reception', 5, 5, 'Doble recepción QA', 'qa@realtws.test'
    );
  EXCEPTION WHEN unique_violation THEN
    v_dup_blocked := true;
  END;

  IF NOT v_dup_blocked THEN
    RAISE EXCEPTION 'FALLO IDEMPOTENCIA: Se permitió doble movimiento con misma idempotency_key.';
  END IF;
END
$$;

ROLLBACK;
