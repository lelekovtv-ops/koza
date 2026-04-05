/**
 * Rundown Builder — pure function that converts screenplay blocks + scenes into RundownEntry[].
 *
 * Absorbs logic from shotSyncEngine.buildAutoShotUnits() and placementEngine.buildSceneTimingMap().
 * Uses durationEngine for all duration calculations.
 *
 * Pure functions, no side effects, no store imports.
 */

import type { RundownEntry } from "./rundownTypes"
import { createRundownEntry, makeRundownEntryId } from "./rundownTypes"
import { estimateBlockDurationMs, dialogueDurationMs, actionDurationMs, HEADING_MS } from "./durationEngine"
import { simpleHash } from "./shotSyncEngine"

// ─── Input Types ─────────────────────────────────────────────

export interface BuilderBlockInput {
  id: string
  type: string
  text: string
  durationMs?: number
  durationSource?: string
  visual?: { thumbnailUrl?: string | null } | null
}

export interface BuilderSceneInput {
  id: string
  blockIds: string[]
  title: string
}

// ─── Block Snapshot (for diffing) ────────────────────────────

export interface BlockSnapshot {
  id: string
  type: string
  textHash: number
}

export interface BlockDiff {
  hasStructuralChanges: boolean
  addedBlockIds: string[]
  removedBlockIds: string[]
  typeChangedBlockIds: string[]
  textChangedBlockIds: string[]
}

export function snapshotBlocks(blocks: BuilderBlockInput[]): BlockSnapshot[] {
  return blocks.map((b) => ({
    id: b.id,
    type: b.type,
    textHash: simpleHash(b.text),
  }))
}

