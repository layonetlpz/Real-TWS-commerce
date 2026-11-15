-- =============================================================================
-- MIGRACIÓN 0019: WHATSAPP SALES CENTER (V1 MANUAL + ARQUITECTURA FUTURA CLOUD API)
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Cubre:
--   1. Tabla de plantillas oficiales de WhatsApp Sales Center
--      (public.whatsapp_message_templates):
--      10 categorías obligatorias (Precio, Características, Disponibilidad,
--      Envío, Pago, Garantía, Pedido, Confirmación, Seguimiento, Postventa)
--      + Bienvenida y Ausencia.
--   2. Tabla de interacciones, enlaces wa.me y atención manual
--      (public.whatsapp_sales_interactions):
--      Registra mensajes preparados para clientes/prospectos, permiso de
--      contacto (opt-in), SKU consultado, validación anti-fuga de datos de
--      propietarios internos y prohibición de envío masivo o automático.
--   3. Tabla de configuración de arquitectura futura WhatsApp Business Platform
--      (public.whatsapp_platform_future_architecture):
--      Estricto estado inactivo (cloud_api_active = false, number_migrated = false,
--      billing_enabled = false, auto_send_enabled = false).
--   4. Trigger de seguridad (public.fn_validate_whatsapp_buyer_message_security):
--      Impide guardar o despachar mensajes a compradores que expongan IDs
--      internos de propietarios (OWN-0001), costos privados o que confirmen
--      pagos sin referencia de comprobante (voucher_proof_ref).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. TABLA: public.whatsapp_message_templates (10 Plantillas + Bienvenida/Ausencia)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code TEXT NOT NULL UNIQUE CHECK (btrim(template_code) <> ''),
  category TEXT NOT NULL CHECK (
    category IN (
      'PRECIO',
      'CARACTERISTICAS',
      'DISPONIBILIDAD',
      'ENVIO',
      'PAGO',
      'GARANTIA',
      'PEDIDO',
      'CONFIRMACION',
      'SEGUIMIENTO',
      'POSTVENTA',
      'BIENVENIDA',
      'AUSENCIA'
    )
  ),
  title TEXT NOT NULL CHECK (btrim(title) <> ''),
  shortcut_command TEXT NOT NULL CHECK (btrim(shortcut_command) <> ''),
  body_template TEXT NOT NULL CHECK (btrim(body_template) <> ''),
  requires_verified_stock BOOLEAN NOT NULL DEFAULT false,
  requires_approved_price BOOLEAN NOT NULL DEFAULT false,
  requires_payment_proof BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_whatsapp_templates_updated_at ON public.whatsapp_message_templates;
CREATE TRIGGER trg_whatsapp_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_message_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

ALTER TABLE public.whatsapp_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_whatsapp_templates_select ON public.whatsapp_message_templates;
CREATE POLICY pol_whatsapp_templates_select
  ON public.whatsapp_message_templates
  FOR SELECT
  TO authenticated
  USING (
    public.fn_current_user_role() IN ('ADMIN', 'SALES_OPERATOR', 'MARKETING_OPERATOR', 'INVENTORY_OPERATOR')
  );

DROP POLICY IF EXISTS pol_whatsapp_templates_write ON public.whatsapp_message_templates;
CREATE POLICY pol_whatsapp_templates_write
  ON public.whatsapp_message_templates
  FOR ALL
  TO authenticated
  USING (public.fn_current_user_role() IN ('ADMIN', 'SALES_OPERATOR', 'MARKETING_OPERATOR'))
  WITH CHECK (public.fn_current_user_role() IN ('ADMIN', 'SALES_OPERATOR', 'MARKETING_OPERATOR'));

-- -----------------------------------------------------------------------------
-- 2. TABLA: public.whatsapp_sales_interactions (Bitácora de Atención Manual V1)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_sales_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_code TEXT NOT NULL UNIQUE CHECK (btrim(interaction_code) <> ''),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  sales_order_id UUID REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  buyer_name TEXT NOT NULL CHECK (btrim(buyer_name) <> ''),
  buyer_phone_whatsapp TEXT NOT NULL CHECK (btrim(buyer_phone_whatsapp) <> ''),
  contact_permission_granted BOOLEAN NOT NULL DEFAULT true CHECK (contact_permission_granted = true),
  sku TEXT REFERENCES public.product_variants(sku) ON DELETE SET NULL,
  internal_owner_id_checked TEXT REFERENCES public.owners(id) ON DELETE SET NULL,
  template_category TEXT NOT NULL,
  prepared_buyer_message TEXT NOT NULL CHECK (btrim(prepared_buyer_message) <> ''),
  generated_wa_me_url TEXT NOT NULL CHECK (btrim(generated_wa_me_url) <> ''),
  payment_voucher_proof_ref TEXT,
  owner_info_hidden_from_buyer BOOLEAN NOT NULL DEFAULT true CHECK (owner_info_hidden_from_buyer = true),
  mass_messaging_blocked BOOLEAN NOT NULL DEFAULT true CHECK (mass_messaging_blocked = true),
  unofficial_automation_blocked BOOLEAN NOT NULL DEFAULT true CHECK (unofficial_automation_blocked = true),
  delivery_mode TEXT NOT NULL DEFAULT 'manual_wa_me_link' CHECK (delivery_mode = 'manual_wa_me_link'),
  handled_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_interactions_phone
  ON public.whatsapp_sales_interactions(buyer_phone_whatsapp, created_at DESC);

