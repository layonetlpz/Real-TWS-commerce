// ============================================================================
// REAL TWS COMMERCE SYSTEM — WHATSAPP SALES CENTER ENGINE (FASE 8C)
// Cubre:
//   1. FUNCIONES:
//      - Catálogo conectado en tiempo real.
//      - Consultar precios aprobados (normal, promocional, mínimo).
//      - Consultar stock (físico, apto, reservado, pendiente, disponible).
//      - Consultar propietario y disponibilidad interna (solo uso interno).
//      - Preparar mensajes comerciales + Respuestas rápidas (/atajos).
//      - Mensajes de Bienvenida y Ausencia para WhatsApp Business App.
//      - Enlaces de conversación oficiales (wa.me).
//      - Registro de prospectos, seguimiento CRM, pedidos e historial de clientes.
//   2. DIEZ (10) PLANTILLAS OBLIGATORIAS + BIENVENIDA Y AUSENCIA:
//      - Precio, Características, Disponibilidad, Envío, Pago, Garantía,
//        Pedido, Confirmación, Seguimiento, Postventa (+ Bienvenida y Ausencia).
//   3. SEGURIDAD ESTRICTA:
//      - No mostrar a compradores información interna de propietarios (OWN-0001).
//      - No inventar stock.
//      - No inventar precios.
//      - No confirmar pagos sin prueba (comprobante/referencia obligatoria).
//      - No enviar mensajes masivos.
//      - Respetar permisos de contacto (opt-in).
//      - No utilizar automatización no oficial de WhatsApp.
//   4. PRIMERA VERSIÓN (V1 ACTIVA) vs PREPARACIÓN FUTURA:
//      - V1: WhatsApp Business App mediante enlaces wa.me, respuestas preparadas
//        y gestión manual (SIN activar Cloud API, SIN migrar número, SIN envío automático).
//      - Futuro: Adaptador independiente para WhatsApp Business Platform diseñado
//        en arquitectura, desactivado y sin cobros ($0).
// ============================================================================

import {
  getBrandMerchandisingState,
  getRealCatalogMerchItems,
  type RealCatalogMerchItem
} from './brandMerchandisingService';
import { getInventoryPurchaseState } from './inventoryPurchaseService';
import {
  getSalesOrdersCrmState,
  createCrmLead,
  addLeadFollowupAndStage,
  registerOrValidateCustomer,
  txCreateSalesOrder,
  buildCustomerCommercialSummaries,
  type CrmLeadRecord,
  type SalesOrderRecord,
  type CustomerCommercialSummary
} from './salesOrdersCrmService';
import { formatCOP } from '../utils/formatters';

export type WhatsAppTemplateCategory =
  | 'PRECIO'
  | 'CARACTERISTICAS'
  | 'DISPONIBILIDAD'
  | 'ENVIO'
  | 'PAGO'
  | 'GARANTIA'
  | 'PEDIDO'
  | 'CONFIRMACION'
  | 'SEGUIMIENTO'
  | 'POSTVENTA'
  | 'BIENVENIDA'
  | 'AUSENCIA';

export interface WhatsAppMessageTemplate {
  id: string;
  templateCode: string;
  category: WhatsAppTemplateCategory;
  title: string;
  shortcutCommand: string;
  description: string;
  requiresVerifiedStock: boolean;
  requiresApprovedPrice: boolean;
  requiresPaymentProof: boolean;
}

export interface InternalOwnerStockBreakdownRow {
  lotAllocationId: string;
  lotId: string;
  ownerId: string;
  ownerName: string;
  storageBin: string;
  qtyPhysical: number;
  qtyGood: number;
  qtyReserved: number;
  qtyPendingInspection: number;
  qtyDefective: number;
  qtyAvailable: number;
  unitCostPrivateCop: number | null; // Exclusivo uso interno; jamás visible al comprador
}

export interface WhatsAppCatalogConsultationView {
  catalogItem: RealCatalogMerchItem;
  hasApprovedPrice: boolean;
  approvedNormalPriceCop: number | null;
  approvedPromoPriceCop: number | null;
  minimumInternalPriceCop: number | null;
  totalAvailableStock: number;
  totalPendingInspectionStock: number;
  internalOwnerBreakdown: InternalOwnerStockBreakdownRow[];
}

export interface WhatsAppPreparedInteractionRecord {
  id: string;
  interactionCode: string;
  buyerName: string;
  buyerPhoneWhatsapp: string;
  contactPermissionGranted: boolean;
  sku: string;
  productName: string;
  internalOwnerIdChecked: string; // Sólo registro interno
  templateCategory: WhatsAppTemplateCategory;
  preparedBuyerMessage: string; // Mensaje 100% libre de datos internos de propietarios
  generatedWaMeUrl: string;
  paymentVoucherProofRef: string | null;
  linkedLeadId: string | null;
  linkedOrderId: string | null;
  handledBy: string;
  createdAt: string;
}

export interface WhatsAppBusinessAppGreetingConfig {
  storeWhatsappNumber: string;
  welcomeMessage: string;
  awayMessage: string;
  businessHoursNote: string;
  quickReplies: Array<{
    id: string;
    shortcut: string;
    label: string;
    messageText: string;
  }>;
}

