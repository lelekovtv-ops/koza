import { superviseShotContinuity } from "@/lib/cinematic/continuitySupervisor"
import type { ActionSplitStep } from "@/lib/cinematic/actionSplitter"
import {
  buildActionSplitterSystemPrompt,
  buildActionSplitterUserMessage,
  composeActionStepsLocally,
  parseActionSplitResponse,
} from "@/lib/cinematic/actionSplitter"
import type { CensorStageResult } from "@/lib/cinematic/censor"
import {
  buildCensorSystemPrompt,
  buildCensorUserMessage,
  composeCensorLocally,
  parseCensorResponse,
} from "@/lib/cinematic/censor"
import type { BreakdownEngineConfig } from "@/lib/cinematic/config"
import { shouldAllowLocalFallback } from "@/lib/cinematic/config"
import type { ContextRouterResult, ScreenplaySceneContext } from "@/lib/cinematic/contextRouter"
import {
  buildContextRouterSystemPrompt,
  buildContextRouterUserMessage,
  composeContextRouterLocally,
  parseContextRouterResponse,
} from "@/lib/cinematic/contextRouter"
import type { CreativePlannerResult } from "@/lib/cinematic/creativePlanner"
import {
  buildCreativePlannerSystemPrompt,
  buildCreativePlannerUserMessage,
  composeCreativePlannerLocally,
  parseCreativePlannerResponse,
} from "@/lib/cinematic/creativePlanner"
import {
  buildPromptComposerSystemPrompt,
  buildPromptComposerUserMessage,
  composePromptPackagesLocally,
  parsePromptComposerResponse,
  type PromptComposerEditorialNote,
  type PromptComposerShot,
} from "@/lib/cinematic/promptComposer"
import {
  buildSceneAnalystSystemPrompt,
  buildSceneAnalystUserMessage,
  parseSceneAnalysisResponse,
  type SceneAnalysis,
} from "@/lib/cinematic/sceneAnalyst"
import {
  buildShotPlannerSystemPrompt,
  buildShotPlannerUserMessage,
  composeShotSpecsLocally,
  parseShotPlannerResponse,
} from "@/lib/cinematic/shotPlanner"
import type { ContinuitySupervisorResult } from "@/lib/cinematic/continuitySupervisor"
import { getErrorMessage, type CinematicStyleContext } from "@/lib/cinematic/stageUtils"
import { DEFAULT_TEXT_MODEL_ID } from "@/lib/models"
import { shotSpecToTimelineShot } from "@/lib/shotSpecAdapter"
import { devlog } from "@/store/devlog"
import type { ShotSpec } from "@/types/cinematic"

export interface JenkinsShot {
  label: string
  type: "image"
  duration: number
  notes: string
  shotSize?: string
  cameraMotion?: string
  caption?: string
  directorNote?: string
  cameraNote?: string
  videoPrompt?: string
  imagePrompt?: string
  visualDescription?: string
}

export interface BreakdownDiagnostics {
  usedFallback: boolean
  contextRouterFallback?: boolean
  creativePlannerFallback?: boolean
  censorFallback?: boolean
  actionSplitFallback: boolean
  shotPlannerFallback: boolean
  promptComposerFallback: boolean
}

export interface BreakdownResult {
  shots: JenkinsShot[]
  diagnostics: BreakdownDiagnostics
}

export interface BreakdownDetailedResult extends BreakdownResult {
  sceneId: string
  analysis: SceneAnalysis
  actionSplit: ActionSplitStep[]
  contextPlan: ContextRouterResult
  creativePlan: CreativePlannerResult
  censorReport: CensorStageResult
  shotPlan: ShotSpec[]
  continuity: ContinuitySupervisorResult
  promptPackages: PromptComposerShot[]
}

export interface BreakdownPlanningResult {
  sceneId: string
  analysis: SceneAnalysis
  actionSplit: ActionSplitStep[]
  contextPlan: ContextRouterResult
  creativePlan: CreativePlannerResult
  censorReport: CensorStageResult
  shotPlan: ShotSpec[]
  continuity: ContinuitySupervisorResult
  diagnostics: BreakdownDiagnostics
}

