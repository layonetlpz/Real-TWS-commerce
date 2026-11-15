// ============================================================================
// REAL TWS COMMERCE SYSTEM — SALES, ORDERS & CRM ENGINE (FASE 5)
// Cubre:
//   1. CRM: Prospectos (leads), clientes, fuente de adquisición, producto
//      consultado (SKU), historial de interacciones, seguimiento, estado y notas
//      con interfaz de Pipeline Comercial (sin mensajes automáticos).
//   2. CLIENTES: Prevención estricta de duplicados (teléfono/WhatsApp y
//      documento normalizados), historial comercial completo, formulario sin
//      datos innecesarios y protección de datos personales.
//   3. PEDIDOS: Crear, editar mientras no estén confirmados, confirmar,
//      reservar inventario con control de concurrencia, registrar pagos
//      (pendiente, recibido, parcial, reembolsado — nunca automático ni con
//      pasarelas pagas), preparar, despachar, entregar, cancelar y devolver.
//   4. MULTIPROPIETARIO POR LÍNEA: Cada línea de pedido puede dividirse entre
//      múltiples asignaciones de propietario y lote conservando el costo
//      unitario de cada asignación.
//   5. ENVÍOS (DESPACHOS): Costo real vs. cobrado, transportadora, guía,
//      estado, fecha y bitácora de seguimiento.
//   6. RENTABILIDAD POR PEDIDO Y 9 PRUEBAS OBLIGATORIAS en sandbox aislado.
// ============================================================================

import {
  getInventoryPurchaseState,
  saveInventoryPurchaseState,
  ensureExcelBaselineLoadedInInventory,
  type InventoryPurchaseStoreState,
  type ImmutableStockMovement
} from './inventoryPurchaseService';
import {
  getFinancialAccountingState,
  txRecordMultiOwnerDispatchedSale,
  txRecordReturnOnDispatchedSale
} from './financialAccountingService';

export type AcquisitionSourceChannel =
  | 'whatsapp'
  | 'instagram'
  | 'facebook'
  | 'marketplace'
  | 'walk_in'
  | 'referral'
  | 'other';

export type CrmLeadStage =
  | 'new'
  | 'contacted'
  | 'quoted'
  | 'negotiation'
  | 'won'
  | 'lost';

export interface LeadFollowupEvent {
  id: string;
  leadId: string;
  interactionType:
    | 'call'
    | 'whatsapp_manual_note'
    | 'store_visit'
    | 'quote_sent'
    | 'status_change'
    | 'note';
  previousStage: CrmLeadStage | null;
  newStage: CrmLeadStage;
  summary: string;
  nextFollowupAt: string | null;
  recordedBy: string;
  createdAt: string;
}

export interface CrmLeadRecord {
  id: string;
  leadCode: string;
  customerId: string | null;
  fullName: string;
  phoneWhatsapp: string;
  phoneNormalized: string;
  email: string;
  city: string;
  sourceChannel: AcquisitionSourceChannel;
  interestedSku: string;
  interestedProductName: string;
  stage: CrmLeadStage;
  assignedTo: string;
  nextFollowupAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  followups: LeadFollowupEvent[];
}

export interface CustomerRecord {
  id: string;
  customerCode: string;
  fullName: string;
  phoneWhatsapp: string;
  phoneNormalized: string;
  documentType: string;
  documentNumber: string;
  documentNormalized: string;
  email: string;
  city: string;
  department: string;
  shippingAddress: string;
  acquisitionSource: AcquisitionSourceChannel;
  status: 'active' | 'inactive' | 'blocked';
  privacyConsentAt: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type SalesOrderStatus =
  | 'draft'
  | 'reserved'
  | 'confirmed'
  | 'preparing'
  | 'dispatched'
  | 'delivered'
  | 'partially_returned'
  | 'returned'
  | 'cancelled';

export type OrderPaymentStatus = 'pending' | 'partial' | 'paid' | 'refunded';

export type PaymentMethodType =
  | 'cash'
  | 'nequi'
  | 'daviplata'
  | 'bank_transfer'
  | 'card'
  | 'cod_carrier';

export interface SalesOrderLineOwnerAllocation {
  id: string;
  allocationSaleCode: string;
  lotAllocationId: string;
  lotId: string;
  ownerId: string;
  ownerName: string;
  sku: string;
  qtyAllocated: number;
  qtyReturned: number;
  unitCostCop: number; // Costo unitario real conservado del lote/propietario
  unitSalePriceCop: number;
  discountAllocatedCop: number;
  returnAmountCop: number;
  reservationId: string | null;
  allocationStatus:
    | 'draft'
    | 'reserved'
    | 'dispatched'
    | 'partially_returned'
    | 'returned'
    | 'cancelled_released';
}

export interface SalesOrderLineItem {
  id: string;
  lineNumber: number;
  sku: string;
  productName: string;
  variantName: string;
  qtyOrdered: number;
  qtyReturned: number;
  unitSalePriceCop: number;
  lineDiscountCop: number;
  allocations: SalesOrderLineOwnerAllocation[];
}

export interface OrderPaymentRecord {
  id: string;
  paymentCode: string;
  salesOrderId: string;
  orderNumber: string;
  paymentDate: string;
  paymentMethod: PaymentMethodType;
  amountCop: number;
  status: 'pending' | 'confirmed' | 'refunded' | 'voided';
  referenceCode: string;
  receivedBy: string;
  notes: string;
  createdAt: string;
}

export type ShipmentStatusType =
  | 'preparing'
  | 'dispatched'
  | 'in_transit'
  | 'delivered'
  | 'returned_by_carrier'
  | 'cancelled';

export interface ShipmentTrackingEvent {
  id: string;
  timestamp: string;
  status: ShipmentStatusType;
  locationOrCheckpoint: string;
  detail: string;
  recordedBy: string;
}

export interface OrderShipmentRecord {
  id: string;
  shipmentCode: string;
  salesOrderId: string;
  orderNumber: string;
  carrierName: string;
  trackingNumber: string;
  recipientName: string;
  recipientPhone: string;
  destinationCity: string;
  destinationAddress: string;
  shippingCostCop: number; // Costo logístico real de envío
  status: ShipmentStatusType;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  dispatchedBy: string;
  notes: string;
  trackingEvents: ShipmentTrackingEvent[];
  updatedAt: string;
}

export interface OrderCustomerReturnRecord {
  id: string;
  returnCode: string;
  salesOrderId: string;
  orderNumber: string;
  orderLineId: string;
  orderAllocationId: string;
  lotAllocationId: string;
  lotId: string;
  ownerId: string;
  ownerName: string;
  sku: string;
  productName: string;
  qtyReturned: number;
  itemCondition: 'good_restock' | 'defective_warranty' | 'pending_inspection';
  refundAmountCop: number;
  unitCostPreservedCop: number;
  reason: string;
  processedBy: string;
  createdAt: string;
}

export interface SalesOrderRecord {
  id: string;
  orderNumber: string;
  orderDate: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  customerPhone: string;
  customerCity: string;
  customerAddress: string;
  leadId: string | null;
  salesChannel: 'store_direct' | 'whatsapp' | 'instagram' | 'facebook' | 'marketplace' | 'web';
  status: SalesOrderStatus;
  paymentStatus: OrderPaymentStatus;
  shippingChargedCop: number; // Cobrado al cliente
  shippingRealCostCop: number; // Costo de la transportadora
  sellerName: string;
  notes: string;
  isHistoricalExcelRecord: boolean;
  confirmedAt: string | null;
  preparedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  lines: SalesOrderLineItem[];
}

export interface OrderOwnerProfitBreakdown {
  ownerId: string;
  ownerName: string;
  lotsUsed: string[];
  grossUnitsAllocated: number;
  returnedUnits: number;
  netUnitsSold: number;
  grossRevenueCop: number;
  discountAllocatedCop: number;
  returnAmountCop: number;
  netRevenueCop: number;
  cogsTotalCop: number;
  grossProfitBeforeCommissionCop: number;
  storeCommissionPct: number | null;
  storeCommissionCop: number | null;
  attributableOwnerProfitCop: number;
  agreementStatusLabel: 'ACTIVO' | 'PENDIENTE DE CONFIGURAR';
}

export interface OrderProfitabilityBreakdown {
  salesOrderId: string;
  orderNumber: string;
  orderStatus: SalesOrderStatus;
  paymentStatus: OrderPaymentStatus;
  grossMerchandiseSubtotalCop: number;
  totalLineDiscountsCop: number;
  returnedMerchandiseCop: number;
  netMerchandiseRevenueCop: number;
  shippingChargedToCustomerCop: number;
  shippingRealCarrierCostCop: number;
  netLogisticsResultCop: number;
  netOrderTotalBilledCop: number;
  totalCogsCop: number;
  grossMerchandiseProfitCop: number;
  orderOperatingProfitCop: number;
  grossMarginPct: number;
  operatingMarginPct: number;
  totalCollectedCashCop: number;
  totalRefundedCashCop: number;
  netCollectedCashCop: number;
  pendingReceivableCop: number;
  distinctOwnersCount: number;
  ownerBreakdowns: OrderOwnerProfitBreakdown[];
}

export interface CustomerCommercialSummary {
  customer: CustomerRecord;
  ordersCount: number;
  activeOrdersCount: number;
  totalPurchasedCop: number;
  totalPaidCop: number;
  pendingBalanceCop: number;
  totalReturnedCop: number;
  lastOrderDate: string | null;
  orders: SalesOrderRecord[];
  returns: OrderCustomerReturnRecord[];
  linkedLeads: CrmLeadRecord[];
}

export interface SalesOrdersCrmStoreState {
  leads: CrmLeadRecord[];
  customers: CustomerRecord[];
  orders: SalesOrderRecord[];
  payments: OrderPaymentRecord[];
  shipments: OrderShipmentRecord[];
  returns: OrderCustomerReturnRecord[];
}

export interface SalesCrmTestResult {
  testId: string;
  title: string;
  scenario: string;
  expected: string;
  actual: string;
  passed: boolean;
  details: string[];
}

const SALES_CRM_STORAGE_KEY = 'rtw_sales_orders_crm_state_v1';

// ============================================================================
// UTILIDADES DE NORMALIZACIÓN Y PROTECCIÓN DE DATOS PERSONALES
// ============================================================================

export function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  // Si inicia con 57 y tiene 12 dígitos (Colombia), normaliza a los 10 dígitos del móvil
  if (digits.length === 12 && digits.startsWith('57')) {
    return digits.slice(2);
  }
  return digits;
}

export function normalizeDocumentId(docType?: string, docNumber?: string): string {
  const cleanNum = (docNumber || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleanNum) return '';
  const cleanType = (docType || 'CC').trim().toUpperCase();
  return `${cleanType}:${cleanNum}`;
}

export function maskProtectedPhone(phone: string, revealFull: boolean): string {
  if (revealFull || !phone) return phone || 'No registrado';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length <= 4) return '***';
  return `${digits.slice(0, 3)} *** **${digits.slice(-2)}`;
}

export function maskProtectedAddress(address: string, revealFull: boolean): string {
  if (revealFull || !address) return address || 'Entrega en tienda / No aplica';
  if (address.length <= 8) return 'Dirección protegida (***)';
  return `${address.slice(0, 8)}... [Dato personal protegido]`;
}

// ============================================================================
// ESTADO INICIAL FIEL AL EXCEL REAL (2 VENTAS HISTÓRICAS DE EBERTO OWN-0001)
// ============================================================================

