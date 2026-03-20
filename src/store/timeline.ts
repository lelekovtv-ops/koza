import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface TimelineShot {
  id: string
  order: number
  duration: number
  type: "image" | "video"
  thumbnailUrl: string | null
  originalUrl: string | null
  thumbnailBlobKey: string | null
  originalBlobKey: string | null
  sceneId: string | null
  label: string
  notes: string
}

export interface AudioClip {
  id: string
  trackId: "voiceover" | "music" | "sfx"
  startTime: number
  duration: number
  originalUrl: string
  blobKey: string | null
  volume: number
  fadeIn: number
  fadeOut: number
}

interface TimelineState {
  shots: TimelineShot[]
  audioClips: AudioClip[]
  currentTime: number
  isPlaying: boolean
  playbackRate: number
  zoom: number
  scrollLeft: number
  selectedShotId: string | null
  selectedClipId: string | null
  addShot: (partial?: Partial<TimelineShot>) => string
  removeShot: (id: string) => void
  updateShot: (id: string, patch: Partial<TimelineShot>) => void
  reorderShot: (id: string, toIndex: number) => void
  reorderShots: (shots: TimelineShot[]) => void
  addAudioClip: (partial?: Partial<AudioClip>) => string
  removeAudioClip: (id: string) => void
  updateAudioClip: (id: string, patch: Partial<AudioClip>) => void
  moveAudioClip: (id: string, startTime: number) => void
  play: () => void
  pause: () => void
  togglePlay: () => void
  seekTo: (time: number) => void
  setPlaybackRate: (rate: number) => void
  setZoom: (zoom: number) => void
  setScrollLeft: (scrollLeft: number) => void
  selectShot: (id: string | null) => void
  selectClip: (id: string | null) => void
  scrollToShot: (id: string) => void
  activateNodeId: string | null
  activateNode: (id: string | null) => void
  clearTimeline: () => void
}

const DEFAULT_SHOT_DURATION = 3000
const DEFAULT_ZOOM = 100
const MIN_ZOOM = 20
const MAX_ZOOM = 500

const createId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const clampDuration = (value: number | undefined, fallback = DEFAULT_SHOT_DURATION) => {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback
  return Math.max(0, value)
}

const normalizeShots = (shots: TimelineShot[]) =>
  [...shots]
    .sort((left, right) => left.order - right.order)
    .map((shot, index) => ({
      ...shot,
      order: index,
      duration: clampDuration(shot.duration),
      label: shot.label.trim() || `Shot ${index + 1}`,
      notes: shot.notes ?? "",
    }))

const normalizeAudioClips = (clips: AudioClip[]) =>
  clips.map((clip) => ({
    ...clip,
    startTime: Math.max(0, clip.startTime),
    duration: clampDuration(clip.duration),
    volume: clamp(typeof clip.volume === "number" ? clip.volume : 1, 0, 1),
    fadeIn: Math.max(0, clip.fadeIn),
    fadeOut: Math.max(0, clip.fadeOut),
  }))

const getClampedCurrentTime = (shots: TimelineShot[], time: number) => {
  const totalDuration = getTotalDuration(shots)
  if (totalDuration <= 0) {
    return Math.max(0, time)
  }

  return clamp(time, 0, totalDuration)
}

export const createTimelineShot = (partial: Partial<TimelineShot> = {}): TimelineShot => ({
  id: partial.id || createId(),
  order: partial.order ?? 0,
  duration: clampDuration(partial.duration),
  type: partial.type || "image",
  thumbnailUrl: partial.thumbnailUrl ?? null,
  originalUrl: partial.originalUrl ?? null,
  thumbnailBlobKey: partial.thumbnailBlobKey ?? null,
  originalBlobKey: partial.originalBlobKey ?? null,
  sceneId: partial.sceneId ?? null,
  label: partial.label?.trim() || "Untitled Shot",
  notes: partial.notes ?? "",
})

export const createAudioClip = (partial: Partial<AudioClip> = {}): AudioClip => ({
  id: partial.id || createId(),
  trackId: partial.trackId || "voiceover",
  startTime: Math.max(0, partial.startTime ?? 0),
  duration: clampDuration(partial.duration),
  originalUrl: partial.originalUrl || "",
  blobKey: partial.blobKey ?? null,
  volume: clamp(typeof partial.volume === "number" ? partial.volume : 1, 0, 1),
  fadeIn: Math.max(0, partial.fadeIn ?? 0),
  fadeOut: Math.max(0, partial.fadeOut ?? 0),
})

export const getShotStartTime = (shots: TimelineShot[], index: number) => {
  if (index <= 0) return 0

  const normalizedShots = normalizeShots(shots)
  return normalizedShots.slice(0, index).reduce((total, shot) => total + shot.duration, 0)
}

export const getTotalDuration = (shots: TimelineShot[]) =>
  normalizeShots(shots).reduce((total, shot) => total + shot.duration, 0)

