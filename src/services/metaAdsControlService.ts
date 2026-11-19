// ============================================================================
// REAL TWS COMMERCE SYSTEM — META ADS CONTROL CENTER ENGINE (FASE 8D)
// Cubre:
//   1. MÓDULOS:
//      Campañas, Conjuntos, Anuncios, Creatividades, Productos (SKU),
//      Presupuestos, Resultados, Conversiones (separando conversaciones de
//      compras reales), CPA, ROAS, Contribución, Rentabilidad e Historial.
//   2. PRIMERA VERSIÓN:
//      - Registrar campañas manualmente.
//      - Importar informes CSV de Ads Manager.
//      - Relacionar campaña y anuncio con SKU y propietario.
//      - Relacionar conversaciones (CRM leads) y pedidos reales (SalesOrders).
//      - Distinguir explícitamente origen: MANUAL_ENTRY ("Dato Manual"),
//        CSV_ADS_MANAGER_IMPORT ("Importado CSV Ads Manager") y
//        META_API_SYNCED ("Sincronizado Meta API").
//   3. MULTIPROPIETARIO:
//      - Registrar gasto publicitario por campaña.
//      - Asignar publicidad a productos y propietarios.
//      - Aplicar distribución solamente mediante acuerdos configurados.
//      - No descontar publicidad de un propietario sin autorización explícita.
//   4. REGLAS ESTRICTAS:
//      - No crear campañas automáticamente.
//      - No gastar dinero ni modificar/aumentar presupuestos automáticamente.
//      - No pausar campañas sin aprobación humana.
//      - No inventar conversiones ni confundir conversaciones con compras.
//   5. INTEGRACIÓN FUTURA (META MARKETING API):
//      - Adaptador preparado con secretos en servidor (Vault) y desactivado
//        inicialmente (isEnabled: false).
//   6. SEIS (6) ALERTAS INTELIGENTES:
//      - Presupuesto agotado, CPA superior al objetivo, Producto sin stock,
//        Precio desactualizado, Conversaciones sin ventas, y Resultado rentable
//        que merece evaluación.
// ============================================================================

import { getRealCatalogMerchItems } from './brandMerchandisingService';
import { getCreativeStudioState } from './creativeStudioService';
import { getFinancialAccountingState } from './financialAccountingService';
import { getInventoryPurchaseState } from './inventoryPurchaseService';
import { getSalesOrdersCrmState } from './salesOrdersCrmService';
import { formatCOP } from '../utils/formatters';
import { parseCsvRecords } from '../utils/spreadsheetParser';

export type AdsDataSourceOrigin =
  | 'MANUAL_ENTRY'
  | 'CSV_ADS_MANAGER_IMPORT'
  | 'META_API_SYNCED';

export type AdsChannelType =
  | 'whatsapp'
  | 'instagram'
  | 'facebook'
  | 'marketplace';

export type AdsOwnerAllocationPolicy =
  | 'direct_owner'
  | 'shared_proportional_sales'
  | 'store_absorbed';

export type CampaignLifecycleStatus =
  | 'draft_manual_review'
  | 'approved_manual_launch'
  | 'paused'
  | 'completed';

export interface AdsAuditHistoryEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  dataSource: AdsDataSourceOrigin;
  detail: string;
}

