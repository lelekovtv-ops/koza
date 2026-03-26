"use client"

import {
  Bot,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  ImageIcon,
  Loader2,
  Play,
  RefreshCcw,
  Save,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  breakdownSceneDetailed,
  buildBreakdownBibleContext,
  DEFAULT_BREAKDOWN_ENGINE_CONFIG,
  type BreakdownDetailedResult,
  type BreakdownEngineConfig,
} from "@/features/breakdown"
import {
  getCharacterGenerationReferenceImages,
  getLocationGenerationReferenceImages,
  convertReferenceImagesToDataUrls,
} from "@/lib/imageGenerationReferences"
import { buildImagePrompt } from "@/lib/promptBuilder"
import { useBibleStore, GENERATED_CANONICAL_IMAGE_ID } from "@/store/bible"
import { useBoardStore } from "@/store/board"
import { useProjectsStore } from "@/store/projects"
import { createTimelineShot } from "@/store/timeline"

type AssistantTarget = "analysis" | "actionSplit" | "shotPlan" | "continuity" | "prompts" | "all"

type BreakdownPreset = {
  id: string
  name: string
  note: string
  config: BreakdownEngineConfig
  builtIn: boolean
}

type StylePreset = {
  id: string
  name: string
  prompt: string
  builtIn: boolean
}

type ProjectDefaults = {
  projectId: string
  breakdownPresetId: string
  stylePresetId: string
}

type AssistantMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

type AssistantGuidance = Record<AssistantTarget, string[]>

type StepCardData = {
  id: string
  title: string
  why: string
  raw: unknown
}

const PROJECT_BIBLE_ID = "__current_bible__"
const BREAKDOWN_PRESET_STORAGE_KEY = "koza-breakdown-studio-breakdown-presets-v1"
const STYLE_PRESET_STORAGE_KEY = "koza-breakdown-studio-style-presets-v1"
const PROJECT_DEFAULTS_STORAGE_KEY = "koza-breakdown-studio-project-defaults-v1"

const EXAMPLE_SCENE = `INT. NIGHT TRAM - RAINY EVENING

MARTA sits alone near the fogged window, holding a paper bag on her lap. The tram hums through wet streets.

At the next stop, ILYA steps in, soaked from the rain. He spots Marta, hesitates, then walks toward her.

MARTA
You still came.

ILYA
I almost didn't.

He sits across from her instead of beside her. The tram jolts. The paper bag slips and a metal key falls into the aisle.

Both stare at it.

Marta bends first, but Ilya catches the key before she does.

ILYA
So it was here all along.

Marta looks up at him. Outside, blue police lights wash across the tram windows for one second, then disappear.`

const BUILTIN_BREAKDOWN_PRESETS: BreakdownPreset[] = [
  {
    id: "deakins-01",
    name: "Deakins 01",
    note: "Чистые повороты истории, спокойное покрытие, сильная непрерывность.",
    builtIn: true,
    config: {
      shotDensity: "balanced",
      continuityStrictness: "strict",
      textRichness: "rich",
      relationMode: "balanced",
      fallbackMode: "balanced",
      keyframePolicy: "story_turns",
    },
  },
  {
    id: "deakins-02",
    name: "Deakins 02",
    note: "Более сдержанное покрытие с очень дисциплинированными якорями.",
    builtIn: true,
    config: {
      shotDensity: "lean",
      continuityStrictness: "strict",
      textRichness: "simple",
      relationMode: "minimal",
      fallbackMode: "balanced",
      keyframePolicy: "opening_anchor",
    },
  },
  {
    id: "anderson-symmetry-01",
    name: "Anderson Symmetry 01",
    note: "Более выверенные визуальные повороты и явные связи между кадрами.",
    builtIn: true,
    config: {
      shotDensity: "balanced",
      continuityStrictness: "strict",
      textRichness: "rich",
      relationMode: "explicit",
      fallbackMode: "balanced",
      keyframePolicy: "every_major_shift",
    },
  },
  {
    id: "thriller-precision-01",
    name: "Thriller Precision 01",
    note: "Плотное планирование с жестким контролем непрерывности.",
    builtIn: true,
    config: {
      shotDensity: "dense",
      continuityStrictness: "strict",
      textRichness: "rich",
      relationMode: "explicit",
      fallbackMode: "balanced",
      keyframePolicy: "story_turns",
    },
  },
  {
    id: "documentary-handheld-01",
    name: "Documentary Handheld 01",
    note: "Более свободная непрерывность, быстрый fallback и более живое движение.",
    builtIn: true,
    config: {
      shotDensity: "dense",
      continuityStrictness: "flexible",
      textRichness: "simple",
      relationMode: "minimal",
      fallbackMode: "prefer_speed",
      keyframePolicy: "opening_anchor",
    },
  },
  {
    id: "custom-live",
    name: "Свои настройки",
    note: "Ваши текущие настройки справа.",
    builtIn: true,
    config: DEFAULT_BREAKDOWN_ENGINE_CONFIG,
  },
]

const BUILTIN_STYLE_PRESETS: StylePreset[] = [
  {
    id: "cinema-natural",
    name: "Естественное кино",
    prompt: "Naturalistic cinematic light, grounded staging, clear dramatic focus, readable emotional shifts.",
    builtIn: true,
  },
  {
    id: "geometric-precision",
    name: "Геометрическая точность",
    prompt: "Geometric framing, strong lines, calm blocking, measured symmetry, deliberate visual balance.",
    builtIn: true,
  },
  {
    id: "thriller-pressure",
    name: "Триллерное давление",
    prompt: "Quiet dread, controlled tension, compressed space, sharp eyelines, exact visual cause and effect.",
    builtIn: true,
  },
  {
    id: "handheld-witness",
    name: "Ручная камера-наблюдатель",
    prompt: "Human-scale handheld presence, imperfect balance, lived-in motion, documentary immediacy, practical light.",
    builtIn: true,
  },
  {
    id: "custom-style",
    name: "Свой стиль",
    prompt: "",
    builtIn: true,
  },
]

const QUICK_ACTIONS: Array<{ label: string; instruction: string; target: AssistantTarget }> = [
  { label: "Больше деталей", instruction: "сделай разбор более подробным", target: "all" },
  { label: "Больше реакций", instruction: "добавь больше реакционных кадров", target: "shotPlan" },
  { label: "Больше геометрии", instruction: "сделай композицию более геометричной", target: "shotPlan" },
  { label: "Богаче режиссерские заметки", instruction: "верни более богатые режиссерские заметки", target: "prompts" },
  { label: "Точнее камера", instruction: "сделай заметки по камере точнее", target: "prompts" },
  { label: "Яснее вертикальное движение", instruction: "сделай движение вверх и вниз понятнее", target: "prompts" },
  { label: "Менее сухой язык", instruction: "сделай формулировки менее сухими и техническими", target: "prompts" },
]

const LANGUAGE_OPTIONS = [
  { value: "auto", label: "Авто" },
  { value: "english", label: "Английский" },
  { value: "russian", label: "Русский" },
]

const APPLY_TARGET_OPTIONS: Array<{ value: AssistantTarget; label: string }> = [
  { value: "analysis", label: "Анализ" },
  { value: "actionSplit", label: "Разделение на действия" },
  { value: "shotPlan", label: "План кадров" },
  { value: "continuity", label: "Непрерывность" },
  { value: "prompts", label: "Промпты" },
  { value: "all", label: "Все" },
]

