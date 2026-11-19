import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, KeyRound, Lock, ShieldAlert } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useOwnerScope } from '../hooks/useOwnerScope';
import { evaluateRouteAccess, ROLES_CATALOG } from '../lib/permissions';
import { LoadingState } from './StatusStates';
import { AuthPortalCard } from '../modules/auth/AuthScreens';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    authStatus,
    userProfile,
    activeEffectiveRole,
    activeRolePreview,
    canInspectRoles,
    setActiveRolePreview,
    isSupabaseReady,
    restoreExpiredSessionSimulation,
    signOut,
    logGuardEvent
  } = useAuth();
  const { selectedOwnerScope, setSelectedOwnerScope } = useOwnerScope();

  const effectiveLinkedOwnerId =
    activeEffectiveRole === 'OWNER'
      ? (userProfile?.linkedOwnerId ??
          (canInspectRoles && selectedOwnerScope !== 'ALL' ? selectedOwnerScope : null))
      : userProfile?.linkedOwnerId ?? null;

  const evaluatedProfile = userProfile
    ? {
        ...userProfile,
        role: activeEffectiveRole,
        linkedOwnerId: effectiveLinkedOwnerId,
        ownerPortalEnabled:
          activeEffectiveRole === 'OWNER' && canInspectRoles && Boolean(effectiveLinkedOwnerId)
            ? true
            : userProfile.ownerPortalEnabled
      }
    : null;

  useEffect(() => {
    if (evaluatedProfile?.role === 'OWNER' && evaluatedProfile.linkedOwnerId) {
      if (selectedOwnerScope !== evaluatedProfile.linkedOwnerId) {
        setSelectedOwnerScope(evaluatedProfile.linkedOwnerId);
      }
    }
  }, [
    evaluatedProfile?.role,
    evaluatedProfile?.linkedOwnerId,
    selectedOwnerScope,
    setSelectedOwnerScope
  ]);

  const accessEval = evaluatedProfile
    ? evaluateRouteAccess(
        evaluatedProfile,
        location.pathname,
        authStatus === 'SESSION_EXPIRED'
      )
    : {
        allowed: false,
        reason: 'Sesión no autenticada.',
        dbLayerCheck: 'auth.uid() IS NOT NULL'
      };

  useEffect(() => {
    if (
      isSupabaseReady &&
      authStatus === 'AUTHENTICATED' &&
      evaluatedProfile &&
      !accessEval.allowed
    ) {
      void logGuardEvent({
        eventType: 'UNAUTHORIZED_ROUTE_ACCESS_BLOCKED',
        targetResource: location.pathname,
        outcome: 'BLOCKED',
        reason: accessEval.reason,
        dbEnforcementLayer: accessEval.dbLayerCheck
      });
    }
  }, [
    accessEval.allowed,
    accessEval.reason,
    accessEval.dbLayerCheck,
    authStatus,
    evaluatedProfile,
    isSupabaseReady,
    location.pathname,
    logGuardEvent
  ]);

  if (!isSupabaseReady) {
    return (
      <div
        className="rtw-card rtw-glass-elevated rtw-card-gold-top"
        style={{ maxWidth: 520, width: '100%', margin: '0 auto', background: 'var(--glass-bg-elevated)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <AlertTriangle size={22} color="var(--rtw-gold-ink)" />
          <div>
            <span className="rtw-badge rtw-badge-warning">Configuración requerida</span>
            <h1 style={{ fontSize: '1.12rem', fontWeight: 800, color: 'var(--rtw-text-primary)', marginTop: '4px' }}>
              Conecta Supabase para continuar
            </h1>
          </div>
        </div>

        <p style={{ fontSize: '0.86rem', color: 'var(--rtw-text-secondary)', marginBottom: '14px' }}>
          Faltan las variables públicas de entorno para iniciar el sistema de forma segura.
        </p>

        <div
          style={{
            backgroundColor: 'var(--rtw-bg-subtle)',
            border: '1px solid var(--rtw-border-light)',
            borderRadius: '10px',
            padding: '12px 14px',
            fontSize: '0.82rem',
            color: 'var(--rtw-text-primary)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}
        >
          <strong>Variables necesarias en .env.local:</strong>
          <code>VITE_SUPABASE_URL</code>
          <code>VITE_SUPABASE_ANON_KEY</code>
        </div>
      </div>
    );
  }

  if (authStatus === 'LOADING') {
    return <LoadingState label="Verificando sesión y permisos..." />;
  }

  if (authStatus === 'SESSION_EXPIRED') {
    return (
      <div className="rtw-card rtw-card-gold-top" style={{ maxWidth: 620, margin: '36px auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <KeyRound size={24} color="var(--rtw-danger-text)" />
          <h2 style={{ fontSize: '1.12rem', fontWeight: 800, color: 'var(--rtw-danger-text)' }}>
            Sesión expirada — Inicia sesión nuevamente
          </h2>
        </div>
        <p style={{ fontSize: '0.88rem', color: 'var(--rtw-text-secondary)', marginBottom: '16px' }}>
          Tu sesión ha vencido por seguridad. Reautentícate para continuar operando el sistema comercial.
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="rtw-btn rtw-btn-primary"
            onClick={restoreExpiredSessionSimulation}
          >
            Volver a iniciar sesión
          </button>
          <button
            type="button"
            className="rtw-btn rtw-btn-outline"
            onClick={() => void signOut()}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  if (
    authStatus !== 'AUTHENTICATED' ||
    !evaluatedProfile
  ) {
    return (
      <AuthPortalCard
        initialMode={authStatus === 'PASSWORD_RECOVERY' ? 'UPDATE_PASSWORD' : 'LOGIN'}
      />
    );
  }

  if (
    evaluatedProfile.role === 'OWNER' &&
    !evaluatedProfile.linkedOwnerId &&
    location.pathname !== '/gestion/usuarios'
  ) {
    return (
      <div className="rtw-card" style={{ borderTop: '4px solid var(--rtw-danger-text)', maxWidth: 640, margin: '28px auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <ShieldAlert size={22} color="var(--rtw-danger-text)" />
          <h2 style={{ fontSize: '1.08rem', fontWeight: 800, color: 'var(--rtw-text-primary)' }}>
            Cuenta de Propietario sin código asignado
          </h2>
        </div>
        <p style={{ fontSize: '0.88rem', color: 'var(--rtw-text-secondary)', marginBottom: '16px' }}>
          Tu usuario tiene rol de Propietario pero aún no cuenta con un código de propietario asignado en tu perfil. Solicita al administrador vincular tu cuenta.
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {canInspectRoles && activeRolePreview && (
            <button
              type="button"
              className="rtw-btn rtw-btn-primary"
              onClick={() => setActiveRolePreview(null)}
            >
              Volver a vista Administrador
            </button>
          )}
          <button
            type="button"
            className="rtw-btn rtw-btn-outline"
            onClick={() => navigate('/gestion/usuarios')}
          >
            Ver mi perfil
          </button>
          <button
            type="button"
            className="rtw-btn rtw-btn-outline"
            onClick={() => void signOut()}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  if (!accessEval.allowed) {
    const roleMeta = ROLES_CATALOG[evaluatedProfile.role];
    const canAccessDashboard = evaluateRouteAccess(evaluatedProfile, '/', false).allowed;
    return (
      <div className="rtw-card" style={{ borderTop: '4px solid var(--rtw-danger-text)', maxWidth: 720, margin: '24px auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <ShieldAlert size={24} color="var(--rtw-danger-text)" />
          <div>
            <span className="rtw-badge rtw-badge-danger">Acceso restringido</span>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--rtw-text-primary)', marginTop: '4px' }}>
              No tienes permisos para acceder a este módulo
            </h2>
          </div>
        </div>

        <p style={{ fontSize: '0.88rem', color: 'var(--rtw-text-secondary)', marginBottom: '14px' }}>
          {accessEval.reason}
        </p>

        <div
          style={{
            backgroundColor: 'var(--rtw-bg-subtle)',
            border: '1px solid var(--rtw-border-light)',
            borderRadius: '8px',
            padding: '12px 14px',
            fontSize: '0.82rem',
            color: 'var(--rtw-text-primary)',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}
        >
          <div>
            <Lock size={14} style={{ display: 'inline', marginRight: '6px', color: 'var(--rtw-gold)' }} />
            <strong>Rol activo:</strong> {roleMeta?.label ?? evaluatedProfile.role}
          </div>
          <div>
            <strong>Alcance autorizado:</strong> {roleMeta?.scopeRule ?? 'Acceso restringido'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="rtw-btn rtw-btn-primary"
            onClick={() => navigate(canAccessDashboard ? '/' : '/gestion/usuarios')}
          >
            <ArrowLeft size={15} />
            {canAccessDashboard ? 'Volver al Dashboard' : 'Ir a Mi Perfil'}
          </button>

          {canInspectRoles && activeRolePreview && (
            <button
              type="button"
              className="rtw-btn rtw-btn-outline"
              onClick={() => setActiveRolePreview(null)}
            >
              Restaurar vista Administrador
            </button>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