export interface MetaAdsCampaignRecord {
  id: string;
  campaignCode: string;
  externalCampaignId: string | null;
  campaignName: string;
  channel: AdsChannelType;
  objective: string;
  promotedSku: string;
  promotedProductName: string;
  targetOwnerId: string;
  targetOwnerName: string;
  ownerAllocationPolicy: AdsOwnerAllocationPolicy;
  manualBudgetCapCop: number;
  targetCpaCop: number;
  advertisedPriceSnapshotCop: number;
  status: CampaignLifecycleStatus;
  dataSourceOrigin: AdsDataSourceOrigin;
  humanApprovedBy: string | null;
  humanApprovedAt: string | null;
  pauseApprovedBy: string | null;
  pauseReason: string | null;
  ownerDeductionAuthorized: boolean;
  ownerDeductionAuthorizedBy: string | null;
  ownerDeductionAuthorizedAt: string | null;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MetaAdSetRecord {
  id: string;
  adSetCode: string;
  campaignId: string;
  campaignCode: string;
  adSetName: string;
  targetChannel: AdsChannelType;
  audienceSummary: string;
  allocatedBudgetCop: number;
  status: 'draft' | 'active' | 'paused' | 'completed';
  dataSourceOrigin: AdsDataSourceOrigin;
  createdAt: string;
}

export interface MetaAdCreativeRecord {
  id: string;
  adCode: string;
  campaignId: string;
  adSetId: string;
  adName: string;
  creativeProjectCode: string;
  creativeFormat: '1:1' | '4:5' | '9:16' | 'VIDEO_REEL';
  headlineUsed: string;
  sku: string;
  productName: string;
  ownerId: string;
  ownerName: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  dataSourceOrigin: AdsDataSourceOrigin;
  createdAt: string;
}

export interface MetaAdsMetricRecord {
  id: string;
  campaignId: string;
  campaignCode: string;
  adSetId: string | null;
  adId: string | null;
  metricDate: string;
  sku: string;
  ownerId: string;
  channel: AdsChannelType;
  impressions: number;
  reach: number;
  clicks: number;
  whatsappConversationsCount: number; // Conversaciones iniciadas (NO son compras)
  verifiedPurchasesOrdersCount: number; // Pedidos/compras reales cerradas
  spendCop: number;
  attributedRevenueCop: number;
  attributedCogsCop: number;
  cogsStatus?: 'VERIFIED_LOT_COST' | 'MANUAL_INPUT' | 'PENDING_COST';
  linkedOrderNumbers: string[];
  linkedLeadCodes: string[];
  dataSourceOrigin: AdsDataSourceOrigin;
  recordedBy: string;
  createdAt: string;
}

export interface MetaAdsOwnerSpendAllocation {
  id: string;
  allocationCode: string;
  campaignId: string;
  campaignCode: string;
  sku: string;
  ownerId: string;
  ownerName: string;
  agreementStatusSnapshot: string;
  allocationPolicyUsed: AdsOwnerAllocationPolicy;
  totalCampaignSpendCop: number;
  ownerAllocatedSpendCop: number;
  ownerDeductionAuthorized: boolean;
  authorizedBy: string | null;
  authorizedAt: string | null;
  deductionStatus:
    | 'pending_owner_authorization'
    | 'blocked_agreement_not_configured'
    | 'authorized_and_applied'
    | 'store_absorbed_no_deduction';
  notes: string;
  createdAt: string;
}

export type SmartAdsAlertType =
  | 'BUDGET_EXHAUSTED'
  | 'CPA_ABOVE_TARGET'
  | 'PROMOTED_SKU_OUT_OF_STOCK'
  | 'PRICE_OUTDATED_OR_MISMATCH'
  | 'CONVERSATIONS_WITHOUT_SALES'
  | 'PROFITABLE_RESULT_WORTH_EVALUATING';

export interface SmartAdsAlertItem {
  id: string;
  alertType: SmartAdsAlertType;
  severity: 'critical' | 'warning' | 'opportunity';
  campaignCode: string;
  campaignName: string;
  sku: string;
  ownerId: string;
  title: string;
  message: string;
  recommendedHumanAction: string;
}

export interface CampaignPerformanceSummary {
  campaign: MetaAdsCampaignRecord;
  totalImpressions: number;
  totalReach: number;
  totalClicks: number;
  ctrPct: number;
  cpcCop: number;
  totalSpendCop: number;
  remainingBudgetCop: number;
  budgetConsumedPct: number;
  totalWhatsappConversations: number;
  costPerConversationCop: number | null;
  totalVerifiedPurchases: number;
  conversationToPurchaseRatePct: number;
  cpaPerPurchaseCop: number | null;
  totalAttributedRevenueCop: number;
  totalAttributedCogsCop: number;
  grossProfitBeforeAdsCop: number;
  roasMultiplier: number | null;
  netContributionAfterAdsCop: number;
  netProfitabilityPct: number | null;
  hasPendingCogs: boolean;
  linkedOrderNumbers: string[];
  linkedLeadCodes: string[];
}

export interface MetaMarketingApiFutureAdapter {
  adapterId: 'META_MARKETING_API_OFFICIAL_ADAPTER_V20';
  isEnabled: boolean; // Desactivada inicialmente
  connectionStatus: 'disabled_initial_state' | 'oauth_read_only_ready';
  secretVaultKeyName: string; // Secretos únicamente en servidor
  authorizedScopes: string[];
  autoCreateCampaignsBlocked: true;
  autoSpendMoneyBlocked: true;
  autoModifyBudgetsBlocked: true;
  autoPauseWithoutApprovalBlocked: true;
  lastSyncAttemptAt: string | null;
}

export interface MetaAdsControlStoreState {
  campaigns: MetaAdsCampaignRecord[];
  adSets: MetaAdSetRecord[];
  adsAndCreatives: MetaAdCreativeRecord[];
  metrics: MetaAdsMetricRecord[];
  ownerSpendAllocations: MetaAdsOwnerSpendAllocation[];
  historyLog: AdsAuditHistoryEvent[];
  futureApiAdapter: MetaMarketingApiFutureAdapter;
}

const META_ADS_CONTROL_STORAGE_KEY = 'rtw_meta_ads_control_center_v1';

// ============================================================================
// 1. INICIALIZACIÓN Y PERSISTENCIA
// ============================================================================

function createInitialMetaAdsControlState(): MetaAdsControlStoreState {
  return {
    campaigns: [],
    adSets: [],
    adsAndCreatives: [],
    metrics: [],
    ownerSpendAllocations: [],
    historyLog: [],
    futureApiAdapter: {
      adapterId: 'META_MARKETING_API_OFFICIAL_ADAPTER_V20',
      isEnabled: false, // Regla: Mantener integración desactivada inicialmente
      connectionStatus: 'disabled_initial_state',
      secretVaultKeyName: 'SUPABASE_VAULT_META_MARKETING_API_TOKEN',
      authorizedScopes: ['ads_read', 'read_insights', 'business_management'],
      autoCreateCampaignsBlocked: true,
      autoSpendMoneyBlocked: true,
      autoModifyBudgetsBlocked: true,
      autoPauseWithoutApprovalBlocked: true,
      lastSyncAttemptAt: null
    }
  };
}

let inMemoryMetaAdsState: MetaAdsControlStoreState | null = null;

export function getMetaAdsControlState(): MetaAdsControlStoreState {
  if (inMemoryMetaAdsState) {
    return inMemoryMetaAdsState;
  }
  try {
    const raw = localStorage.getItem(META_ADS_CONTROL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MetaAdsControlStoreState;
      if (parsed && Array.isArray(parsed.campaigns) && parsed.futureApiAdapter) {
        inMemoryMetaAdsState = parsed;
        return parsed;
      }
    }
  } catch {
    // Fallback
  }
  const initial = createInitialMetaAdsControlState();
  inMemoryMetaAdsState = initial;
  saveMetaAdsControlState(initial);
  return initial;
}

export function saveMetaAdsControlState(state: MetaAdsControlStoreState): void {
  inMemoryMetaAdsState = state;
  try {
    localStorage.setItem(META_ADS_CONTROL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota issues
  }
}

function getBogotaDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(date);
}

export function getDataSourceBadgeLabel(origin: AdsDataSourceOrigin): string {
  if (origin === 'MANUAL_ENTRY') return 'Dato Manual';
  if (origin === 'CSV_ADS_MANAGER_IMPORT') return 'Importado CSV Ads Manager';
  return 'Sincronizado Meta API';
}

// ============================================================================
// 2. CREACIÓN Y GESTIÓN MANUAL DE CAMPAÑAS, CONJUNTOS Y ANUNCIOS (CON REGLAS)
//    - No crear campañas automáticamente.
//    - No modificar presupuestos ni pausar sin aprobación humana.
// ============================================================================

export function registerManualMetaAdsCampaignBundle(input: {
  campaignName: string;
  channel: AdsChannelType;
  objective: string;
  promotedSku: string;
  targetOwnerId: string;
  ownerAllocationPolicy: AdsOwnerAllocationPolicy;
  manualBudgetCapCop: number;
  targetCpaCop: number;
  adSetName: string;
  audienceSummary: string;
  adName: string;
  creativeFormat: '1:1' | '4:5' | '9:16' | 'VIDEO_REEL';
  headlineUsed?: string;
  actorName: string;
}): {
  campaign: MetaAdsCampaignRecord;
  adSet: MetaAdSetRecord;
  adCreative: MetaAdCreativeRecord;
} {
  if (!input.campaignName.trim()) {
    throw new Error('El nombre de la campaña es obligatorio.');
  }
  if (!Number.isFinite(input.manualBudgetCapCop) || input.manualBudgetCapCop <= 0) {
    throw new Error('Debe definir un tope de presupuesto manual finito y mayor a $0 COP.');
  }
  if (input.targetCpaCop !== undefined && (!Number.isFinite(input.targetCpaCop) || input.targetCpaCop <= 0)) {
    throw new Error('El CPA objetivo debe ser mayor a $0 COP.');
  }
  const cleanOwnerId = input.targetOwnerId.trim();
  if (!cleanOwnerId) {
    throw new Error('Debe indicar el propietario objetivo de la campaña.');
  }

  const catalogItems = getRealCatalogMerchItems();
  const catItem = catalogItems.find((i) => i.sku === input.promotedSku);
  if (!catItem) {
    throw new Error(`SKU ${input.promotedSku} no encontrado en el catálogo maestro.`);
  }

  const invState = getInventoryPurchaseState();
  const ownerAlloc = catItem.ownerAllocations.find((a) => a.ownerId === cleanOwnerId);
  const masterOwner = invState.owners.find((o) => o.id === cleanOwnerId);
  if (!ownerAlloc && !masterOwner) {
    throw new Error(`Propietario objetivo "${cleanOwnerId}" no encontrado en el catálogo de propietarios.`);
  }
  const ownerName = ownerAlloc?.ownerName || masterOwner?.fullName || cleanOwnerId;

  const creativeState = getCreativeStudioState();
  const matchingProject = creativeState.projects.find(
    (p) => p.sku === input.promotedSku && p.ownerId === cleanOwnerId
  );

  const state = getMetaAdsControlState();
  const nextIdx = state.campaigns.length + 1;
  const nowIso = new Date().toISOString();

  const campaignId = `CMP-${Date.now()}-${nextIdx}`;
  const campaignCode = `ADS-2026-${String(nextIdx).padStart(4, '0')}`;

  const campaign: MetaAdsCampaignRecord = {
    id: campaignId,
    campaignCode,
    externalCampaignId: null,
    campaignName: input.campaignName.trim(),
    channel: input.channel,
    objective: input.objective.trim() || 'Conversaciones y Ventas Verificadas',
    promotedSku: catItem.sku,
    promotedProductName: catItem.productName,
    targetOwnerId: cleanOwnerId,
    targetOwnerName: ownerName,
    ownerAllocationPolicy: input.ownerAllocationPolicy,
    manualBudgetCapCop: Math.round(input.manualBudgetCapCop),
    targetCpaCop: Math.round(input.targetCpaCop || 15000),
    advertisedPriceSnapshotCop: catItem.currentNormalPriceCop || 0,
    status: 'approved_manual_launch',
    dataSourceOrigin: 'MANUAL_ENTRY',
    humanApprovedBy: input.actorName,
    humanApprovedAt: nowIso,
    pauseApprovedBy: null,
    pauseReason: null,
    ownerDeductionAuthorized: false, // Nunca descontar al propietario sin autorización explícita
    ownerDeductionAuthorizedBy: null,
    ownerDeductionAuthorizedAt: null,
    startDate: getBogotaDateString(),
    endDate: null,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  const adSetId = `ADSET-${Date.now()}-${nextIdx}`;
  const adSet: MetaAdSetRecord = {
    id: adSetId,
    adSetCode: `CONJ-2026-${String(nextIdx).padStart(4, '0')}`,
    campaignId,
    campaignCode,
    adSetName: input.adSetName.trim() || `Conjunto ${catItem.category} — ${input.channel}`,
    targetChannel: input.channel,
    audienceSummary:
      input.audienceSummary.trim() ||
      'Barranquilla y Atlántico • Compradores de Tecnología 18-50',
    allocatedBudgetCop: Math.round(input.manualBudgetCapCop),
    status: 'active',
    dataSourceOrigin: 'MANUAL_ENTRY',
    createdAt: nowIso
  };

  const adCreative: MetaAdCreativeRecord = {
    id: `AD-${Date.now()}-${nextIdx}`,
    adCode: `ANU-2026-${String(nextIdx).padStart(4, '0')}`,
    campaignId,
    adSetId,
    adName: input.adName.trim() || `Anuncio ${catItem.sku} (${input.creativeFormat})`,
    creativeProjectCode: matchingProject?.projectCode || 'BRAND-KIT-LOCAL',
    creativeFormat: input.creativeFormat,
    headlineUsed:
      input.headlineUsed?.trim() ||
      `${catItem.productName} (${catItem.variantOrColor}) — REAL TWS`,
    sku: catItem.sku,
    productName: catItem.productName,
    ownerId: input.targetOwnerId,
    ownerName,
    status: 'active',
    dataSourceOrigin: 'MANUAL_ENTRY',
    createdAt: nowIso
  };

  state.campaigns.unshift(campaign);
  state.adSets.unshift(adSet);
  state.adsAndCreatives.unshift(adCreative);
  state.historyLog.unshift({
    id: `ADSHIST-${Date.now()}`,
    timestamp: nowIso,
    actor: input.actorName,
    action: 'MANUAL_CAMPAIGN_CREATED',
    dataSource: 'MANUAL_ENTRY',
    detail: `Campaña manual ${campaignCode} registrada para SKU ${catItem.sku} (${input.targetOwnerId}) • Tope manual: ${formatCOP(campaign.manualBudgetCapCop)}.`
  });

  saveMetaAdsControlState(state);
  return { campaign, adSet, adCreative };
}

export function pauseOrResumeCampaignWithHumanApproval(input: {
  campaignId: string;
  targetStatus: 'paused' | 'approved_manual_launch' | 'completed';
  reason: string;
  approvedBy: string;
}): MetaAdsCampaignRecord {
  if (!input.approvedBy.trim() || !input.reason.trim()) {
    throw new Error(
      'REGLA ESTRICTA: Prohibido pausar o cambiar estado de una campaña sin indicar el responsable humano y el motivo aprobado.'
    );
  }

  const state = getMetaAdsControlState();
  const cmp = state.campaigns.find((c) => c.id === input.campaignId);
  if (!cmp) {
    throw new Error('Campaña no encontrada.');
  }

  const nowIso = new Date().toISOString();
  cmp.status = input.targetStatus;
  if (input.targetStatus === 'paused') {
    cmp.pauseApprovedBy = input.approvedBy;
    cmp.pauseReason = input.reason.trim();
  }
  cmp.updatedAt = nowIso;

  state.historyLog.unshift({
    id: `ADSHIST-${Date.now()}`,
    timestamp: nowIso,
    actor: input.approvedBy,
    action: `CAMPAIGN_STATUS_${input.targetStatus.toUpperCase()}`,
    dataSource: cmp.dataSourceOrigin,
    detail: `Campaña ${cmp.campaignCode} cambiada a "${input.targetStatus}" con aprobación de ${input.approvedBy}: ${input.reason.trim()}`
  });

  saveMetaAdsControlState(state);
  return cmp;
}

// ============================================================================
// 3. REGISTRO MANUAL DE RESULTADOS Y CONVERSIONES (SIN CONFUNDIR CONVERSACIONES
//    CON COMPRAS REALES) + IMPORTACIÓN CSV DE ADS MANAGER
// ============================================================================

export function recordManualOrSyncedCampaignMetrics(input: {
  campaignId: string;
  metricDate: string;
  impressions: number;
  reach: number;
  clicks: number;
  whatsappConversationsCount: number;
  verifiedPurchasesOrdersCount: number;
  spendCop: number;
  attributedRevenueCop?: number;
  attributedCogsCop?: number;
  linkedOrderNumbers?: string[];
  linkedLeadCodes?: string[];
  dataSourceOrigin: AdsDataSourceOrigin;
  actorName: string;
}): MetaAdsMetricRecord {
  const state = getMetaAdsControlState();
  if (input.dataSourceOrigin === 'META_API_SYNCED' && !state.futureApiAdapter.isEnabled) {
    throw new Error(
      'La sincronización automática con Meta Marketing API está desactivada; registre métricas como Dato Manual o mediante importación CSV de Ads Manager.'
    );
  }
  const cmp = state.campaigns.find((c) => c.id === input.campaignId);
  if (!cmp) {
    throw new Error('Seleccione una campaña válida para registrar métricas.');
  }

  const numericChecks = [
    input.impressions,
    input.reach,
    input.clicks,
    input.whatsappConversationsCount,
    input.verifiedPurchasesOrdersCount,
    input.spendCop
  ];
  if (numericChecks.some((v) => !Number.isFinite(v) || v < 0)) {
    throw new Error('Las métricas (impresiones, alcance, clics, conversaciones, compras y gasto) deben ser números finitos iguales o mayores a 0.');
  }

  // Buscar ventas y costos reales del SKU si se indiquen compras verificadas
  const crmState = getSalesOrdersCrmState();
  const invState = getInventoryPurchaseState();
  const matchingOrders = crmState.orders.filter(
    (o) =>
      o.status !== 'cancelled' &&
      o.lines.some((l) => l.sku === cmp.promotedSku)
  );
  const matchingLeads = crmState.leads.filter(
    (l) => l.interestedSku === cmp.promotedSku
  );

  const catalogItems = getRealCatalogMerchItems();
  const catItem = catalogItems.find((i) => i.sku === cmp.promotedSku);
  const unitPrice = catItem?.currentNormalPriceCop || cmp.advertisedPriceSnapshotCop || 0;

  const purchases = Math.max(0, Math.round(input.verifiedPurchasesOrdersCount || 0));
  const conversations = Math.max(0, Math.round(input.whatsappConversationsCount || 0));

  // Regla: No confundir conversaciones con compras (si purchases === 0, attributedRevenueCop es 0)
  const revenueCop =
    purchases === 0
      ? 0
      : input.attributedRevenueCop !== undefined
        ? Math.max(0, Math.round(input.attributedRevenueCop))
        : purchases * unitPrice;

  let cogsCop = 0;
  let cogsStatus: MetaAdsMetricRecord['cogsStatus'] = 'VERIFIED_LOT_COST';
  if (purchases > 0) {
    if (input.attributedCogsCop !== undefined) {
      if (!Number.isFinite(input.attributedCogsCop) || input.attributedCogsCop < 0) {
        throw new Error('El COGS manual atribuido debe ser finito >= 0.');
      }
      cogsCop = Math.round(input.attributedCogsCop);
      cogsStatus = 'MANUAL_INPUT';
    } else {
      const matchingLotWithCost =
        invState.allocations.find(
          (a) =>
            a.sku === cmp.promotedSku &&
            a.ownerId === cmp.targetOwnerId &&
            a.effectiveUnitCostCop !== null &&
            a.qtyPhysical > 0
        ) ||
        invState.allocations.find(
          (a) =>
            a.sku === cmp.promotedSku &&
            a.ownerId === cmp.targetOwnerId &&
            a.effectiveUnitCostCop !== null
        );
      if (matchingLotWithCost && matchingLotWithCost.effectiveUnitCostCop !== null) {
        cogsCop = Math.round(matchingLotWithCost.effectiveUnitCostCop * purchases);
        cogsStatus = 'VERIFIED_LOT_COST';
      } else {
        // Nunca fabricar un 45% estimado cuando falta el costo real del lote
        cogsCop = 0;
        cogsStatus = 'PENDING_COST';
      }
    }
  }

  const nowIso = new Date().toISOString();
  const metric: MetaAdsMetricRecord = {
    id: `MET-${Date.now()}-${state.metrics.length + 1}`,
    campaignId: cmp.id,
    campaignCode: cmp.campaignCode,
    adSetId: state.adSets.find((s) => s.campaignId === cmp.id)?.id || null,
    adId: state.adsAndCreatives.find((a) => a.campaignId === cmp.id)?.id || null,
    metricDate: input.metricDate || getBogotaDateString(),
    sku: cmp.promotedSku,
    ownerId: cmp.targetOwnerId,
    channel: cmp.channel,
    impressions: Math.max(0, Math.round(input.impressions || 0)),
    reach: Math.max(0, Math.round(input.reach || 0)),
    clicks: Math.max(0, Math.round(input.clicks || 0)),
    whatsappConversationsCount: conversations,
    verifiedPurchasesOrdersCount: purchases,
    spendCop: Math.max(0, Math.round(input.spendCop || 0)),
    attributedRevenueCop: revenueCop,
    attributedCogsCop: cogsCop,
    cogsStatus,
    linkedOrderNumbers:
      input.linkedOrderNumbers ||
      matchingOrders.slice(0, purchases).map((o) => o.orderNumber),
    linkedLeadCodes:
      input.linkedLeadCodes ||
      matchingLeads.slice(0, conversations).map((l) => l.leadCode),
    dataSourceOrigin: input.dataSourceOrigin,
    recordedBy: input.actorName,
    createdAt: nowIso
  };

  state.metrics.unshift(metric);
  state.historyLog.unshift({
    id: `ADSHIST-${Date.now()}-${state.historyLog.length + 1}`,
    timestamp: nowIso,
    actor: input.actorName,
    action: 'METRICS_RECORDED',
    dataSource: input.dataSourceOrigin,
    detail: `[${getDataSourceBadgeLabel(input.dataSourceOrigin)}] ${cmp.campaignCode} (${metric.metricDate}): Gasto ${formatCOP(metric.spendCop)} | Conversaciones: ${conversations} | Compras Reales: ${purchases} | Ingresos: ${formatCOP(revenueCop)}${cogsStatus === 'PENDING_COST' ? ' (COGS pendiente de lote)' : ''}.`
  });

  saveMetaAdsControlState(state);
  return metric;
}

export function importAdsManagerCsvReport(input: {
  csvContent: string;
  defaultOwnerId: string;
  actorName: string;
}): { importedCampaignsCount: number; importedMetricsCount: number } {
  const rows = parseCsvRecords(input.csvContent);
  if (rows.length < 2) {
    throw new Error(
      'El archivo CSV de Ads Manager debe incluir una fila de encabezados y al menos una fila de datos.'
    );
  }

  const catalogItems = getRealCatalogMerchItems();
  const invState = getInventoryPurchaseState();
  const validOwnerIds = new Set(invState.owners.map((o) => o.id));
  const cleanDefaultOwner = input.defaultOwnerId.trim();

  const headerNorm = rows[0].map((h) => h.trim().toLowerCase());
  const colIdx = {
    campaignName: headerNorm.findIndex((h) => h.includes('campaign') || h.includes('campaña')),
    sku: headerNorm.findIndex((h) => h === 'sku' || h.includes('sku')),
    ownerId: headerNorm.findIndex((h) => h.includes('owner') || h.includes('propietario')),
    channel: headerNorm.findIndex((h) => h.includes('channel') || h.includes('canal')),
    date: headerNorm.findIndex((h) => h === 'date' || h.includes('fecha')),
    impressions: headerNorm.findIndex((h) => h.includes('impres')),
    clicks: headerNorm.findIndex((h) => h.includes('click') || h.includes('clic')),
    conversations: headerNorm.findIndex((h) => h.includes('conver')),
    purchases: headerNorm.findIndex((h) => h.includes('purch') || h.includes('compra')),
    spend: headerNorm.findIndex((h) => h.includes('spend') || h.includes('gasto')),
    revenue: headerNorm.findIndex((h) => h.includes('reven') || h.includes('ingreso'))
  };

  interface ParsedCsvAdsRow {
    campaignName: string;
    matchedItem: (typeof catalogItems)[number];
    ownerId: string;
    channel: AdsChannelType;
    metricDate: string;
    impressions: number;
    clicks: number;
    conversations: number;
    purchases: number;
    spendCop: number;
    revenueCop?: number;
  }

  const parsedRows: ParsedCsvAdsRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i].map((c) => c.trim());
    if (cols.every((c) => !c)) continue;
    if (cols.length < 7) {
      throw new Error(`Fila ${i + 1} del CSV tiene menos de 7 columnas.`);
    }

    const pick = (mappedIdx: number, fallbackIdx: number) =>
      cols[mappedIdx >= 0 ? mappedIdx : fallbackIdx] ?? '';

    const campaignName = pick(colIdx.campaignName, 0);
    const rawSku = pick(colIdx.sku, 1);
    const rawOwnerId = pick(colIdx.ownerId, 2);
    const rawChannel = pick(colIdx.channel, 3).toLowerCase();
    const metricDate = pick(colIdx.date, 4) || getBogotaDateString();
    const impressions = Number(pick(colIdx.impressions, 5) || 0);
    const clicks = Number(pick(colIdx.clicks, 6) || 0);
    const conversations = Number(pick(colIdx.conversations, 7) || 0);
    const purchases = Number(pick(colIdx.purchases, 8) || 0);
    const spendCop = Number(pick(colIdx.spend, 9) || 0);
    const rawRevenueStr = pick(colIdx.revenue, 10);

    const matchedItem = catalogItems.find(
      (it) => it.sku.toUpperCase() === rawSku.toUpperCase()
    );
    if (!matchedItem) {
      throw new Error(
        `Fila ${i + 1} del CSV referencia SKU "${rawSku}" que no existe en el catálogo maestro.`
      );
    }

    const ownerId =
      rawOwnerId && validOwnerIds.has(rawOwnerId)
        ? rawOwnerId
        : cleanDefaultOwner && validOwnerIds.has(cleanDefaultOwner)
          ? cleanDefaultOwner
          : matchedItem.ownerAllocations[0]?.ownerId || '';
    if (!ownerId) {
      throw new Error(
        `Fila ${i + 1} (${matchedItem.sku}) no tiene propietario válido ni propietario por defecto.`
      );
    }

    if (
      [impressions, clicks, conversations, purchases, spendCop].some(
        (n) => !Number.isFinite(n) || n < 0
      )
    ) {
      throw new Error(`Fila ${i + 1} contiene métricas numéricas inválidas o negativas.`);
    }

    let revenueCop: number | undefined = undefined;
    if (purchases > 0 && rawRevenueStr !== '') {
      const parsedRev = Number(rawRevenueStr);
      if (!Number.isFinite(parsedRev) || parsedRev < 0) {
        throw new Error(`Fila ${i + 1} contiene ingreso atribuido inválido.`);
      }
      revenueCop = Math.round(parsedRev);
    } else if (purchases === 0) {
      revenueCop = 0;
    }

    const channel: AdsChannelType =
      rawChannel === 'instagram' || rawChannel === 'facebook' || rawChannel === 'marketplace'
        ? rawChannel
        : 'whatsapp';

    parsedRows.push({
      campaignName,
      matchedItem,
      ownerId,
      channel,
      metricDate,
      impressions,
      clicks,
      conversations,
      purchases,
      spendCop,
      revenueCop
    });
  }

