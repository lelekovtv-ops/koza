import type { SceneAnalysis } from "@/lib/cinematic/sceneAnalyst"
import {
  buildBreakdownConfigPrompt,
  enrichText,
  resolveBreakdownConfig,
  type BreakdownEngineConfig,
} from "@/lib/cinematic/config"
import type { ShotMemory } from "@/lib/cinematic/shotMemory"
import {
  buildBibleContextPrompt,
  clampInteger,
  extractJsonArray,
  normalizeString,
  normalizeStringArray,
  serializeForPrompt,
  type CinematicBibleContext,
  type CinematicStyleContext,
  resolveStyleDirective,
} from "@/lib/cinematic/stageUtils"
import type { ContinuityPromptBlocks, ImagePromptPackage, ShotRelation, ShotSpec, VideoPromptPackage } from "@/types/cinematic"

export interface PromptComposerInput {
  sceneId: string
  analysis: SceneAnalysis
  shots: ShotSpec[]
  memories: ShotMemory[]
  relations: ShotRelation[]
  config?: BreakdownEngineConfig
  sceneText?: string
  bible?: CinematicBibleContext
  style?: CinematicStyleContext
}

export interface PromptComposerShot {
  shotId: string
  label: string
  type: "image"
  duration: number
  notes: string
  shotSize: string
  cameraMotion: string
  caption: string
  directorNote: string
  cameraNote: string
  imagePrompt: string
  videoPrompt: string
  visualDescription: string
  imagePackage: ImagePromptPackage
  videoPackage: VideoPromptPackage
}

type PromptComposerShotPayload = {
  id: string
  order: number
  narrativePurpose: string
  dramaticBeat: string
  shotType: string
  shotSize: string
  composition: string
  camera: string
  blocking: string
  subject: string
  environment: string
  props: string[]
  lighting: string
  palette: string[]
  transitionIn: string
  transitionOut: string
  imagePromptBase: string
  videoPromptBase: string
  continuity: {
    characterIds: string[]
    wardrobeState: Record<string, string>
    locationId: string | null
    screenDirection: string
    eyeline: string
    axisOfAction: string
    carryOverFromPrevious: string
    setupForNext: string
    lockedVisualAnchors: string[]
    continuityWarnings: string[]
    keyframeRole: ShotSpec["continuity"]["keyframeRole"]
    keyframeReason: string
    anchorShotId: string | null
    promptBlocks: ContinuityPromptBlocks
  }
}

type PromptComposerMemoryPayload = {
  shotId: string
  lockedAnchors: string[]
  carryOverInstructions: string
  setupForNext: string
  lightingState: string
  paletteState: string[]
  compositionSignature: string
  keyframeRole: ShotMemory["keyframeRole"]
  anchorShotId: string | null
  promptBlocks: ContinuityPromptBlocks
}

type PromptComposerRelationPayload = {
  fromShotId: string
  toShotId: string
  relationType: ShotRelation["relationType"]
  relationIntent: ShotRelation["relationIntent"]
  reason: string
  continuityConstraints: string[]
}

function compactText(values: Array<string | null | undefined>): string {
  return values.map((value) => value?.trim() ?? "").filter(Boolean).join(". ")
}

function normalizePreferredText(value: unknown, fallback: string, options?: { rejectGenericShotLabel?: boolean }): string {
  if (typeof value !== "string") {
    return fallback
  }

  const trimmed = value.trim()

  if (!trimmed) {
    return fallback
  }

  if (/^(n\/a|none|null|undefined)$/i.test(trimmed)) {
    return fallback
  }

  if (options?.rejectGenericShotLabel && /^shot\s+\d+[a-z]?$/i.test(trimmed)) {
    return fallback
  }

  return trimmed
}

function buildPromptComposerSceneExcerpt(sceneText?: string): string {
  if (!sceneText) {
    return ""
  }

  return sceneText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 18)
    .join("\n")
}

