-- =============================================================================
-- MIGRACIÓN 0001: EXTENSIONES, TIPOS ENUM Y FUNCIONES BASE DE TRIGGERS
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Motor: PostgreSQL 15+ / Supabase
-- Roles Oficiales:
--   - ADMIN
--   - INVENTORY_OPERATOR
--   - SALES_OPERATOR
--   - MARKETING_OPERATOR
--   - OWNER
-- =============================================================================

BEGIN;

-- 1. Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Enum oficial de Roles del Sistema (5 Roles RBAC)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM (
      'ADMIN',
      'INVENTORY_OPERATOR',
      'SALES_OPERATOR',
      'MARKETING_OPERATOR',
      'OWNER'
    );
  END IF;
END
$$;

-- 3. Función explícita para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

-- 4. Función explícita para proteger libros contables y de inventario inmutables
--    (Bloquea UPDATE y DELETE en stock_movements, price_history y audit_logs)
CREATE OR REPLACE FUNCTION public.fn_prevent_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Operación prohibida (% en tabla %): Este registro pertenece a un libro inmutable de auditoría/kardex y no puede modificarse ni eliminarse.',
    TG_OP, TG_TABLE_NAME;
END;
$$;

COMMIT;
