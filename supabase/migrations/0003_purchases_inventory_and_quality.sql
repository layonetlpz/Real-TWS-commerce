-- =============================================================================
-- MIGRACIÓN 0003: RECEPCIONES DE COMPRA, LOTES, ASIGNACIÓN MULTIPROPIETARIO,
--                 KARDEX INMUTABLE, CALIDAD, RESERVAS, COSTOS Y TRANSFERENCIAS
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Cubre entidades:
--   6. Purchase receipts y lines (public.purchase_receipts, public.purchase_receipt_lines)
--   7. Stock lots (public.stock_lots)
--   8. Lot owner allocations (public.lot_owner_allocations)
--   9. Stock movements (public.stock_movements)
--  10. Quality inspections (public.quality_inspections)
--  11. Stock reservations (public.stock_reservations)
--  12. Cost records (public.cost_records)
--  24. Ownership transfers (public.ownership_transfers)
--   +  Incidencias de auditoría inicial (public.inventory_incidences)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. TABLA: public.purchase_receipts (Entidad #6A — Encabezado de Recepción/Compra)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE CHECK (btrim(receipt_number) <> ''),
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  invoice_reference TEXT,
  receipt_date DATE NOT NULL,
  receipt_status TEXT NOT NULL DEFAULT 'draft' CHECK (
    receipt_status IN ('draft', 'confirmed', 'reconciled', 'cancelled')
  ),
  subtotal_purchase_cop NUMERIC(14,2) CHECK (subtotal_purchase_cop >= 0),
  inbound_shipping_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (inbound_shipping_cop >= 0),
  other_import_costs_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (other_import_costs_cop >= 0),
  private_invoice_storage_path TEXT,
  received_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_receipts_date ON public.purchase_receipts(receipt_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_supplier ON public.purchase_receipts(supplier_id);

DROP TRIGGER IF EXISTS trg_purchase_receipts_updated_at ON public.purchase_receipts;
CREATE TRIGGER trg_purchase_receipts_updated_at
  BEFORE UPDATE ON public.purchase_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. TABLA: public.purchase_receipt_lines (Entidad #6B — Líneas de Recepción)
--    Regla 11 y 12: owner_id es NOT NULL y NO tiene DEFAULT 'OWN-0001'.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_receipt_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_receipt_id UUID NOT NULL REFERENCES public.purchase_receipts(id) ON DELETE RESTRICT,
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  qty_invoiced INTEGER CHECK (qty_invoiced >= 0),
  qty_received INTEGER CHECK (qty_received >= 0),
  unit_purchase_cost_cop NUMERIC(12,2) CHECK (unit_purchase_cost_cop >= 0),
  allocated_unit_shipping_cop NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (allocated_unit_shipping_cop >= 0),
  is_bonus_item BOOLEAN NOT NULL DEFAULT false,
  cost_status TEXT NOT NULL DEFAULT 'confirmed' CHECK (
    cost_status IN ('confirmed', 'pending_info', 'bonus_zero_cost')
  ),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_purchase_receipt_line UNIQUE (purchase_receipt_id, line_number),
  CONSTRAINT chk_receipt_line_cost_consistency CHECK (
    (cost_status = 'pending_info' AND unit_purchase_cost_cop IS NULL)
    OR (cost_status = 'bonus_zero_cost' AND is_bonus_item = true AND unit_purchase_cost_cop = 0)
    OR (cost_status = 'confirmed' AND unit_purchase_cost_cop IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_purchase_receipt_lines_owner ON public.purchase_receipt_lines(owner_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receipt_lines_sku ON public.purchase_receipt_lines(sku);

DROP TRIGGER IF EXISTS trg_purchase_receipt_lines_updated_at ON public.purchase_receipt_lines;
CREATE TRIGGER trg_purchase_receipt_lines_updated_at
  BEFORE UPDATE ON public.purchase_receipt_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. TABLA: public.stock_lots (Entidad #7 — Lotes Físicos de Mercancía)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_lots (
  id TEXT PRIMARY KEY CHECK (btrim(id) <> ''),
  purchase_receipt_id UUID REFERENCES public.purchase_receipts(id) ON DELETE RESTRICT,
  purchase_receipt_line_id UUID REFERENCES public.purchase_receipt_lines(id) ON DELETE RESTRICT,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  lot_origin TEXT NOT NULL CHECK (
    lot_origin IN ('excel_initial_import', 'purchase_receipt', 'ownership_transfer', 'customer_return')
  ),
  received_date DATE NOT NULL,
  warehouse_location TEXT,
  lot_status TEXT NOT NULL DEFAULT 'open' CHECK (
    lot_status IN ('open', 'depleted', 'quarantined', 'closed')
  ),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_lots_sku ON public.stock_lots(sku);
CREATE INDEX IF NOT EXISTS idx_stock_lots_status ON public.stock_lots(lot_status);

DROP TRIGGER IF EXISTS trg_stock_lots_updated_at ON public.stock_lots;
CREATE TRIGGER trg_stock_lots_updated_at
  BEFORE UPDATE ON public.stock_lots
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. TABLA: public.lot_owner_allocations (Entidad #8 — Asignación de Lote por Propietario)
--    Núcleo multipropietario: separa unidades físicas, aptas, defectuosas,
--    pendientes de revisión y reservadas; mantiene el costo unitario por lote.
--    owner_id NO tiene valor por defecto (obliga asignación explícita).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lot_owner_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_code TEXT NOT NULL UNIQUE CHECK (btrim(allocation_code) <> ''),
  lot_id TEXT NOT NULL REFERENCES public.stock_lots(id) ON DELETE RESTRICT,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  storage_bin TEXT NOT NULL DEFAULT 'PENDIENTE-UBICACION',
  qty_initial_assigned INTEGER CHECK (qty_initial_assigned >= 0),
  qty_physical INTEGER CHECK (qty_physical >= 0),
  qty_good INTEGER NOT NULL DEFAULT 0 CHECK (qty_good >= 0),
  qty_defective INTEGER NOT NULL DEFAULT 0 CHECK (qty_defective >= 0),
  qty_pending_inspection INTEGER NOT NULL DEFAULT 0 CHECK (qty_pending_inspection >= 0),
  qty_reserved INTEGER NOT NULL DEFAULT 0 CHECK (qty_reserved >= 0 AND qty_reserved <= qty_good),
  qty_available INTEGER GENERATED ALWAYS AS (GREATEST(0, qty_good - qty_reserved)) STORED,
  purchase_unit_cost_cop NUMERIC(12,2) CHECK (purchase_unit_cost_cop >= 0),
  inbound_shipping_unit_cost_cop NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (inbound_shipping_unit_cost_cop >= 0),
  other_unit_cost_cop NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (other_unit_cost_cop >= 0),
  effective_unit_cost_cop NUMERIC(12,2) GENERATED ALWAYS AS (
    CASE
      WHEN purchase_unit_cost_cop IS NULL THEN NULL
      ELSE purchase_unit_cost_cop + inbound_shipping_unit_cost_cop + other_unit_cost_cop
    END
  ) STORED,
  is_bonus_zero_cost BOOLEAN NOT NULL DEFAULT false,
  reconciliation_state TEXT NOT NULL DEFAULT 'pending_inspection' CHECK (
    reconciliation_state IN (
      'reconciled',
      'pending_inspection',
      'pending_physical_count',
      'pending_cost_info',
      'discrepancy'
    )
  ),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_lot_owner_sku_bin UNIQUE (lot_id, sku, owner_id, storage_bin),
  CONSTRAINT chk_lot_physical_breakdown CHECK (
    qty_physical IS NULL
    OR qty_physical = (qty_good + qty_defective + qty_pending_inspection)
  )
);

CREATE INDEX IF NOT EXISTS idx_lot_allocations_owner ON public.lot_owner_allocations(owner_id);
CREATE INDEX IF NOT EXISTS idx_lot_allocations_sku_avail ON public.lot_owner_allocations(sku, qty_available);
CREATE INDEX IF NOT EXISTS idx_lot_allocations_lot ON public.lot_owner_allocations(lot_id);

DROP TRIGGER IF EXISTS trg_lot_owner_allocations_updated_at ON public.lot_owner_allocations;
CREATE TRIGGER trg_lot_owner_allocations_updated_at
  BEFORE UPDATE ON public.lot_owner_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. TABLA: public.stock_movements (Entidad #9 — Libro Inmutable de Movimientos)
--    Regla crítica: Kardex append-only. Prohibido actualizar o eliminar filas.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_seq BIGSERIAL UNIQUE,
  lot_allocation_id UUID NOT NULL REFERENCES public.lot_owner_allocations(id) ON DELETE RESTRICT,
  lot_id TEXT NOT NULL REFERENCES public.stock_lots(id) ON DELETE RESTRICT,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (
    movement_type IN (
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
  ),
  delta_physical INTEGER NOT NULL DEFAULT 0,
  delta_good INTEGER NOT NULL DEFAULT 0,
  delta_defective INTEGER NOT NULL DEFAULT 0,
  delta_pending INTEGER NOT NULL DEFAULT 0,
  delta_reserved INTEGER NOT NULL DEFAULT 0,
  balance_physical_after INTEGER,
  balance_good_after INTEGER NOT NULL CHECK (balance_good_after >= 0),
  balance_defective_after INTEGER NOT NULL CHECK (balance_defective_after >= 0),
  balance_pending_after INTEGER NOT NULL CHECK (balance_pending_after >= 0),
  balance_reserved_after INTEGER NOT NULL CHECK (balance_reserved_after >= 0),
  unit_cost_snapshot_cop NUMERIC(12,2),
  reference_entity TEXT NOT NULL CHECK (btrim(reference_entity) <> ''),
  reference_id TEXT NOT NULL CHECK (btrim(reference_id) <> ''),
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  performed_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_allocation ON public.stock_movements(lot_allocation_id, movement_seq DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_owner_date ON public.stock_movements(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_sku ON public.stock_movements(sku, created_at DESC);

DROP TRIGGER IF EXISTS trg_stock_movements_immutable ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_immutable
  BEFORE UPDATE OR DELETE ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_ledger_mutation();

-- -----------------------------------------------------------------------------
-- 6. TABLA: public.quality_inspections (Entidad #10 — Inspecciones de Calidad)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quality_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_code TEXT NOT NULL UNIQUE CHECK (btrim(inspection_code) <> ''),
  lot_allocation_id UUID NOT NULL REFERENCES public.lot_owner_allocations(id) ON DELETE RESTRICT,
  lot_id TEXT NOT NULL REFERENCES public.stock_lots(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  inspection_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  qty_inspected INTEGER NOT NULL CHECK (qty_inspected > 0),
  qty_approved_good INTEGER NOT NULL CHECK (qty_approved_good >= 0),
  qty_marked_defective INTEGER NOT NULL CHECK (qty_marked_defective >= 0),
  qty_remaining_pending INTEGER NOT NULL DEFAULT 0 CHECK (qty_remaining_pending >= 0),
  visual_check_passed BOOLEAN NOT NULL,
  functional_test_passed BOOLEAN,
  accessories_complete BOOLEAN,
  packaging_condition TEXT NOT NULL DEFAULT 'bueno',
  checklist_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  inspection_status TEXT NOT NULL CHECK (
    inspection_status IN ('approved', 'partially_approved', 'rejected', 'pending_recheck')
  ),
  private_evidence_storage_path TEXT,
  inspected_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  inspector_name TEXT NOT NULL CHECK (btrim(inspector_name) <> ''),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_quality_inspection_quantities CHECK (
    qty_inspected = (qty_approved_good + qty_marked_defective + qty_remaining_pending)
  )
);

CREATE INDEX IF NOT EXISTS idx_quality_inspections_allocation ON public.quality_inspections(lot_allocation_id);
CREATE INDEX IF NOT EXISTS idx_quality_inspections_owner ON public.quality_inspections(owner_id);

-- -----------------------------------------------------------------------------
-- 7. TABLA: public.stock_reservations (Entidad #11 — Reservas de Inventario)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_code TEXT NOT NULL UNIQUE CHECK (btrim(reservation_code) <> ''),
  lot_allocation_id UUID NOT NULL REFERENCES public.lot_owner_allocations(id) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  sales_order_ref TEXT,
  qty_reserved INTEGER NOT NULL CHECK (qty_reserved > 0),
  qty_fulfilled INTEGER NOT NULL DEFAULT 0 CHECK (qty_fulfilled >= 0 AND qty_fulfilled <= qty_reserved),
  qty_released INTEGER NOT NULL DEFAULT 0 CHECK (
    qty_released >= 0 AND (qty_fulfilled + qty_released) <= qty_reserved
  ),
  reservation_status TEXT NOT NULL DEFAULT 'active' CHECK (
    reservation_status IN ('active', 'fulfilled', 'released', 'expired')
  ),
  expires_at TIMESTAMPTZ,
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  created_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_reservations_alloc_status
  ON public.stock_reservations(lot_allocation_id, reservation_status);

DROP TRIGGER IF EXISTS trg_stock_reservations_updated_at ON public.stock_reservations;
CREATE TRIGGER trg_stock_reservations_updated_at
  BEFORE UPDATE ON public.stock_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 8. TABLA: public.cost_records (Entidad #12 — Registro Auditado de Costos por Lote)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cost_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_allocation_id UUID NOT NULL REFERENCES public.lot_owner_allocations(id) ON DELETE RESTRICT,
  lot_id TEXT NOT NULL REFERENCES public.stock_lots(id) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  cost_type TEXT NOT NULL CHECK (
    cost_type IN (
      'purchase_base',
      'inbound_freight',
      'packaging_direct',
      'warranty_repair',
      'cost_confirmation_update'
    )
  ),
  unit_amount_cop NUMERIC(12,2) NOT NULL CHECK (unit_amount_cop >= 0),
  total_amount_cop NUMERIC(14,2) NOT NULL CHECK (total_amount_cop >= 0),
  qty_basis INTEGER NOT NULL CHECK (qty_basis > 0),
  source_document_ref TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_records_allocation ON public.cost_records(lot_allocation_id);
CREATE INDEX IF NOT EXISTS idx_cost_records_owner ON public.cost_records(owner_id);

-- -----------------------------------------------------------------------------
-- 9. TABLA: public.ownership_transfers (Entidad #24 — Transferencias entre Propietarios)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ownership_transfers (
  id TEXT PRIMARY KEY CHECK (id ~ '^TRF-[0-9]{4,}$'),
  transfer_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  lot_id TEXT NOT NULL REFERENCES public.stock_lots(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  source_lot_allocation_id UUID NOT NULL REFERENCES public.lot_owner_allocations(id) ON DELETE RESTRICT,
  target_lot_allocation_id UUID NOT NULL REFERENCES public.lot_owner_allocations(id) ON DELETE RESTRICT,
  from_owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  to_owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  qty_transferred INTEGER NOT NULL CHECK (qty_transferred > 0),
  unit_cost_transferred_cop NUMERIC(12,2) NOT NULL CHECK (unit_cost_transferred_cop >= 0),
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  transfer_status TEXT NOT NULL DEFAULT 'completed' CHECK (
    transfer_status IN ('draft', 'completed', 'cancelled')
  ),
  authorized_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_transfer_distinct_owners CHECK (from_owner_id <> to_owner_id),
  CONSTRAINT chk_transfer_distinct_allocations CHECK (source_lot_allocation_id <> target_lot_allocation_id)
);

CREATE INDEX IF NOT EXISTS idx_ownership_transfers_from_owner ON public.ownership_transfers(from_owner_id);
CREATE INDEX IF NOT EXISTS idx_ownership_transfers_to_owner ON public.ownership_transfers(to_owner_id);

-- -----------------------------------------------------------------------------
-- 10. TABLA: public.inventory_incidences (Bitácora de Incidencias del Excel Inicial)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_incidences (
  id TEXT PRIMARY KEY CHECK (id ~ '^INC-[0-9]{3,}$'),
  severity TEXT NOT NULL CHECK (severity IN ('ALTA', 'MEDIA', 'INFO')),
  affected_module TEXT NOT NULL,
  sku_or_owner_ref TEXT NOT NULL,
  owner_id TEXT REFERENCES public.owners(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  required_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pendiente Revisión' CHECK (
    status IN ('Pendiente Revisión', 'En Proceso', 'Resuelto')
  ),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_inventory_incidences_updated_at ON public.inventory_incidences;
CREATE TRIGGER trg_inventory_incidences_updated_at
  BEFORE UPDATE ON public.inventory_incidences
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

COMMIT;
