/**
 * Shot Sync Engine — pure functions for auto-creating shots from screenplay blocks.
 *
 * When the user types in the screenplay editor, this engine determines which
 * shot blocks should exist, diffs against current state, and reconciles.
 */

import { buildSceneTimingMap } from "./placementEngine"

// ─── Types ───────────────────────────────────────────────────

export interface BlockInput {
  id: string
  type: string
  text: string
}

export interface SceneInput {
  id: string
  blockIds: string[]
  title: string
}

/** A unit of screenplay content that maps to one auto-shot */
export interface AutoShotUnit {
  blockIds: string[]
  primaryBlockId: string
  type: "establishing" | "action" | "dialogue"
  sceneId: string
  label: string
  caption: string
  speaker?: string
  durationMs: number
}

/** Lightweight snapshot of a block for diffing */
export interface BlockSnapshot {
  id: string
  type: string
  textHash: number
}

/** Result of diffing two block snapshots */
export interface BlockDiff {
  hasStructuralChanges: boolean
  addedBlockIds: string[]
  removedBlockIds: string[]
  typeChangedBlockIds: string[]
  textChangedBlockIds: string[]
}

/** Minimal shot interface for reconciliation */
export interface ShotRef {
  id: string
  sceneId: string | null
  blockRange: [string, string] | null
  autoSynced: boolean
  locked: boolean
  caption: string
  imagePrompt: string
  thumbnailUrl: string | null
}

// ─── Constants ───────────────────────────────────────────────

const DIALOGUE_WPM = 155
const ACTION_WPM = 60
const HEADING_MS = 2000
const DIALOGUE_PAUSE_MS = 300
const MIN_DURATION_MS = 500
const MIN_ACTION_MS = 2000
const MAX_ACTION_MS = 15000

// ─── Helpers ─────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function dialogueDuration(text: string): number {
  return Math.max(MIN_DURATION_MS, Math.round((wordCount(text) / DIALOGUE_WPM) * 60_000) + DIALOGUE_PAUSE_MS)
}

function actionDuration(text: string): number {
  return Math.max(MIN_ACTION_MS, Math.min(MAX_ACTION_MS, Math.round((wordCount(text) / ACTION_WPM) * 60_000)))
}

/** Fast FNV-1a hash for text comparison */
export function simpleHash(str: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash
}

// ─── Build Auto-Shot Units ───────────────────────────────────

/**
 * Walk screenplay blocks and group them into auto-shot units.
 *
 * Rules:
 * - scene_heading → 1 establishing shot
 * - action → 1 action shot
 * - character + parenthetical(s) + dialogue → 1 dialogue shot
 * - transition → skip
 */
