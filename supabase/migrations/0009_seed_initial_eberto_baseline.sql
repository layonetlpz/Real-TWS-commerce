-- =============================================================================
-- MIGRACIÓN 0009: SEMILLA BASE REAL DE EBERTO (OWN-0001), INCIDENCIAS AUDITADAS
--                 E INTERRUPTORES DE INTEGRACIÓN POR DEFECTO (OFF)
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Reglas aplicadas:
--   - Solo se crea el propietario real actual: OWN-0001 (Eberto).
--   - No se crean propietarios ficticios ni porcentajes de comisión asumidos.
--   - El acuerdo inicial AGR-0001 queda en estado 'pending_configuration'.
--   - Las integraciones externas inician desactivadas (is_enabled = false).
-- =============================================================================

BEGIN;

-- 1. Propietario Real Único Inicial: Eberto (OWN-0001)
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
  'Propietario titular del 100 % del inventario físico inicial registrado en REAL_TWS_INVENTARIO_MULTIPROPIETARIO.xlsx.'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Acuerdo Inicial en estado PENDIENTE DE CONFIGURAR (sin asumir porcentajes)
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
  'PENDIENTE DE CONFIGURAR ACUERDO DE DISTRIBUCIÓN. No se asumen porcentajes sin autorización explícita.'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Conexiones Sociales e IA Opcional (Apagadas por defecto — Costo $0)
INSERT INTO public.social_connections (
  platform,
  display_name,
  is_enabled,
  secret_vault_key_name,
  daily_quota_limit
) VALUES
  ('whatsapp_business_link', 'WhatsApp Business App (Deep Links wa.me)', true, NULL, 1000),
  ('facebook_graph_api', 'Meta Graph API — Facebook Page Oficial', false, 'META_GRAPH_PAGE_TOKEN', 25),
  ('instagram_graph_api', 'Meta Graph API — Instagram Business Oficial', false, 'META_GRAPH_IG_TOKEN', 25),
  ('gemini_flash_assist', 'Google Gemini Flash (Asistente Opcional)', false, 'GEMINI_API_KEY', 30)
ON CONFLICT (platform) DO NOTHING;

-- 4. Las 7 Incidencias Reales Detectadas en la Auditoría del Archivo Excel
INSERT INTO public.inventory_incidences (
  id,
  severity,
  affected_module,
  sku_or_owner_ref,
  owner_id,
  description,
  required_action,
  status
) VALUES
  (
    'INC-001',
    'ALTA',
    'Inventario / Conteo Físico',
    'HER-SOP-001-NEG',
    'OWN-0001',
    'El producto "Soporte" (ID original 2) tiene Cantidad Recibida vacía en DATOS_ORIGINALES (costo $4.000 COP).',
    'Verificar físicamente en bodega cuántas unidades existen del Soporte HER-SOP-001-NEG.',
    'Pendiente Revisión'
  ),
  (
    'INC-002',
    'ALTA',
    'Compras / Costos',
    'AUD-TWS-003-NEG',
    'OWN-0001',
    'El producto "Auriculares inalambricos F9-5" (ID original 16, 1 unidad) no tiene costo de compra registrado.',
    'Confirmar factura o valor de adquisición para calcular costo unitario final.',
    'Pendiente Revisión'
  ),
  (
    'INC-003',
    'ALTA',
    'Compras / Costos',
    'ELE-AUD-001-STD',
    'OWN-0001',
    'El producto "Receptor Bluetooth XY-WRBT" (ID original 39, 1 unidad) no tiene costo de compra registrado.',
    'Confirmar costo de compra del módulo XY-WRBT para completar valorización.',
    'Pendiente Revisión'
  ),
  (
    'INC-004',
    'INFO',
    'Ventas / Inventario Histórico',
    'COM-PER-001-AZU / HOG-ACC-001-NEG',
    'OWN-0001',
    'Dos artículos estaban marcados con nota "VENDIDO" en la columna Cantidad Recibida del Excel original (Mouse $50.000 y Báscula $15.000).',
    'Registrados como ventas históricas de OWN-0001 (0 unidades en bodega y 2 unidades vendidas).',
    'Pendiente Revisión'
  ),
  (
    'INC-005',
    'MEDIA',
    'Catálogo / Variantes',
    'MOT-LED-001 / MOT-LED-002 / MOT-LED-003 / MOT-LED-004',
    'OWN-0001',
    'Existen 4 registros separados de "Luz LED para moto" con costos distintos ($10.600, $9.700, $11.500 y $13.300).',
    'Conservados sin fusionar (Regla 2). Confirmar si corresponden a referencias distintas o lotes con diferente precio.',
    'Pendiente Revisión'
  ),
  (
    'INC-006',
    'INFO',
    'Compras / Regalos de Proveedor',
    'HER-SOP-002-NEG',
    'OWN-0001',
    'El artículo "Soporte" (ID original 40, 1 unidad) tiene costo $0 con observación "Regalo por compra".',
    'Marcado con is_bonus_zero_cost = true para no distorsionar costos ni reportarlo como omisión.',
    'Pendiente Revisión'
  ),
  (
    'INC-007',
    'MEDIA',
    'Multipropietario / Liquidaciones',
    'OWN-0001 (Eberto)',
    'OWN-0001',
    'Todos los artículos actuales fueron asignados a Eberto (OWN-0001). Aún no se ha definido porcentaje de comisión ni acuerdo comercial.',
    'Configurar el acuerdo en owner_agreements cuando la gerencia lo determine.',
    'Pendiente Revisión'
  )
ON CONFLICT (id) DO NOTHING;

COMMIT;
