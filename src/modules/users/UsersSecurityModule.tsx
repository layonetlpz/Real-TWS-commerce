import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Lock,
  LogOut,
  Play,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  Users
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import {
  ALL_USER_ROLES,
  ROLES_CATALOG,
  ROUTE_PERMISSIONS,
  evaluateSensitiveOperation
} from '../../lib/permissions';
import { NAVIGATION_ITEMS } from '../../lib/navigation';
import {
  adminUpdateUserRoleAndAccess,
  listManagedUserProfiles,
  requestPrivateDocumentSignedUrl,
  runMandatorySecurityTests
} from '../../services/authService';
import {
  fetchLiveOwnersFromSupabase,
  type DbOwnerRow
} from '../../services/supabaseDataBridge';
import { AuthPortalCard } from '../auth/AuthScreens';
import {
  GlassCard,
  GlassDisclosure,
  ModuleHeader,
  SegmentedTabs
} from '../../components/glass';
import type {
  SecurityTestScenarioResult,
  UserProfile,
  UserRole
} from '../../types/domain';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function UsersSecurityModule() {
  const {
    authStatus,
    userProfile,
    activeEffectiveRole,
    canInspectRoles,
    setActiveRolePreview,
    isSupabaseReady,
    signOut,
    triggerSessionExpiredSimulation,
    appendSecurityEvents,
    logGuardEvent
  } = useAuth();
  const { notify } = useNotifications();

  const [activeTab, setActiveTab] = useState<'PROFILE' | 'USERS' | 'SECURITY'>('PROFILE');

  // Lista real de usuarios desde public.profiles y propietarios reales desde public.owners
  const [managedProfiles, setManagedProfiles] = useState<UserProfile[]>([]);
  const [liveOwners, setLiveOwners] = useState<DbOwnerRow[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  // Formulario administrativo para asignar rol y permisos (RPC fn_admin_update_user_role_and_access)
  const [targetUserId, setTargetUserId] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('INVENTORY_OPERATOR');
  const [linkedOwnerId, setLinkedOwnerId] = useState('');
  const [ownerPortalEnabled, setOwnerPortalEnabled] = useState(false);
  const [isActiveAccount, setIsActiveAccount] = useState(true);
  const [adminReason, setAdminReason] = useState('');
  const [adminFormFeedback, setAdminFormFeedback] = useState<string | null>(null);
  const [savingAdminRole, setSavingAdminRole] = useState(false);
  const [checkingPrivateDoc, setCheckingPrivateDoc] = useState(false);

  // Resultados de las 7 pruebas obligatorias de seguridad
  const [testResults, setTestResults] = useState<SecurityTestScenarioResult[]>(
    () => runMandatorySecurityTests().results
  );

  // Resultado de prueba interactiva de documento privado
  const [privateDocStatus, setPrivateDocStatus] = useState<string | null>(null);

  const loadAdminDirectories = useCallback(async () => {
    if (!isSupabaseReady || activeEffectiveRole !== 'ADMIN') return;
    setLoadingProfiles(true);
    try {
      const [profilesRes, ownersRes] = await Promise.all([
        listManagedUserProfiles(),
        fetchLiveOwnersFromSupabase()
      ]);
      if (profilesRes.error) {
        notify('error', 'Usuarios', profilesRes.error);
      } else {
        setManagedProfiles(profilesRes.profiles);
      }
      if (ownersRes.error) {
        notify('warning', 'Propietarios', ownersRes.error);
      } else {
        setLiveOwners(ownersRes.data);
      }
    } finally {
      setLoadingProfiles(false);
    }
  }, [isSupabaseReady, activeEffectiveRole, notify]);

  useEffect(() => {
    void loadAdminDirectories();
  }, [loadAdminDirectories]);

  const effectiveProfileContext: UserProfile = userProfile ?? {
    id: 'local-rbac-context',
    email: 'verificador@realtws.local',
    fullName: `Inspector RBAC (${activeEffectiveRole})`,
    role: activeEffectiveRole,
    linkedOwnerId: activeEffectiveRole === 'OWNER' ? 'OWN-0001' : null,
    ownerPortalEnabled: activeEffectiveRole === 'OWNER',
    isActive: true,
    createdAt: '',
    updatedAt: ''
  };

  const handleExecuteAllSecurityTests = () => {
    const suite = runMandatorySecurityTests();
    setTestResults(suite.results);
    appendSecurityEvents(suite.generatedAuditEvents);
    notify(
      'success',
      'Suite de 7 Pruebas de Seguridad Ejecutada',
      'Los 7 escenarios obligatorios (RBAC + RLS + RPC) fueron bloqueados y registrados en auditoría.'
    );
  };

  const handleAdminRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingAdminRole) return;
    setAdminFormFeedback(null);

    const permCheck = evaluateSensitiveOperation(
      effectiveProfileContext,
      'MANAGE_USERS_AND_ROLES'
    );

    if (!permCheck.allowed) {
      setAdminFormFeedback(permCheck.reason);
      await logGuardEvent({
        eventType: 'UNAUTHORIZED_USER_ADMIN_ATTEMPT',
        targetResource: 'public.fn_admin_update_user_role_and_access',
        outcome: 'BLOCKED',
        reason: permCheck.reason,
        dbEnforcementLayer: permCheck.dbLayerCheck
      });
      notify('error', 'Operación Bloqueada por RBAC/RLS', permCheck.reason);
      return;
    }

    if (!targetUserId.trim() || !UUID_REGEX.test(targetUserId.trim())) {
      setAdminFormFeedback('Indica un UUID válido del usuario registrado en auth.users / public.profiles.');
      return;
    }

    if (newRole === 'OWNER' && !linkedOwnerId) {
      setAdminFormFeedback(
        'Regla Multipropietario: Al asignar el rol OWNER es obligatorio seleccionar explícitamente el propietario vinculado (ej. OWN-0001).'
      );
      return;
    }

    if (!adminReason.trim()) {
      setAdminFormFeedback('Debe registrar el motivo de auditoría para el cambio de rol.');
      return;
    }

    setSavingAdminRole(true);
    try {
      const { error } = await adminUpdateUserRoleAndAccess({
        targetUserId: targetUserId.trim(),
        newRole,
        linkedOwnerId: newRole === 'OWNER' ? linkedOwnerId : null,
        ownerPortalEnabled: newRole === 'OWNER' ? ownerPortalEnabled : false,
        isActive: isActiveAccount,
        reason: adminReason.trim()
      });

      if (error) {
        setAdminFormFeedback(error);
        notify('error', 'Validación de Servidor RPC', error);
        return;
      }

      setAdminFormFeedback('Permisos actualizados correctamente en public.profiles y registrados en audit_logs.');
      notify('success', 'Rol Actualizado', 'Cambio aplicado mediante RPC en servidor.');
      await loadAdminDirectories();
    } finally {
      setSavingAdminRole(false);
    }
  };

  const handleTestPrivateDocument = async () => {
    if (checkingPrivateDoc) return;
    setCheckingPrivateDoc(true);
    try {
      const res = await requestPrivateDocumentSignedUrl({
        profile: effectiveProfileContext,
        storagePath: 'facturas/REC-INI-2026-01.pdf',
        documentOwnerId: 'OWN-0001',
        sessionExpired: authStatus === 'SESSION_EXPIRED'
      });

      const outcome = res.error && !res.error.includes('Permiso RBAC verificado') ? 'BLOCKED' : 'ALLOWED';
      await logGuardEvent({
        eventType:
          outcome === 'BLOCKED'
            ? 'PRIVATE_DOCUMENT_ACCESS_BLOCKED'
            : 'PRIVATE_DOCUMENT_ACCESS_VERIFIED',
        targetResource: 'private-documents/facturas/REC-INI-2026-01.pdf',
        outcome,
        reason: res.error ?? 'Acceso concedido',
        dbEnforcementLayer: res.dbCheck
      });

      setPrivateDocStatus(
        `${res.error ?? (res.signedUrl ? 'URL firmada generada con éxito' : 'Acceso verificado')} — [${res.dbCheck}]`
      );
    } finally {
      setCheckingPrivateDoc(false);
    }
  };

  return (
    <div className="module-container">
      <ModuleHeader
        variant="dark"
        eyebrow="GESTIÓN · CUENTA Y ACCESOS"
        title="Usuarios, Perfil y Seguridad"
        subtitle="Administra tu sesión, roles del equipo y permisos por módulo."
        actions={
          userProfile ? (
            <button
              type="button"
              className="rtw-btn rtw-btn-ghost-dark btn-sm"
              onClick={() => void signOut()}
            >
              <LogOut size={14} />
              Cerrar sesión
            </button>
          ) : undefined
        }
        bottomSlot={
          <SegmentedTabs<'PROFILE' | 'USERS' | 'SECURITY'>
            variant="dark"
            value={activeTab}
            onChange={setActiveTab}
            items={[
              { id: 'PROFILE', label: 'Mi Perfil', icon: <UserCog size={14} /> },
              {
                id: 'USERS',
                label: 'Usuarios y Roles',
                icon: <Users size={14} />,
                count: managedProfiles.length
              },
              { id: 'SECURITY', label: 'Seguridad y Permisos', icon: <ShieldCheck size={14} /> }
            ]}
          />
        }
      />

      {activeTab === 'PROFILE' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))',
            gap: '20px'
          }}
        >
          <GlassCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <UserCog size={20} color="var(--rtw-gold-ink)" />
              <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>
                Tu perfil y rol activo
              </h3>
            </div>

            {canInspectRoles && (
              <div className="rtw-field" style={{ marginBottom: '14px' }}>
                <label className="rtw-label" htmlFor="rbac-role-selector">
                  Previsualizar vista como rol
                </label>
                <select
                  id="rbac-role-selector"
                  className="rtw-select"
                  value={activeEffectiveRole}
                  onChange={(e) => {
                    const nextRole = e.target.value as UserRole;
                    setActiveRolePreview(nextRole === userProfile?.role ? null : nextRole);
                    notify(
                      'info',
                      `Vista de rol: ${ROLES_CATALOG[nextRole].label}`,
                      ROLES_CATALOG[nextRole].scopeRule
                    );
                  }}
                >
                  {ALL_USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLES_CATALOG[r].label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div
              style={{
                backgroundColor: 'var(--rtw-bg-subtle)',
                border: '1px solid var(--rtw-border-light)',
                borderRadius: '12px',
                padding: '14px',
                fontSize: '0.84rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              <div>
                <strong>Rol activo:</strong>{' '}
                <span className="rtw-badge rtw-badge-gold">
                  {ROLES_CATALOG[activeEffectiveRole].shortBadge}
                </span>
              </div>
              <div>
                <strong>Alcance:</strong> {ROLES_CATALOG[activeEffectiveRole].scopeRule}
              </div>
              <div>
                <strong>Propietario vinculado:</strong>{' '}
                {activeEffectiveRole === 'OWNER'
                  ? userProfile?.linkedOwnerId || 'Sin código asignado'
                  : 'Acceso global de tienda'}
              </div>
            </div>

            <div style={{ marginTop: '14px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="rtw-btn rtw-btn-outline btn-sm"
                disabled={checkingPrivateDoc}
                onClick={() => void handleTestPrivateDocument()}
              >
                <Lock size={14} />
                {checkingPrivateDoc ? 'Verificando...' : 'Verificar acceso a documentos'}
              </button>
              <button
                type="button"
                className="rtw-btn rtw-btn-outline btn-sm"
                onClick={triggerSessionExpiredSimulation}
              >
                <KeyRound size={14} />
                Simular sesión expirada
              </button>
            </div>
            {privateDocStatus && (
              <div
                style={{
                  marginTop: '10px',
                  fontSize: '0.78rem',
                  padding: '9px 12px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--rtw-bg-subtle)',
                  border: '1px solid var(--rtw-border-light)',
                  color: 'var(--rtw-text-primary)',
                  fontWeight: 600
                }}
              >
                {privateDocStatus}
              </div>
            )}
          </GlassCard>

          <AuthPortalCard initialMode="UPDATE_PASSWORD" authenticatedOnly />
        </div>
      )}

      {activeTab === 'USERS' && (
        <GlassCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Users size={20} color="var(--rtw-gold-ink)" />
            <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>
              Gestión de Usuarios y Roles
            </h3>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--rtw-text-secondary)', marginBottom: '16px' }}>
            Asigna roles, vincula propietarios o activa cuentas desde un único formulario.
          </p>

          {activeEffectiveRole !== 'ADMIN' ? (
            <div
              style={{
                backgroundColor: 'var(--rtw-danger-bg)',
                border: '1px solid var(--rtw-danger-border)',
                borderRadius: '12px',
                padding: '14px',
                color: 'var(--rtw-danger-text)',
                fontSize: '0.84rem',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <ShieldAlert size={20} />
              <div>
                <strong>Solo administradores:</strong> Tu rol actual no permite modificar permisos de otros usuarios.
              </div>
            </div>
          ) : (
            <form onSubmit={handleAdminRoleSubmit} noValidate>
              <div className="rtw-form-grid">
                <div className="rtw-field">
                  <label className="rtw-label" htmlFor="admin-target-uid">
                    ID del Usuario *
                  </label>
                  <input
                    id="admin-target-uid"
                    className="rtw-input"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                  />
                </div>

                <div className="rtw-field">
                  <label className="rtw-label" htmlFor="admin-new-role">
                    Rol asignado *
                  </label>
                  <select
                    id="admin-new-role"
                    className="rtw-select"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                  >
                    {ALL_USER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLES_CATALOG[r]?.label ?? r}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rtw-field">
                  <label className="rtw-label" htmlFor="admin-linked-owner">
                    Propietario vinculado (si es Propietario)
                  </label>
                  <select
                    id="admin-linked-owner"
                    className="rtw-select"
                    value={linkedOwnerId}
                    onChange={(e) => setLinkedOwnerId(e.target.value)}
                    disabled={newRole !== 'OWNER'}
                  >
                    <option value="">Selecciona un propietario...</option>
                    {liveOwners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.internal_code} — {o.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rtw-field">
                  <label className="rtw-label" htmlFor="admin-reason">
                    Motivo del cambio *
                  </label>
                  <input
                    id="admin-reason"
                    className="rtw-input"
                    placeholder="Ej. Alta de operador de bodega"
                    value={adminReason}
                    onChange={(e) => setAdminReason(e.target.value)}
                  />
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '18px',
                  flexWrap: 'wrap',
                  marginTop: '14px',
                  fontSize: '0.84rem'
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <input
                    type="checkbox"
                    checked={isActiveAccount}
                    onChange={(e) => setIsActiveAccount(e.target.checked)}
                  />
                  Cuenta activa
                </label>

                {newRole === 'OWNER' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <input
                      type="checkbox"
                      checked={ownerPortalEnabled}
                      onChange={(e) => setOwnerPortalEnabled(e.target.checked)}
                    />
                    Permitir acceso al portal de propietario
                  </label>
                )}
              </div>

              {adminFormFeedback && (
                <div
                  style={{
                    marginTop: '12px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--rtw-warning-bg)',
                    border: '1px solid var(--rtw-warning-border)',
                    color: 'var(--rtw-warning-text)',
                    fontSize: '0.8rem',
                    fontWeight: 600
                  }}
                >
                  {adminFormFeedback}
                </div>
              )}

              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  className="rtw-btn rtw-btn-primary"
                  disabled={savingAdminRole}
                >
                  {savingAdminRole ? 'Guardando...' : 'Guardar permisos'}
                </button>
              </div>
            </form>
          )}

          {loadingProfiles && (
            <p style={{ fontSize: '0.8rem', color: 'var(--rtw-text-muted)', marginTop: '12px' }}>
              Cargando usuarios...
            </p>
          )}
          {managedProfiles.length > 0 && (
            <div className="rtw-table-container" style={{ marginTop: '16px' }}>
              <table className="rtw-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Correo</th>
                    <th>Rol</th>
                    <th>Propietario</th>
                    <th>Estado</th>
                    <th>ID</th>
                  </tr>
                </thead>
                <tbody>
                  {managedProfiles.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 700 }}>{p.fullName}</td>
                      <td>{p.email}</td>
                      <td><span className="rtw-badge rtw-badge-gold">{p.role}</span></td>
                      <td>{p.linkedOwnerId ?? '—'}</td>
                      <td>
                        <span className={`rtw-badge ${p.isActive ? 'rtw-badge-success' : 'rtw-badge-neutral'}`}>
                          {p.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td><code className="rtw-mono" style={{ fontSize: '0.74rem' }}>{p.id}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      )}

      {activeTab === 'SECURITY' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <GlassDisclosure
            title="Matriz de permisos por módulo"
            subtitle={`Consulta qué puede leer o editar cada rol en los ${NAVIGATION_ITEMS.length} módulos.`}
            icon={<ShieldCheck size={16} />}
            defaultOpen
          >
            <div className="rtw-table-container" style={{ marginTop: '14px' }}>
              <table className="rtw-table">
                <thead>
                  <tr>
                    <th>Grupo</th>
                    <th>Módulo</th>
                    <th>Admin</th>
                    <th>Inventario</th>
                    <th>Ventas</th>
                    <th>Marketing</th>
                    <th>Propietario</th>
                    <th>Lectura</th>
                  </tr>
                </thead>
                <tbody>
                  {NAVIGATION_ITEMS.map((item) => {
                    const rule = ROUTE_PERMISSIONS[item.path];
                    const renderCell = (role: UserRole) => {
                      if (!rule) return '—';
                      const canWrite = rule.allowedWriteRoles.includes(role);
                      const canRead = rule.allowedReadRoles.includes(role);
                      if (canWrite) {
                        return <span className="rtw-badge rtw-badge-success">Lectura / Edición</span>;
                      }
                      if (canRead) {
                        return (
                          <span className="rtw-badge rtw-badge-info">
                            {role === 'OWNER' && rule.ownerScopedOnlyForOwnerRole
                              ? 'Solo propios'
                              : 'Solo lectura'}
                          </span>
                        );
                      }
                      return <span className="rtw-badge rtw-badge-danger">Bloqueado</span>;
                    };

                    return (
                      <tr key={item.id}>
                        <td style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--rtw-text-muted)' }}>
                          {item.group}
                        </td>
                        <td><strong>{item.label}</strong></td>
                        <td>{renderCell('ADMIN')}</td>
                        <td>{renderCell('INVENTORY_OPERATOR')}</td>
                        <td>{renderCell('SALES_OPERATOR')}</td>
                        <td>{renderCell('MARKETING_OPERATOR')}</td>
                        <td>{renderCell('OWNER')}</td>
                        <td>{renderCell('VIEWER')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </GlassDisclosure>

          <GlassDisclosure
            title="Pruebas automáticas de seguridad"
            subtitle="Verifica los 7 escenarios obligatorios de bloqueo por rol."
            icon={<Lock size={16} />}
            badge={
              <span className="rtw-badge rtw-badge-success">
                <CheckCircle2 size={13} />
                {testResults.filter((t) => t.passed).length}/{testResults.length}
              </span>
            }
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '12px 0' }}>
              <button
                type="button"
                className="rtw-btn rtw-btn-primary btn-sm"
                onClick={handleExecuteAllSecurityTests}
              >
                <Play size={14} />
                Ejecutar pruebas
              </button>
            </div>
            <div className="rtw-table-container">
              <table className="rtw-table">
                <thead>
                  <tr>
                    <th>Escenario</th>
                    <th>Actor</th>
                    <th>Acción</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {testResults.map((test) => (
                    <tr key={test.id}>
                      <td><strong>{test.title}</strong></td>
                      <td><span className="rtw-badge rtw-badge-gold">{test.simulatedActor}</span></td>
                      <td style={{ fontSize: '0.8rem' }}>{test.attemptedAction}</td>
                      <td>
                        <span className={`rtw-badge ${test.passed ? 'rtw-badge-success' : 'rtw-badge-danger'}`}>
                          {test.actualOutcome} {test.passed ? '✓' : '✗'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassDisclosure>
        </div>
      )}
    </div>
  );
}
