import { create } from "zustand"
import { persist } from "zustand/middleware"

export type AppTheme = "cinematic" | "synthwave" | "architect"

const THEME_CYCLE: AppTheme[] = ["cinematic", "synthwave", "architect"]

interface ThemeState {
  theme: AppTheme
  setTheme: (theme: AppTheme) => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "cinematic",
      setTheme: (theme) => {
        set({ theme })
        applyThemeToDOM(theme)
      },
      toggleTheme: () => {
        const cur = get().theme
        const idx = THEME_CYCLE.indexOf(cur)
        const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]
        set({ theme: next })
        applyThemeToDOM(next)
      },
    }),
    {
      name: "koza-theme",
    }
  )
)

function applyThemeToDOM(theme: AppTheme) {
  if (typeof document === "undefined") return
  document.documentElement.setAttribute("data-theme", theme)
}
