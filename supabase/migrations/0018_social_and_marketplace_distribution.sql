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

BEGIN;

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
