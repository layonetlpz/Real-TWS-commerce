import React, { useState, useMemo, useEffect } from 'react';
import {
  Sparkles,
  FileText,
  Video,
  Image as ImageIcon,
  ShieldCheck,
  Cpu,
  FolderArchive,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Download,
  Save,
  History,
  Upload,
  Lock,
  Printer
} from 'lucide-react';
import {
  getBrandMerchandisingState,
  getRealCatalogMerchItems,
  exportSvgMarkupToPngFile,
  exportSvgMarkupToSvgFile,
  type RealCatalogMerchItem
} from '../../services/brandMerchandisingService';
import {
  getCreativeStudioState,
  readOwnerMarketingConsent,
  registerOwnerMarketingConsent,
  validateCreativeCompliance,
  generateValidatedCopywritingBundle,
  generateVideoScriptsAndStoryboards,
  renderCreativeStudioComposedSvg,
  getDimensionsForAspectRatio,
  buildSanitizedPublicCommercialPayload,
  updateOptionalGeminiAdapterSettings,
  recordCreativeEngineExecutionAudit,
  saveCreativeProjectToLibrary,
  type CreativeAspectRatio,
  type CreativeEngineMode,
  type VideoDurationSeconds,
  type ImageComposerSettings,
  type CreativeStudioSavedProject
} from '../../services/creativeStudioService';
import { useAuth } from '../../hooks/useAuth';
import { useOwnerScope } from '../../hooks/useOwnerScope';
import { useNotifications } from '../../hooks/useNotifications';
import { SegmentedTabs } from '../../components/glass';
import { formatCOP } from '../../utils/formatters';

