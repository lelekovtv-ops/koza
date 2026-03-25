import type { PipelineStageId, RunSnapshot } from "@/types/pipeline"

export interface StageExplanation {
  whatItDoes: string
  whyItExists: string
  inputLabel: string
  outputLabel: string
  bibleUsage: string | null
}

export interface StageDisplaySummary {
  inputSummary: string
  outputSummary: string
  bibleSummary: string | null
}

type StageResultPayload = {
  input?: unknown
  output?: unknown
}

type BibleSummaryInput = {
  characters: Array<{ name: string }>
  locations: Array<{ name: string }>
}

export const STAGE_EXPLANATIONS: Record<PipelineStageId, StageExplanation> = {
  sceneInput: {
    whatItDoes: "Держит исходный текст сцены, от которого дальше строится весь разбор.",
    whyItExists: "Если вход пустой или смазан, дальше все этапы будут ошибаться на каждом следующем шаге.",
    inputLabel: "Текст сцены",
    outputLabel: "Снимок сцены для запуска пайплайна",
    bibleUsage: null,
  },
  sceneAnalyst: {
    whatItDoes: "Читает сцену и понимает её как историю — находит поворотные моменты, настроение и кто участвует.",
    whyItExists: "Без понимания драматургии система не знает, зачем нужен каждый будущий кадр.",
    inputLabel: "Текст сцены",
    outputLabel: "Драматические биты, тон, персонажи, мотивы",
    bibleUsage: "Сверяет персонажей и локации с библией проекта, чтобы сцена не теряла канон.",
  },
  actionSplitter: {
    whatItDoes: "Разбивает большую сцену на маленькие видимые действия, которые реально можно показать на экране.",
    whyItExists: "Каждое действие становится опорой для будущих кадров, поэтому план получается точнее.",
    inputLabel: "Драматические биты",
    outputLabel: "Список действий с привязкой к битам",
    bibleUsage: null,
  },
  contextRouter: {
    whatItDoes: "Смотрит на текущую сцену вместе с соседними сценами и распределяет, какие локации, переходы среды и предметные якоря должны попасть в конкретные будущие кадры.",
    whyItExists: "Чтобы shot planning и image generation не были слепы к миру за окном, соседним локациям, переходам и offscreen давлению следующей сцены.",
    inputLabel: "Текущая сцена, действия и соседний screenplay context",
    outputLabel: "Маршрутизация локаций, props и reference hints",
    bibleUsage: "Сверяет текущую сцену с Bible locations и готовит, какие visual refs должны стать primary, а какие secondary anchors.",
  },
  creativePlanner: {
    whatItDoes: "Ищет нестандартные, редкие и по-настоящему кинематографичные ракурсы, препятствия в foreground и необычные точки наблюдения для сцены.",
    whyItExists: "Чтобы пайплайн не скатывался в банальный coverage и предлагал сильные операторские решения ещё до шот-листа.",
    inputLabel: "Анализ сцены и список действий",
    outputLabel: "30 референсных операторских подходов и идеи для текущей сцены",
    bibleUsage: "Учитывает персонажей и среду, чтобы необычные ракурсы не противоречили миру проекта.",
  },
  censor: {
    whatItDoes: "Сверяет сценарий, режиссёрское видение, разбор сцены и предложения агентов, а затем отсеивает декоративные или ложные решения.",
    whyItExists: "Чтобы красивые планы не начали разрушать жанр, смысл сцены и тон фильма.",
    inputLabel: "Сценарий, анализ, действия и creative ideas",
    outputLabel: "Вердикт, предупреждения и директива для shot planner",
    bibleUsage: null,
  },
  shotPlanner: {
    whatItDoes: "Превращает действия в конкретные кадры: выбирает крупность, камеру, композицию и блокировку.",
    whyItExists: "Это каркас раскадровки: каждый шот уже понимает свою задачу в истории.",
    inputLabel: "Действия сцены",
    outputLabel: "Shot specs: размер, камера, блокировка, свет",
    bibleUsage: "Подтягивает канон персонажей и среды, чтобы визуальные решения не расходились с проектом.",
  },
  continuitySupervisor: {
    whatItDoes: "Следит, чтобы мир не развалился между кадрами: одежда, свет, реквизит, позиции и экранное направление.",
    whyItExists: "Без continuity каждый следующий кадр выглядит как новая сцена вместо продолжения того же момента.",
    inputLabel: "Shot specs",
    outputLabel: "Memories, relations, carry-over и warnings",
    bibleUsage: null,
  },
  promptComposer: {
    whatItDoes: "Собирает шоты, continuity, библию и стиль в финальные промпты для генерации изображений и видео.",
    whyItExists: "Именно здесь всё разрозненное склеивается в один управляемый визуальный язык.",
    inputLabel: "Shots + memory + relations + bible + style",
    outputLabel: "Image prompts, video prompts и continuity-блоки",
    bibleUsage: "Инжектит внешность персонажей и описания локаций прямо в итоговые промпты.",
  },
  promptOptimizer: {
    whatItDoes: "Сжимает финальные image prompts перед генерацией: убирает дубли, сохраняет канон и превращает перегруженный техдок в более управляемый generation prompt.",
    whyItExists: "После continuity, prompt composer и detail lock исходный prompt становится слишком многослойным, и часть моделей начинает терять главный visual intent.",
    inputLabel: "Raw image prompts + continuity overlays + detail locks",
    outputLabel: "Optimized prompts + diff raw vs optimized",
    bibleUsage: "Сохраняет primary/secondary environment canon и identity anchors, но отсекает повторяющийся шум.",
  },
  imageGenerator: {
    whatItDoes: "Берёт готовые промпты и превращает их в изображения для раскадровки.",
    whyItExists: "Пайплайн должен завершаться не только текстом, но и визуальным результатом, который можно оценивать.",
    inputLabel: "Готовые image prompts",
    outputLabel: "Сгенерированные изображения по шотам",
    bibleUsage: "Использует уже встроенный в промпты канон, чтобы изображения сохраняли визуальную идентичность проекта.",
  },
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function formatNames(names: string[], fallback: string): string {
  const unique = Array.from(new Set(names.filter(Boolean)))
  if (unique.length === 0) return fallback
  if (unique.length <= 2) return unique.join(", ")
  return `${unique.slice(0, 2).join(", ")} +${unique.length - 2}`
}

function matchBibleNames(names: string[], candidates: Array<{ name: string }>): string[] {
  const normalizedCandidates = new Map(
    candidates.map((item) => [item.name.trim().toLowerCase(), item.name.trim()]),
  )

  return Array.from(
    new Set(
      names
        .map((name) => normalizedCandidates.get(name.trim().toLowerCase()))
        .filter((name): name is string => Boolean(name)),
    ),
  )
}

function extractSceneAnalystBible(stageData: StageResultPayload, bible: BibleSummaryInput): string | null {
  const output = getRecord(stageData.output)
  if (!output) return null

  const matchedCharacters = matchBibleNames(
    getArray(output.characterPresence).map((value) => getString(value)),
    bible.characters,
  )

  const beatLocations = getArray(output.dramaticBeats)
    .map((beat) => getRecord(beat)?.locationId)
    .map((value) => getString(value))
  const matchedLocations = matchBibleNames(beatLocations, bible.locations)

  if (matchedCharacters.length === 0 && matchedLocations.length === 0) {
    return null
  }

  return `Подтянуты ${formatNames(matchedCharacters, "персонажи из библии")}${matchedLocations.length > 0 ? `, ${formatNames(matchedLocations, "локации из библии")}` : ""}`
}

function extractShotPlannerBible(stageData: StageResultPayload, bible: BibleSummaryInput): string | null {
  const output = getArray(stageData.output)
  const characterIds = output.flatMap((shot) => {
    const continuity = getRecord(getRecord(shot)?.continuity)
    return getArray(continuity?.characterIds).map((value) => getString(value))
  })
  const matchedCharacters = matchBibleNames(characterIds, bible.characters)

  if (matchedCharacters.length === 0) {
    return null
  }

  return `Подтянуты ${formatNames(matchedCharacters, "персонажи из библии")} для визуальных описаний.`
}

function extractPromptComposerBible(stageData: StageResultPayload, bible: BibleSummaryInput): string | null {
  const output = getArray(stageData.output)
  const promptText = output
    .map((item) => getString(getRecord(item)?.imagePrompt))
    .join(" ")
    .toLowerCase()

  const matchedCharacters = bible.characters
    .map((item) => item.name.trim())
    .filter((name) => promptText.includes(name.toLowerCase()))
  const matchedLocations = bible.locations
    .map((item) => item.name.trim())
    .filter((name) => promptText.includes(name.toLowerCase()))

  if (matchedCharacters.length === 0 && matchedLocations.length === 0) {
    return null
  }

  return `В промпты вошли ${formatNames(matchedCharacters, "персонажи")}${matchedLocations.length > 0 ? ` и ${formatNames(matchedLocations, "локации")}` : ""}.`
}

export function summarizeStageForDisplay(
  stageId: PipelineStageId,
  stageResult: unknown,
  runSnapshot: RunSnapshot | null,
  bible: BibleSummaryInput,
): StageDisplaySummary {
  const stageData = (stageResult as StageResultPayload | undefined) ?? {}

  switch (stageId) {
    case "sceneInput": {
      const words = runSnapshot?.sceneText ? wordCount(runSnapshot.sceneText) : 0
      return {
        inputSummary: words > 0 ? `Текст сцены (${words} слов)` : "Текст сцены",
        outputSummary: "Снимок сцены готов к запуску",
        bibleSummary: null,
      }
    }
    case "sceneAnalyst": {
      const output = getRecord(stageData.output)
      const beatCount = getArray(output?.dramaticBeats).length
      const tone = getString(output?.emotionalTone) || "не указан"
      const characterCount = getArray(output?.characterPresence).length
      const words = runSnapshot?.sceneText ? wordCount(runSnapshot.sceneText) : 0

      return {
        inputSummary: words > 0 ? `Текст сцены (${words} слов)` : "Текст сцены",
        outputSummary: `${beatCount} beats, тон: \"${tone}\", ${characterCount} персонажа`,
        bibleSummary: extractSceneAnalystBible(stageData, bible),
      }
    }
    case "actionSplitter": {
      const input = getRecord(stageData.input)
      const output = getArray(stageData.output)
      return {
        inputSummary: `${getArray(input?.dramaticBeats).length} драматических битов`,
        outputSummary: `${output.length} действий для планирования`,
        bibleSummary: null,
      }
    }
    case "contextRouter": {
      const output = getRecord(stageData.output)
      return {
        inputSummary: "Текущая сцена + соседний screenplay context",
        outputSummary: `${getArray(output?.visibleSecondaryLocations).length} secondary locations, ${getArray(output?.propAnchors).length} prop anchors`,
        bibleSummary: getString(output?.primaryLocation) || null,
      }
    }
    case "creativePlanner": {
      const input = getRecord(stageData.input)
      const output = getRecord(stageData.output)
      return {
        inputSummary: `${getArray(input?.actions).length} действий, тон: ${getString(getRecord(input?.analysis)?.emotionalTone) || "не указан"}`,
        outputSummary: `${getArray(output?.filmHistoryReferences).length} референсов, ${getArray(output?.sceneIdeas).length} идей для сцены`,
        bibleSummary: getString(output?.operatorMission) || null,
      }
    }
    case "censor": {
      const input = getRecord(stageData.input)
      const output = getRecord(stageData.output)
      return {
        inputSummary: `${getArray(getRecord(input?.creativePlan)?.sceneIdeas).length} идей на проверке`,
        outputSummary: `${getArray(output?.approvedDirections).length} одобрено, ${getArray(output?.warnings).length} предупреждений`,
        bibleSummary: null,
      }
    }
    case "shotPlanner": {
      const input = getRecord(stageData.input)
      const inputActions = getArray(input?.actions)
      const outputShots = getArray(stageData.output)
      return {
        inputSummary: `${inputActions.length} действий сцены`,
        outputSummary: `${outputShots.length} shot specs готовы`,
        bibleSummary: extractShotPlannerBible(stageData, bible),
      }
    }
    case "continuitySupervisor": {
      const inputShots = getArray(stageData.input)
      const output = getRecord(stageData.output)
      return {
        inputSummary: `${inputShots.length} shot specs`,
        outputSummary: `${getArray(output?.memories).length} memories, ${getArray(output?.relations).length} relations, ${getArray(output?.risks).length} warnings`,
        bibleSummary: null,
      }
    }
    case "promptComposer": {
      const input = getRecord(stageData.input)
      const output = getArray(stageData.output)
      const inputShots = getArray(getRecord(input?.shots)?.shots)
      const inputMemories = getArray(getRecord(input?.shots)?.memories)
      const inputRelations = getArray(getRecord(input?.shots)?.relations)

      return {
        inputSummary: `${inputShots.length} shots, ${inputMemories.length} memories, ${inputRelations.length} relations`,
        outputSummary: `${output.length} финальных prompt packages`,
        bibleSummary: extractPromptComposerBible(stageData, bible),
      }
    }
    case "promptOptimizer": {
      const input = getRecord(stageData.input)
      const output = getRecord(stageData.output)
      const optimizedEntries = getArray(output?.optimizedEntries)
      const totalSaved = Number(output?.totalCharsSaved ?? 0)

      return {
        inputSummary: `${Number(input?.promptCount ?? 0)} raw prompts`,
        outputSummary: `${optimizedEntries.length} optimized prompts, -${totalSaved} chars`,
        bibleSummary: null,
      }
    }
    case "imageGenerator": {
      const output = getRecord(stageResult)
      return {
        inputSummary: `${Number(output?.orderedShotCount ?? 0)} готовых промптов`,
        outputSummary: `${getArray(output?.keyframeCandidates).length} keyframe candidates, модель ${getString(output?.imageModel) || "не выбрана"}`,
        bibleSummary: null,
      }
    }
  }
}