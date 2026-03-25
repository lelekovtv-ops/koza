import type { ImageGenModel } from "@/lib/pipeline/imageGenerator"
import type { PipelineConfig, PipelineStageId } from "@/types/pipeline"

export interface SystemCapabilities {
  anthropicConfigured: boolean
  openaiConfigured: boolean
  googleConfigured: boolean
}

export interface ConfiguratorOption {
  value: string
  label: string
}

export interface ConfiguratorField {
  id: string
  label: string
  kind: "select" | "toggle" | "textarea" | "range"
  description?: string
  placeholder?: string
  rows?: number
  min?: number
  max?: number
  options?: ConfiguratorOption[]
}

export interface ConfiguratorSection {
  id: string
  title: string
  description?: string
  fields: ConfiguratorField[]
}

export interface ConfigValidationIssue {
  id: string
  severity: "error" | "warning"
  title: string
  description: string
  stageIds: PipelineStageId[]
}

const TEXT_MODEL_OPTIONS: ConfiguratorOption[] = [
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
]

const IMAGE_MODEL_OPTIONS: ConfiguratorOption[] = [
  { value: "gpt-image", label: "GPT Image" },
  { value: "nano-banana", label: "Gemini Flash" },
  { value: "nano-banana-2", label: "Gemini Flash Preview" },
  { value: "nano-banana-pro", label: "Gemini Pro" },
]

const FALLBACK_MODE_OPTIONS: ConfiguratorOption[] = [
  { value: "balanced", label: "Balanced" },
  { value: "prefer_speed", label: "Speed" },
  { value: "fail_fast", label: "Fail Fast" },
]

const LANGUAGE_OPTIONS: ConfiguratorOption[] = [
  { value: "auto", label: "Auto" },
  { value: "english", label: "EN" },
  { value: "russian", label: "RU" },
]

const KEYFRAME_POLICY_OPTIONS: ConfiguratorOption[] = [
  { value: "opening_anchor", label: "Anchor" },
  { value: "story_turns", label: "Turns" },
  { value: "every_major_shift", label: "Every Shift" },
]

const DENSITY_OPTIONS: ConfiguratorOption[] = [
  { value: "lean", label: "Lean" },
  { value: "balanced", label: "Balanced" },
  { value: "dense", label: "Dense" },
]

const CONTINUITY_OPTIONS: ConfiguratorOption[] = [
  { value: "flexible", label: "Flexible" },
  { value: "standard", label: "Standard" },
  { value: "strict", label: "Strict" },
]

const RELATION_OPTIONS: ConfiguratorOption[] = [
  { value: "minimal", label: "Minimal" },
  { value: "balanced", label: "Balanced" },
  { value: "explicit", label: "Explicit" },
]

const TEXT_RICHNESS_OPTIONS: ConfiguratorOption[] = [
  { value: "simple", label: "Simple" },
  { value: "rich", label: "Rich" },
  { value: "lush", label: "Lush" },
]

const REFERENCE_STRATEGY_OPTIONS: ConfiguratorOption[] = [
  { value: "none", label: "None" },
  { value: "previous_shot", label: "Previous" },
  { value: "keyframe_cascade", label: "Cascade" },
]

