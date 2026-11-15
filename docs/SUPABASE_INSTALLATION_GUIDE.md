# Guía de Limpieza e Instalación Limpia de REAL TWS en Supabase

Esta guía explica cómo limpiar de forma segura la instalación parcial anterior de **REAL TWS** en tu proyecto de **Supabase** existente y ejecutar una instalación limpia desde cero usando los dos scripts generados en `supabase/sql/`:

1. [`01_CLEANUP_PREVIOUS_REAL_TWS.sql`](../supabase/sql/01_CLEANUP_PREVIOUS_REAL_TWS.sql)
2. [`02_REAL_TWS_SETUP.sql`](../supabase/sql/02_REAL_TWS_SETUP.sql)

> [!CAUTION]
> **NO ejecutes el script de limpieza sin revisar primero el inventario de objetos a eliminar.** Aunque el script no borra usuarios (`auth.users`), archivos ni buckets de Storage ni tablas ajenas a REAL TWS, sí elimina las tablas propias de REAL TWS y cualquier fila que ya existiera dentro de ellas.

---

## 1. Qué elimina `01_CLEANUP_PREVIOUS_REAL_TWS.sql`

El script `01_CLEANUP_PREVIOUS_REAL_TWS.sql` es **100% idempotente** (`IF EXISTS`) y elimina **exclusivamente** los objetos propios de REAL TWS en orden seguro de dependencias:

1. **Trigger sobre `auth.users` (1):**
   - `trg_on_auth_user_created` (solo el trigger; **no** elimina usuarios de `auth.users`).
2. **Políticas RLS propias en `storage.objects` (9):**
   - `pol_private_docs_admin_operator`, `pol_public_catalog_media_read`, `pol_public_catalog_media_write`, `pol_product_public_read`, `pol_product_public_write`, `pol_product_originals_priv`, `pol_marketing_assets_priv`, `pol_owner_docs_read`, `pol_owner_docs_admin_write`.
3. **Vistas de REAL TWS (13):**
   - `v_marketing_summary`, `v_settlements_summary`, `v_product_costs_summary`, `v_sales_summary`, `v_purchase_summary`, `v_available_inventory`, `v_sales_order_profitability`, `v_report_inventory_by_quality_state`, `v_report_inventory_by_category`, `v_public_available_catalog`, `v_owner_financial_pnl`, `v_inventory_by_owner_and_lot`, `v_inventory_consolidated_by_sku`.
4. **Tablas de REAL TWS (65):**
   - Incluye las 65 tablas de todos los módulos (identidad/propietarios, catálogo, compras/proveedores, inventario/lotes/inspecciones, ventas/CRM/envíos/devoluciones, finanzas/gastos/liquidaciones, marketing/marca/estudio creativo/publicaciones/WhatsApp/Meta Ads, automatizaciones, auditoría, importación Excel y configuración). Al eliminar cada tabla con `DROP TABLE IF EXISTS ... CASCADE`, PostgreSQL elimina automáticamente sus triggers, índices, constraints y políticas RLS propias (como `pol_profiles_select` y `pol_profiles_admin_all` sobre `public.profiles`).
5. **Funciones de REAL TWS (36):**
   - Las 35 funciones/RPCs/triggers del esquema (`fn_set_updated_at`, `fn_prevent_ledger_mutation`, `fn_current_user_role`, `fn_is_admin`, `fn_is_operator_or_admin`, `fn_can_manage_sales`, `fn_can_manage_marketing`, `fn_is_sales_or_above`, `fn_can_owner_view`, `fn_record_audit_log`, `fn_record_quality_inspection`, `fn_allocate_sale_item_to_lot`, `fn_execute_ownership_transfer`, `fn_create_owner_settlement`, `fn_prevent_profile_self_escalation`, `fn_handle_new_auth_user`, `fn_admin_update_user_role_and_access`, `fn_log_security_event`, `fn_authorize_private_document_access`, `fn_execute_opening_inventory_import_batch`, `fn_tx_receive_purchase_order`, `fn_tx_reserve_stock`, `fn_tx_release_reservation`, `fn_tx_dispatch_stock`, `fn_tx_process_customer_return`, `fn_tx_record_inventory_adjustment`, `fn_allocate_approved_expense`, `fn_guard_unconfirmed_order_item_edit`, `fn_tx_reserve_order_allocations`, `fn_tx_cancel_sales_order`, `fn_validate_creative_studio_project`, `fn_validate_social_publication_rules`, `fn_validate_whatsapp_buyer_message_security`, `fn_enforce_meta_ads_control_rules`, `fn_dispatch_idempotent_automation_event`) más `fn_safe_ensure_policy` si quedó de un intento anterior de `SUPABASE_SETUP_ALL.sql`.