export function buildAutoShotUnits(blocks: BlockInput[], scenes: SceneInput[]): AutoShotUnit[] {
  const units: AutoShotUnit[] = []

  // Build block→scene lookup
  const blockToScene = new Map<string, string>()
  for (const scene of scenes) {
    for (const bid of scene.blockIds) {
      blockToScene.set(bid, scene.id)
    }
  }

  // Scene index tracking for labels
  const sceneShotCounters = new Map<string, number>()

  // Pending dialogue group accumulator
  let pendingCharName: string | null = null
  let pendingBlockIds: string[] = []
  let pendingDialogueText = ""

  const flushDialogueGroup = (sceneId: string) => {
    if (pendingCharName && pendingBlockIds.length > 0 && pendingDialogueText.trim()) {
      const counter = (sceneShotCounters.get(sceneId) ?? 0) + 1
      sceneShotCounters.set(sceneId, counter)

      // primaryBlockId = the last block (the dialogue itself)
      const primaryBlockId = pendingBlockIds[pendingBlockIds.length - 1]

      units.push({
        blockIds: [...pendingBlockIds],
        primaryBlockId,
        type: "dialogue",
        sceneId,
        label: `Shot ${counter}`,
        caption: pendingDialogueText.trim(),
        speaker: pendingCharName,
        durationMs: dialogueDuration(pendingDialogueText),
      })
    }
    pendingCharName = null
    pendingBlockIds = []
    pendingDialogueText = ""
  }

  for (const block of blocks) {
    const text = block.text.trim()
    if (!text) continue

    const sceneId = blockToScene.get(block.id) ?? ""

    switch (block.type) {
      case "scene_heading": {
        // Flush any pending dialogue first
        flushDialogueGroup(sceneId)

        const counter = (sceneShotCounters.get(sceneId) ?? 0) + 1
        sceneShotCounters.set(sceneId, counter)

        units.push({
          blockIds: [block.id],
          primaryBlockId: block.id,
          type: "establishing",
          sceneId,
          label: text.slice(0, 40),
          caption: text,
          durationMs: HEADING_MS,
        })
        break
      }

      case "action": {
        flushDialogueGroup(sceneId)

        const counter = (sceneShotCounters.get(sceneId) ?? 0) + 1
        sceneShotCounters.set(sceneId, counter)

        units.push({
          blockIds: [block.id],
          primaryBlockId: block.id,
          type: "action",
          sceneId,
          label: `Shot ${counter}`,
          caption: text,
          durationMs: actionDuration(text),
        })
        break
      }

      case "character": {
        // Start a new dialogue group (flush previous if any)
        flushDialogueGroup(sceneId)
        pendingCharName = text.replace(/\s*\(.*\)\s*$/, "").trim()
        pendingBlockIds = [block.id]
        break
      }

      case "parenthetical": {
        // Add to current dialogue group
        if (pendingBlockIds.length > 0) {
          pendingBlockIds.push(block.id)
        }
        break
      }

      case "dialogue": {
        // Complete the dialogue group
        if (pendingCharName) {
          pendingBlockIds.push(block.id)
          pendingDialogueText = text
          flushDialogueGroup(sceneId)
        } else {
          // Orphan dialogue (no preceding character block) — treat as action
          const counter = (sceneShotCounters.get(sceneId) ?? 0) + 1
          sceneShotCounters.set(sceneId, counter)

          units.push({
            blockIds: [block.id],
            primaryBlockId: block.id,
            type: "action",
            sceneId,
            label: `Shot ${counter}`,
            caption: text,
            durationMs: dialogueDuration(text),
          })
        }
        break
      }

      case "transition": {
        flushDialogueGroup(sceneId)
        // No shot for transitions
        break
      }

      default: {
        // Unknown type — treat as action
        flushDialogueGroup(sceneId)
        const counter = (sceneShotCounters.get(sceneId) ?? 0) + 1
        sceneShotCounters.set(sceneId, counter)

        units.push({
          blockIds: [block.id],
          primaryBlockId: block.id,
          type: "action",
          sceneId,
          label: `Shot ${counter}`,
          caption: text,
          durationMs: actionDuration(text),
        })
        break
      }
    }
  }

  // Flush any remaining dialogue group
  const lastSceneId = blocks.length > 0 ? blockToScene.get(blocks[blocks.length - 1].id) ?? "" : ""
  flushDialogueGroup(lastSceneId)

  return units
}

// ─── Diff ────────────────────────────────────────────────────

/** Create a snapshot of blocks for efficient diffing */
export function snapshotBlocks(blocks: BlockInput[]): BlockSnapshot[] {
  return blocks.map((b) => ({
    id: b.id,
    type: b.type,
    textHash: simpleHash(b.text),
  }))
}

/** Diff two block snapshots to detect what changed */
export function diffBlockSnapshots(prev: BlockSnapshot[], next: BlockSnapshot[]): BlockDiff {
  const prevMap = new Map(prev.map((b) => [b.id, b]))
  const nextMap = new Map(next.map((b) => [b.id, b]))

  const addedBlockIds: string[] = []
  const removedBlockIds: string[] = []
  const typeChangedBlockIds: string[] = []
  const textChangedBlockIds: string[] = []

  // Find added and changed
  for (const [id, nb] of nextMap) {
    const pb = prevMap.get(id)
    if (!pb) {
      addedBlockIds.push(id)
    } else {
      if (pb.type !== nb.type) typeChangedBlockIds.push(id)
      else if (pb.textHash !== nb.textHash) textChangedBlockIds.push(id)
    }
  }

  // Find removed
  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) removedBlockIds.push(id)
  }

  return {
    hasStructuralChanges: addedBlockIds.length > 0 || removedBlockIds.length > 0 || typeChangedBlockIds.length > 0,
    addedBlockIds,
    removedBlockIds,
    typeChangedBlockIds,
    textChangedBlockIds,
  }
}

