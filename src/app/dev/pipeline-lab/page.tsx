"use client"

import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  Panel,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Bot, Play, Loader2, Plus, Save, Upload, Trash2, Copy, Settings, Eye, ChevronDown, Send, X, MessageSquare, BookOpen, MapPin, Image as ImageIcon, RotateCcw } from "lucide-react"

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

interface ModuleData {
  moduleId: string
  name: string
  description: string
  systemPrompt: string
  model: string
  enabled: boolean
  inputs: string[]
  outputs: string[]
  result?: { raw: string; parsed: unknown; duration: number; error?: string }
  isRunning?: boolean
  color: string
}

interface BibleCharacter {
  name: string
  appearance: string
  imageUrl?: string
  imageDescription?: string  // auto-transcribed from image
}

interface BibleLocation {
  name: string
  description: string
  imageUrl?: string
  imageDescription?: string  // auto-transcribed from image
}

interface PipelineConfig {
  name: string
  modules: ModuleData[]
  positions: Record<string, { x: number; y: number }>
  connections: Array<{ source: string; target: string }>
  sceneText: string
  style: string
  bible: { screenplay: string; characters: BibleCharacter[]; locations: BibleLocation[] }
}

// ══════════════════════════════════════════════════════════════
// DEFAULT MODULES
// ══════════════════════════════════════════════════════════════

const MODELS = [
  "gpt-5.4-2026-03-05", "gpt-5.4-mini-2026-03-17",
  "gpt-4o", "gpt-4o-mini",
  "claude-opus-4-6", "claude-sonnet-4-6", "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001",
  "gemini-2.5-flash", "gemini-1.5-pro",
]

const DEFAULT_MODULES: ModuleData[] = [
  {
    moduleId: "fincher-storyboard",
    name: "Fincher Storyboard",
    description: "Полная раскадровка в стиле Финчера + промпт для Nano Banana к каждому кадру",
    systemPrompt: `Ты — Дэвид Финчер + Эрик Мессершмидт. Тебе дают текст сцены, описание персонажей и локаций.

Сделай ПОЛНУЮ РАСКАДРОВКУ в стиле Финчера: 4-6 кадров. Для КАЖДОГО кадра напиши развёрнутое описание + промпт для генерации изображения.

═══ ФИНЧЕРОВСКИЕ ПРИНЦИПЫ ═══
- КАМЕРА НАБЛЮДАЕТ. Surveillance footage. Персонаж не знает что мы смотрим.
- ГЕОМЕТРИЯ. Предметы = улики на операционном столе.
- ОДИН ИСТОЧНИК СВЕТА. Жёсткая граница свет/тень. Причина света конкретная (щель двери, ТВ экран, лампа).
- ЦВЕТ БОЛЕЕТ. Steel blue тени. Sick yellow бумаги. Desaturated. Кожа — единственное тепло.
- ПЕРВЫЙ КАДР — самый нестандартный (bird's eye, через предмет, отражение).

═══ ДЛЯ КАЖДОГО КАДРА ОПИШИ ═══

1. РАКУРС — не "medium shot" а конкретно:
   "Extreme overhead bird's-eye строго сверху, перпендикулярно столу"
   "Ultra low angle с уровня стеклянной пепельницы"
   "Through crack in door — видна только полоска комнаты"

2. КОМПОЗИЦИЯ — что где:
   "Документы разложены геометрически неровно — хаос с логикой. Пепельница, окурок, стакан — как улики. Руки Бориса по центру, макушка в верхней трети."

3. СВЕТ — конкретный источник:
   "Единственный источник — узкий прямоугольник из незакрытой двери. Холодный флуоресцентный. Режет стол наискосок. Половина кадра в глубокой тени."

4. ЦВЕТ:
   "Steel blue ambient в тенях. Sick yellow на бумагах. Skin tone рук — единственное живое пятно тепла."

5. ОБЪЕКТИВ + ДВИЖЕНИЕ:
   "35mm с небольшим дисторшн. Очень медленный push-in сверху — почти незаметный drift вниз."

6. МОНТАЖНАЯ ФУНКЦИЯ:
   "Surveillance footage. Финчер даёт ощущение что за персонажем наблюдают. Борис — объект, не субъект."

7. NANO BANANA PROMPT — промпт для генерации на АНГЛИЙСКОМ, 50-80 слов, natural language:
   Структура: Style + angle + subject with position + foreground objects + background + single light source with direction and shadow + color palette + lens + "16:9. No text, no watermark, natural anatomy."
   Стиль берёшь из поля style.

Отвечай НА РУССКОМ (описания) + АНГЛИЙСКИЙ (prompt).
Return ONLY JSON (no markdown, no backticks):
{"essence":"суть сцены одним предложением","shots":[{"id":"shot-1","title":"название","angle":"ракурс подробно","composition":"что где в кадре","light":"источник света и тени","color":"палитра","lens":"объектив и движение","purpose":"монтажная функция","prompt":"English prompt for Nano Banana"}]}`,
    model: "gpt-5.4-2026-03-05",
    enabled: true,
    inputs: ["scene", "style", "screenplay", "bible"],
    outputs: ["storyboard"],
    color: "#E11D48",
  },
]

