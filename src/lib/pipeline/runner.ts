import type { ScreenplaySceneContext } from "@/lib/cinematic/contextRouter"
import { parseScenes, type Scene } from "@/lib/sceneParser"
import { parseTextToBlocks } from "@/lib/screenplayFormat"
import { pipelineConfigToBreakdownConfig, buildPipelineStylePrompt, getStageModelId } from "./bridge"
import { normalizeRunResult } from "./normalizer"
import type { PipelineConfig, PipelineStageId, NormalizedRunResult } from "@/types/pipeline"
import { usePipelineStore } from "@/store/pipeline"
import { useBibleStore } from "@/store/bible"
import { useScenesStore } from "@/store/scenes"
import { applyDraftToShotSpecs, buildPromptComposerEditorialNotes, createPipelineBreakdownDraft } from "@/lib/pipeline/breakdownDraft"
import { buildPromptOptimizationPreview, extractPipelinePromptEntries } from "@/lib/pipeline/imageGenerator"
import { enrichPropsFromBreakdown } from "@/lib/pipeline/propEnricher"

const CLAUDE_KEY_MISSING_MESSAGE = "ANTHROPIC_API_KEY is missing"

async function loadJenkinsModule() {
  return import("@/lib/jenkins")
}

async function loadContinuitySupervisorModule() {
  return import("@/lib/cinematic/continuitySupervisor")
}

function buildClaudeFallbackConfig(config: PipelineConfig): PipelineConfig {
  return {
    ...config,
    stageModels: config.stageModels.map((stageModel) => (
      stageModel.stageId === "imageGenerator" || stageModel.modelId === "local"
        ? stageModel
        : { ...stageModel, modelId: "gpt-4o" }
    )),
  }
}

async function executePipelineBreakdown(
  sceneText: string,
  config: PipelineConfig,
  bibleContext: {
    characters: Array<{ name: string; description: string; appearancePrompt: string }>
    locations: Array<{ name: string; description: string; appearancePrompt: string; intExt: string }>
  },
  screenplayContext: {
    previousScene: ScreenplaySceneContext | null
    currentScene: ScreenplaySceneContext | null
    nextScene: ScreenplaySceneContext | null
  },
) {
  const { breakdownSceneDetailed } = await loadJenkinsModule()
  const breakdownConfig = pipelineConfigToBreakdownConfig(config)
  const stylePrompt = buildPipelineStylePrompt(config)
  const modelId = getStageModelId(config, "sceneAnalyst")

  return breakdownSceneDetailed(sceneText, {
    modelId,
    bible: bibleContext,
    style: stylePrompt,
    config: breakdownConfig,
    screenplayContext,
  })
}

async function executePipelinePlanning(
  sceneText: string,
  config: PipelineConfig,
  bibleContext: {
    characters: Array<{ name: string; description: string; appearancePrompt: string }>
    locations: Array<{ name: string; description: string; appearancePrompt: string; intExt: string }>
  },
  screenplayContext: {
    previousScene: ScreenplaySceneContext | null
    currentScene: ScreenplaySceneContext | null
    nextScene: ScreenplaySceneContext | null
  },
) {
  const { breakdownScenePlanningDetailed } = await loadJenkinsModule()
  const breakdownConfig = pipelineConfigToBreakdownConfig(config)
  const stylePrompt = buildPipelineStylePrompt(config)
  const modelId = getStageModelId(config, "sceneAnalyst")

  return breakdownScenePlanningDetailed(sceneText, {
    modelId,
    bible: bibleContext,
    style: stylePrompt,
    config: breakdownConfig,
    screenplayContext,
  })
}

function toScreenplaySceneContext(scene: Scene | null | undefined): ScreenplaySceneContext | null {
  if (!scene) {
    return null
  }

  return {
    id: scene.id,
    title: scene.title,
    index: scene.index,
  }
}

function buildSyntheticScreenplayContext(sceneText: string) {
  const scenes = parseScenes(parseTextToBlocks(sceneText.trim()))
  const currentScene = scenes[0] ?? null

  return {
    previousScene: null,
    currentScene: toScreenplaySceneContext(currentScene),
    nextScene: toScreenplaySceneContext(scenes[1] ?? null),
  }
}