  if (parsedRows.length === 0) {
    throw new Error('No se encontraron filas válidas de datos en el CSV.');
  }

  const state = getMetaAdsControlState();
  let importedCampaignsCount = 0;
  let importedMetricsCount = 0;

  for (const row of parsedRows) {
    let existingCmp = state.campaigns.find(
      (c) =>
        c.campaignName.toLowerCase() === row.campaignName.toLowerCase() &&
        c.promotedSku === row.matchedItem.sku &&
        c.targetOwnerId === row.ownerId
    );

    if (!existingCmp) {
      const created = registerManualMetaAdsCampaignBundle({
        campaignName: row.campaignName || `Campaña CSV ${row.matchedItem.sku}`,
        channel: row.channel,
        objective: 'Importado desde Informe CSV Ads Manager',
        promotedSku: row.matchedItem.sku,
        targetOwnerId: row.ownerId,
        ownerAllocationPolicy: 'direct_owner',
        manualBudgetCapCop: Math.max(50000, Math.round(row.spendCop * 2)),
        targetCpaCop: 15000,
        adSetName: `Conjunto CSV ${row.matchedItem.sku}`,
        audienceSummary: 'Audiencia Informe CSV Ads Manager',
        adName: `Anuncio CSV ${row.matchedItem.sku}`,
        creativeFormat: '1:1',
        actorName: input.actorName
      });
      created.campaign.dataSourceOrigin = 'CSV_ADS_MANAGER_IMPORT';
      created.adSet.dataSourceOrigin = 'CSV_ADS_MANAGER_IMPORT';
      created.adCreative.dataSourceOrigin = 'CSV_ADS_MANAGER_IMPORT';
      existingCmp = created.campaign;
      importedCampaignsCount += 1;
    }

    recordManualOrSyncedCampaignMetrics({
      campaignId: existingCmp.id,
      metricDate: row.metricDate,
      impressions: row.impressions,
      reach: Math.round(row.impressions * 0.82),
      clicks: row.clicks,
      whatsappConversationsCount: row.conversations,
      verifiedPurchasesOrdersCount: row.purchases,
      spendCop: row.spendCop,
      attributedRevenueCop: row.revenueCop,
      dataSourceOrigin: 'CSV_ADS_MANAGER_IMPORT',
      actorName: input.actorName
    });
    importedMetricsCount += 1;
  }

