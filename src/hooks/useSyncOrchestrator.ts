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
import { syncBus } from "@/lib/syncBus"
import type { SyncEvent } from "@/lib/productionTypes"
import { useVoiceTrackStore, generateVoiceClipsFromDialogue } from "@/store/voiceTrack"
import { useRundownStore } from "@/store/rundown"
import { entriesToTimelineShots } from "@/lib/rundownBridge"

/**
 * Mount this hook at the workspace/studio level.
 * It handles all data synchronization between modules.
 */
export function useSyncOrchestrator() {
  const blocks = useScriptStore((s) => s.blocks)
  const updateScenes = useScenesStore((s) => s.updateScenes)
  const scenes = useScenesStore((s) => s.scenes)
  const updateFromScreenplay = useBibleStore((s) => s.updateFromScreenplay)
  const characters = useBibleStore((s) => s.characters)
  const setDialogueLines = useDialogueStore((s) => s.setLines)

  // ── Forward sync: blocks → scenes (immediate) ──
  useEffect(() => {
    updateScenes(blocks)
  }, [blocks, updateScenes])

  // ── Forward sync: blocks+scenes → rundown → timeline (immediate) ──
  const rundownEntries = useRundownStore((s) => s.entries)

  useEffect(() => {
    if (blocks.length === 0) return
    useRundownStore.getState().rebuildFromBlocks(blocks, scenes)
  }, [blocks, scenes])

  // ── Project rundown entries → timeline shots (always merge, preserve visuals) ──
  // Debounce on mount to let timeline store restore blob URLs from IndexedDB first
  useEffect(() => {
    if (rundownEntries.length === 0) return

    const timer = window.setTimeout(() => {
    const projectedShots = entriesToTimelineShots(rundownEntries, scenes)
    const existing = useTimelineStore.getState().shots

    // Build lookup from existing shots by parentBlockId AND id
    const byBlockId = new Map<string, typeof existing[0]>()
    for (const s of existing) {
      if (s.parentBlockId) byBlockId.set(s.parentBlockId, s)
      if (s.blockRange?.[0]) byBlockId.set(s.blockRange[0], s)
    }
    const byId = new Map(existing.map((s) => [s.id, s]))

    const merged = projectedShots.map((projected) => {
      const ex = byId.get(projected.id)
        ?? byBlockId.get(projected.parentBlockId ?? "")
        ?? byBlockId.get(projected.blockRange?.[0] ?? "")

      if (ex) {
        // Merge: structural fields from projected, visual data from existing
        return {
          ...projected,
          // Preserve visual data (blob URLs restored by timeline store)
          thumbnailUrl: ex.thumbnailUrl || projected.thumbnailUrl,
          originalUrl: ex.originalUrl || projected.originalUrl,
          thumbnailBlobKey: ex.thumbnailBlobKey || projected.thumbnailBlobKey,
          originalBlobKey: ex.originalBlobKey || projected.originalBlobKey,
          generationHistory: ex.generationHistory.length > 0 ? ex.generationHistory : projected.generationHistory,
          activeHistoryIndex: ex.activeHistoryIndex ?? projected.activeHistoryIndex,
          // Preserve user-edited fields
          imagePrompt: ex.imagePrompt || projected.imagePrompt,
          videoPrompt: ex.videoPrompt || projected.videoPrompt,
          directorNote: ex.directorNote || projected.directorNote,
          cameraNote: ex.cameraNote || projected.cameraNote,
          shotSize: ex.shotSize || projected.shotSize,
          cameraMotion: ex.cameraMotion || projected.cameraMotion,
          caption: ex.caption || projected.caption,
          customReferenceUrls: ex.customReferenceUrls,
          excludedBibleIds: ex.excludedBibleIds,
          bakedPrompt: ex.bakedPrompt,
        }
      }
      return projected
    })

    useTimelineStore.getState().reorderShots(merged, "screenplay")
    }, 500) // 500ms debounce to let blob restore finish

    return () => window.clearTimeout(timer)
  }, [rundownEntries, scenes])

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

  // Old shotSyncEngine path removed — rundown handles all blocks→timeline sync now

  // ── Reverse sync: listen to SyncBus for timeline/voice → blocks + rundown ──
  useEffect(() => {
    const unsub = syncBus.on((event: SyncEvent) => {
      // Only handle events from other origins
      if (event.origin === "screenplay") return

      switch (event.type) {
        case "duration-change": {
          // Timeline changed duration → update block + rundown
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
            // Also update rundown entry
            const entry = useRundownStore.getState().entries.find(
              (e) => e.parentBlockId === blockId,
            )
            if (entry) {
              useRundownStore.getState().setManualDuration(entry.id, durationMs)
            }
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
          // TTS returned real duration → update block + rundown
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
            // Also update rundown entry
            const entry = useRundownStore.getState().entries.find(
              (e) => e.parentBlockId === blockId,
            )
            if (entry) {
              useRundownStore.getState().setMediaDuration(entry.id, durationMs)
            }
          }
          break
        }

        case "shot-child-remove": {
          // Timeline/storyboard requested shot removal → scriptStore + rundown
          const { shotId } = event.payload as { shotId: string }
          if (shotId) {
            useScriptStore.getState().removeShotFromBlock(shotId)
            // Also remove from rundown
            const entry = useRundownStore.getState().entries.find(
              (e) => e.id === shotId,
            )
            if (entry) {
              useRundownStore.getState().deleteEntry(entry.id)
            }
          }
          break
        }

        case "shot-child-reorder": {
          // Timeline/storyboard requested shot reorder within block
          const { shotId, newOrder } = event.payload as { shotId: string; newOrder: number }
          if (shotId && typeof newOrder === "number") {
            useScriptStore.getState().reorderShotInBlock(shotId, newOrder)
            // Also reorder in rundown (if entry exists)
            const entry = useRundownStore.getState().entries.find((e) => e.id === shotId)
            if (entry) useRundownStore.getState().reorderEntry(shotId, newOrder)
          }
          break
        }
      }
    })

    return unsub
  }, [])

  // ── Reverse sync: timeline updateShot → rundown entry ──
  // When StoryboardPanel or other components update a shot in timeline store,
  // propagate the visual/prompt data back to rundown (persisted)
  useEffect(() => {
    return useTimelineStore.subscribe((state, prev) => {
      if (state._lastOrigin === "screenplay") return
      if (state.shots === prev.shots) return

      const prevMap = new Map(prev.shots.map((s) => [s.id, s]))
      const entries = useRundownStore.getState().entries

      // Build blockId→entries[] lookup (multiple entries can share same parentBlockId via sub-shots)
      const entriesByBlockId = new Map<string, typeof entries>()
      for (const e of entries) {
        const key = e.parentBlockId
        const arr = entriesByBlockId.get(key)
        if (arr) arr.push(e)
        else entriesByBlockId.set(key, [e])
      }
      const entryById = new Map(entries.map((e) => [e.id, e]))

      for (const shot of state.shots) {
        const prevShot = prevMap.get(shot.id)
        if (!prevShot) continue

        const visualChanged = shot.thumbnailUrl !== prevShot.thumbnailUrl ||
          shot.originalUrl !== prevShot.originalUrl ||
          shot.imagePrompt !== prevShot.imagePrompt ||
          shot.videoPrompt !== prevShot.videoPrompt ||
          shot.directorNote !== prevShot.directorNote ||
          shot.cameraNote !== prevShot.cameraNote ||
          shot.shotSize !== prevShot.shotSize ||
          shot.cameraMotion !== prevShot.cameraMotion ||
          shot.caption !== prevShot.caption

        if (!visualChanged) continue

        // Find matching rundown entry: by id first, then by parentBlockId (first match)
        const entry = entryById.get(shot.id)
          ?? (entriesByBlockId.get(shot.parentBlockId ?? "")?.[0])
          ?? (entriesByBlockId.get(shot.blockRange?.[0] ?? "")?.[0])

        if (!entry) continue

        useRundownStore.getState().updateEntry(entry.id, {
          caption: shot.caption,
          directorNote: shot.directorNote,
          cameraNote: shot.cameraNote,
          shotSize: shot.shotSize,
          cameraMotion: shot.cameraMotion,
          imagePrompt: shot.imagePrompt,
          videoPrompt: shot.videoPrompt,
          visualDescription: shot.visualDescription,
          visual: shot.thumbnailUrl || shot.originalUrl ? {
            thumbnailUrl: shot.thumbnailUrl,
            thumbnailBlobKey: shot.thumbnailBlobKey,
            originalUrl: shot.originalUrl,
            originalBlobKey: shot.originalBlobKey,
            imagePrompt: shot.imagePrompt,
            videoPrompt: shot.videoPrompt,
            shotSize: shot.shotSize,
            cameraMotion: shot.cameraMotion,
            generationHistory: shot.generationHistory,
            activeHistoryIndex: shot.activeHistoryIndex,
            type: "image",
          } : entry.visual,
        })
      }
    })
  }, [])
}
