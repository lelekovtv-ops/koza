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
  PipelineBreakdownDraft,
  PipelineDraftShot,
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
import { buildPipelineEdgeLabels } from "@/lib/pipeline/edgeLabels"
import type { ImageGenModel, ImageGenResult } from "@/lib/pipeline/imageGenerator"
import { clonePipelineConfig } from "@/lib/pipeline/configTransfer"

const MAX_UNDO_HISTORY = 20

const DEFAULT_STAGE_MODELS: StageModelConfig[] = [
  { stageId: "sceneAnalyst", modelId: "claude-sonnet-4-20250514", customSystemPromptSuffix: "" },
  { stageId: "actionSplitter", modelId: "claude-sonnet-4-20250514", customSystemPromptSuffix: "" },
  { stageId: "contextRouter", modelId: "gpt-4o", customSystemPromptSuffix: "" },
  { stageId: "creativePlanner", modelId: "claude-sonnet-4-20250514", customSystemPromptSuffix: "" },
  { stageId: "censor", modelId: "gpt-4o", customSystemPromptSuffix: "" },
  { stageId: "shotPlanner", modelId: "gpt-4o", customSystemPromptSuffix: "" },
  { stageId: "continuitySupervisor", modelId: "local", customSystemPromptSuffix: "" },
  { stageId: "promptComposer", modelId: "claude-sonnet-4-20250514", customSystemPromptSuffix: "" },
  { stageId: "promptOptimizer", modelId: "local", customSystemPromptSuffix: "" },
  { stageId: "imageGenerator", modelId: "gpt-image", customSystemPromptSuffix: "" },
]

