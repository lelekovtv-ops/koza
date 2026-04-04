/**
 * Production Types — shared types for the unified screenplay-storyboard-timeline system.
 *
 * These types extend the Block model with production capabilities:
 * visual generation, audio/voice, modifiers, and bidirectional sync.
 *
 * Pure types file — no logic, no store imports, no side effects.
 */

import type { GenerationHistoryEntry } from "@/store/timeline"

// ─── Change Origin (for bidirectional sync loop prevention) ───

export type ChangeOrigin =
  | "screenplay"
  | "storyboard"
  | "timeline"
  | "voice"
  | "system"

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
  canvasData: unknown | null
  params: Record<string, unknown>
}

// ─── Shot Group ──────────────────────────────────────────────

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

// ──�� Sync Event (for SyncBus) ────────────────────────────────

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
  | "voice-text"
  | "voice-duration"

export interface SyncEvent {
  origin: ChangeOrigin
  type: SyncEventType
  blockId?: string
  shotGroupId?: string
  payload: Record<string, unknown>
  timestamp: number
}
