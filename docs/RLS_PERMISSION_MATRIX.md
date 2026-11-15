# MATRIZ DE PERMISOS RLS — REAL TWS COMMERCE SYSTEM

Todas las tablas de `public` tienen `ENABLE ROW LEVEL SECURITY`. Las vistas usan `WITH (security_invoker = true)` para heredar el RLS del usuario autenticado.

| Dominio / Tablas | ADMIN | INVENTORY_OPERATOR | SALES_OPERATOR | MARKETING_OPERATOR | OWNER | VIEWER |
|---|---|---|---|---|---|---|
| `profiles` | Full | Lectura propio | Lectura propio | Lectura propio | Lectura propio | Lectura propio |
| `business_settings`, `audit_logs` | Full / Lectura | Lectura | Lectura | Lectura | Denegado (settings) | Lectura (settings) |
| `owners`, `owner_agreements`, `owner_settlements`, `owner_payment_records` | Full | Lectura limitada | Lectura limitada | Denegado | **Solo propios (`fn_can_owner_view`)** | Lectura autorizada |
| `products`, `product_variants`, `categories` | Full | Full | Lectura | Lectura / Media | Lectura | Lectura |
| `purchase_orders`, `purchase_receipts`, `stock_lots`, `lot_owner_allocations`, `stock_movements`, `stock_adjustments` | Full | Full (insert inmutable en kardex) | Lectura / Reserva | Lectura | **Solo lotes propios** | Lectura |
| `customers`, `leads`, `sales_orders`, `sales_item_allocations`, `payments`, `shipments`, `returns` | Full | Lectura / Despacho | Full | Lectura | **Solo líneas atribuibles propias** | Lectura |
| `expenses`, `expense_allocations`, `cost_records`, `price_history` | Full | Lectura / Recepción | Lectura precios | Lectura precios | **Solo propios** | Lectura |
| `marketing_assets`, `content_calendar`, `publications`, `ads_campaigns`, `ads_campaign_metrics` | Full | Lectura | Lectura | Full | Lectura propios | Lectura |
| `automation_jobs`, `automation_event_queue`, `automation_logs` | Full | Lectura | Lectura | Lectura | **Bloqueado** | Lectura |

## Buckets de Storage
- `product-public`: Lectura `anon`/`authenticated`; escritura `ADMIN` / `INVENTORY_OPERATOR` / `MARKETING_OPERATOR`.
- `product-originals` e `invoices`: Privados (`ADMIN` / `INVENTORY_OPERATOR`).
- `marketing-assets`: Controlado (`ADMIN` / `MARKETING_OPERATOR`).
- `owner-documents`: Privado con aislamiento por prefijo `<owner_id>/...` (`fn_can_owner_view(split_part(name, '/', 1))`).
