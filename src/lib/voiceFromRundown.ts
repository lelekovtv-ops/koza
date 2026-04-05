/**
 * Voice From Rundown — derive voice clips from RundownEntry[].
 *
 * Each dialogue entry becomes a voice clip. V.O. entries get a separate track.
 * Anchors reference RundownEntry IDs for position resolution.
 *
 * Pure functions, no side effects, no store imports.
 */

import type { RundownEntry } from "./rundownTypes"
import { getEffectiveEntries } from "./rundownHierarchy"
import { getEffectiveDuration } from "./durationEngine"

// ─── Voice Clip (derived from rundown) ───────────────────────

export interface RundownVoiceClip {
  id: string
  entryId: string           // RundownEntry ID
  parentBlockId: string     // link to screenplay block
  text: string
  speaker: string
  isVO: boolean
  track: "dialogue" | "vo"
  estimatedDurationMs: number
  startMs: number           // absolute position (computed from entry sequence)
}

// ─── Build Voice Clips ───────────────────────────────────────

/**
 * Build voice clips from rundown entries.
 * One clip per dialogue/VO entry. Position computed from sequential layout.
 */
export function buildVoiceClipsFromRundown(entries: RundownEntry[]): RundownVoiceClip[] {
  const effective = getEffectiveEntries(entries)
  const clips: RundownVoiceClip[] = []
  let cursor = 0

  for (const entry of effective) {
    const duration = getEffectiveDuration(entry)

    if (entry.entryType === "dialogue" && entry.speaker) {
      clips.push({
        id: `vc_${entry.id}`,
        entryId: entry.id,
        parentBlockId: entry.parentBlockId,
        text: entry.caption,
        speaker: entry.speaker,
        isVO: entry.isVO,
        track: entry.isVO ? "vo" : "dialogue",
        estimatedDurationMs: duration,
        startMs: cursor,
      })
    }

    cursor += duration
  }

  return clips
}

/**
 * Group voice clips by speaker (for multi-channel rendering).
 */
export function groupClipsBySpeaker(clips: RundownVoiceClip[]): Map<string, RundownVoiceClip[]> {
  const groups = new Map<string, RundownVoiceClip[]>()

  for (const clip of clips) {
    const key = clip.speaker
    const group = groups.get(key) ?? []
    group.push(clip)
    groups.set(key, group)
  }

  return groups
}

/**
 * Get all speakers from rundown entries.
 */
export function getSpeakersFromRundown(entries: RundownEntry[]): string[] {
  const speakers = new Set<string>()
  for (const entry of entries) {
    if (entry.speaker) speakers.add(entry.speaker)
  }
  return Array.from(speakers).sort()
}
