import type { ActionSplitStep } from "@/lib/cinematic/actionSplitter"
import { buildBreakdownConfigPrompt, type BreakdownEngineConfig } from "@/lib/cinematic/config"
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

export interface CreativePlanReference {
  id: string
  title: string
  operatorConcept: string
  shotIdea: string
  whyItWorks: string
  useWhen: string
  concept?: string
  application?: string
}

export interface CreativeSceneIdea {
  id: string
  title: string
  actionTarget: string
  directorIntent: string
  operatorExecution: string
  visualHook: string
  recommendedForScene: boolean
}

export interface CreativePlannerResult {
  operatorMission: string
  scenePressurePoints: string[]
  globalGuidance: string
  filmHistoryReferences: CreativePlanReference[]
  sceneIdeas: CreativeSceneIdea[]
}

export interface CreativePlannerInput {
  sceneId: string
  analysis: SceneAnalysis
  actions: ActionSplitStep[]
  config?: BreakdownEngineConfig
  sceneText?: string
  bible?: CinematicBibleContext
  style?: CinematicStyleContext
}

const FILM_HISTORY_LIBRARY: CreativePlanReference[] = [
  { id: "ref-01", title: "План сверху через потолочный вентилятор", operatorConcept: "Верхний ракурс с движущимся foreground obstruction", shotIdea: "Смотреть на комнату сверху через лопасти вентилятора и разбивать пространство на психологические сектора.", whyItWorks: "Даёт ощущение контроля, клаустрофобии и странного бытового напряжения.", useWhen: "Сцена заперта в комнате и в ней есть скрытое давление." },
  { id: "ref-02", title: "С улицы через окно", operatorConcept: "Наблюдение с внешней стороны", shotIdea: "Снимать событие из улицы через стекло, чтобы герой выглядел отделённым от мира.", whyItWorks: "Создаёт дистанцию и ощущение подглядывания.", useWhen: "Герой изолирован, скрыт или эмоционально отрезан." },
  { id: "ref-03", title: "Через щель двери", operatorConcept: "Суженный voyeur frame", shotIdea: "Вести кадр через узкую щель, оставляя большую часть действия лишь частично видимой.", whyItWorks: "Повышает тревогу и делает взгляд субъективным.", useWhen: "Нужно подчеркнуть запретность или угрозу." },
  { id: "ref-04", title: "Отражение в зеркале вместо прямого кадра", operatorConcept: "Reflection framing", shotIdea: "Показывать персонажа через зеркало или отражающую поверхность, не давая прямого фронтального кадра.", whyItWorks: "Добавляет слой самообмана, раздвоения или дистанции.", useWhen: "Сцена про внутренний раскол или скрытую правду." },
  { id: "ref-05", title: "План изнутри шкафа", operatorConcept: "Object interior POV", shotIdea: "Снимать героя изнутри мебели или тесного бытового объекта.", whyItWorks: "Немедленно делает пространство странным и запоминающимся.", useWhen: "Нужно вызвать бытовой сюрреализм или ощущение слежки." },
  { id: "ref-06", title: "Через мокрое стекло или дождь", operatorConcept: "Distorted observation", shotIdea: "Оставить воду в foreground и позволить действию деформироваться через стекло.", whyItWorks: "Даёт эмоциональную нестабильность и красивую абстракцию.", useWhen: "Сцена про сомнение, тоску, недосказанность." },
  { id: "ref-07", title: "Низко от пола под мебелью", operatorConcept: "Sub-floor low angle", shotIdea: "Снимать от пола так, будто пространство наблюдает за людьми снизу.", whyItWorks: "Меняет масштаб и делает обычную комнату тревожной.", useWhen: "Есть скрытая опасность или внутреннее напряжение." },
  { id: "ref-08", title: "Через плечо неодушевлённого объекта", operatorConcept: "Foreground domination", shotIdea: "Давить кадр крупным объектом в foreground, превращая его в немого свидетеля.", whyItWorks: "Даёт визуальную метафору власти среды над человеком.", useWhen: "Реквизит драматически важен." },
  { id: "ref-09", title: "Фрагментарный план по частям тела", operatorConcept: "Anatomical fragmentation", shotIdea: "Показывать действие по рукам, шее, плечам, не открывая сразу лицо.", whyItWorks: "Создаёт саспенс и телесность.", useWhen: "Нужно усилить чувственность, страх или тайну." },
  { id: "ref-10", title: "Сквозь толпу или движущийся foreground", operatorConcept: "Passing occlusion", shotIdea: "Держать героя в кадре через проходящих людей или предметы, которые почти перекрывают его.", whyItWorks: "Даёт ощущение жизни среды и визуального давления.", useWhen: "Герой тонет в хаосе или городе." },
  { id: "ref-11", title: "План снаружи автомобиля внутрь", operatorConcept: "Glass barrier frame", shotIdea: "Оставить камеру снаружи и работать через отражения, салон и уличный свет.", whyItWorks: "Смешивает внутренний мир и внешний хаос.", useWhen: "Сцена разговора или решения в машине." },
  { id: "ref-12", title: "Сверхдальний план как эмоциональный удар", operatorConcept: "Emotional distance via wide scale", shotIdea: "Увести героя в маленькую фигуру в огромном пространстве в самый болезненный момент.", whyItWorks: "Контраст масштаба даёт сильную драматическую ноту.", useWhen: "Нужно показать одиночество или безысходность." },
  { id: "ref-13", title: "Медленный вертикальный взгляд сверху вниз", operatorConcept: "Gravity reveal", shotIdea: "Начать с потолка, неба или верхних деталей и медленно опуститься к человеку.", whyItWorks: "Даёт ощущение фатума и архитектурного давления.", useWhen: "Нужно раскрыть пространство как силу." },
  { id: "ref-14", title: "Через стеклянную бутылку или неровный прозрачный объект", operatorConcept: "Optical distortion foreground", shotIdea: "Смотреть на героя через кривую прозрачную форму.", whyItWorks: "Делает простую мизансцену авторской и тревожной.", useWhen: "Есть тема опьянения, искажения или нестабильности." },
  { id: "ref-15", title: "Кадр из коридора в глубину нескольких дверей", operatorConcept: "Depth tunnel composition", shotIdea: "Строить план в длинной оси дверных проёмов и рамок.", whyItWorks: "Даёт театральную глубину и ощущение судьбы.", useWhen: "Нужно усилить геометрию дома и ожидание." },
  { id: "ref-16", title: "План со скрытой точки наблюдения", operatorConcept: "Concealed surveillance angle", shotIdea: "Ставить камеру будто за реальным укрытием, не раскрывая сразу весь обзор.", whyItWorks: "Сразу задаёт паранойю и субъект наблюдения.", useWhen: "Есть тайна, контроль, охота или ревность." },
  { id: "ref-17", title: "Через занавески или тюль", operatorConcept: "Veiled frame", shotIdea: "Пускать лицо и действие через полупрозрачный текстиль.", whyItWorks: "Смягчает реальность и добавляет интимность или траурность.", useWhen: "Сцена нежная, болезненная или призрачная." },
  { id: "ref-18", title: "План через лестничный пролёт", operatorConcept: "Architectural void", shotIdea: "Смотреть сверху или снизу через пустоту лестницы.", whyItWorks: "Архитектура начинает участвовать в драме.", useWhen: "Нужно подчеркнуть иерархию, падение или преследование." },
  { id: "ref-19", title: "Скрытый боковой профиль в дверной раме", operatorConcept: "Edge framing", shotIdea: "Сажать героя на край кадра и позволять раме давить на него.", whyItWorks: "Даёт хрупкость и ощущение, что персонажу мало места.", useWhen: "Герой загнан обстоятельствами." },
  { id: "ref-20", title: "Изнутри холодильника или бытового прибора", operatorConcept: "Appliance POV", shotIdea: "Коротко показать человека изнутри бытового пространства.", whyItWorks: "Неожиданный ракурс сразу делает сцену кинематографичной.", useWhen: "Нужно встряхнуть ритм и добавить авторскую дерзость." },
  { id: "ref-21", title: "Силуэт в контровом окне", operatorConcept: "Backlit silhouette tension", shotIdea: "Не раскрывать лицо сразу, держать героя в контуре на фоне окна.", whyItWorks: "Даёт мифологичность и загадку.", useWhen: "Нужно усилить вход героя или моральную неоднозначность." },
  { id: "ref-22", title: "Долгий план через несколько комнат", operatorConcept: "Spatial chain framing", shotIdea: "Сохранять действие внутри длинной глубины нескольких помещений.", whyItWorks: "Сцена ощущается цельной и живой.", useWhen: "Важно показать географию и внутренние связи дома." },
  { id: "ref-23", title: "Через отражение в телевизоре или чёрном экране", operatorConcept: "Dead-screen reflection", shotIdea: "Использовать выключенный экран как отражающую чёрную поверхность.", whyItWorks: "Соединяет быт и скрытую тревогу.", useWhen: "Сцена о медиа, памяти, пустоте, ожидании." },
  { id: "ref-24", title: "Почти абстрактный макро-вход в сцену", operatorConcept: "Macro reveal", shotIdea: "Начинать с текстуры, детали или поверхности, а потом раскрывать контекст.", whyItWorks: "Даёт свежий вход и цепляет внимание.", useWhen: "Нужно открыть сцену необычно и tactile." },
  { id: "ref-25", title: "Сквозь отражение в луже", operatorConcept: "Reflected world inversion", shotIdea: "Сначала жить в отражении, а потом перевести взгляд в реальность.", whyItWorks: "Красиво работает на теме двойственности и перемены мира.", useWhen: "Нужна поэтичность или ощущение перевёрнутой реальности." },
  { id: "ref-26", title: "План с предельной асимметрией", operatorConcept: "Negative space pressure", shotIdea: "Оставить героя в маленьком участке кадра, а остальное отдать пустоте.", whyItWorks: "Пустота начинает говорить сильнее текста.", useWhen: "Герой подавлен, ждёт удара, потерян." },
  { id: "ref-27", title: "Через москитную сетку или решётку", operatorConcept: "Barrier texture", shotIdea: "Ввести мелкую сетку между зрителем и героем.", whyItWorks: "Даёт мотив заточения, фильтра и наблюдения.", useWhen: "Нужно подчеркнуть несвободу или разделение миров." },
  { id: "ref-28", title: "Дальний наружный план как подслушивание", operatorConcept: "Eavesdropping distance", shotIdea: "Оставить камеру далеко снаружи, будто она не имеет права подойти ближе.", whyItWorks: "Заставляет зрителя самому всматриваться и напрягаться.", useWhen: "Разговор должен казаться чужим, опасным или интимным." },
  { id: "ref-29", title: "Нестабильный ручной план после статичного старта", operatorConcept: "Rhythm break movement", shotIdea: "Начать в почти музейной статике и сломать это резким ручным приближением.", whyItWorks: "Разрыв ритма даёт сильный драматический толчок.", useWhen: "Момент истины, вспышка страха или решения." },
  { id: "ref-30", title: "Субъективный взгляд из предмета-свидетеля", operatorConcept: "Witness-object perspective", shotIdea: "Будто камера принадлежит предмету, который давно присутствует в этой комнате.", whyItWorks: "Даёт мифологию пространства и необычный авторский взгляд.", useWhen: "Среда должна ощущаться живой и помнящей." },
]

