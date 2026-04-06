/**
 * Enrich existing blocks from breakdown results.
 *
 * Instead of creating separate TimelineShots, this function:
 * 1. Maps breakdown shots to existing blocks (via placement engine)
 * 2. Writes production fields (visual, shotSize, cameraMotion, imagePrompt) onto blocks
 * 3. Creates ShotGroups linking blocks to timeline positions
 * 4. Preserves original block text — only adds production metadata
 *
 * Result: blocks become "production-ready" and timeline auto-syncs via useSyncOrchestrator.
 */

import type { Block } from "@/lib/screenplayFormat"
import type { JenkinsShot } from "@/lib/breakdownTypes"
import type { Shot, ShotGroup, ProductionVisual } from "@/lib/productionTypes"
import { buildSceneTimingMap, mapShotsToBlocks, placeShotsOnTimeline } from "@/lib/placementEngine"

interface EnrichInput {
  sceneId: string
  sceneBlocks: Block[]
  shots: JenkinsShot[]
  sceneStartMs?: number
}

interface EnrichResult {
  /** Blocks with production fields filled in */
  enrichedBlocks: Block[]
  /** Child shots (new parent-child model) */
  shots: Shot[]
  /** @deprecated Shot groups for this scene */
  shotGroups: ShotGroup[]
  /** Also returns TimelineShot-compatible data for backward compat */
  timelineShots: {
    label: string
    shotSize: string
    cameraMotion: string
    duration: number
    caption: string
    directorNote: string
    cameraNote: string
    imagePrompt: string
    videoPrompt: string
    visualDescription: string
    sceneId: string
    blockRange: [string, string] | null
  }[]
}

const createId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/**
 * Enrich blocks from breakdown shots.
 *
 * For each breakdown shot:
 * - Find which blocks it covers (via placement engine)
 * - Write imagePrompt, shotSize, cameraMotion onto the primary block
 * - Create a ShotGroup linking those blocks
 */
