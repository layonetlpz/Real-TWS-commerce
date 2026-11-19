# Auditoría Integral QA/QC — REAL TWS COMMERCE SYSTEM

**Fecha de auditoría:** 2026-11-18  
**Rama Git auditada:** `audit/qa-qc-total` (base `main` `7e674e9`)  
**Alcance:** Revisión arquitectónica, análisis estático, compilación TypeScript/Vite, auditoría de dependencias (`npm audit`), pruebas automatizadas unitarias e integradas en sandbox aislado (`20/20`), auditoría de migraciones y pruebas SQL PostgreSQL/Supabase (`0001`–`0024`), artefactos Cloudflare Pages/Assets (`wrangler.jsonc`, `public/_headers`, `public/_redirects`, `public/sw.js`) e inspección visual/consola/red/responsiva en vivo sobre `vite preview` (`127.0.0.1:4173`).

---

## 1. Resumen Ejecutivo y Dictamen Global

**Dictamen:** **APTO CON RESTRICCIONES (APTO PARA PRUEBAS REALES CONTROLADAS EN STAGING)**

| Indicador Verificado | Resultado Observado | Estado |
|---|---|---|
| TypeScript (`npm.cmd run typecheck`) | Salida código `0` (cero errores tras último cambio) | **APROBADO** |
| Build producción (`npm.cmd run build`) | `tsc -b && vite build` exitoso (`555` módulos en `13.61s`) | **APROBADO** |
| Pruebas unitarias (`npm.cmd run test:unit`) | `11/11` pruebas pasadas (`0` fallidas, `0` omitidas) | **APROBADO** |
| Pruebas de integración (`npm.cmd run test:integration`) | `9/9` suites pasadas (`0` fallidas, incl. sub-baterías internas) | **APROBADO** |
| Vulnerabilidades npm (`npm.cmd audit --json`) | `0` vulnerabilidades en `173` paquetes (`prod: 59`, `dev: 115`, `optional: 53`) | **APROBADO** |
| Preview en vivo navegador (`1280×800`, `768×1024`, `360×800`) | `0` errores consola, `0` red fallida, `0` overflow horizontal, gate fail-closed verificado | **APROBADO** |
| Integración live Supabase Auth / PostgreSQL / RLS en ejecución | Sin credenciales de prueba ni instancia PostgreSQL local para ejecutar RPC/RLS en vivo | **NO VERIFICADO** |
| APIs externas (Meta Graph API, Gemini Flash, WhatsApp Cloud API) | Desactivadas por arquitectura de seguridad; validación de bloqueo desde cliente comprobada | **APROBADO CON OBSERVACIONES** |

> [!IMPORTANT]
> **Regla de Integridad de Datos:** Durante toda la auditoría no se ejecutaron mutaciones, inserciones, eliminaciones ni consultas destructivas sobre el proyecto Supabase de producción. Todas las pruebas de negocio se aislaron en Node con un entorno `localStorage` efímero y datos sintéticos, y la navegación en vivo se realizó estrictamente en solo lectura sin enviar credenciales reales.

---

## 2. Inventario de Código, Rutas y Almacenamiento

- **Módulos React (`src/modules/`):** 16 archivos (`AuthScreens`, `DashboardModule`, `InventoryPurchaseModule`, `ExcelImportModule`, `FinancialAccountingModule`, `SalesOrdersCrmModule`, `BrandMerchandisingModule`, `CreativeStudioModule`, `SocialMarketplaceModule`, `WhatsAppSalesCenterModule`, `MetaAdsControlModule`, `AutomationEngineModule`, `BusinessIntelligenceModule`, `SettingsConfigModule`, `UsersSecurityModule`, `AuditModule`, más `ModuleBlueprintView.tsx` en raíz de `modules`).
- **Rutas protegidas (`src/app/AppRouter.tsx`):** `26` rutas protegidas mediante `<ProtectedRoute>` + `<RouteErrorBoundary>` + `<Suspense>`, cubriendo `/`, `/operaciones/*`, `/finanzas/*`, `/comercial/*`, `/marketing/*` y `/gestion/*`.
- **Servicios de dominio (`src/services/`):** `14` servicios (`authService`, `systemService`, `supabaseDataBridge`, `excelImportEngine`, `inventoryPurchaseService`, `financialAccountingService`, `salesOrdersCrmService`, `brandMerchandisingService`, `creativeStudioService`, `socialMarketplaceService`, `whatsappSalesCenterService`, `metaAdsControlService`, `automationEngineService`, `businessIntelligenceService`).
- **Migraciones SQL (`supabase/migrations/`):** `24` archivos (`0001` a `0024`), más `REAL_TWS_MASTER_DATABASE_CORREGIDO.sql` y scripts en `supabase/tests/`.