export function getStageConfiguratorSections(stageId: PipelineStageId): ConfiguratorSection[] {
  const sections: ConfiguratorSection[] = []

  if (["sceneAnalyst", "actionSplitter", "contextRouter", "creativePlanner", "censor", "shotPlanner", "promptComposer"].includes(stageId)) {
    sections.push({
      id: "ai-core",
      title: "AI Core",
      description: "Model and prompt controls for this stage.",
      fields: [
        {
          id: `stage.${stageId}.modelId`,
          label: "AI Модель",
          kind: "select",
          options: TEXT_MODEL_OPTIONS,
        },
        {
          id: `stage.${stageId}.customPromptSuffix`,
          label: "Суффикс системного промпта",
          kind: "textarea",
          rows: 4,
          placeholder: "Дополнительные инструкции для этого этапа...",
        },
      ],
    })
  }

  if (stageId === "sceneAnalyst") {
    sections.push({
      id: "dramaturgy",
      title: "Dramaturgy",
      fields: [
        {
          id: "director.emotionalFocus",
          label: "Эмоциональный фокус",
          kind: "textarea",
          rows: 3,
        },
      ],
    })
  }

  if (stageId === "actionSplitter") {
    sections.push({
      id: "split-logic",
      title: "Split Logic",
      fields: [
        {
          id: "director.dramaticDensity",
          label: "Драматическая плотность",
          kind: "toggle",
          options: DENSITY_OPTIONS,
        },
      ],
    })
  }

  if (stageId === "shotPlanner") {
    sections.push({
      id: "shot-structure",
      title: "Shot Structure",
      fields: [
        {
          id: "director.shotCountRange",
          label: "Диапазон кадров",
          kind: "range",
          min: 1,
          max: 30,
        },
        {
          id: "director.keyframePolicy",
          label: "Политика ключевых кадров",
          kind: "toggle",
          options: KEYFRAME_POLICY_OPTIONS,
        },
      ],
    })
  }

  if (stageId === "continuitySupervisor") {
    sections.push({
      id: "continuity",
      title: "Continuity Rules",
      fields: [
        {
          id: "dp.continuityStrictness",
          label: "Строгость непрерывности",
          kind: "toggle",
          options: CONTINUITY_OPTIONS,
        },
        {
          id: "dp.relationMode",
          label: "Режим связей",
          kind: "toggle",
          options: RELATION_OPTIONS,
        },
      ],
    })
  }

  if (stageId === "promptComposer") {
    sections.push({
      id: "prompt-system",
      title: "Prompt System",
      fields: [
        {
          id: "dp.textRichness",
          label: "Текстовое богатство",
          kind: "toggle",
          options: TEXT_RICHNESS_OPTIONS,
        },
        {
          id: "config.stylePrompt",
          label: "Стилистический промпт",
          kind: "textarea",
          rows: 4,
          placeholder: "Инструкции по стилю...",
        },
        {
          id: "config.language",
          label: "Язык",
          kind: "toggle",
          options: LANGUAGE_OPTIONS,
        },
      ],
    })
  }

  if (stageId === "imageGenerator") {
    sections.push({
      id: "image-runtime",
      title: "Image Runtime",
      fields: [
        {
          id: "config.imageGenModel",
          label: "Модель изображений",
          kind: "select",
          options: IMAGE_MODEL_OPTIONS,
        },
        {
          id: "config.referenceStrategy",
          label: "Стратегия референсов",
          kind: "toggle",
          options: REFERENCE_STRATEGY_OPTIONS,
        },
      ],
    })
  }

  if (stageId !== "sceneInput" && stageId !== "imageGenerator") {
    sections.push({
      id: "runtime-policy",
      title: "Runtime Policy",
      fields: [
        {
          id: "config.fallbackMode",
          label: "Режим отката",
          kind: "toggle",
          options: FALLBACK_MODE_OPTIONS,
        },
      ],
    })
  }

  return sections
}

function getStageModel(config: PipelineConfig, stageId: PipelineStageId) {
  return config.stageModels.find((entry) => entry.stageId === stageId)
}

