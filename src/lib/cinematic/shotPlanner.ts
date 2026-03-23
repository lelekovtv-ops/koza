import { DEAKINS_RULES, SHOT_TRANSITION_RULES } from "@/lib/cinematographyRules"
import type { ActionSplitStep } from "@/lib/cinematic/actionSplitter"
import {
  buildBreakdownConfigPrompt,
  getContinuityWarningLimit,
  getShotDensityMultiplier,
  type BreakdownEngineConfig,
} from "@/lib/cinematic/config"
import type { SceneAnalysis } from "@/lib/cinematic/sceneAnalyst"
import {
  buildBibleContextPrompt,
  clampInteger,
  extractJsonArray,
  makeShotSpecId,
  normalizeString,
  normalizeStringArray,
  normalizeStringRecord,
  serializeForPrompt,
  type CinematicBibleContext,
  type CinematicStyleContext,
  resolveStyleDirective,
} from "@/lib/cinematic/stageUtils"
import type { ContinuityPromptBlocks, ShotContinuity, ShotSpec } from "@/types/cinematic"

export interface ShotPlannerInput {
  sceneId: string
  analysis: SceneAnalysis
  actions: ActionSplitStep[]
  config?: BreakdownEngineConfig
  sceneText?: string
  bible?: CinematicBibleContext
  style?: CinematicStyleContext
}

type ShotPlannerAnalysisPayload = {
  sceneSummary: string
  emotionalTone: string
  geography: string
  characterPresence: string[]
  propCandidates: string[]
  visualMotifs: string[]
  continuityRisks: string[]
  recommendedShotCount: number
  dramaticBeats: Array<{
    order: number
    title: string
    summary: string
    narrativeFunction: string
    emotionalShift: string
    subjectFocus: string
    characterIds: string[]
    locationId: string | null
    propIds: string[]
    visualAnchors: string[]
    transitionOut: string
  }>
}

type ShotPlannerActionPayload = {
  order: number
  title: string
  summary: string
  whyItMatters: string
  visibleChange: string
  emotionalChange: string
  characterIds: string[]
  propIds: string[]
  locationId: string | null
  transitionOut: string
}

type ScreenplayCue = {
  text: string
  weight: number
}

function normalizePromptBlocks(value: unknown): ContinuityPromptBlocks {
  const blocks = typeof value === "object" && value !== null ? value as Record<string, unknown> : {}

  return {
    preserve: normalizeStringArray(blocks.preserve),
    change: normalizeStringArray(blocks.change),
    prepare: normalizeStringArray(blocks.prepare),
    doNot: normalizeStringArray(blocks.doNot),
  }
}

function normalizeContinuity(value: unknown): ShotContinuity {
  const continuity = typeof value === "object" && value !== null ? value as Record<string, unknown> : {}

  return {
    characterIds: normalizeStringArray(continuity.characterIds),
    wardrobeState: normalizeStringRecord(continuity.wardrobeState),
    propIds: normalizeStringArray(continuity.propIds),
    locationId: normalizeString(continuity.locationId) || null,
    timeOfDay: normalizeString(continuity.timeOfDay),
    screenDirection: normalizeString(continuity.screenDirection),
    eyeline: normalizeString(continuity.eyeline),
    axisOfAction: normalizeString(continuity.axisOfAction),
    carryOverFromPrevious: normalizeString(continuity.carryOverFromPrevious),
    setupForNext: normalizeString(continuity.setupForNext),
    lockedVisualAnchors: normalizeStringArray(continuity.lockedVisualAnchors),
    continuityWarnings: normalizeStringArray(continuity.continuityWarnings),
    keyframeRole: normalizeString(continuity.keyframeRole) === "key"
      ? "key"
      : normalizeString(continuity.keyframeRole) === "insert"
        ? "insert"
        : "secondary",
    keyframeReason: normalizeString(continuity.keyframeReason),
    anchorShotId: normalizeString(continuity.anchorShotId) || null,
    promptBlocks: normalizePromptBlocks(continuity.promptBlocks),
  }
}

function fallbackPromptBase(spec: Pick<ShotSpec, "shotSize" | "subject" | "environment" | "lighting" | "palette" | "camera">): string {
  return [
    spec.shotSize,
    spec.subject,
    spec.environment,
    spec.lighting,
    spec.camera,
    spec.palette.length > 0 ? `palette ${spec.palette.join(", ")}` : "",
  ].map((value) => value.trim()).filter(Boolean).join(", ")
}

