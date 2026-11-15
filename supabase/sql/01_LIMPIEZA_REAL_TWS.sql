-- ============================================================================
-- REAL TWS COMMERCE SYSTEM — 01_LIMPIEZA_REAL_TWS.sql
-- ============================================================================
-- PROPÓSITO:
--   Limpiar ÚNICAMENTE los objetos atribuibles a instalaciones anteriores de
--   REAL TWS en Supabase SQL Editor, respetando dependencias sin usar
--   DROP SCHEMA public CASCADE ni CASCADE indiscriminado.
--
-- PROHIBICIONES RESPETADAS:
--   - NO ejecuta DROP SCHEMA public CASCADE ni elimina el esquema public.
--   - NO elimina auth.users, usuarios ni sesiones de Supabase Auth.
--   - NO elimina esquemas internos de Supabase ni extensiones compartidas.
--   - NO elimina buckets ni archivos de Storage.
--   - Verifica origen y dependencias externas de public.profiles antes de actuar.
-- ============================================================================

-- 0. COMPROBACIÓN PREVENTIVA DE CONCURRENCIA
DO $$
DECLARE
  v_blocking_count INTEGER;
BEGIN
  SELECT count(*)
  INTO v_blocking_count
  FROM pg_locks l
  JOIN pg_class c ON c.oid = l.relation
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE l.pid <> pg_backend_pid()
    AND n.nspname = 'public'
    AND l.mode IN ('AccessExclusiveLock', 'ShareRowExclusiveLock', 'ExclusiveLock');

  IF v_blocking_count > 0 THEN
    RAISE EXCEPTION 'LIMPIEZA ABORTADA: existen % bloqueo(s) exclusivo(s) activo(s) en public por otra sesión.', v_blocking_count;
  END IF;
END;
$$;

BEGIN;
SET LOCAL lock_timeout = '10s';

-- 1. TRIGGER DE REAL TWS SOBRE auth.users (sin tocar auth.users)
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;

-- 2. POLÍTICAS RLS DE REAL TWS SOBRE storage.objects (sin borrar buckets ni archivos)
DROP POLICY IF EXISTS pol_private_docs_admin_operator ON storage.objects;
DROP POLICY IF EXISTS pol_public_catalog_media_read ON storage.objects;
DROP POLICY IF EXISTS pol_public_catalog_media_write ON storage.objects;
DROP POLICY IF EXISTS pol_product_public_read ON storage.objects;
DROP POLICY IF EXISTS pol_product_public_write ON storage.objects;
DROP POLICY IF EXISTS pol_product_originals_priv ON storage.objects;
DROP POLICY IF EXISTS pol_marketing_assets_priv ON storage.objects;
DROP POLICY IF EXISTS pol_owner_docs_read ON storage.objects;
DROP POLICY IF EXISTS pol_owner_docs_admin_write ON storage.objects;

