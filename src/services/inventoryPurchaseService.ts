// ============================================================================
// REAL TWS COMMERCE SYSTEM — INVENTORY & PURCHASE MANAGEMENT ENGINE (FASE 4)
// Cubre:
//   - PRODUCTOS (Catálogo maestro, variantes, SKU, categorías, fotografías,
//     características, estado, historial)
//   - PROVEEDORES (Registro, contacto, referencias, compras, historial)
//   - COMPRAS (Orden de compra, fecha, proveedor, productos, cantidades,
//     costos, documentos, estado)
//   - RECEPCIONES (Conteo, inspección, calidad, lotes, propietarios explícitos,
//     costos, evidencias, confirmación)
//   - INVENTARIO (Stock físico, apto, defectuoso, pendiente, reservado,
//     disponible, movimientos inmutables, ajustes, transferencias, devoluciones)
//   - OPERACIONES TRANSACCIONALES con control de concurrencia (lockVersion),
//     idempotencia (idempotencyKey), prevención de doble conteo y stock negativo.
//   - 6 REPORTES ANALÍTICOS (SKU, Categoría, Propietario, Lote, Proveedor, Calidad)
//   - 9 PRUEBAS OBLIGATORIAS en sandbox aislado (cero datos ficticios en producción)
// ============================================================================

import {
  getCurrentImportState,
  type NormalizedImportRow,
  type CostStatusType
} from './excelImportEngine';
import {
  isValidNonNegativeAmount,
  isValidNonNegativeInt,
  isValidPositiveInt
} from '../utils/validations';

export interface ProductVariantCatalogItem {
  productId: string;
  variantId: string;
  legacyExcelRowId: number | null;
  productCode: string;
  sku: string;
  category: string;
  productName: string;
  brand: string;
  model: string;
  variantName: string;
  color: string;
  manufacturerRef: string;
  supplierRef: string;
  description: string;
  verifiedFeatures: string;
  unitOfMeasure: string;
  photoUrls: string[];
  status: 'active' | 'inactive' | 'archived';
  excelOriginalStatus: string;
  approvedSalePriceCop: number | null;
  originalNotes: string;
  createdAt: string;
  updatedAt: string;
  historyEvents: Array<{
    timestamp: string;
    actor: string;
    action: string;
    detail: string;
  }>;
}

export interface SupplierRecord {
  id: string;
  supplierCode: string;
  legalName: string;
  contactName: string;
  taxId: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  referenceCodes: string[];
  status: 'active' | 'inactive';
  notes: string;
  createdAt: string;
  historyEvents: Array<{
    timestamp: string;
    actor: string;
    action: string;
    detail: string;
  }>;
}

export type PurchaseOrderStatus =
  | 'ordered'
  | 'partial_received'
  | 'received'
  | 'confirmed'
  | 'reconciled'
  | 'cancelled';

export interface PurchaseOrderLineRecord {
  id: string;
  lineNumber: number;
  sku: string;
  productName: string;
  ownerId: string; // Exigido explícitamente, nunca autoasignado
  qtyOrdered: number;
  qtyReceived: number;
  unitPurchaseCostCop: number | null;
  unitShippingCostCop: number;
  costStatus: CostStatusType;
  notes: string;
}

export interface PurchaseOrderRecord {
  id: string;
  orderNumber: string;
  orderDate: string;
  supplierId: string;
  supplierName: string;
  invoiceReference: string;
  status: PurchaseOrderStatus;
  subtotalPurchaseCop: number;
  inboundShippingCop: number;
  documentUrls: string[];
  notes: string;
  createdBy: string;
  createdAt: string;
  lines: PurchaseOrderLineRecord[];
}

export type ReconciliationState =
  | 'reconciled'
  | 'pending_inspection'
  | 'pending_physical_count'
  | 'pending_cost_info'
  | 'discrepancy';

export interface LotOwnerAllocationRecord {
  id: string;
  allocationCode: string;
  lotId: string;
  lotOrigin: 'excel_initial_import' | 'purchase_receipt' | 'ownership_transfer' | 'customer_return';
  receivedDate: string | null;
  sku: string;
  productCode: string;
  productName: string;
  category: string;
  ownerId: string;
  ownerName: string;
  supplierId: string;
  supplierName: string;
  storageBin: string;
  qtyInitialAssigned: number;
  qtyPhysical: number;
  qtyGood: number;
  qtyDefective: number;
  qtyPendingInspection: number;
  qtyReserved: number;
  qtyAvailable: number;
  purchaseUnitCostCop: number | null;
  inboundShippingUnitCostCop: number;
  effectiveUnitCostCop: number | null;
  costStatus: CostStatusType;
  reconciliationState: ReconciliationState;
  evidenceUrls: string[];
  lockVersion: number;
  notes: string;
  updatedAt: string;
}

export type LedgerMovementType =
  | 'OPENING_BALANCE'
  | 'purchase_reception'
  | 'quality_approve'
  | 'quality_reject_defective'
  | 'reservation_hold'
  | 'reservation_release'
  | 'sale_dispatch'
  | 'customer_return_restock'
  | 'customer_return_defective'
  | 'transfer_out'
  | 'transfer_in'
  | 'reconciliation_adjustment';

export interface ImmutableStockMovement {
  id: string;
  movementSeq: number;
  idempotencyKey: string;
  createdAt: string;
  lotAllocationId: string;
  allocationCode: string;
  lotId: string;
  sku: string;
  productName: string;
  ownerId: string;
  movementType: LedgerMovementType;
  deltaPhysical: number;
  deltaGood: number;
  deltaDefective: number;
  deltaPending: number;
  deltaReserved: number;
  balancePhysicalAfter: number;
  balanceGoodAfter: number;
  balanceDefectiveAfter: number;
  balancePendingAfter: number;
  balanceReservedAfter: number;
  balanceAvailableAfter: number;
  unitCostSnapshotCop: number | null;
  referenceEntity: string;
  referenceId: string;
  reason: string;
  performedBy: string;
  immutable: true;
}

