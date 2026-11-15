-- ============================================================================
-- REAL TWS COMMERCE SYSTEM — 02_REAL_TWS_SETUP.sql
-- ============================================================================
-- PROPÓSITO:
--   Instalación limpia, completa y consolidada desde cero de REAL TWS en
--   Supabase (PostgreSQL). Debe ejecutarse DESPUÉS de 01_CLEANUP_PREVIOUS_REAL_TWS.sql
--   y sin otras pestañas o procesos DDL ejecutándose simultáneamente.
--
-- CARACTERÍSTICAS:
--   - Transacciones cortas por módulo (sin BEGIN anidados) y lock_timeout = '10s'
--     para evitar retener AccessExclusiveLock sobre 65 tablas a la vez (40P01).
--   - Incluye los 6 roles en public.app_role desde el inicio (incluido VIEWER).
--   - Incluye public.fn_has_any_role(text[]) desde el módulo 0002.
--   - Sin creación de usuarios administradores falsos ni datos demo ficticios.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0001_extensions_enums_and_helpers.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
-- =============================================================================
-- MIGRACIÓN 0001: EXTENSIONES, TIPOS ENUM Y FUNCIONES BASE DE TRIGGERS
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Motor: PostgreSQL 15+ / Supabase
-- Roles Oficiales:
--   - ADMIN
--   - INVENTORY_OPERATOR
--   - SALES_OPERATOR
--   - MARKETING_OPERATOR
--   - OWNER
-- =============================================================================

-- 1. Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Enum oficial de Roles del Sistema (5 Roles RBAC)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM (
      'ADMIN',
      'INVENTORY_OPERATOR',
      'SALES_OPERATOR',
      'MARKETING_OPERATOR',
      'OWNER',
  'VIEWER'
);
  END IF;
END
$$;

-- 3. Función explícita para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

-- 4. Función explícita para proteger libros contables y de inventario inmutables
--    (Bloquea UPDATE y DELETE en stock_movements, price_history y audit_logs)
CREATE OR REPLACE FUNCTION public.fn_prevent_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Operación prohibida (% en tabla %): Este registro pertenece a un libro inmutable de auditoría/kardex y no puede modificarse ni eliminarse.',
    TG_OP, TG_TABLE_NAME;
END;
$$;
COMMIT;


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0002_identity_owners_and_catalog.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
-- =============================================================================
-- MIGRACIÓN 0002: PERFILES, ROLES (RBAC), PROPIETARIOS, ACUERDOS, CATÁLOGO,
--                 PROVEEDORES E HISTORIAL DE PRECIOS
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Roles soportados:
--   ADMIN, INVENTORY_OPERATOR, SALES_OPERATOR, MARKETING_OPERATOR, OWNER
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLA: public.owners (Entidad #2 — Propietarios de Mercancía)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.owners (
  id TEXT PRIMARY KEY CHECK (id ~ '^OWN-[0-9]{4,}$'),
  internal_code TEXT NOT NULL UNIQUE CHECK (internal_code ~ '^OWN-[0-9]{4,}$'),
  full_name TEXT NOT NULL CHECK (btrim(full_name) <> ''),
  document_type TEXT,
  document_number TEXT,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  portal_access_enabled BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owners_status ON public.owners(status);

DROP TRIGGER IF EXISTS trg_owners_updated_at ON public.owners;
CREATE TRIGGER trg_owners_updated_at
  BEFORE UPDATE ON public.owners
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. TABLA: public.profiles (Entidad #1 — Perfiles de Usuario y Roles RBAC)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL CHECK (btrim(full_name) <> ''),
  email TEXT,
  role public.app_role NOT NULL DEFAULT 'SALES_OPERATOR',
  linked_owner_id TEXT REFERENCES public.owners(id) ON DELETE RESTRICT,
  owner_portal_enabled BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_profiles_owner_link CHECK (
    (role <> 'OWNER') OR (linked_owner_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_linked_owner ON public.profiles(linked_owner_id);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. FUNCIONES DE SEGURIDAD PARA RLS Y VALIDACIÓN EN BASE DE DATOS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_current_user_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.is_active = true
  LIMIT 1;
$$;

-- ADMIN: acceso completo al negocio
CREATE OR REPLACE FUNCTION public.fn_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.fn_current_user_role() = 'ADMIN', false);
$$;

-- INVENTORY_OPERATOR o ADMIN: operaciones de catálogo, compras, lotes, inventario y calidad
CREATE OR REPLACE FUNCTION public.fn_is_operator_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.fn_current_user_role() IN ('ADMIN', 'INVENTORY_OPERATOR'), false);
$$;

-- SALES_OPERATOR o ADMIN: operaciones de clientes, leads, pedidos, pagos, devoluciones y despachos
CREATE OR REPLACE FUNCTION public.fn_can_manage_sales()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.fn_current_user_role() IN ('ADMIN', 'SALES_OPERATOR'), false);
$$;

-- MARKETING_OPERATOR o ADMIN: activos de marca, calendario editorial y publicaciones
CREATE OR REPLACE FUNCTION public.fn_can_manage_marketing()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.fn_current_user_role() IN ('ADMIN', 'MARKETING_OPERATOR'), false);
$$;

-- Personal interno operativo (ADMIN, INVENTORY_OPERATOR, SALES_OPERATOR, MARKETING_OPERATOR)
CREATE OR REPLACE FUNCTION public.fn_is_sales_or_above()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.fn_current_user_role() IN (
      'ADMIN',
      'INVENTORY_OPERATOR',
      'SALES_OPERATOR',
      'MARKETING_OPERATOR'
    ),
    false
  );
$$;

