/**
 * Placement Engine — deterministic shot↔voice synchronization.
 *
 * Core idea: every screenplay block has a computable temporal position (WPM).
 * Shots map to block ranges → their position = position of covered blocks.
 * Voice clips resolve from the same TimedBlock[], guaranteeing sync.
 */

// ─── Types ───────────────────────────────────────────────────

/** A screenplay block with computed absolute timing */
export interface TimedBlock {
  blockId: string
  sceneId: string
  type: "heading" | "action" | "dialogue" | "transition"
  startMs: number
  endMs: number
  durationMs: number
  speaker?: string
  isVO?: boolean
  text: string
}

/** Timing map for one scene */
export interface SceneTimingMap {
  sceneId: string
  sceneStartMs: number
  sceneDurationMs: number
  blocks: TimedBlock[]
}

/** Shot mapping result: which blocks a shot covers */
export interface ShotMapping {
  shotId: string
  blockRange: [string, string]
  coveredBlockIds: string[]
}

/** Placed shot with absolute timing */
export interface PlacedShot {
  shotId: string
  sceneId: string
  blockRange: [string, string]
  startMs: number
  durationMs: number
  coveredBlockIds: string[]
}

/** Placed voice clip with absolute timing */
export interface PlacedVoice {
  dialogueBlockId: string
  speaker: string
  text: string
  startMs: number
  durationMs: number
  coveringShotId: string | null
  isVO: boolean
}

/** Track block for rendering in EmbeddedTrackView */
export interface TrackBlock {
  id: string
  track: "visual" | "voice" | "graphics" | "titles" | "music"
  text: string
  label: string
  startMs: number
  durationMs: number
}

// ─── Constants ───────────────────────────────────────────────

const DIALOGUE_WPM = 155
const ACTION_WPM = 60
const HEADING_MS = 2000
const TRANSITION_MS = 1200
const DIALOGUE_PAUSE_MS = 300
const MIN_BLOCK_MS = 500
const MIN_ACTION_MS = 2000
const MAX_ACTION_MS = 15000

// ─── Helpers ─────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function dialogueDurationMs(text: string): number {
  const words = wordCount(text)
  return Math.max(MIN_BLOCK_MS, Math.round((words / DIALOGUE_WPM) * 60_000) + DIALOGUE_PAUSE_MS)
}

function actionDurationMs(text: string): number {
  const words = wordCount(text)
  return Math.max(MIN_ACTION_MS, Math.min(MAX_ACTION_MS, Math.round((words / ACTION_WPM) * 60_000)))
}

// ─── Stage 1: Build timing map from blocks ───────────────────

interface BlockInput {
  id: string
  type: string
  text: string
}

/**
 * Build a timing map for a single scene.
 * Assigns absolute ms positions to each significant block.
 * Skips `character` and `parenthetical` — they don't consume time independently.
 */
export function buildSceneTimingMap(
  sceneId: string,
  blocks: BlockInput[],
  sceneStartMs: number,
): SceneTimingMap {
  const timedBlocks: TimedBlock[] = []
  let cursor = sceneStartMs
  let currentSpeaker: string | null = null
  let currentIsVO = false

  for (const block of blocks) {
    const text = block.text.trim()
    if (!text) continue

    switch (block.type) {
      case "scene_heading": {
        timedBlocks.push({
          blockId: block.id,
          sceneId,
          type: "heading",
          startMs: cursor,
          endMs: cursor + HEADING_MS,
          durationMs: HEADING_MS,
          text,
        })
        cursor += HEADING_MS
        currentSpeaker = null
        break
      }

      case "character": {
        // Extract speaker name and V.O. flag — don't advance time
        currentSpeaker = text.replace(/\s*\(.*\)\s*$/, "").trim()
        currentIsVO = /V\.?O\.?/i.test(text)
        break
      }

      case "parenthetical": {
        // Don't advance time
        break
      }

      case "dialogue": {
        const dur = dialogueDurationMs(text)
        timedBlocks.push({
          blockId: block.id,
          sceneId,
          type: "dialogue",
          startMs: cursor,
          endMs: cursor + dur,
          durationMs: dur,
          speaker: currentSpeaker ?? undefined,
          isVO: currentIsVO,
          text,
        })
        cursor += dur
        break
      }

      case "transition": {
        timedBlocks.push({
          blockId: block.id,
          sceneId,
          type: "transition",
          startMs: cursor,
          endMs: cursor + TRANSITION_MS,
          durationMs: TRANSITION_MS,
          text,
        })
        cursor += TRANSITION_MS
        currentSpeaker = null
        break
      }

      case "action":
      default: {
        const dur = actionDurationMs(text)
        timedBlocks.push({
          blockId: block.id,
          sceneId,
          type: "action",
          startMs: cursor,
          endMs: cursor + dur,
          durationMs: dur,
          text,
        })
        cursor += dur
        currentSpeaker = null
        break
      }
    }
  }

  const sceneDurationMs = Math.max(cursor - sceneStartMs, MIN_BLOCK_MS)

  return {
    sceneId,
    sceneStartMs,
    sceneDurationMs,
    blocks: timedBlocks,
  }
}

