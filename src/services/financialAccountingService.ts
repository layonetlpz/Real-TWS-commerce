// ============================================================================
// REAL TWS COMMERCE SYSTEM — FINANCIAL & MULTI-OWNER ACCOUNTING ENGINE (FASE 6)
// Cubre:
//   1. COSTOS: Compra por lote, transporte de entrada, otros costos de
//      adquisición, costo unitario real, empaque, comisiones, gastos directos,
//      gastos compartidos y publicidad atribuible.
//   2. PRECIOS: Precio normal, promocional, precio mínimo, descuentos,
//      historial inmutable, simulador financiero, margen, markup, contribución
//      y punto de equilibrio.
//   3. MULTIPROPIETARIO: Estado de cuenta individual, costo de venta por lote
//      y propietario, ingresos por cantidades realmente despachadas, prorrateo
//      documentado de descuentos y devoluciones, gastos directos, gastos
//      compartidos multicriterio y bloqueo de criterios no aprobados.
//   4. ACUERDOS: Comisión REAL TWS, precio mínimo, descuento máximo,
//      autorización comercial, método de liquidación, responsable de
//      publicidad, política de gastos compartidos y alerta PENDIENTE DE CONFIGURAR.
//   5. LIQUIDACIONES: Periodo, ventas netas, costo vendido, gastos, comisión,
//      utilidad atribuible, saldo anterior, pagos anteriores, saldo final,
//      comprobante y estado de aprobación (sin liquidar ni pagar automáticamente).
//   6. BATERÍA DE 8 PRUEBAS OBLIGATORIAS en sandbox aislado.
// ============================================================================

import {
  getInventoryPurchaseState,
  saveInventoryPurchaseState
} from './inventoryPurchaseService';
import { isValidNonNegativeAmount } from '../utils/validations';

export type AgreementStatus = 'pending_configuration' | 'active' | 'superseded' | 'cancelled';

export type DistributionModelType =
  | 'attributable_profit'
  | 'store_commission_pct'
  | 'profit_split_pct'
  | 'fixed_margin'
  | 'custom_documented';

export type SharedExpensePolicyCriterion =
  | 'proportional_net_sales'
  | 'proportional_cogs'
  | 'proportional_units_sold'
  | 'manual_explicit';

export interface OwnerCommercialAgreement {
  id: string;
  agreementCode: string;
  ownerId: string;
  ownerName: string;
  status: AgreementStatus;
  distributionModel: DistributionModelType | null;
  storeCommissionPct: number | null; // null cuando está PENDIENTE DE CONFIGURAR
  ownerSharePct: number | null;
  minimumPriceGuardPct: number | null;
  maxDiscountAllowedPct: number | null;
  commercialAuthorizationMode:
    | 'explicit_owner_approval'
    | 'store_delegated_within_limits'
    | 'admin_joint_signature';
  settlementMethod:
    | 'conciliated_period_cutoff'
    | 'per_collected_order'
    | 'monthly_conciliated'
    | null;
  advertisingResponsibility:
    | 'owner_100_direct'
    | 'store_100_assumed'
    | 'shared_by_agreement_pct'
    | 'per_campaign_explicit'
    | null;
  sharedExpensePolicy: SharedExpensePolicyCriterion | 'excluded_from_shared' | null;
  effectiveFrom: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string;
  updatedAt: string;
}

export interface LotFullCostBreakdown {
  lotAllocationId: string;
  lotId: string;
  sku: string;
  productName: string;
  category: string;
  ownerId: string;
  ownerName: string;
  qtyPhysical: number;
  costStatus: 'CONFIRMED' | 'PENDING_COST' | 'BONUS_ZERO_COST';
  purchaseUnitCostCop: number | null;
  inboundShippingUnitCostCop: number;
  otherAcquisitionUnitCostCop: number;
  realUnitAcquisitionCostCop: number | null; // compra + transporte + otros
  packagingUnitCostCop: number;
  attributableAdvertisingUnitCop: number;
  totalDirectUnitCostCop: number | null; // adquisición + empaque + publicidad unitaria
  totalLotValuationCop: number | null;
}

export interface ImmutablePriceHistoryRecord {
  id: string;
  sku: string;
  productName: string;
  previousNormalPriceCop: number | null;
  newNormalPriceCop: number;
  promotionalPriceCop: number | null;
  minimumAllowedPriceCop: number;
  maxDiscountPct: number;
  baseUnitCostSnapshotCop: number | null;
  grossMarginPct: number | null;
  markupPct: number | null;
  changeReason: string;
  approvedBy: string;
  createdAt: string;
  immutable: true;
}

export interface SkuPricingConfiguration {
  sku: string;
  productName: string;
  category: string;
  referenceLotCostCop: number | null;
  packagingUnitCostCop: number;
  normalSalePriceCop: number | null;
  promotionalPriceCop: number | null;
  minimumAllowedPriceCop: number | null;
  maxDiscountPct: number;
  updatedAt: string;
}

export interface PricingSimulationOutput {
  baseAcquisitionCostCop: number;
  inboundFreightAndOtherCop: number;
  realUnitAcquisitionCostCop: number;
  packagingUnitCostCop: number;
  attributableAdUnitCostCop: number;
  storeCommissionPct: number;
  normalPriceCop: number;
  discountAppliedPct: number;
  effectiveNetSalePriceCop: number;
  commissionUnitCop: number;
  totalVariableUnitCostCop: number;
  grossMarginCop: number;
  grossMarginPct: number;
  markupPct: number;
  unitContributionMarginCop: number;
  contributionMarginPct: number;
  fixedExpensesPeriodCop: number;
  breakEvenUnits: number | null;
  breakEvenRevenueCop: number | null;
  isBelowMinimumPrice: boolean;
  formulaVerificationLog: string[];
}

export interface DispatchedSaleAllocationRecord {
  id: string;
  allocationSaleCode: string;
  orderNumber: string;
  saleDate: string;
  sku: string;
  productName: string;
  lotAllocationId: string;
  lotId: string;
  ownerId: string;
  ownerName: string;
  qtyDispatched: number;
  qtyReturned: number;
  netQtySold: number;
  unitSalePriceCop: number;
  grossRevenueCop: number;
  proratedDiscountCop: number;
  proratedReturnAmountCop: number;
  netRevenueCop: number;
  unitAcquisitionCostCop: number;
  cogsTotalCop: number;
  packagingDirectExpenseCop: number;
  attributableAdvertisingCop: number;
  grossProfitBeforeCommissionCop: number;
  storeCommissionCop: number | null; // null cuando acuerdo está PENDIENTE DE CONFIGURAR
  attributableOwnerProfitCop: number;
  commissionStatus: 'PENDING_AGREEMENT' | 'CALCULATED_BY_AGREEMENT';
  collectedCashCop: number; // Dinero efectivamente recibido
  uncollectedReceivableCop: number; // Cartera pendiente de cobro
  prorationDocumentation: string;
  immutable: true;
}

export interface ExpenseOwnerAllocationSlice {
  ownerId: string;
  ownerName: string;
  allocatedAmountCop: number;
  allocationPercentage: number;
  basisValue: number;
  justificationNote: string;
}

export interface FinancialExpenseRecord {
  id: string;
  expenseCode: string;
  expenseDate: string;
  expenseScope: 'direct_owner' | 'shared_multi_owner' | 'store_internal';
  category:
    | 'Transporte de Entrada'
    | 'Empaque y Embalaje'
    | 'Publicidad Atribuible'
    | 'Comisión Pasarela / Logística'
    | 'Operación Compartida Bodega'
    | 'Otro Gasto Operativo';
  description: string;
  totalAmountCop: number;
  allocationCriterion:
    | 'single_owner_direct'
    | 'proportional_net_sales'
    | 'proportional_cogs'
    | 'proportional_units_sold'
    | 'manual_explicit'
    | 'store_absorbed';
  approvalStatus: 'draft_unapproved' | 'approved' | 'rejected';
  approvedBy: string | null;
  notes: string;
  createdAt: string;
  slices: ExpenseOwnerAllocationSlice[];
  immutable: true;
}

export interface OwnerAccountStatement {
  ownerId: string;
  ownerName: string;
  agreement: OwnerCommercialAgreement;
  agreementIsPending: boolean;
  associatedSkusCount: number;
  activeLotsCount: number;
  physicalUnitsInWarehouse: number;
  inventoryValuationCop: number;
  dispatchedUnitsGross: number;
  returnedUnits: number;
  netUnitsSold: number;
  grossSalesCop: number;
  discountsProratedCop: number;
  returnsProratedCop: number;
  netSalesCop: number;
  cogsSoldCop: number;
  packagingAndDirectSaleExpensesCop: number;
  directOwnerExpensesCop: number;
  sharedAllocatedExpensesCop: number;
  attributableAdvertisingCop: number;
  totalExpensesCop: number;
  grossProfitCop: number;
  storeCommissionCop: number | null;
  attributableNetProfitCop: number;
  collectedCashFromSalesCop: number;
  uncollectedReceivablesCop: number;
  collectableAttributableProfitCop: number;
  previousBalanceCop: number;
  previousSettledPaymentsCop: number;
  pendingPaymentSettlementsCop: number;
  finalConciliatedBalanceCop: number;
  canSettle: boolean;
  settlementBlockReason: string | null;
}

export interface OwnerSettlementRecord {
  id: string;
  settlementCode: string;
  settlementDate: string;
  ownerId: string;
  ownerName: string;
  agreementCode: string;
  periodStart: string;
  periodEnd: string;
  grossSalesPeriodCop: number;
  discountsAndReturnsPeriodCop: number;
  netSalesPeriodCop: number;
  cogsPeriodCop: number;
  directExpensesPeriodCop: number;
  sharedExpensesPeriodCop: number;
  attributableAdPeriodCop: number;
  storeCommissionPeriodCop: number;
  attributableProfitPeriodCop: number;
  collectedSalesCashCop: number;
  uncollectedReceivableCop: number;
  previousBalanceCop: number;
  previousPaymentsCop: number;
  availableBalanceBeforeSettlementCop: number;
  amountApprovedToSettleCop: number;
  finalRemainingBalanceCop: number;
  voucherReference: string;
  approvalState: 'conciliated_draft' | 'approved_pending_payment' | 'paid_documented';
  isConciliated: boolean;
  authorizedBy: string;
  notes: string;
  createdAt: string;
  immutable: true;
}

export interface FinancialAccountingStoreState {
  agreements: Record<string, OwnerCommercialAgreement>; // keyed by ownerId
  lotExtraCosts: Record<
    string,
    {
      inboundShippingUnitCostCop: number;
      otherAcquisitionUnitCostCop: number;
      packagingUnitCostCop: number;
      attributableAdvertisingUnitCop: number;
    }
  >; // keyed by lotAllocationId
  skuPricing: Record<string, SkuPricingConfiguration>; // keyed by sku
  priceHistory: ImmutablePriceHistoryRecord[];
  salesAllocations: DispatchedSaleAllocationRecord[];
  expenses: FinancialExpenseRecord[];
  settlements: OwnerSettlementRecord[];
}

export interface FinancialTestScenarioResult {
  testId: string;
  title: string;
  scenario: string;
  expected: string;
  actual: string;
  passed: boolean;
  details: string[];
}

const FIN_ACCOUNTING_STORAGE_KEY = 'rtw_financial_accounting_state_v1';