export interface PromptCompositionDetailedResult {
  promptPackages: PromptComposerShot[]
  diagnostics: {
    usedFallback: boolean
    promptComposerFallback: boolean
  }
}

export interface BibleContext {
  characters: Array<{ name: string; description: string; appearancePrompt: string }>
  locations: Array<{ name: string; description: string; appearancePrompt: string; intExt: string }>
}

interface BreakdownOptions {
  sceneId?: string
  blockIds?: string[]
  modelId?: string
  bible?: BibleContext
  style?: CinematicStyleContext
  config?: BreakdownEngineConfig
  screenplayContext?: {
    previousScene: ScreenplaySceneContext | null
    currentScene: ScreenplaySceneContext | null
    nextScene: ScreenplaySceneContext | null
  }
}

type StageResultLogType = "breakdown_scene_analysis" | "breakdown_action_split" | "breakdown_context_router" | "breakdown_creative_plan" | "breakdown_censor" | "breakdown_shot_plan" | "breakdown_prompt_compose"

interface StageConfig<T> {
  stageLabel: "Scene Analyst" | "Action Splitter" | "Context Router" | "Creative Planner" | "Censor" | "Shot Planner" | "Prompt Composer"
  stageLogType: StageResultLogType
  systemPrompt: string
  userMessage: string
  modelId: string
  group: string
  parse: (rawText: string) => T
  buildLogEntry: (parsed: T) => { title: string; details: string; meta?: Record<string, unknown> }
}

function isRetriableStageError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()

  return message.includes("load failed")
    || message.includes("econnreset")
    || message.includes("terminated")
    || message.includes("failed to pipe response")
}

function readStreamAsText(response: Response): Promise<string> {
  const reader = response.body?.getReader()

  if (!reader) {
    throw new Error("No response body")
  }

  const decoder = new TextDecoder()
  let fullText = ""

  return reader.read().then(function processChunk({ done, value }): Promise<string> {
    if (done) {
      fullText += decoder.decode()
      return Promise.resolve(fullText)
    }

    fullText += decoder.decode(value, { stream: true })
    return reader.read().then(processChunk)
  })
}

async function executeStage<T>(config: StageConfig<T>): Promise<T> {
  devlog.breakdown("breakdown_prompt", `${config.stageLabel} system prompt`, config.systemPrompt, {
    stage: config.stageLabel,
  }, config.group)
  devlog.breakdown("breakdown_request", `${config.stageLabel} request`, config.userMessage, {
    stage: config.stageLabel,
  }, config.group)

  let attempt = 0
  let lastError: unknown

  while (attempt < 2) {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: config.userMessage }],
          modelId: config.modelId,
          system: config.systemPrompt,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `HTTP ${response.status}`)
      }

      const fullText = await readStreamAsText(response)

      devlog.breakdown("breakdown_response", `${config.stageLabel} raw response`, fullText, {
        stage: config.stageLabel,
        responseLength: fullText.length,
        attempt: attempt + 1,
      }, config.group)

      let parsed: T
      try {
        parsed = config.parse(fullText)
      } catch (parseError) {
        const preview = fullText.slice(0, 300) || "(empty response)"
        throw new Error(`${getErrorMessage(parseError)} — response preview: ${preview}`)
      }
      const logEntry = config.buildLogEntry(parsed)

      devlog.breakdown(config.stageLogType, logEntry.title, logEntry.details, logEntry.meta, config.group)
      return parsed
    } catch (error) {
      lastError = error

      if (attempt === 0 && isRetriableStageError(error)) {
        devlog.breakdown("breakdown_request", `${config.stageLabel} retry`, getErrorMessage(error), {
          stage: config.stageLabel,
          attempt: attempt + 2,
          reason: getErrorMessage(error),
        }, config.group)
        attempt += 1
        continue
      }

      break
    }
  }

  throw new Error(`${config.stageLabel} failed: ${getErrorMessage(lastError)}`)
}

