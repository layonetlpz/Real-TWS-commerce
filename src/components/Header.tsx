import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, Database, Lock, LogOut, Menu, Shield, UserCheck } from 'lucide-react';
import { NAVIGATION_ITEMS } from '../lib/navigation';
import { ROLES_CATALOG, ROUTE_PERMISSIONS } from '../lib/permissions';
import { useOwnerScope } from '../hooks/useOwnerScope';
import { useNotifications } from '../hooks/useNotifications';
import { useAuth } from '../hooks/useAuth';
import {
  fetchLiveOwnersFromSupabase,
  type DbOwnerRow
} from '../services/supabaseDataBridge';
import type { UserRole } from '../types/domain';

interface HeaderProps {
  onOpenMobileMenu: () => void;
}

const ALL_ROLES: UserRole[] = [
  'ADMIN',
  'INVENTORY_OPERATOR',
  'SALES_OPERATOR',
  'MARKETING_OPERATOR',
  'OWNER'
];

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

  useEffect(() => {
    let mounted = true;
    if (!isSupabaseReady || !userProfile) return;
    fetchLiveOwnersFromSupabase().then(({ data }) => {
      if (mounted) {
        setLiveOwners(data);
      }
    });
    return () => {
      mounted = false;
    };
  }, [isSupabaseReady, userProfile]);

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
          className="rtw-btn rtw-btn-outline rtw-mobile-only"
          onClick={onOpenMobileMenu}
          aria-label="Abrir navegación"
        >
          <Menu size={18} />
        </button>

        <div style={{ minWidth: 0 }}>
          <nav className="rtw-breadcrumbs" aria-label="Ruta actual">
            <Link to="/">Inicio</Link>
            <ChevronRight size={12} />
            <span>{currentNav.group}</span>
            <ChevronRight size={12} />
            <span style={{ color: '#0f172a', fontWeight: 600 }}>{currentNav.label}</span>
          </nav>
          <h1
            style={{
              fontSize: '1.08rem',
              fontWeight: 800,
              color: '#0f172a',
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
        {/* Inspector de rol disponible exclusivamente para administradores autenticados */}
        {canInspectRoles && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <UserCheck size={15} color="#166534" />
            <label
              htmlFor="header-role-selector"
              className="rtw-desktop-only"
              style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569' }}
            >
              Vista Rol:
            </label>
            <select
              id="header-role-selector"
              className="rtw-select"
              style={{ fontWeight: 700, padding: '6px 10px', minHeight: '34px' }}
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
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Selector Global Multipropietario */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isOwnerLocked ? (
            <span
              className="rtw-badge rtw-badge-gold"
              title="Cuenta restringida por seguridad a su propio código de propietario"
            >
              <Lock size={13} />
              {lockedOwnerRecord
                ? `${lockedOwnerRecord.internal_code} — ${lockedOwnerRecord.full_name}`
                : lockedOwnerId || 'Sin propietario asignado'}
            </span>
          ) : (
            <>
              <Shield size={15} color="#b45309" />
              <label
                htmlFor="global-owner-scope"
                className="rtw-desktop-only"
                style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569' }}
              >
                Propietario:
              </label>
              <select
                id="global-owner-scope"
                className="rtw-select"
                style={{ padding: '6px 10px', minHeight: '34px' }}
                value={selectedOwnerScope}
                onChange={(e) => {
                  const nextScope = e.target.value;
                  const chosen = liveOwners.find((o) => o.id === nextScope);
                  setSelectedOwnerScope(nextScope);
                  notify(
                    'info',
                    'Alcance multipropietario actualizado',
                    nextScope === 'ALL'
                      ? 'Mostrando vista consolidada de todos los propietarios.'
                      : `Filtrado por ${chosen ? `${chosen.internal_code} — ${chosen.full_name}` : nextScope}.`
                  );
                }}
              >
                <option value="ALL">Todos los propietarios</option>
                {liveOwners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.internal_code} — {owner.full_name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        <span
          className={`rtw-badge ${isSupabaseReady ? 'rtw-badge-success' : 'rtw-badge-warning'} rtw-desktop-only`}
          title="Estado de conexión con Supabase"
        >
          <Database size={13} />
          {isSupabaseReady ? 'Conectado' : 'Sin conexión'}
        </span>

        {canAccessSecurityModule && (
          <button
            type="button"
            className="rtw-btn rtw-btn-outline btn-sm"
            onClick={() => navigate('/gestion/usuarios')}
            title="Gestión de usuarios, roles y seguridad"
          >
            <Shield size={14} />
            <span className="rtw-desktop-only">Usuarios</span>
          </button>
        )}

        <button
          type="button"
          className="rtw-btn rtw-btn-outline btn-sm"
          onClick={() => void signOut()}
          title="Cerrar sesión"
        >
          <LogOut size={14} />
          <span className="rtw-desktop-only">Salir</span>
        </button>
      </div>
    </header>
  );
}
