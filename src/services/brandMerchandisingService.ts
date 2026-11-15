// ============================================================================
// REAL TWS COMMERCE SYSTEM — BRAND & MERCHANDISING CENTER ENGINE
// Cubre:
//   1. BRAND CENTER: Logo principal, 5 variantes de logo vectoriales SVG,
//      paleta de colores oficial (Negro Carbón y Dorado REAL TWS), tipografía,
//      eslogan editable, tono comercial, guía visual, información empresarial
//      y plantillas aprobadas, con historial inmutable de versiones.
//   2. DIGITAL MERCHANDISING (9 formatos): Catálogo digital, fichas de producto,
//      banners, portadas, tarjetas, carruseles, imágenes promocionales,
//      colecciones por categoría y comparaciones de productos.
//   3. PHYSICAL MERCHANDISING (7 formatos): Etiquetas SKU (con código de barras
//      vectorial), etiquetas de precio, etiquetas de propietario opcionales
//      para uso interno, tarjetas de agradecimiento, stickers, plantillas de
//      empaque y hojas de producto imprimibles en PDF.
//   4. REGLAS ESTRICTAS: Datos desde el catálogo real, precios actuales, SKU,
//      fotografías aprobadas, prohibido inventar logotipos de fabricantes o
//      características falsas, conservar versión original y cada versión
//      posterior, y exportar imágenes (PNG/SVG) y PDF con herramientas locales
//      del navegador sin APIs gráficas pagas.
// ============================================================================

import {
  getInventoryPurchaseState,
  ensureExcelBaselineLoadedInInventory
} from './inventoryPurchaseService';
import { getFinancialAccountingState } from './financialAccountingService';
import { formatCOP } from '../utils/formatters';

export type LogoVariantId =
  | 'PRIMARY_HORIZONTAL'
  | 'MONOGRAM_BADGE'
  | 'GOLD_ON_CARBON'
  | 'CARBON_ON_LIGHT'
  | 'MINIMAL_SEAL';

export interface BrandColorSwatch {
  id: string;
  name: string;
  role: string;
  hex: string;
  rgb: string;
  cmykReference: string;
  usageNotes: string;
}

export interface BrandTypographyRule {
  id: string;
  role: 'TITULARES' | 'CUERPO_COMERCIAL' | 'CODIGOS_SKU_Y_PRECIOS';
  fontFamily: string;
  weights: string;
  usage: string;
}

export interface BrandCompanyInfo {
  commercialName: string;
  legalNote: string;
  cityAndCountry: string;
  whatsappContact: string;
  instagramHandle: string;
  warrantyPolicySummary: string;
  physicalStoreHours: string;
}

export interface BrandIdentityConfig {
  brandName: string;
  slogan: string;
  commercialTone: string;
  visualGuideRules: string[];
  prohibitedPractices: string[];
  colors: BrandColorSwatch[];
  typography: BrandTypographyRule[];
  companyInfo: BrandCompanyInfo;
  activeLogoVariant: LogoVariantId;
}

export interface BrandIdentityVersionRecord {
  versionNumber: number;
  isOriginalBaseline: boolean;
  configSnapshot: BrandIdentityConfig;
  changeNote: string;
  createdBy: string;
  createdAt: string;
}

export type DigitalMerchFormat =
  | 'digital_catalog'
  | 'product_sheet_digital'
  | 'promo_banner'
  | 'social_cover'
  | 'product_card'
  | 'carousel_deck'
  | 'promo_image'
  | 'category_collection'
  | 'product_comparison';

export type PhysicalMerchFormat =
  | 'sku_label'
  | 'price_label'
  | 'owner_internal_label'
  | 'thank_you_card'
  | 'brand_sticker'
  | 'packaging_template'
  | 'printable_product_sheet';

export type MerchTemplateFormat = DigitalMerchFormat | PhysicalMerchFormat;

export interface ApprovedMerchTemplate {
  id: string;
  format: MerchTemplateFormat;
  category: 'DIGITAL' | 'PHYSICAL';
  name: string;
  dimensionsLabel: string;
  widthPx: number;
  heightPx: number;
  printSizeMm?: string;
  description: string;
  recommendedChannelOrUse: string;
}

export interface RealCatalogMerchItem {
  sku: string;
  productCode: string;
  productName: string;
  category: string;
  brandText: string; // Texto real de marca en el catálogo; nunca logotipo inventado
  modelText: string;
  variantOrColor: string;
  verifiedFeatures: string;
  originalExcelNotes: string;
  approvedPhotos: string[];
  currentNormalPriceCop: number | null;
  currentPromoPriceCop: number | null;
  minimumPriceCop: number | null;
  qtyPhysicalTotal: number;
  qtyAvailableTotal: number;
  ownerAllocations: Array<{
    ownerId: string;
    ownerName: string;
    lotId: string;
    storageBin: string;
    qtyAvailable: number;
    qtyPhysical: number;
  }>;
}

export interface MerchandisingDesignConfig {
  templateId: string;
  format: MerchTemplateFormat;
  category: 'DIGITAL' | 'PHYSICAL';
  title: string;
  subtitle: string;
  primarySku: string;
  comparisonSkuSecond: string;
  targetCategoryName: string;
  themeVariant: 'CARBON_GOLD' | 'LIGHT_EDITORIAL' | 'HIGH_CONTRAST_GOLD';
  logoVariant: LogoVariantId;
  showPriceBadge: boolean;
  usePromoPriceIfAvailable: boolean;
  includeInternalOwnerTag: boolean; // Solo para uso interno en etiquetas físicas
  selectedOwnerIdForInternalTag: string;
  selectedLotIdForInternalTag: string;
  customCallToAction: string;
  footerLegalOrWarrantyNote: string;
  copiesPerPrintPage: number;
}

export interface MerchandisingAssetVersion {
  versionNumber: number;
  isOriginal: boolean;
  savedAt: string;
  savedBy: string;
  changeNote: string;
  designConfig: MerchandisingDesignConfig;
  catalogSnapshot: {
    primarySku: string;
    productName: string;
    priceSnapshotCop: number | null;
    verifiedFeaturesSnapshot: string;
  };
}

export interface MerchandisingSavedAsset {
  id: string;
  assetCode: string;
  category: 'DIGITAL' | 'PHYSICAL';
  format: MerchTemplateFormat;
  title: string;
  primarySku: string;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  versions: MerchandisingAssetVersion[]; // Conserva v1 (original) y todas las versiones posteriores
}

export interface BrandMerchandisingStoreState {
  currentBrandConfig: BrandIdentityConfig;
  brandVersions: BrandIdentityVersionRecord[];
  savedAssets: MerchandisingSavedAsset[];
}

const BRAND_MERCH_STORAGE_KEY = 'rtw_brand_merchandising_center_v1';

// ============================================================================
// 1. PLANTILLAS APROBADAS OFICIALES (9 DIGITALES + 7 FÍSICAS)
// ============================================================================

