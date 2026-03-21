import { useEffect } from "react"
import { useScriptStore } from "@/store/script"
import { useScenesStore } from "@/store/scenes"

/**
 * Syncs scene_heading blocks from the script store to:
 * 1. Scenes store (parsed scene list)
 * 2. Timeline (shot stubs for each scene heading)
 */
export function useSceneSync() {
  const blocks = useScriptStore((s) => s.blocks)
  const updateScenes = useScenesStore((s) => s.updateScenes)

  useEffect(() => {
    // Sync scenes store only — shots are created via Breakdown (manual or AI)
    updateScenes(blocks)
  }, [blocks, updateScenes])
}
