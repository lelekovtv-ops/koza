"use client"

import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { trySaveBlob, loadBlob, restoreAllBlobs } from "@/lib/fileStorage"
import { ImageEditOverlay } from "@/components/ui/ImageEditOverlay"
import { useBreakdownConfigStore } from "@/store/breakdownConfig"
import { useBoardStore } from "@/store/board"
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
import { Bot, Play, Loader2, Plus, Save, Sparkles, Upload, Trash2, Copy, Settings, Eye, ChevronDown, Send, X, MessageSquare, BookOpen, MapPin, Image as ImageIcon, RotateCcw, Search, Check } from "lucide-react"

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

interface ModuleData {
  moduleId: string
  name: string
  description: string
  systemPrompt: string
  model: string
  temperature?: number
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
  imageDescription?: string
  blobKey?: string
}

interface BibleLocation {
  name: string
  description: string
  imageUrl?: string
  imageDescription?: string
  blobKey?: string
}

interface BibleProp {
  name: string
  description: string
  imageUrl?: string
  imageDescription?: string
  blobKey?: string
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
  "claude-sonnet-4-20250514", "claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001",
  "gpt-4o", "gpt-4o-mini",
  "gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-pro",
]

// ══════════════════════════════════════════════════════════════
// PIPELINE PRESETS
// ══════════════════════════════════════════════════════════════

interface PipelinePreset {
  id: string
  name: string
  description: string
  style: string
  defaultScene: string
  defaultBible: {
    screenplay: string
    characters: BibleCharacter[]
    locations: BibleLocation[]
    props: BibleProp[]
  }
  modules: ModuleData[]
  positions: Record<string, { x: number; y: number }>
  dataNodes: Array<{ id: string; type: string; data: Record<string, unknown> }>
  outputNodes: Array<{ id: string; data: Record<string, unknown> }>
  codeNodes: Array<{ id: string; data: Record<string, unknown> }>
  forEachNodes: Array<{ id: string; data: Record<string, unknown> }>
  connections: Array<{ source: string; target: string }>
}

// ── FINCHER: Full 5-module pipeline ──
const FINCHER_MODULES: ModuleData[] = [
  {
    moduleId: "scene-analyst",
    name: "Scene Analyst",
    description: "Анализирует сцену: суть, тон, география, персонажи, предметы, визуальные мотивы",
    systemPrompt: `You are Scene Analyst — the first stage of a cinematic pipeline.
Analyze the scene and return structured analysis.

Return ONE valid JSON:
{
  "sceneSummary": "суть сцены в 2-3 предложениях",
  "emotionalTone": "эмоциональный тон",
  "geography": "пространство сцены, как устроена физически",
  "characterPresence": ["имена персонажей"],
  "propCandidates": ["важные предметы"],
  "visualMotifs": ["визуальные мотивы"],
  "continuityRisks": ["риски непрерывности"],
  "recommendedShotCount": 6
}

Respond in Russian. JSON only, no markdown.`,
    model: "claude-sonnet-4-20250514",
    enabled: true,
    inputs: ["scene", "bible"],
    outputs: ["analysis"],
    color: "#8B5CF6",
  },
  {
    moduleId: "prop-scanner",
    name: "Prop Scanner",
    description: "Находит ВСЕ предметы реквизита в сцене, генерирует описание и appearance prompt",
    systemPrompt: `You are Prop Scanner — a production designer's assistant.

Analyze the scene text carefully. Find EVERY physical object, prop, and set piece mentioned or implied.

You receive: scene text + existing Bible props.

Your job:
1. Find ALL props from the scene text (телевизор, пепельница, документы, телефон, стакан, etc.)
2. Include objects that are IMPLIED but not directly named (мебель, стены, окна, etc.)
3. For each prop: Russian description + English appearance prompt for image generation
4. Mark which props are ALREADY in Bible vs NEW

Return JSON:
{
  "discoveredProps": [
    {
      "name": "Старый телевизор",
      "description": "Единственный источник света в комнате, мерцает",
      "appearancePrompt": "Old CRT television set, flickering blue-white screen, dusty surface, 1990s model, dark room, screen glow illuminating surroundings",
      "isNew": true,
      "importance": "high"
    }
  ]
}

importance: "high" = ключевой для сцены, "medium" = присутствует, "low" = фоновый.
JSON only, no markdown.`,
    model: "claude-sonnet-4-20250514",
    enabled: true,
    inputs: ["scene", "analysis", "bible"],
    outputs: ["props"],
    color: "#06B6D4",
  },
  {
    moduleId: "shot-planner",
    name: "Shot Planner",
    description: "Планирует раскадровку + назначает пропсы в каждый кадр",
    systemPrompt: `You are Shot Planner — a Fincher-style cinematographer.

Based on scene analysis AND discovered props, plan 4-8 shots.

═══ ПРИНЦИПЫ ═══
- КАМЕРА НАБЛЮДАЕТ. Surveillance footage.
- ГЕОМЕТРИЯ. Предметы = улики.
- ОДИН ИСТОЧНИК СВЕТА. Жёсткая граница свет/тень.
- ПЕРВЫЙ КАДР — самый нестандартный.

═══ ПРОПСЫ В КАДРЕ ═══
Для КАЖДОГО кадра укажи какие КОНКРЕТНЫЕ предметы ВИДНЫ в этом кадре.
Используй список из Prop Scanner. Предмет может быть виден, но не в фокусе.

Return JSON:
{
  "shots": [
    {
      "id": "shot-1",
      "title": "название",
      "shotSize": "Wide/Medium/Close-up/ECU",
      "angle": "конкретный ракурс подробно",
      "cameraMotion": "Static/Push In/Tracking/Pan/Crane/Handheld",
      "composition": "что где в кадре",
      "light": "источник света и тени",
      "color": "палитра",
      "lens": "объектив mm + движение",
      "subject": "главный субъект",
      "purpose": "монтажная функция",
      "visibleProps": ["Пепельница", "Документы", "Телевизор"],
      "propNotes": "Пепельница на переднем плане как якорь, ТВ даёт свет из фона"
    }
  ]
}

Russian descriptions. JSON only.`,
    model: "claude-sonnet-4-20250514",
    enabled: true,
    inputs: ["analysis", "scene", "style", "bible"],
    outputs: ["shotPlan"],
    color: "#E11D48",
  },
  {
    moduleId: "prop-distributor",
    name: "Prop Distributor",
    description: "Распределяет пропсы по шотам: что видно в кадре, что нет, что навредит",
    systemPrompt: `You are Prop Distributor — an experienced set decorator and director of photography combined.

You receive: shot plan, discovered props (with descriptions), scene text, and Bible data.

YOUR JOB: For EACH shot, decide which props are ACTUALLY VISIBLE given the specific camera angle, shot size, and composition. Think like a DP looking through the viewfinder.

═══ RULES OF VISIBILITY ═══

1. SHOT SIZE determines what fits in frame:
   - ECU (extreme close-up): ONLY the subject detail. Maybe 1 prop if it's IN HAND or touching the subject.
   - Close-up: Face/object + immediate surroundings (30cm radius). 1-3 small props max.
   - Medium: Waist up or desk area. Props on the table, in hands, on nearby surfaces.
   - Wide/Establishing: Entire room visible. Most props CAN be seen, but distant ones are small.

2. CAMERA ANGLE determines what's blocked:
   - High angle (looking down): Table surface visible, wall items NOT visible.
   - Low angle (looking up): Floor items NOT visible, ceiling/upper shelves visible.
   - Eye level: Standard — what a person sitting/standing would see.
   - POV through object: The "through" object is foreground blur, only things BEYOND it are sharp.
   - Over-the-shoulder: Character's back blocks center, props visible on sides.

3. DEPTH matters:
   - Foreground (0-1m from camera): Large in frame, can be out of focus (bokeh). Good for framing.
   - Midground (1-3m): Sharp focus zone. This is where the subject usually is.
   - Background (3m+): Small, often soft. Set dressing, not hero props.

4. WHEN TO EXCLUDE a prop (CRITICAL):
   - Prop is BEHIND the camera → exclude
   - Prop is blocked by subject/furniture → exclude
   - Prop would clutter a clean composition → exclude with reason
   - Prop is on a surface not in frame (e.g. table prop in a ceiling shot) → exclude
   - Adding prop would contradict the shot's purpose (intimate moment doesn't need background noise) → exclude
   - Prop is in the scene but CHARACTER HASN'T INTERACTED with it yet at this point → note timing

5. WHEN TO INCLUDE a prop:
   - Prop is narratively important for THIS specific moment
   - Prop creates visual depth (foreground element for framing)
   - Prop provides context/atmosphere (ashtray = nervousness, documents = work)
   - Prop is a continuity requirement (was in previous shot, must persist)

═══ OUTPUT ═══

Return JSON:
{
  "shots": [
    {
      "shotId": "shot-1",
      "shotSize": "from shot plan",
      "angle": "from shot plan",
      "visibleProps": [
        {
          "name": "Пепельница",
          "placement": "foreground left, out of focus",
          "size_in_frame": "large, ~15% of frame",
          "reason": "Визуальный якорь, подчёркивает нервозность"
        }
      ],
      "excludedProps": [
        {
          "name": "Занавеска",
          "reason": "Камера направлена на стол сверху — окно за кадром"
        }
      ],
      "propAdvice": "Не перегружать кадр — это крупный план рук, пепельница даёт глубину через боке"
    }
  ]
}

Rules:
- Respond in Russian (names, reasons, advice)
- Be SPECIFIC about placement (foreground/mid/background + left/center/right)
- size_in_frame helps the prompt composer know how prominent the prop should be
- ALWAYS explain WHY excluded — this teaches the system
- propAdvice is your professional opinion for the prompt writer
- JSON only, no markdown`,
    model: "claude-sonnet-4-20250514",
    enabled: true,
    inputs: ["shotPlan", "props", "scene", "bible"],
    outputs: ["propDistribution"],
    color: "#14B8A6",
  },
  {
    moduleId: "prompt-composer",
    name: "Prompt Composer",
    description: "Генерирует промпт для ОДНОГО кадра (per-shot через ForEach)",
    systemPrompt: `You are Prompt Composer for Gemini image generation (target: 200-350 characters).

You receive: ONE shot (current_item), propDistribution, Bible data (characters, locations, props — some may have imageUrl meaning a reference image exists).

═══ ADAPTIVE RULES ═══

CHARACTER in frame:
- Has imageUrl (ref photo exists) → write ONLY name, NO appearance text. The ref image speaks for itself.
- No imageUrl → include short appearance (age, build, hair, clothing — max 15 words). This is the ONLY way to keep consistency.

LOCATION:
- Wide/Establishing shot → include key visual elements (walls, light source, condition — max 10 words)
- Medium shot → brief setting hint (3-5 words: "cramped dim room")
- Close-up/ECU → SKIP location entirely. Wasted budget.

PROPS (use propDistribution data):
- size_in_frame "large" or foreground → include with material/color (e.g. "overflowing ceramic ashtray")
- size_in_frame "small" or background → name only (e.g. "TV glow behind")
- Excluded by Prop Distributor → do NOT mention
- Prop has imageUrl → name + placement only, no description
- Prop has no imageUrl → name + short visual description

═══ PROMPT STRUCTURE ═══
{Style}. {Shot size + angle}. {Subject — adaptive}. {Visible props — adaptive}. {Light source + shadow direction}. {Color palette}. {Lens}. 16:9. No text, no watermark.

═══ BUDGET ═══
- Target: 40-60 words (200-350 chars)
- NEVER exceed 80 words
- Every word must describe something VISIBLE
- No mood/emotion words (tension, atmosphere, feeling) — only physical things

Return JSON:
{
  "shotId": "from current_item",
  "label": "shot title",
  "directorNote": "режиссёрская заметка (рус)",
  "cameraNote": "заметка оператора (рус)",
  "imagePrompt": "English prompt 40-60 words",
  "hasCharRef": true,
  "hasLocRef": false,
  "promptChars": 280
}

JSON only, no markdown.`,
    model: "claude-sonnet-4-20250514",
    enabled: true,
    inputs: ["shotPlan", "propDistribution", "scene", "style", "bible"],
    outputs: ["imagePrompts"],
    color: "#FB923C",
  },
]

