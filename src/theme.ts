export type ThemeConfig = {
  /** Primary / background color */
  background: string;
  /** Secondary / card & item color */
  surface: string;
  /** Accent / tabs & highlights */
  accent: string;
};

export const THEME_STORAGE_KEY = 'app-theme-colors';

export const DEFAULT_THEME: ThemeConfig = {
  background: '#09090b',
  surface: '#18181b',
  accent: '#00E5FF',
};

export const PRESET_THEMES: Record<string, ThemeConfig> = {
  onyxMidnight: {
    background: '#0E1320',
    surface: '#0A0F1A',
    accent: '#5C8DFF',
  },
  nebulaPulse: {
    background: '#120F1F',
    surface: '#0B0A13',
    accent: '#6AE6DA',
  },
  stealthGraphite: {
    background: '#1A1F2B',
    surface: '#131720',
    accent: '#FFB757',
  },
  carbonRedline: {
    background: '#0D0D0D',
    surface: '#161616',
    accent: '#FF3B30',
  },
  auroraDrift: {
    background: '#0C1D24',
    surface: '#081418',
    accent: '#4CE6A5',
  },
};

const hexToRgb = (hex: string) => {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const normalized = hex.replace(shorthandRegex, (_m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized);
  return result ? `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}` : null;
};

export const applyTheme = (theme: ThemeConfig) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  const backgroundRgb = hexToRgb(theme.background);
  const surfaceRgb = hexToRgb(theme.surface);
  const accentRgb = hexToRgb(theme.accent);

  if (backgroundRgb) root.style.setProperty('--color-background', backgroundRgb);
  if (surfaceRgb) root.style.setProperty('--color-surface', surfaceRgb);
  if (accentRgb) root.style.setProperty('--color-primary', accentRgb);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
  } catch (error) {
    console.warn('Unable to persist theme colors', error);
  }
};

export const loadSavedTheme = (): ThemeConfig => {
  if (typeof localStorage === 'undefined') return DEFAULT_THEME;
  const savedConfig = localStorage.getItem(THEME_STORAGE_KEY);
  if (!savedConfig) return DEFAULT_THEME;

  try {
    const parsed = JSON.parse(savedConfig);
    return {
      background: parsed.background || DEFAULT_THEME.background,
      surface: parsed.surface || DEFAULT_THEME.surface,
      accent: parsed.accent || parsed.primary || DEFAULT_THEME.accent,
    };
  } catch (error) {
    console.error('Failed to parse saved theme settings', error);
    return DEFAULT_THEME;
  }
};

export const ensureThemeInitialized = () => {
  const theme = loadSavedTheme();
  applyTheme(theme);
};

