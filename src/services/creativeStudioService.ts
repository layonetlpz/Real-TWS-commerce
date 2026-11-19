// ============================================================================
// REAL TWS COMMERCE SYSTEM — AI CREATIVE & ADVERTISING STUDIO ENGINE (FASE 8)
// Cubre:
//   A. COPYWRITING:
//      - 5 variantes de título (headlines)
//      - 5 variantes de texto publicitario (adCopyVariants)
//      - 3 descripciones cortas (shortDescriptions)
//      - 3 llamadas a la acción (callsToAction)
//      - Textos específicos para Marketplace, Facebook, Instagram y WhatsApp.
//   B. VIDEO:
//      - Guiones completos de 10, 15, 30 y 45 segundos
//      - Storyboard estructurado por escenas, narración, subtítulos,
//        texto en pantalla y llamada a la acción final.
//   C. IMAGE COMPOSER:
//      - Utiliza fotografías reales aprobadas (sin deformar ni modificar el
//        producto original y sin inventar especificaciones).
//      - Formatos 1:1 (1080x1080), 4:5 (1080x1350) y 9:16 (1080x1920).
//      - Composición con Canvas/SVG agregando logo REAL TWS, precio vigente,
//        SKU y textos aprobados.
//   D. BRAND KIT:
//      - Mantiene identidad REAL TWS (colores, tipografía, plantillas) y
//        guarda versiones.
//   E. AI PROVIDER (Adaptador Opcional Gemini API):
//      - Funciona al 100% con motor local determinístico sin exigir IA.
//      - Controla cuota diaria, filtra estrictamente datos públicos comerciales,
//        nunca envía datos personales ni costos privados y no activa facturación.
//   F. LIBRARY & OWNER CONSENT:
//      - Guarda imagen original intacta, imagen final compuesta, guiones y
//        versiones inmutables (v1..vN) relacionadas con SKU y Propietario.
//      - Registra consentimiento comercial explícito del propietario antes de
//        promocionar su mercancía.
//   G. VALIDACIÓN ESTRICTA:
//      - No generar precio si no está aprobado.
//      - No generar disponibilidad si no hay stock.
//      - No generar descuentos fuera del acuerdo.
//      - No afirmar características desconocidas.
// ============================================================================

import {
  getBrandMerchandisingState,
  type RealCatalogMerchItem,
  type BrandIdentityConfig
} from './brandMerchandisingService';
import { getFinancialAccountingState } from './financialAccountingService';
import { formatCOP } from '../utils/formatters';

export type CreativeAspectRatio = '1:1' | '4:5' | '9:16';

export type CreativeEngineMode = 'LOCAL_TEMPLATE_ENGINE' | 'GEMINI_OPTIONAL_ADAPTER';

export interface OwnerMarketingConsentRecord {
  id: string;
  consentCode: string;
  ownerId: string;
  ownerName: string;
  sku: string;
  productName: string;
  status: 'pending_consent' | 'granted' | 'revoked';
  authorizedChannels: Array<'marketplace' | 'facebook' | 'instagram' | 'whatsapp'>;
  maxAuthorizedDiscountPct: number;
  consentNotes: string;
  grantedBy: string | null;
  grantedAt: string | null;
  updatedAt: string;
}

export interface CreativeCopywritingBundle {
  sku: string;
  ownerId: string;
  effectivePriceCop: number;
  discountAppliedPct: number;
  verifiedStockUnits: number;
  headlines: [string, string, string, string, string]; // Exactamente 5 variantes de título
  adCopyVariants: [string, string, string, string, string]; // Exactamente 5 variantes de texto publicitario
  shortDescriptions: [string, string, string]; // Exactamente 3 descripciones cortas
  callsToAction: [string, string, string]; // Exactamente 3 llamadas a la acción
  channelSpecific: {
    marketplace: string;
    facebook: string;
    instagram: string;
    whatsapp: string;
  };
}

export type VideoDurationSeconds = 10 | 15 | 30 | 45;

export interface VideoStoryboardScene {
  sceneNumber: number;
  timeRangeLabel: string;
  durationSeconds: number;
  shotTypeAndVisual: string;
  narrationVoiceover: string;
  subtitlesText: string;
  onScreenTextOverlay: string;
}

export interface VideoScriptByDuration {
  durationSeconds: VideoDurationSeconds;
  title: string;
  objective: string;
  closingCallToAction: string;
  scenes: VideoStoryboardScene[];
}

export interface VideoScriptsBundle {
  sku: string;
  productName: string;
  scriptsByDuration: Record<VideoDurationSeconds, VideoScriptByDuration>;
}

export interface ImageComposerSettings {
  aspectRatio: CreativeAspectRatio;
  templateStyle: 'LUXURY_CARBON_GOLD' | 'EDITORIAL_CLEAN' | 'HIGH_IMPACT_PROMO';
  selectedHeadlineIndex: number; // 0..4
  selectedShortDescIndex: number; // 0..2
  selectedCtaIndex: number; // 0..2
  discountPct: number;
  originalProductPhotoDataUrl: string | null; // Imagen real subida o del catálogo (jamás modificada/deformada)
}

export interface CreativeStudioVersionSnapshot {
  versionNumber: number;
  isOriginalBaseline: boolean;
  savedAt: string;
  savedBy: string;
  changeNote: string;
  brandKitVersionUsed: number;
  aspectRatio: CreativeAspectRatio;
  originalImagePreserved: string | null;
  finalComposedSvgMarkup: string;
  copywritingBundle: CreativeCopywritingBundle;
  videoScriptsBundle: VideoScriptsBundle;
  composerSettings: ImageComposerSettings;
}

export interface CreativeStudioSavedProject {
  id: string;
  projectCode: string;
  title: string;
  sku: string;
  productName: string;
  ownerId: string;
  ownerName: string;
  consentCode: string;
  engineUsed: CreativeEngineMode;
  approvedPriceSnapshotCop: number;
  verifiedStockSnapshot: number;
  discountAppliedPct: number;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  versions: CreativeStudioVersionSnapshot[];
}

export interface OptionalGeminiAdapterConfig {
  enabled: boolean;
  dailyQuotaLimit: number;
  dailyQuotaUsed: number;
  lastResetDate: string;
  billingActivationBlocked: true; // Regla obligatoria: No activar facturación
  onlyPublicCommercialDataAllowed: true; // Regla obligatoria: No enviar datos personales
  auditLogs: Array<{
    id: string;
    timestamp: string;
    sku: string;
    modeUsed: CreativeEngineMode;
    sanitizedPayloadPreview: string;
    status: 'executed_local' | 'executed_gemini_optional' | 'blocked_by_quota_or_disabled';
  }>;
}

export interface CreativeValidationCheckResult {
  passedAll: boolean;
  priceApprovedCheck: { passed: boolean; message: string };
  stockAvailableCheck: { passed: boolean; message: string };
  discountAgreementCheck: { passed: boolean; message: string };
  verifiedSpecsOnlyCheck: { passed: boolean; message: string };
  ownerConsentCheck: { passed: boolean; message: string };
  blockingErrors: string[];
}

export interface CreativeStudioStoreState {
  consents: Record<string, OwnerMarketingConsentRecord>; // keyed by `${ownerId}__${sku}`
  projects: CreativeStudioSavedProject[];
  aiAdapterConfig: OptionalGeminiAdapterConfig;
}

