# DICCIONARIO DE BASE DE DATOS — REAL TWS COMMERCE SYSTEM

Esquema PostgreSQL consolidado en `supabase/migrations/0001` a `0022`.

## A. Seguridad y Configuración
- `public.profiles`: Perfil RBAC vinculado 1:1 a `auth.users(id)` (`role`: `ADMIN`, `INVENTORY_OPERATOR`, `SALES_OPERATOR`, `MARKETING_OPERATOR`, `OWNER`, `VIEWER`; `linked_owner_id`, `is_active`).
- `public.business_settings`: Parámetros globales REAL TWS (`currency_code = 'COP'`, interruptores de IA/Meta/WhatsApp).
- `public.audit_logs`: Bitácora inmutable `append-only` (bloqueado `UPDATE`/`DELETE` por `fn_prevent_ledger_mutation`).
- `public.notifications`: Alertas internas del motor de automatizaciones.

## B. Propietarios
- `public.owners`: Registro maestro de propietarios (`OWN-0001` = `Eberto`).
- `public.owner_agreements`: Acuerdos económicos, comisiones, método de liquidación y política de gastos compartidos.
- `public.owner_product_terms`: Precio mínimo, descuento máximo y autorización promocional por propietario/SKU.
- `public.ownership_transfers`: Transferencias auditadas de propiedad entre dueños sobre un lote.

## C. Catálogo
- `public.categories`: Categorías maestras de productos.
- `public.products`: Productos base independientes del propietario.
- `public.product_variants`: Matriz de variantes y `sku` único universal.
- `public.product_media`: Referencias a buckets `product-originals`, `product-public`, `marketing-assets`.

## D. Proveedores, Compras e Inventario
- `public.suppliers`: Proveedores registrados.
- `public.purchase_orders` / `public.purchase_order_items`: Órdenes de compra y líneas por SKU/propietario.
- `public.purchase_receipts` / `public.purchase_receipt_lines`: Recepciones físicas de mercancía.
- `public.stock_lots`: Lotes físicos trazables.
- `public.lot_owner_allocations`: Saldos segregados por `(lot_id, sku, owner_id)` con `qty_physical`, `qty_good`, `qty_defective`, `qty_pending_inspection`, `qty_reserved`, `qty_available` y costos unitarios.
- `public.quality_inspections`, `public.stock_reservations`, `public.stock_adjustments`, `public.inventory_incidences`.
- `public.stock_movements`: Kardex inmutable `append-only` con `idempotency_key` único.

## E. Finanzas, Ventas y Liquidaciones
- `public.cost_records`, `public.price_history` (inmutable), `public.expenses`, `public.expense_allocations`.
- `public.customers`, `public.leads`, `public.lead_followups`.
- `public.sales_orders`, `public.sales_order_items`, `public.sales_item_allocations` (conserva `lot_id`, `owner_id`, `unit_cost_cop` histórico).
- `public.payments`, `public.shipments`, `public.returns`, `public.sales_return_items`.
- `public.owner_settlements`, `public.owner_settlement_items`, `public.owner_payment_records`.

## F. Marketing, Publicidad y Automatizaciones
- `public.brand_identity_versions`, `public.merchandising_asset_versions`, `public.owner_marketing_consents`, `public.creative_studio_projects`, `public.creative_studio_project_assets`.
- `public.marketing_assets`, `public.content_calendar`, `public.publications`, `public.marketplace_assisted_listings`, `public.social_connections`.
- `public.whatsapp_message_templates`, `public.whatsapp_sales_interactions`, `public.whatsapp_platform_future_adapters`.
- `public.ads_campaigns`, `public.ads_ad_sets`, `public.ads_creatives_and_ads`, `public.ads_campaign_metrics`, `public.ads_owner_spend_allocations`, `public.sales_attribution`.
- `public.automation_jobs`, `public.automation_event_queue`, `public.automation_logs` (inmutable).
