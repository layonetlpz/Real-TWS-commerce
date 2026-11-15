import { useState, useEffect, useMemo } from 'react';
import {
  Award,
  Sparkles,
  Printer,
  Download,
  FileText,
  History,
  CheckCircle2,
  Palette,
  Type,
  Sliders,
  RotateCcw
} from 'lucide-react';
import {
  type BrandMerchandisingStoreState,
  type LogoVariantId,
  type MerchTemplateFormat,
  type MerchandisingDesignConfig,
  APPROVED_MERCH_TEMPLATES,
  getBrandMerchandisingState,
  saveNewBrandIdentityVersion,
  restoreBrandIdentityVersion,
  getRealCatalogMerchItems,
  saveMerchandisingAssetVersion,
  renderRealTwsLogoSvgMarkup,
  renderMerchandisingPieceSvg,
  exportSvgMarkupToSvgFile,
  exportSvgMarkupToPngFile,
  exportPrintableMerchandisingToPdf,
  initializeBrandMerchCatalogBaseline
} from '../../services/brandMerchandisingService';
import { formatCOP } from '../../utils/formatters';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { ModuleHeader, SegmentedTabs } from '../../components/glass';

export type BrandMerchTab =
  | 'BRAND_CENTER'
  | 'DIGITAL_MERCHANDISING'
  | 'PHYSICAL_MERCHANDISING'
  | 'TEMPLATE_LIBRARY_AND_VERSIONS';

interface BrandMerchandisingModuleProps {
  initialTab?: BrandMerchTab;
}

const LOGO_VARIANT_LABELS: Record<LogoVariantId, string> = {
  PRIMARY_HORIZONTAL: '1. Logo Principal Horizontal (Carbón & Dorado)',
  MONOGRAM_BADGE: '2. Monograma / Sello Circular Oficial',
  GOLD_ON_CARBON: '3. Dorado Alto Contraste sobre Negro Carbón',
  CARBON_ON_LIGHT: '4. Editorial sobre Fondo Claro (Impresión)',
  MINIMAL_SEAL: '5. Sello Minimalista para Etiquetas SKU'
};