function createInitialEbertoAgreement(): OwnerCommercialAgreement {
  return {
    id: 'AGR-0001',
    agreementCode: 'AGR-0001',
    ownerId: 'OWN-0001',
    ownerName: 'Eberto',
    status: 'pending_configuration', // Regla crítica: Mostrar PENDIENTE DE CONFIGURAR cuando falten acuerdos
    distributionModel: null,
    storeCommissionPct: null, // No inventar porcentajes
    ownerSharePct: null,
    minimumPriceGuardPct: null,
    maxDiscountAllowedPct: null,
    commercialAuthorizationMode: 'explicit_owner_approval',
    settlementMethod: null,
    advertisingResponsibility: null,
    sharedExpensePolicy: null,
    effectiveFrom: null,
    approvedBy: null,
    approvedAt: null,
    notes:
      'PENDIENTE DE CONFIGURAR ACUERDO DE DISTRIBUCIÓN: No se asumen porcentajes de comisión ni reglas automáticas hasta aprobación explícita.',
    updatedAt: '2026-11-13T00:00:00.000Z'
  };
}

function createInitialHistoricalSalesOfEberto(): DispatchedSaleAllocationRecord[] {
  // Las 2 ventas reales históricas documentadas en el Excel de Eberto (COM-PER-001-AZU y HOG-ACC-001-NEG)
  return [
    Object.freeze({
      id: 'SIA-HIST-0001',
      allocationSaleCode: 'SIA-HIST-0001',
      orderNumber: 'VEN-HIST-0001',
      saleDate: '2026-11-01',
      sku: 'COM-PER-001-AZU',
      productName: 'Combo Teclado y Mouse Inalámbrico Azul',
      lotAllocationId: 'ALLOC-HIST-COM-PER-001-AZU',
      lotId: 'LOT-INI-2026-01-COM-PER-001-AZU',
      ownerId: 'OWN-0001',
      ownerName: 'Eberto',
      qtyDispatched: 1,
      qtyReturned: 0,
      netQtySold: 1,
      unitSalePriceCop: 50000,
      grossRevenueCop: 50000,
      proratedDiscountCop: 0,
      proratedReturnAmountCop: 0,
      netRevenueCop: 50000,
      unitAcquisitionCostCop: 19300,
      cogsTotalCop: 19300,
      packagingDirectExpenseCop: 0,
      attributableAdvertisingCop: 0,
      grossProfitBeforeCommissionCop: 30700,
      storeCommissionCop: null, // Pendiente de acuerdo
      attributableOwnerProfitCop: 30700,
      commissionStatus: 'PENDING_AGREEMENT',
      collectedCashCop: 50000,
      uncollectedReceivableCop: 0,
      prorationDocumentation:
        'Venta histórica auditada en hoja 11_VENTAS_POR_PROPIETARIO (100% atribuida a OWN-0001 Eberto).',
      immutable: true
    }),
    Object.freeze({
      id: 'SIA-HIST-0002',
      allocationSaleCode: 'SIA-HIST-0002',
      orderNumber: 'VEN-HIST-0002',
      saleDate: '2026-11-02',
      sku: 'HOG-ACC-001-NEG',
      productName: 'Báscula Digital Gramera de Cocina',
      lotAllocationId: 'ALLOC-HIST-HOG-ACC-001-NEG',
      lotId: 'LOT-INI-2026-01-HOG-ACC-001-NEG',
      ownerId: 'OWN-0001',
      ownerName: 'Eberto',
      qtyDispatched: 1,
      qtyReturned: 0,
      netQtySold: 1,
      unitSalePriceCop: 15000,
      grossRevenueCop: 15000,
      proratedDiscountCop: 0,
      proratedReturnAmountCop: 0,
      netRevenueCop: 15000,
      unitAcquisitionCostCop: 2400,
      cogsTotalCop: 2400,
      packagingDirectExpenseCop: 0,
      attributableAdvertisingCop: 0,
      grossProfitBeforeCommissionCop: 12600,
      storeCommissionCop: null, // Pendiente de acuerdo
      attributableOwnerProfitCop: 12600,
      commissionStatus: 'PENDING_AGREEMENT',
      collectedCashCop: 15000,
      uncollectedReceivableCop: 0,
      prorationDocumentation:
        'Venta histórica auditada en hoja 11_VENTAS_POR_PROPIETARIO (100% atribuida a OWN-0001 Eberto).',
      immutable: true
    })
  ];
}

export function getFinancialAccountingState(): FinancialAccountingStoreState {
  const invState = getInventoryPurchaseState();

  try {
    const raw = localStorage.getItem(FIN_ACCOUNTING_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FinancialAccountingStoreState;
      // Ensure all catalog SKUs exist in skuPricing
      let updated = false;
      for (const item of Object.values(invState.catalog)) {
        if (!parsed.skuPricing[item.sku]) {
          const alloc = invState.allocations.find((a) => a.sku === item.sku);
          parsed.skuPricing[item.sku] = {
            sku: item.sku,
            productName: item.productName,
            category: item.category,
            referenceLotCostCop: alloc?.effectiveUnitCostCop ?? null,
            packagingUnitCostCop: 0,
            normalSalePriceCop: item.approvedSalePriceCop,
            promotionalPriceCop: null,
            minimumAllowedPriceCop: null,
            maxDiscountPct: 0,
            updatedAt: '2026-11-13T00:00:00.000Z'
          };
          updated = true;
        }
      }
      if (updated) saveFinancialAccountingState(parsed);
      return parsed;
    }
  } catch {
    // Fallback
  }

  const skuPricing: Record<string, SkuPricingConfiguration> = {};
  for (const item of Object.values(invState.catalog)) {
    const alloc = invState.allocations.find((a) => a.sku === item.sku);
    skuPricing[item.sku] = {
      sku: item.sku,
      productName: item.productName,
      category: item.category,
      referenceLotCostCop: alloc?.effectiveUnitCostCop ?? null,
      packagingUnitCostCop: 0,
      normalSalePriceCop: item.approvedSalePriceCop,
      promotionalPriceCop: null,
      minimumAllowedPriceCop: null,
      maxDiscountPct: 0,
      updatedAt: '2026-11-13T00:00:00.000Z'
    };
  }

  const initial: FinancialAccountingStoreState = {
    agreements: {
      'OWN-0001': createInitialEbertoAgreement()
    },
    lotExtraCosts: {},
    skuPricing,
    priceHistory: [],
    salesAllocations: createInitialHistoricalSalesOfEberto(),
    expenses: [],
    settlements: []
  };

  saveFinancialAccountingState(initial);
  return initial;
}

export function saveFinancialAccountingState(state: FinancialAccountingStoreState): void {
  try {
    localStorage.setItem(FIN_ACCOUNTING_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('rtw-financial-state-updated'));
  } catch {
    // Ignore storage quota issues
  }
}

// ============================================================================
// 1. SIMULADOR FINANCIERO Y VERIFICACIÓN DE FÓRMULAS (MARGEN, MARKUP, CONTRIBUCIÓN, PE)
// ============================================================================
export function simulatePricingAndBreakEven(input: {
  baseAcquisitionCostCop: number;
  inboundFreightAndOtherCop: number;
  packagingUnitCostCop: number;
  attributableAdUnitCostCop: number;
  storeCommissionPct: number;
  normalPriceCop: number;
  discountAppliedPct: number;
  minimumAllowedPriceCop: number;
  fixedExpensesPeriodCop: number;
}): PricingSimulationOutput {
  const baseCost = Math.max(0, input.baseAcquisitionCostCop || 0);
  const freightOther = Math.max(0, input.inboundFreightAndOtherCop || 0);
  const realUnitAcquisitionCostCop = baseCost + freightOther;

  const packaging = Math.max(0, input.packagingUnitCostCop || 0);
  const adUnit = Math.max(0, input.attributableAdUnitCostCop || 0);
  const commPct = Math.max(0, Math.min(100, input.storeCommissionPct || 0));
  const normalPrice = Math.max(0, input.normalPriceCop || 0);
  const discountPct = Math.max(0, Math.min(100, input.discountAppliedPct || 0));

  const effectiveNetSalePriceCop = Math.round(normalPrice * (1 - discountPct / 100));
  const commissionUnitCop = Math.round(effectiveNetSalePriceCop * (commPct / 100));

  const totalVariableUnitCostCop =
    realUnitAcquisitionCostCop + packaging + adUnit + commissionUnitCop;

  const grossMarginCop = effectiveNetSalePriceCop - realUnitAcquisitionCostCop;
  const grossMarginPct =
    effectiveNetSalePriceCop > 0
      ? Number(((grossMarginCop / effectiveNetSalePriceCop) * 100).toFixed(2))
      : 0;

  const markupPct =
    realUnitAcquisitionCostCop > 0
      ? Number(((grossMarginCop / realUnitAcquisitionCostCop) * 100).toFixed(2))
      : 0;

  const unitContributionMarginCop =
    effectiveNetSalePriceCop - totalVariableUnitCostCop;
  const contributionMarginPct =
    effectiveNetSalePriceCop > 0
      ? Number(((unitContributionMarginCop / effectiveNetSalePriceCop) * 100).toFixed(2))
      : 0;

  const fixedPeriod = Math.max(0, input.fixedExpensesPeriodCop || 0);
  const breakEvenUnits =
    unitContributionMarginCop > 0
      ? Math.ceil(fixedPeriod / unitContributionMarginCop)
      : null;
  const breakEvenRevenueCop =
    breakEvenUnits !== null ? breakEvenUnits * effectiveNetSalePriceCop : null;

  const isBelowMinimumPrice =
    input.minimumAllowedPriceCop > 0 &&
    effectiveNetSalePriceCop < input.minimumAllowedPriceCop;

  const formulaVerificationLog = [
    `1. Costo Unitario Real de Adquisición = Compra (${baseCost}) + Transporte/Otros (${freightOther}) = ${realUnitAcquisitionCostCop} COP`,
    `2. Precio Venta Neto = Precio Normal (${normalPrice}) * (1 - ${discountPct}%) = ${effectiveNetSalePriceCop} COP`,
    `3. Margen Bruto % = ((${effectiveNetSalePriceCop} - ${realUnitAcquisitionCostCop}) / ${effectiveNetSalePriceCop}) * 100 = ${grossMarginPct}%`,
    `4. Markup % (Recargo s/Costo) = ((${effectiveNetSalePriceCop} - ${realUnitAcquisitionCostCop}) / ${realUnitAcquisitionCostCop}) * 100 = ${markupPct}%`,
    `5. Contribución Unitaria = Precio Neto (${effectiveNetSalePriceCop}) - [Costo Real (${realUnitAcquisitionCostCop}) + Empaque (${packaging}) + Publicidad (${adUnit}) + Comisión (${commissionUnitCop})] = ${unitContributionMarginCop} COP (${contributionMarginPct}%)`,
    breakEvenUnits !== null
      ? `6. Punto de Equilibrio = CEIL(Costos Fijos ${fixedPeriod} / Contribución ${unitContributionMarginCop}) = ${breakEvenUnits} unidades (${breakEvenRevenueCop} COP)`
      : '6. Punto de Equilibrio = No alcanzable (Contribución unitaria <= 0 COP)'
  ];

  return {
    baseAcquisitionCostCop: baseCost,
    inboundFreightAndOtherCop: freightOther,
    realUnitAcquisitionCostCop,
    packagingUnitCostCop: packaging,
    attributableAdUnitCostCop: adUnit,
    storeCommissionPct: commPct,
    normalPriceCop: normalPrice,
    discountAppliedPct: discountPct,
    effectiveNetSalePriceCop,
    commissionUnitCop,
    totalVariableUnitCostCop,
    grossMarginCop,
    grossMarginPct,
    markupPct,
    unitContributionMarginCop,
    contributionMarginPct,
    fixedExpensesPeriodCop: fixedPeriod,
    breakEvenUnits,
    breakEvenRevenueCop,
    isBelowMinimumPrice,
    formulaVerificationLog
  };
}

