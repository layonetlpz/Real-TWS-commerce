# REAL TWS COMMERCE SYSTEM

Plataforma comercial integral multipropietario para **REAL TWS** (tienda de audífonos inalámbricos y accesorios tecnológicos), diseñada para administrar desde un único sistema:

- **Catálogo Maestro y Variantes SKU** (independientes del propietario).
- **Inventario Físico por Lote y Propietario** (segregando unidades físicas, aptas, defectuosas, reservadas, pendientes de revisión y disponibles).
- **Control de Calidad e Inspección Técnica** por lote y propietario.
- **Recepciones, Compras y Costeo Unitario Real** en pesos colombianos (`COP`).
- **Ventas, Clientes y Atribución Exacta por Propietario y Lote** (sin doble conteo de ingresos).
- **Costos Directos, Gastos Compartidos, Estado de Resultados (P&L) y Liquidaciones por Propietario**.
- **Transferencias de Propiedad de Mercancía** sin alterar el historial pasado.
- **Marketing, Publicaciones y Publicidad** con aprobación humana obligatoria y plantillas locales (IA opcional y desactivable).

---

## 1. Contexto Inicial de Datos Reales

- **Fuente oficial de importación inicial:** `INVENTARIO_REAL_TWS/REAL_TWS_INVENTARIO_MULTIPROPIETARIO.xlsx`.
- **Propietario actual de toda la mercancía inicial:** **Eberto** (`OWN-0001`).
- **Estado del inventario inicial auditado:**
  - **40** registros de productos / SKUs únicos.
  - **38** unidades físicas en bodega (actualmente en estado `Pendiente de Revisión` hasta aprobar su inspección en Control de Calidad; **0** disponibles hasta su verificación).
  - **2** registros históricos con estado `Vendido` (`COM-PER-001-AZU` y `HOG-ACC-001-NEG`) atribuidos a `OWN-0001`.
  - **\$366.700 COP** en costos de compra registrados (2 artículos pendientes de confirmar costo: `AUD-TWS-003-NEG` y `ELE-AUD-001-STD`).
- **Prohibición estricta de datos ficticios:** Ningún entorno de producción ni migración inicial insertará productos, propietarios, costos, porcentajes de comisión o ventas inventadas.
- **Escalabilidad Multipropietario:** Todo nuevo ingreso de mercancía exige seleccionar explícitamente su propietario activo y **nunca** asigna `OWN-0001` por defecto.

---

## 2. Stack Tecnológico Oficial

| Capa | Tecnología | Política de Costo / Operación |
| :--- | :--- | :--- |
| **Frontend** | React 18 + TypeScript estricto + Vite + CSS Modular + Lucide + Recharts + React Router | SPA ligera, responsiva (móvil/desktop) y tipada de extremo a extremo |
| **Backend & Base de Datos** | Supabase (PostgreSQL 15+, Auth, Storage, Edge Functions) | RLS obligatorio, funciones RPC transaccionales atómicas |
| **Control de Versiones** | Git + GitHub | Checkpoints por fase aprobada, cero secretos en repositorio |
| **Hosting & CDN** | Cloudflare Pages | Despliegue continuo sin costo en capa gratuita |
| **IA Asistiva (Opcional)** | Google Gemini API (`gemini-flash` en capa gratuita) | 100 % opcional y desactivable; el sistema opera completo sin IA |
| **Comunicaciones y Social** | WhatsApp Business App (enlaces profundos / plantillas) + Meta Graph API oficial | Sin automatización no oficial de navegador ni publicación sin aprobación humana |

---

## 3. Mapa de Documentación Maestra

Antes de iniciar o modificar cualquier fase de desarrollo, es **obligatorio** consultar estos documentos:

1. [docs/PROJECT_MASTER_RULES.md](file:///G:/Mi%20unidad/Real%20TWS/docs/PROJECT_MASTER_RULES.md) — Las 20 reglas obligatorias del negocio, reglas financieras, de seguridad, de costos y método de trabajo.
2. [docs/ARCHITECTURE.md](file:///G:/Mi%20unidad/Real%20TWS/docs/ARCHITECTURE.md) — Arquitectura de software, módulos de dominio, seguridad, integraciones desacopladas y flujos atómicos.
3. [docs/DATABASE_DESIGN.md](file:///G:/Mi%20unidad/Real%20TWS/docs/DATABASE_DESIGN.md) — Modelo relacional PostgreSQL completo, tablas multipropietario, restricciones, políticas RLS y funciones transaccionales.
4. [docs/IMPLEMENTATION_ROADMAP.md](file:///G:/Mi%20unidad/Real%20TWS/docs/IMPLEMENTATION_ROADMAP.md) — Plan de implementación gradual por fases con criterios de aceptación y verificación.
5. [docs/DECISIONS.md](file:///G:/Mi%20unidad/Real%20TWS/docs/DECISIONS.md) — Registro de Decisiones de Arquitectura (ADR).
6. [docs/CHANGELOG.md](file:///G:/Mi%20unidad/Real%20TWS/docs/CHANGELOG.md) — Historial cronológico de cambios del proyecto.

---

## 4. Estructura de la Aplicación Base (Fase 1) y Comandos

```text
src/
├── app/          # AppLayout.tsx y AppRouter.tsx (5 grupos y 25 rutas)
├── components/   # Sidebar, Header, DataTable, FilterBar, ConfirmModal, NotificationCenter, StatusStates, LucideIcon
├── hooks/        # useOwnerScope.tsx, useNotifications.tsx
├── lib/          # supabase.ts, navigation.ts
├── modules/      # dashboard/DashboardModule.tsx, shared/ModuleBlueprintView.tsx
├── services/     # systemService.ts (línea base auditada de OWN-0001 Eberto)
├── styles/       # theme.css (Negro Carbón #0f141c/#171e29, Dorado #d4af37, superficies claras)
├── types/        # domain.ts
└── utils/        # formatters.ts, validations.ts
```

Comandos principales:
- `npm run dev` — Inicia el servidor de desarrollo Vite.
- `npm run typecheck` — Verifica tipos con TypeScript estricto (`tsc --noEmit`).
- `npm run build` — Compila y empaqueta la aplicación para producción (`tsc -b && vite build`).

---

## 5. Gobernanza y Flujo de Trabajo

- **Ejecución por fases:** No se avanza a la siguiente fase sin verificación técnica (`build` + pruebas) y aprobación explícita del usuario.
- **Cirugía de código:** Nunca se reconstruye el proyecto completo para corregir un error localizado ni se eliminan funcionalidades sin autorización.
- **Integridad económica:** Toda operación que afecte existencias, propiedad de lotes, ventas o liquidaciones se ejecuta en transacciones atómicas auditadas en PostgreSQL.