interface SceneInput {
  id: string
  blockIds: string[]
}

/**
 * Build timing maps for all scenes, laid out end-to-end.
 */
export function buildFullTimingMap(
  blocks: BlockInput[],
  scenes: SceneInput[],
): SceneTimingMap[] {
  const blockMap = new Map(blocks.map((b) => [b.id, b]))
  const maps: SceneTimingMap[] = []
  let cursor = 0

  for (const scene of scenes) {
    const sceneBlocks = scene.blockIds
      .map((id) => blockMap.get(id))
      .filter((b): b is BlockInput => b != null)

    const map = buildSceneTimingMap(scene.id, sceneBlocks, cursor)
    maps.push(map)
    cursor += map.sceneDurationMs
  }

  return maps
}

// ─── Stage 2: Map shots to block ranges ──────────────────────

/** An assignable unit = one or more blocks that form a logical group */
interface AssignableUnit {
  blockIds: string[]
  type: "heading" | "action" | "dialogue" | "transition"
  speaker?: string
  startMs: number
  endMs: number
}

function buildAssignableUnits(timingMap: SceneTimingMap): AssignableUnit[] {
  const units: AssignableUnit[] = []

  for (const block of timingMap.blocks) {
    if (block.type === "dialogue") {
      // Dialogue = its own unit (speaker is the key for matching)
      units.push({
        blockIds: [block.blockId],
        type: "dialogue",
        speaker: block.speaker,
        startMs: block.startMs,
        endMs: block.endMs,
      })
    } else if (block.type === "action") {
      units.push({
        blockIds: [block.blockId],
        type: "action",
        startMs: block.startMs,
        endMs: block.endMs,
      })
    } else if (block.type === "heading") {
      units.push({
        blockIds: [block.blockId],
        type: "heading",
        startMs: block.startMs,
        endMs: block.endMs,
      })
    } else if (block.type === "transition") {
      units.push({
        blockIds: [block.blockId],
        type: "transition",
        startMs: block.startMs,
        endMs: block.endMs,
      })
    }
  }

  return units
}

/** Extract character names mentioned in shot metadata */
function extractShotCharacters(shot: ShotInput): string[] {
  const combined = `${shot.caption ?? ""} ${shot.directorNote ?? ""} ${shot.notes ?? ""} ${shot.label ?? ""}`
  // Split by non-letter characters, collect words that are ALL CAPS or mixed
  // We'll match against known speakers from the timing map
  return combined.toUpperCase().split(/[^A-ZА-ЯЁ]+/).filter((w) => w.length > 1)
}

interface ShotInput {
  id: string
  label?: string
  caption?: string
  directorNote?: string
  notes?: string
}

/**
 * Map shots to block ranges using sequential + character affinity algorithm.
 *
 * For each shot (in order):
 * 1. Extract character names from shot metadata
 * 2. If character found → find nearest dialogue unit of that character ahead of cursor
 * 3. Shot covers all units from cursor to the found unit (inclusive)
 * 4. If no character → take next unit at cursor
 * 5. Last shot stretches to cover remaining units
 */
