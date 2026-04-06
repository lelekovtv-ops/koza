/**
 * Production Types — shared types for the unified screenplay-storyboard-timeline system.
 *
 * These types extend the Block model with production capabilities:
 * visual generation, audio/voice, modifiers, and bidirectional sync.
 *
 * Pure types file — no logic, no store imports, no side effects.
 */

import type { GenerationHistoryEntry } from "@/store/timeline"
import type { CanvasData } from "@/lib/canvas/canvasTypes"

// ─── Change Origin (for bidirectional sync loop prevention) ───

export type ChangeOrigin =
  | "screenplay"
  | "storyboard"
  | "timeline"
  | "voice"
  | "canvas"
  | "system"
  | "remote"

// ─── Production Visual ───────────────────────────────────────

export interface ProductionVisual {
  thumbnailUrl: string | null
  thumbnailBlobKey: string | null
  originalUrl: string | null
  originalBlobKey: string | null
  imagePrompt: string
  videoPrompt: string
  shotSize: string
  cameraMotion: string
  generationHistory: GenerationHistoryEntry[]
  activeHistoryIndex: number | null
  type: "image" | "video"
}

// ─── Block Modifier ──────────────────────────────────────────

export type ModifierType =
  | "default"
  | "ai-avatar"
  | "effect"
  | "b-roll"
  | "title-card"
  | "canvas"

export interface BlockModifier {
  type: ModifierType
  templateId: string | null
  canvasData: CanvasData | null
  params: Record<string, unknown>
}

// ─── Shot (DEPRECATED — use RundownEntry from rundownTypes.ts) ────
/** @deprecated Use RundownEntry from @/lib/rundownTypes instead */

export interface Shot {
  id: string
  parentBlockId: string       // REQUIRED — always belongs to a screenplay block
  order: number               // position within parent block (0-based)
  label: string
  caption: string
  sourceText: string
  shotSize: string
  cameraMotion: string
  directorNote: string
  cameraNote: string
  imagePrompt: string
  videoPrompt: string
  visualDescription: string
  durationMs: number
  visual: ProductionVisual | null
  locked: boolean
  autoSynced: boolean
  speaker: string | null
  type: "establishing" | "action" | "dialogue" | "transition"
}

// ─── Shot Group (DEPRECATED — use Shot with parentBlockId) ───

/** @deprecated Use Shot with parentBlockId instead */
export interface ShotGroup {
  id: string
  sceneId: string
  blockIds: string[]
  primaryBlockId: string
  type: "establishing" | "action" | "dialogue" | "transition"
  startMs: number
  durationMs: number
  order: number
  visual: ProductionVisual | null
  label: string
  speaker: string | null
  locked: boolean
  autoSynced: boolean
}

// ─── SFX ─────────────────────────────────────────────────────

export interface SfxHint {
  description: string
  suggestedStartMs: number
  suggestedDurationMs: number
}

// ─── Sync Event (DEPRECATED — rundown store uses direct mutations) ────
/** @deprecated SyncBus will be removed. Use rundown store direct calls. */

export type SyncEventType =
  | "block-text"
  | "block-add"
  | "block-remove"
  | "block-type"
  | "block-production"
  | "duration-change"
  | "shot-add"
  | "shot-remove"
  | "shot-reorder"
  | "shot-child-add"
  | "shot-child-remove"
  | "shot-child-reorder"
  | "block-clear"
  | "voice-text"
  | "voice-duration"

export interface SyncEvent {
  origin: ChangeOrigin
  type: SyncEventType
  blockId?: string
  shotId?: string
  shotGroupId?: string
  payload: Record<string, unknown>
  timestamp: number
}
