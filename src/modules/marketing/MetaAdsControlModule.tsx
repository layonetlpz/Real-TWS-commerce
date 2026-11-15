import React, { useState, useMemo } from 'react';
import {
  Megaphone,
  TrendingUp,
  Upload,
  Download,
  ShieldCheck,
  Users,
  Layers,
  PauseCircle,
  PlayCircle,
  Lock,
  History
} from 'lucide-react';
import {
  getRealCatalogMerchItems,
  type RealCatalogMerchItem
} from '../../services/brandMerchandisingService';
import {
  getMetaAdsControlState,
  getDataSourceBadgeLabel,
  registerManualMetaAdsCampaignBundle,
  pauseOrResumeCampaignWithHumanApproval,
  recordManualOrSyncedCampaignMetrics,
  importAdsManagerCsvReport,
  generateSampleAdsManagerCsvContent,
  registerMultiOwnerAdSpendAllocation,
  calculateAllCampaignPerformances,
  evaluateMetaAdsSmartAlerts,
  type AdsChannelType,
  type AdsOwnerAllocationPolicy,
  type AdsDataSourceOrigin
} from '../../services/metaAdsControlService';
import { useAuth } from '../../hooks/useAuth';
import { useOwnerScope } from '../../hooks/useOwnerScope';
import { useNotifications } from '../../hooks/useNotifications';
import { SegmentedTabs } from '../../components/glass';
import { formatCOP } from '../../utils/formatters';

type MetaAdsTab =
  | 'DASHBOARD_AND_CAMPAIGNS'
  | 'METRICS_AND_CSV_IMPORT'
  | 'PROFITABILITY_AND_MULTIOWNER'
  | 'FUTURE_API_AND_HISTORY';

