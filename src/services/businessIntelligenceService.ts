import {
  getInventoryPurchaseState,
  type LotOwnerAllocationRecord
} from './inventoryPurchaseService';
import {
  getFinancialAccountingState,
  buildOwnerAccountStatements,
  computeSaleCommissionAndOwnerProfit,
  type FinancialExpenseRecord,
  type OwnerSettlementRecord
} from './financialAccountingService';
import { escapeHtml } from '../utils/formatters';
import {
  getSalesOrdersCrmState,
  calculateOrderProfitability,
  type SalesOrderRecord,
  type SalesOrderStatus,
  type CrmLeadRecord
} from './salesOrdersCrmService';
import { getSocialMarketplaceState } from './socialMarketplaceService';
import { getWhatsAppSalesCenterState } from './whatsappSalesCenterService';
import {
  getMetaAdsControlState,
  calculateAllCampaignPerformances,
  type CampaignPerformanceSummary
} from './metaAdsControlService';

// ============================================================================
// TIPOS E INTERFACES DE BUSINESS INTELLIGENCE (REAL TWS)
// ============================================================================

export type BiPeriodPreset = 'ALL' | '7D' | '30D' | '90D' | 'THIS_MONTH' | 'CUSTOM';

export type BiMetricKind = 'REAL_CONCILIADA' | 'ESTIMACION_NO_REALIZADA';

export interface BiFilterCriteria {
  periodPreset: BiPeriodPreset;
  dateFrom: string; // YYYY-MM-DD o ''
  dateTo: string; // YYYY-MM-DD o ''
  productQuery: string;
  sku: string; // 'ALL' o SKU específico
  ownerId: string; // 'ALL' o ownerId específico
  category: string; // 'ALL' o categoría específica
  channel: string; // 'ALL' o canal específico
  orderStatus: 'ALL' | SalesOrderStatus;
  campaignId: string; // 'ALL' o campaignId específico
}

export interface BiIndicatorAuditMeta {
  indicatorKey: string;
  label: string;
  valueFormatted: string;
  numericValue: number;
  metricKind: BiMetricKind;
  dataOrigin: string;
  calculationFormula: string;
  underlyingRecordCount: number;
  evaluatedAt: string;
  appliedFilterSummary: string;
}

export interface BiGeneralDashboardSummary {
  // Ventas y Pedidos
  realizedOrdersCount: number;
  unconfirmedPipelineOrdersCount: number;
  cancelledOrdersCount: number;
  returnedOrdersCount: number;
  grossUnitsSold: number;
  returnedUnits: number;
  netUnitsSold: number;

  // Ingresos, Costos, Gastos, Contribución
  grossSalesCop: number;
  discountsCop: number;
  returnsCop: number;
  netMerchandiseRevenueCop: number; // Ingresos realizados netos (solo pedidos confirmados+)
  unconfirmedPipelineRevenueCop: number; // Estimación no realizada (draft/reserved)
  collectedCashCop: number; // Pagos confirmados recibidos
  pendingReceivablesCop: number;
  cogsCop: number; // Costo de mercancía vendida (neto de devoluciones)
  shippingChargedCop: number;
  shippingRealCostCop: number;
  approvedDirectExpensesCop: number;
  approvedSharedExpensesCop: number;
  totalApprovedExpensesCop: number;
  storeCommissionsCop: number;
  contributionMarginCop: number; // Ingresos netos - CMV - Gastos directos/empaque/envío neto
  netOperatingProfitCop: number; // Contribución - Gastos compartidos - Publicidad

  // Inventario
  inventoryPhysicalUnits: number;
  inventoryGoodUnits: number;
  inventoryAvailableUnits: number;
  inventoryReservedUnits: number;
  inventoryPendingInspectionUnits: number;
  inventoryDefectiveUnits: number;
  inventoryValuationCop: number;

  // Publicaciones, Prospectos, Publicidad, Liquidaciones
  totalPublicationsCount: number;
  publishedLiveCount: number;
  totalLeadsCount: number;
  convertedLeadsCount: number;
  whatsappConsultationsCount: number;
  adSpendCop: number;
  adAttributedRevenueCop: number;
  adRoasMultiplier: number | null;
  settlementsPaidCop: number;
  settlementsPendingCop: number;
  settlementsTotalCount: number;
}

export interface BiOwnerComparisonRow {
  ownerId: string;
  ownerName: string;
  agreementStatus: 'active' | 'pending_configuration' | 'superseded' | 'cancelled';
  physicalUnits: number;
  availableUnits: number;
  reservedUnits: number;
  defectiveOrPendingUnits: number;
  inventoryValuationCop: number;
  grossUnitsSold: number;
  returnedUnits: number;
  netUnitsSold: number;
  grossSalesCop: number;
  discountsAndReturnsCop: number;
  netSalesCop: number;
  cogsSoldCop: number;
  directExpensesCop: number;
  sharedExpensesCop: number;
  attributableAdSpendCop: number;
  totalAssignedExpensesCop: number;
  storeCommissionCop: number | null;
  attributableProfitCop: number;
  settlementsPaidCop: number;
  settlementsApprovedPendingCop: number;
  previousBalanceCop: number;
  finalConciliatedBalanceCop: number;
  dataOrigin: string;
}

export interface BiSkuCommercialRow {
  sku: string;
  productName: string;
  category: string;
  realizedOrdersCount: number;
  netUnitsSold: number;
  returnedUnits: number;
  grossSalesCop: number;
  netRevenueCop: number;
  cogsCop: number;
  grossProfitCop: number;
  grossMarginPct: number;
  availableStockUnits: number;
  dataOrigin: string;
}

export interface BiChannelPerformanceRow {
  channelId: string;
  channelLabel: string;
  publicationsCount: number;
  consultationsCount: number;
  leadsCount: number;
  realizedOrdersCount: number;
  unconfirmedOrdersCount: number;
  netRevenueCop: number;
  cogsCop: number;
  adSpendCop: number;
  conversionRatePct: number;
  dataOrigin: string;
}

export interface BiTimeSeriesPoint {
  bucketKey: string;
  label: string;
  grossSalesCop: number;
  netRevenueCop: number;
  cogsCop: number;
  expensesCop: number;
  profitCop: number;
  ordersCount: number;
}

export interface BiOrderStatusPoint {
  status: SalesOrderStatus;
  statusLabel: string;
  count: number;
  amountCop: number;
  isRealized: boolean;
}

export interface BiUnderlyingContrastItem {
  recordType:
    | 'ORDER'
    | 'INVENTORY_LOT'
    | 'EXPENSE'
    | 'SETTLEMENT'
    | 'CRM_LEAD'
    | 'PUBLICATION'
    | 'META_ADS_CAMPAIGN';
  recordCode: string;
  date: string;
  ownerLabel: string;
  skuOrScope: string;
  statusLabel: string;
  amountCop: number;
  units: number;
  originTable: string;
  metricKind: BiMetricKind;
  detailNote: string;
}

export interface BiFilterCatalogOptions {
  skus: Array<{ sku: string; label: string }>;
  owners: Array<{ ownerId: string; ownerName: string }>;
  categories: string[];
  channels: Array<{ id: string; label: string }>;
  campaigns: Array<{ id: string; label: string }>;
}

export interface BiReportSnapshot {
  generatedAt: string;
  appliedCriteria: BiFilterCriteria;
  appliedFilterSummary: string;
  filterOptions: BiFilterCatalogOptions;
  general: BiGeneralDashboardSummary;
  ownerRows: BiOwnerComparisonRow[];
  skuRows: BiSkuCommercialRow[];
  channelRows: BiChannelPerformanceRow[];
  campaignPerformances: CampaignPerformanceSummary[];
  charts: {
    dailySales: BiTimeSeriesPoint[];
    weeklySales: BiTimeSeriesPoint[];
    monthlySales: BiTimeSeriesPoint[];
    salesBySku: Array<{ sku: string; label: string; netRevenueCop: number; profitCop: number; units: number }>;
    salesByOwner: Array<{ ownerId: string; ownerName: string; netSalesCop: number; cogsCop: number; profitCop: number }>;
    costsBreakdown: Array<{ category: string; amountCop: number }>;
    profitEvolution: BiTimeSeriesPoint[];
    inventoryByOwner: Array<{
      ownerName: string;
      available: number;
      reserved: number;
      defectiveOrPending: number;
    }>;
    orderStatuses: BiOrderStatusPoint[];
    channelPerformance: BiChannelPerformanceRow[];
  };
  auditIndicators: BiIndicatorAuditMeta[];
  underlyingRecords: BiUnderlyingContrastItem[];
}