const ALL_STAGE_IDS: PipelineStageId[] = [
  "sceneInput",
  "sceneAnalyst",
  "actionSplitter",
  "contextRouter",
  "creativePlanner",
  "censor",
  "shotPlanner",
  "continuitySupervisor",
  "promptComposer",
  "promptOptimizer",
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
  configBaseline: PipelineConfig | null
  customDirectorPresets: DirectorPreset[]
  customCinematographerPresets: CinematographerPreset[]
  savedConfigs: PipelineConfig[]
  previousConfigs: PipelineConfig[]
  dropFeedback: DropFeedback
  runState: PipelineRunState
  runSnapshot: RunSnapshot | null
  normalizedResult: NormalizedRunResult | null
  breakdownDraft: PipelineBreakdownDraft | null
  edgeLabels: Record<string, string>
  imageGenModel: ImageGenModel
  imageGenResults: Record<string, ImageGenResult>
  imageGenRunning: string | null
  runNotice: string | null
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
  updateConfigValue: (fieldId: string, value: string | [number, number]) => void
  setImageGenModel: (model: ImageGenModel) => void
  setImageGenResult: (shotId: string, result: ImageGenResult) => void
  setImageGenRunning: (shotId: string | null) => void
  clearImageGenResults: () => void

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
  importConfig: (config: PipelineConfig) => void

  // Run
  setStageStatus: (stageId: PipelineStageId, status: PipelineStageStatus) => void
  setStageResult: (stageId: PipelineStageId, result: unknown) => void
  setRunNotice: (notice: string | null) => void
  startRun: (sceneText: string) => void
  startPromptRun: () => void
  completeBreakdownPhase: (draft: PipelineBreakdownDraft) => void
  completeRun: (normalized: NormalizedRunResult) => void
  updateDraftShot: (shotId: string, patch: Partial<PipelineDraftShot>) => void
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

function revokeImageGenResults(results: Record<string, ImageGenResult>) {
  Object.values(results).forEach((result) => {
    URL.revokeObjectURL(result.imageUrl)
  })
}

export const usePipelineStore = create<PipelineState>()(
  persist(
    (set, get) => ({
      activeConfig: createDefaultConfig(),
      configBaseline: createDefaultConfig(),
      customDirectorPresets: [],
      customCinematographerPresets: [],
      savedConfigs: [],
      previousConfigs: [],
      dropFeedback: { nodeId: null, type: null, timestamp: 0 },
      runState: INITIAL_RUN_STATE,
      runSnapshot: null,
      normalizedResult: null,
      breakdownDraft: null,
      edgeLabels: {},
      imageGenModel: "gpt-image",
      imageGenResults: {},
      imageGenRunning: null,
      runNotice: null,
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
          ...(stageId === "imageGenerator" ? { imageGenModel: modelId as ImageGenModel } : {}),
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

      updateConfigValue: (fieldId, value) =>
        set((state) => {
          if (fieldId.startsWith("stage.") && fieldId.endsWith(".modelId")) {
            const stageId = fieldId.split(".")[1] as PipelineStageId
            return {
              activeConfig: {
                ...state.activeConfig,
                stageModels: state.activeConfig.stageModels.map((sm) =>
                  sm.stageId === stageId ? { ...sm, modelId: value as string } : sm,
                ),
              },
              ...(stageId === "imageGenerator" ? { imageGenModel: value as ImageGenModel } : {}),
            }
          }

          if (fieldId.startsWith("stage.") && fieldId.endsWith(".customPromptSuffix")) {
            const stageId = fieldId.split(".")[1] as PipelineStageId
            return {
              activeConfig: {
                ...state.activeConfig,
                stageModels: state.activeConfig.stageModels.map((sm) =>
                  sm.stageId === stageId ? { ...sm, customSystemPromptSuffix: value as string } : sm,
                ),
              },
            }
          }

          switch (fieldId) {
            case "director.emotionalFocus":
              return {
                activeConfig: {
                  ...state.activeConfig,
                  directorPreset: { ...state.activeConfig.directorPreset, emotionalFocus: value as string },
                },
              }
            case "director.dramaticDensity":
              return {
                activeConfig: {
                  ...state.activeConfig,
                  directorPreset: { ...state.activeConfig.directorPreset, dramaticDensity: value as PipelineConfig["directorPreset"]["dramaticDensity"] },
                },
              }
            case "director.shotCountRange":
              return {
                activeConfig: {
                  ...state.activeConfig,
                  directorPreset: { ...state.activeConfig.directorPreset, shotCountRange: value as [number, number] },
                },
              }
            case "director.keyframePolicy":
              return {
                activeConfig: {
                  ...state.activeConfig,
                  directorPreset: { ...state.activeConfig.directorPreset, keyframePolicy: value as PipelineConfig["directorPreset"]["keyframePolicy"] },
                },
              }
            case "dp.continuityStrictness":
              return {
                activeConfig: {
                  ...state.activeConfig,
                  cinematographerPreset: { ...state.activeConfig.cinematographerPreset, continuityStrictness: value as PipelineConfig["cinematographerPreset"]["continuityStrictness"] },
                },
              }
            case "dp.relationMode":
              return {
                activeConfig: {
                  ...state.activeConfig,
                  cinematographerPreset: { ...state.activeConfig.cinematographerPreset, relationMode: value as PipelineConfig["cinematographerPreset"]["relationMode"] },
                },
              }
            case "dp.textRichness":
              return {
                activeConfig: {
                  ...state.activeConfig,
                  cinematographerPreset: { ...state.activeConfig.cinematographerPreset, textRichness: value as PipelineConfig["cinematographerPreset"]["textRichness"] },
                },
              }
            case "config.stylePrompt":
              return { activeConfig: { ...state.activeConfig, stylePrompt: value as string } }
            case "config.language":
              return { activeConfig: { ...state.activeConfig, language: value as PipelineConfig["language"] } }
            case "config.referenceStrategy":
              return { activeConfig: { ...state.activeConfig, referenceStrategy: value as ReferenceStrategy } }
            case "config.fallbackMode":
              return { activeConfig: { ...state.activeConfig, fallbackMode: value as PipelineConfig["fallbackMode"] } }
            case "config.imageGenModel":
              return {
                imageGenModel: value as ImageGenModel,
                activeConfig: {
                  ...state.activeConfig,
                  stageModels: state.activeConfig.stageModels.map((sm) =>
                    sm.stageId === "imageGenerator" ? { ...sm, modelId: value as string } : sm,
                  ),
                },
              }
            default:
              return state
          }
        }),

      setImageGenModel: (model) =>
        set((state) => ({
          imageGenModel: model,
          activeConfig: {
            ...state.activeConfig,
            stageModels: state.activeConfig.stageModels.map((sm) =>
              sm.stageId === "imageGenerator" ? { ...sm, modelId: model } : sm,
            ),
          },
        })),

      setImageGenResult: (shotId, result) =>
        set((state) => {
          const previous = state.imageGenResults[shotId]
          if (previous && previous.imageUrl !== result.imageUrl) {
            URL.revokeObjectURL(previous.imageUrl)
          }

          return {
            imageGenResults: {
              ...state.imageGenResults,
              [shotId]: result,
            },
          }
        }),

      setImageGenRunning: (shotId) => set({ imageGenRunning: shotId }),

      clearImageGenResults: () => {
        revokeImageGenResults(get().imageGenResults)
        set({ imageGenResults: {}, imageGenRunning: null })
      },

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
          const currentId = state.activeConfig.id
          const currentName = name.trim() || state.activeConfig.name || "Pipeline Config"
          const existingIndex = state.savedConfigs.findIndex((c) => c.id === currentId)
          const nextConfig: PipelineConfig = clonePipelineConfig({
            ...state.activeConfig,
            id: existingIndex >= 0 || currentId !== "default" ? currentId : `config-${Date.now()}`,
            name: currentName,
          })

          const nextSavedConfigs = [...state.savedConfigs]
          const targetIndex = nextSavedConfigs.findIndex((c) => c.id === nextConfig.id)

          if (targetIndex >= 0) {
            nextSavedConfigs[targetIndex] = nextConfig
          } else {
            nextSavedConfigs.push(nextConfig)
          }

          return {
            savedConfigs: nextSavedConfigs,
            activeConfig: clonePipelineConfig(nextConfig),
            configBaseline: clonePipelineConfig(nextConfig),
          }
        }),

      loadConfig: (id) =>
        set((state) => {
          const config = state.savedConfigs.find((c) => c.id === id)
          if (!config) return state
          return {
            previousConfigs: pushUndo(state),
            activeConfig: clonePipelineConfig(config),
            configBaseline: clonePipelineConfig(config),
          }
        }),

      importConfig: (config) =>
        set((state) => ({
          previousConfigs: pushUndo(state),
          activeConfig: clonePipelineConfig(config),
          configBaseline: null,
        })),

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

      setRunNotice: (notice) => set({ runNotice: notice }),

      startRun: (sceneText) => {
        const state = get()
        const now = Date.now()
        revokeImageGenResults(state.imageGenResults)
        set({
          runSnapshot: {
            config: structuredClone(state.activeConfig),
            sceneText,
            startedAt: now,
          },
          normalizedResult: null,
          breakdownDraft: null,
          edgeLabels: {},
          imageGenResults: {},
          imageGenRunning: null,
          runNotice: null,
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

      startPromptRun: () =>
        set((state) => ({
          normalizedResult: null,
          edgeLabels: {},
          imageGenResults: {},
          imageGenRunning: null,
          runNotice: null,
          runState: {
            ...state.runState,
            status: "running",
            currentStage: "promptComposer",
            failedStage: null,
            error: null,
            completedAt: null,
            stageStatuses: {
              ...state.runState.stageStatuses,
              promptComposer: "running",
              promptOptimizer: "idle",
              imageGenerator: "idle",
            },
          },
        })),

      completeBreakdownPhase: (draft) =>
        set((state) => ({
          breakdownDraft: draft,
          normalizedResult: null,
          edgeLabels: {},
          runState: {
            ...state.runState,
            status: "done",
            currentStage: null,
            error: null,
            completedAt: Date.now(),
          },
        })),

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
          breakdownDraft: s.breakdownDraft,
          edgeLabels: buildPipelineEdgeLabels(normalized),
          runHistory: [...s.runHistory.slice(-19), entry],
          runState: {
            ...s.runState,
            status: "done",
            currentStage: null,
            completedAt: Date.now(),
          },
        }))
      },

      updateDraftShot: (shotId, patch) =>
        set((state) => {
          if (!state.breakdownDraft) {
            return state
          }

          return {
            breakdownDraft: {
              ...state.breakdownDraft,
              draftShots: state.breakdownDraft.draftShots.map((shot) => (
                shot.shotId === shotId ? { ...shot, ...patch } : shot
              )),
            },
          }
        }),

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
        {
          revokeImageGenResults(get().imageGenResults)
          set({
            runState: INITIAL_RUN_STATE,
            runSnapshot: null,
            normalizedResult: null,
            breakdownDraft: null,
            edgeLabels: {},
            imageGenResults: {},
            imageGenRunning: null,
            runNotice: null,
          })
        },
    }),
    {
      name: "koza-pipeline-v1",
      partialize: (state) => ({
        activeConfig: state.activeConfig,
        configBaseline: state.configBaseline,
        customDirectorPresets: state.customDirectorPresets,
        customCinematographerPresets: state.customCinematographerPresets,
        savedConfigs: state.savedConfigs,
        previousConfigs: state.previousConfigs,
        imageGenModel: state.imageGenModel,
        runHistory: state.runHistory,
      }),
    },
  ),
)