function formatDateTimeCO(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

export const MetaAdsControlModule: React.FC = () => {
  const { userProfile } = useAuth();
  const { selectedOwnerScope } = useOwnerScope();
  const { notify } = useNotifications();

  const actorName = userProfile?.fullName || userProfile?.email || 'Director Performance REAL TWS';

  const [activeTab, setActiveTab] = useState<MetaAdsTab>('DASHBOARD_AND_CAMPAIGNS');
  const [refreshTick, setRefreshTick] = useState(0);

  const adsState = useMemo(() => getMetaAdsControlState(), [refreshTick]);
  const catalogItems = useMemo(() => getRealCatalogMerchItems(), [refreshTick]);
  const performances = useMemo(() => calculateAllCampaignPerformances(), [refreshTick]);
  const smartAlerts = useMemo(() => evaluateMetaAdsSmartAlerts(), [refreshTick]);

  // Selección de SKU y Propietario para nueva campaña manual
  const [selectedSku, setSelectedSku] = useState<string>(() => catalogItems[0]?.sku || '');
  const selectedCatalogItem: RealCatalogMerchItem | null = useMemo(
    () => catalogItems.find((i) => i.sku === selectedSku) || catalogItems[0] || null,
    [catalogItems, selectedSku]
  );

  const availableOwners = useMemo(() => {
    if (!selectedCatalogItem || selectedCatalogItem.ownerAllocations.length === 0) {
      return [{ ownerId: 'OWN-0001', ownerName: 'Eberto (Propietario Inicial)', qtyAvailable: 0 }];
    }
    return selectedCatalogItem.ownerAllocations;
  }, [selectedCatalogItem]);

  const [selectedOwnerId, setSelectedOwnerId] = useState<string>(
    selectedOwnerScope && selectedOwnerScope !== 'ALL' ? selectedOwnerScope : 'OWN-0001'
  );

  // Formulario de Registro Manual de Campaña + Conjunto + Anuncio
  const [campaignNameDraft, setCampaignNameDraft] = useState<string>('');
  const [channelDraft, setChannelDraft] = useState<AdsChannelType>('whatsapp');
  const objectiveDraft = 'Conversaciones a WhatsApp y Ventas Verificadas';
  const [allocationPolicyDraft, setAllocationPolicyDraft] =
    useState<AdsOwnerAllocationPolicy>('direct_owner');
  const [budgetCapDraft, setBudgetCapDraft] = useState<number>(60000);
  const [targetCpaDraft, setTargetCpaDraft] = useState<number>(15000);
  const [adSetNameDraft, setAdSetNameDraft] = useState<string>('');
  const audienceSummaryDraft = 'Barranquilla y Atlántico • Compradores de Tecnología y Audio';
  const [adNameDraft, setAdNameDraft] = useState<string>('');
  const [creativeFormatDraft, setCreativeFormatDraft] = useState<'1:1' | '4:5' | '9:16' | 'VIDEO_REEL'>('1:1');

  // Control de Pausa Aprobada
  const [pauseReasonInputs, setPauseReasonInputs] = useState<Record<string, string>>({});

  // Formulario de Registro de Métricas y Importación CSV
  const [selectedCampaignIdForMetrics, setSelectedCampaignIdForMetrics] = useState<string>('');
  const [metricDateDraft, setMetricDateDraft] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [impressionsDraft, setImpressionsDraft] = useState<number>(2800);
  const reachDraft = 2200;
  const [clicksDraft, setClicksDraft] = useState<number>(95);
  const [conversationsDraft, setConversationsDraft] = useState<number>(12);
  const [purchasesDraft, setPurchasesDraft] = useState<number>(1);
  const [spendDraft, setSpendDraft] = useState<number>(12000);
  const [dataSourceDraft, setDataSourceDraft] = useState<AdsDataSourceOrigin>('MANUAL_ENTRY');
  const [csvTextDraft, setCsvTextDraft] = useState<string>(() =>
    generateSampleAdsManagerCsvContent()
  );

  // Atribución Multipropietario
  const [selectedCampaignIdForAlloc, setSelectedCampaignIdForAlloc] = useState<string>('');
  const [ownerAuthChecked, setOwnerAuthChecked] = useState<boolean>(false);
  const [allocNotesDraft, setAllocNotesDraft] = useState<string>('');

  // Totales ejecutivos consolidados
  const globalTotals = useMemo(() => {
    const totalSpend = performances.reduce((s, p) => s + p.totalSpendCop, 0);
    const totalConversations = performances.reduce(
      (s, p) => s + p.totalWhatsappConversations,
      0
    );
    const totalPurchases = performances.reduce((s, p) => s + p.totalVerifiedPurchases, 0);
    const totalRevenue = performances.reduce((s, p) => s + p.totalAttributedRevenueCop, 0);
    const totalContribution = performances.reduce(
      (s, p) => s + p.netContributionAfterAdsCop,
      0
    );
    const globalRoas = totalSpend > 0 ? Number((totalRevenue / totalSpend).toFixed(2)) : null;
    const globalCpa = totalPurchases > 0 ? Math.round(totalSpend / totalPurchases) : null;

    return {
      totalSpend,
      totalConversations,
      totalPurchases,
      totalRevenue,
      totalContribution,
      globalRoas,
      globalCpa
    };
  }, [performances]);

  // Rentabilidad agrupada por Producto, Propietario y Canal
  const profitabilityBySku = useMemo(() => {
    const map = new Map<
      string,
      {
        sku: string;
        productName: string;
        spendCop: number;
        conversations: number;
        purchases: number;
        revenueCop: number;
        cogsCop: number;
        netContributionCop: number;
      }
    >();
    for (const p of performances) {
      const key = p.campaign.promotedSku;
      const prev = map.get(key) || {
        sku: key,
        productName: p.campaign.promotedProductName,
        spendCop: 0,
        conversations: 0,
        purchases: 0,
        revenueCop: 0,
        cogsCop: 0,
        netContributionCop: 0
      };
      prev.spendCop += p.totalSpendCop;
      prev.conversations += p.totalWhatsappConversations;
      prev.purchases += p.totalVerifiedPurchases;
      prev.revenueCop += p.totalAttributedRevenueCop;
      prev.cogsCop += p.totalAttributedCogsCop;
      prev.netContributionCop += p.netContributionAfterAdsCop;
      map.set(key, prev);
    }
    return Array.from(map.values());
  }, [performances]);

  const profitabilityByOwnerAndChannel = useMemo(() => {
    const map = new Map<
      string,
      {
        ownerId: string;
        ownerName: string;
        channel: AdsChannelType;
        spendCop: number;
        conversations: number;
        purchases: number;
        revenueCop: number;
        netContributionCop: number;
      }
    >();
    for (const p of performances) {
      const key = `${p.campaign.targetOwnerId}__${p.campaign.channel}`;
      const prev = map.get(key) || {
        ownerId: p.campaign.targetOwnerId,
        ownerName: p.campaign.targetOwnerName,
        channel: p.campaign.channel,
        spendCop: 0,
        conversations: 0,
        purchases: 0,
        revenueCop: 0,
        netContributionCop: 0
      };
      prev.spendCop += p.totalSpendCop;
      prev.conversations += p.totalWhatsappConversations;
      prev.purchases += p.totalVerifiedPurchases;
      prev.revenueCop += p.totalAttributedRevenueCop;
      prev.netContributionCop += p.netContributionAfterAdsCop;
      map.set(key, prev);
    }
    return Array.from(map.values());
  }, [performances]);

  // Handlers
  const handleCreateManualCampaignBundle = () => {
    try {
      const created = registerManualMetaAdsCampaignBundle({
        campaignName:
          campaignNameDraft.trim() ||
          `Campaña ${selectedSku} — ${channelDraft.toUpperCase()}`,
        channel: channelDraft,
        objective: objectiveDraft,
        promotedSku: selectedSku,
        targetOwnerId: selectedOwnerId,
        ownerAllocationPolicy: allocationPolicyDraft,
        manualBudgetCapCop: budgetCapDraft,
        targetCpaCop: targetCpaDraft,
        adSetName: adSetNameDraft,
        audienceSummary: audienceSummaryDraft,
        adName: adNameDraft,
        creativeFormat: creativeFormatDraft,
        actorName
      });
      setSelectedCampaignIdForMetrics(created.campaign.id);
      setSelectedCampaignIdForAlloc(created.campaign.id);
      setCampaignNameDraft('');
      setRefreshTick((t) => t + 1);
      notify(
        'success',
        `Campaña Manual Creada (${created.campaign.campaignCode})`,
        `Registrada como Dato Manual junto con su Conjunto (${created.adSet.adSetCode}) y Anuncio (${created.adCreative.adCode}).`
      );
    } catch (err: unknown) {
      notify(
        'error',
        'Error al registrar campaña manual',
        err instanceof Error ? err.message : 'Verifique los campos.'
      );
    }
  };

  const handleTogglePauseCampaign = (
    campaignId: string,
    targetStatus: 'paused' | 'approved_manual_launch'
  ) => {
    const reason =
      pauseReasonInputs[campaignId] ||
      (targetStatus === 'paused'
        ? 'Pausa manual autorizada tras revisión de métricas'
        : 'Reactivación manual autorizada');
    try {
      const updated = pauseOrResumeCampaignWithHumanApproval({
        campaignId,
        targetStatus,
        reason,
        approvedBy: actorName
      });
      setRefreshTick((t) => t + 1);
      notify(
        'info',
        `Estado de Campaña Actualizado (${updated.campaignCode})`,
        `Nuevo estado: ${updated.status} (Aprobado por ${actorName}).`
      );
    } catch (err: unknown) {
      notify(
        'error',
        'Bloqueo: Aprobación Humana Requerida',
        err instanceof Error ? err.message : 'No se pudo cambiar el estado.'
      );
    }
  };

  const handleRecordMetrics = () => {
    const targetId = selectedCampaignIdForMetrics || adsState.campaigns[0]?.id;
    if (!targetId) {
      notify('warning', 'Sin campaña', 'Primero registre o importe una campaña.');
      return;
    }
    try {
      const recorded = recordManualOrSyncedCampaignMetrics({
        campaignId: targetId,
        metricDate: metricDateDraft,
        impressions: impressionsDraft,
        reach: reachDraft,
        clicks: clicksDraft,
        whatsappConversationsCount: conversationsDraft,
        verifiedPurchasesOrdersCount: purchasesDraft,
        spendCop: spendDraft,
        dataSourceOrigin: dataSourceDraft,
        actorName
      });
      setRefreshTick((t) => t + 1);
      notify(
        'success',
        `Métricas Registradas (${getDataSourceBadgeLabel(recorded.dataSourceOrigin)})`,
        `Conversaciones: ${recorded.whatsappConversationsCount} | Compras Reales: ${recorded.verifiedPurchasesOrdersCount} | Ingresos: ${formatCOP(recorded.attributedRevenueCop)}.`
      );
    } catch (err: unknown) {
      notify(
        'error',
        'Error al registrar métricas',
        err instanceof Error ? err.message : 'Verifique los datos.'
      );
    }
  };

  const handleImportCsv = () => {
    try {
      const res = importAdsManagerCsvReport({
        csvContent: csvTextDraft,
        defaultOwnerId: selectedOwnerId,
        actorName
      });
      setRefreshTick((t) => t + 1);
      notify(
        'success',
        'Informe CSV de Ads Manager Importado',
        `Campañas nuevas: ${res.importedCampaignsCount} • Filas de métricas importadas: ${res.importedMetricsCount}.`
      );
    } catch (err: unknown) {
      notify(
        'error',
        'Error en importación CSV',
        err instanceof Error ? err.message : 'Revise el formato CSV.'
      );
    }
  };

  const handleUploadCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCsvTextDraft(reader.result);
        notify('info', 'Archivo CSV Cargado', 'Pulse "Importar Informe CSV" para procesar las filas.');
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleDownloadSampleCsv = () => {
    const content = generateSampleAdsManagerCsvContent();
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PLANTILLA_ADS_MANAGER_REAL_TWS.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRegisterOwnerSpendAllocation = () => {
    const targetId = selectedCampaignIdForAlloc || adsState.campaigns[0]?.id;
    if (!targetId) {
      notify('warning', 'Seleccione una campaña', 'Primero registre una campaña con gasto.');
      return;
    }
    try {
      const alloc = registerMultiOwnerAdSpendAllocation({
        campaignId: targetId,
        allocationPolicyUsed: allocationPolicyDraft,
        ownerDeductionAuthorized: ownerAuthChecked,
        actorName,
        notes: allocNotesDraft
      });
      setRefreshTick((t) => t + 1);
      notify(
        alloc.deductionStatus === 'authorized_and_applied' ? 'success' : 'warning',
        `Atribución Multipropietario (${alloc.allocationCode})`,
        `Estado: ${alloc.deductionStatus}. ${alloc.notes}`
      );
    } catch (err: unknown) {
      notify(
        'error',
        'No se pudo asignar gasto publicitario',
        err instanceof Error ? err.message : 'Error.'
      );
    }
  };

  return (
    <div className="module-container rtw-stack-lg">
      {/* Cabecera Ejecutiva */}
      <div className="card rtw-glass-dark" style={{ padding: '1.35rem 1.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '1rem'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.3rem' }}>
              <Megaphone size={18} color="#D4AF37" />
              <span
                style={{
                  color: '#D4AF37',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase'
                }}
              >
                Meta Ads &amp; Rentabilidad
              </span>
            </div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 750, color: '#F9FAFB', margin: 0, letterSpacing: '-0.02em' }}>
              Campañas, CPA y ROAS Multipropietario
            </h1>
            <p style={{ color: '#9CA3AF', marginTop: '0.3rem', fontSize: '0.88rem' }}>
              Separa conversaciones de ventas verificadas y protege la rentabilidad por propietario.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="rtw-badge badge-success">
              Sin gasto automático
            </span>
            <span className={`rtw-badge ${smartAlerts.length > 0 ? 'badge-warning' : 'badge-gold'}`}>
              Alertas: {smartAlerts.length}
            </span>
          </div>
        </div>

        {/* KPIs Ejecutivos de Publicidad y Rentabilidad */}
        <div
          style={{
            marginTop: '1.2rem',
            paddingTop: '1.1rem',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
            gap: '0.75rem'
          }}
        >
          {[
            {
              label: 'GASTO PUBLICITARIO',
              value: formatCOP(globalTotals.totalSpend),
              sub: `${adsState.campaigns.length} campaña(s)`
            },
            {
              label: 'CONVERSACIONES (NO SON COMPRAS)',
              value: `${globalTotals.totalConversations}`,
              sub: 'Chats iniciados en WhatsApp'
            },
            {
              label: 'COMPRAS REALES VERIFICADAS',
              value: `${globalTotals.totalPurchases}`,
              sub: 'Pedidos reales cerrados'
            },
            {
              label: 'CPA REAL POR COMPRA',
              value: globalTotals.globalCpa ? formatCOP(globalTotals.globalCpa) : '—',
              sub: 'Gasto / Compras reales'
            },
            {
              label: 'ROAS REAL',
              value: globalTotals.globalRoas !== null ? `${globalTotals.globalRoas}x` : '—',
              sub: `Ventas: ${formatCOP(globalTotals.totalRevenue)}`
            },
            {
              label: 'CONTRIBUCIÓN NETA',
              value: formatCOP(globalTotals.totalContribution),
              sub: 'Utilidad bruta − Publicidad'
            }
          ].map((kpi, i) => (
            <div
              key={i}
              style={{
                padding: '0.75rem',
                borderRadius: '0.5rem',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(212, 175, 55, 0.22)'
              }}
            >
              <div style={{ fontSize: '0.68rem', color: '#9CA3AF', fontWeight: 700 }}>
                {kpi.label}
              </div>
              <div
                style={{
                  fontSize: '1.15rem',
                  fontWeight: 900,
                  color: '#F3E5AB',
                  marginTop: '0.2rem'
                }}
              >
                {kpi.value}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#D1D5DB', marginTop: '0.1rem' }}>
                {kpi.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Pestañas */}
        <div style={{ marginTop: '1.1rem' }}>
          <SegmentedTabs
            variant="dark"
            value={activeTab}
            onChange={setActiveTab}
            ariaLabel="Secciones de Meta Ads"
            items={[
              {
                id: 'DASHBOARD_AND_CAMPAIGNS',
                label: 'Campañas',
                icon: <Layers size={15} />,
                count: adsState.campaigns.length
              },
              {
                id: 'METRICS_AND_CSV_IMPORT',
                label: 'Métricas y CSV',
                icon: <Upload size={15} />,
                count: adsState.metrics.length
              },
              {
                id: 'PROFITABILITY_AND_MULTIOWNER',
                label: 'Rentabilidad',
                icon: <TrendingUp size={15} />
              },
              {
                id: 'FUTURE_API_AND_HISTORY',
                label: 'API e Historial',
                icon: <Lock size={15} />
              }
            ]}
          />
        </div>
      </div>

      {/* =====================================================================
          PESTAÑA 1: DASHBOARD DE CAMPAÑAS, CONJUNTOS, ANUNCIOS Y 6 ALERTAS
          ===================================================================== */}
      {activeTab === 'DASHBOARD_AND_CAMPAIGNS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          {/* Panel de las 6 Alertas Inteligentes */}
          {smartAlerts.length > 0 && (
            <div className="card" style={{ padding: '1.25rem', border: '1px solid #F59E0B' }}>
              <h3 style={{ fontSize: '1.02rem', fontWeight: 800, marginBottom: '0.75rem' }}>
                Centro de Alertas Inteligentes de Pauta ({smartAlerts.length})
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: '0.75rem'
                }}
              >
                {smartAlerts.map((al) => (
                  <div
                    key={al.id}
                    style={{
                      padding: '0.85rem',
                      borderRadius: '0.45rem',
                      border: `1px solid ${
                        al.severity === 'critical'
                          ? '#EF4444'
                          : al.severity === 'opportunity'
                            ? '#10B981'
                            : '#F59E0B'
                      }`,
                      background:
                        al.severity === 'critical'
                          ? 'rgba(239,68,68,0.08)'
                          : al.severity === 'opportunity'
                            ? 'rgba(16,185,129,0.08)'
                            : 'rgba(245,158,11,0.08)'
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: '0.85rem' }}>
                      {al.title} — {al.campaignCode} ({al.sku})
                    </div>
                    <div style={{ fontSize: '0.79rem', color: '#374151', marginTop: '0.25rem' }}>
                      {al.message}
                    </div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: '#111827',
                        marginTop: '0.35rem'
                      }}
                    >
                      Acción recomendada: {al.recommendedHumanAction}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Formulario de Registro Manual de Campaña + Conjunto + Anuncio + Creatividad */}
          <div className="card" style={{ padding: '1.35rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.35rem' }}>
              Registrar Nueva Campaña Manual (Campaña + Conjunto + Anuncio + SKU + Propietario)
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#6B7280', marginBottom: '1rem' }}>
              Registra manualmente la estructura publicitaria vinculada al SKU y al propietario de la mercancía promovida. El sistema jamás crea campañas ni gasta dinero por sí solo.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '0.8rem',
                marginBottom: '0.9rem'
              }}
            >
              <div>
                <label className="form-label">Nombre de la Campaña</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={`Ej. Campaña WhatsApp ${selectedSku}`}
                  value={campaignNameDraft}
                  onChange={(e) => setCampaignNameDraft(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label">Producto Promovido (SKU)</label>
                <select
                  className="form-input"
                  value={selectedSku}
                  onChange={(e) => setSelectedSku(e.target.value)}
                >
                  {catalogItems.map((item) => (
                    <option key={item.sku} value={item.sku}>
                      {item.sku} — {item.productName} | Disp: {item.qtyAvailableTotal}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Propietario de Mercancía Promovida</label>
                <select
                  className="form-input"
                  value={selectedOwnerId}
                  onChange={(e) => setSelectedOwnerId(e.target.value)}
                >
                  {availableOwners.map((o) => (
                    <option key={o.ownerId} value={o.ownerId}>
                      {o.ownerId} — {o.ownerName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Canal Publicitario</label>
                <select
                  className="form-input"
                  value={channelDraft}
                  onChange={(e) => setChannelDraft(e.target.value as AdsChannelType)}
                >
                  <option value="whatsapp">WhatsApp Click-to-Chat</option>
                  <option value="instagram">Instagram Feed / Reels</option>
                  <option value="facebook">Facebook Feed</option>
                  <option value="marketplace">Marketplace Destacado</option>
                </select>
              </div>

              <div>
                <label className="form-label">Presupuesto Manual Autorizado (COP)</label>
                <input
                  type="number"
                  min={5000}
                  step={5000}
                  className="form-input"
                  value={budgetCapDraft}
                  onChange={(e) => setBudgetCapDraft(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>

              <div>
                <label className="form-label">CPA Objetivo por Compra (COP)</label>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  className="form-input"
                  value={targetCpaDraft}
                  onChange={(e) => setTargetCpaDraft(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>

              <div>
                <label className="form-label">Nombre del Conjunto de Anuncios</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej. Conjunto Costa Atlántica 18-45"
                  value={adSetNameDraft}
                  onChange={(e) => setAdSetNameDraft(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label">Nombre del Anuncio / Creatividad</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={`Ej. Anuncio Foto Real ${selectedSku}`}
                  value={adNameDraft}
                  onChange={(e) => setAdNameDraft(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label">Formato de Creatividad</label>
                <select
                  className="form-input"
                  value={creativeFormatDraft}
                  onChange={(e) =>
                    setCreativeFormatDraft(
                      e.target.value as '1:1' | '4:5' | '9:16' | 'VIDEO_REEL'
                    )
                  }
                >
                  <option value="1:1">1:1 Cuadrado (1080×1080)</option>
                  <option value="4:5">4:5 Vertical Feed (1080×1350)</option>
                  <option value="9:16">9:16 Story / Reel (1080×1920)</option>
                  <option value="VIDEO_REEL">Guion de Video Creative Studio</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCreateManualCampaignBundle}
            >
              Registrar Campaña, Conjunto y Anuncio (Dato Manual)
            </button>
          </div>

          {/* Tabla de Campañas con Resultados, Conversaciones vs Compras, CPA, ROAS y Contribución */}
          <div className="card" style={{ padding: '1.35rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '0.8rem' }}>
              Matriz de Campañas, Presupuestos, Conversaciones vs. Compras, CPA, ROAS y Contribución
            </h3>
            {performances.length === 0 ? (
              <div style={{ color: '#6B7280', fontSize: '0.85rem' }}>
                No hay campañas registradas aún. Cree una arriba o importe el informe CSV en la Pestaña 2.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Código / Origen</th>
                      <th>Campaña / Canal</th>
                      <th>SKU / Propietario</th>
                      <th>Presupuesto / Gasto</th>
                      <th>Conversaciones WhatsApp</th>
                      <th>Compras Reales</th>
                      <th>CPA Compra</th>
                      <th>ROAS</th>
                      <th>Contribución Neta</th>
                      <th>Estado / Control Humano</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performances.map((perf) => {
                      const cmp = perf.campaign;
                      return (
                        <tr key={cmp.id}>
                          <td>
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                              {cmp.campaignCode}
                            </div>
                            <span
                              className="badge"
                              style={{
                                fontSize: '0.68rem',
                                background:
                                  cmp.dataSourceOrigin === 'MANUAL_ENTRY'
                                    ? 'rgba(212,175,55,0.16)'
                                    : cmp.dataSourceOrigin === 'CSV_ADS_MANAGER_IMPORT'
                                      ? 'rgba(59,130,246,0.16)'
                                      : 'rgba(16,185,129,0.16)',
                                color:
                                  cmp.dataSourceOrigin === 'MANUAL_ENTRY'
                                    ? '#B45309'
                                    : cmp.dataSourceOrigin === 'CSV_ADS_MANAGER_IMPORT'
                                      ? '#2563EB'
                                      : '#059669'
                              }}
                            >
                              {getDataSourceBadgeLabel(cmp.dataSourceOrigin)}
                            </span>
                          </td>
                          <td>
                            <strong>{cmp.campaignName}</strong>
                            <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                              Canal: {cmp.channel}
                            </div>
                          </td>
                          <td>
                            <strong>{cmp.promotedSku}</strong>
                            <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                              {cmp.targetOwnerId} ({cmp.targetOwnerName})
                            </div>
                          </td>
                          <td>
                            <div>Tope: {formatCOP(cmp.manualBudgetCapCop)}</div>
                            <div style={{ fontWeight: 700 }}>
                              Gasto: {formatCOP(perf.totalSpendCop)} ({perf.budgetConsumedPct}%)
                            </div>
                          </td>
                          <td>
                            <strong>{perf.totalWhatsappConversations} chats</strong>
                            <div style={{ fontSize: '0.73rem', color: '#6B7280' }}>
                              {perf.costPerConversationCop
                                ? `${formatCOP(perf.costPerConversationCop)} / chat`
                                : '—'}
                            </div>
                          </td>
                          <td style={{ fontWeight: 800, color: '#059669' }}>
                            {perf.totalVerifiedPurchases} pedido(s)
                            <div style={{ fontSize: '0.73rem', color: '#374151' }}>
                              Ventas: {formatCOP(perf.totalAttributedRevenueCop)}
                            </div>
                          </td>
                          <td style={{ fontWeight: 700 }}>
                            {perf.cpaPerPurchaseCop
                              ? formatCOP(perf.cpaPerPurchaseCop)
                              : 'Sin compras'}
                          </td>
                          <td style={{ fontWeight: 800 }}>
                            {perf.roasMultiplier !== null ? `${perf.roasMultiplier}x` : '—'}
                          </td>
                          <td
                            style={{
                              fontWeight: 800,
                              color:
                                perf.netContributionAfterAdsCop >= 0 ? '#059669' : '#DC2626'
                            }}
                          >
                            {formatCOP(perf.netContributionAfterAdsCop)}
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                              <span className="badge">{cmp.status}</span>
                              <input
                                type="text"
                                className="form-input"
                                style={{ fontSize: '0.72rem', padding: '0.22rem 0.45rem' }}
                                placeholder="Motivo aprobación..."
                                value={pauseReasonInputs[cmp.id] || ''}
                                onChange={(e) =>
                                  setPauseReasonInputs((prev) => ({
                                    ...prev,
                                    [cmp.id]: e.target.value
                                  }))
                                }
                              />
                              {cmp.status === 'approved_manual_launch' ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem' }}
                                  onClick={() => handleTogglePauseCampaign(cmp.id, 'paused')}
                                >
                                  <PauseCircle size={12} style={{ marginRight: '0.25rem' }} /> Aprobar
                                  Pausa
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem' }}
                                  onClick={() =>
                                    handleTogglePauseCampaign(cmp.id, 'approved_manual_launch')
                                  }
                                >
                                  <PlayCircle size={12} style={{ marginRight: '0.25rem' }} /> Aprobar
                                  Reanudación
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 2: RESULTADOS, CONVERSIONES E IMPORTACIÓN CSV DE ADS MANAGER
          ===================================================================== */}
      {activeTab === 'METRICS_AND_CSV_IMPORT' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: '1.4rem'
          }}
        >
          {/* Registro Manual de Resultados Diarios */}
          <div className="card" style={{ padding: '1.35rem' }}>
            <h2 style={{ fontSize: '1.08rem', fontWeight: 800, marginBottom: '0.35rem' }}>
              Registrar Resultados y Conversiones por Campaña
            </h2>
            <p style={{ fontSize: '0.81rem', color: '#6B7280', marginBottom: '0.9rem' }}>
              Registra impresiones, clics, gasto, <strong>conversaciones iniciadas</strong> y <strong>compras reales verificadas</strong>. Recuerde: las conversaciones nunca se contabilizan como compras.
            </p>

            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="form-label">Campaña</label>
              <select
                className="form-input"
                value={selectedCampaignIdForMetrics}
                onChange={(e) => setSelectedCampaignIdForMetrics(e.target.value)}
              >
                <option value="">Seleccione campaña...</option>
                {adsState.campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.campaignCode} — {c.campaignName} ({c.promotedSku} • {c.targetOwnerId})
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.65rem',
                marginBottom: '0.8rem'
              }}
            >
              <div>
                <label className="form-label">Fecha de Métrica</label>
                <input
                  type="date"
                  className="form-input"
                  value={metricDateDraft}
                  onChange={(e) => setMetricDateDraft(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label">Etiqueta de Origen del Dato</label>
                <select
                  className="form-input"
                  value={dataSourceDraft}
                  onChange={(e) => setDataSourceDraft(e.target.value as AdsDataSourceOrigin)}
                >
                  <option value="MANUAL_ENTRY">Dato Manual (MANUAL_ENTRY)</option>
                  <option value="META_API_SYNCED">Sincronizado Meta API (META_API_SYNCED)</option>
                </select>
              </div>

              <div>
                <label className="form-label">Impresiones</label>
                <input
                  type="number"
                  min={0}
                  className="form-input"
                  value={impressionsDraft}
                  onChange={(e) => setImpressionsDraft(Number(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="form-label">Clics en el Anuncio</label>
                <input
                  type="number"
                  min={0}
                  className="form-input"
                  value={clicksDraft}
                  onChange={(e) => setClicksDraft(Number(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="form-label">Conversaciones WhatsApp (No son compras)</label>
                <input
                  type="number"
                  min={0}
                  className="form-input"
                  value={conversationsDraft}
                  onChange={(e) => setConversationsDraft(Number(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="form-label">Compras / Pedidos Reales Cerrados</label>
                <input
                  type="number"
                  min={0}
                  className="form-input"
                  value={purchasesDraft}
                  onChange={(e) => setPurchasesDraft(Number(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="form-label">Gasto Publicitario del Día (COP)</label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  className="form-input"
                  value={spendDraft}
                  onChange={(e) => setSpendDraft(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <button type="button" className="btn btn-primary" onClick={handleRecordMetrics}>
              Guardar Registro de Métricas
            </button>
          </div>

          {/* Importador de Informes CSV de Ads Manager */}
          <div className="card" style={{ padding: '1.35rem' }}>
            <h2 style={{ fontSize: '1.08rem', fontWeight: 800, marginBottom: '0.35rem' }}>
              Importar Informe CSV de Meta Ads Manager
            </h2>
            <p style={{ fontSize: '0.81rem', color: '#6B7280', marginBottom: '0.85rem' }}>
              Sube o pega un informe CSV exportado de Ads Manager. Cada fila importada queda identificada como <code>Importado CSV Ads Manager</code> y relacionada con su SKU y Propietario.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                <Upload size={14} style={{ marginRight: '0.3rem' }} /> Subir Archivo .CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={handleUploadCsvFile}
                />
              </label>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleDownloadSampleCsv}
              >
                <Download size={14} style={{ marginRight: '0.3rem' }} /> Descargar Plantilla CSV
              </button>
            </div>

            <textarea
              rows={6}
              className="form-input"
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', marginBottom: '0.8rem' }}
              value={csvTextDraft}
              onChange={(e) => setCsvTextDraft(e.target.value)}
            />

            <button type="button" className="btn btn-primary" onClick={handleImportCsv}>
              Procesar e Importar Informe CSV de Ads Manager
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 3: RENTABILIDAD POR PRODUCTO, PROPIETARIO Y CANAL
          ===================================================================== */}
      {activeTab === 'PROFITABILITY_AND_MULTIOWNER' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          {/* Rentabilidad por Producto (SKU) */}
          <div className="card" style={{ padding: '1.35rem' }}>
            <h2 style={{ fontSize: '1.08rem', fontWeight: 800, marginBottom: '0.75rem' }}>
              Rentabilidad Publicitaria por Producto (SKU)
            </h2>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Producto</th>
                    <th>Gasto Publicitario</th>
                    <th>Conversaciones</th>
                    <th>Compras Reales</th>
                    <th>Ingresos Reales</th>
                    <th>Costo Vendido (COGS)</th>
                    <th>ROAS</th>
                    <th>Contribución Neta</th>
                  </tr>
                </thead>
                <tbody>
                  {profitabilityBySku.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', color: '#6B7280' }}>
                        Sin métricas registradas.
                      </td>
                    </tr>
                  ) : (
                    profitabilityBySku.map((row) => (
                      <tr key={row.sku}>
                        <td style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                          {row.sku}
                        </td>
                        <td>{row.productName}</td>
                        <td>{formatCOP(row.spendCop)}</td>
                        <td>{row.conversations}</td>
                        <td style={{ fontWeight: 800, color: '#059669' }}>{row.purchases}</td>
                        <td>{formatCOP(row.revenueCop)}</td>
                        <td>{formatCOP(row.cogsCop)}</td>
                        <td style={{ fontWeight: 800 }}>
                          {row.spendCop > 0 ? `${(row.revenueCop / row.spendCop).toFixed(2)}x` : '—'}
                        </td>
                        <td
                          style={{
                            fontWeight: 800,
                            color: row.netContributionCop >= 0 ? '#059669' : '#DC2626'
                          }}
                        >
                          {formatCOP(row.netContributionCop)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Rentabilidad por Propietario y Canal + Atribución Multipropietario */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '1.4rem'
            }}
          >
            <div className="card" style={{ padding: '1.35rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '0.7rem' }}>
                Rentabilidad por Propietario y Canal
              </h3>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Propietario</th>
                      <th>Canal</th>
                      <th>Gasto</th>
                      <th>Conversaciones</th>
                      <th>Compras</th>
                      <th>Contribución</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitabilityByOwnerAndChannel.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', color: '#6B7280' }}>
                          Sin datos.
                        </td>
                      </tr>
                    ) : (
                      profitabilityByOwnerAndChannel.map((r, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 700 }}>
                            {r.ownerId} ({r.ownerName})
                          </td>
                          <td>{r.channel}</td>
                          <td>{formatCOP(r.spendCop)}</td>
                          <td>{r.conversations}</td>
                          <td style={{ fontWeight: 700 }}>{r.purchases}</td>
                          <td
                            style={{
                              fontWeight: 800,
                              color: r.netContributionCop >= 0 ? '#059669' : '#DC2626'
                            }}
                          >
                            {formatCOP(r.netContributionCop)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Atribución Multipropietario del Gasto Publicitario */}
            <div className="card" style={{ padding: '1.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.35rem' }}>
                <Users size={18} color="#D4AF37" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>
                  Atribución Multipropietario del Gasto Publicitario
                </h3>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.85rem' }}>
                Regla Crítica: Nunca se descuenta publicidad de un propietario sin su autorización explícita y sin que su acuerdo comercial esté configurado y activo.
              </p>

              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">Campaña a Distribuir</label>
                <select
                  className="form-input"
                  value={selectedCampaignIdForAlloc}
                  onChange={(e) => setSelectedCampaignIdForAlloc(e.target.value)}
                >
                  <option value="">Seleccione campaña...</option>
                  {adsState.campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.campaignCode} — {c.promotedSku} ({c.targetOwnerId})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">Política de Asignación</label>
                <select
                  className="form-input"
                  value={allocationPolicyDraft}
                  onChange={(e) =>
                    setAllocationPolicyDraft(e.target.value as AdsOwnerAllocationPolicy)
                  }
                >
                  <option value="direct_owner">Directo al Propietario del SKU (Con Acuerdo Activo)</option>
                  <option value="shared_proportional_sales">Compartido Proporcional a Ventas</option>
                  <option value="store_absorbed">Asumido 100% por REAL TWS (Sin descontar al dueño)</option>
                </select>
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={ownerAuthChecked}
                    onChange={(e) => setOwnerAuthChecked(e.target.checked)}
                  />
                  El propietario autorizó explícitamente descontar esta pauta
                </label>
              </div>

              <div className="form-group" style={{ marginBottom: '0.85rem' }}>
                <label className="form-label">Nota de Auditoría</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Referencia del acuerdo o acta de autorización..."
                  value={allocNotesDraft}
                  onChange={(e) => setAllocNotesDraft(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleRegisterOwnerSpendAllocation}
              >
                Registrar Atribución Publicitaria
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 4: ADAPTADOR FUTURO META MARKETING API & HISTORIAL
          ===================================================================== */}
      {activeTab === 'FUTURE_API_AND_HISTORY' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          <div className="card" style={{ padding: '1.35rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <ShieldCheck size={20} color="#D4AF37" />
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
                Adaptador Oficial Meta Marketing API (Preparado y Desactivado Inicialmente)
              </h2>
            </div>
            <p style={{ fontSize: '0.83rem', color: '#6B7280', marginBottom: '1rem' }}>
              Preparado con secretos exclusivamente en servidor (<code>{adsState.futureApiAdapter.secretVaultKeyName}</code>) y permisos oficiales de lectura (<code>ads_read</code>, <code>read_insights</code>). Mantiene bloqueados por arquitectura la creación automática de campañas, el gasto de dinero y la modificación de presupuestos.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '0.75rem',
                marginBottom: '1rem'
              }}
            >
              {[
                { label: 'Estado Inicial Meta API', value: 'DESACTIVADA (false)' },
                { label: 'Crear Campañas Automáticamente', value: 'BLOQUEADO (true)' },
                { label: 'Gastar Dinero / Subir Presupuesto', value: 'BLOQUEADO (true)' },
                { label: 'Pausar Sin Aprobación Humana', value: 'BLOQUEADO (true)' }
              ].map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '0.8rem',
                    borderRadius: '0.45rem',
                    background: 'rgba(16,185,129,0.08)',
                    border: '1px solid #10B981'
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: '#065F46', fontWeight: 700 }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#047857', marginTop: '0.2rem' }}>
                    ✓ {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: '1.35rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '0.75rem' }}>
              <History size={16} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
              Historial Inmutable de Campañas, Importaciones CSV y Asignaciones ({adsState.historyLog.length})
            </h3>
            {adsState.historyLog.length === 0 ? (
              <div style={{ color: '#6B7280', fontSize: '0.83rem' }}>
                Sin eventos registrados aún.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Actor</th>
                      <th>Origen del Dato</th>
                      <th>Acción</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adsState.historyLog.map((ev) => (
                      <tr key={ev.id}>
                        <td>{formatDateTimeCO(ev.timestamp)}</td>
                        <td style={{ fontWeight: 700 }}>{ev.actor}</td>
                        <td>
                          <span className="badge">{getDataSourceBadgeLabel(ev.dataSource)}</span>
                        </td>
                        <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.76rem' }}>
                          {ev.action}
                        </td>
                        <td>{ev.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
export default MetaAdsControlModule;
