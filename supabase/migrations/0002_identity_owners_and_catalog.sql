-- =============================================================================
-- MIGRACIÓN 0002: PERFILES, ROLES (RBAC), PROPIETARIOS, ACUERDOS, CATÁLOGO,
--                 PROVEEDORES E HISTORIAL DE PRECIOS
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Roles soportados:
--   ADMIN, INVENTORY_OPERATOR, SALES_OPERATOR, MARKETING_OPERATOR, OWNER
-- =============================================================================

BEGIN;

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
