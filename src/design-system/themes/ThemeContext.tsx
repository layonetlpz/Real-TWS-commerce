import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import type { ResolvedTheme, ThemePreference } from '../tokens/designTokens';

export const THEME_STORAGE_KEY = 'rtw_theme_preference_v1';

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  setThemePreference: (next: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function detectSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'dark';
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'dark' || raw === 'light' || raw === 'system') {
      return raw;
    }
  } catch {
    // Fallback seguro si localStorage está restringido
  }
  return 'dark';
}

function applyThemeToDocument(resolved: ResolvedTheme, animateTransition = false): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  if (animateTransition) {
    root.classList.add('rtw-theme-transitioning');
    window.setTimeout(() => {
      root.classList.remove('rtw-theme-transitioning');
    }, 360);
  }

  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', resolved === 'dark' ? '#090b10' : '#f6f7fa');
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStoredPreference());
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => detectSystemTheme());

  const resolvedTheme: ResolvedTheme =
    preference === 'system' ? systemTheme : preference;

  useEffect(() => {
    applyThemeToDocument(resolvedTheme, false);
  }, [resolvedTheme]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'light' : 'dark');
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const setThemePreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignorar si almacenamiento está bloqueado
    }
    const targetResolved: ResolvedTheme = next === 'system' ? detectSystemTheme() : next;
    applyThemeToDocument(targetResolved, true);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: ThemePreference = resolvedTheme === 'dark' ? 'light' : 'dark';
    setThemePreference(next);
  }, [resolvedTheme, setThemePreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolvedTheme,
      isDark: resolvedTheme === 'dark',
      setThemePreference,
      toggleTheme
    }),
    [preference, resolvedTheme, setThemePreference, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme debe usarse dentro de un ThemeProvider');
  }
  return ctx;
}
