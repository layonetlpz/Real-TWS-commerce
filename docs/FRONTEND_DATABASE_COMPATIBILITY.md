# COMPATIBILIDAD FRONTEND ↔ BASE DE DATOS SUPABASE — REAL TWS

## 1. Cliente y Tipado
- Cliente tipado en [src/lib/supabase.ts](file:///G:/Mi%20unidad/Real%20TWS/src/lib/supabase.ts) usando `createClient<Database>` con tipos definidos en [src/types/database.types.ts](file:///G:/Mi%20unidad/Real%20TWS/src/types/database.types.ts).
- Variables públicas permitidas en Vite: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (documentadas en [.env.example](file:///G:/Mi%20unidad/Real%20TWS/.env.example)). Nunca `service_role`.

## 2. Llamadas Activas Verificadas en el Código
| Módulo / Archivo Frontend | Operación Supabase | Objeto Destino en PostgreSQL / Storage | Estado |
|---|---|---|---|
| `src/hooks/useAuth.tsx` | `supabase.auth.getSession`, `onAuthStateChange` | Supabase Auth | Conectado |
| `src/services/authService.ts` | `signInWithPassword`, `signOut`, `resetPasswordForEmail`, `updateUser` | Supabase Auth | Conectado |
| `src/services/authService.ts` | `supabase.rpc` | `fn_admin_update_user_role_and_access`, `fn_log_security_event`, `fn_authorize_private_document_access` | Conectado |
| `src/services/authService.ts` | `supabase.storage.from('private-documents').createSignedUrl` | Bucket privado `private-documents` | Conectado |
| `src/services/excelImportEngine.ts` | `supabase.rpc` | `fn_execute_opening_inventory_import_batch` | Conectado (con fallback local) |
| `src/services/supabaseDataBridge.ts` | `supabase.from`, `supabase.rpc` | `owners`, `v_available_inventory`, `business_settings`, `notifications`, `fn_dispatch_idempotent_automation_event` | Puente listo |

## 3. Estado Honesto de Persistencia de Módulos de Dominio
- **Autenticación, Roles y Auditoría de Seguridad:** Operan directamente contra Supabase Auth + `public.profiles` + RPCs cuando `.env.local` está configurado.
- **Puente de Lectura/RPC en Vivo:** Implementado en `src/services/supabaseDataBridge.ts` para consultas directas con RLS.
- **Servicios de Dominio Offline-First (`inventoryPurchaseService`, `financialAccountingService`, `salesOrdersCrmService`, `marketing/*`, `automationEngineService`):** Actualmente mantienen estado operativo en `localStorage` para ejecución inmediata sin servidor. El esquema SQL, RLS y RPCs correspondientes (`0001`–`0022`) ya están creados para completar la migración de lectura/escritura 100% remota por módulo sin cambiar los contratos TypeScript.