// ============================================================================
// CONSTANTES DE REGLAS DE NEGOCIO BI
// ============================================================================

/**
 * REGLA ESTRICTA:
 * Solo pedidos confirmados o posteriores cuentan como ingresos realizados.
 * 'draft', 'reserved' y 'cancelled' NUNCA se suman a ingresos realizados.
 */
export const REALIZED_ORDER_STATUSES: ReadonlySet<SalesOrderStatus> = new Set([
  'confirmed',
  'preparing',
  'dispatched',
  'delivered',
  'partially_returned',
  'returned'
]);

const ORDER_STATUS_LABELS: Record<SalesOrderStatus, string> = {
  draft: 'Borrador (No Confirmado)',
  reserved: 'Reservado (No Confirmado)',
  confirmed: 'Confirmado',
  preparing: 'En Preparación',
  dispatched: 'Despachado',
  delivered: 'Entregado',
  partially_returned: 'Devuelto Parcial',
  returned: 'Devuelto Total',
  cancelled: 'Cancelado'
};

const CHANNEL_LABELS: Record<string, string> = {
  store_direct: 'Tienda Directa',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  marketplace: 'Marketplace',
  web: 'Web'
};

export function createDefaultBiFilters(ownerScope = 'ALL'): BiFilterCriteria {
  return {
    periodPreset: 'ALL',
    dateFrom: '',
    dateTo: '',
    productQuery: '',
    sku: 'ALL',
    ownerId: ownerScope || 'ALL',
    category: 'ALL',
    channel: 'ALL',
    orderStatus: 'ALL',
    campaignId: 'ALL'
  };
}

// ============================================================================
// UTILIDADES DE FECHA Y FILTRADO DETERMINISTA
// ============================================================================

function resolveDateRange(criteria: BiFilterCriteria): { fromMs: number | null; toMs: number | null } {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  if (criteria.periodPreset === 'ALL') {
    return { fromMs: null, toMs: null };
  }
  if (criteria.periodPreset === '7D') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0).getTime();
    return { fromMs: start, toMs: endOfToday };
  }
  if (criteria.periodPreset === '30D') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0).getTime();
    return { fromMs: start, toMs: endOfToday };
  }
  if (criteria.periodPreset === '90D') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89, 0, 0, 0, 0).getTime();
    return { fromMs: start, toMs: endOfToday };
  }
  if (criteria.periodPreset === 'THIS_MONTH') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
    return { fromMs: start, toMs: endOfToday };
  }

  // CUSTOM
  const fromMs = criteria.dateFrom ? new Date(`${criteria.dateFrom}T00:00:00`).getTime() : null;
  const toMs = criteria.dateTo ? new Date(`${criteria.dateTo}T23:59:59.999`).getTime() : null;
  return {
    fromMs: Number.isFinite(fromMs) ? fromMs : null,
    toMs: Number.isFinite(toMs) ? toMs : null
  };
}

function parseDateInputSafe(isoOrDate: string): number {
  const trimmed = isoOrDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T12:00:00`).getTime();
  }
  return new Date(trimmed).getTime();
}

function isDateWithinRange(isoOrDate: string | null | undefined, fromMs: number | null, toMs: number | null): boolean {
  if (!fromMs && !toMs) return true;
  if (!isoOrDate) return false;
  const parsed = parseDateInputSafe(isoOrDate);
  if (!Number.isFinite(parsed)) return true;
  if (fromMs !== null && parsed < fromMs) return false;
  if (toMs !== null && parsed > toMs) return false;
  return true;
}

function getWeekBucket(dateStr: string): string {
  const parsedMs = parseDateInputSafe(dateStr);
  if (!Number.isFinite(parsedMs)) return 'Sin Fecha';
  const d = new Date(parsedMs);
  const temp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${temp.getUTCFullYear()}-S${String(weekNo).padStart(2, '0')}`;
}

function formatCopSimple(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(Math.round(amount || 0));
}

function buildFilterSummaryText(criteria: BiFilterCriteria): string {
  const parts: string[] = [`Periodo=${criteria.periodPreset}`];
  if (criteria.periodPreset === 'CUSTOM') {
    parts.push(`Desde=${criteria.dateFrom || 'inicio'}`, `Hasta=${criteria.dateTo || 'hoy'}`);
  }
  if (criteria.ownerId !== 'ALL') parts.push(`Propietario=${criteria.ownerId}`);
  if (criteria.sku !== 'ALL') parts.push(`SKU=${criteria.sku}`);
  if (criteria.category !== 'ALL') parts.push(`Categoría=${criteria.category}`);
  if (criteria.channel !== 'ALL') parts.push(`Canal=${criteria.channel}`);
  if (criteria.orderStatus !== 'ALL') parts.push(`Estado=${criteria.orderStatus}`);
  if (criteria.campaignId !== 'ALL') parts.push(`Campaña=${criteria.campaignId}`);
  if (criteria.productQuery.trim()) parts.push(`Búsqueda="${criteria.productQuery.trim()}"`);
  return parts.join(' | ');
}

// ============================================================================
// MOTOR PRINCIPAL DE CONSOLIDACIÓN Y CONTRASTE BI
// ============================================================================