  saveMetaAdsControlState(getMetaAdsControlState());
  return { importedCampaignsCount, importedMetricsCount };
}

export function generateSampleAdsManagerCsvContent(): string {
  const catalogItems = getRealCatalogMerchItems();
  const invState = getInventoryPurchaseState();
  const sku1 = catalogItems[0]?.sku || 'SKU-EJEMPLO-001';
  const sku2 = catalogItems[1]?.sku || sku1;
  const owner1 =
    catalogItems[0]?.ownerAllocations[0]?.ownerId || invState.owners[0]?.id || 'OWN-0001';
  const owner2 = catalogItems[1]?.ownerAllocations[0]?.ownerId || owner1;
  const today = getBogotaDateString();
  return [
    'CampaignName,SKU,OwnerId,Channel,Date,Impressions,Clicks,Conversations,Purchases,SpendCOP,RevenueCOP',
    `"Campaña WhatsApp ${sku1}",${sku1},${owner1},whatsapp,${today},4200,145,18,2,18000,100000`,
    `"Campaña Instagram ${sku2}",${sku2},${owner2},instagram,${today},3100,88,9,0,14000,0`
  ].join('\n');
}

// ============================================================================
// 4. ATRIBUCIÓN MULTIPROPIETARIO DEL GASTO PUBLICITARIO (CON PROTECCIÓN DE
//    ACUERDOS Y AUTORIZACIÓN EXPLÍCITA DEL PROPIETARIO)
// ============================================================================