### Matriz de Arquitectura de Persistencia

| Capa / Módulos | Persistencia / Integración Real Observada | Clasificación |
|---|---|---|
| Autenticación, Usuarios, Auditoría, Configuración y Dashboard (`AuthScreens`, `UsersSecurityModule`, `AuditModule`, `SettingsConfigModule`, `DashboardModule`, `Header`) | Conexión directa en vivo a Supabase Auth, tablas (`profiles`, `owners`, `business_settings`, `audit_logs`, `notifications`), vistas (`v_available_inventory`, `v_sales_summary`, `v_owner_financial_pnl`) y RPCs (`fn_admin_update_user_role_and_access`, `fn_log_security_event`) vía `supabaseDataBridge.ts` | **Integración Supabase Live (lectura/escritura según RPC; ejecución en vivo NO VERIFICADA sin sesión real)** |
| Sincronización maestra de propietarios (`ExcelImportModule`, `InventoryPurchaseModule`, `FinancialAccountingModule`) | Lectura viva de propietarios reales mediante `fetchLiveOwnersFromSupabase()` sincronizada con los almacenes locales | **APROBADO CON OBSERVACIONES** |
| Motores operativos y marketing (`excelImportEngine`, `inventoryPurchaseService`, `financialAccountingService`, `salesOrdersCrmService`, `brandMerchandisingService`, `creativeStudioService`, `socialMarketplaceService`, `whatsappSalesCenterService`, `metaAdsControlService`, `automationEngineService`) | Persistencia transaccional en cliente mediante claves `localStorage` (`rtw_*_v1`); sobrevive recargas en el mismo navegador, **pero no sincroniza transacciones CRUD entre dispositivos ni sustituye todavía las RPC SQL en navegador** | **APROBADO CON OBSERVACIONES** |

---

## 3. Matriz de Cobertura de Pruebas

### 3.1 Pruebas Automatizadas (`npm.cmd run test:all` -> `20/20`, `702.6 ms` / re-run post-fix `935.2 ms`)

| Suite / Archivo | Casos Ejecutados | Resultado | Alcance Comprobado |
|---|---:|---|---|
| `tests/core.test.ts` | 5 | **5/5 PASS** | `formatters`, `validations`, `permissions`, conciliación del Excel maestro `REAL_TWS_INVENTARIO_MULTIPROPIETARIO.xlsx` (`40` filas, `38` unidades, `37` movimientos `OPENING_BALANCE`, bloqueo duplicados/propietarios inválidos) y verificación de artefactos Cloudflare/SQL |
| `tests/unit_utils_rbac.test.ts` | 6 | **6/6 PASS** | Desfase horario Bogotá (UTC-5), `escapeHtml` anti-XSS, enteros/montos finitos, parser CSV RFC-4180 (comillas/multilínea/`;`/BOM), matriz RBAC completa para los `6` roles (`VIEWER` restringido, `OWNER` scoped + bloqueo cruce entre dueños, expiración JWT), `runMandatorySecurityTests()` (`7/7`), Excel XLSX y presencia SQL `0024` |
| `tests/integration_erp_flows.test.ts` | 4 | **4/4 PASS** | `runInventoryPurchaseTestSuite()` (`9/9` subcasos), `runFinancialAccountingTestSuite()` (`8/8` subcasos), acuerdos `attributable_profit` e inmutabilidad retroactiva de ventas, sincronización precio -> catálogo, bloqueo gasto duplicado, separación `approved_pending_payment` vs `paid_documented` + `txMarkSettlementPaid`, importación multi-propietario para mismo SKU con rechazo de costos/precios negativos, despacho atómico multi-línea con bloqueo `PENDING_COST`, sync de pago post-despacho a Finanzas, devolución restock y enmascaramiento PII |
| `tests/integration_bi_automation_marketing.test.ts` | 5 | **5/5 PASS** | `runAutomationEngineVerificationSuite()` (`6/6` subcasos + bloqueo rol no-`ADMIN` y referencias vacías), pureza de `readOwnerMarketingConsent` + bloqueo XSS SVG en Creative Studio, `runSocialMarketplaceSafetyTests()` (`5/5` subcasos + bloqueo de publicación live Graph API desde navegador sin SafeMode), bloqueo fuga propietarios/comprobante vacío/teléfono inválido en WhatsApp Sales Center, bloqueo `META_API_SYNCED` con adaptador apagado, eliminación de COGS 45% fabricado (`PENDING_COST` vs costo real de lote `VERIFIED_LOT_COST`), rechazo CSV con SKU inexistente, autorización gasto pauta multipropietario y aislamiento/neutralización CSV en BI |

