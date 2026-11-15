# RESPALDOS Y RESTAURACIÓN — REAL TWS (SUPABASE)

Ver también [BACKUP_AND_RECOVERY_GUIDE.md](./BACKUP_AND_RECOVERY_GUIDE.md).

## Resumen Operativo
1. **Respaldo lógico completo (Pre-despliegue):**
   ```bash
   supabase db dump --linked --role-only -f roles.sql
   supabase db dump --linked -f schema.sql
   supabase db dump --linked --data-only -f data.sql
   ```
2. **Exportación CSV de tablas críticas:** `owners`, `products`, `product_variants`, `stock_lots`, `stock_lot_ownership`, `stock_movements`, `sales_orders`, `sales_item_allocations`, `financial_expenses`, `owner_settlements`, `audit_logs`.
3. **Respaldo de Storage:** Sincronización S3-compatible de los buckets privados `product-originals`, `invoices`, `owner-documents`, `marketing-assets`, `private-documents`.
4. **Restauración:** Validar primero en instancia **Staging** (`psql "$STAGING_DATABASE_URL"`), verificar invariantes de stock y saldos, y en producción usar **Point-in-Time Recovery (PITR)** antes de restaurar volcados manuales.