export const APPROVED_MERCH_TEMPLATES: ApprovedMerchTemplate[] = [
  // --- DIGITAL MERCHANDISING (9) ---
  {
    id: 'TPL-DIG-01',
    format: 'digital_catalog',
    category: 'DIGITAL',
    name: 'Portada y Vitrina de Catálogo Digital',
    dimensionsLabel: '1080 × 1350 px (4:5)',
    widthPx: 1080,
    heightPx: 1350,
    description: 'Grilla comercial de productos reales con SKU, características verificadas y precio vigente en COP.',
    recommendedChannelOrUse: 'Catálogo WhatsApp Business / PDF Comercial'
  },
  {
    id: 'TPL-DIG-02',
    format: 'product_sheet_digital',
    category: 'DIGITAL',
    name: 'Ficha Técnica de Producto Digital',
    dimensionsLabel: '1080 × 1350 px (4:5)',
    widthPx: 1080,
    heightPx: 1350,
    description: 'Presentación individual de producto con SKU oficial, especificaciones reales del catálogo y precio actual.',
    recommendedChannelOrUse: 'Respuesta a Clientes / WhatsApp / Instagram'
  },
  {
    id: 'TPL-DIG-03',
    format: 'promo_banner',
    category: 'DIGITAL',
    name: 'Banner Horizontal Comercial',
    dimensionsLabel: '1200 × 628 px (1.91:1)',
    widthPx: 1200,
    heightPx: 628,
    description: 'Banner panorámico en Negro Carbón y Dorado para encabezados web, enlaces compartidos y anuncios.',
    recommendedChannelOrUse: 'Web / Facebook Feed / Encabezado Catálogo'
  },
  {
    id: 'TPL-DIG-04',
    format: 'social_cover',
    category: 'DIGITAL',
    name: 'Portada Oficial de Marca y Categorías',
    dimensionsLabel: '1200 × 480 px',
    widthPx: 1200,
    heightPx: 480,
    description: 'Portada institucional REAL TWS con eslogan editable, categorías reales y canales de contacto.',
    recommendedChannelOrUse: 'Perfil Facebook / Portada Catálogo Digital'
  },
  {
    id: 'TPL-DIG-05',
    format: 'product_card',
    category: 'DIGITAL',
    name: 'Tarjeta Cuadrada de Producto (Feed)',
    dimensionsLabel: '1080 × 1080 px (1:1)',
    widthPx: 1080,
    heightPx: 1080,
    description: 'Composición cuadrada limpia con sello REAL TWS, variante de color, SKU y etiqueta de precio.',
    recommendedChannelOrUse: 'Instagram Feed / Marketplace / Catálogo'
  },
  {
    id: 'TPL-DIG-06',
    format: 'carousel_deck',
    category: 'DIGITAL',
    name: 'Carrusel Secuencial de 3 Láminas',
    dimensionsLabel: '1080 × 1080 px (3 Slides)',
    widthPx: 1080,
    heightPx: 1080,
    description: 'Secuencia de 3 láminas sincronizadas: 1. Portada Producto, 2. Especificaciones Verificadas, 3. Garantía y Pedido.',
    recommendedChannelOrUse: 'Instagram Carrusel / Estado Secuencial'
  },
  {
    id: 'TPL-DIG-07',
    format: 'promo_image',
    category: 'DIGITAL',
    name: 'Imagen Promocional Vertical (Story / Reel Cover)',
    dimensionsLabel: '1080 × 1920 px (9:16)',
    widthPx: 1080,
    heightPx: 1920,
    description: 'Formato vertical 9:16 optimizado para Estados de WhatsApp e Historias de Instagram con precio vigente.',
    recommendedChannelOrUse: 'WhatsApp Status / Instagram Stories'
  },
  {
    id: 'TPL-DIG-08',
    format: 'category_collection',
    category: 'DIGITAL',
    name: 'Colección Especial por Categoría',
    dimensionsLabel: '1080 × 1350 px (4:5)',
    widthPx: 1080,
    heightPx: 1350,
    description: 'Agrupa automáticamente las referencias reales disponibles de una categoría (Audio, Carga, Computación, Hogar, etc.).',
    recommendedChannelOrUse: 'Difusión por Categoría / Estados'
  },
  {
    id: 'TPL-DIG-09',
    format: 'product_comparison',
    category: 'DIGITAL',
    name: 'Comparación Técnica Lado a Lado (2 SKUs Reales)',
    dimensionsLabel: '1200 × 900 px',
    widthPx: 1200,
    heightPx: 900,
    description: 'Cuadro comparativo objetivo entre dos SKUs reales del catálogo mostrando variante, características reales y precio.',
    recommendedChannelOrUse: 'Asesoría Comercial CRM / Cierre de Ventas'
  },

  // --- PHYSICAL MERCHANDISING (7) ---
  {
    id: 'TPL-PHY-01',
    format: 'sku_label',
    category: 'PHYSICAL',
    name: 'Etiqueta Térmica de SKU + Código de Barras',
    dimensionsLabel: '50 × 25 mm (Impresión Térmica / Pliego A4)',
    widthPx: 600,
    heightPx: 300,
    printSizeMm: '50mm × 25mm',
    description: 'Etiqueta física con código de barras Code-128 vectorial nativo, código SKU, nombre de variante y sello REAL TWS.',
    recommendedChannelOrUse: 'Rotulado de Cajas y Unidades en Bodega'
  },
  {
    id: 'TPL-PHY-02',
    format: 'price_label',
    category: 'PHYSICAL',
    name: 'Etiqueta de Precio para Vitrina Comercial',
    dimensionsLabel: '55 × 35 mm',
    widthPx: 660,
    heightPx: 420,
    printSizeMm: '55mm × 35mm',
    description: 'Hablador físico de vitrina en Negro y Dorado con SKU, descripción real y precio vigente en COP.',
    recommendedChannelOrUse: 'Exhibición en Mostrador y Vitrina Física'
  },
  {
    id: 'TPL-PHY-03',
    format: 'owner_internal_label',
    category: 'PHYSICAL',
    name: 'Etiqueta Interna de Propietario y Lote (Uso Bodega)',
    dimensionsLabel: '60 × 35 mm (Uso Interno Exclusivo)',
    widthPx: 720,
    heightPx: 420,
    printSizeMm: '60mm × 35mm',
    description: 'Etiqueta opcional de control interno multipropietario: identifica Propietario (ej. OWN-0001), ID Lote, SKU y Ubicación.',
    recommendedChannelOrUse: 'Separación Física Multipropietario en Estantería'
  },
  {
    id: 'TPL-PHY-04',
    format: 'thank_you_card',
    category: 'PHYSICAL',
    name: 'Tarjeta de Agradecimiento Postventa REAL TWS',
    dimensionsLabel: '90 × 55 mm (Tamaño Tarjeta)',
    widthPx: 900,
    heightPx: 550,
    printSizeMm: '90mm × 55mm',
    description: 'Tarjeta impresa para incluir dentro de cada pedido despachado con canales de soporte y cuidado del producto.',
    recommendedChannelOrUse: 'Interior de Paquetes y Envíos'
  },
  {
    id: 'TPL-PHY-05',
    format: 'brand_sticker',
    category: 'PHYSICAL',
    name: 'Sticker / Sello de Seguridad y Garantía REAL TWS',
    dimensionsLabel: '50 × 50 mm',
    widthPx: 600,
    heightPx: 600,
    printSizeMm: '50mm × 50mm',
    description: 'Sello circular/cuadrado en Negro Carbón y Dorado para cierre de bolsas, cajas y control de empaque.',
    recommendedChannelOrUse: 'Sellado de Empaques y Bolsas'
  },
  {
    id: 'TPL-PHY-06',
    format: 'packaging_template',
    category: 'PHYSICAL',
    name: 'Fajilla / Plantilla de Empaque Corporativo',
    dimensionsLabel: '160 × 65 mm',
    widthPx: 960,
    heightPx: 390,
    printSizeMm: '160mm × 65mm',
    description: 'Banda envolvente para cajas de despacho con identidad REAL TWS, lista de chequeo de calidad y datos de guía.',
    recommendedChannelOrUse: 'Alistamiento de Despachos Comerciales'
  },
  {
    id: 'TPL-PHY-07',
    format: 'printable_product_sheet',
    category: 'PHYSICAL',
    name: 'Hoja Imprimible de Producto para Mostrador (A4)',
    dimensionsLabel: '210 × 297 mm (Hoja A4 Vertical)',
    widthPx: 840,
    heightPx: 1188,
    printSizeMm: '210mm × 297mm (A4)',
    description: 'Ficha impresa tamaño carta/A4 para carpeta de mostrador con especificaciones reales verificadas, SKU y precio actual.',
    recommendedChannelOrUse: 'Carpeta de Mostrador / Punto de Venta Físico'
  }
];

// ============================================================================
// 2. CONFIGURACIÓN INICIAL DEL BRAND CENTER REAL TWS
// ============================================================================