function composeJenkinsShot(spec: ShotSpec, composed: PromptComposerShot | undefined, index: number): JenkinsShot {
  const legacy = shotSpecToTimelineShot(spec, {
    duration: composed?.duration,
    type: "image",
  })

  return {
    label: composed?.label || legacy.label || `Shot ${index + 1}`,
    type: "image",
    duration: composed?.duration ?? legacy.duration,
    notes: composed?.notes || legacy.notes,
    shotSize: composed?.shotSize || legacy.shotSize || undefined,
    cameraMotion: composed?.cameraMotion || legacy.cameraMotion || undefined,
    caption: composed?.caption || legacy.caption || undefined,
    directorNote: composed?.directorNote || legacy.directorNote || undefined,
    cameraNote: composed?.cameraNote || legacy.cameraNote || undefined,
    videoPrompt: composed?.videoPrompt || legacy.videoPrompt || undefined,
    imagePrompt: composed?.imagePrompt || legacy.imagePrompt || undefined,
    visualDescription: composed?.visualDescription || legacy.visualDescription || undefined,
  }
}

export function buildJenkinsShotsFromPromptPackages(shotSpecs: ShotSpec[], promptPackages: PromptComposerShot[]): JenkinsShot[] {
  const composedById = new Map(promptPackages.map((shot) => [shot.shotId, shot]))
  return shotSpecs.map((spec, index) => composeJenkinsShot(spec, composedById.get(spec.id), index))
}

export async function breakdownScene(
  sceneText: string,
  optionsOrModelId?: BreakdownOptions | string,
): Promise<BreakdownResult> {
  const result = await breakdownSceneDetailed(sceneText, optionsOrModelId)

  return {
    shots: result.shots,
    diagnostics: result.diagnostics,
  }
}

