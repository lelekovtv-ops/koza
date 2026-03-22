import { create } from "zustand"
import { persist } from "zustand/middleware"
import { DEFAULT_PROJECT_STYLE, STYLE_PRESETS } from "@/lib/projectStyle"

export { STYLE_PRESETS }

type BoardTheme = "light" | "sepia"

interface BoardState {
  theme: BoardTheme
  selectedChatModel: string
  selectedImageModel: string
  selectedImageGenModel: string
  selectedVideoModel: string
  projectStyle: string
  setTheme: (theme: BoardTheme) => void
  setSelectedChatModel: (model: string) => void
  setSelectedImageModel: (model: string) => void
  setSelectedImageGenModel: (model: string) => void
  setSelectedVideoModel: (model: string) => void
  setProjectStyle: (style: string) => void
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set) => ({
      theme: "sepia",
      selectedChatModel: "gpt-4o-mini",
      selectedImageModel: "gpt-image-1",
      selectedImageGenModel: "nano-banana-2",
      selectedVideoModel: "veo-2",
      projectStyle: DEFAULT_PROJECT_STYLE,
      setTheme: (theme) => set({ theme }),
      setSelectedChatModel: (selectedChatModel) => set({ selectedChatModel }),
      setSelectedImageModel: (selectedImageModel) => set({ selectedImageModel }),
      setSelectedImageGenModel: (selectedImageGenModel) => set({ selectedImageGenModel }),
      setSelectedVideoModel: (selectedVideoModel) => set({ selectedVideoModel }),
      setProjectStyle: (projectStyle) => set({ projectStyle }),
    }),
    {
      name: "koza-board",
      partialize: (state) => ({
        theme: state.theme,
        selectedChatModel: state.selectedChatModel,
        selectedImageModel: state.selectedImageModel,
        selectedImageGenModel: state.selectedImageGenModel,
        selectedVideoModel: state.selectedVideoModel,
        projectStyle: state.projectStyle,
      }),
    }
  )
)
