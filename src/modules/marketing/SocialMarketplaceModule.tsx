import React, { useState, useMemo, useEffect } from 'react';
import {
  Store,
  Share2,
  Calendar as CalendarIcon,
  MessageCircle,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Download,
  ExternalLink,
  Link2,
  Lock,
  Unplug,
  Send,
  Play,
  History
} from 'lucide-react';
import {
  getRealCatalogMerchItems,
  exportSvgMarkupToPngFile,
  type RealCatalogMerchItem
} from '../../services/brandMerchandisingService';
import {
  getOrInitializeOwnerMarketingConsent,
  registerOwnerMarketingConsent
} from '../../services/creativeStudioService';
import {
  getSocialMarketplaceState,
  validateDistributionCompliance,
  prepareMarketplaceAssistedListing,
  updateMarketplaceListingStatus,
  recordPublishedMarketplaceUrl,
  connectOfficialSocialGraphAdapter,
  disconnectOfficialSocialGraphAdapter,
  setTestSafeModeNoExternalPublish,
  createOrScheduleCalendarPublication,
  approveSocialCalendarPublication,
  rejectSocialCalendarPublication,
  publishApprovedPostToChannel,
  prepareWhatsAppStatusPackage,
  markWhatsAppStatusSharedManually,
  runSocialMarketplaceSafetyTests,
  type DistributionChannelId,
  type MarketplaceAssistedListingRecord,
  type SocialPublicationCalendarItem,
  type SocialDistributionTestSummary
} from '../../services/socialMarketplaceService';
import { useAuth } from '../../hooks/useAuth';
import { useOwnerScope } from '../../hooks/useOwnerScope';
import { useNotifications } from '../../hooks/useNotifications';
import { formatCOP } from '../../utils/formatters';

export type SocialMarketplaceTab =
  | 'MARKETPLACE_ASSISTED'
  | 'SOCIAL_CALENDAR_PUBLISHER'
  | 'OFFICIAL_GRAPH_ADAPTERS'
  | 'WHATSAPP_STATUS_SHARE';

interface SocialMarketplaceModuleProps {
  initialTab?: SocialMarketplaceTab;
}

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