export function registerMultiOwnerAdSpendAllocation(input: {
  campaignId: string;
  allocationPolicyUsed: AdsOwnerAllocationPolicy;
  ownerDeductionAuthorized: boolean;
  actorName: string;
  notes?: string;
}): MetaAdsOwnerSpendAllocation {
  const state = getMetaAdsControlState();
  const cmp = state.campaigns.find((c) => c.id === input.campaignId);
  if (!cmp) {
    throw new Error('Campaña no encontrada.');
  }

  const totalSpend = state.metrics
    .filter((m) => m.campaignId === cmp.id)
    .reduce((s, m) => s + m.spendCop, 0);

  if (totalSpend <= 0) {
    throw new Error(
      'La campaña aún tiene $0 COP de gasto registrado. Registre o importe resultados antes de distribuir el gasto.'
    );
  }

  const finState = getFinancialAccountingState();
  const ownerAgreement = finState.agreements[cmp.targetOwnerId];
  const agreementStatus = ownerAgreement ? ownerAgreement.status : 'pending_configuration';

  let deductionStatus: MetaAdsOwnerSpendAllocation['deductionStatus'] =
    'pending_owner_authorization';
  let ownerAllocatedSpendCop = totalSpend;

  if (input.allocationPolicyUsed === 'store_absorbed') {
    deductionStatus = 'store_absorbed_no_deduction';
    ownerAllocatedSpendCop = 0;
  } else if (!input.ownerDeductionAuthorized) {
    // Regla: No descontar publicidad de un propietario sin autorización
    deductionStatus = 'pending_owner_authorization';
  } else if (agreementStatus !== 'active') {
    // Regla: Aplicar distribución solamente mediante acuerdos configurados
    deductionStatus = 'blocked_agreement_not_configured';
  } else {
    deductionStatus = 'authorized_and_applied';
  }

  const nowIso = new Date().toISOString();
  const nextIdx = state.ownerSpendAllocations.length + 1;

  const alloc: MetaAdsOwnerSpendAllocation = {
    id: `ADSALLOC-${Date.now()}-${nextIdx}`,
    allocationCode: `ATR-ADS-${String(nextIdx).padStart(4, '0')}`,
    campaignId: cmp.id,
    campaignCode: cmp.campaignCode,
    sku: cmp.promotedSku,
    ownerId: cmp.targetOwnerId,
    ownerName: cmp.targetOwnerName,
    agreementStatusSnapshot: agreementStatus,
    allocationPolicyUsed: input.allocationPolicyUsed,
    totalCampaignSpendCop: totalSpend,
    ownerAllocatedSpendCop,
    ownerDeductionAuthorized: input.ownerDeductionAuthorized,
    authorizedBy: input.ownerDeductionAuthorized ? input.actorName : null,
    authorizedAt: input.ownerDeductionAuthorized ? nowIso : null,
    deductionStatus,
    notes:
      input.notes?.trim() ||
      (deductionStatus === 'blocked_agreement_not_configured'
        ? `No se descontó al propietario ${cmp.targetOwnerId} porque su acuerdo está en "${agreementStatus}".`
        : deductionStatus === 'pending_owner_authorization'
          ? `Registrado sin descontar al propietario ${cmp.targetOwnerId} hasta contar con su autorización explícita.`
          : `Atribución publicitaria registrada bajo política ${input.allocationPolicyUsed}.`),
    createdAt: nowIso
  };

  cmp.ownerDeductionAuthorized = input.ownerDeductionAuthorized;
  if (input.ownerDeductionAuthorized) {
    cmp.ownerDeductionAuthorizedBy = input.actorName;
    cmp.ownerDeductionAuthorizedAt = nowIso;
  }

  state.ownerSpendAllocations.unshift(alloc);
  state.historyLog.unshift({
    id: `ADSHIST-${Date.now()}`,
    timestamp: nowIso,
    actor: input.actorName,
    action: 'OWNER_SPEND_ALLOCATION_RECORDED',
    dataSource: 'MANUAL_ENTRY',
    detail: `Asignación ${alloc.allocationCode} para ${cmp.targetOwnerId} (${cmp.promotedSku}): Estado "${deductionStatus}" • Monto: ${formatCOP(ownerAllocatedSpendCop)}.`
  });

  saveMetaAdsControlState(state);
  return alloc;
}