function resolveScreenplayContext(sceneText: string) {
  const { scenes, selectedSceneId } = useScenesStore.getState()

  if (!scenes.length) {
    return buildSyntheticScreenplayContext(sceneText)
  }

  const currentIndex = selectedSceneId
    ? scenes.findIndex((scene) => scene.id === selectedSceneId)
    : 0
  const safeIndex = currentIndex >= 0 ? currentIndex : 0

  return {
    previousScene: toScreenplaySceneContext(scenes[safeIndex - 1] ?? null),
    currentScene: toScreenplaySceneContext(scenes[safeIndex] ?? null),
    nextScene: toScreenplaySceneContext(scenes[safeIndex + 1] ?? null),
  }
}

// Stage execution sequence
const STAGE_SEQUENCE: PipelineStageId[] = [
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
  await runPipelineBreakdown(sceneText, runFromStage)
  return composePipelinePrompts()
}

export async function runPipelineBreakdown(
  sceneText: string,
  runFromStage: PipelineStageId = "sceneAnalyst",
): Promise<void> {
  const store = usePipelineStore.getState()
  const bible = useBibleStore.getState()

  // ── Single source of truth: always read from store ──
  const config = store.activeConfig

  // ── Create immutable snapshot ──
  store.startRun(sceneText)

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
  const screenplayContext = resolveScreenplayContext(sceneText)

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
    let effectiveConfig = config
    let result: Awaited<ReturnType<typeof executePipelinePlanning>>

    try {
      result = await executePipelinePlanning(sceneText, effectiveConfig, bibleContext, screenplayContext)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (!message.includes(CLAUDE_KEY_MISSING_MESSAGE)) {
        throw error
      }

      effectiveConfig = buildClaudeFallbackConfig(config)
      store.setRunNotice("Claude API key не настроен. Pipeline автоматически переключился на GPT-4o.")
      result = await executePipelinePlanning(sceneText, effectiveConfig, bibleContext, screenplayContext)
    }

    // ── Simulate sequential stage completion ──
    await simulatePlanningStageProgress(result, startStageIdx, stageStartTime)
    const draft = createPipelineBreakdownDraft(result, sceneText)
    store.completeBreakdownPhase(draft)

    // Fire-and-forget: enrich Bible props with appearancePrompts from breakdown
    enrichPropsFromBreakdown(result.analysis, sceneText, draft.sceneId).catch((err) =>
      console.warn("[propEnricher] non-critical:", err),
    )
  } catch (error) {
    const currentStage = usePipelineStore.getState().runState.currentStage
    store.failRun(
      error instanceof Error ? error.message : String(error),
      currentStage ?? runFromStage,
    )
    throw error
  }
}