// ── DISNEY: Simple 2-module pipeline (Shot Planner → Prompt Composer) ──
const DISNEY_MODULES: ModuleData[] = [
  {
    moduleId: "shot-planner",
    name: "Shot Planner",
    description: "Планирует яркую раскадровку в стиле Disney/Pixar — эмоции, цвет, динамика",
    systemPrompt: `You are Shot Planner for an animated fantasy production.

Plan 4-6 shots that tell the story with MAXIMUM emotional clarity and visual appeal.

═══ PRINCIPLES ═══
- EMOTION FIRST. Every shot exists to make the audience FEEL something.
- CLEAR STAGING. Characters and props placed for instant readability.
- DYNAMIC ANGLES. Dramatic low angles for power, bird's eye for loneliness, Dutch tilt for chaos.
- COLOR = EMOTION. Warm = safe/happy. Cool = sad/lonely. Saturated = intense.
- LIGHT is a character — rim lights, volumetric rays, dramatic shadows.

═══ PROPS ARE CRITICAL ═══
You receive a list of props from Bible. For EACH shot, you MUST decide:
- Which props are VISIBLE in this specific shot (given angle, framing, composition)
- WHERE exactly each prop is placed (in character's hands, on table, background, foreground)
- HOW the prop interacts with the character or scene

Props tell the story! A music box IN HANDS is different from a music box ON A SHELF.
If a prop is mentioned in the scene text for this moment — it MUST appear in the shot.

═══ CHARACTERS ═══
For each shot, list which characters are visible. Use their EXACT names from Bible.

Return JSON:
{
  "shots": [
    {
      "id": "shot-1",
      "title": "название кадра",
      "shotSize": "Wide/Medium/Close-up/ECU",
      "angle": "конкретный ракурс",
      "cameraMotion": "Static/Push In/Pull Back/Arc/Crane Up",
      "composition": "что где в кадре, где персонаж, где предметы",
      "light": "тип освещения и направление",
      "color": "цветовая палитра",
      "lens": "объектив",
      "subject": "главный субъект (EXACT name from Bible)",
      "emotion": "какую эмоцию вызывает кадр",
      "visibleCharacters": ["МАРИНА", "СЕБАСТЬЯН"],
      "visibleProps": ["Музыкальная шкатулка"],
      "propPlacement": "Шкатулка в руках Марины, открыта, светится золотым",
      "propNotes": "как предметы работают на историю"
    }
  ]
}

Russian descriptions. JSON only, no markdown.`,
    model: "gemini-2.5-flash",
    enabled: true,
    inputs: ["scene", "style", "bible"],
    outputs: ["shotPlan"],
    color: "#F59E0B",
  },
  {
    moduleId: "prompt-composer",
    name: "Prompt Composer",
    description: "Генерирует промпт для каждого кадра (per-shot через ForEach)",
    systemPrompt: `You are Prompt Composer for animated fantasy-style image generation.

You receive ONE shot (current_item) + Bible data (characters, locations, props with descriptions).

═══ PROPS IN PROMPT — MANDATORY ═══
The shot's "visibleProps" lists props that MUST appear in the image prompt.
For EACH visible prop:
1. Find its description in Bible props data
2. Include it in the prompt with its visual description and placement from "propPlacement"
3. If Bible has appearance description → use it (e.g. "bronze music box with ballerina inside, glowing golden")
4. If no description → use a vivid visual description based on the name

Example: visibleProps=["Музыкальная шкатулка"], Bible says "бронзовая, с балериной внутри"
→ prompt: "...clutching an ornate bronze music box with tiny ballerina, emanating warm golden glow..."

DO NOT skip props! They are story elements. A shot without its props is WRONG.
TRANSLATE all prop names to English in the prompt (e.g. "Музыкальная шкатулка" → "music box", "Трезубец" → "trident").

═══ CHARACTERS ═══
- hasRefImage=true → name only, NO appearance text
- hasRefImage=false → short appearance from Bible (age, hair, clothing — max 15 words)

═══ STYLE ═══
- Vibrant, expressive, dynamic composition
- Dramatic volumetric lighting, rim lights, god rays
- Rich saturated emotionally coded colors
- NEVER use brand names (Disney, Pixar, Ghibli, DreamWorks)
- Use: "3D animation style", "cartoon style", "fantasy illustration"

═══ PROMPT STRUCTURE ═══
{Style}. {Shot size + angle}. {Subject with expression/pose}. {PROPS with visual descriptions and placement}. {Lighting}. {Color palette}. {Lens}. 16:9. No text, no watermark.

Target: 40-70 words. Every word = something VISIBLE.

Return JSON:
{
  "shotId": "from current_item",
  "label": "shot title",
  "directorNote": "режиссёрская заметка (рус)",
  "cameraNote": "заметка оператора (рус)",
  "imagePrompt": "English prompt 40-60 words",
  "hasCharRef": false,
  "hasLocRef": false,
  "promptChars": 280
}

JSON only, no markdown.`,
    model: "gemini-2.5-flash",
    enabled: true,
    inputs: ["shotPlan", "scene", "style", "bible"],
    outputs: ["imagePrompts"],
    color: "#FB923C",
  },
]

const FINCHER_POSITIONS: Record<string, { x: number; y: number }> = {
  "data-scene": { x: 0, y: 60 }, "data-style": { x: 0, y: 240 }, "data-director": { x: 0, y: 360 }, "data-bible": { x: 0, y: 480 },
  "scene-analyst": { x: 280, y: 120 }, "out-analysis": { x: 540, y: 120 }, "code-parse-analysis": { x: 540, y: 280 },
  "prop-scanner": { x: 280, y: 380 }, "out-props": { x: 540, y: 440 },
  "shot-planner": { x: 800, y: 120 }, "out-shotplan": { x: 1060, y: 120 },
  "prop-distributor": { x: 1060, y: 380 }, "out-prop-dist": { x: 1320, y: 440 },
  "foreach-shots": { x: 1320, y: 120 },
  "prompt-composer": { x: 1580, y: 200 }, "out-prompts": { x: 1840, y: 200 },
  "code-merge-prompts": { x: 1840, y: 40 },
}

const DISNEY_POSITIONS: Record<string, { x: number; y: number }> = {
  "data-scene": { x: 0, y: 60 }, "data-style": { x: 0, y: 200 }, "data-bible": { x: 0, y: 340 },
  "shot-planner": { x: 350, y: 120 }, "out-shotplan": { x: 650, y: 120 },
  "foreach-shots": { x: 650, y: 280 },
  "prompt-composer": { x: 950, y: 200 }, "out-prompts": { x: 1250, y: 200 },
  "code-merge-prompts": { x: 1250, y: 40 },
}

const FINCHER_DATA_NODES: Array<{ id: string; type: string; data: Record<string, unknown> }> = [
  { id: "data-scene", type: "dataNode", data: { label: "Scene", icon: "🎬", color: "#8B5CF6", value: "", multiline: true, dataKey: "scene" } },
  { id: "data-style", type: "dataNode", data: { label: "Style", icon: "🎨", color: "#FB923C", value: "", multiline: false, dataKey: "style" } },
  { id: "data-director", type: "dataNode", data: { label: "Director", icon: "🎥", color: "#E11D48", value: "Fincher + Messerschmidt: surveillance, geometric, one light source, steel blue shadows", multiline: false, dataKey: "director" } },
  { id: "data-bible", type: "dataNode", data: { label: "Bible", icon: "📖", color: "#D4A853", value: "", multiline: false, dataKey: "bible" } },
]

const DISNEY_DATA_NODES: Array<{ id: string; type: string; data: Record<string, unknown> }> = [
  { id: "data-scene", type: "dataNode", data: { label: "Scene", icon: "🎬", color: "#8B5CF6", value: "", multiline: true, dataKey: "scene" } },
  { id: "data-style", type: "dataNode", data: { label: "Style", icon: "🎨", color: "#FB923C", value: "", multiline: false, dataKey: "style" } },
  { id: "data-bible", type: "dataNode", data: { label: "Bible", icon: "📖", color: "#D4A853", value: "", multiline: false, dataKey: "bible" } },
]

const FINCHER_OUTPUT_NODES: Array<{ id: string; data: Record<string, unknown> }> = [
  { id: "out-analysis", data: { label: "Analysis", sourceModuleId: "scene-analyst", value: "", parsed: null } },
  { id: "out-props", data: { label: "Props Found", sourceModuleId: "prop-scanner", value: "", parsed: null } },
  { id: "out-shotplan", data: { label: "Shot Plan", sourceModuleId: "shot-planner", value: "", parsed: null } },
  { id: "out-prop-dist", data: { label: "Prop Distribution", sourceModuleId: "prop-distributor", value: "", parsed: null } },
  { id: "out-prompts", data: { label: "Per-Shot Prompts", sourceModuleId: "prompt-composer", value: "", parsed: null } },
]

const DISNEY_OUTPUT_NODES: Array<{ id: string; data: Record<string, unknown> }> = [
  { id: "out-shotplan", data: { label: "Shot Plan", sourceModuleId: "shot-planner", value: "", parsed: null } },
  { id: "out-prompts", data: { label: "Per-Shot Prompts", sourceModuleId: "prompt-composer", value: "", parsed: null } },
]

const FINCHER_CONNECTIONS: Array<{ source: string; target: string }> = [
  { source: "data-scene", target: "scene-analyst" }, { source: "data-style", target: "scene-analyst" },
  { source: "data-director", target: "scene-analyst" }, { source: "data-bible", target: "scene-analyst" },
  { source: "scene-analyst", target: "out-analysis" }, { source: "out-analysis", target: "code-parse-analysis" },
  { source: "data-scene", target: "prop-scanner" }, { source: "out-analysis", target: "prop-scanner" },
  { source: "data-bible", target: "prop-scanner" }, { source: "prop-scanner", target: "out-props" },
  { source: "code-parse-analysis", target: "shot-planner" }, { source: "out-props", target: "shot-planner" },
  { source: "data-style", target: "shot-planner" }, { source: "data-bible", target: "shot-planner" },
  { source: "shot-planner", target: "out-shotplan" }, { source: "out-shotplan", target: "foreach-shots" },
  { source: "out-shotplan", target: "prop-distributor" }, { source: "out-props", target: "prop-distributor" },
  { source: "data-scene", target: "prop-distributor" }, { source: "data-bible", target: "prop-distributor" },
  { source: "prop-distributor", target: "out-prop-dist" },
  { source: "foreach-shots", target: "prompt-composer" }, { source: "out-prop-dist", target: "prompt-composer" },
  { source: "data-style", target: "prompt-composer" }, { source: "data-bible", target: "prompt-composer" },
  { source: "prompt-composer", target: "out-prompts" }, { source: "out-prompts", target: "code-merge-prompts" },
]

const DISNEY_CONNECTIONS: Array<{ source: string; target: string }> = [
  { source: "data-scene", target: "shot-planner" }, { source: "data-style", target: "shot-planner" },
  { source: "data-bible", target: "shot-planner" },
  { source: "shot-planner", target: "out-shotplan" }, { source: "out-shotplan", target: "foreach-shots" },
  { source: "foreach-shots", target: "prompt-composer" },
  { source: "data-style", target: "prompt-composer" }, { source: "data-bible", target: "prompt-composer" },
  { source: "prompt-composer", target: "out-prompts" }, { source: "out-prompts", target: "code-merge-prompts" },
]

const PIPELINE_PRESETS: PipelinePreset[] = [
  {
    id: "fincher", name: "Fincher", description: "5 модулей: анализ → пропсы → раскадровка → распределение → промпты",
    style: "Anime style, cel shading, dramatic lighting",
    defaultScene: `INT. КВАРТИРА БОРИСА — НОЧЬ

Тесная комната. Единственный источник света — экран старого телевизора. БОРИС (55) сидит за столом, перебирая документы. Пепельница полная. Руки дрожат.

Телефон звонит. Борис смотрит на экран — номер скрыт. Медленно берёт трубку.

БОРИС
Алло?

Пауза. Тяжёлое дыхание на том конце.`,
    defaultBible: {
      screenplay: "Криминальный триллер. Борис — бывший следователь, замешанный в старом деле. Кто-то из прошлого нашёл его. Атмосфера паранойи и неизбежности.",
      characters: [{ name: "БОРИС", appearance: "55 лет, усталое лицо, щетина, мятая рубашка" }],
      locations: [{ name: "КВАРТИРА БОРИСА", description: "Тесная комната, старый телевизор, стол с документами" }],
      props: [{ name: "Телефон", description: "Старый мобильный, скрытый номер" }, { name: "Пепельница", description: "Полная окурков" }],
    },
    modules: FINCHER_MODULES, positions: FINCHER_POSITIONS,
    dataNodes: FINCHER_DATA_NODES, outputNodes: FINCHER_OUTPUT_NODES,
    codeNodes: [
      { id: "code-parse-analysis", data: { label: "JSON Parser", description: "Извлекает JSON из LLM ответа", fn: "parseJSON", status: "idle", output: "" } },
      { id: "code-merge-prompts", data: { label: "Prompt Merger", description: "Собирает per-shot промпты", fn: "mergePrompts", status: "idle", output: "" } },
    ],
    forEachNodes: [{ id: "foreach-shots", data: { label: "ForEach Shot", arrayField: "shots", status: "idle", itemCount: 0, doneCount: 0 } }],
    connections: FINCHER_CONNECTIONS,
  },
  {
    id: "disney", name: "Disney", description: "2 модуля: раскадровка → промпты. Быстро, ярко, просто.",
    style: "3D animation, vibrant saturated colors, expressive cartoon characters, volumetric lighting, underwater fantasy",
    defaultScene: `EXT. ПОДВОДНЫЙ ДВОРЕЦ — ДЕНЬ

Солнечные лучи пронизывают толщу воды, играя на перламутровых стенах дворца из кораллов и раковин. Стайки разноцветных рыб снуют между колоннами.

МАРИНА (16) выплывает из окна своей комнаты, рыжие волосы развеваются в воде. В руках — человеческая музыкальная шкатулка. Она прижимает её к груди.

Рядом появляется КРАБ СЕБАСТЬЯН, скрестив клешни.

СЕБАСТЬЯН
Опять эти человеческие штучки! Твой отец будет в ярости!

МАРИНА
(мечтательно)
Послушай, какая мелодия...

Она открывает шкатулку. Нежная мелодия плывёт сквозь воду. Рыбки замирают, слушая. Даже Себастьян на мгновение забывает о нравоучениях.

Вдалеке — тень. Огромный силуэт МОРСКОГО КОРОЛЯ приближается.`,
    defaultBible: {
      screenplay: "Волшебная сказка о юной русалке Марине, которая мечтает о мире людей. Яркий подводный мир, комедийные друзья-морские жители, конфликт с отцом-королём. Тон: тёплый, волшебный, с юмором.",
      characters: [
        { name: "МАРИНА", appearance: "16 лет, рыжие длинные волосы, зелёный хвост, большие любопытные глаза, ракушки в волосах" },
        { name: "СЕБАСТЬЯН", appearance: "Маленький красный краб, выразительные глаза, дирижёрские манеры" },
        { name: "МОРСКОЙ КОРОЛЬ", appearance: "Могучий мерман, седая борода, золотой трезубец, корона из кораллов" },
      ],
      locations: [{ name: "ПОДВОДНЫЙ ДВОРЕЦ", description: "Перламутровые стены из кораллов и раковин, солнечные лучи сквозь воду, стайки рыб" }],
      props: [
        { name: "Музыкальная шкатулка", description: "Человеческая шкатулка, бронзовая, с балериной внутри" },
        { name: "Трезубец", description: "Золотой трезубец Морского Короля, светится магией" },
      ],
    },
    modules: DISNEY_MODULES, positions: DISNEY_POSITIONS,
    dataNodes: DISNEY_DATA_NODES, outputNodes: DISNEY_OUTPUT_NODES,
    codeNodes: [
      { id: "code-merge-prompts", data: { label: "Prompt Merger", description: "Собирает per-shot промпты", fn: "mergePrompts", status: "idle", output: "" } },
    ],
    forEachNodes: [{ id: "foreach-shots", data: { label: "ForEach Shot", arrayField: "shots", status: "idle", itemCount: 0, doneCount: 0 } }],
    connections: DISNEY_CONNECTIONS,
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
    model: "claude-sonnet-4-20250514",
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
    model: "claude-sonnet-4-20250514",
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
    model: "claude-sonnet-4-20250514",
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
    model: "claude-sonnet-4-20250514",
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

// Use Fincher as initial default
const DEFAULT_POSITIONS = FINCHER_POSITIONS
const DEFAULT_DATA_NODES = FINCHER_DATA_NODES
const DEFAULT_OUTPUT_NODES = FINCHER_OUTPUT_NODES
const DEFAULT_CODE_NODES = PIPELINE_PRESETS[0].codeNodes
const DEFAULT_FOREACH_NODES = PIPELINE_PRESETS[0].forEachNodes
const DEFAULT_CONNECTIONS = FINCHER_CONNECTIONS

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

async function callChat(system: string, userMessage: string, model: string, temperature = 0.7): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: userMessage }], modelId: model, system, temperature }),
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

