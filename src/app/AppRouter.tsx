import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { LoadingState } from '../components/StatusStates';

const DashboardModule = lazy(() =>
  import('../modules/dashboard/DashboardModule').then((m) => ({
    default: m.DashboardModule
  }))
);
const InventoryPurchaseModule = lazy(() =>
  import('../modules/inventory/InventoryPurchaseModule').then((m) => ({
    default: m.InventoryPurchaseModule
  }))
);
const ExcelImportModule = lazy(() =>
  import('../modules/import/ExcelImportModule').then((m) => ({
    default: m.ExcelImportModule
  }))
);
const FinancialAccountingModule = lazy(() =>
  import('../modules/finance/FinancialAccountingModule').then((m) => ({
    default: m.FinancialAccountingModule
  }))
);
const SalesOrdersCrmModule = lazy(() =>
  import('../modules/sales/SalesOrdersCrmModule').then((m) => ({
    default: m.SalesOrdersCrmModule
  }))
);
const BrandMerchandisingModule = lazy(() =>
  import('../modules/marketing/BrandMerchandisingModule').then((m) => ({
    default: m.BrandMerchandisingModule
  }))
);
const CreativeStudioModule = lazy(() =>
  import('../modules/marketing/CreativeStudioModule').then((m) => ({
    default: m.CreativeStudioModule
  }))
);
const SocialMarketplaceModule = lazy(() =>
  import('../modules/marketing/SocialMarketplaceModule').then((m) => ({
    default: m.SocialMarketplaceModule
  }))
);
const WhatsAppSalesCenterModule = lazy(() =>
  import('../modules/marketing/WhatsAppSalesCenterModule').then((m) => ({
    default: m.WhatsAppSalesCenterModule
  }))
);
const MetaAdsControlModule = lazy(() =>
  import('../modules/marketing/MetaAdsControlModule').then((m) => ({
    default: m.MetaAdsControlModule
  }))
);
const AutomationEngineModule = lazy(() =>
  import('../modules/management/AutomationEngineModule').then((m) => ({
    default: m.AutomationEngineModule
  }))
);
const BusinessIntelligenceModule = lazy(() =>
  import('../modules/management/BusinessIntelligenceModule').then((m) => ({
    default: m.BusinessIntelligenceModule
  }))
);
const SettingsConfigModule = lazy(() =>
  import('../modules/management/SettingsConfigModule').then((m) => ({
    default: m.SettingsConfigModule
  }))
);
const UsersSecurityModule = lazy(() =>
  import('../modules/users/UsersSecurityModule').then((m) => ({
    default: m.UsersSecurityModule
  }))
);
const AuditModule = lazy(() =>
  import('../modules/audit/AuditModule').then((m) => ({
    default: m.AuditModule
  }))
);