function toShotPlannerAnalysisPayload(analysis: SceneAnalysis): ShotPlannerAnalysisPayload {
  return {
    sceneSummary: analysis.sceneSummary,
    emotionalTone: analysis.emotionalTone,
    geography: analysis.geography,
    characterPresence: analysis.characterPresence,
    propCandidates: analysis.propCandidates,
    visualMotifs: analysis.visualMotifs,
    continuityRisks: analysis.continuityRisks,
    recommendedShotCount: analysis.recommendedShotCount,
    dramaticBeats: analysis.dramaticBeats.map((beat) => ({
      order: beat.order,
      title: beat.title,
      summary: beat.summary,
      narrativeFunction: beat.narrativeFunction,
      emotionalShift: beat.emotionalShift,
      subjectFocus: beat.subjectFocus,
      characterIds: beat.characterIds,
      locationId: beat.locationId,
      propIds: beat.propIds,
      visualAnchors: beat.visualAnchors,
      transitionOut: beat.transitionOut,
    })),
  }
}

function toShotPlannerActionPayload(actions: ActionSplitStep[]): ShotPlannerActionPayload[] {
  return actions.map((action) => ({
    order: action.order,
    title: action.title,
    summary: action.summary,
    whyItMatters: action.whyItMatters,
    visibleChange: action.visibleChange,
    emotionalChange: action.emotionalChange,
    characterIds: action.characterIds,
    propIds: action.propIds,
    locationId: action.locationId,
    transitionOut: action.transitionOut,
  }))
}

