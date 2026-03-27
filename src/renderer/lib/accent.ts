import type { ThemePreset } from './themes';

export interface AccentColors {
  accent: string;
  accentBright: string;
  accentDim: string;
  accentH: number;
  accentS: number;
  accentL: number;
}

/** Convert hex color to HSL components */
export function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, Math.round(l * 100)];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;

  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/** Derive all accent CSS variables from a single hex color */
export function deriveAccentColors(hex: string): AccentColors {
  const [h, s, l] = hexToHsl(hex);
  return {
    accent: hex,
    accentBright: `hsl(${h}, ${Math.min(s + 10, 100)}%, ${Math.min(l + 15, 90)}%)`,
    accentDim: `hsl(${h}, ${s}%, ${l}%, 0.5)`,
    accentH: h,
    accentS: s,
    accentL: l,
  };
}

/** Apply accent CSS variables to document root */
export function applyAccentToDOM(hex: string): void {
  const colors = deriveAccentColors(hex);
  const root = document.documentElement.style;
  root.setProperty('--accent-color', colors.accent);
  root.setProperty('--accent-bright', colors.accentBright);
  root.setProperty('--accent-dim', colors.accentDim);
  root.setProperty('--accent-h', String(colors.accentH));
  root.setProperty('--accent-s', `${colors.accentS}%`);
  root.setProperty('--accent-l', `${colors.accentL}%`);
  root.setProperty(
    '--accent-glow-sm',
    `0 0 8px hsl(${colors.accentH}, ${colors.accentS}%, ${colors.accentL}%, 0.3)`,
  );
  root.setProperty(
    '--accent-glow-md',
    `0 0 16px hsl(${colors.accentH}, ${colors.accentS}%, ${colors.accentL}%, 0.25), 0 0 32px hsl(${colors.accentH}, ${colors.accentS}%, ${colors.accentL}%, 0.1)`,
  );
  root.setProperty(
    '--accent-glow-lg',
    `0 0 24px hsl(${colors.accentH}, ${colors.accentS}%, ${colors.accentL}%, 0.3), 0 0 48px hsl(${colors.accentH}, ${colors.accentS}%, ${colors.accentL}%, 0.12), 0 0 96px hsl(${colors.accentH}, ${colors.accentS}%, ${colors.accentL}%, 0.04)`,
  );
  root.setProperty('--color-ember', colors.accent);
  root.setProperty('--color-ember-bright', colors.accentBright);
  // Tailwind v4 custom color
  root.setProperty('--color-accent', colors.accent);
  root.setProperty('--color-accent-bright', colors.accentBright);
}

/** Apply a full theme to document root — sets all surface, text, accent, and semantic vars */
export function applyThemeToDOM(theme: ThemePreset): void {
  const root = document.documentElement.style;

  // Apply accent (reuse existing logic)
  applyAccentToDOM(theme.accent);

  // Surfaces
  root.setProperty('--color-void', theme.void);
  root.setProperty('--color-panel', theme.panel);
  root.setProperty('--color-shelf', theme.shelf);
  root.setProperty('--color-elevated', theme.elevated);

  // Text
  root.setProperty('--color-bone', theme.bone);
  root.setProperty('--color-ash', theme.ash);
  root.setProperty('--color-stone', theme.stone);
  root.setProperty('--color-shadow', theme.shadow);

  // Accent foreground
  root.setProperty('--accent-foreground', theme.accentForeground);

  // Semantic
  root.setProperty('--color-ok', theme.ok);
  root.setProperty('--color-danger', theme.danger);
  root.setProperty('--color-depth', theme.info);
  root.setProperty('--info', theme.info);

  // Update legacy aliases that read from the named tokens
  root.setProperty('--bg-base', theme.void);
  root.setProperty('--bg-surface', theme.panel);
  root.setProperty('--bg-overlay', theme.shelf);
  root.setProperty('--bg-muted', theme.elevated);
  root.setProperty('--text-primary', theme.bone);
  root.setProperty('--text-secondary', theme.ash);
  root.setProperty('--text-muted', theme.stone);
}

/** Apply glass blur CSS variable to document root */
export function applyGlassBlurToDOM(blur: number): void {
  document.documentElement.style.setProperty('--glass-blur', `${blur}px`);
}

/** Apply an override color CSS variable, or remove it to fall back to CSS default */
function applyColorOverride(varName: string, color: string): void {
  const root = document.documentElement.style;
  if (color) {
    root.setProperty(varName, color);
  } else {
    root.removeProperty(varName);
  }
}

export function applyParticleColorToDOM(color: string): void {
  applyColorOverride('--particle-color', color);
}

export function applyGlowColorToDOM(color: string): void {
  applyColorOverride('--glow-color', color);
}

export function applyParticleSpeedToDOM(speed: number): void {
  const duration = (1.2 / speed).toFixed(2);
  document.documentElement.style.setProperty('--spark-duration', `${duration}s`);
}

export const ACCENT_PRESETS: Record<string, string> = {
  Golden: '#c9a24d',
  Crimson: '#c04a3a',
  Electric: '#3a8ec0',
  Violet: '#8a5ac0',
  Emerald: '#4a8c5e',
  Rose: '#c06a8a',
  Ice: '#5ac0c0',
  Mono: '#888888',
};