function toPromptShotPayload(shot: ShotSpec): PromptComposerShotPayload {
  return {
    id: shot.id,
    order: shot.order,
    narrativePurpose: shot.narrativePurpose,
    dramaticBeat: shot.dramaticBeat,
    shotType: shot.shotType,
    shotSize: shot.shotSize,
    composition: shot.composition,
    camera: shot.camera,
    blocking: shot.blocking,
    subject: shot.subject,
    environment: shot.environment,
    props: shot.props,
    lighting: shot.lighting,
    palette: shot.palette,
    transitionIn: shot.transitionIn,
    transitionOut: shot.transitionOut,
    imagePromptBase: shot.imagePromptBase,
    videoPromptBase: shot.videoPromptBase,
    continuity: {
      characterIds: shot.continuity.characterIds,
      wardrobeState: shot.continuity.wardrobeState,
      locationId: shot.continuity.locationId,
      screenDirection: shot.continuity.screenDirection,
      eyeline: shot.continuity.eyeline,
      axisOfAction: shot.continuity.axisOfAction,
      carryOverFromPrevious: shot.continuity.carryOverFromPrevious,
      setupForNext: shot.continuity.setupForNext,
      lockedVisualAnchors: shot.continuity.lockedVisualAnchors,
      continuityWarnings: shot.continuity.continuityWarnings,
      keyframeRole: shot.continuity.keyframeRole,
      keyframeReason: shot.continuity.keyframeReason,
      anchorShotId: shot.continuity.anchorShotId,
      promptBlocks: shot.continuity.promptBlocks,
    },
  }
}

function toPromptMemoryPayload(memory: ShotMemory): PromptComposerMemoryPayload {
  return {
    shotId: memory.shotId,
    lockedAnchors: memory.lockedAnchors,
    carryOverInstructions: memory.carryOverInstructions,
    setupForNext: memory.setupForNext,
    lightingState: memory.lightingState,
    paletteState: memory.paletteState,
    compositionSignature: memory.compositionSignature,
    keyframeRole: memory.keyframeRole,
    anchorShotId: memory.anchorShotId,
    promptBlocks: memory.promptBlocks,
  }
}

function toPromptRelationPayload(relation: ShotRelation): PromptComposerRelationPayload {
  return {
    fromShotId: relation.fromShotId,
    toShotId: relation.toShotId,
    relationType: relation.relationType,
    relationIntent: relation.relationIntent,
    reason: relation.reason,
    continuityConstraints: relation.continuityConstraints,
  }
}