function RouteSuspender({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Suspense fallback={<LoadingState label="Cargando módulo..." />}>
        {children}
      </Suspense>
    </ProtectedRoute>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            path="/"
            element={
              <RouteSuspender>
                <DashboardModule />
              </RouteSuspender>
            }
          />
          <Route
            path="/operaciones/productos"
            element={
              <RouteSuspender>
                <InventoryPurchaseModule initialSection="PRODUCTS" />
              </RouteSuspender>
            }
          />
          <Route
            path="/operaciones/inventario"
            element={
              <RouteSuspender>
                <InventoryPurchaseModule initialSection="INVENTORY_OPERATIONS" />
              </RouteSuspender>
            }
          />
          <Route
            path="/operaciones/recepciones-compras"
            element={
              <RouteSuspender>
                <InventoryPurchaseModule initialSection="PURCHASES_RECEPTIONS" />
              </RouteSuspender>
            }
          />
          <Route
            path="/operaciones/importacion"
            element={
              <RouteSuspender>
                <ExcelImportModule />
              </RouteSuspender>
            }
          />
          <Route
            path="/finanzas/costos"
            element={
              <RouteSuspender>
                <FinancialAccountingModule initialTab="COSTS" />
              </RouteSuspender>
            }
          />
          <Route
            path="/finanzas/precios"
            element={
              <RouteSuspender>
                <FinancialAccountingModule initialTab="PRICES_SIMULATOR" />
              </RouteSuspender>
            }
          />
          <Route
            path="/finanzas/gastos"
            element={
              <RouteSuspender>
                <FinancialAccountingModule initialTab="EXPENSES" />
              </RouteSuspender>
            }
          />
          <Route
            path="/finanzas/propietarios"
            element={
              <RouteSuspender>
                <FinancialAccountingModule initialTab="OWNERS_AGREEMENTS_STATEMENT" />
              </RouteSuspender>
            }
          />
          <Route
            path="/finanzas/liquidaciones"
            element={
              <RouteSuspender>
                <FinancialAccountingModule initialTab="SETTLEMENTS" />
              </RouteSuspender>
            }
          />
          <Route
            path="/comercial/pedidos"
            element={
              <RouteSuspender>
                <SalesOrdersCrmModule initialTab="ORDERS" />
              </RouteSuspender>
            }
          />
          <Route
            path="/comercial/clientes"
            element={
              <RouteSuspender>
                <SalesOrdersCrmModule initialTab="CUSTOMERS" />
              </RouteSuspender>
            }
          />
          <Route
            path="/comercial/crm"
            element={
              <RouteSuspender>
                <SalesOrdersCrmModule initialTab="CRM_PIPELINE" />
              </RouteSuspender>
            }
          />
          <Route
            path="/comercial/despachos"
            element={
              <RouteSuspender>
                <SalesOrdersCrmModule initialTab="SHIPMENTS" />
              </RouteSuspender>
            }
          />
          <Route
            path="/marketing/branding"
            element={
              <RouteSuspender>
                <BrandMerchandisingModule initialTab="BRAND_CENTER" />
              </RouteSuspender>
            }
          />
          <Route
            path="/marketing/merchandising"
            element={
              <RouteSuspender>
                <BrandMerchandisingModule initialTab="DIGITAL_MERCHANDISING" />
              </RouteSuspender>
            }
          />
          <Route
            path="/marketing/creative-studio"
            element={
              <RouteSuspender>
                <CreativeStudioModule />
              </RouteSuspender>
            }
          />
          <Route
            path="/marketing/marketplace"
            element={
              <RouteSuspender>
                <SocialMarketplaceModule initialTab="MARKETPLACE_ASSISTED" />
              </RouteSuspender>
            }
          />
          <Route
            path="/marketing/social-publisher"
            element={
              <RouteSuspender>
                <SocialMarketplaceModule initialTab="SOCIAL_CALENDAR_PUBLISHER" />
              </RouteSuspender>
            }
          />
          <Route
            path="/marketing/whatsapp"
            element={
              <RouteSuspender>
                <WhatsAppSalesCenterModule />
              </RouteSuspender>
            }
          />
          <Route
            path="/marketing/meta-ads"
            element={
              <RouteSuspender>
                <MetaAdsControlModule />
              </RouteSuspender>
            }
          />
          <Route
            path="/gestion/automatizaciones"
            element={
              <RouteSuspender>
                <AutomationEngineModule />
              </RouteSuspender>
            }
          />
          <Route
            path="/gestion/analitica"
            element={
              <RouteSuspender>
                <BusinessIntelligenceModule />
              </RouteSuspender>
            }
          />
          <Route
            path="/gestion/configuracion"
            element={
              <RouteSuspender>
                <SettingsConfigModule />
              </RouteSuspender>
            }
          />
          <Route
            path="/gestion/usuarios"
            element={
              <RouteSuspender>
                <UsersSecurityModule />
              </RouteSuspender>
            }
          />
          <Route
            path="/gestion/auditoria"
            element={
              <RouteSuspender>
                <AuditModule />
              </RouteSuspender>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
