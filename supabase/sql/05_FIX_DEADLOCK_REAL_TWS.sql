-- ============================================================================
-- REAL TWS COMMERCE SYSTEM — 05_FIX_DEADLOCK_REAL_TWS.sql
-- ============================================================================
-- PROPÓSITO:
--   Corregir de raíz las condiciones que provocaron ERROR 40P01 (deadlock) y
--   asegurar de forma ordenada, por fases cortas e idempotentes:
--     1) Sin ejecución concurrente con otras sesiones DDL sobre public.
--     2) Creación previa de todas las funciones de autorización (incluida
--        public.fn_has_any_role(text[])).
--     3) Activación de RLS solo en tablas que aún no la tengan habilitada,
--        en orden alfabético determinístico (evita AccessExclusiveLock redundantes
--        y ciclos de bloqueo).
--     4) Creación condicional (sin DROP/recreación innecesaria) de políticas RLS
--        dependientes de fn_has_any_role sobre tablas ya existentes.
--
-- RESTRICCIONES DE SEGURIDAD:
--   - NO borra tablas, usuarios de Auth, perfiles, productos, inventario ni datos.
--   - NO oculta errores con bloques EXCEPTION permisivos.
--   - Usa SET LOCAL lock_timeout = '10s' en cada fase corta.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FASE 0: PRE-CHECK DE CONCURRENCIA (ABORTA SI HAY OTRA SESIÓN BLOQUEANDO)
-- ----------------------------------------------------------------------------
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
    RAISE EXCEPTION 'ABORTADO PREVENTIVAMENTE: hay % bloqueo(s) exclusivo(s) activo(s) en el esquema public por otra sesión. Cierra otras pestañas de SQL Editor o procesos migratorios antes de continuar.', v_blocking_count;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- FASE 1: FUNCIONES DE AUTORIZACIÓN RBAC (ORDEN PREVIO A POLÍTICAS RLS)
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

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

CREATE OR REPLACE FUNCTION public.fn_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.fn_current_user_role() = 'ADMIN', false);
$$;

CREATE OR REPLACE FUNCTION public.fn_is_operator_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.fn_current_user_role() IN ('ADMIN', 'INVENTORY_OPERATOR'), false);
$$;

CREATE OR REPLACE FUNCTION public.fn_can_manage_sales()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.fn_current_user_role() IN ('ADMIN', 'SALES_OPERATOR'), false);
$$;

CREATE OR REPLACE FUNCTION public.fn_can_manage_marketing()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.fn_current_user_role() IN ('ADMIN', 'MARKETING_OPERATOR'), false);
$$;

CREATE OR REPLACE FUNCTION public.fn_is_sales_or_above()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.fn_current_user_role() IN (
      'ADMIN',
      'INVENTORY_OPERATOR',
      'SALES_OPERATOR',
      'MARKETING_OPERATOR'
    ),
    false
  );
$$;

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

REVOKE ALL ON FUNCTION public.fn_current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_current_user_role() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_is_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_is_operator_or_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_is_operator_or_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_can_manage_sales() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_can_manage_sales() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_can_manage_marketing() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_can_manage_marketing() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_is_sales_or_above() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_is_sales_or_above() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_has_any_role(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_has_any_role(TEXT[]) TO authenticated, service_role;

-- Post-check Fase 1
DO $$
BEGIN
  IF to_regprocedure('public.fn_has_any_role(text[])') IS NULL THEN
    RAISE EXCEPTION 'POST-CHECK FASE 1 FALLIDO: public.fn_has_any_role(text[]) no fue creada.';
  END IF;
  IF to_regprocedure('public.fn_is_admin()') IS NULL THEN
    RAISE EXCEPTION 'POST-CHECK FASE 1 FALLIDO: public.fn_is_admin() no fue creada.';
  END IF;
END;
$$;

COMMIT;

-- ----------------------------------------------------------------------------
-- FASE 2: HABILITAR RLS EN ORDEN ALFABÉTICO SOLO SI FALTA (EVITA LOCKS INNECESARIOS)
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
    ORDER BY c.relname
  LOOP
    IF NOT v_rec.relrowsecurity THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_rec.relname);
    END IF;
    IF NOT v_rec.relforcerowsecurity THEN
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_rec.relname);
    END IF;
  END LOOP;
END;
$$;

COMMIT;

