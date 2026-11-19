import { useState, useEffect, useMemo } from 'react';
import {
  ShoppingBag,
  UserCheck,
  MessageSquareHeart,
  PackageCheck,
  ShieldCheck,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Truck,
  CreditCard,
  Eye,
  EyeOff,
  Play,
  Download,
  Layers,
  TrendingUp
} from 'lucide-react';
import {
  type SalesOrdersCrmStoreState,
  type SalesOrderRecord,
  type CreateOrderLineDraftInput,
  type AcquisitionSourceChannel,
  type CrmLeadStage,
  type PaymentMethodType,
  type SalesCrmTestResult,
  getSalesOrdersCrmState,
  registerOrValidateCustomer,
  buildCustomerCommercialSummaries,
  createCrmLead,
  addLeadFollowupAndStage,
  convertLeadToCustomer,
  txCreateSalesOrder,
  txUpdateUnconfirmedSalesOrder,
  txReserveSalesOrderInventory,
  txConfirmSalesOrder,
  txRegisterOrderPayment,
  txPrepareSalesOrder,
  txDispatchSalesOrder,
  txDeliverSalesOrder,
  txCancelSalesOrder,
  txReturnSalesOrderAllocation,
  calculateOrderProfitability,
  maskProtectedPhone,
  maskProtectedAddress,
  runSalesOrdersCrmTestSuite
} from '../../services/salesOrdersCrmService';
import {
  ensureExcelBaselineLoadedInInventory,
  getInventoryPurchaseState,
  type InventoryPurchaseStoreState
} from '../../services/inventoryPurchaseService';
import { exportRowsToCsvUtf8 } from '../../utils/spreadsheetParser';
import { formatCOP } from '../../utils/formatters';
import { useAuth } from '../../hooks/useAuth';
import { useOwnerScope } from '../../hooks/useOwnerScope';
import { useNotifications } from '../../hooks/useNotifications';
import { ModuleHeader, SegmentedTabs, StatCard } from '../../components/glass';

export type CommercialSectionTab =
  | 'ORDERS'
  | 'CUSTOMERS'
  | 'CRM_PIPELINE'
  | 'SHIPMENTS'
  | 'TESTS_9';

interface SalesOrdersCrmModuleProps {
  initialTab?: CommercialSectionTab;
}

const LEAD_STAGES: Array<{ id: CrmLeadStage; label: string; badgeClass: string }> = [
  { id: 'new', label: '1. Nuevo Prospecto', badgeClass: 'badge-neutral' },
  { id: 'contacted', label: '2. Contactado', badgeClass: 'badge-gold' },
  { id: 'quoted', label: '3. Cotizado', badgeClass: 'badge-gold' },
  { id: 'negotiation', label: '4. En Negociación', badgeClass: 'badge-warning' },
  { id: 'won', label: '5. Ganado / Cliente', badgeClass: 'badge-success' },
  { id: 'lost', label: '6. Perdido', badgeClass: 'badge-danger' }
];

const SOURCE_LABELS: Record<AcquisitionSourceChannel, string> = {
  whatsapp: 'WhatsApp Directo',
  instagram: 'Instagram',
  facebook: 'Facebook',
  marketplace: 'Facebook Marketplace',
  walk_in: 'Tienda Física',
  referral: 'Referido',
  other: 'Otro Canal'
};

const ORDER_STATUS_LABELS: Record<SalesOrderRecord['status'], string> = {
  draft: 'BORRADOR (EDITABLE)',
  reserved: 'INVENTARIO RESERVADO',
  confirmed: 'CONFIRMADO',
  preparing: 'EN PREPARACIÓN / EMPAQUE',
  dispatched: 'DESPACHADO CON GUÍA',
  delivered: 'ENTREGADO',
  partially_returned: 'DEVOLUCIÓN PARCIAL',
  returned: 'DEVUELTO TOTAL',
  cancelled: 'CANCELADO (RESERVAS LIBERADAS)'
};

