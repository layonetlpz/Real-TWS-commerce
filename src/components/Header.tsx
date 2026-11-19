import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, Lock, LogOut, Menu, Shield, UserCheck } from 'lucide-react';
import { NAVIGATION_ITEMS } from '../lib/navigation';
import { ALL_USER_ROLES, ROLES_CATALOG, ROUTE_PERMISSIONS } from '../lib/permissions';
import { useOwnerScope } from '../hooks/useOwnerScope';
import { useNotifications } from '../hooks/useNotifications';
import { useAuth } from '../hooks/useAuth';
import {
  fetchLiveOwnersFromSupabase,
  type DbOwnerRow
} from '../services/supabaseDataBridge';
import { ThemeSwitcher } from '../design-system/components/ThemeSwitcher';
import type { UserRole } from '../types/domain';

interface HeaderProps {
  onOpenMobileMenu: () => void;
}

export function Header({ onOpenMobileMenu }: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedOwnerScope, setSelectedOwnerScope } = useOwnerScope();
  const { notify } = useNotifications();
  const {
    userProfile,
    activeEffectiveRole,
    canInspectRoles,
    setActiveRolePreview,
    isSupabaseReady,
    signOut
  } = useAuth();
  const [liveOwners, setLiveOwners] = useState<DbOwnerRow[]>([]);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!isSupabaseReady || !userProfile) return;
    fetchLiveOwnersFromSupabase().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        notify('warning', 'Propietarios', `No se pudieron cargar los propietarios: ${error}`);
        return;
      }
      setLiveOwners(data);
    });
    return () => {
      mounted = false;
    };
  }, [isSupabaseReady, userProfile, notify]);

  const currentNav =
    NAVIGATION_ITEMS.find((item) => item.path === location.pathname) ??
    NAVIGATION_ITEMS[0];

  const isOwnerLocked = activeEffectiveRole === 'OWNER';
  const lockedOwnerId = userProfile?.linkedOwnerId ?? '';
  const lockedOwnerRecord = liveOwners.find(
    (o) => o.id === lockedOwnerId || o.internal_code === lockedOwnerId
  );
  const canAccessSecurityModule =
    ROUTE_PERMISSIONS['/gestion/usuarios']?.allowedReadRoles.includes(
      activeEffectiveRole
    ) ?? false;

  return (
    <header className="rtw-top-header">
      <div className="rtw-header-left">
        <button
          type="button"
          className="rtw-btn rtw-btn-outline btn-sm rtw-mobile-only"
          onClick={onOpenMobileMenu}
          aria-label="Abrir navegación"
        >
          <Menu size={17} />
        </button>

        <div style={{ minWidth: 0 }}>
          <nav className="rtw-breadcrumbs" aria-label="Ruta actual">
            <Link to="/">Inicio</Link>
            <ChevronRight size={11} />
            <span>{currentNav.group}</span>
            <ChevronRight size={11} />
            <span style={{ color: 'var(--rtw-text-primary)', fontWeight: 600 }}>
              {currentNav.label}
            </span>
          </nav>
          <h1
            style={{
              fontSize: '1.08rem',
              fontWeight: 800,
              color: 'var(--rtw-text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {currentNav.label}
          </h1>
        </div>
      </div>

      <div className="rtw-header-right">
        {/* Inspector de rol (solo administradores) */}
        {canInspectRoles && (
          <div className="rtw-header-pill" title="Previsualizar vista según rol">
            <UserCheck size={14} color="var(--rtw-success-text)" />
            <label
              htmlFor="header-role-selector"
              className="rtw-desktop-only"
              style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--rtw-text-muted)' }}
            >
              Rol:
            </label>
            <select
              id="header-role-selector"
              className="rtw-header-select"
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
                  {ROLES_CATALOG[r]?.label ?? r}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Selector Global Multipropietario */}
        {isOwnerLocked ? (
          <span
            className="rtw-badge rtw-badge-gold"
            title="Cuenta vinculada a tu código de propietario"
          >
            <Lock size={12} />
            {lockedOwnerRecord
              ? `${lockedOwnerRecord.internal_code} · ${lockedOwnerRecord.full_name}`
              : lockedOwnerId || 'Sin propietario'}
          </span>
        ) : (
          <div className="rtw-header-pill" title="Filtrar vista por propietario">
            <Shield size={14} color="var(--rtw-gold-ink)" />
            <label
              htmlFor="global-owner-scope"
              className="rtw-desktop-only"
              style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--rtw-text-muted)' }}
            >
              Propietario:
            </label>
            <select
              id="global-owner-scope"
              className="rtw-header-select"
              value={selectedOwnerScope}
              onChange={(e) => {
                const nextScope = e.target.value;
                const chosen = liveOwners.find((o) => o.id === nextScope);
                setSelectedOwnerScope(nextScope);
                notify(
                  'info',
                  'Alcance actualizado',
                  nextScope === 'ALL'
                    ? 'Mostrando todos los propietarios.'
                    : `Filtrado por ${chosen ? `${chosen.internal_code} — ${chosen.full_name}` : nextScope}.`
                );
              }}
            >
              <option value="ALL">Todos</option>
              {liveOwners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.internal_code} · {owner.full_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <span
          className={`rtw-header-pill rtw-desktop-only`}
          title={isSupabaseReady ? 'Sincronizado con Supabase' : 'Modo sin conexión'}
        >
          <span
            className={isSupabaseReady ? 'rtw-live-dot' : undefined}
            style={
              !isSupabaseReady
                ? {
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: '#f59e0b',
                    display: 'inline-block'
                  }
                : undefined
            }
          />
          <span style={{ fontWeight: 600, fontSize: '0.74rem' }}>
            {isSupabaseReady ? 'En línea' : 'Sin conexión'}
          </span>
        </span>

        <ThemeSwitcher compact />

        {canAccessSecurityModule && (
          <button
            type="button"
            className="rtw-btn rtw-btn-outline btn-sm"
            onClick={() => navigate('/gestion/usuarios')}
            title="Usuarios y permisos"
            aria-label="Usuarios y permisos"
          >
            <Shield size={14} />
            <span className="rtw-desktop-only">Usuarios</span>
          </button>
        )}

        <button
          type="button"
          className="rtw-btn rtw-btn-outline btn-sm"
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true);
            try {
              await signOut();
            } finally {
              setSigningOut(false);
            }
          }}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
        >
          <LogOut size={14} />
          <span className="rtw-desktop-only">{signingOut ? 'Saliendo...' : 'Salir'}</span>
        </button>
      </div>
    </header>
  );
}