export const SocialMarketplaceModule: React.FC<SocialMarketplaceModuleProps> = ({
  initialTab = 'MARKETPLACE_ASSISTED'
}) => {
  const { userProfile } = useAuth();
  const { selectedOwnerScope } = useOwnerScope();
  const { notify } = useNotifications();

  const actorName = userProfile?.fullName || userProfile?.email || 'Operador Marketing REAL TWS';

  const [activeTab, setActiveTab] = useState<SocialMarketplaceTab>(initialTab);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const distState = useMemo(() => getSocialMarketplaceState(), [refreshTick]);
  const catalogItems = useMemo(() => getRealCatalogMerchItems(), [refreshTick]);

  // Selección Global de SKU, Propietario y Descuento
  const [selectedSku, setSelectedSku] = useState<string>(() => catalogItems[0]?.sku || '');
  const selectedItem: RealCatalogMerchItem | null = useMemo(
    () => catalogItems.find((i) => i.sku === selectedSku) || catalogItems[0] || null,
    [catalogItems, selectedSku]
  );

  const availableOwnersForSku = useMemo(() => {
    if (!selectedItem || selectedItem.ownerAllocations.length === 0) {
      return [{ ownerId: 'OWN-0001', ownerName: 'Eberto (Propietario Inicial)', qtyAvailable: 0 }];
    }
    return selectedItem.ownerAllocations;
  }, [selectedItem]);

  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('OWN-0001');

  useEffect(() => {
    if (selectedOwnerScope && selectedOwnerScope !== 'ALL') {
      setSelectedOwnerId(selectedOwnerScope);
    } else if (
      availableOwnersForSku.length > 0 &&
      !availableOwnersForSku.some((o) => o.ownerId === selectedOwnerId)
    ) {
      setSelectedOwnerId(availableOwnersForSku[0].ownerId);
    }
  }, [selectedOwnerScope, availableOwnersForSku, selectedOwnerId]);

  const currentOwnerName = useMemo(() => {
    const found = availableOwnersForSku.find((o) => o.ownerId === selectedOwnerId);
    return found ? found.ownerName : 'Eberto';
  }, [availableOwnersForSku, selectedOwnerId]);

  const currentConsent = useMemo(() => {
    if (!selectedItem) return null;
    return getOrInitializeOwnerMarketingConsent(
      selectedOwnerId,
      currentOwnerName,
      selectedItem.sku,
      selectedItem.productName
    );
  }, [selectedItem, selectedOwnerId, currentOwnerName, refreshTick]);

  // Estados de Formulario de Marketplace y Calendario
  const [discountPct, setDiscountPct] = useState<number>(0);
  const [customHeadline, setCustomHeadline] = useState<string>('');
  const [customDescription, setCustomDescription] = useState<string>('');
  const [locationLabel, setLocationLabel] = useState<string>('Barranquilla, Atlántico, Colombia');
  const [selectedChannel, setSelectedChannel] = useState<DistributionChannelId>('facebook_page');
  const [scheduledForIso, setScheduledForIso] = useState<string>(() =>
    new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 16)
  );

  // Vista del Calendario: Diario, Semanal, Mensual
  const [calendarViewMode, setCalendarViewMode] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('WEEKLY');
  const [calendarReferenceDate, setCalendarReferenceDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );

  // Registro de URL publicada en Marketplace
  const [marketplaceUrlInputs, setMarketplaceUrlInputs] = useState<Record<string, string>>({});
  const [selectedListingForHistory, setSelectedListingForHistory] =
    useState<MarketplaceAssistedListingRecord | null>(null);
  const [selectedPubForPreview, setSelectedPubForPreview] =
    useState<SocialPublicationCalendarItem | null>(null);
  const [rejectionReasonDraft, setRejectionReasonDraft] = useState<string>('');

  // Configuración OAuth de Facebook Pages e Instagram
  const [fbPageIdInput, setFbPageIdInput] = useState<string>('104928374650192');
  const [fbPageNameInput, setFbPageNameInput] = useState<string>('REAL TWS Oficial Colombia');
  const [igBusinessIdInput, setIgBusinessIdInput] = useState<string>('17841405829301928');
  const [igHandleInput, setIgHandleInput] = useState<string>('@realtws.co');
  const [igEligibleCheck, setIgEligibleCheck] = useState<boolean>(true);

  // Resultados de la Suite de Seguridad
  const [safetyTestResults, setSafetyTestResults] = useState<SocialDistributionTestSummary[] | null>(
    null
  );

  // Validación en vivo
  const liveCompliance = useMemo(
    () =>
      validateDistributionCompliance({
        catalogItem: selectedItem,
        ownerId: selectedOwnerId,
        discountPct,
        channel: activeTab === 'MARKETPLACE_ASSISTED' ? 'marketplace' : selectedChannel,
        headline: customHeadline || selectedItem?.productName || '',
        scheduledDateOnly: scheduledForIso.slice(0, 10)
      }),
    [
      selectedItem,
      selectedOwnerId,
      discountPct,
      activeTab,
      selectedChannel,
      customHeadline,
      scheduledForIso,
      refreshTick
    ]
  );

  // Filtrado del Calendario por Día, Semana o Mes
  const filteredCalendarPublications = useMemo(() => {
    const refDate = new Date(`${calendarReferenceDate}T00:00:00`);
    return distState.calendarPublications.filter((pub) => {
      const pubDateStr = pub.scheduledFor.slice(0, 10);
      if (calendarViewMode === 'DAILY') {
        return pubDateStr === calendarReferenceDate;
      }
      if (calendarViewMode === 'MONTHLY') {
        return pubDateStr.slice(0, 7) === calendarReferenceDate.slice(0, 7);
      }
      // WEEKLY (±3 días alrededor de la fecha de referencia o mismos 7 días)
      const pubDate = new Date(`${pubDateStr}T00:00:00`);
      const diffDays = Math.abs((pubDate.getTime() - refDate.getTime()) / (1000 * 3600 * 24));
      return diffDays <= 7;
    });
  }, [distState.calendarPublications, calendarViewMode, calendarReferenceDate]);

  // Handlers
  const handleQuickGrantOwnerConsent = () => {
    if (!selectedItem) return;
    registerOwnerMarketingConsent({
      ownerId: selectedOwnerId,
      ownerName: currentOwnerName,
      sku: selectedItem.sku,
      productName: selectedItem.productName,
      status: 'granted',
      authorizedChannels: ['marketplace', 'facebook', 'instagram', 'whatsapp'],
      maxAuthorizedDiscountPct: Math.max(15, discountPct),
      consentNotes:
        'Autorización comercial registrada para distribución en Marketplace, Facebook, Instagram y WhatsApp.',
      actorName
    });
    setRefreshTick((t) => t + 1);
    notify(
      'success',
      'Consentimiento del Propietario Otorgado',
      `El propietario ${selectedOwnerId} (${currentOwnerName}) autorizó promocionar el SKU ${selectedItem.sku}.`
    );
  };

  const handleCopyText = (label: string, text: string) => {
    navigator.clipboard.writeText(text);
    notify('info', 'Copiado al portapapeles', `${label} listo para pegar.`);
  };

  const handlePrepareMarketplaceListing = () => {
    if (!selectedItem) return;
    try {
      const created = prepareMarketplaceAssistedListing({
        catalogItem: selectedItem,
        ownerId: selectedOwnerId,
        discountPct,
        customTitle: customHeadline || undefined,
        customDescription: customDescription || undefined,
        locationLabel,
        actorName
      });
      setSelectedListingForHistory(created);
      setRefreshTick((t) => t + 1);
      notify(
        'success',
        `Ficha Marketplace Preparada (${created.listingCode})`,
        `Lista para revisión y publicación manual asistida (${formatCOP(created.effectivePublishedPriceCop)}).`
      );
    } catch (err: unknown) {
      notify(
        'error',
        'Validación bloqueó la ficha de Marketplace',
        err instanceof Error ? err.message : 'No se pudo preparar la publicación.'
      );
    }
  };

  const handleApproveOrRejectMarketplace = (
    listingId: string,
    newStatus: 'approved_for_manual_post' | 'rejected'
  ) => {
    try {
      const updated = updateMarketplaceListingStatus({
        listingId,
        newStatus,
        actorName
      });
      setSelectedListingForHistory(updated);
      setRefreshTick((t) => t + 1);
      notify(
        newStatus === 'approved_for_manual_post' ? 'success' : 'warning',
        newStatus === 'approved_for_manual_post'
          ? 'Ficha Marketplace Aprobada'
          : 'Ficha Marketplace Rechazada',
        `Estado actualizado a ${updated.status}.`
      );
    } catch (err: unknown) {
      notify('error', 'Error', err instanceof Error ? err.message : 'Error al actualizar estado.');
    }
  };

  const handleSaveMarketplacePublishedUrl = (listingId: string) => {
    const url = marketplaceUrlInputs[listingId] || '';
    try {
      const updated = recordPublishedMarketplaceUrl({
        listingId,
        publishedUrl: url,
        actorName
      });
      setSelectedListingForHistory(updated);
      setRefreshTick((t) => t + 1);
      notify(
        'success',
        'URL de Marketplace Registrada',
        `Enlace oficial guardado en el historial de ${updated.listingCode}.`
      );
    } catch (err: unknown) {
      notify(
        'error',
        'No se pudo registrar la URL',
        err instanceof Error ? err.message : 'Verifique la URL.'
      );
    }
  };

  const handleScheduleCalendarPost = () => {
    if (!selectedItem) return;
    try {
      const created = createOrScheduleCalendarPublication({
        catalogItem: selectedItem,
        ownerId: selectedOwnerId,
        channel: selectedChannel,
        discountPct,
        scheduledForIso,
        customHeadline: customHeadline || undefined,
        customBodyText: customDescription || undefined,
        actorName
      });
      setSelectedPubForPreview(created);
      setRefreshTick((t) => t + 1);
      notify(
        'success',
        `Publicación Programada (${created.publicationCode})`,
        `Agregada al calendario en estado Pendiente de Aprobación para ${created.channel}.`
      );
    } catch (err: unknown) {
      notify(
        'error',
        'Bloqueo al programar publicación',
        err instanceof Error ? err.message : 'Error de validación.'
      );
    }
  };

  const handleApproveCalendarPost = (publicationId: string) => {
    try {
      const updated = approveSocialCalendarPublication({
        publicationId,
        actorName
      });
      setSelectedPubForPreview(updated);
      setRefreshTick((t) => t + 1);
      notify(
        'success',
        `Contenido Aprobado (${updated.publicationCode})`,
        `Aprobado por ${actorName}. Ya puede publicarse en el canal ${updated.channel}.`
      );
    } catch (err: unknown) {
      notify(
        'error',
        'Bloqueo de aprobación',
        err instanceof Error ? err.message : 'No se pudo aprobar.'
      );
    }
  };

  const handleRejectCalendarPost = (publicationId: string) => {
    try {
      const updated = rejectSocialCalendarPublication({
        publicationId,
        actorName,
        rejectionReason:
          rejectionReasonDraft || 'Rechazado en control editorial antes de publicar.'
      });
      setSelectedPubForPreview(updated);
      setRejectionReasonDraft('');
      setRefreshTick((t) => t + 1);
      notify(
        'warning',
        `Contenido Rechazado (${updated.publicationCode})`,
        'Su publicación ha quedado bloqueada permanentemente.'
      );
    } catch (err: unknown) {
      notify('error', 'Error', err instanceof Error ? err.message : 'No se pudo rechazar.');
    }
  };

  const handlePublishApprovedPost = (publicationId: string) => {
    try {
      const published = publishApprovedPostToChannel({
        publicationId,
        actorName
      });
      setSelectedPubForPreview(published);
      setRefreshTick((t) => t + 1);
      notify(
        'success',
        `Publicación Registrada (${published.publicationCode})`,
        `ID: ${published.externalPostId} • URL: ${published.publishedPermalinkUrl}`
      );
    } catch (err: unknown) {
      setRefreshTick((t) => t + 1);
      notify(
        'error',
        'Publicación Bloqueada o con Error de Canal',
        err instanceof Error ? err.message : 'No se pudo publicar.'
      );
    }
  };

  const handleConnectOAuthAdapter = (
    platform: 'facebook_graph_api' | 'instagram_graph_api'
  ) => {
    try {
      const updated = connectOfficialSocialGraphAdapter({
        platform,
        externalAccountId:
          platform === 'facebook_graph_api' ? fbPageIdInput : igBusinessIdInput,
        accountHandleOrPageName:
          platform === 'facebook_graph_api' ? fbPageNameInput : igHandleInput,
        professionalAccountEligible:
          platform === 'facebook_graph_api' ? true : igEligibleCheck,
        actorName
      });
      setRefreshTick((t) => t + 1);
      notify(
        'success',
        `OAuth Conectado: ${updated.displayName}`,
        `Cuenta vinculada: ${updated.accountHandleOrPageName} (${updated.externalAccountId}) • Token resguardado en Servidor (${updated.secretVaultKeyName}).`
      );
    } catch (err: unknown) {
      setRefreshTick((t) => t + 1);
      notify(
        'error',
        'Error de elegibilidad o conexión OAuth',
        err instanceof Error ? err.message : 'No se pudo conectar.'
      );
    }
  };

  const handleDisconnectOAuthAdapter = (
    platform: 'facebook_graph_api' | 'instagram_graph_api'
  ) => {
    const updated = disconnectOfficialSocialGraphAdapter(platform);
    setRefreshTick((t) => t + 1);
    notify(
      'warning',
      `Adaptador Desconectado: ${updated.displayName}`,
      'La sesión OAuth ha sido revocada y no se realizarán llamadas al canal.'
    );
  };

  const handlePrepareWhatsAppStatus = () => {
    if (!selectedItem) return;
    try {
      const created = prepareWhatsAppStatusPackage({
        catalogItem: selectedItem,
        ownerId: selectedOwnerId,
        discountPct,
        actorName
      });
      setRefreshTick((t) => t + 1);
      notify(
        'success',
        `Estado de WhatsApp Preparado (${created.statusCode})`,
        'Imagen vertical 9:16 y texto con enlace wa.me listos para compartir manualmente.'
      );
    } catch (err: unknown) {
      notify(
        'error',
        'Bloqueo al preparar Estado de WhatsApp',
        err instanceof Error ? err.message : 'Revise las validaciones.'
      );
    }
  };

  const handleDownloadSvgAsPng = async (
    svgMarkup: string,
    filename: string,
    w = 1080,
    h = 1080
  ) => {
    try {
      await exportSvgMarkupToPngFile(svgMarkup, filename, w, h);
      notify('success', 'Imagen PNG Descargada', `Archivo ${filename}.png listo (${w}×${h}px).`);
    } catch (err: unknown) {
      notify('error', 'Error al descargar PNG', err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="module-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Cabecera Ejecutiva */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #0D0E12 0%, #151821 100%)',
          border: '1px solid rgba(212, 175, 55, 0.38)',
          padding: '1.5rem'
        }}
      >
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
              <Share2 size={21} color="#D4AF37" />
              <span
                style={{
                  color: '#D4AF37',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase'
                }}
              >
                DISTRIBUCIÓN EN MARKETPLACE Y REDES SOCIALES
              </span>
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F9FAFB', margin: 0 }}>
              Marketplace Asistido, Calendario Editorial, Facebook Pages, Instagram &amp; WhatsApp Status
            </h1>
            <p style={{ color: '#9CA3AF', marginTop: '0.35rem', fontSize: '0.9rem' }}>
              Control estricto de stock y propietario, precios mínimos aprobados, adaptadores Graph API oficiales separados en servidor y cero automatización de navegador.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span
              className="badge"
              style={{
                background: distState.testSafeModeNoExternalPublish
                  ? 'rgba(16, 185, 129, 0.16)'
                  : 'rgba(245, 158, 11, 0.16)',
                color: distState.testSafeModeNoExternalPublish ? '#10B981' : '#F59E0B',
                border: '1px solid currentColor',
                padding: '0.45rem 0.8rem',
                fontWeight: 700
              }}
            >
              {distState.testSafeModeNoExternalPublish
                ? '🛡️ Modo Seguro Activo: Cero Publicación Externa en Pruebas'
                : 'Modo Despacho Externo'}
            </span>
          </div>
        </div>

        {/* Selector Global de SKU, Propietario, Descuento y Estado de Autorización */}
        <div
          style={{
            marginTop: '1.2rem',
            paddingTop: '1.1rem',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))',
            gap: '0.85rem',
            alignItems: 'end'
          }}
        >
          <div>
            <label className="form-label" style={{ color: '#D1D5DB', fontSize: '0.78rem' }}>
              SKU del Catálogo Real
            </label>
            <select
              className="form-input"
              value={selectedSku}
              onChange={(e) => setSelectedSku(e.target.value)}
            >
              {catalogItems.map((item) => (
                <option key={item.sku} value={item.sku}>
                  {item.sku} — {item.productName} | Disp: {item.qtyAvailableTotal} |{' '}
                  {item.currentNormalPriceCop ? formatCOP(item.currentNormalPriceCop) : 'SIN PRECIO'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label" style={{ color: '#D1D5DB', fontSize: '0.78rem' }}>
              Propietario de la Mercancía
            </label>
            <select
              className="form-input"
              value={selectedOwnerId}
              onChange={(e) => setSelectedOwnerId(e.target.value)}
            >
              {availableOwnersForSku.map((o) => (
                <option key={o.ownerId} value={o.ownerId}>
                  {o.ownerId} — {o.ownerName} ({o.qtyAvailable} uds disp.)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label" style={{ color: '#D1D5DB', fontSize: '0.78rem' }}>
              Descuento Aprobado (%)
            </label>
            <input
              type="number"
              min={0}
              max={50}
              className="form-input"
              value={discountPct}
              onChange={(e) => setDiscountPct(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>

          <div>
            {currentConsent?.status === 'granted' ? (
              <div
                style={{
                  padding: '0.55rem 0.8rem',
                  borderRadius: '0.45rem',
                  background: 'rgba(16, 185, 129, 0.14)',
                  border: '1px solid #10B981',
                  color: '#10B981',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  textAlign: 'center'
                }}
              >
                ✓ Propietario Autorizó Promoción ({currentConsent.consentCode})
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={handleQuickGrantOwnerConsent}
              >
                Autorizar Promoción ({selectedOwnerId})
              </button>
            )}
          </div>
        </div>

        {/* Barra de Semáforo de las 6 Reglas de Autorización y Publicación */}
        <div
          style={{
            marginTop: '1rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
            gap: '0.5rem'
          }}
        >
          {[
            { label: 'Consentimiento Dueño', check: liveCompliance.ownerConsentCheck },
            { label: 'Stock No Agotado', check: liveCompliance.stockNotExhaustedCheck },
            { label: 'Sin Insp. Pendiente', check: liveCompliance.notPendingInspectionCheck },
            { label: 'Precio Mín. y Dto.', check: liveCompliance.minPriceAndDiscountCheck },
            { label: 'No Rechazado', check: liveCompliance.notRejectedContentCheck },
            { label: 'Sin Duplicados', check: liveCompliance.notDuplicateCheck }
          ].map((rule, idx) => (
            <div
              key={idx}
              title={rule.check.message}
              style={{
                padding: '0.45rem 0.65rem',
                borderRadius: '0.4rem',
                fontSize: '0.76rem',
                fontWeight: 700,
                background: rule.check.passed
                  ? 'rgba(16, 185, 129, 0.12)'
                  : 'rgba(239, 68, 68, 0.15)',
                color: rule.check.passed ? '#10B981' : '#FCA5A5',
                border: `1px solid ${rule.check.passed ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.4)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              {rule.check.passed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              <span>{rule.label}</span>
            </div>
          ))}
        </div>

        {/* Pestañas Principales */}
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.15rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={activeTab === 'MARKETPLACE_ASSISTED' ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setActiveTab('MARKETPLACE_ASSISTED')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}
          >
            <Store size={16} />
            1. Marketplace Asistido ({distState.marketplaceListings.length})
          </button>

          <button
            type="button"
            className={
              activeTab === 'SOCIAL_CALENDAR_PUBLISHER' ? 'btn btn-primary' : 'btn btn-secondary'
            }
            onClick={() => setActiveTab('SOCIAL_CALENDAR_PUBLISHER')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}
          >
            <CalendarIcon size={16} />
            2. Calendario (Diario/Semanal/Mensual) &amp; Publisher ({distState.calendarPublications.length})
          </button>

          <button
            type="button"
            className={
              activeTab === 'OFFICIAL_GRAPH_ADAPTERS' ? 'btn btn-primary' : 'btn btn-secondary'
            }
            onClick={() => setActiveTab('OFFICIAL_GRAPH_ADAPTERS')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}
          >
            <Lock size={16} />
            3. Facebook Pages &amp; Instagram Graph API (OAuth)
          </button>

          <button
            type="button"
            className={activeTab === 'WHATSAPP_STATUS_SHARE' ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setActiveTab('WHATSAPP_STATUS_SHARE')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}
          >
            <MessageCircle size={16} />
            4. WhatsApp Status &amp; Enlaces ({distState.whatsappStatusItems.length})
          </button>
        </div>
      </div>

      {/* =====================================================================
          PESTAÑA 1: ASISTENCIA MANUAL DE MARKETPLACE
          ===================================================================== */}
      {activeTab === 'MARKETPLACE_ASSISTED' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '1.4rem'
            }}
          >
            {/* Formulario de Preparación de Ficha Marketplace */}
            <div className="card" style={{ padding: '1.35rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.35rem' }}>
                Preparación de Publicación para Marketplace (Asistencia Manual)
              </h2>
              <p style={{ fontSize: '0.82rem', color: '#6B7280', marginBottom: '1rem' }}>
                Genera títulos, descripciones verificadas, imagen cuadrada 1:1 con sello REAL TWS, precio aprobado, categoría, ubicación y enlace de contacto <code>wa.me</code> sin usar bots ni automatización no autorizada.
              </p>

              <div className="form-group" style={{ marginBottom: '0.85rem' }}>
                <label className="form-label">Título para Marketplace (Opcional — autogenerado si vacío)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={
                    selectedItem
                      ? `${selectedItem.productName} (${selectedItem.variantOrColor}) — SKU ${selectedItem.sku}`
                      : 'Título del anuncio'
                  }
                  value={customHeadline}
                  onChange={(e) => setCustomHeadline(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '0.85rem' }}>
                <label className="form-label">Ubicación Comercial</label>
                <input
                  type="text"
                  className="form-input"
                  value={locationLabel}
                  onChange={(e) => setLocationLabel(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Descripción Estructurada (Opcional — autogenerada del catálogo)</label>
                <textarea
                  rows={3}
                  className="form-input"
                  placeholder="Se incluirá precio aprobado, stock verificado, especificaciones reales y garantía REAL TWS."
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handlePrepareMarketplaceListing}
                style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}
              >
                <Store size={16} />
                Preparar Ficha de Marketplace Validada
              </button>
            </div>

            {/* Panel de Asistencia Paso a Paso y Copia en 1 Clic */}
            <div className="card" style={{ padding: '1.35rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                Asistente de Publicación Manual y Registro de URL
              </h3>
              {!selectedListingForHistory && distState.marketplaceListings.length === 0 ? (
                <div style={{ color: '#6B7280', fontSize: '0.85rem', padding: '1rem 0' }}>
                  Prepare una ficha en el panel izquierdo para habilitar los botones de copia rápida (Título, Precio, Categoría, Ubicación, Descripción, Imagen PNG) y el registro de la URL publicada.
                </div>
              ) : (
                (() => {
                  const activeListing =
                    selectedListingForHistory || distState.marketplaceListings[0];
                  if (!activeListing) return null;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: '#0D0E12',
                          color: '#F9FAFB',
                          padding: '0.7rem 0.9rem',
                          borderRadius: '0.45rem'
                        }}
                      >
                        <div>
                          <strong style={{ color: '#D4AF37' }}>{activeListing.listingCode}</strong> •{' '}
                          {activeListing.sku} ({activeListing.ownerId})
                        </div>
                        <span className="badge" style={{ background: '#1F2937', color: '#F3E5AB' }}>
                          {activeListing.status}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => handleCopyText('Título Marketplace', activeListing.title)}
                        >
                          <Copy size={13} style={{ marginRight: '0.3rem' }} /> Copiar Título
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() =>
                            handleCopyText(
                              'Precio COP',
                              String(activeListing.effectivePublishedPriceCop)
                            )
                          }
                        >
                          <Copy size={13} style={{ marginRight: '0.3rem' }} /> Copiar Precio (
                          {formatCOP(activeListing.effectivePublishedPriceCop)})
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() =>
                            handleCopyText('Descripción Marketplace', activeListing.descriptionText)
                          }
                        >
                          <Copy size={13} style={{ marginRight: '0.3rem' }} /> Copiar Descripción
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() =>
                            handleCopyText('Enlace Contacto WhatsApp', activeListing.contactWhatsappUrl)
                          }
                        >
                          <Copy size={13} style={{ marginRight: '0.3rem' }} /> Copiar Enlace Contacto
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() =>
                            handleDownloadSvgAsPng(
                              activeListing.composedSvgMarkup,
                              `MARKETPLACE_${activeListing.sku}`
                            )
                          }
                        >
                          <Download size={13} style={{ marginRight: '0.3rem' }} /> Descargar Imagen PNG
                        </button>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '140px 1fr',
                          gap: '0.85rem',
                          alignItems: 'start',
                          marginTop: '0.3rem'
                        }}
                      >
                        <div
                          style={{ borderRadius: '0.45rem', overflow: 'hidden', border: '1px solid #D1D5DB' }}
                          dangerouslySetInnerHTML={{ __html: activeListing.composedSvgMarkup }}
                        />
                        <div style={{ fontSize: '0.78rem', color: '#374151' }}>
                          <div>
                            <strong>Categoría:</strong> {activeListing.categoryLabel}
                          </div>
                          <div>
                            <strong>Ubicación:</strong> {activeListing.locationLabel}
                          </div>
                          <div>
                            <strong>Stock Verificado:</strong> {activeListing.verifiedAvailableStock} uds
                            (Insp. pendiente: {activeListing.pendingInspectionUnits})
                          </div>
                          <pre
                            style={{
                              marginTop: '0.4rem',
                              padding: '0.5rem',
                              background: '#F9FAFB',
                              borderRadius: '0.35rem',
                              whiteSpace: 'pre-wrap',
                              fontFamily: 'inherit',
                              maxHeight: '115px',
                              overflowY: 'auto'
                            }}
                          >
                            {activeListing.descriptionText}
                          </pre>
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>

          {/* Tabla e Historial de Publicaciones de Marketplace + Registro de URL Publicada */}
          <div className="card" style={{ padding: '1.35rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '0.8rem' }}>
              Historial de Publicaciones en Marketplace y Registro de URL Publicada
            </h3>
            {distState.marketplaceListings.length === 0 ? (
              <div style={{ color: '#6B7280', fontSize: '0.85rem' }}>
                Aún no hay fichas de Marketplace registradas.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>SKU / Producto</th>
                      <th>Propietario</th>
                      <th>Precio Publicado</th>
                      <th>Stock Disp.</th>
                      <th>Estado</th>
                      <th>Registro de URL Publicada</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distState.marketplaceListings.map((lst) => (
                      <tr key={lst.id}>
                        <td style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                          {lst.listingCode}
                        </td>
                        <td>
                          <strong>{lst.sku}</strong> — {lst.productName}
                        </td>
                        <td>
                          {lst.ownerId} ({lst.ownerName})
                        </td>
                        <td style={{ fontWeight: 700 }}>
                          {formatCOP(lst.effectivePublishedPriceCop)}
                        </td>
                        <td>{lst.verifiedAvailableStock} uds</td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              background:
                                lst.status === 'published_url_recorded'
                                  ? 'rgba(16,185,129,0.16)'
                                  : lst.status === 'rejected'
                                    ? 'rgba(239,68,68,0.16)'
                                    : 'rgba(212,175,55,0.16)',
                              color:
                                lst.status === 'published_url_recorded'
                                  ? '#10B981'
                                  : lst.status === 'rejected'
                                    ? '#EF4444'
                                    : '#B45309'
                            }}
                          >
                            {lst.status}
                          </span>
                        </td>
                        <td>
                          {lst.publishedMarketplaceUrl ? (
                            <a
                              href={lst.publishedMarketplaceUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                color: '#059669',
                                fontWeight: 700,
                                fontSize: '0.78rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}
                            >
                              <ExternalLink size={13} /> Ver Publicación
                            </a>
                          ) : (
                            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                              <input
                                type="url"
                                className="form-input"
                                style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem', minWidth: '210px' }}
                                placeholder="https://www.facebook.com/marketplace/item/..."
                                value={marketplaceUrlInputs[lst.id] || ''}
                                onChange={(e) =>
                                  setMarketplaceUrlInputs((prev) => ({
                                    ...prev,
                                    [lst.id]: e.target.value
                                  }))
                                }
                              />
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '0.3rem 0.55rem', fontSize: '0.74rem' }}
                                onClick={() => handleSaveMarketplacePublishedUrl(lst.id)}
                              >
                                <Link2 size={13} /> Guardar URL
                              </button>
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            {lst.status === 'prepared' && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  style={{ padding: '0.28rem 0.55rem', fontSize: '0.74rem' }}
                                  onClick={() =>
                                    handleApproveOrRejectMarketplace(
                                      lst.id,
                                      'approved_for_manual_post'
                                    )
                                  }
                                >
                                  Aprobar
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: '0.28rem 0.55rem', fontSize: '0.74rem' }}
                                  onClick={() =>
                                    handleApproveOrRejectMarketplace(lst.id, 'rejected')
                                  }
                                >
                                  Rechazar
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '0.28rem 0.55rem', fontSize: '0.74rem' }}
                              onClick={() => setSelectedListingForHistory(lst)}
                            >
                              Usar en Asistente
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 2: CALENDARIO EDITORIAL (DIARIO, SEMANAL, MENSUAL) & PUBLISHER
          ===================================================================== */}
      {activeTab === 'SOCIAL_CALENDAR_PUBLISHER' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '1.4rem'
            }}
          >
            {/* Programador de Publicaciones hacia el Calendario */}
            <div className="card" style={{ padding: '1.35rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.35rem' }}>
                Programar Contenido en el Calendario Editorial
              </h2>
              <p style={{ fontSize: '0.82rem', color: '#6B7280', marginBottom: '1rem' }}>
                Toda publicación ingresa en estado <code>pending_approval</code>, valida huellas anti-duplicados y exige aprobación humana explícita antes de publicarse.
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.75rem',
                  marginBottom: '0.85rem'
                }}
              >
                <div>
                  <label className="form-label">Canal Oficial Destino</label>
                  <select
                    className="form-input"
                    value={selectedChannel}
                    onChange={(e) => setSelectedChannel(e.target.value as DistributionChannelId)}
                  >
                    <option value="facebook_page">Facebook Pages (Graph API Oficial)</option>
                    <option value="instagram_feed">Instagram Feed (Content Publishing API)</option>
                    <option value="instagram_story">Instagram Story (9:16)</option>
                    <option value="whatsapp_status">WhatsApp Status (9:16 Manual)</option>
                    <option value="marketplace">Marketplace (Ficha Asistida)</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Fecha y Hora Programada</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={scheduledForIso}
                    onChange={(e) => setScheduledForIso(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '0.85rem' }}>
                <label className="form-label">Titular de la Publicación (Opcional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Se usará el titular aprobado de Creative Studio si se deja vacío"
                  value={customHeadline}
                  onChange={(e) => setCustomHeadline(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Cuerpo / Caption de la Publicación (Opcional)</label>
                <textarea
                  rows={3}
                  className="form-input"
                  placeholder="Se generará automáticamente con SKU, precio vigente, stock y especificaciones reales"
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleScheduleCalendarPost}
                style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}
              >
                <CalendarIcon size={16} />
                Programar en Calendario (Con Control Anti-Duplicados)
              </button>
            </div>

            {/* Vista Previa de Instagram / Facebook y Cola de Aprobación */}
            <div className="card" style={{ padding: '1.35rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                Vista Previa de Publicación (Instagram / Facebook) y Aprobación
              </h3>
              {!selectedPubForPreview && distState.calendarPublications.length === 0 ? (
                <div style={{ color: '#6B7280', fontSize: '0.85rem', padding: '1rem 0' }}>
                  Programe o seleccione una publicación del calendario para inspeccionar su vista previa visual, aprobarla o despacharla al canal.
                </div>
              ) : (
                (() => {
                  const pub = selectedPubForPreview || distState.calendarPublications[0];
                  if (!pub) return null;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: '#0D0E12',
                          color: '#F9FAFB',
                          padding: '0.65rem 0.9rem',
                          borderRadius: '0.45rem'
                        }}
                      >
                        <div>
                          <strong style={{ color: '#D4AF37' }}>{pub.publicationCode}</strong> •{' '}
                          {pub.channel} • {pub.sku}
                        </div>
                        <span className="badge" style={{ background: '#1F2937', color: '#F3E5AB' }}>
                          {pub.approvalStatus}
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '155px 1fr',
                          gap: '0.9rem',
                          alignItems: 'start'
                        }}
                      >
                        <div
                          style={{
                            borderRadius: '0.5rem',
                            overflow: 'hidden',
                            border: '1px solid #D1D5DB'
                          }}
                          dangerouslySetInnerHTML={{ __html: pub.composedSvgMarkup }}
                        />
                        <div style={{ fontSize: '0.79rem' }}>
                          <div style={{ fontWeight: 800, marginBottom: '0.25rem' }}>
                            {pub.headline}
                          </div>
                          <div style={{ color: '#059669', fontWeight: 700, marginBottom: '0.35rem' }}>
                            Precio: {formatCOP(pub.effectivePriceCop)} • Stock:{' '}
                            {pub.verifiedAvailableStockSnapshot} uds • Propietario: {pub.ownerId}
                          </div>
                          <pre
                            style={{
                              background: '#F9FAFB',
                              padding: '0.55rem',
                              borderRadius: '0.35rem',
                              whiteSpace: 'pre-wrap',
                              fontFamily: 'inherit',
                              maxHeight: '110px',
                              overflowY: 'auto',
                              margin: 0
                            }}
                          >
                            {pub.bodyText}
                          </pre>

                          {pub.externalPostId && (
                            <div
                              style={{
                                marginTop: '0.45rem',
                                padding: '0.45rem',
                                background: 'rgba(16,185,129,0.1)',
                                borderRadius: '0.35rem',
                                color: '#065F46'
                              }}
                            >
                              ✓ <strong>Post ID:</strong> {pub.externalPostId}
                              {pub.externalContainerId
                                ? ` | Container: ${pub.externalContainerId}`
                                : ''}
                              <br />
                              ✓ <strong>URL:</strong> {pub.publishedPermalinkUrl}
                            </div>
                          )}

                          {pub.errorDetail && (
                            <div
                              style={{
                                marginTop: '0.45rem',
                                padding: '0.45rem',
                                background: 'rgba(239,68,68,0.1)',
                                borderRadius: '0.35rem',
                                color: '#B91C1C',
                                fontWeight: 600
                              }}
                            >
                              ⚠ {pub.errorDetail}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Controles de Aprobación, Rechazo y Publicación */}
                      <div
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          paddingTop: '0.4rem',
                          borderTop: '1px solid #E5E7EB'
                        }}
                      >
                        {pub.approvalStatus === 'pending_approval' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => handleApproveCalendarPost(pub.id)}
                            >
                              <CheckCircle2 size={14} style={{ marginRight: '0.3rem' }} /> Aprobar
                              Contenido
                            </button>
                            <input
                              type="text"
                              className="form-input"
                              style={{ width: '180px', fontSize: '0.76rem', padding: '0.35rem 0.5rem' }}
                              placeholder="Motivo de rechazo..."
                              value={rejectionReasonDraft}
                              onChange={(e) => setRejectionReasonDraft(e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleRejectCalendarPost(pub.id)}
                            >
                              <XCircle size={14} style={{ marginRight: '0.3rem' }} /> Rechazar
                            </button>
                          </>
                        )}

                        {pub.approvalStatus === 'approved' && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => handlePublishApprovedPost(pub.id)}
                          >
                            <Send size={14} style={{ marginRight: '0.35rem' }} /> Publicar Contenido
                            Aprobado en {pub.channel}
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() =>
                            handleDownloadSvgAsPng(
                              pub.composedSvgMarkup,
                              `POST_${pub.publicationCode}`,
                              1080,
                              pub.aspectRatio === '9:16'
                                ? 1920
                                : pub.aspectRatio === '4:5'
                                  ? 1350
                                  : 1080
                            )
                          }
                        >
                          <Download size={14} style={{ marginRight: '0.3rem' }} /> Descargar PNG (
                          {pub.aspectRatio})
                        </button>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>

          {/* Calendario Editorial con Selector Diario / Semanal / Mensual */}
          <div className="card" style={{ padding: '1.35rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.8rem',
                marginBottom: '1rem'
              }}
            >
              <div>
                <h3 style={{ fontSize: '1.08rem', fontWeight: 800, margin: 0 }}>
                  Calendario Editorial Integrado ({calendarViewMode === 'DAILY' ? 'Vista Diaria' : calendarViewMode === 'WEEKLY' ? 'Vista Semanal' : 'Vista Mensual'})
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                  Mostrando {filteredCalendarPublications.length} de{' '}
                  {distState.calendarPublications.length} publicaciones registradas.
                </span>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="date"
                  className="form-input"
                  style={{ width: 'auto' }}
                  value={calendarReferenceDate}
                  onChange={(e) => setCalendarReferenceDate(e.target.value)}
                />
                <button
                  type="button"
                  className={calendarViewMode === 'DAILY' ? 'btn btn-primary' : 'btn btn-secondary'}
                  onClick={() => setCalendarViewMode('DAILY')}
                >
                  Diario
                </button>
                <button
                  type="button"
                  className={calendarViewMode === 'WEEKLY' ? 'btn btn-primary' : 'btn btn-secondary'}
                  onClick={() => setCalendarViewMode('WEEKLY')}
                >
                  Semanal
                </button>
                <button
                  type="button"
                  className={calendarViewMode === 'MONTHLY' ? 'btn btn-primary' : 'btn btn-secondary'}
                  onClick={() => setCalendarViewMode('MONTHLY')}
                >
                  Mensual
                </button>
              </div>
            </div>

            {filteredCalendarPublications.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6B7280' }}>
                No hay publicaciones programadas en este rango ({calendarViewMode}).
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Fecha Programada</th>
                      <th>Canal</th>
                      <th>SKU / Propietario</th>
                      <th>Precio / Stock</th>
                      <th>Estado</th>
                      <th>ID / URL Publicada</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCalendarPublications.map((pub) => (
                      <tr key={pub.id}>
                        <td style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                          {pub.publicationCode}
                        </td>
                        <td>{formatDateTimeCO(pub.scheduledFor)}</td>
                        <td style={{ fontWeight: 700 }}>{pub.channel}</td>
                        <td>
                          <strong>{pub.sku}</strong> ({pub.ownerId})
                        </td>
                        <td>
                          {formatCOP(pub.effectivePriceCop)} ({pub.verifiedAvailableStockSnapshot} uds)
                        </td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              background:
                                pub.approvalStatus === 'published'
                                  ? 'rgba(16,185,129,0.16)'
                                  : pub.approvalStatus === 'approved'
                                    ? 'rgba(59,130,246,0.16)'
                                    : pub.approvalStatus === 'rejected' ||
                                        pub.approvalStatus === 'failed'
                                      ? 'rgba(239,68,68,0.16)'
                                      : 'rgba(212,175,55,0.16)',
                              color:
                                pub.approvalStatus === 'published'
                                  ? '#10B981'
                                  : pub.approvalStatus === 'approved'
                                    ? '#2563EB'
                                    : pub.approvalStatus === 'rejected' ||
                                        pub.approvalStatus === 'failed'
                                      ? '#EF4444'
                                      : '#B45309'
                            }}
                          >
                            {pub.approvalStatus}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.76rem' }}>
                          {pub.externalPostId ? (
                            <div>
                              <div>ID: {pub.externalPostId}</div>
                              {pub.publishedPermalinkUrl && (
                                <a
                                  href={pub.publishedPermalinkUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: '#059669', fontWeight: 700 }}
                                >
                                  Abrir URL
                                </a>
                              )}
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '0.28rem 0.55rem', fontSize: '0.74rem' }}
                              onClick={() => setSelectedPubForPreview(pub)}
                            >
                              <History size={13} style={{ marginRight: '0.25rem' }} /> Vista Previa /
                              Historial
                            </button>
                            {pub.approvalStatus === 'pending_approval' && (
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '0.28rem 0.55rem', fontSize: '0.74rem' }}
                                onClick={() => handleApproveCalendarPost(pub.id)}
                              >
                                Aprobar
                              </button>
                            )}
                            {pub.approvalStatus === 'approved' && (
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '0.28rem 0.55rem', fontSize: '0.74rem' }}
                                onClick={() => handlePublishApprovedPost(pub.id)}
                              >
                                Publicar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 3: ADAPTADORES OFICIALES FACEBOOK PAGES & INSTAGRAM GRAPH API
          ===================================================================== */}
      {activeTab === 'OFFICIAL_GRAPH_ADAPTERS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '1.4rem'
            }}
          >
            {/* Tarjeta 1: Facebook Pages Official Graph API */}
            <div className="card" style={{ padding: '1.35rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '1.08rem', fontWeight: 800, margin: 0 }}>
                  1. Facebook Pages — Integración Graph API Oficial
                </h2>
                <span
                  className="badge"
                  style={{
                    background:
                      distState.connections.facebook_graph_api.connectionStatus === 'oauth_connected'
                        ? 'rgba(16,185,129,0.16)'
                        : 'rgba(107,114,128,0.16)',
                    color:
                      distState.connections.facebook_graph_api.connectionStatus === 'oauth_connected'
                        ? '#10B981'
                        : '#6B7280'
                  }}
                >
                  {distState.connections.facebook_graph_api.connectionStatus}
                </span>
              </div>

              <p style={{ fontSize: '0.81rem', color: '#6B7280', marginTop: '0.4rem' }}>
                Integración separada mediante OAuth 2.0 y Page Access Token almacenado en servidor (<code>{distState.connections.facebook_graph_api.secretVaultKeyName}</code>). Jamás solicita contraseñas ni utiliza automatización de navegador.
              </p>

              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">Facebook Page ID</label>
                <input
                  type="text"
                  className="form-input"
                  value={fbPageIdInput}
                  onChange={(e) => setFbPageIdInput(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">Nombre Oficial de la Página</label>
                <input
                  type="text"
                  className="form-input"
                  value={fbPageNameInput}
                  onChange={(e) => setFbPageNameInput(e.target.value)}
                />
              </div>

              <div style={{ fontSize: '0.78rem', color: '#374151', marginBottom: '0.9rem' }}>
                <div>
                  <strong>Permisos OAuth Autorizados:</strong>{' '}
                  {distState.connections.facebook_graph_api.scopesGranted.join(', ')}
                </div>
                <div>
                  <strong>Cuota Diaria Utilizada:</strong>{' '}
                  {distState.connections.facebook_graph_api.dailyQuotaUsed} /{' '}
                  {distState.connections.facebook_graph_api.dailyQuotaLimit}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleConnectOAuthAdapter('facebook_graph_api')}
                >
                  Autorizar OAuth Facebook Page
                </button>
                {distState.connections.facebook_graph_api.connectionStatus === 'oauth_connected' && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleDisconnectOAuthAdapter('facebook_graph_api')}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <Unplug size={14} /> Desconectar Página
                  </button>
                )}
              </div>
            </div>

            {/* Tarjeta 2: Instagram Professional Content Publishing API */}
            <div className="card" style={{ padding: '1.35rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '1.08rem', fontWeight: 800, margin: 0 }}>
                  2. Instagram — Content Publishing API (Cuenta Profesional)
                </h2>
                <span
                  className="badge"
                  style={{
                    background:
                      distState.connections.instagram_graph_api.connectionStatus === 'oauth_connected'
                        ? 'rgba(16,185,129,0.16)'
                        : 'rgba(107,114,128,0.16)',
                    color:
                      distState.connections.instagram_graph_api.connectionStatus === 'oauth_connected'
                        ? '#10B981'
                        : '#6B7280'
                  }}
                >
                  {distState.connections.instagram_graph_api.connectionStatus}
                </span>
              </div>

              <p style={{ fontSize: '0.81rem', color: '#6B7280', marginTop: '0.4rem' }}>
                Exige cuenta profesional elegible (Business o Creator) vinculada. Token resguardado en Vault (<code>{distState.connections.instagram_graph_api.secretVaultKeyName}</code>) y control de límite de 25 publicaciones por cada 24h.
              </p>

              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">Instagram Business Account ID</label>
                <input
                  type="text"
                  className="form-input"
                  value={igBusinessIdInput}
                  onChange={(e) => setIgBusinessIdInput(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">Handle Profesional</label>
                <input
                  type="text"
                  className="form-input"
                  value={igHandleInput}
                  onChange={(e) => setIgHandleInput(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '0.85rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={igEligibleCheck}
                    onChange={(e) => setIgEligibleCheck(e.target.checked)}
                  />
                  Cuenta Profesional Elegible Verificada (Business / Creator)
                </label>
              </div>

              <div style={{ fontSize: '0.78rem', color: '#374151', marginBottom: '0.9rem' }}>
                <div>
                  <strong>Permisos OAuth Autorizados:</strong>{' '}
                  {distState.connections.instagram_graph_api.scopesGranted.join(', ')}
                </div>
                <div>
                  <strong>Límite Content Publishing (24h):</strong>{' '}
                  {distState.connections.instagram_graph_api.dailyQuotaUsed} /{' '}
                  {distState.connections.instagram_graph_api.dailyQuotaLimit}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleConnectOAuthAdapter('instagram_graph_api')}
                >
                  Autorizar OAuth Instagram Profesional
                </button>
                {distState.connections.instagram_graph_api.connectionStatus ===
                  'oauth_connected' && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleDisconnectOAuthAdapter('instagram_graph_api')}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <Unplug size={14} /> Desconectar Instagram
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Panel de Seguridad, Costo $0 y Pruebas sin Publicación Real */}
          <div className="card" style={{ padding: '1.35rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.8rem',
                marginBottom: '0.9rem'
              }}
            >
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>
                  Seguridad OAuth, Costo $0 y Suite de Verificación Sin Publicar en Redes Reales
                </h3>
                <p style={{ fontSize: '0.81rem', color: '#6B7280', marginTop: '0.25rem' }}>
                  No se contratan gestores externos de redes sociales pagos. Durante las pruebas, el interruptor de seguridad garantiza cero envíos hacia redes externas.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={distState.testSafeModeNoExternalPublish}
                    onChange={(e) => {
                      setTestSafeModeNoExternalPublish(e.target.checked);
                      setRefreshTick((t) => t + 1);
                    }}
                  />
                  Bloquear Publicación Externa Real (Modo Prueba Seguro)
                </label>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setSafetyTestResults(runSocialMarketplaceSafetyTests())}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Play size={15} /> Ejecutar Pruebas de Seguridad y Reglas
                </button>
              </div>
            </div>

            {safetyTestResults && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '0.75rem'
                }}
              >
                {safetyTestResults.map((res, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '0.8rem',
                      borderRadius: '0.45rem',
                      border: `1px solid ${res.passed ? '#10B981' : '#EF4444'}`,
                      background: res.passed
                        ? 'rgba(16,185,129,0.08)'
                        : 'rgba(239,68,68,0.08)'
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: '0.84rem', color: res.passed ? '#065F46' : '#991B1B' }}>
                      {res.passed ? '✓ APROBADA: ' : '✗ FALLÓ: '} {res.testName}
                    </div>
                    <div style={{ fontSize: '0.77rem', color: '#374151', marginTop: '0.25rem' }}>
                      {res.detail}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 4: WHATSAPP STATUS & COMPARTICIÓN MANUAL ASISTIDA
          ===================================================================== */}
      {activeTab === 'WHATSAPP_STATUS_SHARE' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          <div className="card" style={{ padding: '1.35rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem'
              }}
            >
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
                  Preparador de Imágenes Verticales (9:16) y Textos para Estados de WhatsApp
                </h2>
                <p style={{ fontSize: '0.82rem', color: '#6B7280', marginTop: '0.25rem' }}>
                  Prepara piezas verticales 1080×1920 px y textos con enlace directo <code>wa.me</code> para compartir manualmente en WhatsApp Status y WhatsApp Business.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handlePrepareWhatsAppStatus}
                style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}
              >
                <MessageCircle size={16} />
                Preparar Paquete WhatsApp Status ({selectedItem?.sku || ''})
              </button>
            </div>
          </div>

          {distState.whatsappStatusItems.length === 0 ? (
            <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#6B7280' }}>
              Pulse el botón superior para generar una tarjeta de Estado de WhatsApp 9:16 con texto comercial validado.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                gap: '1.25rem'
              }}
            >
              {distState.whatsappStatusItems.map((wa) => (
                <div key={wa.id} className="card" style={{ padding: '1.2rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '0.65rem'
                    }}
                  >
                    <strong style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {wa.statusCode} • {wa.sku}
                    </strong>
                    <span
                      className="badge"
                      style={{
                        background:
                          wa.approvalStatus === 'shared_manually'
                            ? 'rgba(16,185,129,0.16)'
                            : 'rgba(212,175,55,0.16)',
                        color: wa.approvalStatus === 'shared_manually' ? '#10B981' : '#B45309'
                      }}
                    >
                      {wa.approvalStatus}
                    </span>
                  </div>

                  <div
                    style={{
                      maxWidth: '200px',
                      margin: '0 auto 0.85rem auto',
                      borderRadius: '0.5rem',
                      overflow: 'hidden',
                      border: '1px solid #D1D5DB'
                    }}
                    dangerouslySetInnerHTML={{ __html: wa.composedVerticalSvg9x16 }}
                  />

                  <pre
                    style={{
                      background: '#F9FAFB',
                      padding: '0.65rem',
                      borderRadius: '0.4rem',
                      fontSize: '0.77rem',
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      maxHeight: '130px',
                      overflowY: 'auto'
                    }}
                  >
                    {wa.captionText}
                  </pre>

                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ fontSize: '0.76rem', padding: '0.35rem 0.65rem' }}
                      onClick={() =>
                        handleDownloadSvgAsPng(
                          wa.composedVerticalSvg9x16,
                          `WHATSAPP_STATUS_${wa.sku}`,
                          1080,
                          1920
                        )
                      }
                    >
                      <Download size={13} style={{ marginRight: '0.3rem' }} /> Descargar Imagen 9:16
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.76rem', padding: '0.35rem 0.65rem' }}
                      onClick={() => handleCopyText('Texto de Estado WhatsApp', wa.captionText)}
                    >
                      <Copy size={13} style={{ marginRight: '0.3rem' }} /> Copiar Texto
                    </button>
                    {wa.approvalStatus !== 'shared_manually' && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.76rem', padding: '0.35rem 0.65rem' }}
                        onClick={() => {
                          markWhatsAppStatusSharedManually(wa.id, actorName);
                          setRefreshTick((t) => t + 1);
                          notify(
                            'success',
                            'Estado Marcado como Compartido',
                            `Registrado manualmente por ${actorName}.`
                          );
                        }}
                      >
                        <ShieldCheck size={13} style={{ marginRight: '0.3rem' }} /> Marcar Compartido
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default SocialMarketplaceModule;
