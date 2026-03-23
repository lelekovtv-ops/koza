import { create } from "zustand"
import { persist } from "zustand/middleware"
import type {
  DirectorPreset,
  CinematographerPreset,
  PipelineConfig,
  PipelineRunState,
  PipelineStageId,
  PipelineStageStatus,
  StageModelConfig,
  PresetApplyMode,
  ReferenceStrategy,
  DropFeedback,
  RunSnapshot,
  NormalizedRunResult,
  RunHistoryEntry,
} from "@/types/pipeline"
import {
  DEFAULT_DIRECTOR_PRESET,
  DEFAULT_CINEMATOGRAPHER_PRESET,
} from "@/lib/pipeline/presets"
import {
  mergeDirectorPreset,
  mergeCinematographerPreset,
  mergePipelineConfig,
} from "@/lib/pipeline/presetMerge"

const MAX_UNDO_HISTORY = 20

const DEFAULT_STAGE_MODELS: StageModelConfig[] = [
  { stageId: "sceneAnalyst", modelId: "claude-sonnet-4-20250514", customSystemPromptSuffix: "" },
  { stageId: "actionSplitter", modelId: "claude-sonnet-4-20250514", customSystemPromptSuffix: "" },
  { stageId: "shotPlanner", modelId: "gpt-4o", customSystemPromptSuffix: "" },
  { stageId: "continuitySupervisor", modelId: "local", customSystemPromptSuffix: "" },
  { stageId: "promptComposer", modelId: "claude-sonnet-4-20250514", customSystemPromptSuffix: "" },
  { stageId: "imageGenerator", modelId: "gpt-image", customSystemPromptSuffix: "" },
]

const ALL_STAGE_IDS: PipelineStageId[] = [
  "sceneInput",
  "sceneAnalyst",
  "actionSplitter",
  "shotPlanner",
  "continuitySupervisor",
  "promptComposer",
  "imageGenerator",
]

function createInitialStageStatuses(): Record<PipelineStageId, PipelineStageStatus> {
  const statuses = {} as Record<PipelineStageId, PipelineStageStatus>
  for (const id of ALL_STAGE_IDS) {
    statuses[id] = "idle"
  }
  return statuses
}

const INITIAL_RUN_STATE: PipelineRunState = {
  status: "idle",
  currentStage: null,
  failedStage: null,
  stageStatuses: createInitialStageStatuses(),
  stageResults: {} as Record<PipelineStageId, unknown>,
  error: null,
  startedAt: null,
  completedAt: null,
}

function createDefaultConfig(): PipelineConfig {
  return {
    id: "default",
    name: "Default Pipeline",
    directorPreset: DEFAULT_DIRECTOR_PRESET,
    cinematographerPreset: DEFAULT_CINEMATOGRAPHER_PRESET,
    stageModels: [...DEFAULT_STAGE_MODELS],
    fallbackMode: "balanced",
    stylePrompt: "",
    language: "auto",
    lockedFields: [],
    referenceStrategy: "none",
  }
}

interface PipelineState {
  activeConfig: PipelineConfig
  customDirectorPresets: DirectorPreset[]
  customCinematographerPresets: CinematographerPreset[]
  savedConfigs: PipelineConfig[]
  previousConfigs: PipelineConfig[]
  dropFeedback: DropFeedback
  runState: PipelineRunState
  runSnapshot: RunSnapshot | null
  normalizedResult: NormalizedRunResult | null
  runHistory: RunHistoryEntry[]

  // Config
  setDirectorPreset: (preset: DirectorPreset) => void
  setCinematographerPreset: (preset: CinematographerPreset) => void
  setStageModel: (stageId: PipelineStageId, modelId: string) => void
  setStageCustomPrompt: (stageId: PipelineStageId, suffix: string) => void
  setFallbackMode: (mode: PipelineConfig["fallbackMode"]) => void
  setStylePrompt: (prompt: string) => void
  setLanguage: (lang: PipelineConfig["language"]) => void
  setReferenceStrategy: (strategy: ReferenceStrategy) => void

  // Merge presets
  applyDirectorPreset: (preset: DirectorPreset, mode?: PresetApplyMode) => void
  applyCinematographerPreset: (preset: CinematographerPreset, mode?: PresetApplyMode) => void
  applyFullConfig: (config: PipelineConfig, mode?: PresetApplyMode) => void

  // Locked fields
  toggleFieldLock: (fieldPath: string) => void
  isFieldLocked: (fieldPath: string) => boolean

  // Undo
  undo: () => void
  canUndo: () => boolean

  // Drop feedback
  setDropFeedback: (feedback: DropFeedback) => void
  clearDropFeedback: () => void

