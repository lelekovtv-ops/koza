/**
 * Duration Engine — single source of truth for all duration calculations.
 *
 * Replaces scattered WPM constants across sceneParser, shotSyncEngine,
 * placementEngine, and EmbeddedTrackView.
 *
 * Pure functions, no side effects, no store imports.
 */

// ─── Constants ───────────────────────────────────────────────

export const DIALOGUE_WPM = 155
export const ACTION_WPM = 120
export const HEADING_MS = 1500
export const TRANSITION_MS = 1000
export const DIALOGUE_PAUSE_MS = 300
export const MIN_BLOCK_MS = 500
export const MIN_ACTION_MS = 1500
export const MAX_ACTION_MS = 8000
export const PARENTHETICAL_MS = 500
export const CHARACTER_BEAT_MS = 200
export const MIN_SCENE_MS = 3000

// ─── Helpers ─────────────────────────────────────────────────

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

// ─── Per-Type Duration ───────────────────────────────────────

export function dialogueDurationMs(text: string): number {
  return Math.max(
    MIN_BLOCK_MS,
    Math.round((wordCount(text) / DIALOGUE_WPM) * 60_000) + DIALOGUE_PAUSE_MS,
  )
}

export function actionDurationMs(text: string): number {
  return Math.max(
    MIN_ACTION_MS,
    Math.min(MAX_ACTION_MS, Math.round((wordCount(text) / ACTION_WPM) * 60_000)),
  )
}

// ─── Block Duration (any block type) ─────────────────────────

export type DurationBlockType =
  | "scene_heading"
  | "action"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "transition"
  | "shot"

/**
 * Estimate duration for a single screenplay block based on type + text.
 * Returns milliseconds.
 */
export function estimateBlockDurationMs(type: DurationBlockType | string, text: string): number {
  const words = wordCount(text)
  if (words === 0 && type !== "scene_heading" && type !== "transition") return 0

  switch (type) {
    case "scene_heading":
      return HEADING_MS
    case "dialogue":
      return dialogueDurationMs(text)
    case "parenthetical":
      return PARENTHETICAL_MS
    case "character":
      return CHARACTER_BEAT_MS
    case "transition":
      return TRANSITION_MS
    case "action":
    case "shot":
    default:
      return actionDurationMs(text)
  }
}

// ─── Effective Duration (4-tier priority) ────────────────────

/**
 * Resolve the effective duration from the 4-tier priority:
 * displayDuration > manualDuration > estimatedDuration
 *
 * Used by RundownEntry and any component that needs to know
 * "how long does this block actually take on the timeline?"
 */
export function getEffectiveDuration(entry: {
  estimatedDurationMs: number
  manualDurationMs?: number | null
  displayDurationMs?: number | null
}): number {
  return entry.displayDurationMs ?? entry.manualDurationMs ?? entry.estimatedDurationMs
}

/**
 * Compute the gap (black screen) duration when media is shorter than display.
 * Returns 0 if no gap.
 */
export function computeGapMs(entry: {
  mediaDurationMs?: number | null
  estimatedDurationMs: number
  manualDurationMs?: number | null
  displayDurationMs?: number | null
}): number {
  const effective = getEffectiveDuration(entry)
  if (entry.mediaDurationMs == null) return 0
  return Math.max(0, effective - entry.mediaDurationMs)
}
