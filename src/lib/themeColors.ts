import { useThemeStore } from "@/store/theme"

/** All accent colors used in the app, theme-aware */
export function useAccentColors() {
  const theme = useThemeStore((s) => s.theme)
  return palette[theme]
}

/** Static getter (for non-React contexts or inline styles) */
export function getAccentColors() {
  const theme = useThemeStore.getState().theme
  return palette[theme]
}

const cinematic = {
  accent: "#D4A853",
  accentLight: "#E8C98A",
  accentMuted: "#CBB892",
  accentPale: "#E8D7B2",
  accentWarm: "#E6C887",
  accentBright: "#E8C778",
  accentSoft: "#DCC7A3",
  accentDark: "#DAB56A",
  accentHover: "#E7D1A4",

  // rgba helpers
  accent8: "rgba(212,168,83,0.08)",
  accent10: "rgba(212,168,83,0.10)",
  accent12: "rgba(212,168,83,0.12)",
  accent15: "rgba(212,168,83,0.15)",
  accent18: "rgba(212,168,83,0.18)",
  accent20: "rgba(212,168,83,0.20)",
  accent22: "rgba(212,168,83,0.22)",
  accent25: "rgba(212,168,83,0.25)",
  accent30: "rgba(212,168,83,0.30)",
  accent35: "rgba(212,168,83,0.35)",
  accent40: "rgba(212,168,83,0.40)",
  accent50: "rgba(212,168,83,0.50)",

  // Semantic
  charPill: "bg-[#D4A853]/10 text-[#D4A853]/80",
  locPill: "bg-emerald-500/10 text-emerald-400/80",
  propPill: "bg-sky-500/10 text-sky-400/80",

  // For inline style gradients
  glowGradient: (opacity: number) => `rgba(212,168,83,${opacity})`,
  shadowGlow: "rgba(212,168,83,0.3)",
} as const

const synthwave = {
  accent: "#ff2d95",
  accentLight: "#ff6db8",
  accentMuted: "#c4508a",
  accentPale: "#ffb3d9",
  accentWarm: "#ff5aab",
  accentBright: "#ff1a8a",
  accentSoft: "#e878b8",
  accentDark: "#d41e7a",
  accentHover: "#ff80c4",

  // rgba helpers
  accent8: "rgba(255,45,149,0.08)",
  accent10: "rgba(255,45,149,0.10)",
  accent12: "rgba(255,45,149,0.12)",
  accent15: "rgba(255,45,149,0.15)",
  accent18: "rgba(255,45,149,0.18)",
  accent20: "rgba(255,45,149,0.20)",
  accent22: "rgba(255,45,149,0.22)",
  accent25: "rgba(255,45,149,0.25)",
  accent30: "rgba(255,45,149,0.30)",
  accent35: "rgba(255,45,149,0.35)",
  accent40: "rgba(255,45,149,0.40)",
  accent50: "rgba(255,45,149,0.50)",

  // Semantic — neon versions
  charPill: "bg-[#ff2d95]/10 text-[#ff2d95]/80",
  locPill: "bg-[#00f0ff]/10 text-[#00f0ff]/80",
  propPill: "bg-[#b026ff]/10 text-[#b026ff]/80",

  // For inline style gradients
  glowGradient: (opacity: number) => `rgba(255,45,149,${opacity})`,
  shadowGlow: "rgba(255,45,149,0.3)",
} as const

const architect = {
  accent: "#ffffff",
  accentLight: "rgba(255,255,255,0.80)",
  accentMuted: "rgba(255,255,255,0.50)",
  accentPale: "rgba(255,255,255,0.65)",
  accentWarm: "rgba(255,255,255,0.75)",
  accentBright: "#ffffff",
  accentSoft: "rgba(255,255,255,0.60)",
  accentDark: "rgba(255,255,255,0.70)",
  accentHover: "rgba(255,255,255,0.85)",

  // rgba helpers
  accent8: "rgba(255,255,255,0.04)",
  accent10: "rgba(255,255,255,0.06)",
  accent12: "rgba(255,255,255,0.07)",
  accent15: "rgba(255,255,255,0.09)",
  accent18: "rgba(255,255,255,0.10)",
  accent20: "rgba(255,255,255,0.12)",
  accent22: "rgba(255,255,255,0.13)",
  accent25: "rgba(255,255,255,0.15)",
  accent30: "rgba(255,255,255,0.18)",
  accent35: "rgba(255,255,255,0.22)",
  accent40: "rgba(255,255,255,0.25)",
  accent50: "rgba(255,255,255,0.30)",

  // Semantic — monochrome
  charPill: "bg-white/6 text-white/70",
  locPill: "bg-white/4 text-white/55",
  propPill: "bg-white/3 text-white/45",

  // For inline style gradients
  glowGradient: (opacity: number) => `rgba(255,255,255,${opacity * 0.6})`,
  shadowGlow: "rgba(255,255,255,0.15)",
} as const

const palette = { cinematic, synthwave, architect } as const

export type AccentColors = typeof cinematic