  // Presets CRUD
  saveDirectorPreset: (preset: DirectorPreset) => void
  saveCinematographerPreset: (preset: CinematographerPreset) => void
  deleteCustomPreset: (type: "director" | "cinematographer", id: string) => void
  saveConfig: (name: string) => void
  loadConfig: (id: string) => void

  // Run
  setStageStatus: (stageId: PipelineStageId, status: PipelineStageStatus) => void
  setStageResult: (stageId: PipelineStageId, result: unknown) => void
  startRun: (sceneText: string) => void
  completeRun: (normalized: NormalizedRunResult) => void
  failRun: (error: string, failedStage?: PipelineStageId) => void
  resetRun: () => void
}

function pushUndo(state: PipelineState): PipelineConfig[] {
  const history = [...state.previousConfigs, { ...state.activeConfig }]
  if (history.length > MAX_UNDO_HISTORY) {
    return history.slice(history.length - MAX_UNDO_HISTORY)
  }
  return history
}

export const usePipelineStore = create<PipelineState>()(
  persist(
    (set, get) => ({
      activeConfig: createDefaultConfig(),
      customDirectorPresets: [],
      customCinematographerPresets: [],
      savedConfigs: [],
      previousConfigs: [],
      dropFeedback: { nodeId: null, type: null, timestamp: 0 },
      runState: INITIAL_RUN_STATE,
      runSnapshot: null,
      normalizedResult: null,
      runHistory: [],

      setDirectorPreset: (preset) =>
        set((state) => ({
          activeConfig: { ...state.activeConfig, directorPreset: preset },
        })),

      setCinematographerPreset: (preset) =>
        set((state) => ({
          activeConfig: { ...state.activeConfig, cinematographerPreset: preset },
        })),

      setStageModel: (stageId, modelId) =>
        set((state) => ({
          activeConfig: {
            ...state.activeConfig,
            stageModels: state.activeConfig.stageModels.map((sm) =>
              sm.stageId === stageId ? { ...sm, modelId } : sm,
            ),
          },
        })),

      setStageCustomPrompt: (stageId, suffix) =>
        set((state) => ({
          activeConfig: {
            ...state.activeConfig,
            stageModels: state.activeConfig.stageModels.map((sm) =>
              sm.stageId === stageId ? { ...sm, customSystemPromptSuffix: suffix } : sm,
            ),
          },
        })),

      setFallbackMode: (mode) =>
        set((state) => ({
          activeConfig: { ...state.activeConfig, fallbackMode: mode },
        })),

      setStylePrompt: (prompt) =>
        set((state) => ({
          activeConfig: { ...state.activeConfig, stylePrompt: prompt },
        })),

      setLanguage: (lang) =>
        set((state) => ({
          activeConfig: { ...state.activeConfig, language: lang },
        })),

      setReferenceStrategy: (strategy) =>
        set((state) => ({
          activeConfig: { ...state.activeConfig, referenceStrategy: strategy },
        })),

      applyDirectorPreset: (preset, mode = "merge") =>
        set((state) => ({
          previousConfigs: pushUndo(state),
          activeConfig: {
            ...state.activeConfig,
            directorPreset: mergeDirectorPreset(
              state.activeConfig.directorPreset,
              preset,
              state.activeConfig.lockedFields,
              mode,
            ),
          },
        })),

      applyCinematographerPreset: (preset, mode = "merge") =>
        set((state) => ({
          previousConfigs: pushUndo(state),
          activeConfig: {
            ...state.activeConfig,
            cinematographerPreset: mergeCinematographerPreset(
              state.activeConfig.cinematographerPreset,
              preset,
              state.activeConfig.lockedFields,
              mode,
            ),
          },
        })),

      applyFullConfig: (config, mode = "merge") =>
        set((state) => ({
          previousConfigs: pushUndo(state),
          activeConfig: mergePipelineConfig(state.activeConfig, config, mode),
        })),

      toggleFieldLock: (fieldPath) =>
        set((state) => {
          const locked = state.activeConfig.lockedFields
          const isLocked = locked.includes(fieldPath)
          return {
            activeConfig: {
              ...state.activeConfig,
              lockedFields: isLocked
                ? locked.filter((f) => f !== fieldPath)
                : [...locked, fieldPath],
            },
          }
        }),

      isFieldLocked: (fieldPath) =>
        get().activeConfig.lockedFields.includes(fieldPath),

      undo: () =>
        set((state) => {
          if (state.previousConfigs.length === 0) return state
          const previous = state.previousConfigs[state.previousConfigs.length - 1]
          return {
            activeConfig: previous,
            previousConfigs: state.previousConfigs.slice(0, -1),
          }
        }),

      canUndo: () => get().previousConfigs.length > 0,

      setDropFeedback: (feedback) => set({ dropFeedback: feedback }),
      clearDropFeedback: () =>
        set({ dropFeedback: { nodeId: null, type: null, timestamp: 0 } }),

      saveDirectorPreset: (preset) =>
        set((state) => {
          const existing = state.customDirectorPresets.findIndex((p) => p.id === preset.id)
          const updated = [...state.customDirectorPresets]
          if (existing >= 0) {
            updated[existing] = preset
          } else {
            updated.push({ ...preset, builtIn: false })
          }
          return { customDirectorPresets: updated }
        }),

      saveCinematographerPreset: (preset) =>
        set((state) => {
          const existing = state.customCinematographerPresets.findIndex((p) => p.id === preset.id)
          const updated = [...state.customCinematographerPresets]
          if (existing >= 0) {
            updated[existing] = preset
          } else {
            updated.push({ ...preset, builtIn: false })
          }
          return { customCinematographerPresets: updated }
        }),

      deleteCustomPreset: (type, id) =>
        set((state) => {
          if (type === "director") {
            return {
              customDirectorPresets: state.customDirectorPresets.filter((p) => p.id !== id),
            }
          }
          return {
            customCinematographerPresets: state.customCinematographerPresets.filter((p) => p.id !== id),
          }
        }),

      saveConfig: (name) =>
        set((state) => {
          const config: PipelineConfig = {
            ...state.activeConfig,
            id: `config-${Date.now()}`,
            name,
          }
          return { savedConfigs: [...state.savedConfigs, config] }
        }),

      loadConfig: (id) =>
        set((state) => {
          const config = state.savedConfigs.find((c) => c.id === id)
          if (!config) return state
          return {
            previousConfigs: pushUndo(state),
            activeConfig: { ...config },
          }
        }),

      setStageStatus: (stageId, status) =>
        set((state) => ({
          runState: {
            ...state.runState,
            currentStage: status === "running" ? stageId : state.runState.currentStage,
            stageStatuses: {
              ...state.runState.stageStatuses,
              [stageId]: status,
            },
          },
        })),

      setStageResult: (stageId, result) =>
        set((state) => ({
          runState: {
            ...state.runState,
            stageResults: {
              ...state.runState.stageResults,
              [stageId]: result,
            },
          },
        })),

      startRun: (sceneText) => {
        const state = get()
        const now = Date.now()
        set({
          runSnapshot: {
            config: structuredClone(state.activeConfig),
            sceneText,
            startedAt: now,
          },
          normalizedResult: null,
          runState: {
            ...INITIAL_RUN_STATE,
            status: "running",
            failedStage: null,
            stageStatuses: createInitialStageStatuses(),
            stageResults: {} as Record<PipelineStageId, unknown>,
            startedAt: now,
          },
        })
      },

      completeRun: (normalized) => {
        const state = get()
        const entry: RunHistoryEntry = {
          id: `run-${Date.now()}`,
          sceneText: state.runSnapshot?.sceneText.slice(0, 200) ?? "",
          configName: state.runSnapshot?.config.name ?? "Unknown",
          directorPresetName: state.runSnapshot?.config.directorPreset.name ?? "",
          dpPresetName: state.runSnapshot?.config.cinematographerPreset.name ?? "",
          completedAt: Date.now(),
          shotCount: normalized.shotCount,
          summary: `${normalized.shotCount} shots, ${normalized.imagePlan.keyframeCandidates.length} keyframes`,
        }
        set((s) => ({
          normalizedResult: normalized,
          runHistory: [...s.runHistory.slice(-19), entry],
          runState: {
            ...s.runState,
            status: "done",
            currentStage: null,
            completedAt: Date.now(),
          },
        }))
      },

      failRun: (error, failedStage) =>
        set((state) => ({
          runState: {
            ...state.runState,
            status: "error",
            currentStage: null,
            failedStage: failedStage ?? state.runState.currentStage,
            error,
            completedAt: Date.now(),
          },
        })),

      resetRun: () =>
        set({ runState: INITIAL_RUN_STATE, runSnapshot: null, normalizedResult: null }),
    }),
    {
      name: "koza-pipeline-v1",
      partialize: (state) => ({
        activeConfig: state.activeConfig,
        customDirectorPresets: state.customDirectorPresets,
        customCinematographerPresets: state.customCinematographerPresets,
        savedConfigs: state.savedConfigs,
        previousConfigs: state.previousConfigs,
        runHistory: state.runHistory,
      }),
    },
  ),
)