function buildScreenplayExcerpt(sceneText?: string): string {
  if (!sceneText) {
    return ""
  }

  return sceneText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)
    .join("\n")
}

function normalizeReference(item: unknown, index: number): CreativePlanReference {
  const record = typeof item === "object" && item !== null ? item as Record<string, unknown> : {}
  const fallback = FILM_HISTORY_LIBRARY[index] ?? FILM_HISTORY_LIBRARY[0]

  return {
    id: normalizeString(record.id, fallback.id),
    title: normalizeString(record.title, fallback.title),
    operatorConcept: normalizeString(record.operatorConcept || record.concept, fallback.operatorConcept),
    shotIdea: normalizeString(record.shotIdea || record.application, fallback.shotIdea),
    whyItWorks: normalizeString(record.whyItWorks, fallback.whyItWorks),
    useWhen: normalizeString(record.useWhen, fallback.useWhen),
  }
}

function normalizeSceneIdea(item: unknown, index: number): CreativeSceneIdea {
  const record = typeof item === "object" && item !== null ? item as Record<string, unknown> : {}

  return {
    id: normalizeString(record.id, `creative-idea-${index + 1}`),
    title: normalizeString(record.title, `Необычный план ${index + 1}`),
    actionTarget: normalizeString(record.actionTarget),
    directorIntent: normalizeString(record.directorIntent),
    operatorExecution: normalizeString(record.operatorExecution),
    visualHook: normalizeString(record.visualHook),
    recommendedForScene: Boolean(record.recommendedForScene),
  }
}

