-- ============================================================================
-- REAL TWS COMMERCE SYSTEM — 04_DIAGNOSTICO_DEADLOCK.sql
-- ============================================================================
-- PROPÓSITO:
--   Script 100% de SOLO LECTURA para identificar las relaciones exactas
--   correspondientes a los OID 19748 y 20734 del deadlock (ERROR 40P01),
--   inspeccionar sesiones activas, bloqueos en curso y el estado actual
--   de tablas, funciones, triggers y políticas de REAL TWS en PostgreSQL.
--
-- SEGURIDAD:
--   - NO modifica tablas, datos, usuarios ni políticas.
-- ============================================================================

-- 1. IDENTIFICAR LAS RELACIONES EXACTAS DE LOS OID DEL DEADLOCK (19748 y 20734)
SELECT
  c.oid,
  n.nspname AS schema_name,
  c.relname AS relation_name,
  CASE c.relkind
    WHEN 'r' THEN 'table'
    WHEN 'p' THEN 'partitioned table'
    WHEN 'i' THEN 'index'
    WHEN 'v' THEN 'view'
    WHEN 'm' THEN 'materialized view'
    WHEN 'S' THEN 'sequence'
    ELSE c.relkind::text
  END AS relation_type,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.oid IN (19748, 20734)
ORDER BY c.oid;

-- 2. VER CLAVES FORÁNEAS QUE CONECTAN A ESAS DOS RELACIONES (POSIBLES RUTAS DE LOCK)
SELECT
  con.conname AS constraint_name,
  src_ns.nspname || '.' || src.relname AS child_table,
  tgt_ns.nspname || '.' || tgt.relname AS parent_table
FROM pg_constraint con
JOIN pg_class src ON src.oid = con.conrelid
JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
JOIN pg_class tgt ON tgt.oid = con.confrelid
JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt.relnamespace
WHERE con.contype = 'f'
  AND (con.conrelid IN (19748, 20734) OR con.confrelid IN (19748, 20734))
ORDER BY child_table, constraint_name;

-- 3. INSPECCIONAR SESIONES ACTIVAS Y BLOQUEOS EN CURSO (CONCURRENCIA)
SELECT
  a.pid,
  a.usename,
  a.application_name,
  a.state,
  a.wait_event_type,
  a.wait_event,
  pg_blocking_pids(a.pid) AS blocked_by_pids,
  now() - a.xact_start AS xact_duration,
  now() - a.query_start AS query_duration,
  LEFT(a.query, 200) AS query_preview
FROM pg_stat_activity a
WHERE a.datname = current_database()
  AND a.pid <> pg_backend_pid()
  AND a.state <> 'idle'
ORDER BY a.xact_start NULLS LAST;

-- 4. DETALLE DE LOCKS NO CONCEDIDOS O LOCKS EXCLUSIVOS EN EL ESQUEMA public/auth/storage
SELECT
  l.pid,
  a.application_name,
  n.nspname AS schema_name,
  c.relname AS relation_name,
  l.locktype,
  l.mode,
  l.granted,
  a.state,
  LEFT(a.query, 150) AS query_preview
FROM pg_locks l
JOIN pg_stat_activity a ON a.pid = l.pid
LEFT JOIN pg_class c ON c.oid = l.relation
LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE l.pid <> pg_backend_pid()
  AND (NOT l.granted OR l.mode IN ('AccessExclusiveLock', 'ShareUpdateExclusiveLock', 'ShareRowExclusiveLock', 'ExclusiveLock'))
ORDER BY l.granted, n.nspname, c.relname;

-- 5. ESTADO ACTUAL DE OBJETOS DE REAL TWS YA INSTALADOS EN ESTA BASE
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS public_tables_count,
  (SELECT count(*) FROM information_schema.views WHERE table_schema = 'public') AS public_views_count,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname LIKE 'fn_%') AS public_fn_count,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') AS public_policies_count,
  (SELECT to_regprocedure('public.fn_has_any_role(text[])') IS NOT NULL) AS has_fn_has_any_role;
