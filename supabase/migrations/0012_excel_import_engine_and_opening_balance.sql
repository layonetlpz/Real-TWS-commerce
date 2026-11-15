-- =============================================================================
-- MIGRACIÓN 0012: MOTOR DE IMPORTACIÓN TRANSACCIONAL EXCEL / CSV (OPENING_BALANCE)
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Objetivo:
--   1. Soportar movimientos inmutables OPENING_BALANCE en public.stock_movements.
--   2. Permitir lotes de importación inicial (excel_initial_import) sin inventar
--      fecha de compra ni crear recepciones/compras ficticias.
--   3. Soportar estado explícito PENDING_COST en public.cost_records sin inferir
--      ni inventar costos desconocidos.
--   4. Crear tablas de control transaccional public.import_batches y
--      public.import_batch_items con idempotency_key único, usuario, fecha y RLS.
--   5. Crear función atómica public.fn_execute_opening_inventory_import_batch()
--      con rollback total ante cualquier error, validación estricta de
--      propietarios existentes (sin asignar automáticamente Eberto a futuros
--      registros) y prevención de doble importación.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. AJUSTE EN public.stock_lots:
--    No obligar received_date cuando lot_origin = 'excel_initial_import'
--    (Regla: "sin inventar fecha de compra. No crear recepciones o compras ficticias.")
-- -----------------------------------------------------------------------------
ALTER TABLE public.stock_lots
  ALTER COLUMN received_date DROP NOT NULL;

ALTER TABLE public.stock_lots
  DROP CONSTRAINT IF EXISTS chk_stock_lots_received_date_by_origin;

ALTER TABLE public.stock_lots
  ADD CONSTRAINT chk_stock_lots_received_date_by_origin CHECK (
    lot_origin = 'excel_initial_import' OR received_date IS NOT NULL
  );

-- -----------------------------------------------------------------------------
-- 2. AJUSTE EN public.stock_movements:
--    Incorporar 'OPENING_BALANCE' como tipo oficial de movimiento de apertura
--    inmutable (conservando 'initial_import' por compatibilidad con 0003/0009).
-- -----------------------------------------------------------------------------
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check CHECK (
    movement_type IN (
      'OPENING_BALANCE',
      'initial_import',
      'purchase_reception',
      'quality_approve',
      'quality_reject_defective',
      'reservation_hold',
      'reservation_release',
      'sale_dispatch',
      'customer_return_restock',
      'customer_return_defective',
      'transfer_out',
      'transfer_in',
      'reconciliation_adjustment'
    )
  );

-- -----------------------------------------------------------------------------
-- 3. AJUSTE EN public.cost_records:
--    Permitir estado PENDING_COST con unit_amount_cop y total_amount_cop NULL
--    cuando el costo es desconocido en el Excel origen.
-- -----------------------------------------------------------------------------
ALTER TABLE public.cost_records
  ADD COLUMN IF NOT EXISTS cost_status TEXT NOT NULL DEFAULT 'CONFIRMED'
    CHECK (cost_status IN ('CONFIRMED', 'PENDING_COST', 'BONUS_ZERO_COST'));

ALTER TABLE public.cost_records
  ALTER COLUMN unit_amount_cop DROP NOT NULL,
  ALTER COLUMN total_amount_cop DROP NOT NULL;

ALTER TABLE public.cost_records
  DROP CONSTRAINT IF EXISTS chk_cost_records_status_consistency;

ALTER TABLE public.cost_records
  ADD CONSTRAINT chk_cost_records_status_consistency CHECK (
    (cost_status = 'PENDING_COST' AND unit_amount_cop IS NULL AND total_amount_cop IS NULL)
    OR (cost_status = 'BONUS_ZERO_COST' AND unit_amount_cop = 0 AND total_amount_cop = 0)
    OR (cost_status = 'CONFIRMED' AND unit_amount_cop IS NOT NULL AND total_amount_cop IS NOT NULL)
  );

