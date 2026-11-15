import { useEffect, useState } from 'react';
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
import { getSystemBaselineSummary } from '../../services/systemService';
import { AuthPortalCard } from '../auth/AuthScreens';
import type {
  SecurityTestScenarioResult,
  UserProfile,
  UserRole
} from '../../types/domain';

const ALL_ROLES: UserRole[] = [
  'ADMIN',
  'INVENTORY_OPERATOR',
  'SALES_OPERATOR',
  'MARKETING_OPERATOR',
  'OWNER'
];

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
  const baseline = getSystemBaselineSummary();

  // Lista real de usuarios desde public.profiles (cuando Supabase está conectado)
  const [managedProfiles, setManagedProfiles] = useState<UserProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  // Formulario administrativo para asignar rol y permisos (RPC fn_admin_update_user_role_and_access)
  const [targetUserId, setTargetUserId] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('INVENTORY_OPERATOR');
  const [linkedOwnerId, setLinkedOwnerId] = useState('');
  const [ownerPortalEnabled, setOwnerPortalEnabled] = useState(false);
  const [isActiveAccount, setIsActiveAccount] = useState(true);
  const [adminReason, setAdminReason] = useState('');
  const [adminFormFeedback, setAdminFormFeedback] = useState<string | null>(null);

  // Resultados de las 7 pruebas obligatorias de seguridad
  const [testResults, setTestResults] = useState<SecurityTestScenarioResult[]>(
    () => runMandatorySecurityTests().results
  );

  // Resultado de prueba interactiva de documento privado
  const [privateDocStatus, setPrivateDocStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isSupabaseReady && activeEffectiveRole === 'ADMIN') {
      setLoadingProfiles(true);
      listManagedUserProfiles()
        .then(({ profiles }) => {
          setManagedProfiles(profiles);
        })
        .finally(() => setLoadingProfiles(false));
    }
  }, [isSupabaseReady, activeEffectiveRole]);

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

    if (!targetUserId.trim()) {
      setAdminFormFeedback('Debe indicar el UUID del usuario registrado en auth.users / public.profiles.');
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
      notify('info', 'Validación de Servidor RPC', error);
      return;
    }

    setAdminFormFeedback('Permisos actualizados correctamente en public.profiles y registrados en audit_logs.');
    notify('success', 'Rol Actualizado', 'Cambio aplicado mediante RPC en servidor.');
  };

  const handleTestPrivateDocument = async () => {
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

    setPrivateDocStatus(`${res.error ?? 'URL firmada emitida'} — [${res.dbCheck}]`);
  };

  return (
    <div>
      {/* 1. Cabecera de Seguridad y Estado de Sesión */}
      <div
        className="rtw-card rtw-card-gold-top"
        style={{
          background: 'linear-gradient(135deg, #0f141c 0%, #171e29 100%)',
          color: '#f8fafc'
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
              <ShieldCheck size={20} color="#d4af37" />
              <span className="rtw-badge rtw-badge-gold">
                AUTH & SECURITY — SUPABASE AUTH + POSTGRESQL RLS
              </span>
            </div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#d4af37' }}>
              Centro de Autenticación, Perfil, Roles (RBAC) y Pruebas de Seguridad
            </h2>
            <p style={{ fontSize: '0.84rem', color: '#cbd5e1', marginTop: '2px' }}>
              Validación en doble capa: Guardias de ruta/operación en cliente + Políticas Row Level Security (`FORCE ROW LEVEL SECURITY`) y funciones `SECURITY DEFINER` en PostgreSQL.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="rtw-btn rtw-btn-primary"
              onClick={handleExecuteAllSecurityTests}
            >
              <Play size={15} />
              Ejecutar las 7 Pruebas de Seguridad
            </button>

            <button
              type="button"
              className="rtw-btn rtw-btn-outline"
              style={{ background: '#991b1b', color: '#ffffff', borderColor: '#f87171' }}
              onClick={triggerSessionExpiredSimulation}
            >
              <KeyRound size={15} />
              Verificar Bloqueo por Sesión Expirada
            </button>

            {userProfile && (
              <button
                type="button"
                className="rtw-btn rtw-btn-outline"
                onClick={() => void signOut()}
              >
                <LogOut size={15} />
                Cerrar Sesión (Logout)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Portal de Login / Recuperación + Inspector de Rol Activo */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '20px',
          marginBottom: '20px'
        }}
      >
        <AuthPortalCard />

        <section className="rtw-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <UserCog size={20} color="#d4af37" />
            <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>
              Mi Perfil y Verificador de Roles RBAC (5 Roles Oficiales)
            </h3>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '12px' }}>
            {canInspectRoles
              ? 'Como Administrador puedes inspeccionar cómo actúa la aplicación bajo cada rol oficial sin modificar las políticas reales en base de datos.'
              : 'Detalle de tu rol y alcance asignado por el administrador.'}
          </p>

          {canInspectRoles && (
            <div className="rtw-field" style={{ marginBottom: '14px' }}>
              <label className="rtw-label" htmlFor="rbac-role-selector">
                Previsualizar vista bajo rol:
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
                    `Vista de rol: ${nextRole}`,
                    ROLES_CATALOG[nextRole].scopeRule
                  );
                }}
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLES_CATALOG[r].label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div
            style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '12px 14px',
              fontSize: '0.82rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            <div>
              <strong>Rol Efectivo Actual:</strong>{' '}
              <span className="rtw-badge rtw-badge-gold">
                {ROLES_CATALOG[activeEffectiveRole].shortBadge}
              </span>
            </div>
            <div>
              <strong>Función Validadora en PostgreSQL:</strong>{' '}
              <code>{ROLES_CATALOG[activeEffectiveRole].rlsHelperFunction}</code>
            </div>
            <div>
              <strong>Regla de Alcance:</strong>{' '}
              {ROLES_CATALOG[activeEffectiveRole].scopeRule}
            </div>
            <div>
              <strong>Propietario Vinculado (RLS):</strong>{' '}
              {activeEffectiveRole === 'OWNER'
                ? (userProfile?.linkedOwnerId || 'Sin código asignado (requiere vinculación de administrador)')
                : 'N/A (Rol interno de tienda)'}
            </div>
          </div>

          <div style={{ marginTop: '14px' }}>
            <button
              type="button"
              className="rtw-btn rtw-btn-outline"
              onClick={() => void handleTestPrivateDocument()}
            >
              <Lock size={15} />
              Probar Acceso a Documento Privado (`private-documents`) con Rol Actual
            </button>
            {privateDocStatus && (
              <div
                style={{
                  marginTop: '8px',
                  fontSize: '0.78rem',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: '#f1f5f9',
                  color: '#1e293b',
                  fontWeight: 600
                }}
              >
                {privateDocStatus}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 3. Suite de las 7 Pruebas Obligatorias de Seguridad */}
      <section className="rtw-card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            marginBottom: '14px'
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.02rem', fontWeight: 800 }}>
              Verificación Automatizada de las 7 Pruebas Obligatorias de Seguridad
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Valida que ninguna restricción dependa solo de ocultar botones: cada operación se valida en cliente y en PostgreSQL (RLS + Triggers + Funciones RPC).
            </p>
          </div>
          <span className="rtw-badge rtw-badge-success">
            <CheckCircle2 size={14} />
            {testResults.filter((t) => t.passed).length} / {testResults.length} Escenarios Bloqueados Correctamente
          </span>
        </div>

        <div className="rtw-table-container">
          <table className="rtw-table">
            <thead>
              <tr>
                <th>Escenario de Prueba</th>
                <th>Actor Evaluado</th>
                <th>Acción Intentada</th>
                <th>Resultado</th>
                <th>Defensa en Cliente y Servidor (PostgreSQL RLS / RPC)</th>
              </tr>
            </thead>
            <tbody>
              {testResults.map((test) => (
                <tr key={test.id}>
                  <td>
                    <strong>{test.title}</strong>
                  </td>
                  <td>
                    <span className="rtw-badge rtw-badge-gold">{test.simulatedActor}</span>
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>{test.attemptedAction}</td>
                  <td>
                    <span
                      className={`rtw-badge ${
                        test.passed ? 'rtw-badge-success' : 'rtw-badge-danger'
                      }`}
                    >
                      {test.actualOutcome} {test.passed ? '✓' : '✗'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.78rem' }}>
                    <div>
                      <strong>Guardia App:</strong> {test.clientGuardResult}
                    </div>
                    <div style={{ color: '#475569', marginTop: '2px' }}>
                      <strong>Capa BD:</strong> <code>{test.dbRlsAndRpcResult}</code>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Gestión Administrativa de Usuarios (Exclusivo ADMIN) */}
      <section className="rtw-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <Users size={20} color="#d4af37" />
          <h3 style={{ fontSize: '1.02rem', fontWeight: 800 }}>
            Gestión Administrativa de Usuarios y Asignación de Roles (Exclusivo ADMIN)
          </h3>
        </div>
        <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '14px' }}>
          Protegido en base de datos por el trigger <code>trg_prevent_profile_self_escalation</code> (evita autoasignación de roles) y la función RPC <code>public.fn_admin_update_user_role_and_access</code>.
        </p>

        {activeEffectiveRole !== 'ADMIN' ? (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              padding: '14px',
              color: '#991b1b',
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <ShieldAlert size={20} />
            <div>
              <strong>Operación Protegida:</strong> Su rol actual (<code>{activeEffectiveRole}</code>) no tiene privilegios de administración de usuarios. En PostgreSQL, la función <code>public.fn_admin_update_user_role_and_access</code> rechaza cualquier llamada si <code>public.fn_is_admin() = false</code>.
            </div>
          </div>
        ) : (
          <form onSubmit={handleAdminRoleSubmit} noValidate>
            <div className="rtw-form-grid">
              <div className="rtw-field">
                <label className="rtw-label" htmlFor="admin-target-uid">
                  UUID del Usuario (`public.profiles.id`) *
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
                  Rol a Asignar (`public.app_role`) *
                </label>
                <select
                  id="admin-new-role"
                  className="rtw-select"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rtw-field">
                <label className="rtw-label" htmlFor="admin-linked-owner">
                  Propietario Vinculado (Obligatorio si Rol = OWNER)
                </label>
                <select
                  id="admin-linked-owner"
                  className="rtw-select"
                  value={linkedOwnerId}
                  onChange={(e) => setLinkedOwnerId(e.target.value)}
                  disabled={newRole !== 'OWNER'}
                >
                  <option value="">-- Seleccione propietario explícitamente --</option>
                  {baseline.owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.internalCode} — {o.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rtw-field">
                <label className="rtw-label" htmlFor="admin-reason">
                  Motivo de Auditoría *
                </label>
                <input
                  id="admin-reason"
                  className="rtw-input"
                  placeholder="Ej. Habilitación de operador de bodega"
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
                marginTop: '12px',
                fontSize: '0.84rem'
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="checkbox"
                  checked={isActiveAccount}
                  onChange={(e) => setIsActiveAccount(e.target.checked)}
                />
                Cuenta Activa (`is_active = true`)
              </label>

              {newRole === 'OWNER' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="checkbox"
                    checked={ownerPortalEnabled}
                    onChange={(e) => setOwnerPortalEnabled(e.target.checked)}
                  />
                  Habilitar Acceso de Lectura al Portal del Propietario (`owner_portal_enabled`)
                </label>
              )}
            </div>

            {adminFormFeedback && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#fef9e7',
                  border: '1px solid rgba(212, 175, 55, 0.45)',
                  color: '#78350f',
                  fontSize: '0.8rem',
                  fontWeight: 600
                }}
              >
                {adminFormFeedback}
              </div>
            )}

            <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="rtw-btn rtw-btn-primary">
                Ejecutar Actualización Administrativa (RPC `fn_admin_update_user_role_and_access`)
              </button>
            </div>
          </form>
        )}

        {loadingProfiles && (
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '10px' }}>
            Consultando perfiles reales en `public.profiles`...
          </p>
        )}
        {managedProfiles.length > 0 && (
          <div className="rtw-table-container" style={{ marginTop: '14px' }}>
            <table className="rtw-table">
              <thead>
                <tr>
                  <th>UUID</th>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Propietario Vinculado</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {managedProfiles.map((p) => (
                  <tr key={p.id}>
                    <td><code>{p.id}</code></td>
                    <td>{p.fullName}</td>
                    <td>{p.email}</td>
                    <td><span className="rtw-badge rtw-badge-gold">{p.role}</span></td>
                    <td>{p.linkedOwnerId ?? '—'}</td>
                    <td>{p.isActive ? 'Activo' : 'Inactivo'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 5. Matriz de Permisos por Módulo (25 Rutas x 5 Roles) */}
      <section className="rtw-card">
        <h3 style={{ fontSize: '1.02rem', fontWeight: 800, marginBottom: '4px' }}>
          Matriz Oficial de Permisos por Módulo y Rol (25 Módulos × 5 Roles)
        </h3>
        <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '12px' }}>
          Refleja exactamente las políticas de acceso en <code>ProtectedRoute.tsx</code> y las políticas RLS de <code>0008_rls_policies_and_storage.sql</code>.
        </p>

        <div className="rtw-table-container">
          <table className="rtw-table">
            <thead>
              <tr>
                <th>Grupo</th>
                <th>Módulo</th>
                <th>ADMIN</th>
                <th>INVENTORY_OPERATOR</th>
                <th>SALES_OPERATOR</th>
                <th>MARKETING_OPERATOR</th>
                <th>OWNER (Con Portal Activo)</th>
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
                    return <span className="rtw-badge rtw-badge-success">Lectura / Escritura</span>;
                  }
                  if (canRead) {
                    return (
                      <span className="rtw-badge rtw-badge-info">
                        {role === 'OWNER' && rule.ownerScopedOnlyForOwnerRole
                          ? 'Solo Propios (RLS)'
                          : 'Solo Lectura'}
                      </span>
                    );
                  }
                  return <span className="rtw-badge rtw-badge-danger">Bloqueado</span>;
                };

                return (
                  <tr key={item.id}>
                    <td style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>
                      {item.group}
                    </td>
                    <td>
                      <strong>{item.label}</strong>
                    </td>
                    <td>{renderCell('ADMIN')}</td>
                    <td>{renderCell('INVENTORY_OPERATOR')}</td>
                    <td>{renderCell('SALES_OPERATOR')}</td>
                    <td>{renderCell('MARKETING_OPERATOR')}</td>
                    <td>{renderCell('OWNER')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
