import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "@/lib/safeStorage"

export type PageViewMode = "single" | "spread" | "scroll"
export type PaperTheme = "classic" | "warm" | "cool" | "dark" | "pure-dark"

const PAPER_THEMES: Record<PaperTheme, { bg: string; text: string; label: string }> = {
  classic:     { bg: "#FFFFFF", text: "#1a1a1a", label: "Classic White" },
  warm:        { bg: "#F5EDE0", text: "#2C2418", label: "Warm Paper" },
  cool:        { bg: "#EDF2F7", text: "#1A202C", label: "Cool Paper" },
  dark:        { bg: "#1E1E1E", text: "#D4D4D4", label: "Dark Paper" },
  "pure-dark": { bg: "#000000", text: "#CCCCCC", label: "Pure Dark" },
}

export { PAPER_THEMES }

interface ScreenplaySettingsState {
  /** Show Bible entity markers (icons) in text */
  bibleMarkers: boolean
  /** Focus mode — dims everything except current block */
  focusMode: boolean
  /** Page view mode */
  viewMode: PageViewMode
  /** Paper color theme */
  paperTheme: PaperTheme
  /** Zoom percent (separate from theme zoom) */
  zoom: number
  /** Typewriter sound */
  typewriterSound: boolean
  /** Command bar visible */
  commandBarOpen: boolean
  /** Idle mode — user hasn't typed for 60s, page fades out */
  idleFade: boolean

  // Actions
  toggleBibleMarkers: () => void
  toggleFocusMode: () => void
  setViewMode: (mode: PageViewMode) => void
  setPaperTheme: (theme: PaperTheme) => void
  setZoom: (zoom: number) => void
  toggleTypewriterSound: () => void
  setCommandBarOpen: (open: boolean) => void
  toggleCommandBar: () => void
  setIdleFade: (idle: boolean) => void
}

export const useScreenplaySettings = create<ScreenplaySettingsState>()(
  persist(
    (set) => ({
      bibleMarkers: true,
      focusMode: false,
      viewMode: "single",
      paperTheme: "classic",
      zoom: 100,
      typewriterSound: false,
      commandBarOpen: false,
      idleFade: false,

      toggleBibleMarkers: () => set((s) => ({ bibleMarkers: !s.bibleMarkers })),
      toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
      setViewMode: (mode) => set({ viewMode: mode }),
      setPaperTheme: (theme) => set({ paperTheme: theme }),
      setZoom: (zoom) => set({ zoom: Math.max(50, Math.min(200, zoom)) }),
      toggleTypewriterSound: () => set((s) => ({ typewriterSound: !s.typewriterSound })),
      setCommandBarOpen: (open) => set({ commandBarOpen: open }),
      toggleCommandBar: () => set((s) => ({ commandBarOpen: !s.commandBarOpen })),
      setIdleFade: (idle) => set({ idleFade: idle }),
    }),
    {
      name: "koza-screenplay-settings",
      storage: safeStorage,
      partialize: (s) => ({
        bibleMarkers: s.bibleMarkers,
        viewMode: s.viewMode,
        paperTheme: s.paperTheme,
        zoom: s.zoom,
        typewriterSound: s.typewriterSound,
      }),
    },
  ),
)
