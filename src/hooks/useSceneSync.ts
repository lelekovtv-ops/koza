import { useEffect, useRef } from "react"
import { useScriptStore } from "@/store/script"
import { useTimelineStore } from "@/store/timeline"
import { parseScenesToShots } from "@/lib/sceneParser"

/**
 * Syncs scene_heading blocks from the script store to the timeline.
 * - Adds new scenes that appear in the script
 * - Removes shots whose scene IDs no longer exist
 * - Preserves duration / thumbnails / notes of existing shots
 */
export function useSceneSync() {
  const blocks = useScriptStore((s) => s.blocks)
  const prevIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const parsed = parseScenesToShots(blocks)
    const parsedIds = new Set(parsed.map((s) => s.id))

    const { shots, addShot, removeShot } = useTimelineStore.getState()
    const existingIds = new Set(shots.map((s) => s.id))

    // Add new scenes
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

    // Remove shots that were previously synced but whose scenes are now gone
    for (const id of prevIdsRef.current) {
      if (!parsedIds.has(id) && existingIds.has(id)) {
        removeShot(id)
      }
    }

    prevIdsRef.current = parsedIds
  }, [blocks])
}