const CREATIVE_STUDIO_STORAGE_KEY = 'rtw_ai_creative_studio_state_v1';

// Lista de afirmaciones técnicas que no pueden inventarse si no constan en verifiedFeatures
const UNVERIFIED_SPEC_CLAIMS_BLACKLIST = [
  'ip68',
  'ipx8',
  'sumergible',
  'cancelacion activa anc',
  'carga solar',
  '100 horas de bateria',
  'garantia de por vida',
  'titanio aeroespacial',
  'certificacion militar'
];

function escapeXml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// 1. ESTADO E INICIALIZACIÓN DEL CREATIVE STUDIO
// ============================================================================

function createInitialCreativeStudioState(): CreativeStudioStoreState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    consents: {},
    projects: [],
    aiAdapterConfig: {
      enabled: false, // Opcional y apagado por defecto: el sistema funciona 100% sin IA
      dailyQuotaLimit: 15,
      dailyQuotaUsed: 0,
      lastResetDate: today,
      billingActivationBlocked: true,
      onlyPublicCommercialDataAllowed: true,
      auditLogs: []
    }
  };
}

let inMemoryCreativeStudioState: CreativeStudioStoreState | null = null;

export function getCreativeStudioState(): CreativeStudioStoreState {
  if (inMemoryCreativeStudioState) {
    return inMemoryCreativeStudioState;
  }
  try {
    const raw = localStorage.getItem(CREATIVE_STUDIO_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CreativeStudioStoreState;
      if (parsed && parsed.consents && Array.isArray(parsed.projects)) {
        inMemoryCreativeStudioState = parsed;
        return parsed;
      }
    }
  } catch {
    // Fallback
  }
  const initial = createInitialCreativeStudioState();
  inMemoryCreativeStudioState = initial;
  saveCreativeStudioState(initial);
  return initial;
}