/** Extract characters + locations from raw screenplay text (no Slate needed) */
function extractFromText(text: string): { characters: string[]; locations: string[] } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)
  const characters = new Set<string>()
  const locations = new Set<string>()

  // Scene headings: INT. / EXT. / INT/EXT.
  const headingRe = /^(INT\.?\/?EXT\.?|EXT\.?\/?INT\.?|INT\.?|EXT\.?)\s+(.+)/i
  // Character cue: ALL CAPS line (Cyrillic or Latin), possibly with (V.O.) etc., followed by dialogue
  const charCueRe = /^([A-ZА-ЯЁ][A-ZА-ЯЁ\s\-']{1,40})(?:\s*\(.*?\))?\s*$/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Location
    const hm = line.match(headingRe)
    if (hm) {
      // Strip time of day (— НОЧЬ, - DAY, etc.)
      const loc = hm[2].replace(/\s*[\-–—]+\s*(НОЧЬ|ДЕНЬ|УТРО|ВЕЧЕР|NIGHT|DAY|MORNING|EVENING|DAWN|DUSK|LATER|CONTINUOUS).*$/i, "").trim()
      if (loc.length > 1) locations.add(loc.toUpperCase())
      continue
    }

    // Character cue — must have a next line (dialogue)
    const cm = line.match(charCueRe)
    if (cm && i + 1 < lines.length) {
      const name = cm[1].trim()
      // Skip common false positives
      if (name.length > 1 && !/^(INT|EXT|FADE|CUT|SMASH|DISSOLVE|TRANSITION|THE END|CONTINUED|ПРОДОЛЖЕНИЕ)/.test(name)) {
        characters.add(name)
      }
    }
  }

  return {
    characters: Array.from(characters),
    locations: Array.from(locations),
  }
}

// ══════════════════════════════════════════════════════════════
// HANDLE STYLE
// ══════════════════════════════════════════════════════════════

const hCls = "!h-2.5 !w-2.5 !rounded-full !border-[1.5px] !border-white/25 !bg-[#1A1B1F]"

// ══════════════════════════════════════════════════════════════
// DATA NODE — text inputs (scene, style, director, bible)
// ══════════════════════════════════════════════════════════════

interface DataNodeData {
  label: string
  value: string
  color: string
  icon: string
  onChange?: (value: string) => void
  multiline?: boolean
}

