// Light/dark theme + custom accent, persisted in localStorage and applied to
// the document root. Applied before React renders (see main.tsx) to avoid a flash.

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_KEY = 'inchat-theme';
const ACCENT_KEY = 'inchat-accent';

/** Preset accents users can pick (plus a custom color input). */
export const ACCENT_PRESETS = [
  { name: 'Pine', hex: '#2e6b4f' },
  { name: 'Ocean', hex: '#2563eb' },
  { name: 'Violet', hex: '#7c3aed' },
  { name: 'Rose', hex: '#e11d48' },
  { name: 'Amber', hex: '#d97706' },
  { name: 'Teal', hex: '#0d9488' },
  { name: 'Slate', hex: '#475569' },
];

export function getTheme(): ThemeMode {
  const v = localStorage.getItem(THEME_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
}

export function setTheme(mode: ThemeMode) {
  localStorage.setItem(THEME_KEY, mode);
  applyTheme(mode);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

export function getAccent(): string | null {
  return localStorage.getItem(ACCENT_KEY);
}

export function applyAccent(hex: string | null) {
  const root = document.documentElement;
  const rgb = hex ? hexToRgb(hex) : null;
  if (!hex || !rgb) {
    for (const v of ['--accent', '--accent-hover', '--accent-soft', '--accent-text', '--sidebar-active']) {
      root.style.removeProperty(v);
    }
    return;
  }
  const { r, g, b } = rgb;
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--accent-hover', `#${toHex(r * 0.82)}${toHex(g * 0.82)}${toHex(b * 0.82)}`);
  root.style.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, 0.16)`);
  root.style.setProperty('--accent-text', '#ffffff');
  root.style.setProperty('--sidebar-active', hex);
}

export function setAccent(hex: string | null) {
  if (hex) localStorage.setItem(ACCENT_KEY, hex);
  else localStorage.removeItem(ACCENT_KEY);
  applyAccent(hex);
}

/** Apply stored preferences on boot. */
export function initAppearance() {
  applyTheme(getTheme());
  applyAccent(getAccent());
}
