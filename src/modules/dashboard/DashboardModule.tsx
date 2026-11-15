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
  CheckCircle2,
  FileSpreadsheet,
  PackageCheck,
  RefreshCw,
  ShoppingCart,
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
        ownerLabel: `${row.owner_id} (${row.owner_name})`,
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
      if (statusFilter === 'LOW_STOCK' && (row.qty_available > lowStockThreshold || row.qty_physical === 0)) {
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
      header: 'SKU',
      sortValue: (r) => r.sku,
      render: (r) => <strong className="rtw-mono">{r.sku}</strong>
    },
    {
      key: 'product',
      header: 'Producto',
      sortValue: (r) => r.product_name,
      render: (r) => r.product_name
    },
    {
      key: 'owner',
      header: 'Propietario',
      sortValue: (r) => r.owner_name,
      render: (r) => (
        <span className="rtw-badge rtw-badge-gold">
          {r.owner_id} · {r.owner_name}
        </span>
      )
    },
    {
      key: 'lot',
      header: 'Lote',
      sortValue: (r) => r.lot_id,
      render: (r) => <span className="rtw-mono">{r.lot_id}</span>
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
      key: 'pending',
      header: 'En Revisión',
      align: 'right',
      sortValue: (r) => r.qty_pending_inspection,
      render: (r) => <span className="rtw-num">{formatInteger(r.qty_pending_inspection)}</span>
    },
    {
      key: 'cost',
      header: 'Costo Unit. COP',
      align: 'right',
      sortValue: (r) => r.effective_unit_cost_cop ?? -1,
      render: (r) =>
        r.effective_unit_cost_cop === null ? (
          <span className="rtw-badge rtw-badge-warning">Costo Pendiente</span>
        ) : (
          <span className="rtw-num">{formatCOP(r.effective_unit_cost_cop)}</span>
        )
    }
  ];

  const incidenceColumns: TableColumn<DbInventoryIncidenceRow>[] = [
    {
      key: 'id',
      header: 'ID',
      sortValue: (r) => r.id,
      render: (r) => <strong className="rtw-mono">{r.id}</strong>
    },
    {
      key: 'severity',
      header: 'Severidad',
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
      key: 'ref',
      header: 'Referencia / SKU',
      sortValue: (r) => r.sku_or_owner_ref,
      render: (r) => <span className="rtw-mono">{r.sku_or_owner_ref}</span>
    },
    {
      key: 'description',
      header: 'Detalle Operativo',
      render: (r) => r.description
    },
    {
      key: 'status',
      header: 'Estado',
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
    },
    {
      key: 'date',
      header: 'Fecha',
      sortValue: (r) => r.created_at,
      render: (r) => formatDateDDMMYYYY(r.created_at)
    }
  ];

  if (loading && !snapshot) {
    return <LoadingState label="Consultando métricas en vivo desde Supabase..." />;
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

  return (
    <div className="module-container">
      {/* Cabecera Ejecutiva */}
      <section
        className="rtw-card rtw-card-gold-top"
        style={{
          background: 'linear-gradient(135deg, #0f141c 0%, #1c2432 100%)',
          color: '#f8fafc',
          marginBottom: 0
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '16px'
          }}
        >
          <div>
            <span className="rtw-badge rtw-badge-gold" style={{ marginBottom: '8px' }}>
              <CheckCircle2 size={13} />
              Operación en vivo · Alcance:{' '}
              {selectedOwnerScope === 'ALL' ? 'Todos los propietarios' : selectedOwnerScope}
            </span>
            <h2 style={{ fontSize: '1.26rem', fontWeight: 800, color: '#ffffff' }}>
              Resumen Ejecutivo REAL TWS
            </h2>
            <p style={{ fontSize: '0.86rem', color: '#cbd5e1', maxWidth: '720px', marginTop: '4px' }}>
              Supervisión centralizada de inventario multipropietario por lote, disponibilidad real para ventas, valorización de costos e incidencias activas.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.07)', padding: '4px', borderRadius: '8px' }}>
              {(
                [
                  { id: 'ALL', label: 'Histórico' },
                  { id: '30D', label: '30 días' },
                  { id: '7D', label: '7 días' }
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodFilter(p.id)}
                  className="rtw-btn btn-sm"
                  style={{
                    backgroundColor: periodFilter === p.id ? '#d4af37' : 'transparent',
                    color: periodFilter === p.id ? '#0f141c' : '#e2e8f0',
                    borderColor: 'transparent',
                    fontWeight: 700
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="rtw-btn rtw-btn-outline btn-sm"
              onClick={() => void loadDashboard()}
            >
              <RefreshCw size={14} />
              Actualizar
            </button>
          </div>
        </div>

        {/* Accesos rápidos operativos */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '16px' }}>
          <button
            type="button"
            className="rtw-btn rtw-btn-gold btn-sm"
            onClick={() => navigate('/operaciones/inventario')}
          >
            <Boxes size={14} />
            Ir a Inventario y Lotes
          </button>
          {canImport && (
            <button
              type="button"
              className="rtw-btn rtw-btn-outline btn-sm"
              onClick={() => navigate('/operaciones/importacion')}
            >
              <FileSpreadsheet size={14} />
              Importar Inventario Excel/CSV
            </button>
          )}
          {canImport && (
            <button
              type="button"
              className="rtw-btn rtw-btn-outline btn-sm"
              onClick={() => navigate('/operaciones/recepciones-compras')}
            >
              <Truck size={14} />
              Nueva Recepción / Compra
            </button>
          )}
          {canSell && (
            <button
              type="button"
              className="rtw-btn rtw-btn-outline btn-sm"
              onClick={() => navigate('/comercial/pedidos')}
            >
              <ShoppingCart size={14} />
              Registrar Pedido
            </button>
          )}
        </div>
      </section>

      {snapshot.errors.length > 0 && (
        <ErrorState
          message={`Algunas consultas devolvieron alertas de acceso o red: ${snapshot.errors.join(' · ')}`}
          onRetry={() => void loadDashboard()}
        />
      )}

      {hasEmptyDatabase && (
        <section
          className="rtw-card"
          style={{
            borderLeft: '4px solid #d4af37',
            backgroundColor: '#fefce8',
            marginBottom: 0
          }}
        >
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
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                Base de datos lista — Aún no hay inventario cargado
              </h3>
              <p style={{ fontSize: '0.84rem', color: '#475569', marginTop: '4px' }}>
                La conexión con Supabase está activa y las tablas están listas, pero todavía no se han registrado propietarios o lotes en producción. Carga tu archivo oficial desde Importación Excel/CSV o registra tu primera compra.
              </p>
            </div>
            {canImport && (
              <button
                type="button"
                className="rtw-btn rtw-btn-primary"
                onClick={() => navigate('/operaciones/importacion')}
              >
                <FileSpreadsheet size={16} />
                Cargar Inventario Inicial
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </section>
      )}

      {/* KPIs Principales */}
      <section className="rtw-kpi-grid" style={{ marginBottom: 0 }}>
        <article className="rtw-kpi-card">
          <div className="rtw-kpi-label">SKUs & Stock Físico</div>
          <div className="rtw-kpi-value">{formatInteger(snapshot.totals.physicalUnits)} unid.</div>
          <div className="rtw-kpi-sub">
            {formatInteger(snapshot.totals.uniqueSkus)} SKUs activos ·{' '}
            {formatInteger(snapshot.owners.length)} propietarios
          </div>
        </article>

        <article className="rtw-kpi-card">
          <div className="rtw-kpi-label">Disponible para Venta</div>
          <div className="rtw-kpi-value" style={{ color: '#166534' }}>
            {formatInteger(snapshot.totals.availableUnits)} unid.
          </div>
          <div className="rtw-kpi-sub">
            En revisión: {formatInteger(snapshot.totals.pendingInspectionUnits)} · Reservado:{' '}
            {formatInteger(snapshot.totals.reservedUnits)}
          </div>
        </article>

        <article className="rtw-kpi-card">
          <div className="rtw-kpi-label">Costo Inventario Activo</div>
          <div className="rtw-kpi-value">{formatCOP(snapshot.totals.inventoryCostCop)}</div>
          <div className="rtw-kpi-sub">
            Calculado solo con costos confirmados por lote
          </div>
        </article>

        <article className="rtw-kpi-card">
          <div className="rtw-kpi-label">
            Ventas Netas ({periodFilter === 'ALL' ? 'Histórico' : periodFilter})
          </div>
          <div className="rtw-kpi-value">{formatCOP(periodSalesCop)}</div>
          <div className="rtw-kpi-sub">
            {formatInteger(periodUnitsSold)} unidades vendidas · Utilidad acumulada:{' '}
            {formatCOP(snapshot.totals.attributableProfitCop)}
          </div>
        </article>

        <article className="rtw-kpi-card">
          <div className="rtw-kpi-label">Incidencias Abiertas</div>
          <div
            className="rtw-kpi-value"
            style={{
              color: snapshot.totals.openIncidencesCount > 0 ? '#92400e' : '#166534'
            }}
          >
            {formatInteger(snapshot.totals.openIncidencesCount)}
          </div>
          <div className="rtw-kpi-sub">
            Defectuosas: {formatInteger(snapshot.totals.defectiveUnits)} · Umbral stock bajo: ≤{' '}
            {lowStockThreshold}
          </div>
        </article>
      </section>

      {/* Gráfico por propietario + Tabla de inventario en vivo */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '18px'
        }}
      >
        <section className="rtw-card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <PackageCheck size={18} color="#d4af37" />
            <h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>
              Distribución de Stock por Propietario
            </h3>
          </div>
          {chartByOwner.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#64748b', fontSize: '0.84rem' }}>
              Sin unidades registradas en inventario aún.
            </div>
          ) : (
            <div style={{ width: '100%', height: 270 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartByOwner}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="ownerLabel" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="physicalUnits" name="Físicas" fill="#171e29" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="availableUnits" name="Disponibles" fill="#166534" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pendingInspection" name="En Revisión" fill="#d4af37" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="rtw-card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <AlertTriangle size={18} color="#92400e" />
            <h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>
              Incidencias Operativas ({snapshot.incidences.length})
            </h3>
          </div>
          <DataTable
            columns={incidenceColumns}
            data={snapshot.incidences}
            rowKey={(row) => row.id}
            pageSize={6}
            mobileTitle={(row) => `${row.id} · ${row.severity}`}
            emptyTitle="Sin incidencias abiertas"
            emptyDescription="No se reportan hallazgos pendientes de revisión en el alcance seleccionado."
          />
        </section>
      </div>

      {/* Tabla detallada de inventario vivo por lote y propietario */}
      <section className="rtw-card" style={{ marginBottom: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '12px'
          }}
        >
          <div>
            <h3 style={{ fontSize: '0.98rem', fontWeight: 800 }}>
              Inventario Consolidado por Lote y Propietario ({filteredInventory.length})
            </h3>
            <p style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Haz clic en cualquier encabezado de columna para ordenar. Las unidades en revisión no están habilitadas para la venta.
            </p>
          </div>
        </div>

        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          placeholder="Buscar por SKU, producto, lote o propietario..."
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
          pageSize={12}
          mobileTitle={(row) => `${row.sku} — ${row.product_name}`}
          emptyTitle="Sin lotes que coincidan con el filtro"
          emptyDescription="Ajusta la búsqueda o importa un lote de inventario para visualizar existencias."
        />
      </section>
    </div>
  );
}