export function saveCreativeStudioState(state: CreativeStudioStoreState): void {
  inMemoryCreativeStudioState = state;
  try {
    localStorage.setItem(CREATIVE_STUDIO_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota issues
  }
}

// ============================================================================
// 2. GESTIÓN DE CONSENTIMIENTO COMERCIAL DEL PROPIETARIO POR SKU (SECCIÓN F)
// ============================================================================

export function getOwnerConsentKey(ownerId: string, sku: string): string {
  return `${ownerId.trim().toUpperCase()}__${sku.trim().toUpperCase()}`;
}

export function readOwnerMarketingConsent(
  ownerId: string,
  ownerName: string,
  sku: string,
  productName: string
): OwnerMarketingConsentRecord {
  const state = getCreativeStudioState();
  const key = getOwnerConsentKey(ownerId, sku);
  if (state.consents[key]) {
    return state.consents[key];
  }
  return {
    id: `CNS-PENDING-${key}`,
    consentCode: 'AUT-MKT-PEND',
    ownerId,
    ownerName,
    sku,
    productName,
    status: 'pending_consent',
    authorizedChannels: ['marketplace', 'facebook', 'instagram', 'whatsapp'],
    maxAuthorizedDiscountPct: 0,
    consentNotes: 'Pendiente de registrar consentimiento comercial del propietario antes de promocionar.',
    grantedBy: null,
    grantedAt: null,
    updatedAt: ''
  };
}

export function getOrInitializeOwnerMarketingConsent(
  ownerId: string,
  ownerName: string,
  sku: string,
  productName: string
): OwnerMarketingConsentRecord {
  const state = getCreativeStudioState();
  const key = getOwnerConsentKey(ownerId, sku);
  if (state.consents[key]) {
    return state.consents[key];
  }
  const idx = Object.keys(state.consents).length + 1;
  const record: OwnerMarketingConsentRecord = {
    id: `CNS-${Date.now()}-${idx}`,
    consentCode: `AUT-MKT-${String(idx).padStart(4, '0')}`,
    ownerId,
    ownerName,
    sku,
    productName,
    status: 'pending_consent',
    authorizedChannels: ['marketplace', 'facebook', 'instagram', 'whatsapp'],
    maxAuthorizedDiscountPct: 0,
    consentNotes: 'Pendiente de registrar consentimiento comercial del propietario antes de promocionar.',
    grantedBy: null,
    grantedAt: null,
    updatedAt: new Date().toISOString()
  };
  state.consents[key] = record;
  saveCreativeStudioState(state);
  return record;
}

export function registerOwnerMarketingConsent(input: {
  ownerId: string;
  ownerName: string;
  sku: string;
  productName: string;
  status: 'granted' | 'revoked' | 'pending_consent';
  authorizedChannels: Array<'marketplace' | 'facebook' | 'instagram' | 'whatsapp'>;
  maxAuthorizedDiscountPct: number;
  consentNotes: string;
  actorName: string;
}): OwnerMarketingConsentRecord {
  const state = getCreativeStudioState();
  const key = getOwnerConsentKey(input.ownerId, input.sku);
  const existing = getOrInitializeOwnerMarketingConsent(
    input.ownerId,
    input.ownerName,
    input.sku,
    input.productName
  );

  if (input.maxAuthorizedDiscountPct < 0 || input.maxAuthorizedDiscountPct > 100) {
    throw new Error('El porcentaje de descuento autorizado debe estar entre 0% y 100%.');
  }

  const nowIso = new Date().toISOString();
  const updated: OwnerMarketingConsentRecord = {
    ...existing,
    status: input.status,
    authorizedChannels: input.authorizedChannels,
    maxAuthorizedDiscountPct: input.maxAuthorizedDiscountPct,
    consentNotes: input.consentNotes.trim() || 'Consentimiento comercial registrado en Creative Studio.',
    grantedBy: input.status === 'granted' ? input.actorName : null,
    grantedAt: input.status === 'granted' ? nowIso : null,
    updatedAt: nowIso
  };

  state.consents[key] = updated;
  saveCreativeStudioState(state);
  return updated;
}

// ============================================================================
// 3. MOTOR DE VALIDACIÓN ESTRICTA (SECCIÓN G)
//    - No generar precio si no está aprobado.
//    - No generar disponibilidad si no hay stock.
//    - No generar descuentos fuera del acuerdo.
//    - No afirmar características desconocidas.
//    - Exigir consentimiento comercial del propietario.
// ============================================================================

export function validateCreativeCompliance(input: {
  catalogItem: RealCatalogMerchItem | null;
  ownerId: string;
  requestedDiscountPct: number;
  customTextToInspect?: string;
}): CreativeValidationCheckResult {
  const blockingErrors: string[] = [];

  if (!input.catalogItem) {
    return {
      passedAll: false,
      priceApprovedCheck: { passed: false, message: 'SKU no encontrado en el catálogo.' },
      stockAvailableCheck: { passed: false, message: 'Sin datos de stock.' },
      discountAgreementCheck: { passed: false, message: 'Sin acuerdo.' },
      verifiedSpecsOnlyCheck: { passed: false, message: 'Sin especificaciones.' },
      ownerConsentCheck: { passed: false, message: 'Sin consentimiento.' },
      blockingErrors: ['Debe seleccionar un SKU válido del catálogo real.']
    };
  }

  const item = input.catalogItem;
  const ownerAlloc = item.ownerAllocations.find((a) => a.ownerId === input.ownerId);
  const ownerAvailableStock = ownerAlloc ? ownerAlloc.qtyAvailable : 0;
  const ownerPendingInspection = ownerAlloc ? ownerAlloc.qtyPendingInspection : 0;

  // 1. Validación de Precio Aprobado
  const hasApprovedPrice =
    item.currentNormalPriceCop !== null && item.currentNormalPriceCop > 0;
  const priceApprovedCheck = hasApprovedPrice
    ? {
        passed: true,
        message: `Precio comercial aprobado: ${formatCOP(item.currentNormalPriceCop!)}`
      }
    : {
        passed: false,
        message: `BLOQUEO: El SKU ${item.sku} no tiene precio comercial aprobado en Finanzas. Prohibido generar precios no aprobados.`
      };
  if (!priceApprovedCheck.passed) {
    blockingErrors.push(priceApprovedCheck.message);
  }

  // 2. Validación de Stock Disponible Real (excluye defectuoso, reservado y pendiente de inspección)
  const hasStock = ownerAvailableStock > 0;
  const stockAvailableCheck = hasStock
    ? {
        passed: true,
        message: `Stock disponible verificado para ${input.ownerId}: ${ownerAvailableStock} unidad(es)`
      }
    : {
        passed: false,
        message:
          ownerPendingInspection > 0
            ? `BLOQUEO: El SKU ${item.sku} para ${input.ownerId} tiene ${ownerPendingInspection} unidad(es) en revisión técnica (qty_pending_inspection) y 0 disponibles aptas.`
            : `BLOQUEO: El SKU ${item.sku} tiene 0 unidades disponibles para ${input.ownerId}. Prohibido generar piezas de disponibilidad sin stock.`
      };
  if (!stockAvailableCheck.passed) {
    blockingErrors.push(stockAvailableCheck.message);
  }

  // 3. Validación de Consentimiento Comercial del Propietario
  const consent = readOwnerMarketingConsent(
    input.ownerId,
    ownerAlloc?.ownerName || input.ownerId,
    item.sku,
    item.productName
  );
  const hasConsent = consent.status === 'granted';
  const ownerConsentCheck = hasConsent
    ? {
        passed: true,
        message: `Consentimiento comercial activo (${consent.consentCode}) otorgado por ${consent.grantedBy || input.ownerId}`
      }
    : {
        passed: false,
        message: `BLOQUEO: El propietario ${input.ownerId} aún no ha otorgado consentimiento comercial (${consent.consentCode}) para promocionar el SKU ${item.sku}.`
      };
  if (!ownerConsentCheck.passed) {
    blockingErrors.push(ownerConsentCheck.message);
  }

  // 4. Validación de Descuento dentro del Acuerdo y Consentimiento
  const finState = getFinancialAccountingState();
  const ownerAgreement = finState.agreements[input.ownerId];
  const reqDisc = Math.max(0, input.requestedDiscountPct || 0);

  let discountPassed = true;
  let discountMsg =
    reqDisc === 0
      ? 'Sin descuento promocional aplicado (0% — precio oficial íntegro).'
      : `Descuento de ${reqDisc}% validado.`;

  if (reqDisc > 0) {
    if (reqDisc > consent.maxAuthorizedDiscountPct) {
      discountPassed = false;
      discountMsg = `BLOQUEO: El descuento solicitado (${reqDisc}%) supera el máximo permitido en el consentimiento del propietario (${consent.maxAuthorizedDiscountPct}%).`;
    } else if (
      ownerAgreement &&
      ownerAgreement.status === 'active' &&
      ownerAgreement.maxDiscountAllowedPct !== null &&
      reqDisc > ownerAgreement.maxDiscountAllowedPct
    ) {
      discountPassed = false;
      discountMsg = `BLOQUEO: El descuento solicitado (${reqDisc}%) supera el límite del acuerdo financiero (${ownerAgreement.maxDiscountAllowedPct}%).`;
    } else if (
      hasApprovedPrice &&
      item.minimumPriceCop !== null &&
      Math.round(item.currentNormalPriceCop! * (1 - reqDisc / 100)) < item.minimumPriceCop
    ) {
      discountPassed = false;
      discountMsg = `BLOQUEO: El descuento del ${reqDisc}% reduce el precio por debajo del precio mínimo autorizado (${formatCOP(item.minimumPriceCop)}).`;
    }
  }
  const discountAgreementCheck = { passed: discountPassed, message: discountMsg };
  if (!discountPassed) {
    blockingErrors.push(discountMsg);
  }

  // 5. Validación contra Características Desconocidas / Inventadas
  const combinedVerified = `${item.verifiedFeatures} ${item.originalExcelNotes}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const inspectNorm = (input.customTextToInspect || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const forbiddenFound = UNVERIFIED_SPEC_CLAIMS_BLACKLIST.find(
    (claim) => inspectNorm.includes(claim) && !combinedVerified.includes(claim)
  );

  const verifiedSpecsOnlyCheck = forbiddenFound
    ? {
        passed: false,
        message: `BLOQUEO: El texto afirma una característica desconocida o no registrada en la ficha del SKU ("${forbiddenFound}").`
      }
    : {
        passed: true,
        message: `Especificaciones 100% fieles al catálogo real: "${item.verifiedFeatures}"`
      };
  if (!verifiedSpecsOnlyCheck.passed) {
    blockingErrors.push(verifiedSpecsOnlyCheck.message);
  }

  return {
    passedAll: blockingErrors.length === 0,
    priceApprovedCheck,
    stockAvailableCheck,
    discountAgreementCheck,
    verifiedSpecsOnlyCheck,
    ownerConsentCheck,
    blockingErrors
  };
}

// ============================================================================
// 4. GENERADOR DE COPYWRITING (SECCIÓN A)
//    - 5 variantes de título
//    - 5 variantes de texto publicitario
//    - 3 descripciones cortas
//    - 3 llamadas a la acción
//    - Textos para Marketplace, Facebook, Instagram y WhatsApp
// ============================================================================

export function generateValidatedCopywritingBundle(input: {
  catalogItem: RealCatalogMerchItem;
  ownerId: string;
  discountPct: number;
  brand: BrandIdentityConfig;
}): CreativeCopywritingBundle {
  const { catalogItem: item, ownerId, discountPct, brand } = input;

  if (item.currentNormalPriceCop === null || item.currentNormalPriceCop <= 0) {
    throw new Error(
      `No se puede generar copywriting con precio para ${item.sku} porque su precio aún no está aprobado.`
    );
  }

  const ownerAlloc = item.ownerAllocations.find((a) => a.ownerId === ownerId);
  const availUnits = ownerAlloc ? ownerAlloc.qtyAvailable : item.qtyAvailableTotal;
  if (availUnits <= 0) {
    throw new Error(
      `No se puede generar copywriting de disponibilidad para ${item.sku} porque no tiene stock disponible (${availUnits} uds).`
    );
  }

  const safeDiscount = Math.max(0, discountPct || 0);
  const effectivePriceCop = Math.round(
    item.currentNormalPriceCop * (1 - safeDiscount / 100)
  );
  const priceText = formatCOP(effectivePriceCop);
  const discountTag =
    safeDiscount > 0
      ? ` (${safeDiscount}% Dto. autorizado sobre ${formatCOP(item.currentNormalPriceCop)})`
      : '';

  // 5 Variantes de Título
  const headlines: [string, string, string, string, string] = [
    `${item.productName} (${item.variantOrColor}) — ${priceText}`,
    `REAL TWS Presenta: ${item.productName} | SKU ${item.sku}`,
    `${item.category}: ${item.productName} con Respaldo Real en ${priceText}`,
    `Equípate Hoy con ${item.productName} (${item.variantOrColor}) — Stock Verificado`,
    `Calidad Inspeccionada REAL TWS: ${item.productName} a ${priceText}`
  ];

  // 5 Variantes de Texto Publicitario
  const adCopyVariants: [string, string, string, string, string] = [
    `Conoce el ${item.productName} en variante ${item.variantOrColor} (SKU: ${item.sku}). Especificaciones verificadas en nuestro catálogo: ${item.verifiedFeatures}. Precio oficial autorizado: ${priceText}${discountTag}. Contamos con ${availUnits} unidad(es) listas para despacho en ${brand.companyInfo.cityAndCountry}.`,
    `En ${brand.brandName} cada artículo pasa por control físico e inspección de calidad. Llévate el ${item.productName} (${item.variantOrColor}) por ${priceText}${discountTag}. Características reales: ${item.verifiedFeatures}.`,
    `¿Buscas accesorios confiables en la categoría ${item.category}? El ${item.productName} (Ref. ${item.sku}) ofrece ${item.verifiedFeatures}. Disponible hoy con ${availUnits} unidad(es) verificadas en inventario por ${priceText}.`,
    `${brand.slogan}. Te presentamos el ${item.productName} en color/variante ${item.variantOrColor}. Valor contado: ${priceText}${discountTag}. Respaldo directo de ${brand.brandName} y entrega ágil.`,
    `Ficha Oficial REAL TWS — Producto: ${item.productName} | SKU: ${item.sku} | Categoría: ${item.category} | Especificación verificada: ${item.verifiedFeatures} | Precio vigente: ${priceText} | Stock disponible: ${availUnits} ud(s).`
  ];

  // 3 Descripciones Cortas
  const shortDescriptions: [string, string, string] = [
    `${item.productName} (${item.variantOrColor}) — ${item.verifiedFeatures}. Precio: ${priceText}.`,
    `SKU ${item.sku} | Categoría ${item.category} | ${availUnits} ud(s) disponibles en REAL TWS por ${priceText}.`,
    `${item.productName} inspeccionado y garantizado por REAL TWS. Valor oficial: ${priceText}.`
  ];

  // 3 Llamadas a la Acción (CTAs)
  const callsToAction: [string, string, string] = [
    `Solicita el SKU ${item.sku} por WhatsApp al ${brand.companyInfo.whatsappContact}`,
    `Reserva tu unidad hoy en REAL TWS (${availUnits} disponibles) escribiendo a nuestro WhatsApp`,
    `Pide el tuyo con envío o recogida en tienda (${brand.companyInfo.cityAndCountry})`
  ];

  // Textos adaptados por canal
  const marketplace = [
    `📌 TÍTULO: ${item.productName} - Variante ${item.variantOrColor} (${item.sku})`,
    `💰 PRECIO APROBADO: ${priceText}${discountTag}`,
    `📦 DISPONIBILIDAD VERIFICADA: ${availUnits} unidad(es) aptas en inventario`,
    `🔍 ESPECIFICACIONES REALES: ${item.verifiedFeatures}`,
    `🛡️ GARANTÍA: ${brand.companyInfo.warrantyPolicySummary}`,
    `📍 UBICACIÓN: ${brand.companyInfo.cityAndCountry}`,
    `📲 PEDIDOS: Indícanos el código SKU ${item.sku} para separar tu unidad.`
  ].join('\n');

  const facebook = [
    `✨ ${item.productName.toUpperCase()} (${item.variantOrColor.toUpperCase()}) EN REAL TWS ✨`,
    ``,
    `${brand.slogan}. Te traemos tecnología verificada en nuestra categoría de ${item.category}:`,
    `✅ Producto: ${item.productName}`,
    `✅ Variante / Color: ${item.variantOrColor}`,
    `✅ Características reales: ${item.verifiedFeatures}`,
    `✅ Precio autorizado: ${priceText}${discountTag}`,
    `✅ Existencias listas para despacho: ${availUnits} unidad(es)`,
    ``,
    `👉 ${callsToAction[0]}`
  ].join('\n');

  const instagram = [
    `${item.productName} (${item.variantOrColor}) ⚡ Respaldo y calidad verificada en @realtws.co`,
    `.`,
    `🔹 SKU Oficial: ${item.sku}`,
    `🔹 Especificaciones: ${item.verifiedFeatures}`,
    `🔹 Precio vigente: ${priceText}${discountTag}`,
    `🔹 Unidades disponibles hoy: ${availUnits}`,
    `.`,
    `📩 ${callsToAction[1]}`,
    `#RealTWS #${item.category.replace(/[^a-zA-Z0-9]/g, '')} #TecnologiaColombia #Barranquilla`
  ].join('\n');

  const whatsapp = [
    `*REAL TWS — FICHA COMERCIAL OFICIAL*`,
    `• *Producto:* ${item.productName} (${item.variantOrColor})`,
    `• *Código SKU:* \`${item.sku}\``,
    `• *Especificaciones:* ${item.verifiedFeatures}`,
    `• *Precio Autorizado:* *${priceText}*${discountTag}`,
    `• *Disponibilidad Inmediata:* ${availUnits} unidad(es) verificadas`,
    ``,
    `Responde este mensaje con el código *${item.sku}* para reservar tu pedido.`
  ].join('\n');

  return {
    sku: item.sku,
    ownerId,
    effectivePriceCop,
    discountAppliedPct: safeDiscount,
    verifiedStockUnits: availUnits,
    headlines,
    adCopyVariants,
    shortDescriptions,
    callsToAction,
    channelSpecific: {
      marketplace,
      facebook,
      instagram,
      whatsapp
    }
  };
}

