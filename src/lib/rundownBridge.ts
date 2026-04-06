/**
 * Rundown Bridge — adapter functions to bridge RundownEntry ↔ TimelineShot.
 *
 * During migration (Phase 4), components that still expect TimelineShot
 * can use these adapters to consume RundownEntry data transparently.
 *
 * After full migration, this file can be deleted.
 */

import type { RundownEntry } from "./rundownTypes"
import type { TimelineShot } from "@/store/timeline"
import { getEffectiveDuration } from "./durationEngine"

/**
 * Convert a RundownEntry to a TimelineShot-compatible object.
 * Used by StoryboardPanel, DirectorShotCard, and other legacy consumers.
 */
export function entryToTimelineShot(entry: RundownEntry, order: number, sceneId?: string | null): TimelineShot {
  return {
    id: entry.id,
    order,
    duration: getEffectiveDuration(entry),
    type: "image",
    thumbnailUrl: entry.visual?.thumbnailUrl ?? null,
    originalUrl: entry.visual?.originalUrl ?? null,
    thumbnailBlobKey: entry.visual?.thumbnailBlobKey ?? null,
    originalBlobKey: entry.visual?.originalBlobKey ?? null,
    generationHistory: entry.generationHistory,
    activeHistoryIndex: entry.activeHistoryIndex,
    sceneId: sceneId ?? null,
    label: entry.label,
    notes: "",
    shotSize: entry.shotSize,
    cameraMotion: entry.cameraMotion,
    caption: entry.caption,
    directorNote: entry.directorNote,
    cameraNote: entry.cameraNote,
    videoPrompt: entry.videoPrompt,
    imagePrompt: entry.imagePrompt,
    visualDescription: entry.visualDescription,
    svg: "",
    blockRange: [entry.parentBlockId, entry.parentBlockId],
    parentBlockId: entry.parentBlockId,
    shotId: entry.id,
    locked: entry.locked,
    autoSynced: entry.autoSynced,
    sourceText: entry.sourceText,
    customReferenceUrls: [],
    excludedBibleIds: [],
    bakedPrompt: false,
  }
}

/**
 * Convert a TimelineShot patch back to a RundownEntry patch.
 */
export function timelinePatchToEntryPatch(
  patch: Partial<TimelineShot>,
): Partial<RundownEntry> {
  const result: Partial<RundownEntry> = {}

  if (patch.label !== undefined) result.label = patch.label
  if (patch.caption !== undefined) result.caption = patch.caption
  if (patch.directorNote !== undefined) result.directorNote = patch.directorNote
  if (patch.cameraNote !== undefined) result.cameraNote = patch.cameraNote
  if (patch.shotSize !== undefined) result.shotSize = patch.shotSize
  if (patch.cameraMotion !== undefined) result.cameraMotion = patch.cameraMotion
  if (patch.imagePrompt !== undefined) result.imagePrompt = patch.imagePrompt
  if (patch.videoPrompt !== undefined) result.videoPrompt = patch.videoPrompt
  if (patch.visualDescription !== undefined) result.visualDescription = patch.visualDescription
  if (patch.sourceText !== undefined) result.sourceText = patch.sourceText
  if (patch.locked !== undefined) result.locked = patch.locked

  // Duration → manualDurationMs
  if (patch.duration !== undefined) result.manualDurationMs = patch.duration

  // Visual fields
  if (patch.thumbnailUrl !== undefined || patch.originalUrl !== undefined || patch.generationHistory !== undefined) {
    // These need to update the visual object
    // Handled separately by the caller
  }

  return result
}

/**
 * Convert RundownEntry[] to TimelineShot[] for legacy consumers.
 * Pass scenes to resolve sceneId for each entry via parentBlockId.
 */
export function entriesToTimelineShots(
  entries: RundownEntry[],
  scenes?: { id: string; blockIds: string[] }[],
): TimelineShot[] {
  // Build blockId → sceneId lookup
  const blockToScene = new Map<string, string>()
  if (scenes) {
    for (const scene of scenes) {
      for (const bid of scene.blockIds) {
        blockToScene.set(bid, scene.id)
      }
    }
  }

  return entries
    .filter((e) => e.entryType !== "heading")
    .map((entry, index) => entryToTimelineShot(
      entry,
      index,
      blockToScene.get(entry.parentBlockId) ?? null,
    ))
}
