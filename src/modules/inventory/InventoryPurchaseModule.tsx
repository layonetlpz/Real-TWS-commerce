import { useState, useEffect, useMemo } from 'react';
import {
  Package,
  Boxes,
  Truck,
  Building2,
  ClipboardCheck,
  BarChart3,
  ShieldCheck,
  Lock,
  Plus,
  Play,
  Download,
  FileSpreadsheet,
  Camera,
  History,
  ArrowRightLeft,
  RotateCcw
} from 'lucide-react';
import {
  type InventoryPurchaseStoreState,
  type ProductVariantCatalogItem,
  type LotOwnerAllocationRecord,
  type InventoryTestScenarioResult,
  getInventoryPurchaseState,
  ensureExcelBaselineLoadedInInventory,
  syncOwnersIntoInventoryStore,
  updateProductVariantCatalogItem,
  registerOrUpdateSupplier,
  txCreatePurchaseOrder,
  txReceivePurchaseOrderLine,
  txInspectQualityAllocation,
  txReserveStock,
  txReleaseStockReservation,
  txDispatchStock,
  txProcessCustomerReturn,
  txTransferOwnership,
  txRecordInventoryAdjustment,
  buildInventoryReports,
  runInventoryPurchaseTestSuite
} from '../../services/inventoryPurchaseService';
import { fetchLiveOwnersFromSupabase } from '../../services/supabaseDataBridge';
import { exportRowsToCsvUtf8 } from '../../utils/spreadsheetParser';
import { formatCOP, formatInteger } from '../../utils/formatters';
import { useAuth } from '../../hooks/useAuth';
import { useOwnerScope } from '../../hooks/useOwnerScope';
import { useNotifications } from '../../hooks/useNotifications';
import { ExcelImportModule } from '../import/ExcelImportModule';
import { ModuleHeader, SegmentedTabs, StatCard } from '../../components/glass';

export type InventoryModuleSection =
  | 'PRODUCTS'
  | 'SUPPLIERS'
  | 'PURCHASES_RECEPTIONS'
  | 'INVENTORY_OPERATIONS'
  | 'MOVEMENTS_LEDGER'
  | 'REPORTS'
  | 'TESTS_9'
  | 'EXCEL_IMPORT';

interface InventoryPurchaseModuleProps {
  initialSection?: InventoryModuleSection;
}