export function buildBusinessIntelligenceReport(criteria: BiFilterCriteria): BiReportSnapshot {
  const evaluatedAt = new Date().toISOString();
  const { fromMs, toMs } = resolveDateRange(criteria);
  const queryLower = criteria.productQuery.trim().toLowerCase();

  const invState = getInventoryPurchaseState();
  const finState = getFinancialAccountingState();
  const salesState = getSalesOrdersCrmState();
  const socialState = getSocialMarketplaceState();
  const waState = getWhatsAppSalesCenterState();
  const adsState = getMetaAdsControlState();
  const allCampaignPerformances = calculateAllCampaignPerformances();
  const baseOwnerStatements = buildOwnerAccountStatements(finState);

  // Deduplicar colecciones fuente por ID para impedir cualquier suma duplicada
  const uniqueOrdersMap = new Map<string, SalesOrderRecord>();
  salesState.orders.forEach((o) => {
    if (!uniqueOrdersMap.has(o.id)) uniqueOrdersMap.set(o.id, o);
  });
  const allOrders = Array.from(uniqueOrdersMap.values());

  const uniqueAllocationsMap = new Map<string, LotOwnerAllocationRecord>();
  invState.allocations.forEach((a) => {
    if (!uniqueAllocationsMap.has(a.id)) uniqueAllocationsMap.set(a.id, a);
  });
  const allAllocations = Array.from(uniqueAllocationsMap.values());

  const uniqueExpensesMap = new Map<string, FinancialExpenseRecord>();
  finState.expenses.forEach((e) => {
    if (!uniqueExpensesMap.has(e.id)) uniqueExpensesMap.set(e.id, e);
  });
  const allExpenses = Array.from(uniqueExpensesMap.values());

  const uniqueSettlementsMap = new Map<string, OwnerSettlementRecord>();
  finState.settlements.forEach((s) => {
    if (!uniqueSettlementsMap.has(s.id)) uniqueSettlementsMap.set(s.id, s);
  });
  const allSettlements = Array.from(uniqueSettlementsMap.values());

  const uniqueLeadsMap = new Map<string, CrmLeadRecord>();
  salesState.leads.forEach((l) => {
    if (!uniqueLeadsMap.has(l.id)) uniqueLeadsMap.set(l.id, l);
  });
  const allLeads = Array.from(uniqueLeadsMap.values());

  // Opciones disponibles para selectores de filtro
  const filterOptions: BiFilterCatalogOptions = {
    skus: Object.values(invState.catalog).map((item) => ({
      sku: item.sku,
      label: `${item.sku} — ${item.productName}`
    })),
    owners: invState.owners.map((o) => ({ ownerId: o.id, ownerName: o.fullName })),
    categories: Array.from(
      new Set(Object.values(invState.catalog).map((item) => item.category).filter(Boolean))
    ).sort(),
    channels: Object.entries(CHANNEL_LABELS).map(([id, label]) => ({ id, label })),
    campaigns: adsState.campaigns.map((c) => ({
      id: c.id,
      label: `${c.campaignCode} — ${c.campaignName}`
    }))
  };

  // Campaña seleccionada (si aplica filtro de campaña, restringe SKUs/órdenes vinculadas)
  const selectedCampaignPerf =
    criteria.campaignId !== 'ALL'
      ? allCampaignPerformances.find((cp) => cp.campaign.id === criteria.campaignId) || null
      : null;
  const campaignOrderNumbersSet = selectedCampaignPerf
    ? new Set(selectedCampaignPerf.linkedOrderNumbers)
    : null;
  const campaignSkusSet = selectedCampaignPerf && selectedCampaignPerf.campaign.promotedSku
    ? new Set([selectedCampaignPerf.campaign.promotedSku])
    : null;

  const matchesCatalogFilter = (sku: string, productName?: string): boolean => {
    const catItem = invState.catalog[sku];
    if (criteria.sku !== 'ALL' && sku !== criteria.sku) return false;
    if (criteria.category !== 'ALL' && (catItem?.category || '') !== criteria.category) return false;
    if (campaignSkusSet && campaignSkusSet.size > 0 && !campaignSkusSet.has(sku)) return false;
    if (queryLower) {
      const hay = `${sku} ${productName || catItem?.productName || ''} ${catItem?.category || ''}`.toLowerCase();
      if (!hay.includes(queryLower)) return false;
    }
    return true;
  };

  // --------------------------------------------------------------------------
  // 1. FILTRAR ÓRDENES Y ASIGNACIONES DE VENTA (SIN DUPLICAR)
  // --------------------------------------------------------------------------
  const underlyingRecords: BiUnderlyingContrastItem[] = [];

  const filteredOrders = allOrders.filter((order) => {
    if (!isDateWithinRange(order.orderDate || order.createdAt, fromMs, toMs)) return false;
    if (criteria.channel !== 'ALL' && order.salesChannel !== criteria.channel) return false;
    if (criteria.orderStatus !== 'ALL' && order.status !== criteria.orderStatus) return false;
    if (campaignOrderNumbersSet && !campaignOrderNumbersSet.has(order.orderNumber)) return false;

    const matchingLines = order.lines.filter((line) => {
      if (!matchesCatalogFilter(line.sku, line.productName)) return false;
      if (criteria.ownerId !== 'ALL') {
        const hasOwner = line.allocations.some((al) => al.ownerId === criteria.ownerId);
        if (!hasOwner) return false;
      }
      return true;
    });
    return matchingLines.length > 0;
  });

  // Contadores y acumuladores
  let realizedOrdersCount = 0;
  let unconfirmedPipelineOrdersCount = 0;
  let cancelledOrdersCount = 0;
  let returnedOrdersCount = 0;
  let grossUnitsSold = 0;
  let returnedUnits = 0;
  let grossSalesCop = 0;
  let discountsCop = 0;
  let returnsCop = 0;
  let netMerchandiseRevenueCop = 0;
  let unconfirmedPipelineRevenueCop = 0;
  let collectedCashCop = 0;
  let pendingReceivablesCop = 0;
  let cogsCop = 0;
  let shippingChargedCop = 0;
  let shippingRealCostCop = 0;

  const statusBuckets = new Map<SalesOrderStatus, { count: number; amountCop: number }>();
  const skuAgg = new Map<string, BiSkuCommercialRow>();
  const dailyMap = new Map<string, BiTimeSeriesPoint>();
  const weeklyMap = new Map<string, BiTimeSeriesPoint>();
  const monthlyMap = new Map<string, BiTimeSeriesPoint>();

  // Acumulador por propietario basado exactamente en las líneas filtradas
  const ownerOrderAgg = new Map<
    string,
    {
      grossUnits: number;
      returnedUnits: number;
      grossSales: number;
      discountsAndReturns: number;
      netSales: number;
      cogs: number;
    }
  >();

  // Mapa de pagos confirmados por pedido (deduplicados)
  const confirmedPaymentsByOrderId = new Map<string, number>();
  const seenPaymentIds = new Set<string>();
  salesState.payments.forEach((p) => {
    if (seenPaymentIds.has(p.id)) return;
    seenPaymentIds.add(p.id);
    if (p.status === 'confirmed') {
      confirmedPaymentsByOrderId.set(
        p.salesOrderId,
        (confirmedPaymentsByOrderId.get(p.salesOrderId) || 0) + p.amountCop
      );
    }
  });

  filteredOrders.forEach((order) => {
    const isRealized = REALIZED_ORDER_STATUSES.has(order.status);
    const prof = calculateOrderProfitability(order.id, salesState);

    // Calcular porción filtrada si hay filtro de propietario / SKU / categoría
    let orderGrossFiltered = 0;
    let orderDiscountFiltered = 0;
    let orderReturnFiltered = 0;
    let orderNetRevenueFiltered = 0;
    let orderCogsFiltered = 0;
    let orderGrossUnitsFiltered = 0;
    let orderReturnedUnitsFiltered = 0;

    order.lines.forEach((line) => {
      if (!matchesCatalogFilter(line.sku, line.productName)) return;
      const catItem = invState.catalog[line.sku];
      const relevantAllocs =
        criteria.ownerId === 'ALL'
          ? line.allocations
          : line.allocations.filter((al) => al.ownerId === criteria.ownerId);

      if (relevantAllocs.length === 0) return;

      let lineNetRev = 0;
      let lineGross = 0;
      let lineCogs = 0;
      let lineNetUnits = 0;
      let lineReturnedUnits = 0;

      relevantAllocs.forEach((al) => {
        const netQty = Math.max(0, al.qtyAllocated - al.qtyReturned);
        const grossAmt = al.qtyAllocated * al.unitSalePriceCop;
        const discAmt = al.discountAllocatedCop;
        const retAmt = al.returnAmountCop;
        const netAmt = Math.max(0, grossAmt - discAmt - retAmt);
        const cogsAmt = netQty * al.unitCostCop;

        orderGrossUnitsFiltered += al.qtyAllocated;
        orderReturnedUnitsFiltered += al.qtyReturned;
        orderGrossFiltered += grossAmt;
        orderDiscountFiltered += discAmt;
        orderReturnFiltered += retAmt;
        orderNetRevenueFiltered += netAmt;
        orderCogsFiltered += cogsAmt;

        lineGross += grossAmt;
        lineNetRev += netAmt;
        lineCogs += cogsAmt;
        lineNetUnits += netQty;
        lineReturnedUnits += al.qtyReturned;

        if (isRealized) {
          const prevOwner = ownerOrderAgg.get(al.ownerId) || {
            grossUnits: 0,
            returnedUnits: 0,
            grossSales: 0,
            discountsAndReturns: 0,
            netSales: 0,
            cogs: 0
          };
          prevOwner.grossUnits += al.qtyAllocated;
          prevOwner.returnedUnits += al.qtyReturned;
          prevOwner.grossSales += grossAmt;
          prevOwner.discountsAndReturns += discAmt + retAmt;
          prevOwner.netSales += netAmt;
          prevOwner.cogs += cogsAmt;
          ownerOrderAgg.set(al.ownerId, prevOwner);
        }
      });

      if (isRealized) {
        const prevSku = skuAgg.get(line.sku) || {
          sku: line.sku,
          productName: line.productName || catItem?.productName || line.sku,
          category: catItem?.category || 'Sin categoría',
          realizedOrdersCount: 0,
          netUnitsSold: 0,
          returnedUnits: 0,
          grossSalesCop: 0,
          netRevenueCop: 0,
          cogsCop: 0,
          grossProfitCop: 0,
          grossMarginPct: 0,
          availableStockUnits: 0,
          dataOrigin: 'sales_orders + sales_item_allocations'
        };
        prevSku.realizedOrdersCount += 1;
        prevSku.netUnitsSold += lineNetUnits;
        prevSku.returnedUnits += lineReturnedUnits;
        prevSku.grossSalesCop += lineGross;
        prevSku.netRevenueCop += lineNetRev;
        prevSku.cogsCop += lineCogs;
        prevSku.grossProfitCop = prevSku.netRevenueCop - prevSku.cogsCop;
        prevSku.grossMarginPct =
          prevSku.netRevenueCop > 0
            ? Number(((prevSku.grossProfitCop / prevSku.netRevenueCop) * 100).toFixed(2))
            : 0;
        skuAgg.set(line.sku, prevSku);
      }
    });

    const stPrev = statusBuckets.get(order.status) || { count: 0, amountCop: 0 };
    stPrev.count += 1;
    stPrev.amountCop += orderNetRevenueFiltered;
    statusBuckets.set(order.status, stPrev);

    if (order.status === 'cancelled') {
      cancelledOrdersCount += 1;
    } else if (!isRealized) {
      // draft o reserved -> Pipeline no realizado (ESTIMACIÓN)
      unconfirmedPipelineOrdersCount += 1;
      unconfirmedPipelineRevenueCop += orderNetRevenueFiltered;
    } else {
      // Pedido realizado (confirmado o posterior)
      realizedOrdersCount += 1;
      if (order.status === 'returned' || order.status === 'partially_returned') {
        returnedOrdersCount += 1;
      }

      grossUnitsSold += orderGrossUnitsFiltered;
      returnedUnits += orderReturnedUnitsFiltered;
      grossSalesCop += orderGrossFiltered;
      discountsCop += orderDiscountFiltered;
      returnsCop += orderReturnFiltered;
      netMerchandiseRevenueCop += orderNetRevenueFiltered;
      cogsCop += orderCogsFiltered;

      // Prorrateo proporcional de envío y recaudo si hay filtro parcial por propietario/SKU
      const orderRatio =
        prof.netMerchandiseRevenueCop > 0
          ? Math.min(1, orderNetRevenueFiltered / prof.netMerchandiseRevenueCop)
          : 1;
      shippingChargedCop += Math.round(order.shippingChargedCop * orderRatio);
      shippingRealCostCop += Math.round(order.shippingRealCostCop * orderRatio);

      const paidForOrder = Math.min(
        orderNetRevenueFiltered + Math.round(order.shippingChargedCop * orderRatio),
        Math.round((confirmedPaymentsByOrderId.get(order.id) || 0) * orderRatio)
      );
      collectedCashCop += paidForOrder;

      // Series de tiempo (diaria, semanal, mensual)
      const dayKey = (order.orderDate || order.createdAt || '').slice(0, 10) || 'Sin Fecha';
      const monthKey = dayKey.slice(0, 7);
      const weekKey = getWeekBucket(dayKey);

      const addToSeries = (map: Map<string, BiTimeSeriesPoint>, key: string) => {
        const pt = map.get(key) || {
          bucketKey: key,
          label: key,
          grossSalesCop: 0,
          netRevenueCop: 0,
          cogsCop: 0,
          expensesCop: 0,
          profitCop: 0,
          ordersCount: 0
        };
        pt.grossSalesCop += orderGrossFiltered;
        pt.netRevenueCop += orderNetRevenueFiltered;
        pt.cogsCop += orderCogsFiltered;
        pt.profitCop += orderNetRevenueFiltered - orderCogsFiltered;
        pt.ordersCount += 1;
        map.set(key, pt);
      };

      addToSeries(dailyMap, dayKey);
      addToSeries(weeklyMap, weekKey);
      addToSeries(monthlyMap, monthKey);
    }

    underlyingRecords.push({
      recordType: 'ORDER',
      recordCode: order.orderNumber,
      date: (order.orderDate || order.createdAt).slice(0, 10),
      ownerLabel: Array.from(
        new Set(order.lines.flatMap((l) => l.allocations.map((a) => a.ownerName)))
      ).join(', '),
      skuOrScope: order.lines.map((l) => l.sku).join(', '),
      statusLabel: ORDER_STATUS_LABELS[order.status],
      amountCop: orderNetRevenueFiltered,
      units: Math.max(0, orderGrossUnitsFiltered - orderReturnedUnitsFiltered),
      originTable: 'sales_orders + sales_item_allocations',
      metricKind: isRealized ? 'REAL_CONCILIADA' : 'ESTIMACION_NO_REALIZADA',
      detailNote: isRealized
        ? `Canal: ${CHANNEL_LABELS[order.salesChannel] || order.salesChannel} | CMV: ${formatCopSimple(orderCogsFiltered)}`
        : 'Excluido de ingresos realizados por no estar confirmado.'
    });
  });

  const netUnitsSold = Math.max(0, grossUnitsSold - returnedUnits);
  pendingReceivablesCop = Math.max(0, netMerchandiseRevenueCop + shippingChargedCop - collectedCashCop);

  // --------------------------------------------------------------------------
  // 2. INVENTARIO ACTUAL POR LOTE Y PROPIETARIO
  // --------------------------------------------------------------------------
  const filteredAllocations = allAllocations.filter((al) => {
    if (criteria.ownerId !== 'ALL' && al.ownerId !== criteria.ownerId) return false;
    if (!matchesCatalogFilter(al.sku, al.productName)) return false;
    return true;
  });

  let inventoryPhysicalUnits = 0;
  let inventoryGoodUnits = 0;
  let inventoryAvailableUnits = 0;
  let inventoryReservedUnits = 0;
  let inventoryPendingInspectionUnits = 0;
  let inventoryDefectiveUnits = 0;
  let inventoryValuationCop = 0;

  const ownerInvAgg = new Map<
    string,
    { physical: number; available: number; reserved: number; defectiveOrPending: number; valuation: number }
  >();
  const skuAvailableStockMap = new Map<string, number>();

  filteredAllocations.forEach((al) => {
    inventoryPhysicalUnits += al.qtyPhysical;
    inventoryGoodUnits += al.qtyGood;
    inventoryAvailableUnits += al.qtyAvailable;
    inventoryReservedUnits += al.qtyReserved;
    inventoryPendingInspectionUnits += al.qtyPendingInspection;
    inventoryDefectiveUnits += al.qtyDefective;
    const lotVal = (al.effectiveUnitCostCop ?? 0) * al.qtyPhysical;
    inventoryValuationCop += lotVal;

    const prevInv = ownerInvAgg.get(al.ownerId) || {
      physical: 0,
      available: 0,
      reserved: 0,
      defectiveOrPending: 0,
      valuation: 0
    };
    prevInv.physical += al.qtyPhysical;
    prevInv.available += al.qtyAvailable;
    prevInv.reserved += al.qtyReserved;
    prevInv.defectiveOrPending += al.qtyDefective + al.qtyPendingInspection;
    prevInv.valuation += lotVal;
    ownerInvAgg.set(al.ownerId, prevInv);

    skuAvailableStockMap.set(al.sku, (skuAvailableStockMap.get(al.sku) || 0) + al.qtyAvailable);

    if (al.qtyPhysical > 0) {
      underlyingRecords.push({
        recordType: 'INVENTORY_LOT',
        recordCode: `${al.lotId} (${al.allocationCode})`,
        date: (al.receivedDate || al.updatedAt).slice(0, 10),
        ownerLabel: al.ownerName,
        skuOrScope: al.sku,
        statusLabel: al.reconciliationState,
        amountCop: lotVal,
        units: al.qtyPhysical,
        originTable: 'stock_lot_ownership',
        metricKind: 'REAL_CONCILIADA',
        detailNote: `Disp: ${al.qtyAvailable} | Res: ${al.qtyReserved} | Rev/Def: ${al.qtyPendingInspection + al.qtyDefective}`
      });
    }
  });

  // Actualizar stock disponible en tabla SKU
  skuAgg.forEach((row, skuKey) => {
    row.availableStockUnits = skuAvailableStockMap.get(skuKey) || 0;
  });

  // --------------------------------------------------------------------------
  // 3. GASTOS APROBADOS, PUBLICIDAD Y LIQUIDACIONES
  // --------------------------------------------------------------------------
  let approvedDirectExpensesCop = 0;
  let approvedSharedExpensesCop = 0;
  const ownerExpenseAgg = new Map<string, { direct: number; shared: number }>();

  allExpenses.forEach((exp) => {
    if (exp.approvalStatus !== 'approved') return;
    if (!isDateWithinRange(exp.expenseDate || exp.createdAt, fromMs, toMs)) return;

    const relevantSlices =
      criteria.ownerId === 'ALL'
        ? exp.slices
        : exp.slices.filter((sl) => sl.ownerId === criteria.ownerId);

    const amountForScope =
      criteria.ownerId === 'ALL'
        ? exp.totalAmountCop
        : relevantSlices.reduce((s, sl) => s + sl.allocatedAmountCop, 0);

    if (amountForScope <= 0) return;

    if (exp.expenseScope === 'direct_owner') {
      approvedDirectExpensesCop += amountForScope;
    } else {
      approvedSharedExpensesCop += amountForScope;
    }

    relevantSlices.forEach((sl) => {
      const prev = ownerExpenseAgg.get(sl.ownerId) || { direct: 0, shared: 0 };
      if (exp.expenseScope === 'direct_owner') {
        prev.direct += sl.allocatedAmountCop;
      } else {
        prev.shared += sl.allocatedAmountCop;
      }
      ownerExpenseAgg.set(sl.ownerId, prev);
    });

    underlyingRecords.push({
      recordType: 'EXPENSE',
      recordCode: exp.expenseCode,
      date: exp.expenseDate.slice(0, 10),
      ownerLabel: relevantSlices.map((s) => s.ownerName).join(', ') || 'Tienda',
      skuOrScope: exp.category,
      statusLabel: 'Aprobado',
      amountCop: amountForScope,
      units: 0,
      originTable: 'financial_expenses + owner_expense_allocations',
      metricKind: 'REAL_CONCILIADA',
      detailNote: `Criterio: ${exp.allocationCriterion} | ${exp.description}`
    });
  });

  const totalApprovedExpensesCop = approvedDirectExpensesCop + approvedSharedExpensesCop;

  // Campañas Meta Ads filtradas
  const filteredCampaignPerfs = allCampaignPerformances.filter((cp) => {
    if (criteria.campaignId !== 'ALL' && cp.campaign.id !== criteria.campaignId) return false;
    if (criteria.ownerId !== 'ALL' && cp.campaign.targetOwnerId !== criteria.ownerId) return false;
    if (
      criteria.channel !== 'ALL' &&
      criteria.channel !== 'facebook' &&
      criteria.channel !== 'instagram' &&
      criteria.channel !== 'whatsapp' &&
      criteria.channel !== 'marketplace'
    ) {
      return false;
    }
    if (criteria.sku !== 'ALL' && cp.campaign.promotedSku !== criteria.sku) return false;
    return true;
  });

  const adSpendCop = filteredCampaignPerfs.reduce((s, c) => s + c.totalSpendCop, 0);
  const adAttributedRevenueCop = filteredCampaignPerfs.reduce((s, c) => s + c.totalAttributedRevenueCop, 0);
  const adRoasMultiplier = adSpendCop > 0 ? Number((adAttributedRevenueCop / adSpendCop).toFixed(2)) : null;

  filteredCampaignPerfs.forEach((cp) => {
    underlyingRecords.push({
      recordType: 'META_ADS_CAMPAIGN',
      recordCode: cp.campaign.campaignCode,
      date: cp.campaign.startDate.slice(0, 10),
      ownerLabel: cp.campaign.targetOwnerName || 'Sin propietario',
      skuOrScope: cp.campaign.promotedSku || 'General',
      statusLabel: cp.campaign.status,
      amountCop: cp.totalSpendCop,
      units: cp.totalVerifiedPurchases,
      originTable: `meta_ads_campaigns (${cp.campaign.dataSourceOrigin})`,
      metricKind: 'REAL_CONCILIADA',
      detailNote: `ROAS: ${cp.roasMultiplier !== null ? `${cp.roasMultiplier}x` : 'N/A'} | Ingresos atrib.: ${formatCopSimple(cp.totalAttributedRevenueCop)}`
    });
  });

  // Liquidaciones filtradas
  let settlementsPaidCop = 0;
  let settlementsPendingCop = 0;
  let settlementsTotalCount = 0;
  const ownerSettlementAgg = new Map<string, { paid: number; approvedPending: number }>();

  allSettlements.forEach((stl) => {
    if (criteria.ownerId !== 'ALL' && stl.ownerId !== criteria.ownerId) return;
    if (!isDateWithinRange(stl.settlementDate || stl.createdAt, fromMs, toMs)) return;

    settlementsTotalCount += 1;
    const prev = ownerSettlementAgg.get(stl.ownerId) || { paid: 0, approvedPending: 0 };
    if (stl.approvalState === 'paid_documented') {
      settlementsPaidCop += stl.amountApprovedToSettleCop;
      prev.paid += stl.amountApprovedToSettleCop;
    } else if (stl.approvalState === 'approved_pending_payment') {
      settlementsPendingCop += stl.amountApprovedToSettleCop;
      prev.approvedPending += stl.amountApprovedToSettleCop;
    }
    ownerSettlementAgg.set(stl.ownerId, prev);

    underlyingRecords.push({
      recordType: 'SETTLEMENT',
      recordCode: stl.settlementCode,
      date: stl.settlementDate.slice(0, 10),
      ownerLabel: stl.ownerName,
      skuOrScope: `${stl.periodStart} a ${stl.periodEnd}`,
      statusLabel: stl.approvalState,
      amountCop: stl.amountApprovedToSettleCop,
      units: 0,
      originTable: 'owner_settlements',
      metricKind: 'REAL_CONCILIADA',
      detailNote: `Comprobante: ${stl.voucherReference || 'Pendiente'}`
    });
  });

  // --------------------------------------------------------------------------
  // 4. PUBLICACIONES, CONSULTAS Y PROSPECTOS (MARKETING)
  // --------------------------------------------------------------------------
  const filteredMarketplace = socialState.marketplaceListings.filter((item) => {
    if (criteria.ownerId !== 'ALL' && item.ownerId !== criteria.ownerId) return false;
    if (!matchesCatalogFilter(item.sku, item.productName)) return false;
    if (criteria.channel !== 'ALL' && criteria.channel !== 'marketplace') return false;
    if (!isDateWithinRange(item.createdAt, fromMs, toMs)) return false;
    return true;
  });

  const filteredSocialCalendar = socialState.calendarPublications.filter((item) => {
    if (criteria.ownerId !== 'ALL' && item.ownerId !== criteria.ownerId) return false;
    if (!matchesCatalogFilter(item.sku, item.productName)) return false;
    if (criteria.channel !== 'ALL' && !item.channel.includes(criteria.channel)) return false;
    if (!isDateWithinRange(item.scheduledFor || item.createdAt, fromMs, toMs)) return false;
    return true;
  });

  const filteredWaStatuses = socialState.whatsappStatusItems.filter((item) => {
    if (criteria.ownerId !== 'ALL' && item.ownerId !== criteria.ownerId) return false;
    if (!matchesCatalogFilter(item.sku, item.productName)) return false;
    if (criteria.channel !== 'ALL' && criteria.channel !== 'whatsapp') return false;
    if (!isDateWithinRange(item.createdAt, fromMs, toMs)) return false;
    return true;
  });

  const totalPublicationsCount =
    filteredMarketplace.length + filteredSocialCalendar.length + filteredWaStatuses.length;
  const publishedLiveCount =
    filteredMarketplace.filter((m) => m.status === 'published_url_recorded').length +
    filteredSocialCalendar.filter((s) => s.approvalStatus === 'published').length +
    filteredWaStatuses.filter((w) => w.approvalStatus === 'shared_manually').length;

  filteredSocialCalendar.forEach((pub) => {
    underlyingRecords.push({
      recordType: 'PUBLICATION',
      recordCode: pub.publicationCode,
      date: (pub.publishedAt || pub.scheduledFor || pub.createdAt).slice(0, 10),
      ownerLabel: pub.ownerName,
      skuOrScope: pub.sku,
      statusLabel: pub.approvalStatus,
      amountCop: pub.effectivePriceCop,
      units: 1,
      originTable: 'social_publications',
      metricKind: 'REAL_CONCILIADA',
      detailNote: `Canal: ${pub.channel} | ${pub.headline}`
    });
  });

  const ownerOwnedSkus = new Set(
    criteria.ownerId === 'ALL'
      ? []
      : allAllocations
          .filter((a) => a.ownerId === criteria.ownerId)
          .map((a) => a.sku)
  );
  const filteredCampaignIds = new Set(filteredCampaignPerfs.map((cp) => cp.campaign.id));

  const filteredLeads = allLeads.filter((lead) => {
    if (!isDateWithinRange(lead.createdAt, fromMs, toMs)) return false;
    if (!matchesCatalogFilter(lead.interestedSku, lead.interestedProductName)) return false;
    if (criteria.ownerId !== 'ALL' && !ownerOwnedSkus.has(lead.interestedSku)) return false;
    if (criteria.channel !== 'ALL' && lead.sourceChannel !== criteria.channel) return false;
    if (queryLower) {
      const hay = `${lead.interestedSku} ${lead.interestedProductName} ${lead.fullName}`.toLowerCase();
      if (!hay.includes(queryLower)) return false;
    }
    return true;
  });

  const convertedLeadsCount = filteredLeads.filter((l) => l.stage === 'won').length;
  filteredLeads.forEach((lead) => {
    underlyingRecords.push({
      recordType: 'CRM_LEAD',
      recordCode: lead.leadCode,
      date: lead.createdAt.slice(0, 10),
      ownerLabel: 'CRM / Comercial',
      skuOrScope: lead.interestedSku || 'Consulta General',
      statusLabel: lead.stage,
      amountCop: 0,
      units: 1,
      originTable: 'crm_leads',
      metricKind: 'REAL_CONCILIADA',
      detailNote: `Fuente: ${lead.sourceChannel}`
    });
  });

  const filteredWaInteractions = waState.interactionsLog.filter((wa) => {
    if (!isDateWithinRange(wa.createdAt, fromMs, toMs)) return false;
    if (wa.sku && !matchesCatalogFilter(wa.sku, '')) return false;
    if (criteria.ownerId !== 'ALL' && (!wa.sku || !ownerOwnedSkus.has(wa.sku))) return false;
    if (criteria.channel !== 'ALL' && criteria.channel !== 'whatsapp') return false;
    return true;
  });

  // --------------------------------------------------------------------------
  // 5. DASHBOARD MULTIPROPIETARIO CONSOLIDADO
  // --------------------------------------------------------------------------
  const ownerRows: BiOwnerComparisonRow[] = baseOwnerStatements
    .filter((st) => criteria.ownerId === 'ALL' || st.ownerId === criteria.ownerId)
    .map((st) => {
      const ordAgg = ownerOrderAgg.get(st.ownerId) || {
        grossUnits: 0,
        returnedUnits: 0,
        grossSales: 0,
        discountsAndReturns: 0,
        netSales: 0,
        cogs: 0
      };
      const invAgg = ownerInvAgg.get(st.ownerId) || {
        physical: 0,
        available: 0,
        reserved: 0,
        defectiveOrPending: 0,
        valuation: 0
      };
      const expAgg = ownerExpenseAgg.get(st.ownerId) || { direct: 0, shared: 0 };
      const stlAgg = ownerSettlementAgg.get(st.ownerId) || { paid: 0, approvedPending: 0 };

      const adAllocForOwner = adsState.ownerSpendAllocations
        .filter(
          (a) =>
            a.ownerId === st.ownerId &&
            a.ownerDeductionAuthorized === true &&
            filteredCampaignIds.has(a.campaignId)
        )
        .reduce((s, a) => s + a.ownerAllocatedSpendCop, 0);

      const grossBeforeComm = ordAgg.netSales - ordAgg.cogs - expAgg.direct - expAgg.shared - adAllocForOwner;
      const commCalc = computeSaleCommissionAndOwnerProfit(
        ordAgg.netSales,
        ordAgg.netSales - ordAgg.cogs - adAllocForOwner,
        st.agreement
      );
      const storeCommission = commCalc.storeCommissionCop;
      const attributableProfit = grossBeforeComm - (storeCommission ?? 0);

      return {
        ownerId: st.ownerId,
        ownerName: st.ownerName,
        agreementStatus: st.agreement.status,
        physicalUnits: invAgg.physical,
        availableUnits: invAgg.available,
        reservedUnits: invAgg.reserved,
        defectiveOrPendingUnits: invAgg.defectiveOrPending,
        inventoryValuationCop: invAgg.valuation,
        grossUnitsSold: ordAgg.grossUnits,
        returnedUnits: ordAgg.returnedUnits,
        netUnitsSold: Math.max(0, ordAgg.grossUnits - ordAgg.returnedUnits),
        grossSalesCop: ordAgg.grossSales,
        discountsAndReturnsCop: ordAgg.discountsAndReturns,
        netSalesCop: ordAgg.netSales,
        cogsSoldCop: ordAgg.cogs,
        directExpensesCop: expAgg.direct,
        sharedExpensesCop: expAgg.shared,
        attributableAdSpendCop: adAllocForOwner,
        totalAssignedExpensesCop: expAgg.direct + expAgg.shared + adAllocForOwner,
        storeCommissionCop: storeCommission,
        attributableProfitCop: attributableProfit,
        settlementsPaidCop: stlAgg.paid,
        settlementsApprovedPendingCop: stlAgg.approvedPending,
        previousBalanceCop: st.previousBalanceCop,
        finalConciliatedBalanceCop: st.finalConciliatedBalanceCop,
        dataOrigin: 'stock_lot_ownership + sales_item_allocations + financial_expenses + owner_settlements'
      };
    });

  const storeCommissionsCop = ownerRows.reduce((s, r) => s + (r.storeCommissionCop ?? 0), 0);
  const netLogisticsDelta = shippingChargedCop - shippingRealCostCop;
  const contributionMarginCop =
    netMerchandiseRevenueCop + netLogisticsDelta - cogsCop - approvedDirectExpensesCop;
  const netOperatingProfitCop =
    contributionMarginCop - approvedSharedExpensesCop - adSpendCop;

  // --------------------------------------------------------------------------
  // 6. RENDIMIENTO POR CANAL (MARKETING + COMERCIAL)
  // --------------------------------------------------------------------------
  const channelKeys = ['whatsapp', 'instagram', 'facebook', 'marketplace', 'store_direct', 'web'];
  const channelRows: BiChannelPerformanceRow[] = channelKeys
    .filter((ch) => criteria.channel === 'ALL' || criteria.channel === ch)
    .map((ch) => {
      const chOrders = filteredOrders.filter((o) => o.salesChannel === ch);
      const realizedChOrders = chOrders.filter((o) => REALIZED_ORDER_STATUSES.has(o.status));
      const unconfirmedChOrders = chOrders.filter((o) => !REALIZED_ORDER_STATUSES.has(o.status) && o.status !== 'cancelled');
      const chLeads = filteredLeads.filter((l) => l.sourceChannel === ch);

      const pubsCount =
        ch === 'marketplace'
          ? filteredMarketplace.length
          : ch === 'whatsapp'
          ? filteredWaStatuses.length
          : filteredSocialCalendar.filter((p) => p.channel.includes(ch)).length;

      const consultationsCount = ch === 'whatsapp' ? filteredWaInteractions.length : chLeads.length;

      let chNetRevenue = 0;
      let chCogs = 0;
      realizedChOrders.forEach((o) => {
        o.lines.forEach((l) => {
          if (!matchesCatalogFilter(l.sku, l.productName)) return;
          l.allocations.forEach((a) => {
            if (criteria.ownerId !== 'ALL' && a.ownerId !== criteria.ownerId) return;
            const netQty = Math.max(0, a.qtyAllocated - a.qtyReturned);
            chNetRevenue += Math.max(0, a.qtyAllocated * a.unitSalePriceCop - a.discountAllocatedCop - a.returnAmountCop);
            chCogs += netQty * a.unitCostCop;
          });
        });
      });

      const chAdSpend = filteredCampaignPerfs
        .filter((cp) => cp.campaign.channel === ch)
        .reduce((s, cp) => s + cp.totalSpendCop, 0);

      const denom = chLeads.length > 0 ? chLeads.length : consultationsCount;
      const conversionRatePct = denom > 0 ? Number(((realizedChOrders.length / denom) * 100).toFixed(1)) : 0;

      return {
        channelId: ch,
        channelLabel: CHANNEL_LABELS[ch] || ch,
        publicationsCount: pubsCount,
        consultationsCount,
        leadsCount: chLeads.length,
        realizedOrdersCount: realizedChOrders.length,
        unconfirmedOrdersCount: unconfirmedChOrders.length,
        netRevenueCop: chNetRevenue,
        cogsCop: chCogs,
        adSpendCop: chAdSpend,
        conversionRatePct,
        dataOrigin: 'sales_orders + crm_leads + social_publications + meta_ads'
      };
    });

  // --------------------------------------------------------------------------
  // 7. GRÁFICAS Y TRAZABILIDAD DE INDICADORES
  // --------------------------------------------------------------------------
  const sortSeries = (map: Map<string, BiTimeSeriesPoint>) =>
    Array.from(map.values()).sort((a, b) => a.bucketKey.localeCompare(b.bucketKey));

  const dailySales = sortSeries(dailyMap);
  const weeklySales = sortSeries(weeklyMap);
  const monthlySales = sortSeries(monthlyMap);

  const skuRows = Array.from(skuAgg.values()).sort((a, b) => b.netRevenueCop - a.netRevenueCop);

  const orderStatuses: BiOrderStatusPoint[] = (Object.keys(ORDER_STATUS_LABELS) as SalesOrderStatus[])
    .map((st) => {
      const b = statusBuckets.get(st) || { count: 0, amountCop: 0 };
      return {
        status: st,
        statusLabel: ORDER_STATUS_LABELS[st],
        count: b.count,
        amountCop: b.amountCop,
        isRealized: REALIZED_ORDER_STATUSES.has(st)
      };
    })
    .filter((pt) => pt.count > 0);

  const appliedFilterSummary = buildFilterSummaryText(criteria);

  const auditIndicators: BiIndicatorAuditMeta[] = [
    {
      indicatorKey: 'NET_REALIZED_REVENUE',
      label: 'Ingresos Realizados Netos',
      valueFormatted: formatCopSimple(netMerchandiseRevenueCop),
      numericValue: netMerchandiseRevenueCop,
      metricKind: 'REAL_CONCILIADA',
      dataOrigin: 'sales_orders + sales_item_allocations',
      calculationFormula: 'SUM(Ventas Brutas - Descuentos - Devoluciones) WHERE status IN (confirmed..returned)',
      underlyingRecordCount: realizedOrdersCount,
      evaluatedAt,
      appliedFilterSummary
    },
    {
      indicatorKey: 'UNCONFIRMED_PIPELINE',
      label: 'Pipeline No Confirmado (Estimación)',
      valueFormatted: formatCopSimple(unconfirmedPipelineRevenueCop),
      numericValue: unconfirmedPipelineRevenueCop,
      metricKind: 'ESTIMACION_NO_REALIZADA',
      dataOrigin: 'sales_orders (status IN draft, reserved)',
      calculationFormula: 'Excluido de ingresos realizados; solo referencia comercial pendiente de confirmación',
      underlyingRecordCount: unconfirmedPipelineOrdersCount,
      evaluatedAt,
      appliedFilterSummary
    },
    {
      indicatorKey: 'COGS_NET',
      label: 'Costo Vendido (CMV Neto)',
      valueFormatted: formatCopSimple(cogsCop),
      numericValue: cogsCop,
      metricKind: 'REAL_CONCILIADA',
      dataOrigin: 'sales_item_allocations (unitCostCop preservado por lote)',
      calculationFormula: 'SUM((qtyAllocated - qtyReturned) * unitCostCop) en pedidos realizados',
      underlyingRecordCount: realizedOrdersCount,
      evaluatedAt,
      appliedFilterSummary
    },
    {
      indicatorKey: 'CONTRIBUTION_MARGIN',
      label: 'Contribución Marginal',
      valueFormatted: formatCopSimple(contributionMarginCop),
      numericValue: contributionMarginCop,
      metricKind: 'REAL_CONCILIADA',
      dataOrigin: 'sales_orders + financial_expenses (direct_owner)',
      calculationFormula: 'Ingresos Netos + (Envío Cobrado - Envío Real) - CMV - Gastos Directos Aprobados',
      underlyingRecordCount: realizedOrdersCount,
      evaluatedAt,
      appliedFilterSummary
    },
    {
      indicatorKey: 'NET_OPERATING_PROFIT',
      label: 'Utilidad Neta Operativa',
      valueFormatted: formatCopSimple(netOperatingProfitCop),
      numericValue: netOperatingProfitCop,
      metricKind: 'REAL_CONCILIADA',
      dataOrigin: 'sales_orders + financial_expenses + meta_ads_campaigns',
      calculationFormula: 'Contribución Marginal - Gastos Compartidos Aprobados - Inversión Publicitaria',
      underlyingRecordCount: realizedOrdersCount + allExpenses.length,
      evaluatedAt,
      appliedFilterSummary
    }
  ];

  return {
    generatedAt: evaluatedAt,
    appliedCriteria: criteria,
    appliedFilterSummary,
    filterOptions,
    general: {
      realizedOrdersCount,
      unconfirmedPipelineOrdersCount,
      cancelledOrdersCount,
      returnedOrdersCount,
      grossUnitsSold,
      returnedUnits,
      netUnitsSold,
      grossSalesCop,
      discountsCop,
      returnsCop,
      netMerchandiseRevenueCop,
      unconfirmedPipelineRevenueCop,
      collectedCashCop,
      pendingReceivablesCop,
      cogsCop,
      shippingChargedCop,
      shippingRealCostCop,
      approvedDirectExpensesCop,
      approvedSharedExpensesCop,
      totalApprovedExpensesCop,
      storeCommissionsCop,
      contributionMarginCop,
      netOperatingProfitCop,
      inventoryPhysicalUnits,
      inventoryGoodUnits,
      inventoryAvailableUnits,
      inventoryReservedUnits,
      inventoryPendingInspectionUnits,
      inventoryDefectiveUnits,
      inventoryValuationCop,
      totalPublicationsCount,
      publishedLiveCount,
      totalLeadsCount: filteredLeads.length,
      convertedLeadsCount,
      whatsappConsultationsCount: filteredWaInteractions.length,
      adSpendCop,
      adAttributedRevenueCop,
      adRoasMultiplier,
      settlementsPaidCop,
      settlementsPendingCop,
      settlementsTotalCount
    },
    ownerRows,
    skuRows,
    channelRows,
    campaignPerformances: filteredCampaignPerfs,
    charts: {
      dailySales,
      weeklySales,
      monthlySales,
      salesBySku: skuRows.slice(0, 12).map((r) => ({
        sku: r.sku,
        label: r.sku,
        netRevenueCop: r.netRevenueCop,
        profitCop: r.grossProfitCop,
        units: r.netUnitsSold
      })),
      salesByOwner: ownerRows.map((o) => ({
        ownerId: o.ownerId,
        ownerName: o.ownerName,
        netSalesCop: o.netSalesCop,
        cogsCop: o.cogsSoldCop,
        profitCop: o.attributableProfitCop
      })),
      costsBreakdown: [
        { category: 'CMV (Costo Vendido)', amountCop: cogsCop },
        { category: 'Gastos Directos', amountCop: approvedDirectExpensesCop },
        { category: 'Gastos Compartidos', amountCop: approvedSharedExpensesCop },
        { category: 'Publicidad Meta Ads', amountCop: adSpendCop },
        { category: 'Envíos Transportadora', amountCop: shippingRealCostCop }
      ],
      profitEvolution: monthlySales.length > 0 ? monthlySales : dailySales,
      inventoryByOwner: ownerRows.map((o) => ({
        ownerName: o.ownerName,
        available: o.availableUnits,
        reserved: o.reservedUnits,
        defectiveOrPending: o.defectiveOrPendingUnits
      })),
      orderStatuses,
      channelPerformance: channelRows
    },
    auditIndicators,
    underlyingRecords
  };
}

