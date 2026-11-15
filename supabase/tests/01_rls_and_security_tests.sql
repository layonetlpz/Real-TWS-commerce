-- =============================================================================
-- PRUEBAS DE SEGURIDAD, INTEGRIDAD Y RLS (EJECUTADAS EN TRANSACCIÓN REVERTIDA)
-- Regla: Todo se ejecuta dentro de BEGIN ... ROLLBACK para no dejar datos de prueba.
-- =============================================================================

BEGIN;

-- 1. Verificar que todas las tablas críticas tienen RLS habilitado
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ')
  INTO v_missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity = false
    AND c.relname IN (
      'profiles', 'owners', 'owner_agreements', 'products', 'product_variants',
      'lot_owner_allocations', 'stock_movements', 'sales_orders',
      'sales_item_allocations', 'expenses', 'owner_settlements', 'audit_logs'
    );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'FALLO RLS: Las siguientes tablas no tienen RLS activo: %', v_missing;
  END IF;
END
$$;

-- 2. Prueba negativa: impedir mutación de libros inmutables (stock_movements / audit_logs)
DO $$
DECLARE
  v_blocked BOOLEAN := false;
BEGIN
  INSERT INTO public.audit_logs (actor_email, action, entity_name, entity_id, detail)
  VALUES ('qa@realtws.test', 'QA_TEST', 'audit_logs', 'TEST-1', '{}'::jsonb);

  BEGIN
    UPDATE public.audit_logs SET action = 'TAMPERED' WHERE entity_id = 'TEST-1';
  EXCEPTION WHEN OTHERS THEN
    v_blocked := true;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FALLO INMUTABILIDAD: audit_logs permitió UPDATE.';
  END IF;
END
$$;

-- 3. Verificar existencia de buckets privados obligatorios
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM storage.buckets
  WHERE id IN ('product-originals', 'product-public', 'marketing-assets', 'invoices', 'owner-documents');

  IF v_count < 5 THEN
    RAISE EXCEPTION 'FALLO STORAGE: Faltan buckets obligatorios (encontrados: %/5).', v_count;
  END IF;
END
$$;

ROLLBACK;
