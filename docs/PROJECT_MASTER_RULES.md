# REGLAS MAESTRAS DEL PROYECTO — REAL TWS COMMERCE SYSTEM

Este documento constituye la constitución técnica, operativa, financiera y de seguridad de **REAL TWS COMMERCE SYSTEM**. Ningún cambio de código, migración SQL, integración o interfaz puede violar estas directrices.

---

## 1. LAS 20 REGLAS OBLIGATORIAS DEL SISTEMA

1. **Trabajar por fases:** El desarrollo se divide en fases cerradas, verificables y secuenciales definidas en `docs/IMPLEMENTATION_ROADMAP.md`.
2. **Nunca reconstruir el proyecto completo para corregir un error localizado:** Todo defecto se aísla y corrige mediante cambios mínimos y quirúrgicos.
3. **Nunca eliminar funcionalidades existentes sin autorización:** Ninguna tabla, columna, vista, ruta o componente funcional se suprime sin aprobación expresa del propietario del proyecto.
4. **Nunca crear tablas duplicadas:** Toda nueva entidad debe validarse contra `docs/DATABASE_DESIGN.md` antes de crear una migración.
5. **Nunca inventar productos, stock, costos, ventas o propietarios:** La base de datos de producción solo contiene los registros reales de `REAL_TWS_INVENTARIO_MULTIPROPIETARIO.xlsx` y los que el usuario ingrese posteriormente.
6. **Nunca modificar datos reales para hacer coincidir cálculos:** Si existe una discrepancia física o financiera (ej. producto sin costo o sin cantidad), el sistema debe mostrar la incidencia o estado `PENDIENTE DE INFORMACIÓN`, jamás alterar el dato real.
7. **Mantener historial de operaciones:** Los registros contables, de ventas, transferencias y movimientos de stock son inmutables (`append-only`). Las correcciones se hacen mediante asientos o movimientos de ajuste.
8. **Todo movimiento de inventario debe tener trazabilidad:** Cada entrada, salida, reserva, aprobación de calidad, ajuste o transferencia registra fecha, usuario responsable, lote (`lot_id`), propietario (`owner_id`), SKU y motivo.
9. **Toda venta debe poder atribuirse a un propietario y lote:** Cada línea vendida (`sales_order_items`) se desglosa en `sales_item_allocations` indicando de qué lote y propietario salieron exactamente las unidades.
10. **Nunca atribuir una venta a un propietario incorrecto:** La atribución de propiedad proviene de la asignación del lote (`stock_lot_ownership`), nunca del catálogo maestro de productos.
11. **Nunca asignar Eberto (`OWN-0001`) automáticamente a futuras compras:** `OWN-0001` es propietario exclusivo de los 40 registros iniciales importados del Excel. Ningún formulario ni tabla tendrá `DEFAULT 'OWN-0001'`.
12. **Los nuevos registros de mercancía deben exigir propietario:** Toda recepción o asignación de lote requiere seleccionar explícitamente un propietario activo (`owner_id NOT NULL`).
13. **No anunciar mercancía no disponible:** Los módulos de catálogo público, marketing y publicaciones bloquean cualquier SKU cuya `qty_available` (`qty_good - qty_reserved`) sea igual a `0`. Las unidades en estado `Pendiente de Revisión` o `Defectuosa` no son vendibles ni anunciables.
14. **No modificar precios comerciales automáticamente:** Los precios de venta son definidos y autorizados únicamente por el administrador; ninguna fórmula de costo ni proceso automático altera precios publicados sin confirmación humana.
15. **No hacer pagos ni liquidaciones sin autorización:** Toda liquidación a un propietario requiere conciliación previa, saldo positivo verificado y confirmación explícita con registro de comprobante y responsable.
16. **No publicar contenido sin su aprobación correspondiente:** Todo borrador de publicación para redes o catálogo pasa por estado `draft` -> `pending_approval` -> `approved` antes de poder publicarse.
17. **No realizar publicidad pagada automáticamente:** El sistema nunca creará ni activará campañas de anuncios con presupuesto en Meta Ads u otras plataformas sin intervención humana directa.
18. **No utilizar automatización no oficial de navegador en plataformas Meta:** Queda prohibido el uso de scraping, Puppeteer/Playwright sobre sesiones de Facebook/Instagram/WhatsApp Web o bots no oficiales. Solo se permite **Meta Graph API** con permisos oficiales y enlaces profundos de **WhatsApp Business App**.
19. **No utilizar servicios externos de pago en la versión inicial:** Toda la infraestructura inicial opera dentro de las capas gratuitas de Supabase, Cloudflare Pages y GitHub.
20. **No permitir que una API de IA sea indispensable para utilizar el sistema:** Todas las funciones del sistema (inventario, ventas, costos, reportes, plantillas de texto para marketing y etiquetas) deben funcionar al 100 % con lógica y plantillas locales cuando Gemini API esté desactivada o sin cuota.