function createInitialBrandIdentityConfig(): BrandIdentityConfig {
  return {
    brandName: 'REAL TWS',
    slogan: 'Tecnología y Audio Inalámbrico con Respaldo Real',
    commercialTone:
      'Profesional, claro, directo y verificable. Destaca las especificaciones reales del producto, el precio transparente en pesos colombianos (COP) y la disponibilidad inmediata sin promesas exageradas ni datos técnicos inventados.',
    visualGuideRules: [
      '1. Contraste Corporativo: Combinar fondo Negro Carbón (#0D0E12 / #151821) con acentos en Dorado Metálico (#D4AF37) y textos en Blanco Puro (#F9FAFB) o Gris Plata (#9CA3AF).',
      '2. Lectura en Impresión: Para documentos extensos, hojas A4 o etiquetas térmicas de código de barras, utilizar la variante de fondo claro (#F8FAFC) con tinta Negro Carbón (#0D0E12) para máxima legibilidad del lector óptico.',
      '3. Integridad del Catálogo: Toda pieza digital o física debe mostrar el código SKU exacto y el precio vigente autorizado en Finanzas.',
      '4. Fotografías y Marcas: Utilizar exclusivamente fotografías aprobadas del producto real. Nunca insertar logotipos vectoriales de fabricantes externos no autorizados; mencionar la marca o modelo únicamente como texto descriptivo verificado.'
    ],
    prohibitedPractices: [
      'Prohibido inventar logotipos de fabricantes o marcas de terceros.',
      'Prohibido agregar características técnicas no registradas en la ficha real del catálogo (ej. no afirmar resistencia al agua IPX8 o cancelación activa ANC si no consta en verified_specs).',
      'Prohibido publicar piezas con precios no autorizados o SKUs sin stock disponible verificado.',
      'Prohibido sobrescribir la versión original (v1) de una pieza o plantilla sin guardar nueva versión en el historial.'
    ],
    colors: [
      {
        id: 'CLR-01',
        name: 'Negro Carbón Profundo',
        role: 'Fondo Principal de Marca',
        hex: '#0D0E12',
        rgb: 'rgb(13, 14, 18)',
        cmykReference: 'C:75 M:68 Y:62 K:88',
        usageNotes: 'Fondos de piezas para redes sociales, banners, tarjetas de agradecimiento y cabeceras.'
      },
      {
        id: 'CLR-02',
        name: 'Negro Grafito Elevado',
        role: 'Superficie Secundaria / Contenedores',
        hex: '#151821',
        rgb: 'rgb(21, 24, 33)',
        cmykReference: 'C:72 M:64 Y:52 K:78',
        usageNotes: 'Tarjetas de especificaciones, bloques comparativos y paneles internos.'
      },
      {
        id: 'CLR-03',
        name: 'Dorado Real (Metallic Gold)',
        role: 'Acento Principal e Identidad REAL TWS',
        hex: '#D4AF37',
        rgb: 'rgb(212, 175, 55)',
        cmykReference: 'C:18 M:28 Y:86 K:4',
        usageNotes: 'Logotipo, filetes de lujo, insignias de precio, bordes destacados y sellos de garantía.'
      },
      {
        id: 'CLR-04',
        name: 'Dorado Champán Suave',
        role: 'Acento Secundario / Brillo',
        hex: '#F3E5AB',
        rgb: 'rgb(243, 229, 171)',
        cmykReference: 'C:5 M:8 Y:38 K:0',
        usageNotes: 'Subtítulos destacados y contrastes suaves sobre fondo oscuro.'
      },
      {
        id: 'CLR-05',
        name: 'Blanco Marfil Editorial',
        role: 'Fondo Claro para Impresión y Lectura',
        hex: '#F8FAFC',
        rgb: 'rgb(248, 250, 252)',
        cmykReference: 'C:2 M:1 Y:0 K:0',
        usageNotes: 'Fondo de etiquetas térmicas de código de barras SKU, hojas A4 de producto y documentos.'
      }
    ],
    typography: [
      {
        id: 'TYP-01',
        role: 'TITULARES',
        fontFamily: 'Inter / Montserrat (Sans-Serif Geométrica)',
        weights: '700 Bold / 800 ExtraBold',
        usage: 'Nombres de productos, encabezados de banners, portadas de colección y llamadas a la acción.'
      },
      {
        id: 'TYP-02',
        role: 'CUERPO_COMERCIAL',
        fontFamily: 'Inter (Sans-Serif Alta Legibilidad)',
        weights: '400 Regular / 500 Medium / 600 SemiBold',
        usage: 'Características verificadas, notas de garantía, instrucciones de empaque y tablas comparativas.'
      },
      {
        id: 'TYP-03',
        role: 'CODIGOS_SKU_Y_PRECIOS',
        fontFamily: 'JetBrains Mono / Monospace',
        weights: '600 SemiBold / 700 Bold',
        usage: 'Códigos SKU, identificadores de lote, códigos de propietario (OWN-0001) y cifras en COP.'
      }
    ],
    companyInfo: {
      commercialName: 'REAL TWS — Accesorios Tecnológicos y Audio',
      legalNote: 'Mercancía verificada con trazabilidad por lote. Precios expresados en Pesos Colombianos (COP).',
      cityAndCountry: 'Barranquilla, Atlántico — Colombia',
      whatsappContact: '+57 300 000 0000',
      instagramHandle: '@realtws.co',
      warrantyPolicySummary:
        'Garantía directa por defectos de fábrica presentando el código SKU y soporte de pedido.',
      physicalStoreHours: 'Lunes a Sábado: 9:00 a.m. – 7:00 p.m.'
    },
    activeLogoVariant: 'PRIMARY_HORIZONTAL'
  };
}

// ============================================================================
// 3. GENERADOR VECTORIAL DEL LOGO REAL TWS (5 VARIANTES OFICIALES EN SVG)
// ============================================================================

