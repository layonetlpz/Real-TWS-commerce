-- ============================================================================
-- REAL TWS COMMERCE SYSTEM — 03_FIX_REAL_TWS_ROLE_FUNCTIONS.sql
-- ============================================================================
-- PROPÓSITO:
--   Corregir el error:
--     ERROR: 42883: function public.fn_has_any_role(text[]) does not exist
--   creando de forma segura e idempotente la función public.fn_has_any_role(text[])
--   y asegurando la consistencia de las funciones auxiliares de autorización RBAC
--   sobre public.profiles y public.app_role.
--
-- SEGURIDAD Y COMPATIBILIDAD:
--   - NO elimina tablas, productos, usuarios, perfiles ni registros comerciales.
--   - NO duplica políticas RLS ni triggers existentes.
--   - Utiliza SECURITY DEFINER + SET search_path = public únicamente para evitar
--     recursión RLS al consultar public.profiles (con FORCE ROW LEVEL SECURITY).
--   - Restringe EXECUTE a authenticated y service_role (revoca de PUBLIC).
-- ============================================================================

BEGIN;

-- 1. Asegurar función base public.fn_current_user_role()
--    Lee el rol activo del usuario autenticado desde public.profiles sin recursión RLS.
CREATE OR REPLACE FUNCTION public.fn_current_user_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.is_active = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.fn_current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_current_user_role() TO authenticated, service_role;

-- 2. Asegurar public.fn_is_admin() consistente con fn_current_user_role()
CREATE OR REPLACE FUNCTION public.fn_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.fn_current_user_role() = 'ADMIN', false);
$$;

REVOKE ALL ON FUNCTION public.fn_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_is_admin() TO authenticated, service_role;

-- 3. Crear public.fn_has_any_role(text[])
--    Utilizada por políticas RLS en módulos 0015 (lead_followups),
--    0016 (brand_identity_versions, merchandising_asset_versions) y
--    0017 (owner_marketing_consents, creative_studio_projects, creative_studio_project_versions).
--    Compara public.fn_current_user_role()::TEXT = ANY(p_roles) para evitar
--    errores de casteo 22P02 si el arreglo contiene algún texto no incluido en el ENUM
--    o si está vacío/NULL, devolviendo siempre BOOLEAN (false por defecto).
CREATE OR REPLACE FUNCTION public.fn_has_any_role(p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.fn_current_user_role()::TEXT = ANY(p_roles),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.fn_has_any_role(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_has_any_role(TEXT[]) TO authenticated, service_role;

-- 4. Comprobaciones automáticas de existencia, firma, seguridad y permisos
DO $$
DECLARE
  v_oid OID;
  v_secdef BOOLEAN;
  v_config TEXT[];
BEGIN
  v_oid := to_regprocedure('public.fn_has_any_role(text[])');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: public.fn_has_any_role(text[]) no existe.';
  END IF;

  SELECT prosecdef, proconfig
  INTO v_secdef, v_config
  FROM pg_proc
  WHERE oid = v_oid;

  IF NOT v_secdef THEN
    RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: public.fn_has_any_role(text[]) debe tener SECURITY DEFINER.';
  END IF;

  IF v_config IS NULL OR NOT ('search_path=public' = ANY(v_config)) THEN
    RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: public.fn_has_any_role(text[]) debe fijar search_path=public.';
  END IF;

  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: el rol authenticated no tiene EXECUTE sobre public.fn_has_any_role(text[]).';
  END IF;

  IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: el rol service_role no tiene EXECUTE sobre public.fn_has_any_role(text[]).';
  END IF;

  IF public.fn_has_any_role(NULL::TEXT[]) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: fn_has_any_role(NULL) debe retornar false.';
  END IF;

  IF public.fn_has_any_role(ARRAY[]::TEXT[]) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: fn_has_any_role(ARRAY[]::text[]) debe retornar false.';
  END IF;
END;
$$;

COMMIT;

-- ============================================================================
-- CONSULTAS DE VERIFICACIÓN (SOLO LECTURA)
-- ============================================================================

-- A. Confirmar firma exacta, SECURITY DEFINER, search_path y permisos de ejecución
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  pg_get_function_result(p.oid) AS return_type,
  p.prosecdef AS is_security_definer,
  p.proconfig AS function_config,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'fn_current_user_role',
    'fn_is_admin',
    'fn_is_operator_or_admin',
    'fn_can_manage_sales',
    'fn_can_manage_marketing',
    'fn_is_sales_or_above',
    'fn_can_owner_view',
    'fn_has_any_role'
  )
ORDER BY p.proname;

-- B. Confirmar políticas RLS que dependen de fn_has_any_role (cuando 0015-0017 estén aplicados)
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    COALESCE(qual, '') ILIKE '%fn_has_any_role%'
    OR COALESCE(with_check, '') ILIKE '%fn_has_any_role%'
  )
ORDER BY tablename, policyname;