export function BrandMerchandisingModule({
  initialTab = 'BRAND_CENTER'
}: BrandMerchandisingModuleProps) {
  const { userProfile } = useAuth();
  const { notify: rawNotify } = useNotifications();
  const notify = (
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'info'
  ) => rawNotify(type, 'Brand & Merchandising Center', message);

  const actorName = userProfile?.fullName || userProfile?.email || 'Director de Marca';

  const [activeTab, setActiveTab] = useState<BrandMerchTab>(initialTab);
  const [brandState, setBrandState] = useState<BrandMerchandisingStoreState>(() =>
    getBrandMerchandisingState()
  );
  const [catalogItems, setCatalogItems] = useState(() => getRealCatalogMerchItems());

  // Estado editable del Brand Center
  const [selectedLogoVariant, setSelectedLogoVariant] = useState<LogoVariantId>(
    brandState.currentBrandConfig.activeLogoVariant
  );
  const [editableSlogan, setEditableSlogan] = useState<string>(
    brandState.currentBrandConfig.slogan
  );
  const [editableTone, setEditableTone] = useState<string>(
    brandState.currentBrandConfig.commercialTone
  );
  const [editableWhatsapp, setEditableWhatsapp] = useState<string>(
    brandState.currentBrandConfig.companyInfo.whatsappContact
  );
  const [editableInstagram, setEditableInstagram] = useState<string>(
    brandState.currentBrandConfig.companyInfo.instagramHandle
  );
  const [editableWarranty, setEditableWarranty] = useState<string>(
    brandState.currentBrandConfig.companyInfo.warrantyPolicySummary
  );
  const [brandVersionNote, setBrandVersionNote] = useState<string>('');

  // Estado del Editor de Merchandising (Digital y Físico)
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [carouselSlideIndex, setCarouselSlideIndex] = useState<number>(0);
  const [assetVersionNote, setAssetVersionNote] = useState<string>('');

  const [designConfig, setDesignConfig] = useState<MerchandisingDesignConfig>({
    templateId: 'TPL-DIG-02',
    format: 'product_sheet_digital',
    category: 'DIGITAL',
    title: '',
    subtitle: '',
    primarySku: 'COM-PER-001-AZU',
    comparisonSkuSecond: 'HOG-ACC-001-NEG',
    targetCategoryName: 'Audio',
    themeVariant: 'CARBON_GOLD',
    logoVariant: 'PRIMARY_HORIZONTAL',
    showPriceBadge: true,
    usePromoPriceIfAvailable: false,
    includeInternalOwnerTag: false,
    selectedOwnerIdForInternalTag: 'OWN-0001',
    selectedLotIdForInternalTag: '',
    customCallToAction: '',
    footerLegalOrWarrantyNote: '',
    copiesPerPrintPage: 4
  });

  useEffect(() => {
    setActiveTab(initialTab);
    if (initialTab === 'PHYSICAL_MERCHANDISING') {
      setDesignConfig((prev) => ({
        ...prev,
        templateId: 'TPL-PHY-01',
        format: 'sku_label',
        category: 'PHYSICAL'
      }));
    }
  }, [initialTab]);

  useEffect(() => {
    initializeBrandMerchCatalogBaseline().then(() => {
      const freshItems = getRealCatalogMerchItems();
      setCatalogItems(freshItems);
      if (freshItems.length > 0) {
        setDesignConfig((prev) => ({
          ...prev,
          primarySku: freshItems[0].sku,
          comparisonSkuSecond: freshItems[1]?.sku || freshItems[0].sku,
          targetCategoryName: freshItems[0].category
        }));
      }
    });
  }, []);

  const refreshState = () => {
    setBrandState({ ...getBrandMerchandisingState() });
    setCatalogItems(getRealCatalogMerchItems());
  };

  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    for (const item of catalogItems) {
      if (item.category) set.add(item.category);
    }
    return Array.from(set);
  }, [catalogItems]);

  const primaryCatalogItem = useMemo(
    () =>
      catalogItems.find((i) => i.sku === designConfig.primarySku) ||
      catalogItems[0] ||
      null,
    [catalogItems, designConfig.primarySku]
  );

  const activeTemplateMeta = useMemo(
    () =>
      APPROVED_MERCH_TEMPLATES.find((t) => t.format === designConfig.format) ||
      APPROVED_MERCH_TEMPLATES[0],
    [designConfig.format]
  );

  // Si es carrusel de 3 láminas, adaptar el título/subtítulo según el slide activo
  const effectiveDesignForRender = useMemo<MerchandisingDesignConfig>(() => {
    if (designConfig.format !== 'carousel_deck' || !primaryCatalogItem) {
      return designConfig;
    }
    if (carouselSlideIndex === 0) {
      return {
        ...designConfig,
        title: `SLIDE 1/3: ${primaryCatalogItem.productName}`,
        subtitle: `Presentación Oficial REAL TWS • SKU ${primaryCatalogItem.sku}`
      };
    }
    if (carouselSlideIndex === 1) {
      return {
        ...designConfig,
        title: `SLIDE 2/3: ESPECIFICACIONES VERIFICADAS`,
        subtitle: primaryCatalogItem.verifiedFeatures
      };
    }
    return {
      ...designConfig,
      title: `SLIDE 3/3: DISPONIBILIDAD Y RESPALDO`,
      subtitle: `Stock verificado: ${primaryCatalogItem.qtyAvailableTotal} uds • Garantía directa REAL TWS`
    };
  }, [designConfig, carouselSlideIndex, primaryCatalogItem]);

  const liveMerchSvgMarkup = useMemo(
    () =>
      renderMerchandisingPieceSvg(
        effectiveDesignForRender,
        brandState.currentBrandConfig,
        catalogItems
      ),
    [effectiveDesignForRender, brandState.currentBrandConfig, catalogItems]
  );

  const liveLogoSvgMarkup = useMemo(
    () => renderRealTwsLogoSvgMarkup(selectedLogoVariant, editableSlogan),
    [selectedLogoVariant, editableSlogan]
  );

  const handleSelectFormat = (format: MerchTemplateFormat, category: 'DIGITAL' | 'PHYSICAL') => {
    const tpl = APPROVED_MERCH_TEMPLATES.find((t) => t.format === format);
    setDesignConfig((prev) => ({
      ...prev,
      templateId: tpl?.id || prev.templateId,
      format,
      category,
      themeVariant:
        format === 'sku_label' || format === 'owner_internal_label' || format === 'printable_product_sheet'
          ? 'LIGHT_EDITORIAL'
          : 'CARBON_GOLD'
    }));
  };

  const handleSaveBrandVersion = () => {
    try {
      const updated = {
        ...brandState.currentBrandConfig,
        slogan: editableSlogan,
        commercialTone: editableTone,
        activeLogoVariant: selectedLogoVariant,
        companyInfo: {
          ...brandState.currentBrandConfig.companyInfo,
          whatsappContact: editableWhatsapp,
          instagramHandle: editableInstagram,
          warrantyPolicySummary: editableWarranty
        }
      };
      const ver = saveNewBrandIdentityVersion(
        updated,
        brandVersionNote || 'Actualización manual de directrices de marca e información corporativa.',
        actorName
      );
      refreshState();
      setBrandVersionNote('');
      notify(
        `Nueva versión de identidad corporativa v${ver.versionNumber} guardada. El original (v1) se conserva intacto.`,
        'success'
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleSaveMerchPieceVersion = () => {
    try {
      const saved = saveMerchandisingAssetVersion({
        existingAssetId: editingAssetId,
        designConfig,
        changeNote:
          assetVersionNote ||
          (editingAssetId
            ? 'Nueva versión editada conservando versión original v1.'
            : 'Versión original v1 generada desde catálogo real.'),
        actorName
      });
      refreshState();
      setEditingAssetId(saved.id);
      setAssetVersionNote('');
      notify(
        `Pieza ${saved.assetCode} guardada en versión v${saved.currentVersion} (Original v1 conservado).`,
        'success'
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <div className="module-container">
      {/* ENCABEZADO PRINCIPAL */}
      <ModuleHeader
        variant="dark"
        eyebrow="MARKETING · IDENTIDAD Y MATERIAL"
        title="Branding y Merchandising"
        subtitle={`Identidad visual oficial, ${catalogItems.length} SKUs conectados y material imprimible.`}
        badge={
          <span className="rtw-badge rtw-badge-gold">
            v{brandState.brandVersions[0]?.versionNumber || 1} · {brandState.savedAssets.length} piezas
          </span>
        }
        bottomSlot={
          <SegmentedTabs<BrandMerchTab>
            variant="dark"
            value={activeTab}
            onChange={(next) => {
              setActiveTab(next);
              if (next === 'DIGITAL_MERCHANDISING' && designConfig.category !== 'DIGITAL') {
                handleSelectFormat('product_sheet_digital', 'DIGITAL');
              }
              if (next === 'PHYSICAL_MERCHANDISING' && designConfig.category !== 'PHYSICAL') {
                handleSelectFormat('sku_label', 'PHYSICAL');
              }
            }}
            items={[
              { id: 'BRAND_CENTER', label: 'Identidad', icon: <Award size={14} /> },
              { id: 'DIGITAL_MERCHANDISING', label: 'Digital', icon: <Sparkles size={14} /> },
              { id: 'PHYSICAL_MERCHANDISING', label: 'Impresos PDF', icon: <Printer size={14} /> },
              {
                id: 'TEMPLATE_LIBRARY_AND_VERSIONS',
                label: 'Biblioteca',
                icon: <History size={14} />,
                count: brandState.savedAssets.length
              }
            ]}
          />
        }
      />

      {/* ===================================================================== */}
      {/* TAB 1: BRAND CENTER (LOGO, VARIANTES, COLORES, TIPOGRAFÍA, ESLOGAN)   */}
      {/* ===================================================================== */}
      {activeTab === 'BRAND_CENTER' && (
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          {/* BLOQUE SUPERIOR: LOGO Y 5 VARIANTES VECTORIALES + ESLOGAN Y TONO EDITABLES */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(410px, 1fr))',
              gap: '1.25rem'
            }}
          >
            {/* PREVISUALIZADOR Y EXPORTADOR DE VARIANTES DE LOGO */}
            <div className="card">
              <span className="badge badge-gold" style={{ marginBottom: '0.4rem' }}>
                SISTEMA DE LOGOTIPO OFICIAL Y 5 VARIANTES
              </span>
              <h2 style={{ fontSize: '1.15rem', margin: '0 0 0.75rem 0' }}>
                Logo Maestro REAL TWS y Variantes Oficiales
              </h2>

              <div className="form-group" style={{ marginBottom: '0.85rem' }}>
                <label className="form-label">Seleccionar Variante Oficial de Logo</label>
                <select
                  className="form-control"
                  value={selectedLogoVariant}
                  onChange={(e) => setSelectedLogoVariant(e.target.value as LogoVariantId)}
                >
                  {Object.entries(LOGO_VARIANT_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lienzo de previsualización del logo */}
              <div
                style={{
                  padding: '1.5rem',
                  borderRadius: '12px',
                  border: '1px solid var(--border-subtle)',
                  background:
                    selectedLogoVariant === 'CARBON_ON_LIGHT' ? '#E2E8F0' : '#08090C',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  minHeight: '190px',
                  marginBottom: '1rem'
                }}
              >
                <div
                  style={{ width: '100%', maxWidth: '380px' }}
                  dangerouslySetInnerHTML={{ __html: liveLogoSvgMarkup }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={async () => {
                    try {
                      await exportSvgMarkupToPngFile(
                        liveLogoSvgMarkup,
                        `REAL_TWS_LOGO_${selectedLogoVariant}.png`,
                        1200,
                        400
                      );
                      notify('Logo exportado en formato PNG de alta resolución.', 'success');
                    } catch (err) {
                      notify(err instanceof Error ? err.message : String(err), 'error');
                    }
                  }}
                >
                  <Download size={15} /> Descargar Logo PNG
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    exportSvgMarkupToSvgFile(
                      liveLogoSvgMarkup,
                      `REAL_TWS_LOGO_${selectedLogoVariant}.svg`
                    );
                    notify('Logo vectorial descargado en formato SVG.', 'success');
                  }}
                >
                  <Download size={15} /> Descargar Vector SVG
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    exportPrintableMerchandisingToPdf(
                      liveLogoSvgMarkup,
                      `Logo REAL TWS — ${selectedLogoVariant}`,
                      1,
                      'A4'
                    )
                  }
                >
                  <FileText size={15} /> Exportar Hoja Logo PDF
                </button>
              </div>
            </div>

            {/* EDITOR DE ESLOGAN, TONO COMERCIAL E INFORMACIÓN EMPRESARIAL CON VERSIONADO */}
            <div className="card">
              <span className="badge badge-gold" style={{ marginBottom: '0.4rem' }}>
                DIRECTRICES EDITABLES CON HISTORIAL INMUTABLE
              </span>
              <h2 style={{ fontSize: '1.15rem', margin: '0 0 0.75rem 0' }}>
                Eslogan, Tono Comercial e Información Empresarial
              </h2>

              <div style={{ display: 'grid', gap: '0.65rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Eslogan Oficial Editable *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editableSlogan}
                    onChange={(e) => setEditableSlogan(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tono Comercial y Voz de Marca</label>
                  <textarea
                    rows={3}
                    className="form-control"
                    value={editableTone}
                    onChange={(e) => setEditableTone(e.target.value)}
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
                    <label className="form-label">WhatsApp Oficial</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editableWhatsapp}
                      onChange={(e) => setEditableWhatsapp(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Instagram / Red Oficial</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editableInstagram}
                      onChange={(e) => setEditableInstagram(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Ciudad / Sede y Resumen de Garantía</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editableWarranty}
                    onChange={(e) => setEditableWarranty(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">
                    Nota de Versión (se guardará una nueva versión sin borrar el original v1) *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej: Ajuste de eslogan para campaña de fin de año..."
                    value={brandVersionNote}
                    onChange={(e) => setBrandVersionNote(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveBrandVersion}
                >
                  <CheckCircle2 size={16} /> Guardar Nueva Versión de Identidad Corporativa
                </button>
              </div>
            </div>
          </div>

          {/* PALETA DE COLORES Y TIPOGRAFÍA OFICIAL */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(410px, 1fr))',
              gap: '1.25rem'
            }}
          >
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem' }}>
                <Palette size={18} style={{ color: 'var(--accent-gold)' }} />
                <h2 style={{ fontSize: '1.12rem', margin: 0 }}>
                  Paleta Oficial de Colores REAL TWS (Digital e Imprenta)
                </h2>
              </div>

              <div style={{ display: 'grid', gap: '0.65rem' }}>
                {brandState.currentBrandConfig.colors.map((swatch) => (
                  <div
                    key={swatch.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '64px 1fr',
                      gap: '0.8rem',
                      padding: '0.65rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-elevated)',
                      alignItems: 'center'
                    }}
                  >
                    <div
                      style={{
                        width: '64px',
                        height: '56px',
                        borderRadius: '8px',
                        background: swatch.hex,
                        border: '1px solid rgba(255,255,255,0.2)'
                      }}
                    />
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <strong>
                          {swatch.name} ({swatch.role})
                        </strong>
                        <code style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>
                          {swatch.hex} | {swatch.cmykReference}
                        </code>
                      </div>
                      <div style={{ fontSize: '0.79rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        {swatch.usageNotes}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem' }}>
                <Type size={18} style={{ color: 'var(--accent-gold)' }} />
                <h2 style={{ fontSize: '1.12rem', margin: 0 }}>
                  Tipografía, Guía Visual y Reglas de Integridad de Catálogo
                </h2>
              </div>

              <div style={{ display: 'grid', gap: '0.65rem', marginBottom: '1rem' }}>
                {brandState.currentBrandConfig.typography.map((typ) => (
                  <div
                    key={typ.id}
                    style={{
                      padding: '0.65rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-elevated)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong>{typ.role}</strong>
                      <span className="badge badge-gold">{typ.weights}</span>
                    </div>
                    <div style={{ fontSize: '0.86rem', marginTop: '0.2rem' }}>{typ.fontFamily}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                      {typ.usage}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  padding: '0.8rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface)'
                }}
              >
                <strong style={{ display: 'block', marginBottom: '0.4rem' }}>
                  Guía Visual y Restricciones Obligatorias:
                </strong>
                <ul style={{ margin: '0 0 0 1.1rem', padding: 0, fontSize: '0.81rem', color: 'var(--text-secondary)' }}>
                  {brandState.currentBrandConfig.visualGuideRules.map((rule, idx) => (
                    <li key={idx} style={{ marginBottom: '0.25rem' }}>
                      {rule}
                    </li>
                  ))}
                  {brandState.currentBrandConfig.prohibitedPractices.map((p, idx) => (
                    <li key={`p-${idx}`} style={{ marginBottom: '0.25rem', color: 'var(--status-warning)' }}>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* HISTORIAL DE VERSIONES DEL BRAND CENTER */}
          <div className="card">
            <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.75rem 0' }}>
              Historial Inmutable de Versiones del Brand Center ({brandState.brandVersions.length})
            </h3>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Versión</th>
                    <th>Fecha</th>
                    <th>Autor</th>
                    <th>Eslogan Snapshot</th>
                    <th>Nota de Versión</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {brandState.brandVersions.map((ver) => (
                    <tr key={ver.versionNumber}>
                      <td>
                        <strong>v{ver.versionNumber}</strong>{' '}
                        {ver.isOriginalBaseline && (
                          <span className="badge badge-gold">ORIGINAL v1</span>
                        )}
                      </td>
                      <td>{ver.createdAt.slice(0, 16).replace('T', ' ')}</td>
                      <td>{ver.createdBy}</td>
                      <td>{ver.configSnapshot.slogan}</td>
                      <td>{ver.changeNote}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
                          onClick={() => {
                            const restored = restoreBrandIdentityVersion(
                              ver.versionNumber,
                              actorName
                            );
                            setEditableSlogan(restored.configSnapshot.slogan);
                            setEditableTone(restored.configSnapshot.commercialTone);
                            refreshState();
                            notify(
                              `Se restauró la configuración de v${ver.versionNumber} generando la versión v${restored.versionNumber}.`,
                              'success'
                            );
                          }}
                        >
                          <RotateCcw size={13} /> Restaurar como Nueva Versión
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2 Y TAB 3: EDITOR Y PREVISUALIZADOR DE MERCHANDISING DIGITAL      */}
      {/* Y FÍSICO CON DATOS REALES DEL CATÁLOGO Y EXPORTACIÓN PNG / SVG / PDF  */}
      {/* ===================================================================== */}
      {(activeTab === 'DIGITAL_MERCHANDISING' || activeTab === 'PHYSICAL_MERCHANDISING') && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(410px, 1fr))',
            gap: '1.25rem',
            alignItems: 'start'
          }}
        >
          {/* PANEL IZQUIERDO: CONFIGURADOR CONECTADO AL CATÁLOGO REAL */}
          <div className="card">
            <span className="badge badge-gold" style={{ marginBottom: '0.4rem' }}>
              {activeTab === 'DIGITAL_MERCHANDISING'
                ? 'EDITOR DE MERCHANDISING DIGITAL (9 FORMATOS)'
                : 'EDITOR DE MERCHANDISING FÍSICO E IMPRESIÓN PDF (7 FORMATOS)'}
            </span>
            <h2 style={{ fontSize: '1.15rem', margin: '0 0 0.75rem 0' }}>
              {activeTemplateMeta.name}
            </h2>
            <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', marginBottom: '0.9rem' }}>
              {activeTemplateMeta.description} ({activeTemplateMeta.dimensionsLabel})
            </p>

            {/* SELECTOR DE FORMATO */}
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="form-label">Formato / Plantilla Aprobada</label>
              <select
                className="form-control"
                value={designConfig.format}
                onChange={(e) =>
                  handleSelectFormat(
                    e.target.value as MerchTemplateFormat,
                    activeTab === 'DIGITAL_MERCHANDISING' ? 'DIGITAL' : 'PHYSICAL'
                  )
                }
              >
                {APPROVED_MERCH_TEMPLATES.filter((t) =>
                  activeTab === 'DIGITAL_MERCHANDISING'
                    ? t.category === 'DIGITAL'
                    : t.category === 'PHYSICAL'
                ).map((tpl) => (
                  <option key={tpl.id} value={tpl.format}>
                    {tpl.name} — {tpl.dimensionsLabel}
                  </option>
                ))}
              </select>
            </div>

            {/* SELECTOR DE PRODUCTO REAL (SKU) */}
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="form-label">
                Producto del Catálogo Real (SKU, Variante y Precio Actual) *
              </label>
              <select
                className="form-control"
                value={designConfig.primarySku}
                onChange={(e) =>
                  setDesignConfig((prev) => ({
                    ...prev,
                    primarySku: e.target.value
                  }))
                }
              >
                {catalogItems.map((item) => (
                  <option key={item.sku} value={item.sku}>
                    {item.sku} — {item.productName} ({item.variantOrColor}) |{' '}
                    {item.currentNormalPriceCop !== null
                      ? formatCOP(item.currentNormalPriceCop)
                      : 'Precio Pendiente'}{' '}
                    | Disp: {item.qtyAvailableTotal}
                  </option>
                ))}
              </select>
            </div>

            {/* SI ES COMPARACIÓN DE PRODUCTOS, SEGUNDO SKU REAL */}
            {designConfig.format === 'product_comparison' && (
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">Segundo Producto Real a Comparar (SKU #2) *</label>
                <select
                  className="form-control"
                  value={designConfig.comparisonSkuSecond}
                  onChange={(e) =>
                    setDesignConfig((prev) => ({
                      ...prev,
                      comparisonSkuSecond: e.target.value
                    }))
                  }
                >
                  {catalogItems.map((item) => (
                    <option key={item.sku} value={item.sku}>
                      {item.sku} — {item.productName} ({item.variantOrColor}) |{' '}
                      {item.currentNormalPriceCop !== null
                        ? formatCOP(item.currentNormalPriceCop)
                        : 'Precio Pendiente'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* SI ES COLECCIÓN POR CATEGORÍA */}
            {designConfig.format === 'category_collection' && (
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">Categoría Real del Catálogo</label>
                <select
                  className="form-control"
                  value={designConfig.targetCategoryName}
                  onChange={(e) =>
                    setDesignConfig((prev) => ({
                      ...prev,
                      targetCategoryName: e.target.value
                    }))
                  }
                >
                  {uniqueCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      Categoría: {cat}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* SI ES ETIQUETA DE PROPIETARIO PARA USO INTERNO */}
            {designConfig.format === 'owner_internal_label' && primaryCatalogItem && (
              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--accent-gold)',
                  background: 'var(--bg-elevated)',
                  marginBottom: '0.75rem'
                }}
              >
                <strong style={{ fontSize: '0.84rem', display: 'block', marginBottom: '0.4rem' }}>
                  Configuración de Etiqueta Interna Multipropietario (Uso Exclusivo Bodega):
                </strong>
                <select
                  className="form-control"
                  value={designConfig.selectedOwnerIdForInternalTag}
                  onChange={(e) =>
                    setDesignConfig((prev) => ({
                      ...prev,
                      selectedOwnerIdForInternalTag: e.target.value
                    }))
                  }
                >
                  {primaryCatalogItem.ownerAllocations.map((oa, idx) => (
                    <option key={idx} value={oa.ownerId}>
                      Propietario: {oa.ownerId} ({oa.ownerName}) | Lote: {oa.lotId} | Ubicación:{' '}
                      {oa.storageBin}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* FICHA DE VERIFICACIÓN DE DATOS ORIGINALES DEL CATÁLOGO */}
            {primaryCatalogItem && (
              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-elevated)',
                  marginBottom: '0.75rem',
                  fontSize: '0.8rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <strong>Datos Verificados del Catálogo (Sin Alterar Originales):</strong>
                  <span className="badge badge-neutral">SKU: {primaryCatalogItem.sku}</span>
                </div>
                <div>
                  <strong>Características reales:</strong> {primaryCatalogItem.verifiedFeatures}
                </div>
                <div>
                  <strong>Denominación marca (texto, sin logos falsos):</strong>{' '}
                  {primaryCatalogItem.brandText} • <strong>Fotografías aprobadas:</strong>{' '}
                  {primaryCatalogItem.approvedPhotos.length}
                </div>
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.65rem',
                marginBottom: '0.75rem'
              }}
            >
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Tema Visual REAL TWS</label>
                <select
                  className="form-control"
                  value={designConfig.themeVariant}
                  onChange={(e) =>
                    setDesignConfig((prev) => ({
                      ...prev,
                      themeVariant: e.target.value as MerchandisingDesignConfig['themeVariant']
                    }))
                  }
                >
                  <option value="CARBON_GOLD">Negro Carbón & Dorado (Oficial)</option>
                  <option value="LIGHT_EDITORIAL">Fondo Claro Editorial (Impresión)</option>
                  <option value="HIGH_CONTRAST_GOLD">Alto Contraste Dorado</option>
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Copias por Pliego PDF</label>
                <select
                  className="form-control"
                  value={designConfig.copiesPerPrintPage}
                  onChange={(e) =>
                    setDesignConfig((prev) => ({
                      ...prev,
                      copiesPerPrintPage: Number(e.target.value) || 1
                    }))
                  }
                >
                  <option value={1}>1 pieza por página (Tamaño Completo)</option>
                  <option value={2}>2 piezas por pliego A4</option>
                  <option value={4}>4 etiquetas/tarjetas por pliego A4</option>
                  <option value={6}>6 etiquetas por pliego A4</option>
                  <option value={8}>8 etiquetas SKU por pliego A4</option>
                  <option value={12}>12 etiquetas SKU por pliego A4</option>
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '0.65rem' }}>
              <label className="form-label">Título Personalizado (Opcional — vacío usa el nombre oficial del catálogo)</label>
              <input
                type="text"
                className="form-control"
                placeholder={primaryCatalogItem?.productName || 'Título comercial...'}
                value={designConfig.title}
                onChange={(e) =>
                  setDesignConfig((prev) => ({ ...prev, title: e.target.value }))
                }
              />
            </div>

            <div className="form-group" style={{ marginBottom: '0.65rem' }}>
              <label className="form-label">Subtítulo / Llamado a la Acción</label>
              <input
                type="text"
                className="form-control"
                placeholder="Ej: Disponible para entrega inmediata en Barranquilla..."
                value={designConfig.customCallToAction}
                onChange={(e) =>
                  setDesignConfig((prev) => ({
                    ...prev,
                    customCallToAction: e.target.value
                  }))
                }
              />
            </div>

            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="form-label">Nota para Historial de Versiones</label>
              <input
                type="text"
                className="form-control"
                placeholder="Motivo de creación o ajuste de esta versión..."
                value={assetVersionNote}
                onChange={(e) => setAssetVersionNote(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveMerchPieceVersion}
              >
                <CheckCircle2 size={16} />
                {editingAssetId
                  ? 'Guardar Nueva Versión (Conservar Original v1)'
                  : 'Guardar Pieza en Biblioteca (v1)'}
              </button>
              {editingAssetId && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setEditingAssetId(null);
                    notify('Modo de pieza nueva activado.', 'info');
                  }}
                >
                  Crear Como Pieza Nueva Independiente
                </button>
              )}
            </div>
          </div>

          {/* PANEL DERECHO: PREVISUALIZACIÓN EN VIVO Y EXPORTACIÓN LOCAL (PNG, SVG, PDF) */}
          <div className="card">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
                marginBottom: '0.85rem'
              }}
            >
              <div>
                <span className="badge badge-gold">PREVISUALIZACIÓN EN TIEMPO REAL</span>
                <h3 style={{ fontSize: '1.08rem', margin: '0.25rem 0 0 0' }}>
                  Lienzo Oficial: {activeTemplateMeta.name}
                </h3>
              </div>

              {designConfig.format === 'carousel_deck' && (
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  {[0, 1, 2].map((idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`btn ${
                        carouselSlideIndex === idx ? 'btn-primary' : 'btn-secondary'
                      }`}
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                      onClick={() => setCarouselSlideIndex(idx)}
                    >
                      Slide {idx + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* LIENZO VECTORIAL */}
            <div
              style={{
                padding: '1.1rem',
                borderRadius: '12px',
                border: '1px solid var(--border-subtle)',
                background: '#08090C',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: '1rem'
              }}
            >
              <div
                style={{ width: '100%', maxWidth: '520px' }}
                dangerouslySetInnerHTML={{ __html: liveMerchSvgMarkup }}
              />
            </div>

            {/* BOTONES DE EXPORTACIÓN LOCAL (PNG, SVG Y PDF IMPRIMIBLE) */}
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    await exportSvgMarkupToPngFile(
                      liveMerchSvgMarkup,
                      `REAL_TWS_${designConfig.format}_${designConfig.primarySku}.png`,
                      activeTemplateMeta.widthPx,
                      activeTemplateMeta.heightPx
                    );
                    notify(
                      `Imagen PNG (${activeTemplateMeta.widthPx}×${activeTemplateMeta.heightPx}px) exportada localmente.`,
                      'success'
                    );
                  } catch (err) {
                    notify(err instanceof Error ? err.message : String(err), 'error');
                  }
                }}
              >
                <Download size={15} /> Exportar Imagen PNG
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  exportSvgMarkupToSvgFile(
                    liveMerchSvgMarkup,
                    `REAL_TWS_${designConfig.format}_${designConfig.primarySku}.svg`
                  );
                  notify('Archivo vectorial SVG descargado.', 'success');
                }}
              >
                <Download size={15} /> Exportar Vector SVG
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  exportPrintableMerchandisingToPdf(
                    liveMerchSvgMarkup,
                    `${activeTemplateMeta.name} — ${designConfig.primarySku}`,
                    designConfig.copiesPerPrintPage,
                    activeTemplateMeta.printSizeMm || activeTemplateMeta.dimensionsLabel
                  );
                  notify(
                    `Pliego imprimible en PDF generado (${designConfig.copiesPerPrintPage} copia(s)).`,
                    'success'
                  );
                }}
              >
                <Printer size={15} /> Imprimir / Exportar PDF ({designConfig.copiesPerPrintPage}x)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: BIBLIOTECA DE LAS 16 PLANTILLAS APROBADAS E HISTORIAL DE       */}
      {/* VERSIONES DE PIEZAS GUARDADAS                                         */}
      {/* ===================================================================== */}
      {activeTab === 'TEMPLATE_LIBRARY_AND_VERSIONS' && (
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          {/* CATÁLOGO DE LAS 16 PLANTILLAS OFICIALES APROBADAS */}
          <div className="card">
            <span className="badge badge-gold" style={{ marginBottom: '0.4rem' }}>
              BIBLIOTECA OFICIAL DE PLANTILLAS APROBADAS
            </span>
            <h2 style={{ fontSize: '1.15rem', margin: '0 0 0.85rem 0' }}>
              16 Plantillas Oficiales REAL TWS (9 Digitales + 7 Físicas Imprimibles)
            </h2>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(265px, 1fr))',
                gap: '0.85rem'
              }}
            >
              {APPROVED_MERCH_TEMPLATES.map((tpl) => (
                <div
                  key={tpl.id}
                  style={{
                    padding: '0.9rem',
                    borderRadius: '10px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-elevated)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '0.6rem'
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '0.35rem'
                      }}
                    >
                      <span
                        className={`badge ${
                          tpl.category === 'DIGITAL' ? 'badge-gold' : 'badge-neutral'
                        }`}
                      >
                        {tpl.category === 'DIGITAL' ? 'DIGITAL' : 'FÍSICO / PDF'}
                      </span>
                      <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {tpl.id}
                      </code>
                    </div>
                    <strong style={{ fontSize: '0.95rem', display: 'block' }}>{tpl.name}</strong>
                    <div style={{ fontSize: '0.76rem', color: 'var(--accent-gold)', marginTop: '0.2rem' }}>
                      {tpl.dimensionsLabel}
                    </div>
                    <p style={{ fontSize: '0.79rem', color: 'var(--text-secondary)', margin: '0.35rem 0 0 0' }}>
                      {tpl.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      handleSelectFormat(tpl.format, tpl.category);
                      setActiveTab(
                        tpl.category === 'DIGITAL'
                          ? 'DIGITAL_MERCHANDISING'
                          : 'PHYSICAL_MERCHANDISING'
                      );
                    }}
                  >
                    <Sliders size={14} /> Abrir en Editor
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* HISTORIAL DE PIEZAS GUARDADAS Y SUS VERSIONES (v1 ORIGINAL + v2..vN) */}
          <div className="card">
            <h2 style={{ fontSize: '1.15rem', margin: '0 0 0.75rem 0' }}>
              Historial de Piezas Guardadas y Versiones Inmutables ({brandState.savedAssets.length})
            </h2>

            {brandState.savedAssets.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                Aún no has guardado piezas personalizadas. En las pestañas de Merchandising Digital o Físico haz clic en <strong>Guardar Pieza en Biblioteca (v1)</strong> para registrar su versión original e historial.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                {brandState.savedAssets.map((asset) => (
                  <div
                    key={asset.id}
                    style={{
                      padding: '0.9rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-elevated)'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                        marginBottom: '0.55rem'
                      }}
                    >
                      <div>
                        <span className="badge badge-gold">{asset.assetCode}</span>{' '}
                        <strong>{asset.title}</strong> — SKU: <code>{asset.primarySku}</code>
                      </div>
                      <span className="badge badge-success">
                        Versión Actual: v{asset.currentVersion} ({asset.versions.length} versión(es) conservadas)
                      </span>
                    </div>

                    <div className="table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Versión</th>
                            <th>Fecha</th>
                            <th>Autor</th>
                            <th>SKU / Precio Snapshot</th>
                            <th>Nota de Versión</th>
                            <th>Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {asset.versions.map((ver) => (
                            <tr key={ver.versionNumber}>
                              <td>
                                <strong>v{ver.versionNumber}</strong>{' '}
                                {ver.isOriginal && (
                                  <span className="badge badge-gold">ORIGINAL v1</span>
                                )}
                              </td>
                              <td>{ver.savedAt.slice(0, 16).replace('T', ' ')}</td>
                              <td>{ver.savedBy}</td>
                              <td>
                                {ver.catalogSnapshot.primarySku} —{' '}
                                {ver.catalogSnapshot.priceSnapshotCop !== null
                                  ? formatCOP(ver.catalogSnapshot.priceSnapshotCop)
                                  : 'Sin precio'}
                              </td>
                              <td>{ver.changeNote}</td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.76rem' }}
                                  onClick={() => {
                                    setEditingAssetId(asset.id);
                                    setDesignConfig(
                                      JSON.parse(JSON.stringify(ver.designConfig))
                                    );
                                    setActiveTab(
                                      ver.designConfig.category === 'DIGITAL'
                                        ? 'DIGITAL_MERCHANDISING'
                                        : 'PHYSICAL_MERCHANDISING'
                                    );
                                    notify(
                                      `Cargada versión v${ver.versionNumber} de ${asset.assetCode} en el editor.`,
                                      'info'
                                    );
                                  }}
                                >
                                  Cargar Versión v{ver.versionNumber}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