// ============================================================================
// 5. GENERADOR DE GUIONES DE VIDEO Y STORYBOARD (SECCIÓN B)
//    Duraciones obligatorias: 10, 15, 30 y 45 segundos
// ============================================================================

export function generateVideoScriptsAndStoryboards(
  item: RealCatalogMerchItem,
  copyBundle: CreativeCopywritingBundle,
  brand: BrandIdentityConfig
): VideoScriptsBundle {
  const priceText = formatCOP(copyBundle.effectivePriceCop);
  const ctaText = copyBundle.callsToAction[0];

  const script10: VideoScriptByDuration = {
    durationSeconds: 10,
    title: `Flash Reel 10s — ${item.productName} (${item.sku})`,
    objective: 'Impacto rápido de producto, especificación real y precio aprobado en 10 segundos.',
    closingCallToAction: ctaText,
    scenes: [
      {
        sceneNumber: 1,
        timeRangeLabel: '00:00 – 00:03',
        durationSeconds: 3,
        shotTypeAndVisual: `Plano cerrado sobre fondo Negro Carbón mostrando el ${item.productName} (${item.variantOrColor}) original sin filtros.`,
        narrationVoiceover: `¿Buscas ${item.productName} con respaldo real?`,
        subtitlesText: `¿Buscas ${item.productName} con respaldo real?`,
        onScreenTextOverlay: `REAL TWS • ${item.productName.toUpperCase()}`
      },
      {
        sceneNumber: 2,
        timeRangeLabel: '00:03 – 00:07',
        durationSeconds: 4,
        shotTypeAndVisual: `Giro de detalle mostrando acabados reales de la variante ${item.variantOrColor}.`,
        narrationVoiceover: `En REAL TWS lo tienes verificado: ${item.verifiedFeatures}.`,
        subtitlesText: `Verificado en catálogo: ${item.verifiedFeatures}`,
        onScreenTextOverlay: `SKU: ${item.sku} • ${item.variantOrColor.toUpperCase()}`
      },
      {
        sceneNumber: 3,
        timeRangeLabel: '00:07 – 00:10',
        durationSeconds: 3,
        shotTypeAndVisual: `Cierre con sello Dorado REAL TWS, insignia de precio y botón de contacto.`,
        narrationVoiceover: `Disponible hoy por ${priceText}. Pídelo por WhatsApp.`,
        subtitlesText: `Precio oficial: ${priceText} • ${copyBundle.verifiedStockUnits} uds disponibles`,
        onScreenTextOverlay: `${priceText} COP • ESCRÍBENOS YA`
      }
    ]
  };

  const script15: VideoScriptByDuration = {
    durationSeconds: 15,
    title: `Story / Estado 15s — ${item.productName} (${item.sku})`,
    objective: 'Presentación ágil para Estados de WhatsApp e Instagram Stories.',
    closingCallToAction: ctaText,
    scenes: [
      {
        sceneNumber: 1,
        timeRangeLabel: '00:00 – 00:04',
        durationSeconds: 4,
        shotTypeAndVisual: `Apertura con empaque y producto real ${item.productName} sobre mesa oscura iluminada en dorado.`,
        narrationVoiceover: `Mira lo que acaba de pasar nuestra inspección de calidad en REAL TWS.`,
        subtitlesText: `Inspección de calidad aprobada en REAL TWS`,
        onScreenTextOverlay: `NUEVO EN VITRINA • ${item.category.toUpperCase()}`
      },
      {
        sceneNumber: 2,
        timeRangeLabel: '00:04 – 00:10',
        durationSeconds: 6,
        shotTypeAndVisual: `Plano medio demostrando el producto ${item.productName} (${item.variantOrColor}).`,
        narrationVoiceover: `Es el ${item.productName}, variante ${item.variantOrColor}. Cuenta con ${item.verifiedFeatures}.`,
        subtitlesText: `${item.productName}: ${item.verifiedFeatures}`,
        onScreenTextOverlay: `ESPECIFICACIÓN REAL VERIFICADA`
      },
      {
        sceneNumber: 3,
        timeRangeLabel: '00:10 – 00:15',
        durationSeconds: 5,
        shotTypeAndVisual: `Pantalla final con tarjeta de precio ${priceText} y código SKU ${item.sku}.`,
        narrationVoiceover: `Tenemos ${copyBundle.verifiedStockUnits} unidades listas por ${priceText}. Envíanos el código ${item.sku}.`,
        subtitlesText: `${priceText} • Stock verificado: ${copyBundle.verifiedStockUnits} uds`,
        onScreenTextOverlay: `SKU ${item.sku} • ${priceText} • WHATSAPP ${brand.companyInfo.whatsappContact}`
      }
    ]
  };

  const script30: VideoScriptByDuration = {
    durationSeconds: 30,
    title: `Spot Comercial 30s — ${item.productName} (${item.sku})`,
    objective: 'Demostración comercial estructurada para Reels, TikTok y anuncios de catálogo.',
    closingCallToAction: ctaText,
    scenes: [
      {
        sceneNumber: 1,
        timeRangeLabel: '00:00 – 00:06',
        durationSeconds: 6,
        shotTypeAndVisual: `Gancho visual: primer plano del ${item.productName} con iluminación de contraste REAL TWS.`,
        narrationVoiceover: `Cuando compras tecnología en ${brand.brandName}, sabes exactamente lo que recibes.`,
        subtitlesText: `En REAL TWS compras tecnología con respaldo real.`,
        onScreenTextOverlay: `REAL TWS • ${brand.slogan.toUpperCase()}`
      },
      {
        sceneNumber: 2,
        timeRangeLabel: '00:06 – 00:14',
        durationSeconds: 8,
        shotTypeAndVisual: `Presentación del artículo ${item.productName} desde tres ángulos reales sin alterar el producto.`,
        narrationVoiceover: `Te presentamos el ${item.productName} en su variante ${item.variantOrColor}, identificado con el SKU ${item.sku}.`,
        subtitlesText: `${item.productName} (${item.variantOrColor}) — SKU ${item.sku}`,
        onScreenTextOverlay: `VARIANTE: ${item.variantOrColor.toUpperCase()} • SKU: ${item.sku}`
      },
      {
        sceneNumber: 3,
        timeRangeLabel: '00:14 – 00:23',
        durationSeconds: 9,
        shotTypeAndVisual: `Detalle de componentes y verificación física de calidad en bodega.`,
        narrationVoiceover: `Cada unidad ha sido verificada: ${item.verifiedFeatures}. Sin características inventadas, cien por ciento fiel a su ficha.`,
        subtitlesText: `Verificado: ${item.verifiedFeatures}`,
        onScreenTextOverlay: `✓ INSPECCIÓN FÍSICA APROBADA`
      },
      {
        sceneNumber: 4,
        timeRangeLabel: '00:23 – 00:30',
        durationSeconds: 7,
        shotTypeAndVisual: `Cierre corporativo Negro y Dorado con precio ${priceText}, stock disponible y contacto.`,
        narrationVoiceover: `Adquiérelo hoy por ${priceText}. Quedan ${copyBundle.verifiedStockUnits} unidades disponibles. Escríbenos ahora.`,
        subtitlesText: `Precio: ${priceText} • ${copyBundle.verifiedStockUnits} unidades disponibles`,
        onScreenTextOverlay: `${priceText} COP • PEDIDOS: ${brand.companyInfo.whatsappContact}`
      }
    ]
  };

  const script45: VideoScriptByDuration = {
    durationSeconds: 45,
    title: `Review Detallado y Unboxing 45s — ${item.productName} (${item.sku})`,
    objective: 'Presentación profunda de producto, control de calidad, garantía y cierre comercial.',
    closingCallToAction: ctaText,
    scenes: [
      {
        sceneNumber: 1,
        timeRangeLabel: '00:00 – 00:08',
        durationSeconds: 8,
        shotTypeAndVisual: `Introducción en mostrador REAL TWS con el ${item.productName} y su etiqueta SKU.`,
        narrationVoiceover: `Bienvenidos a ${brand.brandName}. Hoy revisamos a fondo el ${item.productName}, referencia ${item.sku}.`,
        subtitlesText: `Review Oficial REAL TWS: ${item.productName} (${item.sku})`,
        onScreenTextOverlay: `REVIEW OFICIAL REAL TWS • ${item.sku}`
      },
      {
        sceneNumber: 2,
        timeRangeLabel: '00:08 – 00:18',
        durationSeconds: 10,
        shotTypeAndVisual: `Apertura y vista detallada del diseño físico en color/variante ${item.variantOrColor}.`,
        narrationVoiceover: `Esta versión en ${item.variantOrColor} pertenece a nuestra línea de ${item.category}, seleccionada por su relación costo-beneficio.`,
        subtitlesText: `Línea ${item.category} • Variante ${item.variantOrColor}`,
        onScreenTextOverlay: `CATEGORÍA: ${item.category.toUpperCase()}`
      },
      {
        sceneNumber: 3,
        timeRangeLabel: '00:18 – 00:30',
        durationSeconds: 12,
        shotTypeAndVisual: `Toma de especificaciones reales verificadas sobre tarjeta técnica en pantalla.`,
        narrationVoiceover: `Sus características verificadas en nuestro inventario son: ${item.verifiedFeatures}. Todo validado antes del despacho.`,
        subtitlesText: `Ficha técnica real: ${item.verifiedFeatures}`,
        onScreenTextOverlay: `ESPECIFICACIONES 100% VERIFICADAS`
      },
      {
        sceneNumber: 4,
        timeRangeLabel: '00:30 – 00:38',
        durationSeconds: 8,
        shotTypeAndVisual: `Muestra del sello de garantía REAL TWS y alistamiento de envío seguro.`,
        narrationVoiceover: `Recuerda que cuentas con respaldo directo: ${brand.companyInfo.warrantyPolicySummary}.`,
        subtitlesText: `${brand.companyInfo.warrantyPolicySummary}`,
        onScreenTextOverlay: `GARANTÍA Y TRAZABILIDAD POR LOTE`
      },
      {
        sceneNumber: 5,
        timeRangeLabel: '00:38 – 00:45',
        durationSeconds: 7,
        shotTypeAndVisual: `Pantalla final con logo REAL TWS, precio ${priceText} y botón de pedido por WhatsApp.`,
        narrationVoiceover: `Su precio autorizado es de ${priceText} y tenemos ${copyBundle.verifiedStockUnits} unidades disponibles. Haz tu pedido por WhatsApp.`,
        subtitlesText: `Llévatelo por ${priceText} • ${ctaText}`,
        onScreenTextOverlay: `${priceText} COP • WHATSAPP ${brand.companyInfo.whatsappContact}`
      }
    ]
  };

  return {
    sku: item.sku,
    productName: item.productName,
    scriptsByDuration: {
      10: script10,
      15: script15,
      30: script30,
      45: script45
    }
  };
}

