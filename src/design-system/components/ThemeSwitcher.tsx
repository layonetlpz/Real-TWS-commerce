import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../themes/ThemeContext';
import type { ThemePreference } from '../tokens/designTokens';

interface ThemeSwitcherProps {
  compact?: boolean;
  className?: string;
}

const THEME_OPTIONS: Array<{
  id: ThemePreference;
  label: string;
  shortLabel: string;
  icon: typeof Moon;
  title: string;
}> = [
  {
    id: 'dark',
    label: 'Oscuro',
    shortLabel: 'Oscuro',
    icon: Moon,
    title: 'Modo oscuro: Negro Obsidiana & Amarillo Dorado'
  },
  {
    id: 'light',
    label: 'Claro',
    shortLabel: 'Claro',
    icon: Sun,
    title: 'Modo claro: Blanco Perla & Amarillo Dorado'
  },
  {
    id: 'system',
    label: 'Auto',
    shortLabel: 'Auto',
    icon: Monitor,
    title: 'Sincronizar automáticamente con el tema del sistema'
  }
];

export function ThemeSwitcher({ compact = false, className = '' }: ThemeSwitcherProps) {
  const { preference, setThemePreference } = useTheme();

  return (
    <div
      className={`rtw-theme-switcher ${compact ? 'rtw-theme-switcher-compact' : ''} ${className}`.trim()}
      role="radiogroup"
      aria-label="Selector de tema visual"
    >
      {THEME_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = preference === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.title}
            title={opt.title}
            className={`rtw-theme-switcher-btn ${active ? 'active' : ''}`}
            onClick={() => setThemePreference(opt.id)}
          >
            <Icon size={13.5} aria-hidden="true" />
            {!compact && <span className="rtw-theme-switcher-label">{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
