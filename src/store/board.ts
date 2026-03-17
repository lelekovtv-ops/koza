import { create } from "zustand"
import { persist } from "zustand/middleware"

type BoardTheme = "light" | "sepia"

interface BoardState {
  theme: BoardTheme
  selectedChatModel: string
  selectedImageModel: string
  selectedVideoModel: string
  setTheme: (theme: BoardTheme) => void
  setSelectedChatModel: (model: string) => void
  setSelectedImageModel: (model: string) => void
  setSelectedVideoModel: (model: string) => void
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set) => ({
      theme: "sepia",
      selectedChatModel: "gpt-4o-mini",
      selectedImageModel: "gpt-image-1",
      selectedVideoModel: "veo-2",
      setTheme: (theme) => set({ theme }),
      setSelectedChatModel: (selectedChatModel) => set({ selectedChatModel }),
      setSelectedImageModel: (selectedImageModel) => set({ selectedImageModel }),
      setSelectedVideoModel: (selectedVideoModel) => set({ selectedVideoModel }),
    }),
    {
      name: "koza-board",
    }
  )
)
