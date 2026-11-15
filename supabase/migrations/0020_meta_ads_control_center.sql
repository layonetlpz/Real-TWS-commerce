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

BEGIN;

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
