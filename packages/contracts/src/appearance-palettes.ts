/*
 * Die ersten sechs Paletten spiegeln die dunklen Built-ins von T3 Code wider.
 * Die Farbrollen werden auf Wrapt-Flächen abgebildet, damit eingebettete und
 * lokale UI dieselbe visuelle Sprache verwenden können.
 */
export const appearanceThemePresetIds = [
  "t3-code",
  "t3-chat",
  "grove",
  "ocean",
  "ember",
  "iris",
  "dark-modern",
  "monokai",
  "carbon",
  "signal",
] as const;

export type AppearanceThemePresetId = (typeof appearanceThemePresetIds)[number];

export type AppearancePresetColors = {
  accent: string;
  accentContrast: string;
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceOverlay: string;
  sidebar: string;
  topbar: string;
  bottomBar: string;
  text: string;
  muted: string;
  faint: string;
  border: string;
  borderStrong: string;
  input: string;
  hover: string;
  selected: string;
  focus: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
};

export const appearanceThemeCatalog: ReadonlyArray<{
  id: AppearanceThemePresetId;
  label: string;
  group: "T3 Code" | "VS Code inspiriert" | "Wrapt entworfen";
  description: string;
}> = [
  { id: "t3-code", label: "T3 Code", group: "T3 Code", description: "Das dunkle Original-Layout von T3 Code." },
  { id: "t3-chat", label: "T3 Chat", group: "T3 Code", description: "Dunkles Pflaume- und Rosé-Thema aus T3 Code." },
  { id: "grove", label: "Grove", group: "T3 Code", description: "Ruhiges, erdiges Grün mit viel Tiefe." },
  { id: "ocean", label: "Ocean", group: "T3 Code", description: "Kühles Blau mit klaren Kontrasten." },
  { id: "ember", label: "Ember", group: "T3 Code", description: "Warme Kupfer- und Glut-Töne für lange Sessions." },
  { id: "iris", label: "Iris", group: "T3 Code", description: "Kontrastreiches Violett aus der T3-Code-Palette." },
  { id: "dark-modern", label: "Dark Modern", group: "VS Code inspiriert", description: "An VS Code Dark Modern angelehnt, mit blauem Fokus." },
  { id: "monokai", label: "Monokai", group: "VS Code inspiriert", description: "Die bekannte warme Editor-Palette mit Grün und Pink." },
  { id: "carbon", label: "Carbon", group: "Wrapt entworfen", description: "Graphit, Stahl und ein klarer Cyan-Akzent." },
  { id: "signal", label: "Signal", group: "Wrapt entworfen", description: "Ruhiges Nachtblau mit warmer Signal-Farbe." },
];

const t3StatusColors = {
  success: "oklch(0.765 0.177 163.223)",
  warning: "oklch(0.76859 0.164659 70.08)",
  danger: "oklch(0.655108 0.221148 23.473)",
  info: "oklch(0.758933 0.105833 241.548)",
};

const t3CodeColors: AppearancePresetColors = {
  ...t3StatusColors,
  accent: "#346bf1",
  accentContrast: "#ffffff",
  background: "#0a0a0a",
  surface: "#111111",
  surfaceRaised: "#141414",
  surfaceOverlay: "#191919",
  sidebar: "#000000",
  topbar: "#0a0a0a",
  bottomBar: "#0a0a0a",
  text: "#f5f5f5",
  muted: "#818181",
  faint: "#a3a3a3",
  border: "#191919",
  borderStrong: "#191919",
  input: "#1e1e1e",
  hover: "#131313",
  selected: "#111111",
  focus: "#346bf1",
};

const t3ChatColors: AppearancePresetColors = {
  ...t3StatusColors,
  accent: "oklch(0.460685 0.185347 4.099)",
  accentContrast: "oklch(0.901233 0.057189 343.694)",
  background: "oklch(0.22813 0.020366 307.469)",
  surface: "oklch(0.267101 0.02016 311.799)",
  surfaceRaised: "oklch(0.279864 0.021572 309.532)",
  surfaceOverlay: "oklch(0.154761 0.01316 338.901)",
  sidebar: "oklch(0.185778 0.019368 322.159)",
  topbar: "oklch(0.22813 0.020366 307.469)",
  bottomBar: "oklch(0.313674 0.030572 310.061)",
  text: "oklch(0.980735 0.004092 301.426)",
  muted: "oklch(0.880303 0.03077 342.696)",
  faint: "oklch(0.880303 0.03077 342.696)",
  border: "oklch(0.266943 0.015262 302.425)",
  borderStrong: "oklch(0.266943 0.015262 302.425)",
  input: "oklch(0.266817 0.02897 344.461)",
  hover: "oklch(0.23366 0.026081 338.196)",
  selected: "oklch(0.23366 0.026081 338.196)",
  focus: "oklch(0.591646 0.217985 0.584)",
};

