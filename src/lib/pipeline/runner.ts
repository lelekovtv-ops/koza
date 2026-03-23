import { breakdownSceneDetailed, type BreakdownDetailedResult } from "@/lib/jenkins"
import { pipelineConfigToBreakdownConfig, buildPipelineStylePrompt, getStageModelId } from "./bridge"
import { normalizeRunResult } from "./normalizer"
import type { PipelineConfig, PipelineStageId, NormalizedRunResult } from "@/types/pipeline"
import { usePipelineStore } from "@/store/pipeline"
import { useBibleStore } from "@/store/bible"

// Stage execution sequence
const STAGE_SEQUENCE: PipelineStageId[] = [
  "sceneAnalyst",
  "actionSplitter",
  "shotPlanner",
  "continuitySupervisor",
  "promptComposer",
  "imageGenerator",
]

// Minimum display time per stage to make progress visible (ms)
const STAGE_MIN_DISPLAY_MS = 350

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Runs the full pipeline using only the store's activeConfig as source of truth.
 *
 * Supports partial rerun via `runFromStage` — currently only full run from
 * sceneAnalyst is implemented. Foundation for future partial reruns.
 */
export async function runPipeline(
  sceneText: string,
  runFromStage: PipelineStageId = "sceneAnalyst",
): Promise<NormalizedRunResult> {
  const store = usePipelineStore.getState()
  const bible = useBibleStore.getState()

  // ── Single source of truth: always read from store ──
  const config = store.activeConfig

  // ── Create immutable snapshot ──
  store.startRun(sceneText)

  const breakdownConfig = pipelineConfigToBreakdownConfig(config)
  const stylePrompt = buildPipelineStylePrompt(config)
  const modelId = getStageModelId(config, "sceneAnalyst")

  const bibleContext = {
    characters: bible.characters.map((c) => ({
      name: c.name,
      description: c.description,
      appearancePrompt: c.appearancePrompt,
    })),
    locations: bible.locations.map((l) => ({
      name: l.name,
      description: l.description,
      appearancePrompt: l.appearancePrompt,
      intExt: l.intExt,
    })),
  }

  // ── Sequential stage status simulation ──
  // Even though breakdownSceneDetailed is a single call, we simulate
  // per-stage progress to give correct visual feedback.

  const startStageIdx = STAGE_SEQUENCE.indexOf(runFromStage)
  if (startStageIdx === -1) {
    store.failRun(`Invalid runFromStage: ${runFromStage}`, runFromStage)
    throw new Error(`Invalid runFromStage: ${runFromStage}`)
  }

  try {
    // Mark sceneInput done immediately
    store.setStageStatus("sceneInput", "done")

    // For partial rerun: mark stages before runFromStage as done
    for (let i = 0; i < startStageIdx; i++) {
      store.setStageStatus(STAGE_SEQUENCE[i], "done")
    }

    // Show first stage as running
    store.setStageStatus(runFromStage, "running")

    const stageStartTime = Date.now()

    // ── Execute the actual breakdown call ──
    const result = await breakdownSceneDetailed(sceneText, {
      modelId,
      bible: bibleContext,
      style: stylePrompt,
      config: breakdownConfig,
    })

    // ── Simulate sequential stage completion ──
    await simulateStageProgress(result, startStageIdx, stageStartTime, config)

    // ── Normalize results ──
    const normalized = normalizeRunResult(result, config)

    // ── Store imageGenerator planning data ──
    store.setStageResult("imageGenerator", {
      imageModel: config.stageModels.find((sm) => sm.stageId === "imageGenerator")?.modelId ?? "gpt-image",
      referenceStrategy: config.referenceStrategy,
      keyframeCandidates: normalized.imagePlan.keyframeCandidates,
      orderedShotCount: normalized.imagePlan.orderedShots.length,
      status: "planned",
    })

    // ── Complete run with normalized result ──
    store.completeRun(normalized)

    return normalized
  } catch (error) {
    const currentStage = usePipelineStore.getState().runState.currentStage
    store.failRun(
      error instanceof Error ? error.message : String(error),
      currentStage ?? runFromStage,
    )
    throw error
  }
}

/**
 * Simulates sequential stage progression after the single breakdownSceneDetailed
 * call completes. Each stage gets a minimum display time so the UI shows
 * meaningful progress rather than jumping from idle to done.
 */
async function simulateStageProgress(
  result: BreakdownDetailedResult,
  startStageIdx: number,
  stageStartTime: number,
  config: PipelineConfig,
): Promise<void> {
  const store = usePipelineStore.getState

  // Map stages to their result data
  const stageResults: Record<string, { input: unknown; output: unknown }> = {
    sceneAnalyst: {
      input: { sceneText: "(from snapshot)" },
      output: result.analysis,
    },
    actionSplitter: {
      input: result.analysis,
      output: result.actionSplit,
    },
    shotPlanner: {
      input: result.actionSplit,
      output: result.shotPlan,
    },
    continuitySupervisor: {
      input: result.shotPlan,
      output: result.continuity,
    },
    promptComposer: {
      input: { shots: result.continuity, shotPlan: result.shotPlan },
      output: result.promptPackages,
    },
  }

  for (let i = startStageIdx; i < STAGE_SEQUENCE.length; i++) {
    const stageId = STAGE_SEQUENCE[i]

    // sceneAnalyst was already set to running before the call
    if (i > startStageIdx) {
      store().setStageStatus(stageId, "running")
    }

    // Ensure minimum display time for visual feedback
    const elapsed = Date.now() - stageStartTime
    const minWait = STAGE_MIN_DISPLAY_MS * (i - startStageIdx + 1)
    if (elapsed < minWait) {
      await delay(minWait - elapsed)
    }

    // imageGenerator is a planning stage — mark done but don't store raw result here
    if (stageId === "imageGenerator") {
      store().setStageStatus(stageId, "done")
      continue
    }

    // Store stage result with input/output for inspector
    const stageData = stageResults[stageId]
    if (stageData) {
      store().setStageResult(stageId, stageData)
    }

    store().setStageStatus(stageId, "done")
  }
}
