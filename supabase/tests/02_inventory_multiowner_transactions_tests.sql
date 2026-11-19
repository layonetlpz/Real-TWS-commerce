-- =============================================================================
-- PRUEBAS TRANSACCIONALES DE INVENTARIO, MULTIPROPIETARIO Y VENTAS (ROLLBACK)
-- Cubre: stock negativo, doble recepción con idempotency_key, dos propietarios
--        para el mismo SKU con costos distintos en lotes separados.
-- =============================================================================

BEGIN;

-- Preparar datos temporales de prueba (se revierten al final con ROLLBACK)
INSERT INTO public.owners (id, internal_code, full_name, status)
VALUES
  ('OWN-9901', 'OWN-9901', 'Propietario QA A', 'active'),
  ('OWN-9902', 'OWN-9902', 'Propietario QA B', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.products (id, product_code, category, name, brand, status)
VALUES (
  '00000000-0000-4000-8000-000000009901'::uuid,
  'PRD-QA-9901',
  'Audio',
  'Audífono QA Sintético',
  'REAL TWS',
  'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.product_variants (
  id, sku, product_id, variant_name, current_approved_price_cop, status
)
VALUES (
  '00000000-0000-4000-8000-000000009911'::uuid,
  'SKU-QA-9901',
  '00000000-0000-4000-8000-000000009901'::uuid,
  'Negro',
  100000,
  'active'
)
ON CONFLICT (sku) DO NOTHING;

INSERT INTO public.stock_lots (id, variant_id, sku, lot_origin, received_date)
VALUES
  ('LOT-QA-9901-A', '00000000-0000-4000-8000-000000009911'::uuid, 'SKU-QA-9901', 'purchase_receipt', CURRENT_DATE),
  ('LOT-QA-9901-B', '00000000-0000-4000-8000-000000009911'::uuid, 'SKU-QA-9901', 'purchase_receipt', CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

-- 1. Dos propietarios del mismo SKU en lotes separados (qty_available es GENERATED ALWAYS)
INSERT INTO public.lot_owner_allocations (
  id, allocation_code, lot_id, variant_id, sku, owner_id, storage_bin,
  qty_initial_assigned, qty_physical, qty_good, qty_defective,
  qty_pending_inspection, qty_reserved, purchase_unit_cost_cop
) VALUES
  (
    '00000000-0000-4000-8000-000000009921'::uuid,
    'ASG-QA-9901-A',
    'LOT-QA-9901-A',
    '00000000-0000-4000-8000-000000009911'::uuid,
    'SKU-QA-9901',
    'OWN-9901',
    'QA-BIN-A',
    5, 5, 5, 0, 0, 0, 40000
  ),
  (
    '00000000-0000-4000-8000-000000009922'::uuid,
    'ASG-QA-9901-B',
    'LOT-QA-9901-B',
    '00000000-0000-4000-8000-000000009911'::uuid,
    'SKU-QA-9901',
    'OWN-9902',
    'QA-BIN-B',
    3, 3, 3, 0, 0, 0, 45000
  );

-- 2. Prueba negativa: impedir stock negativo o sobre-reserva por CHECK constraints
DO $$
DECLARE
  v_blocked_neg BOOLEAN := false;
  v_blocked_over_res BOOLEAN := false;
BEGIN
  BEGIN
    UPDATE public.lot_owner_allocations
    SET qty_good = -1
    WHERE id = '00000000-0000-4000-8000-000000009921'::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_blocked_neg := true;
  END;

  BEGIN
    UPDATE public.lot_owner_allocations
    SET qty_reserved = qty_good + 1
    WHERE id = '00000000-0000-4000-8000-000000009921'::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_blocked_over_res := true;
  END;

  IF NOT v_blocked_neg OR NOT v_blocked_over_res THEN
    RAISE EXCEPTION 'FALLO STOCK NEGATIVO / SOBRERESERVA: CHECK constraint no bloqueó mutación inválida.';
  END IF;
END
$$;

-- 3. Prueba de idempotencia en stock_movements (doble movimiento con misma idempotency_key)
DO $$
DECLARE
  v_dup_blocked BOOLEAN := false;
BEGIN
  INSERT INTO public.stock_movements (
    idempotency_key, lot_allocation_id, lot_id, variant_id, sku, owner_id,
    movement_type, delta_physical, delta_good,
    balance_physical_after, balance_good_after, balance_defective_after,
    balance_pending_after, balance_reserved_after,
    reference_entity, reference_id, reason
  ) VALUES (
    'IDEMP-QA-DUP-9901',
    '00000000-0000-4000-8000-000000009921'::uuid,
    'LOT-QA-9901-A',
    '00000000-0000-4000-8000-000000009911'::uuid,
    'SKU-QA-9901',
    'OWN-9901',
    'purchase_reception',
    5, 5, 5, 5, 0, 0, 0,
    'purchase_receipt', 'PR-QA-9901', 'Recepción QA'
  );

  BEGIN
    INSERT INTO public.stock_movements (
      idempotency_key, lot_allocation_id, lot_id, variant_id, sku, owner_id,
      movement_type, delta_physical, delta_good,
      balance_physical_after, balance_good_after, balance_defective_after,
      balance_pending_after, balance_reserved_after,
      reference_entity, reference_id, reason
    ) VALUES (
      'IDEMP-QA-DUP-9901',
      '00000000-0000-4000-8000-000000009921'::uuid,
      'LOT-QA-9901-A',
      '00000000-0000-4000-8000-000000009911'::uuid,
      'SKU-QA-9901',
      'OWN-9901',
      'purchase_reception',
      5, 5, 5, 5, 0, 0, 0,
      'purchase_receipt', 'PR-QA-9901', 'Doble recepción QA'
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