const fieldClassName = "w-full rounded-2xl border border-[#1D5C63]/20 bg-white/80 px-3 py-2 text-sm text-[#17313A] outline-none transition focus:border-[#1D5C63] focus:bg-white"
const buttonClassName = "inline-flex items-center justify-center gap-2 rounded-2xl border border-[#1D5C63]/20 bg-[#1D5C63] px-4 py-2 text-sm font-medium text-[#F7F1E8] transition hover:bg-[#15474D] disabled:cursor-not-allowed disabled:opacity-50"
const ghostButtonClassName = "inline-flex items-center justify-center gap-2 rounded-2xl border border-[#1D5C63]/15 bg-white/70 px-4 py-2 text-sm font-medium text-[#17313A] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function cloneGuidance(guidance: AssistantGuidance): AssistantGuidance {
  return {
    analysis: [...guidance.analysis],
    actionSplit: [...guidance.actionSplit],
    shotPlan: [...guidance.shotPlan],
    continuity: [...guidance.continuity],
    prompts: [...guidance.prompts],
    all: [...guidance.all],
  }
}

function createEmptyGuidance(): AssistantGuidance {
  return {
    analysis: [],
    actionSplit: [],
    shotPlan: [],
    continuity: [],
    prompts: [],
    all: [],
  }
}

function buildRuntimeStylePrompt(basePrompt: string, language: string, guidance: AssistantGuidance): string {
  const parts: string[] = []

  if (basePrompt.trim()) {
    parts.push(basePrompt.trim())
  }

  if (language !== "auto") {
    parts.push(language === "russian" ? "Держи сюжетные формулировки на русском языке." : "Keep story-facing text in English.")
  }

  const guidanceLines = [
    guidance.all.length > 0 ? `Общие указания: ${guidance.all.join("; ")}` : "",
    guidance.analysis.length > 0 ? `Для анализа: ${guidance.analysis.join("; ")}` : "",
    guidance.actionSplit.length > 0 ? `Для разделения на действия: ${guidance.actionSplit.join("; ")}` : "",
    guidance.shotPlan.length > 0 ? `Для плана кадров: ${guidance.shotPlan.join("; ")}` : "",
    guidance.continuity.length > 0 ? `Для непрерывности: ${guidance.continuity.join("; ")}` : "",
    guidance.prompts.length > 0 ? `Для промптов: ${guidance.prompts.join("; ")}` : "",
  ].filter(Boolean)

  parts.push(...guidanceLines)

  return parts.join("\n")
}

function summarizeDiagnostics(result: BreakdownDetailedResult | null): string | null {
  if (!result || !result.diagnostics.usedFallback) {
    return null
  }

  const parts: string[] = []

  if (result.diagnostics.actionSplitFallback) parts.push("action split")
  if (result.diagnostics.shotPlannerFallback) parts.push("план кадров")
  if (result.diagnostics.promptComposerFallback) parts.push("промпты")

  return parts.length > 0
    ? `Fallback-режим помог на этапах: ${parts.join(", ")}.`
    : "Fallback-режим помог не останавливать пайплайн."
}

function applyAssistantInstruction(
  instruction: string,
  target: AssistantTarget,
  config: BreakdownEngineConfig,
  guidance: AssistantGuidance,
): { config: BreakdownEngineConfig; guidance: AssistantGuidance; summary: string } {
  const nextConfig: BreakdownEngineConfig = { ...config }
  const nextGuidance = cloneGuidance(guidance)
  const normalized = instruction.trim().toLowerCase()
  const notes: string[] = []

  if (/detail|detailed|richer|deeper|подроб|деталь|глубже|богаче/.test(normalized)) {
    nextConfig.shotDensity = "dense"
    nextConfig.textRichness = "lush"
    notes.push("Повысил уровень детализации")
  }

  if (/reaction|реакц/.test(normalized)) {
    nextConfig.shotDensity = "dense"
    nextConfig.relationMode = "explicit"
    nextGuidance.shotPlan.push("Делай больший акцент на слушающих лицах и реакционных ударах, когда эмоция поворачивает сцену.")
    notes.push("Добавил больше реакционного покрытия")
  }

  if (/geometric|symmetry|symmetrical|геометр|симметр/.test(normalized)) {
    nextGuidance.shotPlan.push("Отдавай предпочтение геометричной композиции, визуальному балансу и читаемым линиям.")
    notes.push("Добавил указание на более геометричное кадрирование")
  }

  if (/director note|director notes|режиссерск.*замет|режиссёрск.*замет/.test(normalized)) {
    nextConfig.textRichness = "lush"
    nextGuidance.prompts.push("Делай режиссерские заметки выразительными, человеческими и легкими для воображения.")
    notes.push("Сделал режиссерские заметки богаче")
  }

  if ((/camera|камера|камер/.test(normalized)) && (/precise|precision|clearer|точн|ясн|четче|чётче/.test(normalized))) {
    nextConfig.textRichness = nextConfig.textRichness === "simple" ? "rich" : nextConfig.textRichness
    nextGuidance.prompts.push("Делай заметки по камере конкретными: про кадрирование, логику оптики и мотивацию движения.")
    notes.push("Сделал заметки по камере точнее")
  }

  if (/upward|downward|vertical|motion|вверх|вниз|вертикал|движен/.test(normalized)) {
    nextGuidance.prompts.push("Явно проговаривай в промптах движение вверх и вниз.")
    notes.push("Сделал вертикальное движение понятнее")
  }

  if (/dry|technical wording|less technical|human|сух|техническ|человечн/.test(normalized)) {
    nextConfig.textRichness = "rich"
    nextGuidance.prompts.push("По возможности выбирай простой человеческий язык вместо сухого технического шортката.")
    notes.push("Смягчил технические формулировки")
  }

  nextGuidance[target].push(instruction.trim())

  return {
    config: nextConfig,
    guidance: nextGuidance,
    summary: notes.length > 0
      ? `${notes.join(". ")}. Инструкцию добавил в раздел «${APPLY_TARGET_OPTIONS.find((option) => option.value === target)?.label?.toLowerCase() || "пайплайн"}».`
      : `Сохранил инструкцию для раздела «${APPLY_TARGET_OPTIONS.find((option) => option.value === target)?.label?.toLowerCase() || "пайплайн"}» и передам ее в следующий запуск.`,
  }
}

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(key, JSON.stringify(value))
}