-- 3. TRIGGERS Y POLÍTICAS RLS PROPIOS DE REAL TWS EN public
DO $$
BEGIN
  IF to_regclass('public.owners') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_owners_updated_at ON public.owners'; END IF;
  IF to_regclass('public.profiles') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles'; END IF;
  IF to_regclass('public.owner_agreements') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_owner_agreements_updated_at ON public.owner_agreements'; END IF;
  IF to_regclass('public.products') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products'; END IF;
  IF to_regclass('public.product_variants') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_product_variants_updated_at ON public.product_variants'; END IF;
  IF to_regclass('public.suppliers') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON public.suppliers'; END IF;
  IF to_regclass('public.price_history') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_price_history_immutable ON public.price_history'; END IF;
  IF to_regclass('public.purchase_receipts') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_purchase_receipts_updated_at ON public.purchase_receipts'; END IF;
  IF to_regclass('public.purchase_receipt_lines') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_purchase_receipt_lines_updated_at ON public.purchase_receipt_lines'; END IF;
  IF to_regclass('public.stock_lots') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_stock_lots_updated_at ON public.stock_lots'; END IF;
  IF to_regclass('public.lot_owner_allocations') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_lot_owner_allocations_updated_at ON public.lot_owner_allocations'; END IF;
  IF to_regclass('public.stock_movements') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_stock_movements_immutable ON public.stock_movements'; END IF;
  IF to_regclass('public.stock_reservations') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_stock_reservations_updated_at ON public.stock_reservations'; END IF;
  IF to_regclass('public.inventory_incidences') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_inventory_incidences_updated_at ON public.inventory_incidences'; END IF;
  IF to_regclass('public.customers') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers'; END IF;
  IF to_regclass('public.leads') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_leads_updated_at ON public.leads'; END IF;
  IF to_regclass('public.sales_orders') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_sales_orders_updated_at ON public.sales_orders'; END IF;
  IF to_regclass('public.sales_item_allocations') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_sales_item_allocations_updated_at ON public.sales_item_allocations'; END IF;
  IF to_regclass('public.shipments') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_shipments_updated_at ON public.shipments'; END IF;
  IF to_regclass('public.expenses') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_expenses_updated_at ON public.expenses'; END IF;
  IF to_regclass('public.owner_settlements') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_owner_settlements_updated_at ON public.owner_settlements'; END IF;
  IF to_regclass('public.marketing_assets') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_marketing_assets_updated_at ON public.marketing_assets'; END IF;
  IF to_regclass('public.content_calendar') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_content_calendar_updated_at ON public.content_calendar'; END IF;
  IF to_regclass('public.publications') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_publications_updated_at ON public.publications'; END IF;
  IF to_regclass('public.social_connections') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_social_connections_updated_at ON public.social_connections'; END IF;
  IF to_regclass('public.ads_campaigns') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_ads_campaigns_updated_at ON public.ads_campaigns'; END IF;
  IF to_regclass('public.automation_jobs') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_automation_jobs_updated_at ON public.automation_jobs'; END IF;
  IF to_regclass('public.audit_logs') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs'; END IF;
  IF to_regclass('public.owner_agreements') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_owner_agreements ON public.owner_agreements'; END IF;
  IF to_regclass('public.lot_owner_allocations') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_lot_owner_allocations ON public.lot_owner_allocations'; END IF;
  IF to_regclass('public.sales_item_allocations') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_sales_item_allocations ON public.sales_item_allocations'; END IF;
  IF to_regclass('public.owner_settlements') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_owner_settlements ON public.owner_settlements'; END IF;
  IF to_regclass('public.ownership_transfers') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_ownership_transfers ON public.ownership_transfers'; END IF;
  IF to_regclass('public.profiles') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_prevent_profile_self_escalation ON public.profiles'; END IF;
  IF to_regclass('public.cost_records') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_cost_records_immutable ON public.cost_records'; END IF;
  IF to_regclass('public.sales_order_items') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_guard_unconfirmed_order_item_edit ON public.sales_order_items'; END IF;
  IF to_regclass('public.brand_identity_versions') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_brand_identity_versions_immutable ON public.brand_identity_versions'; END IF;
  IF to_regclass('public.merchandising_asset_versions') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_merchandising_versions_immutable ON public.merchandising_asset_versions'; END IF;
  IF to_regclass('public.creative_studio_project_versions') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_creative_project_versions_immutable ON public.creative_studio_project_versions'; END IF;
  IF to_regclass('public.creative_studio_projects') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_validate_creative_studio_project ON public.creative_studio_projects'; END IF;
  IF to_regclass('public.marketplace_assisted_listings') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_marketplace_listings_updated_at ON public.marketplace_assisted_listings'; END IF;
  IF to_regclass('public.publications') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_validate_social_publication_rules ON public.publications'; END IF;
  IF to_regclass('public.whatsapp_message_templates') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_whatsapp_templates_updated_at ON public.whatsapp_message_templates'; END IF;
  IF to_regclass('public.whatsapp_sales_interactions') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_validate_whatsapp_buyer_message_security ON public.whatsapp_sales_interactions'; END IF;
  IF to_regclass('public.ads_ad_sets') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_ads_ad_sets_updated_at ON public.ads_ad_sets'; END IF;
  IF to_regclass('public.ads_creatives_and_ads') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_ads_creatives_updated_at ON public.ads_creatives_and_ads'; END IF;
  IF to_regclass('public.ads_owner_spend_allocations') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_enforce_meta_ads_control_rules ON public.ads_owner_spend_allocations'; END IF;
  IF to_regclass('public.automation_event_queue') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_automation_queue_updated_at ON public.automation_event_queue'; END IF;
  IF to_regclass('public.automation_logs') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS trg_automation_logs_immutable ON public.automation_logs'; END IF;
  IF to_regclass('public.profiles') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_profiles_select ON public.profiles'; END IF;
  IF to_regclass('public.profiles') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_profiles_admin_all ON public.profiles'; END IF;
  IF to_regclass('public.owners') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_owners_select ON public.owners'; END IF;
  IF to_regclass('public.owners') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_owners_admin_write ON public.owners'; END IF;
  IF to_regclass('public.owner_agreements') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_owner_agreements_select ON public.owner_agreements'; END IF;
  IF to_regclass('public.owner_agreements') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_owner_agreements_admin_write ON public.owner_agreements'; END IF;
  IF to_regclass('public.products') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_products_select ON public.products'; END IF;
  IF to_regclass('public.products') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_products_write ON public.products'; END IF;
  IF to_regclass('public.product_variants') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_product_variants_select ON public.product_variants'; END IF;
  IF to_regclass('public.product_variants') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_product_variants_write ON public.product_variants'; END IF;
  IF to_regclass('public.suppliers') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_suppliers_internal ON public.suppliers'; END IF;
  IF to_regclass('public.price_history') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_price_history_select ON public.price_history'; END IF;
  IF to_regclass('public.price_history') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_price_history_insert ON public.price_history'; END IF;
  IF to_regclass('public.purchase_receipts') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_purchase_receipts_internal ON public.purchase_receipts'; END IF;
  IF to_regclass('public.purchase_receipt_lines') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_purchase_receipt_lines_select ON public.purchase_receipt_lines'; END IF;
  IF to_regclass('public.purchase_receipt_lines') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_purchase_receipt_lines_write ON public.purchase_receipt_lines'; END IF;
  IF to_regclass('public.stock_lots') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_stock_lots_select ON public.stock_lots'; END IF;
  IF to_regclass('public.stock_lots') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_stock_lots_write ON public.stock_lots'; END IF;
  IF to_regclass('public.lot_owner_allocations') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_lot_allocations_select ON public.lot_owner_allocations'; END IF;
  IF to_regclass('public.lot_owner_allocations') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_lot_allocations_write ON public.lot_owner_allocations'; END IF;
  IF to_regclass('public.stock_movements') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_stock_movements_select ON public.stock_movements'; END IF;
  IF to_regclass('public.stock_movements') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_stock_movements_insert ON public.stock_movements'; END IF;
  IF to_regclass('public.quality_inspections') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_quality_inspections_select ON public.quality_inspections'; END IF;
  IF to_regclass('public.quality_inspections') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_quality_inspections_write ON public.quality_inspections'; END IF;
  IF to_regclass('public.stock_reservations') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_stock_reservations_select ON public.stock_reservations'; END IF;
  IF to_regclass('public.stock_reservations') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_stock_reservations_write ON public.stock_reservations'; END IF;
  IF to_regclass('public.cost_records') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_cost_records_select ON public.cost_records'; END IF;
  IF to_regclass('public.cost_records') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_cost_records_write ON public.cost_records'; END IF;
  IF to_regclass('public.ownership_transfers') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_ownership_transfers_select ON public.ownership_transfers'; END IF;
  IF to_regclass('public.ownership_transfers') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_ownership_transfers_write ON public.ownership_transfers'; END IF;
  IF to_regclass('public.inventory_incidences') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_inventory_incidences_select ON public.inventory_incidences'; END IF;
  IF to_regclass('public.inventory_incidences') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_inventory_incidences_write ON public.inventory_incidences'; END IF;
  IF to_regclass('public.customers') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_customers_sales ON public.customers'; END IF;
  IF to_regclass('public.leads') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_leads_sales ON public.leads'; END IF;
  IF to_regclass('public.sales_orders') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_sales_orders_sales ON public.sales_orders'; END IF;
  IF to_regclass('public.sales_order_items') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_sales_order_items_sales ON public.sales_order_items'; END IF;
  IF to_regclass('public.sales_item_allocations') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_sales_item_allocations_select ON public.sales_item_allocations'; END IF;
  IF to_regclass('public.sales_item_allocations') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_sales_item_allocations_write ON public.sales_item_allocations'; END IF;
  IF to_regclass('public.payments') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_payments_sales ON public.payments'; END IF;
  IF to_regclass('public.returns') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_returns_select ON public.returns'; END IF;
  IF to_regclass('public.returns') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_returns_write ON public.returns'; END IF;
  IF to_regclass('public.shipments') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_shipments_sales ON public.shipments'; END IF;
  IF to_regclass('public.expenses') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_expenses_admin ON public.expenses'; END IF;
  IF to_regclass('public.expense_allocations') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_expense_allocations_select ON public.expense_allocations'; END IF;
  IF to_regclass('public.expense_allocations') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_expense_allocations_write ON public.expense_allocations'; END IF;
  IF to_regclass('public.owner_settlements') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_owner_settlements_select ON public.owner_settlements'; END IF;
  IF to_regclass('public.owner_settlements') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_owner_settlements_write ON public.owner_settlements'; END IF;
  IF to_regclass('public.marketing_assets') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_marketing_assets_access ON public.marketing_assets'; END IF;
  IF to_regclass('public.content_calendar') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_content_calendar_access ON public.content_calendar'; END IF;
  IF to_regclass('public.publications') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_publications_select ON public.publications'; END IF;
  IF to_regclass('public.publications') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_publications_write ON public.publications'; END IF;
  IF to_regclass('public.social_connections') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_social_connections_admin ON public.social_connections'; END IF;
  IF to_regclass('public.ads_campaigns') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_ads_campaigns_admin ON public.ads_campaigns'; END IF;
  IF to_regclass('public.ads_campaign_metrics') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_ads_campaign_metrics_admin ON public.ads_campaign_metrics'; END IF;
  IF to_regclass('public.automation_jobs') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_automation_jobs_admin ON public.automation_jobs'; END IF;
  IF to_regclass('public.automation_logs') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_automation_logs_admin ON public.automation_logs'; END IF;
  IF to_regclass('public.audit_logs') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_audit_logs_select_admin ON public.audit_logs'; END IF;
  IF to_regclass('public.audit_logs') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_audit_logs_insert_auth ON public.audit_logs'; END IF;
  IF to_regclass('public.import_batches') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_import_batches_select ON public.import_batches'; END IF;
  IF to_regclass('public.import_batches') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_import_batches_insert ON public.import_batches'; END IF;
  IF to_regclass('public.import_batch_items') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_import_batch_items_select ON public.import_batch_items'; END IF;
  IF to_regclass('public.import_batch_items') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_import_batch_items_insert ON public.import_batch_items'; END IF;
  IF to_regclass('public.lead_followups') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_lead_followups_select ON public.lead_followups'; END IF;
  IF to_regclass('public.lead_followups') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_lead_followups_write ON public.lead_followups'; END IF;
  IF to_regclass('public.brand_identity_versions') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_brand_identity_versions_select ON public.brand_identity_versions'; END IF;
  IF to_regclass('public.brand_identity_versions') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_brand_identity_versions_insert ON public.brand_identity_versions'; END IF;
  IF to_regclass('public.merchandising_asset_versions') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_merch_versions_select ON public.merchandising_asset_versions'; END IF;
  IF to_regclass('public.merchandising_asset_versions') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_merch_versions_insert ON public.merchandising_asset_versions'; END IF;
  IF to_regclass('public.owner_marketing_consents') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_owner_mkt_consents_select ON public.owner_marketing_consents'; END IF;
  IF to_regclass('public.owner_marketing_consents') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_owner_mkt_consents_write ON public.owner_marketing_consents'; END IF;
  IF to_regclass('public.creative_studio_projects') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_creative_projects_select ON public.creative_studio_projects'; END IF;
  IF to_regclass('public.creative_studio_projects') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_creative_projects_write ON public.creative_studio_projects'; END IF;
  IF to_regclass('public.creative_studio_project_versions') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_creative_project_versions_select ON public.creative_studio_project_versions'; END IF;
  IF to_regclass('public.creative_studio_project_versions') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_creative_project_versions_insert ON public.creative_studio_project_versions'; END IF;
  IF to_regclass('public.marketplace_assisted_listings') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_marketplace_listings_select ON public.marketplace_assisted_listings'; END IF;
  IF to_regclass('public.marketplace_assisted_listings') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_marketplace_listings_write ON public.marketplace_assisted_listings'; END IF;
  IF to_regclass('public.whatsapp_message_templates') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_whatsapp_templates_select ON public.whatsapp_message_templates'; END IF;
  IF to_regclass('public.whatsapp_message_templates') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_whatsapp_templates_write ON public.whatsapp_message_templates'; END IF;
  IF to_regclass('public.whatsapp_sales_interactions') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_wa_interactions_access ON public.whatsapp_sales_interactions'; END IF;
  IF to_regclass('public.whatsapp_platform_future_architecture') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_wa_future_arch_select ON public.whatsapp_platform_future_architecture'; END IF;
  IF to_regclass('public.ads_ad_sets') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_ads_ad_sets_select ON public.ads_ad_sets'; END IF;
  IF to_regclass('public.ads_ad_sets') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_ads_ad_sets_write ON public.ads_ad_sets'; END IF;
  IF to_regclass('public.ads_creatives_and_ads') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_ads_creatives_select ON public.ads_creatives_and_ads'; END IF;
  IF to_regclass('public.ads_creatives_and_ads') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_ads_creatives_write ON public.ads_creatives_and_ads'; END IF;
  IF to_regclass('public.ads_owner_spend_allocations') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_ads_owner_alloc_select ON public.ads_owner_spend_allocations'; END IF;
  IF to_regclass('public.ads_owner_spend_allocations') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_ads_owner_alloc_write ON public.ads_owner_spend_allocations'; END IF;
  IF to_regclass('public.automation_event_queue') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_automation_queue_select ON public.automation_event_queue'; END IF;
  IF to_regclass('public.automation_event_queue') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_automation_queue_write ON public.automation_event_queue'; END IF;
  IF to_regclass('public.business_settings') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_business_settings_read ON public.business_settings'; END IF;
  IF to_regclass('public.business_settings') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_business_settings_admin ON public.business_settings'; END IF;
  IF to_regclass('public.categories') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_categories_read ON public.categories'; END IF;
  IF to_regclass('public.categories') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_categories_write ON public.categories'; END IF;
  IF to_regclass('public.product_media') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_product_media_read ON public.product_media'; END IF;
  IF to_regclass('public.product_media') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_product_media_write ON public.product_media'; END IF;
  IF to_regclass('public.owner_product_terms') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_owner_product_terms_read ON public.owner_product_terms'; END IF;
  IF to_regclass('public.owner_product_terms') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_owner_product_terms_write ON public.owner_product_terms'; END IF;
  IF to_regclass('public.purchase_orders') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_po_read ON public.purchase_orders'; END IF;
  IF to_regclass('public.purchase_orders') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_po_write ON public.purchase_orders'; END IF;
  IF to_regclass('public.purchase_order_items') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_poi_read ON public.purchase_order_items'; END IF;
  IF to_regclass('public.purchase_order_items') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_poi_write ON public.purchase_order_items'; END IF;
  IF to_regclass('public.stock_adjustments') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_stock_adj_read ON public.stock_adjustments'; END IF;
  IF to_regclass('public.stock_adjustments') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_stock_adj_insert ON public.stock_adjustments'; END IF;
  IF to_regclass('public.sales_return_items') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_sri_read ON public.sales_return_items'; END IF;
  IF to_regclass('public.sales_return_items') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_sri_insert ON public.sales_return_items'; END IF;
  IF to_regclass('public.sales_attribution') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_sales_attr_read ON public.sales_attribution'; END IF;
  IF to_regclass('public.sales_attribution') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_sales_attr_write ON public.sales_attribution'; END IF;
  IF to_regclass('public.owner_settlement_items') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_osi_read ON public.owner_settlement_items'; END IF;
  IF to_regclass('public.owner_settlement_items') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_osi_write ON public.owner_settlement_items'; END IF;
  IF to_regclass('public.owner_payment_records') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_opr_read ON public.owner_payment_records'; END IF;
  IF to_regclass('public.owner_payment_records') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_opr_write ON public.owner_payment_records'; END IF;
  IF to_regclass('public.notifications') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_notif_read ON public.notifications'; END IF;
  IF to_regclass('public.notifications') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS pol_notif_update_read ON public.notifications'; END IF;
