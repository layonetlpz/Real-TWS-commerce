import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { NAV_GROUPS, NAVIGATION_ITEMS } from '../lib/navigation';
import { ROUTE_PERMISSIONS, ROLES_CATALOG } from '../lib/permissions';
import { useAuth } from '../hooks/useAuth';
import type { NavGroupId } from '../types/domain';
import { RealTwsMonogram } from '../design-system/components/RealTwsBrandMark';
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
  const location = useLocation();
  const { activeEffectiveRole, userProfile, canInspectRoles, activeRolePreview, setActiveRolePreview } =
    useAuth();

  const currentNav = NAVIGATION_ITEMS.find((item) => item.path === location.pathname);

  const [openGroups, setOpenGroups] = useState<Record<NavGroupId, boolean>>({
    OPERACIONES: true,
    FINANZAS: true,
    COMERCIAL: true,
    MARKETING: false,
    GESTIÓN: true
  });

  useEffect(() => {
    if (currentNav) {
      setOpenGroups((prev) =>
        prev[currentNav.group] ? prev : { ...prev, [currentNav.group]: true }
      );
    }
  }, [currentNav]);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [mobileOpen, onCloseMobile]);

  const toggleGroup = (group: NavGroupId) => {
    setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

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
            <RealTwsMonogram size={36} />
            {!collapsed && (
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                <span style={{ color: '#f8fafc', fontWeight: 900, letterSpacing: '0.08em' }}>
                  REAL TWS
                </span>
                <span style={{ fontSize: '0.58rem', color: 'rgba(232, 199, 102, 0.92)', fontWeight: 700, letterSpacing: '0.18em' }}>
                  AURICULARES PREMIUM
                </span>
              </span>
            )}
          </NavLink>

          <button
            type="button"
            className="rtw-sidebar-toggle rtw-desktop-only"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expandir menú' : 'Contraer menú'}
            aria-label={collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>

          <button
            type="button"
            className="rtw-sidebar-toggle rtw-mobile-only"
            onClick={onCloseMobile}
            aria-label="Cerrar menú móvil"
          >
            <X size={15} />
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
            const isExpanded = collapsed || openGroups[group];

            return (
              <div key={group} className="rtw-nav-group">
                {!collapsed && (
                  <button
                    type="button"
                    className="rtw-nav-group-header"
                    onClick={() => toggleGroup(group)}
                    aria-expanded={isExpanded}
                  >
                    <span>{group}</span>
                    <ChevronDown
                      size={13}
                      style={{
                        opacity: 0.7,
                        transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                        transition: 'transform 0.2s var(--ease-spring)'
                      }}
                    />
                  </button>
                )}

                {isExpanded &&
                  items.map((item) => (
                    <NavLink
                      key={item.id}
                      to={item.path}
                      end={item.path === '/'}
                      onClick={onCloseMobile}
                      title={collapsed ? `${group}: ${item.label}` : undefined}
                      aria-label={collapsed ? `${group}: ${item.label}` : undefined}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <span
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '999px',
                  background: 'rgba(212, 175, 55, 0.20)',
                  border: '1px solid rgba(212, 175, 55, 0.45)',
                  color: '#e8c766',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  flexShrink: 0
                }}
              >
                {userProfile.fullName.slice(0, 2).toUpperCase()}
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 700,
                    color: '#f8fafc',
                    fontSize: '0.79rem',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {userProfile.fullName}
                </div>
                <div style={{ fontSize: '0.71rem', color: 'rgba(203, 213, 225, 0.78)' }}>
                  {ROLES_CATALOG[activeEffectiveRole]?.label ?? activeEffectiveRole}
                </div>
              </div>
            </div>

            {canInspectRoles && activeRolePreview && (
              <button
                type="button"
                className="rtw-btn rtw-btn-gold btn-sm"
                style={{ marginTop: '8px', width: '100%' }}
                onClick={() => setActiveRolePreview(null)}
              >
                Salir de vista ({activeRolePreview})
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