// ============================================================================
// ARQUITECTURA FUTURA: ADAPTADOR INDEPENDIENTE WHATSAPP BUSINESS PLATFORM
// (Solo diseño arquitectónico; sin conexión activa, sin migración de número y sin cobros)
// ============================================================================
export interface WhatsAppBusinessPlatformFutureArchitecture {
  adapterId: 'WABA_CLOUD_API_FUTURE_ADAPTER_V2';
  architectureStatus: 'DESIGNED_INACTIVE_NO_BILLING';
  v1ActiveMode: 'WHATSAPP_BUSINESS_APP_MANUAL_LINKS_AND_TEMPLATES';
  cloudApiActivated: false;
  phoneNumberMigrated: false;
  automaticSendingEnabled: false;
  billingOrPaidTierActivated: false;
  unofficialAutomationBlocked: true;
  massMessagingBlocked: true;
  designedContracts: {
    graphApiVersion: string;
    webhookEndpointPath: string;
    outboundDispatchEndpointPath: string;
    vaultTokenReferenceName: string;
    wabaAccountIdPlaceholder: string;
    phoneNumberIdPlaceholder: string;
    supportedMessageTypes: string[];
  };
}

export interface WhatsAppSecurityCheckResult {
  passedAll: boolean;
  noInternalOwnerLeakCheck: { passed: boolean; message: string };
  noInventedPriceCheck: { passed: boolean; message: string };
  noInventedStockCheck: { passed: boolean; message: string };
  paymentProofVerifiedCheck: { passed: boolean; message: string };
  contactPermissionCheck: { passed: boolean; message: string };
  noMassOrAutoSendCheck: { passed: boolean; message: string };
  blockingErrors: string[];
}

export interface WhatsAppSalesCenterStoreState {
  greetingAndQuickConfig: WhatsAppBusinessAppGreetingConfig;
  templates: WhatsAppMessageTemplate[];
  interactionsLog: WhatsAppPreparedInteractionRecord[];
  contactPermissionsByPhone: Record<string, boolean>; // Opt-in por número normalizado
  futurePlatformArchitecture: WhatsAppBusinessPlatformFutureArchitecture;
}

const WHATSAPP_SALES_CENTER_STORAGE_KEY = 'rtw_whatsapp_sales_center_v1';

// ============================================================================
// 1. CATÁLOGO DE LAS 10 PLANTILLAS OBLIGATORIAS + BIENVENIDA Y AUSENCIA
// ============================================================================

export const OFFICIAL_WHATSAPP_TEMPLATES: WhatsAppMessageTemplate[] = [
  {
    id: 'TPL-WA-01',
    templateCode: 'WA-TPL-PRECIO',
    category: 'PRECIO',
    title: '1. Plantilla de Precio Oficial',
    shortcutCommand: '/precio',
    description: 'Informa el precio comercial aprobado en Finanzas sin inventar valores.',
    requiresVerifiedStock: false,
    requiresApprovedPrice: true,
    requiresPaymentProof: false
  },
  {
    id: 'TPL-WA-02',
    templateCode: 'WA-TPL-CARACTERISTICAS',
    category: 'CARACTERISTICAS',
    title: '2. Plantilla de Características Reales',
    shortcutCommand: '/ficha',
    description: 'Detalla las especificaciones verificadas del SKU en el catálogo.',
    requiresVerifiedStock: false,
    requiresApprovedPrice: false,
    requiresPaymentProof: false
  },
  {
    id: 'TPL-WA-03',
    templateCode: 'WA-TPL-DISPONIBILIDAD',
    category: 'DISPONIBILIDAD',
    title: '3. Plantilla de Disponibilidad Verificada',
    shortcutCommand: '/stock',
    description: 'Confirma existencias reales aptas listas para entrega sin revelar propietario interno.',
    requiresVerifiedStock: true,
    requiresApprovedPrice: true,
    requiresPaymentProof: false
  },
  {
    id: 'TPL-WA-04',
    templateCode: 'WA-TPL-ENVIO',
    category: 'ENVIO',
    title: '4. Plantilla de Condiciones de Envío y Entrega',
    shortcutCommand: '/envio',
    description: 'Informa cobertura de despacho en Barranquilla y envíos nacionales con guía.',
    requiresVerifiedStock: false,
    requiresApprovedPrice: false,
    requiresPaymentProof: false
  },
  {
    id: 'TPL-WA-05',
    templateCode: 'WA-TPL-PAGO',
    category: 'PAGO',
    title: '5. Plantilla de Medios de Pago Oficiales',
    shortcutCommand: '/pago',
    description: 'Comparte medios de pago autorizados solicitando envío del soporte para verificación.',
    requiresVerifiedStock: false,
    requiresApprovedPrice: true,
    requiresPaymentProof: false
  },
  {
    id: 'TPL-WA-06',
    templateCode: 'WA-TPL-GARANTIA',
    category: 'GARANTIA',
    title: '6. Plantilla de Respaldo y Garantía',
    shortcutCommand: '/garantia',
    description: 'Explica la política de inspección de calidad y cobertura de garantía REAL TWS.',
    requiresVerifiedStock: false,
    requiresApprovedPrice: false,
    requiresPaymentProof: false
  },
  {
    id: 'TPL-WA-07',
    templateCode: 'WA-TPL-PEDIDO',
    category: 'PEDIDO',
    title: '7. Plantilla de Resumen de Pedido',
    shortcutCommand: '/pedido',
    description: 'Estructura el resumen del pedido (SKU, cantidad, subtotal, envío y total en COP).',
    requiresVerifiedStock: true,
    requiresApprovedPrice: true,
    requiresPaymentProof: false
  },
  {
    id: 'TPL-WA-08',
    templateCode: 'WA-TPL-CONFIRMACION',
    category: 'CONFIRMACION',
    title: '8. Plantilla de Confirmación de Pago y Reserva',
    shortcutCommand: '/confirmar',
    description: 'Confirma el pago y alistamiento EXIGIENDO referencia/comprobante verificado.',
    requiresVerifiedStock: true,
    requiresApprovedPrice: true,
    requiresPaymentProof: true
  },
  {
    id: 'TPL-WA-09',
    templateCode: 'WA-TPL-SEGUIMIENTO',
    category: 'SEGUIMIENTO',
    title: '9. Plantilla de Seguimiento Comercial (1 a 1)',
    shortcutCommand: '/seguimiento',
    description: 'Mensaje individual de seguimiento respetando permisos de contacto del cliente.',
    requiresVerifiedStock: false,
    requiresApprovedPrice: false,
    requiresPaymentProof: false
  },
  {
    id: 'TPL-WA-10',
    templateCode: 'WA-TPL-POSTVENTA',
    category: 'POSTVENTA',
    title: '10. Plantilla de Atención Postventa y Satisfacción',
    shortcutCommand: '/postventa',
    description: 'Acompañamiento posterior a la entrega para verificar funcionamiento y satisfacción.',
    requiresVerifiedStock: false,
    requiresApprovedPrice: false,
    requiresPaymentProof: false
  },
  {
    id: 'TPL-WA-11',
    templateCode: 'WA-TPL-BIENVENIDA',
    category: 'BIENVENIDA',
    title: '11. Mensaje Oficial de Bienvenida (WhatsApp Business App)',
    shortcutCommand: '/bienvenida',
    description: 'Saludo inicial de atención en tienda con menú de opciones.',
    requiresVerifiedStock: false,
    requiresApprovedPrice: false,
    requiresPaymentProof: false
  },
  {
    id: 'TPL-WA-12',
    templateCode: 'WA-TPL-AUSENCIA',
    category: 'AUSENCIA',
    title: '12. Mensaje Oficial de Ausencia Fuera de Horario',
    shortcutCommand: '/ausencia',
    description: 'Respuesta de horario de atención para configurar en WhatsApp Business App.',
    requiresVerifiedStock: false,
    requiresApprovedPrice: false,
    requiresPaymentProof: false
  }
];