export function mapShotsToBlocks(
  shots: ShotInput[],
  timingMap: SceneTimingMap,
): ShotMapping[] {
  const units = buildAssignableUnits(timingMap)
  if (units.length === 0 || shots.length === 0) return []

  const mappings: ShotMapping[] = []
  let cursor = 0
  const MAX_LOOKAHEAD = 5

  for (let si = 0; si < shots.length; si++) {
    const shot = shots[si]
    const isLast = si === shots.length - 1

    // Last shot covers everything remaining
    if (isLast) {
      const remaining = units.slice(cursor)
      if (remaining.length === 0) {
        // Edge case: more shots than units — share last unit
        const lastUnit = units[units.length - 1]
        mappings.push({
          shotId: shot.id,
          blockRange: [lastUnit.blockIds[0], lastUnit.blockIds[lastUnit.blockIds.length - 1]],
          coveredBlockIds: [...lastUnit.blockIds],
        })
      } else {
        const allBlockIds = remaining.flatMap((u) => u.blockIds)
        mappings.push({
          shotId: shot.id,
          blockRange: [allBlockIds[0], allBlockIds[allBlockIds.length - 1]],
          coveredBlockIds: allBlockIds,
        })
      }
      break
    }

    if (cursor >= units.length) {
      // More shots than units — share last unit
      const lastUnit = units[units.length - 1]
      mappings.push({
        shotId: shot.id,
        blockRange: [lastUnit.blockIds[0], lastUnit.blockIds[lastUnit.blockIds.length - 1]],
        coveredBlockIds: [...lastUnit.blockIds],
      })
      continue
    }

    // Try character affinity matching
    const shotChars = extractShotCharacters(shot)
    let targetIdx = -1

    if (shotChars.length > 0) {
      // Search forward from cursor for dialogue unit matching any character
      const searchEnd = Math.min(cursor + MAX_LOOKAHEAD, units.length)
      for (let ui = cursor; ui < searchEnd; ui++) {
        if (units[ui].type === "dialogue" && units[ui].speaker) {
          const speakerUpper = units[ui].speaker!.toUpperCase()
          if (shotChars.some((c) => speakerUpper.includes(c) || c.includes(speakerUpper))) {
            targetIdx = ui
            break
          }
        }
      }
    }

    if (targetIdx >= 0) {
      // Cover from cursor to targetIdx (inclusive)
      const covered = units.slice(cursor, targetIdx + 1)
      const allBlockIds = covered.flatMap((u) => u.blockIds)
      mappings.push({
        shotId: shot.id,
        blockRange: [allBlockIds[0], allBlockIds[allBlockIds.length - 1]],
        coveredBlockIds: allBlockIds,
      })
      cursor = targetIdx + 1
    } else {
      // No character match — take one unit at cursor
      const unit = units[cursor]
      mappings.push({
        shotId: shot.id,
        blockRange: [unit.blockIds[0], unit.blockIds[unit.blockIds.length - 1]],
        coveredBlockIds: [...unit.blockIds],
      })
      cursor++
    }
  }

  return mappings
}

// ─── Stage 3: Place shots on timeline ────────────────────────

/**
 * Compute absolute startMs and durationMs for each mapped shot.
 */
export function placeShotsOnTimeline(
  mappedShots: ShotMapping[],
  timingMap: SceneTimingMap,
): PlacedShot[] {
  const blockLookup = new Map(timingMap.blocks.map((b) => [b.blockId, b]))

  return mappedShots.map((mapping) => {
    const coveredBlocks = mapping.coveredBlockIds
      .map((id) => blockLookup.get(id))
      .filter((b): b is TimedBlock => b != null)

    if (coveredBlocks.length === 0) {
      return {
        shotId: mapping.shotId,
        sceneId: timingMap.sceneId,
        blockRange: mapping.blockRange,
        startMs: timingMap.sceneStartMs,
        durationMs: MIN_BLOCK_MS,
        coveredBlockIds: mapping.coveredBlockIds,
      }
    }

    const startMs = Math.min(...coveredBlocks.map((b) => b.startMs))
    const endMs = Math.max(...coveredBlocks.map((b) => b.endMs))

    return {
      shotId: mapping.shotId,
      sceneId: timingMap.sceneId,
      blockRange: mapping.blockRange,
      startMs,
      durationMs: endMs - startMs,
      coveredBlockIds: mapping.coveredBlockIds,
    }
  })
}

// ─── Stage 4: Place voice clips ──────────────────────────────

