import { NavLink } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { NAV_GROUPS, NAVIGATION_ITEMS } from '../lib/navigation';
import { ROUTE_PERMISSIONS, ROLES_CATALOG } from '../lib/permissions';
import { useAuth } from '../hooks/useAuth';
import { LucideIcon } from './LucideIcon';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile
}: SidebarProps) {
  const { activeEffectiveRole, userProfile, canInspectRoles, activeRolePreview, setActiveRolePreview } =
    useAuth();

  const sidebarClasses = [
    'rtw-sidebar',
    collapsed ? 'collapsed' : '',
    mobileOpen ? 'mobile-open' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      {mobileOpen && (
        <div
          className="rtw-mobile-backdrop"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside className={sidebarClasses} aria-label="Navegación Principal REAL TWS">
        <div className="rtw-brand-header">
          <NavLink to="/" className="rtw-brand-logo" onClick={onCloseMobile}>
            <span className="rtw-brand-badge">RT</span>
            {!collapsed && <span>REAL TWS</span>}
          </NavLink>

          <button
            type="button"
            className="rtw-btn rtw-btn-outline rtw-desktop-only"
            style={{
              padding: '4px 6px',
              minHeight: '30px',
              background: 'transparent',
              color: '#d4af37',
              borderColor: 'rgba(212, 175, 55, 0.35)'
            }}
            onClick={onToggleCollapse}
            title={collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
            aria-label={collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          <button
            type="button"
            className="rtw-btn rtw-btn-outline rtw-mobile-only"
            style={{
              padding: '4px 6px',
              minHeight: '30px',
              background: 'transparent',
              color: '#d4af37',
              borderColor: 'rgba(212, 175, 55, 0.35)'
            }}
            onClick={onCloseMobile}
            aria-label="Cerrar menú móvil"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="rtw-sidebar-nav">
          {NAV_GROUPS.map((group) => {
            const items = NAVIGATION_ITEMS.filter((item) => {
              if (item.group !== group) return false;
              const rule = ROUTE_PERMISSIONS[item.path];
              return rule?.allowedReadRoles.includes(activeEffectiveRole) ?? true;
            });

            if (items.length === 0) return null;

            return (
              <div key={group} className="rtw-nav-group">
                {!collapsed && (
                  <div className="rtw-nav-group-title">{group}</div>
                )}
                {items.map((item) => (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    end={item.path === '/'}
                    onClick={onCloseMobile}
                    title={collapsed ? `${group}: ${item.label}` : undefined}
                    className={({ isActive }) =>
                      `rtw-nav-link ${isActive ? 'active' : ''}`
                    }
                  >
                    <LucideIcon name={item.iconName} size={17} />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        {!collapsed && userProfile && (
          <div className="rtw-sidebar-footer">
            <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.78rem' }}>
              {userProfile.fullName}
            </div>
            <div>
              {ROLES_CATALOG[activeEffectiveRole]?.label ?? activeEffectiveRole}
            </div>
            {canInspectRoles && activeRolePreview && (
              <button
                type="button"
                className="rtw-btn rtw-btn-gold btn-sm"
                style={{ marginTop: '6px' }}
                onClick={() => setActiveRolePreview(null)}
              >
                Salir de vista previa ({activeRolePreview})
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