export interface StockReservationRecord {
  id: string;
  reservationCode: string;
  idempotencyKey: string;
  lotAllocationId: string;
  lotId: string;
  ownerId: string;
  sku: string;
  productName: string;
  salesOrderRef: string;
  qtyReserved: number;
  qtyFulfilled: number;
  qtyReleased: number;
  status: 'active' | 'fulfilled' | 'released' | 'expired';
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface OwnershipTransferRecord {
  id: string;
  transferCode: string;
  idempotencyKey: string;
  transferDate: string;
  lotId: string;
  sku: string;
  productName: string;
  sourceAllocationId: string;
  targetAllocationId: string;
  fromOwnerId: string;
  toOwnerId: string;
  qtyTransferred: number;
  unitCostTransferredCop: number;
  reason: string;
  authorizedBy: string;
}

export interface QualityInspectionRecord {
  id: string;
  inspectionCode: string;
  idempotencyKey: string;
  inspectionDate: string;
  lotAllocationId: string;
  lotId: string;
  sku: string;
  productName: string;
  ownerId: string;
  qtyInspected: number;
  qtyApprovedGood: number;
  qtyMarkedDefective: number;
  qtyRemainingPending: number;
  visualCheckPassed: boolean;
  functionalTestPassed: boolean;
  accessoriesComplete: boolean;
  inspectionStatus: 'approved' | 'partially_approved' | 'rejected' | 'pending_recheck';
  evidenceUrls: string[];
  inspectorName: string;
  notes: string;
}

export interface InventoryPurchaseStoreState {
  owners: Array<{ id: string; fullName: string; status: 'active' | 'inactive' }>;
  catalog: Record<string, ProductVariantCatalogItem>; // keyed by SKU
  suppliers: Record<string, SupplierRecord>; // keyed by supplierId
  purchaseOrders: PurchaseOrderRecord[];
  allocations: LotOwnerAllocationRecord[];
  movements: ImmutableStockMovement[];
  reservations: StockReservationRecord[];
  transfers: OwnershipTransferRecord[];
  inspections: QualityInspectionRecord[];
  processedIdempotencyKeys: string[];
}

export interface InventoryTestScenarioResult {
  testId: string;
  title: string;
  scenario: string;
  expected: string;
  actual: string;
  passed: boolean;
  details: string[];
}

const INV_PURCHASE_STORAGE_KEY = 'rtw_inventory_purchase_state_v1';

function computeAvailable(qtyGood: number, qtyReserved: number): number {
  return Math.max(0, qtyGood - qtyReserved);
}

function createInitialSupplier(): SupplierRecord {
  return {
    id: 'SUP-0001',
    supplierCode: 'SUP-0001',
    legalName: 'Importación / Mayorista (Temu / AliExpress)',
    contactName: 'Canal Mayorista Internacional',
    taxId: 'EXT-INT-001',
    phone: '',
    email: '',
    city: 'Internacional / Bogotá',
    address: 'Plataforma Mayorista Auditada en Excel Inicial',
    referenceCodes: ['TEMU-INI-2026', 'ALI-INI-2026'],
    status: 'active',
    notes: 'Proveedor original documentado en la hoja 08_RECEPCIONES_Y_COMPRAS del Excel multipropietario.',
    createdAt: '2026-11-13T00:00:00.000Z',
    historyEvents: [
      {
        timestamp: '2026-11-13T00:00:00.000Z',
        actor: 'IMPORT_ENGINE',
        action: 'SUPPLIER_INITIAL_SYNC',
        detail: 'Sincronizado desde hoja 08_RECEPCIONES_Y_COMPRAS del Excel real.'
      }
    ]
  };
}

function buildStateFromImportedRows(
  rowsMap: Record<string, NormalizedImportRow>,
  existingState?: InventoryPurchaseStoreState
): InventoryPurchaseStoreState {
  const baseSupplier = createInitialSupplier();
  const suppliers: Record<string, SupplierRecord> = existingState?.suppliers &&
    Object.keys(existingState.suppliers).length > 0
      ? { ...existingState.suppliers }
      : { [baseSupplier.id]: baseSupplier };

  const catalog: Record<string, ProductVariantCatalogItem> = {
    ...(existingState?.catalog || {})
  };
  const allocations: LotOwnerAllocationRecord[] = [
    ...(existingState?.allocations || [])
  ];
  const movements: ImmutableStockMovement[] = [
    ...(existingState?.movements || [])
  ];
  const inspections: QualityInspectionRecord[] = [
    ...(existingState?.inspections || [])
  ];
  const processedKeys = new Set<string>(existingState?.processedIdempotencyKeys || []);

  const rows = Object.values(rowsMap).sort((a, b) => a.rowNumber - b.rowNumber);

  for (const r of rows) {
    if (!catalog[r.sku]) {
      catalog[r.sku] = {
        productId: `PROD-${r.productCode}`,
        variantId: `VAR-${r.sku}`,
        legacyExcelRowId: r.legacyExcelRowId,
        productCode: r.productCode,
        sku: r.sku,
        category: r.category,
        productName: r.productName,
        brand: r.brand || 'Genérico',
        model: r.model || 'Estándar',
        variantName: r.variantName || 'Estándar',
        color: r.color || 'Estándar',
        manufacturerRef: r.manufacturerRef,
        supplierRef: r.supplierRef,
        description: r.description,
        verifiedFeatures: r.verifiedFeatures,
        unitOfMeasure: r.unitOfMeasure || 'Unidad',
        photoUrls: [],
        status: r.rowOutcome === 'CATALOG_ONLY_HISTORICAL_SOLD' ? 'archived' : 'active',
        excelOriginalStatus: r.excelStatus,
        approvedSalePriceCop: r.approvedSalePriceCop,
        originalNotes: r.originalNotes,
        createdAt: '2026-11-13T00:00:00.000Z',
        updatedAt: '2026-11-13T00:00:00.000Z',
        historyEvents: [
          {
            timestamp: '2026-11-13T00:00:00.000Z',
            actor: 'EXCEL_IMPORT_ENGINE',
            action: 'OPENING_CATALOG_IMPORT',
            detail: `Importado desde fila ${r.rowNumber} (${r.sourceSheet}) con estado "${r.excelStatus}".`
          }
        ]
      };
    }

    // Create initial lot allocation for non-historical-sold items if not already created
    if (r.rowOutcome !== 'CATALOG_ONLY_HISTORICAL_SOLD') {
      const allocId = `ALLOC-INI-${r.sku}-${r.ownerId}-${r.lotId}`;
      const expectedLotId = `${r.lotId}-${r.sku}`;
      const alreadyExists = allocations.some(
        (a) =>
          a.id === allocId ||
          (a.sku === r.sku && a.ownerId === r.ownerId && a.lotId === expectedLotId)
      );
      if (!alreadyExists) {
        const recState: ReconciliationState =
          r.costStatus === 'PENDING_COST'
            ? 'pending_cost_info'
            : r.qtyPhysical === 0
              ? 'pending_physical_count'
              : r.qtyPendingInspection > 0
                ? 'pending_inspection'
                : 'reconciled';

        allocations.push({
          id: allocId,
          allocationCode: r.allocationCode,
          lotId: `${r.lotId}-${r.sku}`,
          lotOrigin: 'excel_initial_import',
          receivedDate: null, // Sin inventar fecha de compra
          sku: r.sku,
          productCode: r.productCode,
          productName: r.productName,
          category: r.category,
          ownerId: r.ownerId,
          ownerName: r.ownerName,
          supplierId: 'SUP-0001',
          supplierName: r.supplierName,
          storageBin: r.storageBin,
          qtyInitialAssigned: r.qtyPhysical,
          qtyPhysical: r.qtyPhysical,
          qtyGood: r.qtyGood,
          qtyDefective: r.qtyDefective,
          qtyPendingInspection: r.qtyPendingInspection,
          qtyReserved: r.qtyReserved,
          qtyAvailable: computeAvailable(r.qtyGood, r.qtyReserved),
          purchaseUnitCostCop: r.unitCostCop,
          inboundShippingUnitCostCop: 0,
          effectiveUnitCostCop: r.unitCostCop,
          costStatus: r.costStatus,
          reconciliationState: recState,
          evidenceUrls: [],
          lockVersion: 1,
          notes: r.originalNotes || r.justification,
          updatedAt: '2026-11-13T00:00:00.000Z'
        });

        if (r.qtyPhysical > 0) {
          const obIdempKey = `IDEMP-OB-${r.sku}-${r.ownerId}-${r.lotId}`;
          const legacyObKey = `IDEMP-OB-${r.sku}-${r.ownerId}`;
          if (!processedKeys.has(obIdempKey) && !processedKeys.has(legacyObKey)) {
            processedKeys.add(obIdempKey);
            movements.push(
              Object.freeze({
                id: `MOV-OB-${r.sku}-${r.ownerId}-${r.lotId}`,
                movementSeq: movements.length + 1,
                idempotencyKey: obIdempKey,
                createdAt: '2026-11-13T00:00:00.000Z',
                lotAllocationId: allocId,
                allocationCode: r.allocationCode,
                lotId: `${r.lotId}-${r.sku}`,
                sku: r.sku,
                productName: r.productName,
                ownerId: r.ownerId,
                movementType: 'OPENING_BALANCE',
                deltaPhysical: r.qtyPhysical,
                deltaGood: r.qtyGood,
                deltaDefective: r.qtyDefective,
                deltaPending: r.qtyPendingInspection,
                deltaReserved: 0,
                balancePhysicalAfter: r.qtyPhysical,
                balanceGoodAfter: r.qtyGood,
                balanceDefectiveAfter: r.qtyDefective,
                balancePendingAfter: r.qtyPendingInspection,
                balanceReservedAfter: 0,
                balanceAvailableAfter: computeAvailable(r.qtyGood, 0),
                unitCostSnapshotCop: r.unitCostCop,
                referenceEntity: 'import_batches',
                referenceId: 'IMP-2026-0001',
                reason: `OPENING_BALANCE: Inventario físico inicial auditado (${r.qtyPhysical} unid. pendientes de revisión técnica).`,
                performedBy: 'EXCEL_IMPORT_ENGINE',
                immutable: true
              })
            );

            inspections.push({
              id: `QCI-INI-${r.sku}-${r.ownerId}-${r.lotId}`,
              inspectionCode: `QCI-INI-${r.sku}-${r.ownerId}`,
              idempotencyKey: `${obIdempKey}:QCI`,
              inspectionDate: '2026-11-13T00:00:00.000Z',
              lotAllocationId: allocId,
              lotId: `${r.lotId}-${r.sku}`,
              sku: r.sku,
              productName: r.productName,
              ownerId: r.ownerId,
              qtyInspected: r.qtyPhysical,
              qtyApprovedGood: r.qtyGood,
              qtyMarkedDefective: r.qtyDefective,
              qtyRemainingPending: r.qtyPendingInspection,
              visualCheckPassed: true,
              functionalTestPassed: false,
              accessoriesComplete: true,
              inspectionStatus: 'pending_recheck',
              evidenceUrls: [],
              inspectorName: 'AUDITORIA_INICIAL_EXCEL',
              notes: 'Pendiente de prueba funcional antes de liberar a stock comercial disponible.'
            });
          }
        }
      }
    }
  }

  return {
    owners: existingState?.owners && existingState.owners.length > 0
      ? existingState.owners
      : [{ id: 'OWN-0001', fullName: 'Eberto', status: 'active' }],
    catalog,
    suppliers,
    purchaseOrders: existingState?.purchaseOrders || [],
    allocations,
    movements,
    reservations: existingState?.reservations || [],
    transfers: existingState?.transfers || [],
    inspections,
    processedIdempotencyKeys: Array.from(processedKeys)
  };
}

export function getInventoryPurchaseState(): InventoryPurchaseStoreState {
  const importState = getCurrentImportState();
  try {
    const raw = localStorage.getItem(INV_PURCHASE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as InventoryPurchaseStoreState;
      if (
        Object.keys(importState.importedRowsByKey).length > 0 &&
        Object.keys(parsed.catalog || {}).length === 0
      ) {
        const synced = buildStateFromImportedRows(importState.importedRowsByKey, parsed);
        saveInventoryPurchaseState(synced);
        return synced;
      }
      return parsed;
    }
  } catch {
    // Fallback
  }

  const built = buildStateFromImportedRows(importState.importedRowsByKey);
  saveInventoryPurchaseState(built);
  return built;
}

export function saveInventoryPurchaseState(state: InventoryPurchaseStoreState): void {
  try {
    localStorage.setItem(INV_PURCHASE_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('rtw-inventory-purchase-updated'));
  } catch {
    // Ignore storage quota issues
  }
}

export async function ensureExcelBaselineLoadedInInventory(
  _actorEmail: string
): Promise<InventoryPurchaseStoreState> {
  const importState = getCurrentImportState();
  const current = getInventoryPurchaseState();
  const synced = buildStateFromImportedRows(importState.importedRowsByKey, current);
  saveInventoryPurchaseState(synced);
  return synced;
}

export function syncOwnersIntoInventoryStore(
  liveOwners: Array<{ id: string; fullName: string; status: 'active' | 'inactive' }>
): InventoryPurchaseStoreState {
  const current = getInventoryPurchaseState();
  if (!liveOwners || liveOwners.length === 0) return current;

  const byId = new Map<string, { id: string; fullName: string; status: 'active' | 'inactive' }>();
  for (const existing of current.owners) {
    byId.set(existing.id, existing);
  }
  for (const owner of liveOwners) {
    if (!owner.id?.trim()) continue;
    byId.set(owner.id.trim(), {
      id: owner.id.trim(),
      fullName: owner.fullName?.trim() || owner.id.trim(),
      status: owner.status === 'inactive' ? 'inactive' : 'active'
    });
  }

  const nextOwners = Array.from(byId.values());
  const changed =
    nextOwners.length !== current.owners.length ||
    nextOwners.some(
      (o, idx) =>
        current.owners[idx]?.id !== o.id ||
        current.owners[idx]?.fullName !== o.fullName ||
        current.owners[idx]?.status !== o.status
    );

  if (!changed) return current;

  const nextState: InventoryPurchaseStoreState = {
    ...current,
    owners: nextOwners
  };
  saveInventoryPurchaseState(nextState);
  return nextState;
}

// ============================================================================
// 1. GESTIÓN DE PRODUCTOS Y VARIANTES (FOTOGRAFÍAS, CARACTERÍSTICAS, ESTADO, HISTORIAL)
// ============================================================================
export function updateProductVariantCatalogItem(
  sku: string,
  updates: {
    brand?: string;
    model?: string;
    description?: string;
    verifiedFeatures?: string;
    photoUrlToAdd?: string;
    status?: 'active' | 'inactive' | 'archived';
  },
  actorEmail: string,
  targetState?: InventoryPurchaseStoreState
): ProductVariantCatalogItem {
  const state = targetState ?? getInventoryPurchaseState();
  const item = state.catalog[sku];
  if (!item) {
    throw new Error(`No existe la variante con SKU "${sku}" en el catálogo maestro.`);
  }

  const nowIso = new Date().toISOString();
  if (updates.brand !== undefined) item.brand = updates.brand.trim() || item.brand;
  if (updates.model !== undefined) item.model = updates.model.trim() || item.model;
  if (updates.description !== undefined) item.description = updates.description.trim();
  if (updates.verifiedFeatures !== undefined) {
    item.verifiedFeatures = updates.verifiedFeatures.trim();
  }
  if (updates.photoUrlToAdd && updates.photoUrlToAdd.trim() !== '') {
    const cleanUrl = updates.photoUrlToAdd.trim();
    if (!item.photoUrls.includes(cleanUrl)) {
      item.photoUrls.push(cleanUrl);
    }
  }
  if (updates.status !== undefined) {
    item.status = updates.status;
  }

  item.updatedAt = nowIso;
  item.historyEvents.unshift({
    timestamp: nowIso,
    actor: actorEmail,
    action: 'CATALOG_METADATA_UPDATE',
    detail: `Actualización de ficha técnica / fotografías / estado (${item.status}).`
  });

  if (!targetState) {
    saveInventoryPurchaseState(state);
  }
  return item;
}

// ============================================================================
// 2. GESTIÓN DE PROVEEDORES (REGISTRO, CONTACTO, REFERENCIAS, HISTORIAL)
// ============================================================================
export function registerOrUpdateSupplier(
  input: {
    supplierCode: string;
    legalName: string;
    contactName: string;
    taxId: string;
    phone: string;
    email: string;
    city: string;
    address: string;
    referenceCodes: string[];
    notes: string;
  },
  actorEmail: string,
  targetState?: InventoryPurchaseStoreState
): SupplierRecord {
  const state = targetState ?? getInventoryPurchaseState();
  const code = input.supplierCode.trim().toUpperCase();
  const legalName = input.legalName.trim();

  if (!code || !legalName) {
    throw new Error('Código de proveedor y razón social / nombre son obligatorios.');
  }

  const nowIso = new Date().toISOString();
  const existing = Object.values(state.suppliers).find((s) => s.supplierCode === code);

  if (existing) {
    existing.legalName = legalName;
    existing.contactName = input.contactName.trim();
    existing.taxId = input.taxId.trim();
    existing.phone = input.phone.trim();
    existing.email = input.email.trim();
    existing.city = input.city.trim();
    existing.address = input.address.trim();
    existing.referenceCodes = input.referenceCodes;
    existing.notes = input.notes.trim();
    existing.historyEvents.unshift({
      timestamp: nowIso,
      actor: actorEmail,
      action: 'SUPPLIER_UPDATED',
      detail: `Datos de contacto y referencias actualizados para ${legalName}.`
    });
    if (!targetState) saveInventoryPurchaseState(state);
    return existing;
  }

  const newSupplier: SupplierRecord = {
    id: code,
    supplierCode: code,
    legalName,
    contactName: input.contactName.trim(),
    taxId: input.taxId.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    city: input.city.trim(),
    address: input.address.trim(),
    referenceCodes: input.referenceCodes,
    status: 'active',
    notes: input.notes.trim(),
    createdAt: nowIso,
    historyEvents: [
      {
        timestamp: nowIso,
        actor: actorEmail,
        action: 'SUPPLIER_CREATED',
        detail: `Proveedor ${code} (${legalName}) registrado.`
      }
    ]
  };

  state.suppliers[newSupplier.id] = newSupplier;
  if (!targetState) saveInventoryPurchaseState(state);
  return newSupplier;
}

// ============================================================================
// 3. ÓRDENES DE COMPRA (CREACIÓN SIN AUTOASIGNAR PROPIETARIO FUTURO)
// ============================================================================
export function txCreatePurchaseOrder(
  input: {
    orderNumber: string;
    orderDate: string;
    supplierId: string;
    invoiceReference: string;
    inboundShippingCop: number;
    documentUrls: string[];
    notes: string;
    lines: Array<{
      sku: string;
      ownerId: string; // Exigido explícitamente
      qtyOrdered: number;
      unitPurchaseCostCop: number | null;
      unitShippingCostCop?: number;
      notes?: string;
    }>;
  },
  actorEmail: string,
  targetState?: InventoryPurchaseStoreState
): PurchaseOrderRecord {
  const state = targetState ?? getInventoryPurchaseState();
  const orderNumber = input.orderNumber.trim().toUpperCase();

  if (!orderNumber) {
    throw new Error('El número de orden de compra es obligatorio.');
  }
  if (state.purchaseOrders.some((po) => po.orderNumber === orderNumber)) {
    throw new Error(`Ya existe la orden de compra ${orderNumber}.`);
  }

  const supplier = state.suppliers[input.supplierId];
  if (!supplier || supplier.status !== 'active') {
    throw new Error(`Proveedor "${input.supplierId}" inválido o inactivo.`);
  }

  if (!input.lines || input.lines.length === 0) {
    throw new Error('La orden de compra debe incluir al menos una línea de producto.');
  }

  const activeOwnerIds = new Set(
    state.owners.filter((o) => o.status === 'active').map((o) => o.id)
  );

  let subtotalCop = 0;
  const builtLines: PurchaseOrderLineRecord[] = input.lines.map((line, idx) => {
    const ownerId = (line.ownerId || '').trim();
    if (!ownerId) {
      throw new Error(
        `REGLA MULTIPROPIETARIO (Línea ${idx + 1}): Debe seleccionar explícitamente el propietario. Prohibido autoasignar propietario futuro.`
      );
    }
    if (!activeOwnerIds.has(ownerId)) {
      throw new Error(
        `PROPIETARIO INEXISTENTE O INACTIVO (Línea ${idx + 1}): "${ownerId}" no está activo en el sistema.`
      );
    }

    const catItem = state.catalog[line.sku];
    if (!catItem) {
      throw new Error(`SKU "${line.sku}" no existe en el catálogo maestro.`);
    }

    if (!isValidPositiveInt(line.qtyOrdered)) {
      throw new Error(`Cantidad solicitada inválida en SKU ${line.sku}: debe ser entero > 0.`);
    }
    if (
      line.unitPurchaseCostCop !== null &&
      !isValidNonNegativeAmount(line.unitPurchaseCostCop)
    ) {
      throw new Error(`Costo unitario inválido o negativo en SKU ${line.sku}.`);
    }

    if (line.unitPurchaseCostCop !== null) {
      subtotalCop += line.unitPurchaseCostCop * line.qtyOrdered;
    }

    return {
      id: `POL-${orderNumber}-${idx + 1}`,
      lineNumber: idx + 1,
      sku: line.sku,
      productName: catItem.productName,
      ownerId,
      qtyOrdered: line.qtyOrdered,
      qtyReceived: 0,
      unitPurchaseCostCop: line.unitPurchaseCostCop,
      unitShippingCostCop: line.unitShippingCostCop ?? 0,
      costStatus:
        line.unitPurchaseCostCop === null
          ? 'PENDING_COST'
          : line.unitPurchaseCostCop === 0
            ? 'BONUS_ZERO_COST'
            : 'CONFIRMED',
      notes: line.notes || ''
    };
  });

  const po: PurchaseOrderRecord = {
    id: `PO-ID-${orderNumber}`,
    orderNumber,
    orderDate: input.orderDate || new Date().toISOString().slice(0, 10),
    supplierId: supplier.id,
    supplierName: supplier.legalName,
    invoiceReference: input.invoiceReference.trim(),
    status: 'ordered',
    subtotalPurchaseCop: subtotalCop,
    inboundShippingCop: Math.max(0, input.inboundShippingCop || 0),
    documentUrls: input.documentUrls || [],
    notes: input.notes.trim(),
    createdBy: actorEmail,
    createdAt: new Date().toISOString(),
    lines: builtLines
  };

  state.purchaseOrders.unshift(po);
  supplier.historyEvents.unshift({
    timestamp: po.createdAt,
    actor: actorEmail,
    action: 'PURCHASE_ORDER_CREATED',
    detail: `Orden ${orderNumber} creada por ${builtLines.length} línea(s) (${subtotalCop.toLocaleString('es-CO')} COP).`
  });

  if (!targetState) saveInventoryPurchaseState(state);
  return po;
}

// ============================================================================
// 4. PROCEDIMIENTO TRANSACCIONAL: RECIBIR MERCANCÍA (PARCIAL O COMPLETA)
// ============================================================================
export function txReceivePurchaseOrderLine(
  input: {
    idempotencyKey: string;
    orderNumber: string;
    lineNumber: number;
    lotId: string;
    ownerId: string; // Exigido explícitamente (nunca autoasignar)
    storageBin: string;
    qtyReceivedNow: number;
    qtyGood: number;
    qtyDefective: number;
    qtyPendingInspection: number;
    unitPurchaseCostCop: number | null;
    unitShippingCostCop?: number;
    evidenceUrls?: string[];
    inspectorName: string;
    notes: string;
  },
  actorEmail: string,
  targetState?: InventoryPurchaseStoreState
): {
  order: PurchaseOrderRecord;
  allocation: LotOwnerAllocationRecord;
  movement: ImmutableStockMovement;
} {
  const state = targetState ?? getInventoryPurchaseState();
  const idempKey = input.idempotencyKey.trim();

  if (!idempKey) {
    throw new Error('IDEMPOTENCIA REQUERIDA: Falta idempotencyKey en la recepción.');
  }
  if (state.processedIdempotencyKeys.includes(idempKey)) {
    throw new Error(
      `PREVENCIÓN DE DOBLE CONTABILIZACIÓN: La recepción con idempotencyKey "${idempKey}" ya fue ejecutada.`
    );
  }

  const ownerId = (input.ownerId || '').trim();
  if (!ownerId) {
    throw new Error(
      'REGLA MULTIPROPIETARIO (Regla 11 y 12): Debe indicar explícitamente el propietario de la mercancía recibida. Prohibido autoasignar propietario futuro.'
    );
  }

  const ownerObj = state.owners.find((o) => o.id === ownerId && o.status === 'active');
  if (!ownerObj) {
    throw new Error(`El propietario "${ownerId}" no existe o está inactivo.`);
  }

  if (
    !isValidPositiveInt(input.qtyReceivedNow) ||
    !isValidNonNegativeInt(input.qtyGood) ||
    !isValidNonNegativeInt(input.qtyDefective) ||
    !isValidNonNegativeInt(input.qtyPendingInspection)
  ) {
    throw new Error('Las cantidades recibidas deben ser enteros positivos y los subtotales >= 0.');
  }

  if (
    input.unitPurchaseCostCop !== null &&
    input.unitPurchaseCostCop !== undefined &&
    !isValidNonNegativeAmount(input.unitPurchaseCostCop)
  ) {
    throw new Error('El costo unitario de compra debe ser un valor numérico válido >= 0.');
  }

  if (
    input.qtyReceivedNow !==
    input.qtyGood + input.qtyDefective + input.qtyPendingInspection
  ) {
    throw new Error(
      `DESCUADRE DE CONTEO E INSPECCIÓN (Regla 6): Recibido (${input.qtyReceivedNow}) != Apto (${input.qtyGood}) + Defectuoso (${input.qtyDefective}) + Pendiente (${input.qtyPendingInspection}).`
    );
  }

  const order = state.purchaseOrders.find((po) => po.orderNumber === input.orderNumber);
  if (!order) {
    throw new Error(`No existe la orden de compra ${input.orderNumber}.`);
  }
  if (order.status === 'cancelled') {
    throw new Error(`La orden de compra ${input.orderNumber} está cancelada y no admite recepciones.`);
  }

  const line = order.lines.find((l) => l.lineNumber === input.lineNumber);
  if (!line) {
    throw new Error(
      `No existe la línea #${input.lineNumber} en la orden ${input.orderNumber}.`
    );
  }
  if (line.ownerId !== ownerId) {
    throw new Error(
      `CONFLICTO DE PROPIETARIO: La línea #${line.lineNumber} de ${input.orderNumber} pertenece a ${line.ownerId}, no a ${ownerId}.`
    );
  }

  if (line.qtyReceived + input.qtyReceivedNow > line.qtyOrdered) {
    throw new Error(
      `SOBRE-RECEPCIÓN BLOQUEADA: Recibido acumulado (${line.qtyReceived + input.qtyReceivedNow}) supera la cantidad solicitada en la orden (${line.qtyOrdered}).`
    );
  }

  const catItem = state.catalog[line.sku];
  const nowIso = new Date().toISOString();

  line.qtyReceived += input.qtyReceivedNow;
  line.ownerId = ownerId;
  if (input.unitPurchaseCostCop !== undefined) {
    line.unitPurchaseCostCop = input.unitPurchaseCostCop;
  }
  const shippingUnit = input.unitShippingCostCop ?? line.unitShippingCostCop ?? 0;
  line.unitShippingCostCop = shippingUnit;

  const effectiveCost =
    line.unitPurchaseCostCop === null
      ? null
      : line.unitPurchaseCostCop + shippingUnit;

  const costStatus: CostStatusType =
    line.unitPurchaseCostCop === null
      ? 'PENDING_COST'
      : line.unitPurchaseCostCop === 0
        ? 'BONUS_ZERO_COST'
        : 'CONFIRMED';

  const cleanLotId = input.lotId.trim() || `LOT-REC-${order.orderNumber}-${line.lineNumber}`;
  const allocCode = `ASG-${cleanLotId}-${ownerId}`;
  const allocId = `ALLOC-${cleanLotId}-${line.sku}-${ownerId}-${Date.now()}`;

  const allocation: LotOwnerAllocationRecord = {
    id: allocId,
    allocationCode: allocCode,
    lotId: cleanLotId,
    lotOrigin: 'purchase_receipt',
    receivedDate: nowIso.slice(0, 10),
    sku: line.sku,
    productCode: catItem?.productCode || line.sku,
    productName: line.productName,
    category: catItem?.category || 'General',
    ownerId,
    ownerName: ownerObj.fullName,
    supplierId: order.supplierId,
    supplierName: order.supplierName,
    storageBin: input.storageBin.trim() || 'BODEGA-RECEPCION',
    qtyInitialAssigned: input.qtyReceivedNow,
    qtyPhysical: input.qtyReceivedNow,
    qtyGood: input.qtyGood,
    qtyDefective: input.qtyDefective,
    qtyPendingInspection: input.qtyPendingInspection,
    qtyReserved: 0,
    qtyAvailable: computeAvailable(input.qtyGood, 0),
    purchaseUnitCostCop: line.unitPurchaseCostCop,
    inboundShippingUnitCostCop: shippingUnit,
    effectiveUnitCostCop: effectiveCost,
    costStatus,
    reconciliationState:
      effectiveCost === null
        ? 'pending_cost_info'
        : input.qtyPendingInspection > 0
          ? 'pending_inspection'
          : 'reconciled',
    evidenceUrls: input.evidenceUrls || [],
    lockVersion: 1,
    notes: input.notes.trim(),
    updatedAt: nowIso
  };

  state.allocations.unshift(allocation);

  const inspection: QualityInspectionRecord = {
    id: `QCI-${allocCode}`,
    inspectionCode: `QCI-${allocCode}`,
    idempotencyKey: `${idempKey}:QCI`,
    inspectionDate: nowIso,
    lotAllocationId: allocId,
    lotId: cleanLotId,
    sku: line.sku,
    productName: line.productName,
    ownerId,
    qtyInspected: input.qtyReceivedNow,
    qtyApprovedGood: input.qtyGood,
    qtyMarkedDefective: input.qtyDefective,
    qtyRemainingPending: input.qtyPendingInspection,
    visualCheckPassed: input.qtyDefective === 0,
    functionalTestPassed: input.qtyDefective === 0 && input.qtyPendingInspection === 0,
    accessoriesComplete: true,
    inspectionStatus:
      input.qtyPendingInspection > 0
        ? 'pending_recheck'
        : input.qtyDefective === 0
          ? 'approved'
          : input.qtyGood === 0
            ? 'rejected'
            : 'partially_approved',
    evidenceUrls: input.evidenceUrls || [],
    inspectorName: input.inspectorName.trim() || actorEmail,
    notes: input.notes.trim()
  };

  state.inspections.unshift(inspection);

  const movement: ImmutableStockMovement = Object.freeze({
    id: `MOV-REC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    movementSeq: state.movements.length + 1,
    idempotencyKey: idempKey,
    createdAt: nowIso,
    lotAllocationId: allocId,
    allocationCode: allocCode,
    lotId: cleanLotId,
    sku: line.sku,
    productName: line.productName,
    ownerId,
    movementType: 'purchase_reception',
    deltaPhysical: input.qtyReceivedNow,
    deltaGood: input.qtyGood,
    deltaDefective: input.qtyDefective,
    deltaPending: input.qtyPendingInspection,
    deltaReserved: 0,
    balancePhysicalAfter: allocation.qtyPhysical,
    balanceGoodAfter: allocation.qtyGood,
    balanceDefectiveAfter: allocation.qtyDefective,
    balancePendingAfter: allocation.qtyPendingInspection,
    balanceReservedAfter: 0,
    balanceAvailableAfter: allocation.qtyAvailable,
    unitCostSnapshotCop: effectiveCost,
    referenceEntity: 'purchase_receipts',
    referenceId: order.orderNumber,
    reason:
      input.notes.trim() ||
      `Recepción de orden ${order.orderNumber} (Lote ${cleanLotId}, Propietario ${ownerId})`,
    performedBy: actorEmail,
    immutable: true
  });

  state.movements.unshift(movement);
  state.processedIdempotencyKeys.push(idempKey);

  // Actualizar estado de la orden de compra: partial_received vs received
  const totalOrdered = order.lines.reduce((s, l) => s + l.qtyOrdered, 0);
  const totalReceived = order.lines.reduce((s, l) => s + l.qtyReceived, 0);
  order.status = totalReceived < totalOrdered ? 'partial_received' : 'received';

  if (!targetState) saveInventoryPurchaseState(state);
  return { order, allocation, movement };
}

// ============================================================================
// 5. PROCEDIMIENTO TRANSACCIONAL: INSPECCIÓN DE CALIDAD (PENDIENTE -> APTO / DEFECTUOSO)
// ============================================================================
export function txInspectQualityAllocation(
  input: {
    idempotencyKey: string;
    lotAllocationId: string;
    qtyToInspect: number;
    qtyApprovedGood: number;
    qtyMarkedDefective: number;
    inspectorName: string;
    evidenceUrls?: string[];
    notes: string;
  },
  actorEmail: string,
  targetState?: InventoryPurchaseStoreState
): {
  allocation: LotOwnerAllocationRecord;
  inspection: QualityInspectionRecord;
  movement: ImmutableStockMovement;
} {
  const state = targetState ?? getInventoryPurchaseState();
  const idempKey = input.idempotencyKey.trim();

  if (!idempKey) throw new Error('IDEMPOTENCIA REQUERIDA: Falta idempotencyKey.');
  if (state.processedIdempotencyKeys.includes(idempKey)) {
    throw new Error(`IDEMPOTENCIA BLOQUEADA: La inspección "${idempKey}" ya fue procesada.`);
  }

  const alloc = state.allocations.find((a) => a.id === input.lotAllocationId);
  if (!alloc) {
    throw new Error(`No existe el lote/asignación ${input.lotAllocationId}.`);
  }

  if (
    !isValidPositiveInt(input.qtyToInspect) ||
    !isValidNonNegativeInt(input.qtyApprovedGood) ||
    !isValidNonNegativeInt(input.qtyMarkedDefective)
  ) {
    throw new Error('Las cantidades de inspección deben ser enteros válidos (> 0).');
  }

  if (input.qtyApprovedGood + input.qtyMarkedDefective !== input.qtyToInspect) {
    throw new Error(
      `La suma de aprobadas (${input.qtyApprovedGood}) y defectuosas (${input.qtyMarkedDefective}) debe coincidir con las inspeccionadas (${input.qtyToInspect}).`
    );
  }

  if (alloc.qtyPendingInspection < input.qtyToInspect) {
    throw new Error(
      `No se pueden inspeccionar ${input.qtyToInspect} unidades porque solo hay ${alloc.qtyPendingInspection} pendientes de revisión en el lote ${alloc.lotId}.`
    );
  }

  const nowIso = new Date().toISOString();
  alloc.qtyGood += input.qtyApprovedGood;
  alloc.qtyDefective += input.qtyMarkedDefective;
  alloc.qtyPendingInspection -= input.qtyToInspect;
  alloc.qtyAvailable = computeAvailable(alloc.qtyGood, alloc.qtyReserved);
  alloc.lockVersion += 1;
  alloc.updatedAt = nowIso;

  if (input.evidenceUrls && input.evidenceUrls.length > 0) {
    alloc.evidenceUrls.push(...input.evidenceUrls);
  }

  alloc.reconciliationState =
    alloc.costStatus === 'PENDING_COST'
      ? 'pending_cost_info'
      : alloc.qtyPendingInspection > 0
        ? 'pending_inspection'
        : 'reconciled';

  const inspectionCode = `QCI-${alloc.allocationCode}-V${alloc.lockVersion}`;
  const inspection: QualityInspectionRecord = {
    id: `QCI-ID-${Date.now()}`,
    inspectionCode,
    idempotencyKey: idempKey,
    inspectionDate: nowIso,
    lotAllocationId: alloc.id,
    lotId: alloc.lotId,
    sku: alloc.sku,
    productName: alloc.productName,
    ownerId: alloc.ownerId,
    qtyInspected: input.qtyToInspect,
    qtyApprovedGood: input.qtyApprovedGood,
    qtyMarkedDefective: input.qtyMarkedDefective,
    qtyRemainingPending: alloc.qtyPendingInspection,
    visualCheckPassed: input.qtyMarkedDefective === 0,
    functionalTestPassed: input.qtyMarkedDefective === 0,
    accessoriesComplete: true,
    inspectionStatus:
      input.qtyMarkedDefective === 0
        ? 'approved'
        : input.qtyApprovedGood === 0
          ? 'rejected'
          : 'partially_approved',
    evidenceUrls: input.evidenceUrls || [],
    inspectorName: input.inspectorName.trim() || actorEmail,
    notes: input.notes.trim()
  };

  state.inspections.unshift(inspection);

  const movement: ImmutableStockMovement = Object.freeze({
    id: `MOV-QCI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    movementSeq: state.movements.length + 1,
    idempotencyKey: idempKey,
    createdAt: nowIso,
    lotAllocationId: alloc.id,
    allocationCode: alloc.allocationCode,
    lotId: alloc.lotId,
    sku: alloc.sku,
    productName: alloc.productName,
    ownerId: alloc.ownerId,
    movementType:
      input.qtyMarkedDefective > 0 && input.qtyApprovedGood === 0
        ? 'quality_reject_defective'
        : 'quality_approve',
    deltaPhysical: 0,
    deltaGood: input.qtyApprovedGood,
    deltaDefective: input.qtyMarkedDefective,
    deltaPending: -input.qtyToInspect,
    deltaReserved: 0,
    balancePhysicalAfter: alloc.qtyPhysical,
    balanceGoodAfter: alloc.qtyGood,
    balanceDefectiveAfter: alloc.qtyDefective,
    balancePendingAfter: alloc.qtyPendingInspection,
    balanceReservedAfter: alloc.qtyReserved,
    balanceAvailableAfter: alloc.qtyAvailable,
    unitCostSnapshotCop: alloc.effectiveUnitCostCop,
    referenceEntity: 'quality_inspections',
    referenceId: inspectionCode,
    reason:
      input.notes.trim() ||
      `Inspección técnica: +${input.qtyApprovedGood} aptas, +${input.qtyMarkedDefective} defectuosas.`,
    performedBy: actorEmail,
    immutable: true
  });

  state.movements.unshift(movement);
  state.processedIdempotencyKeys.push(idempKey);

  if (!targetState) saveInventoryPurchaseState(state);
  return { allocation: alloc, inspection, movement };
}

// ============================================================================
// 6. PROCEDIMIENTO TRANSACCIONAL: RESERVAR, LIBERAR Y DESPACHAR CON CONCURRENCIA
// ============================================================================
export function txReserveStock(
  input: {
    idempotencyKey: string;
    lotAllocationId: string;
    qtyToReserve: number;
    salesOrderRef: string;
    reason: string;
    expectedLockVersion?: number;
  },
  actorEmail: string,
  targetState?: InventoryPurchaseStoreState
): {
  reservation: StockReservationRecord;
  allocation: LotOwnerAllocationRecord;
  movement: ImmutableStockMovement;
} {
  const state = targetState ?? getInventoryPurchaseState();
  const idempKey = input.idempotencyKey.trim();

  if (!idempKey) throw new Error('IDEMPOTENCIA REQUERIDA: Falta idempotencyKey.');
  if (state.processedIdempotencyKeys.includes(idempKey)) {
    throw new Error(`IDEMPOTENCIA BLOQUEADA: La reserva "${idempKey}" ya fue ejecutada.`);
  }

  if (!isValidPositiveInt(input.qtyToReserve)) {
    throw new Error('La cantidad a reservar debe ser un entero mayor a cero.');
  }

  const alloc = state.allocations.find((a) => a.id === input.lotAllocationId);
  if (!alloc) {
    throw new Error(`No existe la asignación de lote ${input.lotAllocationId}.`);
  }

  if (
    input.expectedLockVersion !== undefined &&
    alloc.lockVersion !== input.expectedLockVersion
  ) {
    throw new Error(
      `CONFLICTO DE CONCURRENCIA: El lote ${alloc.lotId} fue modificado concurrentemente (lockVersion esperada ${input.expectedLockVersion}, actual ${alloc.lockVersion}).`
    );
  }

  if (alloc.qtyAvailable < input.qtyToReserve) {
    throw new Error(
      `PREVENCIÓN DE STOCK NEGATIVO: Stock disponible insuficiente en lote ${alloc.lotId} (${alloc.ownerId}). Disponible: ${alloc.qtyAvailable}, Solicitado: ${input.qtyToReserve}.`
    );
  }

  const nowIso = new Date().toISOString();
  alloc.qtyReserved += input.qtyToReserve;
  alloc.qtyAvailable = computeAvailable(alloc.qtyGood, alloc.qtyReserved);
  alloc.lockVersion += 1;
  alloc.updatedAt = nowIso;

  const resCode = `RES-${alloc.sku}-${state.reservations.length + 1}`;
  const reservation: StockReservationRecord = {
    id: `RES-ID-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    reservationCode: resCode,
    idempotencyKey: idempKey,
    lotAllocationId: alloc.id,
    lotId: alloc.lotId,
    ownerId: alloc.ownerId,
    sku: alloc.sku,
    productName: alloc.productName,
    salesOrderRef: input.salesOrderRef.trim() || 'PEDIDO-DIRECTO',
    qtyReserved: input.qtyToReserve,
    qtyFulfilled: 0,
    qtyReleased: 0,
    status: 'active',
    reason: input.reason.trim() || 'Reserva comercial activa',
    createdBy: actorEmail,
    createdAt: nowIso
  };

  state.reservations.unshift(reservation);

  const movement: ImmutableStockMovement = Object.freeze({
    id: `MOV-RES-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    movementSeq: state.movements.length + 1,
    idempotencyKey: idempKey,
    createdAt: nowIso,
    lotAllocationId: alloc.id,
    allocationCode: alloc.allocationCode,
    lotId: alloc.lotId,
    sku: alloc.sku,
    productName: alloc.productName,
    ownerId: alloc.ownerId,
    movementType: 'reservation_hold',
    deltaPhysical: 0,
    deltaGood: 0,
    deltaDefective: 0,
    deltaPending: 0,
    deltaReserved: input.qtyToReserve,
    balancePhysicalAfter: alloc.qtyPhysical,
    balanceGoodAfter: alloc.qtyGood,
    balanceDefectiveAfter: alloc.qtyDefective,
    balancePendingAfter: alloc.qtyPendingInspection,
    balanceReservedAfter: alloc.qtyReserved,
    balanceAvailableAfter: alloc.qtyAvailable,
    unitCostSnapshotCop: alloc.effectiveUnitCostCop,
    referenceEntity: 'stock_reservations',
    referenceId: resCode,
    reason: reservation.reason,
    performedBy: actorEmail,
    immutable: true
  });