ALTER TABLE public.whatsapp_sales_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sales_interactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_wa_interactions_access ON public.whatsapp_sales_interactions;
CREATE POLICY pol_wa_interactions_access
  ON public.whatsapp_sales_interactions
  FOR ALL
  TO authenticated
  USING (public.fn_current_user_role() IN ('ADMIN', 'SALES_OPERATOR', 'MARKETING_OPERATOR'))
  WITH CHECK (public.fn_current_user_role() IN ('ADMIN', 'SALES_OPERATOR', 'MARKETING_OPERATOR'));

-- -----------------------------------------------------------------------------
-- 3. TABLA: public.whatsapp_platform_future_architecture (Solo Diseño Futuro)
--    Reglas obligatorias:
--    - NO activar Cloud API.
--    - NO migrar el número.
--    - NO enviar mensajes automáticamente.
--    - NO activar cobros.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_platform_future_architecture (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_code TEXT NOT NULL UNIQUE DEFAULT 'WABA_CLOUD_API_FUTURE_V2',
  architecture_version TEXT NOT NULL DEFAULT 'v19.0-blueprint-only',
  active_operation_mode TEXT NOT NULL DEFAULT 'V1_WHATSAPP_BUSINESS_APP_MANUAL_LINKS' CHECK (
    active_operation_mode = 'V1_WHATSAPP_BUSINESS_APP_MANUAL_LINKS'
  ),
  cloud_api_connection_enabled BOOLEAN NOT NULL DEFAULT false CHECK (cloud_api_connection_enabled = false),
  phone_number_migrated BOOLEAN NOT NULL DEFAULT false CHECK (phone_number_migrated = false),
  automatic_message_sending_enabled BOOLEAN NOT NULL DEFAULT false CHECK (automatic_message_sending_enabled = false),
  billing_or_paid_tier_enabled BOOLEAN NOT NULL DEFAULT false CHECK (billing_or_paid_tier_enabled = false),
  unofficial_browser_bots_blocked BOOLEAN NOT NULL DEFAULT true CHECK (unofficial_browser_bots_blocked = true),
  designed_webhook_endpoint TEXT NOT NULL DEFAULT '/functions/v1/whatsapp-cloud-webhook-blueprint',
  designed_vault_secret_ref TEXT NOT NULL DEFAULT 'SUPABASE_VAULT_WABA_FUTURE_SYSTEM_TOKEN',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_platform_future_architecture ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_platform_future_architecture FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_wa_future_arch_select ON public.whatsapp_platform_future_architecture;
CREATE POLICY pol_wa_future_arch_select
  ON public.whatsapp_platform_future_architecture
  FOR SELECT
  TO authenticated
  USING (public.fn_current_user_role() IN ('ADMIN', 'SALES_OPERATOR', 'MARKETING_OPERATOR'));

-- -----------------------------------------------------------------------------
-- 4. TRIGGER DE SEGURIDAD COMERCIAL EN MENSAJES DE WHATSAPP AL COMPRADOR
--    - No mostrar a compradores información interna de propietarios (OWN-0001).
--    - No confirmar pagos sin prueba (payment_voucher_proof_ref).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_validate_whatsapp_buyer_message_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Prohibido exponer identificadores internos de propietarios al comprador
  IF NEW.prepared_buyer_message ~* '(OWN-[0-9]{4}|propietario\s+interno|costo\s+de\s+compra|comision\s+propietario)' THEN
    RAISE EXCEPTION 'BLOQUEO DE PRIVACIDAD INTERNA: El mensaje dirigido al comprador contiene información interna de propietarios o costos que no debe revelarse.';
  END IF;

  -- 2. Prohibido confirmar pagos sin comprobante / prueba verificada
  IF NEW.template_category = 'CONFIRMACION' AND (
    NEW.payment_voucher_proof_ref IS NULL OR btrim(NEW.payment_voucher_proof_ref) = ''
  ) THEN
    RAISE EXCEPTION 'BLOQUEO DE SEGURIDAD FINANCIERA: Prohibido enviar confirmación de pago sin registrar primero la referencia o prueba del comprobante.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_whatsapp_buyer_message_security ON public.whatsapp_sales_interactions;
CREATE TRIGGER trg_validate_whatsapp_buyer_message_security
  BEFORE INSERT OR UPDATE ON public.whatsapp_sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_whatsapp_buyer_message_security();

COMMIT;