function extractScreenplayLines(sceneText?: string): string[] {
  if (!sceneText) {
    return []
  }

  return sceneText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function buildScreenplayExcerpt(sceneText?: string): string {
  return extractScreenplayLines(sceneText).slice(0, 18).join("\n")
}

function buildScreenplayCuePool(sceneText?: string): ScreenplayCue[] {
  const lines = extractScreenplayLines(sceneText)

  return lines.flatMap((line, index, allLines) => {
    const upperLine = line.toUpperCase()
    const isHeading = /^(INT\.?|EXT\.?|INT\/EXT\.?|EST\.?)/.test(upperLine)
    const isCharacterCue = upperLine === line && line.length <= 24 && /^[A-ZА-Я0-9 .()'"-]+$/.test(line)
    const nextLine = allLines[index + 1]?.trim() ?? ""

    if (isHeading) {
      return [{ text: line, weight: 3 }]
    }

    if (isCharacterCue && nextLine && nextLine !== line) {
      return [{ text: `${line}: ${nextLine}`, weight: 4 }]
    }

    if (line.length >= 18) {
      return [{ text: line, weight: 2 }]
    }

    return []
  })
}

function pickCueForShot(cues: ScreenplayCue[], index: number, targetCount: number): ScreenplayCue | undefined {
  if (cues.length === 0) {
    return undefined
  }

  const cueIndex = Math.min(cues.length - 1, Math.floor(index * cues.length / Math.max(targetCount, 1)))
  return cues[cueIndex]
}

function inferFallbackShotSize(index: number, targetCount: number): string {
  if (targetCount <= 1) {
    return "medium shot"
  }

  const pattern = ["wide shot", "medium shot", "close-up", "insert", "medium close-up"]

  if (index === 0) {
    return "wide shot"
  }

  if (index === targetCount - 1 && targetCount > 2) {
    return "close-up"
  }

  return pattern[index % pattern.length]
}

function inferFallbackShotType(shotSize: string): string {
  if (shotSize === "wide shot") {
    return "establishing"
  }

  if (shotSize === "insert") {
    return "detail"
  }

  if (shotSize.includes("close")) {
    return "emphasis"
  }

  return "coverage"
}

function inferFallbackCamera(index: number, analysis: SceneAnalysis, shotSize: string): string {
  const emotionalTone = analysis.emotionalTone.toLowerCase()

  if (index === 0 && shotSize === "wide shot") {
    return "locked frame, slight observational drift"
  }

  if (emotionalTone.includes("tense") || emotionalTone.includes("urgent") || emotionalTone.includes("chaotic")) {
    return shotSize.includes("close")
      ? "subtle handheld pressure, restrained push-in"
      : "handheld with controlled instability"
  }

  if (shotSize === "insert") {
    return "precise detail framing, minimal movement"
  }

  if (shotSize.includes("close")) {
    return "slow push-in or quiet drift"
  }

  return "motivated dolly or locked-off coverage"
}

function inferFallbackLighting(analysis: SceneAnalysis): string {
  const emotionalTone = analysis.emotionalTone.toLowerCase()
  const geography = analysis.geography.toLowerCase()
  const summary = analysis.sceneSummary.toLowerCase()

  if (summary.includes("night") || geography.includes("night") || emotionalTone.includes("dark")) {
    return "low-key motivated lighting with practical contrast"
  }

  if (emotionalTone.includes("intimate") || emotionalTone.includes("tender")) {
    return "soft motivated lighting with gentle falloff"
  }

  return "naturalistic cinematic lighting with motivated sources"
}

function inferFallbackPalette(analysis: SceneAnalysis, visualAnchors: string[]): string[] {
  return Array.from(new Set([
    ...visualAnchors,
    ...analysis.visualMotifs,
  ].map((value) => value.trim()).filter(Boolean))).slice(0, 4)
}

function buildFallbackBeatPool(input: ShotPlannerInput): SceneAnalysis["dramaticBeats"] {
  if (input.actions.length > 0) {
    return input.actions.map((action, index) => ({
      id: action.id,
      sceneId: input.sceneId,
      order: index,
      title: action.title,
      summary: action.summary,
      narrativeFunction: action.whyItMatters,
      emotionalShift: action.emotionalChange,
      subjectFocus: action.visibleChange,
      characterIds: action.characterIds,
      locationId: action.locationId,
      propIds: action.propIds,
      visualAnchors: [],
      transitionOut: action.transitionOut,
    }))
  }

  if (input.analysis.dramaticBeats.length > 0) {
    return input.analysis.dramaticBeats
  }

  return [{
    id: `${input.sceneId}-beat-1`,
    sceneId: input.sceneId,
    order: 0,
    title: "Scene progression",
    summary: input.analysis.sceneSummary || "Advance the scene visually.",
    narrativeFunction: "scene progression",
    emotionalShift: input.analysis.emotionalTone,
    subjectFocus: input.analysis.characterPresence[0] || "primary subject",
    characterIds: input.analysis.characterPresence,
    locationId: null,
    propIds: input.analysis.propCandidates.slice(0, 3),
    visualAnchors: input.analysis.visualMotifs.slice(0, 3),
    transitionOut: "motivated cut to the next dramatic beat",
  }]
}

function buildFallbackSubject(beat: SceneAnalysis["dramaticBeats"][number], analysis: SceneAnalysis): string {
  return beat.subjectFocus
    || beat.characterIds.join(", ")
    || analysis.characterPresence.join(", ")
    || beat.summary
    || "primary dramatic subject"
}

function buildFallbackEnvironment(beat: SceneAnalysis["dramaticBeats"][number], analysis: SceneAnalysis): string {
  return beat.locationId || analysis.geography || analysis.sceneSummary || "cinematic scene environment"
}

function buildFallbackBlocking(beat: SceneAnalysis["dramaticBeats"][number], index: number, targetCount: number): string {
  const base = beat.summary || beat.narrativeFunction || beat.title

  if (index === 0) {
    return `Establish the scene action: ${base}`
  }

  if (index === targetCount - 1) {
    return `Land the beat and prepare the scene exit: ${base}`
  }

  return `Carry the dramatic beat forward through motivated action: ${base}`
}

function buildFallbackNarrativePurpose(
  beat: SceneAnalysis["dramaticBeats"][number],
  cue: ScreenplayCue | undefined,
  index: number,
): string {
  return cue?.text || beat.narrativeFunction || beat.title || `Beat ${index + 1}`
}

function buildFallbackDramaticBeat(
  beat: SceneAnalysis["dramaticBeats"][number],
  analysis: SceneAnalysis,
  cue: ScreenplayCue | undefined,
): string {
  return cue?.text || beat.summary || analysis.sceneSummary
}

function buildFallbackComposition(beat: SceneAnalysis["dramaticBeats"][number], cue: ScreenplayCue | undefined): string {
  if (beat.visualAnchors.length > 0) {
    return beat.visualAnchors[0]
  }

  if (cue?.text) {
    return `frame the key screenplay moment: ${cue.text}`
  }

  return "balanced cinematic composition"
}

function buildFallbackBlockingFromCue(
  beat: SceneAnalysis["dramaticBeats"][number],
  cue: ScreenplayCue | undefined,
  index: number,
  targetCount: number,
): string {
  if (cue?.text) {
    if (index === 0) {
      return `Open on the screenplay beat: ${cue.text}`
    }

    if (index === targetCount - 1) {
      return `Resolve the screenplay beat and land on: ${cue.text}`
    }

    return `Stage the next screenplay beat through visible action: ${cue.text}`
  }

  return buildFallbackBlocking(beat, index, targetCount)
}

export function composeShotSpecsLocally(input: ShotPlannerInput): ShotSpec[] {
  const beatPool = buildFallbackBeatPool(input)
  const densityAdjustedCount = Math.max(1, Math.round(input.analysis.recommendedShotCount * getShotDensityMultiplier(input.config)))
  const targetCount = clampInteger(densityAdjustedCount, beatPool.length || 1, 1, 12)
  const continuityWarningLimit = getContinuityWarningLimit(input.config)
  const cuePool = buildScreenplayCuePool(input.sceneText)

  return Array.from({ length: targetCount }, (_, index) => {
    const beat = beatPool[Math.min(beatPool.length - 1, Math.floor(index * beatPool.length / targetCount))]
    const cue = pickCueForShot(cuePool, index, targetCount)
    const shotSize = inferFallbackShotSize(index, targetCount)
    const subject = buildFallbackSubject(beat, input.analysis)
    const environment = buildFallbackEnvironment(beat, input.analysis)
    const lighting = inferFallbackLighting(input.analysis)
    const palette = inferFallbackPalette(input.analysis, beat.visualAnchors)
    const camera = inferFallbackCamera(index, input.analysis, shotSize)
    const transitionOut = beat.transitionOut || (index < targetCount - 1 ? "motivated cut to next beat" : "resolve the scene beat")

    const fallbackShot = normalizeShotSpec({
      id: makeShotSpecId(input.sceneId, index),
      sceneId: input.sceneId,
      order: index,
      narrativePurpose: buildFallbackNarrativePurpose(beat, cue, index),
      dramaticBeat: buildFallbackDramaticBeat(beat, input.analysis, cue),
      shotType: inferFallbackShotType(shotSize),
      shotSize,
      composition: buildFallbackComposition(beat, cue),
      camera,
      blocking: buildFallbackBlockingFromCue(beat, cue, index, targetCount),
      subject,
      environment,
      props: beat.propIds.length > 0 ? beat.propIds : input.analysis.propCandidates.slice(0, 3),
      lighting,
      palette,
      continuity: {
        characterIds: beat.characterIds.length > 0 ? beat.characterIds : input.analysis.characterPresence,
        wardrobeState: {},
        propIds: beat.propIds.length > 0 ? beat.propIds : input.analysis.propCandidates.slice(0, 3),
        locationId: beat.locationId,
        timeOfDay: "",
        screenDirection: "preserve established screen direction",
        eyeline: beat.characterIds.length > 1 ? "maintain reciprocal eyelines" : "preserve established gaze line",
        axisOfAction: "hold the established 180-degree line",
        carryOverFromPrevious: index > 0 ? "maintain wardrobe, props, and actor geography from the prior shot" : "introduce the scene state cleanly",
        setupForNext: index < targetCount - 1 ? transitionOut : "",
        lockedVisualAnchors: beat.visualAnchors,
        continuityWarnings: input.analysis.continuityRisks.slice(0, continuityWarningLimit),
        keyframeRole: index === 0 ? "key" : shotSize === "insert" ? "insert" : "secondary",
        keyframeReason: index === 0 ? "Opening anchor for the sequence." : "",
        anchorShotId: index === 0 ? makeShotSpecId(input.sceneId, index) : null,
        promptBlocks: {
          preserve: [],
          change: [],
          prepare: [],
          doNot: [],
        },
      },
      transitionIn: index === 0 ? "open on established geography" : "continue from previous beat",
      transitionOut,
      imagePromptBase: "",
      videoPromptBase: "",
    }, input.sceneId, index)

    return fallbackShot
  })
}

function normalizeShotSpec(item: unknown, sceneId: string, index: number): ShotSpec {
  const shot = typeof item === "object" && item !== null ? item as Record<string, unknown> : {}
  const continuity = normalizeContinuity(shot.continuity)

  const normalized: ShotSpec = {
    id: normalizeString(shot.id, makeShotSpecId(sceneId, index)),
    sceneId,
    order: clampInteger(shot.order, index, 0, 99),
    narrativePurpose: normalizeString(shot.narrativePurpose),
    dramaticBeat: normalizeString(shot.dramaticBeat),
    shotType: normalizeString(shot.shotType),
    shotSize: normalizeString(shot.shotSize),
    composition: normalizeString(shot.composition),
    camera: normalizeString(shot.camera),
    blocking: normalizeString(shot.blocking),
    subject: normalizeString(shot.subject),
    environment: normalizeString(shot.environment),
    props: normalizeStringArray(shot.props),
    lighting: normalizeString(shot.lighting),
    palette: normalizeStringArray(shot.palette),
    continuity,
    transitionIn: normalizeString(shot.transitionIn),
    transitionOut: normalizeString(shot.transitionOut),
    imagePromptBase: normalizeString(shot.imagePromptBase),
    videoPromptBase: normalizeString(shot.videoPromptBase),
  }

  if (!normalized.imagePromptBase) {
    normalized.imagePromptBase = fallbackPromptBase(normalized)
  }

  if (!normalized.videoPromptBase) {
    normalized.videoPromptBase = [normalized.imagePromptBase, normalized.blocking, normalized.transitionOut]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(", ")
  }

  return normalized
}

export function buildShotPlannerSystemPrompt(input: Omit<ShotPlannerInput, "analysis" | "actions" | "sceneText">): string {
  const styleDirective = resolveStyleDirective(input.style)

  return `You are Shot Planner, the third stage of a cinematic planning pipeline.
Your job is to translate scene analysis plus an explicit action split into a sequence of structured ShotSpec objects.
Do not write final image prompts or polished video prompts. Only write planning-level ShotSpec data.

Return valid JSON array only. Each array item must have this exact shape:
{
  "id": "string",
  "sceneId": "string",
  "order": 0,
  "narrativePurpose": "string",
  "dramaticBeat": "string",
  "shotType": "string",
  "shotSize": "string",
  "composition": "string",
  "camera": "string",
  "blocking": "string",
  "subject": "string",
  "environment": "string",
  "props": ["string"],
  "lighting": "string",
  "palette": ["string"],
  "continuity": {
    "characterIds": ["string"],
    "wardrobeState": { "character": "state" },
    "propIds": ["string"],
    "locationId": "string or null",
    "timeOfDay": "string",
    "screenDirection": "string",
    "eyeline": "string",
    "axisOfAction": "string",
    "carryOverFromPrevious": "string",
    "setupForNext": "string",
    "lockedVisualAnchors": ["string"]
  },
  "transitionIn": "string",
  "transitionOut": "string",
  "imagePromptBase": "string",
  "videoPromptBase": "string"
}

Rules:
- Use the action split as the backbone for coverage.
- Plan the scene as a sequence with visual rhythm and continuity.
- Think shot-to-shot, not isolated coverage.
- Use transitions and continuity fields intentionally.
- imagePromptBase and videoPromptBase are structured foundations, not final polished prompts.
- Keep the number of shots near the recommended shot count unless the analysis strongly implies otherwise.
- Preserve screenplay language in narrativePurpose and dramaticBeat when appropriate.
- Use English technical terminology for camera craft when useful.

${DEAKINS_RULES}
${SHOT_TRANSITION_RULES}

Visual style direction: ${styleDirective}
${buildBreakdownConfigPrompt(input.config)}
${buildBibleContextPrompt(input.bible)}

Respond with JSON only.`
}

export function buildShotPlannerUserMessage(input: ShotPlannerInput): string {
  const screenplayExcerpt = buildScreenplayExcerpt(input.sceneText)

  return `Plan structured cinematic shots for scene ${input.sceneId}.\n\nScene analysis summary:\n${serializeForPrompt(toShotPlannerAnalysisPayload(input.analysis))}\n\nAction split:\n${serializeForPrompt(toShotPlannerActionPayload(input.actions))}${screenplayExcerpt ? `\n\nScreenplay excerpt:\n${screenplayExcerpt}` : ""}`
}

export function parseShotPlannerResponse(rawText: string, sceneId: string): ShotSpec[] {
  const parsed = JSON.parse(extractJsonArray(rawText)) as unknown

  if (!Array.isArray(parsed)) {
    throw new Error("Shot Planner returned non-array response")
  }

  return parsed.map((item, index) => normalizeShotSpec(item, sceneId, index))
}