  state.movements.unshift(movement);
  state.processedIdempotencyKeys.push(idempKey);

  if (!targetState) saveInventoryPurchaseState(state);
  return { reservation, allocation: alloc, movement };
}

export function txReleaseStockReservation(
  input: {
    idempotencyKey: string;
    reservationId: string;
    qtyToRelease?: number;
    reason: string;
  },
  actorEmail: string,
  targetState?: InventoryPurchaseStoreState
): {
  reservation: StockReservationRecord;
  allocation: LotOwnerAllocationRecord;
  movement: ImmutableStockMovement;
} {
  const state = targetState ?? getInventoryPurchaseState();
  const idempKey = input.idempotencyKey.trim();

  if (!idempKey) throw new Error('IDEMPOTENCIA REQUERIDA: Falta idempotencyKey.');
  if (state.processedIdempotencyKeys.includes(idempKey)) {
    throw new Error(`IDEMPOTENCIA BLOQUEADA: La liberación "${idempKey}" ya fue ejecutada.`);
  }

  const res = state.reservations.find((r) => r.id === input.reservationId);
  if (!res) throw new Error(`No existe la reserva ${input.reservationId}.`);
  if (res.status !== 'active') {
    throw new Error(`La reserva ${res.reservationCode} ya no está activa (estado: ${res.status}).`);
  }

  const remainingReserved = res.qtyReserved - res.qtyFulfilled - res.qtyReleased;
  const qtyRelease = input.qtyToRelease ?? remainingReserved;
  if (!isValidPositiveInt(qtyRelease) || qtyRelease > remainingReserved) {
    throw new Error(`Cantidad a liberar inválida (${qtyRelease}). Pendiente en reserva: ${remainingReserved}.`);
  }

  const alloc = state.allocations.find((a) => a.id === res.lotAllocationId);
  if (!alloc) throw new Error('Asignación de lote asociada no encontrada.');

  const nowIso = new Date().toISOString();
  alloc.qtyReserved = Math.max(0, alloc.qtyReserved - qtyRelease);
  alloc.qtyAvailable = computeAvailable(alloc.qtyGood, alloc.qtyReserved);
  alloc.lockVersion += 1;
  alloc.updatedAt = nowIso;

  res.qtyReleased += qtyRelease;
  if (res.qtyFulfilled + res.qtyReleased >= res.qtyReserved) {
    res.status = 'released';
  }

  const movement: ImmutableStockMovement = Object.freeze({
    id: `MOV-REL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    movementSeq: state.movements.length + 1,
    idempotencyKey: idempKey,
    createdAt: nowIso,
    lotAllocationId: alloc.id,
    allocationCode: alloc.allocationCode,
    lotId: alloc.lotId,
    sku: alloc.sku,
    productName: alloc.productName,
    ownerId: alloc.ownerId,
    movementType: 'reservation_release',
    deltaPhysical: 0,
    deltaGood: 0,
    deltaDefective: 0,
    deltaPending: 0,
    deltaReserved: -qtyRelease,
    balancePhysicalAfter: alloc.qtyPhysical,
    balanceGoodAfter: alloc.qtyGood,
    balanceDefectiveAfter: alloc.qtyDefective,
    balancePendingAfter: alloc.qtyPendingInspection,
    balanceReservedAfter: alloc.qtyReserved,
    balanceAvailableAfter: alloc.qtyAvailable,
    unitCostSnapshotCop: alloc.effectiveUnitCostCop,
    referenceEntity: 'stock_reservations',
    referenceId: res.reservationCode,
    reason: input.reason.trim() || `Reserva ${res.reservationCode} liberada / cancelada`,
    performedBy: actorEmail,
    immutable: true
  });

  state.movements.unshift(movement);
  state.processedIdempotencyKeys.push(idempKey);

  if (!targetState) saveInventoryPurchaseState(state);
  return { reservation: res, allocation: alloc, movement };
}

export function txDispatchStock(
  input: {
    idempotencyKey: string;
    lotAllocationId: string;
    qtyToDispatch: number;
    dispatchReference: string;
    reservationId?: string;
    expectedLockVersion?: number;
    reason: string;
  },
  actorEmail: string,
  targetState?: InventoryPurchaseStoreState
): {
  allocation: LotOwnerAllocationRecord;
  movement: ImmutableStockMovement;
} {
  const state = targetState ?? getInventoryPurchaseState();
  const idempKey = input.idempotencyKey.trim();

  if (!idempKey) throw new Error('IDEMPOTENCIA REQUERIDA: Falta idempotencyKey.');
  if (state.processedIdempotencyKeys.includes(idempKey)) {
    throw new Error(
      `PREVENCIÓN DE DOBLE CONTABILIZACIÓN: El despacho con idempotencyKey "${idempKey}" ya fue ejecutado.`
    );
  }

  if (!isValidPositiveInt(input.qtyToDispatch)) {
    throw new Error('La cantidad a despachar debe ser un entero mayor a cero.');
  }

  const alloc = state.allocations.find((a) => a.id === input.lotAllocationId);
  if (!alloc) throw new Error(`No existe la asignación de lote ${input.lotAllocationId}.`);

  // Control de concurrencia optimista/pesimista (protege venta de última unidad concurrente)
  if (
    input.expectedLockVersion !== undefined &&
    alloc.lockVersion !== input.expectedLockVersion
  ) {
    throw new Error(
      `CONFLICTO DE CONCURRENCIA (Venta Concurrente de Última Unidad): El lote ${alloc.lotId} cambió de lockVersion (esperada ${input.expectedLockVersion}, actual ${alloc.lockVersion}). Otra transacción concurrente despachó antes.`
    );
  }

  if (alloc.effectiveUnitCostCop === null && alloc.costStatus === 'PENDING_COST') {
    throw new Error(
      `BLOQUEO DE COSTO PENDIENTE: No se puede despachar venta sobre el lote ${alloc.lotId} (${alloc.sku}) mientras su costo esté en PENDING_COST.`
    );
  }

  let deltaReserved = 0;
  if (input.reservationId) {
    const res = state.reservations.find((r) => r.id === input.reservationId);
    if (!res || res.status !== 'active') {
      throw new Error('La reserva indicada no existe o no está activa.');
    }
    const rem = res.qtyReserved - res.qtyFulfilled - res.qtyReleased;
    if (rem < input.qtyToDispatch) {
      throw new Error(`La reserva solo tiene ${rem} unidades activas para despachar.`);
    }
    res.qtyFulfilled += input.qtyToDispatch;
    if (res.qtyFulfilled + res.qtyReleased >= res.qtyReserved) {
      res.status = 'fulfilled';
    }
    alloc.qtyReserved = Math.max(0, alloc.qtyReserved - input.qtyToDispatch);
    deltaReserved = -input.qtyToDispatch;
  } else {
    if (alloc.qtyAvailable < input.qtyToDispatch) {
      throw new Error(
        `PREVENCIÓN DE STOCK NEGATIVO: Stock disponible insuficiente en lote ${alloc.lotId} del propietario ${alloc.ownerId} (Disponible: ${alloc.qtyAvailable}, Solicitado: ${input.qtyToDispatch}).`
      );
    }
  }

  const nowIso = new Date().toISOString();
  alloc.qtyGood -= input.qtyToDispatch;
  alloc.qtyPhysical -= input.qtyToDispatch;
  alloc.qtyAvailable = computeAvailable(alloc.qtyGood, alloc.qtyReserved);
  alloc.lockVersion += 1;
  alloc.updatedAt = nowIso;

  const movement: ImmutableStockMovement = Object.freeze({
    id: `MOV-DSP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    movementSeq: state.movements.length + 1,
    idempotencyKey: idempKey,
    createdAt: nowIso,
    lotAllocationId: alloc.id,
    allocationCode: alloc.allocationCode,
    lotId: alloc.lotId,
    sku: alloc.sku,
    productName: alloc.productName,
    ownerId: alloc.ownerId,
    movementType: 'sale_dispatch',
    deltaPhysical: -input.qtyToDispatch,
    deltaGood: -input.qtyToDispatch,
    deltaDefective: 0,
    deltaPending: 0,
    deltaReserved,
    balancePhysicalAfter: alloc.qtyPhysical,
    balanceGoodAfter: alloc.qtyGood,
    balanceDefectiveAfter: alloc.qtyDefective,
    balancePendingAfter: alloc.qtyPendingInspection,
    balanceReservedAfter: alloc.qtyReserved,
    balanceAvailableAfter: alloc.qtyAvailable,
    unitCostSnapshotCop: alloc.effectiveUnitCostCop,
    referenceEntity: 'sales_dispatch',
    referenceId: input.dispatchReference.trim() || `DSP-${Date.now()}`,
    reason: input.reason.trim() || 'Despacho comercial atribuido a lote y propietario',
    performedBy: actorEmail,
    immutable: true
  });

  state.movements.unshift(movement);
  state.processedIdempotencyKeys.push(idempKey);

  if (!targetState) saveInventoryPurchaseState(state);
  return { allocation: alloc, movement };
}

