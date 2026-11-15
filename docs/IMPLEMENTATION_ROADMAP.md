# HOJA DE RUTA DE IMPLEMENTACIÓN (ROADMAP) — REAL TWS COMMERCE SYSTEM

El desarrollo del sistema se ejecuta bajo un modelo estrictamente secuencial por fases. **Ninguna fase puede iniciarse sin haber verificado y aprobado la fase anterior.**

---

## Fase 0: Documentación Maestra y Arquitectura (COMPLETADA)
- **Alcance:**
  - Definición de reglas maestras (`PROJECT_MASTER_RULES.md`), arquitectura (`ARCHITECTURE.md`), modelo relacional (`DATABASE_DESIGN.md`), roadmap (`IMPLEMENTATION_ROADMAP.md`), registro de decisiones (`DECISIONS.md`) y bitácora (`CHANGELOG.md`).
  - Alineación completa con el libro maestro `INVENTARIO_REAL_TWS/REAL_TWS_INVENTARIO_MULTIPROPIETARIO.xlsx`.
- **Criterio de aceptación:** Verificación de cero contradicciones entre reglas de negocio, esquema SQL y datos reales de Eberto (`OWN-0001`).

---

## Fase 1: Inicialización del Proyecto Base y Configuración Segura (ACTUAL — COMPLETADA)
- **Alcance:**
  - Construcción de la aplicación base **REAL TWS COMMERCE SYSTEM** en React 18 + TypeScript estricto + Vite + Lucide Icons + Recharts + React Router.
  - Identidad visual Negro Carbón (`#0f141c` / `#171e29`) y Dorado (`#d4af37`) con fondo claro secundario (`#f3f6fa` / `#ffffff`), responsive para móvil y desktop.
  - Menú lateral adaptable con las 5 agrupaciones oficiales (`OPERACIONES`, `FINANZAS`, `COMERCIAL`, `MARKETING`, `GESTIÓN`) y las 25 rutas configuradas.
  - Componentes reutilizables (`Sidebar`, `Header`, `DataTable`, `FilterBar`, `ConfirmModal`, `NotificationCenter`, `StatusStates`) y validador de reglas multipropietario (Reglas 6, 8, 11 y 12).
  - Módulos pendientes de fases futuras identificados explícitamente sin botones falsos ni datos comerciales ficticios.
- **Verificación:** `npm run build` (`tsc -b && vite build`) sin errores; navegación completa y vista móvil verificadas.

---

## Fase 2: Esquema PostgreSQL, RLS, Funciones Atómicas e Importación Real Inicial
- **Alcance:**
  - Migraciones SQL en Supabase para todas las tablas definidas en `DATABASE_DESIGN.md`.
  - Políticas RLS por rol (`admin`, `operator`, `owner_viewer`, `anon`) y triggers de `audit_logs`.
  - Script de semilla/importación verificada que carga únicamente a **Eberto** (`OWN-0001`), los **40 productos/SKUs**, las **38 unidades físicas en revisión**, las **2 ventas históricas** y las **7 incidencias** desde `REAL_TWS_INVENTARIO_MULTIPROPIETARIO.xlsx`.
- **Verificación:** Contraste automático de sumas en SQL contra el Excel (`40` SKUs, `38` unidades físicas, `0` disponibles antes de calidad, `\$366.700 COP` en costos, `\$65.000 COP` en ventas históricas).

---

## Fase 3: Módulo de Propietarios, Catálogo Maestro y Variantes SKU
- **Alcance:**
  - Gestión de propietarios (`OWN-0001` y alta de futuros propietarios con ID secuencial inalterable).
  - CRUD de Catálogo Maestro (`products`) y Variantes (`product_variants`) con validación de SKUs únicos e independencia respecto al propietario.
  - Generador e impresor de etiquetas físicas con SKU, Lote y Propietario.
- **Verificación:** Alta de prueba en entorno controlado, validación de no duplicidad y compilación limpia.