function DataNode({ data }: NodeProps) {
  const d = data as unknown as DataNodeData
  const borderColor = d.color || "#8B5CF6"
  return (
    <div className="w-[180px] rounded-xl border shadow-lg" style={{ borderColor: `${borderColor}40`, background: "#141418" }}>
      <div className="flex items-center gap-1.5 px-3 py-2" style={{ borderBottom: `1px solid ${borderColor}20` }}>
        <span className="text-[10px]">{d.icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: `${borderColor}CC` }}>{d.label}</span>
      </div>
      {d.multiline ? (
        <textarea
          value={d.value}
          onChange={(e) => d.onChange?.(e.target.value)}
          rows={4}
          className="nodrag nopan w-full resize-none bg-transparent px-3 py-2 text-[9px] leading-relaxed text-white/60 outline-none"
          style={{ scrollbarWidth: "thin" }}
        />
      ) : (
        <div className="px-3 py-2 text-[9px] leading-relaxed text-white/50 max-h-[80px] overflow-hidden">{d.value?.slice(0, 200) || "—"}</div>
      )}
      <Handle type="source" position={Position.Right} className={hCls} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// OUTPUT NODE — shows result of a stage
// ══════════════════════════════════════════════════════════════

interface OutputNodeData {
  label: string
  sourceModuleId: string
  value: string
  parsed: unknown | null
}

function OutputNode({ data }: NodeProps) {
  const d = data as unknown as OutputNodeData
  const [expanded, setExpanded] = useState(false)
  const hasData = !!d.value
  const preview = d.parsed
    ? JSON.stringify(d.parsed, null, 2)
    : d.value || ""
  const lines = preview.split("\n").length
  const summary = d.parsed && typeof d.parsed === "object" && d.parsed !== null
    ? (() => {
        const p = d.parsed as Record<string, unknown>
        if (Array.isArray(p.shots)) return `${p.shots.length} shots`
        if (Array.isArray(p.prompts)) return `${p.prompts.length} prompts`
        if (p.sceneSummary) return "analysis"
        return `${lines} lines`
      })()
    : hasData ? `${d.value.length} chars` : "empty"

  return (
    <div className={`w-[190px] rounded-xl border shadow-lg cursor-pointer ${hasData ? "border-emerald-500/30 bg-[#141418]" : "border-white/8 bg-[#141418]"}`} onClick={() => setExpanded(!expanded)}>
      <Handle type="target" position={Position.Left} className={hCls} />
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/5">
        <span className="text-[10px]">📤</span>
        <span className="flex-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400/70">{d.label}</span>
        <span className="text-[9px] text-white/30">{summary}</span>
        <ChevronDown size={8} className={`text-white/20 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </div>
      {expanded && hasData && (
        <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap px-3 py-2 text-[8px] leading-relaxed text-white/40" style={{ scrollbarWidth: "thin" }}>{preview.slice(0, 3000)}</pre>
      )}
      {!expanded && hasData && (
        <div className="px-3 py-1.5 text-[8px] text-white/25 truncate">{preview.split("\n")[0]?.slice(0, 60)}</div>
      )}
      <Handle type="source" position={Position.Right} className={hCls} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// CODE NODE — programmatic (parser, validator, mapper)
// ══════════════════════════════════════════════════════════════

interface CodeNodeData {
  label: string
  description: string
  fn: string // function name for display
  status: "idle" | "done" | "error"
  output: string
}

function CodeNode({ data }: NodeProps) {
  const d = data as unknown as CodeNodeData
  return (
    <div className={`w-[170px] rounded-xl border shadow-lg ${
      d.status === "done" ? "border-sky-400/30 bg-[#141418]" :
      d.status === "error" ? "border-red-400/30 bg-[#141418]" :
      "border-white/10 bg-[#141418]"
    }`}>
      <Handle type="target" position={Position.Left} className={hCls} />
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/5">
        <Settings size={10} className="text-sky-400/60" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400/70">{d.label}</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-[8px] text-white/35">{d.description}</p>
        <code className="mt-1 block text-[8px] font-mono text-sky-300/40">{d.fn}()</code>
      </div>
      {d.output && (
        <div className="border-t border-white/5 px-3 py-1.5 text-[8px] text-white/25 max-h-[50px] overflow-hidden">{d.output.slice(0, 100)}</div>
      )}
      <Handle type="source" position={Position.Right} className={hCls} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// FOREACH NODE — splits array, runs next module per-item in parallel
// ══════════════════════════════════════════════════════════════

interface ForEachNodeData {
  label: string
  arrayField: string // e.g. "shots" — which field to iterate
  status: "idle" | "running" | "done" | "error"
  itemCount: number
  doneCount: number
}

function ForEachNode({ data }: NodeProps) {
  const d = data as unknown as ForEachNodeData
  const progress = d.itemCount > 0 ? Math.round((d.doneCount / d.itemCount) * 100) : 0
  return (
    <div className={`w-[180px] rounded-xl border shadow-lg ${
      d.status === "running" ? "border-amber-400/40 bg-[#141418]" :
      d.status === "done" ? "border-emerald-400/30 bg-[#141418]" :
      d.status === "error" ? "border-red-400/30 bg-[#141418]" :
      "border-purple-400/20 bg-[#141418]"
    }`}>
      <Handle type="target" position={Position.Left} className={hCls} />
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/5">
        <span className="text-[10px]">🔄</span>
        <span className="flex-1 text-[10px] font-bold uppercase tracking-wider text-purple-400/70">{d.label}</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-[8px] text-white/35">Берёт массив <code className="text-purple-300/50">{d.arrayField}[]</code>, запускает следующий модуль для каждого элемента параллельно</p>
        {d.status === "running" && (
          <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-amber-400/60 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        {d.itemCount > 0 && (
          <div className="mt-1 text-[8px] text-white/30">{d.doneCount}/{d.itemCount} items {d.status === "done" ? "✓" : ""}</div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className={hCls} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// AI MODULE NODE — compact version
// ══════════════════════════════════════════════════════════════

function ModuleNode({ data, id }: NodeProps) {
  const d = data as unknown as ModuleData & { onSelect: (id: string) => void; onSoloRun: (id: string) => void }
  const isRunning = d.isRunning
  const hasResult = !!d.result
  const hasError = !!d.result?.error

  return (
    <div
      className={`w-[220px] rounded-xl border-2 shadow-xl backdrop-blur-sm transition-all cursor-pointer ${
        isRunning ? "border-[#D4A853] bg-[#1A1B1F]/95 shadow-[#D4A853]/20" :
        hasError ? "border-red-500/50 bg-[#1A1B1F]/95" :
        hasResult ? "border-green-500/30 bg-[#1A1B1F]/95" :
        "border-white/10 bg-[#1A1B1F]/95 hover:border-white/20"
      }`}
      onClick={() => d.onSelect(d.moduleId)}
    >
      <Handle type="target" position={Position.Left} className={hCls} />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          isRunning ? "animate-pulse bg-[#D4A853]/20" : "bg-white/8"
        }`} style={{ color: d.color }}>
          {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-[12px] font-semibold text-[#E7E3DC] block truncate">{d.name}</span>
          <span className="text-[9px] text-white/30 block truncate">{d.model.replace("claude-sonnet-4-20250514", "claude-s4").replace("claude-", "").replace("-20250514", "")}</span>
        </div>
        <button
          type="button"
          className={`nodrag shrink-0 rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition-all ${
            isRunning ? "bg-[#D4A853]/20 text-[#D4A853]" : "bg-white/5 text-white/25 hover:bg-[#D4A853]/15 hover:text-[#D4A853]"
          }`}
          onClick={(e) => { e.stopPropagation(); if (!isRunning) d.onSoloRun(d.moduleId) }}
        >
          {isRunning ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
        </button>
      </div>

      {/* IO tags */}
      <div className="flex items-center gap-1 border-t border-white/5 px-3 py-1.5">
        {d.inputs.slice(0, 3).map((inp) => (
          <span key={inp} className="rounded bg-white/5 px-1.5 py-0.5 text-[8px] text-white/25">{inp}</span>
        ))}
        <span className="text-white/10 text-[8px]">→</span>
        {d.outputs.map((out) => (
          <span key={out} className="rounded px-1.5 py-0.5 text-[8px]" style={{ backgroundColor: `${d.color}15`, color: `${d.color}90` }}>{out}</span>
        ))}
        {hasResult && !hasError && <span className="ml-auto text-[8px] text-green-400/60">✓</span>}
        {hasError && <span className="ml-auto text-[8px] text-red-400/60">✗</span>}
        {d.result?.duration && <span className="text-[8px] text-white/15">{(d.result.duration / 1000).toFixed(1)}s</span>}
      </div>

      <Handle type="source" position={Position.Right} className={hCls} />
    </div>
  )
}

const nodeTypes = { module: ModuleNode, dataNode: DataNode, outputNode: OutputNode, codeNode: CodeNode, forEachNode: ForEachNode }

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════

export default function PipelineLabPage() {
  const [activePresetId, setActivePresetId] = useState("fincher")
  const [modules, setModules] = useState<ModuleData[]>(FINCHER_MODULES)
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null)
  const [sceneText, setSceneText] = useState(`INT. КВАРТИРА БОРИСА — НОЧЬ

Тесная комната. Единственный источник света — экран старого телевизора. БОРИС (55) сидит за столом, перебирая документы. Пепельница полная. Руки дрожат.

Телефон звонит. Борис смотрит на экран — номер скрыт. Медленно берёт трубку.

БОРИС
Алло?

Пауза. Тяжёлое дыхание на том конце.`)
  const [style, setStyle] = useState("Anime style, cel shading, dramatic lighting")
  const [isRunning, setIsRunning] = useState(false)
  const [bible, setBible] = useState<{ screenplay: string; characters: BibleCharacter[]; locations: BibleLocation[]; props: BibleProp[] }>({
    screenplay: "Криминальный триллер. Борис — бывший следователь, замешанный в старом деле. Кто-то из прошлого нашёл его. Атмосфера паранойи и неизбежности.",
    characters: [{ name: "БОРИС", appearance: "55 лет, усталое лицо, щетина, мятая рубашка", imageUrl: "" }],
    locations: [{ name: "КВАРТИРА БОРИСА", description: "Тесная комната, старый телевизор, стол с документами", imageUrl: "" }],
    props: [{ name: "Телефон", description: "Старый мобильный, скрытый номер" }, { name: "Пепельница", description: "Полная окурков" }],
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
  const [appliedToProject, setAppliedToProject] = useState(false)
  const [translatedPrompt, setTranslatedPrompt] = useState<{ idx: number; text: string } | null>(null)
  const [translating, setTranslating] = useState(false)
  // Lightbox: view/edit Bible or shot images
  const [lightbox, setLightbox] = useState<{ url: string; type: "bible"; bibleType: "character" | "location" | "prop"; index: number } | { url: string; type: "shot"; shotIndex: number } | null>(null)
  const [editingImage, setEditingImage] = useState<string | null>(null) // url being edited
  // Shot generation history: shotIndex → array of image URLs (newest first)
  const [shotHistory, setShotHistory] = useState<Map<number, string[]>>(new Map())
  const [bibleGenModel, setBibleGenModel] = useState("gemini-2.0-flash")
  const [generatingBibleItem, setGeneratingBibleItem] = useState<string | null>(null)
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [smartScanning, setSmartScanning] = useState(false)
  const [propSuggestions, setPropSuggestions] = useState<Array<{ name: string; description: string; appearancePrompt: string; reason: string }>>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Smart Scan — find props in scene text that aren't in Bible yet
  const smartScanProps = useCallback(async () => {
    if (smartScanning || !sceneText.trim()) return
    setSmartScanning(true)
    setPropSuggestions([])
    try {
      const existingNames = [
        ...bible.props.map((p) => p.name),
        ...bible.characters.map((c) => c.name),
        ...bible.locations.map((l) => l.name),
      ]
      const raw = await callChat(
        `You are a production designer's assistant. Analyze the scene text and find ALL physical objects, props, and set pieces mentioned or implied. Return ONLY new items not already in the existing list.

Existing items: ${existingNames.join(", ") || "none"}

Return ONLY valid JSON array (no markdown):
[
  { "name": "название предмета (рус)", "description": "что это, зачем в сцене (рус, 1 предложение)", "appearancePrompt": "visual description for image generation (English, 20-30 words: material, color, condition, size, lighting)", "reason": "почему важен для сцены" }
]

Rules:
- Find objects MENTIONED or STRONGLY IMPLIED in the text
- Skip characters and locations — only physical OBJECTS
- Skip items already in the existing list
- If no new props found, return empty array []`,
        sceneText.slice(0, 4000),
        "claude-sonnet-4-20250514",
        0.3,
      )
      const parsed = tryParseJSON(raw)
      if (Array.isArray(parsed)) {
        setPropSuggestions(parsed.filter((p: Record<string, unknown>) => p.name && typeof p.name === "string"))
      }
    } catch (err) {
      console.warn("Smart scan failed:", err)
    } finally {
      setSmartScanning(false)
    }
  }, [smartScanning, sceneText, bible])

  // Build nodes from modules + data + output + code nodes
  const initialNodes = useMemo((): Node[] => {
    const moduleNodes: Node[] = modules.map((m) => ({
      id: m.moduleId,
      type: "module",
      position: DEFAULT_POSITIONS[m.moduleId] || { x: Math.random() * 800 + 100, y: Math.random() * 400 + 100 },
      data: { ...m, onSelect: setSelectedModuleId, onSoloRun: () => {} },
    }))
    const dataN: Node[] = DEFAULT_DATA_NODES.map((d) => ({
      id: d.id,
      type: d.type,
      position: DEFAULT_POSITIONS[d.id] || { x: 0, y: 0 },
      data: { ...d.data },
    }))
    const outN: Node[] = DEFAULT_OUTPUT_NODES.map((d) => ({
      id: d.id,
      type: "outputNode",
      position: DEFAULT_POSITIONS[d.id] || { x: 0, y: 0 },
      data: { ...d.data },
    }))
    const codeN: Node[] = DEFAULT_CODE_NODES.map((d) => ({
      id: d.id,
      type: "codeNode",
      position: DEFAULT_POSITIONS[d.id] || { x: 0, y: 0 },
      data: { ...d.data },
    }))
    const feN: Node[] = DEFAULT_FOREACH_NODES.map((d) => ({
      id: d.id,
      type: "forEachNode",
      position: DEFAULT_POSITIONS[d.id] || { x: 0, y: 0 },
      data: { ...d.data },
    }))
    return [...dataN, ...moduleNodes, ...outN, ...codeN, ...feN]
  }, []) // Only build once — soloRun injected via useEffect

  const initialEdges = useMemo((): Edge[] =>
    DEFAULT_CONNECTIONS.map((c, i) => ({
      id: `e-${i}`,
      source: c.source,
      target: c.target,
      animated: false,
      style: { stroke: "rgba(255,255,255,0.12)", strokeWidth: 1.5 },
    })),
  [])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Load a pipeline preset — rebuilds modules, nodes, edges
  const loadPreset = useCallback((presetId: string) => {
    const preset = PIPELINE_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    setActivePresetId(presetId)
    setModules(preset.modules.map((m) => ({ ...m, result: undefined, isRunning: false })))
    setStyle(preset.style)
    setSceneText(preset.defaultScene)
    setBible(preset.defaultBible)
    setSelectedModuleId(null)
    setGeneratedImages(new Map())
    setSelectedShotIdx(0)
    setEditedPrompts(new Map())

    const moduleNodes: Node[] = preset.modules.map((m) => ({
      id: m.moduleId, type: "module",
      position: preset.positions[m.moduleId] || { x: 400, y: 200 },
      data: { ...m, onSelect: setSelectedModuleId, onSoloRun: () => {} },
    }))
    const dataN: Node[] = preset.dataNodes.map((d) => ({
      id: d.id, type: d.type,
      position: preset.positions[d.id] || { x: 0, y: 0 },
      data: { ...d.data },
    }))
    const outN: Node[] = preset.outputNodes.map((d) => ({
      id: d.id, type: "outputNode",
      position: preset.positions[d.id] || { x: 0, y: 0 },
      data: { ...d.data },
    }))
    const codeN: Node[] = preset.codeNodes.map((d) => ({
      id: d.id, type: "codeNode",
      position: preset.positions[d.id] || { x: 0, y: 0 },
      data: { ...d.data },
    }))
    const feN: Node[] = preset.forEachNodes.map((d) => ({
      id: d.id, type: "forEachNode",
      position: preset.positions[d.id] || { x: 0, y: 0 },
      data: { ...d.data },
    }))
    setNodes([...dataN, ...moduleNodes, ...outN, ...codeN, ...feN])
    setEdges(preset.connections.map((c, i) => ({
      id: `e-${i}`, source: c.source, target: c.target, animated: false,
      style: { stroke: "rgba(255,255,255,0.12)", strokeWidth: 1.5 },
    })))
  }, [setNodes, setEdges])

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, style: { stroke: "rgba(255,255,255,0.12)", strokeWidth: 2 } }, eds))
  }, [setEdges])

  // Update ALL node data when modules or context change
  useEffect(() => {
    setNodes((nds) => nds.map((n) => {
      // AI module nodes
      const mod = modules.find((m) => m.moduleId === n.id)
      if (mod) return { ...n, data: { ...mod, onSelect: setSelectedModuleId, onSoloRun: soloRun } }

      // Data nodes — sync with scene/style/bible
      if (n.type === "dataNode") {
        const dk = (n.data as Record<string, unknown>).dataKey as string
        if (dk === "scene") return { ...n, data: { ...n.data, value: sceneText, onChange: (v: string) => setSceneText(v) } }
        if (dk === "style") return { ...n, data: { ...n.data, value: style, onChange: (v: string) => setStyle(v) } }
        if (dk === "bible") {
          const bibleText = `${bible.characters.map((c) => `${c.name}: ${c.appearance}${c.imageUrl ? " [hasRefImage]" : ""}`).join("\n")}\n${bible.locations.map((l) => `${l.name}: ${l.description}${l.imageUrl ? " [hasRefImage]" : ""}`).join("\n")}\n${bible.props.map((p) => `${p.name}: ${p.description}${p.imageUrl ? " [hasRefImage]" : ""}`).join("\n")}`
          return { ...n, data: { ...n.data, value: bibleText } }
        }
        return n
      }

      // Output nodes — sync with module results
      if (n.type === "outputNode") {
        const srcId = (n.data as Record<string, unknown>).sourceModuleId as string
        const srcMod = modules.find((m) => m.moduleId === srcId)
        if (srcMod?.result) {
          return { ...n, data: { ...n.data, value: srcMod.result.raw, parsed: srcMod.result.parsed } }
        }
        return { ...n, data: { ...n.data, value: "", parsed: null } }
      }

      // Code nodes — auto-execute when input available
      if (n.type === "codeNode") {
        const nodeId = n.id
        if (nodeId === "code-parse-analysis") {
          const analyst = modules.find((m) => m.moduleId === "scene-analyst")
          if (analyst?.result?.parsed) {
            return { ...n, data: { ...n.data, status: "done", output: `✓ Parsed ${JSON.stringify(analyst.result.parsed).length} chars` } }
          }
        }
        if (nodeId === "code-merge-prompts") {
          const composer = modules.find((m) => m.moduleId === "prompt-composer")
          if (composer?.result?.parsed) {
            const p = composer.result.parsed as Record<string, unknown>
            const prompts = Array.isArray(p.prompts) ? p.prompts : []
            return { ...n, data: { ...n.data, status: "done", output: `✓ ${prompts.length} prompts merged` } }
          }
        }
        return n
      }

      return n
    }))
  }, [modules, setNodes, sceneText, style, bible])

  const selectedModule = modules.find((m) => m.moduleId === selectedModuleId)

  const updateModule = (id: string, changes: Partial<ModuleData>) => {
    setModules((prev) => prev.map((m) => m.moduleId === id ? { ...m, ...changes } : m))
  }

  // Solo run — execute single module with scene text + any existing results as context
  // Generate image for a shot
  const bibleRef = useRef(bible)
  bibleRef.current = bible
  const generatingShotsRef = useRef(generatingShots)
  generatingShotsRef.current = generatingShots

  // LLM ref picker — ask model which Bible refs match a prompt
  const refPickCache = useRef(new Map<string, number[]>())
  const pickRefsWithLLM = useCallback(async (prompt: string, refs: Array<{ name: string; url: string; type: "char" | "loc" | "prop" }>): Promise<Array<{ name: string; url: string; type: "char" | "loc" | "prop" }>> => {
    if (refs.length === 0) return []
    const b = bibleRef.current
    const catalog = refs.map((r, i) => {
      let desc = ""
      if (r.type === "char") desc = b.characters.find((c) => c.name === r.name)?.appearance || ""
      if (r.type === "loc") desc = b.locations.find((l) => l.name === r.name)?.description || ""
      if (r.type === "prop") desc = b.props.find((p) => p.name === r.name)?.description || ""
      return `[${i}] ${r.type === "char" ? "ПЕРСОНАЖ" : r.type === "loc" ? "ЛОКАЦИЯ" : "ПРЕДМЕТ"}: ${r.name} — ${desc}`
    }).join("\n")

    const cacheKey = prompt.slice(0, 80)
    const cached = refPickCache.current.get(cacheKey)
    if (cached) return cached.map((i) => refs[i]).filter(Boolean)

    try {
      const raw = await callChat(
        `You select reference images for an image generator. Given a prompt and a catalog, pick which refs to send.

PRIORITY ORDER (this is critical):
1. PROPS mentioned in the prompt — HIGHEST priority. If prompt says "music box" and catalog has a music box image → MUST include it. Props define what objects look like.
2. The MAIN CHARACTER (subject of the shot) — include for face consistency.
3. Secondary characters if mentioned in the prompt.
4. Location — for wide/establishing shots or if environment described in detail.

Max 6 refs. Include ALL that are relevant — don't skip things.
Return ONLY JSON array of indices like [0, 2, 4, 5]. No markdown.`,
        `PROMPT: ${prompt}\n\nCATALOG:\n${catalog}`,
        "gemini-2.5-flash", 0.1,
      )
      const parsed = tryParseJSON(raw)
      if (Array.isArray(parsed)) {
        const indices = (parsed as number[]).filter((i) => typeof i === "number" && i >= 0 && i < refs.length).slice(0, 6)
        refPickCache.current.set(cacheKey, indices)
        const result = indices.map((i) => refs[i])
        console.log(`[pickRefsWithLLM] selected: ${result.map((r) => r.name).join(", ")}`)
        return result
      }
    } catch (err) { console.warn("[pickRefsWithLLM] failed:", err) }
    return refs.slice(0, 6)
  }, [])

  const generateImage = useCallback(async (shotIndex: number, prompt: string) => {
    console.log(`[generateImage] CALLED shot-${shotIndex}, prompt length=${prompt.length}`)
    if (generatingShotsRef.current.has(shotIndex)) { console.log("[generateImage] BLOCKED by generatingShotsRef"); return }
    setGeneratingShots((prev) => new Set(prev).add(shotIndex))

    try {
      const endpoint = imageGenModel === "gpt-image" ? "/api/gpt-image" : "/api/nano-banana"

      // Build available refs from current Bible
      const cb = bibleRef.current
      const availableRefs = [
        ...cb.characters.filter((c) => c.imageUrl).map((c) => ({ name: c.name, url: c.imageUrl!, type: "char" as const })),
        ...cb.locations.filter((l) => l.imageUrl).map((l) => ({ name: l.name, url: l.imageUrl!, type: "loc" as const })),
        ...cb.props.filter((p) => p.imageUrl).map((p) => ({ name: p.name, url: p.imageUrl!, type: "prop" as const })),
      ]
      // Ask LLM which refs belong in this shot
      const smartRefs = await pickRefsWithLLM(prompt, availableRefs)
      console.log(`[generateImage] shot-${shotIndex}: ${smartRefs.length} refs: ${smartRefs.map((r) => r.name).join(", ")}`)

      const refUrls: string[] = []
      for (const imgUrl of smartRefs.map((r) => r.url)) {
        try {
          const r = await fetch(imgUrl)
          if (!r.ok) continue
          const blob = await r.blob()
          const dataUrl: string = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })
          refUrls.push(dataUrl)
        } catch { /* skip broken ref */ }
      }

      // Strip brand names that trigger Gemini content policy
      const cleanPrompt = prompt.replace(/\b(Disney|Pixar|Ghibli|DreamWorks|Marvel|DC|Miyazaki|Nintendo|Pokemon)\b/gi, "").replace(/\s{2,}/g, " ").trim()

      const body = imageGenModel === "gpt-image"
        ? { prompt: cleanPrompt, referenceImages: refUrls }
        : { prompt: cleanPrompt, model: imageGenModel, referenceImages: refUrls }

      console.log(`[generateImage] shot-${shotIndex}, model=${imageGenModel}, refs=${refUrls.length}, prompt=${prompt.length} chars`)

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => "")
        console.error(`[generateImage] ERROR ${res.status}:`, errText)
        return
      }

      const contentType = res.headers.get("content-type") || ""
      if (!contentType.startsWith("image/")) {
        console.error("[generateImage] non-image response:", contentType)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const ts = Date.now()
      const shotBlobKey = `breakdown-shot-${shotIndex}-${ts}`
      trySaveBlob(shotBlobKey, blob)
      // Also keep latest under stable key for session restore
      trySaveBlob(`breakdown-shot-${shotIndex}`, blob)
      setGeneratedImages((prev) => new Map(prev).set(shotIndex, url))
      // Push to history
      setShotHistory((prev) => {
        const next = new Map(prev)
        const arr = next.get(shotIndex) || []
        next.set(shotIndex, [url, ...arr].slice(0, 20))
        return next
      })
    } catch (err) {
      console.warn("Image generation failed:", err)
    } finally {
      setGeneratingShots((prev) => { const next = new Set(prev); next.delete(shotIndex); return next })
    }
  }, [imageGenModel, pickRefsWithLLM])

  // Generate image for a Bible item (character/location/prop)

  const generateBibleImage = useCallback(async (type: "character" | "location" | "prop", index: number) => {
    const itemKey = `${type}-${index}`
    setGeneratingBibleItem(itemKey)
    try {
      const currentBible = bibleRef.current
      let prompt = ""
      if (type === "character") {
        const c = currentBible.characters[index]
        if (!c) throw new Error("Character not found")
        prompt = `Portrait of ${c.name}${c.appearance ? ": " + c.appearance : ""}. Cinematic lighting, detailed face, film still, 1:1 aspect ratio.`
      } else if (type === "location") {
        const l = currentBible.locations[index]
        if (!l) throw new Error("Location not found")
        prompt = `${l.name}${l.description ? ": " + l.description : ""}. Cinematic establishing shot, atmospheric lighting, film still, 16:9.`
      } else {
        const p = currentBible.props[index]
        if (!p) throw new Error("Prop not found")
        prompt = `Close-up of ${p.name}${p.description ? ": " + p.description : ""}. Studio lighting, detailed texture, cinematic still life, 1:1.`
      }

      const res = await fetch("/api/nano-banana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model: "nano-banana" }),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => "")
        throw new Error(`HTTP ${res.status}: ${errText}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const blobKey = `breakdown-bible-${type}-${index}`
      trySaveBlob(blobKey, blob)

      setBible((prev) => {
        if (type === "character") {
          const chars = [...prev.characters]; chars[index] = { ...chars[index], imageUrl: url, blobKey }
          return { ...prev, characters: chars }
        } else if (type === "location") {
          const locs = [...prev.locations]; locs[index] = { ...locs[index], imageUrl: url, blobKey }
          return { ...prev, locations: locs }
        } else {
          const props = [...prev.props]; props[index] = { ...props[index], imageUrl: url, blobKey }
          return { ...prev, props }
        }
      })
    } catch (err) {
      console.warn("Bible image gen failed:", err)
    } finally {
      setGeneratingBibleItem(null)
    }
  }, [])

  // Generate ALL Bible images at once
  const generateAllBibleImages = useCallback(async () => {
    const b = bibleRef.current
    for (let i = 0; i < b.characters.length; i++) {
      if (!b.characters[i].imageUrl) await generateBibleImage("character", i)
    }
    for (let i = 0; i < b.locations.length; i++) {
      if (!b.locations[i].imageUrl) await generateBibleImage("location", i)
    }
    for (let i = 0; i < b.props.length; i++) {
      if (!b.props[i].imageUrl) await generateBibleImage("prop", i)
    }
  }, [generateBibleImage])

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
      if (bible.characters.length) parts.push(`characters: ${JSON.stringify(bible.characters.map((c) => ({ name: c.name, appearance: c.appearance, hasRefImage: !!c.imageUrl, imageDescription: c.imageDescription })))}`)
      if (bible.locations.length) parts.push(`locations: ${JSON.stringify(bible.locations.map((l) => ({ name: l.name, description: l.description, hasRefImage: !!l.imageUrl, imageDescription: l.imageDescription })))}`)
      if (bible.props.length) parts.push(`props: ${JSON.stringify(bible.props.map((p) => ({ name: p.name, description: p.description, hasRefImage: !!p.imageUrl, imageDescription: p.imageDescription })))}`)

      const raw = await callChat(mod.systemPrompt, parts.join("\n\n"), mod.model, mod.temperature ?? 0.7)
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

  // ── Run Pipeline — sequential through AI modules, following edge topology ──

  const runPipeline = useCallback(async () => {
    if (isRunning) return
    setIsRunning(true)

    // Reset results
    setModules((prev) => prev.map((m) => ({ ...m, result: undefined, isRunning: false })))

    // Build execution order: find AI modules reachable via edges
    // Simple approach: collect all module nodes, sort by topology
    const moduleIds = new Set(modules.map((m) => m.moduleId))

    // Build full adjacency from ALL edges (including data/output/code nodes as pass-through)
    const fullAdj = new Map<string, string[]>()
    edges.forEach((e) => {
      if (!fullAdj.has(e.source)) fullAdj.set(e.source, [])
      fullAdj.get(e.source)!.push(e.target)
    })

    // BFS from data nodes to find execution order of AI modules
    const visited = new Set<string>()
    const executionOrder: string[] = []

    function visit(nodeId: string) {
      if (visited.has(nodeId)) return
      visited.add(nodeId)
      // If this is an AI module, add to execution order
      if (moduleIds.has(nodeId)) executionOrder.push(nodeId)
      // Continue traversal
      const children = fullAdj.get(nodeId) || []
      for (const child of children) visit(child)
    }

    // Start from data nodes and traverse
    const dataNodeIds = nodes.filter((n) => n.type === "dataNode").map((n) => n.id)
    for (const id of dataNodeIds) visit(id)
    // Also visit any modules not reachable from data nodes
    for (const mod of modules) {
      if (!visited.has(mod.moduleId) && mod.enabled) {
        visit(mod.moduleId)
      }
    }

    const results = new Map<string, unknown>()

    // Animate edges
    setEdges((eds) => eds.map((e) => ({ ...e, animated: true, style: { stroke: "rgba(212,168,83,0.3)", strokeWidth: 1.5 } })))

    // Check which modules are downstream of a ForEach node
    const forEachNodes = nodes.filter((n) => n.type === "forEachNode")
    const forEachTargets = new Map<string, { forEachId: string; arrayField: string }>()
    for (const fen of forEachNodes) {
      const children = fullAdj.get(fen.id) || []
      const arrayField = ((fen.data as Record<string, unknown>).arrayField as string) || "shots"
      for (const childId of children) {
        if (moduleIds.has(childId)) {
          forEachTargets.set(childId, { forEachId: fen.id, arrayField })
        }
      }
    }

    // Helper: build context parts
    const buildContext = () => {
      const parts: string[] = []
      results.forEach((val, key) => parts.push(`${key}: ${JSON.stringify(val)}`))
      parts.push(`scene: ${sceneText}`)
      parts.push(`style: ${style}`)
      if (bible.screenplay) parts.push(`screenplay: ${bible.screenplay}`)
      if (bible.characters.length) parts.push(`characters: ${JSON.stringify(bible.characters.map((c) => ({ name: c.name, appearance: c.appearance, hasRefImage: !!c.imageUrl, imageDescription: c.imageDescription })))}`)
      if (bible.locations.length) parts.push(`locations: ${JSON.stringify(bible.locations.map((l) => ({ name: l.name, description: l.description, hasRefImage: !!l.imageUrl, imageDescription: l.imageDescription })))}`)
      if (bible.props.length) parts.push(`props: ${JSON.stringify(bible.props.map((p) => ({ name: p.name, description: p.description, hasRefImage: !!p.imageUrl, imageDescription: p.imageDescription })))}`)
      return parts
    }

    // Execute modules in order
    for (const moduleId of executionOrder) {
      const mod = modules.find((m) => m.moduleId === moduleId)
      if (!mod || !mod.enabled) continue

      const forEach = forEachTargets.get(moduleId)

      if (forEach) {
        // ── ForEach execution: run module per-item in parallel ──
        // Find the array from previous results
        let items: Record<string, unknown>[] = []
        for (const [, val] of results) {
          if (val && typeof val === "object") {
            const obj = val as Record<string, unknown>
            if (Array.isArray(obj[forEach.arrayField])) {
              items = obj[forEach.arrayField] as Record<string, unknown>[]
              break
            }
          }
        }

        if (items.length === 0) {
          // Try flat array
          for (const [, val] of results) {
            if (Array.isArray(val) && val.length > 0) { items = val as Record<string, unknown>[]; break }
          }
        }

        // Update ForEach node status
        setNodes((nds) => nds.map((n) => n.id === forEach.forEachId
          ? { ...n, data: { ...n.data, status: "running", itemCount: items.length, doneCount: 0 } } : n))

        setModules((prev) => prev.map((m) => m.moduleId === moduleId ? { ...m, isRunning: true } : m))

        const t = Date.now()
        const perItemResults: unknown[] = []
        let doneCount = 0

        try {
          // Run in parallel batches of 3
          const batchSize = mod.model.startsWith("gemini") ? 1 : 3
          for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize)
            const batchResults = await Promise.all(batch.map(async (item, bi) => {
              const parts = buildContext()
              parts.push(`current_item: ${JSON.stringify(item)}`)
              try {
                const raw = await callChat(
                  mod.systemPrompt + `\n\nYou are processing ONE item from the array. Focus only on this specific item:\n${JSON.stringify(item)}`,
                  parts.join("\n\n"),
                  mod.model,
                  mod.temperature ?? 0.7,
                )
                const parsed = tryParseJSON(raw)
                console.log(`[ForEach] ${mod.moduleId} item ${i + bi}: parsed=${!!parsed && typeof parsed === "object"}, raw=${raw.slice(0, 120)}`)
                return parsed
              } catch (err) {
                console.error(`[ForEach] ${mod.moduleId} item ${i + bi} FAILED:`, err)
                return null
              }
            }))
            perItemResults.push(...batchResults)
            doneCount += batch.length
            setNodes((nds) => nds.map((n) => n.id === forEach.forEachId
              ? { ...n, data: { ...n.data, doneCount } } : n))
          }

          // Merge all per-item results into array (filter out nulls and non-objects)
          const validResults = perItemResults.filter((r) => r && typeof r === "object")
          console.log(`[ForEach] ${moduleId}: ${perItemResults.length} raw → ${validResults.length} valid results`)
          const merged = { prompts: validResults }
          results.set(moduleId, merged)
          mod.outputs.forEach((out) => results.set(out, merged))

          setModules((prev) => prev.map((m) => m.moduleId === moduleId
            ? { ...m, result: { raw: JSON.stringify(merged, null, 2), parsed: merged, duration: Date.now() - t }, isRunning: false }
            : m))

          setNodes((nds) => nds.map((n) => n.id === forEach.forEachId
            ? { ...n, data: { ...n.data, status: "done", doneCount: items.length } } : n))
        } catch (err) {
          setModules((prev) => prev.map((m) => m.moduleId === moduleId
            ? { ...m, result: { raw: "", parsed: null, duration: Date.now() - t, error: String(err) }, isRunning: false }
            : m))
          setNodes((nds) => nds.map((n) => n.id === forEach.forEachId
            ? { ...n, data: { ...n.data, status: "error" } } : n))
          break
        }
      } else {
        // ── Normal execution: single LLM call ──
        setModules((prev) => prev.map((m) => m.moduleId === moduleId ? { ...m, isRunning: true } : m))

        const t = Date.now()
        try {
          const parts = buildContext()
          const raw = await callChat(mod.systemPrompt, parts.join("\n\n"), mod.model, mod.temperature ?? 0.7)
          const parsed = tryParseJSON(raw)
          results.set(moduleId, parsed)
          mod.outputs.forEach((out) => results.set(out, parsed))

          setModules((prev) => prev.map((m) => m.moduleId === moduleId
            ? { ...m, result: { raw, parsed, duration: Date.now() - t }, isRunning: false }
            : m))
        } catch (err) {
          setModules((prev) => prev.map((m) => m.moduleId === moduleId
            ? { ...m, result: { raw: "", parsed: null, duration: Date.now() - t, error: String(err) }, isRunning: false }
            : m))
          break
        }
      }
    }

    setEdges((eds) => eds.map((e) => ({ ...e, animated: false, style: { stroke: "rgba(255,255,255,0.12)", strokeWidth: 1.5 } })))
    setIsRunning(false)
  }, [isRunning, modules, edges, nodes, sceneText, style, bible, setEdges])

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
      props: bible.props,
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

  // Load saved names on mount + restore session
  useEffect(() => {
    const names: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith("pipeline-lab-")) names.push(key.replace("pipeline-lab-", ""))
    }
    setSavedConfigs(names)

    // Restore session
    try {
      const raw = localStorage.getItem("koza-breakdown-studio-session")
      if (raw) {
        const s = JSON.parse(raw)
        if (s.sceneText) setSceneText(s.sceneText)
        if (s.style) setStyle(s.style)
        if (s.configName) setConfigName(s.configName)
        if (s.activePresetId) {
          setActivePresetId(s.activePresetId)
          const preset = PIPELINE_PRESETS.find((p) => p.id === s.activePresetId)
          if (preset) setModules(preset.modules.map((m) => ({ ...m })))
        }
        if (s.imageGenModel) setImageGenModel(s.imageGenModel)

        // Restore Bible with images from IndexedDB
        if (s.bible) {
          const b = s.bible as typeof bible
          // Collect all blobKeys
          const keys: string[] = []
          b.characters?.forEach((c: BibleCharacter) => { if (c.blobKey) keys.push(c.blobKey) })
          b.locations?.forEach((l: BibleLocation) => { if (l.blobKey) keys.push(l.blobKey) })
          b.props?.forEach((p: BibleProp) => { if (p.blobKey) keys.push(p.blobKey) })

          if (keys.length > 0) {
            restoreAllBlobs(keys).then((restored) => {
              const restoredBible = {
                ...b,
                characters: (b.characters || []).map((c: BibleCharacter) => ({
                  ...c, imageUrl: c.blobKey ? restored.get(c.blobKey) || "" : "",
                })),
                locations: (b.locations || []).map((l: BibleLocation) => ({
                  ...l, imageUrl: l.blobKey ? restored.get(l.blobKey) || "" : "",
                })),
                props: (b.props || []).map((p: BibleProp) => ({
                  ...p, imageUrl: p.blobKey ? restored.get(p.blobKey) || "" : "",
                })),
              }
              setBible(restoredBible)
            })
          } else {
            setBible(b)
          }
        }
      }
    } catch { /* ignore corrupt session */ }

    // Restore generated shot images
    const shotKeys = Array.from({ length: 20 }, (_, i) => `breakdown-shot-${i}`)
    restoreAllBlobs(shotKeys).then((restored) => {
      if (restored.size > 0) {
        setGeneratedImages((prev) => {
          const next = new Map(prev)
          restored.forEach((url, key) => {
            const idx = parseInt(key.replace("breakdown-shot-", ""), 10)
            if (!isNaN(idx)) next.set(idx, url)
          })
          return next
        })
      }
    }).catch(() => {})
  }, [])

  // Auto-save session on changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saveBible = {
          screenplay: bible.screenplay,
          characters: bible.characters.map(({ imageUrl, ...c }) => c),
          locations: bible.locations.map(({ imageUrl, ...l }) => l),
          props: bible.props.map(({ imageUrl, ...p }) => p),
        }
        localStorage.setItem("koza-breakdown-studio-session", JSON.stringify({
          sceneText, style, bible: saveBible, configName, activePresetId, imageGenModel,
        }))
      } catch { /* quota */ }
    }, 1000)
    return () => clearTimeout(timer)
  }, [sceneText, style, bible, configName, activePresetId, imageGenModel])

  // ── Add Module (from template or blank) ──

  const MODULE_TEMPLATES = useMemo(() => [
    { label: "Пустой модуль", mod: { name: "New Module", description: "Новый модуль", systemPrompt: "Return ONLY valid JSON.", model: "claude-sonnet-4-20250514", inputs: [], outputs: ["output"], color: "#94A3B8" } },
    ...LEGACY_MODULES.map((m) => ({ label: m.name, mod: m })),
  ], [])

  const [showTemplates, setShowTemplates] = useState(false)

  const addModuleFromTemplate = (template: typeof MODULE_TEMPLATES[0]["mod"]) => {
    const id = `module-${Date.now()}`
    const newMod: ModuleData = {
      ...template, moduleId: id, enabled: true,
    }
    setModules((prev) => [...prev, newMod])
    setNodes((nds) => [...nds, {
      id, type: "module",
      position: { x: 600 + Math.random() * 200, y: 200 + Math.random() * 200 },
      data: { ...newMod, onSelect: setSelectedModuleId },
    }])
    setSelectedModuleId(id)
    setShowTemplates(false)
  }

  const addModule = () => setShowTemplates(true)

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
  // Gather results — merge shot plan + prompts
  const shotPlanResult = modules.find((m) => m.moduleId === "shot-planner")?.result?.parsed as Record<string, unknown> | null
  const promptResult = modules.find((m) => m.moduleId === "prompt-composer")?.result?.parsed as Record<string, unknown> | null

  // Also check any module that has shots/prompts for single-module pipelines
  const anyResult = modules.find((m) => m.result?.parsed && typeof m.result.parsed === "object" && m.result.parsed !== null && ("shots" in (m.result.parsed as Record<string, unknown>) || "prompts" in (m.result.parsed as Record<string, unknown>)))?.result?.parsed as Record<string, unknown> | null

  const storyboardShots = useMemo((): Record<string, string>[] => {
    // Get shots from shot planner
    const shotsArr = shotPlanResult && Array.isArray(shotPlanResult.shots)
      ? (shotPlanResult.shots as Record<string, string>[])
      : anyResult && Array.isArray((anyResult as Record<string, unknown>).shots)
        ? ((anyResult as Record<string, unknown>).shots as Record<string, string>[])
        : []

    // Get prompts from prompt composer (ForEach produces { prompts: [...] })
    const promptsArr = promptResult && Array.isArray(promptResult.prompts)
      ? (promptResult.prompts as Record<string, string>[])
      : []

    console.log(`[storyboardShots] shots: ${shotsArr.length}, prompts: ${promptsArr.length}`)
    if (promptsArr.length > 0) promptsArr.forEach((p, i) => console.log(`  prompt[${i}]: shotId=${p.shotId}, imagePrompt=${(p.imagePrompt||"").slice(0,60)}...`))
    if (shotsArr.length === 0 && promptsArr.length > 0) return promptsArr

    // Merge: enrich shots with prompts
    if (shotsArr.length > 0 && promptsArr.length > 0) {
      return shotsArr.map((shot, i) => {
        // Find matching prompt by shotId or index
        const p = promptsArr.find((pr) => pr.shotId === shot.id) ?? promptsArr[i]
        return {
          ...shot,
          prompt: p?.imagePrompt || p?.prompt || shot.prompt || "",
          imagePrompt: p?.imagePrompt || shot.imagePrompt || "",
          directorNote: p?.directorNote || shot.directorNote || shot.purpose || "",
          cameraNote: p?.cameraNote || shot.cameraNote || "",
        }
      })
    }

    return shotsArr
  }, [shotPlanResult, promptResult, anyResult])

  const essence = (shotPlanResult?.essence as string)
    || (modules.find((m) => m.moduleId === "scene-analyst")?.result?.parsed as Record<string, unknown> | null)?.sceneSummary as string
    || ""

  // All Bible refs (for global display)
  const allBibleRefs = [
    ...bible.characters.filter((c) => c.imageUrl).map((c) => ({ name: c.name, url: c.imageUrl!, type: "char" as const })),
    ...bible.locations.filter((l) => l.imageUrl).map((l) => ({ name: l.name, url: l.imageUrl!, type: "loc" as const })),
    ...bible.props.filter((p) => p.imageUrl).map((p) => ({ name: p.name, url: p.imageUrl!, type: "prop" as const })),
  ]

  // Pre-pick refs for all shots when pipeline results arrive
  const [shotRefsMap, setShotRefsMap] = useState<Map<number, Array<{ name: string; url: string; type: "char" | "loc" | "prop" }>>>(new Map())

  useEffect(() => {
    if (storyboardShots.length === 0 || allBibleRefs.length === 0) return
    // Fire LLM picker for each shot that has a prompt
    let cancelled = false
    const run = async () => {
      const newMap = new Map<number, Array<{ name: string; url: string; type: "char" | "loc" | "prop" }>>()
      for (let i = 0; i < storyboardShots.length; i++) {
        const s = storyboardShots[i]
        const prompt = s.imagePrompt || s.prompt || ""
        if (!prompt || prompt.length < 10) continue
        try {
          const refs = await pickRefsWithLLM(prompt, allBibleRefs)
          if (cancelled) return
          newMap.set(i, refs)
          setShotRefsMap((prev) => new Map(prev).set(i, refs))
        } catch { /* skip */ }
      }
    }
    void run()
    return () => { cancelled = true }
  }, [storyboardShots, allBibleRefs, pickRefsWithLLM])

  const hasResults = storyboardShots.length > 0
  const shotCount = storyboardShots.length

  return (
    <div className="flex h-screen bg-[#0A0B0E] text-[#E5E0DB]">
      {/* ── Left toggle ── */}
      {!showLeftPanel && (
        <button type="button" onClick={() => setShowLeftPanel(true)}
          className="absolute left-2 top-1/2 z-30 -translate-y-1/2 rounded-lg border border-white/10 bg-[#1A1B1F]/90 px-1.5 py-3 text-white/40 hover:text-white/70 backdrop-blur-sm" title="Показать панель">
          ▶
        </button>
      )}

      {/* ── Left: Scene + Bible ── */}
      {showLeftPanel && <div className="flex w-[360px] shrink-0 flex-col border-r border-white/6 bg-[#0E1016]">
        <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
          <h1 className="text-[20px] font-bold tracking-wide">Pipeline Constructor</h1>
          <button type="button" onClick={() => setShowLeftPanel(false)} title="Скрыть" className="rounded-lg bg-white/5 p-2 text-white/40 hover:text-white/70"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5" style={{ scrollbarWidth: "thin" }}>
          {/* Preset selector */}
          <div className="flex gap-1.5">
            {PIPELINE_PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => loadPreset(p.id)}
                className={`flex-1 rounded-lg py-2 text-[12px] font-bold uppercase tracking-wider transition-all ${
                  activePresetId === p.id
                    ? "bg-[#D4A853]/20 text-[#D4A853] border border-[#D4A853]/30"
                    : "bg-white/4 text-white/30 border border-white/8 hover:bg-white/8 hover:text-white/50"
                }`}>
                {p.name}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-white/20">
            {PIPELINE_PRESETS.find((p) => p.id === activePresetId)?.description}
          </p>

          {/* Project auto-save indicator */}
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10 px-3 py-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400/60 animate-pulse" />
            <span className="text-[11px] text-emerald-400/50">Проект сохраняется автоматически</span>
          </div>

          {/* Pipeline preset save/load */}
          <div className="flex gap-2">
            <input value={configName} onChange={(e) => setConfigName(e.target.value)}
              className="flex-1 rounded-lg bg-white/5 px-4 py-2 text-[13px] text-white/70 outline-none" placeholder="Название пресета" />
            <button type="button" onClick={saveConfig}
              className="rounded-lg bg-white/5 px-3 py-2 text-[11px] font-medium text-white/40 hover:bg-white/10 hover:text-white/60">
              <Save size={14} />
            </button>
          </div>

          {savedConfigs.length > 0 && (
            <div className="rounded-xl border border-white/8 bg-white/3">
              <div className="px-3 py-2 text-[12px] font-medium uppercase tracking-wider text-white/25">Сохранённые пресеты</div>
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
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen size={14} className="text-white/30" />
                <span className="text-[13px] font-medium text-white/30">Bible</span>
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={() => {
                  const { characters, locations } = extractFromText(sceneText)
                  setBible((prev) => {
                    const existingChars = new Set(prev.characters.map((c) => c.name.toUpperCase()))
                    const existingLocs = new Set(prev.locations.map((l) => l.name.toUpperCase()))
                    const newChars = characters.filter((n) => !existingChars.has(n.toUpperCase())).map((name) => ({ name, appearance: "" }))
                    const newLocs = locations.filter((n) => !existingLocs.has(n.toUpperCase())).map((name) => ({ name, description: "" }))
                    return { ...prev, characters: [...prev.characters, ...newChars], locations: [...prev.locations, ...newLocs] }
                  })
                }}
                  disabled={!sceneText.trim()}
                  className="rounded-md bg-white/5 px-2 py-1 text-[10px] font-medium text-white/30 hover:bg-white/10 hover:text-white/50 disabled:opacity-30">
                  Парсить
                </button>
                <button type="button" onClick={() => setBible((prev) => ({ ...prev, screenplay: "", characters: [], locations: [], props: [] }))}
                  className="rounded-md bg-white/5 px-2 py-1 text-[10px] font-medium text-red-400/30 hover:bg-red-400/10 hover:text-red-400/70">
                  Очистить
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {/* Screenplay description */}
              <div className="rounded-lg bg-white/3 p-3">
                <label className="mb-1 block text-[11px] font-medium text-[#D4A853]/50">Описание сценария</label>
                <textarea value={bible.screenplay} onChange={(e) => { const v = e.target.value; setBible((prev) => ({ ...prev, screenplay: v })) }}
                  rows={3} className="w-full resize-y bg-transparent text-[13px] leading-relaxed text-white/60 outline-none" placeholder="Жанр, сюжет, атмосфера..." style={{ scrollbarWidth: "thin" }} />
              </div>
              {bible.characters.map((c, i) => (
                <div key={i} className="rounded-lg bg-white/3 p-3">
                  <div className="flex items-center gap-3">
                    {/* Image upload / view */}
                    <div className="relative h-12 w-12 shrink-0">
                      {c.imageUrl ? (
                        <button type="button" onClick={() => setLightbox({ url: c.imageUrl!, type: "bible", bibleType: "character", index: i })}
                          className="h-full w-full overflow-hidden rounded-lg border border-white/10 hover:border-[#D4A853]/40 transition-colors">
                          <img src={c.imageUrl} className="h-full w-full object-cover" />
                        </button>
                      ) : (
                        <label className="flex h-full w-full cursor-pointer items-center justify-center rounded-lg bg-white/8 text-[12px] text-white/30 hover:bg-white/12 transition-colors">
                          {c.name.slice(0, 2) || "?"}
                          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0]; if (!file) return
                            const url = URL.createObjectURL(file)
                            const bk = `breakdown-bible-character-${i}`
                            trySaveBlob(bk, file)
                            setBible((prev) => { const chars = [...prev.characters]; chars[i] = { ...chars[i], imageUrl: url, blobKey: bk }; return { ...prev, characters: chars } })
                            try {
                              const reader = new FileReader(); const base64: string = await new Promise((res) => { reader.onload = () => res(reader.result as string); reader.readAsDataURL(file) })
                              const desc = await callChat("Describe this person's appearance in detail for a storyboard: face, hair, age, build, clothing. 2-3 sentences. Respond in Russian.", base64, "gpt-4o")
                              setBible((prev) => { const chars = [...prev.characters]; chars[i] = { ...chars[i], imageDescription: desc.trim() }; return { ...prev, characters: chars } })
                            } catch { /* skip */ }
                          }} />
                        </label>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <input value={c.name} onChange={(e) => { const v = e.target.value; setBible((prev) => { const chars = [...prev.characters]; chars[i] = { ...chars[i], name: v }; return { ...prev, characters: chars } }) }}
                        className="w-full bg-transparent text-[14px] font-medium text-white/70 outline-none" placeholder="Имя" />
                      <input value={c.appearance} onChange={(e) => { const v = e.target.value; setBible((prev) => { const chars = [...prev.characters]; chars[i] = { ...chars[i], appearance: v }; return { ...prev, characters: chars } }) }}
                        className="w-full bg-transparent text-[12px] text-white/35 outline-none" placeholder="Внешность..." />
                    </div>
                    <button type="button" onClick={() => void generateBibleImage("character", i)}
                      disabled={generatingBibleItem === `character-${i}`}
                      className="shrink-0 text-[#D4A853]/30 hover:text-[#D4A853]/70 disabled:animate-pulse" title="AI Generate">
                      {generatingBibleItem === `character-${i}` ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    </button>
                  </div>
                  {c.imageDescription && (
                    <p className="mt-2 rounded bg-white/3 px-2 py-1 text-[11px] italic text-[#D4A853]/50">{c.imageDescription}</p>
                  )}
                </div>
              ))}
              {bible.locations.map((l, i) => (
                <div key={`loc-${i}`} className="rounded-lg bg-white/3 p-3">
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 shrink-0">
                      {l.imageUrl ? (
                        <button type="button" onClick={() => setLightbox({ url: l.imageUrl!, type: "bible", bibleType: "location", index: i })}
                          className="h-full w-full overflow-hidden rounded-lg border border-white/10 hover:border-[#D4A853]/40 transition-colors">
                          <img src={l.imageUrl} className="h-full w-full object-cover" />
                        </button>
                      ) : (
                        <label className="flex h-full w-full cursor-pointer items-center justify-center rounded-lg bg-white/8 text-white/30 hover:bg-white/12 transition-colors">
                          <MapPin size={14} />
                          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0]; if (!file) return
                            const url = URL.createObjectURL(file)
                            const bk = `breakdown-bible-location-${i}`
                            trySaveBlob(bk, file)
                            setBible((prev) => { const locs = [...prev.locations]; locs[i] = { ...locs[i], imageUrl: url, blobKey: bk }; return { ...prev, locations: locs } })
                            try {
                              const reader = new FileReader(); const base64: string = await new Promise((res) => { reader.onload = () => res(reader.result as string); reader.readAsDataURL(file) })
                              const desc = await callChat("Describe this location in detail for a storyboard: architecture, materials, lighting, mood, key objects. 2-3 sentences. Respond in Russian.", base64, "gpt-4o")
                              setBible((prev) => { const locs = [...prev.locations]; locs[i] = { ...locs[i], imageDescription: desc.trim() }; return { ...prev, locations: locs } })
                            } catch { /* skip */ }
                          }} />
                        </label>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <input value={l.name} onChange={(e) => { const v = e.target.value; setBible((prev) => { const locs = [...prev.locations]; locs[i] = { ...locs[i], name: v }; return { ...prev, locations: locs } }) }}
                        className="w-full bg-transparent text-[14px] font-medium text-white/70 outline-none" placeholder="Название" />
                      <input value={l.description} onChange={(e) => { const v = e.target.value; setBible((prev) => { const locs = [...prev.locations]; locs[i] = { ...locs[i], description: v }; return { ...prev, locations: locs } }) }}
                        className="w-full bg-transparent text-[12px] text-white/35 outline-none" placeholder="Описание..." />
                    </div>
                    <button type="button" onClick={() => void generateBibleImage("location", i)}
                      disabled={generatingBibleItem === `location-${i}`}
                      className="shrink-0 text-emerald-400/30 hover:text-emerald-400/70 disabled:animate-pulse" title="AI Generate">
                      {generatingBibleItem === `location-${i}` ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    </button>
                  </div>
                  {l.imageDescription && (
                    <p className="mt-2 rounded bg-white/3 px-2 py-1 text-[11px] italic text-[#D4A853]/50">{l.imageDescription}</p>
                  )}
                </div>
              ))}
              {/* Props */}
              {bible.props.map((p, i) => (
                <div key={`prop-${i}`} className="rounded-lg bg-white/3 p-3">
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 shrink-0">
                      {p.imageUrl ? (
                        <button type="button" onClick={() => setLightbox({ url: p.imageUrl!, type: "bible", bibleType: "prop", index: i })}
                          className="h-full w-full overflow-hidden rounded-lg border border-sky-400/20 hover:border-sky-400/50 transition-colors">
                          <img src={p.imageUrl} className="h-full w-full object-cover" />
                        </button>
                      ) : (
                        <label className="flex h-full w-full cursor-pointer items-center justify-center rounded-lg bg-sky-500/8 text-sky-400/40 hover:bg-sky-500/15 transition-colors">
                          Pr
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                            const file = e.target.files?.[0]; if (!file) return
                            const url = URL.createObjectURL(file)
                            const bk = `breakdown-bible-prop-${i}`
                            trySaveBlob(bk, file)
                            setBible((prev) => { const props = [...prev.props]; props[i] = { ...props[i], imageUrl: url, blobKey: bk }; return { ...prev, props } })
                          }} />
                        </label>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <input value={p.name} onChange={(e) => { const v = e.target.value; setBible((prev) => { const props = [...prev.props]; props[i] = { ...props[i], name: v }; return { ...prev, props } }) }}
                        className="w-full bg-transparent text-[14px] font-medium text-white/70 outline-none" placeholder="Предмет" />
                      <input value={p.description} onChange={(e) => { const v = e.target.value; setBible((prev) => { const props = [...prev.props]; props[i] = { ...props[i], description: v }; return { ...prev, props } }) }}
                        className="w-full bg-transparent text-[12px] text-white/35 outline-none" placeholder="Описание..." />
                    </div>
                    <div className="flex flex-col gap-1">
                      <button type="button" onClick={() => void generateBibleImage("prop", i)}
                        disabled={generatingBibleItem === `prop-${i}`}
                        className="text-sky-400/30 hover:text-sky-400/70 disabled:animate-pulse" title="AI Generate">
                        {generatingBibleItem === `prop-${i}` ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      </button>
                      <button type="button" onClick={() => setBible((prev) => ({ ...prev, props: prev.props.filter((_, j) => j !== i) }))}
                        className="text-white/15 hover:text-red-400"><X size={12} /></button>
                    </div>
                  </div>
                  {p.imageDescription && (
                    <p className="mt-2 rounded bg-white/3 px-2 py-1 text-[11px] italic text-sky-400/40">{p.imageDescription}</p>
                  )}
                </div>
              ))}
              {/* Smart Scan */}
              <button type="button" onClick={() => void smartScanProps()} disabled={smartScanning || !sceneText.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#D4A853]/20 bg-[#D4A853]/5 py-2 text-[12px] font-medium text-[#D4A853]/60 hover:bg-[#D4A853]/12 hover:text-[#D4A853]/90 disabled:opacity-30 transition-colors">
                {smartScanning ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                {smartScanning ? "Сканирую сцену…" : "Smart Scan — найти предметы"}
              </button>

              {/* Prop suggestions from Smart Scan */}
              {propSuggestions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#D4A853]/40">
                    Найдено {propSuggestions.length} предметов
                  </p>
                  {propSuggestions.map((s, i) => (
                    <div key={i} className="rounded-lg border border-dashed border-[#D4A853]/20 bg-[#D4A853]/4 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-[13px] font-semibold uppercase tracking-wider text-[#E8D7B2]">{s.name}</h4>
                          <p className="mt-0.5 text-[11px] leading-4 text-white/45">{s.description}</p>
                          {s.reason && <p className="mt-0.5 text-[10px] italic text-[#D4A853]/35">{s.reason}</p>}
                        </div>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => {
                            setBible((prev) => ({ ...prev, props: [...prev.props, { name: s.name, description: s.description, imageDescription: s.appearancePrompt }] }))
                            setPropSuggestions((prev) => prev.filter((_, j) => j !== i))
                          }}
                            className="inline-flex items-center gap-1 rounded-full border border-[#D4A853]/30 bg-[#D4A853]/10 px-2.5 py-1 text-[9px] uppercase tracking-wider text-[#D4A853] hover:bg-[#D4A853]/20">
                            <Check size={10} /> Добавить
                          </button>
                          <button type="button" onClick={() => setPropSuggestions((prev) => prev.filter((_, j) => j !== i))}
                            className="rounded-full border border-white/10 bg-white/4 px-2 py-1 text-white/30 hover:text-white/60">
                            <X size={10} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => {
                    const newProps = propSuggestions.map((s) => ({ name: s.name, description: s.description, imageDescription: s.appearancePrompt }))
                    setBible((prev) => ({ ...prev, props: [...prev.props, ...newProps] }))
                    setPropSuggestions([])
                  }}
                    className="flex w-full items-center justify-center gap-1 rounded-lg border border-[#D4A853]/15 py-1.5 text-[11px] text-[#D4A853]/50 hover:bg-[#D4A853]/8 hover:text-[#D4A853]/80">
                    <Check size={10} /> Добавить все
                  </button>
                </div>
              )}

              <div className="flex gap-2">
              <button type="button" onClick={() => setBible((prev) => ({ ...prev, characters: [...prev.characters, { name: "", appearance: "" }] }))}
                className="flex-1 rounded-lg border border-dashed border-white/10 py-2 text-[13px] text-white/25 hover:text-white/40">+ персонаж</button>
              <button type="button" onClick={() => setBible((prev) => ({ ...prev, locations: [...prev.locations, { name: "", description: "" }] }))}
                className="flex-1 rounded-lg border border-dashed border-white/10 py-2 text-[13px] text-white/25 hover:text-white/40">+ локация</button>
              <button type="button" onClick={() => setBible((prev) => ({ ...prev, props: [...prev.props, { name: "", description: "" }] }))}
                className="flex-1 rounded-lg border border-dashed border-white/10 py-2 text-[13px] text-white/25 hover:text-white/40">+ предмет</button>
              </div>
              {/* Generate all Bible images */}
              <button type="button" onClick={() => void generateAllBibleImages()}
                disabled={!!generatingBibleItem}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#D4A853]/20 bg-[#D4A853]/8 py-2 text-[12px] font-medium text-[#D4A853]/70 hover:bg-[#D4A853]/15 disabled:opacity-40">
                {generatingBibleItem ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                Генерировать все картинки
              </button>
            </div>
          </div>

          {/* Run */}
          <button type="button" onClick={runPipeline} disabled={isRunning}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#D4A853] py-3.5 text-[16px] font-bold text-black transition-all hover:bg-[#E8C98A] disabled:opacity-40">
            {isRunning ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
            Run Pipeline
          </button>

          {/* Apply to Project */}
          <button type="button" onClick={() => {
            const { setActivePipelinePreset } = useBreakdownConfigStore.getState()
            setActivePipelinePreset({
              name: configName || "Pipeline Constructor",
              presetId: activePresetId,
              style,
              modules: modules.filter((m) => m.enabled).map((m) => ({
                moduleId: m.moduleId, name: m.name, systemPrompt: m.systemPrompt,
                model: m.model, temperature: m.temperature, inputs: m.inputs, outputs: m.outputs,
              })),
            })
            // Also set project style in board store so STORYBOARD page uses it
            useBoardStore.getState().setProjectStyle(style)
            setAppliedToProject(true)
            setTimeout(() => setAppliedToProject(false), 3000)
          }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-[13px] font-bold text-emerald-400 transition-all hover:bg-emerald-500/20">
            {appliedToProject ? `✓ ${activePresetId === "disney" ? "Disney" : "Fincher"} применён` : `Применить ${activePresetId === "disney" ? "Disney" : "Fincher"} к проекту`}
          </button>
        </div>
      </div>}

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
              <div className="relative">
                <button type="button" onClick={addModule} className="flex items-center gap-1.5 text-[14px] text-white/40 hover:text-white/70">
                  <Plus size={14} /> Модуль
                </button>
                {showTemplates && (
                  <div className="absolute top-full left-0 mt-2 w-64 rounded-xl border border-white/10 bg-[#1A1B1F]/95 p-2 shadow-2xl backdrop-blur-sm z-50">
                    <div className="mb-1 px-2 py-1 text-[10px] uppercase tracking-wider text-white/25">Выберите шаблон</div>
                    {MODULE_TEMPLATES.map((t, i) => (
                      <button key={i} type="button" onClick={() => addModuleFromTemplate(t.mod)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] text-white/60 hover:bg-white/8 hover:text-white/80 transition">
                        <Bot size={14} style={{ color: (t.mod as ModuleData).color || "#94A3B8" }} />
                        {t.label}
                      </button>
                    ))}
                    <button type="button" onClick={() => setShowTemplates(false)} className="mt-1 w-full rounded-lg px-2 py-1.5 text-center text-[12px] text-white/25 hover:text-white/50">Отмена</button>
                  </div>
                )}
              </div>
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
          const basePromptText = shot.imagePrompt || shot.prompt || ""
          const promptText = editedPrompts.get(idx) ?? basePromptText
          // Show pre-picked refs or fallback to all
          const shotRefs = shotRefsMap.get(idx) || allBibleRefs

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
                {shotRefs.length > 0 && shotRefs.map((ref, ri) => (
                  <img key={ri} src={ref.url} title={ref.name} className="h-7 w-7 rounded-md border border-white/10 object-cover" />
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
              {/* Image + history carousel */}
              {generatedImages.has(idx) ? (
                <div>
                  <button type="button" onClick={() => setLightbox({ url: generatedImages.get(idx)!, type: "shot", shotIndex: idx })}
                    className="w-full overflow-hidden rounded-xl border border-white/10 hover:border-[#D4A853]/40 transition-colors">
                    <img src={generatedImages.get(idx)} className="w-full object-cover" style={{ aspectRatio: "16/9" }} />
                  </button>
                  {/* History carousel */}
                  {(shotHistory.get(idx)?.length || 0) > 1 && (
                    <div className="mt-2 flex gap-1.5 overflow-x-auto py-1" style={{ scrollbarWidth: "thin" }}>
                      {shotHistory.get(idx)!.map((histUrl, hi) => (
                        <button key={hi} type="button"
                          onClick={() => setGeneratedImages((prev) => new Map(prev).set(idx, histUrl))}
                          className={`h-10 w-16 shrink-0 overflow-hidden rounded-md border transition-colors ${
                            generatedImages.get(idx) === histUrl ? "border-[#D4A853]/60" : "border-white/10 hover:border-white/30"
                          }`}>
                          <img src={histUrl} className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
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
                  onChange={(e) => { setEditedPrompts((p) => new Map(p).set(idx, e.target.value)); setTranslatedPrompt(null) }}
                  rows={5}
                  className="w-full resize-y rounded-lg bg-black/20 p-2 text-[14px] leading-relaxed text-[#E7E3DC] outline-none"
                  style={{ scrollbarWidth: "thin" }}
                  placeholder="Промпт для генерации..."
                />
                {/* Translation */}
                <div className="mt-1.5 flex items-start gap-2">
                  <button type="button" disabled={translating || !promptText.trim()} onClick={async () => {
                    setTranslating(true)
                    try {
                      const res = await fetch("/api/translate", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: promptText, to: "ru" }),
                      })
                      if (res.ok) {
                        const { translated } = await res.json()
                        setTranslatedPrompt({ idx, text: translated })
                      }
                    } catch { /* skip */ }
                    finally { setTranslating(false) }
                  }}
                    className="shrink-0 rounded-md bg-white/5 px-2 py-1 text-[10px] font-bold text-white/30 hover:bg-white/10 hover:text-white/50 disabled:opacity-30">
                    {translating ? "..." : "RU"}
                  </button>
                  {translatedPrompt?.idx === idx && (
                    <p className="text-[12px] leading-relaxed text-white/35 italic">{translatedPrompt.text}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Reference images for THIS shot */}
            {shotRefs.length > 0 && (
              <div className="border-t border-white/6 px-4 py-3">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/25">
                  Референсы для кадра {idx + 1} ({shotRefs.length}/{allBibleRefs.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {shotRefs.map((ref, ri) => (
                    <div key={ri} className="group relative">
                      <img src={ref.url} className="h-14 w-14 rounded-lg border border-white/10 object-cover" />
                      <div className="absolute inset-x-0 bottom-0 rounded-b-lg bg-black/70 px-1 py-0.5 text-center text-[8px] text-white/60 truncate">{ref.name}</div>
                      <div className={`absolute -top-1 -right-1 h-3 w-3 rounded-full border border-black ${
                        ref.type === "char" ? "bg-[#D4A853]" : ref.type === "loc" ? "bg-emerald-400" : "bg-sky-400"
                      }`} title={ref.type === "char" ? "Персонаж" : ref.type === "loc" ? "Локация" : "Предмет"} />
                    </div>
                  ))}
                </div>
                {allBibleRefs.length > shotRefs.length && (
                  <p className="mt-1.5 text-[10px] text-white/20">
                    {allBibleRefs.filter((r) => !shotRefs.includes(r)).map((r) => r.name).join(", ")} — не в кадре
                  </p>
                )}
              </div>
            )}

            {/* Generate All */}
            <div className="border-t border-white/6 px-4 py-3">
              <button type="button" onClick={() => {
                storyboardShots.forEach((s, i) => {
                  const t = editedPrompts.get(i) ?? s.imagePrompt ?? s.prompt
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

      {/* ── Right toggle ── */}
      {!showRightPanel && (selectedModule || showChat) && (
        <button type="button" onClick={() => setShowRightPanel(true)}
          className="absolute right-2 top-1/2 z-30 -translate-y-1/2 rounded-lg border border-white/10 bg-[#1A1B1F]/90 px-1.5 py-3 text-white/40 hover:text-white/70 backdrop-blur-sm" title="Показать панель">
          ◀
        </button>
      )}

      {/* ── Right: Module inspector + Chat ── */}
      {showRightPanel && (selectedModule || showChat) && (
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
            <button type="button" onClick={() => setShowRightPanel(false)} title="Скрыть"
              className="px-3 py-3 text-white/25 hover:text-white/60"><X size={14} /></button>
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

              {/* Temperature */}
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-white/25">Temperature: {selectedModule.temperature ?? 0.7}</label>
                <input type="range" min="0" max="1.5" step="0.05"
                  value={selectedModule.temperature ?? 0.7}
                  onChange={(e) => updateModule(selectedModule.moduleId, { temperature: parseFloat(e.target.value) })}
                  className="w-full accent-[#D4A853]" />
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

      {/* ══ Lightbox Modal ══ */}
      {lightbox && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => { if (!editingImage) setLightbox(null) }}>
          <div className="relative flex max-h-[90vh] max-w-[90vw] flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.url} className="max-h-[75vh] max-w-[85vw] rounded-xl object-contain" />
            {/* Toolbar */}
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={() => setEditingImage(lightbox.url)}
                className="flex items-center gap-2 rounded-lg bg-[#D4A853]/15 px-4 py-2 text-[12px] font-medium text-[#D4A853] hover:bg-[#D4A853]/25">
                <Sparkles size={14} /> Редактировать
              </button>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-white/8 px-4 py-2 text-[12px] font-medium text-white/50 hover:bg-white/12 hover:text-white/70">
                <Upload size={14} /> Загрузить
                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0]; if (!file) return
                  const url = URL.createObjectURL(file)
                  if (lightbox.type === "bible") {
                    const { bibleType, index } = lightbox
                    const bk = `breakdown-bible-${bibleType}-${index}`
                    trySaveBlob(bk, file)
                    setBible((prev) => {
                      if (bibleType === "character") { const a = [...prev.characters]; a[index] = { ...a[index], imageUrl: url, blobKey: bk }; return { ...prev, characters: a } }
                      if (bibleType === "location") { const a = [...prev.locations]; a[index] = { ...a[index], imageUrl: url, blobKey: bk }; return { ...prev, locations: a } }
                      const a = [...prev.props]; a[index] = { ...a[index], imageUrl: url, blobKey: bk }; return { ...prev, props: a }
                    })
                  } else {
                    trySaveBlob(`breakdown-shot-${lightbox.shotIndex}`, file)
                    setGeneratedImages((prev) => new Map(prev).set(lightbox.shotIndex, url))
                  }
                  setLightbox({ ...lightbox, url })
                }} />
              </label>
              <button type="button" onClick={() => setLightbox(null)}
                className="flex items-center gap-1 rounded-lg bg-white/8 px-4 py-2 text-[12px] text-white/40 hover:bg-white/12 hover:text-white/70">
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Image Edit Overlay ══ */}
      {editingImage && (
        <ImageEditOverlay
          imageUrl={editingImage}
          model="nano-banana-2"
          onComplete={(blob) => {
            const url = URL.createObjectURL(blob)
            if (lightbox?.type === "bible") {
              const { bibleType, index } = lightbox
              const bk = `breakdown-bible-${bibleType}-${index}`
              trySaveBlob(bk, blob)
              setBible((prev) => {
                if (bibleType === "character") { const a = [...prev.characters]; a[index] = { ...a[index], imageUrl: url, blobKey: bk }; return { ...prev, characters: a } }
                if (bibleType === "location") { const a = [...prev.locations]; a[index] = { ...a[index], imageUrl: url, blobKey: bk }; return { ...prev, locations: a } }
                const a = [...prev.props]; a[index] = { ...a[index], imageUrl: url, blobKey: bk }; return { ...prev, props: a }
              })
            } else if (lightbox?.type === "shot") {
              const si = lightbox.shotIndex
              trySaveBlob(`breakdown-shot-${si}`, blob)
              setGeneratedImages((prev) => new Map(prev).set(si, url))
              setShotHistory((prev) => {
                const next = new Map(prev)
                const arr = next.get(si) || []
                next.set(si, [url, ...arr].slice(0, 20))
                return next
              })
            }
            setLightbox(lightbox ? { ...lightbox, url } : null)
            setEditingImage(null)
          }}
          onClose={() => setEditingImage(null)}
        />
      )}
    </div>
  )
}
