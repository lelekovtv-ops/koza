import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "@/lib/safeStorage"
import { type DialogueLine, estimateDurationMs } from "@/store/dialogue"

// ─── Types ───────────────────────────────────────────────────

export type VoiceTrackId = "voice" | "vo" | "narration"
export type AudioSourceType = "none" | "live" | "tts" | "uploaded"
export type AnchorType = "scene-relative" | "shot-relative" | "absolute"

export interface VoiceClipAnchor {
  type: AnchorType
  sceneId?: string
  shotIndex?: number
  shotId?: string
  absoluteMs?: number
  offsetMs: number
}

export interface VoiceClip {
  id: string
  dialogueLineId: string | null
  blockId?: string | null

  // Content
  text: string
  characterId: string
  characterName: string
  emotion?: string
  lang: string

  // Position
  anchor: VoiceClipAnchor
  duration: number
  durationSource: "estimate" | "tts" | "audio"

  // Mode
  mode: "magnetic" | "free"
  track: VoiceTrackId

  // Audio
  audioSource: AudioSourceType
  audioBlobKey?: string
  waveformData?: number[]

  // Style
  speed: number
  pitch: number
  volume: number

  // Sync
  textVersion: number
  audioTextVersion?: number

  // Meta
  order: number
  locked: boolean
}

// ─── Helpers ─────────────────────────────────────────────────

const createId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export function createVoiceClip(partial: Partial<VoiceClip> = {}): VoiceClip {
  return {
    id: partial.id ?? createId(),
    dialogueLineId: partial.dialogueLineId ?? null,
    text: partial.text ?? "",
    characterId: partial.characterId ?? "",
    characterName: partial.characterName ?? "",
    emotion: partial.emotion,
    lang: partial.lang ?? "ru-RU",
    anchor: partial.anchor ?? { type: "absolute", offsetMs: 0, absoluteMs: 0 },
    duration: partial.duration ?? 2000,
    durationSource: partial.durationSource ?? "estimate",
    mode: partial.mode ?? "magnetic",
    track: partial.track ?? "voice",
    audioSource: partial.audioSource ?? "none",
    audioBlobKey: partial.audioBlobKey,
    waveformData: partial.waveformData,
    speed: partial.speed ?? 1.0,
    pitch: partial.pitch ?? 1.0,
    volume: partial.volume ?? 1.0,
    textVersion: partial.textVersion ?? 1,
    audioTextVersion: partial.audioTextVersion,
    order: partial.order ?? 0,
    locked: partial.locked ?? false,
  }
}

// ─── Resolve absolute start time from anchor ─────────────────

export interface ShotInfo {
  id: string
  sceneId: string | null
  startMs: number
  duration: number
  order: number
}

/**
 * Resolve a clip's absolute start time on the timeline.
 * Returns ms from timeline start.
 */
export function resolveClipStartMs(clip: VoiceClip, shots: ShotInfo[]): number {
  const { anchor } = clip

  if (anchor.type === "absolute") {
    return Math.max(0, anchor.absoluteMs ?? 0)
  }

  if (anchor.type === "shot-relative" && anchor.shotId) {
    const shot = shots.find((s) => s.id === anchor.shotId)
    if (shot) return shot.startMs + anchor.offsetMs
    // Shot deleted — fallback to scene-relative
  }

  if (anchor.type === "scene-relative" && anchor.sceneId != null) {
    const sceneShots = shots
      .filter((s) => s.sceneId === anchor.sceneId)
      .sort((a, b) => a.order - b.order)

    const idx = anchor.shotIndex ?? 0
    const shot = sceneShots[idx] ?? sceneShots[0]
    if (shot) return shot.startMs + anchor.offsetMs
  }

  // Fallback: shot-relative with shotId
  if (anchor.shotId) {
    const shot = shots.find((s) => s.id === anchor.shotId)
    if (shot) return shot.startMs + anchor.offsetMs
  }

  return anchor.absoluteMs ?? anchor.offsetMs ?? 0
}

/**
 * Build a resolved timeline: each clip with absolute startMs/endMs.
 */
export function resolveVoiceTimeline(
  clips: VoiceClip[],
  shots: ShotInfo[],
): { clip: VoiceClip; startMs: number; endMs: number }[] {
  return clips
    .map((clip) => {
      const startMs = resolveClipStartMs(clip, shots)
      return { clip, startMs, endMs: startMs + clip.duration }
    })
    .sort((a, b) => a.startMs - b.startMs)
}

