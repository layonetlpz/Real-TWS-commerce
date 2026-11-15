import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSearch, Lock, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { runMandatorySecurityTests } from '../../services/authService';
import {
  fetchLiveAuditLogsFromSupabase,
  type DbAuditLogRow
} from '../../services/supabaseDataBridge';
import { DataTable } from '../../components/DataTable';
import { FilterBar } from '../../components/FilterBar';
import { ErrorState } from '../../components/StatusStates';
import type { SecurityAuditEvent, TableColumn } from '../../types/domain';

export function AuditModule() {
  const { securityEvents, appendSecurityEvents } = useAuth();
  const { notify } = useNotifications();

  const [dbLogs, setDbLogs] = useState<DbAuditLogRow[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tableFilter, setTableFilter] = useState('ALL');

  const loadDbAuditLogs = useCallback(async () => {
    setLoadingDb(true);
    setDbError(null);
    const { data, error } = await fetchLiveAuditLogsFromSupabase(150);
    if (error) {
      setDbError(error);
    } else {
      setDbLogs(data);
    }
    setLoadingDb(false);
  }, []);

  useEffect(() => {
    void loadDbAuditLogs();
  }, [loadDbAuditLogs]);

  const handleGenerateAuditProof = () => {
    const suite = runMandatorySecurityTests();
    appendSecurityEvents(suite.generatedAuditEvents);
    notify(
      'success',
      'Eventos de Auditoría Registrados',
      'Se ejecutaron las verificaciones de bloqueo RBAC/RLS en la sesión.'
    );
  };

  const uniqueTables = useMemo(
    () => Array.from(new Set(dbLogs.map((l) => l.table_name))).sort(),
    [dbLogs]
  );

  const filteredDbLogs = useMemo(() => {
    return dbLogs.filter((row) => {
      if (tableFilter !== 'ALL' && row.table_name !== tableFilter) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return (
          row.action_type.toLowerCase().includes(q) ||
          row.table_name.toLowerCase().includes(q) ||
          row.record_pk.toLowerCase().includes(q) ||
          (row.reason ?? '').toLowerCase().includes(q) ||
          (row.owner_id_affected ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [dbLogs, searchQuery, tableFilter]);

  const dbColumns: TableColumn<DbAuditLogRow>[] = [
    {
      key: 'seq',
      header: '#',
      sortValue: (row) => row.audit_seq,
      render: (row) => <span className="rtw-mono">{row.audit_seq}</span>
    },
    {
      key: 'created_at',
      header: 'Fecha y Hora',
      sortValue: (row) => row.created_at,
      render: (row) => new Date(row.created_at).toLocaleString('es-CO')
    },
    {
      key: 'action_type',
      header: 'Acción',
      sortValue: (row) => row.action_type,
      render: (row) => <span className="rtw-badge rtw-badge-gold">{row.action_type}</span>
    },
    {
      key: 'table_name',
      header: 'Tabla / Entidad',
      sortValue: (row) => row.table_name,
      render: (row) => <code className="rtw-mono">{row.table_name}</code>
    },
    {
      key: 'record_pk',
      header: 'Registro',
      sortValue: (row) => row.record_pk,
      render: (row) => <span className="rtw-mono">{row.record_pk}</span>
    },
    {
      key: 'owner',
      header: 'Propietario',
      sortValue: (row) => row.owner_id_affected ?? '',
      render: (row) => row.owner_id_affected ?? 'Global'
    },
    {
      key: 'reason',
      header: 'Detalle / Motivo',
      render: (row) => (
        <span style={{ fontSize: '0.8rem', color: '#334155' }}>
          {row.reason || 'Registro automático por trigger PostgreSQL'}
        </span>
      )
    }
  ];

  const sessionColumns: TableColumn<SecurityAuditEvent>[] = [
    {
      key: 'time',
      header: 'Hora',
      render: (row) => <code className="rtw-mono">{row.timestamp}</code>
    },
    {
      key: 'actor',
      header: 'Actor Evaluado',
      render: (row) => (
        <span className="rtw-badge rtw-badge-gold">{row.actorRole}</span>
      )
    },
    {
      key: 'event',
      header: 'Evento de Seguridad',
      render: (row) => <strong>{row.eventType}</strong>
    },
    {
      key: 'resource',
      header: 'Recurso Objetivo',
      render: (row) => <span style={{ fontSize: '0.8rem' }}>{row.targetResource}</span>
    },
    {
      key: 'outcome',
      header: 'Resultado',
      render: (row) => (
        <span
          className={`rtw-badge ${
            row.outcome === 'BLOCKED' ? 'rtw-badge-danger' : 'rtw-badge-success'
          }`}
        >
          {row.outcome}
        </span>
      )
    },
    {
      key: 'layer',
      header: 'Regla Aplicada en Servidor / RLS',
      render: (row) => (
        <div style={{ fontSize: '0.78rem' }}>
          <div>{row.reason}</div>
          <code style={{ color: '#475569' }}>{row.dbEnforcementLayer}</code>
        </div>
      )
    }
  ];

  return (
    <div className="module-container">
      <div
        className="rtw-card rtw-card-gold-top"
        style={{
          background: 'linear-gradient(135deg, #0f141c 0%, #171e29 100%)',
          color: '#f8fafc',
          marginBottom: 0
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <FileSearch size={20} color="#d4af37" />
              <span className="rtw-badge rtw-badge-gold">
                BITÁCORA INMUTABLE — EXCLUSIVO ADMIN
              </span>
            </div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#d4af37' }}>
              Auditoría de Operaciones y Eventos de Seguridad
            </h2>
            <p style={{ fontSize: '0.84rem', color: '#cbd5e1' }}>
              Consulta histórica directa en <code>public.audit_logs</code> (protegida contra modificación o borrado) y trazabilidad de bloqueos de seguridad.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="rtw-btn rtw-btn-outline btn-sm"
              onClick={() => void loadDbAuditLogs()}
            >
              <RefreshCw size={14} />
              Actualizar Bitácora
            </button>
            <button
              type="button"
              className="rtw-btn rtw-btn-primary btn-sm"
              onClick={handleGenerateAuditProof}
            >
              <Play size={14} />
              Ejecutar Pruebas de Bloqueo
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px'
        }}
      >
        <div className="rtw-card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Lock size={18} color="#d4af37" />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>
              Triggers Inmutables en PostgreSQL
            </h3>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#475569' }}>
            Cambios críticos en acuerdos, asignaciones por lote, transferencias, perfiles y liquidaciones registran instantáneamente su estado previo y posterior.
          </p>
        </div>

        <div className="rtw-card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <ShieldCheck size={18} color="#166534" />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>
              Control de Acceso y Seguridad RLS
            </h3>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#475569' }}>
            Solo usuarios con rol <code>ADMIN</code> pueden leer esta bitácora; la base de datos bloquea cualquier intento de alteración o eliminación.
          </p>
        </div>
      </div>

      {dbError && (
        <ErrorState
          message={`No se pudo consultar public.audit_logs: ${dbError}`}
          onRetry={() => void loadDbAuditLogs()}
        />
      )}

      <section className="rtw-card" style={{ marginBottom: 0 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '12px' }}>
          Registros Históricos en Base de Datos ({filteredDbLogs.length})
        </h3>

        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={tableFilter}
          onStatusFilterChange={setTableFilter}
          placeholder="Buscar por acción, tabla, registro, propietario o motivo..."
          statusOptions={[
            { value: 'ALL', label: 'Todas las tablas' },
            ...uniqueTables.map((t) => ({ value: t, label: t }))
          ]}
          onReset={() => {
            setSearchQuery('');
            setTableFilter('ALL');
          }}
        />

        <DataTable
          columns={dbColumns}
          data={filteredDbLogs}
          rowKey={(row) => row.id}
          loading={loadingDb}
          pageSize={12}
          mobileTitle={(row) => `${row.action_type} · ${row.table_name}`}
          emptyTitle="Sin registros en bitácora todavía"
          emptyDescription="Los movimientos críticos y cambios administrativos aparecerán aquí automáticamente."
        />
      </section>

      <section className="rtw-card" style={{ marginBottom: 0 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '12px' }}>
          Eventos de Guardia Evaluados en Sesión ({securityEvents.length})
        </h3>

        <DataTable
          columns={sessionColumns}
          data={securityEvents}
          rowKey={(row) => row.id}
          pageSize={8}
          mobileTitle={(row) => `${row.eventType} · ${row.outcome}`}
          emptyTitle="Sin eventos de bloqueo en la sesión actual"
          emptyDescription="Pulsa 'Ejecutar Pruebas de Bloqueo' o evalúa un acceso restringido para visualizar las guardias activas."
        />
      </section>
    </div>
  );
}
