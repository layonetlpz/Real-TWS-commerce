-- =============================================================================
-- REAL TWS COMMERCE SYSTEM — SEED INICIAL IDEMPOTENTE (FASE 12)
-- Reglas estrictas:
--   - Únicamente configura OWN-0001 (Eberto) y business_settings base.
--   - CERO productos inventados, CERO ventas ficticias, CERO clientes falsos.
-- =============================================================================

INSERT INTO public.owners (
  id,
  internal_code,
  full_name,
  status,
  portal_access_enabled,
  notes
) VALUES (
  'OWN-0001',
  'OWN-0001',
  'Eberto',
  'active',
  false,
  'Propietario inicial oficial del inventario base REAL TWS.'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.owner_agreements (
  id,
  agreement_code,
  owner_id,
  distribution_model,
  owner_share_pct,
  store_commission_pct,
  status,
  notes
) VALUES (
  'AGR-0001',
  'AGR-0001',
  'OWN-0001',
  NULL,
  NULL,
  NULL,
  'pending_configuration',
  'Acuerdo pendiente de configuración explícita.'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.business_settings (
  id,
  business_name,
  legal_name,
  currency_code,
  timezone
) VALUES (
  'REAL_TWS_DEFAULT',
  'REAL TWS',
  'REAL TWS COMMERCE SYSTEM',
  'COP',
  'America/Bogota'
)
ON CONFLICT (id) DO NOTHING;