// ─── Reconcile ───────────────────────────────────────────────

interface ReconcileActions {
  addShot: (partial: Record<string, unknown>) => string
  removeShot: (id: string) => void
  updateShot: (id: string, patch: Record<string, unknown>) => void
  reorderShots: (shots: ShotRef[]) => void
}

/**
 * Full reconciliation: rebuild shot units from blocks, diff against existing
 * auto-synced shots, create/remove/update as needed.
 *
 * Rules:
 * - NEVER touch locked shots or manually-added shots (autoSynced === false)
 * - Match existing auto-synced shots by primaryBlockId (stored in blockRange[0])
 * - New units → create shots
 * - Missing units → remove shots
 * - Changed units → update caption/duration/blockRange
 */
export function reconcileShots(
  blocks: BlockInput[],
  scenes: SceneInput[],
  existingShots: ShotRef[],
  actions: ReconcileActions,
): void {
  const units = buildAutoShotUnits(blocks, scenes)

  // Index existing auto-synced shots by their primary block ID
  const autoShotsByBlock = new Map<string, ShotRef>()
  const nonAutoShots: ShotRef[] = []

  for (const shot of existingShots) {
    if (shot.autoSynced && !shot.locked && shot.blockRange) {
      autoShotsByBlock.set(shot.blockRange[0], shot)
    } else {
      nonAutoShots.push(shot)
    }
  }

  // Track which existing auto-shots are still matched
  const matchedShotIds = new Set<string>()
  const newShots: Record<string, unknown>[] = []

  for (const unit of units) {
    const existing = autoShotsByBlock.get(unit.primaryBlockId)
    const blockRange: [string, string] = [unit.blockIds[0], unit.blockIds[unit.blockIds.length - 1]]

    if (existing) {
      matchedShotIds.add(existing.id)
      // Update if changed
      if (existing.caption !== unit.caption) {
        actions.updateShot(existing.id, {
          caption: unit.caption,
          sourceText: unit.caption,
          duration: unit.durationMs,
          label: unit.label,
          blockRange,
          sceneId: unit.sceneId,
        })
      }
    } else {
      // Create new auto-synced shot
      newShots.push({
        label: unit.label,
        caption: unit.caption,
        sourceText: unit.caption,
        duration: unit.durationMs,
        sceneId: unit.sceneId,
        blockRange,
        autoSynced: true,
        locked: false,
      })
    }
  }

  // Remove unmatched auto-synced shots
  for (const [, shot] of autoShotsByBlock) {
    if (!matchedShotIds.has(shot.id)) {
      actions.removeShot(shot.id)
    }
  }

  // Create new shots
  for (const shotData of newShots) {
    actions.addShot(shotData)
  }
}

/**
 * Fast path: only update text/duration on shots whose blocks' text changed.
 * No creation or deletion.
 */
export function updateShotTextsOnly(
  changedBlockIds: string[],
  blocks: BlockInput[],
  existingShots: ShotRef[],
  updateShot: (id: string, patch: Record<string, unknown>) => void,
): void {
  const changedSet = new Set(changedBlockIds)
  const blockMap = new Map(blocks.map((b) => [b.id, b]))

  for (const shot of existingShots) {
    if (!shot.autoSynced || shot.locked || !shot.blockRange) continue

    // Check if any block in this shot's range changed
    const primaryBlockId = shot.blockRange[0]
    if (!changedSet.has(primaryBlockId)) continue

    const block = blockMap.get(primaryBlockId)
    if (!block) continue

    const text = block.text.trim()
    if (text === shot.caption) continue

    const durationMs = block.type === "dialogue"
      ? dialogueDuration(text)
      : block.type === "scene_heading"
        ? HEADING_MS
        : actionDuration(text)

    updateShot(shot.id, {
      caption: text,
      sourceText: text,
      duration: durationMs,
    })
  }
}