6. **Tipo ENUM personalizado (1):**
   - `public.app_role`.

---

## 2. Qué se preserva intacto

`01_CLEANUP_PREVIOUS_REAL_TWS.sql` **NO** ejecuta `DROP SCHEMA public CASCADE`, **NO** usa `TRUNCATE` y **NO** toca:

- Usuarios ni sesiones en `auth.users` o esquemas internos (`auth`, `storage`, `realtime`, `vault`, etc.).
- Extensiones instaladas en la base de datos (como `pgcrypto`).
- Buckets existentes en `storage.buckets` ni archivos físicos en `storage.objects`.
- Cualquier tabla, vista, función o tipo en `public` que no pertenezca a la lista de REAL TWS.

---

## 3. Qué crea `02_REAL_TWS_SETUP.sql`

Ejecutado sobre la base limpia tras el paso anterior, `02_REAL_TWS_SETUP.sql` instala en una sola transacción:

- **Tipo `public.app_role` consolidado** con los 6 roles desde el inicio (`ADMIN`, `INVENTORY_OPERATOR`, `SALES_OPERATOR`, `MARKETING_OPERATOR`, `OWNER`, `VIEWER`), evitando errores de `ALTER TYPE ... ADD VALUE` dentro de transacciones.
- **65 tablas** con `ENABLE ROW LEVEL SECURITY` activado en todas ellas.
- **35 funciones** (helpers de seguridad/RLS, triggers de auditoría/inmutabilidad/anti-escalación y procedimientos transaccionales RPC).
- **51 triggers** (incluyendo `trg_on_auth_user_created` sobre `auth.users`), todos definidos **después** de sus funciones.
- **13 vistas** operativas y de Business Intelligence.
- **121 políticas RLS** limpias (sin duplicados, sin `fn_safe_ensure_policy` y sin escritura pública anónima en Storage).
- **Buckets de Storage** con `ON CONFLICT (id) DO NOTHING`.
- **Baseline inicial limpio:**
  - Propietario inicial `OWN-0001` (`Eberto`, estado `active`) y acuerdo `AGR-0001` (`pending_configuration`).
  - Conexiones sociales en `social_connections` (redes/APIs externas deshabilitadas por defecto).
  - Las 7 incidencias reales detectadas en la auditoría inicial (`INC-001` a `INC-007`) y fila inicial en `business_settings`.
  - **Sin** usuarios administradores falsos, productos inventados, ventas ficticias ni clientes demo.

---

## 4. Respaldo previo recomendado

Antes de ejecutar `01_CLEANUP_PREVIOUS_REAL_TWS.sql`:

1. **Snapshot del proyecto (Supabase Dashboard):**
   - Si tu plan incluye *Backups*, ve a **Database → Backups** y verifica el último respaldo o genera un respaldo manual.
2. **Respaldo lógico con `pg_dump` / Supabase CLI (opcional desde tu equipo):**
   ```bash
   supabase db dump -f backup_pre_cleanup.sql
   ```
3. **Exportación rápida de datos previos (si cargaste algo en el intento anterior):**
   - En **Table Editor** de Supabase, exporta a CSV cualquier tabla de `public` que ya tuviera datos que quieras conservar antes de limpiar.

---

## 5. Orden de ejecución en Supabase SQL Editor

1. Abre tu proyecto en **Supabase Dashboard → SQL Editor**.
2. **Paso 1 — Limpieza:**
   - Copia y pega el contenido completo de [`supabase/sql/01_CLEANUP_PREVIOUS_REAL_TWS.sql`](../supabase/sql/01_CLEANUP_PREVIOUS_REAL_TWS.sql).
   - Ejecuta con **Run**. Debe completar con `Success. No rows returned`.
