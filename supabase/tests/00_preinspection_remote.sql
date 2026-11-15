-- =============================================================================
-- PREINSPECCIÓN DE BASE REMOTA SUPABASE (SOLO LECTURA)
-- Ejecutar en Supabase SQL Editor ANTES de aplicar migraciones si ya existe
-- un proyecto previo, para conocer tablas, vistas, funciones, políticas y buckets.
-- =============================================================================

-- 1. Tablas existentes en public
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. Vistas existentes y estado security_invoker
SELECT viewname, definition
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;

-- 3. Políticas RLS activas
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;

-- 4. Funciones y triggers en public
SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- 5. Buckets de Storage existentes
SELECT id, name, public, created_at
FROM storage.buckets
ORDER BY id;
