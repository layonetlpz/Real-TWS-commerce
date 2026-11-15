-- =============================================================================
-- MIGRACIÓN 0016: BRAND & MERCHANDISING CENTER — IDENTIDAD CORPORATIVA VERSIONADA,
--                 PLANTILLAS APROBADAS, MERCHANDISING DIGITAL Y FÍSICO E HISTORIAL
--                 INMUTABLE DE VERSIONES
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- =============================================================================

BEGIN;

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