/**
 * Get the active clip at a given time.
 */
export function getClipAtTime(
  clips: VoiceClip[],
  shots: ShotInfo[],
  timeMs: number,
  track?: VoiceTrackId,
): { clip: VoiceClip; startMs: number; endMs: number } | null {
  const resolved = resolveVoiceTimeline(
    track ? clips.filter((c) => c.track === track) : clips,
    shots,
  )
  return resolved.find((r) => timeMs >= r.startMs && timeMs < r.endMs) ?? null
}

// ─── Generate from DialogueLines ─────────────────────────────

interface ShotRef {
  id: string
  sceneId: string | null
  order: number
}

/**
 * Generate VoiceClips from DialogueLines, anchored to shots.
 * Preserves existing clips that haven't changed.
 */
export function generateVoiceClipsFromDialogue(
  lines: DialogueLine[],
  shots: ShotRef[],
  existingClips: VoiceClip[] = [],
): VoiceClip[] {
  const existingByLineId = new Map(
    existingClips.filter((c) => c.dialogueLineId).map((c) => [c.dialogueLineId!, c]),
  )

  const clips: VoiceClip[] = []

  // Keep manually-added clips (no dialogueLineId)
  for (const clip of existingClips) {
    if (!clip.dialogueLineId) clips.push(clip)
  }

  // Track accumulated offset per shot to stagger clips sequentially
  const shotAccumulatedOffset = new Map<string, number>()
  // Track which shot index we're on per scene
  const sceneShotIndex = new Map<string, number>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const existing = existingByLineId.get(line.id)

    // If clip exists and is locked or manually edited, keep it
    if (existing && (existing.locked || existing.text !== line.text)) {
      const isStale = existing.text !== line.text
      clips.push(
        isStale
          ? { ...existing, textVersion: existing.textVersion + 1 }
          : existing,
      )
      continue
    }

    // Detect track type
    const track: VoiceTrackId =
      line.type === "voiceover" ? "vo" : line.type === "narration" ? "narration" : "voice"

    // Find best shot to anchor to
    const sceneShots = line.sceneId
      ? shots.filter((s) => s.sceneId === line.sceneId).sort((a, b) => a.order - b.order)
      : []

    const sceneKey = line.sceneId ?? "__none__"
    const shotIdx = sceneShotIndex.get(sceneKey) ?? 0
    const anchorShot = sceneShots[Math.min(shotIdx, sceneShots.length - 1)] ?? shots[0]

    const duration = existing?.durationSource === "audio"
      ? existing.duration
      : estimateDurationMs(line.text, line.type)

    // Calculate offset: accumulate within the same shot
    const shotKey = anchorShot?.id ?? "__none__"
    const currentOffset = shotAccumulatedOffset.get(shotKey) ?? 200
    shotAccumulatedOffset.set(shotKey, currentOffset + duration + 150) // 150ms gap between clips

    const anchor: VoiceClipAnchor = anchorShot
      ? {
          type: "shot-relative",
          shotId: anchorShot.id,
          sceneId: line.sceneId ?? undefined,
          shotIndex: anchorShot.order,
          offsetMs: currentOffset,
        }
      : { type: "absolute", absoluteMs: 0, offsetMs: 0 }

    // Advance to next shot if accumulated offset exceeds reasonable threshold
    // (move to next shot when current one is "full")
    const accumulated = shotAccumulatedOffset.get(shotKey) ?? 0
    if (accumulated > 4000 && shotIdx < sceneShots.length - 1) {
      sceneShotIndex.set(sceneKey, shotIdx + 1)
    }

    clips.push(
      createVoiceClip({
        id: existing?.id, // reuse ID if updating
        dialogueLineId: line.id,
        text: line.text,
        characterId: line.characterId,
        characterName: line.characterName,
        emotion: line.parenthetical,
        lang: /[а-яё]/i.test(line.text) ? "ru-RU" : "en-US",
        anchor,
        duration,
        durationSource: existing?.durationSource ?? "estimate",
        mode: track === "vo" ? "free" : "magnetic",
        track,
        audioSource: existing?.audioSource ?? "none",
        audioBlobKey: existing?.audioBlobKey,
        waveformData: existing?.waveformData,
        speed: existing?.speed ?? 1.0,
        pitch: existing?.pitch ?? 1.0,
        volume: existing?.volume ?? 1.0,
        textVersion: (existing?.textVersion ?? 0) + 1,
        audioTextVersion: existing?.audioTextVersion,
        order: i,
        locked: false,
      }),
    )
  }

  return clips.sort((a, b) => a.order - b.order)
}

