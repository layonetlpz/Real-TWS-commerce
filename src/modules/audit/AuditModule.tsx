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
import { GlassCard, GlassDisclosure, ModuleHeader, StatCard } from '../../components/glass';
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
        <span style={{ fontSize: '0.8rem', color: 'var(--rtw-text-secondary)' }}>
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
          <code style={{ color: 'var(--rtw-text-secondary)' }}>{row.dbEnforcementLayer}</code>
        </div>
      )
    }
  ];

  return (
    <div className="module-container">
      <ModuleHeader
        variant="dark"
        eyebrow="GESTIÓN · TRAZABILIDAD"
        title="Auditoría de Operaciones"
        subtitle="Registro cronológico inmutable de movimientos críticos y eventos de seguridad."
        badge={<span className="rtw-badge rtw-badge-gold">Solo Admin</span>}
        actions={
          <button
            type="button"
            className="rtw-btn rtw-btn-ghost-dark btn-sm"
            disabled={loadingDb}
            onClick={() => void loadDbAuditLogs()}
          >
            <RefreshCw size={14} className={loadingDb ? 'rtw-spin' : undefined} />
            {loadingDb ? 'Actualizando...' : 'Actualizar'}
          </button>
        }
      />

      <section className="rtw-kpi-grid">
        <StatCard
          staggerIndex={1}
          label="Registros en bitácora"
          value={filteredDbLogs.length}
          sub="Consultados en base de datos"
          icon={<FileSearch size={16} />}
        />
        <StatCard
          staggerIndex={2}
          tone="gold"
          label="Protección"
          value="Inmutable"
          sub="Sin edición ni borrado"
          icon={<Lock size={16} />}
        />
        <StatCard
          staggerIndex={3}
          tone="success"
          label="Eventos de sesión"
          value={securityEvents.length}
          sub="Validaciones de acceso"
          icon={<ShieldCheck size={16} />}
        />
      </section>

      {dbError && (
        <ErrorState
          message={`No se pudo consultar la bitácora: ${dbError}`}
          onRetry={() => void loadDbAuditLogs()}
        />
      )}

      <GlassCard>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '12px' }}>
          Historial de cambios ({filteredDbLogs.length})
        </h3>

        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={tableFilter}
          onStatusFilterChange={setTableFilter}
          placeholder="Buscar acción, tabla, registro o motivo..."
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
          emptyTitle="Sin registros en bitácora"
          emptyDescription="Los movimientos críticos y cambios administrativos aparecerán aquí automáticamente."
        />
      </GlassCard>

      <GlassDisclosure
        title={`Eventos de seguridad en sesión (${securityEvents.length})`}
        subtitle="Pruebas y validaciones de acceso evaluadas durante tu sesión actual."
        icon={<ShieldCheck size={16} />}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '12px 0' }}>
          <button
            type="button"
            className="rtw-btn rtw-btn-primary btn-sm"
            onClick={handleGenerateAuditProof}
          >
            <Play size={14} />
            Ejecutar verificación de bloqueos
          </button>
        </div>

        <DataTable
          columns={sessionColumns}
          data={securityEvents}
          rowKey={(row) => row.id}
          pageSize={8}
          mobileTitle={(row) => `${row.eventType} · ${row.outcome}`}
          emptyTitle="Sin eventos en esta sesión"
          emptyDescription="Ejecuta una verificación si deseas probar las reglas de seguridad."
        />
      </GlassDisclosure>
    </div>
  );
}
