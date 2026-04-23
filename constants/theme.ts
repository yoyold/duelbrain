/**
 * DuelBrain visual theme — "Duelist Dark".
 *
 * Yu-Gi-Oh!-inspired palette: Millennium Puzzle gold as the primary accent,
 * Dark Magician purple for secondary/player-2, cyan for first-player
 * initiative, parchment-tinted off-white text on a deep near-black with a
 * subtle violet undertone.
 *
 * One source of truth. Screens should reference `palette` tokens rather
 * than hard-coding hex values. The legacy `Colors` / `Fonts` exports are
 * retained because the starter-template `ThemedText` / `ThemedView`
 * helpers still read from them.
 */
import { Platform } from "react-native";

export const palette = {
  // Surfaces, from the back of the canvas forward
  bg: "#0f0a1a",
  bgDeep: "#090613",
  surface: "#1a1428",
  surfaceElevated: "#241a36",
  surfaceActive: "#2e2342",
  border: "#3a2f55",
  borderStrong: "#4d4068",

  // Primary accents
  gold: "#e4b94a",
  goldSoft: "#f4d679",
  goldDim: "#b89234",
  purple: "#a78bfa",
  purpleDim: "#7c5cd9",
  cyan: "#5eead4",
  cyanDim: "#3eb5a3",

  // Yu-Gi-Oh! card-frame colors (used by TypeBadge and type-colored text)
  monsterNormal: "#c1a05c",
  monsterEffect: "#ff8b53",
  monsterFusion: "#a086b7",
  monsterRitual: "#9db5cc",
  monsterSynchro: "#e8e8e8",
  monsterXyz: "#353535",
  monsterLink: "#2e6ba8",
  spell: "#1c9e74",
  trap: "#c96088",

  // Match results
  win: "#4ade80",
  winDim: "#2fa25f",
  loss: "#f87171",
  lossDim: "#c04848",
  draw: "#94a3b8",

  // Text on dark surfaces
  text: "#ece3d0",
  textMuted: "#a89fb5",
  textDim: "#6c6380",
  /** Text that sits on top of a gold button — needs to be dark. */
  textOnAccent: "#14101f",

  // Status / feedback
  warn: "#f59e0b",
  danger: "#ef4444",

  // Overlays
  scrim: "rgba(10, 6, 20, 0.75)",
  glow: "rgba(228, 185, 74, 0.15)",
} as const;

/** Canonical colors for the W/L/D pill. */
export function resultColor(r: "win" | "loss" | "draw"): string {
  return r === "win" ? palette.win : r === "loss" ? palette.loss : palette.draw;
}

// ---- Legacy tokens retained for the starter-template themed components ----

const tintColorLight = "#0a7ea4";
const tintColorDark = palette.gold;

export const Colors = {
  light: {
    text: "#11181C",
    background: "#fff",
    tint: tintColorLight,
    icon: "#687076",
    tabIconDefault: "#687076",
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: palette.text,
    background: palette.bg,
    tint: tintColorDark,
    icon: palette.textMuted,
    tabIconDefault: palette.textDim,
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