---

## 2. REGLAS FINANCIERAS Y CONTABLES

1. **Separación estricta entre Ventas y Utilidad:**
   $$\text{Ventas Netas} = \text{Ventas Brutas} - \text{Descuentos} - \text{Devoluciones}$$
2. **Separación entre Costo de Adquisición y Gastos de Venta:**
   - **Costo de Adquisición Unitario ( por lote y propietario):**
     $$\text{Costo Unitario Lote} = \frac{\text{Subtotal Compra} + \text{Transporte Entrada} + \text{Otros Costos Adquisición}}{\text{Unidades Recibidas}}$$
   - Si falta el costo de compra de un lote, se marca como `PENDIENTE DE INFORMACIÓN` (`NULL`), sin inventar valores ni prorratear costos sobre unidades de otros propietarios.
   - **Utilidad Bruta:**
     $$\text{Utilidad Bruta} = \text{Ventas Netas} - \text{Costo de Mercancía Vendida (CMV)}$$
3. **Registro de Gastos Directos y Compartidos:**
   - **Gastos Directos:** Atribuidos al 100 % a una venta o propietario específico (empaque específico, envío de venta, comisión directa).
   - **Gastos Compartidos:** Publicidad general, herramientas comerciales o gastos operativos comunes. Solo se distribuyen cuando se selecciona y documenta explícitamente el criterio (`manual`, `sales_ratio`, `cogs_ratio`, `units_ratio`).
   - **Utilidad Atribuible al Propietario:**
     $$\text{Utilidad Atribuible} = \text{Utilidad Bruta} - \text{Gastos Directos} - \text{Gastos Compartidos Asignados}$$
4. **Acuerdos Individuales por Propietario:**
   - No se asume que el porcentaje de propiedad de mercancía equivale al porcentaje de distribución de utilidades del negocio.
   - Cada propietario tiene su acuerdo configurable en `owner_agreements` (sin porcentajes inventados; mientras no se configure, permanece en estado `pending_configuration` mostrando `PENDIENTE DE CONFIGURAR ACUERDO DE DISTRIBUCIÓN`).
   - Cuando se utilice un acuerdo porcentual conjunto (`% Propietario + % REAL TWS`), el sistema valida mediante restricción `CHECK` que ambos porcentajes sean $\ge 0$ y sumen exactamente `100 %`.
5. **Control de Caja y Liquidaciones:**
   - Se diferencia en todo momento:
     1. **Utilidad Atribuible Generada** (devengada contablemente).
     2. **Dinero Efectivamente Recibido / Cobrado** por ventas.
     3. **Liquidaciones Pagadas** al propietario.
     4. **Saldo Pendiente de Liquidar**.
   - Queda bloqueada cualquier liquidación sobre saldos no conciliados, utilidades negativas ($\le 0$) o montos que excedan el saldo pendiente disponible (protección contra doble liquidación).