// ============================================================================
// 5. MOTOR DE CÁLCULO DE CPA, ROAS, CONTRIBUCIÓN Y RENTABILIDAD
// ============================================================================

export function calculateAllCampaignPerformances(): CampaignPerformanceSummary[] {
  const state = getMetaAdsControlState();

  return state.campaigns.map((campaign) => {
    const rows = state.metrics.filter((m) => m.campaignId === campaign.id);

    const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
    const totalReach = rows.reduce((s, r) => s + r.reach, 0);
    const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
    const totalSpendCop = rows.reduce((s, r) => s + r.spendCop, 0);
    const totalWhatsappConversations = rows.reduce(
      (s, r) => s + r.whatsappConversationsCount,
      0
    );
    const totalVerifiedPurchases = rows.reduce(
      (s, r) => s + r.verifiedPurchasesOrdersCount,
      0
    );
    const totalAttributedRevenueCop = rows.reduce(
      (s, r) => s + r.attributedRevenueCop,
      0
    );
    const totalAttributedCogsCop = rows.reduce(
      (s, r) => s + r.attributedCogsCop,
      0
    );

    const ctrPct =
      totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0;
    const cpcCop = totalClicks > 0 ? Math.round(totalSpendCop / totalClicks) : 0;

    const remainingBudgetCop = Math.max(0, campaign.manualBudgetCapCop - totalSpendCop);
    const budgetConsumedPct =
      campaign.manualBudgetCapCop > 0
        ? Number(((totalSpendCop / campaign.manualBudgetCapCop) * 100).toFixed(1))
        : 0;

    const costPerConversationCop =
      totalWhatsappConversations > 0
        ? Math.round(totalSpendCop / totalWhatsappConversations)
        : null;

    const conversationToPurchaseRatePct =
      totalWhatsappConversations > 0
        ? Number(((totalVerifiedPurchases / totalWhatsappConversations) * 100).toFixed(1))
        : 0;

    const cpaPerPurchaseCop =
      totalVerifiedPurchases > 0
        ? Math.round(totalSpendCop / totalVerifiedPurchases)
        : null;

    const grossProfitBeforeAdsCop = totalAttributedRevenueCop - totalAttributedCogsCop;
    const roasMultiplier =
      totalSpendCop > 0
        ? Number((totalAttributedRevenueCop / totalSpendCop).toFixed(2))
        : null;

    const netContributionAfterAdsCop = grossProfitBeforeAdsCop - totalSpendCop;
    const netProfitabilityPct =
      totalAttributedRevenueCop > 0
        ? Number(((netContributionAfterAdsCop / totalAttributedRevenueCop) * 100).toFixed(1))
        : null;

    const linkedOrderNumbers = Array.from(
      new Set(rows.flatMap((r) => r.linkedOrderNumbers))
    );
    const linkedLeadCodes = Array.from(
      new Set(rows.flatMap((r) => r.linkedLeadCodes))
    );
    const hasPendingCogs = rows.some(
      (r) => r.verifiedPurchasesOrdersCount > 0 && r.cogsStatus === 'PENDING_COST'
    );

    return {
      campaign,
      totalImpressions,
      totalReach,
      totalClicks,
      ctrPct,
      cpcCop,
      totalSpendCop,
      remainingBudgetCop,
      budgetConsumedPct,
      totalWhatsappConversations,
      costPerConversationCop,
      totalVerifiedPurchases,
      conversationToPurchaseRatePct,
      cpaPerPurchaseCop,
      totalAttributedRevenueCop,
      totalAttributedCogsCop,
      grossProfitBeforeAdsCop,
      roasMultiplier,
      netContributionAfterAdsCop,
      netProfitabilityPct,
      hasPendingCogs,
      linkedOrderNumbers,
      linkedLeadCodes
    };
  });
}

