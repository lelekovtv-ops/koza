import { useEffect } from "react"
import { useScriptStore } from "@/store/script"
import { useScenesStore } from "@/store/scenes"
import { useBibleStore } from "@/store/bible"

export function useSceneSync() {
  const blocks = useScriptStore((s) => s.blocks)
  const updateScenes = useScenesStore((s) => s.updateScenes)
  const scenes = useScenesStore((s) => s.scenes)
  const updateFromScreenplay = useBibleStore((s) => s.updateFromScreenplay)

  useEffect(() => {
    updateScenes(blocks)
  }, [blocks, updateScenes])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      updateFromScreenplay(blocks, scenes)
    }, 2000)

    return () => window.clearTimeout(timer)
  }, [blocks, scenes, updateFromScreenplay])
}