// ============================================================================
// 2. ACTUALIZAR COSTOS ADICIONALES POR LOTE (TRANSPORTE, OTROS, EMPAQUE, PUBLICIDAD)
// ============================================================================
export function updateLotAcquisitionAndDirectCosts(
  lotAllocationId: string,
  input: {
    purchaseUnitCostCop?: number | null;
    inboundShippingUnitCostCop: number;
    otherAcquisitionUnitCostCop: number;
    packagingUnitCostCop: number;
    attributableAdvertisingUnitCop: number;
  },
  targetFinState?: FinancialAccountingStoreState
): LotFullCostBreakdown {
  const finState = targetFinState ?? getFinancialAccountingState();
  const invState = getInventoryPurchaseState();
  const alloc = invState.allocations.find((a) => a.id === lotAllocationId);

  if (!alloc) {
    throw new Error(`No existe la asignación de lote ${lotAllocationId}.`);
  }

  if (
    !isValidNonNegativeAmount(input.inboundShippingUnitCostCop) ||
    !isValidNonNegativeAmount(input.otherAcquisitionUnitCostCop) ||
    !isValidNonNegativeAmount(input.packagingUnitCostCop) ||
    !isValidNonNegativeAmount(input.attributableAdvertisingUnitCop)
  ) {
    throw new Error('Los costos unitarios de transporte, empaque y publicidad deben ser montos válidos >= 0.');
  }

  if (input.purchaseUnitCostCop !== undefined && input.purchaseUnitCostCop !== null) {
    if (!isValidNonNegativeAmount(input.purchaseUnitCostCop)) {
      throw new Error('El costo de compra unitario debe ser un monto válido >= 0.');
    }
    alloc.purchaseUnitCostCop = input.purchaseUnitCostCop;
    alloc.costStatus = input.purchaseUnitCostCop === 0 ? 'BONUS_ZERO_COST' : 'CONFIRMED';
  }

  alloc.inboundShippingUnitCostCop = input.inboundShippingUnitCostCop;
  alloc.effectiveUnitCostCop =
    alloc.purchaseUnitCostCop === null
      ? null
      : alloc.purchaseUnitCostCop +
        input.inboundShippingUnitCostCop +
        input.otherAcquisitionUnitCostCop;

  finState.lotExtraCosts[lotAllocationId] = {
    inboundShippingUnitCostCop: input.inboundShippingUnitCostCop,
    otherAcquisitionUnitCostCop: input.otherAcquisitionUnitCostCop,
    packagingUnitCostCop: input.packagingUnitCostCop,
    attributableAdvertisingUnitCop: input.attributableAdvertisingUnitCop
  };

  if (!targetFinState) {
    saveInventoryPurchaseState(invState);
    saveFinancialAccountingState(finState);
  }

  const realUnitCost = alloc.effectiveUnitCostCop;
  const totalDirectUnit =
    realUnitCost === null
      ? null
      : realUnitCost + input.packagingUnitCostCop + input.attributableAdvertisingUnitCop;

  return {
    lotAllocationId: alloc.id,
    lotId: alloc.lotId,
    sku: alloc.sku,
    productName: alloc.productName,
    category: alloc.category,
    ownerId: alloc.ownerId,
    ownerName: alloc.ownerName,
    qtyPhysical: alloc.qtyPhysical,
    costStatus: alloc.costStatus,
    purchaseUnitCostCop: alloc.purchaseUnitCostCop,
    inboundShippingUnitCostCop: input.inboundShippingUnitCostCop,
    otherAcquisitionUnitCostCop: input.otherAcquisitionUnitCostCop,
    realUnitAcquisitionCostCop: realUnitCost,
    packagingUnitCostCop: input.packagingUnitCostCop,
    attributableAdvertisingUnitCop: input.attributableAdvertisingUnitCop,
    totalDirectUnitCostCop: totalDirectUnit,
    totalLotValuationCop:
      realUnitCost === null ? null : realUnitCost * alloc.qtyPhysical
  };
}

export function buildAllLotsCostBreakdowns(
  finState: FinancialAccountingStoreState,
  ownerScope = 'ALL'
): LotFullCostBreakdown[] {
  const invState = getInventoryPurchaseState();
  return invState.allocations
    .filter((a) => ownerScope === 'ALL' || a.ownerId === ownerScope)
    .map((a) => {
      const extra = finState.lotExtraCosts[a.id] || {
        inboundShippingUnitCostCop: a.inboundShippingUnitCostCop || 0,
        otherAcquisitionUnitCostCop: 0,
        packagingUnitCostCop: 0,
        attributableAdvertisingUnitCop: 0
      };
      const realUnit =
        a.purchaseUnitCostCop === null
          ? null
          : a.purchaseUnitCostCop +
            extra.inboundShippingUnitCostCop +
            extra.otherAcquisitionUnitCostCop;
      const totalDirectUnit =
        realUnit === null
          ? null
          : realUnit +
            extra.packagingUnitCostCop +
            extra.attributableAdvertisingUnitCop;

      return {
        lotAllocationId: a.id,
        lotId: a.lotId,
        sku: a.sku,
        productName: a.productName,
        category: a.category,
        ownerId: a.ownerId,
        ownerName: a.ownerName,
        qtyPhysical: a.qtyPhysical,
        costStatus: a.costStatus,
        purchaseUnitCostCop: a.purchaseUnitCostCop,
        inboundShippingUnitCostCop: extra.inboundShippingUnitCostCop,
        otherAcquisitionUnitCostCop: extra.otherAcquisitionUnitCostCop,
        realUnitAcquisitionCostCop: realUnit,
        packagingUnitCostCop: extra.packagingUnitCostCop,
        attributableAdvertisingUnitCop: extra.attributableAdvertisingUnitCop,
        totalDirectUnitCostCop: totalDirectUnit,
        totalLotValuationCop: realUnit === null ? null : realUnit * a.qtyPhysical
      };
    });
}

