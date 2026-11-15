# HISTORIAL DE CAMBIOS (CHANGELOG) — REAL TWS COMMERCE SYSTEM

Todos los cambios notables en la arquitectura, base de datos, documentación y código de **REAL TWS COMMERCE SYSTEM** se registran en este archivo.

---

## [1.5.0] - 2026-11-14 — Fase 9B: Implementación de BUSINESS INTELLIGENCE

### Agregado
- **Servicio de Consolidación y Auditoría BI (`src/services/businessIntelligenceService.ts`)**:
  - Agregación sin duplicación (deduplicación por ID) de transacciones reales desde inventario, finanzas, pedidos/CRM, social/marketplace, WhatsApp y Meta Ads.
  - Exclusión estricta de pedidos no confirmados (`draft`, `reserved`) de los ingresos realizados, presentándolos por separado como `ESTIMACION_NO_REALIZADA`.
  - Tratamiento neto de devoluciones, separación entre ventas y utilidad, registro de origen de datos, fórmulas y criterios/fechas aplicados.
  - Exportación local gratuita a CSV (con BOM UTF-8) y reporte ejecutivo PDF imprimible sin servicios pagos.
- **Módulo Ejecutivo (`/gestion/analitica`) (`src/modules/management/BusinessIntelligenceModule.tsx`)**:
  - 4 Dashboards ejecutivos: **Dashboard General**, **Dashboard Multipropietario**, **Dashboard Comercial & SKUs** y **Analítica de Marketing**, más pestaña de **Contraste Subyacente** con trazabilidad registro por registro.
  - 10 gráficas interactivas con Recharts (ventas diarias, semanales, mensuales, por SKU, por propietario, costos, utilidad, existencias, estados de pedido y rendimiento de canales) y 8 filtros multidimensionales.

---

## [1.4.0] - 2026-11-14 — Fase 9A: Implementación de AUTOMATION ENGINE

### Agregado
- **Migración SQL `0021_automation_engine_orchestrator.sql` (`supabase/migrations/`)**:
  - Ampliación de `public.automation_jobs` para soportar los **14 eventos oficiales** (`RECEIPT_CONFIRMED`, `PRODUCT_APPROVED`, `STOCK_LOW`, `STOCK_OUT`, `PRICE_CHANGED`, `OWNER_ALLOCATION_CHANGED`, `ORDER_CREATED`, `ORDER_CONFIRMED`, `ORDER_CANCELLED`, `ORDER_DISPATCHED`, `RETURN_COMPLETED`, `CONTENT_APPROVED`, `CONTENT_PUBLISHED`, `AD_PERFORMANCE_IMPORTED`) y las **7 acciones internas permitidas**.
  - Tabla `public.automation_event_queue` con clave única `idempotency_key`, clasificación de errores (`TRANSIENT_ERROR` vs `PERMANENT_ERROR`), contador de reintentos limitados (`max_retries = 3`) y estado de job.
  - Trigger de inmutabilidad `trg_automation_logs_immutable` sobre `public.automation_logs` y función RPC `public.fn_dispatch_idempotent_automation_event`.
- **Motor y Orquestador de Automatizaciones (`src/services/automationEngineService.ts`, `src/modules/management/AutomationEngineModule.tsx`)**:
  - **Orquestación de los 14 Eventos y 7 Acciones Internas (`/gestion/automatizaciones`):** Actualizar proyecciones de inventario, Generar alertas, Marcar contenido desactualizado, Preparar borradores, Actualizar indicadores, Registrar oportunidades comerciales y Preparar reportes por propietario.
  - **Cumplimiento estricto de las 10 Reglas Críticas:** Cero doble ejecución (`idempotency_key`), cero doble descuento de stock, cero pagos automáticos, cero liquidación automática, cero mensajes masivos, cero publicación sin autorización, cero cambio automático de precios, cero aumento de presupuesto publicitario y libro histórico inmutable.
  - **Suite Automatizada de Pruebas (`runAutomationEngineVerificationSuite`):** Verifica en sandbox aislado los 14 eventos, bloqueo de doble ejecución, recuperación de fallo transitorio, detención inmediata de fallo permanente, permisos RBAC y cero duplicación económica o de stock.

---

## [1.3.0] - 2026-11-14 — Fase 8D: Implementación de META ADS CONTROL CENTER

