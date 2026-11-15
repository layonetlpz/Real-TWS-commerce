-- ============================================================================
-- REAL TWS COMMERCE SYSTEM — 01_CLEANUP_PREVIOUS_REAL_TWS.sql
-- ============================================================================
-- PROPÓSITO:
--   Eliminar ÚNICAMENTE los objetos propios creados por intentos anteriores
--   de instalación de REAL TWS en PostgreSQL / Supabase, dejando la base
--   lista para ejecutar 02_REAL_TWS_SETUP.sql desde cero.
--
-- GARANTÍAS DE SEGURIDAD:
--   - NO ejecuta DROP SCHEMA public CASCADE.
--   - NO elimina esquemas internos de Supabase (auth, storage, realtime, etc.).
--   - NO elimina usuarios ni registros de auth.users.
--   - NO elimina extensiones (como pgcrypto).
--   - NO elimina buckets ni archivos físicos (storage.buckets / storage.objects).
--   - NO ejecuta TRUNCATE indiscriminado ni toca tablas ajenas a REAL TWS.
--   - 100% idempotente (usa IF EXISTS en todas las sentencias).
-- ============================================================================

BEGIN;

-- 1. Trigger de REAL TWS sobre auth.users (sin tocar filas de auth.users)
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;

-- 2. Políticas de REAL TWS sobre storage.objects (sin borrar buckets ni archivos)
DROP POLICY IF EXISTS pol_private_docs_admin_operator ON storage.objects;
DROP POLICY IF EXISTS pol_public_catalog_media_read ON storage.objects;
DROP POLICY IF EXISTS pol_public_catalog_media_write ON storage.objects;
DROP POLICY IF EXISTS pol_product_public_read ON storage.objects;
DROP POLICY IF EXISTS pol_product_public_write ON storage.objects;
DROP POLICY IF EXISTS pol_product_originals_priv ON storage.objects;
DROP POLICY IF EXISTS pol_marketing_assets_priv ON storage.objects;
DROP POLICY IF EXISTS pol_owner_docs_read ON storage.objects;
DROP POLICY IF EXISTS pol_owner_docs_admin_write ON storage.objects;

-- 3. Vistas de REAL TWS (13 vistas)
DROP VIEW IF EXISTS public.v_marketing_summary CASCADE;
DROP VIEW IF EXISTS public.v_settlements_summary CASCADE;
DROP VIEW IF EXISTS public.v_product_costs_summary CASCADE;
DROP VIEW IF EXISTS public.v_sales_summary CASCADE;
DROP VIEW IF EXISTS public.v_purchase_summary CASCADE;
DROP VIEW IF EXISTS public.v_available_inventory CASCADE;
DROP VIEW IF EXISTS public.v_sales_order_profitability CASCADE;
DROP VIEW IF EXISTS public.v_report_inventory_by_quality_state CASCADE;
DROP VIEW IF EXISTS public.v_report_inventory_by_category CASCADE;
DROP VIEW IF EXISTS public.v_public_available_catalog CASCADE;
DROP VIEW IF EXISTS public.v_owner_financial_pnl CASCADE;
DROP VIEW IF EXISTS public.v_inventory_by_owner_and_lot CASCADE;
DROP VIEW IF EXISTS public.v_inventory_consolidated_by_sku CASCADE;

-- 4. Tablas de REAL TWS (65 tablas; elimina sus triggers, índices, constraints y políticas RLS propias)
DROP TABLE IF EXISTS public.sales_attribution CASCADE;
DROP TABLE IF EXISTS public.owner_payment_records CASCADE;
DROP TABLE IF EXISTS public.owner_settlement_items CASCADE;
DROP TABLE IF EXISTS public.sales_return_items CASCADE;
DROP TABLE IF EXISTS public.stock_adjustments CASCADE;
DROP TABLE IF EXISTS public.purchase_order_items CASCADE;
DROP TABLE IF EXISTS public.purchase_orders CASCADE;
DROP TABLE IF EXISTS public.owner_product_terms CASCADE;
DROP TABLE IF EXISTS public.product_media CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.business_settings CASCADE;
DROP TABLE IF EXISTS public.automation_event_queue CASCADE;
DROP TABLE IF EXISTS public.ads_owner_spend_allocations CASCADE;
DROP TABLE IF EXISTS public.ads_creatives_and_ads CASCADE;
DROP TABLE IF EXISTS public.ads_ad_sets CASCADE;
DROP TABLE IF EXISTS public.whatsapp_platform_future_architecture CASCADE;
DROP TABLE IF EXISTS public.whatsapp_sales_interactions CASCADE;
DROP TABLE IF EXISTS public.whatsapp_message_templates CASCADE;
DROP TABLE IF EXISTS public.marketplace_assisted_listings CASCADE;
DROP TABLE IF EXISTS public.creative_studio_project_versions CASCADE;
DROP TABLE IF EXISTS public.creative_studio_projects CASCADE;
DROP TABLE IF EXISTS public.owner_marketing_consents CASCADE;
DROP TABLE IF EXISTS public.merchandising_asset_versions CASCADE;
DROP TABLE IF EXISTS public.brand_identity_versions CASCADE;
DROP TABLE IF EXISTS public.lead_followups CASCADE;
DROP TABLE IF EXISTS public.import_batch_items CASCADE;
DROP TABLE IF EXISTS public.import_batches CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.automation_logs CASCADE;
DROP TABLE IF EXISTS public.automation_jobs CASCADE;
DROP TABLE IF EXISTS public.ads_campaign_metrics CASCADE;
DROP TABLE IF EXISTS public.ads_campaigns CASCADE;
DROP TABLE IF EXISTS public.social_connections CASCADE;
DROP TABLE IF EXISTS public.publications CASCADE;
DROP TABLE IF EXISTS public.content_calendar CASCADE;
DROP TABLE IF EXISTS public.marketing_assets CASCADE;
DROP TABLE IF EXISTS public.owner_settlements CASCADE;
DROP TABLE IF EXISTS public.expense_allocations CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.shipments CASCADE;
DROP TABLE IF EXISTS public.returns CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.sales_item_allocations CASCADE;
DROP TABLE IF EXISTS public.sales_order_items CASCADE;
DROP TABLE IF EXISTS public.sales_orders CASCADE;
DROP TABLE IF EXISTS public.leads CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.inventory_incidences CASCADE;
DROP TABLE IF EXISTS public.ownership_transfers CASCADE;
DROP TABLE IF EXISTS public.cost_records CASCADE;
DROP TABLE IF EXISTS public.stock_reservations CASCADE;
DROP TABLE IF EXISTS public.quality_inspections CASCADE;
DROP TABLE IF EXISTS public.stock_movements CASCADE;
DROP TABLE IF EXISTS public.lot_owner_allocations CASCADE;
DROP TABLE IF EXISTS public.stock_lots CASCADE;
DROP TABLE IF EXISTS public.purchase_receipt_lines CASCADE;
DROP TABLE IF EXISTS public.purchase_receipts CASCADE;
DROP TABLE IF EXISTS public.price_history CASCADE;
DROP TABLE IF EXISTS public.suppliers CASCADE;
DROP TABLE IF EXISTS public.product_variants CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.owner_agreements CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.owners CASCADE;