// ─── Migrate anchors after re-breakdown ──────────────────────

export function migrateAnchorsAfterRebreakdown(
  clips: VoiceClip[],
  oldShots: ShotRef[],
  newShots: ShotRef[],
): VoiceClip[] {
  return clips.map((clip) => {
    if (clip.anchor.type === "absolute") return clip

    const { shotId, sceneId, shotIndex } = clip.anchor

    // Try to find matching new shot
    // 1. By sceneId + shotIndex
    if (sceneId) {
      const sceneShots = newShots.filter((s) => s.sceneId === sceneId).sort((a, b) => a.order - b.order)
      const idx = shotIndex ?? 0
      const match = sceneShots[Math.min(idx, sceneShots.length - 1)]
      if (match) {
        return {
          ...clip,
          anchor: { ...clip.anchor, shotId: match.id, shotIndex: match.order },
        }
      }
    }

    // 2. Fallback: same order position
    const oldShot = oldShots.find((s) => s.id === shotId)
    if (oldShot) {
      const match = newShots[Math.min(oldShot.order, newShots.length - 1)]
      if (match) {
        return {
          ...clip,
          anchor: { ...clip.anchor, shotId: match.id, sceneId: match.sceneId ?? undefined },
        }
      }
    }

    // 3. Fallback: go free
    const resolved = clip.anchor.absoluteMs ?? clip.anchor.offsetMs ?? 0
    return {
      ...clip,
      mode: "free" as const,
      anchor: { type: "absolute" as const, absoluteMs: resolved, offsetMs: 0 },
    }
  })
}

// ─── Voice Track Channels (per-character grouping) ──────────

export interface VoiceTrackChannel {
  id: string
  characterId: string
  characterName: string
  voiceConfigId: string | null
  clipIds: string[]
}

/** Build channels from clips — groups by character. */
export function buildChannelsFromClips(clips: VoiceClip[]): VoiceTrackChannel[] {
  const map = new Map<string, VoiceTrackChannel>()

  for (const clip of clips) {
    const key = clip.characterId || clip.characterName || "__narrator__"
    if (!map.has(key)) {
      map.set(key, {
        id: `ch-${key}`,
        characterId: clip.characterId,
        characterName: clip.characterName || "Narrator",
        voiceConfigId: null,
        clipIds: [],
      })
    }
    map.get(key)!.clipIds.push(clip.id)
  }

  return Array.from(map.values())
}

// ─── Store ───────────────────────────────────────────────────

type ProjectVoiceTrack = {
  clips: VoiceClip[]
}

interface VoiceTrackState {
  activeProjectId: string | null
  projectVoiceTracks: Record<string, ProjectVoiceTrack>
  clips: VoiceClip[]
  selectedClipId: string | null

  // Actions
  setActiveProject: (projectId: string | null) => void
  setClips: (clips: VoiceClip[]) => void
  addClip: (partial?: Partial<VoiceClip>) => string
  updateClip: (id: string, patch: Partial<VoiceClip>) => void
  removeClip: (id: string) => void
  selectClip: (id: string | null) => void

  /** Split a clip at a given character position in text */
  splitClip: (id: string, charIndex: number) => void

  /** Merge two adjacent clips of the same character */
  mergeClips: (idA: string, idB: string) => void

  /** Move clip anchor (drag on timeline) */
  moveClip: (id: string, newAnchor: Partial<VoiceClipAnchor>) => void

  /** Resize clip duration (drag edge) */
  resizeClip: (id: string, newDuration: number) => void

  /** Generate clips from dialogue lines */
  generateFromDialogue: (lines: DialogueLine[], shots: ShotRef[]) => void

  /** Generate clips from placement engine data (content-aware positioning) */
  generateFromPlacement: (
    placedVoice: { dialogueBlockId: string; speaker: string; text: string; startMs: number; durationMs: number; coveringShotId: string | null; isVO: boolean }[],
    placedShots: { shotId: string; sceneId: string; startMs: number; durationMs: number }[],
    sceneId: string,
  ) => void