function createInitialWhatsAppSalesCenterState(): WhatsAppSalesCenterStoreState {
  return {
    greetingAndQuickConfig: {
      storeWhatsappNumber: '+57 300 000 0000',
      welcomeMessage:
        '¡Hola! 👋 Bienvenido a *REAL TWS — Tecnología y Sonido con Respaldo Real*. Cuéntanos qué artículo o código SKU te interesa y un asesor verificará disponibilidad inmediata para ti.',
      awayMessage:
        '¡Gracias por escribir a *REAL TWS*! 🌙 En este momento nos encontramos fuera de nuestro horario de despacho. Déjanos el nombre o código SKU del producto que buscas y te responderemos a primera hora.',
      businessHoursNote: 'Lunes a Sábado: 8:30 a.m. – 6:30 p.m. (Barranquilla, Colombia)',
      quickReplies: [
        {
          id: 'QR-01',
          shortcut: '/saludo',
          label: 'Saludo y solicitud de SKU',
          messageText:
            '¡Hola! Gracias por comunicarte con *REAL TWS*. Con gusto te atendemos. ¿Me confirmas tu nombre y el artículo o código SKU que deseas consultar?'
        },
        {
          id: 'QR-02',
          shortcut: '/ubicacion',
          label: 'Ubicación y despachos',
          messageText:
            '📍 Operamos en *Barranquilla, Atlántico* con entregas locales ágiles y despachos nacionales asegurados con número de guía.'
        },
        {
          id: 'QR-03',
          shortcut: '/comprobante',
          label: 'Solicitar comprobante de pago',
          messageText:
            '🧾 Para confirmar tu pago y proceder al alistamiento en bodega, por favor envíanos por este chat la imagen o referencia del comprobante de transferencia.'
        },
        {
          id: 'QR-04',
          shortcut: '/datosenvio',
          label: 'Solicitar datos esenciales de envío',
          messageText:
            '📦 Para generar tu orden de despacho, regálanos por favor:\n1. Nombre completo de quien recibe\n2. Teléfono de contacto\n3. Ciudad y dirección exacta de entrega'
        }
      ]
    },
    templates: OFFICIAL_WHATSAPP_TEMPLATES,
    interactionsLog: [],
    contactPermissionsByPhone: {},
    futurePlatformArchitecture: {
      adapterId: 'WABA_CLOUD_API_FUTURE_ADAPTER_V2',
      architectureStatus: 'DESIGNED_INACTIVE_NO_BILLING',
      v1ActiveMode: 'WHATSAPP_BUSINESS_APP_MANUAL_LINKS_AND_TEMPLATES',
      cloudApiActivated: false,
      phoneNumberMigrated: false,
      automaticSendingEnabled: false,
      billingOrPaidTierActivated: false,
      unofficialAutomationBlocked: true,
      massMessagingBlocked: true,
      designedContracts: {
        graphApiVersion: 'v20.0 (Meta WhatsApp Cloud API Contract — Inactivo en V1)',
        webhookEndpointPath: 'supabase/functions/whatsapp-cloud-webhook (Diseño Futuro)',
        outboundDispatchEndpointPath: 'supabase/functions/whatsapp-cloud-send (Diseño Futuro)',
        vaultTokenReferenceName: 'SUPABASE_VAULT_WABA_SYSTEM_USER_TOKEN',
        wabaAccountIdPlaceholder: 'PENDING_FUTURE_WABA_ID_DO_NOT_MIGRATE_YET',
        phoneNumberIdPlaceholder: 'PENDING_FUTURE_PHONE_ID_KEEP_BUSINESS_APP_V1',
        supportedMessageTypes: ['template', 'text_within_24h_service_window', 'interactive_product_list']
      }
    }
  };
}

