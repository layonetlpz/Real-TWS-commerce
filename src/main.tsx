import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRouter } from './app/AppRouter';
import { NotificationProvider } from './hooks/useNotifications';
import { OwnerScopeProvider } from './hooks/useOwnerScope';
import { AuthProvider } from './hooks/useAuth';
import './styles/theme.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No se encontró el elemento #root en index.html');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <NotificationProvider>
      <OwnerScopeProvider>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </OwnerScopeProvider>
    </NotificationProvider>
  </React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registro PWA opcional; no bloquea la aplicación si el navegador lo restringe.
    });
  });
}