// ============================================================================
// 6. GENERADOR DE LAS SEIS (6) ALERTAS INTELIGENTES OBLIGATORIAS
//    1. Presupuesto agotado (BUDGET_EXHAUSTED)
//    2. CPA superior al objetivo (CPA_ABOVE_TARGET)
//    3. Producto sin stock (PROMOTED_SKU_OUT_OF_STOCK)
//    4. Precio desactualizado (PRICE_OUTDATED_OR_MISMATCH)
//    5. Conversaciones sin ventas (CONVERSATIONS_WITHOUT_SALES)
//    6. Resultado rentable que merece evaluación (PROFITABLE_RESULT_WORTH_EVALUATING)
// ============================================================================

export function evaluateMetaAdsSmartAlerts(): SmartAdsAlertItem[] {
  const summaries = calculateAllCampaignPerformances();
  const catalogItems = getRealCatalogMerchItems();
  const alerts: SmartAdsAlertItem[] = [];

  for (const perf of summaries) {
    const cmp = perf.campaign;
    const catItem = catalogItems.find((i) => i.sku === cmp.promotedSku);
    const ownerAlloc = catItem?.ownerAllocations.find(
      (a) => a.ownerId === cmp.targetOwnerId
    );
    const availableStock = ownerAlloc ? ownerAlloc.qtyAvailable : 0;

    // 1. Alerta: Presupuesto agotado
    if (perf.totalSpendCop >= cmp.manualBudgetCapCop && cmp.manualBudgetCapCop > 0) {
      alerts.push({
        id: `ALR-BUD-${cmp.id}`,
        alertType: 'BUDGET_EXHAUSTED',
        severity: 'critical',
        campaignCode: cmp.campaignCode,
        campaignName: cmp.campaignName,
        sku: cmp.promotedSku,
        ownerId: cmp.targetOwnerId,
        title: '1. Presupuesto Manual Agotado (100%)',
        message: `La campaña ${cmp.campaignCode} consumió ${formatCOP(perf.totalSpendCop)} de su tope autorizado (${formatCOP(cmp.manualBudgetCapCop)}).`,
        recommendedHumanAction:
          'Revisar resultados y decidir manualmente si se pausa la campaña o se autoriza un nuevo tope (el sistema jamás aumenta presupuestos automáticamente).'
      });
    }

    // 2. Alerta: CPA superior al objetivo
    if (
      perf.cpaPerPurchaseCop !== null &&
      perf.cpaPerPurchaseCop > cmp.targetCpaCop
    ) {
      alerts.push({
        id: `ALR-CPA-${cmp.id}`,
        alertType: 'CPA_ABOVE_TARGET',
        severity: 'warning',
        campaignCode: cmp.campaignCode,
        campaignName: cmp.campaignName,
        sku: cmp.promotedSku,
        ownerId: cmp.targetOwnerId,
        title: '2. CPA por Compra Superior al Objetivo',
        message: `El CPA real (${formatCOP(perf.cpaPerPurchaseCop)}) supera el CPA objetivo configurado (${formatCOP(cmp.targetCpaCop)}).`,
        recommendedHumanAction:
          'Optimizar creatividad o segmentación en Ads Manager, o evaluar pausa aprobada.'
      });
    }

    // 3. Alerta: Producto sin stock
    if (availableStock <= 0 && cmp.status === 'approved_manual_launch') {
      alerts.push({
        id: `ALR-STK-${cmp.id}`,
        alertType: 'PROMOTED_SKU_OUT_OF_STOCK',
        severity: 'critical',
        campaignCode: cmp.campaignCode,
        campaignName: cmp.campaignName,
        sku: cmp.promotedSku,
        ownerId: cmp.targetOwnerId,
        title: '3. Producto Promovido Sin Stock Disponible (0 uds)',
        message: `El SKU ${cmp.promotedSku} (${cmp.targetOwnerId}) tiene 0 unidades disponibles en inventario mientras la campaña figura activa.`,
        recommendedHumanAction:
          'Aprobar la pausa inmediata de la campaña para no desperdiciar presupuesto publicitario en un artículo agotado.'
      });
    }

    // 4. Alerta: Precio desactualizado
    const currentCatalogPrice = catItem?.currentNormalPriceCop || 0;
    if (
      currentCatalogPrice <= 0 ||
      (cmp.advertisedPriceSnapshotCop > 0 &&
        cmp.advertisedPriceSnapshotCop !== currentCatalogPrice)
    ) {
      alerts.push({
        id: `ALR-PRC-${cmp.id}`,
        alertType: 'PRICE_OUTDATED_OR_MISMATCH',
        severity: 'warning',
        campaignCode: cmp.campaignCode,
        campaignName: cmp.campaignName,
        sku: cmp.promotedSku,
        ownerId: cmp.targetOwnerId,
        title: '4. Precio Anunciado Desactualizado frente a Finanzas',
        message: `El precio en la campaña (${formatCOP(cmp.advertisedPriceSnapshotCop)}) no coincide con el precio vigente aprobado en Finanzas (${formatCOP(currentCatalogPrice)}).`,
        recommendedHumanAction:
          'Actualizar la pieza creativa en Creative Studio para reflejar el precio oficial vigente.'
      });
    }

    // 5. Alerta: Conversaciones sin ventas
    if (perf.totalWhatsappConversations >= 5 && perf.totalVerifiedPurchases === 0) {
      alerts.push({
        id: `ALR-CNV-${cmp.id}`,
        alertType: 'CONVERSATIONS_WITHOUT_SALES',
        severity: 'warning',
        campaignCode: cmp.campaignCode,
        campaignName: cmp.campaignName,
        sku: cmp.promotedSku,
        ownerId: cmp.targetOwnerId,
        title: '5. Conversaciones Iniciadas Sin Ventas Cerradas',
        message: `La campaña generó ${perf.totalWhatsappConversations} conversaciones de WhatsApp pero 0 compras reales verificadas.`,
        recommendedHumanAction:
          'Revisar tiempos de respuesta y argumentos de cierre en WhatsApp Sales Center (recuerde: las conversaciones no son compras).'
      });
    }

    // 6. Alerta: Resultado rentable que merece evaluación
    if (
      !perf.hasPendingCogs &&
      perf.roasMultiplier !== null &&
      perf.roasMultiplier >= 2.5 &&
      perf.netContributionAfterAdsCop > 0 &&
      availableStock > 0
    ) {
      alerts.push({
        id: `ALR-PRF-${cmp.id}`,
        alertType: 'PROFITABLE_RESULT_WORTH_EVALUATING',
        severity: 'opportunity',
        campaignCode: cmp.campaignCode,
        campaignName: cmp.campaignName,
        sku: cmp.promotedSku,
        ownerId: cmp.targetOwnerId,
        title: '6. Resultado Rentable que Merece Evaluación Humana',
        message: `ROAS de ${perf.roasMultiplier}x con Contribución Neta positiva de ${formatCOP(perf.netContributionAfterAdsCop)} y ${availableStock} ud(s) en stock.`,
        recommendedHumanAction:
          'Evaluar con el propietario si desea mantener la pauta activa (el sistema no incrementa presupuestos por su cuenta).'
      });
    }
  }

  return alerts;
}