export async function breakdownScenePlanningDetailed(
  sceneText: string,
  optionsOrModelId?: BreakdownOptions | string,
): Promise<BreakdownPlanningResult> {
  const normalizedSceneText = sceneText.trim()

  if (!normalizedSceneText) {
    return {
      sceneId: "scene",
      analysis: {
        sceneSummary: "",
        dramaticBeats: [],
        emotionalTone: "",
        geography: "",
        characterPresence: [],
        propCandidates: [],
        visualMotifs: [],
        continuityRisks: [],
        recommendedShotCount: 0,
      },
      actionSplit: [],
      contextPlan: {
        primaryLocation: "",
        visibleSecondaryLocations: [],
        offscreenLocations: [],
        propAnchors: [],
        environmentTransitions: [],
        referenceRouting: [],
        promptHints: [],
      },
      creativePlan: {
        operatorMission: "",
        scenePressurePoints: [],
        globalGuidance: "",
        filmHistoryReferences: [],
        sceneIdeas: [],
      },
      censorReport: {
        verdict: "",
        approvedDirections: [],
        rejectedDirections: [],
        warnings: [],
        finalInstruction: "",
      },
      shotPlan: [],
      continuity: {
        shots: [],
        memories: [],
        risks: [],
        relations: [],
      },
      diagnostics: {
        usedFallback: false,
        contextRouterFallback: false,
        creativePlannerFallback: false,
        censorFallback: false,
        actionSplitFallback: false,
        shotPlannerFallback: false,
        promptComposerFallback: false,
      },
    }
  }

  const opts: BreakdownOptions = typeof optionsOrModelId === "string"
    ? { modelId: optionsOrModelId }
    : optionsOrModelId ?? {}
  const modelId = opts.modelId ?? DEFAULT_TEXT_MODEL_ID
  const sceneId = opts.sceneId ?? `scene-${Date.now()}`
  const group = `breakdown-${sceneId}`
  const allowLocalFallback = shouldAllowLocalFallback(opts.config)
  let usedActionSplitFallback = false
  let usedContextRouterFallback = false
  let usedCreativePlannerFallback = false
  let usedCensorFallback = false
  let usedShotPlannerFallback = false

  devlog.breakdown("breakdown_start", `Breakdown: ${normalizedSceneText.slice(0, 60)}...`, "", {
    sceneId,
    modelId,
    textLength: normalizedSceneText.length,
  }, group)

  try {
    const analysis = await executeStage<SceneAnalysis>({
      stageLabel: "Scene Analyst",
      stageLogType: "breakdown_scene_analysis",
      systemPrompt: buildSceneAnalystSystemPrompt({ sceneId, bible: opts.bible, style: opts.style }),
      userMessage: buildSceneAnalystUserMessage(normalizedSceneText),
      modelId,
      group,
      parse: (rawText) => parseSceneAnalysisResponse(rawText, { sceneId, bible: opts.bible, style: opts.style }),
      buildLogEntry: (parsed) => ({
        title: `Scene Analyst produced ${parsed.dramaticBeats.length} beats`,
        details: JSON.stringify(parsed, null, 2),
        meta: {
          sceneId,
          beatCount: parsed.dramaticBeats.length,
          recommendedShotCount: parsed.recommendedShotCount,
        },
      }),
    })

    let actionSplit: ActionSplitStep[]

    try {
      actionSplit = await executeStage<ActionSplitStep[]>({
        stageLabel: "Action Splitter",
        stageLogType: "breakdown_action_split",
        systemPrompt: buildActionSplitterSystemPrompt({ sceneId, config: opts.config, bible: opts.bible, style: opts.style }),
        userMessage: buildActionSplitterUserMessage({
          sceneId,
          analysis,
          config: opts.config,
          sceneText: normalizedSceneText,
          bible: opts.bible,
          style: opts.style,
        }),
        modelId,
        group,
        parse: (rawText) => parseActionSplitResponse(rawText, sceneId),
        buildLogEntry: (parsed) => ({
          title: `Action Splitter produced ${parsed.length} actions`,
          details: JSON.stringify(parsed, null, 2),
          meta: {
            sceneId,
            actionCount: parsed.length,
          },
        }),
      })
    } catch (error) {
      if (!allowLocalFallback) {
        throw error
      }

      usedActionSplitFallback = true
      actionSplit = composeActionStepsLocally({
        sceneId,
        analysis,
        config: opts.config,
        sceneText: normalizedSceneText,
        bible: opts.bible,
        style: opts.style,
      })

      devlog.breakdown("breakdown_action_split", "Action Splitter fallback used", JSON.stringify(actionSplit, null, 2), {
        sceneId,
        reason: getErrorMessage(error),
        actionCount: actionSplit.length,
        fallback: "local-action-splitter",
      }, group)
    }

    // ── Context Router + Creative Planner — PARALLEL (no cross-dependency) ──

    const contextRouterPromise = executeStage<ContextRouterResult>({
      stageLabel: "Context Router",
      stageLogType: "breakdown_context_router",
      systemPrompt: buildContextRouterSystemPrompt({ sceneId, config: opts.config, bible: opts.bible, style: opts.style }),
      userMessage: buildContextRouterUserMessage({
        sceneId,
        sceneText: normalizedSceneText,
        analysis,
        actions: actionSplit,
        screenplayContext: opts.screenplayContext,
        config: opts.config,
        bible: opts.bible,
        style: opts.style,
      }),
      modelId,
      group,
      parse: (rawText) => parseContextRouterResponse(rawText),
      buildLogEntry: (parsed) => ({
        title: `Context Router mapped ${parsed.visibleSecondaryLocations.length} secondary locations`,
        details: JSON.stringify(parsed, null, 2),
        meta: {
          sceneId,
          primaryLocation: parsed.primaryLocation,
          propAnchorCount: parsed.propAnchors.length,
        },
      }),
    }).catch((error) => {
      if (!allowLocalFallback) throw error
      usedContextRouterFallback = true
      const result = composeContextRouterLocally({
        sceneId, sceneText: normalizedSceneText, analysis, actions: actionSplit,
        screenplayContext: opts.screenplayContext, config: opts.config, bible: opts.bible, style: opts.style,
      })
      devlog.breakdown("breakdown_context_router", "Context Router fallback used", JSON.stringify(result, null, 2), {
        sceneId, reason: getErrorMessage(error), primaryLocation: result.primaryLocation, fallback: "local-context-router",
      }, group)
      return result
    })

    const creativePlannerPromise = executeStage<CreativePlannerResult>({
      stageLabel: "Creative Planner",
      stageLogType: "breakdown_creative_plan",
      systemPrompt: buildCreativePlannerSystemPrompt({ sceneId, config: opts.config, bible: opts.bible, style: opts.style }),
      userMessage: buildCreativePlannerUserMessage({
        sceneId, analysis, actions: actionSplit, config: opts.config,
        sceneText: normalizedSceneText, bible: opts.bible, style: opts.style,
      }),
      modelId,
      group,
      parse: (rawText) => parseCreativePlannerResponse(rawText),
      buildLogEntry: (parsed) => ({
        title: `Creative Planner produced ${parsed.sceneIdeas.length} scene ideas`,
        details: JSON.stringify(parsed, null, 2),
        meta: {
          sceneId, referenceCount: parsed.filmHistoryReferences.length, sceneIdeaCount: parsed.sceneIdeas.length,
        },
      }),
    }).catch((error) => {
      if (!allowLocalFallback) throw error
      usedCreativePlannerFallback = true
      const result = composeCreativePlannerLocally({
        sceneId, analysis, actions: actionSplit, config: opts.config,
        sceneText: normalizedSceneText, bible: opts.bible, style: opts.style,
      })
      devlog.breakdown("breakdown_creative_plan", "Creative Planner fallback used", JSON.stringify(result, null, 2), {
        sceneId, reason: getErrorMessage(error), sceneIdeaCount: result.sceneIdeas.length, fallback: "local-creative-planner",
      }, group)
      return result
    })

    const [contextPlan, creativePlan] = await Promise.all([contextRouterPromise, creativePlannerPromise])

    let censorReport: CensorStageResult

    try {
      censorReport = await executeStage<CensorStageResult>({
        stageLabel: "Censor",
        stageLogType: "breakdown_censor",
        systemPrompt: buildCensorSystemPrompt({ sceneId, config: opts.config, bible: opts.bible, style: opts.style }),
        userMessage: buildCensorUserMessage({
          sceneId,
          sceneText: normalizedSceneText,
          analysis,
          actions: actionSplit,
          creativePlan,
          directorVision: opts.config ? `Эмоциональный фокус: ${opts.config.keyframePolicy}.` : "",
          config: opts.config,
          bible: opts.bible,
          style: opts.style,
        }),
        modelId,
        group,
        parse: (rawText) => parseCensorResponse(rawText),
        buildLogEntry: (parsed) => ({
          title: `Censor approved ${parsed.approvedDirections.length} directions`,
          details: JSON.stringify(parsed, null, 2),
          meta: {
            sceneId,
            approvedCount: parsed.approvedDirections.length,
            warningCount: parsed.warnings.length,
          },
        }),
      })
    } catch (error) {
      if (!allowLocalFallback) {
        throw error
      }

      usedCensorFallback = true
      censorReport = composeCensorLocally({
        sceneId,
        sceneText: normalizedSceneText,
        analysis,
        actions: actionSplit,
        creativePlan,
        directorVision: opts.config ? `Эмоциональный фокус: ${opts.config.keyframePolicy}.` : "",
        config: opts.config,
        bible: opts.bible,
        style: opts.style,
      })

      devlog.breakdown("breakdown_censor", "Censor fallback used", JSON.stringify(censorReport, null, 2), {
        sceneId,
        reason: getErrorMessage(error),
        approvedCount: censorReport.approvedDirections.length,
        fallback: "local-censor",
      }, group)
    }

    let shotSpecs: ShotSpec[]

    try {
      shotSpecs = await executeStage<ShotSpec[]>({
        stageLabel: "Shot Planner",
        stageLogType: "breakdown_shot_plan",
        systemPrompt: buildShotPlannerSystemPrompt({ sceneId, config: opts.config, bible: opts.bible, style: opts.style }),
        userMessage: buildShotPlannerUserMessage({ sceneId, analysis, actions: actionSplit, contextPlan, creativePlan, censorReport, config: opts.config, sceneText: normalizedSceneText, bible: opts.bible, style: opts.style }),
        modelId,
        group,
        parse: (rawText) => parseShotPlannerResponse(rawText, sceneId),
        buildLogEntry: (parsed) => ({
          title: `Shot Planner produced ${parsed.length} shots`,
          details: JSON.stringify(parsed, null, 2),
          meta: {
            sceneId,
            shotCount: parsed.length,
            shotIds: parsed.map((shot) => shot.id),
          },
        }),
      })
    } catch (error) {
      if (!allowLocalFallback) {
        throw error
      }

      usedShotPlannerFallback = true
      shotSpecs = composeShotSpecsLocally({
        sceneId,
        analysis,
        actions: actionSplit,
        contextPlan,
        creativePlan,
        censorReport,
        config: opts.config,
        sceneText: normalizedSceneText,
        bible: opts.bible,
        style: opts.style,
      })

      devlog.breakdown("breakdown_shot_plan", "Shot Planner fallback used", JSON.stringify(shotSpecs, null, 2), {
        sceneId,
        reason: getErrorMessage(error),
        shotCount: shotSpecs.length,
        fallback: "local-shot-planner",
      }, group)
    }

    const continuity = superviseShotContinuity(shotSpecs, opts.config)

    devlog.breakdown("breakdown_continuity_memory", `Continuity memory created for ${continuity.memories.length} shots`, JSON.stringify(continuity.memories, null, 2), {
      sceneId,
      memoryCount: continuity.memories.length,
    }, group)

    devlog.breakdown("breakdown_continuity_risks", `Continuity supervisor found ${continuity.risks.length} risks`, JSON.stringify(continuity.risks, null, 2), {
      sceneId,
      riskCount: continuity.risks.length,
    }, group)

    devlog.breakdown("breakdown_continuity_enriched", `Continuity enriched ${continuity.shots.length} shots`, JSON.stringify(continuity.shots, null, 2), {
      sceneId,
      shotCount: continuity.shots.length,
    }, group)

    devlog.breakdown("breakdown_shot_relations", `Derived ${continuity.relations.length} shot relations`, JSON.stringify(continuity.relations, null, 2), {
      sceneId,
      relationCount: continuity.relations.length,
      relationIntents: continuity.relations.map((relation) => relation.relationIntent),
    }, group)

    return {
      sceneId,
      analysis,
      actionSplit,
      contextPlan,
      creativePlan,
      censorReport,
      shotPlan: continuity.shots,
      continuity,
      diagnostics: {
        usedFallback: usedActionSplitFallback || usedContextRouterFallback || usedCreativePlannerFallback || usedCensorFallback || usedShotPlannerFallback,
        contextRouterFallback: usedContextRouterFallback,
        creativePlannerFallback: usedCreativePlannerFallback,
        censorFallback: usedCensorFallback,
        actionSplitFallback: usedActionSplitFallback,
        shotPlannerFallback: usedShotPlannerFallback,
        promptComposerFallback: false,
      },
    }
  } catch (error) {
    devlog.breakdown("breakdown_error", "Breakdown failed", getErrorMessage(error), {
      sceneId,
    }, group)
    throw error
  }
}