const LEGACY_MODULES: ModuleData[] = [
  {
    moduleId: "detail-packer",
    name: "Detail Packer",
    description: "Наполняет каждый кадр деталями: персонаж, локация, предметы, фон, приоритеты",
    systemPrompt: `Ты — Detail Packer. Ты художник-постановщик (production designer).

Тебе дают список кадров от Scene Analyst, библию проекта (персонажи с внешностью, локации с описанием) и текст сцены.

Твоя ЕДИНСТВЕННАЯ задача: взять каждый кадр и НАПОЛНИТЬ его всеми возможными визуальными деталями.

Для КАЖДОГО кадра определи:

1. ПЕРСОНАЖ в кадре:
   - Как выглядит (из библии): лицо, одежда, возраст, особенности
   - Поза и жест В ЭТОМ КОНКРЕТНОМ КАДРЕ
   - Выражение лица / эмоция которая ВИДНА

2. ЛОКАЦИЯ:
   - Что за стены, пол, потолок (материалы, текстуры, состояние)
   - Что за окном если есть
   - Какой это интерьер по настроению (запущенный, уютный, стерильный)

3. ПРЕДМЕТЫ В КАДРЕ:
   - Что на переднем плане
   - Что на среднем плане
   - Что на заднем плане / фоне

4. ПРИОРИТЕТЫ — выдели 2-3 самых важных детали в каждом кадре.
   Это то на что зритель должен посмотреть ПЕРВЫМ.
   Пример: "1. Дрожащие руки с документами  2. Полная пепельница  3. Мерцание телевизора на стене"

Если в библии есть описание изображения персонажа/локации (imageDescription) — используй его как визуальный якорь.

Отвечай НА ТОМ ЖЕ ЯЗЫКЕ что и сцена.
Return ONLY valid JSON (no markdown, no backticks):
{
  "shots": [
    {
      "shotId": "shot-1",
      "character": {"appearance": "...", "pose": "...", "expression": "..."},
      "location": {"walls": "...", "floor": "...", "window": "...", "mood": "..."},
      "foreground": ["..."],
      "midground": ["..."],
      "background": ["..."],
      "priorities": ["деталь 1", "деталь 2", "деталь 3"]
    }
  ]
}`,
    model: "gpt-5.4-2026-03-05",
    enabled: true,
    inputs: ["analysis", "scene", "bible"],
    outputs: ["details"],
    color: "#34D399",
  },
  {
    moduleId: "continuity-editor",
    name: "Continuity Editor",
    description: "Монтажёр: согласует действия, позиции, правило 180°, взгляды, склейки между кадрами",
    systemPrompt: `Continuity Editor. Монтажёр. Ответ СТРОГО JSON, без markdown.

Для КАЖДОГО кадра определи:
- position: где персонаж (left/center/right third)
- gaze: куда смотрит
- objects: где ключевые предметы (ТВ, пепельница, телефон — left/center/right)
- focus: объект взаимодействия
- cutType: тип склейки к следующему (cut/match cut/cutaway)
- note: что сохранить для склейки

Правила: 180° rule, screen direction, eyeline match.

ТОЛЬКО JSON:
{"axis":"описание оси 180°","shots":[{"shotId":"shot-1","position":"center","gaze":"down-left","objects":[{"name":"TV","pos":"left bg"}],"focus":"documents","cutType":"cut","note":"..."}]}`,
    model: "gpt-5.4-2026-03-05",
    enabled: true,
    inputs: ["analysis", "scene"],
    outputs: ["continuity"],
    color: "#F472B6",
  },
  {
    moduleId: "shot-card",
    name: "Shot Card",
    description: "Быстрая карточка кадра: действие + режиссёр + оператор — для пользователя",
    systemPrompt: `Ты — Shot Card Writer. Самый быстрый бот в пайплайне.

Тебе дают кадры от Scene Analyst. Для КАЖДОГО кадра напиши ТРИ коротких строки:

1. ACTION — что происходит. Одно предложение, максимум 10 слов.
   Пример: "Борис берёт трубку дрожащей рукой"

2. DIRECTOR — режиссёрский замысел. Одно предложение.
   Пример: "Показать что решение уже принято через замедленный жест"

3. OPERATOR — технические данные оператора. Коротко через запятую:
   - Объектив: 24мм / 35мм / 50мм / 85мм / 135мм
   - Ракурс: нижний / уровень глаз / верхний / POV / через предмет
   - Камера: статика / стедикам / ручная / кран / слайдер / dolly in / dolly out
   - Крупность: общий / средний / крупный / деталь
   Пример: "85мм, уровень глаз, статика, крупный"

ВСЁ. Больше ничего не пиши. Будь МАКСИМАЛЬНО кратким.

Отвечай НА ТОМ ЖЕ ЯЗЫКЕ что и сцена.
Return ONLY valid JSON array (no markdown, no backticks):
[{
  "shotId": "shot-1",
  "action": "...",
  "director": "...",
  "operator": "..."
}]`,
    model: "gpt-4o",
    enabled: true,
    inputs: ["analysis"],
    outputs: ["shotCards"],
    color: "#FBBF24",
  },
  {
    moduleId: "prompt-writer",
    name: "Prompt Writer",
    description: "Пишет промпты для Nano Banana по официальному гайду — чистый визуал для генератора",
    systemPrompt: `You are a professional cinematic prompt generator for Nano Banana 2.

Each shot from the analysis has: angle, composition, light, color, lens, purpose.
Convert EACH into a precise image generation prompt.

Structure (natural language, NOT keyword lists):
1. Style from style field FIRST
2. Camera angle — USE the EXACT angle from analysis (bird's eye, ultra low, through crack, etc.)
3. What is visible — subject position in frame (left/center/right third), pose, expression
4. Foreground objects — what's closest to camera (ashtray, papers edge, smoke)
5. Background — what's behind (TV glow, dark doorway, cracked wall)
6. Light — USE the EXACT light from analysis (single source, direction, shadow pattern, color temperature)
7. Color palette — USE the EXACT colors from analysis (steel blue shadows, sick yellow papers, etc.)
8. Lens — from analysis (35mm distortion, 85mm shallow DOF, etc.)
9. Constraints: keep same character, natural anatomy, no text, no watermark

Rules:
- 50-90 words per prompt
- Natural descriptive sentences, NOT comma-separated keywords
- COPY the specific angle/light/color from Scene Analyst — do NOT simplify them
- The same prompt regenerated should produce a SIMILAR image — be SPECIFIC about positions and angles
- NO abstract words: tension, mood, atmosphere, emotion, feeling
- Think Fincher: surveillance, geometric, clinical, one light source

Write for EVERY shot. ONLY JSON array (no markdown):
[{"shotId":"shot-1","prompt":"the cinematic prompt"}]`,
    model: "gpt-5.4-2026-03-05",
    enabled: true,
    inputs: ["analysis", "style"],
    outputs: ["imagePrompts"],
    color: "#FB923C",
  },
  {
    moduleId: "final-assembler",
    name: "Final Assembler",
    description: "Собирает финальный промпт: промпт + детали + монтажные правила → готовый промпт для генерации",
    systemPrompt: `Final Assembler for Nano Banana 2. STRICT JSON, no markdown.

Take prompt from Prompt Writer as BASE. Enrich with Detail Packer and Continuity data.

From Detail Packer ADD if missing:
- priorities (key visual details: ashtray, documents, TV)
- character pose + expression
- foreground objects

From Continuity ADD if missing:
- character screen position (left/center/right third)
- gaze direction
- key object positions (TV left, ashtray right)

Keep 30-80 words. Natural cinematic language. English. No abstractions.
Return for EVERY shot.

ONLY JSON array (no markdown):
[{
  "shotId":"shot-1",
  "finalPrompt": "assembled prompt in English",
  "addedFromDetails": ["что добавлено из Detail Packer"],
  "addedFromContinuity": ["что добавлено из Continuity Editor"],
  "promptLength": 280
}]`,
    model: "gpt-5.4-2026-03-05",
    enabled: true,
    inputs: ["imagePrompts", "details", "continuity"],
    outputs: ["finalPrompts"],
    color: "#EF4444",
  },
  {
    moduleId: "prompt-optimizer",
    name: "Prompt Optimizer",
    description: "Финальная полировка: убирает мусор, противоречия, дубли, ставит стиль первым словом",
    systemPrompt: `Prompt Optimizer for Nano Banana 2. Final polish. STRICT JSON, no markdown.

Check each prompt has ALL 10 elements:
1. Shot type (wide/medium/close-up)  2. Subject  3. Action  4. Location  5. Composition (angle + position in frame)  6. Lighting (source + direction)  7. Camera (lens mm)  8. Style  9. Color palette  10. Constraints

FIX:
- Replace abstract words ("tension","mood","emotion","atmosphere") with VISIBLE things (shadows, light direction, body language)
- If character position missing → add "positioned in [left/center/right] third"
- If camera angle missing → add specific angle
- If lighting vague → make specific (source + direction + color)
- Remove: duplicates, contradictions, IDs, instructions
- Style from style field must be FIRST words
- End with: "No text, no watermark, no distortion, natural anatomy."

Keep 30-80 words. Natural language, not keyword lists.
Return for EVERY shot. ONLY JSON array (no markdown):
[{"shotId":"shot-1","optimizedPrompt":"...","changes":[],"charCount":0}]`,
    model: "gpt-4o",
    enabled: true,
    inputs: ["finalPrompts", "style", "bible"],
    outputs: ["optimizedPrompts"],
    color: "#10B981",
  },
]

