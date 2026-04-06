/**
 * Rundown Hierarchy — pure functions for sub-shot tree operations.
 *
 * Handles parent→child relationships, timeline flattening,
 * and duration recalculation for the RundownEntry tree.
 *
 * Pure functions, no side effects, no store imports.
 */

import type { RundownEntry, RundownPosition } from "./rundownTypes"
import { getEffectiveDuration, computeGapMs } from "./durationEngine"

// ─── Tree Queries ────────────────────────────────────────────

/** Get children of an entry */
export function getChildren(entries: RundownEntry[], parentEntryId: string): RundownEntry[] {
  return entries
    .filter((e) => e.parentEntryId === parentEntryId)
    .sort((a, b) => a.order - b.order)
}

/** Get top-level entries (no parent) */
export function getTopLevel(entries: RundownEntry[]): RundownEntry[] {
  return entries
    .filter((e) => e.parentEntryId === null)
    .sort((a, b) => a.order - b.order)
}

/** Check if an entry has children */
export function hasChildren(entries: RundownEntry[], entryId: string): boolean {
  return entries.some((e) => e.parentEntryId === entryId)
}

/** Get ancestor chain (from entry up to root) */
export function getAncestorChain(entries: RundownEntry[], entryId: string): RundownEntry[] {
  const chain: RundownEntry[] = []
  const map = new Map(entries.map((e) => [e.id, e]))
  let current = map.get(entryId)

  while (current) {
    chain.push(current)
    current = current.parentEntryId ? map.get(current.parentEntryId) : undefined
  }

  return chain
}

// ─── Effective (Leaf) Entries ─────────────────────────────────

/**
 * Get entries that actually render on the timeline.
 * - If an entry is a "heading" (has children), skip it — use children instead.
 * - If an entry is a leaf (no children or not a heading), include it.
 *
 * Returns a flat list sorted by screenplay order.
 */
export function getEffectiveEntries(entries: RundownEntry[]): RundownEntry[] {
  const headingIds = new Set(
    entries.filter((e) => e.entryType === "heading").map((e) => e.id),
  )

  const result: RundownEntry[] = []

  // Process top-level entries in order
  const topLevel = getTopLevel(entries)

  for (const entry of topLevel) {
    if (headingIds.has(entry.id)) {
      // This is a heading — add its children instead
      const children = getChildren(entries, entry.id)
      result.push(...children)
    } else {
      result.push(entry)
    }
  }

  return result
}

// ─── Duration Recalculation ──────────────────────────────────

/**
 * Recalculate heading durations as sum of children.
 * Returns a new entries array with updated heading durations.
 */
export function recalculateParentDurations(entries: RundownEntry[]): RundownEntry[] {
  const headingIds = new Set(
    entries.filter((e) => e.entryType === "heading").map((e) => e.id),
  )

  if (headingIds.size === 0) return entries

  // Calculate sum of children durations for each heading
  const headingDurations = new Map<string, number>()

  for (const entry of entries) {
    if (entry.parentEntryId && headingIds.has(entry.parentEntryId)) {
      const current = headingDurations.get(entry.parentEntryId) ?? 0
      headingDurations.set(entry.parentEntryId, current + getEffectiveDuration(entry))
    }
  }

  return entries.map((e) => {
    if (headingIds.has(e.id) && headingDurations.has(e.id)) {
      return { ...e, estimatedDurationMs: headingDurations.get(e.id)! }
    }
    return e
  })
}

// ─── Timeline Flattening ─────────────────────────────────────

/**
 * Flatten the rundown tree into timeline positions with absolute startMs.
 * Only leaf entries get positions (headings are skipped).
 *
 * Returns RundownPosition[] sorted by time, one per track per entry.
 */
export function flattenForTimeline(entries: RundownEntry[]): RundownPosition[] {
  const effective = getEffectiveEntries(entries)
  const positions: RundownPosition[] = []
  let cursor = 0

  for (const entry of effective) {
    const duration = getEffectiveDuration(entry)
    const gapMs = computeGapMs(entry)

    // Visual track (always)
    positions.push({
      entryId: entry.id,
      parentBlockId: entry.parentBlockId,
      parentEntryId: entry.parentEntryId,
      startMs: cursor,
      endMs: cursor + duration,
      durationMs: duration,
      track: "visual",
      gapMs,
      label: entry.label,
      caption: entry.caption,
      speaker: entry.speaker,
      entryType: entry.entryType,
      thumbnailUrl: entry.visual?.thumbnailUrl ?? null,
    })

    // Voice track (dialogue and VO entries)
    if (entry.entryType === "dialogue" && entry.speaker) {
      positions.push({
        entryId: entry.id,
        parentBlockId: entry.parentBlockId,
        parentEntryId: entry.parentEntryId,
        startMs: cursor,
        endMs: cursor + duration,
        durationMs: duration,
        track: entry.isVO ? "voice" : "voice",
        gapMs: 0,
        label: entry.speaker,
        caption: entry.caption,
        speaker: entry.speaker,
        entryType: entry.entryType,
        thumbnailUrl: null,
      })

      // Titles track (subtitles for dialogue)
      positions.push({
        entryId: entry.id,
        parentBlockId: entry.parentBlockId,
        parentEntryId: entry.parentEntryId,
        startMs: cursor,
        endMs: cursor + duration,
        durationMs: duration,
        track: "titles",
        gapMs: 0,
        label: entry.speaker,
        caption: `${entry.speaker}: ${entry.caption}`,
        speaker: entry.speaker,
        entryType: entry.entryType,
        thumbnailUrl: null,
      })
    }

    cursor += duration
  }

  return positions
}

/**
 * Get total duration of the rundown (sum of all effective entries).
 */
export function getTotalDuration(entries: RundownEntry[]): number {
  const effective = getEffectiveEntries(entries)
  return effective.reduce((sum, e) => sum + getEffectiveDuration(e), 0)
}

/**
 * Find which entry is active at a given time position.
 */
export function getEntryAtTime(entries: RundownEntry[], timeMs: number): RundownEntry | null {
  const effective = getEffectiveEntries(entries)
  let cursor = 0

  for (const entry of effective) {
    const duration = getEffectiveDuration(entry)
    if (timeMs >= cursor && timeMs < cursor + duration) {
      return entry
    }
    cursor += duration
  }

  return null
}
