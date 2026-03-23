// === DIRECTOR PRESET ===
export interface DirectorPreset {
  id: string
  name: string
  description: string
  builtIn: boolean
  // Влияет на Scene Analyst + Action Splitter + Shot Planner
  dramaticDensity: "lean" | "balanced" | "dense"
  pacingStyle: "slow-burn" | "rhythmic" | "staccato"
  emotionalFocus: string
  keyframePolicy: "opening_anchor" | "story_turns" | "every_major_shift"
  actorDirection: string
  shotCountRange: [number, number]
}

// === CINEMATOGRAPHER PRESET ===
export interface CinematographerPreset {
  id: string
  name: string
  description: string
  builtIn: boolean
  // Влияет на Continuity Supervisor + Shot Relations + Prompt Composer
  defaultShotSize: string
  lensPreference: string
  lightingPhilosophy: string
  compositionRules: string[]
  colorPalette: string
  cameraMovement: string
  continuityStrictness: "flexible" | "standard" | "strict"
  textRichness: "simple" | "rich" | "lush"
  relationMode: "minimal" | "balanced" | "explicit"
}

// === PIPELINE STAGE CONFIG ===
export type PipelineStageId =
  | "sceneInput"
  | "sceneAnalyst"
  | "actionSplitter"
  | "shotPlanner"
  | "continuitySupervisor"
  | "promptComposer"
  | "imageGenerator"

export type PipelineStageStatus = "idle" | "running" | "done" | "error"

export interface StageModelConfig {
  stageId: PipelineStageId
  modelId: string
  customSystemPromptSuffix: string
}

// === PRESET APPLY MODE ===
export type PresetApplyMode = "merge" | "replace"

// === REFERENCE STRATEGY ===
export type ReferenceStrategy = "keyframe_cascade" | "previous_shot" | "none"

// === DROP VALIDATION ===
export type PresetDropType = "director" | "cinematographer" | "config"

export const VALID_DIRECTOR_DROP_TARGETS: PipelineStageId[] = [
  "sceneAnalyst",
  "actionSplitter",
  "shotPlanner",
]

export const VALID_DP_DROP_TARGETS: PipelineStageId[] = [
  "continuitySupervisor",
  "promptComposer",
  "imageGenerator",
]

// === PIPELINE CONFIG ===
export interface PipelineConfig {
  id: string
  name: string
  directorPreset: DirectorPreset
  cinematographerPreset: CinematographerPreset
  stageModels: StageModelConfig[]
  fallbackMode: "balanced" | "prefer_speed" | "fail_fast"
  stylePrompt: string
  language: "auto" | "english" | "russian"
  lockedFields: string[]
  referenceStrategy: ReferenceStrategy
}

// === PIPELINE RUN STATE ===
export interface PipelineRunState {
  status: "idle" | "running" | "done" | "error"
  currentStage: PipelineStageId | null
  failedStage: PipelineStageId | null
  stageStatuses: Record<PipelineStageId, PipelineStageStatus>
  stageResults: Record<PipelineStageId, unknown>
  error: string | null
  startedAt: number | null
  completedAt: number | null
}

// === RUN SNAPSHOT ===
export interface RunSnapshot {
  config: PipelineConfig
  sceneText: string
  startedAt: number
}

// === KEYFRAME ROLE ===
export type KeyframeRole = "key" | "secondary" | "insert"

// === SHOT EXECUTION ENTRY ===
export interface ShotExecutionEntry {
  shotId: string
  label: string
  order: number
  executionOrder: number
  keyframeRole: KeyframeRole
  referenceStrategy: ReferenceStrategy
  referenceShotIds: string[]
  promptPreview: string
}

// === IMAGE PLAN ===
export interface ImagePlan {
  referenceStrategy: ReferenceStrategy
  imageModel: string
  keyframeCandidates: string[]
  orderedShots: ShotExecutionEntry[]
}

// === NORMALIZED RUN RESULT ===
export interface NormalizedRunResult {
  sceneId: string
  analysis: unknown
  actionSplit: unknown
  shotPlan: unknown
  continuity: unknown
  promptPackages: unknown
  imagePlan: ImagePlan
  diagnostics: {
    usedFallback: boolean
    actionSplitFallback: boolean
    shotPlannerFallback: boolean
    promptComposerFallback: boolean
  }
  shotCount: number
}

// === RUN HISTORY ENTRY ===
export interface RunHistoryEntry {
  id: string
  sceneText: string
  configName: string
  directorPresetName: string
  dpPresetName: string
  completedAt: number
  shotCount: number
  summary: string
}

// === DROP FEEDBACK ===
export interface DropFeedback {
  nodeId: PipelineStageId | null
  type: "valid" | "invalid" | "pulse" | null
  timestamp: number
}
