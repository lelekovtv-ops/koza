/**
 * Rundown Types — the unified data model for the screenplay→timeline→storyboard system.
 *
 * RundownEntry replaces Shot (scriptStore) + TimelineShot (timelineStore).
 * It is the single source of truth for structure, timing, visuals, and voice.
 *
 * Pure types file — no logic, no store imports, no side effects.
 */

import type { ProductionVisual, BlockModifier } from "./productionTypes"
import type { GenerationHistoryEntry } from "@/store/timeline"

// ─── Entry Types ─────────────────────────────────────────────

export type RundownEntryType =
  | "establishing"
  | "action"
  | "dialogue"
  | "transition"
  | "heading"    // parent that was split into sub-shots (non-rendering)

// ─── RundownEntry ────────────────────────────────────────────

export interface RundownEntry {
  id: string
  parentBlockId: string           // link to screenplay Block (always set)
  parentEntryId: string | null    // null = top-level, string = sub-shot child
  order: number                   // position among siblings (0-based)

  // Identity
  label: string
  caption: string
  sourceText: string
  entryType: RundownEntryType

  // Duration (4-tier priority: display > manual > estimated)
  estimatedDurationMs: number     // auto-calculated from text via durationEngine
  manualDurationMs: number | null // user override
  mediaDurationMs: number | null  // actual rendered media length
  displayDurationMs: number | null // how long to SHOW (gap/black if < media)

  // Visual / Production
  visual: ProductionVisual | null
  modifier: BlockModifier | null

  // Camera
  shotSize: string
  cameraMotion: string
  directorNote: string
  cameraNote: string

  // Prompts
  imagePrompt: string
  videoPrompt: string
  visualDescription: string

  // Voice
  speaker: string | null
  voiceClipId: string | null
  isVO: boolean

  // State
  locked: boolean
  autoSynced: boolean             // true = auto-generated from screenplay

  // Generation
  generationHistory: GenerationHistoryEntry[]
  activeHistoryIndex: number | null
}

// ─── RundownPosition (computed, never stored) ────────────────

export interface RundownPosition {
  entryId: string
  parentBlockId: string
  parentEntryId: string | null
  startMs: number
  endMs: number
  durationMs: number
  track: "visual" | "voice" | "titles"
  gapMs: number                   // media shorter than display → black screen
  label: string
  caption: string
  speaker: string | null
  entryType: RundownEntryType
  thumbnailUrl: string | null
}

// ─── Factory ─────────────────────────────────────────────────

let _idCounter = 0

export function makeRundownEntryId(): string {
  return `rde_${Date.now()}_${++_idCounter}`
}

export function createRundownEntry(
  partial: Partial<RundownEntry> & Pick<RundownEntry, "parentBlockId" | "entryType">,
): RundownEntry {
  return {
    id: partial.id ?? makeRundownEntryId(),
    parentBlockId: partial.parentBlockId,
    parentEntryId: partial.parentEntryId ?? null,
    order: partial.order ?? 0,
    label: partial.label ?? "",
    caption: partial.caption ?? "",
    sourceText: partial.sourceText ?? "",
    entryType: partial.entryType,
    estimatedDurationMs: partial.estimatedDurationMs ?? 0,
    manualDurationMs: partial.manualDurationMs ?? null,
    mediaDurationMs: partial.mediaDurationMs ?? null,
    displayDurationMs: partial.displayDurationMs ?? null,
    visual: partial.visual ?? null,
    modifier: partial.modifier ?? null,
    shotSize: partial.shotSize ?? "",
    cameraMotion: partial.cameraMotion ?? "",
    directorNote: partial.directorNote ?? "",
    cameraNote: partial.cameraNote ?? "",
    imagePrompt: partial.imagePrompt ?? "",
    videoPrompt: partial.videoPrompt ?? "",
    visualDescription: partial.visualDescription ?? "",
    speaker: partial.speaker ?? null,
    voiceClipId: partial.voiceClipId ?? null,
    isVO: partial.isVO ?? false,
    locked: partial.locked ?? false,
    autoSynced: partial.autoSynced ?? true,
    generationHistory: partial.generationHistory ?? [],
    activeHistoryIndex: partial.activeHistoryIndex ?? null,
  }
}