function formatNaturalList(values: string[]): string {
  if (values.length === 0) return ""
  if (values.length === 1) return values[0]
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`
}

function cleanAnchors(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function formatPromptBlock(title: string, values: string[]): string {
  const cleaned = cleanAnchors(values)
  const body = cleaned.length > 0
    ? cleaned.map((value) => `- ${value}`).join("\n")
    : "- None."

  return `${title}:\n${body}`
}

function joinPromptSections(values: Array<string | null | undefined>): string {
  return values.map((value) => value?.trim() ?? "").filter(Boolean).join("\n")
}

function buildContinuityConstraintText(shot: ShotSpec, memory?: ShotMemory, nextMemory?: ShotMemory): string {
  const promptBlocks = shot.continuity.promptBlocks
  const fallbackPreserve = cleanAnchors([...(memory?.lockedAnchors ?? []), ...shot.continuity.lockedVisualAnchors])
  const preserve = promptBlocks.preserve.length > 0
    ? promptBlocks.preserve
    : fallbackPreserve.length > 0
      ? fallbackPreserve.map((value) => `Preserve ${value}.`)
      : ["Preserve the established visual continuity from the previous shot."]

  const change = promptBlocks.change.length > 0
    ? promptBlocks.change
    : shot.continuity.continuityWarnings.length > 0
      ? [`Only allow intentional changes because known risks include ${formatNaturalList(shot.continuity.continuityWarnings)}.`]
      : ["Change framing scale, lens emphasis, and blocking only where the locked continuity anchors stay intact."]

  const prepare = promptBlocks.prepare.length > 0
    ? promptBlocks.prepare
    : [memory?.setupForNext || nextMemory?.setupForNext || shot.continuity.setupForNext || "Prepare the next shot without breaking the established scene geography."]

  const doNot = promptBlocks.doNot.length > 0
    ? promptBlocks.doNot
    : [memory?.carryOverInstructions || shot.continuity.carryOverFromPrevious || "Do not let the model freely alter the established world state."]

  const roleHeader = shot.continuity.keyframeRole === "key"
    ? `KEY SHOT: ${shot.continuity.keyframeReason}`
    : shot.continuity.anchorShotId
      ? `ANCHOR SHOT: ${shot.continuity.anchorShotId}`
      : ""

  return joinPromptSections([
    roleHeader,
    formatPromptBlock("PRESERVE", preserve),
    formatPromptBlock("CHANGE", change),
    formatPromptBlock("PREPARE", prepare),
    formatPromptBlock("DO NOT", doNot),
  ])
}

function buildRelationTransitionText(relation?: ShotRelation): string {
  if (!relation) {
    return ""
  }

  const intentText = (() => {
    switch (relation.relationIntent) {
      case "focus_shift":
        return "Shift focus from the previous emphasis to a new visual target."
      case "reaction":
        return "Emphasize the emotional response created by the previous shot."
      case "action_continuation":
        return "Continue the same action seamlessly across the cut."
      case "geography":
        return "Reveal the spatial context and keep the viewer oriented in the scene."
      case "tension":
        return "Increase tension while preserving the established visual line."
      case "reveal":
        return "Reveal new information while staying grounded in the previous shot's continuity."
      default:
        return ""
    }
  })()

  const typeText = (() => {
    switch (relation.relationType) {
      case "cut_on_action":
        return "Continue from the previous shot with a cut on action while preserving movement continuity."
      case "match_cut":
        return relation.reason.toLowerCase().includes("push-in")
          ? "Continue from the previous shot with a push-in to tighter framing while matching subject position."
          : "Match framing and screen position from the previous shot across the cut."
      case "insert":
        return "Insert detail of the object or hand while preserving object continuity from the previous shot."
      case "reaction":
        return "Cut to the reaction while maintaining eyeline and emotional continuity from the previous shot."
      case "reverse":
        return "Reverse the angle from the previous shot while preserving axis and eyeline continuity."
      case "establish":
        return "Re-establish the scene geography before continuing the sequence."
      case "parallel":
        return "Continue from the previous shot with parallel visual logic and stable scene continuity."
      default:
        return ""
    }
  })()

  return compactText([typeText, intentText])
}

function mergePromptWithContinuity(prompt: string, continuityConstraint: string): string {
  if (!continuityConstraint) {
    return prompt
  }

  const trimmedPrompt = prompt.trim()
  if (!trimmedPrompt) {
    return continuityConstraint
  }

  if (trimmedPrompt.toLowerCase().includes(continuityConstraint.toLowerCase())) {
    return trimmedPrompt
  }

  const suffix = trimmedPrompt.endsWith(".") ? "" : "."
  return `${trimmedPrompt}${suffix}\n${continuityConstraint}`
}

function buildFallbackImagePackage(
  shot: ShotSpec,
  styleDirective: string,
  continuityConstraint: string,
): ImagePromptPackage {
  const continuityPrompt = continuityConstraint

  const finalPrompt = joinPromptSections([
    shot.imagePromptBase,
    shot.subject,
    shot.environment,
    shot.lighting,
    shot.palette.length > 0 ? `palette ${shot.palette.join(", ")}` : "",
    continuityPrompt,
    styleDirective,
  ])

  return {
    shotId: shot.id,
    basePrompt: shot.imagePromptBase,
    subjectPrompt: shot.subject,
    environmentPrompt: shot.environment,
    lightingPrompt: shot.lighting,
    continuityPrompt,
    stylePrompt: styleDirective,
    negativePrompt: "text, watermark, logo, broken anatomy, off-axis continuity",
    referenceImageIds: [],
    finalPrompt,
  }
}

function buildFallbackVideoPackage(
  shot: ShotSpec,
  styleDirective: string,
  continuityConstraint: string,
  relationTransition: string,
): VideoPromptPackage {
  const continuityPrompt = continuityConstraint
  const transitionPrompt = compactText([relationTransition, shot.transitionIn, shot.transitionOut])
  const finalPrompt = joinPromptSections([
    shot.videoPromptBase,
    shot.blocking,
    shot.camera,
    continuityPrompt,
    transitionPrompt,
    styleDirective,
  ])

  return {
    shotId: shot.id,
    basePrompt: shot.videoPromptBase,
    motionPrompt: shot.blocking,
    cameraPrompt: shot.camera,
    continuityPrompt,
    transitionPrompt,
    stylePrompt: styleDirective,
    negativePrompt: "jump cuts, axis break, inconsistent eyelines, unwanted text",
    durationMs: null,
    referenceImageIds: [],
    finalPrompt,
  }
}

function normalizeImagePackage(
  value: unknown,
  shot: ShotSpec,
  styleDirective: string,
  continuityConstraint: string,
): ImagePromptPackage {
  const imagePackage = typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
  const fallback = buildFallbackImagePackage(shot, styleDirective, continuityConstraint)

  return {
    shotId: normalizeString(imagePackage.shotId, shot.id),
    basePrompt: normalizeString(imagePackage.basePrompt, fallback.basePrompt),
    subjectPrompt: normalizeString(imagePackage.subjectPrompt, fallback.subjectPrompt),
    environmentPrompt: normalizeString(imagePackage.environmentPrompt, fallback.environmentPrompt),
    lightingPrompt: normalizeString(imagePackage.lightingPrompt, fallback.lightingPrompt),
    continuityPrompt: normalizeString(imagePackage.continuityPrompt, fallback.continuityPrompt),
    stylePrompt: normalizeString(imagePackage.stylePrompt, fallback.stylePrompt),
    negativePrompt: normalizeString(imagePackage.negativePrompt, fallback.negativePrompt),
    referenceImageIds: normalizeStringArray(imagePackage.referenceImageIds),
    finalPrompt: mergePromptWithContinuity(normalizeString(imagePackage.finalPrompt, fallback.finalPrompt), continuityConstraint),
  }
}

function normalizeVideoPackage(
  value: unknown,
  shot: ShotSpec,
  styleDirective: string,
  continuityConstraint: string,
  relationTransition: string,
): VideoPromptPackage {
  const videoPackage = typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
  const fallback = buildFallbackVideoPackage(shot, styleDirective, continuityConstraint, relationTransition)

  return {
    shotId: normalizeString(videoPackage.shotId, shot.id),
    basePrompt: normalizeString(videoPackage.basePrompt, fallback.basePrompt),
    motionPrompt: normalizeString(videoPackage.motionPrompt, fallback.motionPrompt),
    cameraPrompt: normalizeString(videoPackage.cameraPrompt, fallback.cameraPrompt),
    continuityPrompt: normalizeString(videoPackage.continuityPrompt, fallback.continuityPrompt),
    transitionPrompt: normalizeString(videoPackage.transitionPrompt, fallback.transitionPrompt),
    stylePrompt: normalizeString(videoPackage.stylePrompt, fallback.stylePrompt),
    negativePrompt: normalizeString(videoPackage.negativePrompt, fallback.negativePrompt),
    durationMs: typeof videoPackage.durationMs === "number" && Number.isFinite(videoPackage.durationMs)
      ? Math.max(0, Math.round(videoPackage.durationMs))
      : fallback.durationMs,
    referenceImageIds: normalizeStringArray(videoPackage.referenceImageIds),
    finalPrompt: mergePromptWithContinuity(normalizeString(videoPackage.finalPrompt, fallback.finalPrompt), continuityConstraint),
  }
}

function normalizePromptComposerShot(
  item: unknown,
  shot: ShotSpec,
  styleDirective: string,
  config: BreakdownEngineConfig,
  memory: ShotMemory | undefined,
  nextMemory: ShotMemory | undefined,
  relation: ShotRelation | undefined,
): PromptComposerShot {
  const composed = typeof item === "object" && item !== null ? item as Record<string, unknown> : {}
  const continuityConstraint = buildContinuityConstraintText(shot, memory, nextMemory)
  const relationTransition = buildRelationTransitionText(relation)
  const imagePackage = normalizeImagePackage(composed.imagePackage, shot, styleDirective, continuityConstraint)
  const videoPackage = normalizeVideoPackage(composed.videoPackage, shot, styleDirective, continuityConstraint, relationTransition)

  const notes = normalizePreferredText(
    composed.notes,
    compactText([
      shot.narrativePurpose,
      shot.blocking,
      shot.continuity.carryOverFromPrevious,
      shot.continuity.setupForNext,
      continuityConstraint,
    ])
  )
  const directorNote = normalizePreferredText(composed.directorNote, compactText([shot.narrativePurpose, shot.dramaticBeat, shot.transitionOut]))
  const cameraNote = normalizePreferredText(composed.cameraNote, compactText([shot.shotType, shot.composition, shot.camera, shot.lighting]))

  return {
    shotId: normalizePreferredText(composed.shotId, shot.id),
    label: normalizePreferredText(composed.label, shot.narrativePurpose || shot.subject || `Shot ${shot.order + 1}`, { rejectGenericShotLabel: true }),
    type: "image",
    duration: clampInteger(composed.duration, 3000, 500, 15000),
    notes: enrichText(notes, `Keep the scene readable and emotionally clear for the next shot.`, config.textRichness),
    shotSize: normalizePreferredText(composed.shotSize, shot.shotSize),
    cameraMotion: normalizePreferredText(composed.cameraMotion, shot.camera),
    caption: normalizePreferredText(composed.caption, compactText([shot.subject, shot.environment])),
    directorNote: enrichText(directorNote, `Let the emotional turn stay obvious for the viewer.`, config.textRichness),
    cameraNote: enrichText(cameraNote, `Keep the framing logic and movement motivation easy to follow.`, config.textRichness),
    imagePrompt: mergePromptWithContinuity(normalizePreferredText(composed.imagePrompt, imagePackage.finalPrompt), continuityConstraint),
    videoPrompt: mergePromptWithContinuity(
      normalizePreferredText(composed.videoPrompt, videoPackage.finalPrompt),
      compactText([relationTransition, continuityConstraint]),
    ),
    visualDescription: normalizePreferredText(composed.visualDescription, compactText([shot.subject, shot.environment, shot.lighting])),
    imagePackage,
    videoPackage,
  }
}

export function buildPromptComposerSystemPrompt(input: Omit<PromptComposerInput, "analysis" | "shots" | "memories" | "relations">): string {
  const styleDirective = resolveStyleDirective(input.style)

  return `You are Prompt Composer, the fourth stage that writes production-facing text after continuity and relations are known.
You do not plan new shots. You do not change shot order. You do not merge or split shots.
You only translate structured ShotSpec data into final production-facing text and prompt packages.

Return valid JSON array only. Each object must have this shape:
{
  "shotId": "string",
  "label": "string",
  "duration": 3000,
  "shotSize": "string",
  "cameraMotion": "string",
  "caption": "string",
  "directorNote": "string",
  "cameraNote": "string",
  "notes": "string",
  "visualDescription": "string",
  "imagePrompt": "string",
  "videoPrompt": "string",
  "imagePackage": {
    "shotId": "string",
    "basePrompt": "string",
    "subjectPrompt": "string",
    "environmentPrompt": "string",
    "lightingPrompt": "string",
    "continuityPrompt": "string",
    "stylePrompt": "string",
    "negativePrompt": "string",
    "referenceImageIds": ["string"],
    "finalPrompt": "string"
  },
  "videoPackage": {
    "shotId": "string",
    "basePrompt": "string",
    "motionPrompt": "string",
    "cameraPrompt": "string",
    "continuityPrompt": "string",
    "transitionPrompt": "string",
    "stylePrompt": "string",
    "negativePrompt": "string",
    "durationMs": 3000,
    "referenceImageIds": ["string"],
    "finalPrompt": "string"
  }
}

Rules:
- Keep shot order exactly as provided.
- Keep the narrative intent exactly as provided.
- caption and directorNote should stay in the screenplay language when practical.
- cameraNote may use English technical film terminology.
- imagePrompt and videoPrompt must be English only.
- imagePrompt describes a still frame.
- videoPrompt extends the image prompt with motion, duration and pacing.
- Use the provided continuity memory to state what must remain identical, what may change, and what must prepare the next shot.
- Use the provided shot relations to express transition logic in the video prompt.
- Preserve continuity details from the ShotSpec continuity block.
- continuityPrompt must preserve the exact section headers PRESERVE, CHANGE, PREPARE, and DO NOT.
- If continuity.keyframeRole is key, treat that shot as canonical and avoid redefining it later unless CHANGE explicitly allows it.
- Visual style directive: ${styleDirective}
${buildBreakdownConfigPrompt(input.config)}
${buildBibleContextPrompt(input.bible)}

Respond with JSON only.`
}

export function buildPromptComposerUserMessage(input: PromptComposerInput): string {
  const analysisSummary = {
    sceneSummary: input.analysis.sceneSummary,
    emotionalTone: input.analysis.emotionalTone,
    geography: input.analysis.geography,
    visualMotifs: input.analysis.visualMotifs,
    continuityRisks: input.analysis.continuityRisks,
  }

  const screenplayExcerpt = buildPromptComposerSceneExcerpt(input.sceneText)

  return `Compose final prompt packages for scene ${input.sceneId}.\n\nScene analysis summary:\n${serializeForPrompt(analysisSummary)}${screenplayExcerpt ? `\n\nScreenplay excerpt:\n${screenplayExcerpt}` : ""}\n\nShot specs:\n${serializeForPrompt(input.shots.map(toPromptShotPayload))}\n\nContinuity memory:\n${serializeForPrompt(input.memories.map(toPromptMemoryPayload))}\n\nShot relations:\n${serializeForPrompt(input.relations.map(toPromptRelationPayload))}`
}

export function composePromptPackagesLocally(input: PromptComposerInput): PromptComposerShot[] {
  const styleDirective = resolveStyleDirective(input.style)
  const config = resolveBreakdownConfig(input.config)
  const memoryByShotId = new Map(input.memories.map((memory) => [memory.shotId, memory]))
  const relationByToShotId = new Map(input.relations.map((relation) => [relation.toShotId, relation]))

  return input.shots.map((shot, index) => normalizePromptComposerShot(
    {},
    shot,
    styleDirective,
    config,
    memoryByShotId.get(shot.id),
    index < input.shots.length - 1 ? memoryByShotId.get(input.shots[index + 1].id) : undefined,
    relationByToShotId.get(shot.id),
  ))
}

export function parsePromptComposerResponse(
  rawText: string,
  shots: ShotSpec[],
  memories: ShotMemory[],
  relations: ShotRelation[],
  config?: BreakdownEngineConfig,
  style?: CinematicStyleContext,
): PromptComposerShot[] {
  const parsed = JSON.parse(extractJsonArray(rawText)) as unknown
  const styleDirective = resolveStyleDirective(style)
  const resolvedConfig = resolveBreakdownConfig(config)

  if (!Array.isArray(parsed)) {
    throw new Error("Prompt Composer returned non-array response")
  }

  const memoryByShotId = new Map(memories.map((memory) => [memory.shotId, memory]))
  const relationByToShotId = new Map(relations.map((relation) => [relation.toShotId, relation]))

  return shots.map((shot, index) => normalizePromptComposerShot(
    parsed[index],
    shot,
    styleDirective,
    resolvedConfig,
    memoryByShotId.get(shot.id),
    index < shots.length - 1 ? memoryByShotId.get(shots[index + 1].id) : undefined,
    relationByToShotId.get(shot.id),
  ))
}