function createInitialHistoricalState(): SalesOrdersCrmStoreState {
  const historicalCustomer: CustomerRecord = {
    id: 'CUST-HIST-0001',
    customerCode: 'CLI-HIST-0001',
    fullName: 'Comprador Histórico Excel (Ventas Iniciales Auditadas)',
    phoneWhatsapp: '3000000001',
    phoneNormalized: '3000000001',
    documentType: 'CC',
    documentNumber: '',
    documentNormalized: '',
    email: '',
    city: 'Barranquilla',
    department: 'Atlántico',
    shippingAddress: 'Venta presencial histórica registrada en Excel',
    acquisitionSource: 'walk_in',
    status: 'active',
    privacyConsentAt: '2026-11-01T00:00:00.000Z',
    notes: 'Registro histórico correspondiente a las 2 unidades vendidas en el Excel inicial de Eberto (OWN-0001).',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z'
  };

  const histOrder1: SalesOrderRecord = {
    id: 'ORD-HIST-0001',
    orderNumber: 'VEN-HIST-0001',
    orderDate: '2026-11-01',
    customerId: historicalCustomer.id,
    customerCode: historicalCustomer.customerCode,
    customerName: historicalCustomer.fullName,
    customerPhone: historicalCustomer.phoneWhatsapp,
    customerCity: 'Barranquilla',
    customerAddress: 'Entrega directa en tienda',
    leadId: null,
    salesChannel: 'store_direct',
    status: 'delivered',
    paymentStatus: 'paid',
    shippingChargedCop: 0,
    shippingRealCostCop: 0,
    sellerName: 'Venta Histórica Excel',
    notes: 'Venta histórica real registrada en el Excel de inventario (1 ud COM-PER-001-AZU de OWN-0001 Eberto).',
    isHistoricalExcelRecord: true,
    confirmedAt: '2026-11-01T10:00:00.000Z',
    preparedAt: '2026-11-01T10:05:00.000Z',
    dispatchedAt: '2026-11-01T10:10:00.000Z',
    deliveredAt: '2026-11-01T10:15:00.000Z',
    cancelledAt: null,
    cancellationReason: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:15:00.000Z',
    lines: [
      {
        id: 'LINE-HIST-0001',
        lineNumber: 1,
        sku: 'COM-PER-001-AZU',
        productName: 'Combo Teclado y Mouse Inalámbrico Azul',
        variantName: 'Azul',
        qtyOrdered: 1,
        qtyReturned: 0,
        unitSalePriceCop: 50000,
        lineDiscountCop: 0,
        allocations: [
          {
            id: 'SIA-HIST-0001',
            allocationSaleCode: 'SIA-HIST-0001',
            lotAllocationId: 'ALLOC-HIST-COM-PER-001-AZU',
            lotId: 'LOT-INI-2026-01-COM-PER-001-AZU',
            ownerId: 'OWN-0001',
            ownerName: 'Eberto',
            sku: 'COM-PER-001-AZU',
            qtyAllocated: 1,
            qtyReturned: 0,
            unitCostCop: 19300,
            unitSalePriceCop: 50000,
            discountAllocatedCop: 0,
            returnAmountCop: 0,
            reservationId: null,
            allocationStatus: 'dispatched'
          }
        ]
      }
    ]
  };

  const histOrder2: SalesOrderRecord = {
    id: 'ORD-HIST-0002',
    orderNumber: 'VEN-HIST-0002',
    orderDate: '2026-11-02',
    customerId: historicalCustomer.id,
    customerCode: historicalCustomer.customerCode,
    customerName: historicalCustomer.fullName,
    customerPhone: historicalCustomer.phoneWhatsapp,
    customerCity: 'Barranquilla',
    customerAddress: 'Entrega directa en tienda',
    leadId: null,
    salesChannel: 'store_direct',
    status: 'delivered',
    paymentStatus: 'paid',
    shippingChargedCop: 0,
    shippingRealCostCop: 0,
    sellerName: 'Venta Histórica Excel',
    notes: 'Venta histórica real registrada en el Excel de inventario (1 ud HOG-ACC-001-NEG de OWN-0001 Eberto).',
    isHistoricalExcelRecord: true,
    confirmedAt: '2026-11-02T11:00:00.000Z',
    preparedAt: '2026-11-02T11:05:00.000Z',
    dispatchedAt: '2026-11-02T11:10:00.000Z',
    deliveredAt: '2026-11-02T11:15:00.000Z',
    cancelledAt: null,
    cancellationReason: null,
    createdAt: '2026-11-02T11:00:00.000Z',
    updatedAt: '2026-11-02T11:15:00.000Z',
    lines: [
      {
        id: 'LINE-HIST-0002',
        lineNumber: 1,
        sku: 'HOG-ACC-001-NEG',
        productName: 'Báscula Digital Gramera de Cocina',
        variantName: 'Negro',
        qtyOrdered: 1,
        qtyReturned: 0,
        unitSalePriceCop: 15000,
        lineDiscountCop: 0,
        allocations: [
          {
            id: 'SIA-HIST-0002',
            allocationSaleCode: 'SIA-HIST-0002',
            lotAllocationId: 'ALLOC-HIST-HOG-ACC-001-NEG',
            lotId: 'LOT-INI-2026-01-HOG-ACC-001-NEG',
            ownerId: 'OWN-0001',
            ownerName: 'Eberto',
            sku: 'HOG-ACC-001-NEG',
            qtyAllocated: 1,
            qtyReturned: 0,
            unitCostCop: 2400,
            unitSalePriceCop: 15000,
            discountAllocatedCop: 0,
            returnAmountCop: 0,
            reservationId: null,
            allocationStatus: 'dispatched'
          }
        ]
      }
    ]
  };

  const histPayments: OrderPaymentRecord[] = [
    {
      id: 'PAY-HIST-0001',
      paymentCode: 'REC-HIST-0001',
      salesOrderId: histOrder1.id,
      orderNumber: histOrder1.orderNumber,
      paymentDate: '2026-11-01',
      paymentMethod: 'cash',
      amountCop: 50000,
      status: 'confirmed',
      referenceCode: 'EFECTIVO-EXCEL-01',
      receivedBy: 'Eberto (Registro Excel)',
      notes: 'Pago recibido en venta histórica COM-PER-001-AZU',
      createdAt: '2026-11-01T10:15:00.000Z'
    },
    {
      id: 'PAY-HIST-0002',
      paymentCode: 'REC-HIST-0002',
      salesOrderId: histOrder2.id,
      orderNumber: histOrder2.orderNumber,
      paymentDate: '2026-11-02',
      paymentMethod: 'cash',
      amountCop: 15000,
      status: 'confirmed',
      referenceCode: 'EFECTIVO-EXCEL-02',
      receivedBy: 'Eberto (Registro Excel)',
      notes: 'Pago recibido en venta histórica HOG-ACC-001-NEG',
      createdAt: '2026-11-02T11:15:00.000Z'
    }
  ];

  const histShipments: OrderShipmentRecord[] = [
    {
      id: 'SHP-HIST-0001',
      shipmentCode: 'DES-HIST-0001',
      salesOrderId: histOrder1.id,
      orderNumber: histOrder1.orderNumber,
      carrierName: 'Entrega Presencial en Tienda',
      trackingNumber: 'TIENDA-HIST-0001',
      recipientName: historicalCustomer.fullName,
      recipientPhone: historicalCustomer.phoneWhatsapp,
      destinationCity: 'Barranquilla',
      destinationAddress: 'Mostrador REAL TWS',
      shippingCostCop: 0,
      status: 'delivered',
      dispatchedAt: '2026-11-01T10:10:00.000Z',
      deliveredAt: '2026-11-01T10:15:00.000Z',
      dispatchedBy: 'Eberto',
      notes: 'Entrega presencial registrada en Excel inicial.',
      trackingEvents: [
        {
          id: 'TRK-HIST-1',
          timestamp: '2026-11-01T10:15:00.000Z',
          status: 'delivered',
          locationOrCheckpoint: 'Tienda REAL TWS',
          detail: 'Entregado al cliente en punto físico.',
          recordedBy: 'Sistema (Excel Inicial)'
        }
      ],
      updatedAt: '2026-11-01T10:15:00.000Z'
    },
    {
      id: 'SHP-HIST-0002',
      shipmentCode: 'DES-HIST-0002',
      salesOrderId: histOrder2.id,
      orderNumber: histOrder2.orderNumber,
      carrierName: 'Entrega Presencial en Tienda',
      trackingNumber: 'TIENDA-HIST-0002',
      recipientName: historicalCustomer.fullName,
      recipientPhone: historicalCustomer.phoneWhatsapp,
      destinationCity: 'Barranquilla',
      destinationAddress: 'Mostrador REAL TWS',
      shippingCostCop: 0,
      status: 'delivered',
      dispatchedAt: '2026-11-02T11:10:00.000Z',
      deliveredAt: '2026-11-02T11:15:00.000Z',
      dispatchedBy: 'Eberto',
      notes: 'Entrega presencial registrada en Excel inicial.',
      trackingEvents: [
        {
          id: 'TRK-HIST-2',
          timestamp: '2026-11-02T11:15:00.000Z',
          status: 'delivered',
          locationOrCheckpoint: 'Tienda REAL TWS',
          detail: 'Entregado al cliente en punto físico.',
          recordedBy: 'Sistema (Excel Inicial)'
        }
      ],
      updatedAt: '2026-11-02T11:15:00.000Z'
    }
  ];

  return {
    leads: [],
    customers: [historicalCustomer],
    orders: [histOrder1, histOrder2],
    payments: histPayments,
    shipments: histShipments,
    returns: []
  };
}

let inMemorySalesCrmState: SalesOrdersCrmStoreState | null = null;

export function getSalesOrdersCrmState(): SalesOrdersCrmStoreState {
  if (inMemorySalesCrmState) {
    return inMemorySalesCrmState;
  }
  try {
    const raw = localStorage.getItem(SALES_CRM_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SalesOrdersCrmStoreState;
      if (parsed && Array.isArray(parsed.orders) && Array.isArray(parsed.customers)) {
        inMemorySalesCrmState = parsed;
        return parsed;
      }
    }
  } catch {
    // Fallback to initial state
  }
  const initial = createInitialHistoricalState();
  inMemorySalesCrmState = initial;
  saveSalesOrdersCrmState(initial);
  return initial;
}

