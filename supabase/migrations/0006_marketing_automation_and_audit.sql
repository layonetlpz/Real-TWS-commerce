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

BEGIN;

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
