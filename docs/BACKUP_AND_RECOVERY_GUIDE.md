# GUÍA DE RESPALDOS Y RESTAURACIÓN — REAL TWS COMMERCE SYSTEM

Este documento establece el procedimiento estándar para respaldos manuales, exportación con Supabase CLI, exportación CSV de tablas críticas, respaldo de Storage y restauración controlada.

---

## 1. RESPALDO COMPLETO CON SUPABASE CLI (CHECKPOINT PRE-DESPLIEGUE)

Requisitos: `supabase` CLI instalado y autenticado (`supabase login`) con el proyecto vinculado (`supabase link --project-ref <PROJECT_REF>`).

```bash
# 1. Crear carpeta de respaldo con marca de tiempo
mkdir -p backups/$(date +%Y%m%d_%H%M)

# 2. Exportar roles, esquema y datos completos (sin modificar producción)
supabase db dump --linked --role-only -f backups/$(date +%Y%m%d_%H%M)/roles.sql
supabase db dump --linked -f backups/$(date +%Y%m%d_%H%M)/schema.sql
supabase db dump --linked --data-only -f backups/$(date +%Y%m%d_%H%M)/data.sql
```

> **Seguridad:** Guardar la carpeta `backups/` en almacenamiento cifrado fuera de Git (nunca hacer `git add backups/`).

---

## 2. EXPORTACIÓN CSV DE TABLAS CRÍTICAS (AUDITORÍA Y CONTABILIDAD)

Desde `psql` conectado al pooler/directo de Supabase o mediante la consola SQL / BI de REAL TWS, exportar periódicamente (diario o semanal) las tablas maestras y libros inmutables:

```sql
\copy public.owners TO 'owners.csv' CSV HEADER;
\copy public.products TO 'products.csv' CSV HEADER;
\copy public.product_variants TO 'product_variants.csv' CSV HEADER;
\copy public.stock_lots TO 'stock_lots.csv' CSV HEADER;
\copy public.stock_lot_ownership TO 'stock_lot_ownership.csv' CSV HEADER;
\copy public.stock_movements TO 'stock_movements.csv' CSV HEADER;
\copy public.sales_orders TO 'sales_orders.csv' CSV HEADER;
\copy public.sales_item_allocations TO 'sales_item_allocations.csv' CSV HEADER;
\copy public.financial_expenses TO 'financial_expenses.csv' CSV HEADER;
\copy public.owner_settlements TO 'owner_settlements.csv' CSV HEADER;
\copy public.audit_logs TO 'audit_logs.csv' CSV HEADER;
```

Adicionalmente, desde el módulo **Business Intelligence (`/gestion/analitica`)** se pueden descargar en cualquier momento los CSV UTF-8 locales (`CSV General`, `CSV Propietarios`, `CSV SKUs`, `Exportar Subyacentes CSV`) sin costo adicional.

---

## 3. RESPALDO DE SUPABASE STORAGE (BUCKETS PRIVADOS)

Los archivos binarios (fotografías de productos, facturas de compra, evidencias de inspección y comprobantes de liquidación) residen en buckets privados de Supabase Storage y **no** se incluyen en `pg_dump`.

Procedimiento recomendado:
1. Utilizar la herramienta oficial de sincronización S3-compatible de Supabase Storage (con credenciales S3 temporales de solo lectura generadas en *Project Settings → Storage → S3 Access Keys*):
   - Buckets críticos a respaldar:
     - `product-photos`
     - `purchase-evidences`
     - `quality-inspections`
     - `settlement-vouchers`
     - `brand-assets`
2. Ejemplo de respaldo incremental con AWS CLI apuntando al endpoint S3 de Supabase:
```bash
aws s3 sync s3://purchase-evidences ./backups/storage/purchase-evidences --endpoint-url https://<PROJECT_REF>.supabase.co/storage/v1/s3
aws s3 sync s3://settlement-vouchers ./backups/storage/settlement-vouchers --endpoint-url https://<PROJECT_REF>.supabase.co/storage/v1/s3
```

---

## 4. PROCEDIMIENTO DE RESTAURACIÓN CONTROLADA

1. **Nunca restaurar directamente sobre producción sin validar primero en Staging.**
2. Crear o limpiar una instancia Staging de verificación:
   ```bash
   psql "$STAGING_DATABASE_URL" -f backups/<FECHA>/roles.sql
   psql "$STAGING_DATABASE_URL" -f backups/<FECHA>/schema.sql
   psql "$STAGING_DATABASE_URL" -f backups/<FECHA>/data.sql
   ```
3. Verificar conteos e integridad contable en Staging:
   - Sumatoria de `stock_movements` igual a `stock_lot_ownership.qty_physical`.
   - Cero registros duplicados en `idempotency_key`.
   - Saldos de `owner_settlements` conciliados.
4. En caso de requerir restauración en producción, preferir **Supabase Point-in-Time Recovery (PITR)** al minuto exacto previo al incidente, o restaurar hacia un nuevo proyecto Supabase y actualizar `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` en Cloudflare Pages seguido de un Redeploy controlado.