function StepCard({
  step,
  rawOpen,
  onToggleRaw,
  onRerun,
  loading,
  children,
}: {
  step: StepCardData
  rawOpen: boolean
  onToggleRaw: () => void
  onRerun: () => void
  loading: boolean
  children: ReactNode
}) {
  return (
    <section className="rounded-[28px] border border-[#1D5C63]/15 bg-white/85 p-5 shadow-[0_24px_80px_rgba(18,44,52,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#1D5C63]/55">Шаг пайплайна</div>
          <h2 className="mt-1 text-xl font-semibold text-[#17313A] font-[Georgia,ui-serif,serif]">{step.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#40616A]">{step.why}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onToggleRaw} className={ghostButtonClassName}>
            {rawOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {rawOpen ? "Скрыть raw JSON" : "Показать raw JSON"}
          </button>
          <button type="button" onClick={onRerun} disabled={loading} className={buttonClassName}>
            <RefreshCcw size={16} className={loading ? "animate-spin" : undefined} />
            Перезапустить этот шаг
          </button>
        </div>
      </div>

      <div className="mt-5">{children}</div>

      {rawOpen ? (
        <pre className="mt-5 overflow-x-auto rounded-2xl bg-[#17313A] p-4 text-xs leading-6 text-[#E9E2D8]">{prettyJson(step.raw)}</pre>
      ) : null}
    </section>
  )
}

export default function BreakdownStudioPage() {
  const characters = useBibleStore((state) => state.characters)
  const locations = useBibleStore((state) => state.locations)
  const projects = useProjectsStore((state) => state.projects)
  const activeProjectId = useProjectsStore((state) => state.activeProjectId)

  const [sceneText, setSceneText] = useState("")
  const [language, setLanguage] = useState("auto")
  const [selectedProjectId, setSelectedProjectId] = useState(PROJECT_BIBLE_ID)
  const [config, setConfig] = useState<BreakdownEngineConfig>(DEFAULT_BREAKDOWN_ENGINE_CONFIG)
  const [result, setResult] = useState<BreakdownDetailedResult | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [runLabel, setRunLabel] = useState("Запустить весь пайплайн")
  const [selectedBreakdownPresetId, setSelectedBreakdownPresetId] = useState(BUILTIN_BREAKDOWN_PRESETS[0]?.id ?? "custom-live")
  const [selectedStylePresetId, setSelectedStylePresetId] = useState(BUILTIN_STYLE_PRESETS[0]?.id ?? "custom-style")
  const [stylePrompt, setStylePrompt] = useState(BUILTIN_STYLE_PRESETS[0]?.prompt ?? "")
  const [customBreakdownPresets, setCustomBreakdownPresets] = useState<BreakdownPreset[]>([])
  const [customStylePresets, setCustomStylePresets] = useState<StylePreset[]>([])
  const [projectDefaults, setProjectDefaults] = useState<ProjectDefaults[]>([])
  const [assistantInput, setAssistantInput] = useState("")
  const [assistantTarget, setAssistantTarget] = useState<AssistantTarget>("all")
  const [assistantGuidance, setAssistantGuidance] = useState<AssistantGuidance>(createEmptyGuidance)
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([])
  const [rawOpenByStep, setRawOpenByStep] = useState<Record<string, boolean>>({})

  // Image generator state
  const selectedImageGenModel = useBoardStore((state) => state.selectedImageGenModel)
  const setSelectedImageGenModel = useBoardStore((state) => state.setSelectedImageGenModel)
  const [selectedGenShotId, setSelectedGenShotId] = useState<string | null>(null)
  const [selectedGenCharacterId, setSelectedGenCharacterId] = useState<string | null>(null)
  const [selectedGenLocationId, setSelectedGenLocationId] = useState<string | null>(null)
  const [genImageUrl, setGenImageUrl] = useState<string | null>(null)
  const [genLoading, setGenLoading] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [genPromptOverride, setGenPromptOverride] = useState("")

  const projectOptions = useMemo(() => [
    { id: PROJECT_BIBLE_ID, name: "Текущая библия сценария" },
    ...projects.map((project) => ({ id: project.id, name: project.name })),
  ], [projects])

  const allBreakdownPresets = useMemo(() => [...BUILTIN_BREAKDOWN_PRESETS, ...customBreakdownPresets], [customBreakdownPresets])
  const allStylePresets = useMemo(() => [...BUILTIN_STYLE_PRESETS, ...customStylePresets], [customStylePresets])

  const runtimeStylePrompt = useMemo(
    () => buildRuntimeStylePrompt(stylePrompt, language, assistantGuidance),
    [assistantGuidance, language, stylePrompt],
  )

  const bibleContext = useMemo(() => buildBreakdownBibleContext(characters, locations), [characters, locations])

  const diagnosticsText = useMemo(() => summarizeDiagnostics(result), [result])
  const selectedProjectDefaults = useMemo(
    () => projectDefaults.find((entry) => entry.projectId === selectedProjectId) ?? null,
    [projectDefaults, selectedProjectId],
  )

  const genCharacter = useMemo(
    () => characters.find((c) => c.id === selectedGenCharacterId) ?? null,
    [characters, selectedGenCharacterId],
  )

  const genLocation = useMemo(
    () => locations.find((l) => l.id === selectedGenLocationId) ?? null,
    [locations, selectedGenLocationId],
  )

  const genShotPackage = useMemo(
    () => result?.promptPackages.find((p) => p.shotId === selectedGenShotId) ?? null,
    [result, selectedGenShotId],
  )

  const genBasePrompt = useMemo(() => {
    if (!genShotPackage) return ""
    const stub = createTimelineShot({
      id: genShotPackage.shotId,
      sceneId: null,
      label: genShotPackage.label ?? "",
      duration: genShotPackage.duration ?? 3000,
      type: "image",
      imagePrompt: genShotPackage.imagePrompt ?? "",
      videoPrompt: genShotPackage.videoPrompt ?? "",
      directorNote: genShotPackage.directorNote ?? "",
      cameraNote: genShotPackage.cameraNote ?? "",
      caption: genShotPackage.label ?? "",
      shotSize: "",
      cameraMotion: "",
      notes: "",
      visualDescription: "",
      sourceText: "",
    })
    return buildImagePrompt(
      stub,
      genCharacter ? [genCharacter] : [],
      genLocation ? [genLocation] : [],
      stylePrompt || undefined,
    )
  }, [genShotPackage, genCharacter, genLocation, stylePrompt])

  const genPrompt = genPromptOverride || genBasePrompt

  const generateImage = async () => {
    const promptText = genPrompt.trim()
    if (!promptText) {
      setGenError("Сначала выберите кадр с промптом.")
      return
    }

    setGenLoading(true)
    setGenError(null)
    setGenImageUrl(null)

    try {
      const charRefs = genCharacter
        ? await convertReferenceImagesToDataUrls(getCharacterGenerationReferenceImages(genCharacter))
        : []
      const locRefs = genLocation
        ? await convertReferenceImagesToDataUrls(getLocationGenerationReferenceImages(genLocation))
        : []
      const referenceImages = [...charRefs, ...locRefs]

      const endpoint = selectedImageGenModel === "gpt-image" ? "/api/gpt-image" : "/api/nano-banana"

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          model: selectedImageGenModel,
          referenceImages,
        }),
      })

      if (!response.ok) {
        const errBody = await response.text()
        throw new Error(`Ошибка генерации: ${response.status} — ${errBody}`)
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      setGenImageUrl(url)
    } catch (err) {
      setGenError(err instanceof Error ? err.message : String(err))
    } finally {
      setGenLoading(false)
    }
  }

  const steps = useMemo<StepCardData[]>(() => [
    {
      id: "analysis",
      title: "1. Что происходит в сцене",
      why: "Это простой пересказ истории. Он помогает быстро проверить, правильно ли движок понял сцену до того, как начнет строить покрытие.",
      raw: result?.analysis ?? null,
    },
    {
      id: "actionSplit",
      title: "2. На какие действия делится сцена",
      why: "Этот шаг превращает одну большую сцену в маленькие видимые удары. Так план кадров становится понятнее и надежнее.",
      raw: result?.actionSplit ?? [],
    },
    {
      id: "shotPlan",
      title: "3. Какие кадры создаются",
      why: "Это каркас кадров. Он показывает план по крупности, движению и задаче каждого кадра.",
      raw: result?.shotPlan ?? [],
    },
    {
      id: "continuity",
      title: "4. Что должно оставаться одинаковым между кадрами",
      why: "Этот шаг не дает сцене расползтись. Он фиксирует то, что должно сохраняться от кадра к кадру.",
      raw: result ? { memories: result.continuity.memories, risks: result.continuity.risks } : null,
    },
    {
      id: "relations",
      title: "5. Как кадры соединяются",
      why: "Здесь видно, зачем существует каждый склейочный переход. Это объясняет форму монтажа, а не только порядок кадров.",
      raw: result?.continuity.relations ?? [],
    },
    {
      id: "directorNotes",
      title: "6. Режиссерские заметки",
      why: "Эти заметки простым языком объясняют настроение и драматическую задачу каждого кадра.",
      raw: result?.promptPackages.map((item) => ({ shotId: item.shotId, label: item.label, directorNote: item.directorNote })) ?? [],
    },
    {
      id: "cameraNotes",
      title: "7. Заметки по камере",
      why: "Эти заметки объясняют, что делает камера и почему это помогает сцене.",
      raw: result?.promptPackages.map((item) => ({ shotId: item.shotId, label: item.label, cameraNote: item.cameraNote })) ?? [],
    },
    {
      id: "prompts",
      title: "8. Промпты для изображения и видео",
      why: "Это уже готовые пакеты промптов для генерации. Они превращают план в производственный текст.",
      raw: result?.promptPackages ?? [],
    },
    {
      id: "final",
      title: "9. Финальный результат разбора",
      why: "Это готовый разбор, которым можно пользоваться сразу. Здесь все собранно в одном понятном месте.",
      raw: result?.shots ?? [],
    },
  ], [result])

  useEffect(() => {
    setSelectedProjectId(activeProjectId ?? PROJECT_BIBLE_ID)
  }, [activeProjectId])

  useEffect(() => {
    setCustomBreakdownPresets(readStorage<BreakdownPreset[]>(BREAKDOWN_PRESET_STORAGE_KEY, []))
    setCustomStylePresets(readStorage<StylePreset[]>(STYLE_PRESET_STORAGE_KEY, []))
    setProjectDefaults(readStorage<ProjectDefaults[]>(PROJECT_DEFAULTS_STORAGE_KEY, []))
  }, [])

  useEffect(() => {
    writeStorage(BREAKDOWN_PRESET_STORAGE_KEY, customBreakdownPresets)
  }, [customBreakdownPresets])

  useEffect(() => {
    writeStorage(STYLE_PRESET_STORAGE_KEY, customStylePresets)
  }, [customStylePresets])

  useEffect(() => {
    writeStorage(PROJECT_DEFAULTS_STORAGE_KEY, projectDefaults)
  }, [projectDefaults])

  const runBreakdown = async (
    stepId?: string,
    overrides?: {
      config?: BreakdownEngineConfig
      guidance?: AssistantGuidance
      stylePrompt?: string
    },
  ) => {
    const trimmedScene = sceneText.trim()
    const effectiveConfig = overrides?.config ?? config
    const effectiveGuidance = overrides?.guidance ?? assistantGuidance
    const effectiveStylePrompt = buildRuntimeStylePrompt(overrides?.stylePrompt ?? stylePrompt, language, effectiveGuidance)

    if (!trimmedScene) {
      setErrorText("Сначала вставьте сцену, чтобы студии было что разбирать.")
      return
    }

    setLoading(true)
    setErrorText(null)
    setRunLabel(stepId ? `Перезапускаю с шага: ${steps.find((step) => step.id === stepId)?.title ?? "этот шаг"}` : "Запускаю весь пайплайн")

    try {
      const nextResult = await breakdownSceneDetailed(trimmedScene, {
        sceneId: `breakdown-studio-${Date.now()}`,
        bible: bibleContext,
        style: effectiveStylePrompt,
        config: effectiveConfig,
      })

      setResult(nextResult)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  const toggleRaw = (stepId: string) => {
    setRawOpenByStep((current) => ({
      ...current,
      [stepId]: !current[stepId],
    }))
  }

  const loadBreakdownPreset = (presetId: string) => {
    const preset = allBreakdownPresets.find((entry) => entry.id === presetId)
    if (!preset || preset.id === "custom-live") {
      return
    }

    setConfig(preset.config)
  }

  const saveBreakdownPreset = () => {
    const name = window.prompt("Название пресета разбора")?.trim()
    if (!name) {
      return
    }

    const newPreset: BreakdownPreset = {
      id: makeId("breakdown-preset"),
      name,
      note: "Сохранено из Breakdown Studio v2.",
      config,
      builtIn: false,
    }

    setCustomBreakdownPresets((current) => [newPreset, ...current])
    setSelectedBreakdownPresetId(newPreset.id)
  }

  const loadStylePreset = (presetId: string) => {
    const preset = allStylePresets.find((entry) => entry.id === presetId)
    if (!preset) {
      return
    }

    setStylePrompt(preset.prompt)
  }

  const saveStylePreset = () => {
    const name = window.prompt("Название стилевого пресета")?.trim()
    if (!name) {
      return
    }

    const newPreset: StylePreset = {
      id: makeId("style-preset"),
      name,
      prompt: stylePrompt,
      builtIn: false,
    }

    setCustomStylePresets((current) => [newPreset, ...current])
    setSelectedStylePresetId(newPreset.id)
  }

  const saveProjectPresetDefaults = () => {
    if (selectedProjectId === PROJECT_BIBLE_ID) {
      setErrorText("Сначала выберите реальный проект, а потом сохраняйте его значения по умолчанию.")
      return
    }

    setProjectDefaults((current) => {
      const nextEntry: ProjectDefaults = {
        projectId: selectedProjectId,
        breakdownPresetId: selectedBreakdownPresetId,
        stylePresetId: selectedStylePresetId,
      }

      const withoutCurrent = current.filter((entry) => entry.projectId !== selectedProjectId)
      return [nextEntry, ...withoutCurrent]
    })
  }

  const loadProjectPresetDefaults = () => {
    if (!selectedProjectDefaults) {
      setErrorText("У этого проекта пока нет сохраненных значений по умолчанию.")
      return
    }

    setSelectedBreakdownPresetId(selectedProjectDefaults.breakdownPresetId)
    setSelectedStylePresetId(selectedProjectDefaults.stylePresetId)
    loadBreakdownPreset(selectedProjectDefaults.breakdownPresetId)
    loadStylePreset(selectedProjectDefaults.stylePresetId)
  }

  const clearAll = () => {
    setSceneText("")
    setResult(null)
    setErrorText(null)
    setAssistantInput("")
    setAssistantGuidance(createEmptyGuidance())
    setAssistantMessages([])
    setRawOpenByStep({})
    setRunLabel("Запустить весь пайплайн")
  }

  const handleAssistantApply = async (instructionText?: string, forcedTarget?: AssistantTarget) => {
    const nextInstruction = (instructionText ?? assistantInput).trim()
    const nextTarget = forcedTarget ?? assistantTarget

    if (!nextInstruction) {
      return
    }

    const update = applyAssistantInstruction(nextInstruction, nextTarget, config, assistantGuidance)

    setConfig(update.config)
    setAssistantGuidance(update.guidance)
    setAssistantMessages((current) => [
      ...current,
      { id: makeId("assistant-user"), role: "user", content: `${nextTarget}: ${nextInstruction}` },
      { id: makeId("assistant-bot"), role: "assistant", content: update.summary },
    ])
    setAssistantInput("")

    await runBreakdown(nextTarget, {
      config: update.config,
      guidance: update.guidance,
    })
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,250,240,0.96),rgba(245,238,228,0.92)_35%,rgba(220,235,232,0.82)_100%)] px-4 py-6 text-[#17313A] md:px-6 lg:px-8">
      <div className="mx-auto max-w-screen-2xl">
        <div className="overflow-hidden rounded-[36px] border border-white/50 bg-white/55 shadow-[0_32px_120px_rgba(18,44,52,0.12)] backdrop-blur">
          <div className="border-b border-[#1D5C63]/10 bg-[linear-gradient(120deg,rgba(29,92,99,0.16),rgba(207,123,78,0.10),rgba(255,255,255,0.5))] px-6 py-6 md:px-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#1D5C63]/55">Breakdown Studio v2</div>
                <h1 className="mt-2 text-3xl font-semibold text-[#17313A] font-[Georgia,ui-serif,serif] md:text-4xl">Отдельная студия настройки кинематографического разбора</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[#40616A] md:text-base">
                  Вставьте одну сцену, посмотрите каждый шаг преобразования, настройте движок, сохраните пресеты и попросите ассистента изменить систему простыми словами.
                </p>
              </div>

              <div className="rounded-3xl border border-[#1D5C63]/15 bg-white/75 px-4 py-3 text-sm text-[#40616A] shadow-sm">
                <div className="font-medium text-[#17313A]">Текущий запуск</div>
                <div className="mt-1">{loading ? runLabel : result ? "Последний результат уже готов" : "Запусков пока не было"}</div>
              </div>
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[340px_minmax(0,1fr)_360px]">
            <aside className="border-b border-[#1D5C63]/10 bg-white/35 p-5 lg:border-b-0 lg:border-r">
              <div className="space-y-5">
                <section className="rounded-[28px] border border-[#1D5C63]/10 bg-white/78 p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#1D5C63]/55">Левая колонка</div>
                  <h2 className="mt-2 text-xl font-semibold font-[Georgia,ui-serif,serif]">Ввод сцены</h2>
                  <p className="mt-2 text-sm leading-6 text-[#40616A]">Вставьте сюда точный текст сцены. Сначала студия читает этот текст, потом объясняет каждый следующий шаг.</p>

                  <textarea
                    value={sceneText}
                    onChange={(event) => setSceneText(event.target.value)}
                    rows={16}
                    placeholder="Вставьте сюда одну сцену"
                    className={`${fieldClassName} mt-4 min-h-80 resize-y`}
                  />

                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Язык</label>
                      <select value={language} onChange={(event) => setLanguage(event.target.value)} className={fieldClassName}>
                        {LANGUAGE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Библия или проект</label>
                      <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} className={fieldClassName}>
                        {projectOptions.map((option) => (
                          <option key={option.id} value={option.id}>{option.name}</option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs leading-5 text-[#5E7A82]">
                        Сейчас в библии доступно: персонажей {characters.length}, локаций {locations.length}.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                    <button type="button" onClick={() => void runBreakdown()} disabled={loading} className={buttonClassName}>
                      <Play size={16} />
                      Запустить разбор
                    </button>
                    <button type="button" onClick={clearAll} className={ghostButtonClassName}>
                      <Trash2 size={16} />
                      Очистить
                    </button>
                    <button type="button" onClick={() => setSceneText(EXAMPLE_SCENE)} className={ghostButtonClassName}>
                      <Sparkles size={16} />
                      Загрузить пример
                    </button>
                  </div>
                </section>

                <section className="rounded-[28px] border border-[#1D5C63]/10 bg-white/78 p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#1D5C63]/55">Быстрые факты</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <div className="rounded-2xl border border-[#1D5C63]/10 bg-[#F6F1E9] p-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-[#1D5C63]/55">Размер сцены</div>
                      <div className="mt-1 text-lg font-semibold">{sceneText.trim() ? `${sceneText.trim().length} симв.` : "Пусто"}</div>
                    </div>
                    <div className="rounded-2xl border border-[#1D5C63]/10 bg-[#EEF5F3] p-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-[#1D5C63]/55">Создано кадров</div>
                      <div className="mt-1 text-lg font-semibold">{result?.shots.length ?? 0}</div>
                    </div>
                  </div>
                </section>
              </div>
            </aside>

            <section className="min-w-0 bg-white/20 p-5 md:p-6">
              <div className="space-y-5">
                {errorText ? (
                  <div className="rounded-3xl border border-[#CF7B4E]/25 bg-[#FFF3EB] px-4 py-3 text-sm text-[#8A4B29]">
                    {errorText}
                  </div>
                ) : null}

                {diagnosticsText ? (
                  <div className="rounded-3xl border border-[#1D5C63]/12 bg-[#EEF5F3] px-4 py-3 text-sm text-[#28515A]">
                    {diagnosticsText}
                  </div>
                ) : null}

                {steps.map((step) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    rawOpen={Boolean(rawOpenByStep[step.id])}
                    onToggleRaw={() => toggleRaw(step.id)}
                    onRerun={() => void runBreakdown(step.id)}
                    loading={loading}
                  >
                    {step.id === "analysis" ? (
                      result ? (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-2xl bg-[#F6F1E9] p-4">
                            <div className="text-xs uppercase tracking-[0.18em] text-[#1D5C63]/55">Главная история</div>
                            <p className="mt-2 text-sm leading-6">{result.analysis.sceneSummary || "Пока нет краткого пересказа."}</p>
                          </div>
                          <div className="rounded-2xl bg-[#EEF5F3] p-4">
                            <div className="text-xs uppercase tracking-[0.18em] text-[#1D5C63]/55">Ощущение</div>
                            <p className="mt-2 text-sm leading-6">{result.analysis.emotionalTone || "Пока нет тона."}</p>
                          </div>
                          <div className="rounded-2xl bg-[#FFF5ED] p-4">
                            <div className="text-xs uppercase tracking-[0.18em] text-[#1D5C63]/55">Пространство</div>
                            <p className="mt-2 text-sm leading-6">{result.analysis.geography || "Пока нет заметки о географии сцены."}</p>
                          </div>
                          <div className="rounded-2xl bg-[#F3F7F8] p-4">
                            <div className="text-xs uppercase tracking-[0.18em] text-[#1D5C63]/55">Люди и предметы</div>
                            <p className="mt-2 text-sm leading-6">
                              {(result.analysis.characterPresence.join(", ") || "Персонажи пока не перечислены")}
                              {result.analysis.propCandidates.length > 0 ? ` • Предметы: ${result.analysis.propCandidates.join(", ")}` : ""}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-white/70 p-4 text-sm text-[#5E7A82]">Запустите разбор, чтобы заполнить этот шаг.</div>
                      )
                    ) : null}

                    {step.id === "actionSplit" ? (
                      result && result.actionSplit.length > 0 ? (
                        <div className="space-y-3">
                          {result.actionSplit.map((action, index) => (
                            <div key={action.id} className="rounded-2xl border border-[#1D5C63]/10 bg-[#F8FBFB] p-4">
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="rounded-full bg-[#1D5C63] px-3 py-1 text-xs font-semibold text-white">Действие {index + 1}</div>
                                <div className="text-lg font-semibold text-[#17313A]">{action.title}</div>
                              </div>
                              <div className="mt-3 grid gap-3 md:grid-cols-3">
                                <p className="text-sm leading-6"><span className="font-semibold text-[#17313A]">Что меняется:</span> {action.visibleChange || action.summary}</p>
                                <p className="text-sm leading-6"><span className="font-semibold text-[#17313A]">Почему это важно:</span> {action.whyItMatters || "Причина пока не указана."}</p>
                                <p className="text-sm leading-6"><span className="font-semibold text-[#17313A]">Эмоциональный сдвиг:</span> {action.emotionalChange || "Эмоциональный сдвиг пока не отмечен."}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-white/70 p-4 text-sm text-[#5E7A82]">Разделения на действия пока нет.</div>
                      )
                    ) : null}

                    {step.id === "shotPlan" ? (
                      result && result.shotPlan.length > 0 ? (
                        <div className="space-y-3">
                          {result.shotPlan.map((shot, index) => (
                            <div key={shot.id} className="rounded-2xl border border-[#1D5C63]/10 bg-white p-4">
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="rounded-full bg-[#CF7B4E] px-3 py-1 text-xs font-semibold text-white">Кадр {index + 1}</div>
                                <div className="text-base font-semibold text-[#17313A]">{shot.shotSize || shot.shotType || "Кадр"}</div>
                                <div className="text-sm text-[#5E7A82]">{shot.subject}</div>
                              </div>
                              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                <p className="text-sm leading-6"><span className="font-semibold text-[#17313A]">Задача:</span> {shot.narrativePurpose}</p>
                                <p className="text-sm leading-6"><span className="font-semibold text-[#17313A]">Камера:</span> {shot.camera}</p>
                                <p className="text-sm leading-6"><span className="font-semibold text-[#17313A]">Мизансцена:</span> {shot.blocking}</p>
                                <p className="text-sm leading-6"><span className="font-semibold text-[#17313A]">Выход из кадра:</span> {shot.transitionOut}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-white/70 p-4 text-sm text-[#5E7A82]">Кадров пока нет.</div>
                      )
                    ) : null}

                    {step.id === "continuity" ? (
                      result ? (
                        <div className="grid gap-4 xl:grid-cols-2">
                          <div className="rounded-2xl bg-[#EEF5F3] p-4">
                            <div className="text-xs uppercase tracking-[0.18em] text-[#1D5C63]/55">Память непрерывности</div>
                            <div className="mt-3 space-y-3">
                              {result.continuity.memories.map((memory) => (
                                <div key={memory.shotId} className="rounded-2xl bg-white/75 p-3 text-sm leading-6">
                                  <div className="font-semibold text-[#17313A]">{memory.shotId}</div>
                                  <div>Что переносим: {memory.carryOverInstructions || "Нет заметки о переносе."}</div>
                                  <div>Что готовим дальше: {memory.setupForNext || "Нет заметки о следующем шаге."}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="rounded-2xl bg-[#FFF5ED] p-4">
                            <div className="text-xs uppercase tracking-[0.18em] text-[#1D5C63]/55">Риски непрерывности</div>
                            <div className="mt-3 space-y-3">
                              {result.continuity.risks.length > 0 ? result.continuity.risks.map((risk) => (
                                <div key={`${risk.shotId}-${risk.message}`} className="rounded-2xl bg-white/75 p-3 text-sm leading-6">
                                  <div className="font-semibold text-[#17313A]">{risk.shotId}</div>
                                  <div>{risk.message}</div>
                                </div>
                              )) : <div className="rounded-2xl bg-white/75 p-3 text-sm">Риски непрерывности не найдены.</div>}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-white/70 p-4 text-sm text-[#5E7A82]">Данных по непрерывности пока нет.</div>
                      )
                    ) : null}

                    {step.id === "relations" ? (
                      result && result.continuity.relations.length > 0 ? (
                        <div className="space-y-3">
                          {result.continuity.relations.map((relation) => (
                            <div key={`${relation.fromShotId}-${relation.toShotId}`} className="rounded-2xl border border-[#1D5C63]/10 bg-[#F8FBFB] p-4 text-sm leading-6">
                              <div className="font-semibold text-[#17313A]">{relation.fromShotId} → {relation.toShotId}</div>
                              <div className="mt-1">{relation.relationType} / {relation.relationIntent}</div>
                              <div className="mt-2 text-[#40616A]">{relation.reason}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-white/70 p-4 text-sm text-[#5E7A82]">Связей между кадрами пока нет.</div>
                      )
                    ) : null}

                    {step.id === "directorNotes" ? (
                      result && result.promptPackages.length > 0 ? (
                        <div className="space-y-3">
                          {result.promptPackages.map((item) => (
                            <div key={item.shotId} className="rounded-2xl border border-[#1D5C63]/10 bg-white p-4 text-sm leading-6">
                              <div className="font-semibold text-[#17313A]">{item.label}</div>
                              <div className="mt-2">{item.directorNote}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-white/70 p-4 text-sm text-[#5E7A82]">Режиссерских заметок пока нет.</div>
                      )
                    ) : null}

                    {step.id === "cameraNotes" ? (
                      result && result.promptPackages.length > 0 ? (
                        <div className="space-y-3">
                          {result.promptPackages.map((item) => (
                            <div key={item.shotId} className="rounded-2xl border border-[#1D5C63]/10 bg-white p-4 text-sm leading-6">
                              <div className="font-semibold text-[#17313A]">{item.label}</div>
                              <div className="mt-2">{item.cameraNote}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-white/70 p-4 text-sm text-[#5E7A82]">Заметок по камере пока нет.</div>
                      )
                    ) : null}

                    {step.id === "prompts" ? (
                      result && result.promptPackages.length > 0 ? (
                        <div className="space-y-4">
                          {result.promptPackages.map((item) => (
                            <div key={item.shotId} className="rounded-2xl border border-[#1D5C63]/10 bg-[#17313A] p-4 text-[#F7F1E8]">
                              <div className="text-base font-semibold">{item.label}</div>
                              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                                <div>
                                  <div className="text-xs uppercase tracking-[0.18em] text-white/55">Промпт для изображения</div>
                                  <p className="mt-2 text-sm leading-6 text-white/90">{item.imagePrompt}</p>
                                </div>
                                <div>
                                  <div className="text-xs uppercase tracking-[0.18em] text-white/55">Промпт для видео</div>
                                  <p className="mt-2 text-sm leading-6 text-white/90">{item.videoPrompt}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-white/70 p-4 text-sm text-[#5E7A82]">Промптов пока нет.</div>
                      )
                    ) : null}

                    {step.id === "final" ? (
                      result && result.shots.length > 0 ? (
                        <div className="space-y-3">
                          {result.shots.map((shot, index) => (
                            <div key={`${shot.label}-${index}`} className="rounded-2xl border border-[#1D5C63]/10 bg-[#F6F1E9] p-4">
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="rounded-full bg-[#17313A] px-3 py-1 text-xs font-semibold text-white">Финальный кадр {index + 1}</div>
                                <div className="text-base font-semibold text-[#17313A]">{shot.label}</div>
                              </div>
                              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm leading-6">
                                <div><span className="font-semibold text-[#17313A]">Размер:</span> {shot.shotSize || "-"}</div>
                                <div><span className="font-semibold text-[#17313A]">Движение:</span> {shot.cameraMotion || "-"}</div>
                                <div><span className="font-semibold text-[#17313A]">Подпись:</span> {shot.caption || "-"}</div>
                                <div><span className="font-semibold text-[#17313A]">Заметки:</span> {shot.notes || "-"}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-white/70 p-4 text-sm text-[#5E7A82]">Финального разбора пока нет.</div>
                      )
                    ) : null}
                  </StepCard>
                ))}
              </div>
            </section>

            <aside className="border-t border-[#1D5C63]/10 bg-white/35 p-5 lg:border-l lg:border-t-0">
              <div className="space-y-5">
                <section className="rounded-[28px] border border-[#1D5C63]/10 bg-white/78 p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#1D5C63]/55">Правая колонка</div>
                  <h2 className="mt-2 text-xl font-semibold font-[Georgia,ui-serif,serif]">Настройки и пресеты</h2>
                  <p className="mt-2 text-sm leading-6 text-[#40616A]">Эти ручки меняют то, как движок думает перед тем, как написать финальный разбор.</p>

                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Пресет разбора</label>
                      <select value={selectedBreakdownPresetId} onChange={(event) => setSelectedBreakdownPresetId(event.target.value)} className={fieldClassName}>
                        {allBreakdownPresets.map((preset) => (
                          <option key={preset.id} value={preset.id}>{preset.name}</option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs leading-5 text-[#5E7A82]">{allBreakdownPresets.find((preset) => preset.id === selectedBreakdownPresetId)?.note || "Для этого пресета пока нет заметки."}</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Плотность кадров</label>
                        <select value={config.shotDensity} onChange={(event) => setConfig((current) => ({ ...current, shotDensity: event.target.value as BreakdownEngineConfig["shotDensity"] }))} className={fieldClassName}>
                          <option value="lean">Редко</option>
                          <option value="balanced">Сбалансировано</option>
                          <option value="dense">Плотно</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Строгость непрерывности</label>
                        <select value={config.continuityStrictness} onChange={(event) => setConfig((current) => ({ ...current, continuityStrictness: event.target.value as BreakdownEngineConfig["continuityStrictness"] }))} className={fieldClassName}>
                          <option value="flexible">Гибко</option>
                          <option value="standard">Обычно</option>
                          <option value="strict">Строго</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Богатство текста</label>
                        <select value={config.textRichness} onChange={(event) => setConfig((current) => ({ ...current, textRichness: event.target.value as BreakdownEngineConfig["textRichness"] }))} className={fieldClassName}>
                          <option value="simple">Просто</option>
                          <option value="rich">Богато</option>
                          <option value="lush">Очень богато</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Режим связей</label>
                        <select value={config.relationMode} onChange={(event) => setConfig((current) => ({ ...current, relationMode: event.target.value as BreakdownEngineConfig["relationMode"] }))} className={fieldClassName}>
                          <option value="minimal">Минимально</option>
                          <option value="balanced">Сбалансировано</option>
                          <option value="explicit">Явно</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Fallback-режим</label>
                        <select value={config.fallbackMode} onChange={(event) => setConfig((current) => ({ ...current, fallbackMode: event.target.value as BreakdownEngineConfig["fallbackMode"] }))} className={fieldClassName}>
                          <option value="balanced">Сбалансировано</option>
                          <option value="prefer_speed">Не тормозить</option>
                          <option value="fail_fast">Сразу падать</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Политика ключевых кадров</label>
                        <select value={config.keyframePolicy} onChange={(event) => setConfig((current) => ({ ...current, keyframePolicy: event.target.value as BreakdownEngineConfig["keyframePolicy"] }))} className={fieldClassName}>
                          <option value="opening_anchor">Стартовый якорь</option>
                          <option value="story_turns">Повороты истории</option>
                          <option value="every_major_shift">Каждый большой сдвиг</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <button type="button" onClick={saveBreakdownPreset} className={ghostButtonClassName}>
                        <Save size={16} />
                        Сохранить пресет
                      </button>
                      <button type="button" onClick={() => loadBreakdownPreset(selectedBreakdownPresetId)} className={buttonClassName}>
                        <FolderOpen size={16} />
                        Загрузить пресет
                      </button>
                    </div>
                  </div>
                </section>

                <section className="rounded-[28px] border border-[#1D5C63]/10 bg-white/78 p-5">
                  <h3 className="text-lg font-semibold font-[Georgia,ui-serif,serif]">Стилевые пресеты</h3>
                  <p className="mt-2 text-sm leading-6 text-[#40616A]">Стилевые пресеты меняют визуальный вкус и тон текста, не заменяя саму сцену.</p>

                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Стилевой пресет</label>
                      <select value={selectedStylePresetId} onChange={(event) => setSelectedStylePresetId(event.target.value)} className={fieldClassName}>
                        {allStylePresets.map((preset) => (
                          <option key={preset.id} value={preset.id}>{preset.name}</option>
                        ))}
                      </select>
                    </div>

                    <textarea value={stylePrompt} onChange={(event) => setStylePrompt(event.target.value)} rows={5} className={fieldClassName} placeholder="Опишите визуальный стиль простыми словами" />

                    <div className="rounded-2xl bg-[#F6F1E9] p-3 text-sm leading-6 text-[#40616A]">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Живой стиль, который уходит в движок</div>
                      <p className="mt-2 whitespace-pre-wrap">{runtimeStylePrompt || "Живого текста стиля пока нет."}</p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <button type="button" onClick={saveStylePreset} className={ghostButtonClassName}>
                        <Save size={16} />
                        Сохранить стилевой пресет
                      </button>
                      <button type="button" onClick={() => loadStylePreset(selectedStylePresetId)} className={buttonClassName}>
                        <FolderOpen size={16} />
                        Загрузить стилевой пресет
                      </button>
                    </div>
                  </div>
                </section>

                <section className="rounded-[28px] border border-[#1D5C63]/10 bg-white/78 p-5">
                  <h3 className="text-lg font-semibold font-[Georgia,ui-serif,serif]">Значения проекта по умолчанию</h3>
                  <p className="mt-2 text-sm leading-6 text-[#40616A]">Проект может запомнить один пресет разбора и один стилевой пресет как стартовую точку по умолчанию.</p>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl bg-[#EEF5F3] p-3 text-sm leading-6 text-[#28515A]">
                      {selectedProjectId === PROJECT_BIBLE_ID
                        ? "Выберите реальный проект, если хотите сохранить его значения по умолчанию."
                        : selectedProjectDefaults
                          ? `Для этого проекта уже найдены сохраненные значения по умолчанию.`
                          : "У этого проекта пока нет сохраненных значений по умолчанию."}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <button type="button" onClick={saveProjectPresetDefaults} className={ghostButtonClassName}>
                        <Save size={16} />
                        Сохранить значения проекта
                      </button>
                      <button type="button" onClick={loadProjectPresetDefaults} className={buttonClassName}>
                        <FolderOpen size={16} />
                        Загрузить значения проекта
                      </button>
                    </div>
                  </div>
                </section>

                <section className="rounded-[28px] border border-[#1D5C63]/10 bg-white/78 p-5">
                  <div className="flex items-center gap-2">
                    <Bot size={18} className="text-[#1D5C63]" />
                    <h3 className="text-lg font-semibold font-[Georgia,ui-serif,serif]">Ассистент</h3>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#40616A]">Скажите системе, что нужно изменить. Ассистент поправит настройки, сохранит указания и перезапустит пайплайн.</p>

                  <div className="mt-4 space-y-3">
                    <textarea
                      value={assistantInput}
                      onChange={(event) => setAssistantInput(event.target.value)}
                      rows={4}
                      className={fieldClassName}
                      placeholder="сделай разбор более подробным"
                    />

                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Куда применить</label>
                      <select value={assistantTarget} onChange={(event) => setAssistantTarget(event.target.value as AssistantTarget)} className={fieldClassName}>
                        {APPLY_TARGET_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>

                    <button type="button" onClick={() => void handleAssistantApply()} disabled={loading} className={buttonClassName}>
                      <WandSparkles size={16} />
                      Применить и перезапустить
                    </button>

                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Быстрые действия</div>
                      <div className="flex flex-wrap gap-2">
                        {QUICK_ACTIONS.map((action) => (
                          <button
                            key={action.label}
                            type="button"
                            onClick={() => void handleAssistantApply(action.instruction, action.target)}
                            disabled={loading}
                            className="rounded-full border border-[#1D5C63]/15 bg-[#F6F1E9] px-3 py-2 text-xs font-medium text-[#17313A] transition hover:bg-[#EFE5D8]"
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[#17313A] p-4 text-[#F7F1E8]">
                      <div className="text-xs uppercase tracking-[0.18em] text-white/55">Журнал ассистента</div>
                      <div className="mt-3 max-h-64 space-y-3 overflow-y-auto">
                        {assistantMessages.length > 0 ? assistantMessages.map((message) => (
                          <div key={message.id} className="rounded-2xl bg-white/8 p-3 text-sm leading-6">
                            <div className="text-xs uppercase tracking-[0.18em] text-white/55">{message.role === "assistant" ? "Ассистент" : "Вы"}</div>
                            <div className="mt-1">{message.content}</div>
                          </div>
                        )) : <div className="text-sm text-white/70">Изменений от ассистента пока не было.</div>}
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* ─── IMAGE GENERATOR ─── */}
              <div className="space-y-5">
                {/* Character panel */}
                <section className="rounded-[28px] border border-[#1D5C63]/10 bg-white/78 p-5">
                  <h3 className="text-lg font-semibold font-[Georgia,ui-serif,serif]">Персонаж</h3>
                  <p className="mt-2 text-sm leading-6 text-[#40616A]">Выберите персонажа из библии — его внешность будет основой для генерации.</p>

                  <div className="mt-4">
                    <select
                      value={selectedGenCharacterId ?? ""}
                      onChange={(event) => setSelectedGenCharacterId(event.target.value || null)}
                      className={fieldClassName}
                    >
                      <option value="">— без персонажа —</option>
                      {characters.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {genCharacter ? (
                    <div className="mt-4 space-y-3">
                      {genCharacter.appearancePrompt ? (
                        <div className="rounded-2xl bg-[#F6F1E9] p-3 text-sm leading-6 text-[#40616A]">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Внешность</div>
                          <p className="mt-2">{genCharacter.appearancePrompt}</p>
                        </div>
                      ) : null}

                      {(() => {
                        const refs = getCharacterGenerationReferenceImages(genCharacter)
                        if (refs.length === 0) return null
                        return (
                          <div>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Референсы ({refs.length})</div>
                            <div className="flex flex-wrap gap-2">
                              {refs.map((ref) => (
                                <div key={ref.id} className="relative h-16 w-16 overflow-hidden rounded-xl border border-[#1D5C63]/15">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={ref.url} alt={ref.label} className="h-full w-full object-cover" />
                                  {ref.id === GENERATED_CANONICAL_IMAGE_ID ? (
                                    <div className="absolute bottom-0 left-0 right-0 bg-[#1D5C63]/80 px-1 py-0.5 text-center text-[9px] text-white">AI</div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-[#5E7A82]">
                      {characters.length === 0 ? "В библии персонажей пока нет." : "Персонаж не выбран."}
                    </p>
                  )}
                </section>

                {/* Location panel */}
                <section className="rounded-[28px] border border-[#1D5C63]/10 bg-white/78 p-5">
                  <h3 className="text-lg font-semibold font-[Georgia,ui-serif,serif]">Локация</h3>
                  <p className="mt-2 text-sm leading-6 text-[#40616A]">Выберите локацию — так система покажет, как она подвязывает место к генерации.</p>

                  <div className="mt-4">
                    <select
                      value={selectedGenLocationId ?? ""}
                      onChange={(event) => setSelectedGenLocationId(event.target.value || null)}
                      className={fieldClassName}
                    >
                      <option value="">— без локации —</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>

                  {genLocation ? (
                    <div className="mt-4 space-y-3">
                      {genLocation.appearancePrompt ? (
                        <div className="rounded-2xl bg-[#EEF5F3] p-3 text-sm leading-6 text-[#40616A]">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Внешность локации</div>
                          <p className="mt-2">{genLocation.appearancePrompt}</p>
                        </div>
                      ) : null}

                      {(() => {
                        const refs = getLocationGenerationReferenceImages(genLocation)
                        if (refs.length === 0) return null
                        return (
                          <div>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Референсы ({refs.length})</div>
                            <div className="flex flex-wrap gap-2">
                              {refs.map((ref) => (
                                <div key={ref.id} className="relative h-16 w-16 overflow-hidden rounded-xl border border-[#1D5C63]/15">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={ref.url} alt={ref.label} className="h-full w-full object-cover" />
                                  {ref.id === GENERATED_CANONICAL_IMAGE_ID ? (
                                    <div className="absolute bottom-0 left-0 right-0 bg-[#1D5C63]/80 px-1 py-0.5 text-center text-[9px] text-white">AI</div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-[#5E7A82]">
                      {locations.length === 0 ? "В библии локаций пока нет." : "Локация не выбрана."}
                    </p>
                  )}
                </section>

                {/* Generator panel */}
                <section className="rounded-[28px] border border-[#CF7B4E]/20 bg-white/78 p-5">
                  <div className="flex items-center gap-2">
                    <ImageIcon size={18} className="text-[#CF7B4E]" />
                    <h3 className="text-lg font-semibold font-[Georgia,ui-serif,serif]">Генератор изображений</h3>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#40616A]">Выберите кадр из разбора, посмотрите финальный промпт и запустите генерацию.</p>

                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Кадр</label>
                      <select
                        value={selectedGenShotId ?? ""}
                        onChange={(event) => {
                          setSelectedGenShotId(event.target.value || null)
                          setGenPromptOverride("")
                          setGenImageUrl(null)
                        }}
                        className={fieldClassName}
                      >
                        <option value="">— выберите кадр —</option>
                        {(result?.promptPackages ?? []).map((pkg) => (
                          <option key={pkg.shotId} value={pkg.shotId}>{pkg.label || pkg.shotId}</option>
                        ))}
                      </select>
                      {!result && <p className="mt-2 text-xs text-[#5E7A82]">Сначала запустите разбор.</p>}
                    </div>

                    {genBasePrompt ? (
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">
                          Финальный промпт {genPromptOverride ? "(изменён вручную)" : "(автоматический)"}
                        </label>
                        <textarea
                          value={genPromptOverride || genBasePrompt}
                          onChange={(event) => setGenPromptOverride(event.target.value)}
                          rows={6}
                          className={`${fieldClassName} text-xs leading-5`}
                          placeholder="Промпт появится после выбора кадра"
                        />
                        {genPromptOverride && (
                          <button
                            type="button"
                            onClick={() => setGenPromptOverride("")}
                            className="mt-1 text-xs text-[#CF7B4E] hover:underline"
                          >
                            Сбросить изменения
                          </button>
                        )}
                      </div>
                    ) : null}

                    {(genCharacter || genLocation) && genShotPackage ? (
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Референсы для генерации</div>
                        <div className="flex flex-wrap gap-2">
                          {genCharacter ? getCharacterGenerationReferenceImages(genCharacter).map((ref) => (
                            <div key={`char-${ref.id}`} className="relative h-12 w-12 overflow-hidden rounded-lg border border-[#1D5C63]/15">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={ref.url} alt={ref.label} className="h-full w-full object-cover" />
                            </div>
                          )) : null}
                          {genLocation ? getLocationGenerationReferenceImages(genLocation).map((ref) => (
                            <div key={`loc-${ref.id}`} className="relative h-12 w-12 overflow-hidden rounded-lg border border-[#CF7B4E]/20">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={ref.url} alt={ref.label} className="h-full w-full object-cover" />
                            </div>
                          )) : null}
                        </div>
                      </div>
                    ) : null}

                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#1D5C63]/55">Модель</label>
                      <select
                        value={selectedImageGenModel ?? "nano-banana-2"}
                        onChange={(event) => setSelectedImageGenModel(event.target.value)}
                        className={fieldClassName}
                      >
                        <option value="gpt-image">GPT Image</option>
                        <option value="nano-banana">Nano Banana</option>
                        <option value="nano-banana-2">Nano Banana 2</option>
                        <option value="nano-banana-pro">Nano Banana Pro</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => void generateImage()}
                      disabled={genLoading || !genPrompt.trim()}
                      className={buttonClassName}
                    >
                      {genLoading
                        ? <><Loader2 size={16} className="animate-spin" />Генерирую…</>
                        : <><WandSparkles size={16} />Сгенерировать</>
                      }
                    </button>

                    {genError ? (
                      <div className="rounded-2xl border border-[#CF7B4E]/25 bg-[#FFF3EB] px-3 py-2 text-xs text-[#8A4B29]">
                        {genError}
                      </div>
                    ) : null}

                    {genImageUrl ? (
                      <div className="overflow-hidden rounded-2xl border border-[#1D5C63]/15">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={genImageUrl}
                          alt="Сгенерированное изображение"
                          className="w-full object-cover"
                        />
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </main>
  )
}