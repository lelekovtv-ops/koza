import { create } from "zustand"
import { type Block } from "@/lib/screenplayFormat"
import { type Scene, parseScenes } from "@/lib/sceneParser"

interface ScenesState {
  scenes: Scene[]
  selectedSceneId: string | null
  updateScenes: (blocks: Block[]) => void
  selectScene: (id: string | null) => void
  getScene: (id: string) => Scene | undefined
}

export const useScenesStore = create<ScenesState>()((set, get) => ({
  scenes: [],
  selectedSceneId: null,

  updateScenes: (blocks) => {
    set({ scenes: parseScenes(blocks) })
  },

  selectScene: (id) => {
    set({ selectedSceneId: id })
  },

  getScene: (id) => {
    return get().scenes.find((s) => s.id === id)
  },
}))
