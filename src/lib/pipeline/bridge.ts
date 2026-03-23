import type { BreakdownEngineConfig } from "@/lib/cinematic/config"
import type { PipelineConfig } from "@/types/pipeline"

/**
 * Конвертирует новый PipelineConfig в старый BreakdownEngineConfig
 * чтобы существующий jenkins.ts работал без изменений.
 */
export function pipelineConfigToBreakdownConfig(config: PipelineConfig): BreakdownEngineConfig {
  return {
    shotDensity: config.directorPreset.dramaticDensity,
    continuityStrictness: config.cinematographerPreset.continuityStrictness,
    textRichness: config.cinematographerPreset.textRichness,
    relationMode: config.cinematographerPreset.relationMode,
    fallbackMode: config.fallbackMode,
    keyframePolicy: config.directorPreset.keyframePolicy,
  }
}

/**
 * Собирает стилевой промпт из всех источников.
 */
export function buildPipelineStylePrompt(config: PipelineConfig): string {
  const parts: string[] = []

  if (config.directorPreset.emotionalFocus) {
    parts.push(`Director focus: ${config.directorPreset.emotionalFocus}`)
  }

  if (config.directorPreset.actorDirection) {
    parts.push(`Actor direction: ${config.directorPreset.actorDirection}`)
  }

  parts.push(`Pacing: ${config.directorPreset.pacingStyle}`)

  if (config.cinematographerPreset.lensPreference) {
    parts.push(`Lens: ${config.cinematographerPreset.lensPreference}`)
  }

  if (config.cinematographerPreset.lightingPhilosophy) {
    parts.push(`Lighting: ${config.cinematographerPreset.lightingPhilosophy}`)
  }

  if (config.cinematographerPreset.compositionRules.length > 0) {
    parts.push(`Composition: ${config.cinematographerPreset.compositionRules.join(", ")}`)
  }

  if (config.cinematographerPreset.colorPalette) {
    parts.push(`Palette: ${config.cinematographerPreset.colorPalette}`)
  }

  if (config.cinematographerPreset.cameraMovement) {
    parts.push(`Camera: ${config.cinematographerPreset.cameraMovement}`)
  }

  if (config.stylePrompt) {
    parts.push(config.stylePrompt)
  }

  if (config.language === "russian") {
    parts.push("Keep story-facing text in Russian.")
  } else if (config.language === "english") {
    parts.push("Keep story-facing text in English.")
  }

  // Reference strategy
  if (config.referenceStrategy && config.referenceStrategy !== "none") {
    parts.push(`Reference strategy: ${config.referenceStrategy.replace(/_/g, " ")}`)
  }

  return parts.join("\n")
}

/**
 * Получает modelId для конкретной стадии из конфига.
 */
export function getStageModelId(config: PipelineConfig, stageId: string): string {
  return config.stageModels.find((sm) => sm.stageId === stageId)?.modelId ?? "gpt-4o-mini"
}
