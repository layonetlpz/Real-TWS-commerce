-- =============================================================================
-- MIGRACIÓN 0023: ALINEACIÓN UI DE PRODUCCIÓN, ÍNDICES Y PARÁMETROS INICIALES
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Regla: Migración aditiva e idempotente (sin DROP SCHEMA, DROP DATABASE ni TRUNCATE)
-- =============================================================================

BEGIN;

-- Garantizar registro base en business_settings sin sobrescribir cambios del usuario
INSERT INTO public.business_settings (
  id,
  business_name,
  legal_name,
  currency_code,
  timezone,
  default_low_stock_threshold,
  ai_provider_enabled,
  meta_api_enabled,
  whatsapp_cloud_enabled,
  auto_publish_blocked,
  auto_settlement_blocked
) VALUES (
  'REAL_TWS_DEFAULT',
  'REAL TWS',
  'REAL TWS COMMERCE SYSTEM',
  'COP',
  'America/Bogota',
  3,
  false,
  false,
  false,
  true,
  true
)
ON CONFLICT (id) DO NOTHING;

-- Índices de rendimiento para consultas de Dashboard, Inventario, Incidencias y Auditoría
CREATE INDEX IF NOT EXISTS idx_products_category_status
  ON public.products(category, status);

CREATE INDEX IF NOT EXISTS idx_lot_allocations_owner_available
  ON public.lot_owner_allocations(owner_id, qty_available, qty_pending_inspection);

CREATE INDEX IF NOT EXISTS idx_inventory_incidences_status_owner
  ON public.inventory_incidences(status, owner_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_desc
  ON public.audit_logs(created_at DESC);

COMMIT;