-- -----------------------------------------------------------------------------
-- 4. TABLA: public.import_batches (Historial Transaccional de Importaciones)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code TEXT NOT NULL UNIQUE CHECK (btrim(batch_code) <> ''),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (btrim(idempotency_key) <> ''),
  source_filename TEXT NOT NULL CHECK (btrim(source_filename) <> ''),
  source_format TEXT NOT NULL CHECK (source_format IN ('XLSX', 'CSV_UTF8')),
  detected_sheets TEXT[] NOT NULL DEFAULT '{}',
  batch_status TEXT NOT NULL CHECK (
    batch_status IN ('PREVIEWED', 'COMMITTED', 'ROLLED_BACK', 'REJECTED')
  ),
  total_rows_read INTEGER NOT NULL DEFAULT 0 CHECK (total_rows_read >= 0),
  total_skus_imported INTEGER NOT NULL DEFAULT 0 CHECK (total_skus_imported >= 0),
  total_opening_units INTEGER NOT NULL DEFAULT 0 CHECK (total_opening_units >= 0),
  total_good_units INTEGER NOT NULL DEFAULT 0 CHECK (total_good_units >= 0),
  total_defective_units INTEGER NOT NULL DEFAULT 0 CHECK (total_defective_units >= 0),
  total_pending_units INTEGER NOT NULL DEFAULT 0 CHECK (total_pending_units >= 0),
  total_confirmed_cost_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_confirmed_cost_cop >= 0),
  pending_cost_count INTEGER NOT NULL DEFAULT 0 CHECK (pending_cost_count >= 0),
  discarded_zero_stock_count INTEGER NOT NULL DEFAULT 0 CHECK (discarded_zero_stock_count >= 0),
  summary_before JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary_after JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors_report JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings_report JSONB NOT NULL DEFAULT '[]'::jsonb,
  discarded_rows_report JSONB NOT NULL DEFAULT '[]'::jsonb,
  imported_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  imported_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_batches_created_at
  ON public.import_batches(created_at DESC);

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_import_batches_select ON public.import_batches;
CREATE POLICY pol_import_batches_select
  ON public.import_batches
  FOR SELECT
  TO authenticated
  USING (public.fn_is_operator_or_admin());

DROP POLICY IF EXISTS pol_import_batches_insert ON public.import_batches;
CREATE POLICY pol_import_batches_insert
  ON public.import_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (public.fn_is_operator_or_admin());

-- -----------------------------------------------------------------------------
-- 5. TABLA: public.import_batch_items (Trazabilidad e Idempotencia por Fila)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  row_idempotency_key TEXT NOT NULL UNIQUE CHECK (btrim(row_idempotency_key) <> ''),
  source_sheet TEXT NOT NULL,
  source_row_number INTEGER NOT NULL CHECK (source_row_number > 0),
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  lot_id TEXT NOT NULL,
  product_code TEXT NOT NULL,
  sku TEXT NOT NULL,
  qty_physical INTEGER NOT NULL CHECK (qty_physical >= 0),
  qty_good INTEGER NOT NULL CHECK (qty_good >= 0),
  qty_defective INTEGER NOT NULL CHECK (qty_defective >= 0),
  qty_pending_inspection INTEGER NOT NULL CHECK (qty_pending_inspection >= 0),
  unit_cost_cop NUMERIC(12,2),
  cost_status TEXT NOT NULL CHECK (cost_status IN ('CONFIRMED', 'PENDING_COST', 'BONUS_ZERO_COST')),
  row_outcome TEXT NOT NULL CHECK (
    row_outcome IN (
      'IMPORTED_WITH_OPENING_BALANCE',
      'CATALOG_ONLY_ZERO_PHYSICAL_PENDING_COUNT',
      'CATALOG_ONLY_HISTORICAL_SOLD'
    )
  ),
  justification TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_batch_items_batch
  ON public.import_batch_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_import_batch_items_owner
  ON public.import_batch_items(owner_id);

ALTER TABLE public.import_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batch_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_import_batch_items_select ON public.import_batch_items;
CREATE POLICY pol_import_batch_items_select
  ON public.import_batch_items
  FOR SELECT
  TO authenticated
  USING (
    public.fn_is_operator_or_admin()
    OR public.fn_can_owner_view(owner_id)
  );

DROP POLICY IF EXISTS pol_import_batch_items_insert ON public.import_batch_items;
CREATE POLICY pol_import_batch_items_insert
  ON public.import_batch_items
  FOR INSERT
  TO authenticated
  WITH CHECK (public.fn_is_operator_or_admin());