### 3.2 Cobertura por Módulo Funcional y UI

| Módulo / Ruta | Lógica de Servicio (Sandbox) | UI & RBAC (Código + Render Build) | Navegador Live | Estado Consolidado |
|---|---|---|---|---|
| Auth (`AuthScreens`, `ProtectedRoute`, `useAuth`) | **APROBADO** | **APROBADO** (`h1`, `role="alert"`, toggle contraseña, fail-closed) | **APROBADO** (login/recovery sin credenciales reales) | **APROBADO CON OBSERVACIONES** (login real requiere credenciales) |
| Dashboard (`/`), Usuarios (`/gestion/usuarios`), Auditoría (`/gestion/auditoria`), Configuración (`/gestion/configuracion`) | **APROBADO** | **APROBADO** (`useAuth.activeEffectiveRole` + `RouteErrorBoundary`) | Desvio a gate login verificado | **NO VERIFICADO EN LIVE AUTENTICADO** (depende de sesión Supabase) |
| Inventario y Compras (`/operaciones/productos`, `/operaciones/inventario`, `/operaciones/recepciones-compras`) | **APROBADO** | **APROBADO** (RBAC, nonces idempotencia, transferencia/liberación, móvil) | Desvio a gate login verificado | **APROBADO CON OBSERVACIONES** (`localStorage` en CRUD operativo) |
| Importación Excel/CSV (`/operaciones/importacion`) | **APROBADO** | **APROBADO** (clave `SKU::OWNER::LOT`, `ADMIN` confirm, gate Paso 3) | Desvio a gate login verificado | **APROBADO CON OBSERVACIONES** |
| Finanzas y Multipropietario (`/finanzas/*`) | **APROBADO** | **APROBADO** (`ADMIN` write, consolidado `ALL`, `txMarkSettlementPaid`, fechas) | Desvio a gate login verificado | **APROBADO CON OBSERVACIONES** |
| Ventas, Pedidos y CRM (`/comercial/*`) | **APROBADO** | **APROBADO** (atomicidad despacho, `PENDING_COST`, sync pagos, PII) | Desvio a gate login verificado | **APROBADO CON OBSERVACIONES** |
| Marketing (Branding, Merchandising, Creative Studio, Marketplace, Social, WhatsApp, Meta Ads) (`/marketing/*`) | **APROBADO** | **APROBADO** (RBAC estricto incl. `ADMIN`-only en Meta Ads, PII WhatsApp, cero SVG XSS / 45% COGS ficticio, cuota diaria) | No renderizado autenticado | **APROBADO CON OBSERVACIONES** |
| Gestión (`AutomationEngineModule`, `BusinessIntelligenceModule`) | **APROBADO** | **APROBADO** (`ADMIN`-only automatizaciones, debounced thresholds, zona horaria y scope BI) | No renderizado autenticado | **APROBADO CON OBSERVACIONES** |

---

## 4. Bitácora de Defectos Detectados y Corregidos

### Críticos / Altos (`P0` / `P1`)

