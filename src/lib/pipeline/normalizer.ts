import type { BreakdownDetailedResult } from "@/lib/jenkins"
import type { PipelineConfig, NormalizedRunResult, ImagePlan } from "@/types/pipeline"
import { buildShotExecutionPlan } from "./shotOrdering"

/**
 * Normalizes raw BreakdownDetailedResult into a stable UI-friendly structure.
 * This decouples UI components from the raw jenkins.ts output shape.
 */
export function normalizeRunResult(
  raw: BreakdownDetailedResult,
  config: PipelineConfig,
): NormalizedRunResult {
  const imagePlan = buildImagePlan(raw, config)

  return {
    sceneId: raw.sceneId,
    analysis: raw.analysis,
    actionSplit: raw.actionSplit,
    contextPlan: raw.contextPlan,
    creativePlan: raw.creativePlan,
    censorReport: raw.censorReport,
    shotPlan: raw.shotPlan,
    continuity: raw.continuity,
    promptPackages: raw.promptPackages,
    imagePlan,
    diagnostics: raw.diagnostics,
    shotCount: raw.shots.length,
  }
}

function buildImagePlan(
  raw: BreakdownDetailedResult,
  config: PipelineConfig,
): ImagePlan {
  const imageModel =
    config.stageModels.find((sm) => sm.stageId === "imageGenerator")?.modelId ?? "gpt-image"

  const executionPlan = buildShotExecutionPlan(raw, config)

  const keyframeCandidates = executionPlan
    .filter((e) => e.keyframeRole === "key")
    .map((e) => e.shotId)

  return {
    referenceStrategy: config.referenceStrategy,
    imageModel,
    keyframeCandidates,
    orderedShots: executionPlan,
  }
}