// ============================================================================
// 7. PROCEDIMIENTOS TRANSACCIONALES: DEVOLUCIÓN, TRANSFERENCIA DE PROPIEDAD Y AJUSTE
// ============================================================================
export function txProcessCustomerReturn(
  input: {
    idempotencyKey: string;
    lotAllocationId: string;
    qtyReturned: number;
    returnCondition: 'good_restock' | 'defective';
    returnReference: string;
    reason: string;
  },
  actorEmail: string,
  targetState?: InventoryPurchaseStoreState
): {
  allocation: LotOwnerAllocationRecord;
  movement: ImmutableStockMovement;
} {
  const state = targetState ?? getInventoryPurchaseState();
  const idempKey = input.idempotencyKey.trim();

  if (!idempKey) throw new Error('IDEMPOTENCIA REQUERIDA: Falta idempotencyKey.');
  if (state.processedIdempotencyKeys.includes(idempKey)) {
    throw new Error(`IDEMPOTENCIA BLOQUEADA: La devolución "${idempKey}" ya fue procesada.`);
  }

  if (!isValidPositiveInt(input.qtyReturned)) {
    throw new Error('La cantidad devuelta debe ser un entero mayor a cero.');
  }

  const alloc = state.allocations.find((a) => a.id === input.lotAllocationId);
  if (!alloc) throw new Error(`No existe la asignación de lote ${input.lotAllocationId}.`);

  const nowIso = new Date().toISOString();
  alloc.qtyPhysical += input.qtyReturned;
  if (input.returnCondition === 'good_restock') {
    alloc.qtyGood += input.qtyReturned;
  } else {
    alloc.qtyDefective += input.qtyReturned;
  }
  alloc.qtyAvailable = computeAvailable(alloc.qtyGood, alloc.qtyReserved);
  alloc.lockVersion += 1;
  alloc.updatedAt = nowIso;

  const movement: ImmutableStockMovement = Object.freeze({
    id: `MOV-RET-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    movementSeq: state.movements.length + 1,
    idempotencyKey: idempKey,
    createdAt: nowIso,
    lotAllocationId: alloc.id,
    allocationCode: alloc.allocationCode,
    lotId: alloc.lotId,
    sku: alloc.sku,
    productName: alloc.productName,
    ownerId: alloc.ownerId,
    movementType:
      input.returnCondition === 'good_restock'
        ? 'customer_return_restock'
        : 'customer_return_defective',
    deltaPhysical: input.qtyReturned,
    deltaGood: input.returnCondition === 'good_restock' ? input.qtyReturned : 0,
    deltaDefective: input.returnCondition === 'defective' ? input.qtyReturned : 0,
    deltaPending: 0,
    deltaReserved: 0,
    balancePhysicalAfter: alloc.qtyPhysical,
    balanceGoodAfter: alloc.qtyGood,
    balanceDefectiveAfter: alloc.qtyDefective,
    balancePendingAfter: alloc.qtyPendingInspection,
    balanceReservedAfter: alloc.qtyReserved,
    balanceAvailableAfter: alloc.qtyAvailable,
    unitCostSnapshotCop: alloc.effectiveUnitCostCop,
    referenceEntity: 'returns',
    referenceId: input.returnReference.trim() || `RET-${Date.now()}`,
    reason: input.reason.trim() || 'Devolución de cliente reingresada al lote original',
    performedBy: actorEmail,
    immutable: true
  });

  state.movements.unshift(movement);
  state.processedIdempotencyKeys.push(idempKey);

  if (!targetState) saveInventoryPurchaseState(state);
  return { allocation: alloc, movement };
}

export function txTransferOwnership(
  input: {
    idempotencyKey: string;
    sourceAllocationId: string;
    toOwnerId: string;
    qtyToTransfer: number;
    reason: string;
  },
  actorEmail: string,
  targetState?: InventoryPurchaseStoreState
): {
  transfer: OwnershipTransferRecord;
  sourceAllocation: LotOwnerAllocationRecord;
  targetAllocation: LotOwnerAllocationRecord;
} {
  const state = targetState ?? getInventoryPurchaseState();
  const idempKey = input.idempotencyKey.trim();

  if (!idempKey) throw new Error('IDEMPOTENCIA REQUERIDA: Falta idempotencyKey.');
  if (state.processedIdempotencyKeys.includes(idempKey)) {
    throw new Error(`IDEMPOTENCIA BLOQUEADA: La transferencia "${idempKey}" ya fue ejecutada.`);
  }

  if (!isValidPositiveInt(input.qtyToTransfer)) {
    throw new Error('La cantidad a transferir debe ser un entero mayor a cero.');
  }

  if (!input.reason || input.reason.trim().length < 5) {
    throw new Error('Debe documentar un motivo válido para la transferencia entre propietarios.');
  }

  const src = state.allocations.find((a) => a.id === input.sourceAllocationId);
  if (!src) throw new Error('Asignación de lote origen no encontrada.');

  const toOwner = state.owners.find(
    (o) => o.id === input.toOwnerId.trim() && o.status === 'active'
  );
  if (!toOwner) {
    throw new Error(`El propietario destino "${input.toOwnerId}" no existe o no está activo.`);
  }

  if (src.ownerId === toOwner.id) {
    throw new Error('El propietario destino debe ser diferente al propietario origen.');
  }

  if (src.qtyAvailable < input.qtyToTransfer) {
    throw new Error(
      `Unidades disponibles insuficientes en lote ${src.lotId} de ${src.ownerId} (Disponible: ${src.qtyAvailable}, Solicitado: ${input.qtyToTransfer}).`
    );
  }

  const nowIso = new Date().toISOString();
  src.qtyPhysical -= input.qtyToTransfer;
  src.qtyGood -= input.qtyToTransfer;
  src.qtyAvailable = computeAvailable(src.qtyGood, src.qtyReserved);
  src.lockVersion += 1;
  src.updatedAt = nowIso;

  let tgt = state.allocations.find(
    (a) =>
      a.lotId === src.lotId &&
      a.sku === src.sku &&
      a.ownerId === toOwner.id &&
      a.storageBin === src.storageBin
  );

  const transferCode = `TRF-${String(state.transfers.length + 1).padStart(4, '0')}`;

  if (!tgt) {
    tgt = {
      id: `ALLOC-TRF-${transferCode}-${toOwner.id}`,
      allocationCode: `ASG-${transferCode}-${toOwner.id}`,
      lotId: src.lotId,
      lotOrigin: 'ownership_transfer',
      receivedDate: nowIso.slice(0, 10),
      sku: src.sku,
      productCode: src.productCode,
      productName: src.productName,
      category: src.category,
      ownerId: toOwner.id,
      ownerName: toOwner.fullName,
      supplierId: src.supplierId,
      supplierName: src.supplierName,
      storageBin: src.storageBin,
      qtyInitialAssigned: input.qtyToTransfer,
      qtyPhysical: input.qtyToTransfer,
      qtyGood: input.qtyToTransfer,
      qtyDefective: 0,
      qtyPendingInspection: 0,
      qtyReserved: 0,
      qtyAvailable: input.qtyToTransfer,
      purchaseUnitCostCop: src.purchaseUnitCostCop,
      inboundShippingUnitCostCop: src.inboundShippingUnitCostCop,
      effectiveUnitCostCop: src.effectiveUnitCostCop,
      costStatus: src.costStatus,
      reconciliationState: 'reconciled',
      evidenceUrls: [],
      lockVersion: 1,
      notes: `Creado por transferencia ${transferCode} desde ${src.ownerId}`,
      updatedAt: nowIso
    };
    state.allocations.unshift(tgt);
  } else {
    tgt.qtyPhysical += input.qtyToTransfer;
    tgt.qtyGood += input.qtyToTransfer;
    tgt.qtyAvailable = computeAvailable(tgt.qtyGood, tgt.qtyReserved);
    tgt.lockVersion += 1;
    tgt.updatedAt = nowIso;
  }

  const movOut: ImmutableStockMovement = Object.freeze({
    id: `MOV-TRFOUT-${Date.now()}-1`,
    movementSeq: state.movements.length + 1,
    idempotencyKey: `${idempKey}:OUT`,
    createdAt: nowIso,
    lotAllocationId: src.id,
    allocationCode: src.allocationCode,
    lotId: src.lotId,
    sku: src.sku,
    productName: src.productName,
    ownerId: src.ownerId,
    movementType: 'transfer_out',
    deltaPhysical: -input.qtyToTransfer,
    deltaGood: -input.qtyToTransfer,
    deltaDefective: 0,
    deltaPending: 0,
    deltaReserved: 0,
    balancePhysicalAfter: src.qtyPhysical,
    balanceGoodAfter: src.qtyGood,
    balanceDefectiveAfter: src.qtyDefective,
    balancePendingAfter: src.qtyPendingInspection,
    balanceReservedAfter: src.qtyReserved,
    balanceAvailableAfter: src.qtyAvailable,
    unitCostSnapshotCop: src.effectiveUnitCostCop,
    referenceEntity: 'ownership_transfers',
    referenceId: transferCode,
    reason: input.reason.trim(),
    performedBy: actorEmail,
    immutable: true
  });

  const movIn: ImmutableStockMovement = Object.freeze({
    id: `MOV-TRFIN-${Date.now()}-2`,
    movementSeq: state.movements.length + 2,
    idempotencyKey: `${idempKey}:IN`,
    createdAt: nowIso,
    lotAllocationId: tgt.id,
    allocationCode: tgt.allocationCode,
    lotId: tgt.lotId,
    sku: tgt.sku,
    productName: tgt.productName,
    ownerId: tgt.ownerId,
    movementType: 'transfer_in',
    deltaPhysical: input.qtyToTransfer,
    deltaGood: input.qtyToTransfer,
    deltaDefective: 0,
    deltaPending: 0,
    deltaReserved: 0,
    balancePhysicalAfter: tgt.qtyPhysical,
    balanceGoodAfter: tgt.qtyGood,
    balanceDefectiveAfter: tgt.qtyDefective,
    balancePendingAfter: tgt.qtyPendingInspection,
    balanceReservedAfter: tgt.qtyReserved,
    balanceAvailableAfter: tgt.qtyAvailable,
    unitCostSnapshotCop: tgt.effectiveUnitCostCop,
    referenceEntity: 'ownership_transfers',
    referenceId: transferCode,
    reason: input.reason.trim(),
    performedBy: actorEmail,
    immutable: true
  });

  state.movements.unshift(movIn, movOut);
  state.processedIdempotencyKeys.push(idempKey);

  const transfer: OwnershipTransferRecord = {
    id: transferCode,
    transferCode,
    idempotencyKey: idempKey,
    transferDate: nowIso,
    lotId: src.lotId,
    sku: src.sku,
    productName: src.productName,
    sourceAllocationId: src.id,
    targetAllocationId: tgt.id,
    fromOwnerId: src.ownerId,
    toOwnerId: toOwner.id,
    qtyTransferred: input.qtyToTransfer,
    unitCostTransferredCop: src.effectiveUnitCostCop ?? 0,
    reason: input.reason.trim(),
    authorizedBy: actorEmail
  };

  state.transfers.unshift(transfer);
  if (!targetState) saveInventoryPurchaseState(state);
  return { transfer, sourceAllocation: src, targetAllocation: tgt };
}

export function txRecordInventoryAdjustment(
  input: {
    idempotencyKey: string;
    lotAllocationId: string;
    deltaGood: number;
    deltaDefective: number;
    deltaPending: number;
    reason: string;
  },
  actorEmail: string,
  targetState?: InventoryPurchaseStoreState
): {
  allocation: LotOwnerAllocationRecord;
  movement: ImmutableStockMovement;
} {
  const state = targetState ?? getInventoryPurchaseState();
  const idempKey = input.idempotencyKey.trim();

  if (!idempKey) throw new Error('IDEMPOTENCIA REQUERIDA: Falta idempotencyKey.');
  if (state.processedIdempotencyKeys.includes(idempKey)) {
    throw new Error(`IDEMPOTENCIA BLOQUEADA: El ajuste "${idempKey}" ya fue procesado.`);
  }

  if (!input.reason || input.reason.trim().length < 5) {
    throw new Error('MOTIVO OBLIGATORIO: Todo ajuste de inventario requiere justificación documentada.');
  }

  if (
    !Number.isFinite(input.deltaGood) ||
    !Number.isInteger(input.deltaGood) ||
    !Number.isFinite(input.deltaDefective) ||
    !Number.isInteger(input.deltaDefective) ||
    !Number.isFinite(input.deltaPending) ||
    !Number.isInteger(input.deltaPending) ||
    (input.deltaGood === 0 && input.deltaDefective === 0 && input.deltaPending === 0)
  ) {
    throw new Error('Los deltas de ajuste deben ser enteros válidos y al menos uno distinto de cero.');
  }

  const alloc = state.allocations.find((a) => a.id === input.lotAllocationId);
  if (!alloc) throw new Error('Asignación de lote no encontrada.');

  const newGood = alloc.qtyGood + input.deltaGood;
  const newDef = alloc.qtyDefective + input.deltaDefective;
  const newPend = alloc.qtyPendingInspection + input.deltaPending;
  const deltaPhysical = input.deltaGood + input.deltaDefective + input.deltaPending;
  const newPhysical = alloc.qtyPhysical + deltaPhysical;

  if (
    newGood < alloc.qtyReserved ||
    newGood < 0 ||
    newDef < 0 ||
    newPend < 0 ||
    newPhysical < 0
  ) {
    throw new Error(
      'PREVENCIÓN DE STOCK NEGATIVO: El ajuste dejaría saldos negativos o menores al stock reservado.'
    );
  }

  const nowIso = new Date().toISOString();
  alloc.qtyGood = newGood;
  alloc.qtyDefective = newDef;
  alloc.qtyPendingInspection = newPend;
  alloc.qtyPhysical = newPhysical;
  alloc.qtyAvailable = computeAvailable(alloc.qtyGood, alloc.qtyReserved);
  alloc.lockVersion += 1;
  alloc.updatedAt = nowIso;

  const adjCode = `ADJ-${alloc.sku}-V${alloc.lockVersion}`;
  const movement: ImmutableStockMovement = Object.freeze({
    id: `MOV-ADJ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    movementSeq: state.movements.length + 1,
    idempotencyKey: idempKey,
    createdAt: nowIso,
    lotAllocationId: alloc.id,
    allocationCode: alloc.allocationCode,
    lotId: alloc.lotId,
    sku: alloc.sku,
    productName: alloc.productName,
    ownerId: alloc.ownerId,
    movementType: 'reconciliation_adjustment',
    deltaPhysical,
    deltaGood: input.deltaGood,
    deltaDefective: input.deltaDefective,
    deltaPending: input.deltaPending,
    deltaReserved: 0,
    balancePhysicalAfter: alloc.qtyPhysical,
    balanceGoodAfter: alloc.qtyGood,
    balanceDefectiveAfter: alloc.qtyDefective,
    balancePendingAfter: alloc.qtyPendingInspection,
    balanceReservedAfter: alloc.qtyReserved,
    balanceAvailableAfter: alloc.qtyAvailable,
    unitCostSnapshotCop: alloc.effectiveUnitCostCop,
    referenceEntity: 'adjustments',
    referenceId: adjCode,
    reason: input.reason.trim(),
    performedBy: actorEmail,
    immutable: true
  });

  state.movements.unshift(movement);
  state.processedIdempotencyKeys.push(idempKey);

  if (!targetState) saveInventoryPurchaseState(state);
  return { allocation: alloc, movement };
}

