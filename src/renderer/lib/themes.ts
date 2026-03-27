
export interface ThemePreset {
  id: string;
  name: string;
  // Accent
  accent: string;
  accentBright: string;
  // Surfaces (4 levels: darkest → lightest)
  void: string;
  panel: string;
  shelf: string;
  elevated: string;
  // Text (4 levels: brightest → darkest)
  bone: string;
  ash: string;
  stone: string;
  shadow: string;
  // Accent foreground (text color on accent-colored buttons)
  accentForeground: string;
  // Semantic
  ok: string;
  danger: string;
  info: string;
}

export const THEMES: ThemePreset[] = [
  {
    id: "oscura-midnight",
    name: "Oscura Midnight",
    accent: "#c9a24d",
    accentBright: "#dbb55e",
    accentForeground: "#0a0a0b",
    void: "#0a0a0b",
    panel: "#131314",
    shelf: "#1b1b1d",
    elevated: "#242426",
    bone: "#e8e4dc",
    ash: "#9e9a92",
    stone: "#6b6760",
    shadow: "#3d3a35",
    ok: "#4a8c5e",
    danger: "#c0453a",
    info: "#7ca8cf",
  },
  {
    id: "dusk",
    name: "Dusk",
    accent: "#e07850",
    accentBright: "#f09070",
    accentForeground: "#0a0a0b",
    void: "#0f0a0a",
    panel: "#1a1214",
    shelf: "#241a1d",
    elevated: "#2e2225",
    bone: "#f0e0d8",
    ash: "#b09890",
    stone: "#786860",
    shadow: "#483830",
    ok: "#5a9960",
    danger: "#d04540",
    info: "#8090c0",
  },
  {
    id: "lime",
    name: "Lime",
    accent: "#8cc63f",
    accentBright: "#a0d855",
    accentForeground: "#0a0a0b",
    void: "#080a08",
    panel: "#101410",
    shelf: "#181e18",
    elevated: "#202820",
    bone: "#e0ead8",
    ash: "#98a890",
    stone: "#607058",
    shadow: "#384030",
    ok: "#6aaa40",
    danger: "#c04a3a",
    info: "#70a0c0",
  },
  {
    id: "ocean",
    name: "Ocean",
    accent: "#4a90d9",
    accentBright: "#60a8f0",
    accentForeground: "#0a0a0b",
    void: "#080a0f",
    panel: "#0e1218",
    shelf: "#141a24",
    elevated: "#1c2430",
    bone: "#d8e4f0",
    ash: "#90a0b8",
    stone: "#586878",
    shadow: "#303848",
    ok: "#4a9068",
    danger: "#d05050",
    info: "#5090cc",
  },
  {
    id: "retro",
    name: "Retro",
    accent: "#e8a040",
    accentBright: "#f0b860",
    accentForeground: "#0a0a0b",
    void: "#0c0a06",
    panel: "#161410",
    shelf: "#201c16",
    elevated: "#2a261e",
    bone: "#f0e8d0",
    ash: "#b8a888",
    stone: "#807060",
    shadow: "#484038",
    ok: "#609850",
    danger: "#c85040",
    info: "#7898b0",
  },
  {
    id: "neo",
    name: "Neo",
    accent: "#c060c0",
    accentBright: "#d880d8",
    accentForeground: "#f5f0e8",
    void: "#0a080c",
    panel: "#141018",
    shelf: "#1e1824",
    elevated: "#28202e",
    bone: "#e8dce8",
    ash: "#a898b0",
    stone: "#706078",
    shadow: "#403848",
    ok: "#509878",
    danger: "#d04848",
    info: "#8888cc",
  },
  {
    id: "forest",
    name: "Forest",
    accent: "#50a870",
    accentBright: "#68c088",
    accentForeground: "#0a0a0b",
    void: "#060a08",
    panel: "#0c140e",
    shelf: "#141e16",
    elevated: "#1c281e",
    bone: "#d8e8dc",
    ash: "#90a898",
    stone: "#587060",
    shadow: "#304038",
    ok: "#48a060",
    danger: "#c04a3a",
    info: "#6898b8",
  },
  {
    id: "matrix",
    name: "Matrix",
    accent: "#33ff33",
    accentBright: "#55ff55",
    accentForeground: "#0a0a0b",
    void: "#000000",
    panel: "#0a0f0a",
    shelf: "#101810",
    elevated: "#182018",
    bone: "#c0ffc0",
    ash: "#70b070",
    stone: "#408040",
    shadow: "#205020",
    ok: "#33cc33",
    danger: "#ff3333",
    info: "#33cccc",
  },
  {
    id: "lite-suite",
    name: "Lite Suite",
    accent: "#c9a24d",
    accentBright: "#dbb55e",
    accentForeground: "#0a0a0b",
    void: "#0a0a0b",
    panel: "#131314",
    shelf: "#1b1b1d",
    elevated: "#242426",
    bone: "#e8e4dc",
    ash: "#9e9a92",
    stone: "#6b6760",
    shadow: "#3d3a35",
    ok: "#4a8c5e",
    danger: "#c0453a",
    info: "#7ca8cf",
  },
];

export function getThemeById(id: string): ThemePreset | undefined {
  return THEMES.find((t) => t.id === id);
}

export const DEFAULT_THEME_ID = "oscura-midnight";