const DEFAULT_POSITIONS: Record<string, { x: number; y: number }> = {
  "fincher-storyboard": { x: 300, y: 300 },
}

const DEFAULT_CONNECTIONS: Array<{ source: string; target: string }> = []

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

async function callChat(system: string, userMessage: string, model: string): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: userMessage }], modelId: model, system, temperature: 0.7 }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const reader = res.body?.getReader()
  if (!reader) throw new Error("No body")
  const decoder = new TextDecoder()
  let full = ""
  while (true) { const { done, value } = await reader.read(); if (done) break; full += decoder.decode(value, { stream: true }) }
  return full + decoder.decode()
}

function tryParseJSON(text: string): unknown {
  try {
    const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()
    const match = cleaned.match(/\[[\s\S]*\]/) || cleaned.match(/\{[\s\S]*\}/)
    return match ? JSON.parse(match[0]) : text
  } catch { return text }
}

// ══════════════════════════════════════════════════════════════
// MODULE NODE COMPONENT
// ══════════════════════════════════════════════════════════════

function ModuleNode({ data, id }: NodeProps) {
  const d = data as unknown as ModuleData & { onSelect: (id: string) => void; onSoloRun: (id: string) => void }
  const isRunning = d.isRunning
  const hasResult = !!d.result
  const hasError = !!d.result?.error
  const [showFullResult, setShowFullResult] = useState(false)

  return (
    <div
      className={`min-w-[300px] max-w-[360px] rounded-2xl border-2 shadow-2xl backdrop-blur-sm transition-all cursor-pointer ${
        isRunning ? "border-[#D4A853] bg-[#1A1B1F]/95 shadow-[#D4A853]/20" :
        hasError ? "border-red-500/50 bg-[#1A1B1F]/95" :
        hasResult ? "border-green-500/30 bg-[#1A1B1F]/95" :
        "border-white/10 bg-[#1A1B1F]/95 hover:border-white/20"
      }`}
      onClick={() => d.onSelect(d.moduleId)}
    >
      {/* Input handles */}
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !rounded-full !border-2 !border-white/30 !bg-[#1A1B1F]" />

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          isRunning ? "animate-pulse bg-[#D4A853]/20" : "bg-white/8"
        }`} style={{ color: d.color }}>
          {isRunning ? <Loader2 size={20} className="animate-spin" /> : <Bot size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-[#E7E3DC]">{d.name}</span>
            {!d.enabled && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/30">OFF</span>}
          </div>
          <p className="mt-0.5 text-[12px] text-white/35">{d.description}</p>
        </div>
        {/* SOLO RUN button */}
        <button
          type="button"
          className={`nodrag shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all ${
            isRunning
              ? "bg-[#D4A853]/20 text-[#D4A853]"
              : "bg-white/5 text-white/30 hover:bg-[#D4A853]/15 hover:text-[#D4A853]"
          }`}
          onClick={(e) => { e.stopPropagation(); if (!isRunning) d.onSoloRun(d.moduleId) }}
        >
          {isRunning ? <Loader2 size={12} className="animate-spin" /> : "Solo"}
        </button>
      </div>

      {/* Model + Status */}
      <div className="flex items-center gap-2 border-t border-white/5 px-5 py-2.5">
        <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-white/50">{d.model}</span>
        {d.result?.duration && (
          <span className="text-[11px] text-white/25">{(d.result.duration / 1000).toFixed(1)}s</span>
        )}
        {hasResult && !hasError && <span className="ml-auto text-[11px] text-green-400/70">done</span>}
        {hasError && <span className="ml-auto text-[11px] text-red-400/70">error</span>}
      </div>

      {/* IO */}
      <div className="flex gap-3 border-t border-white/5 px-5 py-2.5">
        <div className="flex flex-wrap gap-1">
          {d.inputs.map((inp) => (
            <span key={inp} className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-white/30">{inp}</span>
          ))}
        </div>
        <span className="text-white/15">→</span>
        <div className="flex flex-wrap gap-1">
          {d.outputs.map((out) => (
            <span key={out} className="rounded px-2 py-0.5 text-[10px]" style={{ backgroundColor: `${d.color}15`, color: `${d.color}90` }}>{out}</span>
          ))}
        </div>
      </div>

      {/* Result preview — click to expand */}
      {hasResult && (
        <div className="nodrag border-t border-white/5 px-5 py-2.5" onClick={(e) => { e.stopPropagation(); setShowFullResult(!showFullResult) }}>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-wider text-white/20">{showFullResult ? "Result (click to collapse)" : "Result (click to expand)"}</span>
            <ChevronDown size={10} className={`text-white/20 transition-transform ${showFullResult ? "rotate-180" : ""}`} />
          </div>
          <pre className={`overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-white/50 ${showFullResult ? "max-h-[400px]" : "max-h-[80px] overflow-hidden"}`} style={{ scrollbarWidth: "thin" }}>
            {typeof d.result?.parsed === "string" ? d.result.parsed : JSON.stringify(d.result?.parsed, null, 2)}
          </pre>
        </div>
      )}

      {/* Output handle */}
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !rounded-full !border-2 !border-white/30 !bg-[#1A1B1F]" />
    </div>
  )
}

const nodeTypes = { module: ModuleNode }

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════

export default function PipelineLabPage() {
  const [modules, setModules] = useState<ModuleData[]>(DEFAULT_MODULES)
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null)
  const [sceneText, setSceneText] = useState(`INT. КВАРТИРА БОРИСА — НОЧЬ

Тесная комната. Единственный источник света — экран старого телевизора. БОРИС (55) сидит за столом, перебирая документы. Пепельница полная. Руки дрожат.

Телефон звонит. Борис смотрит на экран — номер скрыт. Медленно берёт трубку.

БОРИС
Алло?

Пауза. Тяжёлое дыхание на том конце.`)
  const [style, setStyle] = useState("Anime style, cel shading, dramatic lighting")
  const [isRunning, setIsRunning] = useState(false)
  const [bible, setBible] = useState<{ screenplay: string; characters: BibleCharacter[]; locations: BibleLocation[] }>({
    screenplay: "Криминальный триллер. Борис — бывший следователь, замешанный в старом деле. Кто-то из прошлого нашёл его. Атмосфера паранойи и неизбежности.",
    characters: [{ name: "БОРИС", appearance: "55 лет, усталое лицо, щетина, мятая рубашка", imageUrl: "" }],
    locations: [{ name: "КВАРТИРА БОРИСА", description: "Тесная комната, старый телевизор, стол с документами", imageUrl: "" }],
  })
  const [configName, setConfigName] = useState("Default Pipeline")
  const [savedConfigs, setSavedConfigs] = useState<string[]>([])
  const [showChat, setShowChat] = useState(false)
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    { role: "assistant", content: "Привет! Пиши что изменить в модулях. Могу менять промпты, модели, добавлять модули, менять связи." },
  ])
  const [chatInput, setChatInput] = useState("")
  const [imageGenModel, setImageGenModel] = useState<string>("nano-banana-2")
  const [generatingShots, setGeneratingShots] = useState<Set<number>>(new Set())
  const [generatedImages, setGeneratedImages] = useState<Map<number, string>>(new Map())
  const [selectedShotIdx, setSelectedShotIdx] = useState(0)
  const [editedPrompts, setEditedPrompts] = useState<Map<number, string>>(new Map())
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Build nodes from modules
  const initialNodes = useMemo((): Node[] =>
    modules.map((m) => ({
      id: m.moduleId,
      type: "module",
      position: DEFAULT_POSITIONS[m.moduleId] || { x: Math.random() * 800 + 100, y: Math.random() * 400 + 100 },
      data: { ...m, onSelect: setSelectedModuleId, onSoloRun: () => {} },
    })),
  []) // Only build once — soloRun injected via useEffect

  const initialEdges = useMemo((): Edge[] =>
    DEFAULT_CONNECTIONS.map((c, i) => ({
      id: `e-${i}`,
      source: c.source,
      target: c.target,
      animated: false,
      style: { stroke: "rgba(255,255,255,0.12)", strokeWidth: 2 },
    })),
  [])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, style: { stroke: "rgba(255,255,255,0.12)", strokeWidth: 2 } }, eds))
  }, [setEdges])

  // Update node data when modules change
  useEffect(() => {
    setNodes((nds) => nds.map((n) => {
      const mod = modules.find((m) => m.moduleId === n.id)
      if (!mod) return n
      return { ...n, data: { ...mod, onSelect: setSelectedModuleId, onSoloRun: soloRun } }
    }))
  }, [modules, setNodes])

  const selectedModule = modules.find((m) => m.moduleId === selectedModuleId)

  const updateModule = (id: string, changes: Partial<ModuleData>) => {
    setModules((prev) => prev.map((m) => m.moduleId === id ? { ...m, ...changes } : m))
  }

  // Solo run — execute single module with scene text + any existing results as context
  // Generate image for a shot
  const generateImage = useCallback(async (shotIndex: number, prompt: string) => {
    if (generatingShots.has(shotIndex)) return
    setGeneratingShots((prev) => new Set(prev).add(shotIndex))

    try {
      const endpoint = imageGenModel === "gpt-image" ? "/api/gpt-image" : "/api/nano-banana"

      // Collect bible reference images
      const refUrls: string[] = []
      for (const c of bible.characters) {
        if (c.imageUrl && c.imageUrl.startsWith("blob:")) {
          try {
            const res = await fetch(c.imageUrl)
            const blob = await res.blob()
            const reader = new FileReader()
            const dataUrl: string = await new Promise((resolve) => { reader.onload = () => resolve(reader.result as string); reader.readAsDataURL(blob) })
            refUrls.push(dataUrl)
          } catch { /* skip */ }
        }
      }
      for (const l of bible.locations) {
        if (l.imageUrl && l.imageUrl.startsWith("blob:")) {
          try {
            const res = await fetch(l.imageUrl)
            const blob = await res.blob()
            const reader = new FileReader()
            const dataUrl: string = await new Promise((resolve) => { reader.onload = () => resolve(reader.result as string); reader.readAsDataURL(blob) })
            refUrls.push(dataUrl)
          } catch { /* skip */ }
        }
      }

      const body = imageGenModel === "gpt-image"
        ? { prompt, referenceImages: refUrls }
        : { prompt, model: imageGenModel, referenceImages: refUrls }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => "")
        console.warn("Image gen error:", res.status, errText)
        return
      }

      const contentType = res.headers.get("content-type") || ""
      if (!contentType.startsWith("image/")) {
        console.warn("Image gen returned non-image:", contentType)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setGeneratedImages((prev) => new Map(prev).set(shotIndex, url))
    } catch (err) {
      console.warn("Image generation failed:", err)
    } finally {
      setGeneratingShots((prev) => { const next = new Set(prev); next.delete(shotIndex); return next })
    }
  }, [generatingShots, imageGenModel, bible])

  const soloRun = useCallback(async (moduleId: string) => {
    const mod = modules.find((m) => m.moduleId === moduleId)
    if (!mod || !sceneText.trim()) return

    setModules((prev) => prev.map((m) => m.moduleId === moduleId ? { ...m, isRunning: true, result: undefined } : m))

    const t = Date.now()
    try {
      // Gather existing results from other modules as context
      const parts: string[] = []
      modules.forEach((m) => {
        if (m.moduleId !== moduleId && m.result?.parsed) {
          parts.push(`${m.moduleId}: ${JSON.stringify(m.result.parsed)}`)
        }
      })
      parts.push(`scene: ${sceneText}`)
      parts.push(`style: ${style}`)
      if (bible.screenplay) parts.push(`screenplay: ${bible.screenplay}`)
      if (bible.characters.length) parts.push(`characters: ${JSON.stringify(bible.characters)}`)
      if (bible.locations.length) parts.push(`locations: ${JSON.stringify(bible.locations)}`)

      const raw = await callChat(mod.systemPrompt, parts.join("\n\n"), mod.model)
      const parsed = tryParseJSON(raw)
      setModules((prev) => prev.map((m) => m.moduleId === moduleId
        ? { ...m, result: { raw, parsed, duration: Date.now() - t }, isRunning: false }
        : m))
    } catch (err) {
      setModules((prev) => prev.map((m) => m.moduleId === moduleId
        ? { ...m, result: { raw: "", parsed: null, duration: Date.now() - t, error: String(err) }, isRunning: false }
        : m))
    }
  }, [modules, sceneText, style, bible])

  // ── Run Pipeline ──

  const runPipeline = useCallback(async () => {
    if (isRunning) return
    setIsRunning(true)

    // Reset results
    setModules((prev) => prev.map((m) => ({ ...m, result: undefined, isRunning: false })))

    // Topological sort based on edges
    const enabledModules = modules.filter((m) => m.enabled)
    const adjacency = new Map<string, string[]>()
    const inDegree = new Map<string, number>()
    enabledModules.forEach((m) => { adjacency.set(m.moduleId, []); inDegree.set(m.moduleId, 0) })
    edges.forEach((e) => {
      if (adjacency.has(e.source) && inDegree.has(e.target)) {
        adjacency.get(e.source)!.push(e.target)
        inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1)
      }
    })

    const results = new Map<string, unknown>()
    const queue: string[] = []
    inDegree.forEach((deg, id) => { if (deg === 0) queue.push(id) })

    // Animate edges
    setEdges((eds) => eds.map((e) => ({ ...e, animated: true, style: { stroke: "rgba(212,168,83,0.3)", strokeWidth: 2 } })))

    while (queue.length > 0) {
      // Run all modules with 0 in-degree in parallel
      const batch = [...queue]
      queue.length = 0

      // Mark running
      setModules((prev) => prev.map((m) => batch.includes(m.moduleId) ? { ...m, isRunning: true } : m))

      await Promise.all(batch.map(async (moduleId) => {
        const mod = enabledModules.find((m) => m.moduleId === moduleId)
        if (!mod) return

        const t = Date.now()
        try {
          // Build context from all previous results + scene
          const parts: string[] = []
          results.forEach((val, key) => parts.push(`${key}: ${JSON.stringify(val)}`))
          parts.push(`scene: ${sceneText}`)
          parts.push(`style: ${style}`)
          if (bible.screenplay) parts.push(`screenplay: ${bible.screenplay}`)
          if (bible.characters.length) parts.push(`characters: ${JSON.stringify(bible.characters)}`)
          if (bible.locations.length) parts.push(`locations: ${JSON.stringify(bible.locations)}`)

          const raw = await callChat(mod.systemPrompt, parts.join("\n\n"), mod.model)
          const parsed = tryParseJSON(raw)
          results.set(moduleId, parsed)

          // Also store by output name
          mod.outputs.forEach((out) => results.set(out, parsed))

          setModules((prev) => prev.map((m) => m.moduleId === moduleId
            ? { ...m, result: { raw, parsed, duration: Date.now() - t }, isRunning: false }
            : m))
        } catch (err) {
          setModules((prev) => prev.map((m) => m.moduleId === moduleId
            ? { ...m, result: { raw: "", parsed: null, duration: Date.now() - t, error: String(err) }, isRunning: false }
            : m))
        }

        // Update in-degree for downstream
        adjacency.get(moduleId)?.forEach((next) => {
          const newDeg = (inDegree.get(next) || 1) - 1
          inDegree.set(next, newDeg)
          if (newDeg === 0) queue.push(next)
        })
      }))
    }

    setEdges((eds) => eds.map((e) => ({ ...e, animated: false, style: { stroke: "rgba(255,255,255,0.12)", strokeWidth: 2 } })))
    setIsRunning(false)
  }, [isRunning, modules, edges, sceneText, style, bible, setEdges])

  // ── Save/Load ──

  const saveConfig = () => {
    const positions: Record<string, { x: number; y: number }> = {}
    nodes.forEach((n) => { positions[n.id] = n.position })
    // Strip results and imageUrls to avoid localStorage quota
    const cleanModules = modules.map(({ result, ...rest }) => rest)
    const cleanBible = {
      screenplay: bible.screenplay,
      characters: bible.characters.map(({ imageUrl, ...c }) => c),
      locations: bible.locations.map(({ imageUrl, ...l }) => l),
    }
    const config = {
      name: configName,
      modules: cleanModules,
      positions,
      connections: edges.map((e) => ({ source: e.source, target: e.target })),
      sceneText, style, bible: cleanBible,
    }
    try {
      localStorage.setItem(`pipeline-lab-${configName}`, JSON.stringify(config))
      setSavedConfigs((prev) => [...new Set([...prev, configName])])
    } catch { console.warn("Save failed — localStorage full") }
  }

  // Load saved names on mount
  useEffect(() => {
    const names: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith("pipeline-lab-")) names.push(key.replace("pipeline-lab-", ""))
    }
    setSavedConfigs(names)
  }, [])

  // ── Add Module ──

  const addModule = () => {
    const id = `module-${Date.now()}`
    const newMod: ModuleData = {
      moduleId: id, name: "New Module", description: "Новый модуль",
      systemPrompt: "Return ONLY valid JSON.", model: "gpt-4o",
      enabled: true, inputs: [], outputs: ["output"], color: "#94A3B8",
    }
    setModules((prev) => [...prev, newMod])
    setNodes((nds) => [...nds, {
      id, type: "module",
      position: { x: 800, y: 400 },
      data: { ...newMod, onSelect: setSelectedModuleId },
    }])
    setSelectedModuleId(id)
  }

  // ── Chat with assistant ──

  const sendChat = useCallback(async () => {
    const text = chatInput.trim()
    if (!text || chatLoading) return
    setChatInput("")
    setChatMessages((prev) => [...prev, { role: "user", content: text }])
    setChatLoading(true)
    try {
      const ctx = modules.map((m) => `${m.moduleId}: "${m.name}" [${m.model}] ${m.enabled ? "ON" : "OFF"}`).join("\n")
      const raw = await callChat(
        `You are Pipeline Lab Assistant. Manage modules via JSON commands.
Modify: \`\`\`json\n{"action":"update","moduleId":"...","changes":{"systemPrompt":"..."}}\`\`\`
Add: \`\`\`json\n{"action":"add","module":{"name":"...","systemPrompt":"...","model":"gpt-4o","inputs":[],"outputs":[],"color":"#..."}}\`\`\`
Remove: \`\`\`json\n{"action":"remove","moduleId":"..."}\`\`\`
Respond in Russian. Current modules:\n${ctx}`,
        text, "gpt-4o",
      )
      // Execute commands
      const blocks = raw.match(/```json\s*([\s\S]*?)```/g)
      let executed = 0
      if (blocks) {
        for (const block of blocks) {
          try {
            const cmd = JSON.parse(block.replace(/```json\s*/, "").replace(/```/, ""))
            if (cmd.action === "update" && cmd.moduleId) { updateModule(cmd.moduleId, cmd.changes); executed++ }
            if (cmd.action === "add" && cmd.module) { const m = { ...cmd.module, moduleId: `mod-${Date.now()}`, enabled: true }; setModules((p) => [...p, m]); executed++ }
            if (cmd.action === "remove" && cmd.moduleId) { setModules((p) => p.filter((m) => m.moduleId !== cmd.moduleId)); executed++ }
          } catch { /* skip */ }
        }
      }
      const display = raw.replace(/```json[\s\S]*?```/g, "").trim()
      setChatMessages((prev) => [...prev, { role: "assistant", content: display + (executed ? `\n\n✓ ${executed} команд выполнено` : "") }])
    } catch (err) {
      setChatMessages((prev) => [...prev, { role: "assistant", content: `Ошибка: ${err}` }])
    } finally { setChatLoading(false) }
  }, [chatInput, chatLoading, modules])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [chatMessages])

  // ── Final output from last module ──

  // Gather results — single Fincher Storyboard module
  const storyboardResult = modules.find((m) => m.moduleId === "fincher-storyboard")?.result?.parsed
  const storyboardObj = typeof storyboardResult === "object" && storyboardResult !== null ? storyboardResult as Record<string, unknown> : null
  const storyboardShots = storyboardObj?.shots && Array.isArray(storyboardObj.shots)
    ? storyboardObj.shots as Record<string, string>[]
    : Array.isArray(storyboardResult) ? storyboardResult as Record<string, string>[] : []
  const essence = storyboardObj?.essence as string || ""

  // Bible refs
  const bibleRefs = [...bible.characters.filter((c) => c.imageUrl), ...bible.locations.filter((l) => l.imageUrl)]
  const hasResults = storyboardShots.length > 0
  const shotCount = storyboardShots.length

  return (
    <div className="flex h-screen bg-[#0A0B0E] text-[#E5E0DB]">
      {/* ── Left: Scene + Bible ── */}
      <div className="flex w-[360px] shrink-0 flex-col border-r border-white/6 bg-[#0E1016]">
        <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
          <h1 className="text-[20px] font-bold tracking-wide">Pipeline Lab</h1>
          <div className="flex gap-1">
            <button type="button" onClick={saveConfig} title="Save" className="rounded-lg bg-white/5 p-2 text-white/40 hover:text-white/70"><Save size={16} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5" style={{ scrollbarWidth: "thin" }}>
          {/* Save / Load */}
          <div className="flex gap-2">
            <input value={configName} onChange={(e) => setConfigName(e.target.value)}
              className="flex-1 rounded-lg bg-white/5 px-4 py-2.5 text-[15px] text-white/70 outline-none" placeholder="Название пайплайна" />
            <button type="button" onClick={saveConfig}
              className="rounded-lg bg-[#D4A853]/20 px-4 py-2.5 text-[14px] font-bold text-[#D4A853] hover:bg-[#D4A853]/30">
              Save
            </button>
          </div>

          {savedConfigs.length > 0 && (
            <div className="rounded-xl border border-white/8 bg-white/3">
              <div className="px-3 py-2 text-[12px] font-medium uppercase tracking-wider text-white/25">Сохранённые пайплайны</div>
              {savedConfigs.map((name) => (
                <div key={name} className="flex items-center border-t border-white/5">
                  <button type="button" onClick={() => {
                    const raw = localStorage.getItem(`pipeline-lab-${name}`)
                    if (raw) {
                      const c = JSON.parse(raw) as PipelineConfig
                      setModules(c.modules as ModuleData[])
                      setSceneText(c.sceneText)
                      setStyle(c.style)
                      setBible(c.bible as typeof bible)
                      setConfigName(c.name)
                    }
                  }} className="flex flex-1 items-center gap-2 px-3 py-2.5 text-left text-[14px] text-white/60 hover:bg-white/5 hover:text-white/80">
                    <Upload size={14} className="text-white/25" />
                    {name}
                  </button>
                  <button type="button" onClick={() => {
                    localStorage.removeItem(`pipeline-lab-${name}`)
                    setSavedConfigs((prev) => prev.filter((n) => n !== name))
                  }} className="px-3 py-2.5 text-white/15 hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Scene text */}
          <div>
            <label className="mb-2 block text-[13px] font-medium text-white/30">Текст сцены</label>
            <textarea value={sceneText} onChange={(e) => setSceneText(e.target.value)}
              rows={8} className="w-full resize-y rounded-xl bg-white/5 p-4 text-[14px] leading-relaxed text-white/70 outline-none" style={{ scrollbarWidth: "thin" }} />
          </div>

          {/* Style */}
          <div>
            <label className="mb-2 block text-[13px] font-medium text-white/30">Стиль</label>
            <select value={style} onChange={(e) => setStyle(e.target.value)}
              className="w-full rounded-xl bg-white/5 px-4 py-2.5 text-[14px] text-white/60 outline-none">
              <option value="Anime style, cel shading, dramatic lighting">Anime</option>
              <option value="Photorealistic, natural lighting, ARRI Alexa look">Realistic</option>
              <option value="Film noir, high contrast black and white">Film Noir</option>
              <option value="Watercolor illustration, soft washes">Watercolor</option>
              <option value="Clean storyboard sketch, pencil outline">Sketch</option>
            </select>
          </div>

          {/* Bible mini */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <BookOpen size={14} className="text-white/30" />
              <span className="text-[13px] font-medium text-white/30">Bible</span>
            </div>
            <div className="space-y-2">
              {/* Screenplay description */}
              <div className="rounded-lg bg-white/3 p-3">
                <label className="mb-1 block text-[11px] font-medium text-[#D4A853]/50">Описание сценария</label>
                <textarea value={bible.screenplay} onChange={(e) => setBible({ ...bible, screenplay: e.target.value })}
                  rows={3} className="w-full resize-y bg-transparent text-[13px] leading-relaxed text-white/60 outline-none" placeholder="Жанр, сюжет, атмосфера..." style={{ scrollbarWidth: "thin" }} />
              </div>
              {bible.characters.map((c, i) => (
                <div key={i} className="rounded-lg bg-white/3 p-3">
                  <div className="flex items-center gap-3">
                    {/* Image upload */}
                    <label className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-white/8 text-[12px] text-white/30 hover:bg-white/12 transition-colors">
                      {c.imageUrl ? <img src={c.imageUrl} className="h-full w-full object-cover" /> : c.name.slice(0, 2) || "?"}
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0]; if (!file) return
                        const url = URL.createObjectURL(file)
                        const chars = [...bible.characters]; chars[i] = { ...c, imageUrl: url }; setBible({ ...bible, characters: chars })
                        // Auto-transcribe
                        try {
                          const reader = new FileReader(); const base64: string = await new Promise((res) => { reader.onload = () => res(reader.result as string); reader.readAsDataURL(file) })
                          const desc = await callChat("Describe this person's appearance in detail for a storyboard: face, hair, age, build, clothing. 2-3 sentences. Respond in Russian.", base64, "gpt-4o")
                          chars[i] = { ...chars[i], imageDescription: desc.trim() }; setBible({ ...bible, characters: chars })
                        } catch { /* skip */ }
                      }} />
                    </label>
                    <div className="min-w-0 flex-1">
                      <input value={c.name} onChange={(e) => { const chars = [...bible.characters]; chars[i] = { ...c, name: e.target.value }; setBible({ ...bible, characters: chars }) }}
                        className="w-full bg-transparent text-[14px] font-medium text-white/70 outline-none" placeholder="Имя" />
                      <input value={c.appearance} onChange={(e) => { const chars = [...bible.characters]; chars[i] = { ...c, appearance: e.target.value }; setBible({ ...bible, characters: chars }) }}
                        className="w-full bg-transparent text-[12px] text-white/35 outline-none" placeholder="Внешность..." />
                    </div>
                  </div>
                  {c.imageDescription && (
                    <p className="mt-2 rounded bg-white/3 px-2 py-1 text-[11px] italic text-[#D4A853]/50">{c.imageDescription}</p>
                  )}
                </div>
              ))}
              {bible.locations.map((l, i) => (
                <div key={`loc-${i}`} className="rounded-lg bg-white/3 p-3">
                  <div className="flex items-center gap-3">
                    <label className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-white/8 text-white/30 hover:bg-white/12 transition-colors">
                      {l.imageUrl ? <img src={l.imageUrl} className="h-full w-full object-cover" /> : <MapPin size={14} />}
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0]; if (!file) return
                        const url = URL.createObjectURL(file)
                        const locs = [...bible.locations]; locs[i] = { ...l, imageUrl: url }; setBible({ ...bible, locations: locs })
                        try {
                          const reader = new FileReader(); const base64: string = await new Promise((res) => { reader.onload = () => res(reader.result as string); reader.readAsDataURL(file) })
                          const desc = await callChat("Describe this location in detail for a storyboard: architecture, materials, lighting, mood, key objects. 2-3 sentences. Respond in Russian.", base64, "gpt-4o")
                          locs[i] = { ...locs[i], imageDescription: desc.trim() }; setBible({ ...bible, locations: locs })
                        } catch { /* skip */ }
                      }} />
                    </label>
                    <div className="min-w-0 flex-1">
                      <input value={l.name} onChange={(e) => { const locs = [...bible.locations]; locs[i] = { ...l, name: e.target.value }; setBible({ ...bible, locations: locs }) }}
                        className="w-full bg-transparent text-[14px] font-medium text-white/70 outline-none" placeholder="Название" />
                      <input value={l.description} onChange={(e) => { const locs = [...bible.locations]; locs[i] = { ...l, description: e.target.value }; setBible({ ...bible, locations: locs }) }}
                        className="w-full bg-transparent text-[12px] text-white/35 outline-none" placeholder="Описание..." />
                    </div>
                  </div>
                  {l.imageDescription && (
                    <p className="mt-2 rounded bg-white/3 px-2 py-1 text-[11px] italic text-[#D4A853]/50">{l.imageDescription}</p>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
              <button type="button" onClick={() => setBible({ ...bible, characters: [...bible.characters, { name: "", appearance: "" }] })}
                className="flex-1 rounded-lg border border-dashed border-white/10 py-2 text-[13px] text-white/25 hover:text-white/40">+ персонаж</button>
              <button type="button" onClick={() => setBible({ ...bible, locations: [...bible.locations, { name: "", description: "" }] })}
                className="flex-1 rounded-lg border border-dashed border-white/10 py-2 text-[13px] text-white/25 hover:text-white/40">+ локация</button>
              </div>
            </div>
          </div>

          {/* Run */}
          <button type="button" onClick={runPipeline} disabled={isRunning}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#D4A853] py-3.5 text-[16px] font-bold text-black transition-all hover:bg-[#E8C98A] disabled:opacity-40">
            {isRunning ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
            Run Pipeline
          </button>
        </div>
      </div>

      {/* ── Center: Graph ── */}
      <div className="relative min-w-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.3}
          maxZoom={2}
          defaultEdgeOptions={{ type: "smoothstep" }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="rgba(255,255,255,0.03)" gap={40} size={1} />
          <Controls className="!rounded-xl !border-white/10 !bg-[#1A1B1F]/90 [&>button]:!border-white/10 [&>button]:!bg-transparent [&>button]:!text-white/40 [&>button:hover]:!bg-white/10" />
          <MiniMap
            className="!rounded-xl !border-white/10 !bg-[#1A1B1F]/80"
            nodeColor={(n) => {
              const mod = modules.find((m) => m.moduleId === n.id)
              return mod?.color || "#555"
            }}
            maskColor="rgba(0,0,0,0.7)"
          />

          {/* Top bar */}
          <Panel position="top-center">
            <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-[#1A1B1F]/90 px-5 py-2.5 backdrop-blur-sm">
              <span className="text-[14px] text-white/30">{modules.filter((m) => m.enabled).length} модулей</span>
              <span className="h-4 w-px bg-white/10" />
              <button type="button" onClick={addModule} className="flex items-center gap-1.5 text-[14px] text-white/40 hover:text-white/70">
                <Plus size={14} /> Модуль
              </button>
              <span className="h-4 w-px bg-white/10" />
              <button type="button" onClick={() => setShowChat(!showChat)} className={`flex items-center gap-1.5 text-[14px] ${showChat ? "text-[#D4A853]" : "text-white/40 hover:text-white/70"}`}>
                <MessageSquare size={14} /> Ассистент
              </button>
            </div>
          </Panel>
        </ReactFlow>

        {/* ── Results panel — right side ── */}
        {hasResults && (() => {
          const idx = Math.min(selectedShotIdx, shotCount - 1)
          const shot = storyboardShots[idx] || {}
          const basePromptText = shot.prompt || ""
          const promptText = editedPrompts.get(idx) ?? basePromptText

          return (
          <div className="absolute right-0 top-0 bottom-0 z-10 flex w-[420px] flex-col border-l border-[#D4A853]/20 bg-[#0E1016]/95 backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/6 px-4 py-3">
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-[#D4A853]" />
                <span className="text-[15px] font-bold text-[#D4A853]">{shotCount} кадров</span>
              </div>
              <div className="flex items-center gap-2">
                <select value={imageGenModel} onChange={(e) => setImageGenModel(e.target.value)}
                  className="rounded-lg bg-white/8 px-2 py-1 text-[12px] text-white/50 outline-none">
                  <option value="nano-banana">Nano Banana</option>
                  <option value="nano-banana-2">NB 2</option>
                  <option value="gpt-image">GPT Image</option>
                </select>
                {bibleRefs.length > 0 && bibleRefs.map((ref, ri) => (
                  <img key={ri} src={(ref as BibleCharacter).imageUrl || (ref as BibleLocation).imageUrl || ""} className="h-7 w-7 rounded-md border border-white/10 object-cover" />
                ))}
              </div>
            </div>

            {/* Essence */}
            {essence && (
              <div className="border-b border-white/6 px-4 py-2">
                <p className="text-[13px] italic text-[#D4A853]/70">{essence}</p>
              </div>
            )}

            {/* Shot list */}
            <div className="flex gap-1.5 overflow-x-auto border-b border-white/6 px-3 py-2" style={{ scrollbarWidth: "thin" }}>
              {storyboardShots.map((s, i) => (
                <button key={i} type="button" onClick={() => setSelectedShotIdx(i)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                    i === idx ? "bg-[#D4A853]/20 text-[#D4A853]" : "bg-white/5 text-white/40 hover:bg-white/10"
                  }`}>
                  {generatedImages.has(i) && <img src={generatedImages.get(i)} className="h-6 w-10 rounded object-cover" />}
                  {i + 1}
                </button>
              ))}
            </div>

            {/* Selected shot detail */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ scrollbarWidth: "thin" }}>
              {/* Image */}
              {generatedImages.has(idx) ? (
                <div className="overflow-hidden rounded-xl border border-white/10">
                  <img src={generatedImages.get(idx)} className="w-full object-cover" style={{ aspectRatio: "16/9" }} />
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/2 py-6">
                  <span className="text-[13px] text-white/20">Нет изображения</span>
                </div>
              )}

              {/* Generate button */}
              <button type="button"
                disabled={generatingShots.has(idx) || !promptText}
                onClick={() => { if (promptText) generateImage(idx, promptText) }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#CCFF00] py-3 text-[14px] font-bold text-black hover:bg-[#D8FF33] disabled:opacity-30">
                {generatingShots.has(idx) ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                {generatingShots.has(idx) ? "Генерация..." : "Generate Shot " + (idx + 1)}
              </button>

              {/* Title */}
              {shot.title && (
                <h3 className="text-[16px] font-bold text-white/80">{shot.title}</h3>
              )}

              {/* Fincher description blocks */}
              {shot.angle && (
                <div className="rounded-xl bg-red-500/5 px-4 py-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-red-400/50">Ракурс</span>
                  <p className="mt-1 text-[13px] text-white/70">{shot.angle}</p>
                </div>
              )}
              {shot.composition && (
                <div className="rounded-xl bg-blue-500/5 px-4 py-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400/50">Композиция</span>
                  <p className="mt-1 text-[13px] text-white/60">{shot.composition}</p>
                </div>
              )}
              {shot.light && (
                <div className="rounded-xl bg-yellow-500/5 px-4 py-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-yellow-400/50">Свет</span>
                  <p className="mt-1 text-[13px] text-white/60">{shot.light}</p>
                </div>
              )}
              {shot.color && (
                <div className="rounded-xl bg-purple-500/5 px-4 py-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-purple-400/50">Цвет</span>
                  <p className="mt-1 text-[13px] text-white/60">{shot.color}</p>
                </div>
              )}
              {shot.lens && (
                <div className="rounded-xl bg-cyan-500/5 px-4 py-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400/50">Объектив + Движение</span>
                  <p className="mt-1 text-[13px] text-white/60">{shot.lens}</p>
                </div>
              )}
              {shot.purpose && (
                <div className="rounded-xl bg-orange-500/5 px-4 py-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-orange-400/50">Монтажная функция</span>
                  <p className="mt-1 text-[13px] text-white/60">{shot.purpose}</p>
                </div>
              )}

              {/* Prompt — editable */}
              <div className="rounded-xl bg-[#10B981]/8 px-4 py-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#10B981]/50">Nano Banana Prompt ({promptText.length})</span>
                  <div className="flex items-center gap-1.5">
                    {editedPrompts.has(idx) && (
                      <button type="button" onClick={() => setEditedPrompts((p) => { const n = new Map(p); n.delete(idx); return n })}
                        title="Вернуть оригинал" className="text-white/20 hover:text-[#D4A853]"><RotateCcw size={12} /></button>
                    )}
                    <button type="button" onClick={() => navigator.clipboard.writeText(promptText)}
                      title="Копировать" className="text-white/20 hover:text-white/50"><Copy size={12} /></button>
                  </div>
                </div>
                <textarea
                  value={promptText}
                  onChange={(e) => setEditedPrompts((p) => new Map(p).set(idx, e.target.value))}
                  rows={5}
                  className="w-full resize-y rounded-lg bg-black/20 p-2 text-[14px] leading-relaxed text-[#E7E3DC] outline-none"
                  style={{ scrollbarWidth: "thin" }}
                  placeholder="Промпт для генерации..."
                />
              </div>
            </div>

            {/* Generate All */}
            <div className="border-t border-white/6 px-4 py-3">
              <button type="button" onClick={() => {
                storyboardShots.forEach((s, i) => {
                  const t = editedPrompts.get(i) ?? s.prompt
                  if (t) generateImage(i, t)
                })
              }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#CCFF00]/15 py-2.5 text-[13px] font-bold text-[#CCFF00] hover:bg-[#CCFF00]/25">
                Generate All ({shotCount})
              </button>
            </div>
          </div>
          )
        })()}
      </div>

      {/* ── Right: Module inspector + Chat ── */}
      {(selectedModule || showChat) && (
        <div className="flex w-[400px] shrink-0 flex-col border-l border-white/6 bg-[#0E1016]">
          {/* Tabs */}
          <div className="flex border-b border-white/6">
            {selectedModule && (
              <button type="button" onClick={() => setShowChat(false)}
                className={`flex-1 py-3 text-center text-[14px] font-medium ${!showChat ? "border-b-2 border-[#D4A853] text-[#D4A853]" : "text-white/30"}`}>
                <Settings size={14} className="mr-1.5 inline" /> Inspector
              </button>
            )}
            <button type="button" onClick={() => setShowChat(true)}
              className={`flex-1 py-3 text-center text-[14px] font-medium ${showChat ? "border-b-2 border-[#D4A853] text-[#D4A853]" : "text-white/30"}`}>
              <MessageSquare size={14} className="mr-1.5 inline" /> Ассистент
            </button>
          </div>

          {/* Inspector */}
          {!showChat && selectedModule && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ scrollbarWidth: "thin" }}>
              <div className="flex items-center justify-between">
                <input value={selectedModule.name} onChange={(e) => updateModule(selectedModule.moduleId, { name: e.target.value })}
                  className="bg-transparent text-[20px] font-bold text-white/80 outline-none" />
                <button type="button" onClick={() => updateModule(selectedModule.moduleId, { enabled: !selectedModule.enabled })}
                  className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${selectedModule.enabled ? "bg-green-500/15 text-green-400" : "bg-white/5 text-white/30"}`}>
                  {selectedModule.enabled ? "ON" : "OFF"}
                </button>
              </div>

              <input value={selectedModule.description} onChange={(e) => updateModule(selectedModule.moduleId, { description: e.target.value })}
                className="w-full bg-transparent text-[14px] text-white/40 outline-none" placeholder="Описание..." />

              {/* Model */}
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-white/25">Модель</label>
                <select value={selectedModule.model} onChange={(e) => updateModule(selectedModule.moduleId, { model: e.target.value })}
                  className="w-full rounded-xl bg-white/5 px-4 py-2.5 text-[14px] text-white/60 outline-none">
                  {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* System prompt */}
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-white/25">System Prompt</label>
                <textarea value={selectedModule.systemPrompt} onChange={(e) => updateModule(selectedModule.moduleId, { systemPrompt: e.target.value })}
                  rows={10} className="w-full resize-y rounded-xl bg-white/5 p-4 font-mono text-[13px] leading-relaxed text-white/60 outline-none" style={{ scrollbarWidth: "thin" }} />
              </div>

              {/* Color */}
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-white/25">Цвет</label>
                <input type="color" value={selectedModule.color} onChange={(e) => updateModule(selectedModule.moduleId, { color: e.target.value })}
                  className="h-10 w-20 cursor-pointer rounded-lg border-0 bg-transparent" />
              </div>

              {/* Result */}
              {selectedModule.result && (
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-white/25">
                    Результат {selectedModule.result.duration ? `(${(selectedModule.result.duration / 1000).toFixed(1)}s)` : ""}
                  </label>
                  {selectedModule.result.error && <p className="mb-2 text-[14px] text-red-400">{selectedModule.result.error}</p>}
                  <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-4 text-[12px] leading-relaxed text-white/50" style={{ scrollbarWidth: "thin" }}>
                    {typeof selectedModule.result.parsed === "string" ? selectedModule.result.parsed : JSON.stringify(selectedModule.result.parsed, null, 2)}
                  </pre>
                </div>
              )}

              {/* Delete */}
              <button type="button" onClick={() => { setModules((p) => p.filter((m) => m.moduleId !== selectedModule.moduleId)); setNodes((n) => n.filter((nd) => nd.id !== selectedModule.moduleId)); setSelectedModuleId(null) }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/10 py-2.5 text-[14px] text-red-400/70 hover:bg-red-500/20">
                <Trash2 size={14} /> Удалить модуль
              </button>
            </div>
          )}

          {/* Chat */}
          {showChat && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ scrollbarWidth: "thin" }}>
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`rounded-xl px-4 py-3 text-[14px] leading-relaxed ${
                    msg.role === "user" ? "ml-10 bg-[#D4A853]/10 text-[#E8D7B2]" : "mr-6 bg-white/5 text-white/60"
                  }`}><p className="whitespace-pre-wrap">{msg.content}</p></div>
                ))}
                {chatLoading && <div className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-3"><Loader2 size={14} className="animate-spin text-[#D4A853]" /><span className="text-white/30">Думаю...</span></div>}
                <div ref={chatEndRef} />
              </div>
              <div className="border-t border-white/6 p-4">
                <div className="flex gap-2">
                  <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                    placeholder="Измени промпт, добавь модуль..."
                    className="flex-1 rounded-xl bg-white/5 px-4 py-3 text-[14px] text-white/70 outline-none placeholder:text-white/20" />
                  <button type="button" onClick={sendChat} disabled={chatLoading}
                    className="rounded-xl bg-[#D4A853]/20 px-4 text-[#D4A853] hover:bg-[#D4A853]/30 disabled:opacity-30"><Send size={16} /></button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