// ============================================================================
// 6. IMAGE COMPOSER (SECCIÓN C) — FORMATOS 1:1, 4:5 Y 9:16 EN SVG/CANVAS
//    Agrega logo, precio aprobado, SKU y textos aprobados sin modificar ni
//    distorsionar la fotografía original del producto.
// ============================================================================

export function getDimensionsForAspectRatio(ratio: CreativeAspectRatio): {
  width: number;
  height: number;
  label: string;
} {
  if (ratio === '1:1') return { width: 1080, height: 1080, label: '1:1 Cuadrado (1080×1080 px)' };
  if (ratio === '4:5') return { width: 1080, height: 1350, label: '4:5 Vertical Feed (1080×1350 px)' };
  return { width: 1080, height: 1920, label: '9:16 Story / Reel (1080×1920 px)' };
}

export function renderCreativeStudioComposedSvg(input: {
  catalogItem: RealCatalogMerchItem;
  copyBundle: CreativeCopywritingBundle;
  composerSettings: ImageComposerSettings;
  brand: BrandIdentityConfig;
}): string {
  const { catalogItem: item, copyBundle, composerSettings, brand } = input;
  const dims = getDimensionsForAspectRatio(composerSettings.aspectRatio);
  const w = dims.width;
  const h = dims.height;

  const isEditorialLight = composerSettings.templateStyle === 'EDITORIAL_CLEAN';
  const bgMain = isEditorialLight ? '#F8FAFC' : '#0D0E12';
  const bgCard = isEditorialLight ? '#FFFFFF' : '#151821';
  const textPrimary = isEditorialLight ? '#0D0E12' : '#F9FAFB';
  const textSecondary = isEditorialLight ? '#4B5563' : '#9CA3AF';
  const gold = '#D4AF37';

  const headline =
    copyBundle.headlines[composerSettings.selectedHeadlineIndex] || copyBundle.headlines[0];
  const shortDesc =
    copyBundle.shortDescriptions[composerSettings.selectedShortDescIndex] ||
    copyBundle.shortDescriptions[0];
  const cta =
    copyBundle.callsToAction[composerSettings.selectedCtaIndex] || copyBundle.callsToAction[0];

  const priceFormatted = formatCOP(copyBundle.effectivePriceCop);
  const rawPhotoSource =
    composerSettings.originalProductPhotoDataUrl ||
    item.approvedPhotos[0] ||
    null;
  const photoSource =
    rawPhotoSource &&
    !/^\s*(data:image\/svg\+xml|javascript:)/i.test(rawPhotoSource)
      ? rawPhotoSource
      : null;

  // Coordenadas adaptables según formato 1:1, 4:5 o 9:16
  const photoBoxY = 195;
  const photoBoxHeight =
    composerSettings.aspectRatio === '1:1'
      ? 430
      : composerSettings.aspectRatio === '4:5'
        ? 590
        : 960;

  const infoBoxY = photoBoxY + photoBoxHeight + 28;
  const priceBoxY = h - 255;

  const photoZoneMarkup = photoSource
    ? `<g>
        <rect x="64" y="${photoBoxY}" width="${w - 128}" height="${photoBoxHeight}" rx="22" fill="#FFFFFF" stroke="${gold}" stroke-width="3"/>
        <image href="${escapeXml(photoSource)}" x="84" y="${photoBoxY + 20}" width="${w - 168}" height="${photoBoxHeight - 40}" preserveAspectRatio="xMidYMid meet"/>
        <rect x="84" y="${photoBoxY + 20}" width="290" height="44" rx="8" fill="rgba(13,14,18,0.88)" stroke="${gold}" stroke-width="1.5"/>
        <text x="229" y="${photoBoxY + 48}" text-anchor="middle" fill="#F3E5AB" font-family="JetBrains Mono, monospace" font-size="15" font-weight="800">FOTO REAL SIN ALTERAR</text>
      </g>`
    : `<g>
        <rect x="64" y="${photoBoxY}" width="${w - 128}" height="${photoBoxHeight}" rx="22" fill="${bgCard}" stroke="${gold}" stroke-width="2.5" stroke-dasharray="10 6"/>
        <circle cx="${w / 2}" cy="${photoBoxY + photoBoxHeight / 2 - 35}" r="68" fill="#0D0E12" stroke="${gold}" stroke-width="3"/>
        <text x="${w / 2}" y="${photoBoxY + photoBoxHeight / 2 - 25}" text-anchor="middle" fill="${gold}" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="900">RTWS</text>
        <text x="${w / 2}" y="${photoBoxY + photoBoxHeight / 2 + 70}" text-anchor="middle" fill="${textPrimary}" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800">${escapeXml(item.productName.slice(0, 36))}</text>
        <text x="${w / 2}" y="${photoBoxY + photoBoxHeight / 2 + 108}" text-anchor="middle" fill="${textSecondary}" font-family="JetBrains Mono, monospace" font-size="18" font-weight="600">Variante: ${escapeXml(item.variantOrColor)} • Producto Original Intacto</text>
      </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block">
    <defs>
      <linearGradient id="csGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#F3E5AB"/>
        <stop offset="50%" stop-color="#D4AF37"/>
        <stop offset="100%" stop-color="#9A7409"/>
      </linearGradient>
    </defs>

    <!-- Fondo Maestro -->
    <rect width="${w}" height="${h}" rx="28" fill="${bgMain}" stroke="url(#csGoldGrad)" stroke-width="8"/>

    <!-- Cabecera Brand Kit REAL TWS + SKU -->
    <rect x="48" y="42" width="${w - 96}" height="125" rx="18" fill="#151821" stroke="${gold}" stroke-width="2"/>
    <text x="86" y="106" fill="${gold}" font-family="Inter, Arial, sans-serif" font-size="44" font-weight="900" letter-spacing="4">${escapeXml(brand.brandName)}</text>
    <text x="88" y="142" fill="#F3E5AB" font-family="JetBrains Mono, monospace" font-size="15" font-weight="600" letter-spacing="2">${escapeXml(brand.slogan.toUpperCase().slice(0, 46))}</text>

    <rect x="${w - 340}" y="66" width="265" height="76" rx="12" fill="#0D0E12" stroke="${gold}" stroke-width="1.5"/>
    <text x="${w - 207}" y="96" text-anchor="middle" fill="#9CA3AF" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700">SKU VERIFICADO</text>
    <text x="${w - 207}" y="126" text-anchor="middle" fill="${gold}" font-family="JetBrains Mono, monospace" font-size="21" font-weight="800">${escapeXml(item.sku)}</text>

    <!-- Contenedor de Fotografía Real (Sin Modificar el Producto Original) -->
    ${photoZoneMarkup}

    <!-- Bloque de Copy Aprobado y Especificaciones Verificadas -->
    <rect x="64" y="${infoBoxY}" width="${w - 128}" height="${priceBoxY - infoBoxY - 22}" rx="18" fill="${bgCard}" stroke="${gold}" stroke-width="1.8"/>
    <text x="96" y="${infoBoxY + 48}" fill="${textPrimary}" font-family="Inter, Arial, sans-serif" font-size="27" font-weight="800">${escapeXml(headline.slice(0, 52))}</text>
    <text x="96" y="${infoBoxY + 90}" fill="${textSecondary}" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="500">${escapeXml(shortDesc.slice(0, 68))}</text>
    <text x="96" y="${infoBoxY + 132}" fill="#10B981" font-family="JetBrains Mono, monospace" font-size="18" font-weight="800">✓ DISPONIBILIDAD VERIFICADA: ${copyBundle.verifiedStockUnits} UNIDAD(ES) • ESPECIFICACIÓN REAL</text>

    <!-- Insignia de Precio Aprobado y CTA -->
    <rect x="64" y="${priceBoxY}" width="${w - 128}" height="135" rx="20" fill="url(#csGoldGrad)"/>
    <text x="${w / 2}" y="${priceBoxY + 42}" text-anchor="middle" fill="#0D0E12" font-family="JetBrains Mono, monospace" font-size="18" font-weight="800" letter-spacing="2">
      PRECIO COMERCIAL APROBADO (COP)${copyBundle.discountAppliedPct > 0 ? ` • DTO. AUTORIZADO ${copyBundle.discountAppliedPct}%` : ''}
    </text>
    <text x="${w / 2}" y="${priceBoxY + 108}" text-anchor="middle" fill="#0D0E12" font-family="JetBrains Mono, monospace" font-size="64" font-weight="900">${escapeXml(priceFormatted)}</text>

    <text x="${w / 2}" y="${h - 68}" text-anchor="middle" fill="${textPrimary}" font-family="Inter, Arial, sans-serif" font-size="21" font-weight="700">${escapeXml(cta.slice(0, 72))}</text>
    <text x="${w / 2}" y="${h - 34}" text-anchor="middle" fill="${textSecondary}" font-family="JetBrains Mono, monospace" font-size="14" font-weight="600">FORMATO ${composerSettings.aspectRatio} (${w}×${h}px) • IDENTIDAD OFICIAL REAL TWS</text>
  </svg>`;
}

