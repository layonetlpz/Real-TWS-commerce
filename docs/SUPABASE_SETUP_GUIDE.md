# GUÍA DE CONFIGURACIÓN E INSTALACIÓN DE SUPABASE — REAL TWS

## 1. Crear y Conectar el Proyecto Supabase
1. Crear un proyecto nuevo en [supabase.com](https://supabase.com) (región recomendada: `us-east-1`).
2. Copiar **Project URL** y **anon / publishable key** (jamás usar `service_role` en el frontend).
3. En local, renombrar `.env.example` a `.env.local` y completar:
   ```env
   VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
   VITE_SUPABASE_ANON_KEY=<tu-anon-key>
   ```
4. En **Cloudflare Pages → Settings → Environment Variables**, registrar exactamente las mismas dos variables.

## 2. Métodos de Instalación del Esquema (Elegir SOLO UNO)

> **IMPORTANTE:** `supabase/migrations/` y `supabase/sql/SUPABASE_SETUP_ALL.sql` son **métodos alternativos**. **NO** ejecutes ambos sobre la misma base de datos.

### Opción A: Supabase CLI (`supabase/migrations/`)
```bash
supabase link --project-ref <PROJECT_REF>
# Preinspección de solo lectura si el proyecto no está vacío:
# Ejecutar supabase/tests/00_preinspection_remote.sql en SQL Editor
supabase db push
```

### Opción B: SQL Editor (`supabase/sql/SUPABASE_SETUP_ALL.sql`)
1. Abrir **Supabase Dashboard → SQL Editor → New Query**.
2. Ejecutar primero `supabase/tests/00_preinspection_remote.sql` para verificar estado actual.
3. Pegar y ejecutar `supabase/sql/SUPABASE_SETUP_ALL.sql` (contiene las migraciones `0001` a `0022` en orden de dependencias).
4. Ejecutar `supabase/seed.sql` si se desea re-verificar `OWN-0001` (Eberto) y `business_settings` (idempotente).

## 3. Crear el Primer Usuario Administrador de Forma Segura
1. En **Supabase → Authentication → Users → Add user**, crear el usuario administrador con correo y contraseña fuerte.
2. El trigger `fn_handle_new_auth_user` creará automáticamente su perfil en `public.profiles` con rol de mínimo privilegio (`OWNER` / inactivo o básico).
3. Promover manualmente al primer administrador **una sola vez** desde SQL Editor:
   ```sql
   UPDATE public.profiles
   SET role = 'ADMIN', is_active = true
   WHERE email = '<correo-admin>';
   ```
4. Deshabilitar registro público abierto en **Authentication → Providers → Email**. Los usuarios posteriores deben gestionarse desde `/gestion/usuarios` vía `fn_admin_update_user_role_and_access`.

## 4. Generar Tipos TypeScript
```bash
npx supabase gen types typescript --project-id <PROJECT_REF> > src/types/database.types.ts
```

## 5. Verificar Tablas y Ejecutar Pruebas SQL
1. Verificar tablas, vistas y buckets ejecutando `supabase/tests/00_preinspection_remote.sql`.
2. Ejecutar las pruebas transaccionales (se revierten con `ROLLBACK` sin dejar datos):
   - `supabase/tests/01_rls_and_security_tests.sql`
   - `supabase/tests/02_inventory_multiowner_transactions_tests.sql`
