# GUÍA DE DESPLIEGUE A PRODUCCIÓN — CLOUDFLARE PAGES Y SUPABASE

**Sistema:** REAL TWS COMMERCE SYSTEM  
**Stack Frontend:** React 18 + TypeScript + Vite 6 (`dist/`)  
**Hosting:** Cloudflare Workers Static Assets (conectado a GitHub)  
**Backend / BD / Auth / Storage:** Supabase (PostgreSQL + RLS + Auth + Storage + Edge Functions)

---

## 1. CHECKPOINT OBLIGATORIO ANTES DE PRODUCCIÓN

> **REGLA DE ORO:** No actualizar producción ni aplicar migraciones sin crear primero un **checkpoint** completo:
1. Etiquetar el commit estable en Git (`git tag pre-prod-YYYYMMDD-HHMM`).
2. Ejecutar respaldo completo de base de datos y Storage (ver [BACKUP_AND_RECOVERY_GUIDE.md](./BACKUP_AND_RECOVERY_GUIDE.md)).
3. Verificar localmente:
   - `npm run typecheck` (0 errores)
   - `npm run build` (0 errores, genera `dist/`)
4. Verificar que **no** existan archivos `.env`, `.env.local`, `.env.local.txt` ni credenciales de servicio en el repositorio ni en `dist/`.

---

## 2. CONFIGURACIÓN DE CLOUDFLARE (WORKERS STATIC ASSETS)

1. Conectar el repositorio de **GitHub** en **Cloudflare Dashboard → Workers & Pages → Create → Import a repository**.
2. Configurar los parámetros de compilación y despliegue (reflejados en `wrangler.jsonc`):
   - **Production branch:** `main`
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Build output directory (en `wrangler.jsonc`):** `assets.directory = "./dist"` con `not_found_handling = "single-page-application"`
   - **Environment variable de compilación:** `NODE_VERSION = 20`
3. **Rutas SPA y Cabeceras de Seguridad:**
   - `wrangler.jsonc` define `"not_found_handling": "single-page-application"` para que todas las rutas de React Router (`/operaciones/inventario`, `/finanzas/liquidaciones`, `/gestion/analitica`, etc.) respondan `200 OK` sirviendo `index.html` al recargar.
   - El archivo `public/_headers` aplica `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` y `Cache-Control: no-cache` para `index.html` y `sw.js`.
4. **Control de Despliegue a Producción:**
   - Activar protección de rama en GitHub sobre `main` (requerir revisión y build exitoso antes de mergear).
   - En Cloudflare Pages, activar *Pause automatic deployments* si se requiere ventana de mantenimiento controlada antes de liberar cambios críticos.

---

## 3. VARIABLES DE ENTORNO REQUERIDAS

### A. Variables Públicas en Cloudflare Pages (Frontend Vite)
Configurar **únicamente** estas dos variables en **Cloudflare Pages → Settings → Environment Variables** (para *Production* y *Preview* con proyectos Supabase separados):

| Variable | Uso | Seguridad |
|---|---|---|
| `VITE_SUPABASE_URL` | URL pública del proyecto Supabase (`https://<ref>.supabase.co`) | Pública (segura con RLS activo) |
| `VITE_SUPABASE_ANON_KEY` | Clave pública `anon` de Supabase | Pública (segura con RLS activo) |

### B. Secretos Exclusivos del Servidor (Supabase Secrets / Edge Functions)
**PROHIBIDO** definir cualquiera de estos valores con prefijo `VITE_` o almacenarlos en el navegador:

| Secreto en Supabase (`supabase secrets set`) | Propósito |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Operaciones administrativas exclusivas de Edge Functions |
| `GEMINI_API_KEY` | Adaptador opcional de AI Creative Studio (solo cuando `ENABLE_GEMINI=true`) |
| `META_APP_ID` / `META_APP_SECRET` | OAuth oficial de Facebook Pages e Instagram Content Publishing |
| `META_SYSTEM_USER_TOKEN` | Token cifrado en servidor para Meta Graph API (si se habilita tras aprobación) |
| `WHATSAPP_CLOUD_ACCESS_TOKEN` | Reservado para adaptador futuro WhatsApp Business Platform (desactivado por defecto) |

---

## 4. CONFIGURACIÓN DE SUPABASE (PRODUCCIÓN)

1. **Migraciones No Destructivas (`0001` a `0023`) e Importación Histórica:**
   - El esquema completo puede instalarse en un proyecto limpio desde [REAL_TWS_MASTER_DATABASE_CORREGIDO.sql](../supabase/sql/REAL_TWS_MASTER_DATABASE_CORREGIDO.sql) o aplicando `supabase/migrations/0001` hasta `0023_ui_alignment_and_indexes.sql`.
   - Para cargar los 40 SKUs históricos reales (38 unidades físicas de `OWN-0001`) de forma idempotente en SQL Editor, ejecutar [IMPORT_INVENTARIO_HISTORICO_REAL_TWS.sql](../supabase/sql/IMPORT_INVENTARIO_HISTORICO_REAL_TWS.sql), o subir el archivo directamente desde `/operaciones/importacion`.
   - **Política estricta:** Prohibido ejecutar `DROP SCHEMA`, `DROP DATABASE`, `DROP TABLE` o `TRUNCATE` en producción; todo cambio futuro debe ser aditivo.
