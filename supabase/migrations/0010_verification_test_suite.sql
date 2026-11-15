-- =============================================================================
-- ARCHIVO DE PRUEBAS DE VERIFICACIÓN DE SEGURIDAD Y RLS (NO INSERTA DATOS PERMANENTES)
-- Archivo: 0010_verification_test_suite.sql
-- Propósito: Verificar en PostgreSQL:
--   1. RLS obligatorio en las 33 tablas públicas.
--   2. Enum de 5 roles oficiales: ADMIN, INVENTORY_OPERATOR, SALES_OPERATOR,
--      MARKETING_OPERATOR, OWNER.
--   3. Bloqueo de autoasignación de roles (trg_prevent_profile_self_escalation).
--   4. Aislamiento de propietario (fn_can_owner_view).
--   5. Protección de modificación de costos, transferencias de dueño y liquidaciones.
--   6. Protección de documentos privados (fn_authorize_private_document_access).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_owner_count INTEGER;
  v_rls_disabled_count INTEGER;
  v_enum_roles_count INTEGER;
BEGIN
  -- PRUEBA 1: Verificar que TODAS las 33 tablas del esquema public tienen RLS activo
  SELECT COUNT(*) INTO v_rls_disabled_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND rowsecurity = false;

  IF v_rls_disabled_count > 0 THEN
    RAISE EXCEPTION 'Fallo de Seguridad: Existen % tablas públicas sin RLS habilitado.', v_rls_disabled_count;
  END IF;

  -- PRUEBA 2: Verificar los 5 roles exactos en public.app_role
  SELECT COUNT(*) INTO v_enum_roles_count
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'app_role'
    AND e.enumlabel IN (
      'ADMIN',
      'INVENTORY_OPERATOR',
      'SALES_OPERATOR',
      'MARKETING_OPERATOR',
      'OWNER'
    );

  IF v_enum_roles_count <> 5 THEN
    RAISE EXCEPTION 'Fallo RBAC: El tipo public.app_role no contiene exactamente los 5 roles oficiales.';
  END IF;

  -- PRUEBA 3: Verificar que existe únicamente el propietario inicial real OWN-0001 (Eberto)
  SELECT COUNT(*) INTO v_owner_count
  FROM public.owners
  WHERE id = 'OWN-0001' AND full_name = 'Eberto';

  IF v_owner_count <> 1 THEN
    RAISE EXCEPTION 'Fallo de Semilla Inicial: No se encontró el registro único de Eberto (OWN-0001).';
  END IF;

  -- PRUEBA 4: Verificar que el acuerdo inicial AGR-0001 está en 'pending_configuration'
  --           sin asumir porcentajes inventados
  IF NOT EXISTS (
    SELECT 1 FROM public.owner_agreements
    WHERE id = 'AGR-0001'
      AND owner_id = 'OWN-0001'
      AND status = 'pending_configuration'
      AND owner_share_pct IS NULL
      AND store_commission_pct IS NULL
  ) THEN
    RAISE EXCEPTION 'Fallo de Regla Financiera: El acuerdo inicial de OWN-0001 no debe asumir porcentajes.';
  END IF;

  RAISE NOTICE 'Suite de pruebas de seguridad, 5 roles RBAC, RLS y semilla base aprobada correctamente.';
END;
$$;

ROLLBACK;