3. **Paso 2 — Instalación limpia:**
   - Abre una **nueva pestaña** en SQL Editor.
   - Copia y pega el contenido completo de [`supabase/sql/02_REAL_TWS_SETUP.sql`](../supabase/sql/02_REAL_TWS_SETUP.sql).
   - Ejecuta con **Run**. Debe completar con `Success` sin errores de políticas duplicadas (`42710`) ni parámetros de `RAISE`.

---

## 6. Consultas de verificación post-instalación

Ejecuta estas consultas en **SQL Editor** después de `02_REAL_TWS_SETUP.sql` para confirmar que todo quedó instalado correctamente:

```sql
-- 1. Verificar cantidad de tablas en public (esperado: >= 65)
SELECT count(*) AS total_tablas_public
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- 2. Verificar cantidad de vistas en public (esperado: >= 13)
SELECT count(*) AS total_vistas_public
FROM information_schema.views
WHERE table_schema = 'public';

-- 3. Verificar que TODAS las tablas de public tengan RLS habilitado (esperado: 0 filas)
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;

-- 4. Verificar políticas de public.profiles (esperado: pol_profiles_admin_all y pol_profiles_select)
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

-- 5. Verificar roles del ENUM app_role (esperado: 6 valores)
SELECT unnest(enum_range(NULL::public.app_role)) AS app_role_value;

-- 6. Verificar buckets de Storage
SELECT id, name, public
FROM storage.buckets
ORDER BY id;

-- 7. Verificar propietario baseline (esperado: OWN-0001 = Eberto)
SELECT id, full_name, status FROM public.owners WHERE id = 'OWN-0001';
```

---

## 7. Cómo crear el primer usuario ADMIN de forma segura

`02_REAL_TWS_SETUP.sql` **no** inserta usuarios ni contraseñas en `auth.users`. Para crear tu primer administrador:

1. Ve a **Supabase Dashboard → Authentication → Users → Add user → Create new user** (o regístrate desde el login de tu aplicación).
2. Al crearse el usuario en `auth.users`, el trigger `trg_on_auth_user_created` creará automáticamente su fila en `public.profiles` con el rol por defecto (sin privilegios de administrador).
3. Copia el **User UID** del usuario recién creado y ejecuta en **SQL Editor**:

```sql
UPDATE public.profiles
SET role = 'ADMIN',
    is_active = true
WHERE id = 'PEGAR-AQUI-EL-UUID-DEL-USUARIO';
```

4. Verifica el cambio:

```sql
SELECT id, email, role, is_active
FROM public.profiles
WHERE id = 'PEGAR-AQUI-EL-UUID-DEL-USUARIO';
```

---

## 8. Resolución de problemas frecuentes

- **`ERROR: 42710: policy ... already exists`:** Significa que no se ejecutó `01_CLEANUP_PREVIOUS_REAL_TWS.sql` antes de `02_REAL_TWS_SETUP.sql`, o quedó una política previa en `storage.objects`. Ejecuta `01_CLEANUP_PREVIOUS_REAL_TWS.sql` nuevamente (es idempotente) y vuelve a correr `02_REAL_TWS_SETUP.sql`.
- **`ERROR: cannot drop ... because other objects depend on it`:** No debería ocurrir porque `01_CLEANUP_PREVIOUS_REAL_TWS.sql` usa `CASCADE` y orden inverso de dependencias; si ocurre sobre un objeto personalizado ajeno, revisa qué objeto externo depende de él antes de continuar.
- **Validación realizada en este entorno:** Se ejecutó validación estática automatizada con Node.js verificando ausencia de sentencias prohibidas (`DROP SCHEMA`, `TRUNCATE`, borrado de `auth.users`/`storage.objects`/`storage.buckets`), cobertura completa entre `01` y `02`, `ENABLE ROW LEVEL SECURITY` en las 65 tablas, 0 políticas/triggers duplicados, orden función-antes-trigger en los 51 triggers y balance de bloques `$$`. En esta máquina no hay `psql`, `docker` ni `supabase` CLI instalados, por lo que la ejecución real en PostgreSQL se realiza directamente en tu SQL Editor de Supabase.