### Agregado
- **Migración SQL `0020_meta_ads_control_center.sql` (`supabase/migrations/`)**:
  - Ampliación de `public.ads_campaigns` y `public.ads_campaign_metrics` con etiqueta de origen del dato (`MANUAL_ENTRY`, `CSV_ADS_MANAGER_IMPORT`, `META_API_SYNCED`), CPA objetivo, precio anunciado snapshot, separación estricta entre conversaciones de WhatsApp (`whatsapp_conversations`) y compras reales (`attributed_orders_count`) y autorización explícita del propietario (`owner_deduction_authorized`).
  - Tablas `public.ads_ad_sets` (Conjuntos de anuncios), `public.ads_creatives_and_ads` (Anuncios y creatividades vinculadas a SKU y propietario) y `public.ads_owner_spend_allocations` (Atribución multipropietario del gasto publicitario).
  - Trigger `trg_enforce_meta_ads_control_rules` (`public.fn_enforce_meta_ads_control_rules`) que bloquea descontar publicidad de un propietario sin autorización explícita o sin que su acuerdo comercial esté configurado y activo.
- **Motor y Centro Operativo de Control de Meta Ads (`src/services/metaAdsControlService.ts`, `src/modules/marketing/MetaAdsControlModule.tsx`)**:
  - **Dashboard de Campañas, Conjuntos, Anuncios y Creatividades (`/marketing/meta-ads`):** Registro manual vinculado a SKU y propietario, control de presupuestos, pausa manual con aprobación humana obligatoria y distinción clara entre datos manuales, importados por CSV y sincronizados por API.
  - **Importador CSV de Ads Manager y Métricas:** Carga de informes CSV exportados de Ads Manager, cálculo automático de **CPA por compra**, **ROAS**, **Contribución Neta** y **Rentabilidad por Producto (SKU), Propietario y Canal** sin confundir conversaciones con compras.
  - **Motor de las 6 Alertas Inteligentes (`evaluateMetaAdsSmartAlerts`):** Presupuesto agotado, CPA superior al objetivo, Producto sin stock, Precio desactualizado, Conversaciones sin ventas y Resultado rentable que merece evaluación.
  - **Adaptador Futuro Meta Marketing API (`META_MARKETING_API_OFFICIAL_ADAPTER_V20`):** Preparado con secretos en servidor (`SUPABASE_VAULT_META_MARKETING_API_TOKEN`) y desactivado inicialmente (`isEnabled: false`).

---

## [1.2.0] - 2026-11-14 — Fase 8C: Implementación de WHATSAPP SALES CENTER

### Agregado
- **Migración SQL `0019_whatsapp_sales_center.sql` (`supabase/migrations/`)**:
  - Tabla `public.whatsapp_message_templates` para las **10 plantillas oficiales** (`PRECIO`, `CARACTERISTICAS`, `DISPONIBILIDAD`, `ENVIO`, `PAGO`, `GARANTIA`, `PEDIDO`, `CONFIRMACION`, `SEGUIMIENTO`, `POSTVENTA`) más `BIENVENIDA` y `AUSENCIA`.
  - Tabla `public.whatsapp_sales_interactions` para auditar mensajes preparados, enlaces `wa.me`, permiso de contacto (`contact_permission_granted = true`) y bloqueo de envíos masivos o automatización no oficial.
  - Tabla `public.whatsapp_platform_future_architecture` con restricciones `CHECK` que garantizan `cloud_api_connection_enabled = false`, `phone_number_migrated = false`, `automatic_message_sending_enabled = false` y `billing_or_paid_tier_enabled = false`.
  - Trigger `trg_validate_whatsapp_buyer_message_security` (`public.fn_validate_whatsapp_buyer_message_security`) que bloquea revelar datos internos de propietarios (`OWN-0001`, costos privados) a compradores o confirmar pagos sin comprobante (`payment_voucher_proof_ref`).
- **Motor y Centro Operativo de Ventas por WhatsApp (`src/services/whatsappSalesCenterService.ts`, `src/modules/marketing/WhatsAppSalesCenterModule.tsx`)**:
  - **Catálogo Conectado y Disponibilidad Interna (`/marketing/whatsapp`):** Consulta en tiempo real de precios aprobados, stock disponible y tabla exclusiva interna de desglose por propietario y lote (oculta siempre en los mensajes al comprador).
  - **10 Plantillas Comerciales + Respuestas Rápidas + Bienvenida y Ausencia:** Generación dinámica y copia en 1 clic con enlaces oficiales `https://wa.me/...`.
  - **Prospectos, Seguimiento, Pedidos e Historial de Clientes:** Creación directa de prospectos, notas de seguimiento CRM, creación asistida de pedidos con reserva de stock (pago en estado `pending` hasta verificar comprobante) e historial comercial completo.
  - **Arquitectura Futura Independiente (`WABA_CLOUD_API_FUTURE_ADAPTER_V2`):** Diseño arquitectónico desacoplado para WhatsApp Business Platform sin activar conexión ni cobros.