export function diffBlockSnapshots(prev: BlockSnapshot[], next: BlockSnapshot[]): BlockDiff {
  const prevMap = new Map(prev.map((b) => [b.id, b]))
  const nextMap = new Map(next.map((b) => [b.id, b]))

  const addedBlockIds: string[] = []
  const removedBlockIds: string[] = []
  const typeChangedBlockIds: string[] = []
  const textChangedBlockIds: string[] = []

  for (const [id, nb] of nextMap) {
    const pb = prevMap.get(id)
    if (!pb) {
      addedBlockIds.push(id)
    } else {
      if (pb.type !== nb.type) typeChangedBlockIds.push(id)
      else if (pb.textHash !== nb.textHash) textChangedBlockIds.push(id)
    }
  }

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

// ─── Build RundownEntry[] from Blocks ────────────────────────

/**
 * Build RundownEntry[] from screenplay blocks and scenes.
 * Each significant block group (action, dialogue) becomes one entry.
 * scene_heading and transition don't create entries (they're structural markers).
 */
export function buildRundownEntries(
  blocks: BuilderBlockInput[],
  scenes: BuilderSceneInput[],
): RundownEntry[] {
  const entries: RundownEntry[] = []

  // Block → scene lookup
  const blockToScene = new Map<string, string>()
  for (const scene of scenes) {
    for (const bid of scene.blockIds) {
      blockToScene.set(bid, scene.id)
    }
  }

  // Scene shot counters for labels
  const sceneShotCounters = new Map<string, number>()

  // Dialogue group accumulator
  let pendingCharName: string | null = null
  let pendingCharIsVO = false
  let pendingBlockIds: string[] = []
  let pendingDialogueText = ""

  const flushDialogueGroup = (sceneId: string) => {
    if (pendingCharName && pendingBlockIds.length > 0 && pendingDialogueText.trim()) {
      const counter = (sceneShotCounters.get(sceneId) ?? 0) + 1
      sceneShotCounters.set(sceneId, counter)

      const primaryBlockId = pendingBlockIds[pendingBlockIds.length - 1]

      entries.push(createRundownEntry({
        parentBlockId: primaryBlockId,
        entryType: "dialogue",
        order: entries.length,
        label: `Shot ${counter}`,
        caption: pendingDialogueText.trim(),
        sourceText: pendingDialogueText.trim(),
        speaker: pendingCharName,
        isVO: pendingCharIsVO,
        estimatedDurationMs: dialogueDurationMs(pendingDialogueText),
        autoSynced: true,
      }))
    }
    pendingCharName = null
    pendingCharIsVO = false
    pendingBlockIds = []
    pendingDialogueText = ""
  }

  for (const block of blocks) {
    const text = block.text.trim()
    if (!text) continue

    const sceneId = blockToScene.get(block.id) ?? ""

    switch (block.type) {
      case "scene_heading": {
        flushDialogueGroup(sceneId)
        // scene_heading doesn't create an entry — first action = establishing
        break
      }

      case "action": {
        flushDialogueGroup(sceneId)
        const counter = (sceneShotCounters.get(sceneId) ?? 0) + 1
        sceneShotCounters.set(sceneId, counter)

        const isFirstInScene = counter === 1

        entries.push(createRundownEntry({
          parentBlockId: block.id,
          entryType: isFirstInScene ? "establishing" : "action",
          order: entries.length,
          label: isFirstInScene ? text.slice(0, 40) : `Shot ${counter}`,
          caption: text,
          sourceText: text,
          estimatedDurationMs: actionDurationMs(text),
          autoSynced: true,
        }))
        break
      }

      case "character": {
        flushDialogueGroup(sceneId)
        const rawName = text.replace(/\s*\(.*\)\s*$/, "").trim()
        pendingCharName = rawName
        pendingCharIsVO = /\(V\.?O\.?\)/.test(text)
        pendingBlockIds = [block.id]
        break
      }

      case "parenthetical": {
        if (pendingBlockIds.length > 0) {
          pendingBlockIds.push(block.id)
          // Check for V.O. in parenthetical
          if (/V\.?O\.?/i.test(text)) pendingCharIsVO = true
        }
        break
      }

      case "dialogue": {
        if (pendingCharName) {
          pendingBlockIds.push(block.id)
          pendingDialogueText = text
          flushDialogueGroup(sceneId)
        } else {
          // Orphan dialogue → treat as action
          const counter = (sceneShotCounters.get(sceneId) ?? 0) + 1
          sceneShotCounters.set(sceneId, counter)
          entries.push(createRundownEntry({
            parentBlockId: block.id,
            entryType: "action",
            order: entries.length,
            label: `Shot ${counter}`,
            caption: text,
            sourceText: text,
            estimatedDurationMs: dialogueDurationMs(text),
            autoSynced: true,
          }))
        }
        break
      }

      case "transition": {
        flushDialogueGroup(sceneId)
        // Transitions create a brief entry for timeline
        entries.push(createRundownEntry({
          parentBlockId: block.id,
          entryType: "transition",
          order: entries.length,
          label: text,
          caption: text,
          sourceText: text,
          estimatedDurationMs: estimateBlockDurationMs("transition", text),
          autoSynced: true,
        }))
        break
      }

      default: {
        flushDialogueGroup(sceneId)
        const counter = (sceneShotCounters.get(sceneId) ?? 0) + 1
        sceneShotCounters.set(sceneId, counter)
        entries.push(createRundownEntry({
          parentBlockId: block.id,
          entryType: "action",
          order: entries.length,
          label: `Shot ${counter}`,
          caption: text,
          sourceText: text,
          estimatedDurationMs: actionDurationMs(text),
          autoSynced: true,
        }))
        break
      }
    }
  }

  // Flush remaining dialogue
  const lastSceneId = blocks.length > 0 ? blockToScene.get(blocks[blocks.length - 1].id) ?? "" : ""
  flushDialogueGroup(lastSceneId)

  return entries
}

// ─── Reconcile (preserve locked/manual entries) ──────────────

/**
 * Reconcile new entries with existing ones.
 * Preserves locked entries and manual data (visual, prompts, notes).
 * Matches by parentBlockId.
 */
export function reconcileRundownEntries(
  newEntries: RundownEntry[],
  existingEntries: RundownEntry[],
): RundownEntry[] {
  // Index existing by parentBlockId (only auto-synced, non-heading top-level entries)
  const existingByBlock = new Map<string, RundownEntry>()
  const preserved: RundownEntry[] = []

  for (const entry of existingEntries) {
    if (entry.locked || !entry.autoSynced) {
      // Keep locked and manual entries as-is
      preserved.push(entry)
    } else if (entry.parentEntryId === null) {
      // Auto-synced top-level entry — candidate for matching
      existingByBlock.set(entry.parentBlockId, entry)
    }
    // Sub-shots of locked parents are preserved with parent
  }

  // Also preserve sub-shots of locked/manual parents
  const preservedParentIds = new Set(preserved.map(e => e.id))
  for (const entry of existingEntries) {
    if (entry.parentEntryId && preservedParentIds.has(entry.parentEntryId)) {
      preserved.push(entry)
    }
  }

  // Match new entries with existing auto-synced entries
  const result: RundownEntry[] = []

  for (const newEntry of newEntries) {
    const existing = existingByBlock.get(newEntry.parentBlockId)
    if (existing) {
      // Merge: keep visual, prompts, notes from existing; update text/duration from new
      result.push({
        ...existing,
        label: newEntry.label,
        caption: newEntry.caption,
        sourceText: newEntry.sourceText,
        entryType: newEntry.entryType,
        estimatedDurationMs: newEntry.estimatedDurationMs,
        speaker: newEntry.speaker,
        isVO: newEntry.isVO,
        order: newEntry.order,
      })
      existingByBlock.delete(newEntry.parentBlockId)
    } else {
      result.push(newEntry)
    }
  }

  // Add preserved (locked/manual) entries
  result.push(...preserved)

  // Re-sort by order
  result.sort((a, b) => a.order - b.order)

  return result
}
