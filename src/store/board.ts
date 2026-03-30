import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "@/lib/safeStorage"
import { DEFAULT_PROJECT_STYLE, STYLE_PRESETS } from "@/lib/projectStyle"

export { STYLE_PRESETS }

type BoardTheme = "light" | "sepia"
type WorkflowProfile = "default-directing" | "legacy-luc-besson"

interface BoardState {
  theme: BoardTheme
  workflowProfile: WorkflowProfile
  selectedChatModel: string
  selectedImageModel: string
  selectedImageGenModel: string
  selectedVideoModel: string
  projectStyle: string
  bibleStyle: string
  setTheme: (theme: BoardTheme) => void
  setWorkflowProfile: (profile: WorkflowProfile) => void
  setSelectedChatModel: (model: string) => void
  setSelectedImageModel: (model: string) => void
  setSelectedImageGenModel: (model: string) => void
  setSelectedVideoModel: (model: string) => void
  setProjectStyle: (style: string) => void
  setBibleStyle: (style: string) => void
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set) => ({
      theme: "sepia",
      workflowProfile: "default-directing",
      selectedChatModel: "gpt-4o-mini",
      selectedImageModel: "gpt-image-1",
      selectedImageGenModel: "nano-banana-2",
      selectedVideoModel: "veo-2",
      projectStyle: DEFAULT_PROJECT_STYLE,
      bibleStyle: "Cinematic portrait, studio lighting, dark background, film still",
      setTheme: (theme) => set({ theme }),
      setWorkflowProfile: (workflowProfile) => set({ workflowProfile }),
      setSelectedChatModel: (selectedChatModel) => set({ selectedChatModel }),
      setSelectedImageModel: (selectedImageModel) => set({ selectedImageModel }),
      setSelectedImageGenModel: (selectedImageGenModel) => set({ selectedImageGenModel }),
      setSelectedVideoModel: (selectedVideoModel) => set({ selectedVideoModel }),
      setProjectStyle: (projectStyle) => set({ projectStyle }),
      setBibleStyle: (bibleStyle) => set({ bibleStyle }),
    }),
    {
      name: "koza-board",
      storage: safeStorage,
      partialize: (state) => ({
        theme: state.theme,
        workflowProfile: state.workflowProfile,
        selectedChatModel: state.selectedChatModel,
        selectedImageModel: state.selectedImageModel,
        selectedImageGenModel: state.selectedImageGenModel,
        selectedVideoModel: state.selectedVideoModel,
        projectStyle: state.projectStyle,
        bibleStyle: state.bibleStyle,
      }),
    }
  )
)
