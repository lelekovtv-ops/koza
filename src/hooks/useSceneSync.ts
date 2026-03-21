import { useEffect, useRef } from "react"
import { useScriptStore } from "@/store/script"
import { useTimelineStore } from "@/store/timeline"
import { useScenesStore } from "@/store/scenes"
import { parseScenesToShots } from "@/lib/sceneParser"

/**
 * Syncs scene_heading blocks from the script store to:
 * 1. Scenes store (parsed scene list)
 * 2. Timeline (shot stubs for each scene heading)
 */
export function useSceneSync() {
  const blocks = useScriptStore((s) => s.blocks)
  const updateScenes = useScenesStore((s) => s.updateScenes)
  const prevIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    // Sync scenes store
    updateScenes(blocks)

    // Sync timeline shots
    const parsed = parseScenesToShots(blocks)
    const parsedIds = new Set(parsed.map((s) => s.id))

    const { shots, addShot, removeShot } = useTimelineStore.getState()
    const existingIds = new Set(shots.map((s) => s.id))

    for (const scene of parsed) {
      if (!existingIds.has(scene.id)) {
        addShot({
          id: scene.id,
          duration: scene.duration,
          type: scene.type,
          label: scene.label,
          notes: scene.notes,
          sceneId: scene.sceneId,
        })
      }
    }

    for (const id of prevIdsRef.current) {
      if (!parsedIds.has(id) && existingIds.has(id)) {
        removeShot(id)
      }
    }

    prevIdsRef.current = parsedIds
  }, [blocks, updateScenes])
}
