import type { SceneBreakdownBeat } from "@/types/cinematic"
import {
  buildBibleContextPrompt,
  clampInteger,
  extractJsonObject,
  normalizeString,
  normalizeStringArray,
  serializeForPrompt,
  type CinematicBibleContext,
  type CinematicStyleContext,
  resolveStyleDirective,
} from "@/lib/cinematic/stageUtils"

export interface SceneAnalysis {
  sceneSummary: string
  dramaticBeats: SceneBreakdownBeat[]
  emotionalTone: string
  geography: string
  characterPresence: string[]
  propCandidates: string[]
  visualMotifs: string[]
  continuityRisks: string[]
  recommendedShotCount: number
}

export interface SceneAnalystInput {
  sceneText: string
  sceneId?: string
  bible?: CinematicBibleContext
  style?: CinematicStyleContext
}

function normalizeBeat(item: unknown, sceneId: string, index: number): SceneBreakdownBeat {
  const beat = typeof item === "object" && item !== null ? item as Record<string, unknown> : {}

  return {
    id: normalizeString(beat.id, `${sceneId}-beat-${index + 1}`),
    sceneId,
    order: clampInteger(beat.order, index, 0, 99),
    title: normalizeString(beat.title, `Beat ${index + 1}`),
    summary: normalizeString(beat.summary),
    narrativeFunction: normalizeString(beat.narrativeFunction),
    emotionalShift: normalizeString(beat.emotionalShift),
    subjectFocus: normalizeString(beat.subjectFocus),
    characterIds: normalizeStringArray(beat.characterIds),
    locationId: normalizeString(beat.locationId) || null,
    propIds: normalizeStringArray(beat.propIds),
    visualAnchors: normalizeStringArray(beat.visualAnchors),
    transitionOut: normalizeString(beat.transitionOut),
  }
}

export function buildSceneAnalystSystemPrompt(input: Omit<SceneAnalystInput, "sceneText">): string {
  const styleDirective = resolveStyleDirective(input.style)

  return `You are Scene Analyst, the first stage of a cinematic planning pipeline.
Your only job is to interpret a scene and return structured analysis.
Do not write shots. Do not write image prompts. Do not write video prompts.

Return one valid JSON object with this exact top-level shape:
{
  "sceneSummary": "string",
  "dramaticBeats": [
    {
      "id": "string",
      "sceneId": "string",
      "order": 0,
      "title": "string",
      "summary": "string",
      "narrativeFunction": "string",
      "emotionalShift": "string",
      "subjectFocus": "string",
      "characterIds": ["string"],
      "locationId": "string or null",
      "propIds": ["string"],
      "visualAnchors": ["string"],
      "transitionOut": "string"
    }
  ],
  "emotionalTone": "string",
  "geography": "string",
  "characterPresence": ["string"],
  "propCandidates": ["string"],
  "visualMotifs": ["string"],
  "continuityRisks": ["string"],
  "recommendedShotCount": 6
}

Requirements:
- Analyze the scene as one coherent dramatic unit.
- Dramatic beats should reflect story progression, not camera coverage.
- continuityRisks should mention eyelines, geography, props, wardrobe, time-of-day, entrances/exits, and action carry-over when relevant.
- recommendedShotCount should be realistic for this scene.
- Preserve the screenplay language for story-facing fields when possible.
- Respect this visual style direction when identifying motifs and risks: ${styleDirective}
${buildBibleContextPrompt(input.bible)}

Respond with JSON only.`
}

export function buildSceneAnalystUserMessage(sceneText: string): string {
  return `Analyze this scene for cinematic planning:\n\n${sceneText.trim()}`
}

export function parseSceneAnalysisResponse(rawText: string, input: Omit<SceneAnalystInput, "sceneText">): SceneAnalysis {
  const parsed = JSON.parse(extractJsonObject(rawText)) as Record<string, unknown>
  const sceneId = input.sceneId ?? "scene"

  return {
    sceneSummary: normalizeString(parsed.sceneSummary),
    dramaticBeats: Array.isArray(parsed.dramaticBeats)
      ? parsed.dramaticBeats.map((beat, index) => normalizeBeat(beat, sceneId, index))
      : [],
    emotionalTone: normalizeString(parsed.emotionalTone),
    geography: normalizeString(parsed.geography),
    characterPresence: normalizeStringArray(parsed.characterPresence),
    propCandidates: normalizeStringArray(parsed.propCandidates),
    visualMotifs: normalizeStringArray(parsed.visualMotifs),
    continuityRisks: normalizeStringArray(parsed.continuityRisks),
    recommendedShotCount: clampInteger(parsed.recommendedShotCount, 6, 1, 24),
  }
}

export function serializeSceneAnalysisForPrompt(analysis: SceneAnalysis): string {
  return serializeForPrompt(analysis)
}