export function renderRealTwsLogoSvgMarkup(
  variant: LogoVariantId,
  customSlogan?: string
): string {
  const sloganText = customSlogan ?? 'AUDIO & TECH STORE';
  switch (variant) {
    case 'PRIMARY_HORIZONTAL':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 110" width="100%" height="100%">
        <defs>
          <linearGradient id="rtwGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#F3E5AB"/>
            <stop offset="50%" stop-color="#D4AF37"/>
            <stop offset="100%" stop-color="#AA820A"/>
          </linearGradient>
        </defs>
        <rect width="420" height="110" rx="14" fill="#0D0E12" stroke="url(#rtwGoldGrad)" stroke-width="2.5"/>
        <g transform="translate(22, 19)">
          <rect width="72" height="72" rx="16" fill="#151821" stroke="url(#rtwGoldGrad)" stroke-width="2"/>
          <path d="M22 44 C22 29, 50 29, 50 44" fill="none" stroke="url(#rtwGoldGrad)" stroke-width="4" stroke-linecap="round"/>
          <rect x="17" y="40" width="10" height="16" rx="5" fill="url(#rtwGoldGrad)"/>
          <rect x="45" y="40" width="10" height="16" rx="5" fill="url(#rtwGoldGrad)"/>
          <circle cx="36" cy="24" r="4" fill="#F3E5AB"/>
        </g>
        <text x="112" y="54" fill="#F9FAFB" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800" letter-spacing="3">REAL <tspan fill="url(#rtwGoldGrad)">TWS</tspan></text>
        <text x="114" y="79" fill="#D4AF37" font-family="JetBrains Mono, monospace" font-size="11.5" font-weight="600" letter-spacing="2.2">${escapeXml(sloganText.toUpperCase().slice(0, 34))}</text>
      </svg>`;

    case 'MONOGRAM_BADGE':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="100%" height="100%">
        <defs>
          <linearGradient id="rtwGoldBadge" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#F3E5AB"/>
            <stop offset="55%" stop-color="#D4AF37"/>
            <stop offset="100%" stop-color="#9A7409"/>
          </linearGradient>
        </defs>
        <circle cx="90" cy="90" r="84" fill="#0D0E12" stroke="url(#rtwGoldBadge)" stroke-width="4"/>
        <circle cx="90" cy="90" r="74" fill="none" stroke="#D4AF37" stroke-width="1" stroke-dasharray="4 4"/>
        <path d="M58 84 C58 54, 122 54, 122 84" fill="none" stroke="url(#rtwGoldBadge)" stroke-width="6" stroke-linecap="round"/>
        <rect x="48" y="76" width="16" height="28" rx="8" fill="url(#rtwGoldBadge)"/>
        <rect x="116" y="76" width="16" height="28" rx="8" fill="url(#rtwGoldBadge)"/>
        <text x="90" y="132" text-anchor="middle" fill="#F9FAFB" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800" letter-spacing="2.5">REAL TWS</text>
        <text x="90" y="150" text-anchor="middle" fill="#D4AF37" font-family="JetBrains Mono, monospace" font-size="9.5" font-weight="700" letter-spacing="2">OFFICIAL SEAL</text>
      </svg>`;

    case 'GOLD_ON_CARBON':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 110" width="100%" height="100%">
        <rect width="420" height="110" rx="14" fill="#090A0D" stroke="#D4AF37" stroke-width="3"/>
        <text x="210" y="56" text-anchor="middle" fill="#D4AF37" font-family="Inter, Arial, sans-serif" font-size="38" font-weight="900" letter-spacing="5">REAL TWS</text>
        <line x1="70" y1="68" x2="350" y2="68" stroke="#D4AF37" stroke-width="1.5"/>
        <text x="210" y="88" text-anchor="middle" fill="#F3E5AB" font-family="JetBrains Mono, monospace" font-size="11" font-weight="600" letter-spacing="3">${escapeXml(sloganText.toUpperCase().slice(0, 34))}</text>
      </svg>`;

    case 'CARBON_ON_LIGHT':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 110" width="100%" height="100%">
        <rect width="420" height="110" rx="14" fill="#F8FAFC" stroke="#0D0E12" stroke-width="2.5"/>
        <rect x="14" y="14" width="82" height="82" rx="12" fill="#0D0E12"/>
        <text x="55" y="64" text-anchor="middle" fill="#D4AF37" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="900">RT</text>
        <text x="116" y="55" fill="#0D0E12" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="900" letter-spacing="2.5">REAL TWS</text>
        <text x="118" y="80" fill="#4B5563" font-family="JetBrains Mono, monospace" font-size="11.5" font-weight="700" letter-spacing="1.8">${escapeXml(sloganText.toUpperCase().slice(0, 34))}</text>
      </svg>`;

    case 'MINIMAL_SEAL':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 70" width="100%" height="100%">
        <rect width="260" height="70" rx="8" fill="#0D0E12" stroke="#D4AF37" stroke-width="2"/>
        <text x="130" y="38" text-anchor="middle" fill="#F9FAFB" font-family="Inter, Arial, sans-serif" font-size="23" font-weight="800" letter-spacing="3">REAL <tspan fill="#D4AF37">TWS</tspan></text>
        <text x="130" y="56" text-anchor="middle" fill="#9CA3AF" font-family="JetBrains Mono, monospace" font-size="9.5" letter-spacing="2">VERIFIED CATALOG SKU</text>
      </svg>`;
  }
}

function escapeXml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// 4. GENERADOR DE CÓDIGO DE BARRAS VECTORIAL CODE-128 SIMPLIFICADO (100% LOCAL)
// ============================================================================

export function renderSkuBarcodePatternSvg(
  sku: string,
  x: number,
  y: number,
  width: number,
  height: number,
  barColor = '#0D0E12'
): string {
  const clean = (sku || 'RTWS-0001').toUpperCase();
  const bars: number[] = [2, 1, 1, 2]; // Patrón de inicio
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    bars.push(((code >> 0) & 1) + 1);
    bars.push(((code >> 1) & 1) + 1);
    bars.push(((code >> 2) & 1) + 1);
    bars.push(((code >> 3) & 1) + 1);
    bars.push(1);
  }
  bars.push(2, 1, 2, 1, 2); // Patrón de cierre

  const totalUnits = bars.reduce((a, b) => a + b, 0);
  const unitWidth = width / totalUnits;

  let currentX = x;
  const rects: string[] = [];
  for (let i = 0; i < bars.length; i++) {
    const w = bars[i] * unitWidth;
    if (i % 2 === 0) {
      rects.push(
        `<rect x="${currentX.toFixed(2)}" y="${y}" width="${w.toFixed(2)}" height="${height}" fill="${barColor}"/>`
      );
    }
    currentX += w;
  }
  return rects.join('');
}

// ============================================================================
// 5. ESTADO Y VERSIONADO INMUTABLE DEL BRAND & MERCHANDISING CENTER
// ============================================================================

function createInitialBrandMerchState(): BrandMerchandisingStoreState {
  const initialConfig = createInitialBrandIdentityConfig();
  const baselineVersion: BrandIdentityVersionRecord = Object.freeze({
    versionNumber: 1,
    isOriginalBaseline: true,
    configSnapshot: JSON.parse(JSON.stringify(initialConfig)),
    changeNote: 'Versión original base (v1) de Identidad Corporativa REAL TWS Negro Carbón y Dorado.',
    createdBy: 'Sistema (Baseline Oficial)',
    createdAt: '2026-11-13T00:00:00.000Z'
  });

  return {
    currentBrandConfig: initialConfig,
    brandVersions: [baselineVersion],
    savedAssets: []
  };
}

let inMemoryBrandMerchState: BrandMerchandisingStoreState | null = null;

export function getBrandMerchandisingState(): BrandMerchandisingStoreState {
  if (inMemoryBrandMerchState) {
    return inMemoryBrandMerchState;
  }
  try {
    const raw = localStorage.getItem(BRAND_MERCH_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BrandMerchandisingStoreState;
      if (parsed && parsed.currentBrandConfig && Array.isArray(parsed.brandVersions)) {
        inMemoryBrandMerchState = parsed;
        return parsed;
      }
    }
  } catch {
    // Fallback to initial
  }
  const initial = createInitialBrandMerchState();
  inMemoryBrandMerchState = initial;
  saveBrandMerchandisingState(initial);
  return initial;
}

export function saveBrandMerchandisingState(state: BrandMerchandisingStoreState): void {
  inMemoryBrandMerchState = state;
  try {
    localStorage.setItem(BRAND_MERCH_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export function saveNewBrandIdentityVersion(
  updatedConfig: BrandIdentityConfig,
  changeNote: string,
  actorName: string
): BrandIdentityVersionRecord {
  if (!updatedConfig.slogan.trim()) {
    throw new Error('El eslogan corporativo no puede quedar vacío.');
  }
  if (!changeNote.trim()) {
    throw new Error('Debe describir el motivo o cambio de esta versión de marca.');
  }

  const state = getBrandMerchandisingState();
  const nextVersionNumber = state.brandVersions.length + 1;
  const nowIso = new Date().toISOString();

  const newVersion: BrandIdentityVersionRecord = Object.freeze({
    versionNumber: nextVersionNumber,
    isOriginalBaseline: false,
    configSnapshot: JSON.parse(JSON.stringify(updatedConfig)),
    changeNote: changeNote.trim(),
    createdBy: actorName || 'Administrador de Marca',
    createdAt: nowIso
  });

  state.currentBrandConfig = JSON.parse(JSON.stringify(updatedConfig));
  state.brandVersions.unshift(newVersion);
  saveBrandMerchandisingState(state);
  return newVersion;
}

export function restoreBrandIdentityVersion(
  versionNumber: number,
  actorName: string
): BrandIdentityVersionRecord {
  const state = getBrandMerchandisingState();
  const target = state.brandVersions.find((v) => v.versionNumber === versionNumber);
  if (!target) {
    throw new Error(`Versión de marca v${versionNumber} no encontrada.`);
  }
  return saveNewBrandIdentityVersion(
    target.configSnapshot,
    `Restauración desde la versión histórica v${versionNumber} (${target.changeNote})`,
    actorName
  );
}

// ============================================================================
// 6. LECTURA ESTRICTA DESDE EL CATÁLOGO REAL Y PRECIOS ACTUALES
// ============================================================================

export function getRealCatalogMerchItems(): RealCatalogMerchItem[] {
  const invState = getInventoryPurchaseState();
  const finState = getFinancialAccountingState();

  const catalogEntries = Object.values(invState.catalog);

  return catalogEntries.map((cat) => {
    const skuPricing = finState.skuPricing[cat.sku];
    const matchingAllocs = invState.allocations.filter((a) => a.sku === cat.sku);

    const qtyPhysicalTotal = matchingAllocs.reduce((s, a) => s + a.qtyPhysical, 0);
    const qtyAvailableTotal = matchingAllocs.reduce((s, a) => s + a.qtyAvailable, 0);

    const currentNormalPriceCop =
      skuPricing?.normalSalePriceCop ?? cat.approvedSalePriceCop ?? null;
    const currentPromoPriceCop = skuPricing?.promotionalPriceCop ?? null;
    const minimumPriceCop = skuPricing?.minimumAllowedPriceCop ?? null;

    // Nunca inventar características ni marcas falsas: usar únicamente los campos reales del catálogo
    const cleanBrand =
      cat.brand && cat.brand.trim() && cat.brand.toUpperCase() !== 'PENDIENTE'
        ? cat.brand.trim()
        : 'Referencia Catálogo REAL TWS';

    const cleanFeatures =
      cat.verifiedFeatures && cat.verifiedFeatures.trim()
        ? cat.verifiedFeatures.trim()
        : cat.description && cat.description.trim()
          ? cat.description.trim()
          : `Variante verificada: ${cat.variantName || cat.color || 'Estándar'} (${cat.category})`;

    return {
      sku: cat.sku,
      productCode: cat.productCode,
      productName: cat.productName,
      category: cat.category,
      brandText: cleanBrand,
      modelText: cat.model || 'Estándar',
      variantOrColor: cat.color || cat.variantName || 'Estándar',
      verifiedFeatures: cleanFeatures,
      originalExcelNotes: cat.originalNotes || '',
      approvedPhotos: Array.isArray(cat.photoUrls) ? cat.photoUrls : [],
      currentNormalPriceCop,
      currentPromoPriceCop,
      minimumPriceCop,
      qtyPhysicalTotal,
      qtyAvailableTotal,
      ownerAllocations: matchingAllocs.map((a) => ({
        ownerId: a.ownerId,
        ownerName: a.ownerName,
        lotId: a.lotId,
        storageBin: a.storageBin || 'BODEGA-CENTRAL',
        qtyAvailable: a.qtyAvailable,
        qtyPhysical: a.qtyPhysical
      }))
    };
  });
}

// ============================================================================
// 7. GUARDADO DE PIEZAS DE MERCHANDISING CON HISTORIAL DE VERSIONES (v1..vN)
// ============================================================================

export function saveMerchandisingAssetVersion(
  input: {
    existingAssetId?: string | null;
    designConfig: MerchandisingDesignConfig;
    changeNote: string;
    actorName: string;
  }
): MerchandisingSavedAsset {
  const state = getBrandMerchandisingState();
  const realItems = getRealCatalogMerchItems();
  const primaryItem =
    realItems.find((i) => i.sku === input.designConfig.primarySku) || realItems[0];

  if (!primaryItem) {
    throw new Error('No se encontró el SKU seleccionado en el catálogo real.');
  }

  const nowIso = new Date().toISOString();
  const activePrice =
    input.designConfig.usePromoPriceIfAvailable && primaryItem.currentPromoPriceCop
      ? primaryItem.currentPromoPriceCop
      : primaryItem.currentNormalPriceCop;

  if (input.existingAssetId) {
    const existing = state.savedAssets.find((a) => a.id === input.existingAssetId);
    if (!existing) {
      throw new Error(`Pieza ${input.existingAssetId} no encontrada.`);
    }
    const nextVer = existing.versions.length + 1;
    const versionEntry: MerchandisingAssetVersion = Object.freeze({
      versionNumber: nextVer,
      isOriginal: false, // La versión v1 original jamás se altera
      savedAt: nowIso,
      savedBy: input.actorName || 'Operador Marketing',
      changeNote: input.changeNote.trim() || `Actualización versión v${nextVer}`,
      designConfig: JSON.parse(JSON.stringify(input.designConfig)),
      catalogSnapshot: {
        primarySku: primaryItem.sku,
        productName: primaryItem.productName,
        priceSnapshotCop: activePrice,
        verifiedFeaturesSnapshot: primaryItem.verifiedFeatures
      }
    });

    existing.currentVersion = nextVer;
    existing.title = input.designConfig.title.trim() || existing.title;
    existing.primarySku = primaryItem.sku;
    existing.updatedAt = nowIso;
    existing.versions.unshift(versionEntry);

    saveBrandMerchandisingState(state);
    return existing;
  }

  const nextIdx = state.savedAssets.length + 1;
  const assetCode = `MCH-2026-${String(nextIdx).padStart(4, '0')}`;
  const v1Entry: MerchandisingAssetVersion = Object.freeze({
    versionNumber: 1,
    isOriginal: true,
    savedAt: nowIso,
    savedBy: input.actorName || 'Operador Marketing',
    changeNote: input.changeNote.trim() || 'Versión original (v1) creada desde datos reales del catálogo.',
    designConfig: JSON.parse(JSON.stringify(input.designConfig)),
    catalogSnapshot: {
      primarySku: primaryItem.sku,
      productName: primaryItem.productName,
      priceSnapshotCop: activePrice,
      verifiedFeaturesSnapshot: primaryItem.verifiedFeatures
    }
  });

  const newAsset: MerchandisingSavedAsset = {
    id: `AST-${Date.now()}-${nextIdx}`,
    assetCode,
    category: input.designConfig.category,
    format: input.designConfig.format,
    title:
      input.designConfig.title.trim() ||
      `${input.designConfig.format.toUpperCase()} — ${primaryItem.sku}`,
    primarySku: primaryItem.sku,
    currentVersion: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    versions: [v1Entry]
  };

  state.savedAssets.unshift(newAsset);
  saveBrandMerchandisingState(state);
  return newAsset;
}

// ============================================================================
// 8. RENDERIZADOR VECTORIAL SVG DE PIEZAS DIGITALES Y FÍSICAS (100% LOCAL)
// ============================================================================

export function renderMerchandisingPieceSvg(
  config: MerchandisingDesignConfig,
  brand: BrandIdentityConfig,
  catalogItems: RealCatalogMerchItem[]
): string {
  const primary =
    catalogItems.find((c) => c.sku === config.primarySku) || catalogItems[0];
  const secondary =
    catalogItems.find((c) => c.sku === config.comparisonSkuSecond) ||
    catalogItems[1] ||
    primary;

  if (!primary) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><rect width="800" height="400" fill="#0D0E12"/><text x="400" y="200" text-anchor="middle" fill="#D4AF37">Cargando catálogo real...</text></svg>`;
  }

  const isLight = config.themeVariant === 'LIGHT_EDITORIAL';
  const bgPrimary = isLight ? '#F8FAFC' : '#0D0E12';
  const bgSecondary = isLight ? '#FFFFFF' : '#151821';
  const textMain = isLight ? '#0D0E12' : '#F9FAFB';
  const textMuted = isLight ? '#4B5563' : '#9CA3AF';
  const accentGold = '#D4AF37';

  const effectivePriceCop =
    config.usePromoPriceIfAvailable && primary.currentPromoPriceCop
      ? primary.currentPromoPriceCop
      : primary.currentNormalPriceCop;

  const priceDisplay =
    effectivePriceCop !== null
      ? formatCOP(effectivePriceCop)
      : 'PRECIO EN REVISIÓN';

  // --- FORMATOS FÍSICOS (ETIQUETAS, TARJETAS, STICKERS, EMPAQUE, HOJA A4) ---
  if (config.format === 'sku_label') {
    // Etiqueta Térmica de SKU 50x25mm (600x300 viewBox)
    const barcodeSvg = renderSkuBarcodePatternSvg(primary.sku, 45, 130, 510, 95, '#0D0E12');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300" width="100%" height="100%">
      <rect width="600" height="300" rx="12" fill="#FFFFFF" stroke="#0D0E12" stroke-width="4"/>
      <rect x="0" y="0" width="600" height="54" fill="#0D0E12"/>
      <text x="24" y="35" fill="#D4AF37" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="900" letter-spacing="2">REAL TWS</text>
      <text x="576" y="35" text-anchor="end" fill="#F9FAFB" font-family="JetBrains Mono, monospace" font-size="16" font-weight="700">CATÁLOGO OFICIAL</text>
      <text x="300" y="88" text-anchor="middle" fill="#0D0E12" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800">${escapeXml(primary.productName.slice(0, 38))}</text>
      <text x="300" y="114" text-anchor="middle" fill="#4B5563" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="600">Variante: ${escapeXml(primary.variantOrColor)} | Categoría: ${escapeXml(primary.category)}</text>
      ${barcodeSvg}
      <text x="300" y="256" text-anchor="middle" fill="#0D0E12" font-family="JetBrains Mono, monospace" font-size="26" font-weight="800" letter-spacing="3">${escapeXml(primary.sku)}</text>
      <text x="300" y="282" text-anchor="middle" fill="#6B7280" font-family="JetBrains Mono, monospace" font-size="12" font-weight="600">CÓDIGO INTERNO: ${escapeXml(primary.productCode)}</text>
    </svg>`;
  }

  if (config.format === 'price_label') {
    // Etiqueta de Precio de Vitrina 55x35mm (660x420 viewBox)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 420" width="100%" height="100%">
      <rect width="660" height="420" rx="16" fill="${bgPrimary}" stroke="${accentGold}" stroke-width="5"/>
      <rect x="20" y="20" width="620" height="64" rx="10" fill="#151821" stroke="${accentGold}" stroke-width="1.5"/>
      <text x="44" y="60" fill="${accentGold}" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="900" letter-spacing="3">REAL TWS</text>
      <text x="616" y="58" text-anchor="end" fill="#F9FAFB" font-family="JetBrains Mono, monospace" font-size="18" font-weight="700">${escapeXml(primary.sku)}</text>
      <text x="330" y="138" text-anchor="middle" fill="${textMain}" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="800">${escapeXml(primary.productName.slice(0, 34))}</text>
      <text x="330" y="174" text-anchor="middle" fill="${textMuted}" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="600">Variante: ${escapeXml(primary.variantOrColor)} • ${escapeXml(primary.brandText)}</text>
      <rect x="55" y="205" width="550" height="130" rx="16" fill="#D4AF37"/>
      <text x="330" y="242" text-anchor="middle" fill="#0D0E12" font-family="JetBrains Mono, monospace" font-size="15" font-weight="800" letter-spacing="2">PRECIO CONTADO AUTORIZADO (COP)</text>
      <text x="330" y="308" text-anchor="middle" fill="#0D0E12" font-family="JetBrains Mono, monospace" font-size="54" font-weight="900">${escapeXml(priceDisplay)}</text>
      <text x="330" y="382" text-anchor="middle" fill="${textMuted}" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="600">${escapeXml(brand.slogan.slice(0, 52))}</text>
    </svg>`;
  }

  if (config.format === 'owner_internal_label') {
    // Etiqueta Interna Opcional de Propietario y Lote (60x35mm -> 720x420 viewBox)
    const ownerAlloc =
      primary.ownerAllocations.find(
        (a) =>
          a.ownerId === config.selectedOwnerIdForInternalTag ||
          a.lotId === config.selectedLotIdForInternalTag
      ) ||
      primary.ownerAllocations[0] || {
        ownerId: 'OWN-0001',
        ownerName: 'Eberto',
        lotId: `LOT-INI-2026-01-${primary.sku}`,
        storageBin: 'BODEGA-CENTRAL',
        qtyAvailable: primary.qtyAvailableTotal,
        qtyPhysical: primary.qtyPhysicalTotal
      };

    const barcodeSvg = renderSkuBarcodePatternSvg(
      `${ownerAlloc.ownerId}-${primary.sku}`,
      50,
      265,
      620,
      78,
      '#0D0E12'
    );

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 420" width="100%" height="100%">
      <rect width="720" height="420" rx="14" fill="#FFFFFF" stroke="#0D0E12" stroke-width="5"/>
      <rect x="0" y="0" width="720" height="66" fill="#0D0E12"/>
      <text x="28" y="42" fill="#D4AF37" font-family="JetBrains Mono, monospace" font-size="22" font-weight="800">CONTROL INTERNO BODEGA — REAL TWS</text>
      <text x="692" y="42" text-anchor="end" fill="#F9FAFB" font-family="JetBrains Mono, monospace" font-size="18" font-weight="700">NO EXHIBIR EN VITRINA</text>
      <rect x="28" y="86" width="320" height="90" rx="10" fill="#F3F4F6" stroke="#0D0E12" stroke-width="2"/>
      <text x="44" y="116" fill="#4B5563" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="700">PROPIETARIO DE LA MERCANCÍA:</text>
      <text x="44" y="154" fill="#0D0E12" font-family="JetBrains Mono, monospace" font-size="26" font-weight="900">${escapeXml(ownerAlloc.ownerId)} (${escapeXml(ownerAlloc.ownerName)})</text>
      <rect x="372" y="86" width="320" height="90" rx="10" fill="#F3F4F6" stroke="#0D0E12" stroke-width="2"/>
      <text x="388" y="116" fill="#4B5563" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="700">UBICACIÓN / ESTANTERÍA:</text>
      <text x="388" y="154" fill="#0D0E12" font-family="JetBrains Mono, monospace" font-size="24" font-weight="800">${escapeXml(ownerAlloc.storageBin)}</text>
      <text x="36" y="212" fill="#0D0E12" font-family="Inter, Arial, sans-serif" font-size="21" font-weight="800">SKU: ${escapeXml(primary.sku)} — ${escapeXml(primary.productName.slice(0, 30))}</text>
      <text x="36" y="244" fill="#374151" font-family="JetBrains Mono, monospace" font-size="16" font-weight="700">LOTE ASIGNADO: ${escapeXml(ownerAlloc.lotId.slice(0, 38))}</text>
      ${barcodeSvg}
      <text x="360" y="385" text-anchor="middle" fill="#0D0E12" font-family="JetBrains Mono, monospace" font-size="17" font-weight="800">${escapeXml(ownerAlloc.ownerId)} • ${escapeXml(primary.sku)} • DISP: ${ownerAlloc.qtyAvailable} UDS</text>
    </svg>`;
  }

  if (config.format === 'thank_you_card') {
    // Tarjeta de Agradecimiento 90x55mm (900x550 viewBox)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 550" width="100%" height="100%">
      <rect width="900" height="550" rx="22" fill="#0D0E12" stroke="#D4AF37" stroke-width="6"/>
      <rect x="28" y="28" width="844" height="494" rx="14" fill="none" stroke="#D4AF37" stroke-width="1.5" stroke-dasharray="8 6"/>
      <text x="450" y="120" text-anchor="middle" fill="#D4AF37" font-family="Inter, Arial, sans-serif" font-size="44" font-weight="900" letter-spacing="6">REAL TWS</text>
      <text x="450" y="160" text-anchor="middle" fill="#F3E5AB" font-family="JetBrains Mono, monospace" font-size="16" font-weight="600" letter-spacing="3">${escapeXml(brand.slogan.toUpperCase())}</text>
      <line x1="220" y1="190" x2="680" y2="190" stroke="#D4AF37" stroke-width="2"/>
      <text x="450" y="255" text-anchor="middle" fill="#F9FAFB" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800">${escapeXml(config.title || '¡Gracias por elegir REAL TWS!')}</text>
      <text x="450" y="305" text-anchor="middle" fill="#D1D5DB" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="500">${escapeXml(config.subtitle || 'Tu pedido fue verificado e inspeccionado en nuestro control de calidad.')}</text>
      <rect x="130" y="345" width="640" height="90" rx="12" fill="#151821" stroke="#D4AF37" stroke-width="1.5"/>
      <text x="450" y="382" text-anchor="middle" fill="#D4AF37" font-family="JetBrains Mono, monospace" font-size="17" font-weight="700">SOPORTE Y GARANTÍA: ${escapeXml(brand.companyInfo.whatsappContact)} • ${escapeXml(brand.companyInfo.instagramHandle)}</text>
      <text x="450" y="414" text-anchor="middle" fill="#9CA3AF" font-family="Inter, Arial, sans-serif" font-size="15">${escapeXml(brand.companyInfo.warrantyPolicySummary.slice(0, 75))}</text>
      <text x="450" y="485" text-anchor="middle" fill="#F3E5AB" font-family="JetBrains Mono, monospace" font-size="15" font-weight="700">${escapeXml(brand.companyInfo.cityAndCountry.toUpperCase())}</text>
    </svg>`;
  }

  if (config.format === 'brand_sticker') {
    // Sticker Circular / Sello de Seguridad 600x600
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="100%" height="100%">
      <rect width="600" height="600" rx="300" fill="#0D0E12" stroke="#D4AF37" stroke-width="14"/>
      <circle cx="300" cy="300" r="262" fill="none" stroke="#F3E5AB" stroke-width="3" stroke-dasharray="12 8"/>
      <path d="M210 230 C210 140, 390 140, 390 230" fill="none" stroke="#D4AF37" stroke-width="16" stroke-linecap="round"/>
      <rect x="184" y="210" width="42" height="76" rx="20" fill="#D4AF37"/>
      <rect x="374" y="210" width="42" height="76" rx="20" fill="#D4AF37"/>
      <text x="300" y="365" text-anchor="middle" fill="#F9FAFB" font-family="Inter, Arial, sans-serif" font-size="56" font-weight="900" letter-spacing="5">REAL <tspan fill="#D4AF37">TWS</tspan></text>
      <rect x="130" y="395" width="340" height="54" rx="27" fill="#D4AF37"/>
      <text x="300" y="430" text-anchor="middle" fill="#0D0E12" font-family="JetBrains Mono, monospace" font-size="20" font-weight="900" letter-spacing="2">CALIDAD INSPECCIONADA</text>
      <text x="300" y="495" text-anchor="middle" fill="#F3E5AB" font-family="JetBrains Mono, monospace" font-size="16" font-weight="700" letter-spacing="2">${escapeXml(brand.companyInfo.instagramHandle.toUpperCase())}</text>
    </svg>`;
  }

  if (config.format === 'packaging_template') {
    // Fajilla / Plantilla de Empaque 960x390
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 390" width="100%" height="100%">
      <rect width="960" height="390" rx="18" fill="#0D0E12" stroke="#D4AF37" stroke-width="5"/>
      <rect x="0" y="0" width="290" height="390" fill="#151821"/>
      <text x="145" y="110" text-anchor="middle" fill="#D4AF37" font-family="Inter, Arial, sans-serif" font-size="36" font-weight="900" letter-spacing="3">REAL TWS</text>
      <text x="145" y="145" text-anchor="middle" fill="#F9FAFB" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700">EMPAQUE OFICIAL VERIFICADO</text>
      <rect x="35" y="185" width="220" height="150" rx="10" fill="#0D0E12" stroke="#D4AF37" stroke-width="1.5"/>
      <text x="55" y="218" fill="#F3E5AB" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700">[✓] INSPECCIÓN VISUAL</text>
      <text x="55" y="250" fill="#F3E5AB" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700">[✓] PRUEBA DE CARGA/AUDIO</text>
      <text x="55" y="282" fill="#F3E5AB" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700">[✓] ACCESORIOS COMPLETOS</text>
      <text x="55" y="314" fill="#F3E5AB" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700">[✓] LOTE AUDITADO</text>
      <text x="330" y="75" fill="#D4AF37" font-family="JetBrains Mono, monospace" font-size="16" font-weight="700">ETIQUETA DE DESPACHO Y TRAZABILIDAD</text>
      <text x="330" y="120" fill="#F9FAFB" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800">${escapeXml(primary.productName.slice(0, 36))}</text>
      <text x="330" y="156" fill="#9CA3AF" font-family="JetBrains Mono, monospace" font-size="18" font-weight="700">SKU: ${escapeXml(primary.sku)} • Variante: ${escapeXml(primary.variantOrColor)}</text>
      <rect x="330" y="185" width="590" height="150" rx="12" fill="#FFFFFF" stroke="#D4AF37" stroke-width="2"/>
      <text x="354" y="225" fill="#0D0E12" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700">DESTINATARIO / CLIENTE: _____________________________________</text>
      <text x="354" y="268" fill="#0D0E12" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700">CIUDAD / DIRECCIÓN: _________________________________________</text>
      <text x="354" y="311" fill="#0D0E12" font-family="JetBrains Mono, monospace" font-size="17" font-weight="700">PEDIDO Nº: _______________   GUÍA Nº: _______________________</text>
    </svg>`;
  }

  // --- COMPARACIÓN LADO A LADO DE 2 PRODUCTOS REALES ---
  if (config.format === 'product_comparison') {
    const price2 =
      secondary.currentNormalPriceCop !== null
        ? formatCOP(secondary.currentNormalPriceCop)
        : 'EN REVISIÓN';

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" width="100%" height="100%">
      <rect width="1200" height="900" rx="24" fill="${bgPrimary}" stroke="${accentGold}" stroke-width="5"/>
      <rect x="0" y="0" width="1200" height="120" fill="#151821"/>
      <text x="50" y="65" fill="${accentGold}" font-family="Inter, Arial, sans-serif" font-size="36" font-weight="900" letter-spacing="4">REAL TWS</text>
      <text x="50" y="96" fill="#F9FAFB" font-family="JetBrains Mono, monospace" font-size="15" font-weight="600">${escapeXml(config.title || 'COMPARATIVA TÉCNICA DE CATÁLOGO REAL')}</text>
      <text x="1150" y="75" text-anchor="end" fill="#F3E5AB" font-family="JetBrains Mono, monospace" font-size="16" font-weight="700">DATOS VERIFICADOS</text>

      <!-- Columna Producto 1 -->
      <rect x="50" y="155" width="525" height="685" rx="18" fill="${bgSecondary}" stroke="${accentGold}" stroke-width="2.5"/>
      <rect x="80" y="185" width="465" height="50" rx="8" fill="#0D0E12"/>
      <text x="312" y="218" text-anchor="middle" fill="${accentGold}" font-family="JetBrains Mono, monospace" font-size="20" font-weight="800">SKU: ${escapeXml(primary.sku)}</text>
      <text x="312" y="280" text-anchor="middle" fill="${textMain}" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="800">${escapeXml(primary.productName.slice(0, 32))}</text>
      <text x="312" y="320" text-anchor="middle" fill="${textMuted}" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="600">Categoría: ${escapeXml(primary.category)} • Color/Var: ${escapeXml(primary.variantOrColor)}</text>
      <text x="85" y="385" fill="${accentGold}" font-family="JetBrains Mono, monospace" font-size="16" font-weight="700">CARACTERÍSTICAS VERIFICADAS:</text>
      <text x="85" y="425" fill="${textMain}" font-family="Inter, Arial, sans-serif" font-size="18">${escapeXml(primary.verifiedFeatures.slice(0, 52))}</text>
      <text x="85" y="460" fill="${textMuted}" font-family="Inter, Arial, sans-serif" font-size="16">${escapeXml(primary.originalExcelNotes.slice(0, 55) || 'Registro oficial auditado en inventario REAL TWS')}</text>
      <text x="85" y="525" fill="${textMain}" font-family="JetBrains Mono, monospace" font-size="18" font-weight="700">DISPONIBILIDAD ACTUAL: ${primary.qtyAvailableTotal} unidad(es)</text>
      <rect x="85" y="680" width="455" height="115" rx="14" fill="${accentGold}"/>
      <text x="312" y="720" text-anchor="middle" fill="#0D0E12" font-family="JetBrains Mono, monospace" font-size="15" font-weight="800">PRECIO VIGENTE (COP)</text>
      <text x="312" y="772" text-anchor="middle" fill="#0D0E12" font-family="JetBrains Mono, monospace" font-size="42" font-weight="900">${escapeXml(priceDisplay)}</text>

      <!-- Columna Producto 2 -->
      <rect x="625" y="155" width="525" height="685" rx="18" fill="${bgSecondary}" stroke="${accentGold}" stroke-width="2.5"/>
      <rect x="655" y="185" width="465" height="50" rx="8" fill="#0D0E12"/>
      <text x="887" y="218" text-anchor="middle" fill="${accentGold}" font-family="JetBrains Mono, monospace" font-size="20" font-weight="800">SKU: ${escapeXml(secondary.sku)}</text>
      <text x="887" y="280" text-anchor="middle" fill="${textMain}" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="800">${escapeXml(secondary.productName.slice(0, 32))}</text>
      <text x="887" y="320" text-anchor="middle" fill="${textMuted}" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="600">Categoría: ${escapeXml(secondary.category)} • Color/Var: ${escapeXml(secondary.variantOrColor)}</text>
      <text x="660" y="385" fill="${accentGold}" font-family="JetBrains Mono, monospace" font-size="16" font-weight="700">CARACTERÍSTICAS VERIFICADAS:</text>
      <text x="660" y="425" fill="${textMain}" font-family="Inter, Arial, sans-serif" font-size="18">${escapeXml(secondary.verifiedFeatures.slice(0, 52))}</text>
      <text x="660" y="460" fill="${textMuted}" font-family="Inter, Arial, sans-serif" font-size="16">${escapeXml(secondary.originalExcelNotes.slice(0, 55) || 'Registro oficial auditado en inventario REAL TWS')}</text>
      <text x="660" y="525" fill="${textMain}" font-family="JetBrains Mono, monospace" font-size="18" font-weight="700">DISPONIBILIDAD ACTUAL: ${secondary.qtyAvailableTotal} unidad(es)</text>
      <rect x="660" y="680" width="455" height="115" rx="14" fill="${accentGold}"/>
      <text x="887" y="720" text-anchor="middle" fill="#0D0E12" font-family="JetBrains Mono, monospace" font-size="15" font-weight="800">PRECIO VIGENTE (COP)</text>
      <text x="887" y="772" text-anchor="middle" fill="#0D0E12" font-family="JetBrains Mono, monospace" font-size="42" font-weight="900">${escapeXml(price2)}</text>
    </svg>`;
  }

  // --- COLECCIÓN POR CATEGORÍA O CATÁLOGO DIGITAL ---
  if (config.format === 'category_collection' || config.format === 'digital_catalog') {
    const catFilter = config.targetCategoryName || primary.category;
    const categoryProducts = catalogItems
      .filter((i) => config.format === 'digital_catalog' || i.category === catFilter)
      .slice(0, 6);

    const cardsMarkup = categoryProducts
      .map((item, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const x = 55 + col * 495;
        const y = 250 + row * 315;
        const pText =
          item.currentNormalPriceCop !== null
            ? formatCOP(item.currentNormalPriceCop)
            : 'Por Autorizar';

        return `<g transform="translate(${x}, ${y})">
          <rect width="470" height="290" rx="16" fill="${bgSecondary}" stroke="${accentGold}" stroke-width="2"/>
          <rect x="20" y="20" width="210" height="36" rx="6" fill="#0D0E12"/>
          <text x="32" y="44" fill="${accentGold}" font-family="JetBrains Mono, monospace" font-size="15" font-weight="800">${escapeXml(item.sku)}</text>
          <text x="445" y="44" text-anchor="end" fill="${textMuted}" font-family="JetBrains Mono, monospace" font-size="14" font-weight="700">Disp: ${item.qtyAvailableTotal} uds</text>
          <text x="24" y="96" fill="${textMain}" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800">${escapeXml(item.productName.slice(0, 30))}</text>
          <text x="24" y="130" fill="${textMuted}" font-family="Inter, Arial, sans-serif" font-size="16">Variante: ${escapeXml(item.variantOrColor)} • ${escapeXml(item.category)}</text>
          <text x="24" y="166" fill="${textMuted}" font-family="Inter, Arial, sans-serif" font-size="14">${escapeXml(item.verifiedFeatures.slice(0, 46))}</text>
          <rect x="24" y="205" width="422" height="62" rx="10" fill="${accentGold}"/>
          <text x="235" y="246" text-anchor="middle" fill="#0D0E12" font-family="JetBrains Mono, monospace" font-size="28" font-weight="900">${escapeXml(pText)}</text>
        </g>`;
      })
      .join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" width="100%" height="100%">
      <rect width="1080" height="1350" rx="26" fill="${bgPrimary}" stroke="${accentGold}" stroke-width="6"/>
      <rect x="0" y="0" width="1080" height="205" fill="#151821"/>
      <text x="60" y="88" fill="${accentGold}" font-family="Inter, Arial, sans-serif" font-size="48" font-weight="900" letter-spacing="5">REAL TWS</text>
      <text x="60" y="135" fill="#F9FAFB" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800">${escapeXml(config.title || `COLECCIÓN OFICIAL: ${catFilter.toUpperCase()}`)}</text>
      <text x="60" y="172" fill="#F3E5AB" font-family="JetBrains Mono, monospace" font-size="16" font-weight="600">${escapeXml(brand.slogan)}</text>
      ${cardsMarkup}
      <text x="540" y="1265" text-anchor="middle" fill="${accentGold}" font-family="JetBrains Mono, monospace" font-size="20" font-weight="800">${escapeXml(config.customCallToAction || `Pedidos WhatsApp: ${brand.companyInfo.whatsappContact} • ${brand.companyInfo.cityAndCountry}`)}</text>
      <text x="540" y="1305" text-anchor="middle" fill="${textMuted}" font-family="Inter, Arial, sans-serif" font-size="15">${escapeXml(brand.companyInfo.legalNote)}</text>
    </svg>`;
  }

  // --- FORMATO POR DEFECTO PARA FICHAS DE PRODUCTO, TARJETAS, BANNERS, PORTADAS, STORIES Y HOJA A4 ---
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="100%" height="100%">
    <defs>
      <linearGradient id="rtwPieceGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#F3E5AB"/>
        <stop offset="50%" stop-color="#D4AF37"/>
        <stop offset="100%" stop-color="#9A7409"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1080" rx="28" fill="${bgPrimary}" stroke="url(#rtwPieceGold)" stroke-width="6"/>
    <rect x="44" y="44" width="992" height="130" rx="18" fill="#151821" stroke="#D4AF37" stroke-width="2"/>
    <text x="84" y="112" fill="#D4AF37" font-family="Inter, Arial, sans-serif" font-size="44" font-weight="900" letter-spacing="4">REAL TWS</text>
    <text x="84" y="148" fill="#F3E5AB" font-family="JetBrains Mono, monospace" font-size="16" font-weight="600" letter-spacing="2">${escapeXml(brand.slogan.toUpperCase().slice(0, 48))}</text>
    <rect x="740" y="74" width="260" height="68" rx="12" fill="#0D0E12" stroke="#D4AF37" stroke-width="1.5"/>
    <text x="870" y="103" text-anchor="middle" fill="#9CA3AF" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700">SKU OFICIAL</text>
    <text x="870" y="129" text-anchor="middle" fill="#D4AF37" font-family="JetBrains Mono, monospace" font-size="20" font-weight="800">${escapeXml(primary.sku)}</text>

    <!-- Cuerpo Central de Ficha / Tarjeta -->
    <rect x="44" y="206" width="992" height="540" rx="22" fill="${bgSecondary}" stroke="#D4AF37" stroke-width="2"/>
    <text x="90" y="275" fill="#D4AF37" font-family="JetBrains Mono, monospace" font-size="18" font-weight="800" letter-spacing="2">CATEGORÍA: ${escapeXml(primary.category.toUpperCase())} • VARIANTE: ${escapeXml(primary.variantOrColor.toUpperCase())}</text>
    <text x="90" y="340" fill="${textMain}" font-family="Inter, Arial, sans-serif" font-size="44" font-weight="900">${escapeXml((config.title || primary.productName).slice(0, 34))}</text>
    <text x="90" y="390" fill="${textMuted}" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="600">${escapeXml(config.subtitle || `Denominación catálogo: ${primary.brandText} • Código ${primary.productCode}`)}</text>

    <line x1="90" y1="425" x2="990" y2="425" stroke="#D4AF37" stroke-width="1.5" stroke-dasharray="6 6"/>

    <text x="90" y="475" fill="#D4AF37" font-family="JetBrains Mono, monospace" font-size="18" font-weight="800">ESPECIFICACIONES REALES VERIFICADAS EN CATÁLOGO:</text>
    <text x="90" y="522" fill="${textMain}" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="600">• ${escapeXml(primary.verifiedFeatures.slice(0, 62))}</text>
    <text x="90" y="568" fill="${textMain}" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="500">• Variante física: ${escapeXml(primary.variantOrColor)} | Presentación: Unidad verificada</text>
    <text x="90" y="614" fill="${textMuted}" font-family="Inter, Arial, sans-serif" font-size="20">• Observación de auditoría: ${escapeXml(primary.originalExcelNotes.slice(0, 58) || 'Producto inspeccionado en inventario oficial REAL TWS')}</text>
    <text x="90" y="668" fill="#10B981" font-family="JetBrains Mono, monospace" font-size="20" font-weight="800">✓ STOCK DISPONIBLE VERIFICADO: ${primary.qtyAvailableTotal} UNIDAD(ES)</text>

    ${
      config.showPriceBadge
        ? `<rect x="44" y="776" width="992" height="165" rx="20" fill="url(#rtwPieceGold)"/>
           <text x="540" y="825" text-anchor="middle" fill="#0D0E12" font-family="JetBrains Mono, monospace" font-size="19" font-weight="800" letter-spacing="3">PRECIO COMERCIAL VIGENTE (COP)</text>
           <text x="540" y="908" text-anchor="middle" fill="#0D0E12" font-family="JetBrains Mono, monospace" font-size="72" font-weight="900">${escapeXml(priceDisplay)}</text>`
        : ''
    }

    <text x="540" y="995" text-anchor="middle" fill="${textMain}" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700">${escapeXml(config.customCallToAction || `Solicítalo por WhatsApp: ${brand.companyInfo.whatsappContact} • ${brand.companyInfo.instagramHandle}`)}</text>
    <text x="540" y="1035" text-anchor="middle" fill="${textMuted}" font-family="Inter, Arial, sans-serif" font-size="16">${escapeXml(config.footerLegalOrWarrantyNote || brand.companyInfo.warrantyPolicySummary)}</text>
  </svg>`;
}

// ============================================================================
// 9. EXPORTACIÓN LOCAL DE IMÁGENES (PNG DE ALTA RESOLUCIÓN Y SVG) Y PDF IMPRIMIBLE
//    100% EN EL NAVEGADOR — CERO APIS GRÁFICAS PAGAS
// ============================================================================

export function exportSvgMarkupToSvgFile(svgMarkup: string, filename: string): void {
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportSvgMarkupToPngFile(
  svgMarkup: string,
  filename: string,
  widthPx = 1200,
  heightPx = 1200
): Promise<void> {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = widthPx;
        canvas.height = heightPx;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('No se pudo inicializar el contexto gráfico Canvas 2D local.'));
          return;
        }
        ctx.fillStyle = '#0D0E12';
        ctx.fillRect(0, 0, widthPx, heightPx);
        ctx.drawImage(img, 0, 0, widthPx, heightPx);
        URL.revokeObjectURL(url);

        canvas.toBlob((pngBlob) => {
          if (!pngBlob) {
            reject(new Error('Error al generar el archivo PNG en el navegador.'));
            return;
          }
          const pngUrl = URL.createObjectURL(pngBlob);
          const link = document.createElement('a');
          link.href = pngUrl;
          link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(pngUrl);
          resolve();
        }, 'image/png');
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo rasterizar el vector SVG en el navegador.'));
    };

    img.src = url;
  });
}

export function exportPrintableMerchandisingToPdf(
  svgMarkup: string,
  title: string,
  copiesCount = 1,
  printSizeMm = 'A4'
): void {
  const safeCopies = Math.max(1, Math.min(24, copiesCount));
  const repeatedBlocks = Array.from({ length: safeCopies })
    .map(
      () =>
        `<div class="print-item">${svgMarkup}</div>`
    )
    .join('');

  const isMultiLabelGrid = safeCopies > 1;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${escapeXml(title)} — Impresión PDF REAL TWS</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: Inter, Arial, sans-serif;
      background: #FFFFFF;
      color: #0D0E12;
    }
    .print-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #D4AF37;
      padding-bottom: 6px;
      margin-bottom: 12px;
      font-size: 11px;
    }
    .print-grid {
      display: grid;
      grid-template-columns: ${isMultiLabelGrid ? 'repeat(2, 1fr)' : '1fr'};
      gap: 8mm;
      align-items: start;
    }
    .print-item {
      width: 100%;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .print-item svg {
      width: 100%;
      height: auto;
      display: block;
    }
    @media print {
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="print-header">
    <div><strong>REAL TWS — BRAND &amp; MERCHANDISING CENTER</strong> | Pieza: ${escapeXml(title)}</div>
    <div>Formato: ${escapeXml(printSizeMm)} | Copias en pliego: ${safeCopies}</div>
  </div>
  <div class="no-print" style="margin-bottom: 14px; padding: 10px; background: #0D0E12; color: #F9FAFB; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
    <span>Vista lista para imprimir o guardar como <strong>PDF</strong> desde el diálogo nativo del navegador.</span>
    <button onclick="window.print()" style="background: #D4AF37; color: #0D0E12; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 800; cursor: pointer;">Imprimir / Guardar como PDF</button>
  </div>
  <div class="print-grid">
    ${repeatedBlocks}
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 250);
    };
  </script>
</body>
</html>`;

  const printWin = window.open('', '_blank', 'width=980,height=820');
  if (printWin) {
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
  } else {
    // Fallback si el navegador bloquea popups: descargar archivo HTML imprimible
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_IMPRIMIBLE_PDF.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export async function initializeBrandMerchCatalogBaseline(): Promise<void> {
  await ensureExcelBaselineLoadedInInventory('admin@realtws.co');
}