---

## [1.1.0] - 2026-11-14 — Fase 8B: Implementación de SOCIAL & MARKETPLACE DISTRIBUTION

### Agregado
- **Migración SQL `0018_social_and_marketplace_distribution.sql` (`supabase/migrations/`)**:
  - Tabla `public.marketplace_assisted_listings` con RLS activo/forzado para la preparación y asistencia manual de publicaciones de Marketplace (título, descripción, imagen, precio aprobado, categoría, ubicación, enlace `wa.me`, control de stock/propietario, historial y registro de URL publicada).
  - Ampliación de `public.content_calendar`, `public.publications` y `public.social_connections` con huella anti-duplicados (`dedup_fingerprint`), estado OAuth en servidor, respuesta Graph API (`api_response_metadata`) y banderas de seguridad (`browser_automation_blocked = true`, `password_collection_blocked = true`).
  - Trigger `trg_validate_social_publication_rules` (`public.fn_validate_social_publication_rules`) que bloquea publicar contenido rechazado, inventario agotado (`<= 0`), productos pendientes de inspección (`> 0`), precios inferiores al mínimo o sin autorización del propietario.
- **Motor y Módulo de Distribución Social y Marketplace (`src/services/socialMarketplaceService.ts`, `src/modules/marketing/SocialMarketplaceModule.tsx`)**:
  - **Marketplace Asistido (`/marketing/marketplace`):** Preparación validada, copia en un clic (título, precio, descripción, enlace de contacto), descarga de imagen PNG 1:1, flujo de aprobación y registro de URL publicada.
  - **Calendario Editorial y Social Publisher (`/marketing/social-publisher`):** Vistas **Diaria**, **Semanal** y **Mensual**, cola de aprobación humana, vista previa visual para Instagram y Facebook, detección de duplicados y registro de Post ID / Media ID y URL publicada.
  - **Adaptadores Oficiales Separados (`facebook_graph_api` e `instagram_graph_api`):** Conexión OAuth con referencias de token en servidor (`SUPABASE_VAULT_*`), verificación de cuenta profesional elegible para Instagram Content Publishing, control de cuotas diarias/24h y desconexión inmediata.
  - **WhatsApp Status (`/marketing/whatsapp`):** Preparación de imágenes verticales `9:16` (`1080×1920 px`) y textos con enlace `wa.me` para compartición manual.
  - **Seguridad y Modo Prueba Sin Publicación Externa (`runSocialMarketplaceSafetyTests`):** Interruptor de modo seguro activo para impedir publicaciones externas durante las pruebas.

---

## [1.0.0] - 2026-11-14 — Fase 8: Implementación de AI CREATIVE & ADVERTISING STUDIO

### Agregado
- **Migración SQL `0017_ai_creative_and_advertising_studio.sql` (`supabase/migrations/`)**:
  - Tabla `public.owner_marketing_consents` con RLS activo/forzado para registrar el consentimiento comercial explícito de cada propietario (`owner_id` + `sku`, canales autorizados y descuento máximo permitido) antes de promocionar su mercancía.
  - Tablas `public.creative_studio_projects` y `public.creative_studio_project_versions` (con trigger de inmutabilidad `trg_creative_project_versions_immutable` para conservar la versión original `v1` y cada versión posterior junto con imagen original intacta, composición final, copywriting y guiones de video).
  - Trigger de validación estricta `trg_validate_creative_studio_project` (`public.fn_validate_creative_studio_project`) que impide guardar proyectos creativos sin consentimiento del propietario, sin precio comercial aprobado (`> 0`), sin stock disponible (`> 0`) o con descuentos fuera del acuerdo.
- **Motor y Estudio Creativo (`src/services/creativeStudioService.ts`, `src/modules/marketing/CreativeStudioModule.tsx`)**:
  - **A. Copywriting Multicanal:** Generador determinístico de **5 variantes de título**, **5 variantes de texto publicitario**, **3 descripciones cortas**, **3 llamadas a la acción** y textos optimizados para **Marketplace**, **Facebook**, **Instagram** y **WhatsApp**.
  - **B. Video & Storyboard:** Generador de guiones completos de **10, 15, 30 y 45 segundos** con storyboard por escenas, narración (voz en off), subtítulos, texto en pantalla y llamada a la acción.
  - **C & D. Image Composer + Brand Kit:** Composición nativa en Canvas/SVG en formatos **1:1 (1080×1080)**, **4:5 (1080×1350)** y **9:16 (1080×1920)** agregando logo REAL TWS, precio aprobado, SKU y textos aprobados sin modificar ni distorsionar el producto original.
  - **E. AI Provider (Adaptador Opcional Gemini API):** Funciona al 100% con motor local sin exigir IA, controla uso y cuota diaria, filtra estrictamente un payload comercial público sanitizado (cero datos personales o costos privados) y bloquea cualquier activación de facturación o servicios gráficos/audiovisuales pagos.
  - **F & G. Biblioteca, Consentimiento y Validación Estricta:** Bloqueo automático si falta precio aprobado, si no hay stock disponible, si el descuento excede el acuerdo o si se afirman características desconocidas.