export async function composePromptPackagesDetailed(input: {
  sceneId: string
  sceneText: string
  analysis: SceneAnalysis
  continuity: ContinuitySupervisorResult
  contextPlan?: ContextRouterResult
  modelId?: string
  bible?: BibleContext
  style?: CinematicStyleContext
  config?: BreakdownEngineConfig
  editorialNotes?: PromptComposerEditorialNote[]
}): Promise<PromptCompositionDetailedResult> {
  const modelId = input.modelId ?? DEFAULT_TEXT_MODEL_ID
  const allowLocalFallback = shouldAllowLocalFallback(input.config)
  const group = `prompt-compose-${input.sceneId}`
  let usedPromptComposerFallback = false

  try {
    let promptPackages: PromptComposerShot[]

    try {
      promptPackages = await executeStage<PromptComposerShot[]>({
        stageLabel: "Prompt Composer",
        stageLogType: "breakdown_prompt_compose",
        systemPrompt: buildPromptComposerSystemPrompt({ sceneId: input.sceneId, contextPlan: input.contextPlan, config: input.config, bible: input.bible, style: input.style }),
        userMessage: buildPromptComposerUserMessage({
          sceneId: input.sceneId,
          analysis: input.analysis,
          contextPlan: input.contextPlan,
          config: input.config,
          sceneText: input.sceneText,
          shots: input.continuity.shots,
          memories: input.continuity.memories,
          relations: input.continuity.relations,
          bible: input.bible,
          style: input.style,
          editorialNotes: input.editorialNotes,
        }),
        modelId,
        group,
        parse: (rawText) => parsePromptComposerResponse(
          rawText,
          input.continuity.shots,
          input.continuity.memories,
          input.continuity.relations,
          input.config,
          input.style,
          input.editorialNotes,
        ),
        buildLogEntry: (parsed) => ({
          title: `Prompt Composer produced ${parsed.length} prompt packages`,
          details: JSON.stringify(parsed, null, 2),
          meta: {
            sceneId: input.sceneId,
            shotCount: parsed.length,
            promptShotIds: parsed.map((shot) => shot.shotId),
          },
        }),
      })
    } catch (error) {
      if (!allowLocalFallback) {
        throw error
      }

      usedPromptComposerFallback = true
      promptPackages = composePromptPackagesLocally({
        sceneId: input.sceneId,
        analysis: input.analysis,
        contextPlan: input.contextPlan,
        config: input.config,
        sceneText: input.sceneText,
        shots: input.continuity.shots,
        memories: input.continuity.memories,
        relations: input.continuity.relations,
        bible: input.bible,
        style: input.style,
        editorialNotes: input.editorialNotes,
      })

      devlog.breakdown("breakdown_prompt_compose", "Prompt Composer fallback used", JSON.stringify(promptPackages, null, 2), {
        sceneId: input.sceneId,
        reason: getErrorMessage(error),
        shotCount: promptPackages.length,
        fallback: "local-composer",
      }, group)
    }

    return {
      promptPackages,
      diagnostics: {
        usedFallback: usedPromptComposerFallback,
        promptComposerFallback: usedPromptComposerFallback,
      },
    }
  } catch (error) {
    devlog.breakdown("breakdown_error", "Prompt composition failed", getErrorMessage(error), {
      sceneId: input.sceneId,
    }, group)
    throw error
  }
}