export function saveSalesOrdersCrmState(state: SalesOrdersCrmStoreState): void {
  inMemorySalesCrmState = state;
  try {
    localStorage.setItem(SALES_CRM_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota issues
  }
}

// ============================================================================
// 1. GESTIÓN DE CLIENTES (PREVENCIÓN DE DUPLICADOS + HISTORIAL COMERCIAL)
// ============================================================================

export function registerOrValidateCustomer(
  input: {
    fullName: string;
    phoneWhatsapp: string;
    documentType?: string;
    documentNumber?: string;
    email?: string;
    city?: string;
    department?: string;
    shippingAddress?: string;
    acquisitionSource?: AcquisitionSourceChannel;
    notes?: string;
  },
  customState?: SalesOrdersCrmStoreState
): { customer: CustomerRecord; isDuplicateBlocked: boolean; duplicateMessage?: string } {
  const state = customState ?? getSalesOrdersCrmState();
  const cleanName = input.fullName.trim();
  const phoneNorm = normalizePhoneNumber(input.phoneWhatsapp);
  const docNorm = normalizeDocumentId(input.documentType, input.documentNumber);

  if (!cleanName) {
    throw new Error('El nombre completo del cliente es obligatorio.');
  }
  if (!phoneNorm || phoneNorm.length < 7) {
    throw new Error('Debe ingresar un número de WhatsApp / teléfono válido para contactar al cliente.');
  }

  // Verificar duplicado por teléfono/WhatsApp normalizado
  const existingByPhone = state.customers.find(
    (c) => c.phoneNormalized && c.phoneNormalized === phoneNorm
  );
  if (existingByPhone) {
    throw new Error(
      `CLIENTE DUPLICADO BLOQUEADO: El número de WhatsApp/teléfono ${input.phoneWhatsapp} ya pertenece al cliente ${existingByPhone.customerCode} (${existingByPhone.fullName}). Utilice su ficha existente para conservar el historial comercial.`
    );
  }

  // Verificar duplicado por documento de identidad si se suministró
  if (docNorm) {
    const existingByDoc = state.customers.find(
      (c) => c.documentNormalized && c.documentNormalized === docNorm
    );
    if (existingByDoc) {
      throw new Error(
        `CLIENTE DUPLICADO BLOQUEADO: El documento ${docNorm} ya pertenece al cliente ${existingByDoc.customerCode} (${existingByDoc.fullName}).`
      );
    }
  }

  const nextIndex = state.customers.length + 1;
  const nowIso = new Date().toISOString();
  const newCustomer: CustomerRecord = {
    id: `CUST-${Date.now()}-${nextIndex}`,
    customerCode: `CLI-${String(nextIndex).padStart(4, '0')}`,
    fullName: cleanName,
    phoneWhatsapp: input.phoneWhatsapp.trim(),
    phoneNormalized: phoneNorm,
    documentType: (input.documentType || 'CC').trim().toUpperCase(),
    documentNumber: (input.documentNumber || '').trim(),
    documentNormalized: docNorm,
    email: (input.email || '').trim().toLowerCase(),
    city: (input.city || 'Barranquilla').trim(),
    department: (input.department || 'Atlántico').trim(),
    shippingAddress: (input.shippingAddress || '').trim(),
    acquisitionSource: input.acquisitionSource || 'whatsapp',
    status: 'active',
    privacyConsentAt: nowIso,
    notes: (input.notes || '').trim(),
    createdAt: nowIso,
    updatedAt: nowIso
  };

  state.customers.unshift(newCustomer);
  if (!customState) {
    saveSalesOrdersCrmState(state);
  }
  return { customer: newCustomer, isDuplicateBlocked: false };
}

export function buildCustomerCommercialSummaries(
  customState?: SalesOrdersCrmStoreState
): CustomerCommercialSummary[] {
  const state = customState ?? getSalesOrdersCrmState();
  return state.customers.map((customer) => {
    const orders = state.orders.filter((o) => o.customerId === customer.id);
    const activeOrders = orders.filter((o) => o.status !== 'cancelled');
    const returns = state.returns.filter((r) =>
      orders.some((o) => o.id === r.salesOrderId)
    );
    const linkedLeads = state.leads.filter(
      (l) => l.customerId === customer.id || (l.phoneNormalized && l.phoneNormalized === customer.phoneNormalized)
    );

    let totalPurchasedCop = 0;
    let totalPaidCop = 0;
    let pendingBalanceCop = 0;
    let totalReturnedCop = 0;

    for (const order of activeOrders) {
      const prof = calculateOrderProfitability(order.id, state);
      totalPurchasedCop += prof.netOrderTotalBilledCop;
      totalPaidCop += prof.netCollectedCashCop;
      pendingBalanceCop += prof.pendingReceivableCop;
      totalReturnedCop += prof.returnedMerchandiseCop;
    }

    const sortedDates = activeOrders
      .map((o) => o.orderDate)
      .sort((a, b) => (a > b ? -1 : 1));

    return {
      customer,
      ordersCount: activeOrders.length,
      activeOrdersCount: activeOrders.filter((o) =>
        ['draft', 'reserved', 'confirmed', 'preparing', 'dispatched'].includes(o.status)
      ).length,
      totalPurchasedCop,
      totalPaidCop,
      pendingBalanceCop,
      totalReturnedCop,
      lastOrderDate: sortedDates[0] ?? null,
      orders,
      returns,
      linkedLeads
    };
  });
}

// ============================================================================
// 2. CRM: PROSPECTOS, SEGUIMIENTO, HISTORIAL Y CONVERSIÓN A CLIENTE
// ============================================================================

export function createCrmLead(
  input: {
    fullName: string;
    phoneWhatsapp: string;
    email?: string;
    city?: string;
    sourceChannel: AcquisitionSourceChannel;
    interestedSku: string;
    assignedTo: string;
    nextFollowupAt?: string;
    notes: string;
  },
  customState?: SalesOrdersCrmStoreState,
  customInvState?: InventoryPurchaseStoreState
): CrmLeadRecord {
  const state = customState ?? getSalesOrdersCrmState();
  const invState = customInvState ?? getInventoryPurchaseState();

  const cleanName = input.fullName.trim();
  if (!cleanName) {
    throw new Error('El nombre del prospecto es obligatorio.');
  }
  const phoneNorm = normalizePhoneNumber(input.phoneWhatsapp);
  if (!phoneNorm) {
    throw new Error('El teléfono o WhatsApp del prospecto es obligatorio para el seguimiento.');
  }

  const productVariant = invState.catalog[input.interestedSku];
  const existingCustomer = state.customers.find(
    (c) => c.phoneNormalized === phoneNorm
  );

  const nowIso = new Date().toISOString();
  const nextIdx = state.leads.length + 1;
  const leadId = `LEAD-${Date.now()}-${nextIdx}`;

  const initialFollowup: LeadFollowupEvent = {
    id: `FLW-${Date.now()}-1`,
    leadId,
    interactionType: 'note',
    previousStage: null,
    newStage: 'new',
    summary: input.notes.trim() || `Prospecto registrado desde canal ${input.sourceChannel} consultando por ${input.interestedSku || 'catálogo general'}.`,
    nextFollowupAt: input.nextFollowupAt || null,
    recordedBy: input.assignedTo || 'Asesor Comercial',
    createdAt: nowIso
  };

  const lead: CrmLeadRecord = {
    id: leadId,
    leadCode: `PROS-${String(nextIdx).padStart(4, '0')}`,
    customerId: existingCustomer ? existingCustomer.id : null,
    fullName: cleanName,
    phoneWhatsapp: input.phoneWhatsapp.trim(),
    phoneNormalized: phoneNorm,
    email: (input.email || '').trim(),
    city: (input.city || 'Barranquilla').trim(),
    sourceChannel: input.sourceChannel,
    interestedSku: input.interestedSku,
    interestedProductName: productVariant ? productVariant.productName : 'Consulta General',
    stage: 'new',
    assignedTo: input.assignedTo || 'Asesor Comercial',
    nextFollowupAt: input.nextFollowupAt || null,
    notes: input.notes.trim(),
    createdAt: nowIso,
    updatedAt: nowIso,
    followups: [initialFollowup]
  };

  state.leads.unshift(lead);
  if (!customState) {
    saveSalesOrdersCrmState(state);
  }
  return lead;
}

export function addLeadFollowupAndStage(
  input: {
    leadId: string;
    newStage: CrmLeadStage;
    interactionType: LeadFollowupEvent['interactionType'];
    summary: string;
    nextFollowupAt?: string | null;
    actorName: string;
  },
  customState?: SalesOrdersCrmStoreState
): CrmLeadRecord {
  const state = customState ?? getSalesOrdersCrmState();
  const lead = state.leads.find((l) => l.id === input.leadId);
  if (!lead) {
    throw new Error(`Prospecto ${input.leadId} no encontrado.`);
  }
  if (!input.summary.trim()) {
    throw new Error('Debe escribir una nota o resumen del seguimiento realizado.');
  }

  const nowIso = new Date().toISOString();
  const event: LeadFollowupEvent = {
    id: `FLW-${Date.now()}-${lead.followups.length + 1}`,
    leadId: lead.id,
    interactionType: input.interactionType,
    previousStage: lead.stage,
    newStage: input.newStage,
    summary: input.summary.trim(),
    nextFollowupAt: input.nextFollowupAt ?? lead.nextFollowupAt,
    recordedBy: input.actorName || 'Asesor Comercial',
    createdAt: nowIso
  };

  lead.stage = input.newStage;
  if (input.nextFollowupAt !== undefined) {
    lead.nextFollowupAt = input.nextFollowupAt;
  }
  lead.notes = input.summary.trim();
  lead.updatedAt = nowIso;
  lead.followups.unshift(event);

  if (!customState) {
    saveSalesOrdersCrmState(state);
  }
  return lead;
}

export function convertLeadToCustomer(
  leadId: string,
  actorName: string,
  customState?: SalesOrdersCrmStoreState
): CustomerRecord {
  const state = customState ?? getSalesOrdersCrmState();
  const lead = state.leads.find((l) => l.id === leadId);
  if (!lead) {
    throw new Error(`Prospecto ${leadId} no encontrado.`);
  }

  // Si ya existe un cliente con el mismo teléfono normalizado, vincular sin duplicar
  const existingCustomer = state.customers.find(
    (c) => c.phoneNormalized && c.phoneNormalized === lead.phoneNormalized
  );

  if (existingCustomer) {
    lead.customerId = existingCustomer.id;
    addLeadFollowupAndStage(
      {
        leadId: lead.id,
        newStage: 'won',
        interactionType: 'status_change',
        summary: `Prospecto vinculado al cliente existente ${existingCustomer.customerCode} (${existingCustomer.fullName}) evitando duplicidad.`,
        actorName
      },
      state
    );
    if (!customState) saveSalesOrdersCrmState(state);
    return existingCustomer;
  }

  const { customer } = registerOrValidateCustomer(
    {
      fullName: lead.fullName,
      phoneWhatsapp: lead.phoneWhatsapp,
      email: lead.email,
      city: lead.city,
      acquisitionSource: lead.sourceChannel,
      notes: `Convertido desde prospecto ${lead.leadCode}. Interés inicial: ${lead.interestedSku} (${lead.notes})`
    },
    state
  );

  lead.customerId = customer.id;
  addLeadFollowupAndStage(
    {
      leadId: lead.id,
      newStage: 'won',
      interactionType: 'status_change',
      summary: `Prospecto convertido exitosamente en cliente ${customer.customerCode}.`,
      actorName
    },
    state
  );

  if (!customState) {
    saveSalesOrdersCrmState(state);
  }
  return customer;
}

// ============================================================================
// 3. PEDIDOS DE VENTA MULTIPROPIETARIO (CREAR, EDITAR, RESERVAR, CONFIRMAR,
//    PAGAR, PREPARAR, DESPACHAR, ENTREGAR, CANCELAR Y DEVOLVER)
// ============================================================================

export interface CreateOrderLineDraftInput {
  sku: string;
  qtyOrdered: number;
  unitSalePriceCop: number;
  lineDiscountCop: number;
  allocations: Array<{
    lotAllocationId: string;
    qtyAllocated: number;
  }>;
}

function buildValidatedOrderLines(
  linesInput: CreateOrderLineDraftInput[],
  invState: InventoryPurchaseStoreState
): SalesOrderLineItem[] {
  if (!linesInput || linesInput.length === 0) {
    throw new Error('El pedido debe tener al menos una línea de producto.');
  }

  return linesInput.map((lineIn, idx) => {
    if (lineIn.qtyOrdered <= 0) {
      throw new Error(`La cantidad de la línea #${idx + 1} (${lineIn.sku}) debe ser mayor a 0.`);
    }
    if (lineIn.unitSalePriceCop < 0) {
      throw new Error(`El precio unitario de ${lineIn.sku} no puede ser negativo.`);
    }
    const grossLine = lineIn.qtyOrdered * lineIn.unitSalePriceCop;
    if (lineIn.lineDiscountCop < 0 || lineIn.lineDiscountCop > grossLine) {
      throw new Error(`El descuento de la línea ${lineIn.sku} es inválido.`);
    }

    const catalogItem = invState.catalog[lineIn.sku];
    if (!catalogItem) {
      throw new Error(`El SKU ${lineIn.sku} no existe en el catálogo maestro.`);
    }

    if (!lineIn.allocations || lineIn.allocations.length === 0) {
      throw new Error(
        `Debe asignar explícitamente lote y propietario para el SKU ${lineIn.sku}.`
      );
    }

    const totalAllocated = lineIn.allocations.reduce((acc, a) => acc + a.qtyAllocated, 0);
    if (totalAllocated !== lineIn.qtyOrdered) {
      throw new Error(
        `La suma de unidades asignadas por lote/propietario (${totalAllocated}) no coincide con la cantidad pedida (${lineIn.qtyOrdered}) en el SKU ${lineIn.sku}.`
      );
    }

    const builtAllocations: SalesOrderLineOwnerAllocation[] = lineIn.allocations.map(
      (allocIn, allocIdx) => {
        if (allocIn.qtyAllocated <= 0) {
          throw new Error(`La cantidad asignada al lote debe ser mayor a 0.`);
        }
        const lotAlloc = invState.allocations.find((a) => a.id === allocIn.lotAllocationId);
        if (!lotAlloc) {
          throw new Error(`Asignación de inventario ${allocIn.lotAllocationId} no encontrada.`);
        }
        if (lotAlloc.sku !== lineIn.sku) {
          throw new Error(
            `El lote seleccionado (${lotAlloc.lotId}) corresponde al SKU ${lotAlloc.sku} y no a ${lineIn.sku}.`
          );
        }

        const unitCostCop =
          (lotAlloc.purchaseUnitCostCop ?? 0) + (lotAlloc.inboundShippingUnitCostCop ?? 0);

        const weight = allocIn.qtyAllocated / lineIn.qtyOrdered;
        const proratedDiscountCop = Math.round(lineIn.lineDiscountCop * weight);

        return {
          id: `SIA-${Date.now()}-${idx + 1}-${allocIdx + 1}`,
          allocationSaleCode: `ASG-VTA-${idx + 1}-${allocIdx + 1}-${Math.floor(Math.random() * 900 + 100)}`,
          lotAllocationId: lotAlloc.id,
          lotId: lotAlloc.lotId,
          ownerId: lotAlloc.ownerId,
          ownerName: lotAlloc.ownerName,
          sku: lineIn.sku,
          qtyAllocated: allocIn.qtyAllocated,
          qtyReturned: 0,
          unitCostCop,
          unitSalePriceCop: lineIn.unitSalePriceCop,
          discountAllocatedCop: proratedDiscountCop,
          returnAmountCop: 0,
          reservationId: null,
          allocationStatus: 'draft'
        };
      }
    );

    // Ajuste de redondeo del descuento prorrateado en la última asignación
    const sumDisc = builtAllocations.reduce((s, a) => s + a.discountAllocatedCop, 0);
    if (builtAllocations.length > 0 && sumDisc !== lineIn.lineDiscountCop) {
      builtAllocations[builtAllocations.length - 1].discountAllocatedCop +=
        lineIn.lineDiscountCop - sumDisc;
    }

    return {
      id: `LINE-${Date.now()}-${idx + 1}`,
      lineNumber: idx + 1,
      sku: lineIn.sku,
      productName: catalogItem.productName,
      variantName: catalogItem.variantName || catalogItem.color || 'Estándar',
      qtyOrdered: lineIn.qtyOrdered,
      qtyReturned: 0,
      unitSalePriceCop: lineIn.unitSalePriceCop,
      lineDiscountCop: lineIn.lineDiscountCop,
      allocations: builtAllocations
    };
  });
}

export function txCreateSalesOrder(
  input: {
    customerId: string;
    leadId?: string | null;
    salesChannel: SalesOrderRecord['salesChannel'];
    shippingChargedCop: number;
    shippingRealCostCop: number;
    sellerName: string;
    notes: string;
    lines: CreateOrderLineDraftInput[];
    reserveImmediately?: boolean;
  },
  customState?: SalesOrdersCrmStoreState,
  customInvState?: InventoryPurchaseStoreState
): SalesOrderRecord {
  const state = customState ?? getSalesOrdersCrmState();
  const invState = customInvState ?? getInventoryPurchaseState();

  const customer = state.customers.find((c) => c.id === input.customerId);
  if (!customer) {
    throw new Error('Debe seleccionar un cliente registrado válido.');
  }

  const builtLines = buildValidatedOrderLines(input.lines, invState);
  const nowIso = new Date().toISOString();
  const nextNum = state.orders.length + 1;
  const orderNumber = `PED-2026-${String(nextNum).padStart(4, '0')}`;

  const order: SalesOrderRecord = {
    id: `ORD-${Date.now()}-${nextNum}`,
    orderNumber,
    orderDate: nowIso.slice(0, 10),
    customerId: customer.id,
    customerCode: customer.customerCode,
    customerName: customer.fullName,
    customerPhone: customer.phoneWhatsapp,
    customerCity: customer.city || 'Barranquilla',
    customerAddress: customer.shippingAddress || 'Por confirmar dirección',
    leadId: input.leadId || null,
    salesChannel: input.salesChannel,
    status: 'draft',
    paymentStatus: 'pending', // Regla crítica: Nunca marcar pagado automáticamente
    shippingChargedCop: Math.max(0, input.shippingChargedCop || 0),
    shippingRealCostCop: Math.max(0, input.shippingRealCostCop || 0),
    sellerName: input.sellerName || 'Asesor Comercial',
    notes: (input.notes || '').trim(),
    isHistoricalExcelRecord: false,
    confirmedAt: null,
    preparedAt: null,
    dispatchedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    lines: builtLines
  };

  state.orders.unshift(order);

  if (input.reserveImmediately) {
    txReserveSalesOrderInventory(order.id, input.sellerName, state, invState);
  }

  if (!customState) {
    saveSalesOrdersCrmState(state);
  }
  if (!customInvState) {
    saveInventoryPurchaseState(invState);
  }

  return order;
}

export function txUpdateUnconfirmedSalesOrder(
  input: {
    salesOrderId: string;
    shippingChargedCop: number;
    shippingRealCostCop: number;
    notes: string;
    lines: CreateOrderLineDraftInput[];
    actorName: string;
  },
  customState?: SalesOrdersCrmStoreState,
  customInvState?: InventoryPurchaseStoreState
): SalesOrderRecord {
  const state = customState ?? getSalesOrdersCrmState();
  const invState = customInvState ?? getInventoryPurchaseState();

  const order = state.orders.find((o) => o.id === input.salesOrderId);
  if (!order) {
    throw new Error(`Pedido ${input.salesOrderId} no encontrado.`);
  }

  if (order.status !== 'draft' && order.status !== 'reserved') {
    throw new Error(
      `BLOQUEO DE EDICIÓN: El pedido ${order.orderNumber} está en estado '${order.status}'. Solo se permite editar pedidos mientras no estén confirmados.`
    );
  }

  const wasReserved = order.status === 'reserved';

  // Si tenía reservas activas, liberarlas antes de reescribir las líneas
  if (wasReserved) {
    releaseOrderActiveReservationsInternal(order, 'Edición de pedido antes de confirmar', input.actorName, invState);
    order.status = 'draft';
  }

  order.lines = buildValidatedOrderLines(input.lines, invState);
  order.shippingChargedCop = Math.max(0, input.shippingChargedCop);
  order.shippingRealCostCop = Math.max(0, input.shippingRealCostCop);
  order.notes = input.notes.trim();
  order.updatedAt = new Date().toISOString();

  if (wasReserved) {
    txReserveSalesOrderInventory(order.id, input.actorName, state, invState);
  }

  if (!customState) saveSalesOrdersCrmState(state);
  if (!customInvState) saveInventoryPurchaseState(invState);
  return order;
}

export function txReserveSalesOrderInventory(
  salesOrderId: string,
  actorName: string,
  customState?: SalesOrdersCrmStoreState,
  customInvState?: InventoryPurchaseStoreState
): SalesOrderRecord {
  const state = customState ?? getSalesOrdersCrmState();
  const invState = customInvState ?? getInventoryPurchaseState();

  const order = state.orders.find((o) => o.id === salesOrderId);
  if (!order) {
    throw new Error(`Pedido ${salesOrderId} no encontrado.`);
  }

  if (order.status !== 'draft' && order.status !== 'reserved') {
    throw new Error(
      `Solo se puede reservar inventario para pedidos en borrador (estado actual: ${order.status}).`
    );
  }

  // Fase 1 de validación atómica (todo o nada): verificar que todas las asignaciones tienen qtyAvailable suficiente
  for (const line of order.lines) {
    for (const alloc of line.allocations) {
      if (alloc.allocationStatus === 'reserved') continue;
      const lotAlloc = invState.allocations.find((a) => a.id === alloc.lotAllocationId);
      if (!lotAlloc) {
        throw new Error(`Lote/Asignación ${alloc.lotAllocationId} no existe.`);
      }
      if (lotAlloc.qtyAvailable < alloc.qtyAllocated) {
        throw new Error(
          `CONFLICTO DE CONCURRENCIA / STOCK INSUFICIENTE: El vendedor '${actorName}' intentó reservar ${alloc.qtyAllocated} ud(s) de ${alloc.sku} en el lote ${lotAlloc.lotId} (Propietario ${lotAlloc.ownerId}), pero solo quedan ${lotAlloc.qtyAvailable} unidad(es) disponible(s).`
        );
      }
    }
  }

  // Fase 2 de aplicación atómica
  const nowIso = new Date().toISOString();
  for (const line of order.lines) {
    for (const alloc of line.allocations) {
      if (alloc.allocationStatus === 'reserved') continue;
      const lotAlloc = invState.allocations.find((a) => a.id === alloc.lotAllocationId)!;

      lotAlloc.qtyReserved += alloc.qtyAllocated;
      lotAlloc.qtyAvailable = Math.max(0, lotAlloc.qtyGood - lotAlloc.qtyReserved);
      lotAlloc.lockVersion += 1;

      const reservationId = `RES-${order.orderNumber}-${alloc.id}`;
      invState.reservations.unshift({
        id: reservationId,
        reservationCode: reservationId,
        idempotencyKey: `IDEM-RES-REC-${order.id}-${alloc.id}-${lotAlloc.lockVersion}`,
        lotAllocationId: lotAlloc.id,
        lotId: lotAlloc.lotId,
        sku: lotAlloc.sku,
        productName: lotAlloc.productName,
        ownerId: lotAlloc.ownerId,
        salesOrderRef: order.orderNumber,
        qtyReserved: alloc.qtyAllocated,
        qtyFulfilled: 0,
        qtyReleased: 0,
        status: 'active',
        reason: `Reserva de pedido ${order.orderNumber}`,
        createdBy: actorName,
        createdAt: nowIso
      });

      const movement: ImmutableStockMovement = Object.freeze({
        id: `MOV-RES-${Date.now()}-${invState.movements.length + 1}`,
        movementSeq: invState.movements.length + 1,
        idempotencyKey: `IDEM-RES-${order.id}-${alloc.id}-${lotAlloc.lockVersion}`,
        createdAt: nowIso,
        lotAllocationId: lotAlloc.id,
        allocationCode: lotAlloc.allocationCode,
        lotId: lotAlloc.lotId,
        sku: lotAlloc.sku,
        productName: lotAlloc.productName,
        ownerId: lotAlloc.ownerId,
        movementType: 'reservation_hold',
        deltaPhysical: 0,
        deltaGood: 0,
        deltaDefective: 0,
        deltaPending: 0,
        deltaReserved: alloc.qtyAllocated,
        balancePhysicalAfter: lotAlloc.qtyPhysical,
        balanceGoodAfter: lotAlloc.qtyGood,
        balanceDefectiveAfter: lotAlloc.qtyDefective,
        balancePendingAfter: lotAlloc.qtyPendingInspection,
        balanceReservedAfter: lotAlloc.qtyReserved,
        balanceAvailableAfter: lotAlloc.qtyAvailable,
        unitCostSnapshotCop: alloc.unitCostCop,
        referenceEntity: 'sales_order',
        referenceId: order.orderNumber,
        reason: `Reserva inventario pedido ${order.orderNumber} (${actorName})`,
        performedBy: actorName,
        immutable: true as const
      });
      invState.movements.unshift(movement);

      alloc.reservationId = reservationId;
      alloc.allocationStatus = 'reserved';
    }
  }

  order.status = 'reserved';
  order.updatedAt = nowIso;

  if (!customState) saveSalesOrdersCrmState(state);
  if (!customInvState) saveInventoryPurchaseState(invState);
  return order;
}

export function txConfirmSalesOrder(
  salesOrderId: string,
  actorName: string,
  customState?: SalesOrdersCrmStoreState,
  customInvState?: InventoryPurchaseStoreState
): SalesOrderRecord {
  const state = customState ?? getSalesOrdersCrmState();
  const invState = customInvState ?? getInventoryPurchaseState();

  const order = state.orders.find((o) => o.id === salesOrderId);
  if (!order) {
    throw new Error(`Pedido ${salesOrderId} no encontrado.`);
  }

  if (order.status === 'draft') {
    txReserveSalesOrderInventory(order.id, actorName, state, invState);
  } else if (order.status !== 'reserved') {
    throw new Error(`El pedido ${order.orderNumber} no puede confirmarse desde el estado '${order.status}'.`);
  }

  const nowIso = new Date().toISOString();
  order.status = 'confirmed';
  order.confirmedAt = nowIso;
  order.updatedAt = nowIso;
  // Regla: Al confirmar NO se marca pagado automáticamente; conserva su paymentStatus real.

  if (!customState) saveSalesOrdersCrmState(state);
  if (!customInvState) saveInventoryPurchaseState(invState);
  return order;
}

function recalculateOrderPaymentStatus(
  order: SalesOrderRecord,
  state: SalesOrdersCrmStoreState
): void {
  const orderPayments = state.payments.filter((p) => p.salesOrderId === order.id);
  const confirmedSum = orderPayments
    .filter((p) => p.status === 'confirmed')
    .reduce((acc, p) => acc + p.amountCop, 0);
  const refundedSum = orderPayments
    .filter((p) => p.status === 'refunded')
    .reduce((acc, p) => acc + p.amountCop, 0);

  const netCollected = Math.max(0, confirmedSum - refundedSum);

  const grossSub = order.lines.reduce(
    (s, l) => s + l.qtyOrdered * l.unitSalePriceCop,
    0
  );
  const discSub = order.lines.reduce((s, l) => s + l.lineDiscountCop, 0);
  const retSub = order.lines.reduce(
    (s, l) =>
      s + l.allocations.reduce((sa, a) => sa + a.returnAmountCop, 0),
    0
  );
  const netOrderBilled = Math.max(
    0,
    grossSub - discSub - retSub + order.shippingChargedCop
  );

  if (refundedSum > 0 && netCollected === 0) {
    order.paymentStatus = 'refunded';
  } else if (netCollected === 0) {
    order.paymentStatus = 'pending';
  } else if (netCollected < netOrderBilled) {
    order.paymentStatus = 'partial';
  } else {
    order.paymentStatus = 'paid';
  }
}

export function txRegisterOrderPayment(
  input: {
    salesOrderId: string;
    paymentMethod: PaymentMethodType;
    amountCop: number;
    status: 'pending' | 'confirmed' | 'refunded';
    referenceCode: string;
    receivedBy: string;
    notes: string;
  },
  customState?: SalesOrdersCrmStoreState
): OrderPaymentRecord {
  const state = customState ?? getSalesOrdersCrmState();
  const order = state.orders.find((o) => o.id === input.salesOrderId);
  if (!order) {
    throw new Error(`Pedido ${input.salesOrderId} no encontrado.`);
  }
  if (order.status === 'cancelled' && input.status !== 'refunded') {
    throw new Error('No se pueden registrar cobros sobre un pedido cancelado.');
  }
  if (input.amountCop <= 0) {
    throw new Error('El monto del registro de pago debe ser mayor a $0 COP.');
  }

  const nowIso = new Date().toISOString();
  const nextIdx = state.payments.length + 1;
  const payment: OrderPaymentRecord = {
    id: `PAY-${Date.now()}-${nextIdx}`,
    paymentCode: `REC-${String(nextIdx).padStart(4, '0')}`,
    salesOrderId: order.id,
    orderNumber: order.orderNumber,
    paymentDate: nowIso.slice(0, 10),
    paymentMethod: input.paymentMethod,
    amountCop: Math.round(input.amountCop),
    status: input.status,
    referenceCode: (input.referenceCode || 'SIN-REF').trim(),
    receivedBy: input.receivedBy || 'Caja / Tesorería',
    notes: (input.notes || '').trim(),
    createdAt: nowIso
  };

  state.payments.unshift(payment);
  recalculateOrderPaymentStatus(order, state);
  order.updatedAt = nowIso;

  if (!customState) {
    saveSalesOrdersCrmState(state);
  }
  return payment;
}

export function txPrepareSalesOrder(
  input: {
    salesOrderId: string;
    carrierName: string;
    destinationCity: string;
    destinationAddress: string;
    shippingRealCostCop: number;
    actorName: string;
    notes?: string;
  },
  customState?: SalesOrdersCrmStoreState,
  customInvState?: InventoryPurchaseStoreState
): SalesOrderRecord {
  const state = customState ?? getSalesOrdersCrmState();
  const invState = customInvState ?? getInventoryPurchaseState();

  const order = state.orders.find((o) => o.id === input.salesOrderId);
  if (!order) {
    throw new Error(`Pedido ${input.salesOrderId} no encontrado.`);
  }

  if (order.status === 'draft' || order.status === 'reserved') {
    txConfirmSalesOrder(order.id, input.actorName, state, invState);
  } else if (order.status !== 'confirmed') {
    throw new Error(`El pedido ${order.orderNumber} no puede pasar a alistamiento desde '${order.status}'.`);
  }

  const nowIso = new Date().toISOString();
  order.status = 'preparing';
  order.preparedAt = nowIso;
  order.shippingRealCostCop = Math.max(0, input.shippingRealCostCop);
  order.customerCity = input.destinationCity.trim() || order.customerCity;
  order.customerAddress = input.destinationAddress.trim() || order.customerAddress;
  order.updatedAt = nowIso;

  let shipment = state.shipments.find((s) => s.salesOrderId === order.id);
  if (!shipment) {
    const nextShp = state.shipments.length + 1;
    shipment = {
      id: `SHP-${Date.now()}-${nextShp}`,
      shipmentCode: `DES-${String(nextShp).padStart(4, '0')}`,
      salesOrderId: order.id,
      orderNumber: order.orderNumber,
      carrierName: input.carrierName.trim() || 'Transportadora por asignar',
      trackingNumber: '',
      recipientName: order.customerName,
      recipientPhone: order.customerPhone,
      destinationCity: order.customerCity,
      destinationAddress: order.customerAddress,
      shippingCostCop: order.shippingRealCostCop,
      status: 'preparing',
      dispatchedAt: null,
      deliveredAt: null,
      dispatchedBy: input.actorName,
      notes: (input.notes || 'En alistamiento y empaque en bodega').trim(),
      trackingEvents: [
        {
          id: `TRK-${Date.now()}-1`,
          timestamp: nowIso,
          status: 'preparing',
          locationOrCheckpoint: 'Bodega REAL TWS',
          detail: 'Pedido en alistamiento, verificación de seriales/calidad y empaque.',
          recordedBy: input.actorName
        }
      ],
      updatedAt: nowIso
    };
    state.shipments.unshift(shipment);
  } else {
    shipment.carrierName = input.carrierName.trim() || shipment.carrierName;
    shipment.shippingCostCop = order.shippingRealCostCop;
    shipment.destinationCity = order.customerCity;
    shipment.destinationAddress = order.customerAddress;
    shipment.updatedAt = nowIso;
  }

  if (!customState) saveSalesOrdersCrmState(state);
  if (!customInvState) saveInventoryPurchaseState(invState);
  return order;
}

export function txDispatchSalesOrder(
  input: {
    salesOrderId: string;
    carrierName: string;
    trackingNumber: string;
    shippingRealCostCop: number;
    actorName: string;
    notes?: string;
  },
  customState?: SalesOrdersCrmStoreState,
  customInvState?: InventoryPurchaseStoreState
): { order: SalesOrderRecord; shipment: OrderShipmentRecord } {
  const state = customState ?? getSalesOrdersCrmState();
  const invState = customInvState ?? getInventoryPurchaseState();

  const order = state.orders.find((o) => o.id === input.salesOrderId);
  if (!order) {
    throw new Error(`Pedido ${input.salesOrderId} no encontrado.`);
  }

  if (order.status === 'draft' || order.status === 'reserved') {
    txConfirmSalesOrder(order.id, input.actorName, state, invState);
  }
  if (order.status === 'confirmed') {
    txPrepareSalesOrder(
      {
        salesOrderId: order.id,
        carrierName: input.carrierName,
        destinationCity: order.customerCity,
        destinationAddress: order.customerAddress,
        shippingRealCostCop: input.shippingRealCostCop,
        actorName: input.actorName,
        notes: input.notes
      },
      state,
      invState
    );
  } else if (order.status !== 'preparing') {
    throw new Error(`El pedido ${order.orderNumber} no puede despacharse desde el estado '${order.status}'.`);
  }

  if (!input.carrierName.trim()) {
    throw new Error('Debe indicar la transportadora o modalidad de entrega.');
  }
  if (!input.trackingNumber.trim()) {
    throw new Error('Debe ingresar el número de guía o comprobante de despacho.');
  }

  const nowIso = new Date().toISOString();

  // Descontar salidas físicas reales y consumir las reservas de cada asignación
  for (const line of order.lines) {
    for (const alloc of line.allocations) {
      const lotAlloc = invState.allocations.find((a) => a.id === alloc.lotAllocationId);
      if (!lotAlloc) {
        throw new Error(`Asignación de lote ${alloc.lotAllocationId} no encontrada.`);
      }

      if (lotAlloc.qtyGood < alloc.qtyAllocated) {
        throw new Error(
          `Stock apto insuficiente en lote ${lotAlloc.lotId} para despachar ${alloc.qtyAllocated} ud(s) de ${alloc.sku}.`
        );
      }

      lotAlloc.qtyPhysical -= alloc.qtyAllocated;
      lotAlloc.qtyGood -= alloc.qtyAllocated;
      lotAlloc.qtyReserved = Math.max(0, lotAlloc.qtyReserved - alloc.qtyAllocated);
      lotAlloc.qtyAvailable = Math.max(0, lotAlloc.qtyGood - lotAlloc.qtyReserved);
      lotAlloc.lockVersion += 1;

      if (alloc.reservationId) {
        const resRec = invState.reservations.find((r) => r.id === alloc.reservationId);
        if (resRec) {
          resRec.qtyFulfilled = resRec.qtyReserved;
          resRec.status = 'fulfilled';
        }
      }

      const dispatchMov: ImmutableStockMovement = Object.freeze({
        id: `MOV-DSP-${Date.now()}-${invState.movements.length + 1}`,
        movementSeq: invState.movements.length + 1,
        idempotencyKey: `IDEM-DSP-${order.id}-${alloc.id}`,
        createdAt: nowIso,
        lotAllocationId: lotAlloc.id,
        allocationCode: lotAlloc.allocationCode,
        lotId: lotAlloc.lotId,
        sku: lotAlloc.sku,
        productName: lotAlloc.productName,
        ownerId: lotAlloc.ownerId,
        movementType: 'sale_dispatch',
        deltaPhysical: -alloc.qtyAllocated,
        deltaGood: -alloc.qtyAllocated,
        deltaDefective: 0,
        deltaPending: 0,
        deltaReserved: -alloc.qtyAllocated,
        balancePhysicalAfter: lotAlloc.qtyPhysical,
        balanceGoodAfter: lotAlloc.qtyGood,
        balanceDefectiveAfter: lotAlloc.qtyDefective,
        balancePendingAfter: lotAlloc.qtyPendingInspection,
        balanceReservedAfter: lotAlloc.qtyReserved,
        balanceAvailableAfter: lotAlloc.qtyAvailable,
        unitCostSnapshotCop: alloc.unitCostCop,
        referenceEntity: 'sales_order_dispatch',
        referenceId: `${order.orderNumber} / Guía ${input.trackingNumber.trim()}`,
        reason: `Salida por despacho de pedido ${order.orderNumber} (${input.carrierName.trim()} - Guía ${input.trackingNumber.trim()})`,
        performedBy: input.actorName,
        immutable: true as const
      });
      invState.movements.unshift(dispatchMov);

      alloc.allocationStatus = 'dispatched';
    }

    // Si estamos en el entorno principal (no sandbox), sincronizar la línea despachada con Finanzas Multipropietario
    if (!customState && !customInvState) {
      try {
        const prof = calculateOrderProfitability(order.id, state);
        const collectedRatioPct =
          prof.netOrderTotalBilledCop > 0
            ? Math.min(
                100,
                Math.round(
                  (prof.netCollectedCashCop / prof.netOrderTotalBilledCop) * 100
                )
              )
            : 100;

        txRecordMultiOwnerDispatchedSale({
          orderNumber: order.orderNumber,
          saleDate: nowIso.slice(0, 10),
          sku: line.sku,
          productName: line.productName,
          unitSalePriceCop: line.unitSalePriceCop,
          totalOrderLineDiscountCop: line.lineDiscountCop,
          collectedRatioPct,
          slices: line.allocations.map((a) => ({
            lotAllocationId: a.lotAllocationId,
            lotId: a.lotId,
            ownerId: a.ownerId,
            ownerName: a.ownerName,
            qtyDispatched: a.qtyAllocated,
            unitAcquisitionCostCop: a.unitCostCop
          }))
        });
      } catch {
        // Non-blocking sync if already recorded
      }
    }
  }

  order.status = 'dispatched';
  order.shippingRealCostCop = Math.max(0, input.shippingRealCostCop);
  order.dispatchedAt = nowIso;
  order.updatedAt = nowIso;

  let shipment = state.shipments.find((s) => s.salesOrderId === order.id);
  if (!shipment) {
    const nextShp = state.shipments.length + 1;
    shipment = {
      id: `SHP-${Date.now()}-${nextShp}`,
      shipmentCode: `DES-${String(nextShp).padStart(4, '0')}`,
      salesOrderId: order.id,
      orderNumber: order.orderNumber,
      carrierName: input.carrierName.trim(),
      trackingNumber: input.trackingNumber.trim(),
      recipientName: order.customerName,
      recipientPhone: order.customerPhone,
      destinationCity: order.customerCity,
      destinationAddress: order.customerAddress,
      shippingCostCop: order.shippingRealCostCop,
      status: 'dispatched',
      dispatchedAt: nowIso,
      deliveredAt: null,
      dispatchedBy: input.actorName,
      notes: (input.notes || '').trim(),
      trackingEvents: [],
      updatedAt: nowIso
    };
    state.shipments.unshift(shipment);
  } else {
    shipment.carrierName = input.carrierName.trim();
    shipment.trackingNumber = input.trackingNumber.trim();
    shipment.shippingCostCop = order.shippingRealCostCop;
    shipment.status = 'dispatched';
    shipment.dispatchedAt = nowIso;
    shipment.dispatchedBy = input.actorName;
    shipment.updatedAt = nowIso;
  }

  shipment.trackingEvents.unshift({
    id: `TRK-${Date.now()}-${shipment.trackingEvents.length + 1}`,
    timestamp: nowIso,
    status: 'dispatched',
    locationOrCheckpoint: input.carrierName.trim(),
    detail: `Mercancía despachada con Guía Nº ${input.trackingNumber.trim()}. Costo envío: $${order.shippingRealCostCop.toLocaleString('es-CO')} COP.`,
    recordedBy: input.actorName
  });

  if (!customState) saveSalesOrdersCrmState(state);
  if (!customInvState) saveInventoryPurchaseState(invState);
  return { order, shipment };
}

export function txDeliverSalesOrder(
  salesOrderId: string,
  actorName: string,
  deliveryNote?: string,
  customState?: SalesOrdersCrmStoreState
): SalesOrderRecord {
  const state = customState ?? getSalesOrdersCrmState();
  const order = state.orders.find((o) => o.id === salesOrderId);
  if (!order) {
    throw new Error(`Pedido ${salesOrderId} no encontrado.`);
  }
  if (order.status !== 'dispatched') {
    throw new Error(`Solo se pueden marcar como entregados los pedidos despachados (actual: ${order.status}).`);
  }

  const nowIso = new Date().toISOString();
  order.status = 'delivered';
  order.deliveredAt = nowIso;
  order.updatedAt = nowIso;

  const shipment = state.shipments.find((s) => s.salesOrderId === order.id);
  if (shipment) {
    shipment.status = 'delivered';
    shipment.deliveredAt = nowIso;
    shipment.updatedAt = nowIso;
    shipment.trackingEvents.unshift({
      id: `TRK-${Date.now()}-${shipment.trackingEvents.length + 1}`,
      timestamp: nowIso,
      status: 'delivered',
      locationOrCheckpoint: shipment.destinationCity,
      detail: deliveryNote?.trim() || 'Entrega confirmada en destino al cliente final.',
      recordedBy: actorName
    });
  }

  if (!customState) saveSalesOrdersCrmState(state);
  return order;
}

function releaseOrderActiveReservationsInternal(
  order: SalesOrderRecord,
  reason: string,
  actorName: string,
  invState: InventoryPurchaseStoreState
): number {
  let releasedCount = 0;
  const nowIso = new Date().toISOString();

  for (const line of order.lines) {
    for (const alloc of line.allocations) {
      if (alloc.allocationStatus !== 'reserved') continue;

      const lotAlloc = invState.allocations.find((a) => a.id === alloc.lotAllocationId);
      if (lotAlloc) {
        lotAlloc.qtyReserved = Math.max(0, lotAlloc.qtyReserved - alloc.qtyAllocated);
        lotAlloc.qtyAvailable = Math.max(0, lotAlloc.qtyGood - lotAlloc.qtyReserved);
        lotAlloc.lockVersion += 1;

        const relMov: ImmutableStockMovement = Object.freeze({
          id: `MOV-REL-${Date.now()}-${invState.movements.length + 1}`,
          movementSeq: invState.movements.length + 1,
          idempotencyKey: `IDEM-REL-${order.id}-${alloc.id}-${lotAlloc.lockVersion}`,
          createdAt: nowIso,
          lotAllocationId: lotAlloc.id,
          allocationCode: lotAlloc.allocationCode,
          lotId: lotAlloc.lotId,
          sku: lotAlloc.sku,
          productName: lotAlloc.productName,
          ownerId: lotAlloc.ownerId,
          movementType: 'reservation_release',
          deltaPhysical: 0,
          deltaGood: 0,
          deltaDefective: 0,
          deltaPending: 0,
          deltaReserved: -alloc.qtyAllocated,
          balancePhysicalAfter: lotAlloc.qtyPhysical,
          balanceGoodAfter: lotAlloc.qtyGood,
          balanceDefectiveAfter: lotAlloc.qtyDefective,
          balancePendingAfter: lotAlloc.qtyPendingInspection,
          balanceReservedAfter: lotAlloc.qtyReserved,
          balanceAvailableAfter: lotAlloc.qtyAvailable,
          unitCostSnapshotCop: alloc.unitCostCop,
          referenceEntity: 'sales_order_cancel',
          referenceId: order.orderNumber,
          reason: `Liberación de reserva (${order.orderNumber}): ${reason}`,
          performedBy: actorName,
          immutable: true as const
        });
        invState.movements.unshift(relMov);
      }

      if (alloc.reservationId) {
        const resRec = invState.reservations.find((r) => r.id === alloc.reservationId);
        if (resRec) {
          resRec.qtyReleased = resRec.qtyReserved;
          resRec.status = 'released';
        }
      }

      alloc.allocationStatus = 'cancelled_released';
      releasedCount += 1;
    }
  }

  return releasedCount;
}

export function txCancelSalesOrder(
  input: {
    salesOrderId: string;
    reason: string;
    actorName: string;
  },
  customState?: SalesOrdersCrmStoreState,
  customInvState?: InventoryPurchaseStoreState
): { order: SalesOrderRecord; releasedAllocationsCount: number } {
  const state = customState ?? getSalesOrdersCrmState();
  const invState = customInvState ?? getInventoryPurchaseState();

  const order = state.orders.find((o) => o.id === input.salesOrderId);
  if (!order) {
    throw new Error(`Pedido ${input.salesOrderId} no encontrado.`);
  }
  if (!input.reason.trim()) {
    throw new Error('Debe especificar el motivo de cancelación del pedido.');
  }
  if (
    order.status === 'dispatched' ||
    order.status === 'delivered' ||
    order.status === 'partially_returned' ||
    order.status === 'returned'
  ) {
    throw new Error(
      `El pedido ${order.orderNumber} ya fue despachado/entregado (${order.status}); debe registrar una devolución en lugar de cancelarlo.`
    );
  }
  if (order.status === 'cancelled') {
    throw new Error(`El pedido ${order.orderNumber} ya está cancelado.`);
  }

  const releasedAllocationsCount = releaseOrderActiveReservationsInternal(
    order,
    input.reason.trim(),
    input.actorName,
    invState
  );

  const nowIso = new Date().toISOString();
  order.status = 'cancelled';
  order.cancelledAt = nowIso;
  order.cancellationReason = input.reason.trim();
  order.updatedAt = nowIso;

  const shipment = state.shipments.find((s) => s.salesOrderId === order.id);
  if (shipment) {
    shipment.status = 'cancelled';
    shipment.updatedAt = nowIso;
  }

  if (!customState) saveSalesOrdersCrmState(state);
  if (!customInvState) saveInventoryPurchaseState(invState);
  return { order, releasedAllocationsCount };
}

export function txReturnSalesOrderAllocation(
  input: {
    salesOrderId: string;
    orderAllocationId: string;
    qtyToReturn: number;
    itemCondition: 'good_restock' | 'defective_warranty' | 'pending_inspection';
    reason: string;
    actorName: string;
  },
  customState?: SalesOrdersCrmStoreState,
  customInvState?: InventoryPurchaseStoreState
): { order: SalesOrderRecord; returnRecord: OrderCustomerReturnRecord } {
  const state = customState ?? getSalesOrdersCrmState();
  const invState = customInvState ?? getInventoryPurchaseState();

  const order = state.orders.find((o) => o.id === input.salesOrderId);
  if (!order) {
    throw new Error(`Pedido ${input.salesOrderId} no encontrado.`);
  }
  if (
    order.status !== 'dispatched' &&
    order.status !== 'delivered' &&
    order.status !== 'partially_returned'
  ) {
    throw new Error(
      `Solo se pueden registrar devoluciones sobre pedidos despachados o entregados (estado actual: ${order.status}).`
    );
  }
  if (input.qtyToReturn <= 0) {
    throw new Error('La cantidad a devolver debe ser mayor a 0.');
  }
  if (!input.reason.trim()) {
    throw new Error('Debe documentar el motivo de la devolución o garantía.');
  }

  let targetLine: SalesOrderLineItem | undefined;
  let targetAlloc: SalesOrderLineOwnerAllocation | undefined;

  for (const line of order.lines) {
    const found = line.allocations.find((a) => a.id === input.orderAllocationId);
    if (found) {
      targetLine = line;
      targetAlloc = found;
      break;
    }
  }

  if (!targetLine || !targetAlloc) {
    throw new Error(`Asignación de venta ${input.orderAllocationId} no encontrada en el pedido.`);
  }

  const maxReturnable = targetAlloc.qtyAllocated - targetAlloc.qtyReturned;
  if (input.qtyToReturn > maxReturnable) {
    throw new Error(
      `No puede devolver ${input.qtyToReturn} ud(s); el máximo disponible para devolución en esta asignación es ${maxReturnable}.`
    );
  }

  const lotAlloc = invState.allocations.find((a) => a.id === targetAlloc.lotAllocationId);
  if (!lotAlloc) {
    throw new Error(
      `Asignación de lote original ${targetAlloc.lotAllocationId} (Propietario ${targetAlloc.ownerId}) no encontrada.`
    );
  }

  // Reingreso al lote original conservando estrictamente el propietario original (targetAlloc.ownerId)
  const deltaGood = input.itemCondition === 'good_restock' ? input.qtyToReturn : 0;
  const deltaDefective = input.itemCondition === 'defective_warranty' ? input.qtyToReturn : 0;
  const deltaPending = input.itemCondition === 'pending_inspection' ? input.qtyToReturn : 0;

  lotAlloc.qtyPhysical += input.qtyToReturn;
  lotAlloc.qtyGood += deltaGood;
  lotAlloc.qtyDefective += deltaDefective;
  lotAlloc.qtyPendingInspection += deltaPending;
  lotAlloc.qtyAvailable = Math.max(0, lotAlloc.qtyGood - lotAlloc.qtyReserved);
  lotAlloc.lockVersion += 1;

  const nowIso = new Date().toISOString();
  const retMov: ImmutableStockMovement = Object.freeze({
    id: `MOV-RET-${Date.now()}-${invState.movements.length + 1}`,
    movementSeq: invState.movements.length + 1,
    idempotencyKey: `IDEM-RET-${order.id}-${targetAlloc.id}-${targetAlloc.qtyReturned + input.qtyToReturn}`,
    createdAt: nowIso,
    lotAllocationId: lotAlloc.id,
    allocationCode: lotAlloc.allocationCode,
    lotId: lotAlloc.lotId,
    sku: lotAlloc.sku,
    productName: lotAlloc.productName,
    ownerId: lotAlloc.ownerId, // Conserva el propietario original
    movementType:
      input.itemCondition === 'good_restock'
        ? 'customer_return_restock'
        : 'customer_return_defective',
    deltaPhysical: input.qtyToReturn,
    deltaGood,
    deltaDefective,
    deltaPending,
    deltaReserved: 0,
    balancePhysicalAfter: lotAlloc.qtyPhysical,
    balanceGoodAfter: lotAlloc.qtyGood,
    balanceDefectiveAfter: lotAlloc.qtyDefective,
    balancePendingAfter: lotAlloc.qtyPendingInspection,
    balanceReservedAfter: lotAlloc.qtyReserved,
    balanceAvailableAfter: lotAlloc.qtyAvailable,
    unitCostSnapshotCop: targetAlloc.unitCostCop,
    referenceEntity: 'customer_return',
    referenceId: order.orderNumber,
    reason: `Devolución cliente (${input.itemCondition}) en pedido ${order.orderNumber}: ${input.reason.trim()}`,
    performedBy: input.actorName,
    immutable: true as const
  });
  invState.movements.unshift(retMov);

  // Calcular monto neto prorrateado de devolución en la asignación
  const netUnitSoldPrice =
    (targetAlloc.qtyAllocated * targetAlloc.unitSalePriceCop - targetAlloc.discountAllocatedCop) /
    targetAlloc.qtyAllocated;
  const refundForThisReturnCop = Math.round(netUnitSoldPrice * input.qtyToReturn);

  targetAlloc.qtyReturned += input.qtyToReturn;
  targetAlloc.returnAmountCop += refundForThisReturnCop;
  targetAlloc.allocationStatus =
    targetAlloc.qtyReturned >= targetAlloc.qtyAllocated ? 'returned' : 'partially_returned';

  targetLine.qtyReturned += input.qtyToReturn;

  const totalOrderedInOrder = order.lines.reduce((s, l) => s + l.qtyOrdered, 0);
  const totalReturnedInOrder = order.lines.reduce((s, l) => s + l.qtyReturned, 0);
  order.status =
    totalReturnedInOrder >= totalOrderedInOrder ? 'returned' : 'partially_returned';
  order.updatedAt = nowIso;

  const nextRetIdx = state.returns.length + 1;
  const returnRecord: OrderCustomerReturnRecord = {
    id: `RET-${Date.now()}-${nextRetIdx}`,
    returnCode: `DEV-${String(nextRetIdx).padStart(4, '0')}`,
    salesOrderId: order.id,
    orderNumber: order.orderNumber,
    orderLineId: targetLine.id,
    orderAllocationId: targetAlloc.id,
    lotAllocationId: targetAlloc.lotAllocationId,
    lotId: targetAlloc.lotId,
    ownerId: targetAlloc.ownerId,
    ownerName: targetAlloc.ownerName,
    sku: targetAlloc.sku,
    productName: targetLine.productName,
    qtyReturned: input.qtyToReturn,
    itemCondition: input.itemCondition,
    refundAmountCop: refundForThisReturnCop,
    unitCostPreservedCop: targetAlloc.unitCostCop,
    reason: input.reason.trim(),
    processedBy: input.actorName,
    createdAt: nowIso
  };

  state.returns.unshift(returnRecord);
  recalculateOrderPaymentStatus(order, state);

  // Si estamos en el estado principal, sincronizar devolución con Finanzas Multipropietario
  if (!customState && !customInvState) {
    try {
      const finState = getFinancialAccountingState();
      const matchingFinAlloc = finState.salesAllocations.find(
        (sa) =>
          sa.orderNumber === order.orderNumber &&
          sa.lotAllocationId === targetAlloc!.lotAllocationId
      );
      if (matchingFinAlloc) {
        txRecordReturnOnDispatchedSale({
          allocationSaleId: matchingFinAlloc.id,
          qtyToReturn: input.qtyToReturn,
          reason: input.reason.trim()
        });
      }
    } catch {
      // Non-blocking sync
    }
  }

  if (!customState) saveSalesOrdersCrmState(state);
  if (!customInvState) saveInventoryPurchaseState(invState);
  return { order, returnRecord };
}

// ============================================================================
// 4. VERIFICACIÓN DE RENTABILIDAD POR PEDIDO Y DESGLOSE MULTIPROPIETARIO
// ============================================================================

export function calculateOrderProfitability(
  salesOrderId: string,
  customState?: SalesOrdersCrmStoreState
): OrderProfitabilityBreakdown {
  const state = customState ?? getSalesOrdersCrmState();
  const finState = getFinancialAccountingState();

  const order = state.orders.find((o) => o.id === salesOrderId);
  if (!order) {
    throw new Error(`Pedido ${salesOrderId} no encontrado.`);
  }

  let grossMerchandiseSubtotalCop = 0;
  let totalLineDiscountsCop = 0;
  let returnedMerchandiseCop = 0;
  let totalCogsCop = 0;

  const ownerMap = new Map<string, OrderOwnerProfitBreakdown>();

  for (const line of order.lines) {
    grossMerchandiseSubtotalCop += line.qtyOrdered * line.unitSalePriceCop;
    totalLineDiscountsCop += line.lineDiscountCop;

    for (const alloc of line.allocations) {
      const netUnits = Math.max(0, alloc.qtyAllocated - alloc.qtyReturned);
      const grossRev = alloc.qtyAllocated * alloc.unitSalePriceCop;
      const netRev = grossRev - alloc.discountAllocatedCop - alloc.returnAmountCop;
      const cogs = netUnits * alloc.unitCostCop;

      returnedMerchandiseCop += alloc.returnAmountCop;
      totalCogsCop += cogs;

      const existing = ownerMap.get(alloc.ownerId);
      const agreement = finState.agreements[alloc.ownerId];
      const isConfigured =
        agreement &&
        agreement.status === 'active' &&
        agreement.storeCommissionPct !== null;
      const commPct = isConfigured ? agreement.storeCommissionPct! : null;

      if (!existing) {
        const grossProfitBeforeComm = netRev - cogs;
        const commCop =
          commPct !== null && grossProfitBeforeComm > 0
            ? Math.round(( netRev * commPct ) / 100)
            : commPct === 0
              ? 0
              : null;
        const attrProfit =
          commCop !== null ? grossProfitBeforeComm - commCop : grossProfitBeforeComm;

        ownerMap.set(alloc.ownerId, {
          ownerId: alloc.ownerId,
          ownerName: alloc.ownerName,
          lotsUsed: [alloc.lotId],
          grossUnitsAllocated: alloc.qtyAllocated,
          returnedUnits: alloc.qtyReturned,
          netUnitsSold: netUnits,
          grossRevenueCop: grossRev,
          discountAllocatedCop: alloc.discountAllocatedCop,
          returnAmountCop: alloc.returnAmountCop,
          netRevenueCop: netRev,
          cogsTotalCop: cogs,
          grossProfitBeforeCommissionCop: grossProfitBeforeComm,
          storeCommissionPct: commPct,
          storeCommissionCop: commCop,
          attributableOwnerProfitCop: attrProfit,
          agreementStatusLabel: isConfigured ? 'ACTIVO' : 'PENDIENTE DE CONFIGURAR'
        });
      } else {
        if (!existing.lotsUsed.includes(alloc.lotId)) {
          existing.lotsUsed.push(alloc.lotId);
        }
        existing.grossUnitsAllocated += alloc.qtyAllocated;
        existing.returnedUnits += alloc.qtyReturned;
        existing.netUnitsSold += netUnits;
        existing.grossRevenueCop += grossRev;
        existing.discountAllocatedCop += alloc.discountAllocatedCop;
        existing.returnAmountCop += alloc.returnAmountCop;
        existing.netRevenueCop += netRev;
        existing.cogsTotalCop += cogs;
        existing.grossProfitBeforeCommissionCop =
          existing.netRevenueCop - existing.cogsTotalCop;

        if (existing.storeCommissionPct !== null) {
          existing.storeCommissionCop =
            existing.grossProfitBeforeCommissionCop > 0
              ? Math.round((existing.netRevenueCop * existing.storeCommissionPct) / 100)
              : 0;
          existing.attributableOwnerProfitCop =
            existing.grossProfitBeforeCommissionCop - existing.storeCommissionCop;
        } else {
          existing.storeCommissionCop = null;
          existing.attributableOwnerProfitCop = existing.grossProfitBeforeCommissionCop;
        }
      }
    }
  }

  const netMerchandiseRevenueCop = Math.max(
    0,
    grossMerchandiseSubtotalCop - totalLineDiscountsCop - returnedMerchandiseCop
  );
  const shippingChargedToCustomerCop = order.shippingChargedCop;
  const shippingRealCarrierCostCop = order.shippingRealCostCop;
  const netLogisticsResultCop = shippingChargedToCustomerCop - shippingRealCarrierCostCop;
  const netOrderTotalBilledCop =
    order.status === 'cancelled'
      ? 0
      : netMerchandiseRevenueCop + shippingChargedToCustomerCop;

  const grossMerchandiseProfitCop = netMerchandiseRevenueCop - totalCogsCop;
  const orderOperatingProfitCop = grossMerchandiseProfitCop + netLogisticsResultCop;

  const grossMarginPct =
    netMerchandiseRevenueCop > 0
      ? Number(((grossMerchandiseProfitCop / netMerchandiseRevenueCop) * 100).toFixed(2))
      : 0;
  const operatingMarginPct =
    netOrderTotalBilledCop > 0
      ? Number(((orderOperatingProfitCop / netOrderTotalBilledCop) * 100).toFixed(2))
      : 0;

  const orderPayments = state.payments.filter((p) => p.salesOrderId === order.id);
  const totalCollectedCashCop = orderPayments
    .filter((p) => p.status === 'confirmed')
    .reduce((acc, p) => acc + p.amountCop, 0);
  const totalRefundedCashCop = orderPayments
    .filter((p) => p.status === 'refunded')
    .reduce((acc, p) => acc + p.amountCop, 0);
  const netCollectedCashCop = Math.max(0, totalCollectedCashCop - totalRefundedCashCop);
  const pendingReceivableCop = Math.max(0, netOrderTotalBilledCop - netCollectedCashCop);

  const ownerBreakdowns = Array.from(ownerMap.values());

  return {
    salesOrderId: order.id,
    orderNumber: order.orderNumber,
    orderStatus: order.status,
    paymentStatus: order.paymentStatus,
    grossMerchandiseSubtotalCop,
    totalLineDiscountsCop,
    returnedMerchandiseCop,
    netMerchandiseRevenueCop,
    shippingChargedToCustomerCop,
    shippingRealCarrierCostCop,
    netLogisticsResultCop,
    netOrderTotalBilledCop,
    totalCogsCop,
    grossMerchandiseProfitCop,
    orderOperatingProfitCop,
    grossMarginPct,
    operatingMarginPct,
    totalCollectedCashCop,
    totalRefundedCashCop,
    netCollectedCashCop,
    pendingReceivableCop,
    distinctOwnersCount: ownerBreakdowns.length,
    ownerBreakdowns
  };
}

// ============================================================================
// 5. SUITE AUTOMATIZADA DE LAS 9 PRUEBAS OBLIGATORIAS (SANDBOX AISLADO)
// ============================================================================

export async function runSalesOrdersCrmTestSuite(): Promise<SalesCrmTestResult[]> {
  await ensureExcelBaselineLoadedInInventory('admin@realtws.co');
  const baseInv = getInventoryPurchaseState();
  const baseSales = getSalesOrdersCrmState();

  // Clonar estados en un sandbox aislado para no contaminar datos reales de producción
  const sandboxInv: InventoryPurchaseStoreState = JSON.parse(JSON.stringify(baseInv));
  const sandboxSales: SalesOrdersCrmStoreState = JSON.parse(JSON.stringify(baseSales));

  // Preparar un segundo propietario en el sandbox para la prueba multipropietario (#3)
  if (!sandboxInv.owners.some((o) => o.id === 'OWN-0002')) {
    sandboxInv.owners.push({
      id: 'OWN-0002',
      fullName: 'Socio Comercial Dos (Sandbox)',
      status: 'active'
    });
  }

  // Asegurar que los SKUs de prueba existan en sandboxInv.catalog
  const ensureSandboxSku = (
    sku: string,
    productCode: string,
    productName: string,
    category: string,
    variantName: string,
    priceCop: number
  ) => {
    if (!sandboxInv.catalog[sku]) {
      sandboxInv.catalog[sku] = {
        sku,
        productCode,
        productName,
        brand: 'REAL TWS',
        model: productCode,
        variantName,
        category,
        status: 'active',
        approvedSalePriceCop: priceCop,
        imageUrls: [],
        features: [],
        history: [],
        createdAt: '2026-11-13T00:00:00.000Z',
        updatedAt: '2026-11-13T00:00:00.000Z'
      } as unknown as InventoryPurchaseStoreState['catalog'][string];
    }
  };
  ensureSandboxSku('COM-PER-001-AZU', 'PRD-0001', 'Combo Teclado y Mouse Inalámbrico Azul', 'Computación', 'Azul', 45000);
  ensureSandboxSku('AUD-TWS-003-NEG', 'PRD-AUD-003', 'Audífonos Inalámbricos M10 / F9', 'Audio', 'Negro', 65000);
  ensureSandboxSku('HOG-ACC-001-NEG', 'PRD-HOG-001', 'Báscula Digital Gramera de Cocina', 'Hogar', 'Negro', 38000);

  // Asegurar un lote con exactamente 1 unidad disponible para la prueba #1 (Dos vendedores última unidad)
  const lastUnitAllocId = 'SANDBOX-LAST-UNIT-ALLOC';
  sandboxInv.allocations.push({
    id: lastUnitAllocId,
    allocationCode: 'ASG-SBX-LAST-1',
    lotId: 'LOT-SBX-LAST-UNIT',
    lotOrigin: 'purchase_receipt',
    receivedDate: '2026-11-13',
    sku: 'COM-PER-001-AZU',
    productCode: 'PRD-0001',
    productName: 'Combo Teclado y Mouse Inalámbrico Azul',
    category: 'Computación',
    ownerId: 'OWN-0001',
    ownerName: 'Eberto',
    supplierId: 'SUP-001',
    supplierName: 'Proveedor Mayorista',
    storageBin: 'EST-A1',
    qtyInitialAssigned: 1,
    qtyPhysical: 1,
    qtyGood: 1,
    qtyDefective: 0,
    qtyPendingInspection: 0,
    qtyReserved: 0,
    qtyAvailable: 1,
    purchaseUnitCostCop: 19300,
    inboundShippingUnitCostCop: 0,
    effectiveUnitCostCop: 19300,
    costStatus: 'CONFIRMED',
    reconciliationState: 'reconciled',
    evidenceUrls: [],
    lockVersion: 1,
    notes: 'Última unidad disponible para prueba de concurrencia entre dos vendedores',
    updatedAt: '2026-11-13T00:00:00.000Z'
  });

  // Asegurar dos asignaciones de distinto propietario para el mismo SKU AUD-TWS-003-NEG (Prueba #3)
  const owner1MultiAllocId = 'SANDBOX-MULTI-OWN1';
  const owner2MultiAllocId = 'SANDBOX-MULTI-OWN2';
  sandboxInv.allocations.push(
    {
      id: owner1MultiAllocId,
      allocationCode: 'ASG-SBX-M1',
      lotId: 'LOT-OWN1-AUD-003',
      lotOrigin: 'excel_initial_import',
      receivedDate: '2026-11-10',
      sku: 'AUD-TWS-003-NEG',
      productCode: 'PRD-AUD-003',
      productName: 'Audífonos Inalámbricos M10 / F9',
      category: 'Audio',
      ownerId: 'OWN-0001',
      ownerName: 'Eberto',
      supplierId: 'SUP-001',
      supplierName: 'Proveedor Local',
      storageBin: 'EST-B1',
      qtyInitialAssigned: 10,
      qtyPhysical: 10,
      qtyGood: 10,
      qtyDefective: 0,
      qtyPendingInspection: 0,
      qtyReserved: 0,
      qtyAvailable: 10,
      purchaseUnitCostCop: 24500,
      inboundShippingUnitCostCop: 0,
      effectiveUnitCostCop: 24500,
      costStatus: 'CONFIRMED',
      reconciliationState: 'reconciled',
      evidenceUrls: [],
      lockVersion: 1,
      notes: 'Lote de Eberto OWN-0001 ($24,500 COP)',
      updatedAt: '2026-11-13T00:00:00.000Z'
    },
    {
      id: owner2MultiAllocId,
      allocationCode: 'ASG-SBX-M2',
      lotId: 'LOT-OWN2-AUD-003',
      lotOrigin: 'purchase_receipt',
      receivedDate: '2026-11-12',
      sku: 'AUD-TWS-003-NEG',
      productCode: 'PRD-AUD-003',
      productName: 'Audífonos Inalámbricos M10 / F9',
      category: 'Audio',
      ownerId: 'OWN-0002',
      ownerName: 'Socio Comercial Dos (Sandbox)',
      supplierId: 'SUP-001',
      supplierName: 'Proveedor Local',
      storageBin: 'EST-B2',
      qtyInitialAssigned: 10,
      qtyPhysical: 10,
      qtyGood: 10,
      qtyDefective: 0,
      qtyPendingInspection: 0,
      qtyReserved: 0,
      qtyAvailable: 10,
      purchaseUnitCostCop: 28000,
      inboundShippingUnitCostCop: 0,
      effectiveUnitCostCop: 28000,
      costStatus: 'CONFIRMED',
      reconciliationState: 'reconciled',
      evidenceUrls: [],
      lockVersion: 1,
      notes: 'Lote de Socio Dos OWN-0002 ($28,000 COP)',
      updatedAt: '2026-11-13T00:00:00.000Z'
    }
  );

  // Asegurar segundo SKU para pedido multivariado (HOG-ACC-001-NEG)
  const scaleAllocId = 'SANDBOX-SCALE-OWN1';
  sandboxInv.allocations.push({
    id: scaleAllocId,
    allocationCode: 'ASG-SBX-SCL',
    lotId: 'LOT-OWN1-HOG-001',
    lotOrigin: 'excel_initial_import',
    receivedDate: '2026-11-10',
    sku: 'HOG-ACC-001-NEG',
    productCode: 'PRD-HOG-001',
    productName: 'Báscula Digital Gramera de Cocina',
    category: 'Hogar',
    ownerId: 'OWN-0001',
    ownerName: 'Eberto',
    supplierId: 'SUP-001',
    supplierName: 'Proveedor Local',
    storageBin: 'EST-C1',
    qtyInitialAssigned: 8,
    qtyPhysical: 8,
    qtyGood: 8,
    qtyDefective: 0,
    qtyPendingInspection: 0,
    qtyReserved: 0,
    qtyAvailable: 8,
    purchaseUnitCostCop: 2400,
    inboundShippingUnitCostCop: 0,
    effectiveUnitCostCop: 2400,
    costStatus: 'CONFIRMED',
    reconciliationState: 'reconciled',
    evidenceUrls: [],
    lockVersion: 1,
    notes: 'Lote Gramera OWN-0001 ($2,400 COP)',
    updatedAt: '2026-11-13T00:00:00.000Z'
  });

  const results: SalesCrmTestResult[] = [];

  // Registrar un cliente base en el sandbox
  const { customer: sandboxCustomer } = registerOrValidateCustomer(
    {
      fullName: 'Carlos Mendoza (Cliente Prueba)',
      phoneWhatsapp: '+57 315 888 9900',
      documentType: 'CC',
      documentNumber: '1045998877',
      city: 'Barranquilla',
      shippingAddress: 'Calle 84 # 52-10 Apto 301',
      acquisitionSource: 'whatsapp'
    },
    sandboxSales
  );

  // -------------------------------------------------------------------------
  // PRUEBA 1: Dos vendedores intentando reservar última unidad
  // -------------------------------------------------------------------------
  {
    const orderSeller1 = txCreateSalesOrder(
      {
        customerId: sandboxCustomer.id,
        salesChannel: 'whatsapp',
        shippingChargedCop: 0,
        shippingRealCostCop: 0,
        sellerName: 'Vendedor 1 (Andrés)',
        notes: 'Intento reserva última unidad Vendedor 1',
        lines: [
          {
            sku: 'COM-PER-001-AZU',
            qtyOrdered: 1,
            unitSalePriceCop: 50000,
            lineDiscountCop: 0,
            allocations: [{ lotAllocationId: lastUnitAllocId, qtyAllocated: 1 }]
          }
        ]
      },
      sandboxSales,
      sandboxInv
    );

    const orderSeller2 = txCreateSalesOrder(
      {
        customerId: sandboxCustomer.id,
        salesChannel: 'instagram',
        shippingChargedCop: 0,
        shippingRealCostCop: 0,
        sellerName: 'Vendedor 2 (Laura)',
        notes: 'Intento reserva última unidad Vendedor 2',
        lines: [
          {
            sku: 'COM-PER-001-AZU',
            qtyOrdered: 1,
            unitSalePriceCop: 50000,
            lineDiscountCop: 0,
            allocations: [{ lotAllocationId: lastUnitAllocId, qtyAllocated: 1 }]
          }
        ]
      },
      sandboxSales,
      sandboxInv
    );

    // Vendedor 1 reserva la última unidad (qtyAvailable pasa de 1 a 0)
    txReserveSalesOrderInventory(orderSeller1.id, 'Vendedor 1 (Andrés)', sandboxSales, sandboxInv);

    // Vendedor 2 intenta reservar la misma última unidad y debe ser bloqueado
    let seller2Blocked = false;
    let seller2ErrorMsg = '';
    try {
      txReserveSalesOrderInventory(orderSeller2.id, 'Vendedor 2 (Laura)', sandboxSales, sandboxInv);
    } catch (err) {
      seller2Blocked = true;
      seller2ErrorMsg = err instanceof Error ? err.message : String(err);
    }

    const allocAfter = sandboxInv.allocations.find((a) => a.id === lastUnitAllocId)!;
    const passed =
      seller2Blocked &&
      allocAfter.qtyReserved === 1 &&
      allocAfter.qtyAvailable === 0 &&
      orderSeller1.status === 'reserved' &&
      orderSeller2.status === 'draft';

    results.push({
      testId: 'SALES-TEST-01',
      title: '1. Dos vendedores intentando reservar última unidad',
      scenario:
        'Lote LOT-SBX-LAST-UNIT tiene 1 sola unidad disponible. Vendedor 1 y Vendedor 2 crean pedidos por esa unidad e intentan reservarla.',
      expected:
        'Vendedor 1 obtiene la reserva (qtyReserved=1, qtyAvailable=0, lockVersion=2). Vendedor 2 recibe bloqueo de concurrencia sin sobre-reservar.',
      actual: `Vendedor 1 reservó OK (qtyAvailable=${allocAfter.qtyAvailable}, qtyReserved=${allocAfter.qtyReserved}) | Vendedor 2 bloqueado: "${seller2ErrorMsg}"`,
      passed,
      details: [
        `Pedido Vendedor 1 (${orderSeller1.orderNumber}): estado '${orderSeller1.status}'`,
        `Pedido Vendedor 2 (${orderSeller2.orderNumber}): bloqueado en '${orderSeller2.status}'`,
        `Stock resultante en lote: Físico=${allocAfter.qtyPhysical}, Reservado=${allocAfter.qtyReserved}, Disponible=${allocAfter.qtyAvailable}`
      ]
    });

    // Guardamos orderSeller1 para usarlo en la Prueba #4 (Cancelación y liberación de reserva)
  }

  // -------------------------------------------------------------------------
  // PRUEBA 2 & 3: Pedido multivariado + Dos propietarios en la misma venta
  // -------------------------------------------------------------------------
  const multiOrder = txCreateSalesOrder(
    {
      customerId: sandboxCustomer.id,
      salesChannel: 'whatsapp',
      shippingChargedCop: 12000,
      shippingRealCostCop: 10000,
      sellerName: 'Vendedor 1 (Andrés)',
      notes: 'Pedido multivariado con línea dividida entre 2 propietarios',
      lines: [
        {
          // Línea 1: 5 unidades de AUD-TWS-003-NEG divididas entre OWN-0001 (2 uds @ costo $24,500) y OWN-0002 (3 uds @ costo $28,000)
          sku: 'AUD-TWS-003-NEG',
          qtyOrdered: 5,
          unitSalePriceCop: 50000,
          lineDiscountCop: 10000, // $2,000 de descuento por unidad -> $4,000 OWN-0001 y $6,000 OWN-0002
          allocations: [
            { lotAllocationId: owner1MultiAllocId, qtyAllocated: 2 },
            { lotAllocationId: owner2MultiAllocId, qtyAllocated: 3 }
          ]
        },
        {
          // Línea 2 (segunda variante en el mismo pedido): 2 unidades de HOG-ACC-001-NEG de OWN-0001 (@ costo $2,400)
          sku: 'HOG-ACC-001-NEG',
          qtyOrdered: 2,
          unitSalePriceCop: 15000,
          lineDiscountCop: 0,
          allocations: [{ lotAllocationId: scaleAllocId, qtyAllocated: 2 }]
        }
      ],
      reserveImmediately: true
    },
    sandboxSales,
    sandboxInv
  );

  {
    const profMulti = calculateOrderProfitability(multiOrder.id, sandboxSales);
    const passedMultiVariant =
      multiOrder.lines.length === 2 &&
      profMulti.grossMerchandiseSubtotalCop === 280000 && // (5 * 50,000) + (2 * 15,000)
      profMulti.totalLineDiscountsCop === 10000 &&
      profMulti.netMerchandiseRevenueCop === 270000;

    results.push({
      testId: 'SALES-TEST-02',
      title: '2. Pedido multivariado',
      scenario:
        'Pedido con 2 SKUs distintos: 5 uds de AUD-TWS-003-NEG ($50,000 c/u, desc. $10,000) + 2 uds de HOG-ACC-001-NEG ($15,000 c/u) + envío cobrado $12,000.',
      expected:
        'Subtotal bruto mercancía = $280,000 COP, Descuento = $10,000 COP, Neto mercancía = $270,000 COP, Total facturado con envío = $282,000 COP.',
      actual: `Líneas=${multiOrder.lines.length} | Bruto=${profMulti.grossMerchandiseSubtotalCop} | Desc=${profMulti.totalLineDiscountsCop} | Neto Mercancía=${profMulti.netMerchandiseRevenueCop} | Total Pedido=${profMulti.netOrderTotalBilledCop}`,
      passed: passedMultiVariant,
      details: [
        `Línea 1: ${multiOrder.lines[0].sku} x ${multiOrder.lines[0].qtyOrdered} uds`,
        `Línea 2: ${multiOrder.lines[1].sku} x ${multiOrder.lines[1].qtyOrdered} uds`,
        `Total pedido con envío ($12,000): $${profMulti.netOrderTotalBilledCop.toLocaleString('es-CO')} COP`
      ]
    });

    const line1Allocs = multiOrder.lines[0].allocations;
    const allocOwn1 = line1Allocs.find((a) => a.ownerId === 'OWN-0001')!;
    const allocOwn2 = line1Allocs.find((a) => a.ownerId === 'OWN-0002')!;
    const owner1Summary = profMulti.ownerBreakdowns.find((o) => o.ownerId === 'OWN-0001')!;
    const owner2Summary = profMulti.ownerBreakdowns.find((o) => o.ownerId === 'OWN-0002')!;

    // Costo OWN-0001 = (2 * 24,500) + (2 * 2,400) = 49,000 + 4,800 = 53,800 COP
    // Costo OWN-0002 = (3 * 28,000) = 84,000 COP
    // Total COGS = 137,800 COP
    const passedTwoOwners =
      allocOwn1.unitCostCop === 24500 &&
      allocOwn2.unitCostCop === 28000 &&
      owner1Summary.cogsTotalCop === 53800 &&
      owner2Summary.cogsTotalCop === 84000 &&
      profMulti.totalCogsCop === 137800;

    results.push({
      testId: 'SALES-TEST-03',
      title: '3. Dos propietarios en la misma venta',
      scenario:
        'La línea de 5 uds de AUD-TWS-003-NEG se divide en 2 asignaciones: 2 uds de OWN-0001 (costo $24,500) y 3 uds de OWN-0002 (costo $28,000).',
      expected:
        'Cada asignación conserva su lote, propietario y costo unitario exacto (COGS OWN-0001 = $53,800 COP incluyendo gramera; COGS OWN-0002 = $84,000 COP; COGS Total = $137,800 COP).',
      actual: `OWN-0001: costo unit $24,500, COGS total=$${owner1Summary.cogsTotalCop.toLocaleString('es-CO')} | OWN-0002: costo unit $28,000, COGS total=$${owner2Summary.cogsTotalCop.toLocaleString('es-CO')}`,
      passed: passedTwoOwners,
      details: [
        `Asignación 1 (OWN-0001 - ${allocOwn1.lotId}): ${allocOwn1.qtyAllocated} uds, Venta neta $${(allocOwn1.qtyAllocated * allocOwn1.unitSalePriceCop - allocOwn1.discountAllocatedCop).toLocaleString('es-CO')}, Costo unitario $${allocOwn1.unitCostCop.toLocaleString('es-CO')}`,
        `Asignación 2 (OWN-0002 - ${allocOwn2.lotId}): ${allocOwn2.qtyAllocated} uds, Venta neta $${(allocOwn2.qtyAllocated * allocOwn2.unitSalePriceCop - allocOwn2.discountAllocatedCop).toLocaleString('es-CO')}, Costo unitario $${allocOwn2.unitCostCop.toLocaleString('es-CO')}`
      ]
    });
  }

  // -------------------------------------------------------------------------
  // PRUEBA 4: Cancelación libera reservas automáticamente
  // -------------------------------------------------------------------------
  {
    const reservedOrderToCancel = sandboxSales.orders.find(
      (o) => o.notes === 'Intento reserva última unidad Vendedor 1'
    )!;
    const allocBeforeCancel = sandboxInv.allocations.find((a) => a.id === lastUnitAllocId)!;
    const availBefore = allocBeforeCancel.qtyAvailable; // 0

    const { order: cancelledOrder, releasedAllocationsCount } = txCancelSalesOrder(
      {
        salesOrderId: reservedOrderToCancel.id,
        reason: 'Cliente desistió de la compra antes del despacho',
        actorName: 'Vendedor 1 (Andrés)'
      },
      sandboxSales,
      sandboxInv
    );

    const allocAfterCancel = sandboxInv.allocations.find((a) => a.id === lastUnitAllocId)!;
    const passedCancel =
      availBefore === 0 &&
      cancelledOrder.status === 'cancelled' &&
      releasedAllocationsCount === 1 &&
      allocAfterCancel.qtyReserved === 0 &&
      allocAfterCancel.qtyAvailable === 1;

    results.push({
      testId: 'SALES-TEST-04',
      title: '4. Cancelación libera reservas',
      scenario:
        'Se cancela el pedido reservado del Vendedor 1 sobre LOT-SBX-LAST-UNIT antes del despacho.',
      expected:
        'Estado del pedido pasa a cancelled, la reserva pasa a released, qtyReserved baja de 1 a 0 y qtyAvailable se restaura de 0 a 1 con movimiento RESERVATION_RELEASE.',
      actual: `Estado=${cancelledOrder.status} | Reservas liberadas=${releasedAllocationsCount} | qtyReserved=${allocAfterCancel.qtyReserved} | qtyAvailable=${allocAfterCancel.qtyAvailable}`,
      passed: passedCancel,
      details: [
        `Antes de cancelar: Reservado=1, Disponible=${availBefore}`,
        `Después de cancelar: Reservado=${allocAfterCancel.qtyReserved}, Disponible=${allocAfterCancel.qtyAvailable}`
      ]
    });
  }

  // -------------------------------------------------------------------------
  // PRUEBA 6: Pago parcial (sin marcado automático de pagado)
  // -------------------------------------------------------------------------
  {
    txConfirmSalesOrder(multiOrder.id, 'Vendedor 1 (Andrés)', sandboxSales, sandboxInv);
    const statusRightAfterConfirm = multiOrder.paymentStatus; // debe seguir 'pending'

    const partialPayment = txRegisterOrderPayment(
      {
        salesOrderId: multiOrder.id,
        paymentMethod: 'nequi',
        amountCop: 150000, // Total del pedido es $282,000 COP
        status: 'confirmed',
        referenceCode: 'NEQUI-998811',
        receivedBy: 'Tesorería REAL TWS',
        notes: 'Abono inicial del 53% vía Nequi'
      },
      sandboxSales
    );

    const profAfterPartial = calculateOrderProfitability(multiOrder.id, sandboxSales);
    const passedPartial =
      statusRightAfterConfirm === 'pending' &&
      multiOrder.paymentStatus === 'partial' &&
      profAfterPartial.netCollectedCashCop === 150000 &&
      profAfterPartial.pendingReceivableCop === 132000;

    results.push({
      testId: 'SALES-TEST-06',
      title: '6. Pago parcial (sin pago automático)',
      scenario:
        'Al confirmar el pedido de $282,000 COP no se marca pagado automáticamente (pending). Luego se registra un abono confirmado de $150,000 COP.',
      expected:
        'Estado de pago pasa a partial, Recaudado = $150,000 COP y Saldo pendiente por cobrar = $132,000 COP.',
      actual: `Al confirmar=${statusRightAfterConfirm} | Tras abono=${multiOrder.paymentStatus} | Cobrado=$${profAfterPartial.netCollectedCashCop.toLocaleString('es-CO')} | Pendiente=$${profAfterPartial.pendingReceivableCop.toLocaleString('es-CO')}`,
      passed: passedPartial,
      details: [
        `Recibo ${partialPayment.paymentCode} (${partialPayment.paymentMethod}): $${partialPayment.amountCop.toLocaleString('es-CO')} COP`,
        `Total pedido: $282,000 COP -> Saldo por cobrar: $${profAfterPartial.pendingReceivableCop.toLocaleString('es-CO')} COP`
      ]
    });
  }

  // -------------------------------------------------------------------------
  // PRUEBA 7: Despacho (Preparación, Guía, Salida de Stock y Entrega)
  // -------------------------------------------------------------------------
  {
    const own1Before = sandboxInv.allocations.find((a) => a.id === owner1MultiAllocId)!.qtyPhysical; // 10
    const own2Before = sandboxInv.allocations.find((a) => a.id === owner2MultiAllocId)!.qtyPhysical; // 10

    txPrepareSalesOrder(
      {
        salesOrderId: multiOrder.id,
        carrierName: 'Interrapidísimo',
        destinationCity: 'Barranquilla',
        destinationAddress: 'Calle 84 # 52-10 Apto 301',
        shippingRealCostCop: 10000,
        actorName: 'Operador Logístico'
      },
      sandboxSales,
      sandboxInv
    );

    const { order: dispatchedOrder, shipment } = txDispatchSalesOrder(
      {
        salesOrderId: multiOrder.id,
        carrierName: 'Interrapidísimo',
        trackingNumber: 'GUIA-2400998877',
        shippingRealCostCop: 10000,
        actorName: 'Operador Logístico',
        notes: 'Empaque sellado y entregado a transportadora'
      },
      sandboxSales,
      sandboxInv
    );

    const own1After = sandboxInv.allocations.find((a) => a.id === owner1MultiAllocId)!;
    const own2After = sandboxInv.allocations.find((a) => a.id === owner2MultiAllocId)!;

    txDeliverSalesOrder(
      multiOrder.id,
      'Operador Logístico',
      'Recibido en portería por el cliente Carlos Mendoza',
      sandboxSales
    );

    const passedDispatch =
      own1Before === 10 &&
      own1After.qtyPhysical === 8 &&
      own1After.qtyReserved === 0 &&
      own2Before === 10 &&
      own2After.qtyPhysical === 7 &&
      own2After.qtyReserved === 0 &&
      shipment.trackingNumber === 'GUIA-2400998877' &&
      dispatchedOrder.status === 'delivered';

    results.push({
      testId: 'SALES-TEST-07',
      title: '7. Despacho y salida física de stock',
      scenario:
        'Alistamiento (preparing), despacho con transportadora Interrapidísimo y guía GUIA-2400998877 ($10,000 costo envío) y confirmación de entrega.',
      expected:
        'Consume reservas y genera salidas reales SALE_DISPATCH: lote OWN-0001 baja de 10 a 8 uds; lote OWN-0002 baja de 10 a 7 uds; guía pasa a delivered.',
      actual: `Guía=${shipment.trackingNumber} (${shipment.status}) | Stock físico OWN-0001: ${own1Before}->${own1After.qtyPhysical} | Stock físico OWN-0002: ${own2Before}->${own2After.qtyPhysical}`,
      passed: passedDispatch,
      details: [
        `Transportadora: ${shipment.carrierName} | Guía: ${shipment.trackingNumber} | Costo envío: $${shipment.shippingCostCop.toLocaleString('es-CO')} COP`,
        `Eventos de seguimiento registrados en la guía: ${shipment.trackingEvents.length}`
      ]
    });
  }

  // -------------------------------------------------------------------------
  // PRUEBA 5: Devolución (conservando el propietario y lote original)
  // -------------------------------------------------------------------------
  {
    const allocOwn2InOrder = multiOrder.lines[0].allocations.find(
      (a) => a.ownerId === 'OWN-0002'
    )!;
    const own2LotBeforeReturn = sandboxInv.allocations.find((a) => a.id === owner2MultiAllocId)!
      .qtyPhysical; // 7

    const { order: orderAfterReturn, returnRecord } = txReturnSalesOrderAllocation(
      {
        salesOrderId: multiOrder.id,
        orderAllocationId: allocOwn2InOrder.id,
        qtyToReturn: 1,
        itemCondition: 'good_restock',
        reason: 'Cliente cambió 1 unidad sin destapar',
        actorName: 'Operador Postventa'
      },
      sandboxSales,
      sandboxInv
    );

    const own2LotAfterReturn = sandboxInv.allocations.find((a) => a.id === owner2MultiAllocId)!;
    const own1LotAfterReturn = sandboxInv.allocations.find((a) => a.id === owner1MultiAllocId)!;

    const passedReturn =
      returnRecord.ownerId === 'OWN-0002' &&
      returnRecord.lotId === 'LOT-OWN2-AUD-003' &&
      returnRecord.unitCostPreservedCop === 28000 &&
      returnRecord.refundAmountCop === 48000 && // $50,000 - $2,000 descuento unitario
      own2LotBeforeReturn === 7 &&
      own2LotAfterReturn.qtyPhysical === 8 &&
      own1LotAfterReturn.qtyPhysical === 8 && // No alteró el stock de OWN-0001
      orderAfterReturn.status === 'partially_returned';

    results.push({
      testId: 'SALES-TEST-05',
      title: '5. Devolución conservando propietario y lote original',
      scenario:
        'El cliente devuelve 1 unidad de AUD-TWS-003-NEG correspondiente a la asignación de OWN-0002 (lote LOT-OWN2-AUD-003).',
      expected:
        'Genera movimiento CUSTOMER_RETURN reingresando 1 unidad exclusivamente al lote LOT-OWN2-AUD-003 de OWN-0002 (físico sube de 7 a 8), deduce $48,000 de venta neta y $28,000 de COGS de OWN-0002 sin tocar a OWN-0001.',
      actual: `Devolución ${returnRecord.returnCode}: Propietario=${returnRecord.ownerId}, Lote=${returnRecord.lotId}, Reintegro=$${returnRecord.refundAmountCop.toLocaleString('es-CO')}, Stock OWN-0002=${own2LotAfterReturn.qtyPhysical}`,
      passed: passedReturn,
      details: [
        `Propietario original conservado: ${returnRecord.ownerId} (${returnRecord.ownerName})`,
        `Costo unitario revertido en COGS: $${returnRecord.unitCostPreservedCop.toLocaleString('es-CO')} COP`
      ]
    });
  }

  // -------------------------------------------------------------------------
  // PRUEBA 8: Bloqueo de registro duplicado de cliente
  // -------------------------------------------------------------------------
  {
    let duplicateBlocked = false;
    let duplicateErrorMsg = '';
    try {
      registerOrValidateCustomer(
        {
          fullName: 'Carlos Mendoza Duplicado',
          phoneWhatsapp: '315-888-9900', // Mismo número normalizado 3158889900 que se registró con +57 315 888 9900
          city: 'Barranquilla'
        },
        sandboxSales
      );
    } catch (err) {
      duplicateBlocked = true;
      duplicateErrorMsg = err instanceof Error ? err.message : String(err);
    }

    results.push({
      testId: 'SALES-TEST-08',
      title: '8. Prevención de registro duplicado de cliente',
      scenario:
        'Se intenta registrar un nuevo cliente con el teléfono "315-888-9900", que normalizado coincide con "+57 315 888 9900" de Carlos Mendoza.',
      expected:
        'El sistema detecta la colisión por teléfono normalizado (3158889900), bloquea el duplicado e indica el código del cliente existente.',
      actual: duplicateBlocked ? `Bloqueado correctamente: "${duplicateErrorMsg}"` : 'ERROR: Permitió duplicado',
      passed: duplicateBlocked,
      details: [
        `Teléfono original: "+57 315 888 9900" -> Normalizado: "3158889900"`,
        `Intento duplicado: "315-888-9900" -> Normalizado: "3158889900"`
      ]
    });
  }

  // -------------------------------------------------------------------------
  // PRUEBA 9: Verificar la rentabilidad exacta por pedido
  // -------------------------------------------------------------------------
  {
    const finalProf = calculateOrderProfitability(multiOrder.id, sandboxSales);
    // Verificación matemática tras la devolución de 1 unidad de OWN-0002:
    // Subtotal Bruto Inicial = $280,000 COP
    // Descuento Líneas = $10,000 COP
    // Devolución (1 ud OWN-0002 neta) = $48,000 COP
    // Venta Neta Mercancía = $280,000 - $10,000 - $48,000 = $222,000 COP
    // COGS Neto = OWN-0001 ($49,000 + $4,800 = $53,800) + OWN-0002 (2 uds * $28,000 = $56,000) = $109,800 COP
    // Utilidad Bruta Mercancía = $222,000 - $109,800 = $112,200 COP
    // Resultado Logístico = Envío cobrado ($12,000) - Costo transportadora ($10,000) = +$2,000 COP
    // Utilidad Operativa Total del Pedido = $112,200 + $2,000 = $114,200 COP
    const passedProfitability =
      finalProf.netMerchandiseRevenueCop === 222000 &&
      finalProf.totalCogsCop === 109800 &&
      finalProf.grossMerchandiseProfitCop === 112200 &&
      finalProf.netLogisticsResultCop === 2000 &&
      finalProf.orderOperatingProfitCop === 114200;

    results.push({
      testId: 'SALES-TEST-09',
      title: '9. Verificar la rentabilidad por pedido',
      scenario:
        'Cálculo integral de rentabilidad del pedido multivariado y multipropietario tras el despacho y la devolución parcial.',
      expected:
        'Venta Neta Mercancía = $222,000 COP | COGS Total = $109,800 COP | Utilidad Bruta Mercancía = $112,200 COP | Neto Envío = +$2,000 COP | Utilidad Operativa Pedido = $114,200 COP (Margen Bruto 50.54%).',
      actual: `Venta Neta=$${finalProf.netMerchandiseRevenueCop.toLocaleString('es-CO')} | COGS=$${finalProf.totalCogsCop.toLocaleString('es-CO')} | Utilidad Bruta=$${finalProf.grossMerchandiseProfitCop.toLocaleString('es-CO')} | Utilidad Operativa=$${finalProf.orderOperatingProfitCop.toLocaleString('es-CO')} (${finalProf.grossMarginPct}%)`,
      passed: passedProfitability,
      details: [
        `OWN-0001 (Eberto): Venta Neta = $126,000 COP | COGS = $53,800 COP | Utilidad Bruta = $72,200 COP`,
        `OWN-0002 (Socio Dos): Venta Neta = $96,000 COP | COGS = $56,000 COP | Utilidad Bruta = $40,000 COP`,
        `Envío Cobrado = $12,000 COP vs. Costo Real Guía = $10,000 COP (+$2,000 COP)`
      ]
    });
  }

  // Ordenar por ID de prueba (SALES-TEST-01 a SALES-TEST-09)
  return results.sort((a, b) => a.testId.localeCompare(b.testId));
}
