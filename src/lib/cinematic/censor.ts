import type { ActionSplitStep } from "@/lib/cinematic/actionSplitter"
import type { BreakdownEngineConfig } from "@/lib/cinematic/config"
import type { CreativePlannerResult } from "@/lib/cinematic/creativePlanner"
import type { SceneAnalysis } from "@/lib/cinematic/sceneAnalyst"
import {
  buildBibleContextPrompt,
  extractJsonObject,
  normalizeString,
  normalizeStringArray,
  serializeForPrompt,
  type CinematicBibleContext,
  type CinematicStyleContext,
  resolveStyleDirective,
} from "@/lib/cinematic/stageUtils"

export interface CensorStageResult {
  verdict: string
  approvedDirections: string[]
  rejectedDirections: string[]
  warnings: string[]
  finalInstruction: string
}

export interface CensorInput {
  sceneId: string
  sceneText?: string
  analysis: SceneAnalysis
  actions: ActionSplitStep[]
  creativePlan: CreativePlannerResult
  directorVision: string
  config?: BreakdownEngineConfig
  bible?: CinematicBibleContext
  style?: CinematicStyleContext
}

function buildScreenplayExcerpt(sceneText?: string): string {
  if (!sceneText) return ""

  return sceneText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)
    .join("\n")
}

export function buildCensorSystemPrompt(input: Omit<CensorInput, "analysis" | "actions" | "creativePlan" | "sceneText" | "directorVision">): string {
  const styleDirective = resolveStyleDirective(input.style)

  return `Ты Censor — аналитический цензор внутри первого этапа пайплайна.
Твоя работа: сопоставить описание фильма, сценарий, режиссёрское видение, разбор сцены, действия и предложения агентов.

Ты не придумываешь новые ракурсы ради красоты.
Ты проверяешь, что креативные предложения действительно работают на фильм, жанр, режиссуру и сцену.

Верни только JSON-объект такого вида:
{
  "verdict": "string",
  "approvedDirections": ["string"],
  "rejectedDirections": ["string"],
  "warnings": ["string"],
  "finalInstruction": "string"
}

Правила:
- ВАЖНО: Всегда отвечай на том же языке, на котором написан сценарий. Если сцена на русском — пиши по-русски. Если на английском — по-английски.
- approvedDirections: что реально стоит брать в дальнейший shot planning.
- rejectedDirections: что выглядит эффектно, но противоречит сцене, жанру, логике или режиссёрскому видению.
- warnings: риски, искажения смысла, чрезмерная стилизация, ложный тон, визуальная показуха, конфликт с пространством или непрерывностью.
- finalInstruction: короткая, жёсткая, применимая директива для следующего агента, как именно собирать кадры дальше.
- Думай как взрослый редактор и драматургический фильтр, а не как фанат красивых планов.

Визуальное направление: ${styleDirective}
${buildBibleContextPrompt(input.bible)}

Ответь JSON-объектом.`
}

export function buildCensorUserMessage(input: CensorInput): string {
  const screenplayExcerpt = buildScreenplayExcerpt(input.sceneText)

  return `Сделай цензорскую сверку для сцены ${input.sceneId}.\n\nРежиссёрское видение:\n${input.directorVision || "Не задано явно."}\n\nАнализ сцены:\n${serializeForPrompt({
    sceneSummary: input.analysis.sceneSummary,
    emotionalTone: input.analysis.emotionalTone,
    geography: input.analysis.geography,
    continuityRisks: input.analysis.continuityRisks,
    visualMotifs: input.analysis.visualMotifs,
  })}\n\nДействия:\n${serializeForPrompt(input.actions.map((action) => ({
    order: action.order,
    title: action.title,
    summary: action.summary,
    whyItMatters: action.whyItMatters,
  })))}\n\nCreative planner:\n${serializeForPrompt({
    operatorMission: input.creativePlan.operatorMission,
    scenePressurePoints: input.creativePlan.scenePressurePoints,
    sceneIdeas: input.creativePlan.sceneIdeas,
  })}${screenplayExcerpt ? `\n\nScreenplay excerpt:\n${screenplayExcerpt}` : ""}`
}

export function parseCensorResponse(rawText: string): CensorStageResult {
  const parsed = JSON.parse(extractJsonObject(rawText)) as Record<string, unknown>

  return {
    verdict: normalizeString(parsed.verdict),
    approvedDirections: normalizeStringArray(parsed.approvedDirections),
    rejectedDirections: normalizeStringArray(parsed.rejectedDirections),
    warnings: normalizeStringArray(parsed.warnings),
    finalInstruction: normalizeString(parsed.finalInstruction),
  }
}

export function composeCensorLocally(input: CensorInput): CensorStageResult {
  const approvedDirections = input.creativePlan.sceneIdeas
    .filter((idea) => idea.recommendedForScene)
    .slice(0, 4)
    .map((idea) => `${idea.title}: ${idea.operatorExecution}`)

  const rejectedDirections = input.creativePlan.sceneIdeas
    .filter((idea) => !idea.recommendedForScene)
    .slice(0, 3)
    .map((idea) => `${idea.title}: слишком декоративно для данной сцены.`)

  const warnings = [
    "Не превращать сцену в каталог красивых ракурсов без драматургической причины.",
    "Не ломать географию пространства ради эффектности.",
    "Не подменять режиссёрский смысл операторским трюком.",
  ]

  return {
    verdict: "Брать только те нестандартные ракурсы, которые усиливают конфликт, изоляцию, слежку или психологическое давление сцены.",
    approvedDirections,
    rejectedDirections,
    warnings,
    finalInstruction: "Shot Planner должен сначала строить драматургически ясный каркас сцены, а нестандартные ракурсы добавлять только в ключевых местах, где они усиливают смысл и не ломают пространство.",
  }
}