export function enrichBlocksFromBreakdown(input: EnrichInput): EnrichResult {
  const { sceneId, sceneBlocks, shots, sceneStartMs = 0 } = input

  if (sceneBlocks.length === 0 || shots.length === 0) {
    return { enrichedBlocks: sceneBlocks, shots: [], shotGroups: [], timelineShots: [] }
  }

  // Build timing map for this scene
  const timingMap = buildSceneTimingMap(sceneId, sceneBlocks, sceneStartMs)

  // Map shots to blocks
  const shotInputs = shots.map((s) => ({
    id: s.id,
    label: s.label,
    caption: s.caption,
    directorNote: s.directorNote,
    notes: s.notes,
  }))
  const mapped = mapShotsToBlocks(shotInputs, timingMap)
  const placed = placeShotsOnTimeline(mapped, timingMap)

  // Build a map: blockId → which shot covers it
  const blockToShot = new Map<string, { shot: JenkinsShot; groupId: string; placed: typeof placed[number] }>()
  const childShots: Shot[] = []
  const shotGroups: ShotGroup[] = []
  const timelineShots: EnrichResult["timelineShots"] = []

  for (let i = 0; i < placed.length; i++) {
    const p = placed[i]
    const shot = shots[i]
    if (!shot) continue

    const groupId = `sg-${sceneId}-${i}`
    const coveredBlockIds = p.coveredBlockIds.length > 0
      ? p.coveredBlockIds
      : sceneBlocks.map((b) => b.id) // fallback: all blocks

    // Mark each covered block
    for (const blockId of coveredBlockIds) {
      if (!blockToShot.has(blockId)) {
        blockToShot.set(blockId, { shot, groupId, placed: p })
      }
    }

    // Determine primary block (first action or dialogue in range)
    const primaryBlockId = coveredBlockIds.find((id) => {
      const b = sceneBlocks.find((bl) => bl.id === id)
      return b && (b.type === "action" || b.type === "dialogue")
    }) ?? coveredBlockIds[0]

    // Determine shot group type
    const primaryBlock = sceneBlocks.find((b) => b.id === primaryBlockId)
    const groupType: ShotGroup["type"] =
      i === 0 ? "establishing"
        : primaryBlock?.type === "dialogue" ? "dialogue"
          : "action"

    // Find speaker if dialogue
    const speaker = groupType === "dialogue"
      ? findSpeaker(sceneBlocks, primaryBlockId)
      : null

    shotGroups.push({
      id: groupId,
      sceneId,
      blockIds: coveredBlockIds,
      primaryBlockId,
      type: groupType,
      startMs: p.startMs,
      durationMs: p.durationMs,
      order: i,
      visual: {
        thumbnailUrl: null,
        thumbnailBlobKey: null,
        originalUrl: null,
        originalBlobKey: null,
        imagePrompt: shot.imagePrompt,
        videoPrompt: shot.videoPrompt,
        shotSize: shot.shotSize,
        cameraMotion: shot.cameraMotion,
        generationHistory: [],
        activeHistoryIndex: null,
        type: "image",
      },
      label: shot.label,
      speaker,
      locked: false,
      autoSynced: true,
    })

    // Child shot (new parent-child model)
    childShots.push({
      id: `shot_${Date.now()}_${i}_${createId().slice(0, 4)}`,
      parentBlockId: primaryBlockId,
      order: childShots.filter((s) => s.parentBlockId === primaryBlockId).length,
      label: shot.label,
      caption: shot.caption,
      sourceText: shot.caption,
      shotSize: shot.shotSize,
      cameraMotion: shot.cameraMotion,
      directorNote: shot.directorNote,
      cameraNote: shot.cameraNote,
      imagePrompt: shot.imagePrompt,
      videoPrompt: shot.videoPrompt,
      visualDescription: shot.visualDescription,
      durationMs: p.durationMs,
      visual: {
        thumbnailUrl: null,
        thumbnailBlobKey: null,
        originalUrl: null,
        originalBlobKey: null,
        imagePrompt: shot.imagePrompt,
        videoPrompt: shot.videoPrompt,
        shotSize: shot.shotSize,
        cameraMotion: shot.cameraMotion,
        generationHistory: [],
        activeHistoryIndex: null,
        type: "image",
      },
      locked: false,
      autoSynced: true,
      speaker,
      type: groupType,
    })

    // Backward compat timeline shot data
    timelineShots.push({
      label: shot.label,
      shotSize: shot.shotSize,
      cameraMotion: shot.cameraMotion,
      duration: p.durationMs,
      caption: shot.caption,
      directorNote: shot.directorNote,
      cameraNote: shot.cameraNote,
      imagePrompt: shot.imagePrompt,
      videoPrompt: shot.videoPrompt,
      visualDescription: shot.visualDescription,
      sceneId,
      blockRange: p.blockRange,
    })
  }

  // Enrich blocks: write production fields onto covered blocks
  const enrichedBlocks = sceneBlocks.map((block) => {
    const mapping = blockToShot.get(block.id)
    if (!mapping) return block

    const { shot, groupId } = mapping

    // Only set fields that aren't already manually set
    const visual: ProductionVisual | undefined =
      block.visual && block.visual.imagePrompt
        ? undefined // don't overwrite existing visual
        : {
            thumbnailUrl: null,
            thumbnailBlobKey: null,
            originalUrl: null,
            originalBlobKey: null,
            imagePrompt: shot.imagePrompt,
            videoPrompt: shot.videoPrompt,
            shotSize: shot.shotSize,
            cameraMotion: shot.cameraMotion,
            generationHistory: [],
            activeHistoryIndex: null,
            type: "image" as const,
          }

    return {
      ...block,
      shotGroupId: block.shotGroupId ?? groupId,
      ...(visual ? { visual } : {}),
      // Don't overwrite manual duration
      ...(block.durationSource !== "manual" && block.durationSource !== "media"
        ? { durationMs: mapping.placed.durationMs / (mapping.placed.coveredBlockIds.length || 1) }
        : {}),
    }
  })

  return { enrichedBlocks, shots: childShots, shotGroups, timelineShots }
}

/** Find speaker name for a dialogue block by looking at preceding character block */
function findSpeaker(blocks: Block[], dialogueBlockId: string): string | null {
  const idx = blocks.findIndex((b) => b.id === dialogueBlockId)
  if (idx <= 0) return null

  // Walk backwards to find character block
  for (let i = idx - 1; i >= 0; i--) {
    if (blocks[i].type === "character") {
      return blocks[i].text.replace(/\s*\(.*\)\s*$/, "").trim()
    }
    if (blocks[i].type === "scene_heading") break // don't cross scene boundaries
  }
  return null
}