END;
$$;

-- 4. VISTAS PROPIAS DE REAL TWS (orden inverso de dependencias, sin CASCADE)
DROP VIEW IF EXISTS public.v_marketing_summary;
DROP VIEW IF EXISTS public.v_settlements_summary;
DROP VIEW IF EXISTS public.v_product_costs_summary;
DROP VIEW IF EXISTS public.v_sales_summary;
DROP VIEW IF EXISTS public.v_purchase_summary;
DROP VIEW IF EXISTS public.v_available_inventory;
DROP VIEW IF EXISTS public.v_sales_order_profitability;
DROP VIEW IF EXISTS public.v_report_inventory_by_quality_state;
DROP VIEW IF EXISTS public.v_report_inventory_by_category;
DROP VIEW IF EXISTS public.v_public_available_catalog;
DROP VIEW IF EXISTS public.v_owner_financial_pnl;
DROP VIEW IF EXISTS public.v_inventory_by_owner_and_lot;
DROP VIEW IF EXISTS public.v_inventory_consolidated_by_sku;

-- 5. TABLAS PROPIAS DE REAL TWS (orden topológico inverso hijo -> padre, sin CASCADE)
--    Nota: public.profiles se verifica antes de eliminar para protegerla si tuviera
--    dependencias externas ajenas a REAL TWS o si no perteneciera a este proyecto.
DROP TABLE IF EXISTS public.sales_attribution;
DROP TABLE IF EXISTS public.owner_payment_records;
DROP TABLE IF EXISTS public.owner_settlement_items;
DROP TABLE IF EXISTS public.sales_return_items;
DROP TABLE IF EXISTS public.stock_adjustments;
DROP TABLE IF EXISTS public.purchase_order_items;
DROP TABLE IF EXISTS public.purchase_orders;
DROP TABLE IF EXISTS public.owner_product_terms;
DROP TABLE IF EXISTS public.product_media;
DROP TABLE IF EXISTS public.categories;
DROP TABLE IF EXISTS public.notifications;
DROP TABLE IF EXISTS public.business_settings;
DROP TABLE IF EXISTS public.automation_event_queue;
DROP TABLE IF EXISTS public.ads_owner_spend_allocations;
DROP TABLE IF EXISTS public.ads_creatives_and_ads;
DROP TABLE IF EXISTS public.ads_ad_sets;
DROP TABLE IF EXISTS public.whatsapp_platform_future_architecture;
DROP TABLE IF EXISTS public.whatsapp_sales_interactions;
DROP TABLE IF EXISTS public.whatsapp_message_templates;
DROP TABLE IF EXISTS public.marketplace_assisted_listings;
DROP TABLE IF EXISTS public.creative_studio_project_versions;
DROP TABLE IF EXISTS public.creative_studio_projects;
DROP TABLE IF EXISTS public.owner_marketing_consents;
DROP TABLE IF EXISTS public.merchandising_asset_versions;
DROP TABLE IF EXISTS public.brand_identity_versions;
DROP TABLE IF EXISTS public.lead_followups;
DROP TABLE IF EXISTS public.import_batch_items;
DROP TABLE IF EXISTS public.import_batches;
DROP TABLE IF EXISTS public.audit_logs;
DROP TABLE IF EXISTS public.automation_logs;
DROP TABLE IF EXISTS public.automation_jobs;
DROP TABLE IF EXISTS public.ads_campaign_metrics;
DROP TABLE IF EXISTS public.ads_campaigns;
DROP TABLE IF EXISTS public.social_connections;
DROP TABLE IF EXISTS public.publications;
DROP TABLE IF EXISTS public.content_calendar;
DROP TABLE IF EXISTS public.marketing_assets;
DROP TABLE IF EXISTS public.owner_settlements;
DROP TABLE IF EXISTS public.expense_allocations;
DROP TABLE IF EXISTS public.expenses;
DROP TABLE IF EXISTS public.shipments;
DROP TABLE IF EXISTS public.returns;
DROP TABLE IF EXISTS public.payments;
DROP TABLE IF EXISTS public.sales_item_allocations;
DROP TABLE IF EXISTS public.sales_order_items;
DROP TABLE IF EXISTS public.sales_orders;
DROP TABLE IF EXISTS public.leads;
DROP TABLE IF EXISTS public.customers;
DROP TABLE IF EXISTS public.inventory_incidences;
DROP TABLE IF EXISTS public.ownership_transfers;
DROP TABLE IF EXISTS public.cost_records;
DROP TABLE IF EXISTS public.stock_reservations;
DROP TABLE IF EXISTS public.quality_inspections;
DROP TABLE IF EXISTS public.stock_movements;
DROP TABLE IF EXISTS public.lot_owner_allocations;
DROP TABLE IF EXISTS public.stock_lots;
DROP TABLE IF EXISTS public.purchase_receipt_lines;
DROP TABLE IF EXISTS public.purchase_receipts;
DROP TABLE IF EXISTS public.price_history;
DROP TABLE IF EXISTS public.suppliers;
DROP TABLE IF EXISTS public.product_variants;
DROP TABLE IF EXISTS public.products;
DROP TABLE IF EXISTS public.owner_agreements;
DO $$
DECLARE
  v_is_real_tws BOOLEAN := false;
  v_ext_refs INTEGER := 0;
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    SELECT (
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'linked_owner_id')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'owner_portal_enabled')
    ) INTO v_is_real_tws;

    SELECT count(*)
    INTO v_ext_refs
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = src.relnamespace
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.profiles'::regclass
      AND NOT (ns.nspname = 'public' AND src.relname = 'profiles');

    IF v_is_real_tws AND v_ext_refs = 0 THEN
      DROP TABLE public.profiles;
    ELSE
      RAISE NOTICE 'public.profiles conservada: v_is_real_tws=%, dependencias_externas=%', v_is_real_tws, v_ext_refs;
    END IF;
  END IF;
