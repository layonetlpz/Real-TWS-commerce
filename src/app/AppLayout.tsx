import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { NotificationCenter } from '../components/NotificationCenter';
import { useAuth } from '../hooks/useAuth';

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { authStatus, isSupabaseReady } = useAuth();

  if (!isSupabaseReady || authStatus !== 'AUTHENTICATED') {
    return (
      <div className="rtw-auth-shell">
        <header className="rtw-auth-topbar">
          <div className="rtw-brand-logo">
            <span className="rtw-brand-badge">RT</span>
            <span>REAL TWS · COMMERCE SYSTEM</span>
          </div>
        </header>
        <main className="rtw-auth-main">
          <Outlet />
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
          <Outlet />
        </main>
      </div>

      <NotificationCenter />
    </div>
  );
}