// ============================================================================
// 7. ADAPTADOR OPCIONAL GEMINI API CON CONTROL DE CUOTA Y PRIVACIDAD (SECCIÓN E)
//    - No exige IA para funcionar.
//    - Usa exclusivamente información pública comercial.
//    - Nunca envía datos personales ni costos internos.
//    - No activa facturación.
// ============================================================================

export function buildSanitizedPublicCommercialPayload(
  item: RealCatalogMerchItem,
  effectivePriceCop: number
): Record<string, string | number> {
  // Filtra estrictamente cualquier dato personal, teléfono privado, costo de compra o acuerdo interno
  return {
    publicSku: item.sku,
    publicProductName: item.productName,
    publicCategory: item.category,
    publicVariantOrColor: item.variantOrColor,
    publicVerifiedSpecs: item.verifiedFeatures,
    publicApprovedPriceCop: effectivePriceCop
  };
}

export function updateOptionalGeminiAdapterSettings(input: {
  enabled: boolean;
  dailyQuotaLimit: number;
}): OptionalGeminiAdapterConfig {
  const state = getCreativeStudioState();
  const safeQuota = Math.max(1, Math.min(50, Math.round(input.dailyQuotaLimit || 15)));
  state.aiAdapterConfig.enabled = input.enabled;
  state.aiAdapterConfig.dailyQuotaLimit = safeQuota;
  saveCreativeStudioState(state);
  return state.aiAdapterConfig;
}

