// ============================================================================
// REAL TWS COMMERCE SYSTEM — CENTRALIZED DESIGN SYSTEM TOKENS
// Dirección Artística: Brushed Champagne Gold · Velvet Obsidian · Luminous Pearl
// Inspirado directamente en la placa metálica 3D REAL TWS y el medallón Rws.
// ============================================================================

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';
export type GlassSurfaceLevel = 1 | 2 | 3 | 4;

export const REAL_TWS_BRAND_IDENTITY = {
  brandName: 'REAL TWS',
  tagline: 'AURICULARES PREMIUM',
  officialWhatsappDisplay: '320 698 8013',
  officialWhatsappRaw: '3206988013',
  monogram: 'Rws',
  plaqueAssetPath: '/brand/real-tws-plaque-gold.jpg',
  monogramAssetPath: '/brand/real-tws-monogram-rws.jpg'
} as const;

export const YELLOW_GOLD_SCALE = {
  100: '#FFF6CC', // Specular top flare hot-spot
  200: '#F6DF96', // 3D top bevel highlight
  300: '#E8C766', // Luminous champagne gold
  400: '#D4AF37', // Core brushed metallic gold
  500: '#C59B27', // Warm satin gold midtone
  600: '#B3881D', // Deep gold hover state
  700: '#8C6A22', // Extruded 3D bevel bronze shadow
  800: '#73540A', // High-contrast ink on pearl light surfaces
  translucent: 'rgba(212, 175, 55, 0.16)',
  reflection: 'rgba(255, 246, 204, 0.42)',
  subtleBg: 'rgba(212, 175, 55, 0.08)'
} as const;

export const GRAY_SCALE_DARK = {
  950: '#07080B', // Deepest obsidian void
  900: '#0B0D12', // Matte obsidian plaque canvas
  850: '#10141C', // Elevated graphite background
  800: '#151A24', // Glass surface base
  700: '#1E2533', // Interactive hover surface
  600: '#2A3346', // Muted metallic border
  400: '#94A3B8', // Muted caption text
  300: '#CBD5E1', // Secondary readable text
  100: '#F8FAFC'  // Primary high-contrast alabaster text
} as const;

export const GRAY_SCALE_LIGHT = {
  50: '#FFFFFF',  // Pure crystal highlight
  100: '#F8F9FC', // Warm pearl canvas
  200: '#EEF1F6', // Secondary ambient canvas
  300: '#E2E7F0', // Subtle divider & rim
  400: '#CBD5E1', // Input & card border
  500: '#64748B', // Muted text
  700: '#334155', // Secondary ink
  900: '#0B0F17'  // Primary deep obsidian text
} as const;

export const GLASS_SURFACE_LEVELS: Record<
  GlassSurfaceLevel,
  {
    id: string;
    name: string;
    className: string;
    description: string;
    blurPx: number;
    saturatePct: number;
  }
> = {
  1: {
    id: 'subtle',
    name: 'Glass Surface 1 — Subtle Glass',
    className: 'rtw-glass-surface-1',
    description: 'Superficie de alta legibilidad y baja interferencia para tablas densas, formularios y celdas.',
    blurPx: 10,
    saturatePct: 145
  },
  2: {
    id: 'medium',
    name: 'Glass Surface 2 — Medium Glass',
    className: 'rtw-glass-surface-2',
    description: 'Superficie translúcida equilibrada para tarjetas operativas, KPIs y paneles secundarios.',
    blurPx: 18,
    saturatePct: 170
  },
  3: {
    id: 'premium',
    name: 'Glass Surface 3 — Premium Plaque Glass',
    className: 'rtw-glass-surface-3',
    description: 'Superficie ejecutiva destacada con borde metálico dorado y destello especular superior.',
    blurPx: 26,
    saturatePct: 185
  },
  4: {
    id: 'floating',
    name: 'Glass Surface 4 — Floating Overlay Glass',
    className: 'rtw-glass-surface-4',
    description: 'Superficie flotante de máxima profundidad para modales, drawers, menús contextuales y dock móvil.',
    blurPx: 32,
    saturatePct: 195
  }
};

export const MOTION_TOKENS = {
  easings: {
    spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
    snappy: 'cubic-bezier(0.16, 1, 0.3, 1)',
    smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
    liquid: 'cubic-bezier(0.25, 0.85, 0.35, 1)'
  },
  durations: {
    instant: '120ms',
    fast: '180ms',
    normal: '260ms',
    slow: '380ms',
    themeTransition: '320ms'
  }
} as const;
