import { useEffect, useRef } from "react"
import { useScriptStore } from "@/store/script"
import { useScenesStore } from "@/store/scenes"
import { useTimelineStore } from "@/store/timeline"
import {
  snapshotBlocks,
  diffBlockSnapshots,
  reconcileShots,
  updateShotTextsOnly,
  type BlockSnapshot,
} from "@/lib/shotSyncEngine"

/**
 * Reactive hook that auto-creates/updates/deletes shots in the timeline
 * as the user types in the screenplay editor.
 *
 * Mirrors the pattern of useSceneSync but with 300ms debounce to avoid
 * per-keystroke work.
 */
export function useShotSync() {
  const blocks = useScriptStore((s) => s.blocks)
  const scenes = useScenesStore((s) => s.scenes)
  const prevSnapshotRef = useRef<BlockSnapshot[]>([])

  useEffect(() => {
    // Wait for scenes to be populated (useSceneSync runs first, no debounce)
    if (scenes.length === 0 && blocks.length > 0) return

    const timer = window.setTimeout(() => {
      const nextSnapshot = snapshotBlocks(blocks)
      const diff = diffBlockSnapshots(prevSnapshotRef.current, nextSnapshot)

      if (diff.hasStructuralChanges) {
        // Full reconciliation: rebuild units, create/remove/update shots
        const currentShots = useTimelineStore.getState().shots
        const { addShot, removeShot, updateShot, reorderShots } = useTimelineStore.getState()

        reconcileShots(
          blocks,
          scenes,
          currentShots.map((s) => ({
            id: s.id,
            sceneId: s.sceneId,
            blockRange: s.blockRange,
            autoSynced: s.autoSynced,
            locked: s.locked,
            caption: s.caption,
            imagePrompt: s.imagePrompt,
            thumbnailUrl: s.thumbnailUrl,
          })),
          {
            addShot: (partial) => addShot(partial as Parameters<typeof addShot>[0]),
            removeShot,
            updateShot: (id, patch) => updateShot(id, patch as Parameters<typeof updateShot>[1]),
            reorderShots: reorderShots as (shots: unknown[]) => void,
          },
        )
      } else if (diff.textChangedBlockIds.length > 0) {
        // Fast path: only update text/duration on existing shots
        const currentShots = useTimelineStore.getState().shots
        const { updateShot } = useTimelineStore.getState()

        updateShotTextsOnly(
          diff.textChangedBlockIds,
          blocks,
          currentShots.map((s) => ({
            id: s.id,
            sceneId: s.sceneId,
            blockRange: s.blockRange,
            autoSynced: s.autoSynced,
            locked: s.locked,
            caption: s.caption,
            imagePrompt: s.imagePrompt,
            thumbnailUrl: s.thumbnailUrl,
          })),
          (id, patch) => updateShot(id, patch as Parameters<typeof updateShot>[1]),
        )
      }

      prevSnapshotRef.current = nextSnapshot
    }, 300)

    return () => window.clearTimeout(timer)
  }, [blocks, scenes])
}