export function buildCreativePlannerSystemPrompt(input: Omit<CreativePlannerInput, "analysis" | "actions" | "sceneText">): string {
  const styleDirective = resolveStyleDirective(input.style)

  return `Ты Creative Planner — отдельный агент-креативщик внутри первого этапа пайплайна.
Твоя единственная работа: думать только о необычных, кинематографичных, редких операторских решениях и ракурсах.

Ты обязан мыслить как архив нестандартных планов из истории кино.
Держи в голове задачу: выбрать 5 самых подходящих операторских приёмов из истории кино для текущей сцены.

Верни только JSON-объект такого вида:
{
  "operatorMission": "string",
  "scenePressurePoints": ["string"],
  "globalGuidance": "string",
  "filmHistoryReferences": [
    {
      "id": "string",
      "title": "string",
      "concept": "string",
      "application": "string"
    }
  ],
  "sceneIdeas": [
    {
      "id": "string",
      "title": "string",
      "actionTarget": "string",
      "directorIntent": "string",
      "operatorExecution": "string",
      "visualHook": "string",
      "recommendedForScene": true
    }
  ]
}

Правила:
- ВАЖНО: Всегда отвечай на том же языке, на котором написан сценарий. Если сцена на русском — пиши по-русски. Если на английском — по-английски.
- filmHistoryReferences должно содержать 5 самых релевантных операторских подходов для этой конкретной сцены.
- Не предлагай банальные coverage-решения.
- Ищи странные, дерзкие, редкие, архитектурные, наблюдательные, частично скрытые, отражённые, барьерные и психологические планы.
- sceneIdeas должны опираться на текущую сцену, сценарий и режиссёрское видение.
- operatorExecution должен объяснять именно операторское решение, а не сюжет.
- Думай только про необычные ракурсы, визуальные ограничения, препятствия в foreground, наблюдение, отражения, щели, стекло, дистанцию, верхние и скрытые точки.

Визуальное направление: ${styleDirective}
${buildBreakdownConfigPrompt(input.config)}
${buildBibleContextPrompt(input.bible)}

Ответь JSON-объектом.`
}