-- 5. Funciones de REAL TWS (37 funciones)
DROP FUNCTION IF EXISTS public.fn_safe_ensure_policy CASCADE;
DROP FUNCTION IF EXISTS public.fn_dispatch_idempotent_automation_event CASCADE;
DROP FUNCTION IF EXISTS public.fn_enforce_meta_ads_control_rules CASCADE;
DROP FUNCTION IF EXISTS public.fn_validate_whatsapp_buyer_message_security CASCADE;
DROP FUNCTION IF EXISTS public.fn_validate_social_publication_rules CASCADE;
DROP FUNCTION IF EXISTS public.fn_validate_creative_studio_project CASCADE;
DROP FUNCTION IF EXISTS public.fn_tx_cancel_sales_order CASCADE;
DROP FUNCTION IF EXISTS public.fn_tx_reserve_order_allocations CASCADE;
DROP FUNCTION IF EXISTS public.fn_guard_unconfirmed_order_item_edit CASCADE;
DROP FUNCTION IF EXISTS public.fn_allocate_approved_expense CASCADE;
DROP FUNCTION IF EXISTS public.fn_tx_record_inventory_adjustment CASCADE;
DROP FUNCTION IF EXISTS public.fn_tx_process_customer_return CASCADE;
DROP FUNCTION IF EXISTS public.fn_tx_dispatch_stock CASCADE;
DROP FUNCTION IF EXISTS public.fn_tx_release_reservation CASCADE;
DROP FUNCTION IF EXISTS public.fn_tx_reserve_stock CASCADE;
DROP FUNCTION IF EXISTS public.fn_tx_receive_purchase_order CASCADE;
DROP FUNCTION IF EXISTS public.fn_execute_opening_inventory_import_batch CASCADE;
DROP FUNCTION IF EXISTS public.fn_authorize_private_document_access CASCADE;
DROP FUNCTION IF EXISTS public.fn_log_security_event CASCADE;
DROP FUNCTION IF EXISTS public.fn_admin_update_user_role_and_access CASCADE;
DROP FUNCTION IF EXISTS public.fn_handle_new_auth_user CASCADE;
DROP FUNCTION IF EXISTS public.fn_prevent_profile_self_escalation CASCADE;
DROP FUNCTION IF EXISTS public.fn_create_owner_settlement CASCADE;
DROP FUNCTION IF EXISTS public.fn_execute_ownership_transfer CASCADE;
DROP FUNCTION IF EXISTS public.fn_allocate_sale_item_to_lot CASCADE;
DROP FUNCTION IF EXISTS public.fn_record_quality_inspection CASCADE;
DROP FUNCTION IF EXISTS public.fn_record_audit_log CASCADE;
DROP FUNCTION IF EXISTS public.fn_can_owner_view CASCADE;
DROP FUNCTION IF EXISTS public.fn_has_any_role CASCADE;
DROP FUNCTION IF EXISTS public.fn_is_sales_or_above CASCADE;
DROP FUNCTION IF EXISTS public.fn_can_manage_marketing CASCADE;
DROP FUNCTION IF EXISTS public.fn_can_manage_sales CASCADE;
DROP FUNCTION IF EXISTS public.fn_is_operator_or_admin CASCADE;
DROP FUNCTION IF EXISTS public.fn_is_admin CASCADE;
DROP FUNCTION IF EXISTS public.fn_current_user_role CASCADE;
DROP FUNCTION IF EXISTS public.fn_prevent_ledger_mutation CASCADE;
DROP FUNCTION IF EXISTS public.fn_set_updated_at CASCADE;

-- 6. Tipo ENUM personalizado de REAL TWS
DROP TYPE IF EXISTS public.app_role CASCADE;

COMMIT;