---

## [0.9.0] - 2026-11-13 — Fase 7: Implementación de BRAND & MERCHANDISING CENTER

### Agregado
- **Migración SQL `0016_brand_and_merchandising_center.sql` (`supabase/migrations/`)**:
  - Tabla `public.brand_identity_versions` con trigger de inmutabilidad (`trg_brand_identity_versions_immutable`) para conservar la versión original (`v1`) y cada versión posterior de la identidad de marca REAL TWS.
  - Ampliación de tipos de activos en `public.marketing_assets` para cubrir los 9 formatos de Digital Merchandising y los 7 formatos de Physical Merchandising.
  - Tabla `public.merchandising_asset_versions` con trigger de inmutabilidad (`trg_merchandising_versions_immutable`) para conservar cada versión de las piezas diseñadas junto con la instantánea del catálogo (`sku_snapshot`, `price_cop_snapshot`, `verified_features_snapshot`).
- **Motor y Centro Operativo de Marca y Merchandising (`src/services/brandMerchandisingService.ts`, `src/modules/marketing/BrandMerchandisingModule.tsx`)**:
  - **Brand Center (`/marketing/branding`):** Logo maestro REAL TWS y 5 variantes vectoriales (`PRIMARY_HORIZONTAL`, `MONOGRAM_BADGE`, `GOLD_ON_CARBON`, `CARBON_ON_LIGHT`, `MINIMAL_SEAL`), paleta oficial Negro Carbón y Dorado, tipografía, eslogan editable, tono comercial, guía visual, información empresarial e historial inmutable de versiones.
  - **Digital Merchandising (`/marketing/merchandising`):** 9 formatos aprobados (Catálogo digital, Fichas de producto, Banners, Portadas, Tarjetas, Carruseles de 3 láminas, Imágenes promocionales, Colecciones por categoría y Comparaciones lado a lado de productos reales).
  - **Physical Merchandising e Impresión PDF (`/marketing/merchandising`):** 7 formatos imprimibles (Etiquetas SKU con código de barras Code-128 vectorial nativo, Etiquetas de precio, Etiquetas internas opcionales de propietario y lote, Tarjetas de agradecimiento, Stickers, Plantillas de empaque y Hojas de producto A4).
  - **Exportación 100% Local en el Navegador ($0 APIs pagas):** Descarga directa en PNG de alta resolución (Canvas 2D), SVG vectorial y pliegos imprimibles en PDF.

---

## [0.8.0] - 2026-11-13 — Fase 6: Implementación de SALES, ORDERS & CRM

### Agregado
- **Migración SQL `0015_sales_orders_crm_and_dispatch_procedures.sql` (`supabase/migrations/`)**:
  - Prevención de duplicados en `public.customers` mediante índices únicos parciales sobre `phone_normalized` y `(document_type, document_number)`.
  - Tabla de bitácora e historial CRM `public.lead_followups` con RLS activo/forzado (sin envío de mensajes automáticos).
  - Trigger `trg_guard_unconfirmed_order_item_edit` que impide editar o eliminar líneas de un pedido una vez confirmado o despachado.
  - Procedimientos transaccionales `public.fn_tx_reserve_order_allocations` (con bloqueo pesimista `FOR UPDATE` contra condición de carrera por última unidad) y `public.fn_tx_cancel_sales_order` (liberación automática de reservas).
  - Vista analítica `public.v_sales_order_profitability` para verificación de rentabilidad por pedido.