  /** Clear all voice clips */
  clearTrack: () => void
}

const createEmptyTrack = (): ProjectVoiceTrack => ({ clips: [] })

function updateCurrentProject(
  state: VoiceTrackState,
  patch: Partial<ProjectVoiceTrack>,
): Pick<VoiceTrackState, "projectVoiceTracks"> {
  if (!state.activeProjectId) return { projectVoiceTracks: state.projectVoiceTracks }
  return {
    projectVoiceTracks: {
      ...state.projectVoiceTracks,
      [state.activeProjectId]: {
        clips: patch.clips ?? state.clips,
      },
    },
  }
}

export const useVoiceTrackStore = create<VoiceTrackState>()(
  persist(
    (set, get) => ({
      activeProjectId: null,
      projectVoiceTracks: {},
      clips: [],
      selectedClipId: null,

      setActiveProject: (projectId) => {
        const state = get()
        const updated = state.activeProjectId
          ? { ...state.projectVoiceTracks, [state.activeProjectId]: { clips: state.clips } }
          : state.projectVoiceTracks

        const project = projectId ? (updated[projectId] ?? createEmptyTrack()) : createEmptyTrack()

        set({
          activeProjectId: projectId,
          projectVoiceTracks: updated,
          clips: project.clips,
          selectedClipId: null,
        })
      },

      setClips: (clips) =>
        set((state) => ({ clips, ...updateCurrentProject({ ...state, clips }, { clips }) })),

      addClip: (partial = {}) => {
        const clip = createVoiceClip({ ...partial, order: get().clips.length })
        set((state) => {
          const clips = [...state.clips, clip]
          return { clips, selectedClipId: clip.id, ...updateCurrentProject({ ...state, clips }, { clips }) }
        })
        return clip.id
      },

      updateClip: (id, patch) =>
        set((state) => {
          const clips = state.clips.map((c) => (c.id === id ? { ...c, ...patch } : c))
          return { clips, ...updateCurrentProject({ ...state, clips }, { clips }) }
        }),

      removeClip: (id) =>
        set((state) => {
          const clips = state.clips.filter((c) => c.id !== id)
          return {
            clips,
            selectedClipId: state.selectedClipId === id ? null : state.selectedClipId,
            ...updateCurrentProject({ ...state, clips }, { clips }),
          }
        }),

      selectClip: (id) => set({ selectedClipId: id }),

      splitClip: (id, charIndex) =>
        set((state) => {
          const clip = state.clips.find((c) => c.id === id)
          if (!clip || charIndex <= 0 || charIndex >= clip.text.length) return state

          // Find a sentence boundary near charIndex
          const text = clip.text
          let splitAt = charIndex
          // Try to find nearest sentence end (. ! ?)
          for (let d = 0; d < 20; d++) {
            if (splitAt + d < text.length && /[.!?]/.test(text[splitAt + d])) {
              splitAt = splitAt + d + 1
              break
            }
            if (splitAt - d > 0 && /[.!?]/.test(text[splitAt - d])) {
              splitAt = splitAt - d + 1
              break
            }
          }

          const textA = text.slice(0, splitAt).trim()
          const textB = text.slice(splitAt).trim()
          if (!textA || !textB) return state

          const ratio = textA.length / text.length
          const durationA = Math.round(clip.duration * ratio)
          const durationB = clip.duration - durationA

          const clipA: VoiceClip = {
            ...clip,
            text: textA,
            duration: durationA,
            durationSource: "estimate",
            audioSource: "none",
            audioBlobKey: undefined,
            waveformData: undefined,
            textVersion: clip.textVersion + 1,
          }

          const clipB: VoiceClip = {
            ...clip,
            id: createId(),
            dialogueLineId: null, // detach from original line
            text: textB,
            duration: durationB,
            durationSource: "estimate",
            audioSource: "none",
            audioBlobKey: undefined,
            waveformData: undefined,
            anchor: {
              ...clip.anchor,
              offsetMs: clip.anchor.offsetMs + durationA,
            },
            order: clip.order + 0.5, // will be normalized
            textVersion: 1,
          }

          const clips = state.clips
            .map((c) => (c.id === id ? clipA : c))
            .concat(clipB)
            .sort((a, b) => a.order - b.order)
            .map((c, i) => ({ ...c, order: i }))

          return { clips, ...updateCurrentProject({ ...state, clips }, { clips }) }
        }),

      mergeClips: (idA, idB) =>
        set((state) => {
          const clipA = state.clips.find((c) => c.id === idA)
          const clipB = state.clips.find((c) => c.id === idB)
          if (!clipA || !clipB) return state
          if (clipA.characterId !== clipB.characterId) return state

          const merged: VoiceClip = {
            ...clipA,
            text: `${clipA.text} ${clipB.text}`,
            duration: clipA.duration + clipB.duration,
            durationSource: "estimate",
            audioSource: "none",
            audioBlobKey: undefined,
            waveformData: undefined,
            textVersion: clipA.textVersion + 1,
          }

          const clips = state.clips
            .filter((c) => c.id !== idB)
            .map((c) => (c.id === idA ? merged : c))

          return { clips, ...updateCurrentProject({ ...state, clips }, { clips }) }
        }),

      moveClip: (id, newAnchor) =>
        set((state) => {
          const clips = state.clips.map((c) =>
            c.id === id ? { ...c, anchor: { ...c.anchor, ...newAnchor } } : c,
          )
          return { clips, ...updateCurrentProject({ ...state, clips }, { clips }) }
        }),

      resizeClip: (id, newDuration) =>
        set((state) => {
          const duration = Math.max(200, newDuration)
          const clips = state.clips.map((c) =>
            c.id === id ? { ...c, duration, durationSource: "estimate" as const } : c,
          )
          return { clips, ...updateCurrentProject({ ...state, clips }, { clips }) }
        }),

      generateFromDialogue: (lines, shots) =>
        set((state) => {
          const clips = generateVoiceClipsFromDialogue(lines, shots, state.clips)
          return { clips, ...updateCurrentProject({ ...state, clips }, { clips }) }
        }),

      generateFromPlacement: (placedVoice, placedShots, sceneId) =>
        set((state) => {
          // Keep clips from other scenes + locked/manual clips from this scene
          const preserved = state.clips.filter((c) =>
            c.locked || c.dialogueLineId === null ||
            !placedVoice.some((pv) => pv.dialogueBlockId === c.dialogueLineId),
          )

          const newClips: VoiceClip[] = placedVoice.map((pv, i) => {
            // Find the covering shot for anchor
            const coveringShot = placedShots.find((ps) => ps.shotId === pv.coveringShotId)

            const anchor: VoiceClipAnchor = coveringShot
              ? {
                type: "shot-relative" as AnchorType,
                shotId: coveringShot.shotId,
                sceneId,
                offsetMs: pv.startMs - coveringShot.startMs,
              }
              : {
                type: "absolute" as AnchorType,
                absoluteMs: pv.startMs,
                offsetMs: 0,
              }

            return {
              id: `vc-placement-${Date.now()}-${i}`,
              dialogueLineId: pv.dialogueBlockId,
              text: pv.text,
              characterId: pv.speaker.toLowerCase().replace(/\s+/g, "-"),
              characterName: pv.speaker,
              emotion: undefined,
              lang: /[а-яё]/i.test(pv.text) ? "ru-RU" : "en-US",
              anchor,
              duration: pv.durationMs,
              durationSource: "estimate" as const,
              mode: "magnetic" as const,
              track: pv.isVO ? "vo" as VoiceTrackId : "voice" as VoiceTrackId,
              audioSource: "none" as AudioSourceType,
              speed: 1,
              pitch: 1,
              volume: 1,
              textVersion: 1,
              order: i,
              locked: false,
            }
          })

          const clips = [...preserved, ...newClips]
          return { clips, ...updateCurrentProject({ ...state, clips }, { clips }) }
        }),

      clearTrack: () =>
        set((state) => {
          const clips: VoiceClip[] = []
          return { clips, selectedClipId: null, ...updateCurrentProject({ ...state, clips }, { clips }) }
        }),
    }),
    {
      name: "koza-voice-track-v1",
      storage: safeStorage,
      partialize: (state) => ({
        activeProjectId: state.activeProjectId,
        projectVoiceTracks: state.projectVoiceTracks,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const projectId = state.activeProjectId
        if (projectId && state.projectVoiceTracks[projectId]) {
          state.clips = state.projectVoiceTracks[projectId].clips
        }
      },
    },
  ),
)