END;
$$;
DROP TABLE IF EXISTS public.owners;

-- 6. FUNCIONES DE REAL TWS (sin CASCADE)
DROP FUNCTION IF EXISTS public.fn_safe_ensure_policy;
DROP FUNCTION IF EXISTS public.fn_dispatch_idempotent_automation_event;
DROP FUNCTION IF EXISTS public.fn_enforce_meta_ads_control_rules;
DROP FUNCTION IF EXISTS public.fn_validate_whatsapp_buyer_message_security;
DROP FUNCTION IF EXISTS public.fn_validate_social_publication_rules;
DROP FUNCTION IF EXISTS public.fn_validate_creative_studio_project;
DROP FUNCTION IF EXISTS public.fn_tx_cancel_sales_order;
DROP FUNCTION IF EXISTS public.fn_tx_reserve_order_allocations;
DROP FUNCTION IF EXISTS public.fn_guard_unconfirmed_order_item_edit;
DROP FUNCTION IF EXISTS public.fn_allocate_approved_expense;
DROP FUNCTION IF EXISTS public.fn_tx_record_inventory_adjustment;
DROP FUNCTION IF EXISTS public.fn_tx_process_customer_return;
DROP FUNCTION IF EXISTS public.fn_tx_dispatch_stock;
DROP FUNCTION IF EXISTS public.fn_tx_release_reservation;
DROP FUNCTION IF EXISTS public.fn_tx_reserve_stock;
DROP FUNCTION IF EXISTS public.fn_tx_receive_purchase_order;
DROP FUNCTION IF EXISTS public.fn_execute_opening_inventory_import_batch;
DROP FUNCTION IF EXISTS public.fn_authorize_private_document_access;
DROP FUNCTION IF EXISTS public.fn_log_security_event;
DROP FUNCTION IF EXISTS public.fn_admin_update_user_role_and_access;
DROP FUNCTION IF EXISTS public.fn_handle_new_auth_user;
DROP FUNCTION IF EXISTS public.fn_prevent_profile_self_escalation;
DROP FUNCTION IF EXISTS public.fn_create_owner_settlement;
DROP FUNCTION IF EXISTS public.fn_execute_ownership_transfer;
DROP FUNCTION IF EXISTS public.fn_allocate_sale_item_to_lot;
DROP FUNCTION IF EXISTS public.fn_record_quality_inspection;
DROP FUNCTION IF EXISTS public.fn_record_audit_log;
DROP FUNCTION IF EXISTS public.fn_can_owner_view;
DROP FUNCTION IF EXISTS public.fn_has_any_role;
DROP FUNCTION IF EXISTS public.fn_is_sales_or_above;
DROP FUNCTION IF EXISTS public.fn_can_manage_marketing;
DROP FUNCTION IF EXISTS public.fn_can_manage_sales;
DROP FUNCTION IF EXISTS public.fn_is_operator_or_admin;
DROP FUNCTION IF EXISTS public.fn_is_admin;
DROP FUNCTION IF EXISTS public.fn_current_user_role;
DROP FUNCTION IF EXISTS public.update_updated_at_column;
DROP FUNCTION IF EXISTS public.fn_prevent_ledger_mutation;
DROP FUNCTION IF EXISTS public.fn_set_updated_at;

-- 7. TIPO ENUM PROPIO DE REAL TWS (solo si ninguna columna externa depende de él)
DO $$
DECLARE
  v_type_refs INTEGER := 0;
BEGIN
  IF to_regtype('public.app_role') IS NOT NULL THEN
    SELECT count(*)
    INTO v_type_refs
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE a.atttypid = 'public.app_role'::regtype
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND n.nspname = 'public';

    IF v_type_refs = 0 THEN
      DROP TYPE public.app_role;
    ELSE
      RAISE NOTICE 'public.app_role conservado porque aún tiene % columna(s) dependiente(s).', v_type_refs;
    END IF;
  END IF;
END;
$$;

COMMIT;

-- 8. VERIFICACIÓN POST-LIMPIEZA
SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('owners','products','stock_lots','sales_orders','business_settings')) AS tablas_core_realtws_restantes,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname LIKE 'fn_%') AS funciones_fn_restantes,
  (SELECT to_regtype('public.app_role') IS NOT NULL) AS app_role_restante;