// ============================================================================
// EXPORTACIÓN GRATUITA LOCAL (CSV CON BOM UTF-8 Y REPORTE IMPRIMIBLE PDF)
// ============================================================================

function escapeCsvField(val: unknown): string {
  const raw = String(val ?? '');
  const trimmedStart = raw.replace(/^\s+/, '');
  const safe =
    typeof val !== 'number' && /^[=+\-@\t\r]/.test(trimmedStart) && !/^-\d+(\.\d+)?$/.test(trimmedStart)
      ? `'${raw}`
      : raw;
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n') || safe.includes('\r')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function exportBiSnapshotToCsv(snapshot: BiReportSnapshot, scope: 'GENERAL' | 'OWNERS' | 'SKU' | 'UNDERLYING'): string {
  const lines: string[] = [];
  lines.push(`# REAL TWS BUSINESS INTELLIGENCE - EXPORTACION ${scope}`);
  lines.push(`# Fecha Generacion: ${snapshot.generatedAt}`);
  lines.push(`# Criterios: ${snapshot.appliedFilterSummary}`);

  if (scope === 'GENERAL') {
    lines.push('Indicador,Valor,Tipo Metrica,Origen de Datos,Formula');
    snapshot.auditIndicators.forEach((ind) => {
      lines.push(
        [ind.label, ind.numericValue, ind.metricKind, ind.dataOrigin, ind.calculationFormula]
          .map(escapeCsvField)
          .join(',')
      );
    });
  } else if (scope === 'OWNERS') {
    lines.push(
      'ID Propietario,Propietario,Existencia Fisica,Disponible,Valoracion Inventario COP,Unidades Netas Vendidas,Ventas Netas COP,CMV COP,Gastos Asignados COP,Comision REAL TWS COP,Utilidad Atribuible COP,Liquidado Pagado COP,Saldo Final Conciliado COP'
    );
    snapshot.ownerRows.forEach((o) => {
      lines.push(
        [
          o.ownerId,
          o.ownerName,
          o.physicalUnits,
          o.availableUnits,
          o.inventoryValuationCop,
          o.netUnitsSold,
          o.netSalesCop,
          o.cogsSoldCop,
          o.totalAssignedExpensesCop,
          o.storeCommissionCop ?? 'PENDIENTE_ACUERDO',
          o.attributableProfitCop,
          o.settlementsPaidCop,
          o.finalConciliatedBalanceCop
        ]
          .map(escapeCsvField)
          .join(',')
      );
    });
  } else if (scope === 'SKU') {
    lines.push('SKU,Producto,Categoria,Pedidos Realizados,Unidades Netas,Devoluciones,Ingresos Netos COP,CMV COP,Utilidad Bruta COP,Margen %,Stock Disponible');
    snapshot.skuRows.forEach((r) => {
      lines.push(
        [
          r.sku,
          r.productName,
          r.category,
          r.realizedOrdersCount,
          r.netUnitsSold,
          r.returnedUnits,
          r.netRevenueCop,
          r.cogsCop,
          r.grossProfitCop,
          r.grossMarginPct,
          r.availableStockUnits
        ]
          .map(escapeCsvField)
          .join(',')
      );
    });
  } else {
    lines.push('Tipo Registro,Codigo,Fecha,Propietario,SKU/Alcance,Estado,Monto COP,Unidades,Tabla Origen,Tipo Metrica,Detalle');
    snapshot.underlyingRecords.forEach((u) => {
      lines.push(
        [
          u.recordType,
          u.recordCode,
          u.date,
          u.ownerLabel,
          u.skuOrScope,
          u.statusLabel,
          u.amountCop,
          u.units,
          u.originTable,
          u.metricKind,
          u.detailNote
        ]
          .map(escapeCsvField)
          .join(',')
      );
    });
  }

  return '\uFEFF' + lines.join('\r\n');
}

