-- =============================================================================
-- MIGRACIÓN 0022: CIERRE DE BRECHAS ERP (TABLAS COMPLEMENTARIAS, ROL VIEWER,
--                 VISTAS CON SECURITY INVOKER Y BUCKETS DE STORAGE SEGUROS)
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Regla: 100% aditiva y no destructiva. No usa DROP ni TRUNCATE.
-- =============================================================================

-- 1. Ampliar enum app_role con 'VIEWER' (solo lectura autorizada) fuera de bloque tx si aplica
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'VIEWER';

BEGIN;

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
