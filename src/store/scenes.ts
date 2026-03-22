import { create } from "zustand"
import { type Block } from "@/lib/screenplayFormat"
import { type Scene, parseScenes } from "@/lib/sceneParser"
import { useDevLogStore } from "@/store/devlog"

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
    const scenes = parseScenes(blocks)

    useDevLogStore.getState().log({
      type: "scene_parse",
      title: "Scene parse",
      details: JSON.stringify(scenes, null, 2),
      meta: {
        blockCount: blocks.length,
        sceneCount: scenes.length,
        ids: scenes.map((scene) => scene.id),
      },
    })

    set({ scenes })
  },

  selectScene: (id) => {
    set({ selectedSceneId: id })
  },

  getScene: (id) => {
    return get().scenes.find((s) => s.id === id)
  },
}))