export function triggerCsvDownload(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function openPrintableBiPdfReport(snapshot: BiReportSnapshot): boolean {
  const win = window.open('', '_blank', 'width=1100,height=800');
  if (!win) return false;

  const ownerRowsHtml = snapshot.ownerRows
    .map(
      (o) => `
      <tr>
        <td>${escapeHtml(o.ownerName)} (${escapeHtml(o.ownerId)})</td>
        <td style="text-align:right">${o.physicalUnits} (${o.availableUnits} disp.)</td>
        <td style="text-align:right">${formatCopSimple(o.netSalesCop)}</td>
        <td style="text-align:right">${formatCopSimple(o.cogsSoldCop)}</td>
        <td style="text-align:right">${formatCopSimple(o.totalAssignedExpensesCop)}</td>
        <td style="text-align:right">${formatCopSimple(o.attributableProfitCop)}</td>
        <td style="text-align:right">${formatCopSimple(o.finalConciliatedBalanceCop)}</td>
      </tr>`
    )
    .join('');

  win.document.write(`
    <!doctype html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>REAL TWS — Reporte Ejecutivo Business Intelligence</title>
      <style>
        body { font-family: Arial, sans-serif; color: #0f172a; padding: 24px; font-size: 12px; }
        h1 { margin: 0 0 4px 0; font-size: 18px; }
        .meta { color: #475569; margin-bottom: 16px; font-size: 11px; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
        .card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; }
        .card .k { font-size: 10px; color: #64748b; text-transform: uppercase; }
        .card .v { font-size: 15px; font-weight: bold; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
        th { background: #f1f5f9; }
      </style>
    </head>
    <body>
      <h1>REAL TWS — Reporte Ejecutivo de Business Intelligence</h1>
      <div class="meta">
        Fecha de emisión: ${escapeHtml(new Date(snapshot.generatedAt).toLocaleString('es-CO'))} |
        Criterios: ${escapeHtml(snapshot.appliedFilterSummary)} |
        Regla: Excluye pedidos no confirmados de ingresos realizados.
      </div>
      <div class="grid">
        <div class="card"><div class="k">Ingresos Realizados Netos</div><div class="v">${formatCopSimple(snapshot.general.netMerchandiseRevenueCop)}</div></div>
        <div class="card"><div class="k">CMV (Costo Vendido)</div><div class="v">${formatCopSimple(snapshot.general.cogsCop)}</div></div>
        <div class="card"><div class="k">Gastos Aprobados + Ads</div><div class="v">${formatCopSimple(snapshot.general.totalApprovedExpensesCop + snapshot.general.adSpendCop)}</div></div>
        <div class="card"><div class="k">Utilidad Neta Operativa</div><div class="v">${formatCopSimple(snapshot.general.netOperatingProfitCop)}</div></div>
      </div>
      <h3>Resumen Multipropietario Conciliado</h3>
      <table>
        <thead>
          <tr>
            <th>Propietario</th>
            <th>Existencias</th>
            <th>Ventas Netas</th>
            <th>Costo Vendido</th>
            <th>Gastos Asignados</th>
            <th>Utilidad Atribuible</th>
            <th>Saldo Final</th>
          </tr>
        </thead>
        <tbody>${ownerRowsHtml}</tbody>
      </table>
      <script>window.onload = () => { window.print(); };</script>
    </body>
    </html>
  `);
  win.document.close();
  return true;
}
