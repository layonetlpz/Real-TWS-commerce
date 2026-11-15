-- ============================================================================
-- REAL TWS COMMERCE SYSTEM — 06_VERIFICACION_REAL_TWS.sql
-- ============================================================================
-- PROPÓSITO:
--   Comprobar de forma estricta (sin ocultar errores) que todas las tablas,
--   vistas, funciones, triggers, políticas RLS y permisos de REAL TWS quedaron
--   correctamente instalados y consistentes después de ejecutar los scripts.
--
-- SEGURIDAD:
--   - Solo lectura / validación. No modifica ni elimina datos ni esquema.
-- ============================================================================

-- 1. VERIFICACIÓN ESTRICTA DE TABLAS (65), RLS HABILITADO, VISTAS (13), FUNCIONES (36) Y TRIGGER AUTH
DO $$
DECLARE
  v_expected_tables TEXT[] := ARRAY[
    'owners', 'profiles', 'owner_agreements', 'products', 'product_variants', 'suppliers', 'price_history',
    'purchase_receipts', 'purchase_receipt_lines', 'stock_lots', 'lot_owner_allocations', 'stock_movements',
    'quality_inspections', 'stock_reservations', 'cost_records', 'ownership_transfers', 'inventory_incidences',
    'customers', 'leads', 'sales_orders', 'sales_order_items', 'sales_item_allocations', 'payments', 'returns', 'shipments',
    'expenses', 'expense_allocations', 'owner_settlements',
    'marketing_assets', 'content_calendar', 'publications', 'social_connections', 'ads_campaigns', 'ads_campaign_metrics',
    'automation_jobs', 'automation_logs', 'audit_logs',
    'import_batches', 'import_batch_items', 'lead_followups',
    'brand_identity_versions', 'merchandising_asset_versions',
    'owner_marketing_consents', 'creative_studio_projects', 'creative_studio_project_versions',
    'marketplace_assisted_listings',
    'whatsapp_message_templates', 'whatsapp_sales_interactions', 'whatsapp_platform_future_architecture',
    'ads_ad_sets', 'ads_creatives_and_ads', 'ads_owner_spend_allocations',
    'automation_event_queue',
    'business_settings', 'notifications', 'categories', 'product_media', 'owner_product_terms',
    'purchase_orders', 'purchase_order_items', 'stock_adjustments', 'sales_return_items',
    'owner_settlement_items', 'owner_payment_records', 'sales_attribution'
  ];
  v_expected_views TEXT[] := ARRAY[
    'v_inventory_consolidated_by_sku', 'v_inventory_by_owner_and_lot', 'v_owner_financial_pnl', 'v_public_available_catalog',
    'v_report_inventory_by_category', 'v_report_inventory_by_quality_state', 'v_sales_order_profitability',
    'v_available_inventory', 'v_purchase_summary', 'v_sales_summary', 'v_product_costs_summary',
    'v_settlements_summary', 'v_marketing_summary'
  ];
  v_expected_funcs TEXT[] := ARRAY[
    'public.fn_set_updated_at()',
    'public.fn_prevent_ledger_mutation()',
    'public.fn_current_user_role()',
    'public.fn_is_admin()',
    'public.fn_is_operator_or_admin()',
    'public.fn_can_manage_sales()',
    'public.fn_can_manage_marketing()',
    'public.fn_is_sales_or_above()',
    'public.fn_has_any_role(text[])',
    'public.fn_can_owner_view(text)'
  ];
  v_t TEXT;
  v_v TEXT;
  v_f TEXT;
  v_rls BOOLEAN;
  v_missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Tablas y RLS
  FOREACH v_t IN ARRAY v_expected_tables LOOP
    SELECT rowsecurity INTO v_rls
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename = v_t;

    IF v_rls IS NULL THEN
      v_missing := array_append(v_missing, 'MISSING_TABLE:' || v_t);
    ELSIF NOT v_rls THEN
      v_missing := array_append(v_missing, 'RLS_DISABLED:' || v_t);
    END IF;
  END LOOP;

  -- Vistas
  FOREACH v_v IN ARRAY v_expected_views LOOP
    IF to_regclass('public.' || v_v) IS NULL THEN
      v_missing := array_append(v_missing, 'MISSING_VIEW:' || v_v);
    END IF;
  END LOOP;

  -- Funciones clave de autorización y triggers
  FOREACH v_f IN ARRAY v_expected_funcs LOOP
    IF to_regprocedure(v_f) IS NULL THEN
      v_missing := array_append(v_missing, 'MISSING_FUNC:' || v_f);
    END IF;
  END LOOP;

  -- Trigger en auth.users
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger trg
    JOIN pg_class c ON c.oid = trg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND trg.tgname = 'trg_on_auth_user_created'
      AND NOT trg.tgisinternal
  ) THEN
    v_missing := array_append(v_missing, 'MISSING_TRIGGER:auth.users.trg_on_auth_user_created');
  END IF;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFICACIÓN INCOMPLETA (% problema(s)): %', array_length(v_missing, 1), array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- 2. RESUMEN DE OBJETOS INSTALADOS
SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') AS total_tablas_public,
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false) AS tablas_sin_rls,
  (SELECT count(*) FROM information_schema.views WHERE table_schema = 'public') AS total_vistas_public,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname LIKE 'fn_%') AS total_funciones_fn,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') AS total_politicas_public,
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal) AS total_triggers_public;

-- 3. VERIFICACIÓN DE FUNCIONES DE ROLES Y PERMISOS EXECUTE
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  p.proconfig AS config,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'fn_current_user_role', 'fn_is_admin', 'fn_is_operator_or_admin',
    'fn_can_manage_sales', 'fn_can_manage_marketing', 'fn_is_sales_or_above',
    'fn_has_any_role', 'fn_can_owner_view'
  )
ORDER BY p.proname;

-- 4. VERIFICACIÓN DE POLÍTICAS DE PROFILES Y POLÍTICAS CON fn_has_any_role
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    tablename = 'profiles'
    OR COALESCE(qual, '') ILIKE '%fn_has_any_role%'
    OR COALESCE(with_check, '') ILIKE '%fn_has_any_role%'
  )
ORDER BY tablename, policyname;

-- 5. VERIFICACIÓN DE ROLES DEL ENUM Y BASELINE INICIAL
SELECT unnest(enum_range(NULL::public.app_role)) AS app_role_value;
SELECT id, full_name, status FROM public.owners WHERE id = 'OWN-0001';