export function recordCreativeEngineExecutionAudit(input: {
  item: RealCatalogMerchItem;
  effectivePriceCop: number;
  requestedMode: CreativeEngineMode;
}): { effectiveModeUsed: CreativeEngineMode; notice: string } {
  const state = getCreativeStudioState();
  const cfg = state.aiAdapterConfig;
  const today = new Date().toLocaleDateString('en-CA');

  if (cfg.lastResetDate !== today) {
    cfg.dailyQuotaUsed = 0;
    cfg.lastResetDate = today;
  }

  const sanitized = buildSanitizedPublicCommercialPayload(input.item, input.effectivePriceCop);
  const preview = JSON.stringify(sanitized);

  if (input.requestedMode === 'GEMINI_OPTIONAL_ADAPTER') {
    if (!cfg.enabled) {
      cfg.auditLogs.unshift({
        id: `AILOG-${Date.now()}`,
        timestamp: new Date().toISOString(),
        sku: input.item.sku,
        modeUsed: 'LOCAL_TEMPLATE_ENGINE',
        sanitizedPayloadPreview: preview,
        status: 'blocked_by_quota_or_disabled'
      });
      saveCreativeStudioState(state);
      return {
        effectiveModeUsed: 'LOCAL_TEMPLATE_ENGINE',
        notice:
          'El adaptador opcional Gemini está desactivado; se ejecutó al 100% con el motor local de plantillas (costo $0).'
      };
    }

    if (cfg.dailyQuotaUsed >= cfg.dailyQuotaLimit) {
      cfg.auditLogs.unshift({
        id: `AILOG-${Date.now()}`,
        timestamp: new Date().toISOString(),
        sku: input.item.sku,
        modeUsed: 'LOCAL_TEMPLATE_ENGINE',
        sanitizedPayloadPreview: preview,
        status: 'blocked_by_quota_or_disabled'
      });
      saveCreativeStudioState(state);
      return {
        effectiveModeUsed: 'LOCAL_TEMPLATE_ENGINE',
        notice: `Límite diario de cuota gratuita (${cfg.dailyQuotaLimit}/${cfg.dailyQuotaLimit}) alcanzado. Se conmutó automáticamente al motor local sin activar facturación.`
      };
    }

    cfg.dailyQuotaUsed += 1;
    cfg.auditLogs.unshift({
      id: `AILOG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      sku: input.item.sku,
      modeUsed: 'GEMINI_OPTIONAL_ADAPTER',
      sanitizedPayloadPreview: preview,
      status: 'executed_gemini_optional'
    });
    saveCreativeStudioState(state);
    return {
      effectiveModeUsed: 'GEMINI_OPTIONAL_ADAPTER',
      notice: `Ejecutado con payload comercial público sanitizado (Cuota hoy: ${cfg.dailyQuotaUsed}/${cfg.dailyQuotaLimit} — Cero datos personales enviados).`
    };
  }

  cfg.auditLogs.unshift({
    id: `AILOG-${Date.now()}`,
    timestamp: new Date().toISOString(),
    sku: input.item.sku,
    modeUsed: 'LOCAL_TEMPLATE_ENGINE',
    sanitizedPayloadPreview: preview,
    status: 'executed_local'
  });
  saveCreativeStudioState(state);
  return {
    effectiveModeUsed: 'LOCAL_TEMPLATE_ENGINE',
    notice: 'Generado con motor local determinístico REAL TWS (costo $0, sin requerir IA).'
  };
}

// ============================================================================
// 8. GUARDADO EN BIBLIOTECA MULTIMEDIA CON VERSIONADO (SECCIÓN F)
// ============================================================================

export function saveCreativeProjectToLibrary(input: {
  existingProjectId?: string | null;
  title: string;
  catalogItem: RealCatalogMerchItem;
  ownerId: string;
  engineUsed: CreativeEngineMode;
  composerSettings: ImageComposerSettings;
  copyBundle: CreativeCopywritingBundle;
  videoBundle: VideoScriptsBundle;
  finalComposedSvgMarkup: string;
  changeNote: string;
  actorName: string;
}): CreativeStudioSavedProject {
  const validation = validateCreativeCompliance({
    catalogItem: input.catalogItem,
    ownerId: input.ownerId,
    requestedDiscountPct: input.composerSettings.discountPct
  });

  if (!validation.passedAll) {
    throw new Error(validation.blockingErrors.join(' | '));
  }

  const state = getCreativeStudioState();
  const brandState = getBrandMerchandisingState();
  const brandVer = brandState.brandVersions[0]?.versionNumber || 1;
  const ownerAlloc = input.catalogItem.ownerAllocations.find(
    (a) => a.ownerId === input.ownerId
  );
  const consent = getOrInitializeOwnerMarketingConsent(
    input.ownerId,
    ownerAlloc?.ownerName || 'Eberto',
    input.catalogItem.sku,
    input.catalogItem.productName
  );

  const nowIso = new Date().toISOString();

  if (input.existingProjectId) {
    const existing = state.projects.find((p) => p.id === input.existingProjectId);
    if (!existing) {
      throw new Error(`Proyecto creativo ${input.existingProjectId} no encontrado.`);
    }

    const nextVer = existing.versions.length + 1;
    const versionSnap: CreativeStudioVersionSnapshot = Object.freeze({
      versionNumber: nextVer,
      isOriginalBaseline: false,
      savedAt: nowIso,
      savedBy: input.actorName || 'Operador Marketing',
      changeNote: input.changeNote.trim() || `Actualización creativa v${nextVer}`,
      brandKitVersionUsed: brandVer,
      aspectRatio: input.composerSettings.aspectRatio,
      originalImagePreserved: input.composerSettings.originalProductPhotoDataUrl,
      finalComposedSvgMarkup: input.finalComposedSvgMarkup,
      copywritingBundle: JSON.parse(JSON.stringify(input.copyBundle)),
      videoScriptsBundle: JSON.parse(JSON.stringify(input.videoBundle)),
      composerSettings: JSON.parse(JSON.stringify(input.composerSettings))
    });

    existing.currentVersion = nextVer;
    existing.title = input.title.trim() || existing.title;
    existing.approvedPriceSnapshotCop = input.copyBundle.effectivePriceCop;
    existing.verifiedStockSnapshot = input.copyBundle.verifiedStockUnits;
    existing.discountAppliedPct = input.copyBundle.discountAppliedPct;
    existing.updatedAt = nowIso;
    existing.versions.unshift(versionSnap);

    saveCreativeStudioState(state);
    return existing;
  }

  const nextIdx = state.projects.length + 1;
  const projectCode = `STD-2026-${String(nextIdx).padStart(4, '0')}`;

  const v1Snap: CreativeStudioVersionSnapshot = Object.freeze({
    versionNumber: 1,
    isOriginalBaseline: true,
    savedAt: nowIso,
    savedBy: input.actorName || 'Operador Marketing',
    changeNote:
      input.changeNote.trim() ||
      'Versión original (v1) con imagen original intacta, copywriting multicanal y 4 guiones de video.',
    brandKitVersionUsed: brandVer,
    aspectRatio: input.composerSettings.aspectRatio,
    originalImagePreserved: input.composerSettings.originalProductPhotoDataUrl,
    finalComposedSvgMarkup: input.finalComposedSvgMarkup,
    copywritingBundle: JSON.parse(JSON.stringify(input.copyBundle)),
    videoScriptsBundle: JSON.parse(JSON.stringify(input.videoBundle)),
    composerSettings: JSON.parse(JSON.stringify(input.composerSettings))
  });

  const newProject: CreativeStudioSavedProject = {
    id: `PRJ-${Date.now()}-${nextIdx}`,
    projectCode,
    title:
      input.title.trim() ||
      `Campaña ${input.catalogItem.sku} (${input.composerSettings.aspectRatio})`,
    sku: input.catalogItem.sku,
    productName: input.catalogItem.productName,
    ownerId: input.ownerId,
    ownerName: ownerAlloc?.ownerName || 'Eberto',
    consentCode: consent.consentCode,
    engineUsed: input.engineUsed,
    approvedPriceSnapshotCop: input.copyBundle.effectivePriceCop,
    verifiedStockSnapshot: input.copyBundle.verifiedStockUnits,
    discountAppliedPct: input.copyBundle.discountAppliedPct,
    currentVersion: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    versions: [v1Snap]
  };

  state.projects.unshift(newProject);
  saveCreativeStudioState(state);
  return newProject;
}