- **Motor y Módulo Operativo Comercial (`src/services/salesOrdersCrmService.ts`, `src/modules/sales/SalesOrdersCrmModule.tsx`)**:
  - **CRM (`/comercial/crm`):** Pipeline comercial visual por etapas (`Nuevo`, `Contactado`, `Cotizado`, `En Negociación`, `Ganado`, `Perdido`), fuente de adquisición, SKU consultado con stock disponible real, seguimiento, historial y conversión a cliente sin duplicar.
  - **Clientes (`/comercial/clientes`):** Prevención estricta de duplicados, conservación de historial comercial, formulario de datos esenciales y protección de datos personales.
  - **Pedidos Multipropietario (`/comercial/pedidos`):** Crear, editar mientras no estén confirmados, reservar inventario, confirmar, registrar pagos (`pending`, `confirmed`, `partial`, `refunded` — nunca automático ni con pasarelas pagas), preparar, despachar, entregar, cancelar y devolver conservando propietario y lote original.
  - **Despachos (`/comercial/despachos`):** Transportadora, guía, costo de envío, estado, fechas y seguimiento.
  - **Suite Automatizada de las 9 Pruebas Obligatorias (`runSalesOrdersCrmTestSuite`):** Concurrencia entre dos vendedores por la última unidad, pedido multivariado, dos propietarios en la misma venta, cancelación, devolución, pago parcial, despacho, cliente duplicado y rentabilidad por pedido.

---

## [0.7.0] - 2026-11-13 — Fase 5: Implementación de FINANCIAL & MULTI-OWNER ACCOUNTING

### Agregado
- **Migración SQL `0014_financial_and_multiowner_accounting.sql` (`supabase/migrations/`)**:
  - Expansión de `public.lot_owner_allocations` con `packaging_unit_cost_cop` y vista analítica `public.v_lot_cost_breakdown` con costo de compra por lote, transporte de entrada, otros costos de adquisición, costo unitario real, empaque, comisiones, gastos directos, gastos compartidos y publicidad atribuible.
  - Trigger de inmutabilidad `trg_cost_records_immutable` (`public.fn_prevent_cost_record_mutation`) sobre `public.cost_records`.
  - Expansión de `public.product_variants` y `public.price_history` con `promotional_price_cop`, `minimum_price_cop` y `max_discount_pct`.
  - Expansión de `public.owner_agreements` con comisión de REAL TWS (`store_commission_pct` nullable hasta configuración explícita), precio mínimo, descuento máximo, autorización comercial, método de liquidación, responsable de publicidad, política de gastos compartidos y estado `'pending_configuration'` (`PENDIENTE DE CONFIGURAR`).
  - Función transaccional `public.fn_allocate_approved_expense` que soporta múltiples criterios aprobados (`proportional_net_sales`, `proportional_cogs`, `proportional_units_sold`, `manual_explicit`) y bloquea cualquier criterio no aprobado.
  - Expansión de `public.owner_settlements` con separación explícita entre utilidad devengada (`attributable_profit_cop`) y dinero efectivamente cobrado (`collected_sales_cash_cop`, `uncollected_receivable_cop`), saldo anterior, pagos anteriores, saldo final, comprobante, conciliación previa obligatoria (`is_conciliated`) y estado de aprobación.
- **Motor y Módulo Contable Multipropietario (`src/services/financialAccountingService.ts`, `src/modules/finance/FinancialAccountingModule.tsx`)**:
  - Gestión integral de **Costos (`/finanzas/costos`)**, **Precios y Simulador de Punto de Equilibrio (`/finanzas/precios`)**, **Gastos Directos, Compartidos y Publicidad (`/finanzas/gastos`)**, **Acuerdos y Estado de Cuenta Multipropietario (`/finanzas/propietarios`)** y **Liquidaciones Conciliadas (`/finanzas/liquidaciones`)**.
  - Inicialización fiel con las 2 ventas históricas reales de Eberto (`OWN-0001`: `COM-PER-001-AZU` y `HOG-ACC-001-NEG`) y su acuerdo en estado **`PENDIENTE DE CONFIGURAR`** sin inventar porcentajes de comisión ni liquidar o pagar automáticamente.
  - Exportación de reportes individuales y generales a `.csv` UTF-8 y suite automatizada de las **8 Pruebas Financieras Obligatorias** (`runFinancialAccountingTestSuite`).

---

## [0.6.0] - 2026-11-13 — Fase 4: Implementación de INVENTORY & PURCHASE MANAGEMENT

### Agregado
- **Migración SQL `0013_inventory_and_purchase_transactional_procedures.sql` (`supabase/migrations/`)**:
  - Fotografías (`photo_urls`) en `public.products` y `public.product_variants`, referencias de proveedor en `public.suppliers`, soporte de recepción parcial (`partial_received`) y completa (`received`) en `public.purchase_receipts`, control de concurrencia (`lock_version`) en `public.lot_owner_allocations` y clave de idempotencia (`idempotency_key`) en movimientos, recepciones, reservas e inspecciones.
  - Procedimientos transaccionales PL/pgSQL con bloqueo pesimista (`SELECT ... FOR UPDATE`), prevención de doble contabilización, prevención de stock negativo y prohibición de autoasignar propietario futuro:
    - `public.fn_tx_receive_purchase_order`
    - `public.fn_tx_reserve_stock`
    - `public.fn_tx_release_reservation`
    - `public.fn_tx_dispatch_stock`
    - `public.fn_tx_process_customer_return`
    - `public.fn_tx_record_inventory_adjustment`
  - Vistas analíticas de reportes (`public.v_report_inventory_by_category`, `public.v_report_inventory_by_quality_state`).