export async function breakdownSceneDetailed(
  sceneText: string,
  optionsOrModelId?: BreakdownOptions | string,
): Promise<BreakdownDetailedResult> {
  const planning = await breakdownScenePlanningDetailed(sceneText, optionsOrModelId)

  if (!sceneText.trim()) {
    return {
      sceneId: "scene",
      shots: [],
      analysis: planning.analysis,
      actionSplit: planning.actionSplit,
      contextPlan: planning.contextPlan,
      creativePlan: planning.creativePlan,
      censorReport: planning.censorReport,
      shotPlan: planning.shotPlan,
      continuity: planning.continuity,
      promptPackages: [],
      diagnostics: planning.diagnostics,
    }
  }

  const opts: BreakdownOptions = typeof optionsOrModelId === "string"
    ? { modelId: optionsOrModelId }
    : optionsOrModelId ?? {}
  const composed = await composePromptPackagesDetailed({
    sceneId: planning.sceneId,
    sceneText: sceneText.trim(),
    analysis: planning.analysis,
    contextPlan: planning.contextPlan,
    continuity: planning.continuity,
    modelId: opts.modelId,
    bible: opts.bible,
    style: opts.style,
    config: opts.config,
  })
  const shots = buildJenkinsShotsFromPromptPackages(planning.continuity.shots, composed.promptPackages)

  return {
    sceneId: planning.sceneId,
    shots,
    analysis: planning.analysis,
    actionSplit: planning.actionSplit,
    contextPlan: planning.contextPlan,
    creativePlan: planning.creativePlan,
    censorReport: planning.censorReport,
    shotPlan: planning.shotPlan,
    continuity: planning.continuity,
    promptPackages: composed.promptPackages,
    diagnostics: {
      usedFallback: planning.diagnostics.usedFallback || composed.diagnostics.usedFallback,
      contextRouterFallback: planning.diagnostics.contextRouterFallback,
      creativePlannerFallback: planning.diagnostics.creativePlannerFallback,
      censorFallback: planning.diagnostics.censorFallback,
      actionSplitFallback: planning.diagnostics.actionSplitFallback,
      shotPlannerFallback: planning.diagnostics.shotPlannerFallback,
      promptComposerFallback: composed.diagnostics.promptComposerFallback,
    },
  }
}