export function SalesOrdersCrmModule({ initialTab = 'ORDERS' }: SalesOrdersCrmModuleProps) {
  const { userProfile, activeEffectiveRole } = useAuth();
  const { selectedOwnerScope } = useOwnerScope();
  const { notify: rawNotify } = useNotifications();
  const notify = (
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'info'
  ) => rawNotify(type, 'Módulo Comercial y CRM', message);

  const [activeTab, setActiveTab] = useState<CommercialSectionTab>(initialTab);
  const [salesState, setSalesState] = useState<SalesOrdersCrmStoreState>(() =>
    getSalesOrdersCrmState()
  );
  const [invState, setInvState] = useState<InventoryPurchaseStoreState>(() =>
    getInventoryPurchaseState()
  );

  // Protección de datos personales y control de escritura por rol efectivo
  const effectiveRole = activeEffectiveRole || userProfile?.role || 'VIEWER';
  const isOwnerRole = effectiveRole === 'OWNER';
  const canWriteSales = effectiveRole === 'ADMIN' || effectiveRole === 'SALES_OPERATOR';
  const canWriteDispatch =
    effectiveRole === 'ADMIN' ||
    effectiveRole === 'SALES_OPERATOR' ||
    effectiveRole === 'INVENTORY_OPERATOR';
  const [revealPersonalData, setRevealPersonalData] = useState<boolean>(false);

  // Selector de pedido activo para la vista de Detalle y Rentabilidad
  const [selectedOrderId, setSelectedOrderId] = useState<string>(
    () => getSalesOrdersCrmState().orders[0]?.id || ''
  );
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal / Formulario de Crear o Editar Pedido
  const [showOrderBuilder, setShowOrderBuilder] = useState<boolean>(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [orderCustomerId, setOrderCustomerId] = useState<string>('');
  const [orderChannel, setOrderChannel] =
    useState<SalesOrderRecord['salesChannel']>('whatsapp');
  const [orderShippingCharged, setOrderShippingCharged] = useState<number>(0);
  const [orderShippingRealCost, setOrderShippingRealCost] = useState<number>(0);
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [orderReserveImmediately, setOrderReserveImmediately] = useState<boolean>(true);
  const [draftLines, setDraftLines] = useState<CreateOrderLineDraftInput[]>([]);

  // Formularios de acciones sobre el pedido seleccionado (Pago, Despacho, Cancelación, Devolución)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('nequi');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentStatusInput, setPaymentStatusInput] = useState<
    'pending' | 'confirmed' | 'refunded'
  >('confirmed');
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');

  const [carrierName, setCarrierName] = useState<string>('Interrapidísimo');
  const [trackingNumber, setTrackingNumber] = useState<string>('');
  const [dispatchShippingCost, setDispatchShippingCost] = useState<number>(0);
  const [dispatchNotes, setDispatchNotes] = useState<string>('');

  const [cancelReason, setCancelReason] = useState<string>('');

  const [returnAllocationId, setReturnAllocationId] = useState<string>('');
  const [returnQty, setReturnQty] = useState<number>(1);
  const [returnCondition, setReturnCondition] = useState<
    'good_restock' | 'defective_warranty' | 'pending_inspection'
  >('good_restock');
  const [returnReason, setReturnReason] = useState<string>('');

  // Formulario de Nuevo Cliente
  const [custFullName, setCustFullName] = useState<string>('');
  const [custPhone, setCustPhone] = useState<string>('');
  const [custDocType, setCustDocType] = useState<string>('CC');
  const [custDocNumber, setCustDocNumber] = useState<string>('');
  const [custEmail, setCustEmail] = useState<string>('');
  const [custCity, setCustCity] = useState<string>('Barranquilla');
  const [custAddress, setCustAddress] = useState<string>('');
  const [custSource, setCustSource] = useState<AcquisitionSourceChannel>('whatsapp');
  const [custNotes, setCustNotes] = useState<string>('');
  const [selectedCustomerForHistoryId, setSelectedCustomerForHistoryId] = useState<string>('');

  // Formulario de Nuevo Prospecto CRM y Seguimiento
  const [leadFullName, setLeadFullName] = useState<string>('');
  const [leadPhone, setLeadPhone] = useState<string>('');
  const [leadSource, setLeadSource] = useState<AcquisitionSourceChannel>('whatsapp');
  const [leadSku, setLeadSku] = useState<string>('COM-PER-001-AZU');
  const [leadFollowupDate, setLeadFollowupDate] = useState<string>('2026-11-15');
  const [leadNotes, setLeadNotes] = useState<string>('');

  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [followupStage, setFollowupStage] = useState<CrmLeadStage>('contacted');
  const [followupType, setFollowupType] = useState<
    'call' | 'whatsapp_manual_note' | 'store_visit' | 'quote_sent' | 'status_change' | 'note'
  >('whatsapp_manual_note');
  const [followupSummary, setFollowupSummary] = useState<string>('');
  const [followupNextDate, setFollowupNextDate] = useState<string>('2026-11-16');

  // Suite de 9 pruebas obligatorias
  const [testResults, setTestResults] = useState<SalesCrmTestResult[]>([]);
  const [runningTests, setRunningTests] = useState<boolean>(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    ensureExcelBaselineLoadedInInventory('admin@realtws.co').then(() => {
      setInvState({ ...getInventoryPurchaseState() });
      setSalesState({ ...getSalesOrdersCrmState() });
    });
  }, []);

  const refreshAll = () => {
    setInvState({ ...getInventoryPurchaseState() });
    setSalesState({ ...getSalesOrdersCrmState() });
  };

  const actorName = userProfile?.fullName || userProfile?.email || 'Operador Comercial';

  // Filtrar pedidos según alcance de propietario (si aplica) y filtros de UI
  const filteredOrders = useMemo(() => {
    return salesState.orders.filter((order) => {
      if (selectedOwnerScope !== 'ALL') {
        const hasOwner = order.lines.some((l) =>
          l.allocations.some((a) => a.ownerId === selectedOwnerScope)
        );
        if (!hasOwner) return false;
      }
      if (orderStatusFilter !== 'ALL' && order.status !== orderStatusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchOrder = order.orderNumber.toLowerCase().includes(q);
        const matchCust = order.customerName.toLowerCase().includes(q);
        const matchSku = order.lines.some((l) => l.sku.toLowerCase().includes(q));
        return matchOrder || matchCust || matchSku;
      }
      return true;
    });
  }, [salesState.orders, selectedOwnerScope, orderStatusFilter, searchQuery]);

  const selectedOrder = useMemo(
    () =>
      filteredOrders.find((o) => o.id === selectedOrderId) ||
      filteredOrders[0] ||
      null,
    [selectedOrderId, filteredOrders]
  );

  useEffect(() => {
    setReturnAllocationId(selectedOrder?.lines[0]?.allocations[0]?.id ?? '');
    setDispatchShippingCost(selectedOrder?.shippingRealCostCop ?? 0);
  }, [selectedOrder?.id, selectedOrder?.shippingRealCostCop]);

  const selectedOrderProfitability = useMemo(() => {
    if (!selectedOrder) return null;
    try {
      return calculateOrderProfitability(selectedOrder.id, salesState);
    } catch {
      return null;
    }
  }, [selectedOrder, salesState]);

  const selectedOrderPayments = useMemo(() => {
    if (!selectedOrder) return [];
    return salesState.payments.filter((p) => p.salesOrderId === selectedOrder.id);
  }, [selectedOrder, salesState.payments]);

  const selectedOrderShipment = useMemo(() => {
    if (!selectedOrder) return null;
    return salesState.shipments.find((s) => s.salesOrderId === selectedOrder.id) || null;
  }, [selectedOrder, salesState.shipments]);

  const customerSummaries = useMemo(
    () => buildCustomerCommercialSummaries(salesState),
    [salesState]
  );

  // Inicializar constructor de pedido nuevo
  const openNewOrderBuilder = (preselectedCustomerId?: string) => {
    if (!canWriteSales) {
      notify(`El rol ${effectiveRole} no puede crear pedidos.`, 'warning');
      return;
    }
    const defaultCust = preselectedCustomerId || salesState.customers[0]?.id || '';
    const firstLotAlloc =
      invState.allocations.find(
        (a) => a.qtyAvailable > 0 && a.costStatus !== 'PENDING_COST'
      ) ||
      invState.allocations.find((a) => a.qtyAvailable > 0) ||
      invState.allocations[0];
    const defaultSku = firstLotAlloc?.sku || 'COM-PER-001-AZU';
    const catItem = invState.catalog[defaultSku];

    setEditingOrderId(null);
    setOrderCustomerId(defaultCust);
    setOrderChannel('whatsapp');
    setOrderShippingCharged(0);
    setOrderShippingRealCost(0);
    setOrderNotes('');
    setOrderReserveImmediately(true);
    setDraftLines([
      {
        sku: defaultSku,
        qtyOrdered: 1,
        unitSalePriceCop: catItem?.approvedSalePriceCop ?? 0,
        lineDiscountCop: 0,
        allocations: firstLotAlloc
          ? [{ lotAllocationId: firstLotAlloc.id, qtyAllocated: 1 }]
          : []
      }
    ]);
    setShowOrderBuilder(true);
  };

  // Abrir editor de un pedido aún NO confirmado ('draft' o 'reserved')
  const openEditUnconfirmedOrderBuilder = (order: SalesOrderRecord) => {
    if (!canWriteSales) {
      notify(`El rol ${effectiveRole} no puede editar pedidos.`, 'warning');
      return;
    }
    if (order.status !== 'draft' && order.status !== 'reserved') {
      notify(
        'Solo se pueden editar pedidos mientras no estén confirmados (borrador o reservado).',
        'warning'
      );
      return;
    }
    setEditingOrderId(order.id);
    setOrderCustomerId(order.customerId);
    setOrderChannel(order.salesChannel);
    setOrderShippingCharged(order.shippingChargedCop);
    setOrderShippingRealCost(order.shippingRealCostCop);
    setOrderNotes(order.notes);
    setDraftLines(
      order.lines.map((l) => ({
        sku: l.sku,
        qtyOrdered: l.qtyOrdered,
        unitSalePriceCop: l.unitSalePriceCop,
        lineDiscountCop: l.lineDiscountCop,
        allocations: l.allocations.map((a) => ({
          lotAllocationId: a.lotAllocationId,
          qtyAllocated: a.qtyAllocated
        }))
      }))
    );
    setShowOrderBuilder(true);
  };

  const handleAddDraftLine = () => {
    const firstLotAlloc =
      invState.allocations.find(
        (a) => a.qtyAvailable > 0 && a.costStatus !== 'PENDING_COST'
      ) ||
      invState.allocations.find((a) => a.qtyAvailable > 0) ||
      invState.allocations[0];
    const sku = firstLotAlloc?.sku || 'COM-PER-001-AZU';
    const cat = invState.catalog[sku];
    setDraftLines((prev) => [
      ...prev,
      {
        sku,
        qtyOrdered: 1,
        unitSalePriceCop: cat?.approvedSalePriceCop ?? 0,
        lineDiscountCop: 0,
        allocations: firstLotAlloc
          ? [{ lotAllocationId: firstLotAlloc.id, qtyAllocated: 1 }]
          : []
      }
    ]);
  };

  const handleSkuChangeInDraftLine = (lineIdx: number, newSku: string) => {
    const cat = invState.catalog[newSku];
    const matchingLots = invState.allocations.filter((a) => a.sku === newSku);
    const preferredLot = matchingLots.find((a) => a.qtyAvailable > 0) || matchingLots[0];

    setDraftLines((prev) =>
      prev.map((line, idx) => {
        if (idx !== lineIdx) return line;
        return {
          ...line,
          sku: newSku,
          unitSalePriceCop: cat?.approvedSalePriceCop ?? line.unitSalePriceCop ?? 0,
          allocations: preferredLot
            ? [{ lotAllocationId: preferredLot.id, qtyAllocated: line.qtyOrdered }]
            : []
        };
      })
    );
  };

  const handleSaveOrderFromBuilder = () => {
    if (!canWriteSales) {
      notify(`El rol ${effectiveRole} es de solo lectura.`, 'error');
      return;
    }
    try {
      if (editingOrderId) {
        const updated = txUpdateUnconfirmedSalesOrder({
          salesOrderId: editingOrderId,
          salesChannel: orderChannel,
          shippingChargedCop: orderShippingCharged,
          shippingRealCostCop: orderShippingRealCost,
          notes: orderNotes,
          lines: draftLines,
          actorName
        });
        refreshAll();
        setSelectedOrderId(updated.id);
        setShowOrderBuilder(false);
        notify(`Pedido ${updated.orderNumber} actualizado correctamente.`, 'success');
      } else {
        const created = txCreateSalesOrder({
          customerId: orderCustomerId,
          salesChannel: orderChannel,
          shippingChargedCop: orderShippingCharged,
          shippingRealCostCop: orderShippingRealCost,
          sellerName: actorName,
          notes: orderNotes,
          lines: draftLines,
          reserveImmediately: orderReserveImmediately
        });
        refreshAll();
        setSelectedOrderId(created.id);
        setShowOrderBuilder(false);
        notify(
          `Pedido ${created.orderNumber} creado (${ORDER_STATUS_LABELS[created.status]}). Estado de pago: PENDIENTE.`,
          'success'
        );
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleRun9Tests = async () => {
    setRunningTests(true);
    try {
      const results = await runSalesOrdersCrmTestSuite();
      setTestResults(results);
      const passedCount = results.filter((r) => r.passed).length;
      notify(
        `Suite Comercial y CRM completada: ${passedCount}/${results.length} pruebas superadas en sandbox aislado.`,
        passedCount === results.length ? 'success' : 'warning'
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setRunningTests(false);
    }
  };

  // KPIs de resumen comercial (respetan selectedOwnerScope)
  const activeOrdersList = filteredOrders.filter((o) => o.status !== 'cancelled');
  const totalNetMerchandiseCop = activeOrdersList.reduce((acc, o) => {
    const p = calculateOrderProfitability(o.id, salesState);
    return acc + p.netMerchandiseRevenueCop;
  }, 0);
  const totalOperatingProfitCop = activeOrdersList.reduce((acc, o) => {
    const p = calculateOrderProfitability(o.id, salesState);
    return acc + p.orderOperatingProfitCop;
  }, 0);
  const totalCollectedCop = activeOrdersList.reduce((acc, o) => {
    const p = calculateOrderProfitability(o.id, salesState);
    return acc + p.netCollectedCashCop;
  }, 0);
  const totalPendingReceivableCop = activeOrdersList.reduce((acc, o) => {
    const p = calculateOrderProfitability(o.id, salesState);
    return acc + p.pendingReceivableCop;
  }, 0);

  const visibleTabs = [
    ...(effectiveRole !== 'INVENTORY_OPERATOR'
      ? [
          {
            id: 'ORDERS' as CommercialSectionTab,
            label: 'Pedidos',
            icon: <ShoppingBag size={14} />,
            count: filteredOrders.length
          }
        ]
      : []),
    ...(canWriteSales
      ? [
          {
            id: 'CUSTOMERS' as CommercialSectionTab,
            label: 'Clientes',
            icon: <UserCheck size={14} />,
            count: salesState.customers.length
          },
          {
            id: 'CRM_PIPELINE' as CommercialSectionTab,
            label: 'CRM',
            icon: <MessageSquareHeart size={14} />,
            count: salesState.leads.length
          }
        ]
      : []),
    ...(canWriteDispatch
      ? [
          {
            id: 'SHIPMENTS' as CommercialSectionTab,
            label: 'Despachos',
            icon: <PackageCheck size={14} />,
            count: salesState.shipments.length
          }
        ]
      : []),
    ...(canWriteSales
      ? [{ id: 'TESTS_9' as CommercialSectionTab, label: 'Diagnóstico', icon: <ShieldCheck size={14} /> }]
      : [])
  ];

  const effectiveTab = visibleTabs.some((t) => t.id === activeTab)
    ? activeTab
    : visibleTabs[0]?.id || 'ORDERS';

  return (
    <div className="module-container">
      {/* ENCABEZADO EJECUTIVO */}
      <ModuleHeader
        variant="dark"
        eyebrow="COMERCIAL · VENTAS Y CRM"
        title="Pedidos, Clientes, CRM y Despachos"
        subtitle={
          isOwnerRole
            ? 'Vista acotada de propietario (solo lectura) con datos personales ocultos.'
            : 'Gestiona tus ventas por lote y propietario, seguimiento de clientes y envíos.'
        }
        actions={
          <>
            {!isOwnerRole && effectiveRole !== 'VIEWER' && (
              <button
                type="button"
                className="rtw-btn rtw-btn-ghost-dark btn-sm"
                onClick={() => setRevealPersonalData((prev) => !prev)}
                title="Mostrar u ocultar datos de contacto"
              >
                {revealPersonalData ? <EyeOff size={15} /> : <Eye size={15} />}
                {revealPersonalData ? 'Ocultar datos' : 'Mostrar datos'}
              </button>
            )}
            {canWriteSales && (
              <button
                type="button"
                className="rtw-btn rtw-btn-gold btn-sm"
                onClick={() => {
                  setActiveTab('ORDERS');
                  openNewOrderBuilder();
                }}
              >
                <Plus size={15} />
                Nuevo pedido
              </button>
            )}
          </>
        }
        bottomSlot={
          <SegmentedTabs<CommercialSectionTab>
            variant="dark"
            value={effectiveTab}
            onChange={setActiveTab}
            items={visibleTabs}
          />
        }
      />

      {/* KPIs COMERCIALES */}
      <section className="rtw-kpi-grid">
        <StatCard
          staggerIndex={1}
          label="Pedidos y Prospectos"
          value={`${activeOrdersList.length} / ${salesState.leads.length}`}
          sub={`${salesState.customers.length} clientes registrados`}
          icon={<ShoppingBag size={16} />}
        />
        <StatCard
          staggerIndex={2}
          tone="gold"
          label="Ventas Netas"
          value={formatCOP(totalNetMerchandiseCop)}
          sub="Atribuidas por lote y propietario"
          icon={<TrendingUp size={16} />}
        />
        <StatCard
          staggerIndex={3}
          tone="success"
          label="Utilidad Operativa"
          value={formatCOP(totalOperatingProfitCop)}
          sub="Venta neta menos costo y envío"
          icon={<CheckCircle2 size={16} />}
        />
        <StatCard
          staggerIndex={4}
          tone={totalPendingReceivableCop > 0 ? 'warning' : 'default'}
          label="Recaudo vs Por Cobrar"
          value={formatCOP(totalCollectedCop)}
          sub={`Por cobrar: ${formatCOP(totalPendingReceivableCop)}`}
          icon={<CreditCard size={16} />}
        />
      </section>

      {/* MODAL / PANEL DE CREACIÓN O EDICIÓN DE PEDIDO MULTIPROPIETARIO */}
      {showOrderBuilder && (
        <div
          className="card"
          style={{
            marginBottom: '1.25rem',
            border: '1px solid var(--accent-gold)',
            background: 'var(--bg-elevated)'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem'
            }}
          >
            <div>
              <span className="badge badge-gold">
                {editingOrderId
                  ? 'EDICIÓN DE PEDIDO NO CONFIRMADO'
                  : 'NUEVO PEDIDO MULTIPROPIETARIO Y MULTIVARIADO'}
              </span>
              <h2 style={{ fontSize: '1.15rem', margin: '0.3rem 0 0 0' }}>
                {editingOrderId
                  ? 'Modificar Líneas, Cantidades y Asignaciones de Lote/Propietario'
                  : 'Configurar Pedido y Dividir Líneas por Propietario y Lote'}
              </h2>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowOrderBuilder(false)}
            >
              Cerrar Formulario
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '0.85rem',
              marginBottom: '1rem'
            }}
          >
            <div className="form-group">
              <label className="form-label">Cliente *</label>
              <select
                className="form-control"
                value={orderCustomerId}
                disabled={Boolean(editingOrderId)}
                onChange={(e) => setOrderCustomerId(e.target.value)}
              >
                {salesState.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.customerCode} — {c.fullName} ({maskProtectedPhone(c.phoneWhatsapp, revealPersonalData)})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Canal de Venta</label>
              <select
                className="form-control"
                value={orderChannel}
                onChange={(e) =>
                  setOrderChannel(e.target.value as SalesOrderRecord['salesChannel'])
                }
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="store_direct">Tienda Física Directa</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="marketplace">Marketplace</option>
                <option value="web">Catálogo Web</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Envío Cobrado al Cliente (COP)</label>
              <input
                type="number"
                min={0}
                className="form-control"
                value={orderShippingCharged}
                onChange={(e) => setOrderShippingCharged(Number(e.target.value) || 0)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Costo Real Transportadora (COP)</label>
              <input
                type="number"
                min={0}
                className="form-control"
                value={orderShippingRealCost}
                onChange={(e) => setOrderShippingRealCost(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* LÍNEAS DEL PEDIDO Y ASIGNACIONES MULTIPROPIETARIO */}
          <div style={{ marginBottom: '1rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.6rem'
              }}
            >
              <strong>Líneas del Pedido y División por Lote / Propietario:</strong>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleAddDraftLine}
              >
                <Plus size={15} /> Agregar Otra Variante (SKU)
              </button>
            </div>

            {draftLines.map((line, lineIdx) => {
              const availableLotsForSku = invState.allocations.filter(
                (a) => a.sku === line.sku
              );
              const sumAllocated = line.allocations.reduce(
                (s, a) => s + a.qtyAllocated,
                0
              );
              return (
                <div
                  key={lineIdx}
                  style={{
                    padding: '0.9rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    marginBottom: '0.75rem',
                    background: 'var(--bg-surface)'
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr auto',
                      gap: '0.75rem',
                      alignItems: 'end'
                    }}
                  >
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Línea #{lineIdx + 1} — SKU Variante</label>
                      <select
                        className="form-control"
                        value={line.sku}
                        onChange={(e) =>
                          handleSkuChangeInDraftLine(lineIdx, e.target.value)
                        }
                      >
                        {Object.values(invState.catalog).map((cat) => (
                          <option key={cat.sku} value={cat.sku}>
                            {cat.sku} — {cat.productName} ({cat.color || cat.variantName})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Cantidad Total Línea</label>
                      <input
                        type="number"
                        min={1}
                        className="form-control"
                        value={line.qtyOrdered}
                        onChange={(e) => {
                          const newQty = Math.max(1, Number(e.target.value) || 1);
                          setDraftLines((prev) =>
                            prev.map((l, idx) =>
                              idx === lineIdx
                                ? {
                                    ...l,
                                    qtyOrdered: newQty,
                                    allocations:
                                      l.allocations.length === 1
                                        ? [
                                            {
                                              ...l.allocations[0],
                                              qtyAllocated: newQty
                                            }
                                          ]
                                        : l.allocations
                                  }
                                : l
                            )
                          );
                        }}
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Precio Unitario (COP)</label>
                      <input
                        type="number"
                        min={0}
                        className="form-control"
                        value={line.unitSalePriceCop}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value) || 0);
                          setDraftLines((prev) =>
                            prev.map((l, idx) =>
                              idx === lineIdx ? { ...l, unitSalePriceCop: val } : l
                            )
                          );
                        }}
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Descuento Línea (COP)</label>
                      <input
                        type="number"
                        min={0}
                        className="form-control"
                        value={line.lineDiscountCop}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value) || 0);
                          setDraftLines((prev) =>
                            prev.map((l, idx) =>
                              idx === lineIdx ? { ...l, lineDiscountCop: val } : l
                            )
                          );
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={draftLines.length <= 1}
                      onClick={() =>
                        setDraftLines((prev) => prev.filter((_, i) => i !== lineIdx))
                      }
                      title="Eliminar línea"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {/* SUB-ASIGNACIONES POR PROPIETARIO Y LOTE */}
                  <div
                    style={{
                      marginTop: '0.75rem',
                      paddingTop: '0.65rem',
                      borderTop: '1px dashed var(--border-subtle)'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '0.45rem',
                        fontSize: '0.82rem'
                      }}
                    >
                      <span>
                        <Layers size={14} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
                        Asignaciones de Propietario y Lote para <strong>{line.sku}</strong> (Suma asignada:{' '}
                        <strong
                          style={{
                            color:
                              sumAllocated === line.qtyOrdered
                                ? 'var(--status-success)'
                                : 'var(--status-danger)'
                          }}
                        >
                          {sumAllocated} / {line.qtyOrdered} uds
                        </strong>
                        ):
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                        onClick={() => {
                          const fallbackLot = availableLotsForSku[0];
                          if (!fallbackLot) return;
                          setDraftLines((prev) =>
                            prev.map((l, idx) =>
                              idx === lineIdx
                                ? {
                                    ...l,
                                    allocations: [
                                      ...l.allocations,
                                      {
                                        lotAllocationId: fallbackLot.id,
                                        qtyAllocated: 1
                                      }
                                    ]
                                  }
                                : l
                            )
                          );
                        }}
                      >
                        + Dividir en Otro Lote / Propietario
                      </button>
                    </div>

                    {line.allocations.map((alloc, allocIdx) => {
                      const selectedLotObj = invState.allocations.find(
                        (a) => a.id === alloc.lotAllocationId
                      );
                      return (
                        <div
                          key={allocIdx}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '3fr 1fr auto',
                            gap: '0.6rem',
                            alignItems: 'center',
                            marginBottom: '0.4rem'
                          }}
                        >
                          <select
                            className="form-control"
                            value={alloc.lotAllocationId}
                            onChange={(e) => {
                              const newLotAllocId = e.target.value;
                              setDraftLines((prev) =>
                                prev.map((l, idx) =>
                                  idx === lineIdx
                                    ? {
                                        ...l,
                                        allocations: l.allocations.map((a, ai) =>
                                          ai === allocIdx
                                            ? { ...a, lotAllocationId: newLotAllocId }
                                            : a
                                        )
                                      }
                                    : l
                                )
                              );
                            }}
                          >
                            {availableLotsForSku.map((lot) => (
                              <option key={lot.id} value={lot.id}>
                                Propietario: {lot.ownerId} ({lot.ownerName}) | Lote: {lot.lotId} | Disponible: {lot.qtyAvailable} uds | Costo Unit: {lot.costStatus === 'PENDING_COST' || lot.purchaseUnitCostCop === null ? 'PENDING_COST' : formatCOP((lot.purchaseUnitCostCop ?? 0) + (lot.inboundShippingUnitCostCop ?? 0))}
                              </option>
                            ))}
                          </select>

                          <input
                            type="number"
                            min={1}
                            className="form-control"
                            value={alloc.qtyAllocated}
                            onChange={(e) => {
                              const q = Math.max(1, Number(e.target.value) || 1);
                              setDraftLines((prev) =>
                                prev.map((l, idx) =>
                                  idx === lineIdx
                                    ? {
                                        ...l,
                                        allocations: l.allocations.map((a, ai) =>
                                          ai === allocIdx ? { ...a, qtyAllocated: q } : a
                                        )
                                      }
                                    : l
                                )
                              );
                            }}
                          />

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span className="badge badge-neutral">
                              COGS:{' '}
                              {selectedLotObj?.costStatus === 'PENDING_COST' ||
                              selectedLotObj?.purchaseUnitCostCop === null
                                ? 'PENDING_COST'
                                : formatCOP(
                                    ((selectedLotObj?.purchaseUnitCostCop ?? 0) +
                                      (selectedLotObj?.inboundShippingUnitCostCop ?? 0)) *
                                      alloc.qtyAllocated
                                  )}
                            </span>
                            {line.allocations.length > 1 && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '0.25rem 0.45rem' }}
                                onClick={() =>
                                  setDraftLines((prev) =>
                                    prev.map((l, idx) =>
                                      idx === lineIdx
                                        ? {
                                            ...l,
                                            allocations: l.allocations.filter(
                                              (_, ai) => ai !== allocIdx
                                            )
                                          }
                                        : l
                                    )
                                  )
                                }
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-control"
                style={{ minWidth: '280px' }}
                placeholder="Notas comerciales o instrucciones de alistamiento..."
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
              />
              {!editingOrderId && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.88rem' }}>
                  <input
                    type="checkbox"
                    checked={orderReserveImmediately}
                    onChange={(e) => setOrderReserveImmediately(e.target.checked)}
                  />
                  Reservar inventario inmediatamente al crear
                </label>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveOrderFromBuilder}
            >
              <CheckCircle2 size={16} />
              {editingOrderId ? 'Guardar Cambios en Pedido No Confirmado' : 'Guardar Pedido (Sin Pago Automático)'}
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 1: PEDIDOS Y VISTA DETALLADA DE RENTABILIDAD                      */}
      {/* ===================================================================== */}
      {effectiveTab === 'ORDERS' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))',
            gap: '1.25rem',
            alignItems: 'start'
          }}
        >
          {/* COLUMNA IZQUIERDA: PIPELINE Y TABLA DE PEDIDOS */}
          <div className="card">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
                marginBottom: '0.9rem'
              }}
            >
              <h2 style={{ fontSize: '1.1rem', margin: 0 }}>
                Pipeline de Pedidos ({filteredOrders.length})
              </h2>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const headers = [
                    'Numero_Pedido',
                    'Fecha',
                    'Cliente',
                    'Estado_Pedido',
                    'Estado_Pago',
                    'Venta_Neta_Mercancia_COP',
                    'Envio_Cobrado_COP',
                    'Total_Pedido_COP',
                    'Costo_Vendido_COGS_COP',
                    'Costo_Real_Envio_COP',
                    'Utilidad_Operativa_COP',
                    'Margen_Bruto_Pct',
                    'Recaudado_Efectivo_COP',
                    'Saldo_Por_Cobrar_COP'
                  ];
                  const rows = filteredOrders.map((o) => {
                    const p = calculateOrderProfitability(o.id, salesState);
                    return [
                      o.orderNumber,
                      o.orderDate,
                      o.customerName,
                      o.status,
                      o.paymentStatus,
                      p.netMerchandiseRevenueCop,
                      p.shippingChargedToCustomerCop,
                      p.netOrderTotalBilledCop,
                      p.totalCogsCop,
                      p.shippingRealCarrierCostCop,
                      p.orderOperatingProfitCop,
                      p.grossMarginPct,
                      p.netCollectedCashCop,
                      p.pendingReceivableCop
                    ];
                  });
                  exportRowsToCsvUtf8(
                    'REAL_TWS_PEDIDOS_Y_RENTABILIDAD.csv',
                    headers,
                    rows
                  );
                }}
              >
                <Download size={15} /> Exportar CSV
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.65rem',
                marginBottom: '0.9rem'
              }}
            >
              <input
                type="text"
                className="form-control"
                placeholder="Buscar pedido, cliente o SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select
                className="form-control"
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value)}
              >
                <option value="ALL">Todos los estados</option>
                <option value="draft">Borrador (Editable)</option>
                <option value="reserved">Inventario Reservado</option>
                <option value="confirmed">Confirmado</option>
                <option value="preparing">En Preparación</option>
                <option value="dispatched">Despachado</option>
                <option value="delivered">Entregado</option>
                <option value="partially_returned">Devolución Parcial</option>
                <option value="returned">Devuelto</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nº Pedido</th>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th>Pago</th>
                    <th>Total / COGS</th>
                    <th>Utilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => {
                    const prof = calculateOrderProfitability(order.id, salesState);
                    const isSelected = selectedOrder?.id === order.id;
                    return (
                      <tr
                        key={order.id}
                        onClick={() => setSelectedOrderId(order.id)}
                        style={{
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(212, 175, 55, 0.12)' : undefined
                        }}
                      >
                        <td>
                          <strong>{order.orderNumber}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {order.orderDate} • {order.lines.length} línea(s)
                          </div>
                        </td>
                        <td>
                          <div>{order.customerName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {maskProtectedPhone(order.customerPhone, revealPersonalData && !isOwnerRole)}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              order.status === 'delivered' || order.status === 'dispatched'
                                ? 'badge-success'
                                : order.status === 'cancelled' || order.status === 'returned'
                                  ? 'badge-danger'
                                  : 'badge-gold'
                            }`}
                          >
                            {order.status.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              order.paymentStatus === 'paid'
                                ? 'badge-success'
                                : order.paymentStatus === 'partial'
                                  ? 'badge-warning'
                                  : 'badge-neutral'
                            }`}
                          >
                            {order.paymentStatus.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <strong>{formatCOP(prof.netOrderTotalBilledCop)}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            COGS: {formatCOP(prof.totalCogsCop)}
                          </div>
                        </td>
                        <td>
                          <strong style={{ color: 'var(--status-success)' }}>
                            {formatCOP(prof.orderOperatingProfitCop)}
                          </strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {prof.grossMarginPct}% margen
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* COLUMNA DERECHA: DETALLE DEL PEDIDO, ACCIONES Y RENTABILIDAD MULTIPROPIETARIO */}
          {selectedOrder && selectedOrderProfitability && (
            <div className="card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  marginBottom: '1rem',
                  paddingBottom: '0.85rem',
                  borderBottom: '1px solid var(--border-subtle)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span className="badge badge-gold">
                      {ORDER_STATUS_LABELS[selectedOrder.status]}
                    </span>
                    <span className="badge badge-neutral">
                      PAGO: {selectedOrder.paymentStatus.toUpperCase()}
                    </span>
                  </div>
                  <h2 style={{ fontSize: '1.25rem', margin: '0.4rem 0 0.2rem 0' }}>
                    Detalle de Pedido: {selectedOrder.orderNumber}
                  </h2>
                  <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                    Cliente: <strong>{selectedOrder.customerName}</strong> ({selectedOrder.customerCode}) •{' '}
                    {maskProtectedPhone(
                      selectedOrder.customerPhone,
                      revealPersonalData && !isOwnerRole && effectiveRole !== 'VIEWER'
                    )}{' '}
                    •{' '}
                    {maskProtectedAddress(
                      selectedOrder.customerAddress,
                      revealPersonalData && !isOwnerRole && effectiveRole !== 'VIEWER'
                    )}
                  </div>
                </div>

                {/* ACCIONES DEL FLUJO DEL PEDIDO */}
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  {canWriteSales &&
                    (selectedOrder.status === 'draft' || selectedOrder.status === 'reserved') && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => openEditUnconfirmedOrderBuilder(selectedOrder)}
                    >
                      <Edit3 size={15} /> Editar (No Confirmado)
                    </button>
                  )}

                  {canWriteSales && selectedOrder.status === 'draft' && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        try {
                          txReserveSalesOrderInventory(selectedOrder.id, actorName);
                          refreshAll();
                          notify(`Inventario reservado para ${selectedOrder.orderNumber}.`, 'success');
                        } catch (err) {
                          notify(err instanceof Error ? err.message : String(err), 'error');
                        }
                      }}
                    >
                      Reservar Stock
                    </button>
                  )}

                  {canWriteSales &&
                    (selectedOrder.status === 'draft' || selectedOrder.status === 'reserved') && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        try {
                          txConfirmSalesOrder(selectedOrder.id, actorName);
                          refreshAll();
                          notify(
                            `Pedido ${selectedOrder.orderNumber} confirmado. Sus líneas quedan bloqueadas frente a edición directa.`,
                            'success'
                          );
                        } catch (err) {
                          notify(err instanceof Error ? err.message : String(err), 'error');
                        }
                      }}
                    >
                      <CheckCircle2 size={15} /> Confirmar Pedido
                    </button>
                  )}

                  {canWriteDispatch && selectedOrder.status === 'confirmed' && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        try {
                          txPrepareSalesOrder({
                            salesOrderId: selectedOrder.id,
                            carrierName,
                            destinationCity: selectedOrder.customerCity,
                            destinationAddress: selectedOrder.customerAddress,
                            shippingRealCostCop: selectedOrder.shippingRealCostCop,
                            actorName
                          });
                          refreshAll();
                          notify(`Pedido ${selectedOrder.orderNumber} en preparación y empaque.`, 'success');
                        } catch (err) {
                          notify(err instanceof Error ? err.message : String(err), 'error');
                        }
                      }}
                    >
                      Pasar a Preparación
                    </button>
                  )}

                  {canWriteDispatch && selectedOrder.status === 'dispatched' && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        try {
                          txDeliverSalesOrder(selectedOrder.id, actorName);
                          refreshAll();
                          notify(`Pedido ${selectedOrder.orderNumber} marcado como ENTREGADO.`, 'success');
                        } catch (err) {
                          notify(err instanceof Error ? err.message : String(err), 'error');
                        }
                      }}
                    >
                      <CheckCircle2 size={15} /> Confirmar Entrega
                    </button>
                  )}
                </div>
              </div>

              {/* TABLA DE LÍNEAS Y ASIGNACIONES DE PROPIETARIO / LOTE */}
              <h3 style={{ fontSize: '0.98rem', marginBottom: '0.5rem' }}>
                Líneas de Producto y Asignaciones por Propietario y Lote
              </h3>
              <div className="table-responsive" style={{ marginBottom: '1.1rem' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>SKU / Variante</th>
                      <th>Propietario / Lote Asignado</th>
                      <th>Cant. (Dev.)</th>
                      <th>Precio / Desc.</th>
                      <th>Venta Neta</th>
                      <th>Costo Vendido (COGS)</th>
                      <th>Estado Asignación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.lines.flatMap((line) =>
                      line.allocations.map((alloc) => {
                        const netUnits = Math.max(0, alloc.qtyAllocated - alloc.qtyReturned);
                        const netSale =
                          alloc.qtyAllocated * alloc.unitSalePriceCop -
                          alloc.discountAllocatedCop -
                          alloc.returnAmountCop;
                        const cogs = netUnits * alloc.unitCostCop;
                        return (
                          <tr key={alloc.id}>
                            <td>
                              <strong>{line.sku}</strong>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {line.productName} ({line.variantName})
                              </div>
                            </td>
                            <td>
                              <span className="badge badge-gold">{alloc.ownerId}</span>{' '}
                              <strong>{alloc.ownerName}</strong>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Lote: {alloc.lotId}
                              </div>
                            </td>
                            <td>
                              <strong>{alloc.qtyAllocated}</strong> uds
                              {alloc.qtyReturned > 0 && (
                                <span
                                  className="badge badge-danger"
                                  style={{ marginLeft: '0.35rem' }}
                                >
                                  -{alloc.qtyReturned} dev.
                                </span>
                              )}
                            </td>
                            <td>
                              <div>{formatCOP(alloc.unitSalePriceCop)}</div>
                              {alloc.discountAllocatedCop > 0 && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--status-warning)' }}>
                                  Desc: -{formatCOP(alloc.discountAllocatedCop)}
                                </div>
                              )}
                            </td>
                            <td>
                              <strong>{formatCOP(netSale)}</strong>
                            </td>
                            <td>
                              <strong>{formatCOP(cogs)}</strong>
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                Unit: {formatCOP(alloc.unitCostCop)}
                              </div>
                            </td>
                            <td>
                              <span className="badge badge-neutral">
                                {alloc.allocationStatus.toUpperCase()}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* VERIFICACIÓN DE RENTABILIDAD POR PEDIDO Y POR PROPIETARIO */}
              <div
                style={{
                  padding: '0.95rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-elevated)',
                  marginBottom: '1.1rem'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.65rem'
                  }}
                >
                  <TrendingUp size={17} style={{ color: 'var(--accent-gold)' }} />
                  <strong>Verificación Matemática de Rentabilidad del Pedido</strong>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
                    gap: '0.65rem',
                    marginBottom: '0.85rem',
                    fontSize: '0.84rem'
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Subtotal Bruto:</div>
                    <strong>{formatCOP(selectedOrderProfitability.grossMerchandiseSubtotalCop)}</strong>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Descuentos / Dev.:</div>
                    <strong style={{ color: 'var(--status-warning)' }}>
                      -{formatCOP(selectedOrderProfitability.totalLineDiscountsCop + selectedOrderProfitability.returnedMerchandiseCop)}
                    </strong>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Venta Neta Mercancía:</div>
                    <strong style={{ color: 'var(--accent-gold)' }}>
                      {formatCOP(selectedOrderProfitability.netMerchandiseRevenueCop)}
                    </strong>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Costo Vendido (COGS):</div>
                    <strong>{formatCOP(selectedOrderProfitability.totalCogsCop)}</strong>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Envío (Cobrado - Real):</div>
                    <strong>
                      {formatCOP(selectedOrderProfitability.shippingChargedToCustomerCop)} -{' '}
                      {formatCOP(selectedOrderProfitability.shippingRealCarrierCostCop)} ={' '}
                      {formatCOP(selectedOrderProfitability.netLogisticsResultCop)}
                    </strong>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Utilidad Operativa Pedido:</div>
                    <strong style={{ color: 'var(--status-success)' }}>
                      {formatCOP(selectedOrderProfitability.orderOperatingProfitCop)} (
                      {selectedOrderProfitability.grossMarginPct}%)
                    </strong>
                  </div>
                </div>

                {/* Desglose por propietario */}
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Propietario</th>
                        <th>Lotes Usados</th>
                        <th>Uds Netas</th>
                        <th>Venta Neta</th>
                        <th>COGS Lote</th>
                        <th>Utilidad Bruta</th>
                        <th>Acuerdo / Comisión REAL TWS</th>
                        <th>Utilidad Propietario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrderProfitability.ownerBreakdowns.map((ob) => (
                        <tr key={ob.ownerId}>
                          <td>
                            <strong>{ob.ownerId}</strong> — {ob.ownerName}
                          </td>
                          <td style={{ fontSize: '0.78rem' }}>{ob.lotsUsed.join(', ')}</td>
                          <td>{ob.netUnitsSold}</td>
                          <td>{formatCOP(ob.netRevenueCop)}</td>
                          <td>{formatCOP(ob.cogsTotalCop)}</td>
                          <td>{formatCOP(ob.grossProfitBeforeCommissionCop)}</td>
                          <td>
                            {ob.agreementStatusLabel === 'PENDIENTE DE CONFIGURAR' ? (
                              <span className="badge badge-warning">
                                PENDIENTE DE CONFIGURAR
                              </span>
                            ) : (
                              <span>
                                {ob.storeCommissionPct}% ({formatCOP(ob.storeCommissionCop || 0)})
                              </span>
                            )}
                          </td>
                          <td>
                            <strong style={{ color: 'var(--status-success)' }}>
                              {formatCOP(ob.attributableOwnerProfitCop)}
                            </strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* PANELES OPERATIVOS DEL PEDIDO: PAGOS, DESPACHO, DEVOLUCIÓN Y CANCELACIÓN */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: '0.9rem'
                }}
              >
                {/* 1. REGISTRAR PAGO (SIN PASARELAS PAGAS NI MARCADO AUTOMÁTICO) */}
                <div
                  style={{
                    padding: '0.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                    <CreditCard size={15} />
                    <strong>Registrar Pago Manual</strong>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.55rem' }}>
                    Cobrado: <strong>{formatCOP(selectedOrderProfitability.netCollectedCashCop)}</strong> | Por cobrar:{' '}
                    <strong>{formatCOP(selectedOrderProfitability.pendingReceivableCop)}</strong>
                  </div>

                  <div style={{ display: 'grid', gap: '0.45rem' }}>
                    <select
                      className="form-control"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethodType)}
                    >
                      <option value="nequi">Nequi</option>
                      <option value="daviplata">Daviplata</option>
                      <option value="cash">Efectivo en Tienda</option>
                      <option value="bank_transfer">Transferencia Bancaria</option>
                      <option value="cod_carrier">Contraentrega Transportadora</option>
                      <option value="card">Datáfono / Tarjeta</option>
                    </select>

                    <select
                      className="form-control"
                      value={paymentStatusInput}
                      onChange={(e) =>
                        setPaymentStatusInput(
                          e.target.value as 'pending' | 'confirmed' | 'refunded'
                        )
                      }
                    >
                      <option value="confirmed">Recibido / Confirmado</option>
                      <option value="pending">Pendiente de Verificación</option>
                      <option value="refunded">Reembolsado al Cliente</option>
                    </select>

                    <input
                      type="number"
                      min={1}
                      className="form-control"
                      placeholder="Monto en COP..."
                      value={paymentAmount || ''}
                      onChange={(e) => setPaymentAmount(Number(e.target.value) || 0)}
                    />
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Comprobante / Referencia..."
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                    />
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Notas de pago..."
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!canWriteSales}
                      onClick={() => {
                        try {
                          const rec = txRegisterOrderPayment({
                            salesOrderId: selectedOrder.id,
                            paymentMethod,
                            amountCop: paymentAmount,
                            status: paymentStatusInput,
                            referenceCode: paymentRef,
                            receivedBy: actorName,
                            notes: paymentNotes
                          });
                          refreshAll();
                          setPaymentAmount(0);
                          setPaymentRef('');
                          setPaymentNotes('');
                          notify(
                            `Pago ${rec.paymentCode} registrado (${rec.status.toUpperCase()}).`,
                            'success'
                          );
                        } catch (err) {
                          notify(err instanceof Error ? err.message : String(err), 'error');
                        }
                      }}
                    >
                      Registrar Pago
                    </button>
                  </div>

                  {selectedOrderPayments.length > 0 && (
                    <div style={{ marginTop: '0.6rem', fontSize: '0.76rem' }}>
                      {selectedOrderPayments.map((p) => (
                        <div key={p.id} style={{ padding: '0.2rem 0', borderBottom: '1px dashed var(--border-subtle)' }}>
                          <strong>{p.paymentCode}</strong> ({p.paymentMethod}): {formatCOP(p.amountCop)} —{' '}
                          <span className="badge badge-neutral">{p.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. DESPACHO Y GUÍA DE ENVÍO */}
                <div
                  style={{
                    padding: '0.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                    <Truck size={15} />
                    <strong>Despacho y Guía Logística</strong>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.55rem' }}>
                    {selectedOrderShipment
                      ? `Guía actual: ${selectedOrderShipment.trackingNumber || 'En alistamiento'} (${selectedOrderShipment.status})`
                      : 'Aún sin guía emitida'}
                  </div>

                  <div style={{ display: 'grid', gap: '0.45rem' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Transportadora (Interrapidísimo, Servientrega...)"
                      value={carrierName}
                      onChange={(e) => setCarrierName(e.target.value)}
                    />
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Número de Guía Oficial..."
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                    />
                    <input
                      type="number"
                      min={0}
                      className="form-control"
                      placeholder="Costo Real Guía (COP)..."
                      value={dispatchShippingCost}
                      disabled={!canWriteDispatch}
                      onChange={(e) => setDispatchShippingCost(Math.max(0, Number(e.target.value) || 0))}
                    />
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Novedad o nota de despacho..."
                      value={dispatchNotes}
                      disabled={!canWriteDispatch}
                      onChange={(e) => setDispatchNotes(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={
                        !canWriteDispatch ||
                        selectedOrder.status === 'dispatched' ||
                        selectedOrder.status === 'delivered' ||
                        selectedOrder.status === 'cancelled'
                      }
                      onClick={() => {
                        try {
                          const { shipment } = txDispatchSalesOrder({
                            salesOrderId: selectedOrder.id,
                            carrierName,
                            trackingNumber,
                            shippingRealCostCop: dispatchShippingCost,
                            actorName,
                            notes: dispatchNotes
                          });
                          refreshAll();
                          setTrackingNumber('');
                          setDispatchNotes('');
                          notify(
                            `Pedido despachado con guía ${shipment.trackingNumber}. Se generaron las salidas de stock por propietario y lote.`,
                            'success'
                          );
                        } catch (err) {
                          notify(err instanceof Error ? err.message : String(err), 'error');
                        }
                      }}
                    >
                      Despachar y Generar Salida de Stock
                    </button>
                  </div>
                </div>

                {/* 3. DEVOLUCIÓN CONSERVANDO PROPIETARIO ORIGINAL O CANCELACIÓN */}
                <div
                  style={{
                    padding: '0.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                    <RotateCcw size={15} />
                    <strong>Devolución o Cancelación</strong>
                  </div>

                  {['dispatched', 'delivered', 'partially_returned'].includes(
                    selectedOrder.status
                  ) ? (
                    <div style={{ display: 'grid', gap: '0.45rem' }}>
                      <select
                        className="form-control"
                        disabled={!canWriteDispatch}
                        value={
                          returnAllocationId ||
                          selectedOrder.lines[0]?.allocations[0]?.id ||
                          ''
                        }
                        onChange={(e) => setReturnAllocationId(e.target.value)}
                      >
                        {selectedOrder.lines.flatMap((l) =>
                          l.allocations.map((a) => (
                            <option key={a.id} value={a.id}>
                              {l.sku} — {a.ownerId} ({a.lotId}) | Disp. dev:{' '}
                              {a.qtyAllocated - a.qtyReturned}
                            </option>
                          ))
                        )}
                      </select>
                      <input
                        type="number"
                        min={1}
                        className="form-control"
                        disabled={!canWriteDispatch}
                        value={returnQty}
                        onChange={(e) => setReturnQty(Math.max(1, Number(e.target.value) || 1))}
                      />
                      <select
                        className="form-control"
                        disabled={!canWriteDispatch}
                        value={returnCondition}
                        onChange={(e) =>
                          setReturnCondition(
                            e.target.value as
                              | 'good_restock'
                              | 'defective_warranty'
                              | 'pending_inspection'
                          )
                        }
                      >
                        <option value="good_restock">Apto (Reingreso a Stock Disponible)</option>
                        <option value="defective_warranty">Defectuoso / Garantía</option>
                        <option value="pending_inspection">Pendiente de Revisión Técnica</option>
                      </select>
                      <input
                        type="text"
                        className="form-control"
                        disabled={!canWriteDispatch}
                        placeholder="Motivo documentado de devolución..."
                        value={returnReason}
                        onChange={(e) => setReturnReason(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={!canWriteDispatch}
                        onClick={() => {
                          try {
                            const targetId =
                              returnAllocationId ||
                              selectedOrder.lines[0]?.allocations[0]?.id ||
                              '';
                            const { returnRecord } = txReturnSalesOrderAllocation({
                              salesOrderId: selectedOrder.id,
                              orderAllocationId: targetId,
                              qtyToReturn: returnQty,
                              itemCondition: returnCondition,
                              reason: returnReason,
                              actorName
                            });
                            refreshAll();
                            setReturnReason('');
                            notify(
                              `Devolución ${returnRecord.returnCode} procesada. Conservó propietario ${returnRecord.ownerId} y lote ${returnRecord.lotId}.`,
                              'success'
                            );
                          } catch (err) {
                            notify(err instanceof Error ? err.message : String(err), 'error');
                          }
                        }}
                      >
                        Procesar Devolución al Lote Original
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.45rem' }}>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        Cancelar pedido antes del despacho libera automáticamente todas las reservas activas de inventario.
                      </div>
                      <input
                        type="text"
                        className="form-control"
                        disabled={!canWriteSales}
                        placeholder="Motivo de cancelación..."
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={!canWriteSales || selectedOrder.status === 'cancelled'}
                        onClick={() => {
                          try {
                            const { releasedAllocationsCount } = txCancelSalesOrder({
                              salesOrderId: selectedOrder.id,
                              reason: cancelReason,
                              actorName
                            });
                            refreshAll();
                            setCancelReason('');
                            notify(
                              `Pedido cancelado. Se liberaron ${releasedAllocationsCount} reserva(s) de inventario.`,
                              'success'
                            );
                          } catch (err) {
                            notify(err instanceof Error ? err.message : String(err), 'error');
                          }
                        }}
                      >
                        <XCircle size={15} /> Cancelar y Liberar Reservas
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: CLIENTES (ANTI-DUPLICADOS, PROTECCIÓN DE DATOS E HISTORIAL)    */}
      {/* ===================================================================== */}
      {effectiveTab === 'CUSTOMERS' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(390px, 100%), 1fr))',
            gap: '1.25rem',
            alignItems: 'start'
          }}
        >
          {/* FORMULARIO DE REGISTRO DE CLIENTE SIN DATOS INNECESARIOS */}
          <div className="card">
            <span className="badge badge-gold" style={{ marginBottom: '0.4rem' }}>
              PREVENCIÓN DE DUPLICADOS Y PRIVACIDAD ACTIVA
            </span>
            <h2 style={{ fontSize: '1.15rem', margin: '0 0 0.75rem 0' }}>
              Registrar Cliente (Datos Esenciales)
            </h2>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '0.9rem' }}>
              El sistema normaliza el número de WhatsApp y el documento para impedir clientes duplicados y conservar todo el historial comercial unificado.
            </p>

            <div style={{ display: 'grid', gap: '0.7rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Nombre Completo *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Ej: María Fernanda Gómez"
                  value={custFullName}
                  onChange={(e) => setCustFullName(e.target.value)}
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.65rem'
                }}
              >
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">WhatsApp / Teléfono *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej: 300 123 4567"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Fuente de Adquisición</label>
                  <select
                    className="form-control"
                    value={custSource}
                    onChange={(e) =>
                      setCustSource(e.target.value as AcquisitionSourceChannel)
                    }
                  >
                    {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '110px 1fr',
                  gap: '0.65rem'
                }}
              >
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tipo Doc (Opc.)</label>
                  <select
                    className="form-control"
                    value={custDocType}
                    onChange={(e) => setCustDocType(e.target.value)}
                  >
                    <option value="CC">CC</option>
                    <option value="NIT">NIT</option>
                    <option value="CE">CE</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Número Documento (Opcional)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Solo si requiere facturación / envío..."
                    value={custDocNumber}
                    onChange={(e) => setCustDocNumber(e.target.value)}
                  />
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.65rem'
                }}
              >
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Ciudad</label>
                  <input
                    type="text"
                    className="form-control"
                    value={custCity}
                    onChange={(e) => setCustCity(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Email (Opcional)</label>
                  <input
                    type="email"
                    className="form-control"
                    value={custEmail}
                    onChange={(e) => setCustEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Dirección de Envío (Solo si solicita domicilio)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Calle / Carrera / Barrio..."
                  value={custAddress}
                  onChange={(e) => setCustAddress(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Notas Comerciales</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Preferencias de entrega o garantía..."
                  value={custNotes}
                  onChange={(e) => setCustNotes(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  try {
                    const { customer } = registerOrValidateCustomer({
                      fullName: custFullName,
                      phoneWhatsapp: custPhone,
                      documentType: custDocType,
                      documentNumber: custDocNumber,
                      email: custEmail,
                      city: custCity,
                      shippingAddress: custAddress,
                      acquisitionSource: custSource,
                      notes: custNotes
                    });
                    refreshAll();
                    setSelectedCustomerForHistoryId(customer.id);
                    setCustFullName('');
                    setCustPhone('');
                    setCustDocNumber('');
                    setCustEmail('');
                    setCustAddress('');
                    setCustNotes('');
                    notify(`Cliente ${customer.customerCode} (${customer.fullName}) registrado.`, 'success');
                  } catch (err) {
                    notify(err instanceof Error ? err.message : String(err), 'error');
                  }
                }}
              >
                <UserCheck size={16} /> Validar Duplicados y Registrar Cliente
              </button>
            </div>
          </div>

          {/* DIRECTORIO DE CLIENTES E HISTORIAL COMERCIAL */}
          <div className="card">
            <h2 style={{ fontSize: '1.15rem', margin: '0 0 0.85rem 0' }}>
              Directorio e Historial Comercial de Clientes ({customerSummaries.length})
            </h2>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Código / Cliente</th>
                    <th>Contacto (Protegido)</th>
                    <th>Fuente</th>
                    <th>Pedidos</th>
                    <th>Total Comprado</th>
                    <th>Por Cobrar</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {customerSummaries.map((cs) => (
                    <tr
                      key={cs.customer.id}
                      onClick={() => setSelectedCustomerForHistoryId(cs.customer.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <strong>{cs.customer.customerCode}</strong>
                        <div>{cs.customer.fullName}</div>
                      </td>
                      <td>
                        <div>
                          {maskProtectedPhone(
                            cs.customer.phoneWhatsapp,
                            revealPersonalData && !isOwnerRole
                          )}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          {cs.customer.city} •{' '}
                          {maskProtectedAddress(
                            cs.customer.shippingAddress,
                            revealPersonalData && !isOwnerRole
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-neutral">
                          {SOURCE_LABELS[cs.customer.acquisitionSource]}
                        </span>
                      </td>
                      <td>{cs.ordersCount}</td>
                      <td>
                        <strong>{formatCOP(cs.totalPurchasedCop)}</strong>
                      </td>
                      <td>
                        <span
                          style={{
                            color:
                              cs.pendingBalanceCop > 0
                                ? 'var(--status-warning)'
                                : 'var(--text-muted)'
                          }}
                        >
                          {formatCOP(cs.pendingBalanceCop)}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTab('ORDERS');
                            openNewOrderBuilder(cs.customer.id);
                          }}
                        >
                          + Crear Pedido
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* DETALLE DE HISTORIAL COMERCIAL DEL CLIENTE SELECCIONADO */}
            {(() => {
              const targetSummary =
                customerSummaries.find(
                  (c) => c.customer.id === selectedCustomerForHistoryId
                ) || customerSummaries[0];
              if (!targetSummary) return null;
              return (
                <div
                  style={{
                    marginTop: '1rem',
                    padding: '0.9rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-elevated)'
                  }}
                >
                  <strong>
                    Historial Comercial Conservado — {targetSummary.customer.fullName} (
                    {targetSummary.customer.customerCode})
                  </strong>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                    Pedidos realizados: {targetSummary.ordersCount} | Total facturado:{' '}
                    {formatCOP(targetSummary.totalPurchasedCop)} | Pagado:{' '}
                    {formatCOP(targetSummary.totalPaidCop)} | Devoluciones:{' '}
                    {formatCOP(targetSummary.totalReturnedCop)}
                  </div>
                  <div style={{ marginTop: '0.55rem', fontSize: '0.8rem' }}>
                    {targetSummary.orders.map((o) => (
                      <div
                        key={o.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '0.3rem 0',
                          borderBottom: '1px dashed var(--border-subtle)'
                        }}
                      >
                        <span>
                          <strong>{o.orderNumber}</strong> ({o.orderDate}) — Estado: {o.status}
                        </span>
                        <span>Pago: {o.paymentStatus}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: PIPELINE CRM (PROSPECTOS, SEGUIMIENTO Y CONVERSIÓN)            */}
      {/* ===================================================================== */}
      {effectiveTab === 'CRM_PIPELINE' && (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))',
              gap: '1.25rem',
              marginBottom: '1.25rem'
            }}
          >
            {/* NUEVO PROSPECTO CRM */}
            <div className="card">
              <span className="badge badge-gold" style={{ marginBottom: '0.4rem' }}>
                CAPTACIÓN Y CONSULTA DE PRODUCTOS (SIN MENSAJES AUTOMÁTICOS)
              </span>
              <h2 style={{ fontSize: '1.12rem', margin: '0 0 0.75rem 0' }}>
                Registrar Prospecto (Lead CRM)
              </h2>

              <div style={{ display: 'grid', gap: '0.65rem' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.65rem'
                  }}
                >
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Nombre del prospecto *"
                    value={leadFullName}
                    onChange={(e) => setLeadFullName(e.target.value)}
                  />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="WhatsApp / Teléfono *"
                    value={leadPhone}
                    onChange={(e) => setLeadPhone(e.target.value)}
                  />
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.65rem'
                  }}
                >
                  <select
                    className="form-control"
                    value={leadSource}
                    onChange={(e) =>
                      setLeadSource(e.target.value as AcquisitionSourceChannel)
                    }
                  >
                    {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        Fuente: {v}
                      </option>
                    ))}
                  </select>

                  <input
                    type="date"
                    className="form-control"
                    value={leadFollowupDate}
                    onChange={(e) => setLeadFollowupDate(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Producto Consultado (SKU + Stock Disponible Real)</label>
                  <select
                    className="form-control"
                    value={leadSku}
                    onChange={(e) => setLeadSku(e.target.value)}
                  >
                    {Object.values(invState.catalog).map((cat) => {
                      const avail = invState.allocations
                        .filter((a) => a.sku === cat.sku)
                        .reduce((s, a) => s + a.qtyAvailable, 0);
                      return (
                        <option key={cat.sku} value={cat.sku}>
                          {cat.sku} — {cat.productName} | Stock Disponible: {avail} uds
                        </option>
                      );
                    })}
                  </select>
                </div>

                <input
                  type="text"
                  className="form-control"
                  placeholder="Notas de la consulta, presupuesto o requerimiento..."
                  value={leadNotes}
                  onChange={(e) => setLeadNotes(e.target.value)}
                />

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    try {
                      const lead = createCrmLead({
                        fullName: leadFullName,
                        phoneWhatsapp: leadPhone,
                        sourceChannel: leadSource,
                        interestedSku: leadSku,
                        assignedTo: actorName,
                        nextFollowupAt: leadFollowupDate,
                        notes: leadNotes
                      });
                      refreshAll();
                      setSelectedLeadId(lead.id);
                      setLeadFullName('');
                      setLeadPhone('');
                      setLeadNotes('');
                      notify(`Prospecto ${lead.leadCode} creado en etapa NUEVO.`, 'success');
                    } catch (err) {
                      notify(err instanceof Error ? err.message : String(err), 'error');
                    }
                  }}
                >
                  <Plus size={16} /> Agregar Prospecto al Pipeline
                </button>
              </div>
            </div>

            {/* REGISTRAR SEGUIMIENTO Y AVANCE DE ETAPA */}
            <div className="card">
              <span className="badge badge-neutral" style={{ marginBottom: '0.4rem' }}>
                BITÁCORA MANUAL DE SEGUIMIENTO COMERCIAL
              </span>
              <h2 style={{ fontSize: '1.12rem', margin: '0 0 0.75rem 0' }}>
                Seguimiento, Historial y Conversión a Cliente
              </h2>

              {salesState.leads.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                  No hay prospectos registrados aún. Registra el primer prospecto en el panel izquierdo para gestionar su seguimiento en el Pipeline.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '0.65rem' }}>
                  <select
                    className="form-control"
                    value={selectedLeadId || salesState.leads[0]?.id || ''}
                    onChange={(e) => setSelectedLeadId(e.target.value)}
                  >
                    {salesState.leads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.leadCode} — {l.fullName} ({l.interestedSku}) | Etapa: {l.stage.toUpperCase()}
                      </option>
                    ))}
                  </select>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      gap: '0.6rem'
                    }}
                  >
                    <select
                      className="form-control"
                      value={followupStage}
                      onChange={(e) => setFollowupStage(e.target.value as CrmLeadStage)}
                    >
                      {LEAD_STAGES.map((st) => (
                        <option key={st.id} value={st.id}>
                          Etapa: {st.label}
                        </option>
                      ))}
                    </select>

                    <select
                      className="form-control"
                      value={followupType}
                      onChange={(e) =>
                        setFollowupType(
                          e.target.value as
                            | 'call'
                            | 'whatsapp_manual_note'
                            | 'store_visit'
                            | 'quote_sent'
                            | 'status_change'
                            | 'note'
                        )
                      }
                    >
                      <option value="whatsapp_manual_note">Nota WhatsApp Manual</option>
                      <option value="call">Llamada Telefónica</option>
                      <option value="quote_sent">Cotización Enviada</option>
                      <option value="store_visit">Visita en Tienda</option>
                      <option value="note">Nota Interna</option>
                    </select>

                    <input
                      type="date"
                      className="form-control"
                      value={followupNextDate}
                      onChange={(e) => setFollowupNextDate(e.target.value)}
                    />
                  </div>

                  <input
                    type="text"
                    className="form-control"
                    placeholder="Resumen del seguimiento o respuesta del prospecto *"
                    value={followupSummary}
                    onChange={(e) => setFollowupSummary(e.target.value)}
                  />

                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!canWriteSales}
                      onClick={() => {
                        try {
                          const targetId = selectedLeadId || salesState.leads[0]?.id;
                          if (!targetId) return;
                          addLeadFollowupAndStage({
                            leadId: targetId,
                            newStage: followupStage,
                            interactionType: followupType,
                            summary: followupSummary,
                            nextFollowupAt: followupNextDate,
                            actorName
                          });
                          refreshAll();
                          setFollowupSummary('');
                          notify('Seguimiento guardado en el historial del prospecto.', 'success');
                        } catch (err) {
                          notify(err instanceof Error ? err.message : String(err), 'error');
                        }
                      }}
                    >
                      Guardar Seguimiento
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        try {
                          const targetId = selectedLeadId || salesState.leads[0]?.id;
                          if (!targetId) return;
                          const customer = convertLeadToCustomer(targetId, actorName);
                          refreshAll();
                          notify(
                            `Prospecto convertido y vinculado al cliente ${customer.customerCode} (${customer.fullName}).`,
                            'success'
                          );
                        } catch (err) {
                          notify(err instanceof Error ? err.message : String(err), 'error');
                        }
                      }}
                    >
                      <UserCheck size={15} /> Convertir en Cliente (Sin Duplicar)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* TABLERO VISUAL DE PIPELINE CRM POR ETAPAS */}
          <div className="card">
            <h2 style={{ fontSize: '1.12rem', margin: '0 0 0.9rem 0' }}>
              Tablero de Pipeline Comercial CRM
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '0.8rem'
              }}
            >
              {LEAD_STAGES.map((stageObj) => {
                const stageLeads = salesState.leads.filter((l) => l.stage === stageObj.id);
                return (
                  <div
                    key={stageObj.id}
                    style={{
                      padding: '0.8rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-elevated)',
                      minHeight: '220px'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '0.65rem'
                      }}
                    >
                      <span className={`badge ${stageObj.badgeClass}`}>{stageObj.label}</span>
                      <strong>{stageLeads.length}</strong>
                    </div>

                    {stageLeads.length === 0 ? (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Sin prospectos en esta etapa
                      </div>
                    ) : (
                      stageLeads.map((lead) => (
                        <div
                          key={lead.id}
                          onClick={() => setSelectedLeadId(lead.id)}
                          style={{
                            padding: '0.65rem',
                            borderRadius: '6px',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            marginBottom: '0.55rem',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>
                            {lead.leadCode} — {lead.fullName}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--accent-gold)' }}>
                            SKU: {lead.interestedSku}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            Fuente: {SOURCE_LABELS[lead.sourceChannel]}
                          </div>
                          {lead.nextFollowupAt && (
                            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                              Próx. seguimiento: {lead.nextFollowupAt}
                            </div>
                          )}
                          <div
                            style={{
                              fontSize: '0.74rem',
                              marginTop: '0.35rem',
                              color: 'var(--text-secondary)'
                            }}
                          >
                            {lead.notes}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: DESPACHOS, ENVÍOS Y SEGUIMIENTO DE GUÍAS                       */}
      {/* ===================================================================== */}
      {effectiveTab === 'SHIPMENTS' && (
        <div className="card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem'
            }}
          >
            <div>
              <span className="badge badge-gold">CONTROL LOGÍSTICO DE ENVÍOS</span>
              <h2 style={{ fontSize: '1.15rem', margin: '0.3rem 0 0 0' }}>
                Despachos, Transportadoras, Guías, Costos y Seguimiento ({salesState.shipments.length})
              </h2>
            </div>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código Despacho / Pedido</th>
                  <th>Destinatario / Ciudad</th>
                  <th>Transportadora / Guía</th>
                  <th>Costo Envío</th>
                  <th>Estado</th>
                  <th>Fecha Despacho / Entrega</th>
                  <th>Historial Seguimiento</th>
                </tr>
              </thead>
              <tbody>
                {salesState.shipments.map((shp) => (
                  <tr key={shp.id}>
                    <td>
                      <strong>{shp.shipmentCode}</strong>
                      <div style={{ fontSize: '0.76rem', color: 'var(--accent-gold)' }}>
                        Pedido: {shp.orderNumber}
                      </div>
                    </td>
                    <td>
                      <div>{shp.recipientName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {shp.destinationCity} •{' '}
                        {maskProtectedAddress(
                          shp.destinationAddress,
                          revealPersonalData && !isOwnerRole
                        )}
                      </div>
                    </td>
                    <td>
                      <strong>{shp.carrierName}</strong>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        Guía: {shp.trackingNumber || 'Pendiente'}
                      </div>
                    </td>
                    <td>
                      <strong>{formatCOP(shp.shippingCostCop)}</strong>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          shp.status === 'delivered'
                            ? 'badge-success'
                            : shp.status === 'cancelled'
                              ? 'badge-danger'
                              : 'badge-gold'
                        }`}
                      >
                        {shp.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>
                      <div>Despacho: {shp.dispatchedAt ? shp.dispatchedAt.slice(0, 16).replace('T', ' ') : '—'}</div>
                      <div>Entrega: {shp.deliveredAt ? shp.deliveredAt.slice(0, 16).replace('T', ' ') : '—'}</div>
                    </td>
                    <td style={{ fontSize: '0.76rem' }}>
                      {shp.trackingEvents.map((ev) => (
                        <div key={ev.id} style={{ marginBottom: '0.2rem' }}>
                          <strong>[{ev.status.toUpperCase()}]</strong> {ev.detail}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: SUITE AUTOMATIZADA DE LAS 9 PRUEBAS OBLIGATORIAS               */}
      {/* ===================================================================== */}
      {effectiveTab === 'TESTS_9' && (
        <div className="card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              marginBottom: '1rem'
            }}
          >
            <div>
              <span className="badge badge-gold">VERIFICACIÓN TRANSACCIONAL EN SANDBOX</span>
              <h2 style={{ fontSize: '1.18rem', margin: '0.3rem 0 0 0' }}>
                Batería Automatizada de las 9 Pruebas Obligatorias de Ventas, Pedidos y CRM
              </h2>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Ejecuta en memoria aislada los 9 escenarios críticos exigidos sin insertar pedidos ni clientes ficticios en la base de producción.
              </p>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              disabled={runningTests}
              onClick={handleRun9Tests}
            >
              <Play size={16} />
              {runningTests ? 'Ejecutando 9 Pruebas...' : 'Ejecutar 9 Pruebas Obligatorias'}
            </button>
          </div>

          {testResults.length === 0 ? (
            <div
              style={{
                padding: '1.25rem',
                borderRadius: '8px',
                border: '1px dashed var(--border-subtle)',
                textAlign: 'center',
                color: 'var(--text-secondary)'
              }}
            >
              Haz clic en <strong>Ejecutar 9 Pruebas Obligatorias</strong> para verificar concurrencia de última unidad, pedido multivariado, dos propietarios en la misma venta, cancelación, devolución, pago parcial, despacho, duplicados y rentabilidad por pedido.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.85rem' }}>
              {testResults.map((t) => (
                <div
                  key={t.testId}
                  style={{
                    padding: '0.95rem',
                    borderRadius: '8px',
                    border: `1px solid ${
                      t.passed ? 'var(--status-success)' : 'var(--status-danger)'
                    }`,
                    background: 'var(--bg-elevated)'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.4rem'
                    }}
                  >
                    <strong>
                      {t.testId} — {t.title}
                    </strong>
                    <span className={`badge ${t.passed ? 'badge-success' : 'badge-danger'}`}>
                      {t.passed ? 'PASÓ VERIFICACIÓN' : 'FALLÓ'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                    <strong>Escenario:</strong> {t.scenario}
                  </div>
                  <div style={{ fontSize: '0.83rem', marginTop: '0.25rem' }}>
                    <strong>Esperado:</strong> {t.expected}
                  </div>
                  <div
                    style={{
                      fontSize: '0.83rem',
                      marginTop: '0.25rem',
                      color: 'var(--accent-gold)'
                    }}
                  >
                    <strong>Resultado Obtenido:</strong> {t.actual}
                  </div>
                  <ul style={{ margin: '0.45rem 0 0 1.2rem', fontSize: '0.79rem', color: 'var(--text-muted)' }}>
                    {t.details.map((d, idx) => (
                      <li key={idx}>{d}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