-- -----------------------------------------------------------------------------
-- 6. FUNCIÓN TRANSACCIONAL ATÓMICA:
--    public.fn_execute_opening_inventory_import_batch(...)
--    - Verifica permisos (ADMIN o INVENTORY_OPERATOR).
--    - Bloquea reimportación por idempotency_key de lote o fila.
--    - Valida existencia previa de cada propietario (nunca auto-asigna Eberto).
--    - Valida ecuación física: qty_physical = qty_good + qty_defective + qty_pending.
--    - Crea/actualiza catálogo, variantes, lotes iniciales (sin compras ficticias
--      ni fechas inventadas), asignaciones por propietario, costos (con
--      PENDING_COST cuando falta información), inspección inicial pendiente y
--      movimientos inmutables OPENING_BALANCE.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_execute_opening_inventory_import_batch(
  p_batch_code TEXT,
  p_idempotency_key TEXT,
  p_source_filename TEXT,
  p_source_format TEXT,
  p_detected_sheets TEXT[],
  p_items JSONB,
  p_summary_before JSONB DEFAULT '{}'::jsonb,
  p_warnings_report JSONB DEFAULT '[]'::jsonb,
  p_discarded_rows_report JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID;
  v_user_id UUID := auth.uid();
  v_item JSONB;
  v_owner_id TEXT;
  v_sku TEXT;
  v_product_code TEXT;
  v_lot_id TEXT;
  v_product_id UUID;
  v_variant_id UUID;
  v_allocation_id UUID;
  v_qty_physical INTEGER;
  v_qty_good INTEGER;
  v_qty_defective INTEGER;
  v_qty_pending INTEGER;
  v_unit_cost NUMERIC(12,2);
  v_approved_price NUMERIC(12,2);
  v_cost_status TEXT;
  v_reconciliation_state TEXT;
  v_row_outcome TEXT;
  v_row_idempotency_key TEXT;
  v_total_rows INTEGER := 0;
  v_total_skus INTEGER := 0;
  v_total_opening_units INTEGER := 0;
  v_total_good_units INTEGER := 0;
  v_total_defective_units INTEGER := 0;
  v_total_pending_units INTEGER := 0;
  v_total_cost_cop NUMERIC(14,2) := 0;
  v_pending_cost_count INTEGER := 0;
  v_discarded_zero_count INTEGER := 0;
  v_summary_after JSONB;
BEGIN
  IF NOT public.fn_is_operator_or_admin() THEN
    RAISE EXCEPTION 'ACCESO DENEGADO: Solo ADMIN o INVENTORY_OPERATOR pueden ejecutar importaciones de inventario inicial.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.import_batches b WHERE b.idempotency_key = p_idempotency_key
  ) THEN
    RAISE EXCEPTION 'IDEMPOTENCIA BLOQUEADA: El lote con idempotency_key "%" ya fue importado anteriormente. No se permite importar dos veces el mismo lote.', p_idempotency_key;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'LOTE VACÍO: No se recibieron registros válidos para importar.';
  END IF;

  INSERT INTO public.import_batches (
    batch_code,
    idempotency_key,
    source_filename,
    source_format,
    detected_sheets,
    batch_status,
    summary_before,
    warnings_report,
    discarded_rows_report,
    imported_by
  ) VALUES (
    p_batch_code,
    p_idempotency_key,
    p_source_filename,
    p_source_format,
    COALESCE(p_detected_sheets, '{}'),
    'COMMITTED',
    COALESCE(p_summary_before, '{}'::jsonb),
    COALESCE(p_warnings_report, '[]'::jsonb),
    COALESCE(p_discarded_rows_report, '[]'::jsonb),
    v_user_id
  )
  RETURNING id INTO v_batch_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_total_rows := v_total_rows + 1;
    v_owner_id := btrim(COALESCE(v_item->>'owner_id', ''));
    v_sku := btrim(COALESCE(v_item->>'sku', ''));
    v_product_code := btrim(COALESCE(v_item->>'product_code', ''));
    v_row_idempotency_key := btrim(COALESCE(v_item->>'row_idempotency_key', ''));

    IF v_owner_id = '' THEN
      RAISE EXCEPTION 'ERROR DE PROPIETARIO (Fila %): El campo owner_id es obligatorio. Prohibido asignar propietario por defecto.', v_total_rows;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.owners o WHERE o.id = v_owner_id AND o.status = 'active'
    ) THEN
      RAISE EXCEPTION 'PROPIETARIO INEXISTENTE O INACTIVO (Fila %, SKU %): El propietario "%" no existe en public.owners.', v_total_rows, v_sku, v_owner_id;
    END IF;

    IF v_sku = '' OR v_product_code = '' THEN
      RAISE EXCEPTION 'DATOS INCOMPLETOS (Fila %): product_code y sku son obligatorios.', v_total_rows;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.import_batch_items bi WHERE bi.row_idempotency_key = v_row_idempotency_key
    ) THEN
      RAISE EXCEPTION 'FILA DUPLICADA BLOQUEADA (SKU %): La clave de idempotencia "%" ya fue procesada.', v_sku, v_row_idempotency_key;
    END IF;

    v_qty_physical := COALESCE((v_item->>'qty_physical')::INTEGER, -1);
    v_qty_good := COALESCE((v_item->>'qty_good')::INTEGER, 0);
    v_qty_defective := COALESCE((v_item->>'qty_defective')::INTEGER, 0);
    v_qty_pending := COALESCE((v_item->>'qty_pending_inspection')::INTEGER, 0);

    IF v_qty_physical < 0 OR v_qty_good < 0 OR v_qty_defective < 0 OR v_qty_pending < 0 THEN
      RAISE EXCEPTION 'CANTIDAD INVÁLIDA (SKU %): Las cantidades físicas no pueden ser negativas.', v_sku;
    END IF;

    IF v_qty_physical <> (v_qty_good + v_qty_defective + v_qty_pending) THEN
      RAISE EXCEPTION 'DESCUADRE DE CANTIDADES (SKU %): qty_physical (%) != qty_good (%) + qty_defective (%) + qty_pending (%).',
        v_sku, v_qty_physical, v_qty_good, v_qty_defective, v_qty_pending;
    END IF;

    -- Preservar lote original o generar lote identificado de importación sin inventar fecha de compra
    v_lot_id := NULLIF(btrim(COALESCE(v_item->>'lot_id', '')), '');
    IF v_lot_id IS NULL THEN
      v_lot_id := 'LOT-IMP-' || p_batch_code || '-' || v_sku;
    ELSE
      v_lot_id := v_lot_id || '-' || v_sku;
    END IF;

    v_cost_status := COALESCE(NULLIF(btrim(v_item->>'cost_status'), ''), 'PENDING_COST');
    IF v_item ? 'unit_cost_cop' AND v_item->>'unit_cost_cop' IS NOT NULL AND btrim(v_item->>'unit_cost_cop') <> '' THEN
      v_unit_cost := (v_item->>'unit_cost_cop')::NUMERIC(12,2);
    ELSE
      v_unit_cost := NULL;
    END IF;

    IF v_cost_status = 'PENDING_COST' THEN
      v_pending_cost_count := v_pending_cost_count + 1;
    END IF;

    -- 1. Upsert Producto Maestro Universal
    INSERT INTO public.products (
      legacy_excel_row_id,
      product_code,
      category,
      name,
      brand,
      model,
      manufacturer_ref,
      supplier_ref,
      description,
      unit_of_measure,
      original_excel_notes,
      status
    ) VALUES (
      NULLIF(v_item->>'legacy_excel_row_id', '')::INTEGER,
      v_product_code,
      COALESCE(NULLIF(btrim(v_item->>'category'), ''), 'Sin Categoría'),
      COALESCE(NULLIF(btrim(v_item->>'product_name'), ''), v_sku),
      NULLIF(btrim(v_item->>'brand'), ''),
      NULLIF(btrim(v_item->>'model'), ''),
      NULLIF(btrim(v_item->>'manufacturer_ref'), ''),
      NULLIF(btrim(v_item->>'supplier_ref'), ''),
      NULLIF(btrim(v_item->>'description'), ''),
      COALESCE(NULLIF(btrim(v_item->>'unit_of_measure'), ''), 'Unidad'),
      NULLIF(btrim(v_item->>'original_notes'), ''),
      CASE WHEN (v_item->>'catalog_status') = 'archived' THEN 'archived' ELSE 'active' END
    )
    ON CONFLICT (product_code) DO UPDATE
      SET name = EXCLUDED.name,
          category = EXCLUDED.category,
          updated_at = now()
    RETURNING id INTO v_product_id;

    -- 2. Upsert Variante SKU
    IF v_item ? 'approved_sale_price_cop' AND v_item->>'approved_sale_price_cop' IS NOT NULL AND btrim(v_item->>'approved_sale_price_cop') <> '' THEN
      v_approved_price := (v_item->>'approved_sale_price_cop')::NUMERIC(12,2);
    ELSE
      v_approved_price := NULL;
    END IF;

    INSERT INTO public.product_variants (
      sku,
      product_id,
      variant_name,
      color,
      current_approved_price_cop,
      status
    ) VALUES (
      v_sku,
      v_product_id,
      COALESCE(NULLIF(btrim(v_item->>'variant_name'), ''), 'Estándar'),
      NULLIF(btrim(v_item->>'color'), ''),
      v_approved_price,
      CASE WHEN (v_item->>'catalog_status') = 'archived' THEN 'discontinued' ELSE 'active' END
    )
    ON CONFLICT (sku) DO UPDATE
      SET variant_name = EXCLUDED.variant_name,
          color = EXCLUDED.color,
          updated_at = now()
    RETURNING id INTO v_variant_id;

    v_total_skus := v_total_skus + 1;

    -- 3. Price history SOLO si existe precio comercial aprobado en el origen
    IF v_approved_price IS NOT NULL AND v_approved_price > 0 THEN
      INSERT INTO public.price_history (
        variant_id,
        sku,
        previous_price_cop,
        new_price_cop,
        change_reason,
        approved_by
      ) VALUES (
        v_variant_id,
        v_sku,
        NULL,
        v_approved_price,
        'Precio comercial importado desde archivo inicial (' || p_batch_code || ')',
        v_user_id
      );
    END IF;

    -- 4. Si es fila con stock físico > 0 o pendiente de conteo en inventario activo,
    --    registrar lote de importación inicial, asignación por propietario, costo e inventario inicial.
    v_row_outcome := COALESCE(NULLIF(btrim(v_item->>'row_outcome'), ''), 'IMPORTED_WITH_OPENING_BALANCE');

    IF v_row_outcome = 'CATALOG_ONLY_HISTORICAL_SOLD' THEN
      v_discarded_zero_count := v_discarded_zero_count + 1;
    ELSE
      -- Crear lote físico inicial sin fecha de compra inventada ni recepción ficticia
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
        v_lot_id,
        NULL,
        NULL,
        v_variant_id,
        v_sku,
        'excel_initial_import',
        NULL,
        COALESCE(NULLIF(btrim(v_item->>'storage_bin'), ''), 'PENDIENTE-UBICACION'),
        CASE WHEN v_qty_physical > 0 THEN 'open' ELSE 'quarantined' END,
        'Lote de importación inicial (' || p_batch_code || '). Sin compra ficticia.'
      );

      v_reconciliation_state := CASE
        WHEN v_cost_status = 'PENDING_COST' THEN 'pending_cost_info'
        WHEN v_qty_physical = 0 THEN 'pending_physical_count'
        WHEN v_qty_pending > 0 THEN 'pending_inspection'
        ELSE 'reconciled'
      END;

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
        is_bonus_zero_cost,
        reconciliation_state,
        notes
      ) VALUES (
        COALESCE(NULLIF(btrim(v_item->>'allocation_code'), ''), 'ASG-' || p_batch_code || '-' || v_sku),
        v_lot_id,
        v_variant_id,
        v_sku,
        v_owner_id,
        COALESCE(NULLIF(btrim(v_item->>'storage_bin'), ''), 'PENDIENTE-UBICACION'),
        v_qty_physical,
        v_qty_physical,
        v_qty_good,
        v_qty_defective,
        v_qty_pending,
        0,
        v_unit_cost,
        (v_cost_status = 'BONUS_ZERO_COST'),
        v_reconciliation_state,
        NULLIF(btrim(v_item->>'original_notes'), '')
      )
      RETURNING id INTO v_allocation_id;

      -- Cost record: respetar PENDING_COST sin inventar valor
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
        v_allocation_id,
        v_lot_id,
        v_owner_id,
        v_sku,
        'purchase_base',
        v_cost_status,
        v_unit_cost,
        CASE WHEN v_unit_cost IS NULL THEN NULL ELSE v_unit_cost * GREATEST(v_qty_physical, 1) END,
        GREATEST(v_qty_physical, 1),
        p_batch_code,
        v_user_id,
        CASE
          WHEN v_cost_status = 'PENDING_COST' THEN 'PENDING_COST: Sin costo registrado en Excel origen. No se infiere ni inventa.'
          WHEN v_cost_status = 'BONUS_ZERO_COST' THEN 'Costo $0 COP (Regalo por compra documentado en Excel).'
          ELSE 'Costo unitario original importado desde Excel.'
        END
      );

      -- Movimiento inmutable OPENING_BALANCE si qty_physical > 0
      IF v_qty_physical > 0 THEN
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
          v_allocation_id,
          v_lot_id,
          v_variant_id,
          v_sku,
          v_owner_id,
          'OPENING_BALANCE',
          v_qty_physical,
          v_qty_good,
          v_qty_defective,
          v_qty_pending,
          0,
          v_qty_physical,
          v_qty_good,
          v_qty_defective,
          v_qty_pending,
          0,
          v_unit_cost,
          'import_batches',
          p_batch_code,
          'OPENING_BALANCE: Importación de inventario físico inicial auditado (' || p_source_filename || ')',
          v_user_id
        );

        -- Registro inicial de control de calidad si existen unidades pendientes de revisión
        IF v_qty_pending > 0 THEN
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
            packaging_condition,
            inspection_status,
            inspected_by,
            inspector_name,
            notes
          ) VALUES (
            'QCI-' || p_batch_code || '-' || v_sku,
            v_allocation_id,
            v_lot_id,
            v_sku,
            v_owner_id,
            v_qty_physical,
            v_qty_good,
            v_qty_defective,
            v_qty_pending,
            true,
            NULL,
            NULL,
            'bueno',
            'pending_recheck',
            v_user_id,
            'IMPORT_ENGINE_INITIAL',
            'Unidades importadas en estado pendiente de revisión técnica antes de liberar a stock disponible.'
          );
        END IF;

        v_total_opening_units := v_total_opening_units + v_qty_physical;
        v_total_good_units := v_total_good_units + v_qty_good;
        v_total_defective_units := v_total_defective_units + v_qty_defective;
        v_total_pending_units := v_total_pending_units + v_qty_pending;

        IF v_unit_cost IS NOT NULL THEN
          v_total_cost_cop := v_total_cost_cop + (v_unit_cost * v_qty_physical);
        END IF;
      ELSE
        v_discarded_zero_count := v_discarded_zero_count + 1;
      END IF;
    END IF;

    INSERT INTO public.import_batch_items (
      batch_id,
      row_idempotency_key,
      source_sheet,
      source_row_number,
      owner_id,
      lot_id,
      product_code,
      sku,
      qty_physical,
      qty_good,
      qty_defective,
      qty_pending_inspection,
      unit_cost_cop,
      cost_status,
      row_outcome,
      justification
    ) VALUES (
      v_batch_id,
      v_row_idempotency_key,
      COALESCE(v_item->>'source_sheet', '06_INVENTARIO_FISICO'),
      COALESCE((v_item->>'source_row_number')::INTEGER, v_total_rows),
      v_owner_id,
      v_lot_id,
      v_product_code,
      v_sku,
      v_qty_physical,
      v_qty_good,
      v_qty_defective,
      v_qty_pending,
      v_unit_cost,
      v_cost_status,
      v_row_outcome,
      COALESCE(v_item->>'justification', 'Registro procesado por motor de importación.')
    );
  END LOOP;

  v_summary_after := jsonb_build_object(
    'batch_id', v_batch_id,
    'batch_code', p_batch_code,
    'idempotency_key', p_idempotency_key,
    'total_rows_read', v_total_rows,
    'total_skus_imported', v_total_skus,
    'total_opening_units', v_total_opening_units,
    'total_good_units', v_total_good_units,
    'total_defective_units', v_total_defective_units,
    'total_pending_units', v_total_pending_units,
    'total_confirmed_cost_cop', v_total_cost_cop,
    'pending_cost_count', v_pending_cost_count,
    'discarded_zero_stock_count', v_discarded_zero_count
  );

  UPDATE public.import_batches
  SET total_rows_read = v_total_rows,
      total_skus_imported = v_total_skus,
      total_opening_units = v_total_opening_units,
      total_good_units = v_total_good_units,
      total_defective_units = v_total_defective_units,
      total_pending_units = v_total_pending_units,
      total_confirmed_cost_cop = v_total_cost_cop,
      pending_cost_count = v_pending_cost_count,
      discarded_zero_stock_count = v_discarded_zero_count,
      summary_after = v_summary_after
  WHERE id = v_batch_id;

  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_role,
    action_type,
    entity_table,
    entity_id,
    owner_id_affected,
    previous_values,
    new_values,
    reason
  ) VALUES (
    v_user_id,
    public.fn_current_user_role(),
    'OPENING_INVENTORY_EXCEL_IMPORT',
    'import_batches',
    p_batch_code,
    'OWN-0001',
    p_summary_before,
    v_summary_after,
    'Importación transaccional de inventario inicial desde ' || p_source_filename
  );

  RETURN v_summary_after;
END;
$$;

COMMIT;