export function getConfiguratorValue(
  config: PipelineConfig,
  imageGenModel: ImageGenModel,
  fieldId: string,
): string | [number, number] {
  if (fieldId.startsWith("stage.") && fieldId.endsWith(".modelId")) {
    const stageId = fieldId.split(".")[1] as PipelineStageId
    return getStageModel(config, stageId)?.modelId ?? ""
  }

  if (fieldId.startsWith("stage.") && fieldId.endsWith(".customPromptSuffix")) {
    const stageId = fieldId.split(".")[1] as PipelineStageId
    return getStageModel(config, stageId)?.customSystemPromptSuffix ?? ""
  }

  switch (fieldId) {
    case "director.emotionalFocus":
      return config.directorPreset.emotionalFocus
    case "director.dramaticDensity":
      return config.directorPreset.dramaticDensity
    case "director.shotCountRange":
      return config.directorPreset.shotCountRange
    case "director.keyframePolicy":
      return config.directorPreset.keyframePolicy
    case "dp.continuityStrictness":
      return config.cinematographerPreset.continuityStrictness
    case "dp.relationMode":
      return config.cinematographerPreset.relationMode
    case "dp.textRichness":
      return config.cinematographerPreset.textRichness
    case "config.stylePrompt":
      return config.stylePrompt
    case "config.language":
      return config.language
    case "config.referenceStrategy":
      return config.referenceStrategy
    case "config.fallbackMode":
      return config.fallbackMode
    case "config.imageGenModel":
      return imageGenModel
    default:
      return ""
  }
}

function providerForTextModel(modelId: string): "anthropic" | "openai" | "google" | "local" | "unknown" {
  if (modelId.startsWith("claude")) return "anthropic"
  if (modelId.startsWith("gpt")) return "openai"
  if (modelId.startsWith("gemini")) return "google"
  if (modelId === "local") return "local"
  return "unknown"
}

function providerForImageModel(modelId: ImageGenModel): "openai" | "google" {
  return modelId === "gpt-image" ? "openai" : "google"
}

export function validatePipelineConfig(
  config: PipelineConfig,
  imageGenModel: ImageGenModel,
  capabilities: SystemCapabilities | null,
): ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = []

  if (config.directorPreset.shotCountRange[0] > config.directorPreset.shotCountRange[1]) {
    issues.push({
      id: "shot-range-order",
      severity: "error",
      title: "Некорректный диапазон кадров",
      description: "Минимальное число кадров не может быть больше максимального.",
      stageIds: ["shotPlanner"],
    })
  }

  if (!config.stylePrompt.trim()) {
    issues.push({
      id: "style-prompt-empty",
      severity: "warning",
      title: "Пустой style prompt",
      description: "Prompt Composer работает лучше, когда у проекта задан явный визуальный стиль.",
      stageIds: ["promptComposer", "imageGenerator"],
    })
  }

  if (!capabilities) {
    return issues
  }

  for (const stageModel of config.stageModels) {
    if (stageModel.stageId === "imageGenerator" || stageModel.modelId === "local") {
      continue
    }

    const provider = providerForTextModel(stageModel.modelId)
    const missingKey =
      (provider === "anthropic" && !capabilities.anthropicConfigured)
      || (provider === "openai" && !capabilities.openaiConfigured)
      || (provider === "google" && !capabilities.googleConfigured)

    if (missingKey) {
      issues.push({
        id: `provider-${stageModel.stageId}`,
        severity: provider === "anthropic" ? "warning" : "error",
        title: `Нет ключа для модели ${stageModel.modelId}`,
        description: provider === "anthropic"
          ? "Claude можно автоматически откатить на GPT-4o, но текущая конфигурация всё равно неполная."
          : "Выбранная модель не сможет выполниться без корректно настроенного provider key.",
        stageIds: [stageModel.stageId],
      })
    }
  }

  const imageProvider = providerForImageModel(imageGenModel)
  const imageProviderMissing =
    (imageProvider === "openai" && !capabilities.openaiConfigured)
    || (imageProvider === "google" && !capabilities.googleConfigured)

  if (imageProviderMissing) {
    issues.push({
      id: "image-provider-missing",
      severity: "error",
      title: "Image generation не сможет стартовать",
      description: imageProvider === "openai"
        ? "Для GPT Image нужен корректный OPENAI_API_KEY."
        : "Для Gemini image models нужен корректный GOOGLE_API_KEY.",
      stageIds: ["imageGenerator"],
    })
  }

  return issues
}