export const getShotIndexAtTime = (shots: TimelineShot[], time: number) => {
  const normalizedShots = normalizeShots(shots)
  if (normalizedShots.length === 0) return -1

  const safeTime = Math.max(0, time)
  let accumulated = 0

  for (let index = 0; index < normalizedShots.length; index += 1) {
    accumulated += normalizedShots[index].duration
    if (safeTime < accumulated) {
      return index
    }
  }

  return normalizedShots.length - 1
}

const initialState = {
  shots: [] as TimelineShot[],
  audioClips: [] as AudioClip[],
  currentTime: 0,
  isPlaying: false,
  playbackRate: 1,
  zoom: DEFAULT_ZOOM,
  scrollLeft: 0,
  selectedShotId: null as string | null,
  selectedClipId: null as string | null,
  activateNodeId: null as string | null,
}

export const useTimelineStore = create<TimelineState>()(
  persist(
    (set, get) => ({
      ...initialState,
      addShot: (partial = {}) => {
        const currentShots = get().shots
        const shot = createTimelineShot({
          ...partial,
          order: currentShots.length,
          label: partial.label?.trim() || `Shot ${currentShots.length + 1}`,
        })

        set((state) => ({
          shots: normalizeShots([...state.shots, shot]),
          selectedShotId: shot.id,
        }))

        return shot.id
      },
      removeShot: (id) => {
        set((state) => {
          const shots = normalizeShots(state.shots.filter((shot) => shot.id !== id))
          return {
            shots,
            currentTime: getClampedCurrentTime(shots, state.currentTime),
            selectedShotId: state.selectedShotId === id ? null : state.selectedShotId,
          }
        })
      },
      updateShot: (id, patch) => {
        set((state) => ({
          shots: normalizeShots(
            state.shots.map((shot) => (shot.id === id ? createTimelineShot({ ...shot, ...patch, id: shot.id }) : shot))
          ),
        }))
      },
      reorderShot: (id, toIndex) => {
        set((state) => {
          const shots = normalizeShots(state.shots)
          const fromIndex = shots.findIndex((shot) => shot.id === id)
          if (fromIndex === -1) return state

          const nextIndex = clamp(toIndex, 0, Math.max(0, shots.length - 1))
          if (fromIndex === nextIndex) return state

          const reordered = [...shots]
          const [movedShot] = reordered.splice(fromIndex, 1)
          reordered.splice(nextIndex, 0, movedShot)

          return {
            shots: normalizeShots(reordered),
          }
        })
      },
      reorderShots: (shots) => {
        set((state) => {
          const normalized = normalizeShots(shots)
          return {
            shots: normalized,
            currentTime: getClampedCurrentTime(normalized, state.currentTime),
            selectedShotId: normalized.some((shot) => shot.id === state.selectedShotId) ? state.selectedShotId : null,
          }
        })
      },
      addAudioClip: (partial = {}) => {
        const clip = createAudioClip(partial)

        set((state) => ({
          audioClips: normalizeAudioClips([...state.audioClips, clip]),
          selectedClipId: clip.id,
        }))

        return clip.id
      },
      removeAudioClip: (id) => {
        set((state) => ({
          audioClips: state.audioClips.filter((clip) => clip.id !== id),
          selectedClipId: state.selectedClipId === id ? null : state.selectedClipId,
        }))
      },
      updateAudioClip: (id, patch) => {
        set((state) => ({
          audioClips: normalizeAudioClips(
            state.audioClips.map((clip) => (clip.id === id ? createAudioClip({ ...clip, ...patch, id: clip.id }) : clip))
          ),
        }))
      },
      moveAudioClip: (id, startTime) => {
        set((state) => ({
          audioClips: normalizeAudioClips(
            state.audioClips.map((clip) => (clip.id === id ? { ...clip, startTime: Math.max(0, startTime) } : clip))
          ),
        }))
      },
      play: () => set({ isPlaying: true }),
      pause: () => set({ isPlaying: false }),
      togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
      seekTo: (time) => {
        set((state) => ({
          currentTime: getClampedCurrentTime(state.shots, Math.max(0, time)),
        }))
      },
      setPlaybackRate: (rate) => set({ playbackRate: Math.max(0.1, rate) }),
      setZoom: (zoom) => set({ zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) }),
      setScrollLeft: (scrollLeft) => set({ scrollLeft: Math.max(0, scrollLeft) }),
      selectShot: (id) => set({ selectedShotId: id, selectedClipId: id ? null : get().selectedClipId }),
      selectClip: (id) => set({ selectedClipId: id, selectedShotId: id ? null : get().selectedShotId }),
      scrollToShot: (id) => {
        if (get().shots.some((s) => s.id === id)) {
          set({ selectedShotId: id, selectedClipId: null })
        }
      },
      activateNode: (id) => set({ activateNodeId: id }),
      clearTimeline: () => set({ ...initialState }),
    }),
    {
      name: "koza-timeline",
      partialize: (state) => ({
        shots: state.shots,
        audioClips: state.audioClips,
        zoom: state.zoom,
        playbackRate: state.playbackRate,
      }),
    }
  )
)