/**
 * For each dialogue block in the timing map, find which shot covers it
 * and produce a PlacedVoice with correct timing.
 */
export function placeVoiceClips(
  timingMaps: SceneTimingMap[],
  placedShots: PlacedShot[],
): PlacedVoice[] {
  const result: PlacedVoice[] = []

  // Build reverse index: blockId → shotId
  const blockToShot = new Map<string, string>()
  for (const shot of placedShots) {
    for (const blockId of shot.coveredBlockIds) {
      blockToShot.set(blockId, shot.shotId)
    }
  }

  for (const map of timingMaps) {
    for (const block of map.blocks) {
      if (block.type !== "dialogue") continue

      result.push({
        dialogueBlockId: block.blockId,
        speaker: block.speaker ?? "",
        text: block.text,
        startMs: block.startMs,
        durationMs: block.durationMs,
        coveringShotId: blockToShot.get(block.blockId) ?? null,
        isVO: block.isVO ?? false,
      })
    }
  }

  return result
}

// ─── Stage 5: Build track blocks for rendering ───────────────

interface ShotData {
  id: string
  label: string
  caption?: string
  shotSize?: string
  cameraMotion?: string
  thumbnailUrl?: string | null
}

/**
 * Convert PlacedShots + PlacedVoice into TrackBlock[] for EmbeddedTrackView.
 */
export function buildTrackBlocks(
  placedShots: PlacedShot[],
  placedVoice: PlacedVoice[],
  shotsData: ShotData[],
): TrackBlock[] {
  const result: TrackBlock[] = []
  const shotLookup = new Map(shotsData.map((s) => [s.id, s]))

  // Visual track from placed shots
  for (const ps of placedShots) {
    const data = shotLookup.get(ps.shotId)
    result.push({
      id: ps.shotId,
      track: "visual",
      text: data?.caption ?? data?.label ?? "",
      label: data?.shotSize ?? "SHOT",
      startMs: ps.startMs,
      durationMs: ps.durationMs,
    })
  }

  // Voice + titles tracks from placed voice
  for (const pv of placedVoice) {
    result.push({
      id: pv.dialogueBlockId + "-v",
      track: "voice",
      text: pv.text,
      label: pv.speaker,
      startMs: pv.startMs,
      durationMs: pv.durationMs,
    })

    result.push({
      id: pv.dialogueBlockId + "-t",
      track: "titles",
      text: `${pv.speaker}: ${pv.text}`,
      label: pv.speaker,
      startMs: pv.startMs,
      durationMs: pv.durationMs,
    })
  }

  return result
}

// ─── Convenience: full pipeline for one scene ────────────────

/**
 * Run entire placement pipeline for a single scene.
 */
export function placeScene(
  sceneId: string,
  sceneBlocks: BlockInput[],
  sceneStartMs: number,
  shots: ShotInput[],
): { timingMap: SceneTimingMap; placedShots: PlacedShot[]; placedVoice: PlacedVoice[] } {
  const timingMap = buildSceneTimingMap(sceneId, sceneBlocks, sceneStartMs)
  const mapped = mapShotsToBlocks(shots, timingMap)
  const placedShots = placeShotsOnTimeline(mapped, timingMap)
  const placedVoice = placeVoiceClips([timingMap], placedShots)

  return { timingMap, placedShots, placedVoice }
}

/**
 * Run placement for all scenes.
 */
export function placeAllScenes(
  blocks: BlockInput[],
  scenes: SceneInput[],
  shotsByScene: Map<string, ShotInput[]>,
): { timingMaps: SceneTimingMap[]; placedShots: PlacedShot[]; placedVoice: PlacedVoice[] } {
  const timingMaps = buildFullTimingMap(blocks, scenes)
  const allPlacedShots: PlacedShot[] = []

  for (const map of timingMaps) {
    const sceneShots = shotsByScene.get(map.sceneId) ?? []
    if (sceneShots.length === 0) continue

    const mapped = mapShotsToBlocks(sceneShots, map)
    const placed = placeShotsOnTimeline(mapped, map)
    allPlacedShots.push(...placed)
  }

  const placedVoice = placeVoiceClips(timingMaps, allPlacedShots)

  return { timingMaps, placedShots: allPlacedShots, placedVoice }
}
