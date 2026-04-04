/**
 * Block Enricher — auto-populates production fields on blocks.
 *
 * Pure function: takes Block[] + Scene[], returns Block[] with
 * durationMs, durationSource, and shotGroupId filled in.
 *
 * Only sets fields that are undefined (never overwrites manual edits).
 */

import type { Block, BlockType } from "./screenplayFormat"
import type { Scene } from "@/lib/sceneParser"

// ─── Duration constants (same as placementEngine) ────────────

const DIALOGUE_WPM = 155
const ACTION_WPM = 60
const HEADING_MS = 2000
const TRANSITION_MS = 1200
const DIALOGUE_PAUSE_MS = 300
const MIN_BLOCK_MS = 500
const MIN_ACTION_MS = 2000
const MAX_ACTION_MS = 15000
const CHARACTER_MS = 200
const PARENTHETICAL_MS = 500

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** Estimate duration for a single block based on its type and text. */
export function estimateBlockDurationMs(type: BlockType, text: string): number {
  switch (type) {
    case "scene_heading":
      return HEADING_MS
    case "action":
    case "shot": {
      const words = wordCount(text)
      return Math.max(
        MIN_ACTION_MS,
        Math.min(MAX_ACTION_MS, Math.round((words / ACTION_WPM) * 60_000)),
      )
    }
    case "dialogue": {
      const words = wordCount(text)
      return Math.max(
        MIN_BLOCK_MS,
        Math.round((words / DIALOGUE_WPM) * 60_000) + DIALOGUE_PAUSE_MS,
      )
    }
    case "character":
      return CHARACTER_MS
    case "parenthetical":
      return PARENTHETICAL_MS
    case "transition":
      return TRANSITION_MS
    default:
      return MIN_BLOCK_MS
  }
}

/**
 * Enrich blocks with auto-computed production fields.
 * Only fills fields that are currently undefined — never overwrites manual edits.
 */
export function enrichBlocks(
  blocks: Block[],
  scenes: Scene[],
): Block[] {
  // Build blockId → sceneId lookup
  const blockToScene = new Map<string, string>()
  for (const scene of scenes) {
    for (const blockId of scene.blockIds) {
      blockToScene.set(blockId, scene.id)
    }
  }

  return blocks.map((block) => {
    let changed = false
    const patch: Partial<Block> = {}

    // Auto-compute duration if not set
    if (block.durationMs === undefined) {
      patch.durationMs = estimateBlockDurationMs(block.type, block.text)
      patch.durationSource = "auto"
      changed = true
    }

    if (!changed) return block
    return { ...block, ...patch }
  })
}
