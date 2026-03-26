import type { ActionSplitStep } from "@/lib/cinematic/actionSplitter"
import type { BreakdownEngineConfig } from "@/lib/cinematic/config"
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

export interface ScreenplaySceneContext {
  id: string
  title: string
  index: number
}

export interface ContextRouterResult {
  primaryLocation: string
  visibleSecondaryLocations: string[]
  offscreenLocations: string[]
  propAnchors: string[]
  environmentTransitions: string[]
  referenceRouting: string[]
  promptHints: string[]
}

export interface ContextRouterInput {
  sceneId: string
  sceneText?: string
  analysis: SceneAnalysis
  actions: ActionSplitStep[]
  screenplayContext?: {
    previousScene: ScreenplaySceneContext | null
    currentScene: ScreenplaySceneContext | null
    nextScene: ScreenplaySceneContext | null
  }
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

function inferWindowLinkedLocations(input: ContextRouterInput): string[] {
  const sceneText = (input.sceneText || "").toLowerCase()
  const mentionsWindow = /окн|балкон|жалюзи|стекл|видн|смотрит наружу|смотрит в окно/.test(sceneText)

  if (!mentionsWindow) {
    return []
  }

  const nextSceneTitle = input.screenplayContext?.nextScene?.title?.trim()
  return nextSceneTitle ? [nextSceneTitle] : []
}

function inferPropAnchors(input: ContextRouterInput): string[] {
  const text = (input.sceneText || "").toLowerCase()
  const candidates = [
    "окно",
    "жалюзи",
    "потолочный вентилятор",
    "стол",
    "листы сценария",
    "банка окурков",
    "машина",
    "телефон",
    "дверь",
  ]

  return candidates.filter((candidate) => text.includes(candidate.toLowerCase()))
}

export function buildContextRouterSystemPrompt(input: Omit<ContextRouterInput, "analysis" | "actions" | "sceneText" | "screenplayContext">): string {
  const styleDirective = resolveStyleDirective(input.style)

  return `Ты Context Router — отдельный stage в cinematic pipeline.
Твоя задача: смотреть не только на текущую сцену, но и на соседний screenplay context, чтобы понять:
- какая локация главная
- какие вторичные локации должны быть видимы в кадре
- какие локации пока остаются за кадром, но уже готовят следующий переход
- какие предметы и environmental anchors надо раздать в shot planning и image generation

Верни только JSON-объект такого вида:
{
  "primaryLocation": "string",
  "visibleSecondaryLocations": ["string"],
  "offscreenLocations": ["string"],
  "propAnchors": ["string"],
  "environmentTransitions": ["string"],
  "referenceRouting": ["string"],
  "promptHints": ["string"]
}

Правила:
- ВАЖНО: Всегда отвечай на том же языке, на котором написан сценарий. Если сцена на русском — пиши по-русски. Если на английском — по-английски.
- Не ограничивайся только текущим heading, если следующая сцена уже подсказывает мир за окном, подъезд, улицу, машину или внешний источник света.
- visibleSecondaryLocations: то, что должно быть видно в окне, отражении, проёме, фоне или свете.
- offscreenLocations: то, что ещё не видно напрямую, но уже драматически давит на текущую сцену.
- propAnchors: важные предметы, которые должны закрепиться визуально.
- referenceRouting: короткие правила, какой visual ref куда подмешивать.
- promptHints: короткие подсказки для downstream shot planner / prompt composer.

Визуальное направление: ${styleDirective}
${buildBibleContextPrompt(input.bible)}

Ответь JSON-объектом.`
}

export function buildContextRouterUserMessage(input: ContextRouterInput): string {
  const screenplayExcerpt = buildScreenplayExcerpt(input.sceneText)

  return `Собери контекст маршрутизации для сцены ${input.sceneId}.\n\nТекущий анализ сцены:\n${serializeForPrompt({
    sceneSummary: input.analysis.sceneSummary,
    emotionalTone: input.analysis.emotionalTone,
    geography: input.analysis.geography,
    propCandidates: input.analysis.propCandidates,
    visualMotifs: input.analysis.visualMotifs,
  })}\n\nДействия:\n${serializeForPrompt(input.actions.map((action) => ({
    order: action.order,
    title: action.title,
    summary: action.summary,
    visibleChange: action.visibleChange,
    propIds: action.propIds,
    locationId: action.locationId,
  })))}\n\nScreenplay context:\n${serializeForPrompt(input.screenplayContext)}${screenplayExcerpt ? `\n\nScreenplay excerpt:\n${screenplayExcerpt}` : ""}`
}

export function parseContextRouterResponse(rawText: string): ContextRouterResult {
  const parsed = JSON.parse(extractJsonObject(rawText)) as Record<string, unknown>

  return {
    primaryLocation: normalizeString(parsed.primaryLocation),
    visibleSecondaryLocations: normalizeStringArray(parsed.visibleSecondaryLocations),
    offscreenLocations: normalizeStringArray(parsed.offscreenLocations),
    propAnchors: normalizeStringArray(parsed.propAnchors),
    environmentTransitions: normalizeStringArray(parsed.environmentTransitions),
    referenceRouting: normalizeStringArray(parsed.referenceRouting),
    promptHints: normalizeStringArray(parsed.promptHints),
  }
}

export function composeContextRouterLocally(input: ContextRouterInput): ContextRouterResult {
  const primaryLocation = input.screenplayContext?.currentScene?.title
    || input.actions.find((action) => action.locationId)?.locationId
    || input.analysis.geography
    || "Текущая локация сцены"

  const visibleSecondaryLocations = inferWindowLinkedLocations(input)
  const offscreenLocations = input.screenplayContext?.nextScene?.title
    && !visibleSecondaryLocations.includes(input.screenplayContext.nextScene.title)
    ? [input.screenplayContext.nextScene.title]
    : []
  const propAnchors = Array.from(new Set([
    ...inferPropAnchors(input),
    ...input.analysis.propCandidates,
    ...input.actions.flatMap((action) => action.propIds),
  ].filter(Boolean))).slice(0, 8)

  const environmentTransitions = input.screenplayContext?.nextScene?.title
    ? [`Переход среды из ${primaryLocation} в ${input.screenplayContext.nextScene.title}`]
    : []

  const referenceRouting = [
    `Primary ref: использовать локацию ${primaryLocation} как базовый environment anchor.`,
    ...visibleSecondaryLocations.map((location) => `Secondary ref: подмешивать ${location} в кадры с окном, отражением, фоном или внешним светом.`),
    ...propAnchors.slice(0, 4).map((prop) => `Prop ref: удерживать ${prop} как визуальный якорь сцены.`),
  ]

  const promptHints = [
    ...visibleSecondaryLocations.map((location) => `Если герой смотрит наружу, явно называй ${location} в shot prompt.`),
    ...offscreenLocations.map((location) => `Подготовь визуальный переход к локации ${location} ещё до прямого scene change.`),
  ]

  return {
    primaryLocation,
    visibleSecondaryLocations,
    offscreenLocations,
    propAnchors,
    environmentTransitions,
    referenceRouting,
    promptHints,
  }
}