2. **Row Level Security (RLS):**
   - Todas las tablas críticas (`profiles`, `owners`, `products`, `product_variants`, `stock_lots`, `stock_lot_ownership`, `stock_movements`, `sales_orders`, `sales_item_allocations`, `financial_expenses`, `owner_settlements`, `automation_jobs`, `audit_logs`) deben mantener `ENABLE ROW LEVEL SECURITY` activo.
   - Verificar que `audit_logs`, `stock_movements` y `automation_logs` conserven sus triggers `append-only` (sin `UPDATE`/`DELETE`).
3. **Authentication:**
   - En **Supabase → Authentication → URL Configuration**:
     - `Site URL`: `https://<tu-dominio-produccion>`
     - `Redirect URLs`: `https://<tu-dominio-produccion>/**`
   - Deshabilitar registro público abierto (`Enable sign ups` controlado por administrador mediante RPC `0011_auth_triggers_anti_escalation_and_admin_rpc.sql`).
4. **Storage (Buckets Privados):**
   - Mantener **privados** los buckets `product-photos`, `purchase-evidences`, `quality-inspections`, `settlement-vouchers` y `brand-assets`.
   - Acceso únicamente mediante URLs firmadas (`createSignedUrl`) o políticas RLS autenticadas por rol/propietario.
5. **Seguridad de Archivos Confidenciales:**
   - La copia estática en `public/samples/REAL_TWS_INVENTARIO_MULTIPROPIETARIO.xlsx` fue eliminada para impedir que Cloudflare Pages sirva datos reales confidenciales al público. El original permanece intacto en `INVENTARIO_REAL_TWS/`.

---

## 5. PWA Y DISEÑO MÓVIL

- `public/manifest.webmanifest` configurado con `name: "REAL TWS"`, `short_name: "REAL TWS"`, `display: "standalone"`, `theme_color: "#0f141c"`.
- Icono SVG vectorial en `public/icons/real-tws-icon.svg`.
- Service Worker `public/sw.js` registrado únicamente en build de producción (`import.meta.env.PROD`), excluyendo expresamente llamadas a Supabase Auth/REST/Storage del caché offline para evitar datos obsoletos o fuga de sesión.
- Layout responsivo validado vía CSS media queries (`@media (max-width: 960px)` en `src/styles/theme.css`).

---

## 6. LISTA DE PRUEBAS DE ACEPTACIÓN EN PRODUCCIÓN (SMOKE TESTS)

Ejecutar sobre el despliegue **Preview** antes de promover a `main` y revalidar tras publicar:

1. **Login y Sesión:** Inicio de sesión con Supabase Auth, persistencia tras recarga (`F5`) y cierre de sesión limpio.
2. **Accesos y Roles (RBAC + RLS):** Verificar que un usuario `OWNER` solo visualiza su inventario/liquidaciones y recibe bloqueo al intentar editar costos, reglas de automatización o roles.
3. **Inventario:** Crear OC, recibir lote asignando propietario explícito, aprobar calidad y verificar movimiento inmutable.
4. **Ventas:** Crear pedido, reservar última unidad (confirmar bloqueo ante segunda reserva concurrente), despachar y procesar devolución conservando propietario.
5. **Propietarios y Liquidaciones:** Contrastar estado de cuenta multipropietario y aprobar gasto compartido con criterio explícito.
6. **Publicaciones y Seguridad:** Confirmar que SKU con stock `0` o en revisión queda bloqueado para publicación.
7. **Mobile & PWA:** Verificar instalación desde Chrome/Edge/Safari móvil y navegación con menú lateral colapsable.
8. **Recuperación de errores:** Simular desconexión de red breve y verificar que `sw.js` y la UI muestran error controlado sin corromper reservas ni duplicar transacciones.

---

## 7. PROCEDIMIENTO DE ROLLBACK (RECUPERACIÓN INMEDIATA)

### Rollback de Frontend (Cloudflare Pages — < 1 minuto)
1. Ir a **Cloudflare Dashboard → Pages → real-tws → Deployments**.
2. Ubicar el último deployment verificado del checkpoint anterior.
3. Hacer clic en **⋮ → Rollback to this deployment**.

### Rollback de Base de Datos (Supabase)
1. **Nunca** ejecutar `supabase db reset` en producción.
2. Si una migración aditiva falla antes de recibir tráfico, revertir puntualmente la vista/función RPC afectada mediante nueva migración correctiva.
3. Si hubo corrupción lógica de datos, restaurar desde el checkpoint PITR (*Point-in-Time Recovery*) o desde el volcado `pg_dump` previo siguiendo [BACKUP_AND_RECOVERY_GUIDE.md](./BACKUP_AND_RECOVERY_GUIDE.md).

---

## 8. ESTADO TÉCNICO DE PRODUCCIÓN

1. **Code Splitting activo:** Todos los módulos en `src/app/AppRouter.tsx` usan `React.lazy()` + `Suspense`, evitando cargar todo el ERP en un único paquete JS inicial.
2. **Guardia de entorno faltante:** Si `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY` no están definidas, `ProtectedRoute.tsx` bloquea el acceso operativo y muestra pantalla informativa de configuración pendiente.
3. **Persistencia híbrida:** Dashboard, Configuración General, Categorías, Auditoría e Importación Excel consultan/persisten directamente contra Supabase respetando RLS; las operaciones de módulos adicionales conservan adaptadores locales mientras se completa su migración RPC integral.
