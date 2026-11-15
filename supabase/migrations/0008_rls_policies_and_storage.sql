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

BEGIN;

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