---

## 3. REGLAS DE SEGURIDAD Y ARQUITECTURA DE DATOS

1. **Row Level Security (RLS) obligatorio:** Todas las tablas del esquema `public` en Supabase tienen RLS habilitado desde el instante de su creación.
2. **Principio de mínimo privilegio (RBAC):**
   - `admin`: Control total del sistema, configuración de acuerdos, aprobación de publicaciones y ejecución de liquidaciones.
   - `operator`: Captura de conteo físico, inspecciones de calidad, recepciones y registro de pedidos.
   - `owner_viewer`: Consulta de solo lectura restringida exclusivamente a sus propios lotes, existencias, ventas, gastos y liquidaciones (`owner_id` vinculado a su perfil).
   - `anon` / público: Solo lectura sobre vista pública de catálogo de variantes que tengan `qty_available > 0` y precio comercial aprobado.
3. **Gestión de secretos:**
   - Las claves sensibles (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `META_GRAPH_ACCESS_TOKEN`) viven exclusivamente en variables de entorno de servidor (Supabase Edge Functions Secrets) y jamás se exponen en el bundle de Vite (`VITE_*` solo permite `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`).
   - Ningún token ni credencial se imprime en `console.log` ni en tablas de logs.
   - `.gitignore` bloquea permanentemente archivos `.env`, `.env.local` y credenciales.
4. **Transacciones atómicas:** Toda confirmación de venta, recepción de compra, aprobación de calidad, transferencia entre propietarios o liquidación se ejecuta mediante funciones almacenadas PostgreSQL (`RPC` en `PL/pgSQL`) con bloqueo de fila (`SELECT ... FOR UPDATE`) para impedir condiciones de carrera y saldos negativos.
5. **Auditoría inmutable (`audit_logs`):** Toda operación crítica registra automáticamente `actor_id`, `action`, `entity_type`, `entity_id`, `previous_state` (JSONB), `new_state` (JSONB) y `created_at`.

---

## 4. REGLAS DE CONTROL DE COSTOS TECNOLÓGICOS

1. **Antigravity AI Credit Overages:** Debe permanecer configurado siempre en **Never**.
2. **Uso de modelos:** Emplear **Gemini Flash** para tareas ordinarias.
3. **Cero facturación de APIs:** No activar facturación de pago en Google Cloud, Meta ni servicios de terceros durante la versión inicial.
4. **Plantillas locales primero:** La generación de copys comerciales, descripciones de productos, mensajes de WhatsApp y etiquetas funciona de forma predeterminada mediante un motor de plantillas determinísticas en TypeScript local.
5. **Interruptor global de integraciones (`Feature Flags`):** Tanto Gemini API como Meta Graph API cuentan con un interruptor de encendido/apagado y contador de cuota diaria en `app_settings`. Si se desactivan, la interfaz continúa operando sin errores ni bloqueos.

---

## 5. MÉTODO DE TRABAJO DEL EQUIPO TÉCNICO

1. **Lectura previa obligatoria:** Leer `PROJECT_MASTER_RULES.md`, `ARCHITECTURE.md`, `DATABASE_DESIGN.md` y `IMPLEMENTATION_ROADMAP.md` antes de iniciar cualquier fase.
2. **Cambios pequeños e incrementales:** Implementar un submódulo o migración a la vez, explicando cada archivo creado o modificado.
3. **Verificación empírica:** Ejecutar `tsc --noEmit`, `vite build` y pruebas de validación antes de dar por concluido un paso.
4. **Trazabilidad documental:** Actualizar `docs/CHANGELOG.md` en cada entrega y registrar en `docs/DECISIONS.md` cualquier decisión arquitectónica.
5. **Checkpoint Git y pausa de aprobación:** Realizar commit limpio al cierre de cada fase aprobada y detenerse hasta recibir confirmación explícita del usuario para pasar a la siguiente fase.