const groveColors: AppearancePresetColors = {
  ...t3StatusColors,
  accent: "oklch(0.796228 0.133058 157.319)",
  accentContrast: "oklch(0.222003 0.03479 328.979)",
  background: "oklch(0.260865 0.02152 162.75)",
  surface: "oklch(0.260865 0.02152 162.75)",
  surfaceRaised: "oklch(0.363192 0.016572 165.32)",
  surfaceOverlay: "oklch(0.411828 0.014378 166.627)",
  sidebar: "oklch(0.309925 0.032827 160.944)",
  topbar: "oklch(0.260865 0.02152 162.75)",
  bottomBar: "oklch(0.380487 0.048313 159.608)",
  text: "oklch(0.990339 0.008411 325.64)",
  muted: "oklch(0.666747 0.004239 187.292)",
  faint: "oklch(0.711387 0.007643 175.89)",
  border: "oklch(0.457475 0.044046 160.971)",
  borderStrong: "oklch(0.464636 0.066083 158.72)",
  input: "oklch(0.519849 0.049896 160.863)",
  hover: "oklch(0.374959 0.047124 159.686)",
  selected: "oklch(0.437466 0.060406 158.958)",
  focus: "oklch(0.796228 0.133058 157.319)",
};

const oceanColors: AppearancePresetColors = {
  ...t3StatusColors,
  accent: "oklch(0.758933 0.105833 241.548)",
  accentContrast: "oklch(0.222003 0.03479 328.979)",
  background: "oklch(0.242641 0.024125 250.573)",
  surface: "oklch(0.242641 0.024125 250.573)",
  surfaceRaised: "oklch(0.348439 0.019942 253.696)",
  surfaceOverlay: "oklch(0.398517 0.018232 255.72)",
  sidebar: "oklch(0.290387 0.032043 247.274)",
  topbar: "oklch(0.242641 0.024125 250.573)",
  bottomBar: "oklch(0.358725 0.043145 244.911)",
  text: "oklch(0.990339 0.008411 325.64)",
  muted: "oklch(0.652227 0.01149 273.31)",
  faint: "oklch(0.69099 0.01395 266.424)",
  border: "oklch(0.438653 0.039496 245.44)",
  borderStrong: "oklch(0.439946 0.0561 243.479)",
  input: "oklch(0.500905 0.043574 244.781)",
  hover: "oklch(0.353381 0.042285 245.043)",
  selected: "oklch(0.413744 0.051943 243.848)",
  focus: "oklch(0.758933 0.105833 241.548)",
};

const emberColors: AppearancePresetColors = {
  ...t3StatusColors,
  accent: "oklch(0.762174 0.124117 52.082)",
  accentContrast: "oklch(0.222003 0.03479 328.979)",
  background: "oklch(0.245899 0.019144 42.044)",
  surface: "oklch(0.245899 0.019144 42.044)",
  surfaceRaised: "oklch(0.351262 0.01565 37.592)",
  surfaceOverlay: "oklch(0.401111 0.014308 34.896)",
  sidebar: "oklch(0.293349 0.029554 46.882)",
  topbar: "oklch(0.245899 0.019144 42.044)",
  bottomBar: "oklch(0.361499 0.044052 49.515)",
  text: "oklch(0.990339 0.008411 325.64)",
  muted: "oklch(0.654017 0.009505 13.287)",
  faint: "oklch(0.691874 0.012538 24.638)",
  border: "oklch(0.44099 0.040202 48.807)",
  borderStrong: "oklch(0.442681 0.0608 50.795)",
  input: "oklch(0.503003 0.045721 49.44)",
  hover: "oklch(0.356163 0.042933 49.385)",
  selected: "oklch(0.416477 0.055442 50.489)",
  focus: "oklch(0.762174 0.124117 52.082)",
};

const irisColors: AppearancePresetColors = {
  ...t3StatusColors,
  accent: "oklch(0.671712 0.169136 293.929)",
  accentContrast: "oklch(0.222003 0.03479 328.979)",
  background: "oklch(0.225975 0.031062 293.741)",
  surface: "oklch(0.225975 0.031062 293.741)",
  surfaceRaised: "oklch(0.335291 0.026008 296.394)",
  surfaceOverlay: "oklch(0.386739 0.024023 297.509)",
  sidebar: "oklch(0.266743 0.044689 294.138)",
  topbar: "oklch(0.225975 0.031062 293.741)",
  bottomBar: "oklch(0.325405 0.063614 294.23)",
  text: "oklch(0.990339 0.008411 325.64)",
  muted: "oklch(0.640465 0.016197 304.171)",
  faint: "oklch(0.668773 0.021522 302.949)",
  border: "oklch(0.40874 0.058536 295.893)",
  borderStrong: "oklch(0.395417 0.085554 294.182)",
  input: "oklch(0.46756 0.065775 296.265)",
  hover: "oklch(0.320808 0.062152 294.23)",
  selected: "oklch(0.372806 0.078525 294.203)",
  focus: "oklch(0.671712 0.169136 293.929)",
};

