/**
 * useSyncOrchestrator — unified bidirectional sync between
 * screenplay, scenes, timeline, bible, dialogue, and voice.
 *
 * Replaces useSceneSync + useShotSync with a single hook that:
 * 1. Forward sync: blocks → scenes → bible → dialogue → shots (as before)
 * 2. Reverse sync: listens to SyncBus for timeline/voice → blocks
 * 3. Uses origin tracking to prevent infinite loops
 */

import { useEffect, useRef } from "react"
import { useScriptStore } from "@/store/script"
import { useScenesStore } from "@/store/scenes"
import { useTimelineStore } from "@/store/timeline"
import { useBibleStore } from "@/store/bible"
import { useDialogueStore, extractDialogueLines } from "@/store/dialogue"
import {
  snapshotBlocks,
  diffBlockSnapshots,
  reconcileShots,
  updateShotTextsOnly,
  type BlockSnapshot,
} from "@/lib/shotSyncEngine"
import { syncBus } from "@/lib/syncBus"
import type { SyncEvent } from "@/lib/productionTypes"
import { useVoiceTrackStore, generateVoiceClipsFromDialogue } from "@/store/voiceTrack"

/**
 * Mount this hook at the workspace/studio level.
 * It handles all data synchronization between modules.
 */
export function useSyncOrchestrator() {
  const blocks = useScriptStore((s) => s.blocks)
  const scriptLastOrigin = useScriptStore((s) => s._lastOrigin)
  const updateScenes = useScenesStore((s) => s.updateScenes)
  const scenes = useScenesStore((s) => s.scenes)
  const updateFromScreenplay = useBibleStore((s) => s.updateFromScreenplay)
  const characters = useBibleStore((s) => s.characters)
  const setDialogueLines = useDialogueStore((s) => s.setLines)
  const prevSnapshotRef = useRef<BlockSnapshot[]>([])

  // ── Forward sync: blocks → scenes (immediate) ──
  useEffect(() => {
    updateScenes(blocks)
  }, [blocks, updateScenes])

  // ── Forward sync: blocks+scenes → bible (2s debounce) ──
  useEffect(() => {
    const timer = window.setTimeout(() => {
      updateFromScreenplay(blocks, scenes)
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [blocks, scenes, updateFromScreenplay])

  // ── Forward sync: blocks+scenes → dialogue (2.5s debounce) ──
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (blocks.length === 0 || scenes.length === 0) return
      const charNameToId = new Map(
        characters.map((c) => [c.name.toUpperCase(), c.id]),
      )
      const lines = extractDialogueLines(blocks, scenes, charNameToId)
      setDialogueLines(lines)

      // Auto-create voice clips from dialogue lines
      const currentShots = useTimelineStore.getState().shots
      const shotRefs = currentShots.map((s) => ({
        id: s.id,
        sceneId: s.sceneId,
        order: s.order,
      }))
      const existingClips = useVoiceTrackStore.getState().clips
      const newClips = generateVoiceClipsFromDialogue(lines, shotRefs, existingClips)
      useVoiceTrackStore.getState().setClips(newClips)
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [blocks, scenes, characters, setDialogueLines])

  // ── Forward sync: blocks+scenes → timeline shots (300ms debounce) ──
  // Skip if the block change came from timeline (reverse sync)
  useEffect(() => {
    if (scenes.length === 0 && blocks.length > 0) return
    if (scriptLastOrigin === "timeline") return

    const timer = window.setTimeout(() => {
      const nextSnapshot = snapshotBlocks(blocks)
      const diff = diffBlockSnapshots(prevSnapshotRef.current, nextSnapshot)

      if (diff.hasStructuralChanges) {
        const currentShots = useTimelineStore.getState().shots
        const { addShot, removeShot, updateShot, reorderShots } =
          useTimelineStore.getState()

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
            addShot: (partial) =>
              addShot(partial as Parameters<typeof addShot>[0], "screenplay"),
            removeShot: (id) => removeShot(id, "screenplay"),
            updateShot: (id, patch) =>
              updateShot(
                id,
                patch as Parameters<typeof updateShot>[1],
                "screenplay",
              ),
            reorderShots: ((shots: unknown[]) =>
              reorderShots(
                shots as Parameters<typeof reorderShots>[0],
                "screenplay",
              )) as (shots: unknown[]) => void,
          },
        )
      } else if (diff.textChangedBlockIds.length > 0) {
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
          (id, patch) =>
            updateShot(
              id,
              patch as Parameters<typeof updateShot>[1],
              "screenplay",
            ),
        )
      }

      prevSnapshotRef.current = nextSnapshot
    }, 300)

    return () => window.clearTimeout(timer)
  }, [blocks, scenes, scriptLastOrigin])

  // ── Reverse sync: listen to SyncBus for timeline/voice → blocks ──
  useEffect(() => {
    const unsub = syncBus.on((event: SyncEvent) => {
      // Only handle events from other origins
      if (event.origin === "screenplay") return

      switch (event.type) {
        case "duration-change": {
          // Timeline changed duration → update block
          const { blockId } = event
          const { durationMs } = event.payload as { durationMs: number }
          if (blockId && typeof durationMs === "number") {
            useScriptStore
              .getState()
              .updateBlockProduction(
                blockId,
                { durationMs, durationSource: "manual" },
                "timeline",
              )
          }
          break
        }

        case "voice-text": {
          // Voice clip text changed → update dialogue block
          const { blockId } = event
          const { text } = event.payload as { text: string }
          if (blockId && typeof text === "string") {
            useScriptStore.getState().updateBlock(blockId, text, "voice")
          }
          break
        }

        case "voice-duration": {
          // TTS returned real duration → update block
          const { blockId } = event
          const { durationMs } = event.payload as { durationMs: number }
          if (blockId && typeof durationMs === "number") {
            useScriptStore
              .getState()
              .updateBlockProduction(
                blockId,
                { durationMs, durationSource: "media" },
                "voice",
              )
          }
          break
        }
      }
    })

    return unsub
  }, [])
}