export function InventoryPurchaseModule({
  initialSection = 'INVENTORY_OPERATIONS'
}: InventoryPurchaseModuleProps) {
  const { userProfile, activeEffectiveRole } = useAuth();
  const { selectedOwnerScope } = useOwnerScope();
  const { notify } = useNotifications();
  const actorEmail = userProfile?.email || 'sistema@realtws.co';
  const effectiveRole = activeEffectiveRole || userProfile?.role || 'VIEWER';
  const canWriteInventory = effectiveRole === 'ADMIN' || effectiveRole === 'INVENTORY_OPERATOR';
  const canTransferOwnership = effectiveRole === 'ADMIN';
  const canImportExcel = effectiveRole === 'ADMIN' || effectiveRole === 'INVENTORY_OPERATOR';

  const [activeSection, setActiveSection] = useState<InventoryModuleSection>(initialSection);
  const [store, setStore] = useState<InventoryPurchaseStoreState>(() =>
    getInventoryPurchaseState()
  );
  const [isSyncingBaseline, setIsSyncingBaseline] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receptionNonce, setReceptionNonce] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const [opNonce, setOpNonce] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

  // Sync section when route changes
  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  // Listen to state updates, auto-load baseline if empty, and sync live owners from Supabase
  useEffect(() => {
    let active = true;
    const refresh = () => setStore(getInventoryPurchaseState());
    window.addEventListener('rtw-inventory-purchase-updated', refresh);
    window.addEventListener('rtw-import-state-updated', refresh);

    if (Object.keys(getInventoryPurchaseState().catalog).length === 0) {
      setIsSyncingBaseline(true);
      ensureExcelBaselineLoadedInInventory(actorEmail)
        .then((synced) => {
          if (active) setStore(synced);
        })
        .catch(() => {})
        .finally(() => {
          if (active) setIsSyncingBaseline(false);
        });
    }

    fetchLiveOwnersFromSupabase()
      .then((res) => {
        if (!active || res.error || res.data.length === 0) return;
        const synced = syncOwnersIntoInventoryStore(
          res.data.map((o) => ({
            id: o.id,
            fullName: o.full_name,
            status: o.status === 'inactive' ? 'inactive' : 'active'
          }))
        );
        setStore(synced);
      })
      .catch(() => {});

    return () => {
      active = false;
      window.removeEventListener('rtw-inventory-purchase-updated', refresh);
      window.removeEventListener('rtw-import-state-updated', refresh);
    };
  }, [actorEmail]);

  // ================= FILTERS & SELECTED ITEMS =================
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedSkuForEdit, setSelectedSkuForEdit] = useState<string>('AUD-TWS-001-NEG');
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [featuresInput, setFeaturesInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');

  // ================= SUPPLIER FORM =================
  const [supForm, setSupForm] = useState({
    supplierCode: '',
    legalName: '',
    contactName: '',
    taxId: '',
    phone: '',
    email: '',
    city: '',
    address: '',
    referenceCodesText: '',
    notes: ''
  });

  // ================= PURCHASE ORDER FORM (ownerId starts EMPTY — never auto-assign Eberto) =================
  const [poForm, setPoForm] = useState({
    orderNumber: 'PO-2026-0001',
    orderDate: '2026-11-13',
    supplierId: 'SUP-0001',
    invoiceReference: '',
    sku: 'AUD-TWS-001-NEG',
    ownerId: '', // Regla: Nunca autoasignar propietario futuro
    qtyOrdered: 5,
    unitPurchaseCostCop: '',
    inboundShippingCop: '0',
    documentUrl: '',
    notes: ''
  });

  // ================= RECEPTION FORM (ownerId starts EMPTY — never auto-assign Eberto) =================
  const [recForm, setRecForm] = useState({
    orderNumber: '',
    lineNumber: 1,
    lotId: 'LOT-REC-2026-01',
    ownerId: '', // Regla: Nunca autoasignar propietario futuro
    storageBin: 'ESTANTE-A1',
    qtyReceivedNow: 1,
    qtyGood: 1,
    qtyDefective: 0,
    qtyPendingInspection: 0,
    unitPurchaseCostCop: '',
    evidenceUrl: '',
    inspectorName: 'Operador Bodega',
    notes: ''
  });

  // ================= TRANSACTIONAL INVENTORY OPERATION FORM =================
  const [selectedAllocId, setSelectedAllocId] = useState<string>('');
  const [opType, setOpType] = useState<
    | 'QUALITY_INSPECT'
    | 'RESERVE'
    | 'RELEASE_RESERVATION'
    | 'DISPATCH'
    | 'CUSTOMER_RETURN'
    | 'TRANSFER_OWNERSHIP'
    | 'ADJUSTMENT'
  >('QUALITY_INSPECT');
  const [opQty, setOpQty] = useState<number>(1);
  const [opQtyDefective, setOpQtyDefective] = useState<number>(0);
  const [opRefCode, setOpRefCode] = useState<string>('REF-OP-001');
  const [opReason, setOpReason] = useState<string>(
    'Inspección funcional aprobada en banco de pruebas'
  );
  const [opToOwnerId, setOpToOwnerId] = useState<string>('');
  const [opReservationId, setOpReservationId] = useState<string>('');
  const [opReturnCondition, setOpReturnCondition] = useState<'good_restock' | 'defective'>(
    'good_restock'
  );

  // ================= REPORTS & TESTS =================
  const [activeReportType, setActiveReportType] = useState<
    'BY_SKU' | 'BY_CATEGORY' | 'BY_OWNER' | 'BY_LOT' | 'BY_SUPPLIER' | 'BY_QUALITY'
  >('BY_SKU');
  const [testResults, setTestResults] = useState<InventoryTestScenarioResult[]>([]);

  const catalogList = useMemo(() => Object.values(store.catalog), [store.catalog]);
  const categoriesList = useMemo(
    () => Array.from(new Set(catalogList.map((c) => c.category))).sort(),
    [catalogList]
  );

  const filteredCatalog = useMemo(() => {
    return catalogList.filter((item) => {
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return (
          item.sku.toLowerCase().includes(q) ||
          item.productName.toLowerCase().includes(q) ||
          item.productCode.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [catalogList, categoryFilter, searchQuery]);

  const filteredAllocations = useMemo(() => {
    return store.allocations.filter((a) => {
      if (selectedOwnerScope !== 'ALL' && a.ownerId !== selectedOwnerScope) return false;
      if (categoryFilter !== 'ALL' && a.category !== categoryFilter) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return (
          a.sku.toLowerCase().includes(q) ||
          a.productName.toLowerCase().includes(q) ||
          a.lotId.toLowerCase().includes(q) ||
          a.ownerId.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [store.allocations, selectedOwnerScope, categoryFilter, searchQuery]);

  useEffect(() => {
    if (
      filteredAllocations.length > 0 &&
      (!selectedAllocId || !filteredAllocations.some((a) => a.id === selectedAllocId))
    ) {
      setSelectedAllocId(filteredAllocations[0].id);
    } else if (filteredAllocations.length === 0 && selectedAllocId !== '') {
      setSelectedAllocId('');
    }
  }, [filteredAllocations, selectedAllocId]);

  const selectedCatalogItem: ProductVariantCatalogItem | undefined =
    store.catalog[selectedSkuForEdit] || catalogList[0];

  useEffect(() => {
    setFeaturesInput(selectedCatalogItem?.verifiedFeatures ?? '');
    setDescriptionInput(selectedCatalogItem?.description ?? '');
  }, [selectedCatalogItem?.sku, selectedCatalogItem?.verifiedFeatures, selectedCatalogItem?.description]);

  const selectedAllocation: LotOwnerAllocationRecord | undefined =
    filteredAllocations.find((a) => a.id === selectedAllocId) || filteredAllocations[0];

  const activeReservationsForSelectedAlloc = useMemo(
    () =>
      selectedAllocation
        ? store.reservations.filter(
            (r) => r.lotAllocationId === selectedAllocation.id && r.status === 'active'
          )
        : [],
    [store.reservations, selectedAllocation]
  );

  useEffect(() => {
    if (opType === 'RELEASE_RESERVATION') {
      setOpReservationId(activeReservationsForSelectedAlloc[0]?.id ?? '');
    } else {
      setOpReservationId('');
    }
  }, [selectedAllocation?.id, opType, activeReservationsForSelectedAlloc]);

  useEffect(() => {
    setOpToOwnerId('');
  }, [selectedAllocation?.id, opType]);

  const filteredPurchaseOrders = useMemo(() => {
    if (selectedOwnerScope === 'ALL') return store.purchaseOrders;
    return store.purchaseOrders.filter((po) =>
      po.lines.some((ln) => ln.ownerId === selectedOwnerScope)
    );
  }, [store.purchaseOrders, selectedOwnerScope]);

  const filteredMovements = useMemo(() => {
    if (selectedOwnerScope === 'ALL') return store.movements;
    return store.movements.filter((m) => m.ownerId === selectedOwnerScope);
  }, [store.movements, selectedOwnerScope]);

  const kpis = useMemo(() => {
    let physical = 0;
    let good = 0;
    let defective = 0;
    let pending = 0;
    let reserved = 0;
    let available = 0;
    let totalCostCop = 0;

    for (const a of filteredAllocations) {
      physical += a.qtyPhysical;
      good += a.qtyGood;
      defective += a.qtyDefective;
      pending += a.qtyPendingInspection;
      reserved += a.qtyReserved;
      available += a.qtyAvailable;
      if (a.effectiveUnitCostCop !== null) {
        totalCostCop += a.effectiveUnitCostCop * a.qtyPhysical;
      }
    }
    return {
      totalSkus: catalogList.length,
      activeLots: filteredAllocations.length,
      physical,
      good,
      defective,
      pending,
      reserved,
      available,
      totalCostCop
    };
  }, [filteredAllocations, catalogList.length]);

  const reports = useMemo(
    () => buildInventoryReports(store, selectedOwnerScope),
    [store, selectedOwnerScope]
  );

  // ================= HANDLERS =================
  const handleSaveProductMetadata = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteInventory) {
      notify('error', 'Permiso denegado', `El rol ${effectiveRole} es de solo lectura para catálogo.`);
      return;
    }
    if (!selectedCatalogItem || isSubmitting) return;
    setIsSubmitting(true);
    try {
      updateProductVariantCatalogItem(
        selectedCatalogItem.sku,
        {
          verifiedFeatures: featuresInput,
          description: descriptionInput,
          photoUrlToAdd: photoUrlInput
        },
        actorEmail
      );
      setPhotoUrlInput('');
      setStore(getInventoryPurchaseState());
      notify(
        'success',
        `Ficha técnica actualizada (${selectedCatalogItem.sku})`,
        'Se registraron las características, fotografías e historial del producto.'
      );
    } catch (err) {
      notify('error', 'Error actualizando producto', err instanceof Error ? err.message : '');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteInventory) {
      notify('error', 'Permiso denegado', `El rol ${effectiveRole} no puede modificar proveedores.`);
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const saved = registerOrUpdateSupplier(
        {
          supplierCode: supForm.supplierCode,
          legalName: supForm.legalName,
          contactName: supForm.contactName,
          taxId: supForm.taxId,
          phone: supForm.phone,
          email: supForm.email,
          city: supForm.city,
          address: supForm.address,
          referenceCodes: supForm.referenceCodesText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          notes: supForm.notes
        },
        actorEmail
      );
      setStore(getInventoryPurchaseState());
      notify(
        'success',
        `Proveedor ${saved.supplierCode} guardado`,
        `Se registró ${saved.legalName} con trazabilidad en historial.`
      );
    } catch (err) {
      notify('error', 'Error en registro de proveedor', err instanceof Error ? err.message : '');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreatePurchaseOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteInventory) {
      notify('error', 'Permiso denegado', `El rol ${effectiveRole} no puede crear órdenes de compra.`);
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const costVal =
        poForm.unitPurchaseCostCop.trim() === ''
          ? null
          : Number(poForm.unitPurchaseCostCop);
      const po = txCreatePurchaseOrder(
        {
          orderNumber: poForm.orderNumber,
          orderDate: poForm.orderDate,
          supplierId: poForm.supplierId,
          invoiceReference: poForm.invoiceReference,
          inboundShippingCop: Number(poForm.inboundShippingCop || 0),
          documentUrls: poForm.documentUrl.trim() ? [poForm.documentUrl.trim()] : [],
          notes: poForm.notes,
          lines: [
            {
              sku: poForm.sku,
              ownerId: poForm.ownerId,
              qtyOrdered: Number(poForm.qtyOrdered),
              unitPurchaseCostCop: costVal
            }
          ]
        },
        actorEmail
      );
      setStore(getInventoryPurchaseState());
      const line1Cost = po.lines[0]?.unitPurchaseCostCop;
      setRecForm((prev) => ({
        ...prev,
        orderNumber: po.orderNumber,
        lineNumber: 1,
        unitPurchaseCostCop: line1Cost !== null && line1Cost !== undefined ? String(line1Cost) : '',
        ownerId: '' // Mantiene vacío para obligar selección explícita también en recepción
      }));
      notify(
        'success',
        `Orden de compra ${po.orderNumber} creada`,
        `Estado inicial: ${po.status}. Lista para recepción parcial o completa.`
      );
    } catch (err) {
      notify(
        'error',
        'Orden de compra rechazada',
        err instanceof Error ? err.message : 'Verifique los campos obligatorios'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecutePurchaseReception = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteInventory) {
      notify('error', 'Permiso denegado', `El rol ${effectiveRole} no puede ejecutar recepciones.`);
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const idempKey = `IDEMP-REC-${recForm.orderNumber}-${recForm.lineNumber}-${recForm.lotId}-${receptionNonce}`;
      const costVal =
        recForm.unitPurchaseCostCop.trim() === ''
          ? null
          : Number(recForm.unitPurchaseCostCop);
      const res = txReceivePurchaseOrderLine(
        {
          idempotencyKey: idempKey,
          orderNumber: recForm.orderNumber,
          lineNumber: Number(recForm.lineNumber),
          lotId: recForm.lotId,
          ownerId: recForm.ownerId,
          storageBin: recForm.storageBin,
          qtyReceivedNow: Number(recForm.qtyReceivedNow),
          qtyGood: Number(recForm.qtyGood),
          qtyDefective: Number(recForm.qtyDefective),
          qtyPendingInspection: Number(recForm.qtyPendingInspection),
          unitPurchaseCostCop: costVal,
          evidenceUrls: recForm.evidenceUrl.trim() ? [recForm.evidenceUrl.trim()] : [],
          inspectorName: recForm.inspectorName,
          notes: recForm.notes
        },
        actorEmail
      );
      setStore(getInventoryPurchaseState());
      setReceptionNonce(`${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      notify(
        'success',
        `Recepción confirmada (${res.order.status})`,
        `Lote ${res.allocation.lotId} asignado a ${res.allocation.ownerId} con movimiento inmutable ${res.movement.movementType}.`
      );
    } catch (err) {
      notify(
        'error',
        'Recepción rechazada por reglas de negocio',
        err instanceof Error ? err.message : 'Error de validación'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecuteInventoryOperation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteInventory) {
      notify('error', 'Permiso denegado', `El rol ${effectiveRole} es de solo lectura en operaciones de inventario.`);
      return;
    }
    if (opType === 'TRANSFER_OWNERSHIP' && !canTransferOwnership) {
      notify('error', 'Operación exclusiva de ADMIN', 'Solo ADMIN puede transferir propiedad de lotes entre dueños.');
      return;
    }
    if (!selectedAllocation || isSubmitting) return;
    setIsSubmitting(true);

    const idempKey = `IDEMP-OP-${opType}-${selectedAllocation.id}-V${selectedAllocation.lockVersion}-${opNonce}`;
    try {
      if (opType === 'QUALITY_INSPECT') {
        const res = txInspectQualityAllocation(
          {
            idempotencyKey: idempKey,
            lotAllocationId: selectedAllocation.id,
            qtyToInspect: opQty + opQtyDefective,
            qtyApprovedGood: opQty,
            qtyMarkedDefective: opQtyDefective,
            inspectorName: actorEmail,
            notes: opReason
          },
          actorEmail
        );
        notify(
          'success',
          `Calidad verificada en ${res.allocation.sku}`,
          `Disponible comercial actualizado a ${res.allocation.qtyAvailable} unidades (lockVersion=${res.allocation.lockVersion}).`
        );
      } else if (opType === 'RESERVE') {
        const res = txReserveStock(
          {
            idempotencyKey: idempKey,
            lotAllocationId: selectedAllocation.id,
            qtyToReserve: opQty,
            salesOrderRef: opRefCode,
            reason: opReason,
            expectedLockVersion: selectedAllocation.lockVersion
          },
          actorEmail
        );
        setOpReservationId(res.reservation.id);
        notify(
          'success',
          `Reserva ${res.reservation.reservationCode} activa`,
          `Se reservaron ${opQty} unid. Disponible restante: ${res.allocation.qtyAvailable}.`
        );
      } else if (opType === 'RELEASE_RESERVATION') {
        const targetResId =
          opReservationId ||
          activeReservationsForSelectedAlloc[0]?.id ||
          '';
        const res = txReleaseStockReservation(
          {
            idempotencyKey: idempKey,
            reservationId: targetResId,
            reason: opReason
          },
          actorEmail
        );
        notify(
          'success',
          `Reserva ${res.reservation.reservationCode} liberada`,
          `Stock disponible restaurado a ${res.allocation.qtyAvailable} unidades.`
        );
      } else if (opType === 'DISPATCH') {
        const res = txDispatchStock(
          {
            idempotencyKey: idempKey,
            lotAllocationId: selectedAllocation.id,
            qtyToDispatch: opQty,
            dispatchReference: opRefCode,
            expectedLockVersion: selectedAllocation.lockVersion,
            reason: opReason
          },
          actorEmail
        );
        notify(
          'success',
          `Despacho ${res.movement.referenceId} confirmado`,
          `Se descontaron ${opQty} unid. de ${res.allocation.sku} (${res.allocation.ownerId}). Stock físico: ${res.allocation.qtyPhysical}.`
        );
      } else if (opType === 'CUSTOMER_RETURN') {
        const res = txProcessCustomerReturn(
          {
            idempotencyKey: idempKey,
            lotAllocationId: selectedAllocation.id,
            qtyReturned: opQty,
            returnCondition: opReturnCondition,
            returnReference: opRefCode,
            reason: opReason
          },
          actorEmail
        );
        notify(
          'success',
          `Devolución registrada (${res.movement.movementType})`,
          `Stock físico en lote ${res.allocation.lotId}: ${res.allocation.qtyPhysical} unidades.`
        );
      } else if (opType === 'TRANSFER_OWNERSHIP') {
        const res = txTransferOwnership(
          {
            idempotencyKey: idempKey,
            sourceAllocationId: selectedAllocation.id,
            toOwnerId: opToOwnerId,
            qtyToTransfer: opQty,
            reason: opReason
          },
          actorEmail
        );
        notify(
          'success',
          `Transferencia ${res.transfer.transferCode} completada`,
          `${opQty} unid. transferidas de ${res.transfer.fromOwnerId} a ${res.transfer.toOwnerId} con movimientos transfer_out y transfer_in.`
        );
      } else if (opType === 'ADJUSTMENT') {
        const res = txRecordInventoryAdjustment(
          {
            idempotencyKey: idempKey,
            lotAllocationId: selectedAllocation.id,
            deltaGood: opQty,
            deltaDefective: opQtyDefective,
            deltaPending: 0,
            reason: opReason
          },
          actorEmail
        );
        notify(
          'success',
          `Ajuste conciliado registrado (${res.movement.referenceId})`,
          `Saldos actualizados sin borrar movimientos pasados.`
        );
      }

      setStore(getInventoryPurchaseState());
      setOpNonce(`${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    } catch (err) {
      notify(
        'error',
        'Operación transaccional bloqueada (ROLLBACK)',
        err instanceof Error ? err.message : 'Error de validación'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRun9Tests = () => {
    const results = runInventoryPurchaseTestSuite(actorEmail);
    setTestResults(results);
    const passed = results.filter((r) => r.passed).length;
    notify(
      passed === results.length ? 'success' : 'error',
      `Suite de 9 Pruebas Ejecutada (${passed}/${results.length} Aprobadas)`,
      'Ejecutada en sandbox aislado sin introducir registros ficticios en producción ni alterar saldos históricos.'
    );
  };

  const handleExportCurrentReportCsv = () => {
    if (activeReportType === 'BY_SKU') {
      exportRowsToCsvUtf8(
        'REAL_TWS_REPORTE_POR_SKU.csv',
        [
          'SKU',
          'Producto',
          'Categoria',
          'Propietarios',
          'Lotes',
          'Fisico',
          'Apto',
          'Defectuoso',
          'Pendiente',
          'Reservado',
          'Disponible',
          'Valorizacion_COP'
        ],
        reports.bySku.map((r) => [
          r.sku,
          r.productName,
          r.category,
          r.ownersList,
          r.lotsCount,
          r.qtyPhysical,
          r.qtyGood,
          r.qtyDefective,
          r.qtyPending,
          r.qtyReserved,
          r.qtyAvailable,
          r.valuationCop
        ])
      );
    } else if (activeReportType === 'BY_CATEGORY') {
      exportRowsToCsvUtf8(
        'REAL_TWS_REPORTE_POR_CATEGORIA.csv',
        ['Categoria', 'SKUs', 'Lotes', 'Fisico', 'Apto', 'Defectuoso', 'Pendiente', 'Reservado', 'Disponible', 'Valorizacion_COP'],
        reports.byCategory.map((c) => [
          c.category,
          c.skusCount,
          c.lotsCount,
          c.qtyPhysical,
          c.qtyGood,
          c.qtyDefective,
          c.qtyPending,
          c.qtyReserved,
          c.qtyAvailable,
          c.valuationCop
        ])
      );
    } else if (activeReportType === 'BY_OWNER') {
      exportRowsToCsvUtf8(
        'REAL_TWS_REPORTE_POR_PROPIETARIO.csv',
        ['ID_Propietario', 'Nombre', 'SKUs', 'Lotes', 'Fisico', 'Apto', 'Defectuoso', 'Pendiente', 'Reservado', 'Disponible', 'Valorizacion_COP'],
        reports.byOwner.map((o) => [
          o.ownerId,
          o.ownerName,
          o.distinctSkus,
          o.lotsCount,
          o.qtyPhysical,
          o.qtyGood,
          o.qtyDefective,
          o.qtyPending,
          o.qtyReserved,
          o.qtyAvailable,
          o.valuationCop
        ])
      );
    } else if (activeReportType === 'BY_LOT') {
      exportRowsToCsvUtf8(
        'REAL_TWS_REPORTE_POR_LOTE.csv',
        ['ID_Lote', 'Asignacion', 'SKU', 'Producto', 'Propietario', 'Proveedor', 'Fisico', 'Apto', 'Defectuoso', 'Pendiente', 'Reservado', 'Disponible', 'Costo_Unit_COP', 'Estado_Conciliacion'],
        reports.byLot.map((l) => [
          l.lotId,
          l.allocationCode,
          l.sku,
          l.productName,
          l.ownerId,
          l.supplierName,
          l.qtyPhysical,
          l.qtyGood,
          l.qtyDefective,
          l.qtyPendingInspection,
          l.qtyReserved,
          l.qtyAvailable,
          l.effectiveUnitCostCop,
          l.reconciliationState
        ])
      );
    } else if (activeReportType === 'BY_SUPPLIER') {
      exportRowsToCsvUtf8(
        'REAL_TWS_REPORTE_POR_PROVEEDOR.csv',
        ['Codigo', 'Proveedor', 'Ordenes_Compra', 'Lotes_Asociados', 'Unid_Fisicas', 'Unid_Disponibles', 'Valorizacion_COP'],
        reports.bySupplier.map((s) => [
          s.supplierCode,
          s.legalName,
          s.purchaseOrdersCount,
          s.lotsCount,
          s.qtyPhysical,
          s.qtyAvailable,
          s.valuationCop
        ])
      );
    } else {
      exportRowsToCsvUtf8(
        'REAL_TWS_REPORTE_POR_CALIDAD.csv',
        ['Estado_Conciliacion', 'Lotes', 'Unid_Fisicas', 'Unid_Aptas', 'Unid_Defectuosas', 'Unid_Pendientes', 'Unid_Reservadas', 'Unid_Disponibles'],
        reports.byQualityState.map((q) => [
          q.reconciliationState,
          q.lotsCount,
          q.qtyPhysical,
          q.qtyGood,
          q.qtyDefective,
          q.qtyPending,
          q.qtyReserved,
          q.qtyAvailable
        ])
      );
    }
  };

  const visibleTabs = [
    {
      id: 'PRODUCTS' as InventoryModuleSection,
      label: 'Productos',
      icon: <Package size={14} />,
      count: catalogList.length
    },
    ...(effectiveRole !== 'VIEWER'
      ? [
          {
            id: 'SUPPLIERS' as InventoryModuleSection,
            label: 'Proveedores',
            icon: <Building2 size={14} />,
            count: Object.keys(store.suppliers).length
          },
          {
            id: 'PURCHASES_RECEPTIONS' as InventoryModuleSection,
            label: 'Compras y Recepciones',
            icon: <Truck size={14} />,
            count: filteredPurchaseOrders.length
          },
          {
            id: 'INVENTORY_OPERATIONS' as InventoryModuleSection,
            label: 'Inventario',
            icon: <Boxes size={14} />,
            count: filteredAllocations.length
          },
          {
            id: 'MOVEMENTS_LEDGER' as InventoryModuleSection,
            label: 'Kardex',
            icon: <History size={14} />,
            count: filteredMovements.length
          },
          {
            id: 'REPORTS' as InventoryModuleSection,
            label: 'Reportes',
            icon: <BarChart3 size={14} />
          }
        ]
      : []),
    ...(canImportExcel
      ? [
          {
            id: 'EXCEL_IMPORT' as InventoryModuleSection,
            label: 'Importar',
            icon: <FileSpreadsheet size={14} />
          },
          {
            id: 'TESTS_9' as InventoryModuleSection,
            label: 'Diagnóstico',
            icon: <ShieldCheck size={14} />
          }
        ]
      : [])
  ];

  const effectiveActiveSection = visibleTabs.some((t) => t.id === activeSection)
    ? activeSection
    : 'PRODUCTS';

  return (
    <div className="module-container">
      {/* CABECERA EJECUTIVA */}
      <ModuleHeader
        variant="dark"
        eyebrow="OPERACIONES · CATÁLOGO Y STOCK"
        title="Productos, Compras e Inventario"
        subtitle={
          canWriteInventory
            ? 'Administra tu catálogo por variantes, proveedores, recepciones y stock disponible por lote.'
            : `Modo consulta (${effectiveRole}): visualización acotada sin permisos de escritura transaccional.`
        }
        actions={
          canWriteInventory ? (
            <button
              type="button"
              className="rtw-btn rtw-btn-gold btn-sm"
              disabled={isSyncingBaseline}
              onClick={async () => {
                setIsSyncingBaseline(true);
                const synced = await ensureExcelBaselineLoadedInInventory(actorEmail);
                setStore(synced);
                setIsSyncingBaseline(false);
                notify(
                  'info',
                  'Base sincronizada',
                  'Catálogo y lotes iniciales actualizados correctamente.'
                );
              }}
            >
              <RotateCcw size={14} />
              {isSyncingBaseline ? 'Sincronizando...' : 'Sincronizar base'}
            </button>
          ) : null
        }
        bottomSlot={
          <SegmentedTabs<InventoryModuleSection>
            variant="dark"
            value={effectiveActiveSection}
            onChange={setActiveSection}
            items={visibleTabs}
          />
        }
      />

      {/* KPIS DE INVENTARIO EN TIEMPO REAL */}
      <section className="rtw-kpi-grid">
        <StatCard
          staggerIndex={1}
          label="Stock Físico"
          value={`${formatInteger(kpis.physical)} u.`}
          sub={`${kpis.activeLots} asignaciones por lote`}
          icon={<Boxes size={16} />}
        />
        <StatCard
          staggerIndex={2}
          tone="success"
          label="Apto (Calidad OK)"
          value={`${formatInteger(kpis.good)} u.`}
          sub="Aprobadas en inspección"
          icon={<ClipboardCheck size={16} />}
        />
        <StatCard
          staggerIndex={3}
          tone="warning"
          label="En Revisión"
          value={`${formatInteger(kpis.pending)} u.`}
          sub="Pendientes de liberar"
          icon={<Lock size={16} />}
        />
        <StatCard
          staggerIndex={4}
          label="Defectuoso / Reservado"
          value={`${formatInteger(kpis.defective)} / ${formatInteger(kpis.reserved)}`}
          sub="No disponibles para venta"
          icon={<ArrowRightLeft size={16} />}
        />
        <StatCard
          staggerIndex={5}
          tone="gold"
          label="Disponible para Venta"
          value={`${formatInteger(kpis.available)} u.`}
          sub={`Valorizado: ${formatCOP(kpis.totalCostCop)}`}
          icon={<Package size={16} />}
        />
      </section>

      {/* =====================================================================
          SECCIÓN 1: PRODUCTOS (CATÁLOGO MAESTRO, VARIANTES, SKU, FOTOS, HISTORIAL)
         ===================================================================== */}
      {effectiveActiveSection === 'PRODUCTS' && (
        <div className="rtw-split-grid">
          <section className="rtw-card">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
                marginBottom: '12px'
              }}
            >
              <div>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>
                  Catálogo Maestro Universal y Variantes SKU ({filteredCatalog.length})
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--rtw-text-muted)' }}>
                  El producto maestro y el SKU son universales; un mismo SKU puede pertenecer a múltiples propietarios por lote.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Buscar SKU, nombre, categoría..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--rtw-border-light)',
                    fontSize: '0.79rem'
                  }}
                />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--rtw-border-light)',
                    fontSize: '0.79rem'
                  }}
                >
                  <option value="ALL">Todas las categorías ({categoriesList.length})</option>
                  {categoriesList.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <table className="rtw-table" style={{ width: '100%', fontSize: '0.78rem' }}>
                <thead>
                  <tr>
                    <th>Código Prod.</th>
                    <th>SKU Único</th>
                    <th>Categoría</th>
                    <th>Nombre / Variante</th>
                    <th>Fotos</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalog.map((item) => (
                    <tr
                      key={item.sku}
                      onClick={() => {
                        setSelectedSkuForEdit(item.sku);
                        setFeaturesInput(item.verifiedFeatures);
                        setDescriptionInput(item.description);
                      }}
                      style={{
                        cursor: 'pointer',
                        background:
                          selectedCatalogItem?.sku === item.sku
                            ? 'rgba(212, 175, 55, 0.14)'
                            : undefined
                      }}
                    >
                      <td>
                        <code>{item.productCode}</code>
                      </td>
                      <td style={{ fontWeight: 800 }}>
                        <code>{item.sku}</code>
                      </td>
                      <td>{item.category}</td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{item.productName}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--rtw-text-muted)' }}>
                          {item.brand} · {item.model} · Color: {item.color}
                        </div>
                      </td>
                      <td>{item.photoUrls.length} foto(s)</td>
                      <td>
                        <span className="rtw-badge rtw-badge-gold">
                          {item.status} ({item.excelOriginalStatus})
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rtw-card">
            {selectedCatalogItem ? (
              <form onSubmit={handleSaveProductMetadata} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>
                  Ficha Técnica, Fotografías e Historial — {selectedCatalogItem.sku}
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--rtw-text-secondary)' }}>
                  <strong>Producto:</strong> {selectedCatalogItem.productName} ({selectedCatalogItem.category})
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--rtw-text-muted)' }}>
                  Ref. Fabricante: {selectedCatalogItem.manufacturerRef || '—'} · Ref. Proveedor:{' '}
                  {selectedCatalogItem.supplierRef || '—'}
                </div>

                <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                  Características Verificadas:
                  <input
                    type="text"
                    value={featuresInput}
                    disabled={!canWriteInventory}
                    onChange={(e) => setFeaturesInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--rtw-border-light)',
                      marginTop: '4px'
                    }}
                  />
                </label>

                <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                  Descripción Técnica:
                  <input
                    type="text"
                    value={descriptionInput}
                    disabled={!canWriteInventory}
                    onChange={(e) => setDescriptionInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--rtw-border-light)',
                      marginTop: '4px'
                    }}
                  />
                </label>

                <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                  <Camera size={13} style={{ verticalAlign: 'middle' }} /> Agregar URL / Ruta de Fotografía Real:
                  <input
                    type="text"
                    placeholder="https://... o ruta en bucket catalog-public"
                    value={photoUrlInput}
                    disabled={!canWriteInventory}
                    onChange={(e) => setPhotoUrlInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--rtw-border-light)',
                      marginTop: '4px'
                    }}
                  />
                </label>

                {selectedCatalogItem.photoUrls.length > 0 && (
                  <div style={{ fontSize: '0.75rem', color: '#166534' }}>
                    Fotografías registradas: {selectedCatalogItem.photoUrls.join(', ')}
                  </div>
                )}

                <button
                  type="submit"
                  className="rtw-btn rtw-btn-primary"
                  disabled={!canWriteInventory || isSubmitting}
                >
                  {isSubmitting ? 'Guardando...' : 'Guardar Ficha y Registrar en Historial'}
                </button>

                <div style={{ marginTop: '10px', borderTop: '1px solid var(--rtw-border-light)', paddingTop: '10px' }}>
                  <h4 style={{ fontSize: '0.82rem', fontWeight: 800, marginBottom: '6px' }}>
                    Historial del SKU ({selectedCatalogItem.historyEvents.length})
                  </h4>
                  <ul style={{ paddingLeft: '16px', fontSize: '0.75rem', color: 'var(--rtw-text-secondary)' }}>
                    {selectedCatalogItem.historyEvents.map((ev, i) => (
                      <li key={i}>
                        <strong>{ev.action}</strong> ({ev.actor}): {ev.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              </form>
            ) : null}
          </section>
        </div>
      )}

      {/* =====================================================================
          SECCIÓN 2: PROVEEDORES (REGISTRO, CONTACTO, REFERENCIAS, COMPRAS, HISTORIAL)
         ===================================================================== */}
      {effectiveActiveSection === 'SUPPLIERS' && (
        <div className="rtw-split-grid">
          <section className="rtw-card">
            <h3 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '10px' }}>
              Directorio Auditado de Proveedores ({Object.keys(store.suppliers).length})
            </h3>
            <table className="rtw-table" style={{ width: '100%', fontSize: '0.79rem' }}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Razón Social / Proveedor</th>
                  <th>Contacto / Ciudad</th>
                  <th>Referencias</th>
                  <th>Órdenes Compra</th>
                  <th>Historial</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(store.suppliers).map((s) => {
                  const ordersCount = store.purchaseOrders.filter(
                    (po) => po.supplierId === s.id
                  ).length;
                  return (
                    <tr key={s.id}>
                      <td>
                        <span className="rtw-badge rtw-badge-gold">{s.supplierCode}</span>
                      </td>
                      <td style={{ fontWeight: 800 }}>{s.legalName}</td>
                      <td>
                        {s.contactName || '—'} · {s.city || '—'}
                      </td>
                      <td>{s.referenceCodes.join(', ') || '—'}</td>
                      <td style={{ fontWeight: 800 }}>{ordersCount}</td>
                      <td style={{ fontSize: '0.73rem', color: 'var(--rtw-text-secondary)' }}>
                        {s.historyEvents[0]?.detail || 'Activo'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="rtw-card">
            <h3 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '10px' }}>
              Registrar o Actualizar Proveedor Real
            </h3>
            <form onSubmit={handleSaveSupplier} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                type="text"
                placeholder="Código Proveedor (ej. SUP-0002)"
                value={supForm.supplierCode}
                onChange={(e) => setSupForm({ ...supForm, supplierCode: e.target.value })}
                required
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
              />
              <input
                type="text"
                placeholder="Razón Social / Nombre del Proveedor"
                value={supForm.legalName}
                onChange={(e) => setSupForm({ ...supForm, legalName: e.target.value })}
                required
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
              />
              <input
                type="text"
                placeholder="Nombre de Contacto y Teléfono"
                value={supForm.contactName}
                onChange={(e) => setSupForm({ ...supForm, contactName: e.target.value })}
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
              />
              <input
                type="text"
                placeholder="Códigos de Referencia (separados por coma)"
                value={supForm.referenceCodesText}
                onChange={(e) => setSupForm({ ...supForm, referenceCodesText: e.target.value })}
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
              />
              <input
                type="text"
                placeholder="Observaciones / Condiciones comerciales"
                value={supForm.notes}
                onChange={(e) => setSupForm({ ...supForm, notes: e.target.value })}
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
              />
              <button
                type="submit"
                className="rtw-btn rtw-btn-primary"
                disabled={!canWriteInventory || isSubmitting}
              >
                <Plus size={15} /> {isSubmitting ? 'Guardando...' : 'Guardar Proveedor'}
              </button>
            </form>
          </section>
        </div>
      )}

      {/* =====================================================================
          SECCIÓN 3: COMPRAS Y RECEPCIONES (ÓRDENES, CONTEO, CALIDAD, LOTES, PROPIETARIOS)
         ===================================================================== */}
      {effectiveActiveSection === 'PURCHASES_RECEPTIONS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: '16px' }}>
            {/* FORMULARIO 1: CREAR ORDEN DE COMPRA */}
            <section className="rtw-card">
              <h3 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '6px' }}>
                1. Crear Orden de Compra (Sin Autoasignar Propietario)
              </h3>
              <p style={{ fontSize: '0.76rem', color: 'var(--rtw-text-muted)', marginBottom: '10px' }}>
                El selector de propietario inicia vacío para exigir selección explícita en cada nueva compra.
              </p>
              <form onSubmit={handleCreatePurchaseOrder} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Nº Orden (ej. PO-2026-0001)"
                    value={poForm.orderNumber}
                    onChange={(e) => setPoForm({ ...poForm, orderNumber: e.target.value })}
                    required
                    style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
                  />
                  <input
                    type="date"
                    value={poForm.orderDate}
                    onChange={(e) => setPoForm({ ...poForm, orderDate: e.target.value })}
                    required
                    style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
                  />
                </div>

                <select
                  value={poForm.supplierId}
                  onChange={(e) => setPoForm({ ...poForm, supplierId: e.target.value })}
                  style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
                >
                  {Object.values(store.suppliers).map((s) => (
                    <option key={s.id} value={s.id}>
                      Proveedor: {s.supplierCode} — {s.legalName}
                    </option>
                  ))}
                </select>

                <select
                  value={poForm.sku}
                  onChange={(e) => setPoForm({ ...poForm, sku: e.target.value })}
                  style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
                >
                  {catalogList.map((c) => (
                    <option key={c.sku} value={c.sku}>
                      SKU: {c.sku} — {c.productName}
                    </option>
                  ))}
                </select>

                <select
                  value={poForm.ownerId}
                  onChange={(e) => setPoForm({ ...poForm, ownerId: e.target.value })}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: poForm.ownerId ? '1px solid #166534' : '2px solid #d4af37',
                    fontWeight: 700
                  }}
                >
                  <option value="">
                    -- Seleccione explícitamente el Propietario (Obligatorio) --
                  </option>
                  {store.owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.id} — {o.fullName}
                    </option>
                  ))}
                </select>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    Cantidad Ordenada:
                    <input
                      type="number"
                      min={1}
                      value={poForm.qtyOrdered}
                      onChange={(e) => setPoForm({ ...poForm, qtyOrdered: Number(e.target.value) })}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
                    />
                  </label>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    Costo Unitario Compra (COP):
                    <input
                      type="number"
                      min={0}
                      value={poForm.unitPurchaseCostCop}
                      onChange={(e) => setPoForm({ ...poForm, unitPurchaseCostCop: e.target.value })}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
                    />
                  </label>
                </div>

                <input
                  type="text"
                  placeholder="Referencia Factura / Documento Soporte"
                  value={poForm.invoiceReference}
                  onChange={(e) => setPoForm({ ...poForm, invoiceReference: e.target.value })}
                  style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
                />

                <button
                  type="submit"
                  className="rtw-btn rtw-btn-primary"
                  disabled={!canWriteInventory || isSubmitting}
                >
                  {isSubmitting ? 'Registrando...' : 'Registrar Orden de Compra'}
                </button>
              </form>
            </section>

            {/* FORMULARIO 2: RECEPCIÓN FÍSICA E INSPECCIÓN DE COMPRA */}
            <section className="rtw-card">
              <h3 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '6px' }}>
                2. Confirmar Recepción Física (Parcial o Completa) e Inspección
              </h3>
              <p style={{ fontSize: '0.76rem', color: 'var(--rtw-text-muted)', marginBottom: '10px' }}>
                Valida ecuación física (Recibido = Apto + Defectuoso + Pendiente), crea lote trazable y asigna al propietario seleccionado.
              </p>
              <form onSubmit={handleExecutePurchaseReception} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <select
                    value={recForm.orderNumber}
                    disabled={!canWriteInventory}
                    onChange={(e) => {
                      const nextOrderNum = e.target.value;
                      const matchedPo = store.purchaseOrders.find(
                        (po) => po.orderNumber === nextOrderNum
                      );
                      const firstLineCost = matchedPo?.lines[0]?.unitPurchaseCostCop;
                      setRecForm({
                        ...recForm,
                        orderNumber: nextOrderNum,
                        lineNumber: 1,
                        unitPurchaseCostCop:
                          firstLineCost !== null && firstLineCost !== undefined
                            ? String(firstLineCost)
                            : ''
                      });
                    }}
                    style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
                  >
                    <option value="">-- Seleccione Orden de Compra --</option>
                    {filteredPurchaseOrders.map((po) => (
                      <option key={po.orderNumber} value={po.orderNumber}>
                        {po.orderNumber} ({po.status}) — {po.lines[0]?.sku} ({po.lines[0]?.qtyReceived}/{po.lines[0]?.qtyOrdered})
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    placeholder="Código de Lote (ej. LOT-REC-2026-01)"
                    value={recForm.lotId}
                    disabled={!canWriteInventory}
                    onChange={(e) => setRecForm({ ...recForm, lotId: e.target.value })}
                    required
                    style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
                  />
                </div>

                <select
                  value={recForm.ownerId}
                  disabled={!canWriteInventory}
                  onChange={(e) => setRecForm({ ...recForm, ownerId: e.target.value })}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: recForm.ownerId ? '1px solid #166534' : '2px solid #d4af37',
                    fontWeight: 700
                  }}
                >
                  <option value="">
                    -- Confirmar Propietario del Lote Recibido (Obligatorio) --
                  </option>
                  {store.owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.id} — {o.fullName}
                    </option>
                  ))}
                </select>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                    Línea PO:
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={recForm.lineNumber}
                      disabled={!canWriteInventory}
                      onChange={(e) =>
                        setRecForm({
                          ...recForm,
                          lineNumber: Math.max(1, Number(e.target.value) || 1)
                        })
                      }
                      style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
                    />
                  </label>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                    Ubicación / Estante:
                    <input
                      type="text"
                      value={recForm.storageBin}
                      disabled={!canWriteInventory}
                      onChange={(e) => setRecForm({ ...recForm, storageBin: e.target.value })}
                      style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
                    />
                  </label>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                    Costo Unit. Compra (COP):
                    <input
                      type="number"
                      min={0}
                      placeholder="Vacío = PENDING_COST"
                      value={recForm.unitPurchaseCostCop}
                      disabled={!canWriteInventory}
                      onChange={(e) =>
                        setRecForm({ ...recForm, unitPurchaseCostCop: e.target.value })
                      }
                      style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
                    />
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                    Recibido Hoy:
                    <input
                      type="number"
                      min={1}
                      value={recForm.qtyReceivedNow}
                      disabled={!canWriteInventory}
                      onChange={(e) =>
                        setRecForm({ ...recForm, qtyReceivedNow: Number(e.target.value) })
                      }
                      style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
                    />
                  </label>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                    Cant. Apta:
                    <input
                      type="number"
                      min={0}
                      value={recForm.qtyGood}
                      disabled={!canWriteInventory}
                      onChange={(e) => setRecForm({ ...recForm, qtyGood: Number(e.target.value) })}
                      style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
                    />
                  </label>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                    Defectuosa:
                    <input
                      type="number"
                      min={0}
                      value={recForm.qtyDefective}
                      disabled={!canWriteInventory}
                      onChange={(e) =>
                        setRecForm({ ...recForm, qtyDefective: Number(e.target.value) })
                      }
                      style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
                    />
                  </label>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                    Pend. Revisión:
                    <input
                      type="number"
                      min={0}
                      value={recForm.qtyPendingInspection}
                      disabled={!canWriteInventory}
                      onChange={(e) =>
                        setRecForm({ ...recForm, qtyPendingInspection: Number(e.target.value) })
                      }
                      style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
                    />
                  </label>
                </div>

                <input
                  type="text"
                  placeholder="URL Evidencia Fotográfica / Acta de Recepción"
                  value={recForm.evidenceUrl}
                  disabled={!canWriteInventory}
                  onChange={(e) => setRecForm({ ...recForm, evidenceUrl: e.target.value })}
                  style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rtw-border-light)' }}
                />

                <button
                  type="submit"
                  className="rtw-btn rtw-btn-primary"
                  disabled={!canWriteInventory || isSubmitting}
                >
                  <ClipboardCheck size={15} />{' '}
                  {isSubmitting ? 'Procesando...' : 'Confirmar Recepción Transaccional'}
                </button>
              </form>
            </section>
          </div>

          {/* TABLA DE ÓRDENES DE COMPRA */}
          <section className="rtw-card">
            <h3 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '10px' }}>
              Órdenes de Compra Registradas ({filteredPurchaseOrders.length})
            </h3>
            {filteredPurchaseOrders.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--rtw-text-muted)' }}>
                No existen órdenes de compra adicionales posteriores al inventario físico inicial. Utilice el formulario superior para registrar una orden real.
              </p>
            ) : (
              <table className="rtw-table" style={{ width: '100%', fontSize: '0.79rem' }}>
                <thead>
                  <tr>
                    <th>Nº Orden</th>
                    <th>Fecha</th>
                    <th>Proveedor</th>
                    <th>SKU</th>
                    <th>Propietario</th>
                    <th>Ordenado vs Recibido</th>
                    <th>Costo Unitario</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchaseOrders.map((po) =>
                    po.lines
                      .filter(
                        (ln) => selectedOwnerScope === 'ALL' || ln.ownerId === selectedOwnerScope
                      )
                      .map((ln) => (
                        <tr key={ln.id}>
                          <td style={{ fontWeight: 800 }}>{po.orderNumber}</td>
                          <td>{po.orderDate}</td>
                          <td>{po.supplierName}</td>
                          <td>
                            <code>{ln.sku}</code> ({ln.productName})
                          </td>
                          <td>
                            <span className="rtw-badge rtw-badge-gold">{ln.ownerId}</span>
                          </td>
                          <td style={{ fontWeight: 800 }}>
                            {ln.qtyReceived} / {ln.qtyOrdered} unid.
                          </td>
                          <td>
                            {ln.unitPurchaseCostCop === null
                              ? 'PENDING_COST'
                              : formatCOP(ln.unitPurchaseCostCop)}
                          </td>
                          <td>
                            <span className="rtw-badge rtw-badge-success">{po.status}</span>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {/* =====================================================================
          SECCIÓN 4: INVENTARIO POR LOTE Y OPERACIONES TRANSACCIONALES
         ===================================================================== */}
      {effectiveActiveSection === 'INVENTORY_OPERATIONS' && (
        <div className="rtw-split-grid">
          <section className="rtw-card">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
                marginBottom: '12px'
              }}
            >
              <div>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>
                  Existencias Separadas por Lote y Propietario ({filteredAllocations.length})
                </h3>
                <p style={{ fontSize: '0.76rem', color: 'var(--rtw-text-muted)' }}>
                  Seleccione cualquier lote para ejecutar Inspección de Calidad, Reserva, Liberación, Despacho, Devolución, Transferencia o Ajuste.
                </p>
              </div>
              <input
                type="text"
                placeholder="Filtrar lote, SKU, producto, propietario..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--rtw-border-light)',
                  fontSize: '0.79rem',
                  minWidth: '230px'
                }}
              />
            </div>

            <div style={{ maxHeight: '520px', overflowY: 'auto' }}>
              <table className="rtw-table" style={{ width: '100%', fontSize: '0.76rem' }}>
                <thead>
                  <tr>
                    <th>Lote</th>
                    <th>SKU / Producto</th>
                    <th>Propietario</th>
                    <th>Físico</th>
                    <th>Apto</th>
                    <th>Defec.</th>
                    <th>Pend.</th>
                    <th>Reserv.</th>
                    <th>Disp.</th>
                    <th>Costo Unit.</th>
                    <th>Ver.</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAllocations.map((a) => (
                    <tr
                      key={a.id}
                      onClick={() => setSelectedAllocId(a.id)}
                      style={{
                        cursor: 'pointer',
                        background:
                          selectedAllocation?.id === a.id
                            ? 'rgba(212, 175, 55, 0.16)'
                            : undefined
                      }}
                    >
                      <td>
                        <code>{a.lotId}</code>
                      </td>
                      <td>
                        <div style={{ fontWeight: 800 }}>{a.sku}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--rtw-text-muted)' }}>
                          {a.productName}
                        </div>
                      </td>
                      <td>
                        <span className="rtw-badge rtw-badge-gold">{a.ownerId}</span>
                      </td>
                      <td style={{ fontWeight: 800 }}>{a.qtyPhysical}</td>
                      <td style={{ color: '#166534', fontWeight: 700 }}>{a.qtyGood}</td>
                      <td style={{ color: '#b91c1c' }}>{a.qtyDefective}</td>
                      <td style={{ color: '#b45309', fontWeight: 700 }}>
                        {a.qtyPendingInspection}
                      </td>
                      <td>{a.qtyReserved}</td>
                      <td style={{ fontWeight: 800 }}>{a.qtyAvailable}</td>
                      <td>
                        {a.effectiveUnitCostCop === null
                          ? 'PENDING_COST'
                          : formatCOP(a.effectiveUnitCostCop)}
                      </td>
                      <td>v{a.lockVersion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* CONSOLA DE OPERACIONES TRANSACCIONALES */}
          <section className="rtw-card">
            <h3 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '8px' }}>
              Consola de Procedimientos Transaccionales (Concurrencia e Idempotencia)
            </h3>
            {selectedAllocation ? (
              <form
                onSubmit={handleExecuteInventoryOperation}
                style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}
              >
                <div
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    background: 'var(--rtw-bg-subtle)',
                    border: '1px solid var(--rtw-border-light)',
                    fontSize: '0.78rem'
                  }}
                >
                  <div>
                    <strong>Lote Seleccionado:</strong> <code>{selectedAllocation.lotId}</code> (lockVersion={selectedAllocation.lockVersion})
                  </div>
                  <div>
                    <strong>SKU:</strong> {selectedAllocation.sku} — {selectedAllocation.productName}
                  </div>
                  <div>
                    <strong>Propietario:</strong> {selectedAllocation.ownerId} ({selectedAllocation.ownerName})
                  </div>
                  <div style={{ marginTop: '4px', fontWeight: 700 }}>
                    Físico: {selectedAllocation.qtyPhysical} · Apto: {selectedAllocation.qtyGood} ·
                    Pendiente: {selectedAllocation.qtyPendingInspection} · Reservado:{' '}
                    {selectedAllocation.qtyReserved} · Disponible: {selectedAllocation.qtyAvailable}
                  </div>
                </div>

                <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                  Procedimiento Transaccional a Ejecutar:
                  <select
                    value={opType}
                    onChange={(e) => setOpType(e.target.value as typeof opType)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid var(--rtw-border-light)',
                      marginTop: '4px',
                      fontWeight: 700
                    }}
                  >
                    <option value="QUALITY_INSPECT">
                      1. Inspección de Calidad (Liberar Pendiente a Apto / Defectuoso)
                    </option>
                    <option value="RESERVE">
                      2. Reservar Stock Disponible (reservation_hold)
                    </option>
                    <option value="RELEASE_RESERVATION">
                      3. Liberar / Cancelar Reserva Activa (reservation_release)
                    </option>
                    <option value="DISPATCH">
                      4. Despachar Mercancía (sale_dispatch con lockVersion)
                    </option>
                    <option value="CUSTOMER_RETURN">
                      5. Procesar Devolución de Cliente (customer_return)
                    </option>
                    {canTransferOwnership && (
                      <option value="TRANSFER_OWNERSHIP">
                        6. Transferir Propiedad entre Dueños (transfer_out / transfer_in)
                      </option>
                    )}
                    <option value="ADJUSTMENT">
                      7. Ajuste Conciliado de Inventario (reconciliation_adjustment)
                    </option>
                  </select>
                </label>

                {opType === 'RELEASE_RESERVATION' && (
                  <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    Reserva Activa a Liberar:
                    <select
                      value={opReservationId}
                      disabled={!canWriteInventory || activeReservationsForSelectedAlloc.length === 0}
                      onChange={(e) => setOpReservationId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '7px',
                        borderRadius: '6px',
                        border: '1px solid var(--rtw-border-light)',
                        marginTop: '4px'
                      }}
                    >
                      {activeReservationsForSelectedAlloc.length === 0 ? (
                        <option value="">-- Sin reservas activas en este lote --</option>
                      ) : (
                        activeReservationsForSelectedAlloc.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.reservationCode} · {r.qtyReserved} u. · Ref: {r.salesOrderRef}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                )}

                {opType !== 'RELEASE_RESERVATION' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                      {opType === 'QUALITY_INSPECT'
                        ? 'Unidades Aprobadas Aptas:'
                        : opType === 'ADJUSTMENT'
                          ? 'Delta Unidades Aptas (+/-):'
                          : 'Cantidad de Unidades:'}
                      <input
                        type="number"
                        value={opQty}
                        onChange={(e) => setOpQty(Number(e.target.value))}
                        style={{
                          width: '100%',
                          padding: '7px',
                          borderRadius: '6px',
                          border: '1px solid var(--rtw-border-light)'
                        }}
                      />
                    </label>

                    {(opType === 'QUALITY_INSPECT' || opType === 'ADJUSTMENT') && (
                      <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {opType === 'QUALITY_INSPECT'
                          ? 'Unidades Defectuosas:'
                          : 'Delta Defectuosas (+/-):'}
                        <input
                          type="number"
                          value={opQtyDefective}
                          onChange={(e) => setOpQtyDefective(Number(e.target.value))}
                          style={{
                            width: '100%',
                            padding: '7px',
                            borderRadius: '6px',
                            border: '1px solid var(--rtw-border-light)'
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}

                {opType === 'CUSTOMER_RETURN' && (
                  <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    Estado de la Unidad Devuelta:
                    <select
                      value={opReturnCondition}
                      onChange={(e) =>
                        setOpReturnCondition(e.target.value as 'good_restock' | 'defective')
                      }
                      style={{
                        width: '100%',
                        padding: '7px',
                        borderRadius: '6px',
                        border: '1px solid var(--rtw-border-light)'
                      }}
                    >
                      <option value="good_restock">Apta para reingreso (customer_return_restock)</option>
                      <option value="defective">Defectuosa / Garantía (customer_return_defective)</option>
                    </select>
                  </label>
                )}

                {opType === 'TRANSFER_OWNERSHIP' && (
                  <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    Propietario Destino (Explícito):
                    <select
                      value={opToOwnerId}
                      disabled={!canWriteInventory || !canTransferOwnership}
                      onChange={(e) => setOpToOwnerId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '7px',
                        borderRadius: '6px',
                        border: opToOwnerId ? '1px solid #166534' : '2px solid #d4af37',
                        marginTop: '4px'
                      }}
                    >
                      <option value="">-- Seleccione propietario destino --</option>
                      {store.owners
                        .filter((o) => o.id !== selectedAllocation.ownerId && o.status === 'active')
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.id} — {o.fullName}
                          </option>
                        ))}
                    </select>
                  </label>
                )}

                <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                  Documento / Referencia Operativa:
                  <input
                    type="text"
                    value={opRefCode}
                    disabled={!canWriteInventory}
                    onChange={(e) => setOpRefCode(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px',
                      borderRadius: '6px',
                      border: '1px solid var(--rtw-border-light)'
                    }}
                  />
                </label>

                <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                  Motivo Auditado Obligatorio:
                  <input
                    type="text"
                    value={opReason}
                    disabled={!canWriteInventory}
                    onChange={(e) => setOpReason(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '7px',
                      borderRadius: '6px',
                      border: '1px solid var(--rtw-border-light)'
                    }}
                  />
                </label>

                <button
                  type="submit"
                  className="rtw-btn rtw-btn-primary"
                  disabled={
                    !canWriteInventory ||
                    isSubmitting ||
                    (opType === 'RELEASE_RESERVATION' &&
                      activeReservationsForSelectedAlloc.length === 0)
                  }
                >
                  <ArrowRightLeft size={15} />{' '}
                  {isSubmitting ? 'Ejecutando...' : 'Ejecutar Transacción Atómica'}
                </button>
              </form>
            ) : null}
          </section>
        </div>
      )}

      {/* =====================================================================
          SECCIÓN 5: KARDEX INMUTABLE DE MOVIMIENTOS (stock_movements)
         ===================================================================== */}
      {effectiveActiveSection === 'MOVEMENTS_LEDGER' && (
        <section className="rtw-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Lock size={18} color="#d4af37" />
            <div>
              <h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>
                Libro Inmutable de Movimientos de Inventario (public.stock_movements — {filteredMovements.length})
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--rtw-text-muted)' }}>
                Regla Crítica: Append-only. Prohibido borrar o editar movimientos históricos. Toda corrección se realiza mediante nuevo movimiento compensatorio.
              </p>
            </div>
          </div>

          <div style={{ maxHeight: '520px', overflowY: 'auto' }}>
            <table className="rtw-table" style={{ width: '100%', fontSize: '0.77rem' }}>
              <thead>
                <tr>
                  <th>Seq</th>
                  <th>Tipo Movimiento</th>
                  <th>Lote</th>
                  <th>SKU</th>
                  <th>Propietario</th>
                  <th>Δ Físico</th>
                  <th>Δ Apto</th>
                  <th>Δ Defec.</th>
                  <th>Δ Pend.</th>
                  <th>Δ Reserv.</th>
                  <th>Saldo Disp. Post</th>
                  <th>Motivo / Idempotency Key</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.map((m) => (
                  <tr key={m.id}>
                    <td>#{m.movementSeq}</td>
                    <td>
                      <span className="rtw-badge rtw-badge-gold">{m.movementType}</span>
                    </td>
                    <td>
                      <code>{m.lotId}</code>
                    </td>
                    <td style={{ fontWeight: 800 }}>{m.sku}</td>
                    <td>{m.ownerId}</td>
                    <td style={{ fontWeight: 800 }}>{m.deltaPhysical}</td>
                    <td>{m.deltaGood}</td>
                    <td>{m.deltaDefective}</td>
                    <td>{m.deltaPending}</td>
                    <td>{m.deltaReserved}</td>
                    <td style={{ fontWeight: 800, color: '#166534' }}>
                      {m.balanceAvailableAfter}
                    </td>
                    <td style={{ fontSize: '0.72rem' }}>
                      <div>{m.reason}</div>
                      <code style={{ color: 'var(--rtw-text-muted)' }}>{m.idempotencyKey}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* =====================================================================
          SECCIÓN 6: LOS 6 REPORTES ANALÍTICOS OFICIALES
         ===================================================================== */}
      {effectiveActiveSection === 'REPORTS' && (
        <section className="rtw-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
              marginBottom: '14px'
            }}
          >
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'BY_SKU', label: '1. Por SKU' },
                { id: 'BY_CATEGORY', label: '2. Por Categoría' },
                { id: 'BY_OWNER', label: '3. Por Propietario' },
                { id: 'BY_LOT', label: '4. Por Lote' },
                { id: 'BY_SUPPLIER', label: '5. Por Proveedor' },
                { id: 'BY_QUALITY', label: '6. Por Estado de Calidad' }
              ].map((rep) => (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => setActiveReportType(rep.id as typeof activeReportType)}
                  className={
                    activeReportType === rep.id
                      ? 'rtw-btn rtw-btn-primary'
                      : 'rtw-btn rtw-btn-outline'
                  }
                >
                  {rep.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleExportCurrentReportCsv}
              className="rtw-btn rtw-btn-outline"
            >
              <Download size={14} /> Exportar Reporte (.CSV UTF-8)
            </button>
          </div>

          {activeReportType === 'BY_SKU' && (
            <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
              <table className="rtw-table" style={{ width: '100%', fontSize: '0.78rem' }}>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th>Propietarios</th>
                    <th>Lotes</th>
                    <th>Físico</th>
                    <th>Apto</th>
                    <th>Defectuoso</th>
                    <th>Pendiente</th>
                    <th>Reservado</th>
                    <th>Disponible</th>
                    <th>Valorización Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.bySku.map((r) => (
                    <tr key={r.sku}>
                      <td style={{ fontWeight: 800 }}>
                        <code>{r.sku}</code>
                      </td>
                      <td>{r.productName}</td>
                      <td>{r.category}</td>
                      <td>{r.ownersList}</td>
                      <td>{r.lotsCount}</td>
                      <td style={{ fontWeight: 800 }}>{r.qtyPhysical}</td>
                      <td>{r.qtyGood}</td>
                      <td>{r.qtyDefective}</td>
                      <td>{r.qtyPending}</td>
                      <td>{r.qtyReserved}</td>
                      <td style={{ fontWeight: 800 }}>{r.qtyAvailable}</td>
                      <td>
                        {r.hasPendingCost && r.valuationCop === 0
                          ? 'PENDING_COST'
                          : formatCOP(r.valuationCop)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeReportType === 'BY_CATEGORY' && (
            <table className="rtw-table" style={{ width: '100%', fontSize: '0.79rem' }}>
              <thead>
                <tr>
                  <th>Categoría</th>
                  <th>SKUs</th>
                  <th>Lotes</th>
                  <th>Físico</th>
                  <th>Apto</th>
                  <th>Defectuoso</th>
                  <th>Pendiente</th>
                  <th>Reservado</th>
                  <th>Disponible</th>
                  <th>Valorización Costo</th>
                </tr>
              </thead>
              <tbody>
                {reports.byCategory.map((c) => (
                  <tr key={c.category}>
                    <td style={{ fontWeight: 800 }}>{c.category}</td>
                    <td>{c.skusCount}</td>
                    <td>{c.lotsCount}</td>
                    <td style={{ fontWeight: 800 }}>{c.qtyPhysical}</td>
                    <td>{c.qtyGood}</td>
                    <td>{c.qtyDefective}</td>
                    <td>{c.qtyPending}</td>
                    <td>{c.qtyReserved}</td>
                    <td style={{ fontWeight: 800 }}>{c.qtyAvailable}</td>
                    <td>{formatCOP(c.valuationCop)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeReportType === 'BY_OWNER' && (
            <table className="rtw-table" style={{ width: '100%', fontSize: '0.79rem' }}>
              <thead>
                <tr>
                  <th>ID Propietario</th>
                  <th>Nombre</th>
                  <th>SKUs Asociados</th>
                  <th>Lotes</th>
                  <th>Físico</th>
                  <th>Apto</th>
                  <th>Defectuoso</th>
                  <th>Pendiente</th>
                  <th>Reservado</th>
                  <th>Disponible</th>
                  <th>Costo Total Inventario</th>
                </tr>
              </thead>
              <tbody>
                {reports.byOwner.map((o) => (
                  <tr key={o.ownerId}>
                    <td>
                      <span className="rtw-badge rtw-badge-gold">{o.ownerId}</span>
                    </td>
                    <td style={{ fontWeight: 800 }}>{o.ownerName}</td>
                    <td>{o.distinctSkus}</td>
                    <td>{o.lotsCount}</td>
                    <td style={{ fontWeight: 800 }}>{o.qtyPhysical}</td>
                    <td>{o.qtyGood}</td>
                    <td>{o.qtyDefective}</td>
                    <td>{o.qtyPending}</td>
                    <td>{o.qtyReserved}</td>
                    <td style={{ fontWeight: 800 }}>{o.qtyAvailable}</td>
                    <td>{formatCOP(o.valuationCop)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeReportType === 'BY_LOT' && (
            <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
              <table className="rtw-table" style={{ width: '100%', fontSize: '0.78rem' }}>
                <thead>
                  <tr>
                    <th>ID Lote</th>
                    <th>Asignación</th>
                    <th>SKU</th>
                    <th>Propietario</th>
                    <th>Origen</th>
                    <th>Físico</th>
                    <th>Apto</th>
                    <th>Defec.</th>
                    <th>Pend.</th>
                    <th>Disp.</th>
                    <th>Costo Unitario</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.byLot.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <code>{l.lotId}</code>
                      </td>
                      <td>{l.allocationCode}</td>
                      <td style={{ fontWeight: 800 }}>{l.sku}</td>
                      <td>{l.ownerId}</td>
                      <td>{l.lotOrigin}</td>
                      <td style={{ fontWeight: 800 }}>{l.qtyPhysical}</td>
                      <td>{l.qtyGood}</td>
                      <td>{l.qtyDefective}</td>
                      <td>{l.qtyPendingInspection}</td>
                      <td style={{ fontWeight: 800 }}>{l.qtyAvailable}</td>
                      <td>
                        {l.effectiveUnitCostCop === null
                          ? 'PENDING_COST'
                          : formatCOP(l.effectiveUnitCostCop)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeReportType === 'BY_SUPPLIER' && (
            <table className="rtw-table" style={{ width: '100%', fontSize: '0.79rem' }}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Proveedor</th>
                  <th>Órdenes de Compra</th>
                  <th>Lotes Asociados</th>
                  <th>Unidades Físicas</th>
                  <th>Unidades Disponibles</th>
                  <th>Valorización Costo</th>
                </tr>
              </thead>
              <tbody>
                {reports.bySupplier.map((s) => (
                  <tr key={s.supplierId}>
                    <td>
                      <span className="rtw-badge rtw-badge-gold">{s.supplierCode}</span>
                    </td>
                    <td style={{ fontWeight: 800 }}>{s.legalName}</td>
                    <td>{s.purchaseOrdersCount}</td>
                    <td>{s.lotsCount}</td>
                    <td style={{ fontWeight: 800 }}>{s.qtyPhysical}</td>
                    <td>{s.qtyAvailable}</td>
                    <td>{formatCOP(s.valuationCop)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeReportType === 'BY_QUALITY' && (
            <table className="rtw-table" style={{ width: '100%', fontSize: '0.79rem' }}>
              <thead>
                <tr>
                  <th>Estado de Conciliación / Calidad</th>
                  <th>Lotes</th>
                  <th>Unid. Físicas</th>
                  <th>Unid. Aptas</th>
                  <th>Unid. Defectuosas</th>
                  <th>Unid. Pendientes Revisión</th>
                  <th>Unid. Reservadas</th>
                  <th>Unid. Disponibles</th>
                </tr>
              </thead>
              <tbody>
                {reports.byQualityState.map((q) => (
                  <tr key={q.reconciliationState}>
                    <td style={{ fontWeight: 800 }}>
                      <code>{q.reconciliationState}</code>
                    </td>
                    <td>{q.lotsCount}</td>
                    <td style={{ fontWeight: 800 }}>{q.qtyPhysical}</td>
                    <td>{q.qtyGood}</td>
                    <td>{q.qtyDefective}</td>
                    <td>{q.qtyPending}</td>
                    <td>{q.qtyReserved}</td>
                    <td style={{ fontWeight: 800 }}>{q.qtyAvailable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* =====================================================================
          SECCIÓN 7: LAS 9 PRUEBAS OBLIGATORIAS EN SANDBOX AISLADO
         ===================================================================== */}
      {effectiveActiveSection === 'TESTS_9' && (
        <section className="rtw-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '14px'
            }}
          >
            <div>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 800 }}>
                Batería Automatizada de las 9 Pruebas Obligatorias (Sandbox en Memoria)
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--rtw-text-muted)' }}>
                Verifica recepción parcial, recepción completa, defectuosos, dos propietarios con mismo SKU, venta de última unidad concurrente, reserva cancelada, devolución, transferencia de propiedad y ajuste sin introducir datos ficticios en producción.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRun9Tests}
              className="rtw-btn rtw-btn-primary"
            >
              <Play size={15} /> Ejecutar las 9 Pruebas Obligatorias
            </button>
          </div>

          {testResults.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--rtw-text-muted)' }}>
              Haga clic en "Ejecutar las 9 Pruebas Obligatorias" para verificar todos los procedimientos transaccionales.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: '12px' }}>
              {testResults.map((tr) => (
                <div
                  key={tr.testId}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: tr.passed ? '1px solid #86efac' : '1px solid #fca5a5',
                    background: tr.passed ? 'var(--rtw-success-bg)' : 'var(--rtw-danger-bg)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--rtw-text-primary)' }}>
                      {tr.title}
                    </span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        background: tr.passed ? '#166534' : '#b91c1c',
                        color: '#ffffff'
                      }}
                    >
                      {tr.passed ? 'PASSED' : 'FAILED'}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--rtw-text-secondary)', marginBottom: '5px' }}>
                    {tr.scenario}
                  </p>
                  <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--rtw-text-primary)', marginBottom: '4px' }}>
                    Resultado: {tr.actual}
                  </div>
                  <ul style={{ paddingLeft: '16px', margin: 0, fontSize: '0.72rem', color: 'var(--rtw-text-secondary)' }}>
                    {tr.details.map((d, idx) => (
                      <li key={idx}>{d}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* =====================================================================
          SECCIÓN 8: MOTOR DE IMPORTACIÓN EXCEL INTEGRADO
         ===================================================================== */}
      {effectiveActiveSection === 'EXCEL_IMPORT' && <ExcelImportModule />}
    </div>
  );
}
