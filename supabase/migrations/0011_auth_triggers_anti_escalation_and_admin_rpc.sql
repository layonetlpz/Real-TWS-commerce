-- =============================================================================
-- MIGRACIÓN 0011: ENDURECIMIENTO DE SEGURIDAD (ANTI-AUTOASIGNACIÓN DE ROLES,
--                 GESTIÓN ADMINISTRATIVA DE USUARIOS Y AUDITORÍA DE ACCESOS)
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Reglas implementadas:
--   1. Evitar autoasignación de roles en public.profiles (trigger BEFORE INSERT/UPDATE).
--   2. Sincronización segura desde auth.users ignorando cualquier rol en user_metadata.
--   3. RPC fn_admin_update_user_role_and_access exclusiva para ADMIN con bitácora.
--   4. RPC fn_log_security_event para registrar intentos de acceso no autorizado.
--   5. RPC fn_authorize_private_document_access para proteger documentos privados.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. TRIGGER ANTI-AUTOASIGNACIÓN DE ROLES EN public.profiles
--    Un usuario no administrador jamás puede asignarse un rol, cambiar su rol,
--    modificar linked_owner_id, habilitar owner_portal_enabled ni reactivarse.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_prevent_profile_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Permitir ejecuciones del motor interno de PostgreSQL/Supabase Auth (cuando auth.uid() es NULL)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.fn_is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Seguridad RBAC: Prohibida la creación o autoasignación directa de perfiles desde el cliente.';
    END IF;

    IF TG_OP = 'UPDATE' THEN
      IF NEW.role IS DISTINCT FROM OLD.role
         OR NEW.linked_owner_id IS DISTINCT FROM OLD.linked_owner_id
         OR NEW.owner_portal_enabled IS DISTINCT FROM OLD.owner_portal_enabled
         OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
        RAISE EXCEPTION 'Seguridad RBAC: Prohibido modificar rol, vínculo de propietario o estado de cuenta sin privilegios ADMIN.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_self_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_self_escalation
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_profile_self_escalation();

-- -----------------------------------------------------------------------------
-- 2. TRIGGER EN auth.users PARA CREAR PERFIL INACTIVO SIN ESCALACIÓN DE ROLES
--    Ignora cualquier campo "role" enviado en raw_user_meta_data por el cliente.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    role,
    linked_owner_id,
    owner_portal_enabled,
    is_active
  ) VALUES (
    NEW.id,
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email, '@', 1), 'Usuario Pendiente'),
    NEW.email,
    'SALES_OPERATOR',
    NULL,
    false,
    false -- Inicia inactivo hasta que un ADMIN autorice su rol y activación
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- 3. RPC ADMINISTRATIVA: public.fn_admin_update_user_role_and_access
--    Permite exclusivamente a un ADMIN asignar rol, propietario vinculado,
--    acceso al portal de propietario y estado activo, registrando auditoría.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_admin_update_user_role_and_access(
  p_target_user_id UUID,
  p_new_role public.app_role,
  p_linked_owner_id TEXT DEFAULT NULL,
  p_owner_portal_enabled BOOLEAN DEFAULT false,
  p_is_active BOOLEAN DEFAULT true,
  p_reason TEXT DEFAULT 'Actualización administrativa de permisos'
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_profile public.profiles%ROWTYPE;
  v_new_profile public.profiles%ROWTYPE;
BEGIN
  IF NOT public.fn_is_admin() THEN
    RAISE EXCEPTION 'Acceso Denegado: Solo el rol ADMIN puede administrar roles y usuarios.';
  END IF;

  SELECT * INTO v_old_profile
  FROM public.profiles
  WHERE id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe el perfil de usuario %.', p_target_user_id;
  END IF;

  -- Evitar que el administrador activo se desactive o se degrade a sí mismo accidentalmente
  IF p_target_user_id = auth.uid() AND (p_new_role <> 'ADMIN' OR p_is_active = false) THEN
    RAISE EXCEPTION 'Salvaguarda de Seguridad: Un administrador no puede revocar su propio rol ADMIN ni desactivar su propia cuenta.';
  END IF;

  IF p_new_role = 'OWNER' AND p_linked_owner_id IS NULL THEN
    RAISE EXCEPTION 'Regla Multipropietario: El rol OWNER exige especificar explícitamente el propietario vinculado (linked_owner_id).';
  END IF;

  UPDATE public.profiles
  SET
    role = p_new_role,
    linked_owner_id = CASE WHEN p_new_role = 'OWNER' THEN p_linked_owner_id ELSE NULL END,
    owner_portal_enabled = CASE WHEN p_new_role = 'OWNER' THEN p_owner_portal_enabled ELSE false END,
    is_active = p_is_active
  WHERE id = p_target_user_id
  RETURNING * INTO v_new_profile;

  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_role,
    action_type,
    table_name,
    record_pk,
    owner_id_affected,
    previous_data,
    new_data,
    reason
  ) VALUES (
    auth.uid(),
    'ADMIN',
    'ADMIN_ROLE_UPDATE',
    'profiles',
    p_target_user_id::TEXT,
    v_new_profile.linked_owner_id,
    to_jsonb(v_old_profile),
    to_jsonb(v_new_profile),
    p_reason
  );

  RETURN v_new_profile;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. RPC DE AUDITORÍA DE SEGURIDAD: public.fn_log_security_event
--    Registra intentos de acceso no autorizado, sesiones expiradas o bloqueos
--    de operaciones sensibles en public.audit_logs.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_log_security_event(
  p_event_type TEXT,
  p_target_resource TEXT,
  p_reason TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_role,
    action_type,
    table_name,
    record_pk,
    owner_id_affected,
    previous_data,
    new_data,
    reason
  ) VALUES (
    auth.uid(),
    COALESCE((public.fn_current_user_role())::TEXT, 'UNAUTHENTICATED'),
    p_event_type,
    'security_guard',
    p_target_resource,
    p_metadata->>'owner_id',
    NULL,
    p_metadata,
    p_reason
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC DE PROTECCIÓN DE DOCUMENTOS PRIVADOS:
--    public.fn_authorize_private_document_access
--    Verifica permisos en servidor y deja rastro en audit_logs antes de
--    permitir generar un enlace firmado temporal sobre 'private-documents'.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_authorize_private_document_access(
  p_storage_path TEXT,
  p_document_owner_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed BOOLEAN := false;
BEGIN
  IF public.fn_is_admin() THEN
    v_allowed := true;
  ELSIF p_document_owner_id IS NOT NULL AND public.fn_can_owner_view(p_document_owner_id) THEN
    v_allowed := true;
  END IF;

  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_role,
    action_type,
    table_name,
    record_pk,
    owner_id_affected,
    new_data,
    reason
  ) VALUES (
    auth.uid(),
    COALESCE((public.fn_current_user_role())::TEXT, 'UNAUTHENTICATED'),
    CASE WHEN v_allowed THEN 'PRIVATE_DOC_ACCESS_GRANTED' ELSE 'PRIVATE_DOC_ACCESS_DENIED' END,
    'storage.objects',
    p_storage_path,
    p_document_owner_id,
    jsonb_build_object('storage_path', p_storage_path, 'authorized', v_allowed),
    CASE WHEN v_allowed THEN 'Acceso autorizado a documento privado' ELSE 'Intento bloqueado de acceso a documento privado' END
  );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Acceso Denegado: No tiene permisos para acceder al documento privado solicitado (%).', p_storage_path;
  END IF;

  RETURN true;
END;
$$;

COMMIT;
