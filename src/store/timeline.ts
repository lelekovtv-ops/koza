import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "@/lib/safeStorage"
import type { ChangeOrigin } from "@/lib/productionTypes"

export type HistoryEntrySource = "generate" | "edit" | "crop" | "color" | "loading"

export interface GenerationHistoryEntry {
  url: string
  blobKey: string | null
  timestamp: number
  source?: HistoryEntrySource
}

export interface TimelineShot {
  id: string
  order: number
  duration: number
  type: "image" | "video"
  thumbnailUrl: string | null
  originalUrl: string | null
  thumbnailBlobKey: string | null
  originalBlobKey: string | null
  generationHistory: GenerationHistoryEntry[]
  activeHistoryIndex: number | null
  sceneId: string | null
  label: string
  notes: string
  shotSize: string
  cameraMotion: string
  caption: string
  directorNote: string
  cameraNote: string
  videoPrompt: string
  imagePrompt: string
  visualDescription: string
  svg: string
  blockRange: [string, string] | null
  locked: boolean
  autoSynced: boolean
  sourceText: string
  customReferenceUrls?: string[]
  excludedBibleIds?: string[]
  bakedPrompt?: boolean
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

type ProjectTimeline = {
  shots: TimelineShot[]
  audioClips: AudioClip[]
}

interface TimelineState {
  activeProjectId: string | null
  projectTimelines: Record<string, ProjectTimeline>
  shots: TimelineShot[]
  audioClips: AudioClip[]
  currentTime: number
  isPlaying: boolean
  playbackRate: number
  zoom: number
  scrollLeft: number
  selectedShotId: string | null
  selectedClipId: string | null
  addShot: (partial?: Partial<TimelineShot>, origin?: ChangeOrigin) => string
  removeShot: (id: string, origin?: ChangeOrigin) => void
  updateShot: (id: string, patch: Partial<TimelineShot>, origin?: ChangeOrigin) => void
  reorderShot: (id: string, toIndex: number, origin?: ChangeOrigin) => void
  reorderShots: (shots: TimelineShot[], origin?: ChangeOrigin) => void
  _lastOrigin: ChangeOrigin | undefined
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
  setActiveProject: (projectId: string | null) => void
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
      caption: shot.caption ?? "",
      directorNote: shot.directorNote ?? "",
      cameraNote: shot.cameraNote ?? "",
      videoPrompt: shot.videoPrompt ?? "",
      imagePrompt: shot.imagePrompt ?? "",
      visualDescription: shot.visualDescription ?? "",
      shotSize: shot.shotSize ?? "",
      cameraMotion: shot.cameraMotion ?? "",
      sourceText: shot.sourceText ?? "",
      customReferenceUrls: shot.customReferenceUrls ?? [],
      excludedBibleIds: shot.excludedBibleIds ?? [],
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

const createEmptyProjectTimeline = (): ProjectTimeline => ({
  shots: [],
  audioClips: [],
})

function updateCurrentProjectTimeline(
  state: TimelineState,
  patch: Partial<ProjectTimeline>
): Pick<TimelineState, "projectTimelines"> {
  if (!state.activeProjectId) {
    return { projectTimelines: state.projectTimelines }
  }

  return {
    projectTimelines: {
      ...state.projectTimelines,
      [state.activeProjectId]: {
        shots: patch.shots ?? state.shots,
        audioClips: patch.audioClips ?? state.audioClips,
      },
    },
  }
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
  generationHistory: partial.generationHistory ?? [],
  activeHistoryIndex: partial.activeHistoryIndex ?? null,
  sceneId: partial.sceneId ?? null,
  label: partial.label?.trim() || "Untitled Shot",
  notes: partial.notes ?? "",
  shotSize: partial.shotSize ?? "",
  cameraMotion: partial.cameraMotion ?? "",
  caption: partial.caption ?? "",
  directorNote: partial.directorNote ?? "",
  cameraNote: partial.cameraNote ?? "",
  videoPrompt: partial.videoPrompt ?? "",
  imagePrompt: partial.imagePrompt ?? "",
  visualDescription: partial.visualDescription ?? "",
  svg: partial.svg ?? "",
  blockRange: partial.blockRange ?? null,
  locked: partial.locked ?? false,
  autoSynced: partial.autoSynced ?? false,
  sourceText: partial.sourceText ?? "",
  customReferenceUrls: partial.customReferenceUrls ?? [],
  excludedBibleIds: partial.excludedBibleIds ?? [],
  bakedPrompt: partial.bakedPrompt ?? false,
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
  activeProjectId: null as string | null,
  projectTimelines: {} as Record<string, ProjectTimeline>,
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
      _lastOrigin: undefined as ChangeOrigin | undefined,
      addShot: (partial = {}, origin?) => {
        const currentShots = get().shots
        const shot = createTimelineShot({
          ...partial,
          order: currentShots.length,
          label: partial.label?.trim() || `Shot ${currentShots.length + 1}`,
        })

        set((state) => ({
          shots: normalizeShots([...state.shots, shot]),
          selectedShotId: shot.id,
          _lastOrigin: origin,
          ...updateCurrentProjectTimeline(state, {
            shots: normalizeShots([...state.shots, shot]),
          }),
        }))

        return shot.id
      },
      removeShot: (id, origin?) => {
        set((state) => {
          const shots = normalizeShots(state.shots.filter((shot) => shot.id !== id))
          return {
            shots,
            currentTime: getClampedCurrentTime(shots, state.currentTime),
            selectedShotId: state.selectedShotId === id ? null : state.selectedShotId,
            _lastOrigin: origin,
            ...updateCurrentProjectTimeline(state, { shots }),
          }
        })
      },
      updateShot: (id, patch, origin?) => {
        set((state) => {
          const shots = normalizeShots(
            state.shots.map((shot) => (shot.id === id ? createTimelineShot({ ...shot, ...patch, id: shot.id }) : shot))
          )

          return {
            shots,
            _lastOrigin: origin,
            ...updateCurrentProjectTimeline(state, { shots }),
          }
        })
      },
      reorderShot: (id, toIndex, origin?) => {
        set((state) => {
          const currentShots = normalizeShots(state.shots)
          const fromIndex = currentShots.findIndex((shot) => shot.id === id)
          if (fromIndex === -1) return state

          const nextIndex = clamp(toIndex, 0, Math.max(0, currentShots.length - 1))
          if (fromIndex === nextIndex) return state

          const reordered = [...currentShots]
          const [movedShot] = reordered.splice(fromIndex, 1)
          reordered.splice(nextIndex, 0, movedShot)

          const shots = normalizeShots(reordered)

          return {
            shots,
            _lastOrigin: origin,
            ...updateCurrentProjectTimeline(state, { shots }),
          }
        })
      },
      reorderShots: (shots, origin?) => {
        set((state) => {
          const normalized = normalizeShots(shots)
          return {
            shots: normalized,
            currentTime: getClampedCurrentTime(normalized, state.currentTime),
            selectedShotId: normalized.some((shot) => shot.id === state.selectedShotId) ? state.selectedShotId : null,
            _lastOrigin: origin,
            ...updateCurrentProjectTimeline(state, { shots: normalized }),
          }
        })
      },
      addAudioClip: (partial = {}) => {
        const clip = createAudioClip(partial)

        const audioClips = normalizeAudioClips([...get().audioClips, clip])

        set((state) => ({
          audioClips,
          selectedClipId: clip.id,
          ...updateCurrentProjectTimeline(state, { audioClips }),
        }))

        return clip.id
      },
      removeAudioClip: (id) => {
        set((state) => {
          const audioClips = state.audioClips.filter((clip) => clip.id !== id)
          return {
            audioClips,
            selectedClipId: state.selectedClipId === id ? null : state.selectedClipId,
            ...updateCurrentProjectTimeline(state, { audioClips }),
          }
        })
      },
      updateAudioClip: (id, patch) => {
        set((state) => {
          const audioClips = normalizeAudioClips(
            state.audioClips.map((clip) => (clip.id === id ? createAudioClip({ ...clip, ...patch, id: clip.id }) : clip))
          )

          return {
            audioClips,
            ...updateCurrentProjectTimeline(state, { audioClips }),
          }
        })
      },
      moveAudioClip: (id, startTime) => {
        set((state) => {
          const audioClips = normalizeAudioClips(
            state.audioClips.map((clip) => (clip.id === id ? { ...clip, startTime: Math.max(0, startTime) } : clip))
          )

          return {
            audioClips,
            ...updateCurrentProjectTimeline(state, { audioClips }),
          }
        })
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
      setActiveProject: (projectId) => {
        set((state) => {
          const projectTimelines = state.activeProjectId
            ? {
                ...state.projectTimelines,
                [state.activeProjectId]: {
                  shots: state.shots,
                  audioClips: state.audioClips,
                },
              }
            : state.projectTimelines

          if (!projectId) {
            return {
              activeProjectId: null,
              projectTimelines,
              shots: [],
              audioClips: [],
              currentTime: 0,
              isPlaying: false,
              selectedShotId: null,
              selectedClipId: null,
              scrollLeft: 0,
            }
          }

          const projectData = projectTimelines[projectId] || createEmptyProjectTimeline()

          return {
            activeProjectId: projectId,
            projectTimelines: projectTimelines[projectId]
              ? projectTimelines
              : {
                  ...projectTimelines,
                  [projectId]: projectData,
                },
            shots: normalizeShots(projectData.shots),
            audioClips: normalizeAudioClips(projectData.audioClips),
            currentTime: 0,
            isPlaying: false,
            selectedShotId: null,
            selectedClipId: null,
            scrollLeft: 0,
          }
        })
      },
      clearTimeline: () =>
        set((state) => ({
          ...initialState,
          activeProjectId: state.activeProjectId,
          projectTimelines: state.activeProjectId
            ? {
                ...state.projectTimelines,
                [state.activeProjectId]: createEmptyProjectTimeline(),
              }
            : state.projectTimelines,
        })),
    }),
    {
      name: "koza-timeline-v2",
      storage: safeStorage,
      partialize: (state) => ({
        shots: state.shots.map((s) => ({
          ...s,
          generationHistory: s.generationHistory.filter((e) => e.blobKey),
          activeHistoryIndex: s.activeHistoryIndex,
        })),
        audioClips: state.audioClips,
        zoom: state.zoom,
        playbackRate: state.playbackRate,
        activeProjectId: state.activeProjectId,
        projectTimelines: Object.fromEntries(
          Object.entries(state.projectTimelines).map(([k, v]) => [k, {
            ...v,
            shots: v.shots.map((s) => ({
              ...s,
              generationHistory: s.generationHistory.filter((e) => e.blobKey),
              activeHistoryIndex: s.activeHistoryIndex,
            })),
          }])
        ),
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const shotsWithBlobs = state.shots.filter((s) => s.thumbnailBlobKey || s.generationHistory.some((e) => e.blobKey))
        if (shotsWithBlobs.length === 0) return

        Promise.all(
          shotsWithBlobs.map(async (shot) => {
            try {
              const { loadBlob } = await import("@/lib/fileStorage")

              // Restore thumbnail
              let thumbUrl = shot.thumbnailUrl
              if (shot.thumbnailBlobKey) {
                const url = await loadBlob(shot.thumbnailBlobKey)
                if (url) thumbUrl = url
              }

              // Restore generation history URLs
              const restoredHistory = await Promise.all(
                shot.generationHistory.map(async (entry) => {
                  if (!entry.blobKey) return entry
                  try {
                    const url = await loadBlob(entry.blobKey)
                    return url ? { ...entry, url } : entry
                  } catch {
                    return entry
                  }
                })
              )

              useTimelineStore.setState((current) => ({
                shots: current.shots.map((s) =>
                  s.id === shot.id ? { ...s, thumbnailUrl: thumbUrl, generationHistory: restoredHistory } : s
                ),
              }))
            } catch {
              // Ignore missing blobs
            }
          })
        )
      },
    }
  )
)