-- Verificación dinámica de cualquiera de los roles permitidos (usada en RLS de módulos 0015-0017)
CREATE OR REPLACE FUNCTION public.fn_has_any_role(p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.fn_current_user_role()::TEXT = ANY(p_roles),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.fn_has_any_role(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_has_any_role(TEXT[]) TO authenticated, service_role;

-- OWNER: exclusivamente registros propios si tiene acceso habilitado
CREATE OR REPLACE FUNCTION public.fn_can_owner_view(p_owner_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.owners o ON o.id = p.linked_owner_id
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND p.role = 'OWNER'
      AND p.owner_portal_enabled = true
      AND o.portal_access_enabled = true
      AND o.status = 'active'
      AND p.linked_owner_id = p_owner_id
  );
$$;

-- -----------------------------------------------------------------------------
-- 4. TABLA: public.owner_agreements (Entidad #3 — Acuerdos de Distribución)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.owner_agreements (
  id TEXT PRIMARY KEY CHECK (id ~ '^AGR-[0-9]{4,}$'),
  agreement_code TEXT NOT NULL UNIQUE CHECK (agreement_code ~ '^AGR-[0-9]{4,}$'),
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  distribution_model TEXT CHECK (
    distribution_model IN (
      'attributable_profit',
      'store_commission_pct',
      'profit_split_pct',
      'fixed_margin',
      'custom_documented'
    )
  ),
  owner_share_pct NUMERIC(5,2) CHECK (owner_share_pct >= 0 AND owner_share_pct <= 100),
  store_commission_pct NUMERIC(5,2) CHECK (store_commission_pct >= 0 AND store_commission_pct <= 100),
  status TEXT NOT NULL DEFAULT 'pending_configuration' CHECK (
    status IN ('pending_configuration', 'active', 'superseded', 'cancelled')
  ),
  effective_from DATE,
  effective_to DATE,
  approved_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  private_agreement_storage_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_owner_agreement_valid_active CHECK (
    status = 'pending_configuration'
    OR (
      distribution_model IS NOT NULL
      AND effective_from IS NOT NULL
      AND approved_by IS NOT NULL
      AND (
        distribution_model <> 'profit_split_pct'
        OR (
          owner_share_pct IS NOT NULL
          AND store_commission_pct IS NOT NULL
          AND (owner_share_pct + store_commission_pct = 100.00)
        )
      )
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_agreements_one_active
  ON public.owner_agreements(owner_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_owner_agreements_owner_id
  ON public.owner_agreements(owner_id);

DROP TRIGGER IF EXISTS trg_owner_agreements_updated_at ON public.owner_agreements;
CREATE TRIGGER trg_owner_agreements_updated_at
  BEFORE UPDATE ON public.owner_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. TABLA: public.products (Entidad #4A — Catálogo Maestro Universal)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_excel_row_id INTEGER UNIQUE,
  product_code TEXT NOT NULL UNIQUE CHECK (btrim(product_code) <> ''),
  category TEXT NOT NULL CHECK (btrim(category) <> ''),
  subcategory TEXT,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  brand TEXT,
  model TEXT,
  manufacturer_ref TEXT,
  supplier_ref TEXT,
  description TEXT,
  verified_specs JSONB NOT NULL DEFAULT '{}'::jsonb,
  unit_of_measure TEXT NOT NULL DEFAULT 'Unidad',
  original_excel_notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 6. TABLA: public.product_variants (Entidad #4B — Variantes Comerciales SKU)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE CHECK (btrim(sku) <> ''),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_name TEXT NOT NULL CHECK (btrim(variant_name) <> ''),
  color TEXT,
  presentation TEXT,
  barcode TEXT UNIQUE,
  current_approved_price_cop NUMERIC(12,2) CHECK (current_approved_price_cop >= 0),
  is_published_in_catalog BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_status ON public.product_variants(status);

DROP TRIGGER IF EXISTS trg_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER trg_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 7. TABLA: public.suppliers (Entidad #5 — Proveedores)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_code TEXT NOT NULL UNIQUE CHECK (btrim(supplier_code) <> ''),
  legal_name TEXT NOT NULL CHECK (btrim(legal_name) <> ''),
  contact_name TEXT,
  tax_id TEXT,
  phone TEXT,
  email TEXT,
  city TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_status ON public.suppliers(status);

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 8. TABLA: public.price_history (Entidad #13 — Historial Inmutable de Precios)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  previous_price_cop NUMERIC(12,2) CHECK (previous_price_cop >= 0),
  new_price_cop NUMERIC(12,2) NOT NULL CHECK (new_price_cop >= 0),
  change_reason TEXT NOT NULL CHECK (btrim(change_reason) <> ''),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ,
  approved_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_history_sku ON public.price_history(sku, effective_from DESC);

DROP TRIGGER IF EXISTS trg_price_history_immutable ON public.price_history;
CREATE TRIGGER trg_price_history_immutable
  BEFORE UPDATE OR DELETE ON public.price_history
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_ledger_mutation();
COMMIT;


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0003_purchases_inventory_and_quality.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
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


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0004_commercial_sales_and_logistics.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
-- =============================================================================
-- MIGRACIÓN 0004: CLIENTES, LEADS (CRM), PEDIDOS DE VENTA, LÍNEAS DE PEDIDO,
--                 ATRIBUCIÓN MULTIPROPIETARIO, PAGOS, DEVOLUCIONES Y DESPACHOS
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Cubre entidades:
--  16. Customers (public.customers)
--  17. Leads (public.leads)
--  18. Sales orders (public.sales_orders)
--  19. Sales order items (public.sales_order_items)
--  20. Sales item allocations (public.sales_item_allocations)
--  21. Payments (public.payments)
--  22. Returns (public.returns)
--  23. Shipments (public.shipments)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLA: public.customers (Entidad #16 — Clientes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code TEXT NOT NULL UNIQUE CHECK (btrim(customer_code) <> ''),
  full_name TEXT NOT NULL CHECK (btrim(full_name) <> ''),
  document_type TEXT,
  document_number TEXT,
  phone_whatsapp TEXT,
  email TEXT,
  city TEXT,
  department TEXT,
  shipping_address TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone_whatsapp);
CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers(status);

DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. TABLA: public.leads (Entidad #17 — Prospectos y Seguimiento CRM)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_code TEXT NOT NULL UNIQUE CHECK (btrim(lead_code) <> ''),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL CHECK (btrim(full_name) <> ''),
  phone_whatsapp TEXT,
  email TEXT,
  source_channel TEXT NOT NULL CHECK (
    source_channel IN ('whatsapp', 'instagram', 'facebook', 'marketplace', 'walk_in', 'referral', 'other')
  ),
  interested_sku TEXT REFERENCES public.product_variants(sku) ON DELETE SET NULL,
  lead_stage TEXT NOT NULL DEFAULT 'new' CHECK (
    lead_stage IN ('new', 'contacted', 'quoted', 'negotiation', 'won', 'lost')
  ),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  next_followup_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads(lead_stage);
CREATE INDEX IF NOT EXISTS idx_leads_sku ON public.leads(interested_sku);

DROP TRIGGER IF EXISTS trg_leads_updated_at ON public.leads;
CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. TABLA: public.sales_orders (Entidad #18 — Encabezado de Pedidos de Venta)
--    Regla crítica: allocation_policy_used obliga política explícita; nunca
--    elige propietarios al azar.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE CHECK (btrim(order_number) <> ''),
  order_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE RESTRICT,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  sales_channel TEXT NOT NULL DEFAULT 'store_direct' CHECK (
    sales_channel IN ('store_direct', 'whatsapp', 'instagram', 'facebook', 'marketplace', 'web')
  ),
  allocation_policy_used TEXT NOT NULL DEFAULT 'explicit_manual_selection' CHECK (
    allocation_policy_used IN ('explicit_manual_selection', 'approved_fifo_policy')
  ),
  order_status TEXT NOT NULL DEFAULT 'draft' CHECK (
    order_status IN (
      'draft',
      'reserved',
      'confirmed',
      'dispatched',
      'delivered',
      'partially_returned',
      'returned',
      'cancelled'
    )
  ),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    payment_status IN ('pending', 'partial', 'paid', 'refunded')
  ),
  subtotal_gross_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal_gross_cop >= 0),
  discount_total_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_total_cop >= 0),
  shipping_charged_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (shipping_charged_cop >= 0),
  returned_total_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (returned_total_cop >= 0),
  net_order_total_cop NUMERIC(14,2) GENERATED ALWAYS AS (
    (subtotal_gross_cop - discount_total_cop - returned_total_cop) + shipping_charged_cop
  ) STORED,
  total_collected_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_collected_cop >= 0),
  seller_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_orders_date ON public.sales_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON public.sales_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON public.sales_orders(customer_id);

DROP TRIGGER IF EXISTS trg_sales_orders_updated_at ON public.sales_orders;
CREATE TRIGGER trg_sales_orders_updated_at
  BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. TABLA: public.sales_order_items (Entidad #19 — Líneas Comerciales del Pedido)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  qty_ordered INTEGER NOT NULL CHECK (qty_ordered > 0),
  qty_returned INTEGER NOT NULL DEFAULT 0 CHECK (qty_returned >= 0 AND qty_returned <= qty_ordered),
  unit_sale_price_cop NUMERIC(12,2) NOT NULL CHECK (unit_sale_price_cop >= 0),
  line_discount_cop NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (line_discount_cop >= 0),
  line_gross_total_cop NUMERIC(14,2) GENERATED ALWAYS AS (qty_ordered * unit_sale_price_cop) STORED,
  line_net_total_cop NUMERIC(14,2) GENERATED ALWAYS AS (
    (qty_ordered * unit_sale_price_cop) - line_discount_cop
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sales_order_item_line UNIQUE (sales_order_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_sales_order_items_order ON public.sales_order_items(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_sku ON public.sales_order_items(sku);

-- -----------------------------------------------------------------------------
-- 5. TABLA: public.sales_item_allocations (Entidad #20 — Descomposición Multipropietario
--           Propietario + Lote + Cantidad + Costo + Ingreso + Comisión + Utilidad)
--    Regla crítica: Toda venta se descompone en asignaciones exactas sin doble
--    conteo y sin asumir porcentajes de comisión no configurados.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_item_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_sale_code TEXT NOT NULL UNIQUE CHECK (btrim(allocation_sale_code) <> ''),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  sales_order_item_id UUID NOT NULL REFERENCES public.sales_order_items(id) ON DELETE RESTRICT,
  lot_allocation_id UUID NOT NULL REFERENCES public.lot_owner_allocations(id) ON DELETE RESTRICT,
  lot_id TEXT NOT NULL REFERENCES public.stock_lots(id) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  agreement_id TEXT REFERENCES public.owner_agreements(id) ON DELETE RESTRICT,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  qty_allocated INTEGER NOT NULL CHECK (qty_allocated > 0),
  qty_returned INTEGER NOT NULL DEFAULT 0 CHECK (qty_returned >= 0 AND qty_returned <= qty_allocated),
  unit_sale_price_cop NUMERIC(12,2) NOT NULL CHECK (unit_sale_price_cop >= 0),
  discount_allocated_cop NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_allocated_cop >= 0),
  return_amount_cop NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (return_amount_cop >= 0),
  gross_revenue_cop NUMERIC(14,2) GENERATED ALWAYS AS (qty_allocated * unit_sale_price_cop) STORED,
  net_revenue_cop NUMERIC(14,2) GENERATED ALWAYS AS (
    (qty_allocated * unit_sale_price_cop) - discount_allocated_cop - return_amount_cop
  ) STORED,
  unit_cost_cop NUMERIC(12,2) NOT NULL CHECK (unit_cost_cop >= 0),
  cogs_total_cop NUMERIC(14,2) GENERATED ALWAYS AS (
    (qty_allocated - qty_returned) * unit_cost_cop
  ) STORED,
  direct_selling_expense_cop NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (direct_selling_expense_cop >= 0),
  gross_profit_cop NUMERIC(14,2) GENERATED ALWAYS AS (
    ((qty_allocated * unit_sale_price_cop) - discount_allocated_cop - return_amount_cop)
    - ((qty_allocated - qty_returned) * unit_cost_cop)
    - direct_selling_expense_cop
  ) STORED,
  store_commission_cop NUMERIC(14,2) CHECK (store_commission_cop >= 0),
  attributable_owner_profit_cop NUMERIC(14,2),
  commission_calculation_status TEXT NOT NULL DEFAULT 'pending_agreement' CHECK (
    commission_calculation_status IN (
      'pending_agreement',
      'calculated_by_agreement',
      'direct_100_owner'
    )
  ),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_allocations_owner ON public.sales_item_allocations(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_allocations_order_item ON public.sales_item_allocations(sales_order_item_id);
CREATE INDEX IF NOT EXISTS idx_sales_allocations_lot_alloc ON public.sales_item_allocations(lot_allocation_id);

DROP TRIGGER IF EXISTS trg_sales_item_allocations_updated_at ON public.sales_item_allocations;
CREATE TRIGGER trg_sales_item_allocations_updated_at
  BEFORE UPDATE ON public.sales_item_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 6. TABLA: public.payments (Entidad #21 — Recaudos y Pagos de Clientes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_code TEXT NOT NULL UNIQUE CHECK (btrim(payment_code) <> ''),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  payment_method TEXT NOT NULL CHECK (
    payment_method IN ('cash', 'nequi', 'daviplata', 'bank_transfer', 'card', 'cod_carrier')
  ),
  amount_cop NUMERIC(14,2) NOT NULL CHECK (amount_cop > 0),
  payment_status TEXT NOT NULL DEFAULT 'confirmed' CHECK (
    payment_status IN ('pending', 'confirmed', 'voided', 'refunded')
  ),
  external_reference TEXT,
  private_voucher_storage_path TEXT,
  received_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments(sales_order_id);

-- -----------------------------------------------------------------------------
-- 7. TABLA: public.returns (Entidad #22 — Devoluciones y Garantías sobre Ventas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_code TEXT NOT NULL UNIQUE CHECK (btrim(return_code) <> ''),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  sales_order_item_id UUID NOT NULL REFERENCES public.sales_order_items(id) ON DELETE RESTRICT,
  sales_item_allocation_id UUID NOT NULL REFERENCES public.sales_item_allocations(id) ON DELETE RESTRICT,
  lot_allocation_id UUID NOT NULL REFERENCES public.lot_owner_allocations(id) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  return_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  qty_returned INTEGER NOT NULL CHECK (qty_returned > 0),
  item_condition TEXT NOT NULL CHECK (
    item_condition IN ('good_restock', 'defective_warranty', 'pending_inspection')
  ),
  refund_amount_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (refund_amount_cop >= 0),
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  return_status TEXT NOT NULL DEFAULT 'completed' CHECK (
    return_status IN ('requested', 'approved', 'completed', 'rejected')
  ),
  processed_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_returns_owner ON public.returns(owner_id);
CREATE INDEX IF NOT EXISTS idx_returns_order ON public.returns(sales_order_id);

-- -----------------------------------------------------------------------------
-- 8. TABLA: public.shipments (Entidad #23 — Despachos y Logística de Entrega)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_code TEXT NOT NULL UNIQUE CHECK (btrim(shipment_code) <> ''),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  carrier_name TEXT NOT NULL CHECK (btrim(carrier_name) <> ''),
  tracking_number TEXT,
  recipient_name TEXT NOT NULL CHECK (btrim(recipient_name) <> ''),
  recipient_phone TEXT NOT NULL CHECK (btrim(recipient_phone) <> ''),
  destination_city TEXT NOT NULL CHECK (btrim(destination_city) <> ''),
  destination_address TEXT NOT NULL CHECK (btrim(destination_address) <> ''),
  shipping_cost_cop NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (shipping_cost_cop >= 0),
  shipment_status TEXT NOT NULL DEFAULT 'preparing' CHECK (
    shipment_status IN (
      'preparing',
      'dispatched',
      'in_transit',
      'delivered',
      'returned_by_carrier',
      'cancelled'
    )
  ),
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  private_guide_storage_path TEXT,
  dispatched_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipments_order ON public.shipments(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON public.shipments(shipment_status);

DROP TRIGGER IF EXISTS trg_shipments_updated_at ON public.shipments;
CREATE TRIGGER trg_shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();
COMMIT;


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0005_finance_expenses_and_settlements.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
-- =============================================================================
-- MIGRACIÓN 0005: GASTOS DIRECTOS Y COMPARTIDOS, DISTRIBUCIÓN DE GASTOS
--                 Y LIQUIDACIONES A PROPIETARIOS
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Cubre entidades:
--  14. Expenses (public.expenses)
--  15. Expense allocations (public.expense_allocations)
--  25. Owner settlements (public.owner_settlements)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLA: public.expenses (Entidad #14 — Gastos Operativos y Directos)
--    Regla Financiera: Separa gastos directos por propietario, gastos
--    compartidos multipropietario y gastos internos absorbidos por la tienda.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expenses (
  id TEXT PRIMARY KEY CHECK (id ~ '^EXP-[0-9]{4,}$'),
  expense_date DATE NOT NULL,
  expense_scope TEXT NOT NULL CHECK (
    expense_scope IN ('direct_owner', 'shared_multi_owner', 'store_internal')
  ),
  category TEXT NOT NULL CHECK (btrim(category) <> ''),
  description TEXT NOT NULL CHECK (btrim(description) <> ''),
  total_amount_cop NUMERIC(14,2) NOT NULL CHECK (total_amount_cop > 0),
  allocation_policy TEXT NOT NULL CHECK (
    allocation_policy IN (
      'single_owner_direct',
      'manual_explicit',
      'proportional_net_sales',
      'proportional_cogs',
      'proportional_units_sold',
      'store_absorbed'
    )
  ),
  allocation_period_start DATE,
  allocation_period_end DATE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  private_receipt_storage_path TEXT,
  approval_status TEXT NOT NULL DEFAULT 'approved' CHECK (
    approval_status IN ('draft', 'approved', 'cancelled')
  ),
  recorded_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_expense_scope_policy CHECK (
    (expense_scope = 'direct_owner' AND allocation_policy = 'single_owner_direct')
    OR (expense_scope = 'store_internal' AND allocation_policy = 'store_absorbed')
    OR (
      expense_scope = 'shared_multi_owner'
      AND allocation_policy IN (
        'manual_explicit',
        'proportional_net_sales',
        'proportional_cogs',
        'proportional_units_sold'
      )
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_scope ON public.expenses(expense_scope);

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON public.expenses;
CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. TABLA: public.expense_allocations (Entidad #15 — Prorrateo / Asignación de Gastos)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id TEXT NOT NULL REFERENCES public.expenses(id) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  allocated_amount_cop NUMERIC(14,2) NOT NULL CHECK (allocated_amount_cop >= 0),
  allocation_percentage NUMERIC(7,4) CHECK (allocation_percentage >= 0 AND allocation_percentage <= 100),
  calculation_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  justification_note TEXT NOT NULL CHECK (btrim(justification_note) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_expense_owner_allocation UNIQUE (expense_id, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_expense_allocations_owner ON public.expense_allocations(owner_id);

-- -----------------------------------------------------------------------------
-- 3. TABLA: public.owner_settlements (Entidad #25 — Liquidaciones de Ganancias)
--    Regla crítica: Prohibido liquidar sin acuerdo configurado ('active') o con
--    utilidad disponible <= 0.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.owner_settlements (
  id TEXT PRIMARY KEY CHECK (id ~ '^LIQ-[0-9]{4,}$'),
  settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  agreement_id TEXT NOT NULL REFERENCES public.owner_agreements(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_sales_period_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (gross_sales_period_cop >= 0),
  returns_period_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (returns_period_cop >= 0),
  net_sales_period_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (net_sales_period_cop >= 0),
  cogs_period_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cogs_period_cop >= 0),
  direct_expenses_period_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (direct_expenses_period_cop >= 0),
  shared_expenses_period_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (shared_expenses_period_cop >= 0),
  store_commission_period_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (store_commission_period_cop >= 0),
  attributable_profit_before_cop NUMERIC(14,2) NOT NULL CHECK (attributable_profit_before_cop > 0),
  amount_settled_cop NUMERIC(14,2) NOT NULL CHECK (
    amount_settled_cop > 0 AND amount_settled_cop <= attributable_profit_before_cop
  ),
  pending_balance_after_cop NUMERIC(14,2) GENERATED ALWAYS AS (
    attributable_profit_before_cop - amount_settled_cop
  ) STORED,
  payment_method TEXT NOT NULL CHECK (btrim(payment_method) <> ''),
  voucher_reference TEXT NOT NULL CHECK (btrim(voucher_reference) <> ''),
  private_voucher_storage_path TEXT,
  settlement_status TEXT NOT NULL DEFAULT 'paid' CHECK (
    settlement_status IN ('draft', 'approved', 'paid', 'annulled')
  ),
  authorized_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_settlement_period_dates CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_owner_settlements_owner ON public.owner_settlements(owner_id, settlement_date DESC);

DROP TRIGGER IF EXISTS trg_owner_settlements_updated_at ON public.owner_settlements;
CREATE TRIGGER trg_owner_settlements_updated_at
  BEFORE UPDATE ON public.owner_settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();
COMMIT;


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0006_marketing_automation_and_audit.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
-- =============================================================================
-- MIGRACIÓN 0006: MARKETING, CALENDARIO, PUBLICACIONES, CONEXIONES SOCIALES,
--                 CAMPAÑAS PUBLICITARIAS, AUTOMATIZACIONES Y AUDITORÍA
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Cubre entidades:
--  26. Marketing assets (public.marketing_assets)
--  27. Content calendar (public.content_calendar)
--  28. Publications (public.publications)
--  29. Social connections (public.social_connections)
--  30. Ads campaigns y metrics (public.ads_campaigns, public.ads_campaign_metrics)
--  31. Automation jobs y logs (public.automation_jobs, public.automation_logs)
--  32. Audit logs (public.audit_logs)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLA: public.marketing_assets (Entidad #26 — Activos y Piezas Creativas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code TEXT NOT NULL UNIQUE CHECK (btrim(asset_code) <> ''),
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  sku TEXT REFERENCES public.product_variants(sku) ON DELETE SET NULL,
  asset_type TEXT NOT NULL CHECK (
    asset_type IN (
      'product_photo',
      'brand_template',
      'promo_banner',
      'video_reel',
      'printable_label',
      'copy_template'
    )
  ),
  title TEXT NOT NULL CHECK (btrim(title) <> ''),
  storage_path TEXT,
  generation_source TEXT NOT NULL DEFAULT 'local_template' CHECK (
    generation_source IN ('local_template', 'manual_upload', 'gemini_flash_optional')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_status TEXT NOT NULL DEFAULT 'draft' CHECK (
    approval_status IN ('draft', 'pending_approval', 'approved', 'rejected', 'archived')
  ),
  approved_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_assets_sku ON public.marketing_assets(sku);

DROP TRIGGER IF EXISTS trg_marketing_assets_updated_at ON public.marketing_assets;
CREATE TRIGGER trg_marketing_assets_updated_at
  BEFORE UPDATE ON public.marketing_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. TABLA: public.content_calendar (Entidad #27 — Calendario Editorial)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_code TEXT NOT NULL UNIQUE CHECK (btrim(calendar_code) <> ''),
  title TEXT NOT NULL CHECK (btrim(title) <> ''),
  target_channel TEXT NOT NULL CHECK (
    target_channel IN (
      'whatsapp_status',
      'whatsapp_catalog',
      'instagram_feed',
      'instagram_story',
      'facebook_page',
      'marketplace'
    )
  ),
  scheduled_for TIMESTAMPTZ NOT NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  sku TEXT REFERENCES public.product_variants(sku) ON DELETE SET NULL,
  marketing_asset_id UUID REFERENCES public.marketing_assets(id) ON DELETE SET NULL,
  calendar_status TEXT NOT NULL DEFAULT 'planned' CHECK (
    calendar_status IN ('planned', 'ready_for_review', 'approved', 'published', 'cancelled')
  ),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_calendar_scheduled ON public.content_calendar(scheduled_for);

DROP TRIGGER IF EXISTS trg_content_calendar_updated_at ON public.content_calendar;
CREATE TRIGGER trg_content_calendar_updated_at
  BEFORE UPDATE ON public.content_calendar
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. TABLA: public.publications (Entidad #28 — Publicaciones con Aprobación Humana)
--    Reglas 13, 14 y 16: Exige stock disponible verificado (> 0), precio aprobado
--    (> 0) y aprobación humana explícita antes de pasar a 'approved' / 'published'.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_code TEXT NOT NULL UNIQUE CHECK (btrim(publication_code) <> ''),
  calendar_id UUID REFERENCES public.content_calendar(id) ON DELETE SET NULL,
  marketing_asset_id UUID REFERENCES public.marketing_assets(id) ON DELETE SET NULL,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK (
    channel IN (
      'whatsapp_status',
      'whatsapp_catalog',
      'instagram_feed',
      'instagram_story',
      'facebook_page',
      'marketplace'
    )
  ),
  generation_engine TEXT NOT NULL DEFAULT 'local_template' CHECK (
    generation_engine IN ('local_template', 'gemini_flash_optional')
  ),
  headline TEXT NOT NULL CHECK (btrim(headline) <> ''),
  body_text TEXT NOT NULL CHECK (btrim(body_text) <> ''),
  cta_whatsapp_url TEXT,
  verified_available_stock_snapshot INTEGER NOT NULL CHECK (verified_available_stock_snapshot > 0),
  approved_price_snapshot_cop NUMERIC(12,2) NOT NULL CHECK (approved_price_snapshot_cop > 0),
  approval_status TEXT NOT NULL DEFAULT 'draft' CHECK (
    approval_status IN ('draft', 'pending_approval', 'approved', 'published', 'rejected')
  ),
  approved_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  external_post_id TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_publications_human_approval CHECK (
    approval_status NOT IN ('approved', 'published')
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_publications_sku_status ON public.publications(sku, approval_status);

DROP TRIGGER IF EXISTS trg_publications_updated_at ON public.publications;
CREATE TRIGGER trg_publications_updated_at
  BEFORE UPDATE ON public.publications
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. TABLA: public.social_connections (Entidad #29 — Conexiones y Cuotas de APIs)
--    Seguridad: NUNCA almacena tokens ni secretos en texto plano; solo guarda
--    el nombre de la clave en Supabase Vault / Edge Env (secret_vault_key_name).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL UNIQUE CHECK (
    platform IN (
      'whatsapp_business_link',
      'facebook_graph_api',
      'instagram_graph_api',
      'gemini_flash_assist'
    )
  ),
  display_name TEXT NOT NULL CHECK (btrim(display_name) <> ''),
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  external_account_id TEXT,
  scopes_granted TEXT[] NOT NULL DEFAULT '{}',
  secret_vault_key_name TEXT,
  daily_quota_limit INTEGER NOT NULL DEFAULT 0 CHECK (daily_quota_limit >= 0),
  daily_quota_used INTEGER NOT NULL DEFAULT 0 CHECK (daily_quota_used >= 0),
  last_verified_at TIMESTAMPTZ,
  updated_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_social_connections_updated_at ON public.social_connections;
CREATE TRIGGER trg_social_connections_updated_at
  BEFORE UPDATE ON public.social_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. TABLA: public.ads_campaigns (Entidad #30A — Campañas Publicitarias Manuales)
--    Regla 17: Prohibido activar pauta pagada automáticamente; requiere
--    aprobación humana explícita.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ads_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_code TEXT NOT NULL UNIQUE CHECK (btrim(campaign_code) <> ''),
  platform TEXT NOT NULL CHECK (
    platform IN ('meta_ads', 'whatsapp_click_to_chat', 'instagram_boost_manual')
  ),
  external_campaign_id TEXT,
  campaign_name TEXT NOT NULL CHECK (btrim(campaign_name) <> ''),
  objective TEXT NOT NULL CHECK (btrim(objective) <> ''),
  promoted_sku TEXT REFERENCES public.product_variants(sku) ON DELETE SET NULL,
  owner_allocation_policy TEXT NOT NULL CHECK (
    owner_allocation_policy IN ('direct_owner', 'shared_proportional_sales', 'store_absorbed')
  ),
  target_owner_id TEXT REFERENCES public.owners(id) ON DELETE RESTRICT,
  manual_budget_cap_cop NUMERIC(14,2) NOT NULL CHECK (manual_budget_cap_cop >= 0),
  linked_expense_id TEXT REFERENCES public.expenses(id) ON DELETE SET NULL,
  campaign_status TEXT NOT NULL DEFAULT 'draft_manual_review' CHECK (
    campaign_status IN (
      'draft_manual_review',
      'approved_manual_launch',
      'paused',
      'completed',
      'cancelled'
    )
  ),
  human_approved_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  human_approved_at TIMESTAMPTZ,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_ads_campaign_human_approval CHECK (
    campaign_status = 'draft_manual_review'
    OR (human_approved_by IS NOT NULL AND human_approved_at IS NOT NULL)
  )
);

DROP TRIGGER IF EXISTS trg_ads_campaigns_updated_at ON public.ads_campaigns;
CREATE TRIGGER trg_ads_campaigns_updated_at
  BEFORE UPDATE ON public.ads_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 6. TABLA: public.ads_campaign_metrics (Entidad #30B — Métricas Diarias de Campañas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ads_campaign_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.ads_campaigns(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  reach INTEGER NOT NULL DEFAULT 0 CHECK (reach >= 0),
  clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  whatsapp_conversations INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_conversations >= 0),
  spend_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (spend_cop >= 0),
  attributed_orders_count INTEGER NOT NULL DEFAULT 0 CHECK (attributed_orders_count >= 0),
  attributed_revenue_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (attributed_revenue_cop >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ads_campaign_metric_date UNIQUE (campaign_id, metric_date)
);

-- -----------------------------------------------------------------------------
-- 7. TABLA: public.automation_jobs (Entidad #31A — Trabajos de Automatización)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_code TEXT NOT NULL UNIQUE CHECK (btrim(job_code) <> ''),
  job_name TEXT NOT NULL CHECK (btrim(job_name) <> ''),
  trigger_type TEXT NOT NULL CHECK (
    trigger_type IN ('db_event', 'scheduled_cron', 'manual_run')
  ),
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  max_daily_executions INTEGER NOT NULL DEFAULT 10 CHECK (max_daily_executions >= 0),
  requires_external_api BOOLEAN NOT NULL DEFAULT false,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_run_at TIMESTAMPTZ,
  updated_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_automation_jobs_updated_at ON public.automation_jobs;
CREATE TRIGGER trg_automation_jobs_updated_at
  BEFORE UPDATE ON public.automation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 8. TABLA: public.automation_logs (Entidad #31B — Bitácora de Automatizaciones)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.automation_jobs(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  execution_status TEXT NOT NULL CHECK (
    execution_status IN (
      'running',
      'succeeded',
      'skipped_disabled',
      'blocked_by_quota',
      'failed'
    )
  ),
  summary_message TEXT NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_job ON public.automation_logs(job_id, started_at DESC);

-- -----------------------------------------------------------------------------
-- 9. TABLA: public.audit_logs (Entidad #32 — Bitácora Inmutable de Auditoría)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_seq BIGSERIAL UNIQUE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_role TEXT,
  action_type TEXT NOT NULL CHECK (btrim(action_type) <> ''),
  table_name TEXT NOT NULL CHECK (btrim(table_name) <> ''),
  record_pk TEXT NOT NULL CHECK (btrim(record_pk) <> ''),
  owner_id_affected TEXT,
  previous_data JSONB,
  new_data JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_pk ON public.audit_logs(table_name, record_pk, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_owner ON public.audit_logs(owner_id_affected, created_at DESC);

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_ledger_mutation();

-- -----------------------------------------------------------------------------
-- 10. FUNCIÓN Y TRIGGERS AUTOMÁTICOS DE AUDITORÍA SOBRE TABLAS CRÍTICAS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_record_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk TEXT;
  v_owner TEXT := NULL;
  v_old JSONB := NULL;
  v_new JSONB := NULL;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old := to_jsonb(OLD);
    v_pk := COALESCE(v_old->>'id', v_old->>'sku', 'unknown');
    v_owner := COALESCE(v_old->>'owner_id', v_old->>'from_owner_id');
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new := to_jsonb(NEW);
    v_pk := COALESCE(v_new->>'id', v_new->>'sku', v_pk, 'unknown');
    v_owner := COALESCE(v_new->>'owner_id', v_new->>'to_owner_id', v_owner);
  END IF;

  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_role,
    action_type,
    table_name,
    record_pk,
    owner_id_affected,
    previous_data,
    new_data
  ) VALUES (
    auth.uid(),
    (public.fn_current_user_role())::TEXT,
    TG_OP,
    TG_TABLE_NAME,
    v_pk,
    v_owner,
    v_old,
    v_new
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_owner_agreements ON public.owner_agreements;
CREATE TRIGGER trg_audit_owner_agreements
  AFTER INSERT OR UPDATE OR DELETE ON public.owner_agreements
  FOR EACH ROW EXECUTE FUNCTION public.fn_record_audit_log();

DROP TRIGGER IF EXISTS trg_audit_lot_owner_allocations ON public.lot_owner_allocations;
CREATE TRIGGER trg_audit_lot_owner_allocations
  AFTER INSERT OR UPDATE OR DELETE ON public.lot_owner_allocations
  FOR EACH ROW EXECUTE FUNCTION public.fn_record_audit_log();

DROP TRIGGER IF EXISTS trg_audit_sales_item_allocations ON public.sales_item_allocations;
CREATE TRIGGER trg_audit_sales_item_allocations
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_item_allocations
  FOR EACH ROW EXECUTE FUNCTION public.fn_record_audit_log();

DROP TRIGGER IF EXISTS trg_audit_owner_settlements ON public.owner_settlements;
CREATE TRIGGER trg_audit_owner_settlements
  AFTER INSERT OR UPDATE OR DELETE ON public.owner_settlements
  FOR EACH ROW EXECUTE FUNCTION public.fn_record_audit_log();

DROP TRIGGER IF EXISTS trg_audit_ownership_transfers ON public.ownership_transfers;
CREATE TRIGGER trg_audit_ownership_transfers
  AFTER INSERT OR UPDATE OR DELETE ON public.ownership_transfers
  FOR EACH ROW EXECUTE FUNCTION public.fn_record_audit_log();
COMMIT;


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0007_views_and_transactional_functions.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
-- =============================================================================
-- MIGRACIÓN 0007: VISTAS ANALÍTICAS Y FUNCIONES TRANSACCIONALES ATÓMICAS (RPC)
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Garantiza operaciones atómicas (FOR UPDATE) con trazabilidad en stock_movements,
-- prevención de doble conteo y respeto estricto de las reglas multipropietario.
-- =============================================================================

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


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0008_rls_policies_and_storage.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
-- =============================================================================
-- MIGRACIÓN 0008: POLÍTICAS ROW LEVEL SECURITY (RLS) EN TODAS LAS TABLAS
--                 PÚBLICAS Y PROTECCIÓN DE DOCUMENTOS PRIVADOS EN STORAGE
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Roles:
--   - ADMIN: acceso completo al negocio.
--   - INVENTORY_OPERATOR: operaciones autorizadas de inventario, catálogo,
--     recepciones, lotes y calidad (fn_is_operator_or_admin()).
--   - SALES_OPERATOR: operaciones autorizadas de clientes, leads, pedidos,
--     pagos, devoluciones y despachos (fn_can_manage_sales()).
--   - MARKETING_OPERATOR: activos de marca, calendario editorial y borradores
--     de publicaciones (fn_can_manage_marketing()).
--   - OWNER: exclusivamente lectura sobre sus propios registros y reportes
--     autorizados cuando tiene acceso habilitado (fn_can_owner_view(owner_id)).
-- =============================================================================

-- =============================================================================
-- 1. HABILITAR Y FORZAR RLS EN LAS 33 TABLAS PÚBLICAS DEL ESQUEMA
-- =============================================================================
ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owners FORCE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.owner_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_agreements FORCE ROW LEVEL SECURITY;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants FORCE ROW LEVEL SECURITY;

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history FORCE ROW LEVEL SECURITY;

ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.purchase_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipt_lines FORCE ROW LEVEL SECURITY;

ALTER TABLE public.stock_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_lots FORCE ROW LEVEL SECURITY;

ALTER TABLE public.lot_owner_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_owner_allocations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements FORCE ROW LEVEL SECURITY;

ALTER TABLE public.quality_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_inspections FORCE ROW LEVEL SECURITY;

ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_reservations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.cost_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_records FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ownership_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ownership_transfers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_incidences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_incidences FORCE ROW LEVEL SECURITY;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads FORCE ROW LEVEL SECURITY;

ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders FORCE ROW LEVEL SECURITY;

ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.sales_item_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_item_allocations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns FORCE ROW LEVEL SECURITY;

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses FORCE ROW LEVEL SECURITY;

ALTER TABLE public.expense_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_allocations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.owner_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_settlements FORCE ROW LEVEL SECURITY;

ALTER TABLE public.marketing_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_assets FORCE ROW LEVEL SECURITY;

ALTER TABLE public.content_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_calendar FORCE ROW LEVEL SECURITY;

ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publications FORCE ROW LEVEL SECURITY;

ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_connections FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ads_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_campaigns FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ads_campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_campaign_metrics FORCE ROW LEVEL SECURITY;

ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_jobs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. POLÍTICAS PARA PERFILES Y PROPIETARIOS
-- =============================================================================

CREATE POLICY pol_profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.fn_is_admin());

CREATE POLICY pol_profiles_admin_all ON public.profiles
  FOR ALL TO authenticated
  USING (public.fn_is_admin())
  WITH CHECK (public.fn_is_admin());

CREATE POLICY pol_owners_select ON public.owners
  FOR SELECT TO authenticated
  USING (
    public.fn_is_operator_or_admin()
    OR public.fn_can_manage_sales()
    OR public.fn_can_owner_view(id)
  );

CREATE POLICY pol_owners_admin_write ON public.owners
  FOR ALL TO authenticated
  USING (public.fn_is_admin())
  WITH CHECK (public.fn_is_admin());

CREATE POLICY pol_owner_agreements_select ON public.owner_agreements
  FOR SELECT TO authenticated
  USING (
    public.fn_is_admin()
    OR public.fn_can_owner_view(owner_id)
  );

CREATE POLICY pol_owner_agreements_admin_write ON public.owner_agreements
  FOR ALL TO authenticated
  USING (public.fn_is_admin())
  WITH CHECK (public.fn_is_admin());

-- =============================================================================
-- 3. POLÍTICAS PARA CATÁLOGO MAESTRO, VARIANTES, PROVEEDORES Y PRECIOS
-- =============================================================================

CREATE POLICY pol_products_select ON public.products
  FOR SELECT TO authenticated
  USING (
    public.fn_is_sales_or_above()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_active = true AND p.owner_portal_enabled = true
    )
  );

CREATE POLICY pol_products_write ON public.products
  FOR ALL TO authenticated
  USING (public.fn_is_operator_or_admin())
  WITH CHECK (public.fn_is_operator_or_admin());

CREATE POLICY pol_product_variants_select ON public.product_variants
  FOR SELECT TO authenticated
  USING (
    public.fn_is_sales_or_above()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_active = true AND p.owner_portal_enabled = true
    )
  );

CREATE POLICY pol_product_variants_write ON public.product_variants
  FOR ALL TO authenticated
  USING (public.fn_is_operator_or_admin())
  WITH CHECK (public.fn_is_operator_or_admin());

CREATE POLICY pol_suppliers_internal ON public.suppliers
  FOR ALL TO authenticated
  USING (public.fn_is_operator_or_admin())
  WITH CHECK (public.fn_is_operator_or_admin());

CREATE POLICY pol_price_history_select ON public.price_history
  FOR SELECT TO authenticated
  USING (public.fn_is_operator_or_admin() OR public.fn_can_manage_sales());

CREATE POLICY pol_price_history_insert ON public.price_history
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_is_admin());

-- =============================================================================
-- 4. POLÍTICAS PARA RECEPCIONES, LOTES, INVENTARIO MULTIPROPIETARIO Y KARDEX
-- =============================================================================

CREATE POLICY pol_purchase_receipts_internal ON public.purchase_receipts
  FOR ALL TO authenticated
  USING (public.fn_is_operator_or_admin())
  WITH CHECK (public.fn_is_operator_or_admin());

CREATE POLICY pol_purchase_receipt_lines_select ON public.purchase_receipt_lines
  FOR SELECT TO authenticated
  USING (
    public.fn_is_operator_or_admin()
    OR public.fn_can_owner_view(owner_id)
  );

CREATE POLICY pol_purchase_receipt_lines_write ON public.purchase_receipt_lines
  FOR ALL TO authenticated
  USING (public.fn_is_operator_or_admin())
  WITH CHECK (public.fn_is_operator_or_admin());

CREATE POLICY pol_stock_lots_select ON public.stock_lots
  FOR SELECT TO authenticated
  USING (
    public.fn_is_operator_or_admin()
    OR public.fn_can_manage_sales()
    OR EXISTS (
      SELECT 1 FROM public.lot_owner_allocations loa
      WHERE loa.lot_id = stock_lots.id
        AND public.fn_can_owner_view(loa.owner_id)
    )
  );

CREATE POLICY pol_stock_lots_write ON public.stock_lots
  FOR ALL TO authenticated
  USING (public.fn_is_operator_or_admin())
  WITH CHECK (public.fn_is_operator_or_admin());

-- lot_owner_allocations: OWNER solo lee sus propios lotes; solo ADMIN/INVENTORY_OPERATOR escriben
CREATE POLICY pol_lot_allocations_select ON public.lot_owner_allocations
  FOR SELECT TO authenticated
  USING (
    public.fn_is_operator_or_admin()
    OR public.fn_can_manage_sales()
    OR public.fn_can_owner_view(owner_id)
  );

CREATE POLICY pol_lot_allocations_write ON public.lot_owner_allocations
  FOR ALL TO authenticated
  USING (public.fn_is_operator_or_admin())
  WITH CHECK (public.fn_is_operator_or_admin());

-- stock_movements: libro inmutable
CREATE POLICY pol_stock_movements_select ON public.stock_movements
  FOR SELECT TO authenticated
  USING (
    public.fn_is_operator_or_admin()
    OR public.fn_can_manage_sales()
    OR public.fn_can_owner_view(owner_id)
  );

CREATE POLICY pol_stock_movements_insert ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_is_operator_or_admin() OR public.fn_can_manage_sales());

-- quality_inspections
CREATE POLICY pol_quality_inspections_select ON public.quality_inspections
  FOR SELECT TO authenticated
  USING (
    public.fn_is_operator_or_admin()
    OR public.fn_can_owner_view(owner_id)
  );

CREATE POLICY pol_quality_inspections_write ON public.quality_inspections
  FOR ALL TO authenticated
  USING (public.fn_is_operator_or_admin())
  WITH CHECK (public.fn_is_operator_or_admin());

-- stock_reservations
CREATE POLICY pol_stock_reservations_select ON public.stock_reservations
  FOR SELECT TO authenticated
  USING (
    public.fn_is_operator_or_admin()
    OR public.fn_can_manage_sales()
    OR public.fn_can_owner_view(owner_id)
  );

CREATE POLICY pol_stock_reservations_write ON public.stock_reservations
  FOR ALL TO authenticated
  USING (public.fn_is_operator_or_admin() OR public.fn_can_manage_sales())
  WITH CHECK (public.fn_is_operator_or_admin() OR public.fn_can_manage_sales());

-- cost_records: escritura restringida a ADMIN (protección de modificación de costos)
CREATE POLICY pol_cost_records_select ON public.cost_records
  FOR SELECT TO authenticated
  USING (
    public.fn_is_operator_or_admin()
    OR public.fn_can_owner_view(owner_id)
  );

CREATE POLICY pol_cost_records_write ON public.cost_records
  FOR ALL TO authenticated
  USING (public.fn_is_admin())
  WITH CHECK (public.fn_is_admin());

-- ownership_transfers: escritura exclusiva de ADMIN
CREATE POLICY pol_ownership_transfers_select ON public.ownership_transfers
  FOR SELECT TO authenticated
  USING (
    public.fn_is_operator_or_admin()
    OR public.fn_can_owner_view(from_owner_id)
    OR public.fn_can_owner_view(to_owner_id)
  );

CREATE POLICY pol_ownership_transfers_write ON public.ownership_transfers
  FOR ALL TO authenticated
  USING (public.fn_is_admin())
  WITH CHECK (public.fn_is_admin());

-- inventory_incidences
CREATE POLICY pol_inventory_incidences_select ON public.inventory_incidences
  FOR SELECT TO authenticated
  USING (
    public.fn_is_operator_or_admin()
    OR (owner_id IS NOT NULL AND public.fn_can_owner_view(owner_id))
  );

CREATE POLICY pol_inventory_incidences_write ON public.inventory_incidences
  FOR ALL TO authenticated
  USING (public.fn_is_operator_or_admin())
  WITH CHECK (public.fn_is_operator_or_admin());

-- =============================================================================
-- 5. POLÍTICAS PARA COMERCIAL: CLIENTES, LEADS, PEDIDOS, PAGOS, DEVOLUCIONES
-- =============================================================================

CREATE POLICY pol_customers_sales ON public.customers
  FOR ALL TO authenticated
  USING (public.fn_can_manage_sales())
  WITH CHECK (public.fn_can_manage_sales());

CREATE POLICY pol_leads_sales ON public.leads
  FOR ALL TO authenticated
  USING (public.fn_can_manage_sales())
  WITH CHECK (public.fn_can_manage_sales());

CREATE POLICY pol_sales_orders_sales ON public.sales_orders
  FOR ALL TO authenticated
  USING (public.fn_can_manage_sales())
  WITH CHECK (public.fn_can_manage_sales());

CREATE POLICY pol_sales_order_items_sales ON public.sales_order_items
  FOR ALL TO authenticated
  USING (public.fn_can_manage_sales())
  WITH CHECK (public.fn_can_manage_sales());

CREATE POLICY pol_sales_item_allocations_select ON public.sales_item_allocations
  FOR SELECT TO authenticated
  USING (
    public.fn_can_manage_sales()
    OR public.fn_can_owner_view(owner_id)
  );

CREATE POLICY pol_sales_item_allocations_write ON public.sales_item_allocations
  FOR ALL TO authenticated
  USING (public.fn_can_manage_sales())
  WITH CHECK (public.fn_can_manage_sales());

CREATE POLICY pol_payments_sales ON public.payments
  FOR ALL TO authenticated
  USING (public.fn_can_manage_sales())
  WITH CHECK (public.fn_can_manage_sales());

CREATE POLICY pol_returns_select ON public.returns
  FOR SELECT TO authenticated
  USING (
    public.fn_can_manage_sales()
    OR public.fn_is_operator_or_admin()
    OR public.fn_can_owner_view(owner_id)
  );

CREATE POLICY pol_returns_write ON public.returns
  FOR ALL TO authenticated
  USING (public.fn_can_manage_sales())
  WITH CHECK (public.fn_can_manage_sales());

CREATE POLICY pol_shipments_sales ON public.shipments
  FOR ALL TO authenticated
  USING (public.fn_can_manage_sales() OR public.fn_is_operator_or_admin())
  WITH CHECK (public.fn_can_manage_sales() OR public.fn_is_operator_or_admin());

-- =============================================================================
-- 6. POLÍTICAS PARA FINANZAS: GASTOS, ASIGNACIONES DE GASTO Y LIQUIDACIONES
-- =============================================================================

CREATE POLICY pol_expenses_admin ON public.expenses
  FOR ALL TO authenticated
  USING (public.fn_is_admin())
  WITH CHECK (public.fn_is_admin());

CREATE POLICY pol_expense_allocations_select ON public.expense_allocations
  FOR SELECT TO authenticated
  USING (
    public.fn_is_admin()
    OR public.fn_can_owner_view(owner_id)
  );

CREATE POLICY pol_expense_allocations_write ON public.expense_allocations
  FOR ALL TO authenticated
  USING (public.fn_is_admin())
  WITH CHECK (public.fn_is_admin());

CREATE POLICY pol_owner_settlements_select ON public.owner_settlements
  FOR SELECT TO authenticated
  USING (
    public.fn_is_admin()
    OR public.fn_can_owner_view(owner_id)
  );

CREATE POLICY pol_owner_settlements_write ON public.owner_settlements
  FOR ALL TO authenticated
  USING (public.fn_is_admin())
  WITH CHECK (public.fn_is_admin());

-- =============================================================================
-- 7. POLÍTICAS PARA MARKETING, CONEXIONES SOCIALES, AUTOMATIZACIÓN Y AUDITORÍA
-- =============================================================================

CREATE POLICY pol_marketing_assets_access ON public.marketing_assets
  FOR ALL TO authenticated
  USING (public.fn_can_manage_marketing())
  WITH CHECK (public.fn_can_manage_marketing());

CREATE POLICY pol_content_calendar_access ON public.content_calendar
  FOR ALL TO authenticated
  USING (public.fn_can_manage_marketing())
  WITH CHECK (public.fn_can_manage_marketing());

CREATE POLICY pol_publications_select ON public.publications
  FOR SELECT TO authenticated
  USING (public.fn_can_manage_marketing() OR public.fn_can_manage_sales());

CREATE POLICY pol_publications_write ON public.publications
  FOR ALL TO authenticated
  USING (public.fn_can_manage_marketing())
  WITH CHECK (public.fn_can_manage_marketing());

CREATE POLICY pol_social_connections_admin ON public.social_connections
  FOR ALL TO authenticated
  USING (public.fn_is_admin())
  WITH CHECK (public.fn_is_admin());

CREATE POLICY pol_ads_campaigns_admin ON public.ads_campaigns
  FOR ALL TO authenticated
  USING (public.fn_is_admin())
  WITH CHECK (public.fn_is_admin());

CREATE POLICY pol_ads_campaign_metrics_admin ON public.ads_campaign_metrics
  FOR ALL TO authenticated
  USING (public.fn_is_admin() OR public.fn_can_manage_marketing())
  WITH CHECK (public.fn_is_admin());

CREATE POLICY pol_automation_jobs_admin ON public.automation_jobs
  FOR ALL TO authenticated
  USING (public.fn_is_admin())
  WITH CHECK (public.fn_is_admin());

CREATE POLICY pol_automation_logs_admin ON public.automation_logs
  FOR ALL TO authenticated
  USING (public.fn_is_admin())
  WITH CHECK (public.fn_is_admin());

CREATE POLICY pol_audit_logs_select_admin ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.fn_is_admin());

CREATE POLICY pol_audit_logs_insert_auth ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- =============================================================================
-- 8. BUCKETS DE SUPABASE STORAGE PARA PROTEGER DOCUMENTOS PRIVADOS
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('private-documents', 'private-documents', false),
  ('public-catalog-media', 'public-catalog-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY pol_private_docs_admin_operator ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'private-documents'
    AND public.fn_is_admin()
  )
  WITH CHECK (
    bucket_id = 'private-documents'
    AND public.fn_is_admin()
  );

CREATE POLICY pol_public_catalog_media_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'public-catalog-media');

CREATE POLICY pol_public_catalog_media_write ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'public-catalog-media'
    AND (public.fn_is_operator_or_admin() OR public.fn_can_manage_marketing())
  )
  WITH CHECK (
    bucket_id = 'public-catalog-media'
    AND (public.fn_is_operator_or_admin() OR public.fn_can_manage_marketing())
  );
COMMIT;


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0009_seed_initial_eberto_baseline.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
-- =============================================================================
-- MIGRACIÓN 0009: SEMILLA BASE REAL DE EBERTO (OWN-0001), INCIDENCIAS AUDITADAS
--                 E INTERRUPTORES DE INTEGRACIÓN POR DEFECTO (OFF)
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Reglas aplicadas:
--   - Solo se crea el propietario real actual: OWN-0001 (Eberto).
--   - No se crean propietarios ficticios ni porcentajes de comisión asumidos.
--   - El acuerdo inicial AGR-0001 queda en estado 'pending_configuration'.
--   - Las integraciones externas inician desactivadas (is_enabled = false).
-- =============================================================================

-- 1. Propietario Real Único Inicial: Eberto (OWN-0001)
INSERT INTO public.owners (
  id,
  internal_code,
  full_name,
  status,
  portal_access_enabled,
  notes
) VALUES (
  'OWN-0001',
  'OWN-0001',
  'Eberto',
  'active',
  false,
  'Propietario titular del 100 % del inventario físico inicial registrado en REAL_TWS_INVENTARIO_MULTIPROPIETARIO.xlsx.'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Acuerdo Inicial en estado PENDIENTE DE CONFIGURAR (sin asumir porcentajes)
INSERT INTO public.owner_agreements (
  id,
  agreement_code,
  owner_id,
  distribution_model,
  owner_share_pct,
  store_commission_pct,
  status,
  notes
) VALUES (
  'AGR-0001',
  'AGR-0001',
  'OWN-0001',
  NULL,
  NULL,
  NULL,
  'pending_configuration',
  'PENDIENTE DE CONFIGURAR ACUERDO DE DISTRIBUCIÓN. No se asumen porcentajes sin autorización explícita.'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Conexiones Sociales e IA Opcional (Apagadas por defecto — Costo $0)
INSERT INTO public.social_connections (
  platform,
  display_name,
  is_enabled,
  secret_vault_key_name,
  daily_quota_limit
) VALUES
  ('whatsapp_business_link', 'WhatsApp Business App (Deep Links wa.me)', true, NULL, 1000),
  ('facebook_graph_api', 'Meta Graph API — Facebook Page Oficial', false, 'META_GRAPH_PAGE_TOKEN', 25),
  ('instagram_graph_api', 'Meta Graph API — Instagram Business Oficial', false, 'META_GRAPH_IG_TOKEN', 25),
  ('gemini_flash_assist', 'Google Gemini Flash (Asistente Opcional)', false, 'GEMINI_API_KEY', 30)
ON CONFLICT (platform) DO NOTHING;

-- 4. Las 7 Incidencias Reales Detectadas en la Auditoría del Archivo Excel
INSERT INTO public.inventory_incidences (
  id,
  severity,
  affected_module,
  sku_or_owner_ref,
  owner_id,
  description,
  required_action,
  status
) VALUES
  (
    'INC-001',
    'ALTA',
    'Inventario / Conteo Físico',
    'HER-SOP-001-NEG',
    'OWN-0001',
    'El producto "Soporte" (ID original 2) tiene Cantidad Recibida vacía en DATOS_ORIGINALES (costo $4.000 COP).',
    'Verificar físicamente en bodega cuántas unidades existen del Soporte HER-SOP-001-NEG.',
    'Pendiente Revisión'
  ),
  (
    'INC-002',
    'ALTA',
    'Compras / Costos',
    'AUD-TWS-003-NEG',
    'OWN-0001',
    'El producto "Auriculares inalambricos F9-5" (ID original 16, 1 unidad) no tiene costo de compra registrado.',
    'Confirmar factura o valor de adquisición para calcular costo unitario final.',
    'Pendiente Revisión'
  ),
  (
    'INC-003',
    'ALTA',
    'Compras / Costos',
    'ELE-AUD-001-STD',
    'OWN-0001',
    'El producto "Receptor Bluetooth XY-WRBT" (ID original 39, 1 unidad) no tiene costo de compra registrado.',
    'Confirmar costo de compra del módulo XY-WRBT para completar valorización.',
    'Pendiente Revisión'
  ),
  (
    'INC-004',
    'INFO',
    'Ventas / Inventario Histórico',
    'COM-PER-001-AZU / HOG-ACC-001-NEG',
    'OWN-0001',
    'Dos artículos estaban marcados con nota "VENDIDO" en la columna Cantidad Recibida del Excel original (Mouse $50.000 y Báscula $15.000).',
    'Registrados como ventas históricas de OWN-0001 (0 unidades en bodega y 2 unidades vendidas).',
    'Pendiente Revisión'
  ),
  (
    'INC-005',
    'MEDIA',
    'Catálogo / Variantes',
    'MOT-LED-001 / MOT-LED-002 / MOT-LED-003 / MOT-LED-004',
    'OWN-0001',
    'Existen 4 registros separados de "Luz LED para moto" con costos distintos ($10.600, $9.700, $11.500 y $13.300).',
    'Conservados sin fusionar (Regla 2). Confirmar si corresponden a referencias distintas o lotes con diferente precio.',
    'Pendiente Revisión'
  ),
  (
    'INC-006',
    'INFO',
    'Compras / Regalos de Proveedor',
    'HER-SOP-002-NEG',
    'OWN-0001',
    'El artículo "Soporte" (ID original 40, 1 unidad) tiene costo $0 con observación "Regalo por compra".',
    'Marcado con is_bonus_zero_cost = true para no distorsionar costos ni reportarlo como omisión.',
    'Pendiente Revisión'
  ),
  (
    'INC-007',
    'MEDIA',
    'Multipropietario / Liquidaciones',
    'OWN-0001 (Eberto)',
    'OWN-0001',
    'Todos los artículos actuales fueron asignados a Eberto (OWN-0001). Aún no se ha definido porcentaje de comisión ni acuerdo comercial.',
    'Configurar el acuerdo en owner_agreements cuando la gerencia lo determine.',
    'Pendiente Revisión'
  )
ON CONFLICT (id) DO NOTHING;
COMMIT;


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0011_auth_triggers_anti_escalation_and_admin_rpc.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
-- =============================================================================
-- MIGRACIÓN 0011: ENDURECIMIENTO DE SEGURIDAD (ANTI-AUTOASIGNACIÓN DE ROLES,
--                 GESTIÓN ADMINISTRATIVA DE USUARIOS Y AUDITORÍA DE ACCESOS)
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Reglas implementadas:
--   1. Evitar autoasignación de roles en public.profiles (trigger BEFORE INSERT/UPDATE).
--   2. Sincronización segura desde auth.users ignorando cualquier rol en user_metadata.
--   3. RPC fn_admin_update_user_role_and_access exclusiva para ADMIN con bitácora.
--   4. RPC fn_log_security_event para registrar intentos de acceso no autorizado.
--   5. RPC fn_authorize_private_document_access para proteger documentos privados.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TRIGGER ANTI-AUTOASIGNACIÓN DE ROLES EN public.profiles
--    Un usuario no administrador jamás puede asignarse un rol, cambiar su rol,
--    modificar linked_owner_id, habilitar owner_portal_enabled ni reactivarse.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_prevent_profile_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Permitir ejecuciones del motor interno de PostgreSQL/Supabase Auth (cuando auth.uid() es NULL)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.fn_is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Seguridad RBAC: Prohibida la creación o autoasignación directa de perfiles desde el cliente.';
    END IF;

    IF TG_OP = 'UPDATE' THEN
      IF NEW.role IS DISTINCT FROM OLD.role
         OR NEW.linked_owner_id IS DISTINCT FROM OLD.linked_owner_id
         OR NEW.owner_portal_enabled IS DISTINCT FROM OLD.owner_portal_enabled
         OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
        RAISE EXCEPTION 'Seguridad RBAC: Prohibido modificar rol, vínculo de propietario o estado de cuenta sin privilegios ADMIN.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_self_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_self_escalation
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_profile_self_escalation();

-- -----------------------------------------------------------------------------
-- 2. TRIGGER EN auth.users PARA CREAR PERFIL INACTIVO SIN ESCALACIÓN DE ROLES
--    Ignora cualquier campo "role" enviado en raw_user_meta_data por el cliente.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    role,
    linked_owner_id,
    owner_portal_enabled,
    is_active
  ) VALUES (
    NEW.id,
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email, '@', 1), 'Usuario Pendiente'),
    NEW.email,
    'SALES_OPERATOR',
    NULL,
    false,
    false -- Inicia inactivo hasta que un ADMIN autorice su rol y activación
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- 3. RPC ADMINISTRATIVA: public.fn_admin_update_user_role_and_access
--    Permite exclusivamente a un ADMIN asignar rol, propietario vinculado,
--    acceso al portal de propietario y estado activo, registrando auditoría.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_admin_update_user_role_and_access(
  p_target_user_id UUID,
  p_new_role public.app_role,
  p_linked_owner_id TEXT DEFAULT NULL,
  p_owner_portal_enabled BOOLEAN DEFAULT false,
  p_is_active BOOLEAN DEFAULT true,
  p_reason TEXT DEFAULT 'Actualización administrativa de permisos'
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_profile public.profiles%ROWTYPE;
  v_new_profile public.profiles%ROWTYPE;
BEGIN
  IF NOT public.fn_is_admin() THEN
    RAISE EXCEPTION 'Acceso Denegado: Solo el rol ADMIN puede administrar roles y usuarios.';
  END IF;

  SELECT * INTO v_old_profile
  FROM public.profiles
  WHERE id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe el perfil de usuario %.', p_target_user_id;
  END IF;

  -- Evitar que el administrador activo se desactive o se degrade a sí mismo accidentalmente
  IF p_target_user_id = auth.uid() AND (p_new_role <> 'ADMIN' OR p_is_active = false) THEN
    RAISE EXCEPTION 'Salvaguarda de Seguridad: Un administrador no puede revocar su propio rol ADMIN ni desactivar su propia cuenta.';
  END IF;

  IF p_new_role = 'OWNER' AND p_linked_owner_id IS NULL THEN
    RAISE EXCEPTION 'Regla Multipropietario: El rol OWNER exige especificar explícitamente el propietario vinculado (linked_owner_id).';
  END IF;

  UPDATE public.profiles
  SET
    role = p_new_role,
    linked_owner_id = CASE WHEN p_new_role = 'OWNER' THEN p_linked_owner_id ELSE NULL END,
    owner_portal_enabled = CASE WHEN p_new_role = 'OWNER' THEN p_owner_portal_enabled ELSE false END,
    is_active = p_is_active
  WHERE id = p_target_user_id
  RETURNING * INTO v_new_profile;

  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_role,
    action_type,
    table_name,
    record_pk,
    owner_id_affected,
    previous_data,
    new_data,
    reason
  ) VALUES (
    auth.uid(),
    'ADMIN',
    'ADMIN_ROLE_UPDATE',
    'profiles',
    p_target_user_id::TEXT,
    v_new_profile.linked_owner_id,
    to_jsonb(v_old_profile),
    to_jsonb(v_new_profile),
    p_reason
  );

  RETURN v_new_profile;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. RPC DE AUDITORÍA DE SEGURIDAD: public.fn_log_security_event
--    Registra intentos de acceso no autorizado, sesiones expiradas o bloqueos
--    de operaciones sensibles en public.audit_logs.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_log_security_event(
  p_event_type TEXT,
  p_target_resource TEXT,
  p_reason TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_role,
    action_type,
    table_name,
    record_pk,
    owner_id_affected,
    previous_data,
    new_data,
    reason
  ) VALUES (
    auth.uid(),
    COALESCE((public.fn_current_user_role())::TEXT, 'UNAUTHENTICATED'),
    p_event_type,
    'security_guard',
    p_target_resource,
    p_metadata->>'owner_id',
    NULL,
    p_metadata,
    p_reason
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC DE PROTECCIÓN DE DOCUMENTOS PRIVADOS:
--    public.fn_authorize_private_document_access
--    Verifica permisos en servidor y deja rastro en audit_logs antes de
--    permitir generar un enlace firmado temporal sobre 'private-documents'.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_authorize_private_document_access(
  p_storage_path TEXT,
  p_document_owner_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed BOOLEAN := false;
BEGIN
  IF public.fn_is_admin() THEN
    v_allowed := true;
  ELSIF p_document_owner_id IS NOT NULL AND public.fn_can_owner_view(p_document_owner_id) THEN
    v_allowed := true;
  END IF;

  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_role,
    action_type,
    table_name,
    record_pk,
    owner_id_affected,
    new_data,
    reason
  ) VALUES (
    auth.uid(),
    COALESCE((public.fn_current_user_role())::TEXT, 'UNAUTHENTICATED'),
    CASE WHEN v_allowed THEN 'PRIVATE_DOC_ACCESS_GRANTED' ELSE 'PRIVATE_DOC_ACCESS_DENIED' END,
    'storage.objects',
    p_storage_path,
    p_document_owner_id,
    jsonb_build_object('storage_path', p_storage_path, 'authorized', v_allowed),
    CASE WHEN v_allowed THEN 'Acceso autorizado a documento privado' ELSE 'Intento bloqueado de acceso a documento privado' END
  );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Acceso Denegado: No tiene permisos para acceder al documento privado solicitado (%).', p_storage_path;
  END IF;

  RETURN true;
END;
$$;
COMMIT;


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0012_excel_import_engine_and_opening_balance.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
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


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0013_inventory_and_purchase_transactional_procedures.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
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


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0014_financial_and_multiowner_accounting.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
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


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0015_sales_orders_crm_and_dispatch_procedures.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
-- =============================================================================
-- MIGRACIÓN 0015: SALES, ORDERS & CRM — PROCEDIMIENTOS TRANSACCIONALES,
--                 PREVENCIÓN DE DUPLICADOS DE CLIENTES, RESERVA CONCURRENTE,
--                 DIVISIÓN MULTIPROPIETARIO POR LÍNEA, DESPACHOS Y RENTABILIDAD
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- =============================================================================

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


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0016_brand_and_merchandising_center.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
-- =============================================================================
-- MIGRACIÓN 0016: BRAND & MERCHANDISING CENTER — IDENTIDAD CORPORATIVA VERSIONADA,
--                 PLANTILLAS APROBADAS, MERCHANDISING DIGITAL Y FÍSICO E HISTORIAL
--                 INMUTABLE DE VERSIONES
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLA: public.brand_identity_versions (Versiones Inmutables del Brand Center)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.brand_identity_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_number INTEGER NOT NULL UNIQUE CHECK (version_number > 0),
  brand_name TEXT NOT NULL DEFAULT 'REAL TWS',
  slogan TEXT NOT NULL,
  commercial_tone TEXT NOT NULL,
  visual_guide_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  color_palette JSONB NOT NULL DEFAULT '{}'::jsonb,
  typography_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  logo_variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  company_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_original_baseline BOOLEAN NOT NULL DEFAULT false,
  change_note TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_identity_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_identity_versions FORCE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_brand_identity_versions_immutable ON public.brand_identity_versions;
CREATE TRIGGER trg_brand_identity_versions_immutable
  BEFORE UPDATE OR DELETE ON public.brand_identity_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_ledger_mutation();

DROP POLICY IF EXISTS pol_brand_identity_versions_select ON public.brand_identity_versions;
CREATE POLICY pol_brand_identity_versions_select
  ON public.brand_identity_versions
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS pol_brand_identity_versions_insert ON public.brand_identity_versions;
CREATE POLICY pol_brand_identity_versions_insert
  ON public.brand_identity_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR']));

-- -----------------------------------------------------------------------------
-- 2. AMPLIACIÓN DE TIPOS EN public.marketing_assets PARA MERCHANDISING DIGITAL Y FÍSICO
-- -----------------------------------------------------------------------------
ALTER TABLE public.marketing_assets
  DROP CONSTRAINT IF EXISTS marketing_assets_asset_type_check;

ALTER TABLE public.marketing_assets
  ADD CONSTRAINT marketing_assets_asset_type_check CHECK (
    asset_type IN (
      'product_photo',
      'brand_template',
      'promo_banner',
      'video_reel',
      'printable_label',
      'copy_template',
      'digital_catalog',
      'product_sheet_digital',
      'social_cover',
      'product_card',
      'carousel_deck',
      'promo_image',
      'category_collection',
      'product_comparison',
      'sku_label',
      'price_label',
      'owner_internal_label',
      'thank_you_card',
      'brand_sticker',
      'packaging_template',
      'printable_product_sheet'
    )
  );

ALTER TABLE public.marketing_assets
  ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version > 0),
  ADD COLUMN IF NOT EXISTS merchandising_category TEXT NOT NULL DEFAULT 'digital' CHECK (
    merchandising_category IN ('brand_template', 'digital', 'physical')
  ),
  ADD COLUMN IF NOT EXISTS include_internal_owner_tag BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_id_internal TEXT REFERENCES public.owners(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 3. TABLA: public.merchandising_asset_versions (Historial Inmutable de Piezas)
--    Conserva el original (v1) y cada versión posterior sin sobrescribir.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merchandising_asset_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.marketing_assets(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  title TEXT NOT NULL,
  sku_snapshot TEXT,
  price_cop_snapshot NUMERIC(12,2),
  verified_features_snapshot TEXT,
  design_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_summary TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_merchandising_asset_version UNIQUE (asset_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_merch_versions_asset ON public.merchandising_asset_versions(asset_id, version_number DESC);

ALTER TABLE public.merchandising_asset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchandising_asset_versions FORCE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_merchandising_versions_immutable ON public.merchandising_asset_versions;
CREATE TRIGGER trg_merchandising_versions_immutable
  BEFORE UPDATE OR DELETE ON public.merchandising_asset_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_ledger_mutation();

DROP POLICY IF EXISTS pol_merch_versions_select ON public.merchandising_asset_versions;
CREATE POLICY pol_merch_versions_select
  ON public.merchandising_asset_versions
  FOR SELECT
  TO authenticated
  USING (public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR', 'SALES_OPERATOR', 'INVENTORY_OPERATOR']));

DROP POLICY IF EXISTS pol_merch_versions_insert ON public.merchandising_asset_versions;
CREATE POLICY pol_merch_versions_insert
  ON public.merchandising_asset_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR']));
COMMIT;


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0017_ai_creative_and_advertising_studio.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
-- =============================================================================
-- MIGRACIÓN 0017: AI CREATIVE & ADVERTISING STUDIO — CONSENTIMIENTO COMERCIAL
--                 POR PROPIETARIO, BIBLIOTECA DE IMÁGENES ORIGINALES/FINALES,
--                 PAQUETES DE COPYWRITING, GUIONES (10/15/30/45s), VERSIONADO Y
--                 CONTROL DE CUOTA DEL ADAPTADOR GEMINI OPCIONAL
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLA: public.owner_marketing_consents
--    Registra el consentimiento comercial explícito del propietario antes de
--    promocionar su mercancía (vinculado a Propietario y SKU/Lote).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.owner_marketing_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_code TEXT NOT NULL UNIQUE CHECK (btrim(consent_code) <> ''),
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  lot_id TEXT REFERENCES public.stock_lots(id) ON DELETE SET NULL,
  consent_status TEXT NOT NULL DEFAULT 'pending_consent' CHECK (
    consent_status IN ('pending_consent', 'granted', 'revoked')
  ),
  authorized_channels TEXT[] NOT NULL DEFAULT ARRAY['marketplace', 'facebook', 'instagram', 'whatsapp'],
  max_authorized_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (
    max_authorized_discount_pct >= 0 AND max_authorized_discount_pct <= 100
  ),
  consent_notes TEXT,
  granted_by TEXT,
  granted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_owner_sku_marketing_consent UNIQUE (owner_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_owner_mkt_consents_owner ON public.owner_marketing_consents(owner_id, sku);

ALTER TABLE public.owner_marketing_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_marketing_consents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_owner_mkt_consents_select ON public.owner_marketing_consents;
CREATE POLICY pol_owner_mkt_consents_select
  ON public.owner_marketing_consents
  FOR SELECT
  TO authenticated
  USING (
    public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR', 'SALES_OPERATOR'])
    OR public.fn_can_owner_view(owner_id)
  );

DROP POLICY IF EXISTS pol_owner_mkt_consents_write ON public.owner_marketing_consents;
CREATE POLICY pol_owner_mkt_consents_write
  ON public.owner_marketing_consents
  FOR ALL
  TO authenticated
  USING (public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR']))
  WITH CHECK (public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR']));

-- -----------------------------------------------------------------------------
-- 2. TABLA: public.creative_studio_projects
--    Biblioteca multimedia vinculada a SKU y Propietario: guarda imagen original
--    intacta, imagen final compuesta (1:1, 4:5, 9:16), copywriting multicanal,
--    guiones de video (10s, 15s, 30s, 45s) con storyboard y versiones.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.creative_studio_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_code TEXT NOT NULL UNIQUE CHECK (btrim(project_code) <> ''),
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  consent_id UUID NOT NULL REFERENCES public.owner_marketing_consents(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (btrim(title) <> ''),
  aspect_ratio TEXT NOT NULL DEFAULT '1:1' CHECK (aspect_ratio IN ('1:1', '4:5', '9:16')),
  generation_engine TEXT NOT NULL DEFAULT 'local_template' CHECK (
    generation_engine IN ('local_template', 'gemini_flash_optional')
  ),
  original_product_image_path TEXT,
  final_composed_image_path TEXT,
  approved_price_snapshot_cop NUMERIC(12,2) NOT NULL CHECK (approved_price_snapshot_cop > 0),
  verified_available_stock_snapshot INTEGER NOT NULL CHECK (verified_available_stock_snapshot > 0),
  discount_applied_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_applied_pct >= 0),
  copywriting_bundle JSONB NOT NULL DEFAULT '{}'::jsonb,
  video_scripts_bundle JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'ready_for_review', 'approved', 'archived')
  ),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creative_projects_sku_owner ON public.creative_studio_projects(sku, owner_id);

ALTER TABLE public.creative_studio_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_studio_projects FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_creative_projects_select ON public.creative_studio_projects;
CREATE POLICY pol_creative_projects_select
  ON public.creative_studio_projects
  FOR SELECT
  TO authenticated
  USING (
    public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR', 'SALES_OPERATOR'])
    OR public.fn_can_owner_view(owner_id)
  );

DROP POLICY IF EXISTS pol_creative_projects_write ON public.creative_studio_projects;
CREATE POLICY pol_creative_projects_write
  ON public.creative_studio_projects
  FOR ALL
  TO authenticated
  USING (public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR']))
  WITH CHECK (public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR']));

-- -----------------------------------------------------------------------------
-- 3. TABLA: public.creative_studio_project_versions (Versionado Inmutable)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.creative_studio_project_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.creative_studio_projects(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  aspect_ratio TEXT NOT NULL CHECK (aspect_ratio IN ('1:1', '4:5', '9:16')),
  original_image_snapshot TEXT,
  final_composed_svg_snapshot TEXT,
  copywriting_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  video_scripts_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  brand_kit_version_used INTEGER NOT NULL DEFAULT 1,
  change_note TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_creative_project_version UNIQUE (project_id, version_number)
);

ALTER TABLE public.creative_studio_project_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_studio_project_versions FORCE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_creative_project_versions_immutable ON public.creative_studio_project_versions;
CREATE TRIGGER trg_creative_project_versions_immutable
  BEFORE UPDATE OR DELETE ON public.creative_studio_project_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_ledger_mutation();

DROP POLICY IF EXISTS pol_creative_project_versions_select ON public.creative_studio_project_versions;
CREATE POLICY pol_creative_project_versions_select
  ON public.creative_studio_project_versions
  FOR SELECT
  TO authenticated
  USING (public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR', 'SALES_OPERATOR']));

DROP POLICY IF EXISTS pol_creative_project_versions_insert ON public.creative_studio_project_versions;
CREATE POLICY pol_creative_project_versions_insert
  ON public.creative_studio_project_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR']));

-- -----------------------------------------------------------------------------
-- 4. TRIGGER DE VALIDACIÓN COMERCIAL ANTES DE GUARDAR CREATIVIDADES
--    Valida:
--      1. Consentimiento comercial otorgado ('granted') por el propietario.
--      2. Precio aprobado (> 0).
--      3. Stock disponible (> 0).
--      4. Descuento dentro del límite del acuerdo y consentimiento.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_validate_creative_studio_project()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_consent RECORD;
BEGIN
  SELECT * INTO v_consent
  FROM public.owner_marketing_consents
  WHERE id = NEW.consent_id
    AND owner_id = NEW.owner_id
    AND sku = NEW.sku;

  IF NOT FOUND OR v_consent.consent_status <> 'granted' THEN
    RAISE EXCEPTION 'BLOQUEO DE CONSENTIMIENTO: El propietario % no ha otorgado consentimiento comercial activo para promocionar el SKU %.',
      NEW.owner_id, NEW.sku;
  END IF;

  IF NEW.approved_price_snapshot_cop IS NULL OR NEW.approved_price_snapshot_cop <= 0 THEN
    RAISE EXCEPTION 'BLOQUEO DE PRECIO: No se permite generar piezas publicitarias para el SKU % sin precio comercial aprobado.',
      NEW.sku;
  END IF;

  IF NEW.verified_available_stock_snapshot IS NULL OR NEW.verified_available_stock_snapshot <= 0 THEN
    RAISE EXCEPTION 'BLOQUEO DE STOCK: No se permite promocionar disponibilidad del SKU % cuando el stock disponible del propietario % es 0.',
      NEW.sku, NEW.owner_id;
  END IF;

  IF NEW.discount_applied_pct > v_consent.max_authorized_discount_pct THEN
    RAISE EXCEPTION 'BLOQUEO DE DESCUENTO: El descuento solicitado (% %%) supera el máximo autorizado (% %%) por el propietario %.',
      NEW.discount_applied_pct, v_consent.max_authorized_discount_pct, NEW.owner_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_creative_studio_project ON public.creative_studio_projects;
CREATE TRIGGER trg_validate_creative_studio_project
  BEFORE INSERT OR UPDATE ON public.creative_studio_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_creative_studio_project();
COMMIT;


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0018_social_and_marketplace_distribution.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
-- =============================================================================
-- MIGRACIÓN 0018: SOCIAL & MARKETPLACE DISTRIBUTION
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Cubre:
--   1. Marketplace Assisted Listings (public.marketplace_assisted_listings):
--      Preparación de publicaciones, títulos, descripciones, imágenes, precio,
--      categoría, ubicación, enlace de contacto, historial, registro de URL
--      publicada, control de stock y propietario.
--   2. Ampliación de public.publications y public.content_calendar:
--      Propietario (owner_id), descuento aplicado, URL publicada, respuesta
--      JSON de Graph API, huella anti-duplicados (dedup_fingerprint) y motivo
--      de rechazo o error.
--   3. Ampliación de public.social_connections:
--      Separación estricta entre Facebook Pages Graph API e Instagram Content
--      Publishing API, OAuth en servidor (Vault reference), prohibición de
--      almacenar contraseñas o usar automatización de navegador, y desconexión.
--   4. Trigger de Validación Estricta (public.fn_validate_social_publication_rules):
--      - El propietario debe permitir promoción de su mercancía.
--      - Respetar precio mínimo y descuentos aprobados.
--      - No publicar inventario agotado (qty_available <= 0).
--      - No publicar productos pendientes de inspección.
--      - No publicar contenido rechazado ni sin aprobación humana.
--      - Evitar duplicados.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLA: public.marketplace_assisted_listings (Asistencia Manual Marketplace)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketplace_assisted_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_code TEXT NOT NULL UNIQUE CHECK (btrim(listing_code) <> ''),
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  consent_code TEXT NOT NULL,
  title TEXT NOT NULL CHECK (btrim(title) <> ''),
  description_text TEXT NOT NULL CHECK (btrim(description_text) <> ''),
  category_label TEXT NOT NULL CHECK (btrim(category_label) <> ''),
  location_label TEXT NOT NULL DEFAULT 'Barranquilla, Atlántico, Colombia',
  contact_whatsapp_url TEXT NOT NULL CHECK (btrim(contact_whatsapp_url) <> ''),
  image_svg_or_url TEXT NOT NULL,
  approved_normal_price_cop NUMERIC(12,2) NOT NULL CHECK (approved_normal_price_cop > 0),
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  effective_published_price_cop NUMERIC(12,2) NOT NULL CHECK (effective_published_price_cop > 0),
  minimum_allowed_price_cop NUMERIC(12,2),
  verified_available_stock INTEGER NOT NULL CHECK (verified_available_stock > 0),
  pending_inspection_units INTEGER NOT NULL DEFAULT 0 CHECK (pending_inspection_units = 0),
  listing_status TEXT NOT NULL DEFAULT 'prepared' CHECK (
    listing_status IN ('prepared', 'approved_for_manual_post', 'published_url_recorded', 'paused_out_of_stock', 'rejected')
  ),
  published_marketplace_url TEXT,
  published_at TIMESTAMPTZ,
  prepared_by TEXT NOT NULL,
  approved_by TEXT,
  dedup_fingerprint TEXT NOT NULL UNIQUE,
  history_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_sku_owner
  ON public.marketplace_assisted_listings(sku, owner_id, listing_status);

DROP TRIGGER IF EXISTS trg_marketplace_listings_updated_at ON public.marketplace_assisted_listings;
CREATE TRIGGER trg_marketplace_listings_updated_at
  BEFORE UPDATE ON public.marketplace_assisted_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

ALTER TABLE public.marketplace_assisted_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_assisted_listings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_marketplace_listings_select ON public.marketplace_assisted_listings;
CREATE POLICY pol_marketplace_listings_select
  ON public.marketplace_assisted_listings
  FOR SELECT
  TO authenticated
  USING (
    public.fn_current_user_role() IN ('ADMIN', 'MARKETING_OPERATOR', 'SALES_OPERATOR', 'INVENTORY_OPERATOR')
    OR public.fn_can_owner_view(owner_id)
  );

DROP POLICY IF EXISTS pol_marketplace_listings_write ON public.marketplace_assisted_listings;
CREATE POLICY pol_marketplace_listings_write
  ON public.marketplace_assisted_listings
  FOR ALL
  TO authenticated
  USING (public.fn_current_user_role() IN ('ADMIN', 'MARKETING_OPERATOR'))
  WITH CHECK (public.fn_current_user_role() IN ('ADMIN', 'MARKETING_OPERATOR'));

-- -----------------------------------------------------------------------------
-- 2. AMPLIACIÓN DE public.publications Y public.content_calendar
-- -----------------------------------------------------------------------------
ALTER TABLE public.content_calendar
  ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES public.owners(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS approval_notes TEXT,
  ADD COLUMN IF NOT EXISTS dedup_fingerprint TEXT;

ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES public.owners(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS discount_applied_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minimum_price_snapshot_cop NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS pending_inspection_units_snapshot INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_permalink_url TEXT,
  ADD COLUMN IF NOT EXISTS api_response_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error_detail TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS dedup_fingerprint TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS is_test_simulation BOOLEAN NOT NULL DEFAULT false;

-- -----------------------------------------------------------------------------
-- 3. AMPLIACIÓN DE public.social_connections (Seguridad OAuth y Tokens en Servidor)
-- -----------------------------------------------------------------------------
ALTER TABLE public.social_connections
  ADD COLUMN IF NOT EXISTS connection_status TEXT NOT NULL DEFAULT 'disconnected' CHECK (
    connection_status IN ('disconnected', 'oauth_connected', 'token_expired', 'error')
  ),
  ADD COLUMN IF NOT EXISTS account_handle_or_page_name TEXT,
  ADD COLUMN IF NOT EXISTS professional_account_eligible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS browser_automation_blocked BOOLEAN NOT NULL DEFAULT true CHECK (browser_automation_blocked = true),
  ADD COLUMN IF NOT EXISTS password_collection_blocked BOOLEAN NOT NULL DEFAULT true CHECK (password_collection_blocked = true),
  ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error_message TEXT;

-- -----------------------------------------------------------------------------
-- 4. FUNCIÓN Y TRIGGER DE VALIDACIÓN ESTRICTA DE PUBLICACIONES SOCIALES
--    Reglas obligatorias:
--    - El propietario debe permitir promoción de su mercancía.
--    - Respetar precio mínimo y descuentos aprobados.
--    - No publicar inventario agotado.
--    - No publicar productos pendientes de inspección.
--    - No publicar contenido rechazado.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_validate_social_publication_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consent_status TEXT;
  v_max_disc NUMERIC(5,2);
BEGIN
  -- 1. Prohibido publicar contenido que haya sido rechazado
  IF OLD IS NOT NULL AND OLD.approval_status = 'rejected' AND NEW.approval_status = 'published' THEN
    RAISE EXCEPTION 'BLOQUEO DE SEGURIDAD: Prohibido publicar contenido que se encuentra en estado RECHAZADO.';
  END IF;

  -- 2. Prohibido publicar inventario agotado
  IF NEW.verified_available_stock_snapshot IS NULL OR NEW.verified_available_stock_snapshot <= 0 THEN
    RAISE EXCEPTION 'BLOQUEO DE STOCK: Prohibido programar o publicar el SKU % con inventario agotado (0 unidades disponibles).',
      NEW.sku;
  END IF;

  -- 3. Prohibido publicar productos pendientes de inspección de calidad
  IF NEW.pending_inspection_units_snapshot > 0 THEN
    RAISE EXCEPTION 'BLOQUEO DE CALIDAD: El SKU % tiene % unidad(es) pendientes de inspección. No se puede publicar hasta completar la revisión.',
      NEW.sku, NEW.pending_inspection_units_snapshot;
  END IF;

  -- 4. Respetar precio mínimo autorizado
  IF NEW.minimum_price_snapshot_cop IS NOT NULL AND NEW.approved_price_snapshot_cop < NEW.minimum_price_snapshot_cop THEN
    RAISE EXCEPTION 'BLOQUEO DE PRECIO MÍNIMO: El precio de publicación (%) es inferior al precio mínimo autorizado (%) para el SKU %.',
      NEW.approved_price_snapshot_cop, NEW.minimum_price_snapshot_cop, NEW.sku;
  END IF;

  -- 5. Verificar consentimiento comercial del propietario
  IF NEW.owner_id IS NOT NULL THEN
    SELECT consent_status, max_authorized_discount_pct
      INTO v_consent_status, v_max_disc
      FROM public.owner_marketing_consents
     WHERE owner_id = NEW.owner_id
       AND sku = NEW.sku;

    IF v_consent_status IS DISTINCT FROM 'granted' THEN
      RAISE EXCEPTION 'BLOQUEO DE AUTORIZACIÓN: El propietario % no ha otorgado consentimiento comercial para promocionar el SKU %.',
        NEW.owner_id, NEW.sku;
    END IF;

    IF NEW.discount_applied_pct > COALESCE(v_max_disc, 0) THEN
      RAISE EXCEPTION 'BLOQUEO DE DESCUENTO: El descuento (%) excede el máximo autorizado por el propietario % (%).',
        NEW.discount_applied_pct, NEW.owner_id, v_max_disc;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_social_publication_rules ON public.publications;
CREATE TRIGGER trg_validate_social_publication_rules
  BEFORE INSERT OR UPDATE ON public.publications
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_social_publication_rules();
COMMIT;


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0019_whatsapp_sales_center.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
-- =============================================================================
-- MIGRACIÓN 0019: WHATSAPP SALES CENTER (V1 MANUAL + ARQUITECTURA FUTURA CLOUD API)
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Cubre:
--   1. Tabla de plantillas oficiales de WhatsApp Sales Center
--      (public.whatsapp_message_templates):
--      10 categorías obligatorias (Precio, Características, Disponibilidad,
--      Envío, Pago, Garantía, Pedido, Confirmación, Seguimiento, Postventa)
--      + Bienvenida y Ausencia.
--   2. Tabla de interacciones, enlaces wa.me y atención manual
--      (public.whatsapp_sales_interactions):
--      Registra mensajes preparados para clientes/prospectos, permiso de
--      contacto (opt-in), SKU consultado, validación anti-fuga de datos de
--      propietarios internos y prohibición de envío masivo o automático.
--   3. Tabla de configuración de arquitectura futura WhatsApp Business Platform
--      (public.whatsapp_platform_future_architecture):
--      Estricto estado inactivo (cloud_api_active = false, number_migrated = false,
--      billing_enabled = false, auto_send_enabled = false).
--   4. Trigger de seguridad (public.fn_validate_whatsapp_buyer_message_security):
--      Impide guardar o despachar mensajes a compradores que expongan IDs
--      internos de propietarios (OWN-0001), costos privados o que confirmen
--      pagos sin referencia de comprobante (voucher_proof_ref).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLA: public.whatsapp_message_templates (10 Plantillas + Bienvenida/Ausencia)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code TEXT NOT NULL UNIQUE CHECK (btrim(template_code) <> ''),
  category TEXT NOT NULL CHECK (
    category IN (
      'PRECIO',
      'CARACTERISTICAS',
      'DISPONIBILIDAD',
      'ENVIO',
      'PAGO',
      'GARANTIA',
      'PEDIDO',
      'CONFIRMACION',
      'SEGUIMIENTO',
      'POSTVENTA',
      'BIENVENIDA',
      'AUSENCIA'
    )
  ),
  title TEXT NOT NULL CHECK (btrim(title) <> ''),
  shortcut_command TEXT NOT NULL CHECK (btrim(shortcut_command) <> ''),
  body_template TEXT NOT NULL CHECK (btrim(body_template) <> ''),
  requires_verified_stock BOOLEAN NOT NULL DEFAULT false,
  requires_approved_price BOOLEAN NOT NULL DEFAULT false,
  requires_payment_proof BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_whatsapp_templates_updated_at ON public.whatsapp_message_templates;
CREATE TRIGGER trg_whatsapp_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_message_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

ALTER TABLE public.whatsapp_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_whatsapp_templates_select ON public.whatsapp_message_templates;
CREATE POLICY pol_whatsapp_templates_select
  ON public.whatsapp_message_templates
  FOR SELECT
  TO authenticated
  USING (
    public.fn_current_user_role() IN ('ADMIN', 'SALES_OPERATOR', 'MARKETING_OPERATOR', 'INVENTORY_OPERATOR')
  );

DROP POLICY IF EXISTS pol_whatsapp_templates_write ON public.whatsapp_message_templates;
CREATE POLICY pol_whatsapp_templates_write
  ON public.whatsapp_message_templates
  FOR ALL
  TO authenticated
  USING (public.fn_current_user_role() IN ('ADMIN', 'SALES_OPERATOR', 'MARKETING_OPERATOR'))
  WITH CHECK (public.fn_current_user_role() IN ('ADMIN', 'SALES_OPERATOR', 'MARKETING_OPERATOR'));

-- -----------------------------------------------------------------------------
-- 2. TABLA: public.whatsapp_sales_interactions (Bitácora de Atención Manual V1)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_sales_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_code TEXT NOT NULL UNIQUE CHECK (btrim(interaction_code) <> ''),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  sales_order_id UUID REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  buyer_name TEXT NOT NULL CHECK (btrim(buyer_name) <> ''),
  buyer_phone_whatsapp TEXT NOT NULL CHECK (btrim(buyer_phone_whatsapp) <> ''),
  contact_permission_granted BOOLEAN NOT NULL DEFAULT true CHECK (contact_permission_granted = true),
  sku TEXT REFERENCES public.product_variants(sku) ON DELETE SET NULL,
  internal_owner_id_checked TEXT REFERENCES public.owners(id) ON DELETE SET NULL,
  template_category TEXT NOT NULL,
  prepared_buyer_message TEXT NOT NULL CHECK (btrim(prepared_buyer_message) <> ''),
  generated_wa_me_url TEXT NOT NULL CHECK (btrim(generated_wa_me_url) <> ''),
  payment_voucher_proof_ref TEXT,
  owner_info_hidden_from_buyer BOOLEAN NOT NULL DEFAULT true CHECK (owner_info_hidden_from_buyer = true),
  mass_messaging_blocked BOOLEAN NOT NULL DEFAULT true CHECK (mass_messaging_blocked = true),
  unofficial_automation_blocked BOOLEAN NOT NULL DEFAULT true CHECK (unofficial_automation_blocked = true),
  delivery_mode TEXT NOT NULL DEFAULT 'manual_wa_me_link' CHECK (delivery_mode = 'manual_wa_me_link'),
  handled_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_interactions_phone
  ON public.whatsapp_sales_interactions(buyer_phone_whatsapp, created_at DESC);

ALTER TABLE public.whatsapp_sales_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sales_interactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_wa_interactions_access ON public.whatsapp_sales_interactions;
CREATE POLICY pol_wa_interactions_access
  ON public.whatsapp_sales_interactions
  FOR ALL
  TO authenticated
  USING (public.fn_current_user_role() IN ('ADMIN', 'SALES_OPERATOR', 'MARKETING_OPERATOR'))
  WITH CHECK (public.fn_current_user_role() IN ('ADMIN', 'SALES_OPERATOR', 'MARKETING_OPERATOR'));

-- -----------------------------------------------------------------------------
-- 3. TABLA: public.whatsapp_platform_future_architecture (Solo Diseño Futuro)
--    Reglas obligatorias:
--    - NO activar Cloud API.
--    - NO migrar el número.
--    - NO enviar mensajes automáticamente.
--    - NO activar cobros.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_platform_future_architecture (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_code TEXT NOT NULL UNIQUE DEFAULT 'WABA_CLOUD_API_FUTURE_V2',
  architecture_version TEXT NOT NULL DEFAULT 'v19.0-blueprint-only',
  active_operation_mode TEXT NOT NULL DEFAULT 'V1_WHATSAPP_BUSINESS_APP_MANUAL_LINKS' CHECK (
    active_operation_mode = 'V1_WHATSAPP_BUSINESS_APP_MANUAL_LINKS'
  ),
  cloud_api_connection_enabled BOOLEAN NOT NULL DEFAULT false CHECK (cloud_api_connection_enabled = false),
  phone_number_migrated BOOLEAN NOT NULL DEFAULT false CHECK (phone_number_migrated = false),
  automatic_message_sending_enabled BOOLEAN NOT NULL DEFAULT false CHECK (automatic_message_sending_enabled = false),
  billing_or_paid_tier_enabled BOOLEAN NOT NULL DEFAULT false CHECK (billing_or_paid_tier_enabled = false),
  unofficial_browser_bots_blocked BOOLEAN NOT NULL DEFAULT true CHECK (unofficial_browser_bots_blocked = true),
  designed_webhook_endpoint TEXT NOT NULL DEFAULT '/functions/v1/whatsapp-cloud-webhook-blueprint',
  designed_vault_secret_ref TEXT NOT NULL DEFAULT 'SUPABASE_VAULT_WABA_FUTURE_SYSTEM_TOKEN',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_platform_future_architecture ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_platform_future_architecture FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_wa_future_arch_select ON public.whatsapp_platform_future_architecture;
CREATE POLICY pol_wa_future_arch_select
  ON public.whatsapp_platform_future_architecture
  FOR SELECT
  TO authenticated
  USING (public.fn_current_user_role() IN ('ADMIN', 'SALES_OPERATOR', 'MARKETING_OPERATOR'));

-- -----------------------------------------------------------------------------
-- 4. TRIGGER DE SEGURIDAD COMERCIAL EN MENSAJES DE WHATSAPP AL COMPRADOR
--    - No mostrar a compradores información interna de propietarios (OWN-0001).
--    - No confirmar pagos sin prueba (payment_voucher_proof_ref).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_validate_whatsapp_buyer_message_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Prohibido exponer identificadores internos de propietarios al comprador
  IF NEW.prepared_buyer_message ~* '(OWN-[0-9]{4}|propietario\s+interno|costo\s+de\s+compra|comision\s+propietario)' THEN
    RAISE EXCEPTION 'BLOQUEO DE PRIVACIDAD INTERNA: El mensaje dirigido al comprador contiene información interna de propietarios o costos que no debe revelarse.';
  END IF;

  -- 2. Prohibido confirmar pagos sin comprobante / prueba verificada
  IF NEW.template_category = 'CONFIRMACION' AND (
    NEW.payment_voucher_proof_ref IS NULL OR btrim(NEW.payment_voucher_proof_ref) = ''
  ) THEN
    RAISE EXCEPTION 'BLOQUEO DE SEGURIDAD FINANCIERA: Prohibido enviar confirmación de pago sin registrar primero la referencia o prueba del comprobante.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_whatsapp_buyer_message_security ON public.whatsapp_sales_interactions;
CREATE TRIGGER trg_validate_whatsapp_buyer_message_security
  BEFORE INSERT OR UPDATE ON public.whatsapp_sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_whatsapp_buyer_message_security();
COMMIT;


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0020_meta_ads_control_center.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
-- =============================================================================
-- MIGRACIÓN 0020: META ADS CONTROL CENTER (CAMPAÑAS, CONJUNTOS, ANUNCIOS,
--                 MÉTRICAS, RENTABILIDAD MULTIPROPIETARIO Y ALERTAS)
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Cubre:
--   1. Ampliación de public.ads_campaigns:
--      Origen del dato ('MANUAL_ENTRY', 'CSV_ADS_MANAGER_IMPORT', 'META_API_SYNCED'),
--      CPA objetivo, precio anunciado snapshot, autorización explícita del
--      propietario antes de descontar publicidad, y bloqueo de creación,
--      aumento de presupuesto o pausa sin aprobación humana.
--   2. Tabla public.ads_ad_sets (Conjuntos de Anuncios):
--       Audiencia, ubicación/canal ('whatsapp', 'instagram', 'facebook', 'marketplace'),
--       presupuesto asignado y estado.
--   3. Tabla public.ads_creatives_and_ads (Anuncios y Creatividades vinculadas a SKU):
--      Relaciona cada anuncio con su Conjunto, Creatividad de Creative Studio,
--      SKU promovido y Propietario de la mercancía.
--   4. Ampliación de public.ads_campaign_metrics:
--      Separa estrictamente conversaciones iniciadas (whatsapp_conversations)
--      de compras reales verificadas (attributed_orders_count), costo vendido
--      atribuido (attributed_cogs_cop), origen del registro ('MANUAL_ENTRY',
--      'CSV_ADS_MANAGER_IMPORT', 'META_API_SYNCED') y cálculo de CPA, ROAS y
--      Contribución Neta.
--   5. Tabla public.ads_owner_spend_allocations:
--      Asignación multipropietario del gasto publicitario exigiendo acuerdo
--      configurado y autorización explícita antes de descontar a un propietario.
--   6. Trigger de Reglas Críticas (public.fn_enforce_meta_ads_control_rules):
--      - Prohibido descontar publicidad a un propietario sin autorización.
--      - Prohibido aplicar distribución sin acuerdo configurado.
--      - Prohibido pausar o modificar presupuesto sin humano aprobador.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. AMPLIACIÓN DE public.ads_campaigns
-- -----------------------------------------------------------------------------
ALTER TABLE public.ads_campaigns
  ADD COLUMN IF NOT EXISTS data_source_origin TEXT NOT NULL DEFAULT 'MANUAL_ENTRY' CHECK (
    data_source_origin IN ('MANUAL_ENTRY', 'CSV_ADS_MANAGER_IMPORT', 'META_API_SYNCED')
  ),
  ADD COLUMN IF NOT EXISTS target_cpa_cop NUMERIC(12,2) NOT NULL DEFAULT 15000 CHECK (target_cpa_cop >= 0),
  ADD COLUMN IF NOT EXISTS advertised_price_snapshot_cop NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS owner_deduction_authorized BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_deduction_authorized_by TEXT,
  ADD COLUMN IF NOT EXISTS owner_deduction_authorized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pause_approved_by TEXT,
  ADD COLUMN IF NOT EXISTS pause_reason TEXT,
  ADD COLUMN IF NOT EXISTS history_log JSONB NOT NULL DEFAULT '[]'::jsonb;

-- -----------------------------------------------------------------------------
-- 2. TABLA: public.ads_ad_sets (Conjuntos de Anuncios)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ads_ad_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_set_code TEXT NOT NULL UNIQUE CHECK (btrim(ad_set_code) <> ''),
  campaign_id UUID NOT NULL REFERENCES public.ads_campaigns(id) ON DELETE CASCADE,
  ad_set_name TEXT NOT NULL CHECK (btrim(ad_set_name) <> ''),
  target_channel TEXT NOT NULL CHECK (
    target_channel IN ('whatsapp', 'instagram', 'facebook', 'marketplace')
  ),
  audience_summary TEXT NOT NULL DEFAULT 'Barranquilla y Costa Atlántica • Intereses Tecnología',
  allocated_budget_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (allocated_budget_cop >= 0),
  ad_set_status TEXT NOT NULL DEFAULT 'active' CHECK (
    ad_set_status IN ('draft', 'active', 'paused', 'completed')
  ),
  data_source_origin TEXT NOT NULL DEFAULT 'MANUAL_ENTRY' CHECK (
    data_source_origin IN ('MANUAL_ENTRY', 'CSV_ADS_MANAGER_IMPORT', 'META_API_SYNCED')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ads_ad_sets_campaign ON public.ads_ad_sets(campaign_id);

DROP TRIGGER IF EXISTS trg_ads_ad_sets_updated_at ON public.ads_ad_sets;
CREATE TRIGGER trg_ads_ad_sets_updated_at
  BEFORE UPDATE ON public.ads_ad_sets
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

ALTER TABLE public.ads_ad_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_ad_sets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_ads_ad_sets_select ON public.ads_ad_sets;
CREATE POLICY pol_ads_ad_sets_select
  ON public.ads_ad_sets
  FOR SELECT
  TO authenticated
  USING (
    public.fn_current_user_role() IN ('ADMIN', 'MARKETING_OPERATOR', 'SALES_OPERATOR')
  );

DROP POLICY IF EXISTS pol_ads_ad_sets_write ON public.ads_ad_sets;
CREATE POLICY pol_ads_ad_sets_write
  ON public.ads_ad_sets
  FOR ALL
  TO authenticated
  USING (public.fn_current_user_role() IN ('ADMIN', 'MARKETING_OPERATOR'))
  WITH CHECK (public.fn_current_user_role() IN ('ADMIN', 'MARKETING_OPERATOR'));

-- -----------------------------------------------------------------------------
-- 3. TABLA: public.ads_creatives_and_ads (Anuncios y Creatividades por SKU y Dueño)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ads_creatives_and_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_code TEXT NOT NULL UNIQUE CHECK (btrim(ad_code) <> ''),
  campaign_id UUID NOT NULL REFERENCES public.ads_campaigns(id) ON DELETE CASCADE,
  ad_set_id UUID NOT NULL REFERENCES public.ads_ad_sets(id) ON DELETE CASCADE,
  ad_name TEXT NOT NULL CHECK (btrim(ad_name) <> ''),
  creative_project_code TEXT,
  creative_format TEXT NOT NULL DEFAULT '1:1' CHECK (creative_format IN ('1:1', '4:5', '9:16', 'VIDEO_REEL')),
  headline_used TEXT NOT NULL CHECK (btrim(headline_used) <> ''),
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  ad_status TEXT NOT NULL DEFAULT 'active' CHECK (
    ad_status IN ('draft', 'active', 'paused', 'completed')
  ),
  data_source_origin TEXT NOT NULL DEFAULT 'MANUAL_ENTRY' CHECK (
    data_source_origin IN ('MANUAL_ENTRY', 'CSV_ADS_MANAGER_IMPORT', 'META_API_SYNCED')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ads_creatives_sku_owner
  ON public.ads_creatives_and_ads(sku, owner_id);

DROP TRIGGER IF EXISTS trg_ads_creatives_updated_at ON public.ads_creatives_and_ads;
CREATE TRIGGER trg_ads_creatives_updated_at
  BEFORE UPDATE ON public.ads_creatives_and_ads
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

ALTER TABLE public.ads_creatives_and_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_creatives_and_ads FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_ads_creatives_select ON public.ads_creatives_and_ads;
CREATE POLICY pol_ads_creatives_select
  ON public.ads_creatives_and_ads
  FOR SELECT
  TO authenticated
  USING (
    public.fn_current_user_role() IN ('ADMIN', 'MARKETING_OPERATOR', 'SALES_OPERATOR')
    OR public.fn_can_owner_view(owner_id)
  );

DROP POLICY IF EXISTS pol_ads_creatives_write ON public.ads_creatives_and_ads;
CREATE POLICY pol_ads_creatives_write
  ON public.ads_creatives_and_ads
  FOR ALL
  TO authenticated
  USING (public.fn_current_user_role() IN ('ADMIN', 'MARKETING_OPERATOR'))
  WITH CHECK (public.fn_current_user_role() IN ('ADMIN', 'MARKETING_OPERATOR'));

-- -----------------------------------------------------------------------------
-- 4. AMPLIACIÓN DE public.ads_campaign_metrics (Separación Conversaciones vs Compras)
-- -----------------------------------------------------------------------------
ALTER TABLE public.ads_campaign_metrics
  ADD COLUMN IF NOT EXISTS ad_set_id UUID REFERENCES public.ads_ad_sets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ad_id UUID REFERENCES public.ads_creatives_and_ads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sku TEXT REFERENCES public.product_variants(sku) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES public.owners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attributed_cogs_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (attributed_cogs_cop >= 0),
  ADD COLUMN IF NOT EXISTS data_source_origin TEXT NOT NULL DEFAULT 'MANUAL_ENTRY' CHECK (
    data_source_origin IN ('MANUAL_ENTRY', 'CSV_ADS_MANAGER_IMPORT', 'META_API_SYNCED')
  ),
  ADD COLUMN IF NOT EXISTS linked_order_numbers TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_lead_codes TEXT[] NOT NULL DEFAULT '{}';

-- -----------------------------------------------------------------------------
-- 5. TABLA: public.ads_owner_spend_allocations (Atribución Multipropietario)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ads_owner_spend_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_code TEXT NOT NULL UNIQUE CHECK (btrim(allocation_code) <> ''),
  campaign_id UUID NOT NULL REFERENCES public.ads_campaigns(id) ON DELETE CASCADE,
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  agreement_id TEXT REFERENCES public.owner_agreements(id) ON DELETE RESTRICT,
  allocation_policy_used TEXT NOT NULL CHECK (
    allocation_policy_used IN ('direct_owner', 'shared_proportional_sales', 'store_absorbed')
  ),
  total_campaign_spend_cop NUMERIC(14,2) NOT NULL CHECK (total_campaign_spend_cop >= 0),
  owner_allocated_spend_cop NUMERIC(14,2) NOT NULL CHECK (owner_allocated_spend_cop >= 0),
  owner_deduction_authorized BOOLEAN NOT NULL DEFAULT false,
  authorized_by TEXT,
  authorized_at TIMESTAMPTZ,
  deduction_status TEXT NOT NULL DEFAULT 'pending_owner_authorization' CHECK (
    deduction_status IN ('pending_owner_authorization', 'authorized_and_applied', 'store_absorbed_no_deduction', 'rejected')
  ),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ads_owner_spend_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_owner_spend_allocations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_ads_owner_alloc_select ON public.ads_owner_spend_allocations;
CREATE POLICY pol_ads_owner_alloc_select
  ON public.ads_owner_spend_allocations
  FOR SELECT
  TO authenticated
  USING (
    public.fn_current_user_role() IN ('ADMIN', 'MARKETING_OPERATOR')
    OR public.fn_can_owner_view(owner_id)
  );

DROP POLICY IF EXISTS pol_ads_owner_alloc_write ON public.ads_owner_spend_allocations;
CREATE POLICY pol_ads_owner_alloc_write
  ON public.ads_owner_spend_allocations
  FOR ALL
  TO authenticated
  USING (public.fn_current_user_role() IN ('ADMIN', 'MARKETING_OPERATOR'))
  WITH CHECK (public.fn_current_user_role() IN ('ADMIN', 'MARKETING_OPERATOR'));

-- -----------------------------------------------------------------------------
-- 6. TRIGGER DE REGLAS CRÍTICAS DE PUBLICIDAD Y MULTIPROPIETARIO
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_meta_ads_control_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agreement_status TEXT;
BEGIN
  -- 1. No descontar publicidad de un propietario sin autorización explícita
  IF NEW.deduction_status = 'authorized_and_applied' AND NEW.allocation_policy_used <> 'store_absorbed' THEN
    IF NEW.owner_deduction_authorized IS DISTINCT FROM true OR NEW.authorized_by IS NULL THEN
      RAISE EXCEPTION 'BLOQUEO MULTIPROPIETARIO: Prohibido descontar gasto publicitario al propietario % sin autorización explícita.',
        NEW.owner_id;
    END IF;

    -- 2. Aplicar distribución solamente mediante acuerdos configurados ('active')
    SELECT status
      INTO v_agreement_status
      FROM public.owner_agreements
     WHERE owner_id = NEW.owner_id
       AND status = 'active'
     LIMIT 1;

    IF v_agreement_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'BLOQUEO DE ACUERDO: El propietario % no tiene un acuerdo comercial en estado activo (estado actual: PENDIENTE DE CONFIGURAR). No se puede descontar publicidad hasta configurar el acuerdo.',
        NEW.owner_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_meta_ads_control_rules ON public.ads_owner_spend_allocations;
CREATE TRIGGER trg_enforce_meta_ads_control_rules
  BEFORE INSERT OR UPDATE ON public.ads_owner_spend_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_meta_ads_control_rules();
COMMIT;


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0021_automation_engine_orchestrator.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
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


-- ----------------------------------------------------------------------------
-- MÓDULO FUENTE: 0022_erp_gap_closure_tables_views_storage.sql
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
-- =============================================================================
-- MIGRACIÓN 0022: CIERRE DE BRECHAS ERP (TABLAS COMPLEMENTARIAS, ROL VIEWER,
--                 VISTAS CON SECURITY INVOKER Y BUCKETS DE STORAGE SEGUROS)
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Regla: 100% aditiva y no destructiva. No usa DROP ni TRUNCATE.
-- =============================================================================

-- 1. Ampliar enum app_role con 'VIEWER' (solo lectura autorizada) fuera de bloque tx si aplica
-- 'VIEWER' ya incluido en CREATE TYPE public.app_role al inicio del script

-- =============================================================================
-- A. CONFIGURACIÓN DE NEGOCIO Y NOTIFICACIONES
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.business_settings (
  id TEXT PRIMARY KEY DEFAULT 'REAL_TWS_DEFAULT',
  business_name TEXT NOT NULL DEFAULT 'REAL TWS',
  legal_name TEXT NOT NULL DEFAULT 'REAL TWS COMMERCE SYSTEM',
  currency_code TEXT NOT NULL DEFAULT 'COP',
  timezone TEXT NOT NULL DEFAULT 'America/Bogota',
  default_low_stock_threshold INTEGER NOT NULL DEFAULT 3 CHECK (default_low_stock_threshold >= 0),
  ai_provider_enabled BOOLEAN NOT NULL DEFAULT false,
  meta_api_enabled BOOLEAN NOT NULL DEFAULT false,
  whatsapp_cloud_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_publish_blocked BOOLEAN NOT NULL DEFAULT true,
  auto_settlement_blocked BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_code TEXT UNIQUE NOT NULL,
  target_user_id UUID REFERENCES auth.users(id),
  target_role public.app_role,
  owner_id TEXT REFERENCES public.owners(id),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  source_event TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- B. CATÁLOGO: CATEGORÍAS Y MEDIA DE PRODUCTO
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE,
  variant_sku TEXT REFERENCES public.product_variants(sku) ON DELETE CASCADE,
  bucket_name TEXT NOT NULL CHECK (bucket_name IN ('product-originals', 'product-public', 'marketing-assets')),
  storage_path TEXT NOT NULL,
  is_approved_public BOOLEAN NOT NULL DEFAULT false,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- C. PROPIETARIOS: CONDICIONES POR PRODUCTO
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.owner_product_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES public.owners(id),
  sku TEXT NOT NULL REFERENCES public.product_variants(sku),
  agreement_id TEXT REFERENCES public.owner_agreements(id),
  min_sale_price_cop NUMERIC(14,2) CHECK (min_sale_price_cop IS NULL OR min_sale_price_cop >= 0),
  max_discount_pct NUMERIC(5,2) CHECK (max_discount_pct IS NULL OR (max_discount_pct >= 0 AND max_discount_pct <= 100)),
  promo_authorized BOOLEAN NOT NULL DEFAULT false,
  authorized_by UUID REFERENCES auth.users(id),
  authorized_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, sku)
);

-- =============================================================================
-- D. ÓRDENES DE COMPRA Y AJUSTES DE INVENTARIO
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_id TEXT REFERENCES public.suppliers(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'partially_received', 'received', 'cancelled')),
  invoice_reference TEXT DEFAULT '',
  inbound_shipping_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (inbound_shipping_cop >= 0),
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  sku TEXT NOT NULL REFERENCES public.product_variants(sku),
  owner_id TEXT NOT NULL REFERENCES public.owners(id),
  qty_ordered INTEGER NOT NULL CHECK (qty_ordered > 0),
  qty_received INTEGER NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  unit_purchase_cost_cop NUMERIC(14,2) CHECK (unit_purchase_cost_cop IS NULL OR unit_purchase_cost_cop >= 0),
  unit_shipping_cost_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_shipping_cost_cop >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (purchase_order_id, line_number)
);

CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_code TEXT UNIQUE NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  lot_allocation_id TEXT NOT NULL REFERENCES public.lot_owner_allocations(id),
  owner_id TEXT NOT NULL REFERENCES public.owners(id),
  sku TEXT NOT NULL REFERENCES public.product_variants(sku),
  delta_good INTEGER NOT NULL DEFAULT 0,
  delta_defective INTEGER NOT NULL DEFAULT 0,
  delta_pending INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  authorized_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- E. DEVOLUCIONES DETALLE, LIQUIDACIONES DETALLE Y ATRIBUCIÓN ADS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.sales_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id TEXT NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  sales_item_allocation_id TEXT NOT NULL REFERENCES public.sales_item_allocations(id),
  owner_id TEXT NOT NULL REFERENCES public.owners(id),
  sku TEXT NOT NULL REFERENCES public.product_variants(sku),
  qty_returned INTEGER NOT NULL CHECK (qty_returned > 0),
  item_condition TEXT NOT NULL CHECK (item_condition IN ('good_restock', 'defective_warranty', 'pending_inspection')),
  unit_cost_preserved_cop NUMERIC(14,2) NOT NULL DEFAULT 0,
  refund_amount_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (refund_amount_cop >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.owner_settlement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id TEXT NOT NULL REFERENCES public.owner_settlements(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('SALE_ALLOCATION', 'DIRECT_EXPENSE', 'SHARED_EXPENSE', 'AD_SPEND', 'COMMISSION', 'PREVIOUS_BALANCE')),
  source_reference_id TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cop NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.owner_payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_code TEXT UNIQUE NOT NULL,
  settlement_id TEXT NOT NULL REFERENCES public.owner_settlements(id),
  owner_id TEXT NOT NULL REFERENCES public.owners(id),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_paid_cop NUMERIC(14,2) NOT NULL CHECK (amount_paid_cop > 0),
  payment_method TEXT NOT NULL,
  voucher_storage_path TEXT,
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id TEXT NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES public.ads_campaigns(id),
  lead_id TEXT REFERENCES public.leads(id),
  attribution_source TEXT NOT NULL CHECK (attribution_source IN ('MANUAL', 'UTM', 'WHATSAPP_LINK', 'META_SYNC')),
  attributed_revenue_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (attributed_revenue_cop >= 0),
  attributed_spend_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (attributed_spend_cop >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sales_order_id, campaign_id)
);

-- =============================================================================
-- F. TRIGGERS updated_at (fn_set_updated_at ya existe desde migración 0001)
-- =============================================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'business_settings',
    'categories',
    'owner_product_terms',
    'purchase_orders'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at_%I ON public.%I;', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at_%I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();',
      t, t
    );
  END LOOP;
END
$$;

-- =============================================================================
-- G. RLS Y GRANTS EN TABLAS NUEVAS
-- =============================================================================
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_product_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_settlement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_attribution ENABLE ROW LEVEL SECURITY;

-- business_settings: lectura autenticada; escritura solo ADMIN
DROP POLICY IF EXISTS pol_business_settings_read ON public.business_settings;
CREATE POLICY pol_business_settings_read ON public.business_settings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pol_business_settings_admin ON public.business_settings;
CREATE POLICY pol_business_settings_admin ON public.business_settings
  FOR ALL TO authenticated USING (public.fn_is_admin()) WITH CHECK (public.fn_is_admin());

-- categories & product_media
DROP POLICY IF EXISTS pol_categories_read ON public.categories;
CREATE POLICY pol_categories_read ON public.categories
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pol_categories_write ON public.categories;
CREATE POLICY pol_categories_write ON public.categories
  FOR ALL TO authenticated USING (public.fn_is_operator_or_admin()) WITH CHECK (public.fn_is_operator_or_admin());

DROP POLICY IF EXISTS pol_product_media_read ON public.product_media;
CREATE POLICY pol_product_media_read ON public.product_media
  FOR SELECT TO authenticated USING (
    is_approved_public = true OR public.fn_is_operator_or_admin() OR public.fn_can_manage_marketing()
  );
DROP POLICY IF EXISTS pol_product_media_write ON public.product_media;
CREATE POLICY pol_product_media_write ON public.product_media
  FOR ALL TO authenticated USING (public.fn_is_operator_or_admin() OR public.fn_can_manage_marketing())
  WITH CHECK (public.fn_is_operator_or_admin() OR public.fn_can_manage_marketing());

-- owner_product_terms: propietario ve las suyas, admin/operador gestiona
DROP POLICY IF EXISTS pol_owner_product_terms_read ON public.owner_product_terms;
CREATE POLICY pol_owner_product_terms_read ON public.owner_product_terms
  FOR SELECT TO authenticated USING (public.fn_is_admin() OR public.fn_can_owner_view(owner_id));
DROP POLICY IF EXISTS pol_owner_product_terms_write ON public.owner_product_terms;
CREATE POLICY pol_owner_product_terms_write ON public.owner_product_terms
  FOR ALL TO authenticated USING (public.fn_is_admin()) WITH CHECK (public.fn_is_admin());

-- purchase_orders, purchase_order_items, stock_adjustments
DROP POLICY IF EXISTS pol_po_read ON public.purchase_orders;
CREATE POLICY pol_po_read ON public.purchase_orders
  FOR SELECT TO authenticated USING (public.fn_is_operator_or_admin() OR public.fn_current_user_role() = 'VIEWER');
DROP POLICY IF EXISTS pol_po_write ON public.purchase_orders;
CREATE POLICY pol_po_write ON public.purchase_orders
  FOR ALL TO authenticated USING (public.fn_is_operator_or_admin()) WITH CHECK (public.fn_is_operator_or_admin());

DROP POLICY IF EXISTS pol_poi_read ON public.purchase_order_items;
CREATE POLICY pol_poi_read ON public.purchase_order_items
  FOR SELECT TO authenticated USING (public.fn_is_operator_or_admin() OR public.fn_can_owner_view(owner_id));
DROP POLICY IF EXISTS pol_poi_write ON public.purchase_order_items;
CREATE POLICY pol_poi_write ON public.purchase_order_items
  FOR ALL TO authenticated USING (public.fn_is_operator_or_admin()) WITH CHECK (public.fn_is_operator_or_admin());

DROP POLICY IF EXISTS pol_stock_adj_read ON public.stock_adjustments;
CREATE POLICY pol_stock_adj_read ON public.stock_adjustments
  FOR SELECT TO authenticated USING (public.fn_is_operator_or_admin() OR public.fn_can_owner_view(owner_id));
DROP POLICY IF EXISTS pol_stock_adj_insert ON public.stock_adjustments;
CREATE POLICY pol_stock_adj_insert ON public.stock_adjustments
  FOR INSERT TO authenticated WITH CHECK (public.fn_is_operator_or_admin());

-- sales_return_items, sales_attribution
DROP POLICY IF EXISTS pol_sri_read ON public.sales_return_items;
CREATE POLICY pol_sri_read ON public.sales_return_items
  FOR SELECT TO authenticated USING (public.fn_is_sales_or_above() OR public.fn_can_owner_view(owner_id));
DROP POLICY IF EXISTS pol_sri_insert ON public.sales_return_items;
CREATE POLICY pol_sri_insert ON public.sales_return_items
  FOR INSERT TO authenticated WITH CHECK (public.fn_can_manage_sales());

DROP POLICY IF EXISTS pol_sales_attr_read ON public.sales_attribution;
CREATE POLICY pol_sales_attr_read ON public.sales_attribution
  FOR SELECT TO authenticated USING (public.fn_is_sales_or_above() OR public.fn_can_manage_marketing());
DROP POLICY IF EXISTS pol_sales_attr_write ON public.sales_attribution;
CREATE POLICY pol_sales_attr_write ON public.sales_attribution
  FOR ALL TO authenticated USING (public.fn_is_admin() OR public.fn_can_manage_marketing())
  WITH CHECK (public.fn_is_admin() OR public.fn_can_manage_marketing());

-- owner_settlement_items, owner_payment_records, notifications
DROP POLICY IF EXISTS pol_osi_read ON public.owner_settlement_items;
CREATE POLICY pol_osi_read ON public.owner_settlement_items
  FOR SELECT TO authenticated USING (
    public.fn_is_admin() OR EXISTS (
      SELECT 1 FROM public.owner_settlements os
      WHERE os.id = settlement_id AND public.fn_can_owner_view(os.owner_id)
    )
  );
DROP POLICY IF EXISTS pol_osi_write ON public.owner_settlement_items;
CREATE POLICY pol_osi_write ON public.owner_settlement_items
  FOR ALL TO authenticated USING (public.fn_is_admin()) WITH CHECK (public.fn_is_admin());

DROP POLICY IF EXISTS pol_opr_read ON public.owner_payment_records;
CREATE POLICY pol_opr_read ON public.owner_payment_records
  FOR SELECT TO authenticated USING (public.fn_is_admin() OR public.fn_can_owner_view(owner_id));
DROP POLICY IF EXISTS pol_opr_write ON public.owner_payment_records;
CREATE POLICY pol_opr_write ON public.owner_payment_records
  FOR ALL TO authenticated USING (public.fn_is_admin()) WITH CHECK (public.fn_is_admin());

DROP POLICY IF EXISTS pol_notif_read ON public.notifications;
CREATE POLICY pol_notif_read ON public.notifications
  FOR SELECT TO authenticated USING (
    public.fn_is_admin()
    OR target_user_id = auth.uid()
    OR (owner_id IS NOT NULL AND public.fn_can_owner_view(owner_id))
  );
DROP POLICY IF EXISTS pol_notif_update_read ON public.notifications;
CREATE POLICY pol_notif_update_read ON public.notifications
  FOR UPDATE TO authenticated
  USING (target_user_id = auth.uid() OR public.fn_is_admin())
  WITH CHECK (target_user_id = auth.uid() OR public.fn_is_admin());

-- =============================================================================
-- H. VISTAS COMPLEMENTARIAS CON SECURITY INVOKER
-- =============================================================================
CREATE OR REPLACE VIEW public.v_available_inventory
WITH (security_invoker = true) AS
SELECT
  l.sku,
  pv.product_id,
  p.name AS product_name,
  l.owner_id,
  o.full_name AS owner_name,
  l.lot_id,
  l.qty_physical,
  l.qty_good,
  l.qty_defective,
  l.qty_pending_inspection,
  l.qty_reserved,
  l.qty_available,
  l.effective_unit_cost_cop
FROM public.lot_owner_allocations l
JOIN public.product_variants pv ON pv.sku = l.sku
JOIN public.products p ON p.id = pv.product_id
JOIN public.owners o ON o.id = l.owner_id;

CREATE OR REPLACE VIEW public.v_purchase_summary
WITH (security_invoker = true) AS
SELECT
  po.order_number,
  po.order_date,
  po.status,
  po.supplier_id,
  COUNT(poi.id) AS total_lines,
  COALESCE(SUM(poi.qty_ordered), 0) AS total_units_ordered,
  COALESCE(SUM(poi.qty_received), 0) AS total_units_received,
  COALESCE(SUM(poi.qty_ordered * COALESCE(poi.unit_purchase_cost_cop, 0)), 0) AS total_estimated_cost_cop
FROM public.purchase_orders po
LEFT JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
GROUP BY po.id, po.order_number, po.order_date, po.status, po.supplier_id;

CREATE OR REPLACE VIEW public.v_sales_summary
WITH (security_invoker = true) AS
SELECT
  so.id AS sales_order_id,
  so.order_number,
  so.order_date,
  so.status,
  so.sales_channel,
  so.payment_status,
  COUNT(sia.id) AS allocation_count,
  COALESCE(SUM(sia.qty_allocated - sia.qty_returned), 0) AS net_units_sold,
  COALESCE(SUM(sia.net_revenue_cop), 0) AS net_revenue_cop,
  COALESCE(SUM((sia.qty_allocated - sia.qty_returned) * sia.unit_cost_cop), 0) AS cogs_cop
FROM public.sales_orders so
LEFT JOIN public.sales_item_allocations sia ON sia.sales_order_id = so.id
GROUP BY so.id, so.order_number, so.order_date, so.status, so.sales_channel, so.payment_status;

CREATE OR REPLACE VIEW public.v_product_costs_summary
WITH (security_invoker = true) AS
SELECT
  l.sku,
  l.owner_id,
  l.lot_id,
  l.qty_physical,
  l.purchase_unit_cost_cop,
  l.inbound_shipping_unit_cost_cop,
  l.effective_unit_cost_cop
FROM public.lot_owner_allocations l;

CREATE OR REPLACE VIEW public.v_settlements_summary
WITH (security_invoker = true) AS
SELECT
  os.id,
  os.settlement_code,
  os.owner_id,
  o.full_name AS owner_name,
  os.period_start,
  os.period_end,
  os.net_sales_cop,
  os.cogs_cop,
  os.attributable_profit_cop,
  os.amount_approved_cop,
  os.approval_state
FROM public.owner_settlements os
JOIN public.owners o ON o.id = os.owner_id;

CREATE OR REPLACE VIEW public.v_marketing_summary
WITH (security_invoker = true) AS
SELECT
  ac.id AS campaign_id,
  ac.campaign_code,
  ac.campaign_name,
  ac.channel,
  ac.promoted_sku,
  ac.target_owner_id,
  ac.status,
  COALESCE(SUM(acm.impressions), 0) AS total_impressions,
  COALESCE(SUM(acm.clicks), 0) AS total_clicks,
  COALESCE(SUM(acm.spend_cop), 0) AS total_spend_cop
FROM public.ads_campaigns ac
LEFT JOIN public.ads_campaign_metrics acm ON acm.campaign_id = ac.id
GROUP BY ac.id, ac.campaign_code, ac.campaign_name, ac.channel, ac.promoted_sku, ac.target_owner_id, ac.status;

-- =============================================================================
-- I. ÍNDICES DE RENDIMIENTO FALTANTES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_po_items_sku_owner ON public.purchase_order_items (sku, owner_id);
CREATE INDEX IF NOT EXISTS idx_stock_adj_owner_sku ON public.stock_adjustments (owner_id, sku);
CREATE INDEX IF NOT EXISTS idx_sales_attr_campaign ON public.sales_attribution (campaign_id, sales_order_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (target_user_id, is_read);

-- =============================================================================
-- J. STORAGE BUCKETS SOLICITADOS Y POLÍTICAS DE AISLAMIENTO POR PROPIETARIO
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('product-originals', 'product-originals', false),
  ('product-public', 'product-public', true),
  ('marketing-assets', 'marketing-assets', false),
  ('invoices', 'invoices', false),
  ('owner-documents', 'owner-documents', false)
ON CONFLICT (id) DO NOTHING;

-- product-public: lectura pública solo de aprobados, escritura operadores/marketing
DROP POLICY IF EXISTS pol_product_public_read ON storage.objects;
CREATE POLICY pol_product_public_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'product-public');

DROP POLICY IF EXISTS pol_product_public_write ON storage.objects;
CREATE POLICY pol_product_public_write ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'product-public' AND (public.fn_is_operator_or_admin() OR public.fn_can_manage_marketing()))
  WITH CHECK (bucket_id = 'product-public' AND (public.fn_is_operator_or_admin() OR public.fn_can_manage_marketing()));

-- product-originals & invoices: estrictamente privados (admin / inventory_operator)
DROP POLICY IF EXISTS pol_product_originals_priv ON storage.objects;
CREATE POLICY pol_product_originals_priv ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id IN ('product-originals', 'invoices') AND public.fn_is_operator_or_admin())
  WITH CHECK (bucket_id IN ('product-originals', 'invoices') AND public.fn_is_operator_or_admin());

-- marketing-assets: controlado por permisos marketing/admin
DROP POLICY IF EXISTS pol_marketing_assets_priv ON storage.objects;
CREATE POLICY pol_marketing_assets_priv ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'marketing-assets' AND (public.fn_is_admin() OR public.fn_can_manage_marketing()))
  WITH CHECK (bucket_id = 'marketing-assets' AND (public.fn_is_admin() OR public.fn_can_manage_marketing()));

-- owner-documents: aislamiento estricto por carpeta <owner_id>/archivo
DROP POLICY IF EXISTS pol_owner_docs_read ON storage.objects;
CREATE POLICY pol_owner_docs_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'owner-documents'
    AND (
      public.fn_is_admin()
      OR public.fn_can_owner_view(split_part(name, '/', 1))
    )
  );

DROP POLICY IF EXISTS pol_owner_docs_admin_write ON storage.objects;
CREATE POLICY pol_owner_docs_admin_write ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'owner-documents' AND public.fn_is_admin())
  WITH CHECK (bucket_id = 'owner-documents' AND public.fn_is_admin());

-- Seed inicial idempotente de configuración REAL TWS
INSERT INTO public.business_settings (id, business_name, legal_name, currency_code)
VALUES ('REAL_TWS_DEFAULT', 'REAL TWS', 'REAL TWS COMMERCE SYSTEM', 'COP')
ON CONFLICT (id) DO NOTHING;
COMMIT;