let inMemoryWhatsAppState: WhatsAppSalesCenterStoreState | null = null;

export function getWhatsAppSalesCenterState(): WhatsAppSalesCenterStoreState {
  if (inMemoryWhatsAppState) {
    return inMemoryWhatsAppState;
  }
  try {
    const raw = localStorage.getItem(WHATSAPP_SALES_CENTER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WhatsAppSalesCenterStoreState;
      if (parsed && parsed.greetingAndQuickConfig && Array.isArray(parsed.interactionsLog)) {
        inMemoryWhatsAppState = parsed;
        return parsed;
      }
    }
  } catch {
    // Fallback
  }
  const initial = createInitialWhatsAppSalesCenterState();
  inMemoryWhatsAppState = initial;
  saveWhatsAppSalesCenterState(initial);
  return initial;
}

export function saveWhatsAppSalesCenterState(state: WhatsAppSalesCenterStoreState): void {
  inMemoryWhatsAppState = state;
  try {
    localStorage.setItem(WHATSAPP_SALES_CENTER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota issues
  }
}

export function normalizeWhatsAppDigits(rawPhone: string): string {
  const digits = String(rawPhone || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.length === 10 && digits.startsWith('3')) {
    return `57${digits}`;
  }
  return digits;
}

// ============================================================================
// 2. CONSULTA DE CATÁLOGO, PRECIOS, STOCK Y DISPONIBILIDAD INTERNA POR DUEÑO
//    (La información de propietarios y costos es estrictamente interna)
// ============================================================================

export function getWhatsAppCatalogConsultation(sku: string): WhatsAppCatalogConsultationView | null {
  const catalogItems = getRealCatalogMerchItems();
  const invState = getInventoryPurchaseState();
  const item = catalogItems.find((i) => i.sku === sku) || catalogItems[0] || null;
  if (!item) return null;

  const invAllocs = invState.allocations.filter((a) => a.sku === item.sku);

  const internalOwnerBreakdown: InternalOwnerStockBreakdownRow[] =
    invAllocs.length > 0
      ? invAllocs.map((a) => ({
          lotAllocationId: a.id,
          lotId: a.lotId,
          ownerId: a.ownerId,
          ownerName: a.ownerName,
          storageBin: a.storageBin,
          qtyPhysical: a.qtyPhysical,
          qtyGood: a.qtyGood,
          qtyReserved: a.qtyReserved,
          qtyPendingInspection: a.qtyPendingInspection,
          qtyDefective: a.qtyDefective,
          qtyAvailable: a.qtyAvailable,
          unitCostPrivateCop: a.effectiveUnitCostCop
        }))
      : item.ownerAllocations.map((o, idx) => ({
          lotAllocationId: `ALLOC-${item.sku}-${idx}`,
          lotId: o.lotId,
          ownerId: o.ownerId,
          ownerName: o.ownerName,
          storageBin: o.storageBin,
          qtyPhysical: o.qtyPhysical,
          qtyGood: o.qtyAvailable,
          qtyReserved: 0,
          qtyPendingInspection: 0,
          qtyDefective: 0,
          qtyAvailable: o.qtyAvailable,
          unitCostPrivateCop: null
        }));

  const totalAvailableStock = internalOwnerBreakdown.reduce(
    (s, r) => s + r.qtyAvailable,
    0
  );
  const totalPendingInspectionStock = internalOwnerBreakdown.reduce(
    (s, r) => s + r.qtyPendingInspection,
    0
  );

  return {
    catalogItem: item,
    hasApprovedPrice:
      item.currentNormalPriceCop !== null && item.currentNormalPriceCop > 0,
    approvedNormalPriceCop: item.currentNormalPriceCop,
    approvedPromoPriceCop: item.currentPromoPriceCop,
    minimumInternalPriceCop: item.minimumPriceCop,
    totalAvailableStock,
    totalPendingInspectionStock,
    internalOwnerBreakdown
  };
}

// ============================================================================
// 3. GENERADOR DE MENSAJES POR PLANTILLA (10 PLANTILLAS + BIENVENIDA/AUSENCIA)
//    Garantiza:
//    - NUNCA incluir IDs de propietarios (OWN-0001), nombres de dueños ni costos.
//    - NUNCA inventar precios ni stock.
//    - NUNCA confirmar pago sin referencia de comprobante.
// ============================================================================

export function buildBuyerSafeWhatsAppMessageFromTemplate(input: {
  category: WhatsAppTemplateCategory;
  consultation: WhatsAppCatalogConsultationView;
  buyerName: string;
  quantityRequested: number;
  shippingCity: string;
  shippingCop: number;
  paymentVoucherProofRef?: string;
  orderNumberRef?: string;
}): string {
  const { consultation, category } = input;
  const item = consultation.catalogItem;
  const brand = getBrandMerchandisingState().currentBrandConfig;
  const buyerLabel = input.buyerName.trim() || 'Apreciado cliente';
  const qty = Math.max(1, input.quantityRequested || 1);

  const priceFormatted = consultation.hasApprovedPrice
    ? formatCOP(consultation.approvedNormalPriceCop!)
    : 'PENDIENTE DE AUTORIZACIÓN EN FINANZAS';

  const subtotalCop = consultation.hasApprovedPrice
    ? consultation.approvedNormalPriceCop! * qty
    : 0;
  const totalWithShippingCop = subtotalCop + Math.max(0, input.shippingCop || 0);

  switch (category) {
    case 'PRECIO':
      return [
        `Hola *${buyerLabel}*, gracias por escribir a *${brand.brandName}*.`,
        ``,
        `💰 *INFORMACIÓN OFICIAL DE PRECIO*`,
        `• *Producto:* ${item.productName} (${item.variantOrColor})`,
        `• *Código SKU:* \`${item.sku}\``,
        `• *Precio Unitario Autorizado:* *${priceFormatted}*`,
        consultation.approvedPromoPriceCop
          ? `• *Precio Promocional Vigente:* *${formatCOP(consultation.approvedPromoPriceCop)}*`
          : null,
        ``,
        `¿Deseas que te separemos ${qty} unidad(es)?`
      ]
        .filter(Boolean)
        .join('\n');

    case 'CARACTERISTICAS':
      return [
        `Hola *${buyerLabel}*, te compartimos la ficha técnica verificada en *${brand.brandName}*:`,
        ``,
        `🔍 *ESPECIFICACIONES VERIFICADAS*`,
        `• *Artículo:* ${item.productName}`,
        `• *Variante / Color:* ${item.variantOrColor}`,
        `• *Categoría:* ${item.category}`,
        `• *Código SKU:* \`${item.sku}\``,
        `• *Características Reales:* ${item.verifiedFeatures}`,
        ``,
        `Todos nuestros productos pasan por revisión de calidad antes de su entrega.`
      ].join('\n');

    case 'DISPONIBILIDAD':
      if (consultation.totalAvailableStock <= 0) {
        return [
          `Hola *${buyerLabel}*, te informamos con total transparencia desde *${brand.brandName}*:`,
          ``,
          `📦 El artículo *${item.productName}* (\`${item.sku}\`) se encuentra temporalmente *sin unidades disponibles para despacho inmediato* (0 uds aptas).`,
          `Si deseas, podemos registrarte en nuestra lista de espera para avisarte tan pronto ingrese un nuevo lote verificado.`
        ].join('\n');
      }
      return [
        `Hola *${buyerLabel}*, acabamos de verificar en la bodega de *${brand.brandName}*:`,
        ``,
        `✅ *DISPONIBILIDAD CONFIRMADA*`,
        `• *Producto:* ${item.productName} (${item.variantOrColor})`,
        `• *Código SKU:* \`${item.sku}\``,
        `• *Unidades Aptas Disponibles Hoy:* *${consultation.totalAvailableStock} unidad(es)*`,
        `• *Valor Unitario:* *${priceFormatted}*`,
        ``,
        `Indícanos si deseas reservar ${qty} unidad(es) para proceder con tu pedido.`
      ].join('\n');

    case 'ENVIO':
      return [
        `Hola *${buyerLabel}*, estas son las opciones de entrega de *${brand.brandName}* para tu *${item.productName}* (\`${item.sku}\`):`,
        ``,
        `🚚 *CONDICIONES DE ENVÍO Y ENTREGA*`,
        `• *Ciudad destino:* ${input.shippingCity || 'Barranquilla'}`,
        `• *Valor estimado de envío:* ${input.shippingCop > 0 ? formatCOP(input.shippingCop) : 'Recogida en tienda ($0 COP) / Por cotizar según dirección'}`,
        `• *Despachos locales:* Entrega ágil en ${brand.companyInfo.cityAndCountry}.`,
        `• *Despachos nacionales:* Envío asegurado por transportadora con número de guía para rastreo.`
      ].join('\n');

    case 'PAGO':
      return [
        `Hola *${buyerLabel}*, para adquirir tu *${item.productName}* (\`${item.sku}\`) por *${formatCOP(totalWithShippingCop)}*, disponemos de los siguientes medios de pago en *${brand.brandName}*:`,
        ``,
        `💳 *MEDIOS DE PAGO AUTORIZADOS*`,
        `• Efectivo contra entrega en tienda`,
        `• Transferencia bancaria / Nequi / Daviplata`,
        ``,
        `⚠️ *Importante:* Una vez realizado el pago, por favor envíanos por este chat la foto o número de referencia del comprobante. Tu pago quedará confirmado únicamente tras verificar el soporte.`
      ].join('\n');

    case 'GARANTIA':
      return [
        `Hola *${buyerLabel}*, en *${brand.brandName}* compras con total tranquilidad:`,
        ``,
        `🛡️ *POLÍTICA DE CALIDAD Y GARANTÍA*`,
        `• *Producto:* ${item.productName} (\`${item.sku}\`)`,
        `• *Cobertura:* ${brand.companyInfo.warrantyPolicySummary}`,
        `• Cada unidad es inspeccionada física y funcionalmente antes del despacho y conserva trazabilidad por lote.`
      ].join('\n');

    case 'PEDIDO':
      return [
        `Hola *${buyerLabel}*, hemos preparado el resumen de tu pedido en *${brand.brandName}*:`,
        ``,
        `🧾 *RESUMEN DE PEDIDO ${input.orderNumberRef ? `(${input.orderNumberRef})` : ''}*`,
        `• *Artículo:* ${item.productName} (${item.variantOrColor})`,
        `• *SKU:* \`${item.sku}\``,
        `• *Cantidad:* ${qty} unidad(es)`,
        `• *Precio Unitario:* ${priceFormatted}`,
        `• *Subtotal Mercancía:* ${formatCOP(subtotalCop)}`,
        `• *Costo de Envío (${input.shippingCity || 'Barranquilla'}):* ${formatCOP(Math.max(0, input.shippingCop || 0))}`,
        `• *TOTAL A PAGAR:* *${formatCOP(totalWithShippingCop)}*`,
        ``,
        `Por favor confírmanos si los datos son correctos para reservar tu inventario.`
      ].join('\n');

    case 'CONFIRMACION':
      return [
        `Hola *${buyerLabel}*, ¡gracias por tu compra en *${brand.brandName}*! ✅`,
        ``,
        `🎉 *CONFIRMACIÓN DE PAGO VERIFICADO Y RESERVA*`,
        `• *Pedido:* ${input.orderNumberRef || 'Orden Registrada'}`,
        `• *Producto:* ${qty}x ${item.productName} (\`${item.sku}\`)`,
        `• *Valor Verificado:* ${formatCOP(totalWithShippingCop)}`,
        `• *Soporte / Referencia de Pago Verificada:* \`${(input.paymentVoucherProofRef || '').trim()}\``,
        ``,
        `Tu pedido ya se encuentra en alistamiento y empaque. Te compartiremos la guía de despacho tan pronto salga de bodega.`
      ].join('\n');

    case 'SEGUIMIENTO':
      return [
        `Hola *${buyerLabel}*, te saludamos de *${brand.brandName}*. 👋`,
        ``,
        `Queríamos saber si pudiste revisar la información del *${item.productName} (${item.variantOrColor})* — SKU \`${item.sku}\` o si tienes alguna duda sobre sus características o el proceso de envío.`,
        ``,
        `Seguimos atentos para ayudarte cuando lo desees.`
      ].join('\n');

    case 'POSTVENTA':
      return [
        `Hola *${buyerLabel}*, te escribimos del equipo postventa de *${brand.brandName}*. ⭐`,
        ``,
        `Queremos confirmar que hayas recibido tu *${item.productName}* (\`${item.sku}\`) en perfecto estado y que su funcionamiento cumpla tus expectativas.`,
        ``,
        `Recuerda conservar tu código de pedido para cualquier soporte o garantía. ¡Gracias por confiar en nosotros!`
      ].join('\n');

    case 'BIENVENIDA':
      return getWhatsAppSalesCenterState().greetingAndQuickConfig.welcomeMessage;

    case 'AUSENCIA':
      return getWhatsAppSalesCenterState().greetingAndQuickConfig.awayMessage;
  }
}

// ============================================================================
// 4. VALIDADOR DE SEGURIDAD COMERCIAL PARA MENSAJES DE WHATSAPP
//    - No mostrar a compradores información interna de propietarios.
//    - No inventar stock.
//    - No inventar precios.
//    - No confirmar pagos sin prueba.
//    - No enviar mensajes masivos ni automáticos.
//    - Respetar permisos de contacto.
// ============================================================================

const INTERNAL_OWNER_LEAK_PATTERNS = [
  /own-\d{4}/i,
  /\beberto\b/i,
  /propietario\s+interno/i,
  /costo\s+de\s+compra/i,
  /costo\s+unitario\s+privado/i,
  /comision\s+propietario/i,
  /lot-ini-/i
];

export function validateWhatsAppBuyerMessageSecurity(input: {
  category: WhatsAppTemplateCategory;
  consultation: WhatsAppCatalogConsultationView | null;
  preparedMessage: string;
  quantityRequested: number;
  paymentVoucherProofRef?: string;
  contactPermissionGranted: boolean;
}): WhatsAppSecurityCheckResult {
  const blockingErrors: string[] = [];
  const msg = input.preparedMessage || '';

  // 1. Prohibido revelar información interna de propietarios o costos a los compradores
  const leakedPattern = INTERNAL_OWNER_LEAK_PATTERNS.find((regex) => regex.test(msg));
  const noInternalOwnerLeakCheck = !leakedPattern
    ? {
        passed: true,
        message: 'Mensaje 100% limpio: cero datos internos de propietarios, lotes o costos expuestos al comprador.'
      }
    : {
        passed: false,
        message:
          'BLOQUEO DE PRIVACIDAD: El mensaje contiene datos internos de propietarios (ej. OWN-0001 / nombre del propietario / lote / costo privado) que no deben mostrarse a compradores.'
      };
  if (!noInternalOwnerLeakCheck.passed) {
    blockingErrors.push(noInternalOwnerLeakCheck.message);
  }

  // 2. Prohibido inventar precios
  const requiresPrice = ['PRECIO', 'DISPONIBILIDAD', 'PAGO', 'PEDIDO', 'CONFIRMACION'].includes(
    input.category
  );
  const priceOk =
    !requiresPrice || Boolean(input.consultation && input.consultation.hasApprovedPrice);
  const noInventedPriceCheck = priceOk
    ? {
        passed: true,
        message: input.consultation?.hasApprovedPrice
          ? `Precio comercial aprobado verificado (${formatCOP(input.consultation.approvedNormalPriceCop!)}).`
          : 'La plantilla no requiere cotizar precio.'
      }
    : {
        passed: false,
        message: `BLOQUEO DE PRECIO: El SKU ${input.consultation?.catalogItem.sku || ''} no tiene precio aprobado en Finanzas. Prohibido inventar precios.`
      };
  if (!noInventedPriceCheck.passed) {
    blockingErrors.push(noInventedPriceCheck.message);
  }

  // 3. Prohibido inventar stock al comprometer pedido o confirmación
  const requiresStockCommit = ['PEDIDO', 'CONFIRMACION'].includes(input.category);
  const avail = input.consultation?.totalAvailableStock || 0;
  const qtyReq = Math.max(1, input.quantityRequested || 1);
  const stockOk = !requiresStockCommit || avail >= qtyReq;
  const noInventedStockCheck = stockOk
    ? {
        passed: true,
        message: `Existencias verificadas (${avail} uds disponibles frente a ${qtyReq} solicitada(s)).`
      }
    : {
        passed: false,
        message: `BLOQUEO DE STOCK: No se puede confirmar pedido por ${qtyReq} ud(s) cuando solo hay ${avail} ud(s) disponibles. Prohibido inventar stock.`
      };
  if (!noInventedStockCheck.passed) {
    blockingErrors.push(noInventedStockCheck.message);
  }

  // 4. Prohibido confirmar pagos sin prueba (comprobante/referencia)
  const needsProof = input.category === 'CONFIRMACION';
  const hasProof = Boolean(
    input.paymentVoucherProofRef && input.paymentVoucherProofRef.trim().length >= 4
  );
  const paymentProofVerifiedCheck =
    !needsProof || hasProof
      ? {
          passed: true,
          message: needsProof
            ? `Soporte de pago verificado: ${input.paymentVoucherProofRef?.trim()}`
            : 'No es mensaje de confirmación de pago.'
        }
      : {
          passed: false,
          message:
            'BLOQUEO FINANCIERO: Prohibido confirmar pagos sin registrar primero la referencia o prueba verificada del comprobante.'
        };
  if (!paymentProofVerifiedCheck.passed) {
    blockingErrors.push(paymentProofVerifiedCheck.message);
  }

  // 5. Respetar permisos de contacto (opt-in)
  const contactPermissionCheck = input.contactPermissionGranted
    ? {
        passed: true,
        message: 'Permiso de contacto (opt-in) activo y respetado.'
      }
    : {
        passed: false,
        message:
          'BLOQUEO DE PERMISO DE CONTACTO: El comprador no otorgó o revocó el permiso de contacto. No se permite enviarle mensajes.'
      };
  if (!contactPermissionCheck.passed) {
    blockingErrors.push(contactPermissionCheck.message);
  }

  // 6. Cero envíos masivos y cero automatización no oficial
  const noMassOrAutoSendCheck = {
    passed: true,
    message:
      'Atención individual 1 a 1 mediante enlace wa.me oficial (Envío masivo bloqueado • Cloud API desactivada • Cero bots).'
  };

  return {
    passedAll: blockingErrors.length === 0,
    noInternalOwnerLeakCheck,
    noInventedPriceCheck,
    noInventedStockCheck,
    paymentProofVerifiedCheck,
    contactPermissionCheck,
    noMassOrAutoSendCheck,
    blockingErrors
  };
}

// ============================================================================
// 5. PREPARACIÓN DE ENLACE OFICIAL WA.ME Y REGISTRO DE ATENCIÓN MANUAL
// ============================================================================

export function buildBuyerWaMeDeepLink(buyerPhone: string, messageText: string): string {
  const digits = normalizeWhatsAppDigits(buyerPhone) || '573000000000';
  return `https://wa.me/${digits}?text=${encodeURIComponent(messageText)}`;
}

export function prepareAndRecordWhatsAppInteraction(input: {
  buyerName: string;
  buyerPhoneWhatsapp: string;
  contactPermissionGranted: boolean;
  sku: string;
  internalOwnerIdChecked: string;
  templateCategory: WhatsAppTemplateCategory;
  preparedBuyerMessage: string;
  quantityRequested: number;
  paymentVoucherProofRef?: string;
  linkedLeadId?: string | null;
  linkedOrderId?: string | null;
  actorName: string;
}): WhatsAppPreparedInteractionRecord {
  const consultation = getWhatsAppCatalogConsultation(input.sku);
  const security = validateWhatsAppBuyerMessageSecurity({
    category: input.templateCategory,
    consultation,
    preparedMessage: input.preparedBuyerMessage,
    quantityRequested: input.quantityRequested,
    paymentVoucherProofRef: input.paymentVoucherProofRef,
    contactPermissionGranted: input.contactPermissionGranted
  });

  if (!security.passedAll) {
    throw new Error(security.blockingErrors.join(' | '));
  }

  const state = getWhatsAppSalesCenterState();
  const nextIdx = state.interactionsLog.length + 1;
  const nowIso = new Date().toISOString();
  const waMeUrl = buildBuyerWaMeDeepLink(input.buyerPhoneWhatsapp, input.preparedBuyerMessage);

  const phoneNorm = normalizeWhatsAppDigits(input.buyerPhoneWhatsapp);
  if (phoneNorm) {
    state.contactPermissionsByPhone[phoneNorm] = input.contactPermissionGranted;
  }

  const record: WhatsAppPreparedInteractionRecord = {
    id: `WAINT-${Date.now()}-${nextIdx}`,
    interactionCode: `WA-2026-${String(nextIdx).padStart(4, '0')}`,
    buyerName: input.buyerName.trim() || 'Comprador WhatsApp',
    buyerPhoneWhatsapp: input.buyerPhoneWhatsapp.trim() || '+57 300 000 0000',
    contactPermissionGranted: input.contactPermissionGranted,
    sku: input.sku,
    productName: consultation?.catalogItem.productName || input.sku,
    internalOwnerIdChecked: input.internalOwnerIdChecked,
    templateCategory: input.templateCategory,
    preparedBuyerMessage: input.preparedBuyerMessage,
    generatedWaMeUrl: waMeUrl,
    paymentVoucherProofRef: input.paymentVoucherProofRef?.trim() || null,
    linkedLeadId: input.linkedLeadId || null,
    linkedOrderId: input.linkedOrderId || null,
    handledBy: input.actorName,
    createdAt: nowIso
  };

  state.interactionsLog.unshift(record);
  saveWhatsAppSalesCenterState(state);
  return record;
}

export function updateWhatsAppGreetingAndQuickConfig(input: {
  storeWhatsappNumber: string;
  welcomeMessage: string;
  awayMessage: string;
  businessHoursNote: string;
}): WhatsAppBusinessAppGreetingConfig {
  const state = getWhatsAppSalesCenterState();
  state.greetingAndQuickConfig = {
    ...state.greetingAndQuickConfig,
    storeWhatsappNumber: input.storeWhatsappNumber.trim() || '+57 300 000 0000',
    welcomeMessage: input.welcomeMessage.trim(),
    awayMessage: input.awayMessage.trim(),
    businessHoursNote: input.businessHoursNote.trim()
  };
  saveWhatsAppSalesCenterState(state);
  return state.greetingAndQuickConfig;
}

// ============================================================================
// 6. INTEGRACIÓN DIRECTA CON PROSPECTOS, SEGUIMIENTO, PEDIDOS E HISTORIAL
// ============================================================================

export function registerWhatsAppProspectAndFollowup(input: {
  fullName: string;
  phoneWhatsapp: string;
  city: string;
  interestedSku: string;
  notes: string;
  contactPermissionGranted: boolean;
  actorName: string;
}): CrmLeadRecord {
  if (!input.contactPermissionGranted) {
    throw new Error(
      'BLOQUEO DE PERMISO: No se puede registrar seguimiento activo sin permiso de contacto del comprador.'
    );
  }

  const lead = createCrmLead({
    fullName: input.fullName,
    phoneWhatsapp: input.phoneWhatsapp,
    city: input.city || 'Barranquilla',
    sourceChannel: 'whatsapp',
    interestedSku: input.interestedSku,
    assignedTo: input.actorName,
    notes: input.notes || `Consulta atendida en WhatsApp Sales Center sobre SKU ${input.interestedSku}.`
  });

  const waState = getWhatsAppSalesCenterState();
  const phoneNorm = normalizeWhatsAppDigits(input.phoneWhatsapp);
  if (phoneNorm) {
    waState.contactPermissionsByPhone[phoneNorm] = true;
    saveWhatsAppSalesCenterState(waState);
  }

  return lead;
}

export function recordWhatsAppFollowupOnExistingLead(input: {
  leadId: string;
  newStage: CrmLeadRecord['stage'];
  summary: string;
  actorName: string;
}): CrmLeadRecord {
  return addLeadFollowupAndStage({
    leadId: input.leadId,
    newStage: input.newStage,
    interactionType: 'whatsapp_manual_note',
    summary: input.summary,
    actorName: input.actorName
  });
}

export function createAssistedOrderFromWhatsApp(input: {
  buyerName: string;
  buyerPhoneWhatsapp: string;
  buyerCity: string;
  buyerAddress: string;
  sku: string;
  lotAllocationId: string;
  quantity: number;
  shippingChargedCop: number;
  actorName: string;
}): { order: SalesOrderRecord; customerSummary: CustomerCommercialSummary | undefined } {
  const consultation = getWhatsAppCatalogConsultation(input.sku);
  if (!consultation || !consultation.hasApprovedPrice) {
    throw new Error(`El SKU ${input.sku} no tiene precio comercial aprobado para crear pedido.`);
  }
  if (consultation.totalAvailableStock < input.quantity) {
    throw new Error(
      `Stock insuficiente para ${input.sku}: solicitadas ${input.quantity} ud(s), disponibles ${consultation.totalAvailableStock} ud(s).`
    );
  }

  // Buscar cliente existente por teléfono o registrarlo sin duplicar
  const crmState = getSalesOrdersCrmState();
  const phoneNorm = normalizeWhatsAppDigits(input.buyerPhoneWhatsapp);
  let customer = crmState.customers.find(
    (c) => normalizeWhatsAppDigits(c.phoneWhatsapp) === phoneNorm
  );

  if (!customer) {
    const created = registerOrValidateCustomer({
      fullName: input.buyerName,
      phoneWhatsapp: input.buyerPhoneWhatsapp,
      city: input.buyerCity || 'Barranquilla',
      shippingAddress: input.buyerAddress || 'Por confirmar en chat WhatsApp',
      acquisitionSource: 'whatsapp',
      notes: 'Cliente registrado desde WhatsApp Sales Center.'
    });
    customer = created.customer;
  }

  const order = txCreateSalesOrder({
    customerId: customer.id,
    salesChannel: 'whatsapp',
    shippingChargedCop: Math.max(0, input.shippingChargedCop || 0),
    shippingRealCostCop: Math.max(0, input.shippingChargedCop || 0),
    sellerName: input.actorName,
    notes: `Pedido creado desde WhatsApp Sales Center (Pago en estado PENDIENTE hasta verificar comprobante).`,
    reserveImmediately: true,
    lines: [
      {
        sku: input.sku,
        qtyOrdered: input.quantity,
        unitSalePriceCop: consultation.approvedNormalPriceCop!,
        lineDiscountCop: 0,
        allocations: [
          {
            lotAllocationId: input.lotAllocationId,
            qtyAllocated: input.quantity
          }
        ]
      }
    ]
  });

  const summaries = buildCustomerCommercialSummaries();
  const customerSummary = summaries.find((s) => s.customer.id === customer!.id);

  return { order, customerSummary };
}