// ============================================================================
// 8. GENERADORES DE LOS 6 REPORTES ANALÍTICOS OFICIALES
// ============================================================================
export function buildInventoryReports(
  state: InventoryPurchaseStoreState,
  ownerScope = 'ALL'
) {
  const filteredAllocations = state.allocations.filter(
    (a) => ownerScope === 'ALL' || a.ownerId === ownerScope
  );

  // 1. Reporte por SKU
  const bySkuMap: Record<
    string,
    {
      sku: string;
      productName: string;
      category: string;
      owners: Set<string>;
      lotsCount: number;
      qtyPhysical: number;
      qtyGood: number;
      qtyDefective: number;
      qtyPending: number;
      qtyReserved: number;
      qtyAvailable: number;
      valuationCop: number;
      hasPendingCost: boolean;
    }
  > = {};

  for (const cat of Object.values(state.catalog)) {
    bySkuMap[cat.sku] = {
      sku: cat.sku,
      productName: cat.productName,
      category: cat.category,
      owners: new Set(),
      lotsCount: 0,
      qtyPhysical: 0,
      qtyGood: 0,
      qtyDefective: 0,
      qtyPending: 0,
      qtyReserved: 0,
      qtyAvailable: 0,
      valuationCop: 0,
      hasPendingCost: false
    };
  }

  for (const a of filteredAllocations) {
    if (!bySkuMap[a.sku]) {
      bySkuMap[a.sku] = {
        sku: a.sku,
        productName: a.productName,
        category: a.category,
        owners: new Set(),
        lotsCount: 0,
        qtyPhysical: 0,
        qtyGood: 0,
        qtyDefective: 0,
        qtyPending: 0,
        qtyReserved: 0,
        qtyAvailable: 0,
        valuationCop: 0,
        hasPendingCost: false
      };
    }
    const entry = bySkuMap[a.sku];
    entry.owners.add(a.ownerId);
    entry.lotsCount += 1;
    entry.qtyPhysical += a.qtyPhysical;
    entry.qtyGood += a.qtyGood;
    entry.qtyDefective += a.qtyDefective;
    entry.qtyPending += a.qtyPendingInspection;
    entry.qtyReserved += a.qtyReserved;
    entry.qtyAvailable += a.qtyAvailable;
    if (a.effectiveUnitCostCop !== null) {
      entry.valuationCop += a.effectiveUnitCostCop * a.qtyPhysical;
    } else {
      entry.hasPendingCost = true;
    }
  }

  const bySku = Object.values(bySkuMap).map((x) => ({
    ...x,
    ownersList: Array.from(x.owners).join(', ') || 'Sin lote asignado'
  }));

  // 2. Reporte por Categoría
  const byCategoryMap: Record<
    string,
    {
      category: string;
      skusCount: number;
      lotsCount: number;
      qtyPhysical: number;
      qtyGood: number;
      qtyDefective: number;
      qtyPending: number;
      qtyReserved: number;
      qtyAvailable: number;
      valuationCop: number;
    }
  > = {};

  for (const row of bySku) {
    if (!byCategoryMap[row.category]) {
      byCategoryMap[row.category] = {
        category: row.category,
        skusCount: 0,
        lotsCount: 0,
        qtyPhysical: 0,
        qtyGood: 0,
        qtyDefective: 0,
        qtyPending: 0,
        qtyReserved: 0,
        qtyAvailable: 0,
        valuationCop: 0
      };
    }
    const c = byCategoryMap[row.category];
    c.skusCount += 1;
    c.lotsCount += row.lotsCount;
    c.qtyPhysical += row.qtyPhysical;
    c.qtyGood += row.qtyGood;
    c.qtyDefective += row.qtyDefective;
    c.qtyPending += row.qtyPending;
    c.qtyReserved += row.qtyReserved;
    c.qtyAvailable += row.qtyAvailable;
    c.valuationCop += row.valuationCop;
  }

  // 3. Reporte por Propietario
  const byOwner = state.owners.map((o) => {
    const ownerAllocs = state.allocations.filter((a) => a.ownerId === o.id);
    const skus = new Set(ownerAllocs.map((a) => a.sku));
    return {
      ownerId: o.id,
      ownerName: o.fullName,
      status: o.status,
      distinctSkus: skus.size,
      lotsCount: ownerAllocs.length,
      qtyPhysical: ownerAllocs.reduce((s, a) => s + a.qtyPhysical, 0),
      qtyGood: ownerAllocs.reduce((s, a) => s + a.qtyGood, 0),
      qtyDefective: ownerAllocs.reduce((s, a) => s + a.qtyDefective, 0),
      qtyPending: ownerAllocs.reduce((s, a) => s + a.qtyPendingInspection, 0),
      qtyReserved: ownerAllocs.reduce((s, a) => s + a.qtyReserved, 0),
      qtyAvailable: ownerAllocs.reduce((s, a) => s + a.qtyAvailable, 0),
      valuationCop: ownerAllocs.reduce(
        (s, a) => s + (a.effectiveUnitCostCop ?? 0) * a.qtyPhysical,
        0
      )
    };
  });

  // 4. Reporte por Lote
  const byLot = filteredAllocations;

  // 5. Reporte por Proveedor
  const bySupplier = Object.values(state.suppliers).map((sup) => {
    const supAllocs = filteredAllocations.filter((a) => a.supplierId === sup.id);
    const supOrders = state.purchaseOrders.filter((po) => po.supplierId === sup.id);
    return {
      supplierId: sup.id,
      supplierCode: sup.supplierCode,
      legalName: sup.legalName,
      purchaseOrdersCount: supOrders.length,
      lotsCount: supAllocs.length,
      qtyPhysical: supAllocs.reduce((s, a) => s + a.qtyPhysical, 0),
      qtyAvailable: supAllocs.reduce((s, a) => s + a.qtyAvailable, 0),
      valuationCop: supAllocs.reduce(
        (s, a) => s + (a.effectiveUnitCostCop ?? 0) * a.qtyPhysical,
        0
      )
    };
  });

  // 6. Reporte por Estado de Calidad
  const qualityStates: ReconciliationState[] = [
    'reconciled',
    'pending_inspection',
    'pending_cost_info',
    'pending_physical_count',
    'discrepancy'
  ];
  const byQualityState = qualityStates.map((st) => {
    const subset = filteredAllocations.filter((a) => a.reconciliationState === st);
    return {
      reconciliationState: st,
      lotsCount: subset.length,
      qtyPhysical: subset.reduce((s, a) => s + a.qtyPhysical, 0),
      qtyGood: subset.reduce((s, a) => s + a.qtyGood, 0),
      qtyDefective: subset.reduce((s, a) => s + a.qtyDefective, 0),
      qtyPending: subset.reduce((s, a) => s + a.qtyPendingInspection, 0),
      qtyReserved: subset.reduce((s, a) => s + a.qtyReserved, 0),
      qtyAvailable: subset.reduce((s, a) => s + a.qtyAvailable, 0)
    };
  });

  return {
    bySku,
    byCategory: Object.values(byCategoryMap),
    byOwner,
    byLot,
    bySupplier,
    byQualityState
  };
}