- **Motor y Módulo Operativo en Aplicación (`src/services/inventoryPurchaseService.ts`, `src/modules/inventory/InventoryPurchaseModule.tsx`)**:
  - Gestión completa de **Productos** (catálogo maestro, variantes, SKU, categorías, fotografías, características, estado e historial), **Proveedores** (registro, contacto, referencias, compras e historial), **Compras** (orden de compra, fecha, proveedor, productos, cantidades, costos, documentos y estado), **Recepciones** (conteo, inspección, calidad, lotes, propietario explícito, costos, evidencias y confirmación) e **Inventario** (stock físico, apto, defectuoso, pendiente, reservado, disponible, kardex inmutable, ajustes, transferencias y devoluciones).
  - Generador de los **6 Reportes Oficiales** (Por SKU, Categoría, Propietario, Lote, Proveedor y Estado de Calidad) con exportación a `.csv` UTF-8.
  - Suite automatizada de las **9 Pruebas Obligatorias** en sandbox aislado (`runInventoryPurchaseTestSuite`).

---

## [0.5.0] - 2026-11-13 — Fase 3: Implementación de EXCEL IMPORT ENGINE (XLSX y CSV UTF-8)

### Agregado
- **Migración Transaccional `0012_excel_import_engine_and_opening_balance.sql` (`supabase/migrations/`)**:
  - Soporte oficial de movimientos inmutables `'OPENING_BALANCE'` en `public.stock_movements`.
  - Lotes de importación inicial (`lot_origin = 'excel_initial_import'`) sin exigir fecha de compra ficticia ni crear recepciones/órdenes de compra ficticias.
  - Estado explícito `'PENDING_COST'` en `public.cost_records` permitiendo `unit_amount_cop = NULL` para costos desconocidos sin inferir ni inventar datos.
  - Tablas `public.import_batches` y `public.import_batch_items` con RLS activo/forzado, `idempotency_key` único, usuario, fecha y reporte JSONB de antes/después, errores, advertencias y filas descartadas.
  - Función transaccional atómica `public.fn_execute_opening_inventory_import_batch()` con validación de propietario existente (prohibido asignar automáticamente Eberto a futuras recepciones), validación de ecuación física (`qty_physical = qty_good + qty_defective + qty_pending_inspection`), prevención de doble importación y rollback total ante cualquier error.
- **Parser y Motor de Importación en Aplicación (`src/utils/spreadsheetParser.ts`, `src/services/excelImportEngine.ts`, `src/modules/import/ExcelImportModule.tsx`)**:
  - Lector nativo `.xlsx` (OpenXML + `DecompressionStream`) y `.csv` UTF-8 con detección de hojas, detección de fila de encabezados y mapeo de los 10 dominios (`Owners`, `Products`, `Variants`, `Suppliers`, `Lots`, `Owner lot allocations`, `Opening inventory`, `Cost records`, `Quality inspection`, `Price history`).
  - Vista previa obligatoria, informe de errores, revisión de duplicados, confirmación modal, importación transaccional, historial de importaciones, exportación de incidencias a `.csv` UTF-8 y batería automatizada de las **6 pruebas obligatorias** sobre copia temporal (`/samples/REAL_TWS_INVENTARIO_MULTIPROPIETARIO.xlsx`).

---

## [0.4.0] - 2026-11-13 — Implementación de AUTH & SECURITY (Supabase Auth + 5 Roles RBAC + RLS)

### Agregado
- **Endurecimiento en Base de Datos (`supabase/migrations/`)**:
  - Actualización de `0001_extensions_enums_and_helpers.sql`, `0002_identity_owners_and_catalog.sql`, `0008_rls_policies_and_storage.sql` y `0010_verification_test_suite.sql` con los **5 roles oficiales**: `'ADMIN'`, `'INVENTORY_OPERATOR'`, `'SALES_OPERATOR'`, `'MARKETING_OPERATOR'` y `'OWNER'`.
  - Nuevo archivo [`0011_auth_triggers_anti_escalation_and_admin_rpc.sql`](../supabase/migrations/0011_auth_triggers_anti_escalation_and_admin_rpc.sql):
    - Trigger `trg_prevent_profile_self_escalation` (`public.fn_prevent_profile_self_escalation`) que bloquea cualquier intento de autoasignación o cambio no autorizado de rol en `public.profiles`.
    - Trigger `trg_on_auth_user_created` (`public.fn_handle_new_auth_user`) sobre `auth.users` que ignora metadatos de rol enviados desde cliente.
    - Función RPC `public.fn_admin_update_user_role_and_access` exclusiva para `ADMIN` con auditoría automática.
    - Funciones RPC `public.fn_log_security_event` y `public.fn_authorize_private_document_access` para bitácora y protección de documentos privados.