export async function composePipelinePrompts(): Promise<NormalizedRunResult> {
  const { buildJenkinsShotsFromPromptPackages, composePromptPackagesDetailed } = await loadJenkinsModule()
  const { superviseShotContinuity } = await loadContinuitySupervisorModule()
  const store = usePipelineStore.getState()
  const bible = useBibleStore.getState()
  const draft = store.breakdownDraft

  if (!draft) {
    throw new Error("Breakdown draft is missing. Run phase 1 first.")
  }

  const config = store.activeConfig
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

  const editedShotPlan = applyDraftToShotSpecs(draft.shotPlan, draft.draftShots)
  const continuity = superviseShotContinuity(editedShotPlan, pipelineConfigToBreakdownConfig(config))

  store.startPromptRun()
  store.setStageResult("continuitySupervisor", {
    input: draft.shotPlan,
    output: continuity,
  })

  try {
    let effectiveConfig = config
    const runPromptComposition = (targetConfig: PipelineConfig) => composePromptPackagesDetailed({
      sceneId: draft.sceneId,
      sceneText: draft.sceneText,
      analysis: draft.analysis,
      contextPlan: draft.contextPlan,
      continuity,
      modelId: getStageModelId(targetConfig, "promptComposer"),
      bible: bibleContext,
      style: buildPipelineStylePrompt(targetConfig),
      config: pipelineConfigToBreakdownConfig(targetConfig),
      editorialNotes: buildPromptComposerEditorialNotes(draft.draftShots),
    })

    let composed

    try {
      composed = await runPromptComposition(effectiveConfig)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (!message.includes(CLAUDE_KEY_MISSING_MESSAGE)) {
        throw error
      }

      effectiveConfig = buildClaudeFallbackConfig(config)
      store.setRunNotice("Claude API key не настроен. Prompt Composer автоматически переключился на GPT-4o.")
      composed = await runPromptComposition(effectiveConfig)
    }

    const fullResult = {
      sceneId: draft.sceneId,
      analysis: draft.analysis,
      actionSplit: draft.actionSplit,
      contextPlan: draft.contextPlan,
      creativePlan: draft.creativePlan,
      censorReport: draft.censorReport,
      shotPlan: continuity.shots,
      continuity,
      promptPackages: composed.promptPackages,
      shots: buildJenkinsShotsFromPromptPackages(continuity.shots, composed.promptPackages),
      diagnostics: {
        usedFallback: draft.diagnostics.usedFallback || composed.diagnostics.usedFallback,
        contextRouterFallback: draft.diagnostics.contextRouterFallback,
        creativePlannerFallback: draft.diagnostics.creativePlannerFallback,
        censorFallback: draft.diagnostics.censorFallback,
        actionSplitFallback: draft.diagnostics.actionSplitFallback,
        shotPlannerFallback: draft.diagnostics.shotPlannerFallback,
        promptComposerFallback: composed.diagnostics.promptComposerFallback,
      },
    }

    store.setStageResult("promptComposer", {
      input: { shots: continuity, contextPlan: draft.contextPlan, editorialNotes: draft.draftShots },
      output: composed.promptPackages,
    })
    store.setStageStatus("promptComposer", "done")
    store.setStageStatus("promptOptimizer", "running")

    const normalized = normalizeRunResult(fullResult, effectiveConfig)
    const promptEntries = extractPipelinePromptEntries(normalized)
    const optimizedEntries = promptEntries.map((entry) => buildPromptOptimizationPreview(
      draft.sceneId,
      entry,
      promptEntries,
      bible.characters,
      bible.locations,
    ))
    const totalCharsSaved = optimizedEntries.reduce((sum, entry) => sum + entry.charsSaved, 0)

    store.setStageResult("promptOptimizer", {
      input: { promptCount: promptEntries.length },
      output: {
        optimizedEntries,
        totalCharsSaved,
      },
    })
    store.setStageStatus("promptOptimizer", "done")
    store.setStageStatus("imageGenerator", "running")

    store.setStageResult("imageGenerator", {
      imageModel: effectiveConfig.stageModels.find((sm) => sm.stageId === "imageGenerator")?.modelId ?? "gpt-image",
      referenceStrategy: effectiveConfig.referenceStrategy,
      keyframeCandidates: normalized.imagePlan.keyframeCandidates,
      orderedShotCount: normalized.imagePlan.orderedShots.length,
      status: "planned",
    })
    store.setStageStatus("imageGenerator", "done")
    store.completeRun(normalized)

    return normalized
  } catch (error) {
    const currentStage = usePipelineStore.getState().runState.currentStage
    store.failRun(
      error instanceof Error ? error.message : String(error),
      currentStage ?? "promptComposer",
    )
    throw error
  }
}

/**
 * Simulates sequential stage progression after the single breakdownSceneDetailed
 * call completes. Each stage gets a minimum display time so the UI shows
 * meaningful progress rather than jumping from idle to done.
 */
async function simulatePlanningStageProgress(
  result: Awaited<ReturnType<typeof executePipelinePlanning>>,
  startStageIdx: number,
  stageStartTime: number,
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
    contextRouter: {
      input: {
        analysis: result.analysis,
        actions: result.actionSplit,
      },
      output: result.contextPlan,
    },
    creativePlanner: {
      input: {
        analysis: result.analysis,
        actions: result.actionSplit,
        contextPlan: result.contextPlan,
      },
      output: result.creativePlan,
    },
    censor: {
      input: {
        analysis: result.analysis,
        actions: result.actionSplit,
        creativePlan: result.creativePlan,
      },
      output: result.censorReport,
    },
    shotPlanner: {
      input: {
        actions: result.actionSplit,
        contextPlan: result.contextPlan,
        creativePlan: result.creativePlan,
        censorReport: result.censorReport,
      },
      output: result.shotPlan,
    },
    continuitySupervisor: {
      input: result.shotPlan,
      output: result.continuity,
    },
  }

  for (let i = startStageIdx; i < STAGE_SEQUENCE.length; i++) {
    const stageId = STAGE_SEQUENCE[i]

    if (stageId === "promptComposer" || stageId === "imageGenerator") {
      break
    }

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
    // Store stage result with input/output for inspector
    const stageData = stageResults[stageId]
    if (stageData) {
      store().setStageResult(stageId, stageData)
    }

    store().setStageStatus(stageId, "done")
  }

  store().setStageStatus("promptComposer", "idle")
  store().setStageStatus("imageGenerator", "idle")
}