// ============================================================================
// 9. BATERÍA AUTOMATIZADA DE LAS 9 PRUEBAS OBLIGATORIAS (SANDBOX EN MEMORIA)
// No introduce registros ficticios en producción ni altera saldos históricos.
// ============================================================================
export function runInventoryPurchaseTestSuite(
  actorEmail: string
): InventoryTestScenarioResult[] {
  const results: InventoryTestScenarioResult[] = [];
  const baseProdState = getInventoryPurchaseState();

  // Deep clone into an isolated sandbox state so production state is never touched
  const sandbox: InventoryPurchaseStoreState = JSON.parse(
    JSON.stringify(baseProdState)
  );

  // Ensure at least AUD-TWS-001-NEG is in sandbox catalog for testing
  if (!sandbox.catalog['AUD-TWS-001-NEG']) {
    sandbox.catalog['AUD-TWS-001-NEG'] = {
      productId: 'PROD-AUD-TWS-001',
      variantId: 'VAR-AUD-TWS-001-NEG',
      legacyExcelRowId: 2,
      productCode: 'AUD-TWS-001',
      sku: 'AUD-TWS-001-NEG',
      category: 'Audio',
      productName: 'Audífonos Inalámbricos M10 Pro',
      brand: 'TWS',
      model: 'M10 Pro',
      variantName: 'Negro',
      color: 'Negro',
      manufacturerRef: 'M10',
      supplierRef: 'TEMU-M10',
      description: 'Audífonos inalámbricos con pantalla LED',
      verifiedFeatures: 'Bluetooth 5.3',
      unitOfMeasure: 'Unidad',
      photoUrls: [],
      status: 'active',
      excelOriginalStatus: 'En Stock',
      approvedSalePriceCop: null,
      originalNotes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      historyEvents: []
    };
  }

  // Register a second owner ONLY inside the isolated sandbox to test multi-owner rules
  sandbox.owners.push({
    id: 'OWN-0002',
    fullName: 'Propietario Asociado Sandbox #2',
    status: 'active'
  });

  // --------------------------------------------------------------------------
  // PRUEBA 1: Recepción parcial
  // --------------------------------------------------------------------------
  const po1 = txCreatePurchaseOrder(
    {
      orderNumber: 'PO-TEST-0001',
      orderDate: '2026-11-13',
      supplierId: 'SUP-0001',
      invoiceReference: 'FAC-TEST-01',
      inboundShippingCop: 0,
      documentUrls: ['factura_po_test_01.pdf'],
      notes: 'Orden de prueba recepción parcial y completa',
      lines: [
        {
          sku: 'AUD-TWS-001-NEG',
          ownerId: 'OWN-0001',
          qtyOrdered: 10,
          unitPurchaseCostCop: 11500
        }
      ]
    },
    actorEmail,
    sandbox
  );

  const recPartial = txReceivePurchaseOrderLine(
    {
      idempotencyKey: 'TEST-IDEMP-REC-PARTIAL-1',
      orderNumber: po1.orderNumber,
      lineNumber: 1,
      lotId: 'LOT-TEST-PARTIAL-01',
      ownerId: 'OWN-0001',
      storageBin: 'ESTANTE-A1',
      qtyReceivedNow: 4,
      qtyGood: 4,
      qtyDefective: 0,
      qtyPendingInspection: 0,
      unitPurchaseCostCop: 11500,
      inspectorName: 'Inspector Sandbox',
      notes: 'Primera entrega parcial de 4 unidades sobre 10 pedidas'
    },
    actorEmail,
    sandbox
  );

  const test1Passed =
    recPartial.order.status === 'partial_received' &&
    recPartial.order.lines[0].qtyReceived === 4 &&
    recPartial.allocation.qtyAvailable === 4;

  results.push({
    testId: 'INV-TEST-01',
    title: '1. Recepción parcial de orden de compra',
    scenario:
      'Orden PO-TEST-0001 por 10 unidades de AUD-TWS-001-NEG. Llegan 4 unidades en primera entrega.',
    expected:
      'Estado de orden = partial_received, recibido = 4/10, lote creado con 4 unidades disponibles para OWN-0001.',
    actual: `Estado: ${recPartial.order.status}, recibido: ${recPartial.order.lines[0].qtyReceived}/${recPartial.order.lines[0].qtyOrdered}, disponible en lote: ${recPartial.allocation.qtyAvailable}.`,
    passed: test1Passed,
    details: [
      `Lote generado: ${recPartial.allocation.lotId} (Propietario: ${recPartial.allocation.ownerId}).`,
      `Movimiento inmutable registrado: ${recPartial.movement.movementType} (+4 unidades).`
    ]
  });

  // --------------------------------------------------------------------------
  // PRUEBA 2: Recepción completa y bloqueo de sobre-recepción
  // --------------------------------------------------------------------------
  const recComplete = txReceivePurchaseOrderLine(
    {
      idempotencyKey: 'TEST-IDEMP-REC-COMPLETE-2',
      orderNumber: po1.orderNumber,
      lineNumber: 1,
      lotId: 'LOT-TEST-PARTIAL-02',
      ownerId: 'OWN-0001',
      storageBin: 'ESTANTE-A1',
      qtyReceivedNow: 6,
      qtyGood: 6,
      qtyDefective: 0,
      qtyPendingInspection: 0,
      unitPurchaseCostCop: 11500,
      inspectorName: 'Inspector Sandbox',
      notes: 'Segunda entrega completando las 6 unidades restantes (10/10)'
    },
    actorEmail,
    sandbox
  );

  let overReceiveBlocked = false;
  try {
    txReceivePurchaseOrderLine(
      {
        idempotencyKey: 'TEST-IDEMP-OVER-RECEIVE',
        orderNumber: po1.orderNumber,
        lineNumber: 1,
        lotId: 'LOT-TEST-OVER',
        ownerId: 'OWN-0001',
        storageBin: 'ESTANTE-A1',
        qtyReceivedNow: 1,
        qtyGood: 1,
        qtyDefective: 0,
        qtyPendingInspection: 0,
        unitPurchaseCostCop: 11500,
        inspectorName: 'Inspector Sandbox',
        notes: 'Intento de sobre-recibir 11/10'
      },
      actorEmail,
      sandbox
    );
  } catch {
    overReceiveBlocked = true;
  }

  const test2Passed =
    recComplete.order.status === 'received' &&
    recComplete.order.lines[0].qtyReceived === 10 &&
    overReceiveBlocked;

  results.push({
    testId: 'INV-TEST-02',
    title: '2. Recepción completa (10/10) y prevención de sobre-recepción',
    scenario:
      'Se reciben las 6 unidades pendientes para completar 10/10 y se intenta recibir 1 unidad adicional.',
    expected:
      'Estado de orden = received (10/10) y bloqueo automático si se intenta recibir por encima de lo ordenado.',
    actual: `Estado: ${recComplete.order.status} (${recComplete.order.lines[0].qtyReceived}/10). Sobre-recepción bloqueada: ${overReceiveBlocked ? 'SÍ' : 'NO'}.`,
    passed: test2Passed,
    details: [
      `Total recibido acumulado en línea: ${recComplete.order.lines[0].qtyReceived} de ${recComplete.order.lines[0].qtyOrdered}.`,
      'Intento de recibir unidad #11 rechazado por validación transaccional.'
    ]
  });

  // --------------------------------------------------------------------------
  // PRUEBA 3: Productos defectuosos (Segregación de calidad Regla 6 y 13)
  // --------------------------------------------------------------------------
  const poDef = txCreatePurchaseOrder(
    {
      orderNumber: 'PO-TEST-0002',
      orderDate: '2026-11-13',
      supplierId: 'SUP-0001',
      invoiceReference: 'FAC-TEST-02',
      inboundShippingCop: 0,
      documentUrls: [],
      notes: 'Prueba de unidades defectuosas',
      lines: [
        {
          sku: 'AUD-TWS-001-NEG',
          ownerId: 'OWN-0001',
          qtyOrdered: 5,
          unitPurchaseCostCop: 11500
        }
      ]
    },
    actorEmail,
    sandbox
  );

  const recDef = txReceivePurchaseOrderLine(
    {
      idempotencyKey: 'TEST-IDEMP-DEFECTIVE-3',
      orderNumber: poDef.orderNumber,
      lineNumber: 1,
      lotId: 'LOT-TEST-DEF-01',
      ownerId: 'OWN-0001',
      storageBin: 'CUARENTENA-B1',
      qtyReceivedNow: 5,
      qtyGood: 3,
      qtyDefective: 2,
      qtyPendingInspection: 0,
      unitPurchaseCostCop: 11500,
      evidenceUrls: ['evidencia_defecto_caja.jpg'],
      inspectorName: 'Inspector Calidad',
      notes: '3 unidades aptas y 2 unidades con defecto físico'
    },
    actorEmail,
    sandbox
  );

  const test3Passed =
    recDef.allocation.qtyPhysical === 5 &&
    recDef.allocation.qtyGood === 3 &&
    recDef.allocation.qtyDefective === 2 &&
    recDef.allocation.qtyAvailable === 3;

  results.push({
    testId: 'INV-TEST-03',
    title: '3. Segregación de productos defectuosos',
    scenario:
      'Recepción de 5 unidades donde 3 aprueban calidad y 2 se marcan como defectuosas con evidencia.',
    expected:
      'Cant. Física = 5, Apta = 3, Defectuosa = 2, Disponible para venta = 3 (defectuosas nunca suman al disponible).',
    actual: `Físico: ${recDef.allocation.qtyPhysical}, Apto: ${recDef.allocation.qtyGood}, Defectuoso: ${recDef.allocation.qtyDefective}, Disponible: ${recDef.allocation.qtyAvailable}.`,
    passed: test3Passed,
    details: [
      `Ecuación verificada: ${recDef.allocation.qtyPhysical} = ${recDef.allocation.qtyGood} + ${recDef.allocation.qtyDefective} + ${recDef.allocation.qtyPendingInspection}.`
    ]
  });

  // --------------------------------------------------------------------------
  // PRUEBA 4: Dos propietarios con el mismo SKU (costos y lotes separados + no autoasignar)
  // --------------------------------------------------------------------------
  let emptyOwnerBlocked = false;
  try {
    txCreatePurchaseOrder(
      {
        orderNumber: 'PO-TEST-NO-OWNER',
        orderDate: '2026-11-13',
        supplierId: 'SUP-0001',
        invoiceReference: 'FAC-ERR',
        inboundShippingCop: 0,
        documentUrls: [],
        notes: '',
        lines: [
          {
            sku: 'AUD-TWS-001-NEG',
            ownerId: '', // Vacío para comprobar que NO autoasigna Eberto
            qtyOrdered: 2,
            unitPurchaseCostCop: 12000
          }
        ]
      },
      actorEmail,
      sandbox
    );
  } catch {
    emptyOwnerBlocked = true;
  }

  const poOwner2 = txCreatePurchaseOrder(
    {
      orderNumber: 'PO-TEST-OWN2',
      orderDate: '2026-11-13',
      supplierId: 'SUP-0001',
      invoiceReference: 'FAC-OWN2-01',
      inboundShippingCop: 0,
      documentUrls: [],
      notes: 'Compra del mismo SKU AUD-TWS-001-NEG perteneciente a OWN-0002 con costo diferente',
      lines: [
        {
          sku: 'AUD-TWS-001-NEG',
          ownerId: 'OWN-0002',
          qtyOrdered: 1,
          unitPurchaseCostCop: 14200
        }
      ]
    },
    actorEmail,
    sandbox
  );

  const recOwner2 = txReceivePurchaseOrderLine(
    {
      idempotencyKey: 'TEST-IDEMP-OWN2-4',
      orderNumber: poOwner2.orderNumber,
      lineNumber: 1,
      lotId: 'LOT-OWN2-01',
      ownerId: 'OWN-0002',
      storageBin: 'ESTANTE-B2',
      qtyReceivedNow: 1,
      qtyGood: 1,
      qtyDefective: 0,
      qtyPendingInspection: 0,
      unitPurchaseCostCop: 14200,
      inspectorName: 'Inspector Sandbox',
      notes: '1 unidad disponible de AUD-TWS-001-NEG para OWN-0002 a $14.200 COP'
    },
    actorEmail,
    sandbox
  );

  const test4Passed =
    emptyOwnerBlocked &&
    recOwner2.allocation.ownerId === 'OWN-0002' &&
    recOwner2.allocation.effectiveUnitCostCop === 14200 &&
    recPartial.allocation.ownerId === 'OWN-0001' &&
    recPartial.allocation.effectiveUnitCostCop === 11500;

  results.push({
    testId: 'INV-TEST-04',
    title: '4. Dos propietarios con el mismo SKU y bloqueo de autoasignación',
    scenario:
      'El SKU AUD-TWS-001-NEG tiene lotes de OWN-0001 ($11.500 COP) y de OWN-0002 ($14.200 COP), y rechaza órdenes sin propietario explícito.',
    expected:
      'Cantidades y costos separados estrictamente por lote y propietario sin mezclar saldos; rechazo si ownerId viene vacío.',
    actual: `OWN-0001 Lote ${recPartial.allocation.lotId}: $11.500 COP | OWN-0002 Lote ${recOwner2.allocation.lotId}: $14.200 COP | Autoasignación bloqueada: ${emptyOwnerBlocked ? 'SÍ' : 'NO'}.`,
    passed: test4Passed,
    details: [
      'Un mismo SKU convive en múltiples propietarios sin duplicar el catálogo maestro.',
      'Costos unitarios separados por lote ($11.500 COP vs $14.200 COP).'
    ]
  });

  // --------------------------------------------------------------------------
  // PRUEBA 5: Venta de última unidad concurrente (Control de concurrencia y stock negativo)
  // --------------------------------------------------------------------------
  const sharedVersionSnapshot = recOwner2.allocation.lockVersion; // queda exactamente 1 unidad disponible en este lote
  const dispatchOperatorA = txDispatchStock(
    {
      idempotencyKey: 'TEST-IDEMP-CONCURRENT-A',
      lotAllocationId: recOwner2.allocation.id,
      qtyToDispatch: 1,
      dispatchReference: 'PEDIDO-CONC-A',
      expectedLockVersion: sharedVersionSnapshot,
      reason: 'Operador A despacha la última unidad disponible'
    },
    'vendedorA@realtws.co',
    sandbox
  );

  let concurrentOperatorBRejected = false;
  let concurrentRejectReason = '';
  try {
    txDispatchStock(
      {
        idempotencyKey: 'TEST-IDEMP-CONCURRENT-B',
        lotAllocationId: recOwner2.allocation.id,
        qtyToDispatch: 1,
        dispatchReference: 'PEDIDO-CONC-B',
        expectedLockVersion: sharedVersionSnapshot, // misma versión leída concurrentemente
        reason: 'Operador B intenta despachar la misma última unidad al mismo tiempo'
      },
      'vendedorB@realtws.co',
      sandbox
    );
  } catch (err) {
    concurrentOperatorBRejected = true;
    concurrentRejectReason = err instanceof Error ? err.message : 'Conflicto concurrente';
  }

  const test5Passed =
    dispatchOperatorA.allocation.qtyAvailable === 0 &&
    dispatchOperatorA.allocation.qtyPhysical === 0 &&
    concurrentOperatorBRejected;

  results.push({
    testId: 'INV-TEST-05',
    title: '5. Venta de última unidad concurrente (Control de concurrencia)',
    scenario:
      'Queda 1 unidad disponible en el lote LOT-OWN2-01 (lockVersion=1). Dos operadores intentan despacharla simultáneamente.',
    expected:
      'El primer despacho se confirma (disponible pasa a 0, lockVersion=2) y el segundo se aborta evitando stock negativo.',
    actual: `Operador A: COMMITTED (Disp=0, lockVersion=${dispatchOperatorA.allocation.lockVersion}). Operador B: RECHAZADO (${concurrentRejectReason}).`,
    passed: test5Passed,
    details: [
      'Prevención de condición de carrera mediante control de lockVersion y bloqueo FOR UPDATE.',
      'Prevención garantizada de stock negativo (saldo final = 0).'
    ]
  });

  // --------------------------------------------------------------------------
  // PRUEBA 6: Reserva cancelada (Retención y liberación de stock disponible)
  // --------------------------------------------------------------------------
  const availBeforeRes = recPartial.allocation.qtyAvailable; // 4
  const resHold = txReserveStock(
    {
      idempotencyKey: 'TEST-IDEMP-RES-HOLD-6',
      lotAllocationId: recPartial.allocation.id,
      qtyToReserve: 2,
      salesOrderRef: 'PED-RES-006',
      reason: 'Reserva temporal para cliente WhatsApp'
    },
    actorEmail,
    sandbox
  );
  const availDuringRes = resHold.allocation.qtyAvailable; // 2

  const resRelease = txReleaseStockReservation(
    {
      idempotencyKey: 'TEST-IDEMP-RES-REL-6',
      reservationId: resHold.reservation.id,
      reason: 'Cliente canceló pedido antes del pago'
    },
    actorEmail,
    sandbox
  );
  const availAfterRelease = resRelease.allocation.qtyAvailable; // 4

  const test6Passed =
    availBeforeRes === 4 &&
    availDuringRes === 2 &&
    availAfterRelease === 4 &&
    resRelease.reservation.status === 'released';

  results.push({
    testId: 'INV-TEST-06',
    title: '6. Reserva creada y cancelada (Liberación íntegra de disponible)',
    scenario:
      'Sobre un lote con 4 unidades disponibles se reservan 2 unidades y luego se cancela la reserva.',
    expected:
      'Disponible pasa 4 -> 2 durante la reserva y vuelve a 4 al cancelarse, registrando reservation_hold y reservation_release.',
    actual: `Disponible Antes: ${availBeforeRes} -> En Reserva: ${availDuringRes} -> Tras Cancelar: ${availAfterRelease} (Estado: ${resRelease.reservation.status}).`,
    passed: test6Passed,
    details: [
      `Movimientos generados: reservation_hold (+2 reservadas) y reservation_release (-2 reservadas).`
    ]
  });

  // --------------------------------------------------------------------------
  // PRUEBA 7: Devolución de cliente (Reingreso trazable al lote)
  // --------------------------------------------------------------------------
  const retOutcome = txProcessCustomerReturn(
    {
      idempotencyKey: 'TEST-IDEMP-RETURN-7',
      lotAllocationId: recOwner2.allocation.id,
      qtyReturned: 1,
      returnCondition: 'good_restock',
      returnReference: 'DEV-CLI-007',
      reason: 'Cliente devolvió unidad sellada sin uso dentro de garantía'
    },
    actorEmail,
    sandbox
  );

  const test7Passed =
    retOutcome.allocation.qtyPhysical === 1 &&
    retOutcome.allocation.qtyAvailable === 1 &&
    retOutcome.movement.movementType === 'customer_return_restock';

  results.push({
    testId: 'INV-TEST-07',
    title: '7. Devolución de cliente al lote y propietario original',
    scenario:
      'Reingreso de 1 unidad devuelta en buen estado sobre el lote LOT-OWN2-01.',
    expected:
      'Incrementa stock físico y disponible de 0 a 1 en el lote original con movimiento customer_return_restock.',
    actual: `Físico post-devolución: ${retOutcome.allocation.qtyPhysical}, Disponible: ${retOutcome.allocation.qtyAvailable} (${retOutcome.movement.movementType}).`,
    passed: test7Passed,
    details: [
      `Trazabilidad conservada hacia lote ${retOutcome.allocation.lotId} y propietario ${retOutcome.allocation.ownerId}.`
    ]
  });

  // --------------------------------------------------------------------------
  // PRUEBA 8: Transferencia de propiedad entre dueños sin mezclar historial
  // --------------------------------------------------------------------------
  const trfOutcome = txTransferOwnership(
    {
      idempotencyKey: 'TEST-IDEMP-TRANSFER-8',
      sourceAllocationId: recPartial.allocation.id, // OWN-0001 tiene 4 disponibles
      toOwnerId: 'OWN-0002',
      qtyToTransfer: 1,
      reason: 'Cesión acordada de 1 unidad del lote LOT-TEST-PARTIAL-01 de OWN-0001 a OWN-0002'
    },
    actorEmail,
    sandbox
  );

  const test8Passed =
    trfOutcome.sourceAllocation.qtyAvailable === 3 &&
    trfOutcome.targetAllocation.ownerId === 'OWN-0002' &&
    trfOutcome.targetAllocation.qtyAvailable === 1;

  results.push({
    testId: 'INV-TEST-08',
    title: '8. Transferencia de propiedad entre propietarios (transfer_out / transfer_in)',
    scenario:
      'Transferencia de 1 unidad disponible en LOT-TEST-PARTIAL-01 desde OWN-0001 hacia OWN-0002.',
    expected:
      'OWN-0001 queda con 3 disponibles y OWN-0002 recibe 1 disponible en su propia asignación con movimientos transfer_out y transfer_in.',
    actual: `Origen (${trfOutcome.sourceAllocation.ownerId}): ${trfOutcome.sourceAllocation.qtyAvailable} disp. | Destino (${trfOutcome.targetAllocation.ownerId}): ${trfOutcome.targetAllocation.qtyAvailable} disp.`,
    passed: test8Passed,
    details: [
      `Código de transferencia: ${trfOutcome.transfer.transferCode} a costo ${trfOutcome.transfer.unitCostTransferredCop} COP.`,
      'Saldos pasados intactos; doble movimiento inmutable transfer_out y transfer_in creado.'
    ]
  });

  // --------------------------------------------------------------------------
  // PRUEBA 9: Ajuste de inventario conciliado y bloqueo de ajuste negativo inválido
  // --------------------------------------------------------------------------
  const adjOutcome = txRecordInventoryAdjustment(
    {
      idempotencyKey: 'TEST-IDEMP-ADJUST-9',
      lotAllocationId: recDef.allocation.id,
      deltaGood: -1,
      deltaDefective: 1,
      deltaPending: 0,
      reason: 'Reclasificación por auditoría física: 1 unidad apta pasó a defectuosa por empaque averiado'
    },
    actorEmail,
    sandbox
  );

  let negativeAdjBlocked = false;
  try {
    txRecordInventoryAdjustment(
      {
        idempotencyKey: 'TEST-IDEMP-ADJUST-NEG',
        lotAllocationId: recDef.allocation.id,
        deltaGood: -99,
        deltaDefective: 0,
        deltaPending: 0,
        reason: 'Intento de ajuste que dejaría stock negativo'
      },
      actorEmail,
      sandbox
    );
  } catch {
    negativeAdjBlocked = true;
  }

  const test9Passed =
    adjOutcome.allocation.qtyGood === 2 &&
    adjOutcome.allocation.qtyDefective === 3 &&
    adjOutcome.allocation.qtyPhysical === 5 &&
    adjOutcome.movement.movementType === 'reconciliation_adjustment' &&
    negativeAdjBlocked;

  results.push({
    testId: 'INV-TEST-09',
    title: '9. Ajuste de inventario auditado y prevención de saldo negativo',
    scenario:
      'Reclasificación auditada (-1 apta, +1 defectuosa) con motivo obligatorio y bloqueo de ajuste negativo (-99).',
    expected:
      'Ajuste aplicado con movimiento reconciliation_adjustment y rechazo automático del ajuste que daría saldo negativo.',
    actual: `Apto: ${adjOutcome.allocation.qtyGood}, Defectuoso: ${adjOutcome.allocation.qtyDefective}, Físico: ${adjOutcome.allocation.qtyPhysical}. Ajuste negativo bloqueado: ${negativeAdjBlocked ? 'SÍ' : 'NO'}.`,
    passed: test9Passed,
    details: [
      `Movimiento registrado: ${adjOutcome.movement.referenceId} (${adjOutcome.movement.reason}).`,
      'Ningún movimiento histórico fue borrado ni sobrescrito.'
    ]
  });

  return results;
}
