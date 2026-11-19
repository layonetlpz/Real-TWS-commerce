import React, { useState, useMemo, useEffect } from 'react';
import {
  Download,
  FileSpreadsheet,
  Printer,
  Filter,
  RotateCcw,
  ShieldCheck,
  Layers,
  Users,
  ShoppingBag,
  Megaphone,
  Search,
  AlertCircle
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  ComposedChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import {
  createDefaultBiFilters,
  buildBusinessIntelligenceReport,
  exportBiSnapshotToCsv,
  triggerCsvDownload,
  openPrintableBiPdfReport,
  type BiFilterCriteria,
  type BiPeriodPreset,
  type BiUnderlyingContrastItem
} from '../../services/businessIntelligenceService';
import type { SalesOrderStatus } from '../../services/salesOrdersCrmService';
import { useAuth } from '../../hooks/useAuth';
import { useOwnerScope } from '../../hooks/useOwnerScope';
import { useNotifications } from '../../hooks/useNotifications';
import {
  GlassDisclosure,
  GlassDropdown,
  ModuleHeader,
  SegmentedTabs
} from '../../components/glass';

type BiDashboardTab =
  | 'GENERAL'
  | 'MULTI_OWNER'
  | 'COMMERCIAL'
  | 'MARKETING'
  | 'UNDERLYING_CONTRAST';

const CHART_COLORS = ['#10b981', '#0284c7', '#d97706', '#7c3aed', '#db2777', '#dc2626', '#4f46e5'];

function formatCop(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(Math.round(amount || 0));
}

function formatCompactCop(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(0)}k`;
  return `$${val}`;
}

export const BusinessIntelligenceModule: React.FC = () => {
  const { userProfile, activeEffectiveRole } = useAuth();
  const { selectedOwnerScope } = useOwnerScope();
  const { notify } = useNotifications();

  const effectiveRole = activeEffectiveRole || userProfile?.role || 'VIEWER';
  const isOwnerRole = effectiveRole === 'OWNER';
  const enforcedOwnerScope =
    isOwnerRole && userProfile?.linkedOwnerId
      ? userProfile.linkedOwnerId
      : selectedOwnerScope !== 'ALL'
      ? selectedOwnerScope
      : 'ALL';

  const [filters, setFilters] = useState<BiFilterCriteria>(() =>
    createDefaultBiFilters(enforcedOwnerScope)
  );
  const [activeTab, setActiveTab] = useState<BiDashboardTab>('GENERAL');
  const [timeGranularity, setTimeGranularity] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('DAILY');
  const [contrastTypeFilter, setContrastTypeFilter] = useState<
    'ALL' | BiUnderlyingContrastItem['recordType']
  >('ALL');

  useEffect(() => {
    setFilters((prev) =>
      prev.ownerId === enforcedOwnerScope
        ? prev
        : { ...prev, ownerId: enforcedOwnerScope }
    );
  }, [enforcedOwnerScope]);

  const snapshot = useMemo(() => buildBusinessIntelligenceReport(filters), [filters]);

  const handleResetFilters = () => {
    setFilters(createDefaultBiFilters(enforcedOwnerScope));
    notify('info', 'Filtros restablecidos', 'Se muestran los registros reales conciliados del alcance activo.');
  };

  const handleExportCsv = (scope: 'GENERAL' | 'OWNERS' | 'SKU' | 'UNDERLYING') => {
    const csv = exportBiSnapshotToCsv(snapshot, scope);
    const stamp = new Date().toISOString().slice(0, 10);
    triggerCsvDownload(csv, `REAL_TWS_BI_${scope}_${stamp}.csv`);
    notify('success', 'CSV exportado localmente', `Archivo REAL_TWS_BI_${scope}_${stamp}.csv generado sin costo.`);
  };

  const handleExportPdf = () => {
    const ok = openPrintableBiPdfReport(snapshot);
    if (!ok) {
      notify('warning', 'Ventana bloqueada', 'Permite ventanas emergentes para generar el PDF local.');
      return;
    }
    notify('success', 'Reporte PDF listo', 'Usa Guardar como PDF en el diálogo de impresión del navegador.');
  };

  const activeTimeSeries =
    timeGranularity === 'DAILY'
      ? snapshot.charts.dailySales
      : timeGranularity === 'WEEKLY'
      ? snapshot.charts.weeklySales
      : snapshot.charts.monthlySales;

  const filteredUnderlying = useMemo(() => {
    if (contrastTypeFilter === 'ALL') return snapshot.underlyingRecords;
    return snapshot.underlyingRecords.filter((r) => r.recordType === contrastTypeFilter);
  }, [snapshot.underlyingRecords, contrastTypeFilter]);

  const g = snapshot.general;

  return (
    <div className="module-container">
      {/* HEADER EJECUTIVO */}
      <ModuleHeader
        variant="dark"
        eyebrow="GESTIÓN · ANALÍTICA Y REPORTES"
        title="Analítica de Negocio"
        subtitle="Indicadores reales de ingresos, rentabilidad por propietario, catálogo y campañas."
        actions={
          <>
            <button type="button" className="rtw-btn rtw-btn-gold btn-sm" onClick={handleExportPdf}>
              <Printer size={14} /> Exportar PDF
            </button>
            <GlassDropdown
              label="Exportar CSV"
              icon={<Download size={14} />}
              variant="ghost-dark"
              options={[
                {
                  id: 'csv-general',
                  label: 'Resumen General (CSV)',
                  icon: <FileSpreadsheet size={14} />,
                  onClick: () => handleExportCsv('GENERAL')
                },
                {
                  id: 'csv-owners',
                  label: 'Por Propietario (CSV)',
                  icon: <Users size={14} />,
                  onClick: () => handleExportCsv('OWNERS')
                },
                {
                  id: 'csv-sku',
                  label: 'Por SKU (CSV)',
                  icon: <ShoppingBag size={14} />,
                  onClick: () => handleExportCsv('SKU')
                }
              ]}
            />
          </>
        }
        bottomSlot={
          <SegmentedTabs<BiDashboardTab>
            variant="dark"
            value={activeTab}
            onChange={setActiveTab}
            items={[
              { id: 'GENERAL', label: 'General', icon: <Layers size={14} /> },
              { id: 'MULTI_OWNER', label: 'Propietarios', icon: <Users size={14} /> },
              { id: 'COMMERCIAL', label: 'Comercial y SKUs', icon: <ShoppingBag size={14} /> },
              { id: 'MARKETING', label: 'Marketing', icon: <Megaphone size={14} /> },
              {
                id: 'UNDERLYING_CONTRAST',
                label: 'Registros base',
                icon: <ShieldCheck size={14} />,
                count: snapshot.underlyingRecords.length
              }
            ]}
          />
        }
      />

      {/* PANEL DE FILTROS COLAPSABLE */}
      <GlassDisclosure
        title="Filtros de análisis"
        subtitle={`${snapshot.appliedFilterSummary} · Corte: ${new Date(snapshot.generatedAt).toLocaleString('es-CO')}`}
        icon={<Filter size={15} />}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '12px 0' }}>
          <button type="button" className="rtw-btn rtw-btn-outline btn-sm" onClick={handleResetFilters}>
            <RotateCcw size={13} /> Restablecer filtros
          </button>
        </div>

        <div className="rtw-form-grid">
          <div className="rtw-field">
            <label className="rtw-label">Periodo</label>
            <select
              className="rtw-select"
              value={filters.periodPreset}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, periodPreset: e.target.value as BiPeriodPreset }))
              }
            >
              <option value="ALL">Todo el historial</option>
              <option value="7D">Últimos 7 días</option>
              <option value="30D">Últimos 30 días</option>
              <option value="90D">Últimos 90 días</option>
              <option value="THIS_MONTH">Este mes</option>
              <option value="CUSTOM">Rango personalizado</option>
            </select>
          </div>

          <div className="rtw-field">
            <label className="rtw-label">Producto</label>
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '11px',
                  color: 'var(--rtw-text-muted)'
                }}
              />
              <input
                type="text"
                className="rtw-input"
                style={{ paddingLeft: '30px', width: '100%' }}
                value={filters.productQuery}
                onChange={(e) => setFilters((prev) => ({ ...prev, productQuery: e.target.value }))}
                placeholder="Nombre o referencia..."
              />
            </div>
          </div>

          <div className="rtw-field">
            <label className="rtw-label">SKU</label>
            <select
              className="rtw-select"
              value={filters.sku}
              onChange={(e) => setFilters((prev) => ({ ...prev, sku: e.target.value }))}
            >
              <option value="ALL">Todos los SKUs</option>
              {snapshot.filterOptions.skus.map((s) => (
                <option key={s.sku} value={s.sku}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rtw-field">
            <label className="rtw-label">Propietario</label>
            <select
              className="rtw-select"
              value={filters.ownerId}
              disabled={enforcedOwnerScope !== 'ALL'}
              onChange={(e) => setFilters((prev) => ({ ...prev, ownerId: e.target.value }))}
            >
              <option value="ALL">Todos los propietarios</option>
              {snapshot.filterOptions.owners.map((o) => (
                <option key={o.ownerId} value={o.ownerId}>
                  {o.ownerName} ({o.ownerId})
                </option>
              ))}
            </select>
          </div>

          <div className="rtw-field">
            <label className="rtw-label">Categoría</label>
            <select
              className="rtw-select"
              value={filters.category}
              onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
            >
              <option value="ALL">Todas las categorías</option>
              {snapshot.filterOptions.categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="rtw-field">
            <label className="rtw-label">Canal</label>
            <select
              className="rtw-select"
              value={filters.channel}
              onChange={(e) => setFilters((prev) => ({ ...prev, channel: e.target.value }))}
            >
              <option value="ALL">Todos los canales</option>
              {snapshot.filterOptions.channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rtw-field">
            <label className="rtw-label">Estado de Pedido</label>
            <select
              className="rtw-select"
              value={filters.orderStatus}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  orderStatus: e.target.value as 'ALL' | SalesOrderStatus
                }))
              }
            >
              <option value="ALL">Todos los estados</option>
              <option value="confirmed">Confirmado (Realizado)</option>
              <option value="preparing">En Preparación (Realizado)</option>
              <option value="dispatched">Despachado (Realizado)</option>
              <option value="delivered">Entregado (Realizado)</option>
              <option value="partially_returned">Devuelto Parcial</option>
              <option value="returned">Devuelto Total</option>
              <option value="draft">Borrador (No Confirmado)</option>
              <option value="reserved">Reservado (No Confirmado)</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>

          <div className="rtw-field">
            <label className="rtw-label">Campaña Meta Ads</label>
            <select
              className="rtw-select"
              value={filters.campaignId}
              onChange={(e) => setFilters((prev) => ({ ...prev, campaignId: e.target.value }))}
            >
              <option value="ALL">Todas las campañas</option>
              {snapshot.filterOptions.campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filters.periodPreset === 'CUSTOM' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '12px' }}>
            <div className="rtw-field">
              <label className="rtw-label">Fecha desde</label>
              <input
                type="date"
                className="rtw-input"
                value={filters.dateFrom}
                onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
              />
            </div>
            <div className="rtw-field">
              <label className="rtw-label">Fecha hasta</label>
              <input
                type="date"
                className="rtw-input"
                value={filters.dateTo}
                onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
              />
            </div>
          </div>
        )}
      </GlassDisclosure>

      {/* ===================================================================== */}
      {/* TAB 1: DASHBOARD GENERAL                                              */}
      {/* ===================================================================== */}
      {activeTab === 'GENERAL' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="rtw-kpi-grid">
            <div className="rtw-kpi-card">
              <div className="rtw-kpi-label">
                <span>Ingresos Realizados Netos</span>
                <span className="rtw-badge rtw-badge-success">REAL</span>
              </div>
              <div className="rtw-kpi-value" style={{ color: 'var(--rtw-success-text)' }}>
                {formatCop(g.netMerchandiseRevenueCop)}
              </div>
              <div className="rtw-kpi-sub">
                Bruto {formatCop(g.grossSalesCop)} − Desc {formatCop(g.discountsCop)} − Dev{' '}
                {formatCop(g.returnsCop)}
              </div>
              <div className="rtw-kpi-sub">Origen: sales_orders (confirmados+)</div>
            </div>

            <div className="rtw-kpi-card">
              <div className="rtw-kpi-label">
                <span>Pedidos Realizados / Unid.</span>
                <span className="rtw-badge rtw-badge-success">REAL</span>
              </div>
              <div className="rtw-kpi-value">
                {g.realizedOrdersCount} ped. · {g.netUnitsSold} uds
              </div>
              <div className="rtw-kpi-sub">
                Devueltas: {g.returnedUnits} uds | Cancelados: {g.cancelledOrdersCount}
              </div>
              <div className="rtw-kpi-sub">Recaudo confirmado: {formatCop(g.collectedCashCop)}</div>
            </div>

            <div className="rtw-kpi-card">
              <div className="rtw-kpi-label">
                <span>Costos (CMV) + Gastos</span>
                <span className="rtw-badge rtw-badge-warning">REAL</span>
              </div>
              <div className="rtw-kpi-value">
                {formatCop(g.cogsCop + g.totalApprovedExpensesCop + g.adSpendCop)}
              </div>
              <div className="rtw-kpi-sub">
                CMV: {formatCop(g.cogsCop)} | Gastos: {formatCop(g.totalApprovedExpensesCop)} | Ads:{' '}
                {formatCop(g.adSpendCop)}
              </div>
              <div className="rtw-kpi-sub">Origen: lot_costs + financial_expenses</div>
            </div>

            <div className="rtw-kpi-card">
              <div className="rtw-kpi-label">
                <span>Contribución / Utilidad Neta</span>
                <span className="rtw-badge rtw-badge-info">REAL</span>
              </div>
              <div
                className="rtw-kpi-value"
                style={{ color: g.netOperatingProfitCop >= 0 ? 'var(--rtw-info-text)' : 'var(--rtw-danger-text)' }}
              >
                {formatCop(g.netOperatingProfitCop)}
              </div>
              <div className="rtw-kpi-sub">Contribución marginal: {formatCop(g.contributionMarginCop)}</div>
              <div className="rtw-kpi-sub">
                Pipeline no confirmado (Est.): {formatCop(g.unconfirmedPipelineRevenueCop)} ({g.unconfirmedPipelineOrdersCount} ped.)
              </div>
            </div>
          </div>

          <div className="rtw-kpi-grid">
            <div className="rtw-kpi-card">
              <div className="rtw-kpi-label">Inventario Activo</div>
              <div className="rtw-kpi-value">{g.inventoryPhysicalUnits} uds físicas</div>
              <div className="rtw-kpi-sub">
                Disp: {g.inventoryAvailableUnits} | Res: {g.inventoryReservedUnits} | Val:{' '}
                {formatCop(g.inventoryValuationCop)}
              </div>
            </div>
            <div className="rtw-kpi-card">
              <div className="rtw-kpi-label">Publicaciones</div>
              <div className="rtw-kpi-value">{g.totalPublicationsCount} piezas</div>
              <div className="rtw-kpi-sub">Publicadas activas: {g.publishedLiveCount}</div>
            </div>
            <div className="rtw-kpi-card">
              <div className="rtw-kpi-label">Prospectos & Consultas</div>
              <div className="rtw-kpi-value">{g.totalLeadsCount} leads</div>
              <div className="rtw-kpi-sub">
                Convertidos: {g.convertedLeadsCount} | WA: {g.whatsappConsultationsCount}
              </div>
            </div>
            <div className="rtw-kpi-card">
              <div className="rtw-kpi-label">Publicidad Meta Ads</div>
              <div className="rtw-kpi-value">{formatCop(g.adSpendCop)}</div>
              <div className="rtw-kpi-sub">
                ROAS: {g.adRoasMultiplier !== null ? `${g.adRoasMultiplier}x` : 'N/A'} | Atrib:{' '}
                {formatCop(g.adAttributedRevenueCop)}
              </div>
            </div>
            <div className="rtw-kpi-card">
              <div className="rtw-kpi-label">Liquidaciones</div>
              <div className="rtw-kpi-value">{formatCop(g.settlementsPaidCop)}</div>
              <div className="rtw-kpi-sub">
                Pend. pago: {formatCop(g.settlementsPendingCop)} ({g.settlementsTotalCount} actas)
              </div>
            </div>
          </div>

          {/* GRÁFICAS */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))',
              gap: '18px'
            }}
          >
            <div className="rtw-card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '10px',
                  flexWrap: 'wrap'
                }}
              >
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                    Evolución de Ventas Realizadas
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--rtw-text-secondary)' }}>
                    Ingresos netos vs CMV vs Utilidad bruta.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(
                    [
                      ['DAILY', 'Diarias'],
                      ['WEEKLY', 'Semanales'],
                      ['MONTHLY', 'Mensuales']
                    ] as const
                  ).map(([k, lbl]) => (
                    <button
                      key={k}
                      type="button"
                      className={`rtw-btn ${timeGranularity === k ? 'rtw-btn-primary' : 'rtw-btn-outline'}`}
                      style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                      onClick={() => setTimeGranularity(k)}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ height: '270px', width: '100%' }}>
                {activeTimeSeries.length === 0 ? (
                  <div style={{ paddingTop: '110px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--rtw-text-muted)' }}>
                    No hay ventas realizadas en el periodo seleccionado.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={activeTimeSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--rtw-chart-grid)" />
                      <XAxis dataKey="label" stroke="var(--rtw-chart-axis)" fontSize={11} />
                      <YAxis stroke="var(--rtw-chart-axis)" fontSize={11} tickFormatter={formatCompactCop} />
                      <Tooltip formatter={(v: number) => formatCop(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="netRevenueCop" name="Ingresos Netos" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cogsCop" name="CMV" fill="#d97706" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="profitCop" name="Utilidad Bruta" stroke="#0284c7" strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rtw-card">
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Estructura de Costos y Gastos</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--rtw-text-secondary)', marginBottom: '10px' }}>
                CMV de lotes despachados, gastos aprobados, publicidad y flete real.
              </p>
              <div style={{ height: '270px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={snapshot.charts.costsBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--rtw-chart-grid)" />
                    <XAxis type="number" stroke="var(--rtw-chart-axis)" fontSize={11} tickFormatter={formatCompactCop} />
                    <YAxis dataKey="category" type="category" stroke="var(--rtw-chart-axis)" fontSize={11} width={140} />
                    <Tooltip formatter={(v: number) => formatCop(v)} />
                    <Bar dataKey="amountCop" name="Monto COP" fill="#d97706" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rtw-card">
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Distribución de Estados de Pedido</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--rtw-text-secondary)', marginBottom: '10px' }}>
                Separa pedidos realizados de borradores y reservas no confirmadas.
              </p>
              <div style={{ height: '270px', width: '100%' }}>
                {snapshot.charts.orderStatuses.length === 0 ? (
                  <div style={{ paddingTop: '110px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--rtw-text-muted)' }}>
                    Sin pedidos en el rango actual.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={snapshot.charts.orderStatuses}
                        dataKey="count"
                        nameKey="statusLabel"
                        cx="50%"
                        cy="50%"
                        outerRadius={88}
                        label={(entry) => `${entry.statusLabel}: ${entry.count}`}
                      >
                        {snapshot.charts.orderStatuses.map((entry, idx) => (
                          <Cell key={entry.status} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rtw-card">
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Curva de Utilidad Bruta</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--rtw-text-secondary)', marginBottom: '10px' }}>
                Ingresos realizados menos costo vendido por periodo.
              </p>
              <div style={{ height: '270px', width: '100%' }}>
                {snapshot.charts.profitEvolution.length === 0 ? (
                  <div style={{ paddingTop: '110px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--rtw-text-muted)' }}>
                    Sin datos suficientes de utilidad en el periodo.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={snapshot.charts.profitEvolution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--rtw-chart-grid)" />
                      <XAxis dataKey="label" stroke="var(--rtw-chart-axis)" fontSize={11} />
                      <YAxis stroke="var(--rtw-chart-axis)" fontSize={11} tickFormatter={formatCompactCop} />
                      <Tooltip formatter={(v: number) => formatCop(v)} />
                      <Area
                        type="monotone"
                        dataKey="profitCop"
                        name="Utilidad Bruta"
                        stroke="#0284c7"
                        fill="#0284c7"
                        fillOpacity={0.18}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: DASHBOARD MULTIPROPIETARIO                                     */}
      {/* ===================================================================== */}
      {activeTab === 'MULTI_OWNER' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))',
              gap: '18px'
            }}
          >
            <div className="rtw-card">
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                Ventas Netas, CMV y Utilidad Atribuible por Propietario
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--rtw-text-secondary)', marginBottom: '10px' }}>
                Sin mezclar saldos ni atribuir ventas no confirmadas.
              </p>
              <div style={{ height: '270px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={snapshot.charts.salesByOwner}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--rtw-chart-grid)" />
                    <XAxis dataKey="ownerName" stroke="var(--rtw-chart-axis)" fontSize={11} />
                    <YAxis stroke="var(--rtw-chart-axis)" fontSize={11} tickFormatter={formatCompactCop} />
                    <Tooltip formatter={(v: number) => formatCop(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="netSalesCop" name="Ventas Netas" fill="#10b981" />
                    <Bar dataKey="cogsCop" name="Costo Vendido" fill="#d97706" />
                    <Bar dataKey="profitCop" name="Utilidad Atribuible" fill="#0284c7" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rtw-card">
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                Comparación de Existencias por Propietario (Unidades)
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--rtw-text-secondary)', marginBottom: '10px' }}>
                Segregación física: Disponible, Reservado y Revisión/Defectuoso.
              </p>
              <div style={{ height: '270px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={snapshot.charts.inventoryByOwner}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--rtw-chart-grid)" />
                    <XAxis dataKey="ownerName" stroke="var(--rtw-chart-axis)" fontSize={11} />
                    <YAxis stroke="var(--rtw-chart-axis)" fontSize={11} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="available" stackId="inv" name="Disponible" fill="#10b981" />
                    <Bar dataKey="reserved" stackId="inv" name="Reservado" fill="#0284c7" />
                    <Bar dataKey="defectiveOrPending" stackId="inv" name="Revisión/Defectuoso" fill="#dc2626" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="rtw-card">
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '10px' }}>
              Estado Comparativo Multipropietario Conciliado
            </h3>
            <div className="rtw-table-container">
              <table className="rtw-table">
                <thead>
                  <tr>
                    <th>Propietario</th>
                    <th>Exist. Físicas (Disp)</th>
                    <th>Valor Inv.</th>
                    <th>Ventas Netas</th>
                    <th>CMV</th>
                    <th>Gastos Asig.</th>
                    <th>Comisión</th>
                    <th>Utilidad Atrib.</th>
                    <th>Liquidado</th>
                    <th>Saldo Final</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.ownerRows.map((o) => (
                    <tr key={o.ownerId}>
                      <td>
                        <strong>{o.ownerName}</strong>
                        <div style={{ fontSize: '0.72rem', color: 'var(--rtw-text-muted)' }}>
                          {o.ownerId} · {o.agreementStatus}
                        </div>
                      </td>
                      <td>
                        {o.physicalUnits} ({o.availableUnits})
                      </td>
                      <td>{formatCop(o.inventoryValuationCop)}</td>
                      <td style={{ fontWeight: 700, color: 'var(--rtw-success-text)' }}>
                        {formatCop(o.netSalesCop)}
                      </td>
                      <td>{formatCop(o.cogsSoldCop)}</td>
                      <td>{formatCop(o.totalAssignedExpensesCop)}</td>
                      <td>{o.storeCommissionCop !== null ? formatCop(o.storeCommissionCop) : 'Pendiente'}</td>
                      <td style={{ fontWeight: 700, color: 'var(--rtw-info-text)' }}>
                        {formatCop(o.attributableProfitCop)}
                      </td>
                      <td>{formatCop(o.settlementsPaidCop)}</td>
                      <td style={{ fontWeight: 800 }}>{formatCop(o.finalConciliatedBalanceCop)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: DASHBOARD COMERCIAL                                            */}
      {/* ===================================================================== */}
      {activeTab === 'COMMERCIAL' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))',
              gap: '18px'
            }}
          >
            <div className="rtw-card">
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Top Ventas por SKU</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--rtw-text-secondary)', marginBottom: '10px' }}>
                Ingresos netos vs utilidad bruta por referencia SKU.
              </p>
              <div style={{ height: '270px', width: '100%' }}>
                {snapshot.charts.salesBySku.length === 0 ? (
                  <div style={{ paddingTop: '110px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--rtw-text-muted)' }}>
                    No hay ventas por SKU en el filtro actual.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={snapshot.charts.salesBySku}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--rtw-chart-grid)" />
                      <XAxis dataKey="label" stroke="var(--rtw-chart-axis)" fontSize={10} />
                      <YAxis stroke="var(--rtw-chart-axis)" fontSize={11} tickFormatter={formatCompactCop} />
                      <Tooltip formatter={(v: number) => formatCop(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="netRevenueCop" name="Ingresos Netos" fill="#10b981" />
                      <Bar dataKey="profitCop" name="Utilidad Bruta" fill="#0284c7" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rtw-card">
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Rendimiento por Canal Comercial</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--rtw-text-secondary)', marginBottom: '10px' }}>
                Ingresos realizados por canal de adquisición.
              </p>
              <div style={{ height: '270px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={snapshot.charts.channelPerformance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--rtw-chart-grid)" />
                    <XAxis dataKey="channelLabel" stroke="var(--rtw-chart-axis)" fontSize={11} />
                    <YAxis stroke="var(--rtw-chart-axis)" fontSize={11} tickFormatter={formatCompactCop} />
                    <Tooltip formatter={(v: number) => formatCop(v)} />
                    <Bar dataKey="netRevenueCop" name="Ingresos Netos COP" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="rtw-card">
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '10px' }}>
              Rentabilidad Comercial por SKU
            </h3>
            <div className="rtw-table-container">
              <table className="rtw-table">
                <thead>
                  <tr>
                    <th>SKU / Producto</th>
                    <th>Categoría</th>
                    <th>Pedidos</th>
                    <th>Uds Netas (Dev)</th>
                    <th>Ingresos Netos</th>
                    <th>CMV</th>
                    <th>Utilidad Bruta</th>
                    <th>Margen %</th>
                    <th>Stock Disp.</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.skuRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '20px', color: 'var(--rtw-text-muted)' }}>
                        Sin ventas realizadas para los SKUs filtrados.
                      </td>
                    </tr>
                  ) : (
                    snapshot.skuRows.map((r) => (
                      <tr key={r.sku}>
                        <td>
                          <strong>{r.sku}</strong>
                          <div style={{ fontSize: '0.72rem', color: 'var(--rtw-text-muted)' }}>
                            {r.productName}
                          </div>
                        </td>
                        <td>{r.category}</td>
                        <td>{r.realizedOrdersCount}</td>
                        <td>
                          {r.netUnitsSold} ({r.returnedUnits})
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--rtw-success-text)' }}>
                          {formatCop(r.netRevenueCop)}
                        </td>
                        <td>{formatCop(r.cogsCop)}</td>
                        <td style={{ fontWeight: 700, color: 'var(--rtw-info-text)' }}>
                          {formatCop(r.grossProfitCop)}
                        </td>
                        <td>{r.grossMarginPct}%</td>
                        <td>{r.availableStockUnits}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: ANALÍTICA DE MARKETING                                         */}
      {/* ===================================================================== */}
      {activeTab === 'MARKETING' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="rtw-card">
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>
              Embudo por Canal: Publicaciones → Consultas → Prospectos → Ventas Realizadas
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--rtw-text-secondary)', marginBottom: '10px' }}>
              Conversiones calculadas únicamente sobre pedidos confirmados o posteriores.
            </p>
            <div className="rtw-table-container">
              <table className="rtw-table">
                <thead>
                  <tr>
                    <th>Canal</th>
                    <th>Publicaciones</th>
                    <th>Consultas</th>
                    <th>Prospectos CRM</th>
                    <th>Pedidos Realizados</th>
                    <th>No Confirmados (Est.)</th>
                    <th>Conversión %</th>
                    <th>Ingresos Netos</th>
                    <th>Costo Ads</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.channelRows.map((ch) => (
                    <tr key={ch.channelId}>
                      <td>
                        <strong>{ch.channelLabel}</strong>
                      </td>
                      <td>{ch.publicationsCount}</td>
                      <td>{ch.consultationsCount}</td>
                      <td>{ch.leadsCount}</td>
                      <td style={{ fontWeight: 700, color: 'var(--rtw-success-text)' }}>
                        {ch.realizedOrdersCount}
                      </td>
                      <td>{ch.unconfirmedOrdersCount}</td>
                      <td>{ch.conversionRatePct}%</td>
                      <td style={{ fontWeight: 700 }}>{formatCop(ch.netRevenueCop)}</td>
                      <td>{formatCop(ch.adSpendCop)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rtw-card">
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>
              Campañas Meta Ads y Atribución de Costos Publicitarios
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--rtw-text-secondary)', marginBottom: '10px' }}>
              Diferencia registros manuales/CSV de datos sincronizados por Meta API.
            </p>
            <div className="rtw-table-container">
              <table className="rtw-table">
                <thead>
                  <tr>
                    <th>Campaña</th>
                    <th>Origen Dato</th>
                    <th>Clics / CTR</th>
                    <th>Conversaciones</th>
                    <th>Compras Verif.</th>
                    <th>Inversión</th>
                    <th>CPA</th>
                    <th>Ingresos Atrib.</th>
                    <th>ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.campaignPerformances.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '20px', color: 'var(--rtw-text-muted)' }}>
                        No hay campañas Meta Ads registradas para el filtro actual.
                      </td>
                    </tr>
                  ) : (
                    snapshot.campaignPerformances.map((cp) => (
                      <tr key={cp.campaign.id}>
                        <td>
                          <strong>{cp.campaign.campaignName}</strong>
                          <div style={{ fontSize: '0.72rem', color: 'var(--rtw-text-muted)' }}>
                            {cp.campaign.campaignCode} · SKU: {cp.campaign.promotedSku || 'General'}
                          </div>
                        </td>
                        <td>
                          <span className="rtw-badge rtw-badge-info">{cp.campaign.dataSourceOrigin}</span>
                        </td>
                        <td>
                          {cp.totalClicks} ({cp.ctrPct}%)
                        </td>
                        <td>{cp.totalWhatsappConversations}</td>
                        <td style={{ fontWeight: 700, color: 'var(--rtw-success-text)' }}>
                          {cp.totalVerifiedPurchases}
                        </td>
                        <td>{formatCop(cp.totalSpendCop)}</td>
                        <td>{cp.cpaPerPurchaseCop !== null ? formatCop(cp.cpaPerPurchaseCop) : 'N/A'}</td>
                        <td style={{ fontWeight: 700 }}>{formatCop(cp.totalAttributedRevenueCop)}</td>
                        <td style={{ fontWeight: 800 }}>
                          {cp.roasMultiplier !== null ? `${cp.roasMultiplier}x` : 'N/A'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: CONTRASTE CON REGISTROS SUBYACENTES Y AUDITORÍA                */}
      {/* ===================================================================== */}
      {activeTab === 'UNDERLYING_CONTRAST' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="rtw-card">
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
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                  Matriz de Origen, Fórmulas y Diferenciación (Real vs Estimación)
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--rtw-text-secondary)' }}>
                  Cada indicador documenta su tabla fuente, fórmula exacta y conteo de registros subyacentes.
                </p>
              </div>
              <button type="button" className="rtw-btn rtw-btn-outline" onClick={() => handleExportCsv('UNDERLYING')}>
                <Download size={14} /> Exportar Subyacentes CSV
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))',
                gap: '12px'
              }}
            >
              {snapshot.auditIndicators.map((ind) => (
                <div
                  key={ind.indicatorKey}
                  style={{
                    border: '1px solid var(--rtw-border-light)',
                    borderRadius: 'var(--rtw-radius-sm)',
                    padding: '12px',
                    backgroundColor: 'var(--rtw-bg-subtle)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '0.82rem' }}>{ind.label}</strong>
                    <span
                      className={`rtw-badge ${
                        ind.metricKind === 'REAL_CONCILIADA' ? 'rtw-badge-success' : 'rtw-badge-warning'
                      }`}
                    >
                      {ind.metricKind === 'REAL_CONCILIADA' ? 'REAL CONCILIADA' : 'ESTIMACIÓN'}
                    </span>
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, marginTop: '6px' }}>{ind.valueFormatted}</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--rtw-text-secondary)', marginTop: '4px' }}>
                    <strong>Origen:</strong> {ind.dataOrigin} ({ind.underlyingRecordCount} registros)
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--rtw-text-muted)', marginTop: '2px' }}>
                    <strong>Fórmula:</strong> {ind.calculationFormula}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rtw-card">
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
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.9rem' }}>
                <AlertCircle size={15} />
                Registros Subyacentes Auditados ({filteredUnderlying.length})
              </span>
              <select
                className="rtw-select"
                style={{ width: 'auto' }}
                value={contrastTypeFilter}
                onChange={(e) =>
                  setContrastTypeFilter(e.target.value as 'ALL' | BiUnderlyingContrastItem['recordType'])
                }
              >
                <option value="ALL">Todos los tipos</option>
                <option value="ORDER">Pedidos (ORDER)</option>
                <option value="INVENTORY_LOT">Lotes de Inventario (INVENTORY_LOT)</option>
                <option value="EXPENSE">Gastos (EXPENSE)</option>
                <option value="SETTLEMENT">Liquidaciones (SETTLEMENT)</option>
                <option value="CRM_LEAD">Prospectos CRM (CRM_LEAD)</option>
                <option value="PUBLICATION">Publicaciones (PUBLICATION)</option>
                <option value="META_ADS_CAMPAIGN">Campañas Ads (META_ADS_CAMPAIGN)</option>
              </select>
            </div>

            <div className="rtw-table-container" style={{ maxHeight: '460px' }}>
              <table className="rtw-table">
                <thead>
                  <tr>
                    <th>Tipo / Código</th>
                    <th>Fecha</th>
                    <th>Propietario</th>
                    <th>SKU / Alcance</th>
                    <th>Estado</th>
                    <th>Unidades</th>
                    <th>Monto COP</th>
                    <th>Origen / Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUnderlying.map((item, idx) => (
                    <tr key={`${item.recordType}-${item.recordCode}-${idx}`}>
                      <td>
                        <strong>{item.recordCode}</strong>
                        <div style={{ fontSize: '0.7rem', color: 'var(--rtw-text-muted)' }}>{item.recordType}</div>
                      </td>
                      <td>{item.date}</td>
                      <td>{item.ownerLabel}</td>
                      <td>{item.skuOrScope}</td>
                      <td>
                        <span
                          className={`rtw-badge ${
                            item.metricKind === 'REAL_CONCILIADA' ? 'rtw-badge-success' : 'rtw-badge-warning'
                          }`}
                        >
                          {item.statusLabel}
                        </span>
                      </td>
                      <td>{item.units}</td>
                      <td style={{ fontWeight: 700 }}>{formatCop(item.amountCop)}</td>
                      <td>
                        <div style={{ fontSize: '0.75rem' }}>{item.originTable}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--rtw-text-muted)' }}>{item.detailNote}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
