import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "@/lib/safeStorage"

export interface ReEditConfig {
  /** Which model to use: "auto" = follow board selectedImageGenModel */
  model: "auto" | "nano-banana-2" | "nano-banana-pro" | "nano-banana" | "gpt-image"
  /** Max reference images sent to API (1-5) */
  maxReferenceImages: number
  /** Include current shot image as first reference */
  includeCurrentImage: boolean
  /** Include Bible character reference images */
  includeBibleRefs: boolean
  /** Custom rules appended to RULES section */
  customRules: string
  /** Whether to save re-edited image to library */
  saveToLibrary: boolean
}

const DEFAULT_RE_EDIT_CONFIG: ReEditConfig = {
  model: "auto",
  maxReferenceImages: 5,
  includeCurrentImage: true,
  includeBibleRefs: true,
  customRules: "",
  saveToLibrary: true,
}

interface ReEditConfigState {
  config: ReEditConfig
  setConfig: (patch: Partial<ReEditConfig>) => void
  resetConfig: () => void
}

export const useReEditConfigStore = create<ReEditConfigState>()(
  persist(
    (set) => ({
      config: { ...DEFAULT_RE_EDIT_CONFIG },
      setConfig: (patch) =>
        set((state) => ({ config: { ...state.config, ...patch } })),
      resetConfig: () =>
        set({ config: { ...DEFAULT_RE_EDIT_CONFIG } }),
    }),
    { name: "koza-reedit-config-v1", storage: safeStorage },
  ),
)

export { DEFAULT_RE_EDIT_CONFIG }