---

## Fase 4: Módulo de Recepciones, Asignación Multipropietario, Inventario y Calidad
- **Alcance:**
  - Registro de recepciones (`stock_lots`) y asignación obligatoria por propietario (`stock_lot_ownership`, sin preseleccionar a Eberto).
  - Conteo físico, conciliación (`Física = Apta + Defectuosa + Pendiente`), control de reservas y transferencias entre propietarios (`ownership_transfers`).
  - Módulo de Control de Calidad (`quality_inspections`) con liberación transaccional de unidades `Pendiente` $\rightarrow$ `Apta` / `Defectuosa`.
  - Bitácora interactiva de incidencias (`inventory_incidences`).
- **Verificación:** Pruebas de liberación de calidad, bloqueo de stock negativo y trazabilidad en `stock_movements`.

---

## Fase 5: Módulo de Clientes, Ventas y Atribución por Propietario y Lote
- **Alcance:**
  - Directorio de clientes (`customers`) y creación de pedidos (`sales_orders`).
  - Motor transaccional `fn_confirm_sale_order` que divide automáticamente o por lote seleccionado cada línea vendida en `sales_item_allocations`, atribuyendo ingreso y costo exacto a cada propietario sin doble conteo.
  - Gestión de devoluciones y reservas de stock.
- **Verificación:** Prueba de venta simple (1 propietario) y venta mixta (2 propietarios compartiendo SKU en distintos lotes).

---

## Fase 6: Módulo Financiero — Costos, Gastos, P&L y Liquidaciones por Propietario
- **Alcance:**
  - Costeo unitario real por lote y propietario (`purchase_unit_cost_cop` + fletes).
  - Registro de Costos Directos y Gastos Compartidos (`expenses` + `owner_expense_allocations`) con criterio explícito documentado.
  - Estado de Resultados individual (`P&L`) filtrable por día, semana, mes, rango personalizado, producto y propietario.
  - Configuración de acuerdos (`owner_agreements`) y registro de liquidaciones (`owner_settlements`) con bloqueo de saldos negativos o no conciliados.
- **Verificación:** Conciliación matemática de Ventas Netas, CMV, Utilidad Bruta, Utilidad Atribuible y Saldo Pendiente.

---

## Fase 7: Dashboard Ejecutivo Multipropietario y Exportación/Importación CSV
- **Alcance:**
  - Panel principal con selector `"TODOS LOS PROPIETARIOS"` o propietario individual, tarjetas KPI, gráficos comparativos y alertas en tiempo real.
  - Exportador CSV UTF-8 para todas las entidades y sincronización bidireccional controlada con plantillas Excel.
- **Verificación:** Comprobación de que los indicadores cambian dinámicamente sin duplicar cifras al alternar entre propietarios.

---

## Fase 8: Marketing, WhatsApp Business y Meta Graph API (Con Aprobación Humana)
- **Alcance:**
  - Generador de publicaciones restringido exclusivamente a SKUs con `qty_available > 0` y precio comercial aprobado.
  - Motor local de plantillas comerciales (predeterminado, costo \$0) + integración opcional y desactivable con **Gemini Flash** mediante Edge Function.
  - Flujo de aprobación (`draft` $\rightarrow$ `pending_approval` $\rightarrow$ `approved`) antes de habilitar el envío por **WhatsApp Business App** (enlaces `wa.me`) o publicación orgánica vía **Meta Graph API** oficial.
- **Verificación:** Prueba de funcionamiento completo con Gemini API y Meta API desactivadas (`Feature Flags = OFF`).

---

## Fase 9: Auditoría Final, Endurecimiento de Seguridad y Despliegue en Cloudflare Pages
- **Alcance:**
  - Auditoría integral de políticas RLS, pruebas de regresión de las 20 reglas obligatorias y despliegue de producción en Cloudflare Pages.
- **Verificación:** Checklist completo de producción y entrega final.
