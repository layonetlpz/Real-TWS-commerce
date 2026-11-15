import type { NavGroupId, NavItemConfig } from '../types/domain';

export const NAV_GROUPS: NavGroupId[] = [
  'OPERACIONES',
  'FINANZAS',
  'COMERCIAL',
  'MARKETING',
  'GESTIÓN'
];

export const NAVIGATION_ITEMS: NavItemConfig[] = [
  // ================= OPERACIONES =================
  {
    id: 'dashboard',
    group: 'OPERACIONES',
    label: 'Dashboard',
    path: '/',
    iconName: 'LayoutDashboard',
    phaseNumber: 1,
    status: 'BASE_ACTIVA',
    summary: 'Panel ejecutivo multipropietario con selector de propietario, estado arquitectónico y auditoría base.',
    supabaseTables: ['owners', 'stock_lot_ownership', 'sales_item_allocations', 'inventory_incidences'],
    enforcedRules: [
      'Regla 5: Cero datos comerciales ficticios; cifras alimentadas solo por registros reales auditados.',
      'Regla 13: Unidades en revisión no se contabilizan como stock disponible.'
    ],
    plannedColumns: ['Propietario', 'SKUs', 'Unid. Físicas', 'Disponibles', 'En Revisión', 'Estado Conciliación']
  },
  {
    id: 'productos',
    group: 'OPERACIONES',
    label: 'Productos',
    path: '/operaciones/productos',
    iconName: 'Package',
    phaseNumber: 3,
    status: 'BASE_ACTIVA',
    summary: 'Catálogo Maestro de productos base y matriz de variantes SKU únicas independientes del propietario.',
    supabaseTables: ['products', 'product_variants'],
    enforcedRules: [
      'ADR-001: El catálogo maestro y el SKU son universales e independientes del propietario.',
      'Regla 4 y 5: Prohibido duplicar modelos o inventar referencias.'
    ],
    plannedColumns: ['Código Producto', 'SKU Único', 'Categoría', 'Nombre del Producto', 'Marca', 'Modelo', 'Variante / Color', 'Estado']
  },
  {
    id: 'inventario',
    group: 'OPERACIONES',
    label: 'Inventario',
    path: '/operaciones/inventario',
    iconName: 'Boxes',
    phaseNumber: 4,
    status: 'BASE_ACTIVA',
    summary: 'Control físico por lote y propietario, segregación de calidad (apto, defectuoso, reservado, pendiente) y transferencias.',
    supabaseTables: ['stock_lot_ownership', 'quality_inspections', 'stock_movements', 'ownership_transfers'],
    enforcedRules: [
      'Regla 8: Todo movimiento de stock exige lote, propietario, motivo y responsable.',
      'Regla 6: Cantidad física = apta + defectuosa + pendiente de revisión.'
    ],
    plannedColumns: ['ID Lote', 'SKU', 'Propietario', 'Ubicación', 'Cant. Física', 'Cant. Apta', 'Reservada', 'Pend. Revisión', 'Disponible']
  },
  {
    id: 'recepciones-compras',
    group: 'OPERACIONES',
    label: 'Recepciones y Compras',
    path: '/operaciones/recepciones-compras',
    iconName: 'Truck',
    phaseNumber: 4,
    status: 'BASE_ACTIVA',
    summary: 'Ingreso de lotes de mercancía, facturas de proveedor y asignación obligatoria a propietarios activos.',
    supabaseTables: ['stock_lots', 'stock_lot_ownership'],
    enforcedRules: [
      'Todo nuevo ingreso exige selección explícita de propietario activo sin asignaciones automáticas.',
      'Trazabilidad completa de lote, proveedor y documento de compra.'
    ],
    plannedColumns: ['ID Recepción', 'ID Lote', 'Fecha', 'Proveedor', 'ID Propietario', 'SKU', 'Cant. Recibida', 'Estado']
  },
  {
    id: 'importacion',
    group: 'OPERACIONES',
    label: 'Importación Excel/CSV',
    path: '/operaciones/importacion',
    iconName: 'FileSpreadsheet',
    phaseNumber: 3,
    status: 'BASE_ACTIVA',
    summary: 'Carga controlada de inventario inicial multipropietario desde Excel (.xlsx) o CSV UTF-8 con vista previa, validación y conciliación.',
    supabaseTables: ['excel_import_batches', 'products', 'product_variants', 'stock_lots', 'lot_owner_allocations', 'stock_movements'],
    enforcedRules: [
      'Previsualización obligatoria y bloqueo de lotes duplicados antes de escribir en base de datos.',
      'Conservación estricta de costos pendientes sin estimar ni inventar valores.'
    ],
    plannedColumns: ['Hoja', 'Fila', 'SKU', 'Propietario', 'Cant. Física', 'Cant. Disponible', 'Costo Unitario COP', 'Estado Costo']
  },

  // ================= FINANZAS =================
  {
    id: 'costos',
    group: 'FINANZAS',
    label: 'Costos',
    path: '/finanzas/costos',
    iconName: 'Calculator',
    phaseNumber: 6,
    status: 'BASE_ACTIVA',
    summary: 'Liquidación de costo unitario de adquisición por lote y propietario (compra + transporte de entrada + otros costos).',
    supabaseTables: ['stock_lot_ownership'],
    enforcedRules: [
      'Regla Financiera 2: No mezclar costos de propietarios distintos ni inventar fletes.',
      'Si falta el costo de compra, mostrar PENDIENTE DE INFORMACIÓN.'
    ],
    plannedColumns: ['ID Lote', 'Propietario', 'SKU', 'Cant. Recibida', 'Costo Compra COP', 'Transporte COP', 'Costo Unitario Final COP', 'Estado']
  },
  {
    id: 'precios',
    group: 'FINANZAS',
    label: 'Precios',
    path: '/finanzas/precios',
    iconName: 'Tag',
    phaseNumber: 6,
    status: 'BASE_ACTIVA',
    summary: 'Administración y autorización manual de precios comerciales en COP y análisis de margen frente al costo por lote.',
    supabaseTables: ['product_variants', 'audit_logs'],
    enforcedRules: [
      'Regla 14: Nunca modificar precios comerciales automáticamente.',
      'Regla 5: No inventar precios de venta para productos no configurados.'
    ],
    plannedColumns: ['SKU', 'Producto', 'Costo Base Lote COP', 'Precio Comercial Aprobado COP', 'Margen Bruto %', 'Autorizado Por']
  },
  {
    id: 'gastos',
    group: 'FINANZAS',
    label: 'Gastos',
    path: '/finanzas/gastos',
    iconName: 'Receipt',
    phaseNumber: 6,
    status: 'BASE_ACTIVA',
    summary: 'Registro de costos directos y gastos operativos compartidos con criterio explícito de prorrateo.',
    supabaseTables: ['expenses', 'owner_expense_allocations'],
    enforcedRules: [
      'Regla Financiera 3: Separar gastos directos de gastos compartidos.',
      'Prohibido distribuir un gasto compartido sin documentar el criterio utilizado.'
    ],
    plannedColumns: ['ID Gasto', 'Fecha', 'Descripción', 'Tipo Gasto', 'Valor Total COP', 'Propietario', 'Criterio Distribución', 'Valor Asignado COP']
  },
  {
    id: 'propietarios',
    group: 'FINANZAS',
    label: 'Propietarios',
    path: '/finanzas/propietarios',
    iconName: 'Users',
    phaseNumber: 3,
    status: 'BASE_ACTIVA',
    summary: 'Directorio maestro de propietarios de mercancía (iniciando con OWN-0001 Eberto) y estado de resultados individual.',
    supabaseTables: ['owners', 'owner_agreements'],
    enforcedRules: [
      'Regla 5: No crear propietarios ficticios; registro inicial único OWN-0001 (Eberto).',
      'Identificador permanente e independiente de los SKUs.'
    ],
    plannedColumns: ['ID Propietario', 'Nombre', 'Estado', 'SKUs Asociados', 'Unid. Físicas', 'Disponibles', 'Ventas Netas COP', 'Utilidad Atribuible COP']
  },
  {
    id: 'liquidaciones',
    group: 'FINANZAS',
    label: 'Liquidaciones',
    path: '/finanzas/liquidaciones',
    iconName: 'Landmark',
    phaseNumber: 6,
    status: 'BASE_ACTIVA',
    summary: 'Configuración de acuerdos de distribución y registro auditado de pagos y saldos pendientes por propietario.',
    supabaseTables: ['owner_agreements', 'owner_settlements'],
    enforcedRules: [
      'Regla 15: Prohibido realizar pagos o liquidaciones sin autorización ni con saldos no conciliados.',
      'Mientras no exista acuerdo configurado, mostrar PENDIENTE DE CONFIGURAR ACUERDO DE DISTRIBUCIÓN.'
    ],
    plannedColumns: ['ID Liquidación', 'Fecha', 'Propietario', 'Acuerdo', 'Utilidad Disponible COP', 'Monto Liquidado COP', 'Saldo Pendiente COP', 'Comprobante']
  },

  // ================= COMERCIAL =================
  {
    id: 'pedidos',
    group: 'COMERCIAL',
    label: 'Pedidos',
    path: '/comercial/pedidos',
    iconName: 'ShoppingBag',
    phaseNumber: 5,
    status: 'BASE_ACTIVA',
    summary: 'Registro de órdenes de venta y atribución exacta de cada línea al lote y propietario de las unidades vendidas.',
    supabaseTables: ['sales_orders', 'sales_order_items', 'sales_item_allocations'],
    enforcedRules: [
      'Regla 9 y 10: Toda venta se atribuye por lote y propietario real sin doble conteo de ingresos.',
      'Separar utilidad devengada de dinero efectivamente cobrado.'
    ],
    plannedColumns: ['Nº Pedido', 'Fecha', 'Cliente', 'SKU', 'ID Lote', 'Propietario', 'Cant. Vendida', 'Venta Neta COP', 'CMV COP', 'Estado Cobro']
  },
  {
    id: 'clientes',
    group: 'COMERCIAL',
    label: 'Clientes',
    path: '/comercial/clientes',
    iconName: 'UserCheck',
    phaseNumber: 5,
    status: 'BASE_ACTIVA',
    summary: 'Base de datos de compradores, historial de pedidos, garantías y contacto directo por WhatsApp.',
    supabaseTables: ['customers', 'sales_orders'],
    enforcedRules: [
      'Validación estricta de datos de contacto y trazabilidad histórica de compras.'
    ],
    plannedColumns: ['ID Cliente', 'Nombre Completo', 'WhatsApp', 'Ciudad', 'Dirección', 'Total Pedidos', 'Última Compra']
  },
  {
    id: 'crm',
    group: 'COMERCIAL',
    label: 'CRM',
    path: '/comercial/crm',
    iconName: 'MessageSquareHeart',
    phaseNumber: 5,
    status: 'BASE_ACTIVA',
    summary: 'Seguimiento comercial de prospectos, cotizaciones, postventa y atención de garantías.',
    supabaseTables: ['customers', 'sales_orders'],
    enforcedRules: [
      'Regla 13: Solo cotizar y comprometer unidades con stock disponible verificado (qty_available > 0).'
    ],
    plannedColumns: ['Prospecto / Cliente', 'Canal Origen', 'SKU Interés', 'Estado Seguimiento', 'Responsable', 'Próxima Acción']
  },
  {
    id: 'despachos',
    group: 'COMERCIAL',
    label: 'Despachos',
    path: '/comercial/despachos',
    iconName: 'PackageCheck',
    phaseNumber: 5,
    status: 'BASE_ACTIVA',
    summary: 'Control logístico de alistamiento, empaque, guías de envío y confirmación de entrega de pedidos.',
    supabaseTables: ['sales_orders', 'stock_movements'],
    enforcedRules: [
      'Regla 8: Toda salida física de bodega registra lote, propietario, guía y responsable.'
    ],
    plannedColumns: ['Nº Pedido', 'Cliente', 'Ciudad Destino', 'Transportadora / Guía', 'Unidades', 'Estado Despacho', 'Fecha Entrega']
  },

  // ================= MARKETING =================
  {
    id: 'branding',
    group: 'MARKETING',
    label: 'Branding',
    path: '/marketing/branding',
    iconName: 'Award',
    phaseNumber: 8,
    status: 'BASE_ACTIVA',
    summary: 'Manual de identidad visual REAL TWS, activos de marca, tonos de comunicación y plantillas oficiales.',
    supabaseTables: ['app_settings'],
    enforcedRules: [
      'Uso prioritario de plantillas locales corporativas sin depender de servicios de pago.'
    ],
    plannedColumns: ['Activo / Plantilla', 'Categoría', 'Formato', 'Paleta Aplicada', 'Estado', 'Última Actualización']
  },
  {
    id: 'merchandising',
    group: 'MARKETING',
    label: 'Merchandising',
    path: '/marketing/merchandising',
    iconName: 'Sparkles',
    phaseNumber: 8,
    status: 'BASE_ACTIVA',
    summary: 'Organización de vitrina comercial, productos destacados y etiquetas físicas imprimibles de exhibición.',
    supabaseTables: ['product_variants', 'stock_lot_ownership'],
    enforcedRules: [
      'Regla 13: Bloqueo automático de exhibición para SKUs sin unidades disponibles aprobadas.'
    ],
    plannedColumns: ['SKU', 'Producto', 'Stock Disponible', 'Precio Aprobado COP', 'Ubicación Vitrina', 'Etiqueta Lista']
  },
  {
    id: 'creative-studio',
    group: 'MARKETING',
    label: 'Creative Studio',
    path: '/marketing/creative-studio',
    iconName: 'Palette',
    phaseNumber: 8,
    status: 'BASE_ACTIVA',
    summary: 'Generador de fichas técnicas visuales y copys comerciales mediante motor local de plantillas (con Gemini Flash opcional).',
    supabaseTables: ['social_posts', 'app_settings'],
    enforcedRules: [
      'Regla 20: Funciona al 100 % con plantillas locales cuando Gemini API está desactivada.',
      'Regla de Costo: Antigravity AI Credit Overages en Never.'
    ],
    plannedColumns: ['ID Pieza', 'SKU', 'Motor Generador', 'Título Comercial', 'Estado Aprobación', 'Creado Por']
  },
  {
    id: 'marketplace',
    group: 'MARKETING',
    label: 'Marketplace',
    path: '/marketing/marketplace',
    iconName: 'Store',
    phaseNumber: 8,
    status: 'BASE_ACTIVA',
    summary: 'Preparación de fichas estandarizadas para catálogo público web y canales de comercio electrónico.',
    supabaseTables: ['product_variants', 'stock_lot_ownership'],
    enforcedRules: [
      'Regla 13 y 14: Sincronización exclusiva de existencias disponibles (qty_available > 0) y precios autorizados.'
    ],
    plannedColumns: ['SKU', 'Título Publicación', 'Categoría', 'Stock Disponible', 'Precio COP', 'Estado Publicación']
  },
  {
    id: 'social-publisher',
    group: 'MARKETING',
    label: 'Social Publisher',
    path: '/marketing/social-publisher',
    iconName: 'Share2',
    phaseNumber: 8,
    status: 'BASE_ACTIVA',
    summary: 'Cola de aprobación humana y programación de publicaciones orgánicas hacia canales oficiales.',
    supabaseTables: ['social_posts', 'audit_logs'],
    enforcedRules: [
      'Regla 16: Ningún contenido se publica sin aprobación explícita (draft -> pending_approval -> approved).',
      'Regla 18: Prohibida la automatización no oficial de navegador.'
    ],
    plannedColumns: ['ID Post', 'Canal', 'SKU Asociado', 'Estado Aprobación', 'Aprobado Por', 'Fecha Publicación']
  },
  {
    id: 'whatsapp',
    group: 'MARKETING',
    label: 'WhatsApp',
    path: '/marketing/whatsapp',
    iconName: 'MessageCircle',
    phaseNumber: 8,
    status: 'BASE_ACTIVA',
    summary: 'Generador de mensajes comerciales, fichas rápidas de stock disponible y enlaces profundos oficiales wa.me.',
    supabaseTables: ['social_posts', 'customers'],
    enforcedRules: [
      'Integración limpia con WhatsApp Business App mediante plantillas locales y enlaces oficiales.'
    ],
    plannedColumns: ['Plantilla', 'SKU', 'Stock Disponible', 'Precio COP', 'Enlace Directo wa.me', 'Estado']
  },
  {
    id: 'meta-ads',
    group: 'MARKETING',
    label: 'Meta Ads',
    path: '/marketing/meta-ads',
    iconName: 'Megaphone',
    phaseNumber: 8,
    status: 'BASE_ACTIVA',
    summary: 'Control de campañas publicitarias, atribución de gasto publicitario y conexión lectura/oficial con Meta Graph API.',
    supabaseTables: ['expenses', 'owner_expense_allocations', 'app_settings'],
    enforcedRules: [
      'Regla 17: Prohibido crear o activar publicidad pagada automáticamente.',
      'Regla 18: Uso exclusivo de Meta Graph API con permisos oficiales.'
    ],
    plannedColumns: ['ID Campaña', 'Objetivo', 'Presupuesto Manual COP', 'Gasto Registrado COP', 'Criterio Prorrateo', 'Estado']
  },

  // ================= GESTIÓN =================
  {
    id: 'automatizaciones',
    group: 'GESTIÓN',
    label: 'Automatizaciones',
    path: '/gestion/automatizaciones',
    iconName: 'Workflow',
    phaseNumber: 8,
    status: 'BASE_ACTIVA',
    summary: 'Reglas internas de alertas de stock bajo, recordatorios de inspección de calidad y control de integraciones.',
    supabaseTables: ['app_settings', 'inventory_incidences'],
    enforcedRules: [
      'Regla de Costo: Toda integración externa puede desactivarse con un clic desde configuración.'
    ],
    plannedColumns: ['Regla / Flujo', 'Evento Disparador', 'Acción Interna', 'Límite Diario', 'Interruptor Activo']
  },
  {
    id: 'analitica',
    group: 'GESTIÓN',
    label: 'Analítica',
    path: '/gestion/analitica',
    iconName: 'BarChart3',
    phaseNumber: 7,
    status: 'BASE_ACTIVA',
    summary: 'Indicadores de rotación de inventario, rentabilidad por propietario, categoría y evolución de ventas.',
    supabaseTables: ['sales_item_allocations', 'stock_lot_ownership', 'owner_expense_allocations'],
    enforcedRules: [
      'Cálculos alimentados exclusivamente por transacciones reales conciliadas sin duplicar ingresos.'
    ],
    plannedColumns: ['Período', 'Propietario', 'Categoría', 'Unid. Vendidas', 'Ventas Netas COP', 'CMV COP', 'Utilidad Atribuible COP']
  },
  {
    id: 'configuracion',
    group: 'GESTIÓN',
    label: 'Configuración',
    path: '/gestion/configuracion',
    iconName: 'Settings',
    phaseNumber: 7,
    status: 'BASE_ACTIVA',
    summary: 'Parámetros globales del negocio, umbrales de stock, control de integraciones externas y catálogo de categorías.',
    supabaseTables: ['business_settings', 'categories'],
    enforcedRules: [
      'Control estricto de integraciones externas (IA, Meta Graph API y WhatsApp Cloud).'
    ],
    plannedColumns: ['Parámetro', 'Clave Sistema', 'Valor Actual', 'Estado', 'Última Modificación']
  },
  {
    id: 'usuarios',
    group: 'GESTIÓN',
    label: 'Usuarios',
    path: '/gestion/usuarios',
    iconName: 'ShieldCheck',
    phaseNumber: 2,
    status: 'BASE_ACTIVA',
    summary: 'Autenticación Supabase Auth, Perfil, 5 Roles RBAC (ADMIN, INVENTORY_OPERATOR, SALES_OPERATOR, MARKETING_OPERATOR, OWNER) y Pruebas de Seguridad.',
    supabaseTables: ['profiles', 'owners', 'audit_logs'],
    enforcedRules: [
      'Regla de Seguridad: Permisos validados en BD/Servidor (RLS obligatorio) y prohibición de autoasignación de roles.'
    ],
    plannedColumns: ['Usuario', 'Rol Asignado', 'Propietario Vinculado (RLS)', 'Estado Cuenta', 'Fecha Alta']
  },
  {
    id: 'auditoria',
    group: 'GESTIÓN',
    label: 'Auditoría',
    path: '/gestion/auditoria',
    iconName: 'FileSearch',
    phaseNumber: 2,
    status: 'BASE_ACTIVA',
    summary: 'Bitácora inmutable de operaciones críticas y eventos de seguridad (accesos denegados, cambios de rol, costos, transferencias y liquidaciones).',
    supabaseTables: ['audit_logs', 'inventory_incidences'],
    enforcedRules: [
      'Regla 7 y Seguridad: Registro append-only sin borrado ni exposición de tokens en logs.'
    ],
    plannedColumns: ['Fecha / Hora', 'Actor', 'Acción', 'Entidad', 'ID Registro', 'Detalle del Cambio']
  }
];