export function buildCreativePlannerUserMessage(input: CreativePlannerInput): string {
  const screenplayExcerpt = buildScreenplayExcerpt(input.sceneText)

  return `Придумай нестандартные операторские решения для сцены ${input.sceneId}.\n\nScene analysis:\n${serializeForPrompt({
    sceneSummary: input.analysis.sceneSummary,
    emotionalTone: input.analysis.emotionalTone,
    geography: input.analysis.geography,
    visualMotifs: input.analysis.visualMotifs,
    continuityRisks: input.analysis.continuityRisks,
  })}\n\nActions:\n${serializeForPrompt(input.actions.map((action) => ({
    order: action.order,
    title: action.title,
    summary: action.summary,
    whyItMatters: action.whyItMatters,
    visibleChange: action.visibleChange,
  })))}${screenplayExcerpt ? `\n\nScreenplay excerpt:\n${screenplayExcerpt}` : ""}`
}

export function parseCreativePlannerResponse(rawText: string): CreativePlannerResult {
  const parsed = JSON.parse(extractJsonObject(rawText)) as Record<string, unknown>

  return {
    operatorMission: normalizeString(parsed.operatorMission),
    scenePressurePoints: normalizeStringArray(parsed.scenePressurePoints),
    globalGuidance: normalizeString(parsed.globalGuidance),
    filmHistoryReferences: Array.isArray(parsed.filmHistoryReferences)
      ? parsed.filmHistoryReferences.slice(0, 10).map((item, index) => normalizeReference(item, index))
      : FILM_HISTORY_LIBRARY,
    sceneIdeas: Array.isArray(parsed.sceneIdeas)
      ? parsed.sceneIdeas.map((item, index) => normalizeSceneIdea(item, index))
      : [],
  }
}

export function composeCreativePlannerLocally(input: CreativePlannerInput): CreativePlannerResult {
  const sceneIdeas = input.actions.slice(0, 6).map((action, index) => {
    const reference = FILM_HISTORY_LIBRARY[index % FILM_HISTORY_LIBRARY.length]
    return {
      id: `creative-idea-${index + 1}`,
      title: `${reference.title} для действия ${index + 1}`,
      actionTarget: action.summary || action.title,
      directorIntent: action.whyItMatters || input.analysis.emotionalTone || "Усилить драматический смысл момента.",
      operatorExecution: `${reference.shotIdea} ${reference.useWhen}`,
      visualHook: reference.operatorConcept,
      recommendedForScene: true,
    }
  })

  return {
    operatorMission: "Искать не банальный coverage, а редкие, выразительные, частично скрытые и психологически нагруженные ракурсы для сцены.",
    scenePressurePoints: [
      input.analysis.emotionalTone,
      input.analysis.geography,
      ...input.analysis.continuityRisks,
    ].map((value) => value.trim()).filter(Boolean).slice(0, 6),
    globalGuidance: "Сначала искать архитектурно необычный или барьерный ракурс, потом проверять, усиливает ли он конфликт, дистанцию, слежку, изоляцию или внутренний надлом героя.",
    filmHistoryReferences: FILM_HISTORY_LIBRARY,
    sceneIdeas,
  }
}