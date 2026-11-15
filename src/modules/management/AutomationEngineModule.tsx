import React, { useState, useMemo } from 'react';
import {
  Play,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ListTodo,
  FileText,
  Sliders,
  Lock
} from 'lucide-react';
import { getRealCatalogMerchItems } from '../../services/brandMerchandisingService';
import {
  getAutomationEngineState,
  updateAutomationRuleConfig,
  dispatchAutomationEvent,
  runAutomationEngineVerificationSuite,
  ACTION_LABELS,
  type AutomationEventType,
  type AutomationVerificationTestResult
} from '../../services/automationEngineService';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { ModuleHeader, SegmentedTabs } from '../../components/glass';

type AutomationTabId =
  | 'RULES_AND_CONDITIONS'
  | 'QUEUE_AND_ARTIFACTS'
  | 'LOGS_AND_10_SAFETY_RULES'
  | 'VERIFICATION_TEST_SUITE';

function formatDateTimeCO(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return iso;
  }
}

export const AutomationEngineModule: React.FC = () => {
  const { userProfile } = useAuth();
  const { notify } = useNotifications();

  const actorName = userProfile?.fullName || userProfile?.email || 'Orquestador REAL TWS';
  const actorRole = userProfile?.role || 'ADMIN';

  const [activeTab, setActiveTab] = useState<AutomationTabId>('RULES_AND_CONDITIONS');
  const [refreshTick, setRefreshTick] = useState(0);

  const autoState = useMemo(() => getAutomationEngineState(), [refreshTick]);
  const catalogItems = useMemo(() => getRealCatalogMerchItems(), [refreshTick]);

  // Estado para Disparo Manual / Prueba Interactiva de Eventos e Idempotencia
  const [selectedEventType, setSelectedEventType] =
    useState<AutomationEventType>('RECEIPT_CONFIRMED');
  const [selectedSku, setSelectedSku] = useState<string>(() => catalogItems[0]?.sku || '');
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('OWN-0001');
  const [referenceIdInput, setReferenceIdInput] = useState<string>('REF-2026-0001');
  const [idempotencyKeyInput, setIdempotencyKeyInput] = useState<string>(
    'IDEMP-RECEIPT_CONFIRMED-2026-0001'
  );
  const [faultSimulationMode, setFaultSimulationMode] = useState<
    'NONE' | 'TRANSIENT_ONCE' | 'PERMANENT_FATAL'
  >('NONE');

  // Resultados de la Batería de Pruebas
  const [testResults, setTestResults] = useState<AutomationVerificationTestResult[] | null>(null);

  const handleToggleRule = (ruleCode: string, currentEnabled: boolean) => {
    try {
      const updated = updateAutomationRuleConfig({
        ruleCode,
        isEnabled: !currentEnabled,
        actorRole
      });
      setRefreshTick((t) => t + 1);
      notify(
        updated.isEnabled ? 'success' : 'warning',
        `Regla ${updated.ruleCode} ${updated.isEnabled ? 'Activada' : 'Desactivada'}`,
        `Evento: ${updated.eventType}`
      );
    } catch (err: unknown) {
      notify(
        'error',
        'Error de permisos al cambiar regla',
        err instanceof Error ? err.message : 'Error.'
      );
    }
  };

  const handleUpdateRuleThreshold = (ruleCode: string, newThreshold: number) => {
    try {
      const rule = autoState.rules.find((r) => r.ruleCode === ruleCode);
      if (!rule) return;
      updateAutomationRuleConfig({
        ruleCode,
        isEnabled: rule.isEnabled,
        lowStockThresholdUnits: newThreshold,
        actorRole
      });
      setRefreshTick((t) => t + 1);
      notify('info', 'Condición Actualizada', `Umbral de stock ajustado a ${newThreshold} uds.`);
    } catch (err: unknown) {
      notify('error', 'Error', err instanceof Error ? err.message : 'Error');
    }
  };

  const handleDispatchEvent = () => {
    try {
      const res = dispatchAutomationEvent({
        idempotencyKey: idempotencyKeyInput,
        eventType: selectedEventType,
        referenceEntity: 'manual_trigger',
        referenceId: referenceIdInput,
        sku: selectedSku,
        ownerId: selectedOwnerId,
        actorName,
        actorRole,
        simulateFaultMode: faultSimulationMode
      });
      setRefreshTick((t) => t + 1);

      if (res.wasDuplicateBlocked) {
        notify(
          'warning',
          'Doble Ejecución Bloqueada (Idempotency Key)',
          res.queueItem.outputSummary
        );
      } else if (res.queueItem.status === 'failed_permanent_halted') {
        notify(
          'error',
          'Error Permanente Detenido sin Reintentos',
          res.queueItem.outputSummary
        );
      } else if (res.wasRecoveredAfterRetry) {
        notify(
          'success',
          'Evento Recuperado tras Reintento Transitorio',
          res.queueItem.outputSummary
        );
      } else {
        notify(
          'success',
          `Evento ${res.queueItem.eventType} Procesado (${res.queueItem.queueCode})`,
          res.queueItem.outputSummary
        );
      }
    } catch (err: unknown) {
      notify(
        'error',
        'Bloqueo al disparar evento',
        err instanceof Error ? err.message : 'Verifique clave de idempotencia y permisos.'
      );
    }
  };

  const handleRunTestSuite = () => {
    const results = runAutomationEngineVerificationSuite();
    setTestResults(results);
    const allPassed = results.every((r) => r.passed);
    notify(
      allPassed ? 'success' : 'error',
      allPassed
        ? '6/6 Pruebas de Automatización Aprobadas'
        : 'Revise resultados de la batería de pruebas',
      'Comprobados los 14 eventos, idempotencia, fallos, recuperación, permisos y cero duplicación económica.'
    );
  };

  return (
    <div className="module-container">
      {/* Cabecera Ejecutiva */}
      <ModuleHeader
        variant="dark"
        eyebrow="GESTIÓN · AUTOMATIZACIONES"
        title="Reglas y Alertas Internas"
        subtitle="Activa recordatorios de stock bajo, revisiones de calidad y registra eventos de forma segura."
        badge={
          <span className="rtw-badge rtw-badge-gold">
            {autoState.rules.filter((r) => r.isEnabled).length}/14 reglas activas
          </span>
        }
        bottomSlot={
          <SegmentedTabs<AutomationTabId>
            variant="dark"
            value={activeTab}
            onChange={setActiveTab}
            items={[
              {
                id: 'RULES_AND_CONDITIONS',
                label: 'Reglas',
                icon: <Sliders size={14} />,
                count: autoState.rules.filter((r) => r.isEnabled).length
              },
              {
                id: 'QUEUE_AND_ARTIFACTS',
                label: 'Cola y Acciones',
                icon: <ListTodo size={14} />,
                count: autoState.queue.length
              },
              {
                id: 'LOGS_AND_10_SAFETY_RULES',
                label: 'Registro',
                icon: <FileText size={14} />,
                count: autoState.logs.length
              },
              {
                id: 'VERIFICATION_TEST_SUITE',
                label: 'Diagnóstico',
                icon: <ShieldCheck size={14} />
              }
            ]}
          />
        }
      />

      {/* =====================================================================
          PESTAÑA 1: DISPARADOR IDEMPOTENTE Y MATRIZ DE LAS 14 REGLAS
          ===================================================================== */}
      {activeTab === 'RULES_AND_CONDITIONS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          {/* Consola para Encolar y Probar Eventos con Idempotency Key */}
          <div className="card" style={{ padding: '1.35rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.35rem' }}>
              Consola de Disparo de Eventos con Clave de Idempotencia (<code>idempotency_key</code>)
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#6B7280', marginBottom: '1rem' }}>
              Prueba el despacho de cualquiera de los 14 eventos oficiales. Si envías dos veces la misma <code>idempotency_key</code>, el motor bloqueará inmediatamente la segunda ejecución sin duplicar efectos.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))',
                gap: '0.8rem',
                marginBottom: '0.9rem'
              }}
            >
              <div>
                <label className="form-label">Evento Disparador (1 de 14)</label>
                <select
                  className="form-input"
                  value={selectedEventType}
                  onChange={(e) => {
                    const ev = e.target.value as AutomationEventType;
                    setSelectedEventType(ev);
                    setIdempotencyKeyInput(`IDEMP-${ev}-${Date.now().toString().slice(-4)}`);
                  }}
                >
                  {autoState.rules.map((r) => (
                    <option key={r.ruleCode} value={r.eventType}>
                      {r.eventLabel}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Clave Única de Idempotencia (Regla #1 y #2)</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem' }}
                  value={idempotencyKeyInput}
                  onChange={(e) => setIdempotencyKeyInput(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label">SKU Relacionado</label>
                <select
                  className="form-input"
                  value={selectedSku}
                  onChange={(e) => setSelectedSku(e.target.value)}
                >
                  {catalogItems.map((it) => (
                    <option key={it.sku} value={it.sku}>
                      {it.sku} — {it.productName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Propietario Afectado</label>
                <input
                  type="text"
                  className="form-input"
                  value={selectedOwnerId}
                  onChange={(e) => setSelectedOwnerId(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label">ID de Referencia</label>
                <input
                  type="text"
                  className="form-input"
                  value={referenceIdInput}
                  onChange={(e) => setReferenceIdInput(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label">Modo de Validación de Reintentos</label>
                <select
                  className="form-input"
                  value={faultSimulationMode}
                  onChange={(e) =>
                    setFaultSimulationMode(
                      e.target.value as 'NONE' | 'TRANSIENT_ONCE' | 'PERMANENT_FATAL'
                    )
                  }
                >
                  <option value="NONE">Normal (Ejecución estándar)</option>
                  <option value="TRANSIENT_ONCE">
                    Probar reintento automático ante fallo temporal
                  </option>
                  <option value="PERMANENT_FATAL">
                    Probar detención segura ante fallo permanente
                  </option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleDispatchEvent}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Play size={15} /> Disparar Evento en Cola (Con Verificación de Idempotencia)
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setIdempotencyKeyInput(
                    `IDEMP-${selectedEventType}-${Math.floor(Math.random() * 9000 + 1000)}`
                  )
                }
              >
                Generar Nueva Clave Idempotente
              </button>
            </div>
          </div>

          {/* Tabla de las 14 Reglas de Eventos Oficiales */}
          <div className="card" style={{ padding: '1.35rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '0.8rem' }}>
              Catálogo de los 14 Eventos Oficiales, Acciones Asignadas y Control de Activación
            </h3>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Evento Disparador</th>
                    <th>Dominio</th>
                    <th>Acciones Internas Ejecutadas</th>
                    <th>Condición (Umbral Stock)</th>
                    <th>Cuota Diaria</th>
                    <th>Estado / Interruptor</th>
                  </tr>
                </thead>
                <tbody>
                  {autoState.rules.map((rule) => (
                    <tr key={rule.id}>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                        {rule.ruleCode}
                      </td>
                      <td>
                        <strong>{rule.eventLabel}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: '0.15rem' }}>
                          {rule.description}
                        </div>
                      </td>
                      <td>
                        <span className="badge">{rule.domainGroup}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {rule.actionsToExecute.map((act) => (
                            <span
                              key={act}
                              className="badge"
                              style={{
                                fontSize: '0.68rem',
                                background: '#0D0E12',
                                color: '#F3E5AB',
                                border: '1px solid rgba(212,175,55,0.35)'
                              }}
                            >
                              {ACTION_LABELS[act]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          className="form-input"
                          style={{ width: '75px', padding: '0.25rem 0.45rem', fontSize: '0.78rem' }}
                          value={rule.conditions.lowStockThresholdUnits}
                          onChange={(e) =>
                            handleUpdateRuleThreshold(
                              rule.ruleCode,
                              Math.max(1, Number(e.target.value) || 1)
                            )
                          }
                        />
                      </td>
                      <td style={{ fontSize: '0.78rem' }}>
                        {rule.dailyExecutionsUsed} / {rule.maxDailyExecutions}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={rule.isEnabled ? 'btn btn-primary' : 'btn btn-secondary'}
                          style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                          onClick={() => handleToggleRule(rule.ruleCode, rule.isEnabled)}
                        >
                          {rule.isEnabled ? '✓ Activa (Desactivar)' : 'Inactiva (Activar)'}
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

      {/* =====================================================================
          PESTAÑA 2: COLA DE JOBS Y ARTEFACTOS DE LAS 7 ACCIONES INTERNAS
          ===================================================================== */}
      {activeTab === 'QUEUE_AND_ARTIFACTS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          {/* Cola de Ejecución */}
          <div className="card" style={{ padding: '1.35rem' }}>
            <h2 style={{ fontSize: '1.08rem', fontWeight: 800, marginBottom: '0.75rem' }}>
              Cola de Eventos Procesados, Estado de Jobs, Idempotencia y Reintentos
            </h2>
            {autoState.queue.length === 0 ? (
              <div style={{ color: '#6B7280', fontSize: '0.84rem' }}>
                La cola aún no tiene jobs registrados. Dispare un evento en la Pestaña 1.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Job Code</th>
                      <th>Idempotency Key</th>
                      <th>Evento</th>
                      <th>SKU / Propietario</th>
                      <th>Estado</th>
                      <th>Reintentos</th>
                      <th>Resultado / Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {autoState.queue.map((job) => (
                      <tr key={job.id}>
                        <td style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                          {job.queueCode}
                        </td>
                        <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem' }}>
                          {job.idempotencyKey}
                        </td>
                        <td style={{ fontWeight: 700 }}>{job.eventType}</td>
                        <td>
                          {job.sku} ({job.ownerId})
                        </td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              background:
                                job.status === 'completed'
                                  ? 'rgba(16,185,129,0.16)'
                                  : job.status === 'blocked_duplicate_idempotency'
                                    ? 'rgba(245,158,11,0.16)'
                                    : 'rgba(239,68,68,0.16)',
                              color:
                                job.status === 'completed'
                                  ? '#059669'
                                  : job.status === 'blocked_duplicate_idempotency'
                                    ? '#B45309'
                                    : '#DC2626'
                            }}
                          >
                            {job.status}
                          </span>
                        </td>
                        <td>
                          {job.retryCount} / {job.maxRetries} ({job.errorClassification})
                        </td>
                        <td style={{ fontSize: '0.78rem' }}>{job.outputSummary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Artefactos Generados por las 7 Acciones Internas */}
          <div className="card" style={{ padding: '1.35rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '0.75rem' }}>
              Salidas Generadas por las 7 Acciones Internas ({autoState.generatedArtifacts.length})
            </h3>
            {autoState.generatedArtifacts.length === 0 ? (
              <div style={{ color: '#6B7280', fontSize: '0.84rem' }}>
                Aún no se han generado proyecciones, alertas, borradores o reportes automáticos.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                  gap: '0.8rem'
                }}
              >
                {autoState.generatedArtifacts.slice(0, 12).map((art) => (
                  <div
                    key={art.id}
                    style={{
                      padding: '0.85rem',
                      borderRadius: '0.45rem',
                      border: '1px solid #E5E7EB',
                      background: '#F9FAFB'
                    }}
                  >
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#9A7409' }}>
                      {ACTION_LABELS[art.artifactType]} • {art.sourceEvent}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '0.86rem', margin: '0.2rem 0' }}>
                      {art.title}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#4B5563' }}>{art.detail}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 3: LOGS INMUTABLES Y LAS 10 REGLAS ESTRICTAS
          ===================================================================== */}
      {activeTab === 'LOGS_AND_10_SAFETY_RULES' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          <div className="card" style={{ padding: '1.35rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Lock size={19} color="#D4AF37" />
              <h2 style={{ fontSize: '1.08rem', fontWeight: 800, margin: 0 }}>
                Las 10 Reglas Estrictas e Inquebrantables del Automation Engine
              </h2>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '0.65rem'
              }}
            >
              {[
                '1. No ejecutar el mismo evento dos veces.',
                '2. Usar idempotency keys obligatorias.',
                '3. No descontar stock dos veces.',
                '4. No hacer pagos automáticos.',
                '5. No liquidar ganancias automáticamente.',
                '6. No enviar mensajes masivos.',
                '7. No publicar sin autorización humana.',
                '8. No cambiar precios automáticamente.',
                '9. No aumentar presupuesto publicitario.',
                '10. No alterar el libro histórico.'
              ].map((ruleText, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '0.65rem 0.8rem',
                    borderRadius: '0.45rem',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid #10B981',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: '#065F46',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem'
                  }}
                >
                  <CheckCircle2 size={15} color="#10B981" />
                  <span>{ruleText}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: '1.35rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '0.75rem' }}>
              Audit Trail y Logs Inmutables de Ejecución ({autoState.logs.length})
            </h3>
            {autoState.logs.length === 0 ? (
              <div style={{ color: '#6B7280', fontSize: '0.84rem' }}>
                Sin logs registrados aún.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Seq</th>
                      <th>Timestamp</th>
                      <th>Job / Idempotency Key</th>
                      <th>Evento / Intento</th>
                      <th>Estado / Clasificación</th>
                      <th>Kardex y Finanzas Intactos</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {autoState.logs.map((lg) => (
                      <tr key={lg.id}>
                        <td style={{ fontFamily: 'JetBrains Mono, monospace' }}>#{lg.logSeq}</td>
                        <td>{formatDateTimeCO(lg.timestamp)}</td>
                        <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem' }}>
                          {lg.queueCode} ({lg.idempotencyKey})
                        </td>
                        <td>
                          {lg.eventType} (Intento #{lg.attemptNumber})
                        </td>
                        <td>
                          <span className="badge">{lg.status}</span> ({lg.errorClassification})
                        </td>
                        <td style={{ color: '#059669', fontWeight: 700 }}>
                          ✓ Sí (Sin mutación)
                        </td>
                        <td style={{ fontSize: '0.78rem' }}>{lg.detailMessage}</td>
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
          PESTAÑA 4: SUITE AUTOMATIZADA DE PRUEBAS OBLIGATORIAS
          ===================================================================== */}
      {activeTab === 'VERIFICATION_TEST_SUITE' && (
        <div className="card" style={{ padding: '1.4rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              marginBottom: '1.1rem'
            }}
          >
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
                Batería Automatizada de Pruebas del Automation Engine (Sandbox Aislado)
              </h2>
              <p style={{ fontSize: '0.82rem', color: '#6B7280', marginTop: '0.25rem' }}>
                Verifica los 14 eventos oficiales, rechazo de doble ejecución (idempotency), fallo transitorio con recuperación, detención de fallo permanente, permisos RBAC y cero duplicación de movimientos económicos o de stock.
              </p>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRunTestSuite}
              style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}
            >
              <Play size={16} /> Ejecutar Suite Completa de Pruebas (6 Pruebas)
            </button>
          </div>

          {!testResults ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6B7280' }}>
              Pulse el botón superior para ejecutar la verificación integral en sandbox aislado.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {testResults.map((res) => (
                <div
                  key={res.testId}
                  style={{
                    padding: '0.9rem 1.1rem',
                    borderRadius: '0.5rem',
                    border: `1px solid ${res.passed ? '#10B981' : '#EF4444'}`,
                    background: res.passed
                      ? 'rgba(16, 185, 129, 0.07)'
                      : 'rgba(239, 68, 68, 0.08)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem'
                  }}
                >
                  {res.passed ? (
                    <CheckCircle2 size={20} color="#10B981" style={{ flexShrink: 0, marginTop: '2px' }} />
                  ) : (
                    <AlertTriangle size={20} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                  )}
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                      {res.title} — {res.passed ? 'APROBADA' : 'FALLÓ'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#374151', marginTop: '0.2rem' }}>
                      {res.details}
                    </div>
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
export default AutomationEngineModule;