const darkModernColors: AppearancePresetColors = {
  accent: "#0078d4",
  accentContrast: "#ffffff",
  background: "#1e1e1e",
  surface: "#252526",
  surfaceRaised: "#2d2d30",
  surfaceOverlay: "#333333",
  sidebar: "#181818",
  topbar: "#181818",
  bottomBar: "#0078d4",
  text: "#d4d4d4",
  muted: "#a6a6a6",
  faint: "#858585",
  border: "#3e3e42",
  borderStrong: "#5a5a5f",
  input: "#3c3c3c",
  hover: "#2a2d2e",
  selected: "#094771",
  focus: "#0078d4",
  success: "#89d185",
  warning: "#cca700",
  danger: "#f14c4c",
  info: "#3794ff",
};

const monokaiColors: AppearancePresetColors = {
  accent: "#a6e22e",
  accentContrast: "#1e1f1c",
  background: "#272822",
  surface: "#2f3129",
  surfaceRaised: "#3e3d32",
  surfaceOverlay: "#49483e",
  sidebar: "#1e1f1c",
  topbar: "#272822",
  bottomBar: "#3e3d32",
  text: "#f8f8f2",
  muted: "#c5c8b9",
  faint: "#75715e",
  border: "#49483e",
  borderStrong: "#62615a",
  input: "#3e3d32",
  hover: "#3e3d32",
  selected: "#49483e",
  focus: "#a6e22e",
  success: "#a6e22e",
  warning: "#fd971f",
  danger: "#f92672",
  info: "#66d9ef",
};

const carbonColors: AppearancePresetColors = {
  accent: "#39c6c8",
  accentContrast: "#0d1718",
  background: "#111516",
  surface: "#1a1f20",
  surfaceRaised: "#232a2b",
  surfaceOverlay: "#2d3637",
  sidebar: "#0d1112",
  topbar: "#111516",
  bottomBar: "#1f2a2b",
  text: "#e8f1f2",
  muted: "#9aabad",
  faint: "#718285",
  border: "#2d3839",
  borderStrong: "#465354",
  input: "#202829",
  hover: "#222b2c",
  selected: "#203d3e",
  focus: "#39c6c8",
  success: "#65d39e",
  warning: "#e7bd70",
  danger: "#ed747d",
  info: "#70b8ff",
};

const signalColors: AppearancePresetColors = {
  accent: "#f0b35b",
  accentContrast: "#21170d",
  background: "#11141c",
  surface: "#191e29",
  surfaceRaised: "#232a39",
  surfaceOverlay: "#2e374a",
  sidebar: "#0c0f16",
  topbar: "#11141c",
  bottomBar: "#242b3a",
  text: "#edf1f7",
  muted: "#a2adbf",
  faint: "#758198",
  border: "#303a4d",
  borderStrong: "#4b5972",
  input: "#20283a",
  hover: "#252f43",
  selected: "#3c3340",
  focus: "#f0b35b",
  success: "#7bd5a4",
  warning: "#f0b35b",
  danger: "#f07878",
  info: "#79b9f2",
};

const legacyWraptColors: AppearancePresetColors = {
  ...t3CodeColors,
  accent: "#3666c2",
  surfaceRaised: "#111111",
  surfaceOverlay: "#111111",
  sidebar: "#111111",
  bottomBar: "#111111",
};

const legacyGraphitColors: AppearancePresetColors = {
  ...t3CodeColors,
  accent: "#8b9aae",
  background: "#101112",
  surface: "#181a1c",
  surfaceRaised: "#1d2023",
  surfaceOverlay: "#24282c",
  sidebar: "#181a1c",
  topbar: "#101112",
  bottomBar: "#181a1c",
};

const legacySageColors: AppearancePresetColors = {
  ...t3CodeColors,
  accent: "#6f9f86",
  background: "#0b100d",
  surface: "#121a15",
  surfaceRaised: "#18241d",
  surfaceOverlay: "#203025",
  sidebar: "#121a15",
  topbar: "#0b100d",
  bottomBar: "#121a15",
};

export const appearanceThemePresets = {
  "t3-code": t3CodeColors,
  "t3-chat": t3ChatColors,
  grove: groveColors,
  ocean: oceanColors,
  ember: emberColors,
  iris: irisColors,
  "dark-modern": darkModernColors,
  monokai: monokaiColors,
  carbon: carbonColors,
  signal: signalColors,
  "wrapt-standard": legacyWraptColors,
  graphit: legacyGraphitColors,
  sage: legacySageColors,
} satisfies Record<string, AppearancePresetColors>;