function formatDateCO(iso: string): string {
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

type StudioTabId =
  | 'VALIDATION_AND_CONSENT'
  | 'COPYWRITING'
  | 'VIDEO_STORYBOARD'
  | 'IMAGE_COMPOSER'
  | 'AI_PROVIDER_ADAPTER'
  | 'MEDIA_LIBRARY';

export const CreativeStudioModule: React.FC = () => {
  const { userProfile, activeEffectiveRole } = useAuth();
  const { selectedOwnerScope } = useOwnerScope();
  const { notify } = useNotifications();

  const effectiveRole = activeEffectiveRole || userProfile?.role || 'VIEWER';
  const canWriteCreative =
    effectiveRole === 'ADMIN' || effectiveRole === 'MARKETING_OPERATOR';
  const actorName = userProfile?.fullName || userProfile?.email || 'Operador Marketing REAL TWS';

  const [activeTab, setActiveTab] = useState<StudioTabId>('VALIDATION_AND_CONSENT');
  const [refreshTick, setRefreshTick] = useState(0);

  const brandState = useMemo(() => getBrandMerchandisingState(), [refreshTick]);
  const studioState = useMemo(() => getCreativeStudioState(), [refreshTick]);
  const catalogItems = useMemo(() => getRealCatalogMerchItems(), [refreshTick]);

  // Selección de SKU y Propietario de la mercancía
  const [selectedSku, setSelectedSku] = useState<string>(() => catalogItems[0]?.sku || '');
  const selectedItem: RealCatalogMerchItem | null = useMemo(
    () => catalogItems.find((i) => i.sku === selectedSku) || catalogItems[0] || null,
    [catalogItems, selectedSku]
  );

  const availableOwnersForSku = useMemo(() => {
    if (!selectedItem || selectedItem.ownerAllocations.length === 0) {
      return [];
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
    return found ? found.ownerName : selectedOwnerId;
  }, [availableOwnersForSku, selectedOwnerId]);

  // Estado de Consentimiento Comercial del Propietario (lectura pura sin mutar almacenamiento en render)
  const currentConsent = useMemo(() => {
    if (!selectedItem) return null;
    return readOwnerMarketingConsent(
      selectedOwnerId,
      currentOwnerName,
      selectedItem.sku,
      selectedItem.productName
    );
  }, [selectedItem, selectedOwnerId, currentOwnerName, studioState]);

  const [consentMaxDiscDraft, setConsentMaxDiscDraft] = useState<number>(0);
  const [consentNotesDraft, setConsentNotesDraft] = useState<string>(
    'Autorizo promocionar este SKU en canales oficiales REAL TWS respetando precio mínimo y acuerdo.'
  );
  const [consentChannelsDraft, setConsentChannelsDraft] = useState<
    Array<'marketplace' | 'facebook' | 'instagram' | 'whatsapp'>
  >(['marketplace', 'facebook', 'instagram', 'whatsapp']);

  useEffect(() => {
    if (currentConsent) {
      setConsentMaxDiscDraft(currentConsent.maxAuthorizedDiscountPct);
      setConsentNotesDraft(currentConsent.consentNotes);
      setConsentChannelsDraft(currentConsent.authorizedChannels);
    }
  }, [currentConsent?.id, currentConsent?.updatedAt]);

  // Configuración del Image Composer y Descuento (Sección C y G)
  const [composerSettings, setComposerSettings] = useState<ImageComposerSettings>({
    aspectRatio: '1:1',
    templateStyle: 'LUXURY_CARBON_GOLD',
    selectedHeadlineIndex: 0,
    selectedShortDescIndex: 0,
    selectedCtaIndex: 0,
    discountPct: 0,
    originalProductPhotoDataUrl: null
  });

  // Validador de texto libre contra características inventadas (Sección G)
  const [customTextInspector, setCustomTextInspector] = useState<string>('');

  // Duración de Video seleccionada (10s, 15s, 30s, 45s) (Sección B)
  const [selectedVideoDuration, setSelectedVideoDuration] = useState<VideoDurationSeconds>(30);

  // Modo de motor (Local Determinístico vs Adaptador Opcional Gemini) (Sección E)
  const [engineMode, setEngineMode] = useState<CreativeEngineMode>('LOCAL_TEMPLATE_ENGINE');
  const [geminiEnabledDraft, setGeminiEnabledDraft] = useState<boolean>(
    studioState.aiAdapterConfig.enabled
  );
  const [geminiQuotaDraft, setGeminiQuotaDraft] = useState<number>(
    studioState.aiAdapterConfig.dailyQuotaLimit
  );

  // Guardado de proyecto y versionado (Sección D y F)
  const [projectTitle, setProjectTitle] = useState<string>('');
  const [versionChangeNote, setVersionChangeNote] = useState<string>('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [selectedLibraryProject, setSelectedLibraryProject] =
    useState<CreativeStudioSavedProject | null>(null);

  // Resultado de Validación Comercial Estricta en tiempo real (Sección G)
  const complianceResult = useMemo(
    () =>
      validateCreativeCompliance({
        catalogItem: selectedItem,
        ownerId: selectedOwnerId,
        requestedDiscountPct: composerSettings.discountPct,
        customTextToInspect: customTextInspector
      }),
    [selectedItem, selectedOwnerId, composerSettings.discountPct, customTextInspector, refreshTick]
  );

  // Generación de Copywriting y Guiones de Video (sólo si precio y stock están validados)
  const generatedCopyBundle = useMemo(() => {
    if (
      !selectedItem ||
      !complianceResult.priceApprovedCheck.passed ||
      !complianceResult.stockAvailableCheck.passed
    ) {
      return null;
    }
    try {
      return generateValidatedCopywritingBundle({
        catalogItem: selectedItem,
        ownerId: selectedOwnerId,
        discountPct: composerSettings.discountPct,
        brand: brandState.currentBrandConfig
      });
    } catch {
      return null;
    }
  }, [
    selectedItem,
    selectedOwnerId,
    composerSettings.discountPct,
    brandState.currentBrandConfig,
    complianceResult.priceApprovedCheck.passed,
    complianceResult.stockAvailableCheck.passed
  ]);

  const generatedVideoBundle = useMemo(() => {
    if (!selectedItem || !generatedCopyBundle) return null;
    return generateVideoScriptsAndStoryboards(
      selectedItem,
      generatedCopyBundle,
      brandState.currentBrandConfig
    );
  }, [selectedItem, generatedCopyBundle, brandState.currentBrandConfig]);

  const composedSvgMarkup = useMemo(() => {
    if (!selectedItem || !generatedCopyBundle) return '';
    return renderCreativeStudioComposedSvg({
      catalogItem: selectedItem,
      copyBundle: generatedCopyBundle,
      composerSettings,
      brand: brandState.currentBrandConfig
    });
  }, [selectedItem, generatedCopyBundle, composerSettings, brandState.currentBrandConfig]);

  const sanitizedPublicPayload = useMemo(() => {
    if (!selectedItem) return {};
    const price = generatedCopyBundle?.effectivePriceCop || selectedItem.currentNormalPriceCop || 0;
    return buildSanitizedPublicCommercialPayload(selectedItem, price);
  }, [selectedItem, generatedCopyBundle]);

  // Handlers
  const handleUpdateConsent = (status: 'granted' | 'revoked') => {
    if (!canWriteCreative) {
      notify('error', 'Permiso denegado', `El rol ${effectiveRole} es de solo lectura en Creative Studio.`);
      return;
    }
    if (!selectedItem) return;
    try {
      const updated = registerOwnerMarketingConsent({
        ownerId: selectedOwnerId,
        ownerName: currentOwnerName,
        sku: selectedItem.sku,
        productName: selectedItem.productName,
        status,
        authorizedChannels: consentChannelsDraft,
        maxAuthorizedDiscountPct: consentMaxDiscDraft,
        consentNotes: consentNotesDraft,
        actorName
      });
      setRefreshTick((t) => t + 1);
      notify(
        status === 'granted' ? 'success' : 'warning',
        status === 'granted'
          ? 'Consentimiento Comercial Otorgado'
          : 'Consentimiento Comercial Revocado',
        `Registro ${updated.consentCode} actualizado para ${selectedOwnerId} sobre SKU ${selectedItem.sku}.`
      );
    } catch (err: unknown) {
      notify(
        'error',
        'Error en consentimiento',
        err instanceof Error ? err.message : 'No se pudo actualizar.'
      );
    }
  };

  const handleUploadRealProductPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedRasterTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedRasterTypes.includes(file.type)) {
      notify(
        'error',
        'Formato de imagen no permitido',
        'Solo se permiten fotografías reales PNG, JPG o WEBP (SVG bloqueado por seguridad).'
      );
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && /^data:image\/(png|jpeg|webp);base64,/i.test(reader.result)) {
        setComposerSettings((prev) => ({
          ...prev,
          originalProductPhotoDataUrl: reader.result as string
        }));
        notify(
          'success',
          'Fotografía Real Cargada',
          'La imagen original ha sido preservada intacta sin recortes ni alteraciones al producto.'
        );
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCopyText = (label: string, text: string) => {
    navigator.clipboard.writeText(text);
    notify('info', 'Texto copiado', `${label} copiado al portapapeles.`);
  };

  const handleExportComposedImage = async (format: 'PNG' | 'SVG') => {
    if (!selectedItem || !composedSvgMarkup) return;
    if (!complianceResult.passedAll) {
      notify(
        'error',
        'Exportación bloqueada por validación',
        complianceResult.blockingErrors.join(' | ')
      );
      return;
    }
    const dims = getDimensionsForAspectRatio(composerSettings.aspectRatio);
    const filename = `REAL_TWS_CREATIVE_${selectedItem.sku}_${composerSettings.aspectRatio.replace(':', 'x')}`;
    try {
      if (format === 'PNG') {
        await exportSvgMarkupToPngFile(composedSvgMarkup, filename, dims.width, dims.height);
      } else {
        exportSvgMarkupToSvgFile(composedSvgMarkup, filename);
      }
      notify(
        'success',
        `Creatividad ${format} Exportada`,
        `Archivo ${filename}.${format.toLowerCase()} descargado (${dims.width}×${dims.height} px).`
      );
    } catch (err: unknown) {
      notify(
        'error',
        'Error al exportar imagen',
        err instanceof Error ? err.message : 'Error inesperado.'
      );
    }
  };

  const handleExportVideoScriptTxt = () => {
    if (!selectedItem || !generatedVideoBundle) return;
    const script = generatedVideoBundle.scriptsByDuration[selectedVideoDuration];
    const lines: string[] = [
      `====================================================================`,
      `REAL TWS — GUION Y STORYBOARD AUDIOVISUAL (${script.durationSeconds} SEGUNDOS)`,
      `====================================================================`,
      `Título: ${script.title}`,
      `SKU: ${selectedItem.sku} | Propietario: ${selectedOwnerId} (${currentOwnerName})`,
      `Objetivo: ${script.objective}`,
      `Llamada a la Acción Final: ${script.closingCallToAction}`,
      `--------------------------------------------------------------------`,
      ...script.scenes.map(
        (sc) =>
          `[ESCENA ${sc.sceneNumber} | ${sc.timeRangeLabel} (${sc.durationSeconds}s)]\n` +
          `• Visual / Plano: ${sc.shotTypeAndVisual}\n` +
          `• Narración (Voz): "${sc.narrationVoiceover}"\n` +
          `• Subtítulos: "${sc.subtitlesText}"\n` +
          `• Texto en Pantalla: [${sc.onScreenTextOverlay}]\n`
      )
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GUION_${selectedVideoDuration}S_${selectedItem.sku}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('success', 'Guion descargado', `Storyboard de ${selectedVideoDuration}s exportado en TXT.`);
  };

  const handleSaveGeminiAdapterConfig = () => {
    if (!canWriteCreative) {
      notify('error', 'Permiso denegado', `El rol ${effectiveRole} es de solo lectura.`);
      return;
    }
    updateOptionalGeminiAdapterSettings({
      enabled: geminiEnabledDraft,
      dailyQuotaLimit: geminiQuotaDraft
    });
    setRefreshTick((t) => t + 1);
    notify(
      'success',
      'Adaptador Opcional Actualizado',
      `Estado: ${geminiEnabledDraft ? 'Habilitado (Opcional)' : 'Deshabilitado (100% Local)'} • Cuota diaria: ${geminiQuotaDraft} ejecuciones.`
    );
  };

  const handleSaveProjectToLibrary = () => {
    if (!canWriteCreative) {
      notify('error', 'Permiso denegado', `El rol ${effectiveRole} es de solo lectura.`);
      return;
    }
    if (!selectedItem || !generatedCopyBundle || !generatedVideoBundle || !composedSvgMarkup) {
      notify(
        'error',
        'No se puede guardar el proyecto',
        'Verifique que el SKU tenga precio aprobado, stock disponible y consentimiento del propietario.'
      );
      return;
    }

    try {
      const auditExec = recordCreativeEngineExecutionAudit({
        item: selectedItem,
        effectivePriceCop: generatedCopyBundle.effectivePriceCop,
        requestedMode: engineMode
      });

      const saved = saveCreativeProjectToLibrary({
        existingProjectId: editingProjectId,
        title:
          projectTitle.trim() ||
          `Campaña ${selectedItem.sku} (${composerSettings.aspectRatio}) — ${selectedOwnerId}`,
        catalogItem: selectedItem,
        ownerId: selectedOwnerId,
        engineUsed: auditExec.effectiveModeUsed,
        composerSettings,
        copyBundle: generatedCopyBundle,
        videoBundle: generatedVideoBundle,
        finalComposedSvgMarkup: composedSvgMarkup,
        changeNote:
          versionChangeNote.trim() ||
          (editingProjectId
            ? `Nueva versión creativa (${composerSettings.aspectRatio})`
            : 'Versión inicial v1 (Original intacta + Composición + Copy + 4 Guiones Video)'),
        actorName
      });

      setEditingProjectId(saved.id);
      setSelectedLibraryProject(saved);
      setVersionChangeNote('');
      setRefreshTick((t) => t + 1);
      notify(
        'success',
        `Proyecto Guardado (${saved.projectCode} • v${saved.currentVersion})`,
        `${auditExec.notice} Imagen original y versión final guardadas en Biblioteca.`
      );
    } catch (err: unknown) {
      notify(
        'error',
        'Validación bloqueó el guardado',
        err instanceof Error ? err.message : 'Error al guardar en biblioteca.'
      );
    }
  };

  const toggleConsentChannel = (ch: 'marketplace' | 'facebook' | 'instagram' | 'whatsapp') => {
    setConsentChannelsDraft((prev) =>
      prev.includes(ch) ? prev.filter((item) => item !== ch) : [...prev, ch]
    );
  };

  return (
    <div className="module-container rtw-stack-lg">
      {/* Encabezado Maestro */}
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
              <Sparkles size={18} color="#D4AF37" />
              <span
                style={{
                  color: '#D4AF37',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase'
                }}
              >
                Estudio Creativo
              </span>
            </div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 750, color: '#F9FAFB', margin: 0, letterSpacing: '-0.02em' }}>
              Copywriting, Guiones e Image Composer
            </h1>
            <p style={{ color: '#9CA3AF', marginTop: '0.3rem', fontSize: '0.88rem' }}>
              Piezas comerciales conectadas a stock real, Brand Kit y autorización por propietario.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span
              className={`rtw-badge ${complianceResult.passedAll ? 'badge-success' : 'badge-danger'}`}
            >
              {complianceResult.passedAll
                ? '5/5 Reglas Aprobadas'
                : `${complianceResult.blockingErrors.length} Bloqueo(s)`}
            </span>
            <span className="rtw-badge badge-gold">
              {studioState.projects.length} proyectos
            </span>
          </div>
        </div>

        {/* Barra Global de Selección de Producto (SKU), Propietario y Descuento */}
        <div
          style={{
            marginTop: '1.25rem',
            paddingTop: '1.1rem',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.85rem',
            alignItems: 'end'
          }}
        >
          <div>
            <label className="form-label" style={{ color: '#D1D5DB', fontSize: '0.78rem' }}>
              1. Producto del Catálogo Real (SKU)
            </label>
            <select
              className="form-input"
              value={selectedSku}
              onChange={(e) => {
                setSelectedSku(e.target.value);
                setEditingProjectId(null);
              }}
            >
              {catalogItems.map((item) => (
                <option key={item.sku} value={item.sku}>
                  {item.sku} — {item.productName} ({item.variantOrColor}) | Stock: {item.qtyAvailableTotal} |{' '}
                  {item.currentNormalPriceCop ? formatCOP(item.currentNormalPriceCop) : 'SIN PRECIO'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label" style={{ color: '#D1D5DB', fontSize: '0.78rem' }}>
              2. Propietario de la Mercancía
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
              3. Descuento Promocional Solicitado (%)
            </label>
            <input
              type="number"
              min={0}
              max={60}
              className="form-input"
              value={composerSettings.discountPct}
              onChange={(e) =>
                setComposerSettings((prev) => ({
                  ...prev,
                  discountPct: Math.max(0, Number(e.target.value) || 0)
                }))
              }
            />
          </div>

          <div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.45rem' }}
              onClick={handleSaveProjectToLibrary}
            >
              <Save size={16} />
              {editingProjectId ? 'Guardar Nueva Versión' : 'Guardar en Biblioteca (v1)'}
            </button>
          </div>
        </div>

        {/* Pestañas de Navegación del Estudio */}
        <div style={{ marginTop: '1.15rem' }}>
          <SegmentedTabs
            variant="dark"
            value={activeTab}
            onChange={setActiveTab}
            ariaLabel="Secciones de Estudio Creativo"
            items={[
              {
                id: 'VALIDATION_AND_CONSENT',
                label: currentConsent?.status === 'granted' ? 'Validación · OK' : 'Validación',
                icon: <ShieldCheck size={15} />
              },
              {
                id: 'COPYWRITING',
                label: 'Copywriting',
                icon: <FileText size={15} />
              },
              {
                id: 'VIDEO_STORYBOARD',
                label: 'Guiones Video',
                icon: <Video size={15} />
              },
              {
                id: 'IMAGE_COMPOSER',
                label: 'Image Composer',
                icon: <ImageIcon size={15} />
              },
              {
                id: 'AI_PROVIDER_ADAPTER',
                label: 'Adaptador IA',
                icon: <Cpu size={15} />
              },
              {
                id: 'MEDIA_LIBRARY',
                label: 'Biblioteca',
                icon: <FolderArchive size={15} />,
                count: studioState.projects.length
              }
            ]}
          />
        </div>
      </div>

      {/* =====================================================================
          PESTAÑA 1: VALIDACIÓN ESTRICTA (SECCIÓN G) Y CONSENTIMIENTO (SECCIÓN F)
          ===================================================================== */}
      {activeTab === 'VALIDATION_AND_CONSENT' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))',
            gap: '1.5rem'
          }}
        >
          {/* Panel Izquierdo: 5 Controles Obligatorios de Validación (Sección G) */}
          <div className="card" style={{ padding: '1.4rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.4rem' }}>
              G. Motor de Validación Comercial Estricta
            </h2>
            <p style={{ fontSize: '0.84rem', color: 'var(--rtw-text-muted)', marginBottom: '1rem' }}>
              El estudio bloquea automáticamente la generación o guardado si falta precio aprobado, si no hay stock disponible, si el descuento excede el acuerdo o si se afirman características desconocidas.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                {
                  title: '1. Precio Comercial Aprobado',
                  check: complianceResult.priceApprovedCheck
                },
                {
                  title: '2. Stock Disponible Real Verificado',
                  check: complianceResult.stockAvailableCheck
                },
                {
                  title: '3. Consentimiento Comercial del Propietario',
                  check: complianceResult.ownerConsentCheck
                },
                {
                  title: '4. Descuento dentro del Acuerdo y Precio Mínimo',
                  check: complianceResult.discountAgreementCheck
                },
                {
                  title: '5. Fidelidad de Especificaciones (Sin Inventar Funciones)',
                  check: complianceResult.verifiedSpecsOnlyCheck
                }
              ].map((row, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '0.85rem',
                    borderRadius: '0.5rem',
                    border: `1px solid ${row.check.passed ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.45)'}`,
                    background: row.check.passed
                      ? 'rgba(16, 185, 129, 0.06)'
                      : 'rgba(239, 68, 68, 0.08)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.7rem'
                  }}
                >
                  {row.check.passed ? (
                    <CheckCircle2 size={19} color="#10B981" style={{ flexShrink: 0, marginTop: '2px' }} />
                  ) : (
                    <AlertTriangle size={19} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                  )}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{row.title}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--rtw-text-secondary)', marginTop: '0.15rem' }}>
                      {row.check.message}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '1.15rem', paddingTop: '1rem', borderTop: '1px solid var(--rtw-border-light)' }}>
              <label className="form-label">
                Inspector Anti-Alucinación de Texto Publicitario (Prueba de Especificaciones)
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Ej. Escribe 'sumergible IP68' o 'carga solar' para probar el bloqueo..."
                value={customTextInspector}
                onChange={(e) => setCustomTextInspector(e.target.value)}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--rtw-text-muted)', display: 'block', marginTop: '0.3rem' }}>
                Si escribes una característica técnica no registrada en la ficha del SKU, la regla #5 la bloqueará de inmediato.
              </span>
            </div>
          </div>

          {/* Panel Derecho: Registro de Consentimiento Comercial del Propietario (Sección F) */}
          <div className="card" style={{ padding: '1.4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
                F. Consentimiento Comercial del Propietario
              </h2>
              {currentConsent && (
                <span
                  className="badge"
                  style={{
                    background:
                      currentConsent.status === 'granted'
                        ? 'rgba(16, 185, 129, 0.15)'
                        : 'rgba(245, 158, 11, 0.15)',
                    color: currentConsent.status === 'granted' ? '#10B981' : '#D97706',
                    fontWeight: 700
                  }}
                >
                  {currentConsent.consentCode} •{' '}
                  {currentConsent.status === 'granted' ? 'AUTORIZADO' : 'PENDIENTE / REVOCADO'}
                </span>
              )}
            </div>

            <p style={{ fontSize: '0.84rem', color: 'var(--rtw-text-muted)', marginTop: '0.4rem', marginBottom: '1rem' }}>
              Antes de promocionar o guardar piezas publicitarias de un artículo, debe registrarse el consentimiento explícito del propietario de la mercancía (<strong>{selectedOwnerId} — {currentOwnerName}</strong>).
            </p>

            <div className="form-group" style={{ marginBottom: '0.9rem' }}>
              <label className="form-label">SKU y Propietario Vinculados</label>
              <input
                type="text"
                className="form-input"
                disabled
                value={`${selectedItem?.sku || ''} — ${selectedItem?.productName || ''} | Propietario: ${selectedOwnerId} (${currentOwnerName})`}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '0.9rem' }}>
              <label className="form-label">Descuento Máximo Autorizado por el Propietario (%)</label>
              <input
                type="number"
                min={0}
                max={50}
                className="form-input"
                value={consentMaxDiscDraft}
                onChange={(e) => setConsentMaxDiscDraft(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '0.9rem' }}>
              <label className="form-label">Canales Autorizados para Publicación</label>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                {(['marketplace', 'facebook', 'instagram', 'whatsapp'] as const).map((ch) => (
                  <label
                    key={ch}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.4rem 0.7rem',
                      borderRadius: '0.4rem',
                      border: '1px solid var(--rtw-border-light)',
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      textTransform: 'capitalize'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={consentChannelsDraft.includes(ch)}
                      onChange={() => toggleConsentChannel(ch)}
                    />
                    {ch}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1.1rem' }}>
              <label className="form-label">Acta / Nota de Autorización Comercial</label>
              <textarea
                rows={3}
                className="form-input"
                value={consentNotesDraft}
                onChange={(e) => setConsentNotesDraft(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleUpdateConsent('granted')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}
              >
                <CheckCircle2 size={16} />
                Registrar Consentimiento Comercial ({selectedOwnerId})
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleUpdateConsent('revoked')}
              >
                Revocar Autorización
              </button>
            </div>

            {currentConsent?.grantedAt && (
              <div style={{ marginTop: '0.9rem', fontSize: '0.78rem', color: '#059669' }}>
                ✓ Autorizado por <strong>{currentConsent.grantedBy}</strong> el{' '}
                {formatDateCO(currentConsent.grantedAt)}.
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 2: COPYWRITING MULTICANAL (SECCIÓN A)
          ===================================================================== */}
      {activeTab === 'COPYWRITING' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          {!generatedCopyBundle ? (
            <div className="card" style={{ padding: '1.5rem', border: '1px solid #EF4444' }}>
              <h3 style={{ color: '#EF4444', margin: 0 }}>
                Generación de Copywriting Bloqueada por Reglas de Integridad
              </h3>
              <p style={{ marginTop: '0.4rem', fontSize: '0.88rem' }}>
                No se permite generar copywriting con precio si el SKU no tiene precio aprobado en Finanzas o si no tiene unidades disponibles en stock. Revise la pestaña de Validación.
              </p>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))',
                  gap: '1.25rem'
                }}
              >
                {/* 5 Variantes de Título */}
                <div className="card" style={{ padding: '1.25rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.75rem' }}>
                    A.1 — Cinco (5) Variantes de Título Aprobadas
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {generatedCopyBundle.headlines.map((hl, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '0.65rem 0.8rem',
                          borderRadius: '0.45rem',
                          background: 'var(--rtw-bg-subtle)',
                          border: '1px solid var(--rtw-border-light)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.6rem'
                        }}
                      >
                        <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>
                          <strong>#{idx + 1}:</strong> {hl}
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }}
                          onClick={() => handleCopyText(`Título #${idx + 1}`, hl)}
                        >
                          <Copy size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3 Descripciones Cortas + 3 Llamadas a la Acción */}
                <div className="card" style={{ padding: '1.25rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.65rem' }}>
                    A.2 — Tres (3) Descripciones Cortas
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '1.1rem' }}>
                    {generatedCopyBundle.shortDescriptions.map((sd, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '0.6rem 0.75rem',
                          borderRadius: '0.45rem',
                          background: 'var(--rtw-bg-subtle)',
                          border: '1px solid var(--rtw-border-light)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}
                      >
                        <span style={{ fontSize: '0.82rem' }}>
                          <strong> Corta #{idx + 1}:</strong> {sd}
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }}
                          onClick={() => handleCopyText(`Descripción corta #${idx + 1}`, sd)}
                        >
                          <Copy size={13} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.65rem' }}>
                    A.3 — Tres (3) Llamadas a la Acción (CTA)
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    {generatedCopyBundle.callsToAction.map((cta, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '0.6rem 0.75rem',
                          borderRadius: '0.45rem',
                          background: 'rgba(212, 175, 55, 0.08)',
                          border: '1px solid rgba(212, 175, 55, 0.35)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}
                      >
                        <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                          <strong>CTA #{idx + 1}:</strong> {cta}
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }}
                          onClick={() => handleCopyText(`CTA #${idx + 1}`, cta)}
                        >
                          <Copy size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 5 Variantes de Texto Publicitario */}
              <div className="card" style={{ padding: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.75rem' }}>
                  A.4 — Cinco (5) Variantes de Texto Publicitario Principal
                </h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))',
                    gap: '0.85rem'
                  }}
                >
                  {generatedCopyBundle.adCopyVariants.map((copyText, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '0.85rem',
                        borderRadius: '0.5rem',
                        background: 'var(--rtw-bg-subtle)',
                        border: '1px solid var(--rtw-border-light)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.65rem'
                      }}
                    >
                      <div style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                        <strong style={{ color: '#9A7409', display: 'block', marginBottom: '0.25rem' }}>
                          Variante Publicitaria #{idx + 1}
                        </strong>
                        {copyText}
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ alignSelf: 'flex-end', fontSize: '0.76rem', padding: '0.3rem 0.65rem' }}
                        onClick={() => handleCopyText(`Texto publicitario #${idx + 1}`, copyText)}
                      >
                        <Copy size={13} style={{ marginRight: '0.3rem' }} /> Copiar Variante #{idx + 1}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Textos por Canal: Marketplace, Facebook, Instagram y WhatsApp */}
              <div className="card" style={{ padding: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.75rem' }}>
                  A.5 — Textos Optimizados por Canal (Marketplace, Facebook, Instagram y WhatsApp)
                </h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                    gap: '1rem'
                  }}
                >
                  {[
                    {
                      key: 'marketplace',
                      title: 'Marketplace (Ficha Estructurada)',
                      content: generatedCopyBundle.channelSpecific.marketplace
                    },
                    {
                      key: 'facebook',
                      title: 'Facebook Feed & Grupos',
                      content: generatedCopyBundle.channelSpecific.facebook
                    },
                    {
                      key: 'instagram',
                      title: 'Instagram Post & Reels Caption',
                      content: generatedCopyBundle.channelSpecific.instagram
                    },
                    {
                      key: 'whatsapp',
                      title: 'WhatsApp Business & Catálogo',
                      content: generatedCopyBundle.channelSpecific.whatsapp
                    }
                  ].map((ch) => (
                    <div
                      key={ch.key}
                      style={{
                        padding: '0.9rem',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--rtw-border-light)',
                        background: 'var(--rtw-bg-surface)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.75rem'
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: '0.86rem',
                            marginBottom: '0.45rem',
                            color: 'var(--rtw-text-primary)'
                          }}
                        >
                          {ch.title}
                        </div>
                        <pre
                          style={{
                            whiteSpace: 'pre-wrap',
                            fontFamily: 'inherit',
                            fontSize: '0.8rem',
                            color: 'var(--rtw-text-secondary)',
                            margin: 0,
                            lineHeight: 1.45
                          }}
                        >
                          {ch.content}
                        </pre>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ fontSize: '0.76rem', padding: '0.4rem 0.75rem' }}
                        onClick={() => handleCopyText(ch.title, ch.content)}
                      >
                        <Copy size={13} style={{ marginRight: '0.35rem' }} /> Copiar {ch.title}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 3: GUIONES DE VIDEO & STORYBOARD 10s, 15s, 30s, 45s (SECCIÓN B)
          ===================================================================== */}
      {activeTab === 'VIDEO_STORYBOARD' && (
        <div className="card" style={{ padding: '1.4rem' }}>
          {!generatedVideoBundle ? (
            <div style={{ color: '#EF4444', fontWeight: 700 }}>
              Seleccione un SKU con precio aprobado y stock disponible para generar los 4 guiones de video.
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  marginBottom: '1.2rem'
                }}
              >
                <div>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
                    B. Guiones Audiovisuales y Storyboard por Escenas (10s, 15s, 30s y 45s)
                  </h2>
                  <p style={{ fontSize: '0.84rem', color: 'var(--rtw-text-muted)', marginTop: '0.25rem' }}>
                    Incluye estructura de escenas, narración (voz en off), subtítulos sincronizados, texto en pantalla y llamada a la acción.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {([10, 15, 30, 45] as VideoDurationSeconds[]).map((dur) => (
                    <button
                      key={dur}
                      type="button"
                      className={selectedVideoDuration === dur ? 'btn btn-primary' : 'btn btn-secondary'}
                      onClick={() => setSelectedVideoDuration(dur)}
                    >
                      Guion {dur} Segundos
                    </button>
                  ))}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleExportVideoScriptTxt}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <Download size={15} /> Exportar TXT
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => window.print()}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <Printer size={15} /> Imprimir / PDF
                  </button>
                </div>
              </div>

              {(() => {
                const activeScript = generatedVideoBundle.scriptsByDuration[selectedVideoDuration];
                return (
                  <div>
                    <div
                      style={{
                        padding: '0.9rem 1.1rem',
                        borderRadius: '0.5rem',
                        background: '#0D0E12',
                        color: '#F9FAFB',
                        marginBottom: '1rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.75rem'
                      }}
                    >
                      <div>
                        <div style={{ color: '#D4AF37', fontWeight: 800, fontSize: '0.95rem' }}>
                          {activeScript.title}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#D1D5DB', marginTop: '0.2rem' }}>
                          Objetivo: {activeScript.objective}
                        </div>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#10B981', fontWeight: 700 }}>
                        CTA Cierre: {activeScript.closingCallToAction}
                      </div>
                    </div>

                    <div className="table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Escena</th>
                            <th>Tiempo</th>
                            <th>Visual / Storyboard</th>
                            <th>Narración (Locución)</th>
                            <th>Subtítulos</th>
                            <th>Texto en Pantalla</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeScript.scenes.map((scene) => (
                            <tr key={scene.sceneNumber}>
                              <td style={{ fontWeight: 800 }}>Escena #{scene.sceneNumber}</td>
                              <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem' }}>
                                {scene.timeRangeLabel} ({scene.durationSeconds}s)
                              </td>
                              <td>{scene.shotTypeAndVisual}</td>
                              <td style={{ fontStyle: 'italic' }}>"{scene.narrationVoiceover}"</td>
                              <td>{scene.subtitlesText}</td>
                              <td>
                                <span
                                  className="badge"
                                  style={{
                                    background: '#151821',
                                    color: '#D4AF37',
                                    border: '1px solid #D4AF37',
                                    fontFamily: 'JetBrains Mono, monospace'
                                  }}
                                >
                                  {scene.onScreenTextOverlay}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 4: IMAGE COMPOSER (1:1, 4:5, 9:16) Y BRAND KIT (SECCIONES C y D)
          ===================================================================== */}
      {activeTab === 'IMAGE_COMPOSER' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))',
            gap: '1.5rem',
            alignItems: 'start'
          }}
        >
          {/* Controles de Composición y Fotografía Real */}
          <div className="card" style={{ padding: '1.35rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.4rem' }}>
              C &amp; D. Image Composer + Brand Kit REAL TWS
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--rtw-text-muted)', marginBottom: '1rem' }}>
              Compone piezas listas para publicar en formatos <strong>1:1</strong>, <strong>4:5</strong> y <strong>9:16</strong> agregando logo REAL TWS, precio vigente, SKU y textos aprobados sin modificar ni distorsionar la fotografía original del producto.
            </p>

            <div className="form-group" style={{ marginBottom: '0.9rem' }}>
              <label className="form-label">Formato de Salida (Relación de Aspecto)</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {(['1:1', '4:5', '9:16'] as CreativeAspectRatio[]).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    className={
                      composerSettings.aspectRatio === ratio ? 'btn btn-primary' : 'btn btn-secondary'
                    }
                    onClick={() =>
                      setComposerSettings((prev) => ({
                        ...prev,
                        aspectRatio: ratio
                      }))
                    }
                  >
                    Formato {ratio} ({getDimensionsForAspectRatio(ratio).width}×
                    {getDimensionsForAspectRatio(ratio).height})
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '0.9rem' }}>
              <label className="form-label">Plantilla del Brand Kit REAL TWS</label>
              <select
                className="form-input"
                value={composerSettings.templateStyle}
                onChange={(e) =>
                  setComposerSettings((prev) => ({
                    ...prev,
                    templateStyle: e.target.value as ImageComposerSettings['templateStyle']
                  }))
                }
              >
                <option value="LUXURY_CARBON_GOLD">Negro Carbón &amp; Dorado Metálico (Firma REAL TWS)</option>
                <option value="EDITORIAL_CLEAN">Editorial Claro de Alta Lectura (Catálogo &amp; Marketplace)</option>
                <option value="HIGH_IMPACT_PROMO">Alto Contraste Comercial (Reels &amp; Ads)</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '0.9rem' }}>
              <label className="form-label">
                Fotografía Real del Producto (Se conserva 100% intacta sin alterar el artículo)
              </label>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <label
                  className="btn btn-secondary"
                  style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Upload size={15} />
                  Subir Fotografía Real (PNG/JPG/WEBP)
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: 'none' }}
                    onChange={handleUploadRealProductPhoto}
                  />
                </label>
                {composerSettings.originalProductPhotoDataUrl && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() =>
                      setComposerSettings((prev) => ({ ...prev, originalProductPhotoDataUrl: null }))
                    }
                  >
                    Restaurar Vista de Catálogo
                  </button>
                )}
              </div>
            </div>

            {generatedCopyBundle && (
              <>
                <div className="form-group" style={{ marginBottom: '0.9rem' }}>
                  <label className="form-label">Título Aprobado en el Lienzo (1 de 5)</label>
                  <select
                    className="form-input"
                    value={composerSettings.selectedHeadlineIndex}
                    onChange={(e) =>
                      setComposerSettings((prev) => ({
                        ...prev,
                        selectedHeadlineIndex: Number(e.target.value)
                      }))
                    }
                  >
                    {generatedCopyBundle.headlines.map((hl, i) => (
                      <option key={i} value={i}>
                        Título #{i + 1}: {hl}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '0.9rem' }}>
                  <label className="form-label">Descripción Corta en el Lienzo (1 de 3)</label>
                  <select
                    className="form-input"
                    value={composerSettings.selectedShortDescIndex}
                    onChange={(e) =>
                      setComposerSettings((prev) => ({
                        ...prev,
                        selectedShortDescIndex: Number(e.target.value)
                      }))
                    }
                  >
                    {generatedCopyBundle.shortDescriptions.map((sd, i) => (
                      <option key={i} value={i}>
                        Descripción #{i + 1}: {sd}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Llamada a la Acción en el Lienzo (1 de 3)</label>
                  <select
                    className="form-input"
                    value={composerSettings.selectedCtaIndex}
                    onChange={(e) =>
                      setComposerSettings((prev) => ({
                        ...prev,
                        selectedCtaIndex: Number(e.target.value)
                      }))
                    }
                  >
                    {generatedCopyBundle.callsToAction.map((cta, i) => (
                      <option key={i} value={i}>
                        CTA #{i + 1}: {cta}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleExportComposedImage('PNG')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Download size={16} /> Exportar PNG ({composerSettings.aspectRatio})
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleExportComposedImage('SVG')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Download size={16} /> Exportar SVG Vectorial
              </button>
            </div>
          </div>

          {/* Vista Previa en Vivo del Lienzo SVG/Canvas */}
          <div className="card" style={{ padding: '1.35rem', textAlign: 'center' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.85rem'
              }}
            >
              <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                Vista Previa en Vivo — {getDimensionsForAspectRatio(composerSettings.aspectRatio).label}
              </span>
              <span className="badge" style={{ background: '#0D0E12', color: '#D4AF37' }}>
                Brand Kit v{brandState.brandVersions[0]?.versionNumber || 1}
              </span>
            </div>

            {composedSvgMarkup ? (
              <div
                style={{
                  maxWidth: composerSettings.aspectRatio === '9:16' ? '330px' : '420px',
                  margin: '0 auto',
                  borderRadius: '0.75rem',
                  overflow: 'hidden',
                  boxShadow: '0 12px 28px rgba(0,0,0,0.22)'
                }}
                dangerouslySetInnerHTML={{ __html: composedSvgMarkup }}
              />
            ) : (
              <div style={{ padding: '2rem', color: '#EF4444' }}>
                No se puede componer la pieza gráfica porque el SKU no tiene precio aprobado o stock disponible.
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 5: ADAPTADOR OPCIONAL GEMINI API Y CUOTA (SECCIÓN E)
          ===================================================================== */}
      {activeTab === 'AI_PROVIDER_ADAPTER' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))',
            gap: '1.5rem'
          }}
        >
          <div className="card" style={{ padding: '1.35rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <Lock size={19} color="#D4AF37" />
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
                E. Adaptador Opcional Gemini API &amp; Control de Cuota
              </h2>
            </div>
            <p style={{ fontSize: '0.83rem', color: 'var(--rtw-text-muted)', marginBottom: '1rem' }}>
              El estudio creativo funciona al <strong>100% sin exigir IA</strong> mediante su motor determinístico local. El adaptador Gemini API es estrictamente opcional, controla cuota diaria, bloquea cualquier activación de facturación o servicios gráficos pagos y filtra datos privados.
            </p>

            <div className="form-group" style={{ marginBottom: '0.9rem' }}>
              <label className="form-label">Modo de Motor Activo</label>
              <select
                className="form-input"
                value={engineMode}
                onChange={(e) => setEngineMode(e.target.value as CreativeEngineMode)}
              >
                <option value="LOCAL_TEMPLATE_ENGINE">
                  Motor Local Determinístico REAL TWS (Recomendado • Costo $0 • Sin exigir IA)
                </option>
                <option value="GEMINI_OPTIONAL_ADAPTER">
                  Adaptador Opcional Gemini API (Sujeto a cuota gratuita diaria)
                </option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '0.9rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                <input
                  type="checkbox"
                  checked={geminiEnabledDraft}
                  onChange={(e) => setGeminiEnabledDraft(e.target.checked)}
                />
                Habilitar Adaptador Opcional Gemini API
              </label>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">
                Límite Diario de Cuota (Usado hoy: {studioState.aiAdapterConfig.dailyQuotaUsed} /{' '}
                {studioState.aiAdapterConfig.dailyQuotaLimit})
              </label>
              <input
                type="number"
                min={1}
                max={50}
                className="form-input"
                value={geminiQuotaDraft}
                onChange={(e) => setGeminiQuotaDraft(Number(e.target.value) || 15)}
              />
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveGeminiAdapterConfig}
            >
              Guardar Configuración del Adaptador
            </button>
          </div>

          <div className="card" style={{ padding: '1.35rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.4rem' }}>
              Inspector de Payload Público Comercial Sanitizado
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--rtw-text-muted)', marginBottom: '0.75rem' }}>
              Demostración técnica de privacidad: nunca se envían nombres de clientes, teléfonos privados, costos de compra por lote ni comisiones de propietarios.
            </p>
            <pre
              style={{
                background: '#0D0E12',
                color: '#10B981',
                padding: '0.9rem',
                borderRadius: '0.5rem',
                fontSize: '0.78rem',
                overflowX: 'auto'
              }}
            >
              {JSON.stringify(sanitizedPublicPayload, null, 2)}
            </pre>

            <h4 style={{ fontSize: '0.9rem', fontWeight: 800, marginTop: '1rem', marginBottom: '0.45rem' }}>
              Bitácora de Ejecuciones y Cuota ({studioState.aiAdapterConfig.auditLogs.length})
            </h4>
            <div style={{ maxHeight: '190px', overflowY: 'auto', fontSize: '0.76rem' }}>
              {studioState.aiAdapterConfig.auditLogs.length === 0 ? (
                <div style={{ color: 'var(--rtw-text-muted)' }}>Sin ejecuciones registradas aún.</div>
              ) : (
                studioState.aiAdapterConfig.auditLogs.slice(0, 8).map((log) => (
                  <div
                    key={log.id}
                    style={{
                      padding: '0.45rem 0',
                      borderBottom: '1px solid var(--rtw-border-light)',
                      display: 'flex',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>
                      <strong>{log.sku}</strong> • {log.modeUsed}
                    </span>
                    <span style={{ color: 'var(--rtw-text-muted)' }}>{formatDateCO(log.timestamp)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 6: BIBLIOTECA MULTIMEDIA Y VERSIONES INMUTABLES (SECCIÓN F)
          ===================================================================== */}
      {activeTab === 'MEDIA_LIBRARY' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          <div className="card" style={{ padding: '1.35rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.4rem' }}>
              F. Biblioteca Multimedia Vinculada a SKU y Propietario
            </h2>
            <p style={{ fontSize: '0.83rem', color: 'var(--rtw-text-muted)', marginBottom: '1rem' }}>
              Cada proyecto conserva la fotografía original sin alterar, la imagen compuesta final, el paquete de copywriting, los 4 guiones de video y el historial de versiones inmutables (<code>v1..vN</code>) relacionado con su SKU y Propietario.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '0.85rem',
                marginBottom: '1.2rem'
              }}
            >
              <div>
                <label className="form-label">Título del Proyecto Creativo</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={`Ej. Campaña ${selectedItem?.sku || ''} (${composerSettings.aspectRatio})`}
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Nota de Versión (v1 Original / v2+)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej. Ajuste de titular y formato 4:5"
                  value={versionChangeNote}
                  onChange={(e) => setVersionChangeNote(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'end', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveProjectToLibrary}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Save size={16} />
                  {editingProjectId ? 'Guardar Nueva Versión' : 'Crear Proyecto v1'}
                </button>
                {editingProjectId && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEditingProjectId(null)}
                  >
                    Nuevo Proyecto
                  </button>
                )}
              </div>
            </div>

            {studioState.projects.length === 0 ? (
              <div
                style={{
                  padding: '2rem',
                  textAlign: 'center',
                  background: 'var(--rtw-bg-subtle)',
                  borderRadius: '0.5rem',
                  color: 'var(--rtw-text-muted)'
                }}
              >
                No hay proyectos guardados aún. Otorgue el consentimiento comercial en la Pestaña 1 y pulse{' '}
                <strong>"Guardar en Biblioteca (v1)"</strong>.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Título</th>
                      <th>SKU</th>
                      <th>Propietario</th>
                      <th>Consentimiento</th>
                      <th>Precio Snapshot</th>
                      <th>Versión Actual</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studioState.projects.map((prj) => (
                      <tr key={prj.id}>
                        <td style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                          {prj.projectCode}
                        </td>
                        <td style={{ fontWeight: 700 }}>{prj.title}</td>
                        <td>{prj.sku}</td>
                        <td>
                          {prj.ownerId} ({prj.ownerName})
                        </td>
                        <td>
                          <span className="badge" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>
                            {prj.consentCode}
                          </span>
                        </td>
                        <td>{formatCOP(prj.approvedPriceSnapshotCop)}</td>
                        <td>
                          <span className="badge" style={{ background: '#0D0E12', color: '#D4AF37' }}>
                            v{prj.currentVersion} ({prj.versions.length} vers.)
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.76rem' }}
                              onClick={() => {
                                setSelectedLibraryProject(prj);
                                setEditingProjectId(prj.id);
                              }}
                            >
                              <History size={13} style={{ marginRight: '0.25rem' }} /> Inspeccionar Versiones
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

          {selectedLibraryProject && (
            <div className="card" style={{ padding: '1.35rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '0.75rem' }}>
                Historial Inmutable del Proyecto {selectedLibraryProject.projectCode} — SKU{' '}
                {selectedLibraryProject.sku} ({selectedLibraryProject.ownerId})
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '1rem'
                }}
              >
                {selectedLibraryProject.versions.map((ver) => (
                  <div
                    key={ver.versionNumber}
                    style={{
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      border: ver.isOriginalBaseline ? '2px solid #D4AF37' : '1px solid var(--rtw-border-light)',
                      background: 'var(--rtw-bg-surface)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <span style={{ fontWeight: 800 }}>
                        Versión v{ver.versionNumber}{' '}
                        {ver.isOriginalBaseline ? '(Original Intacta)' : ''}
                      </span>
                      <span style={{ fontSize: '0.76rem', color: 'var(--rtw-text-muted)' }}>
                        Formato {ver.aspectRatio}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--rtw-text-secondary)', marginBottom: '0.6rem' }}>
                      {ver.changeNote}
                    </p>
                    <div
                      style={{
                        maxWidth: '210px',
                        margin: '0 auto 0.6rem auto',
                        borderRadius: '0.4rem',
                        overflow: 'hidden'
                      }}
                      dangerouslySetInnerHTML={{ __html: ver.finalComposedSvgMarkup }}
                    />
                    <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>
                      ✓ Foto original preservada:{' '}
                      {ver.originalImagePreserved ? 'Foto subida intacta' : 'Ficha original de catálogo'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default CreativeStudioModule;
