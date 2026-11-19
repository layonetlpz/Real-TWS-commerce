// ============================================================================
// REAL TWS COMMERCE SYSTEM — SOCIAL & MARKETPLACE DISTRIBUTION ENGINE (FASE 8B)
// Cubre:
//   1. MARKETPLACE:
//      - Preparación de publicaciones, títulos, descripciones, imágenes, precio,
//        categoría, ubicación, enlace de contacto (wa.me), historial, registro
//        de URL publicada, control de stock/propietario y publicación manual asistida.
//   2. FACEBOOK PAGES:
//      - Integración separada para Graph API oficial, OAuth en servidor (Vault),
//        Page Access Token referencia, permisos autorizados, publicación de
//        contenido aprobado, registro de respuesta/ID/URL, detección de errores,
//        prevención de duplicados y desconexión en un clic.
//   3. INSTAGRAM:
//      - Integración oficial para cuenta profesional elegible, Content Publishing
//        (Container ID + Media ID), vista previa, aprobación, registro de
//        publicaciones y control de errores y límites diarios.
//   4. WHATSAPP STATUS:
//      - Preparación de imágenes (9:16 / 1:1) y textos para compartir manualmente.
//   5. CALENDARIO EDITORIAL:
//      - Vistas Diaria, Semanal y Mensual, estados, aprobación, programación,
//        historial y bloqueo de duplicados.
//   6. AUTORIZACIÓN Y SEGURIDAD:
//      - El propietario debe permitir promoción de su mercancía.
//      - Respetar precio mínimo y descuentos aprobados.
//      - No publicar inventario agotado (qtyAvailable <= 0).
//      - No publicar productos pendientes de inspección (qtyPendingInspection > 0).
//      - No publicar contenido rechazado.
//      - Tokens en servidor, OAuth autorizado, cero automatización de navegador,
//        cero solicitud de contraseñas y cero publicación real durante pruebas.
// ============================================================================

import {
  getBrandMerchandisingState,
  getRealCatalogMerchItems,
  type RealCatalogMerchItem
} from './brandMerchandisingService';
import {
  getOrInitializeOwnerMarketingConsent,
  readOwnerMarketingConsent,
  generateValidatedCopywritingBundle,
  renderCreativeStudioComposedSvg
} from './creativeStudioService';
import { getInventoryPurchaseState } from './inventoryPurchaseService';
import { getFinancialAccountingState } from './financialAccountingService';
import { formatCOP } from '../utils/formatters';

export type DistributionChannelId =
  | 'marketplace'
  | 'facebook_page'
  | 'instagram_feed'
  | 'instagram_story'
  | 'whatsapp_status';

export type PublicationApprovalStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'rejected'
  | 'failed';

export interface PublicationHistoryEvent {
  timestamp: string;
  actor: string;
  action: string;
  statusAfter: string;
  detail: string;
}

export interface MarketplaceAssistedListingRecord {
  id: string;
  listingCode: string;
  sku: string;
  productName: string;
  variantOrColor: string;
  ownerId: string;
  ownerName: string;
  consentCode: string;
  title: string;
  descriptionText: string;
  categoryLabel: string;
  locationLabel: string;
  contactWhatsappUrl: string;
  composedSvgMarkup: string;
  approvedNormalPriceCop: number;
  discountPct: number;
  effectivePublishedPriceCop: number;
  minimumAllowedPriceCop: number | null;
  verifiedAvailableStock: number;
  pendingInspectionUnits: number;
  status:
    | 'prepared'
    | 'approved_for_manual_post'
    | 'published_url_recorded'
    | 'paused_out_of_stock'
    | 'rejected';
  publishedMarketplaceUrl: string | null;
  publishedAt: string | null;
  preparedBy: string;
  approvedBy: string | null;
  dedupFingerprint: string;
  createdAt: string;
  updatedAt: string;
  historyLog: PublicationHistoryEvent[];
}

export interface OfficialSocialConnectionConfig {
  platform: 'facebook_graph_api' | 'instagram_graph_api';
  displayName: string;
  connectionStatus: 'disconnected' | 'oauth_connected' | 'token_expired' | 'error';
  externalAccountId: string | null;
  accountHandleOrPageName: string | null;
  professionalAccountEligible: boolean;
  scopesGranted: string[];
  secretVaultKeyName: string; // Referencia en servidor/Vault; jamás almacena token en texto plano
  browserAutomationBlocked: true;
  passwordCollectionBlocked: true;
  dailyQuotaLimit: number;
  dailyQuotaUsed: number;
  lastVerifiedAt: string | null;
  disconnectedAt: string | null;
  lastErrorMessage: string | null;
}

export interface SocialPublicationCalendarItem {
  id: string;
  publicationCode: string;
  calendarCode: string;
  channel: DistributionChannelId;
  sku: string;
  productName: string;
  ownerId: string;
  ownerName: string;
  consentCode: string;
  headline: string;
  bodyText: string;
  ctaWhatsappUrl: string;
  aspectRatio: '1:1' | '4:5' | '9:16';
  composedSvgMarkup: string;
  approvedNormalPriceCop: number;
  discountAppliedPct: number;
  effectivePriceCop: number;
  minimumPriceSnapshotCop: number | null;
  verifiedAvailableStockSnapshot: number;
  pendingInspectionUnitsSnapshot: number;
  scheduledFor: string; // ISO datetime
  approvalStatus: PublicationApprovalStatus;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  publishedAt: string | null;
  externalContainerId: string | null; // Para Instagram Content Publishing
  externalPostId: string | null; // ID devuelto por Graph API o registro manual
  publishedPermalinkUrl: string | null;
  apiResponsePayload: Record<string, unknown> | null;
  errorDetail: string | null;
  dedupFingerprint: string;
  isTestSimulation: boolean;
  createdAt: string;
  updatedAt: string;
  historyLog: PublicationHistoryEvent[];
}

export interface WhatsAppStatusPreparedItem {
  id: string;
  statusCode: string;
  sku: string;
  productName: string;
  ownerId: string;
  ownerName: string;
  captionText: string;
  contactWhatsappUrl: string;
  effectivePriceCop: number;
  verifiedAvailableStock: number;
  composedVerticalSvg9x16: string;
  approvalStatus: 'prepared' | 'approved' | 'shared_manually' | 'rejected';
  sharedManuallyAt: string | null;
  sharedBy: string | null;
  createdAt: string;
}

export interface DistributionValidationResult {
  passedAll: boolean;
  ownerConsentCheck: { passed: boolean; message: string };
  stockNotExhaustedCheck: { passed: boolean; message: string };
  notPendingInspectionCheck: { passed: boolean; message: string };
  minPriceAndDiscountCheck: { passed: boolean; message: string };
  notRejectedContentCheck: { passed: boolean; message: string };
  notDuplicateCheck: { passed: boolean; message: string };
  blockingErrors: string[];
}

export interface SocialMarketplaceStoreState {
  testSafeModeNoExternalPublish: boolean; // Garantiza no publicar en redes reales durante pruebas
  lastQuotaResetDate?: string;
  connections: {
    facebook_graph_api: OfficialSocialConnectionConfig;
    instagram_graph_api: OfficialSocialConnectionConfig;
  };
  marketplaceListings: MarketplaceAssistedListingRecord[];
  calendarPublications: SocialPublicationCalendarItem[];
  whatsappStatusItems: WhatsAppStatusPreparedItem[];
}

