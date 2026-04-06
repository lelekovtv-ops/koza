/**
 * useSyncOrchestrator — forward sync between screenplay, scenes, timeline,
 * bible, dialogue, and voice.
 *
 * Forward sync: blocks → scenes → rundown → timeline → bible → dialogue → voice
 * Reverse sync: handled by WS operations (Phase 3+), no longer via syncBus.
 * Timeline→rundown visual propagation kept for local consistency.
 */

import { useEffect } from "react"
import { useScriptStore } from "@/store/script"
import { useScenesStore } from "@/store/scenes"
import { useTimelineStore } from "@/store/timeline"
import { useBibleStore } from "@/store/bible"
import { useDialogueStore, extractDialogueLines } from "@/store/dialogue"
import { useVoiceTrackStore, generateVoiceClipsFromDialogue } from "@/store/voiceTrack"
import { useRundownStore } from "@/store/rundown"
import { entriesToTimelineShots } from "@/lib/rundownBridge"

/**
 * Mount this hook at the workspace/studio level.
 * It handles forward data synchronization between modules.
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

  // ── Timeline → rundown visual propagation (local consistency) ──
  // When StoryboardPanel updates a shot in timeline store,
  // propagate visual/prompt data back to rundown (persisted)
  useEffect(() => {
    return useTimelineStore.subscribe((state, prev) => {
      if (state._lastOrigin === "screenplay") return
      if (state.shots === prev.shots) return

      const prevMap = new Map(prev.shots.map((s) => [s.id, s]))
      const entries = useRundownStore.getState().entries

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
