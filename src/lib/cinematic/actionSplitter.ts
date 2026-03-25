import type { SceneAnalysis } from "@/lib/cinematic/sceneAnalyst"
import { buildBreakdownConfigPrompt, type BreakdownEngineConfig } from "@/lib/cinematic/config"
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

export interface ActionSplitStep {
  id: string
  sceneId: string
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

export interface ActionSplitterInput {
  sceneId: string
  analysis: SceneAnalysis
  config?: BreakdownEngineConfig
  sceneText?: string
  bible?: CinematicBibleContext
  style?: CinematicStyleContext
}

function normalizeActionStep(item: unknown, sceneId: string, index: number): ActionSplitStep {
  const step = typeof item === "object" && item !== null ? item as Record<string, unknown> : {}

  return {
    id: normalizeString(step.id, `${sceneId}-action-${index + 1}`),
    sceneId,
    order: clampInteger(step.order, index, 0, 99),
    title: normalizeString(step.title, `Action ${index + 1}`),
    summary: normalizeString(step.summary),
    whyItMatters: normalizeString(step.whyItMatters),
    visibleChange: normalizeString(step.visibleChange),
    emotionalChange: normalizeString(step.emotionalChange),
    characterIds: normalizeStringArray(step.characterIds),
    propIds: normalizeStringArray(step.propIds),
    locationId: normalizeString(step.locationId) || null,
    transitionOut: normalizeString(step.transitionOut),
  }
}

function buildScreenplayExcerpt(sceneText?: string): string {
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

function toPromptPayload(analysis: SceneAnalysis) {
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

export function buildActionSplitterSystemPrompt(input: Omit<ActionSplitterInput, "analysis" | "sceneText">): string {
  const styleDirective = resolveStyleDirective(input.style)

  return `You are Action Splitter, the second stage of a cinematic planning pipeline.
Your job is to break the scene analysis into clear visible actions or beats before shot planning begins.
Do not write shots. Do not write prompts. Do not solve continuity yet.

Return valid JSON array only. Each array item must have this exact shape:
{
  "id": "string",
  "sceneId": "string",
  "order": 0,
  "title": "string",
  "summary": "string",
  "whyItMatters": "string",
  "visibleChange": "string",
  "emotionalChange": "string",
  "characterIds": ["string"],
  "propIds": ["string"],
  "locationId": "string or null",
  "transitionOut": "string"
}

Rules:
- Split the scene into interesting actions or beats that can become shots later.
- Each step should describe what visibly changes, not camera coverage.
- Keep the order chronological.
- whyItMatters should explain in plain language why this moment matters.
- Preserve screenplay language where useful.
- If the screenplay or scene text is in Russian, keep all human-facing fields in Russian: title, summary, whyItMatters, visibleChange, emotionalChange, transitionOut.
- Do not switch to English for planning prose when the scene is Russian.
- Respect this visual style direction when deciding emphasis: ${styleDirective}
${buildBreakdownConfigPrompt(input.config)}
${buildBibleContextPrompt(input.bible)}

Respond with JSON only.`
}

export function buildActionSplitterUserMessage(input: ActionSplitterInput): string {
  const screenplayExcerpt = buildScreenplayExcerpt(input.sceneText)

  return `Break scene ${input.sceneId} into visible actions before shot planning.\n\nScene analysis:\n${serializeForPrompt(toPromptPayload(input.analysis))}${screenplayExcerpt ? `\n\nScreenplay excerpt:\n${screenplayExcerpt}` : ""}`
}

export function parseActionSplitResponse(rawText: string, sceneId: string): ActionSplitStep[] {
  const parsed = JSON.parse(extractJsonArray(rawText)) as unknown

  if (!Array.isArray(parsed)) {
    throw new Error("Action Splitter returned non-array response")
  }

  return parsed.map((item, index) => normalizeActionStep(item, sceneId, index))
}

export function composeActionStepsLocally(input: ActionSplitterInput): ActionSplitStep[] {
  if (input.analysis.dramaticBeats.length > 0) {
    return input.analysis.dramaticBeats.map((beat, index) => normalizeActionStep({
      id: `${input.sceneId}-action-${index + 1}`,
      sceneId: input.sceneId,
      order: index,
      title: beat.title || `Action ${index + 1}`,
      summary: beat.summary || beat.narrativeFunction || beat.subjectFocus || input.analysis.sceneSummary,
      whyItMatters: beat.narrativeFunction || beat.emotionalShift || "This changes what the moment means.",
      visibleChange: beat.summary || beat.subjectFocus || "The scene moves into the next visible beat.",
      emotionalChange: beat.emotionalShift || input.analysis.emotionalTone,
      characterIds: beat.characterIds,
      propIds: beat.propIds,
      locationId: beat.locationId,
      transitionOut: beat.transitionOut || "Move into the next beat.",
    }, input.sceneId, index))
  }

  return [normalizeActionStep({
    id: `${input.sceneId}-action-1`,
    sceneId: input.sceneId,
    order: 0,
    title: "Main action",
    summary: input.analysis.sceneSummary || "The scene moves through one main dramatic action.",
    whyItMatters: input.analysis.emotionalTone || "This sets the feeling of the scene.",
    visibleChange: input.analysis.sceneSummary || "The main visible action unfolds.",
    emotionalChange: input.analysis.emotionalTone,
    characterIds: input.analysis.characterPresence,
    propIds: input.analysis.propCandidates.slice(0, 4),
    locationId: null,
    transitionOut: "Move into the next planned shot.",
  }, input.sceneId, 0)]
}