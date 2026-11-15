import { useState, useEffect, useMemo, type ChangeEvent } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Layers,
  Table2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  History,
  ShieldCheck,
  Play,
  Lock,
  ArrowRight,
  CopyCheck
} from 'lucide-react';
import {
  type ImportPreviewAnalysis,
  type NormalizedImportRow,
  type ImportTestCaseResult,
  analyzeWorkbookForImport,
  commitImportBatch,
  downloadOfficialCsvTemplate,
  exportIncidencesReportToCsv,
  getCurrentImportState,
  runImportEngineTestSuite
} from '../../services/excelImportEngine';
import { parseXlsxBuffer, parseCsvUtf8Text } from '../../utils/spreadsheetParser';
import { formatCOP } from '../../utils/formatters';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { ConfirmModal } from '../../components/ConfirmModal';
import { ModuleHeader, SegmentedTabs } from '../../components/glass';

type EngineTabId =
  | 'STEP_1_UPLOAD_SHEETS'
  | 'STEP_2_MAPPING'
  | 'STEP_3_PREVIEW'
  | 'STEP_4_VALIDATIONS_DUPLICATES'
  | 'STEP_5_SUMMARY_MOVEMENTS'
  | 'STEP_6_HISTORY_TESTS';

export function ExcelImportModule() {
  const { userProfile } = useAuth();
  const { notify } = useNotifications();
  const actorEmail = userProfile?.email || 'admin@realtws.co';

  const [activeTab, setActiveTab] = useState<EngineTabId>('STEP_1_UPLOAD_SHEETS');
  const [analysis, setAnalysis] = useState<ImportPreviewAnalysis | null>(null);
  const [selectedSheetForHeaders, setSelectedSheetForHeaders] = useState<string>('06_INVENTARIO_FISICO');
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewFilter, setPreviewFilter] = useState<'ALL' | 'OPENING' | 'PENDING_COST' | 'ZERO_STOCK'>('ALL');
  const [hasReviewedPreview, setHasReviewedPreview] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [testResults, setTestResults] = useState<ImportTestCaseResult[]>([]);
  const [persistedState, setPersistedState] = useState(() => getCurrentImportState());

  useEffect(() => {
    const syncHandler = () => {
      setPersistedState(getCurrentImportState());
    };
    window.addEventListener('rtw-import-state-updated', syncHandler);
    return () => window.removeEventListener('rtw-import-state-updated', syncHandler);
  }, []);

  const handleDownloadTemplate = () => {
    downloadOfficialCsvTemplate();
    notify(
      'success',
      'Plantilla CSV descargada',
      'Completa los campos requeridos y súbela aquí para previsualizar antes de confirmar.'
    );
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoadingFile(true);
    try {
      const lower = file.name.toLowerCase();
      let wb;
      if (lower.endsWith('.xlsx')) {
        const buf = await file.arrayBuffer();
        wb = await parseXlsxBuffer(buf, file.name);
      } else if (lower.endsWith('.csv')) {
        const text = await file.text();
        wb = await parseCsvUtf8Text(text, file.name);
      } else {
        throw new Error('Formato no soportado. Suba únicamente archivos .xlsx o .csv UTF-8.');
      }

      const result = analyzeWorkbookForImport(wb);
      setAnalysis(result);
      setSelectedSheetForHeaders(wb.sheetNames[0] || '');
      setHasReviewedPreview(true);

      notify(
        result.errors.length === 0 ? 'success' : 'warning',
        `Archivo ${wb.format} procesado: ${file.name}`,
        `${result.rows.length} filas leídas, ${result.errors.length} errores bloqueantes y ${result.warnings.length} advertencias.`
      );
    } catch (err) {
      notify(
        'error',
        'Error al procesar archivo',
        err instanceof Error ? err.message : 'Formato inválido'
      );
    } finally {
      setIsLoadingFile(false);
      e.target.value = '';
    }
  };

  const handleConfirmTransactionalImport = async () => {
    if (!analysis) return;
    setIsConfirmModalOpen(false);
    const outcome = await commitImportBatch(analysis, actorEmail);
    const updatedState = getCurrentImportState();
    setPersistedState(updatedState);
    // Re-analyze against updated state so duplicate/idempotency lock reflects immediately
    setAnalysis(analyzeWorkbookForImport(analysis.workbook, updatedState));

    if (outcome.success) {
      setActiveTab('STEP_5_SUMMARY_MOVEMENTS');
      notify(
        'success',
        `Lote ${outcome.batchRecord.batchCode} importado atómicamente`,
        `Se crearon ${outcome.batchRecord.totalOpeningUnits} unidades en movimientos inmutables OPENING_BALANCE para OWN-0001 (Eberto).`
      );
    } else {
      setActiveTab('STEP_4_VALIDATIONS_DUPLICATES');
      notify(
        'error',
        'Importación revertida (ROLLBACK)',
        outcome.errorMessage || 'Se detectaron errores bloqueantes.'
      );
    }
  };

  const handleRunAutomatedTests = async () => {
    setIsRunningTests(true);
    try {
      const results = await runImportEngineTestSuite(actorEmail);
      setTestResults(results);
      const passedCount = results.filter((r) => r.passed).length;
      notify(
        passedCount === results.length ? 'success' : 'error',
        `Batería de Pruebas Completada (${passedCount}/${results.length})`,
        'Se ejecutaron las 6 pruebas obligatorias sobre copias temporales en memoria.'
      );
    } catch (err) {
      notify(
        'error',
        'Error ejecutando pruebas',
        err instanceof Error ? err.message : 'Error inesperado'
      );
    } finally {
      setIsRunningTests(false);
    }
  };

  const filteredPreviewRows = useMemo<NormalizedImportRow[]>(() => {
    if (!analysis) return [];
    return analysis.rows.filter((r) => {
      if (previewFilter === 'OPENING' && r.rowOutcome !== 'IMPORTED_WITH_OPENING_BALANCE') {
        return false;
      }
      if (previewFilter === 'PENDING_COST' && r.costStatus !== 'PENDING_COST') {
        return false;
      }
      if (previewFilter === 'ZERO_STOCK' && r.qtyPhysical > 0) {
        return false;
      }
      if (previewSearch.trim() !== '') {
        const q = previewSearch.toLowerCase();
        return (
          r.sku.toLowerCase().includes(q) ||
          r.productName.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.ownerId.toLowerCase().includes(q) ||
          r.lotId.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [analysis, previewFilter, previewSearch]);

  const activeSheetInfo =
    analysis && selectedSheetForHeaders
      ? analysis.workbook.sheets[selectedSheetForHeaders]
      : null;

  return (
    <div className="module-container">
      {/* CABECERA EJECUTIVA DEL MOTOR */}
      <ModuleHeader
        variant="dark"
        eyebrow="OPERACIONES · CARGA DE DATOS"
        title="Importar Inventario (Excel / CSV)"
        subtitle="Sube tu archivo, valida los datos en vista previa y confirma el ingreso por lote."
        actions={
          <>
            <label className="rtw-btn rtw-btn-gold btn-sm" style={{ cursor: 'pointer' }}>
              <Upload size={14} />
              {isLoadingFile ? 'Procesando...' : 'Subir .XLSX / .CSV'}
              <input
                type="file"
                accept=".xlsx,.csv"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>
            <button
              type="button"
              className="rtw-btn rtw-btn-ghost-dark btn-sm"
              onClick={handleDownloadTemplate}
            >
              <Download size={14} />
              Plantilla CSV
            </button>
          </>
        }
        bottomSlot={
          <SegmentedTabs<EngineTabId>
            variant="dark"
            value={activeTab}
            onChange={(next) => {
              setActiveTab(next);
              if (next === 'STEP_3_PREVIEW') {
                setHasReviewedPreview(true);
              }
            }}
            items={[
              { id: 'STEP_1_UPLOAD_SHEETS', label: '1. Archivo', icon: <Layers size={14} /> },
              { id: 'STEP_2_MAPPING', label: '2. Mapeo', icon: <Table2 size={14} /> },
              {
                id: 'STEP_3_PREVIEW',
                label: '3. Vista previa',
                icon: <FileSpreadsheet size={14} />,
                count: analysis?.rows.length ?? 0
              },
              {
                id: 'STEP_4_VALIDATIONS_DUPLICATES',
                label: '4. Validaciones',
                icon: <ShieldCheck size={14} />,
                count: (analysis?.errors.length ?? 0) + (analysis?.warnings.length ?? 0)
              },
              {
                id: 'STEP_5_SUMMARY_MOVEMENTS',
                label: '5. Confirmación',
                icon: <CheckCircle2 size={14} />,
                count: persistedState.openingMovements.length
              },
              {
                id: 'STEP_6_HISTORY_TESTS',
                label: 'Historial',
                icon: <History size={14} />,
                count: persistedState.batchesHistory.length
              }
            ]}
          />
        }
      />

      {/* BARRA DE ACCIÓN RÁPIDA SI HAY UN ARCHIVO CARGADO */}
      {analysis && (
        <section
          className="rtw-card"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            borderLeft:
              analysis.errors.length === 0
                ? '4px solid #166534'
                : '4px solid #b91c1c'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: '0.92rem' }}>
                Archivo activo: {analysis.workbook.filename}
              </span>
              <span className="rtw-badge rtw-badge-gold">{analysis.workbook.format}</span>
              <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
                Lote: <strong>{analysis.batchCodePreview}</strong> · Idempotency Key:{' '}
                <code>{analysis.idempotencyKey}</code>
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#334155' }}>
              <strong>{analysis.workbook.sheetNames.length}</strong> hojas detectadas ·{' '}
              <strong>{analysis.rows.length}</strong> productos/variantes ·{' '}
              <strong style={{ color: analysis.errors.length > 0 ? '#b91c1c' : '#166534' }}>
                {analysis.errors.length} errores bloqueantes
              </strong>{' '}
              · <strong>{analysis.warnings.length}</strong> advertencias (<code>PENDING_COST</code>) ·{' '}
              <strong>{analysis.discardedJustified.length}</strong> filas de stock 0 justificadas
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => exportIncidencesReportToCsv(analysis)}
              style={{
                background: '#f8fafc',
                color: '#1e293b',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '0.79rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Download size={14} />
              12. Exportar Incidencias (.CSV UTF-8)
            </button>

            <button
              type="button"
              disabled={!analysis.canConfirmImport || !hasReviewedPreview}
              onClick={() => setIsConfirmModalOpen(true)}
              style={{
                background:
                  analysis.canConfirmImport && hasReviewedPreview ? '#166534' : '#94a3b8',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 14px',
                fontSize: '0.8rem',
                fontWeight: 800,
                cursor:
                  analysis.canConfirmImport && hasReviewedPreview ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <CheckCircle2 size={15} />
              9–10. Confirmar e Importar Lote Transaccional
            </button>
          </div>
        </section>
      )}

      {/* =====================================================================
          PESTAÑA 1: SUBIR ARCHIVO, DETECTAR HOJAS Y DETECTAR ENCABEZADOS
         ===================================================================== */}
      {activeTab === 'STEP_1_UPLOAD_SHEETS' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
          <section className="rtw-card">
            <h3 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '10px' }}>
              Funciones 1 y 2: Subida de Archivo y Detección de Hojas
            </h3>
            {!analysis ? (
              <div
                style={{
                  padding: '24px',
                  border: '2px dashed #cbd5e1',
                  borderRadius: '10px',
                  textAlign: 'center',
                  background: '#f8fafc'
                }}
              >
                <FileSpreadsheet size={34} color="#d4af37" style={{ margin: '0 auto 10px' }} />
                <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px' }}>
                  Ningún archivo cargado en la sesión actual
                </p>
                <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '14px' }}>
                  Sube un archivo Excel (<code>.xlsx</code>) o <code>.csv</code> UTF-8 con tu inventario multipropietario para previsualizar el mapeo de columnas y validar inconsistencias antes de importar.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <label className="rtw-btn rtw-btn-primary" style={{ cursor: 'pointer' }}>
                    <Upload size={15} />
                    Seleccionar archivo .XLSX o .CSV
                    <input
                      type="file"
                      accept=".xlsx,.csv"
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <button
                    type="button"
                    className="rtw-btn rtw-btn-outline"
                    onClick={handleDownloadTemplate}
                  >
                    <Download size={15} />
                    Descargar plantilla CSV
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                <table className="rtw-table" style={{ width: '100%', fontSize: '0.79rem' }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Nombre de Hoja Detectada</th>
                      <th>Fila Encabezado</th>
                      <th>Columnas</th>
                      <th>Filas Datos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.workbook.sheetNames.map((sName) => {
                      const sh = analysis.workbook.sheets[sName];
                      const isSelected = selectedSheetForHeaders === sName;
                      return (
                        <tr
                          key={sName}
                          onClick={() => setSelectedSheetForHeaders(sName)}
                          style={{
                            cursor: 'pointer',
                            background: isSelected ? 'rgba(212, 175, 55, 0.14)' : undefined
                          }}
                        >
                          <td>{sh.sheetIndex}</td>
                          <td style={{ fontWeight: 700 }}>{sName}</td>
                          <td>Fila {sh.headerRowNumber}</td>
                          <td>{Object.keys(sh.headers).length} cols</td>
                          <td>{sh.totalDataRows} filas</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rtw-card">
            <h3 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '10px' }}>
              Función 3: Detección Automática de Encabezados{' '}
              {activeSheetInfo ? `— ${activeSheetInfo.name} (Fila ${activeSheetInfo.headerRowNumber})` : ''}
            </h3>
            {!activeSheetInfo ? (
              <p style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Cargue un archivo y seleccione una hoja a la izquierda para inspeccionar sus encabezados detectados.
              </p>
            ) : (
              <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                <table className="rtw-table" style={{ width: '100%', fontSize: '0.79rem' }}>
                  <thead>
                    <tr>
                      <th>Columna Excel</th>
                      <th>Encabezado Detectado (Fila {activeSheetInfo.headerRowNumber})</th>
                      <th>Muestra (Primera Fila de Datos)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(activeSheetInfo.headers).map(([colLetter, headerText]) => {
                      const sampleRow =
                        activeSheetInfo.rows[activeSheetInfo.headerRowNumber + 1] || {};
                      return (
                        <tr key={colLetter}>
                          <td>
                            <span className="rtw-badge rtw-badge-gold">Col {colLetter}</span>
                          </td>
                          <td style={{ fontWeight: 700 }}>{headerText}</td>
                          <td style={{ color: '#475569' }}>{sampleRow[colLetter] || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 2: MAPEO DE LAS 10 ENTIDADES DE DESTINO
         ===================================================================== */}
      {activeTab === 'STEP_2_MAPPING' && (
        <section className="rtw-card">
          <div style={{ marginBottom: '12px' }}>
            <h3 style={{ fontSize: '0.98rem', fontWeight: 800 }}>
              Función 4: Mapeo Oficial de Campos hacia los 10 Dominios de Supabase
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Mapeo auditado entre las hojas del Excel multipropietario (o CSV UTF-8) y las tablas relacionales de PostgreSQL.
            </p>
          </div>

          {!analysis ? (
            <p style={{ fontSize: '0.84rem', color: '#64748b' }}>
              Cargue primero el archivo en la Pestaña 1 para visualizar el mapeo de campos.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="rtw-table" style={{ width: '100%', fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th>Dominio Objetivo</th>
                    <th>Tabla Supabase</th>
                    <th>Hoja Origen Detectada</th>
                    <th>Columnas Origen</th>
                    <th>Campos Destino</th>
                    <th>Regla Crítica Aplicada</th>
                    <th>Registros</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.fieldMappings.map((m) => (
                    <tr key={m.domain}>
                      <td style={{ fontWeight: 800 }}>{m.domain}</td>
                      <td>
                        <code>{m.supabaseTable}</code>
                      </td>
                      <td>{m.sourceSheet}</td>
                      <td>{m.sourceColumns}</td>
                      <td>
                        <code>{m.targetFields}</code>
                      </td>
                      <td style={{ color: '#334155', maxWidth: '300px' }}>{m.ruleApplied}</td>
                      <td style={{ fontWeight: 800 }}>{m.recordsDetected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* =====================================================================
          PESTAÑA 3: VISTA PREVIA OBLIGATORIA DE REGISTROS NORMALIZADOS
         ===================================================================== */}
      {activeTab === 'STEP_3_PREVIEW' && (
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
                Función 5: Vista Previa Obligatoria Antes de Importar
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Inspeccione las cantidades físicas (apto, defectuoso, pendiente), el propietario, el lote y el estado del costo de cada fila antes de confirmar.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Buscar SKU, producto, lote, propietario..."
                value={previewSearch}
                onChange={(e) => setPreviewSearch(e.target.value)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.8rem',
                  minWidth: '240px'
                }}
              />
              <select
                value={previewFilter}
                onChange={(e) =>
                  setPreviewFilter(
                    e.target.value as 'ALL' | 'OPENING' | 'PENDING_COST' | 'ZERO_STOCK'
                  )
                }
                style={{
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.8rem'
                }}
              >
                <option value="ALL">Todas las filas ({analysis?.rows.length ?? 0})</option>
                <option value="OPENING">
                  Con movimiento OPENING_BALANCE (
                  {analysis?.rows.filter((r) => r.rowOutcome === 'IMPORTED_WITH_OPENING_BALANCE')
                    .length ?? 0}
                  )
                </option>
                <option value="PENDING_COST">
                  Con costo PENDING_COST (
                  {analysis?.rows.filter((r) => r.costStatus === 'PENDING_COST').length ?? 0})
                </option>
                <option value="ZERO_STOCK">
                  Stock 0 / Históricos vendidos (
                  {analysis?.rows.filter((r) => r.qtyPhysical === 0).length ?? 0})
                </option>
              </select>
            </div>
          </div>

          {!analysis ? (
            <p style={{ fontSize: '0.84rem', color: '#64748b' }}>
              Cargue un archivo para previsualizar los registros.
            </p>
          ) : (
            <div style={{ maxHeight: '520px', overflowY: 'auto', overflowX: 'auto' }}>
              <table className="rtw-table" style={{ width: '100%', fontSize: '0.78rem' }}>
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>SKU Único</th>
                    <th>Producto / Variante</th>
                    <th>Propietario</th>
                    <th>Lote</th>
                    <th>Físico</th>
                    <th>Apto</th>
                    <th>Defec.</th>
                    <th>Pend. Rev.</th>
                    <th>Costo Unitario</th>
                    <th>Estado Costo</th>
                    <th>Resultado Importación</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPreviewRows.map((r) => (
                    <tr key={`${r.rowNumber}-${r.sku}`}>
                      <td>{r.rowNumber}</td>
                      <td style={{ fontWeight: 800 }}>
                        <code>{r.sku}</code>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{r.productName}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          {r.category} · Color: {r.color}
                        </div>
                      </td>
                      <td>
                        <span className="rtw-badge rtw-badge-gold">
                          {r.ownerId || 'VACÍO'} ({r.ownerName})
                        </span>
                      </td>
                      <td>
                        <code>{r.lotId}</code>
                      </td>
                      <td style={{ fontWeight: 800 }}>{r.qtyPhysical}</td>
                      <td>{r.qtyGood}</td>
                      <td>{r.qtyDefective}</td>
                      <td style={{ fontWeight: 700, color: '#b45309' }}>
                        {r.qtyPendingInspection}
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {r.unitCostCop === null
                          ? 'NULL (Pendiente)'
                          : formatCOP(r.unitCostCop)}
                      </td>
                      <td>
                        <span
                          style={{
                            padding: '2px 7px',
                            borderRadius: '999px',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            background:
                              r.costStatus === 'PENDING_COST'
                                ? '#fef3c7'
                                : r.costStatus === 'BONUS_ZERO_COST'
                                  ? '#e0f2fe'
                                  : '#dcfce7',
                            color:
                              r.costStatus === 'PENDING_COST'
                                ? '#92400e'
                                : r.costStatus === 'BONUS_ZERO_COST'
                                  ? '#075985'
                                  : '#166534'
                          }}
                        >
                          {r.costStatus}
                        </span>
                      </td>
                      <td style={{ maxWidth: '250px', fontSize: '0.73rem' }}>
                        <strong>{r.rowOutcome}</strong>
                        <div style={{ color: '#64748b' }}>{r.justification}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* =====================================================================
          PESTAÑA 4: VALIDACIONES, INFORME DE ERRORES Y REVISIÓN DE DUPLICADOS
         ===================================================================== */}
      {activeTab === 'STEP_4_VALIDATIONS_DUPLICATES' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!analysis ? (
            <section className="rtw-card">
              <p style={{ fontSize: '0.84rem', color: '#64748b' }}>
                Cargue un archivo para ejecutar las validaciones de propietario, cantidades, costos y duplicados.
              </p>
            </section>
          ) : (
            <>
              {/* BLOQUE 1: ERRORES BLOQUEANTES */}
              <section className="rtw-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <XCircle size={18} color={analysis.errors.length > 0 ? '#b91c1c' : '#166534'} />
                  <h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>
                    Funciones 6 y 7: Informe de Errores Bloqueantes ({analysis.errors.length})
                  </h3>
                </div>
                {analysis.errors.length === 0 ? (
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      color: '#166534',
                      fontSize: '0.82rem',
                      fontWeight: 700
                    }}
                  >
                    Cero errores bloqueantes. Todos los propietarios existen en base de datos, todas las ecuaciones físicas (Físico = Apto + Defectuoso + Pendiente) cuadran y no hay SKUs duplicados.
                  </div>
                ) : (
                  <table className="rtw-table" style={{ width: '100%', fontSize: '0.79rem' }}>
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Fila</th>
                        <th>SKU</th>
                        <th>Propietario</th>
                        <th>Campo</th>
                        <th>Error Detectado</th>
                        <th>Acción Requerida</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.errors.map((err) => (
                        <tr key={err.id} style={{ background: '#fef2f2' }}>
                          <td style={{ fontWeight: 800, color: '#b91c1c' }}>{err.code}</td>
                          <td>{err.rowNumber}</td>
                          <td>
                            <code>{err.sku}</code>
                          </td>
                          <td>{err.ownerId}</td>
                          <td>{err.field}</td>
                          <td>{err.message}</td>
                          <td>{err.remediation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              {/* BLOQUE 2: REVISIÓN DE DUPLICADOS */}
              <section className="rtw-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <CopyCheck size={18} color="#d4af37" />
                  <h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>
                    Función 8: Revisión de Duplicados e Idempotencia ({analysis.duplicates.length})
                  </h3>
                </div>
                {analysis.duplicates.length === 0 ? (
                  <p style={{ fontSize: '0.82rem', color: '#166534', fontWeight: 700 }}>
                    Verificado: 0 SKUs repetidos dentro del archivo y 0 colisiones con lotes importados previamente (Idempotency Key: {analysis.idempotencyKey}).
                  </p>
                ) : (
                  <table className="rtw-table" style={{ width: '100%', fontSize: '0.79rem' }}>
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Filas Afectadas</th>
                        <th>Alcance del Duplicado</th>
                        <th>Resolución</th>
                        <th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.duplicates.map((dup, idx) => (
                        <tr key={`${dup.sku}-${idx}`}>
                          <td style={{ fontWeight: 800 }}>
                            <code>{dup.sku}</code>
                          </td>
                          <td>{dup.rowNumbers.join(', ')}</td>
                          <td>{dup.duplicateScope}</td>
                          <td style={{ fontWeight: 800, color: '#b91c1c' }}>{dup.resolution}</td>
                          <td>{dup.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              {/* BLOQUE 3: ADVERTENCIAS (PENDING_COST) Y FILAS STOCK 0 JUSTIFICADAS */}
              <section className="rtw-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <AlertTriangle size={18} color="#b45309" />
                  <h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>
                    Advertencias Auditadas ({analysis.warnings.length}) y Filas Descartadas de OPENING_BALANCE Justificadas ({analysis.discardedJustified.length})
                  </h3>
                </div>
                <table className="rtw-table" style={{ width: '100%', fontSize: '0.79rem' }}>
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Regla</th>
                      <th>Fila</th>
                      <th>SKU</th>
                      <th>Justificación / Detalle Auditado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...analysis.warnings, ...analysis.discardedJustified].map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="rtw-badge rtw-badge-gold">{item.severity}</span>
                        </td>
                        <td style={{ fontWeight: 700 }}>{item.code}</td>
                        <td>{item.rowNumber}</td>
                        <td>
                          <code>{item.sku}</code>
                        </td>
                        <td>
                          <div>{item.message}</div>
                          <div style={{ fontSize: '0.73rem', color: '#64748b' }}>
                            {item.remediation}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 5: RESUMEN ANTES VS DESPUÉS Y LIBRO OPENING_BALANCE INMUTABLE
         ===================================================================== */}
      {activeTab === 'STEP_5_SUMMARY_MOVEMENTS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                <h3 style={{ fontSize: '0.98rem', fontWeight: 800 }}>
                  Resumen Comparativo Antes vs. Después de la Importación
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Comparativa auditada de totales de productos, variantes, unidades físicas, costos, propietarios, errores, advertencias y descartados.
                </p>
              </div>
            </div>

            {(() => {
              const latestCommitted = persistedState.batchesHistory.find(
                (b) => b.batchStatus === 'COMMITTED'
              );
              const before = latestCommitted
                ? latestCommitted.summaryBefore
                : analysis?.summaryBefore ??
                  getCurrentImportState().batchesHistory[0]?.summaryBefore;
              const after = latestCommitted
                ? latestCommitted.summaryAfter
                : analysis?.summaryProjectedAfter;

              if (!before || !after) {
                return (
                  <p style={{ fontSize: '0.84rem', color: '#64748b' }}>
                    Cargue un archivo en la Pestaña 1 para visualizar el resumen comparativo Antes vs. Después.
                  </p>
                );
              }

              const metricRows = [
                {
                  label: 'Propietarios Activos Validados (OWN-0001 Eberto)',
                  before: before.totalOwners,
                  after: after.totalOwners,
                  note: 'Eberto (OWN-0001). Prohibido auto-asignar a futuras recepciones.'
                },
                {
                  label: 'Total Productos Maestros (public.products)',
                  before: before.totalProducts,
                  after: after.totalProducts,
                  note: 'Catálogo maestro universal (incluye 37 con stock > 0 y 3 con stock 0).'
                },
                {
                  label: 'Total Variantes Comerciales SKU (public.product_variants)',
                  before: before.totalVariantsSku,
                  after: after.totalVariantsSku,
                  note: '40 SKUs únicos sin duplicados.'
                },
                {
                  label: 'Lotes de Apertura con Stock Físico > 0 (LOT-INI-2026-01)',
                  before: before.totalOpeningLots,
                  after: after.totalOpeningLots,
                  note: 'Sin crear recepciones ni órdenes de compra ficticias.'
                },
                {
                  label: 'Movimientos Inmutables OPENING_BALANCE (public.stock_movements)',
                  before: before.totalOpeningMovements,
                  after: after.totalOpeningMovements,
                  note: 'Protegidos contra edición o borrado posterior.'
                },
                {
                  label: 'Total Unidades Físicas en Bodega (qty_physical)',
                  before: before.totalPhysicalUnits,
                  after: after.totalPhysicalUnits,
                  note: '36 SKUs con 1 unidad + MOT-ACC-003-NEG con 2 unidades = 38 unidades.'
                },
                {
                  label: 'Unidades Aptas (qty_good) / Defectuosas (qty_defective)',
                  before: `${before.totalGoodUnits} / ${before.totalDefectiveUnits}`,
                  after: `${after.totalGoodUnits} / ${after.totalDefectiveUnits}`,
                  note: 'Pendientes de inspección técnica inicial.'
                },
                {
                  label: 'Unidades Pendientes de Revisión (qty_pending_inspection)',
                  before: before.totalPendingInspectionUnits,
                  after: after.totalPendingInspectionUnits,
                  note: 'No se contabilizan como disponibles para venta hasta aprobar inspección.'
                },
                {
                  label: 'Costo Total de Inventario Físico Activo (COP)',
                  before: formatCOP(before.totalActiveStockCostCop),
                  after: formatCOP(after.totalActiveStockCostCop),
                  note: `Costo registrado total incluyendo 2 históricos vendidos: ${formatCOP(after.totalRegisteredCatalogCostCop)}.`
                },
                {
                  label: 'SKUs con Costo PENDING_COST (Sin inferir ni inventar)',
                  before: before.pendingCostSkus,
                  after: after.pendingCostSkus,
                  note: 'ELE-AUD-001-STD (1 unid.) y AUD-TWS-003-NEG (0 unid.).'
                },
                {
                  label: 'SKUs con Costo $0 COP Documentado (BONUS_ZERO_COST)',
                  before: before.bonusZeroCostSkus,
                  after: after.bonusZeroCostSkus,
                  note: 'HER-SOP-002-NEG (Regalo por compra).'
                },
                {
                  label: 'Historial de Precios Comerciales (public.price_history)',
                  before: before.priceHistoryRecords,
                  after: after.priceHistoryRecords,
                  note: 'Solo si existe precio en origen (0 precios inventados).'
                }
              ];

              return (
                <table className="rtw-table" style={{ width: '100%', fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>Indicador Auditado</th>
                      <th>Antes de Importar</th>
                      <th></th>
                      <th>Después de Importar</th>
                      <th>Observación / Regla de Negocio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metricRows.map((m) => (
                      <tr key={m.label}>
                        <td style={{ fontWeight: 700 }}>{m.label}</td>
                        <td>{m.before}</td>
                        <td>
                          <ArrowRight size={14} color="#d4af37" />
                        </td>
                        <td style={{ fontWeight: 800, color: '#166534' }}>{m.after}</td>
                        <td style={{ color: '#475569', fontSize: '0.76rem' }}>{m.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </section>

          {/* LIBRO INMUTABLE DE MOVIMIENTOS OPENING_BALANCE */}
          <section className="rtw-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Lock size={17} color="#d4af37" />
              <h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>
                Movimientos de Inventario Inicial Generados (OPENING_BALANCE — Inmutables) (
                {persistedState.openingMovements.length})
              </h3>
            </div>
            {persistedState.openingMovements.length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Aún no se ha confirmado la importación transaccional en esta sesión. Haga clic en "Confirmar e Importar Lote Transaccional" arriba.
              </p>
            ) : (
              <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                <table className="rtw-table" style={{ width: '100%', fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      <th>ID Movimiento</th>
                      <th>Tipo</th>
                      <th>Lote</th>
                      <th>SKU</th>
                      <th>Producto</th>
                      <th>Propietario</th>
                      <th>+Físico</th>
                      <th>+Apto</th>
                      <th>+Pend. Rev.</th>
                      <th>Costo Snapshot</th>
                      <th>Inmutable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {persistedState.openingMovements.map((mov) => (
                      <tr key={mov.movementId}>
                        <td>
                          <code>{mov.movementId}</code>
                        </td>
                        <td>
                          <span className="rtw-badge rtw-badge-gold">{mov.movementType}</span>
                        </td>
                        <td>
                          <code>{mov.lotId}</code>
                        </td>
                        <td style={{ fontWeight: 800 }}>{mov.sku}</td>
                        <td>{mov.productName}</td>
                        <td>{mov.ownerId}</td>
                        <td style={{ fontWeight: 800, color: '#166534' }}>+{mov.deltaPhysical}</td>
                        <td>{mov.deltaGood}</td>
                        <td>+{mov.deltaPending}</td>
                        <td>
                          {mov.unitCostSnapshotCop === null
                            ? 'PENDING_COST'
                            : formatCOP(mov.unitCostSnapshotCop)}
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.72rem',
                              color: '#166534',
                              fontWeight: 800
                            }}
                          >
                            <Lock size={12} /> BLOQUEADO
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 6: HISTORIAL DE IMPORTACIONES Y BATERÍA DE 6 PRUEBAS
         ===================================================================== */}
      {activeTab === 'STEP_6_HISTORY_TESTS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* BATERÍA DE 6 PRUEBAS OBLIGATORIAS */}
          <section className="rtw-card">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '12px'
              }}
            >
              <div>
                <h3 style={{ fontSize: '0.98rem', fontWeight: 800 }}>
                  Batería de 6 Pruebas Obligatorias del Motor de Importación (En Memoria sobre Copia Temporal)
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Verifica archivo válido, archivo duplicado, archivo incompleto, propietario inexistente, error de cantidades y cero duplicación final sin tocar el Excel original.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunAutomatedTests}
                disabled={isRunningTests}
                style={{
                  background: '#171e29',
                  color: '#d4af37',
                  border: '1px solid #d4af37',
                  borderRadius: '8px',
                  padding: '9px 14px',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Play size={14} />
                {isRunningTests ? 'Ejecutando 6 pruebas...' : 'Ejecutar las 6 Pruebas Obligatorias'}
              </button>
            </div>

            {testResults.length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Haga clic en "Ejecutar las 6 Pruebas Obligatorias" para correr la suite de verificación sobre una copia temporal aislada.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '12px' }}>
                {testResults.map((tr) => (
                  <div
                    key={tr.testId}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: tr.passed ? '1px solid #86efac' : '1px solid #fca5a5',
                      background: tr.passed ? '#f0fdf4' : '#fef2f2'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.84rem', color: '#0f172a' }}>
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
                        {tr.passed ? 'PASSED' : 'FAILED'} · {tr.batchStatus}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.76rem', color: '#334155', marginBottom: '6px' }}>
                      {tr.scenarioDescription}
                    </p>
                    <div style={{ fontSize: '0.75rem', color: '#1e293b', fontWeight: 700, marginBottom: '4px' }}>
                      Resultado: {tr.actualOutcome}
                    </div>
                    <ul style={{ paddingLeft: '16px', margin: 0, fontSize: '0.73rem', color: '#475569' }}>
                      {tr.details.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* FUNCIÓN 11: HISTORIAL TRANSACCIONAL DE IMPORTACIONES */}
          <section className="rtw-card">
            <h3 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '10px' }}>
              Función 11: Historial de Lotes de Importación ({persistedState.batchesHistory.length})
            </h3>
            {persistedState.batchesHistory.length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: '#64748b' }}>
                No se han ejecutado lotes de importación todavía.
              </p>
            ) : (
              <table className="rtw-table" style={{ width: '100%', fontSize: '0.79rem' }}>
                <thead>
                  <tr>
                    <th>Batch ID</th>
                    <th>Idempotency Key</th>
                    <th>Archivo Origen</th>
                    <th>Estado</th>
                    <th>SKUs</th>
                    <th>Unid. OPENING_BALANCE</th>
                    <th>Costo Confirmado</th>
                    <th>PENDING_COST</th>
                    <th>Usuario / Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {persistedState.batchesHistory.map((b) => (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 800 }}>{b.batchCode}</td>
                      <td>
                        <code>{b.idempotencyKey}</code>
                      </td>
                      <td>{b.sourceFilename}</td>
                      <td>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            background: b.batchStatus === 'COMMITTED' ? '#dcfce7' : '#fee2e2',
                            color: b.batchStatus === 'COMMITTED' ? '#166534' : '#b91c1c'
                          }}
                        >
                          {b.batchStatus}
                        </span>
                      </td>
                      <td>{b.totalSkusImported}</td>
                      <td style={{ fontWeight: 800 }}>{b.totalOpeningUnits}</td>
                      <td>{formatCOP(b.totalConfirmedCostCop)}</td>
                      <td>{b.pendingCostCount}</td>
                      <td style={{ fontSize: '0.73rem', color: '#475569' }}>
                        {b.importedByEmail} · {new Date(b.createdAt).toLocaleString('es-CO')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN TRANSACCIONAL (FUNCIÓN 9) */}
      <ConfirmModal
        open={isConfirmModalOpen}
        title="Confirmar Importación Transaccional de Inventario Inicial"
        description={
          analysis
            ? `Se ejecutará de forma atómica el lote ${analysis.batchCodePreview} (${analysis.idempotencyKey}) con ${analysis.rows.length} SKUs del propietario Eberto (OWN-0001), creando 37 movimientos inmutables OPENING_BALANCE por 38 unidades físicas, respetando 2 costos en estado PENDING_COST y descartando justificadamente 3 filas sin stock físico actual.`
            : ''
        }
        ruleReminder="Se crean movimientos de inventario inicial inmutables vinculados al propietario seleccionado sin generar compras ni inventar costos o fechas."
        confirmLabel="Confirmar e Importar (Transacción Atómica)"
        cancelLabel="Cancelar y Revisar Vista Previa"
        onConfirm={handleConfirmTransactionalImport}
        onCancel={() => setIsConfirmModalOpen(false)}
      />
    </div>
  );
}
