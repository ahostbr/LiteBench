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
  // Tailwind v4 custom color
  root.setProperty('--color-accent', colors.accent);
  root.setProperty('--color-accent-bright', colors.accentBright);
}

export const ACCENT_PRESETS: Record<string, string> = {
  Electric: '#3a8ec0',
  Golden: '#c9a24d',
  Crimson: '#c04a3a',
  Violet: '#8a5ac0',
  Emerald: '#4a8c5e',
  Rose: '#c06a8a',
  Ice: '#5ac0c0',
  Mono: '#888888',
};