-- ----------------------------------------------------------------------------
-- FASE 3: ASEGURAR POLÍTICAS DEPENDIENTES DE fn_has_any_role (SIN DUPLICAR NI BORRAR)
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  -- 1. public.brand_identity_versions
  IF to_regclass('public.brand_identity_versions') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'brand_identity_versions' AND policyname = 'pol_brand_identity_versions_insert') THEN
      CREATE POLICY pol_brand_identity_versions_insert
        ON public.brand_identity_versions
        FOR INSERT
        TO authenticated
        WITH CHECK (public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR']));
    END IF;
  END IF;

  -- 2. public.creative_studio_project_versions
  IF to_regclass('public.creative_studio_project_versions') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'creative_studio_project_versions' AND policyname = 'pol_creative_project_versions_select') THEN
      CREATE POLICY pol_creative_project_versions_select
        ON public.creative_studio_project_versions
        FOR SELECT
        TO authenticated
        USING (public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR', 'SALES_OPERATOR']));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'creative_studio_project_versions' AND policyname = 'pol_creative_project_versions_insert') THEN
      CREATE POLICY pol_creative_project_versions_insert
        ON public.creative_studio_project_versions
        FOR INSERT
        TO authenticated
        WITH CHECK (public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR']));
    END IF;
  END IF;

  -- 3. public.creative_studio_projects
  IF to_regclass('public.creative_studio_projects') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'creative_studio_projects' AND policyname = 'pol_creative_projects_select') THEN
      CREATE POLICY pol_creative_projects_select
        ON public.creative_studio_projects
        FOR SELECT
        TO authenticated
        USING (
          public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR', 'SALES_OPERATOR'])
          OR EXISTS (
            SELECT 1 FROM public.owners o
            WHERE o.id = owner_id AND public.fn_can_owner_view(o.id)
          )
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'creative_studio_projects' AND policyname = 'pol_creative_projects_write') THEN
      CREATE POLICY pol_creative_projects_write
        ON public.creative_studio_projects
        FOR ALL
        TO authenticated
        USING (public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR']))
        WITH CHECK (public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR']));
    END IF;
  END IF;

  -- 4. public.lead_followups
  IF to_regclass('public.lead_followups') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lead_followups' AND policyname = 'pol_lead_followups_select') THEN
      CREATE POLICY pol_lead_followups_select
        ON public.lead_followups
        FOR SELECT
        TO authenticated
        USING (public.fn_has_any_role(ARRAY['ADMIN', 'SALES_OPERATOR']));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lead_followups' AND policyname = 'pol_lead_followups_write') THEN
      CREATE POLICY pol_lead_followups_write
        ON public.lead_followups
        FOR ALL
        TO authenticated
        USING (public.fn_has_any_role(ARRAY['ADMIN', 'SALES_OPERATOR']))
        WITH CHECK (public.fn_has_any_role(ARRAY['ADMIN', 'SALES_OPERATOR']));
    END IF;
  END IF;

  -- 5. public.merchandising_asset_versions
  IF to_regclass('public.merchandising_asset_versions') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'merchandising_asset_versions' AND policyname = 'pol_merch_versions_select') THEN
      CREATE POLICY pol_merch_versions_select
        ON public.merchandising_asset_versions
        FOR SELECT
        TO authenticated
        USING (public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR', 'SALES_OPERATOR', 'INVENTORY_OPERATOR']));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'merchandising_asset_versions' AND policyname = 'pol_merch_versions_insert') THEN
      CREATE POLICY pol_merch_versions_insert
        ON public.merchandising_asset_versions
        FOR INSERT
        TO authenticated
        WITH CHECK (public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR']));
    END IF;
  END IF;

  -- 6. public.owner_marketing_consents
  IF to_regclass('public.owner_marketing_consents') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'owner_marketing_consents' AND policyname = 'pol_owner_mkt_consents_select') THEN
      CREATE POLICY pol_owner_mkt_consents_select
        ON public.owner_marketing_consents
        FOR SELECT
        TO authenticated
        USING (
          public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR', 'SALES_OPERATOR'])
          OR public.fn_can_owner_view(owner_id)
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'owner_marketing_consents' AND policyname = 'pol_owner_mkt_consents_write') THEN
      CREATE POLICY pol_owner_mkt_consents_write
        ON public.owner_marketing_consents
        FOR ALL
        TO authenticated
        USING (public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR']))
        WITH CHECK (public.fn_has_any_role(ARRAY['ADMIN', 'MARKETING_OPERATOR']));
    END IF;
  END IF;
END;
$$;

COMMIT;

-- ----------------------------------------------------------------------------
-- FASE 4: POST-CHECK GLOBAL DE CONSISTENCIA
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_no_rls_count INTEGER;
BEGIN
  SELECT count(*)
  INTO v_no_rls_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND rowsecurity = false;

  IF v_no_rls_count > 0 THEN
    RAISE EXCEPTION 'POST-CHECK FALLIDO: existen % tabla(s) en public sin RLS habilitado.', v_no_rls_count;
  END IF;
END;
$$;