| ID | Sev | Módulo / Archivo | Causa Raíz | Corrección Aplicada | Estado |
|---|---|---|---|---|---|
| `QA-001` | **P0** | SQL `0015_sales_orders_crm_and_dispatch_procedures.sql` & `REAL_TWS_MASTER_DATABASE_CORREGIDO.sql` | `fn_tx_reserve_order_allocations` y `fn_tx_cancel_sales_order` insertaban `'RESERVATION_HOLD'` y `'RESERVATION_RELEASE'` en mayúsculas violando el `CHECK` en minúsculas de `stock_movements.movement_type`. | Migración aditiva `0024_qa_audit_fixes.sql` + corrección en master SQL usando `'reservation_hold'` y `'reservation_release'`. | **CORREGIDO** (SQL sin ejecución contra prod) |
| `QA-002` | **P0** | SQL Storage `0008_rls_policies_and_storage.sql` vs `0011` | `pol_private_docs_admin_operator` en `'private-documents'` solo permitía `fn_is_admin()`, bloqueando lecturas autorizadas por `fn_authorize_private_document_access` a `OWNER` habilitados sobre su propia carpeta. | Políticas `pol_private_docs_select_authorized` y `pol_private_docs_admin_write` en `0024_qa_audit_fixes.sql` y master SQL. | **CORREGIDO** |
| `QA-003` | **P0** | Ventas / `salesOrdersCrmService.ts` | `txDispatchSalesOrder` mutaba línea por línea antes de validar todas las asignaciones (riesgo de despacho parcial inconsistente) y permitía despachar lotes en estado `PENDING_COST`. | Pre-validación atómica completa de lotes, disponibilidad acumulada y rechazo explícito de `PENDING_COST` antes de cualquier transición. | **CORREGIDO Y PROBADO** |
| `QA-004` | **P0** | Finanzas / `financialAccountingService.ts` | `configureOwnerCommercialAgreement` reescribía registros `immutable: true` del historial de ventas, confundía `approved_pending_payment` con `paid_documented` y rechazaba `'attributable_profit'` sin porcentajes ficticios; `FIN-TEST-06` mantenía aserción obsoleta. | Preservación estricta de ventas históricas inmutables, separación real de estados de pago, soporte directo de `attributable_profit`, nuevo método `txMarkSettlementPaid` y actualización de `FIN-TEST-06`. | **CORREGIDO Y PROBADO** |
| `QA-005` | **P0** | Meta Ads / `metaAdsControlService.ts` | Fabricaba `COGS = 45%` de los ingresos (`revenueCop * 0.45`) al faltar costo real del lote, aceptaba `META_API_SYNCED` con adaptador apagado y hacía fallback silencioso al primer SKU del catálogo en importaciones CSV con SKU inválido. | Resolución de costo real desde lotes verificados (`PENDING_COST` explícito con `hasPendingCogs` si falta costo), bloqueo runtime de `META_API_SYNCED` con adaptador apagado, parser CSV RFC-4180 que rechaza SKUs inexistentes antes de mutar estado. | **CORREGIDO Y PROBADO** |
| `QA-006` | **P1** | Importación Excel & Inventario (`excelImportEngine.ts`, `inventoryPurchaseService.ts`) | Claves de idempotencia y asignaciones omitían `lotId` en multi-lote, `txProcessCustomerReturn` contenía bloque duplicado `deltaGood` y la UI de importación activaba el check de revisión desde la carga inicial saltando el Paso 3. | Claves compuestas `SKU::OWNER::LOT` / `ALLOC-INI-${sku}-${ownerId}-${lotId}`, limpieza de bloque duplicado en devolución, compuerta real en `STEP_3_PREVIEW` y eliminación de notas/textos fijos en modal de confirmación. | **CORREGIDO Y PROBADO** |
| `QA-007` | **P1** | Seguridad & Privacidad UI (`AutomationEngineModule`, `MetaAdsControlModule`, `WhatsAppSalesCenterModule`, `CreativeStudioModule`, `SocialMarketplaceModule`) | Múltiples módulos carecían de validación de `activeEffectiveRole`, prellenaban PII de demostración (`Carlos Mendoza`, `+57 300...`), permitían subida `image/svg+xml` con riesgo XSS o simulaban envíos `facebook_graph_api` en cliente sin adaptador servidor. | Guardas RBAC alineadas con `ROUTE_PERMISSIONS`, eliminación de fallback `'ADMIN'` en Automatización (default `'VIEWER'`), enmascaramiento PII por defecto en WhatsApp con toggle explícito, bloqueo SVG XSS y bloqueo de Graph API directo sin SafeMode. | **CORREGIDO Y PROBADO** |