const SOCIAL_MARKETPLACE_STORAGE_KEY = 'rtw_social_marketplace_distribution_v1';

// ============================================================================
// 1. INICIALIZACIÓN Y PERSISTENCIA DEL ESTADO
// ============================================================================

function getLocalTodayIsoDate(): string {
  return new Date().toLocaleDateString('en-CA');
}

function resetSocialDailyQuotasIfNeeded(state: SocialMarketplaceStoreState): boolean {
  const today = getLocalTodayIsoDate();
  if (state.lastQuotaResetDate === today) return false;
  state.connections.facebook_graph_api.dailyQuotaUsed = 0;
  state.connections.instagram_graph_api.dailyQuotaUsed = 0;
  state.lastQuotaResetDate = today;
  return true;
}

function createInitialSocialMarketplaceState(): SocialMarketplaceStoreState {
  return {
    testSafeModeNoExternalPublish: true,
    lastQuotaResetDate: getLocalTodayIsoDate(),
    connections: {
      facebook_graph_api: {
        platform: 'facebook_graph_api',
        displayName: 'Facebook Pages Official Graph API (v20.0)',
        connectionStatus: 'disconnected',
        externalAccountId: null,
        accountHandleOrPageName: null,
        professionalAccountEligible: true,
        scopesGranted: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'],
        secretVaultKeyName: 'SUPABASE_VAULT_FB_PAGE_ACCESS_TOKEN',
        browserAutomationBlocked: true,
        passwordCollectionBlocked: true,
        dailyQuotaLimit: 50,
        dailyQuotaUsed: 0,
        lastVerifiedAt: null,
        disconnectedAt: null,
        lastErrorMessage: null
      },
      instagram_graph_api: {
        platform: 'instagram_graph_api',
        displayName: 'Instagram Professional Content Publishing API',
        connectionStatus: 'disconnected',
        externalAccountId: null,
        accountHandleOrPageName: null,
        professionalAccountEligible: true,
        scopesGranted: ['instagram_basic', 'instagram_content_publish', 'pages_read_engagement'],
        secretVaultKeyName: 'SUPABASE_VAULT_IG_CONTENT_PUBLISH_TOKEN',
        browserAutomationBlocked: true,
        passwordCollectionBlocked: true,
        dailyQuotaLimit: 25, // Límite oficial de Instagram Content Publishing API por 24h
        dailyQuotaUsed: 0,
        lastVerifiedAt: null,
        disconnectedAt: null,
        lastErrorMessage: null
      }
    },
    marketplaceListings: [],
    calendarPublications: [],
    whatsappStatusItems: []
  };
}

let inMemorySocialMarketplaceState: SocialMarketplaceStoreState | null = null;

export function getSocialMarketplaceState(): SocialMarketplaceStoreState {
  if (inMemorySocialMarketplaceState) {
    if (resetSocialDailyQuotasIfNeeded(inMemorySocialMarketplaceState)) {
      saveSocialMarketplaceState(inMemorySocialMarketplaceState);
    }
    return inMemorySocialMarketplaceState;
  }
  try {
    const raw = localStorage.getItem(SOCIAL_MARKETPLACE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SocialMarketplaceStoreState;
      if (parsed && parsed.connections && Array.isArray(parsed.marketplaceListings)) {
        inMemorySocialMarketplaceState = parsed;
        if (resetSocialDailyQuotasIfNeeded(parsed)) {
          saveSocialMarketplaceState(parsed);
        }
        return parsed;
      }
    }
  } catch {
    // Fallback
  }
  const initial = createInitialSocialMarketplaceState();
  inMemorySocialMarketplaceState = initial;
  saveSocialMarketplaceState(initial);
  return initial;
}