- **Autenticación, Guardias y Seguridad en la Aplicación (`src/`)**:
  - `src/lib/permissions.ts`: Matriz completa de permisos para los 5 roles sobre los 25 módulos (`ROUTE_PERMISSIONS`) y evaluador de operaciones sensibles (`evaluateSensitiveOperation`).
  - `src/services/authService.ts` y `src/hooks/useAuth.tsx`: Integración con Supabase Auth (Login, Logout, Recuperación de contraseña, Cambio de contraseña, Sesión persistente, Detección de sesión expirada) sin usuarios ni contraseñas ficticias en producción y sin claves reales en el código.
  - `src/components/ProtectedRoute.tsx`: Protección activa de rutas con bloqueo HTTP 401 (sesión expirada) y HTTP 403 (RBAC/RLS), bloqueo automático de alcance multipropietario para `OWNER` y registro automático en auditoría.
  - `src/modules/auth/AuthScreens.tsx`, `src/modules/users/UsersSecurityModule.tsx` y `src/modules/audit/AuditModule.tsx`: Pantallas de Login, Recuperación de contraseña, Perfil, Gestión administrativa de usuarios y Suite automatizada de las **7 pruebas obligatorias de seguridad**.

---

## [0.3.0] - 2026-11-13 — Diseño Integral de Base de Datos PostgreSQL y Migraciones Numeradas (Sin Ejecutar)

### Agregado
- **Actualización completa de `docs/DATABASE_DESIGN.md`**:
  - Diagrama Entidad-Relación (ER), Diccionario de Datos para las 32 entidades de dominio (33 tablas), Relaciones y Cardinalidades, Plan de Pruebas, Matriz de Riesgos y Orden de Instalación.
- **Migraciones SQL numeradas y aditivas en `supabase/migrations/` (pendientes de ejecución)**:
  - `0001_extensions_enums_and_helpers.sql`: Extensión `pgcrypto`, enum `public.app_role` (`administrador`, `operador`, `vendedor`, `propietario`), función explícita `public.fn_set_updated_at()` y función de inmutabilidad `public.fn_prevent_ledger_mutation()`.
  - `0002_identity_owners_and_catalog.sql`: `owners`, `profiles`, funciones de seguridad RLS (`fn_current_user_role`, `fn_is_admin`, `fn_is_operator_or_admin`, `fn_is_sales_or_above`, `fn_can_owner_view`), `owner_agreements`, `products`, `product_variants`, `suppliers` y `price_history`.
  - `0003_purchases_inventory_and_quality.sql`: `purchase_receipts`, `purchase_receipt_lines`, `stock_lots`, `lot_owner_allocations`, `stock_movements` (kardex inmutable), `quality_inspections`, `stock_reservations`, `cost_records`, `ownership_transfers` e `inventory_incidences`.
  - `0004_commercial_sales_and_logistics.sql`: `customers`, `leads`, `sales_orders`, `sales_order_items`, `sales_item_allocations`, `payments`, `returns` y `shipments`.
  - `0005_finance_expenses_and_settlements.sql`: `expenses`, `expense_allocations` y `owner_settlements`.
  - `0006_marketing_automation_and_audit.sql`: `marketing_assets`, `content_calendar`, `publications`, `social_connections`, `ads_campaigns`, `ads_campaign_metrics`, `automation_jobs`, `automation_logs`, `audit_logs` y función/triggers `fn_record_audit_log()`.
  - `0007_views_and_transactional_functions.sql`: Vistas (`v_inventory_consolidated_by_sku`, `v_inventory_by_owner_and_lot`, `v_owner_financial_pnl`, `v_public_available_catalog`) y funciones transaccionales (`fn_record_quality_inspection`, `fn_allocate_sale_item_to_lot`, `fn_execute_ownership_transfer`, `fn_create_owner_settlement`).
  - `0008_rls_policies_and_storage.sql`: RLS activo y forzado en las 33 tablas públicas y políticas de buckets privados/públicos en Supabase Storage.
  - `0009_seed_initial_eberto_baseline.sql`: Semilla base de `OWN-0001` (`Eberto`), acuerdo `AGR-0001` en `pending_configuration` y las 7 incidencias auditadas del Excel.
  - `0010_verification_test_suite.sql`: Suite de pruebas automatizadas en bloque `BEGIN ... ROLLBACK`.

