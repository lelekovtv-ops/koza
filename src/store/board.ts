import { create } from "zustand"
import { persist } from "zustand/middleware"

type BoardTheme = "light" | "sepia"

interface BoardState {
  theme: BoardTheme
  selectedChatModel: string
  selectedImageModel: string
  selectedImageGenModel: string
  selectedVideoModel: string
  setTheme: (theme: BoardTheme) => void
  setSelectedChatModel: (model: string) => void
  setSelectedImageModel: (model: string) => void
  setSelectedImageGenModel: (model: string) => void
  setSelectedVideoModel: (model: string) => void
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set) => ({
      theme: "sepia",
      selectedChatModel: "gpt-4o-mini",
      selectedImageModel: "gpt-image-1",
      selectedImageGenModel: "nano-banana-2",
      selectedVideoModel: "veo-2",
      setTheme: (theme) => set({ theme }),
      setSelectedChatModel: (selectedChatModel) => set({ selectedChatModel }),
      setSelectedImageModel: (selectedImageModel) => set({ selectedImageModel }),
      setSelectedImageGenModel: (selectedImageGenModel) => set({ selectedImageGenModel }),
      setSelectedVideoModel: (selectedVideoModel) => set({ selectedVideoModel }),
    }),
    {
      name: "koza-board",
      partialize: (state) => ({
        theme: state.theme,
        selectedChatModel: state.selectedChatModel,
        selectedImageModel: state.selectedImageModel,
        selectedImageGenModel: state.selectedImageGenModel,
        selectedVideoModel: state.selectedVideoModel,
      }),
    }
  )
)