export function saveSocialMarketplaceState(state: SocialMarketplaceStoreState): void {
  inMemorySocialMarketplaceState = state;
  try {
    localStorage.setItem(SOCIAL_MARKETPLACE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota issues
  }
}

// ============================================================================
// 2. HELPERS DE INVENTARIO, INSPECCIÓN Y HUELLA ANTI-DUPLICADOS
// ============================================================================

export function getSkuOwnerInspectionBreakdown(
  sku: string,
  ownerId: string
): {
  qtyAvailable: number;
  qtyPendingInspection: number;
  qtyDefective: number;
  qtyPhysical: number;
} {
  const invState = getInventoryPurchaseState();
  const matchingAllocs = invState.allocations.filter(
    (a) => a.sku === sku && a.ownerId === ownerId
  );

  if (matchingAllocs.length === 0) {
    const catalogItems = getRealCatalogMerchItems();
    const catItem = catalogItems.find((i) => i.sku === sku);
    const catAlloc = catItem?.ownerAllocations.find((o) => o.ownerId === ownerId);
    return {
      qtyAvailable: catAlloc ? catAlloc.qtyAvailable : catItem?.qtyAvailableTotal || 0,
      qtyPendingInspection: 0,
      qtyDefective: 0,
      qtyPhysical: catAlloc ? catAlloc.qtyPhysical : catItem?.qtyPhysicalTotal || 0
    };
  }

  return matchingAllocs.reduce(
    (acc, curr) => ({
      qtyAvailable: acc.qtyAvailable + curr.qtyAvailable,
      qtyPendingInspection: acc.qtyPendingInspection + curr.qtyPendingInspection,
      qtyDefective: acc.qtyDefective + curr.qtyDefective,
      qtyPhysical: acc.qtyPhysical + curr.qtyPhysical
    }),
    { qtyAvailable: 0, qtyPendingInspection: 0, qtyDefective: 0, qtyPhysical: 0 }
  );
}

export function buildPublicationDedupFingerprint(input: {
  channel: string;
  sku: string;
  ownerId: string;
  headline: string;
  scheduledDateOnly: string;
}): string {
  const cleanHeadline = input.headline
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .slice(0, 40);
  return `${input.channel.toUpperCase()}__${input.sku.toUpperCase()}__${input.ownerId.toUpperCase()}__${input.scheduledDateOnly}__${cleanHeadline}`;
}

export function buildOfficialWhatsAppContactLink(
  whatsappPhone: string,
  sku: string,
  productName: string,
  effectivePriceCop: number
): string {
  const digits = whatsappPhone.replace(/[^0-9]/g, '') || '573000000000';
  const msg = encodeURIComponent(
    `Hola REAL TWS, me interesa el artículo ${productName} (SKU: ${sku}) publicado en ${formatCOP(effectivePriceCop)}. ¿Está disponible para entrega?`
  );
  return `https://wa.me/${digits}?text=${msg}`;
}

// ============================================================================
// 3. MOTOR DE VALIDACIÓN DE AUTORIZACIÓN Y REGLAS CRÍTICAS
//    - El propietario debe permitir promoción de su mercancía.
//    - Respetar precio mínimo y descuentos aprobados.
//    - No publicar inventario agotado.
//    - No publicar productos pendientes de inspección.
//    - No publicar contenido rechazado.
//    - Evitar duplicados.
// ============================================================================

export function validateDistributionCompliance(input: {
  catalogItem: RealCatalogMerchItem | null;
  ownerId: string;
  discountPct: number;
  channel: DistributionChannelId;
  headline: string;
  scheduledDateOnly: string;
  currentApprovalStatus?: PublicationApprovalStatus | MarketplaceAssistedListingRecord['status'];
  excludeRecordId?: string;
}): DistributionValidationResult {
  const blockingErrors: string[] = [];

  if (!input.catalogItem) {
    return {
      passedAll: false,
      ownerConsentCheck: { passed: false, message: 'Seleccione un SKU válido.' },
      stockNotExhaustedCheck: { passed: false, message: 'Sin datos de stock.' },
      notPendingInspectionCheck: { passed: false, message: 'Sin datos de inspección.' },
      minPriceAndDiscountCheck: { passed: false, message: 'Sin datos de precio.' },
      notRejectedContentCheck: { passed: false, message: 'Sin estado.' },
      notDuplicateCheck: { passed: false, message: 'Sin huella.' },
      blockingErrors: ['Debe seleccionar un SKU válido del catálogo real.']
    };
  }

  const item = input.catalogItem;
  const ownerAlloc = item.ownerAllocations.find((a) => a.ownerId === input.ownerId);
  const ownerName = ownerAlloc?.ownerName || input.ownerId;

  // 1. Consentimiento Comercial del Propietario (lectura pura)
  const consent = readOwnerMarketingConsent(
    input.ownerId,
    ownerName,
    item.sku,
    item.productName
  );
  const channelFamily: 'marketplace' | 'facebook' | 'instagram' | 'whatsapp' =
    input.channel === 'marketplace'
      ? 'marketplace'
      : input.channel === 'facebook_page'
        ? 'facebook'
        : input.channel === 'whatsapp_status'
          ? 'whatsapp'
          : 'instagram';

  const consentGranted =
    consent.status === 'granted' && consent.authorizedChannels.includes(channelFamily);

  const ownerConsentCheck = consentGranted
    ? {
        passed: true,
        message: `Propietario ${input.ownerId} (${ownerName}) autorizó promoción en ${channelFamily} (${consent.consentCode}).`
      }
    : {
        passed: false,
        message: `BLOQUEO DE AUTORIZACIÓN: El propietario ${input.ownerId} no ha autorizado promocionar el SKU ${item.sku} en el canal ${channelFamily}.`
      };
  if (!ownerConsentCheck.passed) {
    blockingErrors.push(ownerConsentCheck.message);
  }

  // 2. Inventario no agotado y 3. No publicar productos pendientes de inspección
  const breakdown = getSkuOwnerInspectionBreakdown(item.sku, input.ownerId);
  const stockNotExhaustedCheck =
    breakdown.qtyAvailable > 0
      ? {
          passed: true,
          message: `Stock disponible verificado para ${input.ownerId}: ${breakdown.qtyAvailable} unidad(es) aptas.`
        }
      : {
          passed: false,
          message: `BLOQUEO DE STOCK AGOTADO: El SKU ${item.sku} tiene 0 unidades disponibles para ${input.ownerId}. Prohibido publicar inventario agotado.`
        };
  if (!stockNotExhaustedCheck.passed) {
    blockingErrors.push(stockNotExhaustedCheck.message);
  }

  const notPendingInspectionCheck =
    breakdown.qtyPendingInspection === 0
      ? {
          passed: true,
          message: `Inspección de calidad al día (0 unidades pendientes de revisión).`
        }
      : {
          passed: false,
          message: `BLOQUEO DE CALIDAD: El SKU ${item.sku} tiene ${breakdown.qtyPendingInspection} unidad(es) pendientes de inspección. Prohibido publicar productos pendientes de inspección.`
        };
  if (!notPendingInspectionCheck.passed) {
    blockingErrors.push(notPendingInspectionCheck.message);
  }

  // 4. Precio aprobado, precio mínimo y descuentos aprobados
  const finState = getFinancialAccountingState();
  const agreement = finState.agreements[input.ownerId];
  const reqDisc = Math.max(0, input.discountPct || 0);

  let pricePassed = true;
  let priceMessage = '';

  if (item.currentNormalPriceCop === null || item.currentNormalPriceCop <= 0) {
    pricePassed = false;
    priceMessage = `BLOQUEO DE PRECIO: El SKU ${item.sku} no tiene precio comercial aprobado en Finanzas.`;
  } else {
    const effectivePrice = Math.round(item.currentNormalPriceCop * (1 - reqDisc / 100));
    if (reqDisc > consent.maxAuthorizedDiscountPct) {
      pricePassed = false;
      priceMessage = `BLOQUEO DE DESCUENTO: El descuento (${reqDisc}%) excede el máximo autorizado por el propietario (${consent.maxAuthorizedDiscountPct}%).`;
    } else if (
      agreement &&
      agreement.status === 'active' &&
      agreement.maxDiscountAllowedPct !== null &&
      reqDisc > agreement.maxDiscountAllowedPct
    ) {
      pricePassed = false;
      priceMessage = `BLOQUEO DE ACUERDO: El descuento (${reqDisc}%) supera el máximo del acuerdo comercial (${agreement.maxDiscountAllowedPct}%).`;
    } else if (item.minimumPriceCop !== null && effectivePrice < item.minimumPriceCop) {
      pricePassed = false;
      priceMessage = `BLOQUEO DE PRECIO MÍNIMO: El precio resultante (${formatCOP(effectivePrice)}) es menor al precio mínimo autorizado (${formatCOP(item.minimumPriceCop)}).`;
    } else {
      priceMessage = `Precio de publicación válido: ${formatCOP(effectivePrice)} (Dto: ${reqDisc}%).`;
    }
  }

  const minPriceAndDiscountCheck = { passed: pricePassed, message: priceMessage };
  if (!pricePassed) {
    blockingErrors.push(priceMessage);
  }

  // 5. No publicar contenido rechazado
  const isRejected = input.currentApprovalStatus === 'rejected';
  const notRejectedContentCheck = !isRejected
    ? {
        passed: true,
        message: 'El contenido no se encuentra en estado rechazado.'
      }
    : {
        passed: false,
        message:
          'BLOQUEO EDITORIAL: Prohibido publicar o programar contenido que ha sido marcado como RECHAZADO.'
      };
  if (!notRejectedContentCheck.passed) {
    blockingErrors.push(notRejectedContentCheck.message);
  }

  // 6. Evitar duplicados
  const state = getSocialMarketplaceState();
  const fingerprint = buildPublicationDedupFingerprint({
    channel: input.channel,
    sku: item.sku,
    ownerId: input.ownerId,
    headline: input.headline || item.productName,
    scheduledDateOnly: input.scheduledDateOnly
  });

  const duplicateInCalendar = state.calendarPublications.some(
    (pub) =>
      pub.id !== input.excludeRecordId &&
      pub.dedupFingerprint === fingerprint &&
      pub.approvalStatus !== 'rejected'
  );
  const duplicateInMarketplace =
    input.channel === 'marketplace' &&
    state.marketplaceListings.some(
      (lst) =>
        lst.id !== input.excludeRecordId &&
        lst.dedupFingerprint === fingerprint &&
        lst.status !== 'rejected'
    );

  const notDuplicateCheck =
    !duplicateInCalendar && !duplicateInMarketplace
      ? {
          passed: true,
          message: `Huella única verificada (${fingerprint.slice(0, 34)}...). Sin duplicados.`
        }
      : {
          passed: false,
          message: `BLOQUEO ANTI-DUPLICADOS: Ya existe una publicación idéntica para ${item.sku} (${input.ownerId}) en ${input.channel} en la fecha ${input.scheduledDateOnly}.`
        };
  if (!notDuplicateCheck.passed) {
    blockingErrors.push(notDuplicateCheck.message);
  }

  return {
    passedAll: blockingErrors.length === 0,
    ownerConsentCheck,
    stockNotExhaustedCheck,
    notPendingInspectionCheck,
    minPriceAndDiscountCheck,
    notRejectedContentCheck,
    notDuplicateCheck,
    blockingErrors
  };
}

// ============================================================================
// 4. ASISTENCIA DE MARKETPLACE (PREPARACIÓN, APROBACIÓN Y REGISTRO DE URL)
// ============================================================================

export function prepareMarketplaceAssistedListing(input: {
  catalogItem: RealCatalogMerchItem;
  ownerId: string;
  discountPct: number;
  customTitle?: string;
  customDescription?: string;
  locationLabel?: string;
  actorName: string;
}): MarketplaceAssistedListingRecord {
  const brandState = getBrandMerchandisingState();
  const brand = brandState.currentBrandConfig;
  const todayStr = new Date().toISOString().slice(0, 10);

  const copyBundle = generateValidatedCopywritingBundle({
    catalogItem: input.catalogItem,
    ownerId: input.ownerId,
    discountPct: input.discountPct,
    brand
  });

  const title = (input.customTitle || copyBundle.headlines[0]).trim();
  const descriptionText = (
    input.customDescription || copyBundle.channelSpecific.marketplace
  ).trim();

  const validation = validateDistributionCompliance({
    catalogItem: input.catalogItem,
    ownerId: input.ownerId,
    discountPct: input.discountPct,
    channel: 'marketplace',
    headline: title,
    scheduledDateOnly: todayStr
  });

  if (!validation.passedAll) {
    throw new Error(validation.blockingErrors.join(' | '));
  }

  const composedSvgMarkup = renderCreativeStudioComposedSvg({
    catalogItem: input.catalogItem,
    copyBundle,
    composerSettings: {
      aspectRatio: '1:1',
      templateStyle: 'EDITORIAL_CLEAN',
      selectedHeadlineIndex: 0,
      selectedShortDescIndex: 0,
      selectedCtaIndex: 0,
      discountPct: input.discountPct,
      originalProductPhotoDataUrl: null
    },
    brand
  });

  const breakdown = getSkuOwnerInspectionBreakdown(input.catalogItem.sku, input.ownerId);
  const ownerAlloc = input.catalogItem.ownerAllocations.find(
    (a) => a.ownerId === input.ownerId
  );
  const ownerName = ownerAlloc?.ownerName || 'Eberto';
  const consent = getOrInitializeOwnerMarketingConsent(
    input.ownerId,
    ownerName,
    input.catalogItem.sku,
    input.catalogItem.productName
  );

  const state = getSocialMarketplaceState();
  const nextIdx = state.marketplaceListings.length + 1;
  const nowIso = new Date().toISOString();

  const contactWhatsappUrl = buildOfficialWhatsAppContactLink(
    brand.companyInfo.whatsappContact,
    input.catalogItem.sku,
    input.catalogItem.productName,
    copyBundle.effectivePriceCop
  );

  const dedupFingerprint = buildPublicationDedupFingerprint({
    channel: 'marketplace',
    sku: input.catalogItem.sku,
    ownerId: input.ownerId,
    headline: title,
    scheduledDateOnly: todayStr
  });

  const listing: MarketplaceAssistedListingRecord = {
    id: `MKT-${Date.now()}-${nextIdx}`,
    listingCode: `MKT-2026-${String(nextIdx).padStart(4, '0')}`,
    sku: input.catalogItem.sku,
    productName: input.catalogItem.productName,
    variantOrColor: input.catalogItem.variantOrColor,
    ownerId: input.ownerId,
    ownerName,
    consentCode: consent.consentCode,
    title,
    descriptionText,
    categoryLabel: input.catalogItem.category,
    locationLabel: input.locationLabel?.trim() || brand.companyInfo.cityAndCountry,
    contactWhatsappUrl,
    composedSvgMarkup,
    approvedNormalPriceCop: input.catalogItem.currentNormalPriceCop!,
    discountPct: input.discountPct,
    effectivePublishedPriceCop: copyBundle.effectivePriceCop,
    minimumAllowedPriceCop: input.catalogItem.minimumPriceCop,
    verifiedAvailableStock: breakdown.qtyAvailable,
    pendingInspectionUnits: breakdown.qtyPendingInspection,
    status: 'prepared',
    publishedMarketplaceUrl: null,
    publishedAt: null,
    preparedBy: input.actorName,
    approvedBy: null,
    dedupFingerprint,
    createdAt: nowIso,
    updatedAt: nowIso,
    historyLog: [
      {
        timestamp: nowIso,
        actor: input.actorName,
        action: 'PREPARED_MARKETPLACE_LISTING',
        statusAfter: 'prepared',
        detail: `Ficha Marketplace preparada con stock verificado (${breakdown.qtyAvailable} uds) y precio ${formatCOP(copyBundle.effectivePriceCop)}.`
      }
    ]
  };

  state.marketplaceListings.unshift(listing);
  saveSocialMarketplaceState(state);
  return listing;
}

export function updateMarketplaceListingStatus(input: {
  listingId: string;
  newStatus: 'approved_for_manual_post' | 'rejected';
  actorName: string;
  note?: string;
}): MarketplaceAssistedListingRecord {
  const state = getSocialMarketplaceState();
  const listing = state.marketplaceListings.find((l) => l.id === input.listingId);
  if (!listing) {
    throw new Error('Publicación de Marketplace no encontrada.');
  }

  const nowIso = new Date().toISOString();
  listing.status = input.newStatus;
  if (input.newStatus === 'approved_for_manual_post') {
    listing.approvedBy = input.actorName;
  }
  listing.updatedAt = nowIso;
  listing.historyLog.unshift({
    timestamp: nowIso,
    actor: input.actorName,
    action:
      input.newStatus === 'approved_for_manual_post'
        ? 'APPROVED_FOR_MANUAL_POST'
        : 'REJECTED_LISTING',
    statusAfter: input.newStatus,
    detail:
      input.note?.trim() ||
      (input.newStatus === 'approved_for_manual_post'
        ? 'Aprobada para publicación manual asistida en Marketplace.'
        : 'Publicación rechazada.')
  });

  saveSocialMarketplaceState(state);
  return listing;
}

export function recordPublishedMarketplaceUrl(input: {
  listingId: string;
  publishedUrl: string;
  actorName: string;
}): MarketplaceAssistedListingRecord {
  const state = getSocialMarketplaceState();
  const listing = state.marketplaceListings.find((l) => l.id === input.listingId);
  if (!listing) {
    throw new Error('Publicación de Marketplace no encontrada.');
  }

  if (listing.status === 'rejected') {
    throw new Error('BLOQUEO: No se puede registrar URL publicada para un anuncio RECHAZADO.');
  }

  if (listing.status !== 'approved_for_manual_post' && listing.status !== 'published_url_recorded') {
    throw new Error(
      'BLOQUEO: La ficha debe estar aprobada ("approved_for_manual_post") antes de registrar la URL publicada.'
    );
  }

  const cleanUrl = input.publishedUrl.trim();
  if (!cleanUrl.startsWith('https://')) {
    throw new Error('Ingrese una URL válida que comience por https:// (ej. https://www.facebook.com/marketplace/item/...).');
  }

  const nowIso = new Date().toISOString();
  listing.publishedMarketplaceUrl = cleanUrl;
  listing.publishedAt = nowIso;
  listing.status = 'published_url_recorded';
  listing.updatedAt = nowIso;
  listing.historyLog.unshift({
    timestamp: nowIso,
    actor: input.actorName,
    action: 'RECORDED_PUBLISHED_URL',
    statusAfter: 'published_url_recorded',
    detail: `URL oficial registrada tras publicación manual asistida: ${cleanUrl}`
  });

  saveSocialMarketplaceState(state);
  return listing;
}

// ============================================================================
// 5. ADAPTADORES OFICIALES SEPARADOS: FACEBOOK PAGES GRAPH API & INSTAGRAM API
//    - OAuth autorizado en servidor (Supabase Vault / Edge Function).
//    - Prohibido solicitar contraseñas o usar automatización de navegador.
//    - Permite conexión, verificación de permisos y desconexión inmediata.
// ============================================================================

export function connectOfficialSocialGraphAdapter(input: {
  platform: 'facebook_graph_api' | 'instagram_graph_api';
  externalAccountId: string;
  accountHandleOrPageName: string;
  professionalAccountEligible: boolean;
  actorName: string;
}): OfficialSocialConnectionConfig {
  const state = getSocialMarketplaceState();
  const conn = state.connections[input.platform];

  if (!input.externalAccountId.trim() || !input.accountHandleOrPageName.trim()) {
    throw new Error('Debe especificar el ID de Página / Cuenta Profesional y el nombre o handle.');
  }

  if (input.platform === 'instagram_graph_api' && !input.professionalAccountEligible) {
    conn.connectionStatus = 'error';
    conn.lastErrorMessage =
      'BLOQUEO OFICIAL INSTAGRAM API: La cuenta debe ser Profesional (Business o Creator) vinculada a una Página de Facebook para usar Content Publishing.';
    saveSocialMarketplaceState(state);
    throw new Error(conn.lastErrorMessage);
  }

  const nowIso = new Date().toISOString();
  conn.connectionStatus = 'oauth_connected';
  conn.externalAccountId = input.externalAccountId.trim();
  conn.accountHandleOrPageName = input.accountHandleOrPageName.trim();
  conn.professionalAccountEligible = input.professionalAccountEligible;
  conn.lastVerifiedAt = nowIso;
  conn.disconnectedAt = null;
  conn.lastErrorMessage = null;

  saveSocialMarketplaceState(state);
  return conn;
}

export function disconnectOfficialSocialGraphAdapter(
  platform: 'facebook_graph_api' | 'instagram_graph_api'
): OfficialSocialConnectionConfig {
  const state = getSocialMarketplaceState();
  const conn = state.connections[platform];
  const nowIso = new Date().toISOString();

  conn.connectionStatus = 'disconnected';
  conn.externalAccountId = null;
  conn.accountHandleOrPageName = null;
  conn.disconnectedAt = nowIso;
  conn.lastErrorMessage = null;

  saveSocialMarketplaceState(state);
  return conn;
}

export function setTestSafeModeNoExternalPublish(enabled: boolean): boolean {
  const state = getSocialMarketplaceState();
  state.testSafeModeNoExternalPublish = enabled;
  saveSocialMarketplaceState(state);
  return state.testSafeModeNoExternalPublish;
}

// ============================================================================
// 6. CALENDARIO EDITORIAL Y PUBLICADOR (FACEBOOK, INSTAGRAM, WHATSAPP, MKT)
// ============================================================================

export function createOrScheduleCalendarPublication(input: {
  catalogItem: RealCatalogMerchItem;
  ownerId: string;
  channel: DistributionChannelId;
  discountPct: number;
  scheduledForIso: string;
  customHeadline?: string;
  customBodyText?: string;
  actorName: string;
  isTestSimulation?: boolean;
}): SocialPublicationCalendarItem {
  const brandState = getBrandMerchandisingState();
  const brand = brandState.currentBrandConfig;

  const copyBundle = generateValidatedCopywritingBundle({
    catalogItem: input.catalogItem,
    ownerId: input.ownerId,
    discountPct: input.discountPct,
    brand
  });

  const headline = (input.customHeadline || copyBundle.headlines[0]).trim();
  const defaultChannelBody =
    input.channel === 'facebook_page'
      ? copyBundle.channelSpecific.facebook
      : input.channel === 'instagram_feed' || input.channel === 'instagram_story'
        ? copyBundle.channelSpecific.instagram
        : input.channel === 'whatsapp_status'
          ? copyBundle.channelSpecific.whatsapp
          : copyBundle.channelSpecific.marketplace;

  const bodyText = (input.customBodyText || defaultChannelBody).trim();
  const scheduledDateOnly = input.scheduledForIso.slice(0, 10);

  const validation = validateDistributionCompliance({
    catalogItem: input.catalogItem,
    ownerId: input.ownerId,
    discountPct: input.discountPct,
    channel: input.channel,
    headline,
    scheduledDateOnly
  });

  if (!validation.passedAll) {
    throw new Error(validation.blockingErrors.join(' | '));
  }

  const aspectRatio: '1:1' | '4:5' | '9:16' =
    input.channel === 'instagram_story' || input.channel === 'whatsapp_status'
      ? '9:16'
      : input.channel === 'instagram_feed'
        ? '4:5'
        : '1:1';

  const composedSvgMarkup = renderCreativeStudioComposedSvg({
    catalogItem: input.catalogItem,
    copyBundle,
    composerSettings: {
      aspectRatio,
      templateStyle: 'LUXURY_CARBON_GOLD',
      selectedHeadlineIndex: 0,
      selectedShortDescIndex: 0,
      selectedCtaIndex: 0,
      discountPct: input.discountPct,
      originalProductPhotoDataUrl: null
    },
    brand
  });

  const breakdown = getSkuOwnerInspectionBreakdown(input.catalogItem.sku, input.ownerId);
  const ownerAlloc = input.catalogItem.ownerAllocations.find(
    (a) => a.ownerId === input.ownerId
  );
  const ownerName = ownerAlloc?.ownerName || 'Eberto';
  const consent = getOrInitializeOwnerMarketingConsent(
    input.ownerId,
    ownerName,
    input.catalogItem.sku,
    input.catalogItem.productName
  );

  const state = getSocialMarketplaceState();
  const nextIdx = state.calendarPublications.length + 1;
  const nowIso = new Date().toISOString();

  const ctaWhatsappUrl = buildOfficialWhatsAppContactLink(
    brand.companyInfo.whatsappContact,
    input.catalogItem.sku,
    input.catalogItem.productName,
    copyBundle.effectivePriceCop
  );

  const dedupFingerprint = buildPublicationDedupFingerprint({
    channel: input.channel,
    sku: input.catalogItem.sku,
    ownerId: input.ownerId,
    headline,
    scheduledDateOnly
  });

  const item: SocialPublicationCalendarItem = {
    id: `PUB-${Date.now()}-${nextIdx}`,
    publicationCode: `PUB-2026-${String(nextIdx).padStart(4, '0')}`,
    calendarCode: `CAL-2026-${String(nextIdx).padStart(4, '0')}`,
    channel: input.channel,
    sku: input.catalogItem.sku,
    productName: input.catalogItem.productName,
    ownerId: input.ownerId,
    ownerName,
    consentCode: consent.consentCode,
    headline,
    bodyText,
    ctaWhatsappUrl,
    aspectRatio,
    composedSvgMarkup,
    approvedNormalPriceCop: input.catalogItem.currentNormalPriceCop!,
    discountAppliedPct: input.discountPct,
    effectivePriceCop: copyBundle.effectivePriceCop,
    minimumPriceSnapshotCop: input.catalogItem.minimumPriceCop,
    verifiedAvailableStockSnapshot: breakdown.qtyAvailable,
    pendingInspectionUnitsSnapshot: breakdown.qtyPendingInspection,
    scheduledFor: input.scheduledForIso,
    approvalStatus: 'pending_approval',
    createdBy: input.actorName,
    approvedBy: null,
    approvedAt: null,
    rejectionReason: null,
    publishedAt: null,
    externalContainerId: null,
    externalPostId: null,
    publishedPermalinkUrl: null,
    apiResponsePayload: null,
    errorDetail: null,
    dedupFingerprint,
    isTestSimulation: Boolean(input.isTestSimulation || state.testSafeModeNoExternalPublish),
    createdAt: nowIso,
    updatedAt: nowIso,
    historyLog: [
      {
        timestamp: nowIso,
        actor: input.actorName,
        action: 'SCHEDULED_IN_CALENDAR_PENDING_APPROVAL',
        statusAfter: 'pending_approval',
        detail: `Programada en calendario para ${input.channel} (${input.scheduledForIso.slice(0, 16).replace('T', ' ')}). Pendiente de aprobación humana.`
      }
    ]
  };

  state.calendarPublications.unshift(item);
  saveSocialMarketplaceState(state);
  return item;
}

export function approveSocialCalendarPublication(input: {
  publicationId: string;
  actorName: string;
  approvalNote?: string;
}): SocialPublicationCalendarItem {
  const state = getSocialMarketplaceState();
  const pub = state.calendarPublications.find((p) => p.id === input.publicationId);
  if (!pub) {
    throw new Error('Publicación no encontrada en el calendario.');
  }

  if (pub.approvalStatus === 'rejected') {
    throw new Error(
      'BLOQUEO: Una publicación rechazada no puede aprobarse ni publicarse directamente. Cree una nueva revisión corrigiendo las observaciones.'
    );
  }

  // Revalidar stock e inspección antes de aprobar
  const catalogItems = getRealCatalogMerchItems();
  const catItem = catalogItems.find((i) => i.sku === pub.sku) || null;
  const recheck = validateDistributionCompliance({
    catalogItem: catItem,
    ownerId: pub.ownerId,
    discountPct: pub.discountAppliedPct,
    channel: pub.channel,
    headline: pub.headline,
    scheduledDateOnly: pub.scheduledFor.slice(0, 10),
    currentApprovalStatus: pub.approvalStatus,
    excludeRecordId: pub.id
  });

  if (!recheck.passedAll) {
    throw new Error(recheck.blockingErrors.join(' | '));
  }

  const nowIso = new Date().toISOString();
  pub.approvalStatus = 'approved';
  pub.approvedBy = input.actorName;
  pub.approvedAt = nowIso;
  pub.updatedAt = nowIso;
  pub.historyLog.unshift({
    timestamp: nowIso,
    actor: input.actorName,
    action: 'HUMAN_APPROVED',
    statusAfter: 'approved',
    detail:
      input.approvalNote?.trim() ||
      `Contenido aprobado explícitamente por ${input.actorName}. Listo para despacho oficial.`
  });

  saveSocialMarketplaceState(state);
  return pub;
}

export function rejectSocialCalendarPublication(input: {
  publicationId: string;
  actorName: string;
  rejectionReason: string;
}): SocialPublicationCalendarItem {
  const state = getSocialMarketplaceState();
  const pub = state.calendarPublications.find((p) => p.id === input.publicationId);
  if (!pub) {
    throw new Error('Publicación no encontrada en el calendario.');
  }

  const reason = input.rejectionReason.trim() || 'Rechazada en revisión editorial.';
  const nowIso = new Date().toISOString();
  pub.approvalStatus = 'rejected';
  pub.rejectionReason = reason;
  pub.updatedAt = nowIso;
  pub.historyLog.unshift({
    timestamp: nowIso,
    actor: input.actorName,
    action: 'HUMAN_REJECTED',
    statusAfter: 'rejected',
    detail: `Contenido RECHAZADO: ${reason}. Queda bloqueada su publicación.`
  });

  saveSocialMarketplaceState(state);
  return pub;
}

export function publishApprovedPostToChannel(input: {
  publicationId: string;
  actorName: string;
  manualUrlIfAssisted?: string;
}): SocialPublicationCalendarItem {
  const state = getSocialMarketplaceState();
  const pub = state.calendarPublications.find((p) => p.id === input.publicationId);
  if (!pub) {
    throw new Error('Publicación no encontrada.');
  }

  // Regla: No publicar contenido rechazado
  if (pub.approvalStatus === 'rejected') {
    throw new Error(
      'BLOQUEO ESTRICTO: Prohibido publicar contenido que ha sido RECHAZADO.'
    );
  }

  // Regla: No publicar sin aprobación humana previa
  if (pub.approvalStatus !== 'approved') {
    throw new Error(
      `BLOQUEO DE SEGURIDAD: La publicación ${pub.publicationCode} está en estado "${pub.approvalStatus}". Exige aprobación humana explícita ("approved") antes de publicar.`
    );
  }

  // Revalidar stock disponible, inspección y consentimiento en el instante exacto de publicar
  const catalogItems = getRealCatalogMerchItems();
  const catItem = catalogItems.find((i) => i.sku === pub.sku) || null;
  const liveValidation = validateDistributionCompliance({
    catalogItem: catItem,
    ownerId: pub.ownerId,
    discountPct: pub.discountAppliedPct,
    channel: pub.channel,
    headline: pub.headline,
    scheduledDateOnly: pub.scheduledFor.slice(0, 10),
    currentApprovalStatus: pub.approvalStatus,
    excludeRecordId: pub.id
  });

  if (!liveValidation.passedAll) {
    pub.approvalStatus = 'failed';
    pub.errorDetail = liveValidation.blockingErrors.join(' | ');
    saveSocialMarketplaceState(state);
    throw new Error(pub.errorDetail);
  }

  const nowIso = new Date().toISOString();
  resetSocialDailyQuotasIfNeeded(state);

  // Canal Facebook Pages (Graph API oficial separada)
  if (pub.channel === 'facebook_page') {
    const fbConn = state.connections.facebook_graph_api;
    if (fbConn.connectionStatus !== 'oauth_connected') {
      pub.errorDetail =
        'Adaptador Facebook Pages Graph API desconectado. Conéctelo vía OAuth antes de publicar.';
      saveSocialMarketplaceState(state);
      throw new Error(pub.errorDetail);
    }
    if (!state.testSafeModeNoExternalPublish) {
      pub.errorDetail = `BLOQUEO DE PRODUCCIÓN: La publicación automática vía Facebook Pages Graph API requiere una Edge Function de servidor autenticada con Vault (${fbConn.secretVaultKeyName}), no disponible desde el navegador. Active el Modo Seguro de Prueba para simular localmente o publique manualmente.`;
      saveSocialMarketplaceState(state);
      throw new Error(pub.errorDetail);
    }
    if (fbConn.dailyQuotaUsed >= fbConn.dailyQuotaLimit) {
      pub.errorDetail = `Límite diario de publicaciones en Facebook Pages alcanzado (${fbConn.dailyQuotaLimit}/${fbConn.dailyQuotaLimit}).`;
      saveSocialMarketplaceState(state);
      throw new Error(pub.errorDetail);
    }

    fbConn.dailyQuotaUsed += 1;
    const simulatedPostId = `${fbConn.externalAccountId}_SANDBOX_${Date.now()}`;
    const permalink = `https://www.facebook.com/${fbConn.externalAccountId}/posts/${Date.now()}`;

    pub.approvalStatus = 'published';
    pub.publishedAt = nowIso;
    pub.externalPostId = simulatedPostId;
    pub.publishedPermalinkUrl = permalink;
    pub.isTestSimulation = true;
    pub.apiResponsePayload = {
      provider: 'facebook_graph_api_v20',
      oauthVaultRef: fbConn.secretVaultKeyName,
      testSafeSandbox: true,
      id: simulatedPostId,
      permalink_url: permalink,
      status: 'SANDBOX_SIMULATED_NO_EXTERNAL_TRAFFIC'
    };
    pub.errorDetail = null;
    pub.updatedAt = nowIso;
    pub.historyLog.unshift({
      timestamp: nowIso,
      actor: input.actorName,
      action: 'PUBLISHED_FACEBOOK_GRAPH_SANDBOX',
      statusAfter: 'published',
      detail: `Simulación Sandbox vía Facebook Pages Graph API (cero tráfico externo) • Ref: ${simulatedPostId}`
    });

    saveSocialMarketplaceState(state);
    return pub;
  }

  // Canal Instagram (Content Publishing API oficial separada para cuenta profesional)
  if (pub.channel === 'instagram_feed' || pub.channel === 'instagram_story') {
    const igConn = state.connections.instagram_graph_api;
    if (igConn.connectionStatus !== 'oauth_connected' || !igConn.professionalAccountEligible) {
      pub.errorDetail =
        'Adaptador Instagram Content Publishing desconectado o cuenta no elegible.';
      saveSocialMarketplaceState(state);
      throw new Error(pub.errorDetail);
    }
    if (!state.testSafeModeNoExternalPublish) {
      pub.errorDetail = `BLOQUEO DE PRODUCCIÓN: La publicación automática vía Instagram Content Publishing API requiere una Edge Function de servidor autenticada con Vault (${igConn.secretVaultKeyName}), no disponible desde el navegador. Active el Modo Seguro de Prueba para simular localmente o publique manualmente.`;
      saveSocialMarketplaceState(state);
      throw new Error(pub.errorDetail);
    }
    if (igConn.dailyQuotaUsed >= igConn.dailyQuotaLimit) {
      pub.errorDetail = `Límite oficial de Instagram Content Publishing alcanzado (${igConn.dailyQuotaLimit}/24h).`;
      saveSocialMarketplaceState(state);
      throw new Error(pub.errorDetail);
    }

    igConn.dailyQuotaUsed += 1;
    const containerId = `IG_CONT_SANDBOX_${Date.now()}`;
    const mediaId = `IG_MEDIA_SANDBOX_${Date.now() + 1}`;
    const permalink = `https://www.instagram.com/p/RTWS${String(Date.now()).slice(-6)}/`;

    pub.approvalStatus = 'published';
    pub.publishedAt = nowIso;
    pub.externalContainerId = containerId;
    pub.externalPostId = mediaId;
    pub.publishedPermalinkUrl = permalink;
    pub.isTestSimulation = true;
    pub.apiResponsePayload = {
      provider: 'instagram_graph_content_publishing',
      oauthVaultRef: igConn.secretVaultKeyName,
      testSafeSandbox: true,
      creation_container_id: containerId,
      published_media_id: mediaId,
      permalink
    };
    pub.errorDetail = null;
    pub.updatedAt = nowIso;
    pub.historyLog.unshift({
      timestamp: nowIso,
      actor: input.actorName,
      action: 'PUBLISHED_INSTAGRAM_CONTENT_SANDBOX',
      statusAfter: 'published',
      detail: `Simulación Sandbox vía Instagram Content Publishing (cero tráfico externo) • Container: ${containerId} • Media ID: ${mediaId}`
    });

    saveSocialMarketplaceState(state);
    return pub;
  }

  // Canales de compartición manual asistida (Marketplace / WhatsApp Status)
  const manualUrl =
    input.manualUrlIfAssisted?.trim() ||
    (pub.channel === 'whatsapp_status' ? 'whatsapp://status/shared' : 'https://www.facebook.com/marketplace/');

  pub.approvalStatus = 'published';
  pub.publishedAt = nowIso;
  pub.externalPostId = `MANUAL_${Date.now()}`;
  pub.publishedPermalinkUrl = manualUrl;
  pub.isTestSimulation = state.testSafeModeNoExternalPublish;
  pub.updatedAt = nowIso;
  pub.historyLog.unshift({
    timestamp: nowIso,
    actor: input.actorName,
    action: 'PUBLISHED_MANUAL_ASSISTED',
    statusAfter: 'published',
    detail: `Registrado como publicado manualmente en ${pub.channel} (${manualUrl}).`
  });

  saveSocialMarketplaceState(state);
  return pub;
}

// ============================================================================
// 7. PREPARACIÓN DE ESTADOS DE WHATSAPP (WHATSAPP STATUS MANUAL SHARE)
// ============================================================================

export function prepareWhatsAppStatusPackage(input: {
  catalogItem: RealCatalogMerchItem;
  ownerId: string;
  discountPct: number;
  actorName: string;
}): WhatsAppStatusPreparedItem {
  const brandState = getBrandMerchandisingState();
  const brand = brandState.currentBrandConfig;
  const todayStr = new Date().toISOString().slice(0, 10);

  const copyBundle = generateValidatedCopywritingBundle({
    catalogItem: input.catalogItem,
    ownerId: input.ownerId,
    discountPct: input.discountPct,
    brand
  });

  const validation = validateDistributionCompliance({
    catalogItem: input.catalogItem,
    ownerId: input.ownerId,
    discountPct: input.discountPct,
    channel: 'whatsapp_status',
    headline: copyBundle.headlines[0],
    scheduledDateOnly: todayStr
  });

  if (!validation.passedAll) {
    throw new Error(validation.blockingErrors.join(' | '));
  }

  const composedVerticalSvg9x16 = renderCreativeStudioComposedSvg({
    catalogItem: input.catalogItem,
    copyBundle,
    composerSettings: {
      aspectRatio: '9:16',
      templateStyle: 'LUXURY_CARBON_GOLD',
      selectedHeadlineIndex: 0,
      selectedShortDescIndex: 0,
      selectedCtaIndex: 0,
      discountPct: input.discountPct,
      originalProductPhotoDataUrl: null
    },
    brand
  });

  const ownerAlloc = input.catalogItem.ownerAllocations.find(
    (a) => a.ownerId === input.ownerId
  );
  const ownerName = ownerAlloc?.ownerName || 'Eberto';

  const contactWhatsappUrl = buildOfficialWhatsAppContactLink(
    brand.companyInfo.whatsappContact,
    input.catalogItem.sku,
    input.catalogItem.productName,
    copyBundle.effectivePriceCop
  );

  const state = getSocialMarketplaceState();
  const nextIdx = state.whatsappStatusItems.length + 1;
  const nowIso = new Date().toISOString();

  const item: WhatsAppStatusPreparedItem = {
    id: `WAST-${Date.now()}-${nextIdx}`,
    statusCode: `WAST-2026-${String(nextIdx).padStart(4, '0')}`,
    sku: input.catalogItem.sku,
    productName: input.catalogItem.productName,
    ownerId: input.ownerId,
    ownerName,
    captionText: `${copyBundle.channelSpecific.whatsapp}\n\n🔗 Enlace directo: ${contactWhatsappUrl}`,
    contactWhatsappUrl,
    effectivePriceCop: copyBundle.effectivePriceCop,
    verifiedAvailableStock: copyBundle.verifiedStockUnits,
    composedVerticalSvg9x16,
    approvalStatus: 'approved',
    sharedManuallyAt: null,
    sharedBy: null,
    createdAt: nowIso
  };

  state.whatsappStatusItems.unshift(item);
  saveSocialMarketplaceState(state);
  return item;
}

export function markWhatsAppStatusSharedManually(
  id: string,
  actorName: string
): WhatsAppStatusPreparedItem {
  const state = getSocialMarketplaceState();
  const found = state.whatsappStatusItems.find((i) => i.id === id);
  if (!found) {
    throw new Error('Estado de WhatsApp no encontrado.');
  }
  found.approvalStatus = 'shared_manually';
  found.sharedManuallyAt = new Date().toISOString();
  found.sharedBy = actorName;
  saveSocialMarketplaceState(state);
  return found;
}

// ============================================================================
// 8. SUITE DE PRUEBAS DE SEGURIDAD Y NO-PUBLICACIÓN REAL EN SANDBOX
// ============================================================================

export interface SocialDistributionTestSummary {
  testName: string;
  passed: boolean;
  detail: string;
}

export function runSocialMarketplaceSafetyTests(): SocialDistributionTestSummary[] {
  const results: SocialDistributionTestSummary[] = [];
  const catalogItems = getRealCatalogMerchItems();
  const sampleValid =
    catalogItems.find(
      (i) => i.currentNormalPriceCop && i.currentNormalPriceCop > 0 && i.qtyAvailableTotal > 0
    ) || catalogItems[0];

  // Prueba 1: Bloqueo de inventario agotado (0 unidades)
  const fakeOutOfStock: RealCatalogMerchItem = {
    ...sampleValid,
    sku: 'TEST-AGOTADO-001',
    qtyAvailableTotal: 0,
    ownerAllocations: [
      {
        ownerId: 'OWN-0001',
        ownerName: 'Eberto',
        lotId: 'LOT-001',
        storageBin: 'B1',
        qtyAvailable: 0,
        qtyPhysical: 0,
        qtyPendingInspection: 0
      }
    ]
  };
  const checkOut = validateDistributionCompliance({
    catalogItem: fakeOutOfStock,
    ownerId: 'OWN-0001',
    discountPct: 0,
    channel: 'facebook_page',
    headline: 'Prueba stock 0',
    scheduledDateOnly: '2026-11-14'
  });
  results.push({
    testName: '1. Bloqueo de publicación con inventario agotado (0 uds)',
    passed: !checkOut.stockNotExhaustedCheck.passed,
    detail: checkOut.stockNotExhaustedCheck.message
  });

  // Prueba 2: Bloqueo de contenido rechazado
  const checkRejected = validateDistributionCompliance({
    catalogItem: sampleValid,
    ownerId: 'OWN-0001',
    discountPct: 0,
    channel: 'instagram_feed',
    headline: 'Prueba rechazado',
    scheduledDateOnly: '2026-11-14',
    currentApprovalStatus: 'rejected'
  });
  results.push({
    testName: '2. Bloqueo de publicación para contenido RECHAZADO',
    passed: !checkRejected.notRejectedContentCheck.passed,
    detail: checkRejected.notRejectedContentCheck.message
  });

  // Prueba 3: Bloqueo de descuento fuera del acuerdo / precio mínimo
  const checkExcessDiscount = validateDistributionCompliance({
    catalogItem: sampleValid,
    ownerId: 'OWN-0001',
    discountPct: 85, // Excede acuerdo y precio mínimo
    channel: 'marketplace',
    headline: 'Prueba descuento excesivo',
    scheduledDateOnly: '2026-11-14'
  });
  results.push({
    testName: '3. Bloqueo por descuento no aprobado o inferior al precio mínimo',
    passed: !checkExcessDiscount.minPriceAndDiscountCheck.passed,
    detail: checkExcessDiscount.minPriceAndDiscountCheck.message
  });

  // Prueba 4: Seguridad de Tokens en Servidor y Cero Automatización de Navegador
  const state = getSocialMarketplaceState();
  const fbSec = state.connections.facebook_graph_api;
  const igSec = state.connections.instagram_graph_api;
  const securityPassed =
    fbSec.browserAutomationBlocked === true &&
    fbSec.passwordCollectionBlocked === true &&
    igSec.browserAutomationBlocked === true &&
    igSec.passwordCollectionBlocked === true &&
    fbSec.secretVaultKeyName.startsWith('SUPABASE_VAULT_') &&
    state.testSafeModeNoExternalPublish === true;

  results.push({
    testName: '4. Tokens en Vault, Cero Contraseñas, Cero Bots y Modo Prueba sin Publicar en Vivo',
    passed: securityPassed,
    detail: `Vault refs: ${fbSec.secretVaultKeyName} / ${igSec.secretVaultKeyName} • No-External-Publish activo: ${state.testSafeModeNoExternalPublish}`
  });

  return results;
}