---

## [0.2.0] - 2026-11-13 — Fase 1: Aplicación Base REAL TWS COMMERCE SYSTEM

### Agregado
- **Configuración del Proyecto Base (`React 18 + TypeScript estricto + Vite`)**:
  - `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.env.example`, `.gitignore` y `supabase/migrations/README.md`.
- **Sistema de Diseño Corporativo (`src/styles/theme.css`)**:
  - Paleta oficial Negro Carbón (`#0f141c` / `#171e29`) y Dorado (`#d4af37`), fondo claro secundario (`#f3f6fa` / `#ffffff`) de alta legibilidad y diseño adaptable móvil/desktop.
- **Arquitectura de Navegación Completa (`src/lib/navigation.ts`, `src/app/AppRouter.tsx`, `src/app/AppLayout.tsx`)**:
  - 5 agrupaciones de menú (`OPERACIONES`, `FINANZAS`, `COMERCIAL`, `MARKETING`, `GESTIÓN`) y 25 rutas configuradas con React Router.
- **Componentes Reutilizables (`src/components/`)**:
  - `Sidebar.tsx` (colapsable en desktop y cajón deslizable con fondo oscuro en móvil), `Header.tsx` (selector global multipropietario `TODOS` vs `OWN-0001 Eberto` y estado de conexión Supabase), `DataTable.tsx`, `FilterBar.tsx`, `ConfirmModal.tsx`, `NotificationCenter.tsx`, `StatusStates.tsx` y `LucideIcon.tsx`.
- **Módulos de Dominio, Hooks, Servicios y Validaciones (`src/modules/`, `src/hooks/`, `src/services/`, `src/utils/`)**:
  - `DashboardModule.tsx`: KPIs reales auditados de `OWN-0001` (`40` SKUs, `38` unidades físicas en revisión, `0` disponibles para venta, `$366.700 COP` en costos registrados, `$65.000 COP` en ventas históricas y `$43.300 COP` de utilidad bruta), gráfica `Recharts` por categoría y validador interactivo de reglas multipropietario (Reglas 6, 8, 11 y 12).
  - `ModuleBlueprintView.tsx`: Vista transparente para los 24 módulos pendientes de Fase 2 a Fase 8 con sus tablas objetivo en Supabase, reglas obligatorias y columnas planificadas, sin botones falsos ni datos ficticios.

---

## [0.1.0] - 2026-11-13 — Fase 0: Documentación Maestra y Arquitectura Inicial

### Agregado
- **`README.md`**: Visión general del proyecto, contexto del inventario real inicial de Eberto (`OWN-0001`), stack tecnológico oficial y mapa de documentación maestra.
- **`docs/PROJECT_MASTER_RULES.md`**: Constitución técnica con las 20 reglas obligatorias, reglas financieras/contables, reglas de seguridad (RLS, RBAC, secretos en servidor, transacciones atómicas), reglas de costo (`Antigravity AI Credit Overages = Never`, Gemini Flash opcional, plantillas locales) y método de trabajo por fases.
- **`docs/ARCHITECTURE.md`**: Diseño modular por dominios, diagrama de arquitectura en capas y especificación de los flujos críticos transaccionales (recepción/calidad, venta multipropietario, gastos/liquidaciones y marketing con aprobación humana).
- **`docs/DATABASE_DESIGN.md`**: Esquema relacional único para Supabase PostgreSQL 15+ (`owners`, `products`, `product_variants`, `stock_lots`, `stock_lot_ownership`, `quality_inspections`, `stock_movements`, `ownership_transfers`, `customers`, `sales_orders`, `sales_order_items`, `sales_item_allocations`, `expenses`, `owner_expense_allocations`, `owner_agreements`, `owner_settlements`, `social_posts`, `inventory_incidences`, `audit_logs`, `user_profiles`, `app_settings`) y políticas RLS.
- **`docs/IMPLEMENTATION_ROADMAP.md`**: Plan de ejecución secuencial dividido en 9 fases con criterios de verificación.
- **`docs/DECISIONS.md`**: Registro inicial de 5 Decisiones de Arquitectura (ADR-001 a ADR-005).
- **Activos de datos reales en `INVENTARIO_REAL_TWS/`**:
  - `REAL_TWS_INVENTARIO_MULTIPROPIETARIO.xlsx` (fuente maestra de importación con 40 registros asignados a `OWN-0001` / Eberto).
  - `BACKUP_ORIGINAL_REAL_TWS_INVENTARIO.xlsx` (copia de respaldo inmutable).
