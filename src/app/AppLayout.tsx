import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Menu, Package, ShoppingCart, Wallet } from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { NotificationCenter } from '../components/NotificationCenter';
import { useAuth } from '../hooks/useAuth';
import { RealTwsMonogram } from '../design-system/components/RealTwsBrandMark';
import { ThemeSwitcher } from '../design-system/components/ThemeSwitcher';

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { authStatus, isSupabaseReady } = useAuth();
  const location = useLocation();

  if (!isSupabaseReady || authStatus !== 'AUTHENTICATED') {
    return (
      <div className="rtw-auth-shell">
        <header className="rtw-auth-topbar">
          <div className="rtw-brand-logo">
            <RealTwsMonogram size={34} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span style={{ fontWeight: 900, letterSpacing: '0.08em' }}>REAL TWS</span>
              <span
                style={{
                  fontSize: '0.62rem',
                  color: 'var(--rtw-gold-ink)',
                  letterSpacing: '0.2em',
                  fontWeight: 700
                }}
              >
                AURICULARES PREMIUM
              </span>
            </div>
          </div>
          <ThemeSwitcher compact />
        </header>
        <main className="rtw-auth-main">
          <div key={location.pathname} className="rtw-route-stage" style={{ width: '100%' }}>
            <Outlet />
          </div>
        </main>
        <NotificationCenter />
      </div>
    );
  }

  return (
    <div className="rtw-app-shell">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div
        className={`rtw-main-wrapper ${
          sidebarCollapsed ? 'sidebar-collapsed' : ''
        }`}
      >
        <Header onOpenMobileMenu={() => setMobileMenuOpen(true)} />
        <main className="rtw-main-content">
          <div key={location.pathname} className="rtw-route-stage">
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="rtw-mobile-dock" aria-label="Navegación rápida móvil">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `rtw-mobile-dock-item ${isActive ? 'active' : ''}`}
        >
          <LayoutDashboard size={17} />
          <span>Resumen</span>
        </NavLink>
        <NavLink
          to="/operaciones/inventario"
          className={({ isActive }) => `rtw-mobile-dock-item ${isActive ? 'active' : ''}`}
        >
          <Package size={17} />
          <span>Inventario</span>
        </NavLink>
        <NavLink
          to="/comercial/pedidos"
          className={({ isActive }) => `rtw-mobile-dock-item ${isActive ? 'active' : ''}`}
        >
          <ShoppingCart size={17} />
          <span>Pedidos</span>
        </NavLink>
        <NavLink
          to="/finanzas/propietarios"
          className={({ isActive }) => `rtw-mobile-dock-item ${isActive ? 'active' : ''}`}
        >
          <Wallet size={17} />
          <span>Finanzas</span>
        </NavLink>
        <button
          type="button"
          className={`rtw-mobile-dock-item ${mobileMenuOpen ? 'active' : ''}`}
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Abrir menú completo"
        >
          <Menu size={17} />
          <span>Menú</span>
        </button>
      </nav>

      <NotificationCenter />
    </div>
  );
}