// ============================================================================
// 3. AUTORIZACIÓN MANUAL DE PRECIOS E HISTORIAL INMUTABLE (Regla 14)
// ============================================================================
export function authorizeSkuCommercialPricing(
  input: {
    sku: string;
    normalSalePriceCop: number;
    promotionalPriceCop: number | null;
    minimumAllowedPriceCop: number;
    maxDiscountPct: number;
    changeReason: string;
  },
  actorEmail: string,
  targetFinState?: FinancialAccountingStoreState
): ImmutablePriceHistoryRecord {
  const finState = targetFinState ?? getFinancialAccountingState();
  const cfg = finState.skuPricing[input.sku];
  if (!cfg) {
    throw new Error(`SKU "${input.sku}" no encontrado en configuración de precios.`);
  }

  if (
    !Number.isFinite(input.normalSalePriceCop) ||
    !Number.isFinite(input.minimumAllowedPriceCop) ||
    input.normalSalePriceCop <= 0 ||
    input.minimumAllowedPriceCop <= 0
  ) {
    throw new Error('El precio normal y el precio mínimo deben ser valores finitos mayores a 0 COP.');
  }
  if (input.minimumAllowedPriceCop > input.normalSalePriceCop) {
    throw new Error('El precio mínimo no puede ser superior al precio normal.');
  }
  if (
    input.promotionalPriceCop !== null &&
    (!Number.isFinite(input.promotionalPriceCop) ||
      input.promotionalPriceCop < input.minimumAllowedPriceCop)
  ) {
    throw new Error(
      `El precio promocional (${input.promotionalPriceCop} COP) no puede ser inferior al precio mínimo autorizado (${input.minimumAllowedPriceCop} COP).`
    );
  }
  if (!Number.isFinite(input.maxDiscountPct) || input.maxDiscountPct < 0 || input.maxDiscountPct > 100) {
    throw new Error('El descuento máximo debe estar entre 0% y 100%.');
  }
  if (!input.changeReason || input.changeReason.trim().length < 5) {
    throw new Error('Debe documentar el motivo de autorización del precio.');
  }

  const minAfterMaxDisc = Math.round(
    input.normalSalePriceCop * (1 - input.maxDiscountPct / 100)
  );
  if (minAfterMaxDisc < input.minimumAllowedPriceCop) {
    throw new Error(
      `El descuento máximo (${input.maxDiscountPct}%) llevaría el precio a ${minAfterMaxDisc} COP, vulnerando el precio mínimo autorizado (${input.minimumAllowedPriceCop} COP).`
    );
  }

  const prevPrice = cfg.normalSalePriceCop;
  const costSnap = cfg.referenceLotCostCop;
  const marginPct =
    costSnap !== null && input.normalSalePriceCop > 0
      ? Number(
          (
            ((input.normalSalePriceCop - costSnap) / input.normalSalePriceCop) *
            100
          ).toFixed(2)
        )
      : null;
  const markupPct =
    costSnap !== null && costSnap > 0
      ? Number(
          (((input.normalSalePriceCop - costSnap) / costSnap) * 100).toFixed(2)
        )
      : null;

  const nowIso = new Date().toISOString();
  cfg.normalSalePriceCop = input.normalSalePriceCop;
  cfg.promotionalPriceCop = input.promotionalPriceCop;
  cfg.minimumAllowedPriceCop = input.minimumAllowedPriceCop;
  cfg.maxDiscountPct = input.maxDiscountPct;
  cfg.updatedAt = nowIso;

  const historyEntry: ImmutablePriceHistoryRecord = Object.freeze({
    id: `PRH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sku: cfg.sku,
    productName: cfg.productName,
    previousNormalPriceCop: prevPrice,
    newNormalPriceCop: input.normalSalePriceCop,
    promotionalPriceCop: input.promotionalPriceCop,
    minimumAllowedPriceCop: input.minimumAllowedPriceCop,
    maxDiscountPct: input.maxDiscountPct,
    baseUnitCostSnapshotCop: costSnap,
    grossMarginPct: marginPct,
    markupPct,
    changeReason: input.changeReason.trim(),
    approvedBy: actorEmail,
    createdAt: nowIso,
    immutable: true
  });

  finState.priceHistory.unshift(historyEntry);
  if (!targetFinState) {
    saveFinancialAccountingState(finState);
    const invState = getInventoryPurchaseState();
    if (invState.catalog[cfg.sku]) {
      invState.catalog[cfg.sku].approvedSalePriceCop = input.normalSalePriceCop;
      invState.catalog[cfg.sku].updatedAt = nowIso;
      saveInventoryPurchaseState(invState);
    }
  }
  return historyEntry;
}

// ============================================================================
// 4. CONFIGURACIÓN Y APROBACIÓN DE ACUERDOS MULTIPROPIETARIO
// ============================================================================
export function configureOwnerCommercialAgreement(
  input: {
    ownerId: string;
    ownerName: string;
    status: AgreementStatus;
    distributionModel: DistributionModelType | null;
    storeCommissionPct: number | null;
    ownerSharePct: number | null;
    minimumPriceGuardPct: number | null;
    maxDiscountAllowedPct: number | null;
    commercialAuthorizationMode:
      | 'explicit_owner_approval'
      | 'store_delegated_within_limits'
      | 'admin_joint_signature';
    settlementMethod:
      | 'conciliated_period_cutoff'
      | 'per_collected_order'
      | 'monthly_conciliated'
      | null;
    advertisingResponsibility:
      | 'owner_100_direct'
      | 'store_100_assumed'
      | 'shared_by_agreement_pct'
      | 'per_campaign_explicit'
      | null;
    sharedExpensePolicy: SharedExpensePolicyCriterion | 'excluded_from_shared' | null;
    notes: string;
  },
  actorEmail: string,
  targetFinState?: FinancialAccountingStoreState
): OwnerCommercialAgreement {
  const finState = targetFinState ?? getFinancialAccountingState();
  const ownerId = input.ownerId.trim();
  if (!ownerId) throw new Error('El ID de propietario es obligatorio.');

  let normalizedStoreCommPct = input.storeCommissionPct;
  let normalizedOwnerSharePct = input.ownerSharePct;

  if (input.status === 'active') {
    if (
      !input.distributionModel ||
      !input.settlementMethod ||
      !input.advertisingResponsibility ||
      !input.sharedExpensePolicy
    ) {
      throw new Error(
        'Para activar un acuerdo comercial debe especificar explícitamente modelo de distribución, método de liquidación, responsable de publicidad y política de gastos compartidos. Prohibido inventar porcentajes.'
      );
    }

    if (input.distributionModel === 'attributable_profit') {
      normalizedStoreCommPct = normalizedStoreCommPct ?? 0;
      normalizedOwnerSharePct = normalizedOwnerSharePct ?? 100;
    } else if (normalizedStoreCommPct === null || normalizedOwnerSharePct === null) {
      throw new Error(
        'Para este modelo de distribución debe especificar explícitamente % comisión REAL TWS y % participación del propietario.'
      );
    }

    if (
      !Number.isFinite(normalizedStoreCommPct) ||
      !Number.isFinite(normalizedOwnerSharePct) ||
      normalizedStoreCommPct < 0 ||
      normalizedStoreCommPct > 100 ||
      normalizedOwnerSharePct < 0 ||
      normalizedOwnerSharePct > 100
    ) {
      throw new Error('Los porcentajes del acuerdo comercial deben estar entre 0% y 100%.');
    }

    if (
      input.distributionModel === 'profit_split_pct' &&
      Math.abs(normalizedStoreCommPct + normalizedOwnerSharePct - 100) > 0.01
    ) {
      throw new Error(
        `En el modelo profit_split_pct, la suma de comisión REAL TWS (${normalizedStoreCommPct}%) y participación del propietario (${normalizedOwnerSharePct}%) debe ser exactamente 100%.`
      );
    }
  }

  const nowIso = new Date().toISOString();
  const existing = finState.agreements[ownerId];
  const code = existing?.agreementCode || `AGR-${ownerId.replace('OWN-', '')}`;

  const updated: OwnerCommercialAgreement = {
    id: code,
    agreementCode: code,
    ownerId,
    ownerName: input.ownerName.trim() || existing?.ownerName || ownerId,
    status: input.status,
    distributionModel: input.distributionModel,
    storeCommissionPct: normalizedStoreCommPct,
    ownerSharePct: normalizedOwnerSharePct,
    minimumPriceGuardPct: input.minimumPriceGuardPct,
    maxDiscountAllowedPct: input.maxDiscountAllowedPct,
    commercialAuthorizationMode: input.commercialAuthorizationMode,
    settlementMethod: input.settlementMethod,
    advertisingResponsibility: input.advertisingResponsibility,
    sharedExpensePolicy: input.sharedExpensePolicy,
    effectiveFrom: input.status === 'active' ? nowIso.slice(0, 10) : null,
    approvedBy: input.status === 'active' ? actorEmail : null,
    approvedAt: input.status === 'active' ? nowIso : null,
    notes: input.notes.trim(),
    updatedAt: nowIso
  };

  finState.agreements[ownerId] = updated;

  // Solo regularizar ventas previamente marcadas PENDING_AGREEMENT al activar por primera vez;
  // nunca alterar retrospectivamente snapshots históricos ya liquidados o con acuerdo previo calculado.
  if (updated.status === 'active') {
    for (const idx of finState.salesAllocations.keys()) {
      const sale = finState.salesAllocations[idx];
      if (sale.ownerId === ownerId && sale.commissionStatus === 'PENDING_AGREEMENT') {
        const recalc = computeSaleCommissionAndOwnerProfit(
          sale.netRevenueCop,
          sale.grossProfitBeforeCommissionCop,
          updated
        );
        finState.salesAllocations[idx] = Object.freeze({
          ...sale,
          storeCommissionCop: recalc.storeCommissionCop,
          attributableOwnerProfitCop: recalc.attributableOwnerProfitCop,
          commissionStatus: recalc.commissionStatus
        });
      }
    }
  }

  if (!targetFinState) saveFinancialAccountingState(finState);
  return updated;
}

export function computeSaleCommissionAndOwnerProfit(
  netRevenueCop: number,
  grossProfitBeforeCommissionCop: number,
  agreement: OwnerCommercialAgreement | undefined
): {
  storeCommissionCop: number | null;
  attributableOwnerProfitCop: number;
  commissionStatus: 'PENDING_AGREEMENT' | 'CALCULATED_BY_AGREEMENT';
} {
  if (
    !agreement ||
    agreement.status !== 'active' ||
    agreement.storeCommissionPct === null ||
    !agreement.distributionModel
  ) {
    return {
      storeCommissionCop: null,
      attributableOwnerProfitCop: grossProfitBeforeCommissionCop,
      commissionStatus: 'PENDING_AGREEMENT'
    };
  }

  if (agreement.distributionModel === 'attributable_profit') {
    return {
      storeCommissionCop: 0,
      attributableOwnerProfitCop: grossProfitBeforeCommissionCop,
      commissionStatus: 'CALCULATED_BY_AGREEMENT'
    };
  }

  if (agreement.distributionModel === 'store_commission_pct') {
    const comm = Math.round(
      Math.max(0, netRevenueCop) * (agreement.storeCommissionPct / 100)
    );
    return {
      storeCommissionCop: comm,
      attributableOwnerProfitCop: grossProfitBeforeCommissionCop - comm,
      commissionStatus: 'CALCULATED_BY_AGREEMENT'
    };
  }

  // profit_split_pct / fixed_margin / custom_documented
  const comm = Math.round(
    Math.max(0, grossProfitBeforeCommissionCop) *
      (agreement.storeCommissionPct / 100)
  );
  return {
    storeCommissionCop: comm,
    attributableOwnerProfitCop: grossProfitBeforeCommissionCop - comm,
    commissionStatus: 'CALCULATED_BY_AGREEMENT'
  };
}

// ============================================================================
// 5. ATRIBUCIÓN DE VENTAS DESPACHADAS Y PRORRATEO DOCUMENTADO DE DESCUENTOS Y DEVOLUCIONES
//    Sin duplicar ingresos y sin mezclar propietarios.
// ============================================================================
export function txRecordMultiOwnerDispatchedSale(
  input: {
    orderNumber: string;
    saleDate: string;
    sku: string;
    productName: string;
    unitSalePriceCop: number;
    totalOrderLineDiscountCop: number;
    collectedRatioPct: number; // 0..100 para diferenciar utilidad devengada vs dinero cobrado
    slices: Array<{
      lotAllocationId: string;
      lotId: string;
      ownerId: string;
      ownerName: string;
      qtyDispatched: number;
      unitAcquisitionCostCop: number;
      packagingDirectExpenseCop?: number;
      attributableAdvertisingCop?: number;
    }>;
  },
  targetFinState?: FinancialAccountingStoreState
): DispatchedSaleAllocationRecord[] {
  const finState = targetFinState ?? getFinancialAccountingState();

  if (!input.slices || input.slices.length === 0) {
    throw new Error('La venta debe tener al menos una asignación de lote y propietario.');
  }

  const totalUnitsDispatched = input.slices.reduce(
    (s, x) => s + x.qtyDispatched,
    0
  );
  if (totalUnitsDispatched <= 0) {
    throw new Error('La cantidad despachada total debe ser > 0.');
  }

  const totalLineGrossCop = totalUnitsDispatched * input.unitSalePriceCop;
  const totalDiscountCop = Math.max(0, input.totalOrderLineDiscountCop || 0);
  if (totalDiscountCop > totalLineGrossCop) {
    throw new Error('El descuento total no puede superar el ingreso bruto de la venta.');
  }

  const collectedPct = Math.max(0, Math.min(100, input.collectedRatioPct ?? 100));
  const createdRecords: DispatchedSaleAllocationRecord[] = [];
  let discountAllocatedSoFar = 0;

  input.slices.forEach((slice, idx) => {
    if (slice.qtyDispatched <= 0) {
      throw new Error('Cada lote atribuido debe despachar al menos 1 unidad.');
    }

    const sliceGross = slice.qtyDispatched * input.unitSalePriceCop;
    // Prorrateo exacto proporcional a las unidades despachadas sin perder ni duplicar 1 peso
    const sliceDiscount =
      idx === input.slices.length - 1
        ? totalDiscountCop - discountAllocatedSoFar
        : Math.round((totalDiscountCop * slice.qtyDispatched) / totalUnitsDispatched);
    discountAllocatedSoFar += sliceDiscount;

    const sliceNetRevenue = sliceGross - sliceDiscount;
    const sliceCogs = slice.qtyDispatched * slice.unitAcquisitionCostCop;
    const slicePkg = slice.packagingDirectExpenseCop ?? 0;
    const sliceAd = slice.attributableAdvertisingCop ?? 0;
    const grossProfit = sliceNetRevenue - sliceCogs - slicePkg - sliceAd;

    const agreement = finState.agreements[slice.ownerId];
    const commCalc = computeSaleCommissionAndOwnerProfit(
      sliceNetRevenue,
      grossProfit,
      agreement
    );

    const collectedCash = Math.round(sliceNetRevenue * (collectedPct / 100));
    const uncollected = sliceNetRevenue - collectedCash;

    const rec: DispatchedSaleAllocationRecord = Object.freeze({
      id: `SIA-${input.orderNumber}-${input.sku}-${slice.lotAllocationId}-${idx + 1}`,
      allocationSaleCode: `SIA-${input.orderNumber}-${input.sku}-${idx + 1}`,
      orderNumber: input.orderNumber,
      saleDate: input.saleDate,
      sku: input.sku,
      productName: input.productName,
      lotAllocationId: slice.lotAllocationId,
      lotId: slice.lotId,
      ownerId: slice.ownerId,
      ownerName: slice.ownerName,
      qtyDispatched: slice.qtyDispatched,
      qtyReturned: 0,
      netQtySold: slice.qtyDispatched,
      unitSalePriceCop: input.unitSalePriceCop,
      grossRevenueCop: sliceGross,
      proratedDiscountCop: sliceDiscount,
      proratedReturnAmountCop: 0,
      netRevenueCop: sliceNetRevenue,
      unitAcquisitionCostCop: slice.unitAcquisitionCostCop,
      cogsTotalCop: sliceCogs,
      packagingDirectExpenseCop: slicePkg,
      attributableAdvertisingCop: sliceAd,
      grossProfitBeforeCommissionCop: grossProfit,
      storeCommissionCop: commCalc.storeCommissionCop,
      attributableOwnerProfitCop: commCalc.attributableOwnerProfitCop,
      commissionStatus: commCalc.commissionStatus,
      collectedCashCop: collectedCash,
      uncollectedReceivableCop: uncollected,
      prorationDocumentation: `Prorrateo por unidades despachadas (${slice.qtyDispatched}/${totalUnitsDispatched} unid. = ${((slice.qtyDispatched / totalUnitsDispatched) * 100).toFixed(1)}%). Descuento asignado: ${sliceDiscount} COP.`,
      immutable: true
    });

    createdRecords.push(rec);
    finState.salesAllocations.unshift(rec);
  });

  if (!targetFinState) saveFinancialAccountingState(finState);
  return createdRecords;
}

export function txRecordReturnOnDispatchedSale(
  input: {
    allocationSaleId: string;
    qtyToReturn: number;
    reason: string;
  },
  targetFinState?: FinancialAccountingStoreState
): DispatchedSaleAllocationRecord {
  const finState = targetFinState ?? getFinancialAccountingState();
  const idx = finState.salesAllocations.findIndex(
    (s) => s.id === input.allocationSaleId
  );
  if (idx === -1) {
    throw new Error(`No existe la atribución de venta ${input.allocationSaleId}.`);
  }

  const current = finState.salesAllocations[idx];
  const newReturned = current.qtyReturned + input.qtyToReturn;
  if (input.qtyToReturn <= 0 || newReturned > current.qtyDispatched) {
    throw new Error(
      `Cantidad a devolver inválida (${input.qtyToReturn}). Despachadas: ${current.qtyDispatched}, ya devueltas: ${current.qtyReturned}.`
    );
  }

  const netUnitEffectivePrice =
    (current.grossRevenueCop - current.proratedDiscountCop) / current.qtyDispatched;
  const returnAmountCop = Math.round(netUnitEffectivePrice * newReturned);
  const netQtySold = current.qtyDispatched - newReturned;
  const netRevenueCop =
    current.grossRevenueCop - current.proratedDiscountCop - returnAmountCop;
  const cogsTotalCop = netQtySold * current.unitAcquisitionCostCop;
  const grossProfit =
    netRevenueCop -
    cogsTotalCop -
    current.packagingDirectExpenseCop -
    current.attributableAdvertisingCop;

  const agreement = finState.agreements[current.ownerId];
  const commCalc = computeSaleCommissionAndOwnerProfit(
    netRevenueCop,
    grossProfit,
    agreement
  );

  const updated: DispatchedSaleAllocationRecord = Object.freeze({
    ...current,
    qtyReturned: newReturned,
    netQtySold,
    proratedReturnAmountCop: returnAmountCop,
    netRevenueCop,
    cogsTotalCop,
    grossProfitBeforeCommissionCop: grossProfit,
    storeCommissionCop: commCalc.storeCommissionCop,
    attributableOwnerProfitCop: commCalc.attributableOwnerProfitCop,
    collectedCashCop: Math.min(current.collectedCashCop, netRevenueCop),
    uncollectedReceivableCop: Math.max(0, netRevenueCop - current.collectedCashCop),
    prorationDocumentation: `${current.prorationDocumentation} | Devolución documentada: ${newReturned} unid. (-${returnAmountCop} COP ingreso, -${newReturned * current.unitAcquisitionCostCop} COP COGS). Motivo: ${input.reason}`
  });

  finState.salesAllocations[idx] = updated;
  if (!targetFinState) saveFinancialAccountingState(finState);
  return updated;
}

export function txSyncDispatchedOrderPaymentCollection(
  input: {
    orderNumber: string;
    collectedRatioPct: number;
  },
  targetFinState?: FinancialAccountingStoreState
): number {
  const finState = targetFinState ?? getFinancialAccountingState();
  const clampedPct = Math.max(0, Math.min(100, input.collectedRatioPct));
  let updatedCount = 0;

  finState.salesAllocations = finState.salesAllocations.map((sale) => {
    if (sale.orderNumber !== input.orderNumber) return sale;
    const collectedCash = Math.round(Math.max(0, sale.netRevenueCop) * (clampedPct / 100));
    const uncollected = Math.max(0, sale.netRevenueCop - collectedCash);
    updatedCount += 1;
    return Object.freeze({
      ...sale,
      collectedCashCop: collectedCash,
      uncollectedReceivableCop: uncollected
    });
  });

  if (updatedCount > 0 && !targetFinState) {
    saveFinancialAccountingState(finState);
  }
  return updatedCount;
}

// ============================================================================
// 6. REGISTRO DE GASTOS DIRECTOS Y COMPARTIDOS (BLOQUEO DE CRITERIOS NO APROBADOS)
// ============================================================================
export function txRegisterAndAllocateExpense(
  input: {
    expenseCode: string;
    expenseDate: string;
    expenseScope: 'direct_owner' | 'shared_multi_owner' | 'store_internal';
    category: FinancialExpenseRecord['category'];
    description: string;
    totalAmountCop: number;
    allocationCriterion: FinancialExpenseRecord['allocationCriterion'];
    approvalStatus: 'draft_unapproved' | 'approved' | 'rejected';
    directOwnerId?: string;
    manualSlices?: Array<{ ownerId: string; ownerName: string; percentage: number }>;
    notes: string;
  },
  actorEmail: string,
  targetFinState?: FinancialAccountingStoreState
): FinancialExpenseRecord {
  const finState = targetFinState ?? getFinancialAccountingState();
  const invState = getInventoryPurchaseState();
  const expenseCode = input.expenseCode.trim();

  if (!expenseCode) {
    throw new Error('El código de gasto es obligatorio.');
  }
  if (finState.expenses.some((e) => e.expenseCode === expenseCode)) {
    throw new Error(`El gasto con código "${expenseCode}" ya fue registrado anteriormente.`);
  }
  if (!isValidNonNegativeAmount(input.totalAmountCop) || input.totalAmountCop <= 0) {
    throw new Error('El valor total del gasto debe ser un monto válido mayor a 0 COP.');
  }

  // Regla obligatoria: No aplicar criterios no aprobados
  if (input.approvalStatus !== 'approved') {
    throw new Error(
      `BLOQUEO DE CRITERIO NO APROBADO: El gasto "${expenseCode}" tiene estado "${input.approvalStatus}". Prohibido aplicar o distribuir gastos cuyo criterio no haya sido aprobado explícitamente.`
    );
  }

  const slices: ExpenseOwnerAllocationSlice[] = [];

  if (input.expenseScope === 'direct_owner') {
    const ownerId = (input.directOwnerId || '').trim();
    if (!ownerId) {
      throw new Error('Para un gasto directo es obligatorio seleccionar el propietario afectado.');
    }
    const agr = finState.agreements[ownerId];
    const ownerObj = invState.owners.find((o) => o.id === ownerId);
    slices.push({
      ownerId,
      ownerName: agr?.ownerName || ownerObj?.fullName || ownerId,
      allocatedAmountCop: input.totalAmountCop,
      allocationPercentage: 100,
      basisValue: input.totalAmountCop,
      justificationNote: `Gasto directo 100% atribuido a ${ownerId}: ${input.description}`
    });
  } else if (input.expenseScope === 'shared_multi_owner') {
    if (
      ![
        'proportional_net_sales',
        'proportional_cogs',
        'proportional_units_sold',
        'manual_explicit'
      ].includes(input.allocationCriterion)
    ) {
      throw new Error(
        `Criterio "${input.allocationCriterion}" inválido para gasto compartido multipropietario.`
      );
    }

    if (input.allocationCriterion === 'manual_explicit') {
      if (!input.manualSlices || input.manualSlices.length === 0) {
        throw new Error('El criterio manual explícito requiere definir los porcentajes por propietario.');
      }
      const sumPct = input.manualSlices.reduce((s, m) => s + m.percentage, 0);
      if (Math.abs(sumPct - 100) > 0.01) {
        throw new Error(`Los porcentajes manuales deben sumar exactamente 100% (actual: ${sumPct}%).`);
      }
      let accumCop = 0;
      input.manualSlices.forEach((m, idx) => {
        const amt =
          idx === input.manualSlices!.length - 1
            ? input.totalAmountCop - accumCop
            : Math.round((input.totalAmountCop * m.percentage) / 100);
        accumCop += amt;
        slices.push({
          ownerId: m.ownerId,
          ownerName: m.ownerName,
          allocatedAmountCop: amt,
          allocationPercentage: m.percentage,
          basisValue: m.percentage,
          justificationNote: `Prorrateo manual aprobado (${m.percentage}%) por ${actorEmail}`
        });
      });
    } else {
      // Calcular base por propietario (incluye propietarios activos en invState.owners)
      // excluyendo explícitamente quienes tengan sharedExpensePolicy === 'excluded_from_shared'
      const ownerIds = Array.from(
        new Set([
          ...Object.keys(finState.agreements),
          ...invState.owners.filter((o) => o.status === 'active').map((o) => o.id)
        ])
      ).filter(
        (oid) => finState.agreements[oid]?.sharedExpensePolicy !== 'excluded_from_shared'
      );

      const basisByOwner: Array<{ ownerId: string; ownerName: string; basis: number }> =
        ownerIds.map((oid) => {
          const ownerSales = finState.salesAllocations.filter((s) => s.ownerId === oid);
          const ownerObj = invState.owners.find((o) => o.id === oid);
          const basis =
            input.allocationCriterion === 'proportional_net_sales'
              ? ownerSales.reduce((acc, s) => acc + s.netRevenueCop, 0)
              : input.allocationCriterion === 'proportional_cogs'
                ? ownerSales.reduce((acc, s) => acc + s.cogsTotalCop, 0)
                : ownerSales.reduce((acc, s) => acc + s.netQtySold, 0);
          return {
            ownerId: oid,
            ownerName: finState.agreements[oid]?.ownerName || ownerObj?.fullName || oid,
            basis
          };
        }).filter((b) => b.basis > 0);

      const totalBasis = basisByOwner.reduce((s, b) => s + b.basis, 0);
      if (totalBasis <= 0) {
        throw new Error(
          `No existe base positiva para prorratear mediante "${input.allocationCriterion}" en el periodo.`
        );
      }

      let accumCop = 0;
      basisByOwner.forEach((b, idx) => {
        const pct = Number(((b.basis / totalBasis) * 100).toFixed(4));
        const amt =
          idx === basisByOwner.length - 1
            ? input.totalAmountCop - accumCop
            : Math.round((input.totalAmountCop * b.basis) / totalBasis);
        accumCop += amt;
        slices.push({
          ownerId: b.ownerId,
          ownerName: b.ownerName,
          allocatedAmountCop: amt,
          allocationPercentage: pct,
          basisValue: b.basis,
          justificationNote: `Prorrateo aprobado por ${input.allocationCriterion} (Base: ${b.basis} / ${totalBasis} = ${pct}%)`
        });
      });
    }
  }

  const nowIso = new Date().toISOString();
  const expense: FinancialExpenseRecord = Object.freeze({
    id: input.expenseCode.trim(),
    expenseCode: input.expenseCode.trim(),
    expenseDate: input.expenseDate,
    expenseScope: input.expenseScope,
    category: input.category,
    description: input.description.trim(),
    totalAmountCop: input.totalAmountCop,
    allocationCriterion: input.allocationCriterion,
    approvalStatus: 'approved',
    approvedBy: actorEmail,
    notes: input.notes.trim(),
    createdAt: nowIso,
    slices,
    immutable: true
  });

  finState.expenses.unshift(expense);
  if (!targetFinState) saveFinancialAccountingState(finState);
  return expense;
}

// ============================================================================
// 7. ESTADO DE CUENTA INDIVIDUAL POR PROPIETARIO Y REPORTE CONSOLIDADO
// ============================================================================
export function buildOwnerAccountStatements(
  finState: FinancialAccountingStoreState,
  options?: { periodStart?: string; periodEnd?: string }
): OwnerAccountStatement[] {
  const invState = getInventoryPurchaseState();
  const ownerIds = Array.from(
    new Set([
      ...Object.keys(finState.agreements),
      ...invState.owners.map((o) => o.id)
    ])
  );
  const periodStart = options?.periodStart?.trim() || '';
  const periodEnd = options?.periodEnd?.trim() || '';
  const inPeriod = (dateStr: string) => {
    if (!periodStart && !periodEnd) return true;
    const d = dateStr.slice(0, 10);
    if (periodStart && d < periodStart) return false;
    if (periodEnd && d > periodEnd) return false;
    return true;
  };

  return ownerIds.map((ownerId) => {
    const ownerRecord = invState.owners.find((o) => o.id === ownerId);
    const agreement =
      finState.agreements[ownerId] || {
        ...createInitialEbertoAgreement(),
        id: `AGR-${ownerId}`,
        agreementCode: `AGR-${ownerId}`,
        ownerId,
        ownerName: ownerRecord?.fullName || ownerId
      };

    const agreementIsPending = agreement.status !== 'active';
    const ownerAllocs = invState.allocations.filter((a) => a.ownerId === ownerId);
    const skusSet = new Set(ownerAllocs.map((a) => a.sku));
    const physicalUnits = ownerAllocs.reduce((s, a) => s + a.qtyPhysical, 0);
    const invValuation = ownerAllocs.reduce(
      (s, a) => s + (a.effectiveUnitCostCop ?? 0) * a.qtyPhysical,
      0
    );

    const sales = finState.salesAllocations.filter(
      (s) => s.ownerId === ownerId && inPeriod(s.saleDate)
    );
    const dispatchedUnitsGross = sales.reduce((s, x) => s + x.qtyDispatched, 0);
    const returnedUnits = sales.reduce((s, x) => s + x.qtyReturned, 0);
    const netUnitsSold = sales.reduce((s, x) => s + x.netQtySold, 0);
    const grossSalesCop = sales.reduce((s, x) => s + x.grossRevenueCop, 0);
    const discountsProratedCop = sales.reduce((s, x) => s + x.proratedDiscountCop, 0);
    const returnsProratedCop = sales.reduce((s, x) => s + x.proratedReturnAmountCop, 0);
    const netSalesCop = sales.reduce((s, x) => s + x.netRevenueCop, 0);
    const cogsSoldCop = sales.reduce((s, x) => s + x.cogsTotalCop, 0);
    const packagingAndDirectSaleExpensesCop = sales.reduce(
      (s, x) => s + x.packagingDirectExpenseCop,
      0
    );
    const saleLevelAdCop = sales.reduce(
      (s, x) => s + x.attributableAdvertisingCop,
      0
    );

    let directOwnerExpensesCop = 0;
    let sharedAllocatedExpensesCop = 0;
    let expenseLevelAdCop = 0;

    for (const exp of finState.expenses) {
      if (exp.approvalStatus !== 'approved') continue;
      if (!inPeriod(exp.expenseDate)) continue;
      for (const sl of exp.slices) {
        if (sl.ownerId !== ownerId) continue;
        if (exp.category === 'Publicidad Atribuible') {
          expenseLevelAdCop += sl.allocatedAmountCop;
        } else if (exp.expenseScope === 'direct_owner') {
          directOwnerExpensesCop += sl.allocatedAmountCop;
        } else if (exp.expenseScope === 'shared_multi_owner') {
          sharedAllocatedExpensesCop += sl.allocatedAmountCop;
        }
      }
    }

    const attributableAdvertisingCop = saleLevelAdCop + expenseLevelAdCop;
    const totalExpensesCop =
      packagingAndDirectSaleExpensesCop +
      directOwnerExpensesCop +
      sharedAllocatedExpensesCop +
      attributableAdvertisingCop;

    const grossProfitCop = netSalesCop - cogsSoldCop;
    const storeCommissionCop = agreementIsPending
      ? null
      : sales.reduce((s, x) => s + (x.storeCommissionCop ?? 0), 0);

    const attributableNetProfitCop =
      grossProfitCop - totalExpensesCop - (storeCommissionCop ?? 0);

    const collectedCashFromSalesCop = sales.reduce(
      (s, x) => s + x.collectedCashCop,
      0
    );
    const uncollectedReceivablesCop = sales.reduce(
      (s, x) => s + x.uncollectedReceivableCop,
      0
    );

    const paidSettlements = finState.settlements.filter(
      (st) => st.ownerId === ownerId && st.approvalState === 'paid_documented' && inPeriod(st.settlementDate)
    );
    const pendingSettlements = finState.settlements.filter(
      (st) => st.ownerId === ownerId && st.approvalState === 'approved_pending_payment' && inPeriod(st.settlementDate)
    );
    const previousSettledPaymentsCop = paidSettlements.reduce(
      (s, st) => s + st.amountApprovedToSettleCop,
      0
    );
    const pendingPaymentSettlementsCop = pendingSettlements.reduce(
      (s, st) => s + st.amountApprovedToSettleCop,
      0
    );

    const previousBalanceCop = 0;
    const finalConciliatedBalanceCop =
      previousBalanceCop + attributableNetProfitCop - previousSettledPaymentsCop;

    // Diferenciar utilidad devengada vs dinero efectivamente recaudado y no comprometido aún en otra orden de pago
    const collectableAttributableProfitCop =
      finalConciliatedBalanceCop -
      uncollectedReceivablesCop -
      pendingPaymentSettlementsCop;

    let canSettle = true;
    let settlementBlockReason: string | null = null;

    if (agreementIsPending) {
      canSettle = false;
      settlementBlockReason =
        'PENDIENTE DE CONFIGURAR: El propietario no tiene un acuerdo comercial ACTIVO configurado.';
    } else if (finalConciliatedBalanceCop <= 0) {
      canSettle = false;
      settlementBlockReason = `SALDO NO LIQUIDABLE (${finalConciliatedBalanceCop} COP): El saldo conciliado debe ser positivo (> 0 COP).`;
    } else if (collectableAttributableProfitCop <= 0) {
      canSettle = false;
      settlementBlockReason =
        'CARTERA PENDIENTE O SALDO YA COMPROMETIDO: Las ventas no han sido recaudadas o ya cuentan con liquidación aprobada pendiente de pago.';
    }

    return {
      ownerId,
      ownerName: agreement.ownerName,
      agreement,
      agreementIsPending,
      associatedSkusCount: skusSet.size,
      activeLotsCount: ownerAllocs.length,
      physicalUnitsInWarehouse: physicalUnits,
      inventoryValuationCop: invValuation,
      dispatchedUnitsGross,
      returnedUnits,
      netUnitsSold,
      grossSalesCop,
      discountsProratedCop,
      returnsProratedCop,
      netSalesCop,
      cogsSoldCop,
      packagingAndDirectSaleExpensesCop,
      directOwnerExpensesCop,
      sharedAllocatedExpensesCop,
      attributableAdvertisingCop,
      totalExpensesCop,
      grossProfitCop,
      storeCommissionCop,
      attributableNetProfitCop,
      collectedCashFromSalesCop,
      uncollectedReceivablesCop,
      collectableAttributableProfitCop,
      previousBalanceCop,
      previousSettledPaymentsCop,
      pendingPaymentSettlementsCop,
      finalConciliatedBalanceCop,
      canSettle,
      settlementBlockReason
    };
  });
}

// ============================================================================
// 8. LIQUIDACIONES BAJO CONCILIACIÓN MANUAL (SIN LIQUIDAR NI PAGAR AUTOMÁTICAMENTE)
// ============================================================================
export function txCreateConciliatedSettlement(
  input: {
    settlementCode: string;
    ownerId: string;
    periodStart: string;
    periodEnd: string;
    amountToSettleCop: number;
    voucherReference: string;
    isConciliatedConfirmed: boolean;
    notes: string;
  },
  actorEmail: string,
  targetFinState?: FinancialAccountingStoreState
): OwnerSettlementRecord {
  const finState = targetFinState ?? getFinancialAccountingState();
  const code = input.settlementCode.trim();
  if (!code) {
    throw new Error('El código de liquidación es obligatorio.');
  }
  if (finState.settlements.some((s) => s.settlementCode === code)) {
    throw new Error(`El código de liquidación "${code}" ya existe. Use un código único.`);
  }
  if (!input.periodStart?.trim() || !input.periodEnd?.trim() || input.periodStart > input.periodEnd) {
    throw new Error('El rango de fechas de liquidación es inválido (Inicio debe ser <= Fin).');
  }

  if (!input.isConciliatedConfirmed) {
    throw new Error(
      'REGLA DE CONCILIACIÓN: Prohibido realizar liquidaciones sin confirmar primero la conciliación de inventario, ventas, devoluciones y gastos.'
    );
  }

  const overallStatements = buildOwnerAccountStatements(finState);
  const st = overallStatements.find((s) => s.ownerId === input.ownerId);
  if (!st) {
    throw new Error(`No existe estado de cuenta para el propietario "${input.ownerId}".`);
  }

  if (st.agreementIsPending) {
    throw new Error(
      `BLOQUEO POR ACUERDO NO CONFIGURADO: El propietario ${st.ownerId} (${st.ownerName}) se encuentra en estado PENDIENTE DE CONFIGURAR.`
    );
  }

  if (st.finalConciliatedBalanceCop <= 0) {
    throw new Error(
      `BLOQUEO POR SALDO NEGATIVO O CERO: El saldo final de ${st.ownerId} es ${st.finalConciliatedBalanceCop} COP. No se puede aprobar liquidación.`
    );
  }

  if (!isValidNonNegativeAmount(input.amountToSettleCop) || input.amountToSettleCop <= 0) {
    throw new Error('El monto a liquidar debe ser un valor válido mayor a 0 COP.');
  }

  if (input.amountToSettleCop > st.collectableAttributableProfitCop) {
    throw new Error(
      `El monto solicitado (${input.amountToSettleCop} COP) supera la utilidad efectivamente recaudada y disponible (${st.collectableAttributableProfitCop} COP).`
    );
  }

  if (!input.voucherReference || input.voucherReference.trim().length < 3) {
    throw new Error('Debe registrar el número de comprobante / soporte de conciliación.');
  }

  const periodSt =
    buildOwnerAccountStatements(finState, {
      periodStart: input.periodStart,
      periodEnd: input.periodEnd
    }).find((s) => s.ownerId === input.ownerId) || st;

  const nowIso = new Date().toISOString();
  const remaining =
    st.finalConciliatedBalanceCop - st.pendingPaymentSettlementsCop - input.amountToSettleCop;

  const settlement: OwnerSettlementRecord = Object.freeze({
    id: code,
    settlementCode: code,
    settlementDate: nowIso.slice(0, 10),
    ownerId: st.ownerId,
    ownerName: st.ownerName,
    agreementCode: st.agreement.agreementCode,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    grossSalesPeriodCop: periodSt.grossSalesCop,
    discountsAndReturnsPeriodCop: periodSt.discountsProratedCop + periodSt.returnsProratedCop,
    netSalesPeriodCop: periodSt.netSalesCop,
    cogsPeriodCop: periodSt.cogsSoldCop,
    directExpensesPeriodCop:
      periodSt.directOwnerExpensesCop + periodSt.packagingAndDirectSaleExpensesCop,
    sharedExpensesPeriodCop: periodSt.sharedAllocatedExpensesCop,
    attributableAdPeriodCop: periodSt.attributableAdvertisingCop,
    storeCommissionPeriodCop: periodSt.storeCommissionCop ?? 0,
    attributableProfitPeriodCop: periodSt.attributableNetProfitCop,
    collectedSalesCashCop: periodSt.collectedCashFromSalesCop,
    uncollectedReceivableCop: periodSt.uncollectedReceivablesCop,
    previousBalanceCop: st.previousBalanceCop,
    previousPaymentsCop: st.previousSettledPaymentsCop,
    availableBalanceBeforeSettlementCop:
      st.finalConciliatedBalanceCop - st.pendingPaymentSettlementsCop,
    amountApprovedToSettleCop: input.amountToSettleCop,
    finalRemainingBalanceCop: remaining,
    voucherReference: input.voucherReference.trim(),
    // Regla crítica: "No liquidar automáticamente. No pagar." -> Queda aprobada para trámite manual sin desembolso automático.
    approvalState: 'approved_pending_payment',
    isConciliated: true,
    authorizedBy: actorEmail,
    notes: input.notes.trim(),
    createdAt: nowIso,
    immutable: true
  });

  finState.settlements.unshift(settlement);
  if (!targetFinState) saveFinancialAccountingState(finState);
  return settlement;
}

export function txMarkSettlementPaid(
  input: {
    settlementId: string;
    paymentVoucherReference: string;
  },
  actorEmail: string,
  targetFinState?: FinancialAccountingStoreState
): OwnerSettlementRecord {
  const finState = targetFinState ?? getFinancialAccountingState();
  const idx = finState.settlements.findIndex(
    (s) => s.id === input.settlementId || s.settlementCode === input.settlementId
  );
  if (idx === -1) {
    throw new Error(`No existe la liquidación "${input.settlementId}".`);
  }
  const current = finState.settlements[idx];
  if (current.approvalState === 'paid_documented') {
    throw new Error(`La liquidación ${current.settlementCode} ya figura como PAGADA DOCUMENTADA.`);
  }
  if (!input.paymentVoucherReference || input.paymentVoucherReference.trim().length < 3) {
    throw new Error('Debe indicar el número de soporte o transferencia bancaria del pago.');
  }

  const updated: OwnerSettlementRecord = Object.freeze({
    ...current,
    approvalState: 'paid_documented',
    voucherReference: `${current.voucherReference} | Pago: ${input.paymentVoucherReference.trim()}`,
    notes: `${current.notes ? current.notes + ' | ' : ''}Desembolso confirmado por ${actorEmail}`
  });

  finState.settlements[idx] = updated;
  if (!targetFinState) saveFinancialAccountingState(finState);
  return updated;
}

// ============================================================================
// 9. BATERÍA AUTOMATIZADA DE LAS 8 PRUEBAS OBLIGATORIAS EN SANDBOX AISLADO
// ============================================================================
export function runFinancialAccountingTestSuite(
  actorEmail: string
): FinancialTestScenarioResult[] {
  const results: FinancialTestScenarioResult[] = [];

  // Sandbox aislado en memoria para no contaminar datos reales de producción
  const sandbox: FinancialAccountingStoreState = {
    agreements: {
      'OWN-0001': createInitialEbertoAgreement(), // Inicia en pending_configuration
      'OWN-0002': {
        id: 'AGR-0002',
        agreementCode: 'AGR-0002',
        ownerId: 'OWN-0002',
        ownerName: 'Propietario Asociado Sandbox #2',
        status: 'active',
        distributionModel: 'profit_split_pct',
        storeCommissionPct: 20,
        ownerSharePct: 80,
        minimumPriceGuardPct: 15,
        maxDiscountAllowedPct: 10,
        commercialAuthorizationMode: 'store_delegated_within_limits',
        settlementMethod: 'conciliated_period_cutoff',
        advertisingResponsibility: 'shared_by_agreement_pct',
        sharedExpensePolicy: 'proportional_net_sales',
        effectiveFrom: '2026-11-01',
        approvedBy: actorEmail,
        approvedAt: '2026-11-01T00:00:00.000Z',
        notes: 'Acuerdo sandbox activo 80/20',
        updatedAt: '2026-11-01T00:00:00.000Z'
      },
      'OWN-0003': {
        id: 'AGR-0003',
        agreementCode: 'AGR-0003',
        ownerId: 'OWN-0003',
        ownerName: 'Propietario Sandbox Saldo Negativo #3',
        status: 'active',
        distributionModel: 'attributable_profit',
        storeCommissionPct: 0,
        ownerSharePct: 100,
        minimumPriceGuardPct: 10,
        maxDiscountAllowedPct: 5,
        commercialAuthorizationMode: 'explicit_owner_approval',
        settlementMethod: 'monthly_conciliated',
        advertisingResponsibility: 'owner_100_direct',
        sharedExpensePolicy: 'proportional_net_sales',
        effectiveFrom: '2026-11-01',
        approvedBy: actorEmail,
        approvedAt: '2026-11-01T00:00:00.000Z',
        notes: 'Acuerdo sandbox para prueba de saldo negativo',
        updatedAt: '2026-11-01T00:00:00.000Z'
      }
    },
    lotExtraCosts: {},
    skuPricing: {},
    priceHistory: [],
    salesAllocations: [],
    expenses: [],
    settlements: []
  };

  // --------------------------------------------------------------------------
  // PRUEBA 8 (Evaluada primero sobre OWN-0001 antes de configurar su acuerdo):
  // Acuerdo no configurado -> Mostrar PENDIENTE DE CONFIGURAR y bloquear liquidación
  // --------------------------------------------------------------------------
  txRecordMultiOwnerDispatchedSale(
    {
      orderNumber: 'ORD-SBX-001',
      saleDate: '2026-11-10',
      sku: 'AUD-TWS-001-NEG',
      productName: 'Audífonos M10 Pro',
      unitSalePriceCop: 40000,
      totalOrderLineDiscountCop: 0,
      collectedRatioPct: 100,
      slices: [
        {
          lotAllocationId: 'ALLOC-SBX-1',
          lotId: 'LOT-INI-2026-01',
          ownerId: 'OWN-0001',
          ownerName: 'Eberto',
          qtyDispatched: 2,
          unitAcquisitionCostCop: 11500,
          packagingDirectExpenseCop: 1000
        }
      ]
    },
    sandbox
  );

  const stBeforeAgr = buildOwnerAccountStatements(sandbox).find(
    (s) => s.ownerId === 'OWN-0001'
  )!;
  let unconfiguredSettlementBlocked = false;
  try {
    txCreateConciliatedSettlement(
      {
        settlementCode: 'LIQ-FAIL-NO-AGR',
        ownerId: 'OWN-0001',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
        amountToSettleCop: 10000,
        voucherReference: 'COMP-ERR-01',
        isConciliatedConfirmed: true,
        notes: 'Intento de liquidar sin acuerdo configurado'
      },
      actorEmail,
      sandbox
    );
  } catch {
    unconfiguredSettlementBlocked = true;
  }

  // Ahora activamos un acuerdo en el sandbox para OWN-0001 (10% comisión sobre utilidad) para probar las demás operaciones
  configureOwnerCommercialAgreement(
    {
      ownerId: 'OWN-0001',
      ownerName: 'Eberto',
      status: 'active',
      distributionModel: 'profit_split_pct',
      storeCommissionPct: 10,
      ownerSharePct: 90,
      minimumPriceGuardPct: 20,
      maxDiscountAllowedPct: 10,
      commercialAuthorizationMode: 'explicit_owner_approval',
      settlementMethod: 'conciliated_period_cutoff',
      advertisingResponsibility: 'owner_100_direct',
      sharedExpensePolicy: 'proportional_net_sales',
      notes: 'Acuerdo activado en sandbox para pruebas 1..6'
    },
    actorEmail,
    sandbox
  );

  // --------------------------------------------------------------------------
  // PRUEBA 1: Ventas de un propietario
  // --------------------------------------------------------------------------
  const sale1 = sandbox.salesAllocations.find(
    (s) => s.orderNumber === 'ORD-SBX-001' && s.ownerId === 'OWN-0001'
  )!;
  // 2 unid * 40.000 = 80.000 | COGS = 2 * 11.500 = 23.000 | Empaque = 1.000 | Bruta = 56.000 | Comisión 10% = 5.600 | Utilidad = 50.400
  const test1Passed =
    sale1.netRevenueCop === 80000 &&
    sale1.cogsTotalCop === 23000 &&
    sale1.grossProfitBeforeCommissionCop === 56000 &&
    sale1.storeCommissionCop === 5600 &&
    sale1.attributableOwnerProfitCop === 50400;

  results.push({
    testId: 'FIN-TEST-01',
    title: '1. Ventas de un propietario (Atribución de Ingreso, COGS, Empaque y Comisión)',
    scenario:
      'Venta despachada ORD-SBX-001 de 2 unidades de AUD-TWS-001-NEG de OWN-0001 a $40.000 COP c/u (Costo lote $11.500 COP, Empaque $1.000 COP, acuerdo sandbox 90/10).',
    expected:
      'Venta neta = $80.000, COGS = $23.000, Utilidad bruta = $56.000, Comisión REAL TWS (10%) = $5.600, Utilidad atribuible = $50.400 COP.',
    actual: `Venta neta: $${sale1.netRevenueCop.toLocaleString('es-CO')} | COGS: $${sale1.cogsTotalCop.toLocaleString('es-CO')} | Comisión: $${(sale1.storeCommissionCop ?? 0).toLocaleString('es-CO')} | Utilidad propietario: $${sale1.attributableOwnerProfitCop.toLocaleString('es-CO')} COP.`,
    passed: test1Passed,
    details: [
      'Ingresos atribuidos exclusivamente por unidades realmente despachadas.',
      'Costo de venta tomado exactamente del lote de origen.'
    ]
  });

  // --------------------------------------------------------------------------
  // PRUEBA 2: Ventas repartidas entre dos propietarios (Prorrateo de descuento sin duplicar ingresos)
  // --------------------------------------------------------------------------
  const splitSlices = txRecordMultiOwnerDispatchedSale(
    {
      orderNumber: 'ORD-SBX-SPLIT-002',
      saleDate: '2026-11-11',
      sku: 'AUD-TWS-001-NEG',
      productName: 'Audífonos M10 Pro',
      unitSalePriceCop: 40000,
      totalOrderLineDiscountCop: 6000, // Descuento total en la línea de 3 unidades ($2.000 por unidad)
      collectedRatioPct: 100,
      slices: [
        {
          lotAllocationId: 'ALLOC-SBX-1',
          lotId: 'LOT-INI-2026-01',
          ownerId: 'OWN-0001',
          ownerName: 'Eberto',
          qtyDispatched: 1,
          unitAcquisitionCostCop: 11500
        },
        {
          lotAllocationId: 'ALLOC-SBX-2',
          lotId: 'LOT-OWN2-2026-01',
          ownerId: 'OWN-0002',
          ownerName: 'Propietario Asociado Sandbox #2',
          qtyDispatched: 2,
          unitAcquisitionCostCop: 14000
        }
      ]
    },
    sandbox
  );

  const sumNetSplit = splitSlices.reduce((s, x) => s + x.netRevenueCop, 0);
  const sumDiscSplit = splitSlices.reduce((s, x) => s + x.proratedDiscountCop, 0);
  // 3 unidades * 40.000 - 6.000 = 114.000 COP (OWN-0001 recibe 38.000 netos, OWN-0002 recibe 76.000 netos)
  const test2Passed =
    sumNetSplit === 114000 &&
    sumDiscSplit === 6000 &&
    splitSlices[0].netRevenueCop === 38000 &&
    splitSlices[0].cogsTotalCop === 11500 &&
    splitSlices[1].netRevenueCop === 76000 &&
    splitSlices[1].cogsTotalCop === 28000;

  results.push({
    testId: 'FIN-TEST-02',
    title: '2. Ventas repartidas entre dos propietarios (Cero duplicación de ingresos)',
    scenario:
      'Pedido ORD-SBX-SPLIT-002 por 3 unidades ($120.000 bruto - $6.000 descuento = $114.000 neto): 1 unid. de OWN-0001 (costo $11.500) y 2 unid. de OWN-0002 (costo $14.000).',
    expected:
      'Suma neta exacta = $114.000 COP (OWN-0001: $38.000 netos y COGS $11.500 | OWN-0002: $76.000 netos y COGS $28.000).',
    actual: `Total neto: $${sumNetSplit.toLocaleString('es-CO')} COP (Descuento prorrateado: $${sumDiscSplit.toLocaleString('es-CO')}). OWN-0001: $${splitSlices[0].netRevenueCop.toLocaleString('es-CO')} | OWN-0002: $${splitSlices[1].netRevenueCop.toLocaleString('es-CO')}.`,
    passed: test2Passed,
    details: [
      splitSlices[0].prorationDocumentation,
      splitSlices[1].prorationDocumentation
    ]
  });

  // --------------------------------------------------------------------------
  // PRUEBA 3: Devoluciones (Reversión proporcional de ingreso neto y COGS)
  // --------------------------------------------------------------------------
  const returnedSlice = txRecordReturnOnDispatchedSale(
    {
      allocationSaleId: splitSlices[1].id, // OWN-0002 había despachado 2 unidades (neto 76.000, COGS 28.000)
      qtyToReturn: 1,
      reason: 'Devolución de 1 unidad por garantía'
    },
    sandbox
  );
  // Al devolver 1 de las 2 unidades de OWN-0002: netQtySold pasa a 1, ingreso neto pasa a 38.000, COGS pasa a 14.000
  const test3Passed =
    returnedSlice.netQtySold === 1 &&
    returnedSlice.proratedReturnAmountCop === 38000 &&
    returnedSlice.netRevenueCop === 38000 &&
    returnedSlice.cogsTotalCop === 14000;

  results.push({
    testId: 'FIN-TEST-03',
    title: '3. Devoluciones sobre ventas (Ajuste documentado de ingreso neto y COGS)',
    scenario:
      'Devolución de 1 de las 2 unidades vendidas de OWN-0002 en el pedido compartido.',
    expected:
      'Unidades netas vendidas = 1, Devolución = $38.000 COP, Venta neta ajustada = $38.000 COP y COGS ajustado = $14.000 COP.',
    actual: `Unid. netas: ${returnedSlice.netQtySold} | Devolución: -$${returnedSlice.proratedReturnAmountCop.toLocaleString('es-CO')} | Venta neta: $${returnedSlice.netRevenueCop.toLocaleString('es-CO')} | COGS: $${returnedSlice.cogsTotalCop.toLocaleString('es-CO')} COP.`,
    passed: test3Passed,
    details: [returnedSlice.prorationDocumentation]
  });

  // --------------------------------------------------------------------------
  // PRUEBA 4: Gastos directos (100% atribuidos al propietario afectado)
  // --------------------------------------------------------------------------
  const directExp = txRegisterAndAllocateExpense(
    {
      expenseCode: 'EXP-SBX-DIR-001',
      expenseDate: '2026-11-12',
      expenseScope: 'direct_owner',
      category: 'Empaque y Embalaje',
      description: 'Cajas protectoras exclusivas para lotes de OWN-0001',
      totalAmountCop: 4000,
      allocationCriterion: 'single_owner_direct',
      approvalStatus: 'approved',
      directOwnerId: 'OWN-0001',
      notes: 'Gasto directo 100% OWN-0001'
    },
    actorEmail,
    sandbox
  );

  const test4Passed =
    directExp.slices.length === 1 &&
    directExp.slices[0].ownerId === 'OWN-0001' &&
    directExp.slices[0].allocatedAmountCop === 4000 &&
    directExp.slices[0].allocationPercentage === 100;

  results.push({
    testId: 'FIN-TEST-04',
    title: '4. Registro de gastos directos por propietario',
    scenario:
      'Gasto directo EXP-SBX-DIR-001 por $4.000 COP asignado exclusivamente a OWN-0001.',
    expected:
      '100% ($4.000 COP) cargado al estado de cuenta de OWN-0001 sin afectar a OWN-0002.',
    actual: `Asignado a ${directExp.slices[0].ownerId}: $${directExp.slices[0].allocatedAmountCop.toLocaleString('es-CO')} COP (${directExp.slices[0].allocationPercentage}%).`,
    passed: test4Passed,
    details: [directExp.slices[0].justificationNote]
  });

  // --------------------------------------------------------------------------
  // PRUEBA 5: Gastos comunes / compartidos y bloqueo de criterios no aprobados
  // --------------------------------------------------------------------------
  let unapprovedBlocked = false;
  try {
    txRegisterAndAllocateExpense(
      {
        expenseCode: 'EXP-SBX-UNAPPROVED',
        expenseDate: '2026-11-12',
        expenseScope: 'shared_multi_owner',
        category: 'Operación Compartida Bodega',
        description: 'Gasto con criterio en borrador no aprobado',
        totalAmountCop: 10000,
        allocationCriterion: 'proportional_net_sales',
        approvalStatus: 'draft_unapproved',
        notes: 'Debe ser bloqueado'
      },
      actorEmail,
      sandbox
    );
  } catch {
    unapprovedBlocked = true;
  }

  // Ventas netas actuales en sandbox: OWN-0001 = 80.000 + 38.000 = 118.000 | OWN-0002 = 38.000 (Total = 156.000)
  const sharedExp = txRegisterAndAllocateExpense(
    {
      expenseCode: 'EXP-SBX-SHR-002',
      expenseDate: '2026-11-12',
      expenseScope: 'shared_multi_owner',
      category: 'Publicidad Atribuible',
      description: 'Campaña compartida Meta Ads prorrateada por ventas netas aprobada',
      totalAmountCop: 15600,
      allocationCriterion: 'proportional_net_sales',
      approvalStatus: 'approved',
      notes: 'Prorrateo proporcional a ventas netas ($118.000 vs $38.000)'
    },
    actorEmail,
    sandbox
  );

  const sliceOwn1 = sharedExp.slices.find((s) => s.ownerId === 'OWN-0001')!;
  const sliceOwn2 = sharedExp.slices.find((s) => s.ownerId === 'OWN-0002')!;
  // 15.600 * (118.000 / 156.000) = 11.800 para OWN-0001 y 3.800 para OWN-0002
  const test5Passed =
    unapprovedBlocked &&
    sliceOwn1.allocatedAmountCop === 11800 &&
    sliceOwn2.allocatedAmountCop === 3800 &&
    sliceOwn1.allocatedAmountCop + sliceOwn2.allocatedAmountCop === 15600;

  results.push({
    testId: 'FIN-TEST-05',
    title: '5. Gastos comunes prorrateados y bloqueo de criterios no aprobados',
    scenario:
      'Gasto compartido aprobado de $15.600 COP prorrateado por ventas netas ($118.000 OWN-0001 vs $38.000 OWN-0002) e intento de aplicar un gasto no aprobado.',
    expected:
      'OWN-0001 asume $11.800 COP (75.64%) y OWN-0002 asume $3.800 COP (24.36%). El gasto no aprobado es rechazado.',
    actual: `OWN-0001: $${sliceOwn1.allocatedAmountCop.toLocaleString('es-CO')} | OWN-0002: $${sliceOwn2.allocatedAmountCop.toLocaleString('es-CO')} | No aprobado bloqueado: ${unapprovedBlocked ? 'SÍ' : 'NO'}.`,
    passed: test5Passed,
    details: [sliceOwn1.justificationNote, sliceOwn2.justificationNote]
  });

  // --------------------------------------------------------------------------
  // PRUEBA 6: Liquidación parcial (Conciliada, con saldo anterior, pago parcial y saldo final)
  // --------------------------------------------------------------------------
  const stOwn1BeforeLiq = buildOwnerAccountStatements(sandbox).find(
    (s) => s.ownerId === 'OWN-0001'
  )!;
  const partialSettlement = txCreateConciliatedSettlement(
    {
      settlementCode: 'LIQ-SBX-0001',
      ownerId: 'OWN-0001',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      amountToSettleCop: 30000,
      voucherReference: 'COMP-CONC-001',
      isConciliatedConfirmed: true,
      notes: 'Liquidación parcial conciliada por $30.000 COP'
    },
    actorEmail,
    sandbox
  );
  const stOwn1AfterLiq = buildOwnerAccountStatements(sandbox).find(
    (s) => s.ownerId === 'OWN-0001'
  )!;

  const test6Passed =
    partialSettlement.amountApprovedToSettleCop === 30000 &&
    stOwn1AfterLiq.pendingPaymentSettlementsCop === 30000 &&
    stOwn1AfterLiq.previousSettledPaymentsCop === 0 &&
    stOwn1AfterLiq.collectableAttributableProfitCop ===
      stOwn1BeforeLiq.collectableAttributableProfitCop - 30000 &&
    partialSettlement.approvalState === 'approved_pending_payment';

  results.push({
    testId: 'FIN-TEST-06',
    title: '6. Liquidación parcial bajo conciliación (Sin pago automático)',
    scenario: `Sobre un saldo recaudado disponible de $${stOwn1BeforeLiq.collectableAttributableProfitCop.toLocaleString('es-CO')} COP de OWN-0001, se aprueba una liquidación parcial de $30.000 COP en estado approved_pending_payment.`,
    expected: `Liquidaciones pendientes de pago pasan a $30.000 COP y el saldo liquidable baja a $${(stOwn1BeforeLiq.collectableAttributableProfitCop - 30000).toLocaleString('es-CO')} COP sin marcar pago automático.`,
    actual: `Disponible antes: $${stOwn1BeforeLiq.collectableAttributableProfitCop.toLocaleString('es-CO')} | Pendiente pago: $${stOwn1AfterLiq.pendingPaymentSettlementsCop.toLocaleString('es-CO')} | Saldo liquidable restante: $${stOwn1AfterLiq.collectableAttributableProfitCop.toLocaleString('es-CO')} COP.`,
    passed: test6Passed,
    details: [
      `Comprobante: ${partialSettlement.voucherReference} (${partialSettlement.approvalState}).`,
      'Cumple regla: No liquida automáticamente ni ejecuta pagos sin autorización.'
    ]
  });

  // --------------------------------------------------------------------------
  // PRUEBA 7: Saldo negativo (Bloqueo estricto de liquidación cuando gastos superan utilidad)
  // --------------------------------------------------------------------------
  txRegisterAndAllocateExpense(
    {
      expenseCode: 'EXP-SBX-NEG-003',
      expenseDate: '2026-11-12',
      expenseScope: 'direct_owner',
      category: 'Otro Gasto Operativo',
      description: 'Adecuación de empaque directo de OWN-0003 sin ventas aún',
      totalAmountCop: 25000,
      allocationCriterion: 'single_owner_direct',
      approvalStatus: 'approved',
      directOwnerId: 'OWN-0003',
      notes: 'Genera saldo negativo de -$25.000 COP para OWN-0003'
    },
    actorEmail,
    sandbox
  );

  const stOwn3Neg = buildOwnerAccountStatements(sandbox).find(
    (s) => s.ownerId === 'OWN-0003'
  )!;
  let negativeSettlementBlocked = false;
  try {
    txCreateConciliatedSettlement(
      {
        settlementCode: 'LIQ-FAIL-NEG',
        ownerId: 'OWN-0003',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
        amountToSettleCop: 5000,
        voucherReference: 'COMP-ERR-NEG',
        isConciliatedConfirmed: true,
        notes: 'Intento de liquidar con saldo negativo'
      },
      actorEmail,
      sandbox
    );
  } catch {
    negativeSettlementBlocked = true;
  }

  const test7Passed =
    stOwn3Neg.finalConciliatedBalanceCop === -25000 &&
    !stOwn3Neg.canSettle &&
    negativeSettlementBlocked;

  results.push({
    testId: 'FIN-TEST-07',
    title: '7. Propietario con saldo negativo y bloqueo de liquidación',
    scenario:
      'OWN-0003 registra un gasto directo aprobado de $25.000 COP sin ventas en el periodo (saldo final = -$25.000 COP).',
    expected:
      'Estado de cuenta refleja -$25.000 COP y bloquea cualquier intento de liquidación.',
    actual: `Saldo final OWN-0003: $${stOwn3Neg.finalConciliatedBalanceCop.toLocaleString('es-CO')} COP | Liquidación bloqueada: ${negativeSettlementBlocked ? 'SÍ' : 'NO'}.`,
    passed: test7Passed,
    details: [stOwn3Neg.settlementBlockReason || 'Bloqueado por saldo negativo']
  });

  // --------------------------------------------------------------------------
  // PRUEBA 8: Resultado del escenario de Acuerdo No Configurado (PENDIENTE DE CONFIGURAR)
  // --------------------------------------------------------------------------
  const test8Passed =
    stBeforeAgr.agreementIsPending &&
    stBeforeAgr.storeCommissionCop === null &&
    !stBeforeAgr.canSettle &&
    unconfiguredSettlementBlocked;

  results.push({
    testId: 'FIN-TEST-08',
    title: '8. Acuerdo no configurado (Alerta PENDIENTE DE CONFIGURAR y bloqueo)',
    scenario:
      'Intento de liquidar utilidades de un propietario cuyo acuerdo está en pending_configuration.',
    expected:
      'Muestra claramente PENDIENTE DE CONFIGURAR, no inventa porcentaje de comisión (NULL) y bloquea la liquidación.',
    actual: `Estado acuerdo inicial: ${stBeforeAgr.agreement.status} (Comisión: PENDIENTE DE CONFIGURAR) | Liquidación bloqueada: ${unconfiguredSettlementBlocked ? 'SÍ' : 'NO'}.`,
    passed: test8Passed,
    details: [stBeforeAgr.settlementBlockReason || 'PENDIENTE DE CONFIGURAR']
  });

  return results;
}
