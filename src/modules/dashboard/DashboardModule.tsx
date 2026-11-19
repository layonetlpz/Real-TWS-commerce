import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  DollarSign,
  Eye,
  FileSpreadsheet,
  MoreHorizontal,
  Package,
  PackageCheck,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Truck
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useOwnerScope } from '../../hooks/useOwnerScope';
import {
  fetchDashboardLiveSnapshot,
  fetchLiveBusinessSettings,
  type DashboardLiveSnapshot,
  type DbAvailableInventoryRow,
  type DbInventoryIncidenceRow
} from '../../services/supabaseDataBridge';
import { formatCOP, formatDateDDMMYYYY, formatInteger } from '../../utils/formatters';
import { DataTable } from '../../components/DataTable';
import { FilterBar } from '../../components/FilterBar';
import { ErrorState, LoadingState } from '../../components/StatusStates';
import {
  GlassCard,
  GlassDrawer,
  GlassDropdown,
  ModuleHeader,
  SegmentedTabs,
  StatCard
} from '../../components/glass';
import type { TableColumn } from '../../types/domain';

type PeriodFilter = 'ALL' | '30D' | '7D';

export function DashboardModule() {
  const navigate = useNavigate();
  const { activeEffectiveRole } = useAuth();
  const { selectedOwnerScope } = useOwnerScope();

  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<DashboardLiveSnapshot | null>(null);
  const [lowStockThreshold, setLowStockThreshold] = useState(3);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('ALL');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedLot, setSelectedLot] = useState<DbAvailableInventoryRow | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const [liveSnap, settingsRes] = await Promise.all([
      fetchDashboardLiveSnapshot(selectedOwnerScope),
      fetchLiveBusinessSettings()
    ]);
    setSnapshot(liveSnap);
    if (settingsRes.data) {
      setLowStockThreshold(settingsRes.data.default_low_stock_threshold ?? 3);
    }
    setLoading(false);
  }, [selectedOwnerScope]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const filteredSales = useMemo(() => {
    if (!snapshot) return [];
    if (periodFilter === 'ALL') return snapshot.salesRows;
    const days = periodFilter === '7D' ? 7 : 30;
    const cutoff = Date.now() - days * 86400 * 1000;
    return snapshot.salesRows.filter((s) => {
      const ts = new Date(s.order_date).getTime();
      return Number.isFinite(ts) && ts >= cutoff;
    });
  }, [periodFilter, snapshot]);

  const periodSalesCop = useMemo(
    () => filteredSales.reduce((acc, row) => acc + Number(row.net_revenue_cop || 0), 0),
    [filteredSales]
  );

  const periodUnitsSold = useMemo(
    () => filteredSales.reduce((acc, row) => acc + Number(row.net_units_sold || 0), 0),
    [filteredSales]
  );

  const chartByOwner = useMemo(() => {
    if (!snapshot) return [];
    const byOwner = new Map<
      string,
      {
        ownerLabel: string;
        physicalUnits: number;
        availableUnits: number;
        pendingInspection: number;
      }
    >();

    for (const row of snapshot.inventoryRows) {
      const current = byOwner.get(row.owner_id) ?? {
        ownerLabel: `${row.owner_name}`,
        physicalUnits: 0,
        availableUnits: 0,
        pendingInspection: 0
      };
      current.physicalUnits += Number(row.qty_physical || 0);
      current.availableUnits += Number(row.qty_available || 0);
      current.pendingInspection += Number(row.qty_pending_inspection || 0);
      byOwner.set(row.owner_id, current);
    }
    return Array.from(byOwner.values());
  }, [snapshot]);

  const filteredInventory = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.inventoryRows.filter((row) => {
      if (statusFilter === 'AVAILABLE' && row.qty_available <= 0) return false;
      if (statusFilter === 'PENDING_INSPECTION' && row.qty_pending_inspection <= 0) return false;
      if (
        statusFilter === 'LOW_STOCK' &&
        (row.qty_available > lowStockThreshold || row.qty_physical === 0)
      ) {
        return false;
      }
      if (statusFilter === 'PENDING_COST' && row.effective_unit_cost_cop !== null) return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return (
          row.sku.toLowerCase().includes(q) ||
          row.product_name.toLowerCase().includes(q) ||
          row.lot_id.toLowerCase().includes(q) ||
          row.owner_name.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [snapshot, statusFilter, searchQuery, lowStockThreshold]);

  const inventoryColumns: TableColumn<DbAvailableInventoryRow>[] = [
    {
      key: 'sku',
      header: 'Producto',
      sortValue: (r) => r.sku,
      render: (r) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--rtw-text-primary)' }}>{r.product_name}</div>
          <div className="rtw-mono" style={{ fontSize: '0.74rem', color: 'var(--rtw-text-muted)' }}>
            {r.sku} · {r.lot_id}
          </div>
        </div>
      )
    },
    {
      key: 'owner',
      header: 'Propietario',
      sortValue: (r) => r.owner_name,
      render: (r) => (
        <span className="rtw-badge rtw-badge-gold">
          {r.owner_name}
        </span>
      )
    },
    {
      key: 'physical',
      header: 'Físico',
      align: 'right',
      sortValue: (r) => r.qty_physical,
      render: (r) => <span className="rtw-num">{formatInteger(r.qty_physical)}</span>
    },
    {
      key: 'available',
      header: 'Disponible',
      align: 'right',
      sortValue: (r) => r.qty_available,
      render: (r) => (
        <span
          className={`rtw-badge rtw-num ${
            r.qty_available > 0 ? 'rtw-badge-success' : 'rtw-badge-warning'
          }`}
        >
          {formatInteger(r.qty_available)}
        </span>
      )
    },
    {
      key: 'cost',
      header: 'Costo Unit.',
      align: 'right',
      sortValue: (r) => r.effective_unit_cost_cop ?? -1,
      render: (r) =>
        r.effective_unit_cost_cop === null ? (
          <span className="rtw-badge rtw-badge-warning">Pendiente</span>
        ) : (
          <span className="rtw-num">{formatCOP(r.effective_unit_cost_cop)}</span>
        )
    },
    {
      key: 'detail',
      header: 'Detalle',
      align: 'right',
      render: (r) => (
        <button
          type="button"
          className="rtw-btn rtw-btn-outline btn-sm"
          onClick={() => setSelectedLot(r)}
          title="Ver detalles del lote"
        >
          <Eye size={14} />
          Detalle
        </button>
      )
    }
  ];

  const incidenceColumns: TableColumn<DbInventoryIncidenceRow>[] = [
    {
      key: 'severity',
      header: 'Nivel',
      sortValue: (r) => r.severity,
      render: (r) => (
        <span
          className={`rtw-badge ${
            r.severity === 'ALTA'
              ? 'rtw-badge-danger'
              : r.severity === 'MEDIA'
                ? 'rtw-badge-warning'
                : 'rtw-badge-info'
          }`}
        >
          {r.severity}
        </span>
      )
    },
    {
      key: 'description',
      header: 'Incidencia',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{r.description}</div>
          <div className="rtw-mono" style={{ fontSize: '0.73rem', color: 'var(--rtw-text-muted)' }}>
            {r.sku_or_owner_ref} · {formatDateDDMMYYYY(r.created_at)}
          </div>
        </div>
      )
    },
    {
      key: 'status',
      header: 'Estado',
      align: 'right',
      sortValue: (r) => r.status,
      render: (r) => (
        <span
          className={`rtw-badge ${
            r.status === 'Resuelto' ? 'rtw-badge-success' : 'rtw-badge-warning'
          }`}
        >
          {r.status}
        </span>
      )
    }
  ];

  if (loading && !snapshot) {
    return <LoadingState label="Cargando resumen ejecutivo..." />;
  }

  if (!snapshot) {
    return (
      <ErrorState
        message="No se pudo obtener el resumen operativo desde Supabase."
        onRetry={() => void loadDashboard()}
      />
    );
  }

  const hasEmptyDatabase =
    snapshot.inventoryRows.length === 0 && snapshot.owners.length === 0;
  const canImport =
    activeEffectiveRole === 'ADMIN' || activeEffectiveRole === 'INVENTORY_OPERATOR';
  const canSell =
    activeEffectiveRole === 'ADMIN' || activeEffectiveRole === 'SALES_OPERATOR';

  const quickMenuOptions = [
    ...(canImport
      ? [
          {
            id: 'import',
            label: 'Importar inventario Excel',
            icon: <FileSpreadsheet size={14} />,
            onClick: () => navigate('/operaciones/importacion')
          },
          {
            id: 'purchase',
            label: 'Nueva compra / recepción',
            icon: <Truck size={14} />,
            onClick: () => navigate('/operaciones/recepciones-compras')
          }
        ]
      : []),
    {
      id: 'refresh',
      label: 'Actualizar datos',
      icon: <RefreshCw size={14} />,
      onClick: () => void loadDashboard()
    }
  ];

  return (
    <div className="module-container">
      {/* Cabecera Ejecutiva */}
      <ModuleHeader
        variant="dark"
        eyebrow="REAL TWS · PANEL GENERAL"
        badge={
          <span className="rtw-badge rtw-badge-gold">
            {selectedOwnerScope === 'ALL' ? 'Vista global' : `Propietario: ${selectedOwnerScope}`}
          </span>
        }
        title="Resumen Ejecutivo"
        subtitle="Stock disponible para venta, valorización de inventario e incidencias recientes."
        actions={
          <>
            <SegmentedTabs<PeriodFilter>
              variant="dark"
              value={periodFilter}
              onChange={setPeriodFilter}
              ariaLabel="Periodo de ventas"
              items={[
                { id: 'ALL', label: 'Histórico' },
                { id: '30D', label: '30 días' },
                { id: '7D', label: '7 días' }
              ]}
            />
            {canSell ? (
              <button
                type="button"
                className="rtw-btn rtw-btn-gold btn-sm"
                onClick={() => navigate('/comercial/pedidos')}
              >
                <ShoppingCart size={14} />
                Nuevo pedido
              </button>
            ) : (
              <button
                type="button"
                className="rtw-btn rtw-btn-gold btn-sm"
                onClick={() => navigate('/operaciones/inventario')}
              >
                <Boxes size={14} />
                Ver inventario
              </button>
            )}
            <GlassDropdown
              label="Más"
              icon={<MoreHorizontal size={14} />}
              variant="ghost-dark"
              options={quickMenuOptions}
            />
          </>
        }
      />

      {snapshot.errors.length > 0 && (
        <ErrorState
          message={`Algunas consultas reportaron alertas: ${snapshot.errors.join(' · ')}`}
          onRetry={() => void loadDashboard()}
        />
      )}

      {hasEmptyDatabase && (
        <GlassCard goldAccent>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px'
            }}
          >
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>
                Tu inventario aún está vacío
              </h3>
              <p style={{ fontSize: '0.84rem', color: 'var(--rtw-text-secondary)', marginTop: '4px' }}>
                Importa tu hoja de inventario inicial o registra la primera recepción de mercancía para comenzar.
              </p>
            </div>
            {canImport && (
              <button
                type="button"
                className="rtw-btn rtw-btn-primary"
                onClick={() => navigate('/operaciones/importacion')}
              >
                <FileSpreadsheet size={16} />
                Importar inventario
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </GlassCard>
      )}

      {/* KPIs Principales */}
      <section className="rtw-kpi-grid">
        <StatCard
          staggerIndex={1}
          label="Stock Físico"
          value={`${formatInteger(snapshot.totals.physicalUnits)} u.`}
          sub={`${formatInteger(snapshot.totals.uniqueSkus)} SKUs · ${formatInteger(snapshot.owners.length)} propietarios`}
          icon={<Package size={16} />}
        />

        <StatCard
          staggerIndex={2}
          tone="success"
          label="Disponible"
          value={`${formatInteger(snapshot.totals.availableUnits)} u.`}
          sub={`${formatInteger(snapshot.totals.pendingInspectionUnits)} en revisión · ${formatInteger(snapshot.totals.reservedUnits)} reserv.`}
          icon={<PackageCheck size={16} />}
        />

        <StatCard
          staggerIndex={3}
          tone="gold"
          label="Valor en Costo"
          value={formatCOP(snapshot.totals.inventoryCostCop)}
          sub="Según costos confirmados por lote"
          icon={<DollarSign size={16} />}
        />

        <StatCard
          staggerIndex={4}
          label={`Ventas (${periodFilter === 'ALL' ? 'Histórico' : periodFilter})`}
          value={formatCOP(periodSalesCop)}
          sub={
            periodFilter === 'ALL'
              ? `${formatInteger(periodUnitsSold)} u. · Utilidad: ${formatCOP(snapshot.totals.attributableProfitCop)}`
              : `${formatInteger(periodUnitsSold)} u. en período · Utilidad hist.: ${formatCOP(snapshot.totals.attributableProfitCop)}`
          }
          icon={<TrendingUp size={16} />}
        />

        <StatCard
          staggerIndex={5}
          tone={snapshot.totals.openIncidencesCount > 0 ? 'warning' : 'success'}
          label="Incidencias"
          value={formatInteger(snapshot.totals.openIncidencesCount)}
          sub={`Defectuosas: ${formatInteger(snapshot.totals.defectiveUnits)} · Alerta ≤ ${lowStockThreshold}`}
          icon={<AlertTriangle size={16} />}
        />
      </section>

      {/* Gráfico + Incidencias */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(330px, 100%), 1fr))',
          gap: '18px'
        }}
      >
        <GlassCard>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 800 }}>
                Stock por propietario
              </h3>
              <p style={{ fontSize: '0.76rem', color: 'var(--rtw-text-muted)' }}>
                Comparativa entre unidades físicas, disponibles y en revisión
              </p>
            </div>
            <button
              type="button"
              className="rtw-btn rtw-btn-outline btn-sm"
              onClick={() => navigate('/operaciones/inventario')}
            >
              Ver lotes
            </button>
          </div>
          {chartByOwner.length === 0 ? (
            <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--rtw-text-muted)', fontSize: '0.84rem' }}>
              Sin unidades registradas en inventario aún.
            </div>
          ) : (
            <div style={{ width: '100%', height: 270 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartByOwner}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--rtw-chart-grid)" />
                  <XAxis dataKey="ownerLabel" tick={{ fontSize: 11, fill: 'var(--rtw-chart-axis)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--rtw-chart-axis)' }} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(13, 17, 25, 0.94)',
                      border: '1px solid rgba(212, 175, 55, 0.45)',
                      borderRadius: '12px',
                      color: '#f8fafc',
                      fontSize: '12px'
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="physicalUnits" name="Físicas" fill="var(--rtw-chart-bar-primary)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="availableUnits" name="Disponibles" fill="var(--rtw-chart-bar-available)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="pendingInspection" name="En Revisión" fill="var(--rtw-chart-bar-gold)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 800 }}>
                Incidencias recientes ({snapshot.incidences.length})
              </h3>
              <p style={{ fontSize: '0.76rem', color: 'var(--rtw-text-muted)' }}>
                Novedades de calidad, costos o conciliación
              </p>
            </div>
          </div>
          <DataTable
            columns={incidenceColumns}
            data={snapshot.incidences}
            rowKey={(row) => row.id}
            pageSize={5}
            mobileTitle={(row) => `${row.severity} · ${row.sku_or_owner_ref}`}
            emptyTitle="Todo en orden"
            emptyDescription="No hay incidencias pendientes en este alcance."
          />
        </GlassCard>
      </div>

      {/* Tabla consolidada de inventario */}
      <GlassCard>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '14px'
          }}
        >
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>
              Inventario por lote ({filteredInventory.length})
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--rtw-text-muted)' }}>
              Ordena por columna o abre cualquier lote para ver su desglose completo.
            </p>
          </div>
        </div>

        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          placeholder="Buscar SKU, producto, lote o propietario..."
          statusOptions={[
            { value: 'ALL', label: 'Todos los estados' },
            { value: 'AVAILABLE', label: 'Con stock disponible' },
            { value: 'PENDING_INSPECTION', label: 'Pendientes de revisión' },
            { value: 'LOW_STOCK', label: `Stock bajo (≤ ${lowStockThreshold})` },
            { value: 'PENDING_COST', label: 'Con costo pendiente' }
          ]}
          onReset={() => {
            setSearchQuery('');
            setStatusFilter('ALL');
          }}
        />

        <DataTable
          columns={inventoryColumns}
          data={filteredInventory}
          rowKey={(row) => `${row.lot_id}::${row.sku}::${row.owner_id}`}
          pageSize={10}
          mobileTitle={(row) => `${row.product_name} (${row.sku})`}
          emptyTitle="Sin coincidencias"
          emptyDescription="Prueba con otro término de búsqueda o cambia el filtro de estado."
        />
      </GlassCard>

      {/* Drawer de detalle bajo demanda */}
      <GlassDrawer
        open={Boolean(selectedLot)}
        onClose={() => setSelectedLot(null)}
        title={selectedLot ? selectedLot.product_name : ''}
        subtitle={selectedLot ? `SKU ${selectedLot.sku} · Lote ${selectedLot.lot_id}` : undefined}
        footer={
          <button
            type="button"
            className="rtw-btn rtw-btn-primary btn-sm"
            onClick={() => {
              setSelectedLot(null);
              navigate('/operaciones/inventario');
            }}
          >
            Gestionar en Inventario
            <ArrowRight size={14} />
          </button>
        }
      >
        {selectedLot && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span className="rtw-badge rtw-badge-gold">
                {selectedLot.owner_id} · {selectedLot.owner_name}
              </span>
              <span
                className={`rtw-badge ${
                  selectedLot.qty_available > 0 ? 'rtw-badge-success' : 'rtw-badge-warning'
                }`}
              >
                {formatInteger(selectedLot.qty_available)} disponibles
              </span>
            </div>

            <div className="rtw-form-grid">
              <div className="rtw-card" style={{ padding: '12px' }}>
                <div className="rtw-kpi-label">Stock físico</div>
                <div className="rtw-kpi-value" style={{ fontSize: '1.25rem' }}>
                  {formatInteger(selectedLot.qty_physical)}
                </div>
              </div>
              <div className="rtw-card" style={{ padding: '12px' }}>
                <div className="rtw-kpi-label">En revisión</div>
                <div className="rtw-kpi-value" style={{ fontSize: '1.25rem' }}>
                  {formatInteger(selectedLot.qty_pending_inspection)}
                </div>
              </div>
              <div className="rtw-card" style={{ padding: '12px' }}>
                <div className="rtw-kpi-label">Costo unitario</div>
                <div className="rtw-kpi-value" style={{ fontSize: '1.15rem' }}>
                  {selectedLot.effective_unit_cost_cop === null
                    ? 'Pendiente'
                    : formatCOP(selectedLot.effective_unit_cost_cop)}
                </div>
              </div>
            </div>
          </div>
        )}
      </GlassDrawer>
    </div>
  );
}