### Medios / Bajos (`P2` / `P3`)

| ID | Sev | Módulo / Archivo | Causa Raíz | Corrección Aplicada | Estado |
|---|---|---|---|---|---|
| `QA-008` | **P2** | Fechas y Parsers (`formatters.ts`, `businessIntelligenceService.ts`, `spreadsheetParser.ts`) | `new Date('YYYY-MM-DD')` generaba corrimiento -1 día en zona horaria COT (UTC-5); CSV no neutralizaba fórmulas ni manejaba multilínea; `URL.revokeObjectURL` inmediato podía cortar descargas. | Parseo local explícito COT (`America/Bogota`), neutralización CSV Formula Injection (`= + - @`), parser RFC-4180 y revocación diferida (`1000 ms`). | **CORREGIDO Y PROBADO** |
| `QA-009` | **P2** | Tests SQL (`supabase/tests/01_rls_and_security_tests.sql`, `02_inventory_multiowner_transactions_tests.sql`) | Referenciaban columnas y valores incompatibles con el esquema real (`actor_email`, `lot_code`, `OWN-QA-1`, inserción directa sobre columna `GENERATED ALWAYS qty_available`, solo 5 buckets). | Alineados al 100% con el esquema real (`OWN-9901/9902`, UUIDs válidos, 7 buckets obligatorios, columnas reales). | **CORREGIDO** (sin Postgres local para ejecución directa) |
| `QA-010` | **P2** | Auth UI & Mobile Header (`AuthScreens.tsx`, `theme.css`) | Faltaba `<h1>`, banner de error sin `role="alert"`, sin botón mostrar/ocultar contraseña, y `.rtw-brand-logo` sufría recorte de `4.7px` en la `M` de `SYSTEM` a `360×800`. | Promoción a `<h1>`, `role="alert"`, botón `Eye/EyeOff` accesible, botones segmentados de `44px` en móvil y ajuste `.rtw-brand-logo` verificado en `360×800` sin recorte. | **CORREGIDO Y VERIFICADO EN LIVE** |
| `QA-011` | **P3** | Bundle Vite (`vite.config.ts`) | `vendor-icons` agrupa `lucide-react` completo en un chunk de `501.07 kB` (`128.61 kB` gzip), superando por `1.07 kB` el umbral informativo de 500 kB raw. | Documentado como mejora de optimización (sin impacto funcional; gzip `128.61 kB`). | **OBSERVACIÓN P3** |

---

## 5. Seguridad, Dependencias y Despliegue Cloudflare

- **Dependencias (`package.json` / `npm.cmd audit --json`):**
  - Actualizadas durante la auditoría: `react-router-dom` `^7.18.6`, `@supabase/supabase-js` `^2.119.1`, `esbuild` `^0.25.12` (dev).
  - Total dependencias analizadas: `173` (`59` prod, `115` dev, `53` optional). Vulnerabilidades (`info`, `low`, `moderate`, `high`, `critical`): **`0`**.
- **Artefactos Cloudflare (`wrangler.jsonc`, `public/_headers`, `public/_redirects`, `public/sw.js`):**
  - `wrangler.jsonc`: configurado con `"assets": { "directory": "./dist", "not_found_handling": "single-page-application" }`.
  - `public/_headers`: cabeceras `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, caché `no-cache` para `/index.html` y `/sw.js`, y caché inmutable para `/assets/*`.
  - `public/sw.js`: no intercepta orígenes externos (`url.origin !== self.location.origin`), evitando cachear respuestas sensibles de Supabase Auth/REST/Storage.
  - Verificación de fuga en `dist/`: `dist/samples/` vacío; ningún Excel real presente en artefactos públicos compilados.
