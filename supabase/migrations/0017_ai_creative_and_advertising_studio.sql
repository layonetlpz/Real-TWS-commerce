-- =============================================================================
-- MIGRACIÓN 0017: AI CREATIVE & ADVERTISING STUDIO — CONSENTIMIENTO COMERCIAL
--                 POR PROPIETARIO, BIBLIOTECA DE IMÁGENES ORIGINALES/FINALES,
--                 PAQUETES DE COPYWRITING, GUIONES (10/15/30/45s), VERSIONADO Y
--                 CONTROL DE CUOTA DEL ADAPTADOR GEMINI OPCIONAL
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- =============================================================================

BEGIN;

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
