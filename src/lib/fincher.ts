/**
 * Fincher Breakdown — single-prompt cinematic storyboard generator.
 * Replaces the old 7-stage pipeline with one powerful prompt.
 */

import type { JenkinsShot, BreakdownResult, BreakdownDiagnostics, BibleContext } from "./breakdownTypes"
import { devlog } from "@/store/devlog"
import { useBreakdownConfigStore, type PipelinePreset } from "@/store/breakdownConfig"

interface FincherShot {
  id: string
  title: string
  angle: string
  composition: string
  light: string
  color: string
  lens: string
  purpose: string
  prompt: string
}

interface FincherResponse {
  essence: string
  shots: FincherShot[]
}

/** Timeline segment from pre-parse: tells breakdown WHERE voice/action happens */
export interface TimelineSegment {
  startMs: number
  endMs: number
  type: "voice" | "action" | "heading" | "transition"
  speaker?: string
  text: string
  isVO?: boolean
}

interface FincherOptions {
  sceneId?: string
  bible?: BibleContext
  style?: string
  modelId?: string
  directorSystemPrompt?: string
  sceneDurationMs?: number
  /** Pre-parsed timeline: voice/action segments with timings */
  timelineSegments?: TimelineSegment[]
}

const SHOT_FORMAT_INSTRUCTIONS = `

═══ ДЛЯ КАЖДОГО КАДРА ОПИШИ ═══

1. РАКУРС — не "medium shot" а конкретно:
   "Extreme overhead bird's-eye строго сверху, перпендикулярно столу"
   "Ultra low angle с уровня стеклянной пепельницы"
   "Through crack in door — видна только полоска комнаты"

2. КОМПОЗИЦИЯ — что где:
   "Документы разложены геометрически неровно — хаос с логикой. Пепельница, окурок, стакан — как улики."

3. СВЕТ — конкретный источник:
   "Единственный источник — узкий прямоугольник из незакрытой двери. Холодный флуоресцентный. Режет стол наискосок."

4. ЦВЕТ:
   "Steel blue ambient в тенях. Sick yellow на бумагах. Skin tone — единственное тепло."

5. ОБЪЕКТИВ + ДВИЖЕНИЕ:
   "35mm с небольшим дисторшн. Очень медленный push-in сверху."

6. МОНТАЖНАЯ ФУНКЦИЯ:
   "Surveillance footage. Борис — объект наблюдения."

7. NANO BANANA PROMPT — промпт для генерации на АНГЛИЙСКОМ, 50-80 слов, natural language:
   Структура: angle + subject with position + foreground objects + background + single light source with direction and shadow + color palette + lens + "16:9. No text, no watermark, natural anatomy."
   НЕ добавляй стиль (anime, realistic и т.д.) в prompt — стиль применяется отдельным слоем. Описывай только СОДЕРЖАНИЕ кадра.

Отвечай НА РУССКОМ (описания) + АНГЛИЙСКИЙ (prompt).
Return ONLY JSON (no markdown, no backticks):
{"essence":"суть сцены","shots":[{"id":"shot-1","title":"название","angle":"ракурс","composition":"что где","light":"свет","color":"палитра","lens":"объектив","purpose":"монтажная функция","prompt":"English prompt"}]}`

/**
 * Build a timeline map string for the AI: tells it WHERE each voice/action segment is.
 * This is the "score" that the AI creates shots to match.
 */
function buildTimelineContext(segments: TimelineSegment[], totalDurationMs: number): string {
  if (segments.length === 0) return ""

  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
  }

  const lines = segments.map((seg) => {
    const time = `${fmtTime(seg.startMs)}–${fmtTime(seg.endMs)}`
    if (seg.type === "voice") {
      const voLabel = seg.isVO ? " (V.O.)" : ""
      return `${time}  ГОЛОС ${seg.speaker}${voLabel}: "${seg.text.slice(0, 80)}${seg.text.length > 80 ? "..." : ""}"`
    }
    if (seg.type === "heading") return `${time}  ЛОКАЦИЯ: ${seg.text}`
    if (seg.type === "transition") return `${time}  ПЕРЕХОД: ${seg.text}`
    return `${time}  ДЕЙСТВИЕ: ${seg.text.slice(0, 80)}${seg.text.length > 80 ? "..." : ""}`
  })

  return `
═══ КАРТА ВРЕМЕНИ СЦЕНЫ (${fmtTime(totalDurationMs)} итого) ═══
${lines.join("\n")}

ВАЖНО: Создавай кадры так, чтобы они СОВПАДАЛИ с этой картой времени.
- Когда персонаж говорит → нужен кадр этого персонажа в это время.
- Когда V.O. → нужен B-roll / визуальная вставка.
- Когда действие → нужен кадр действия.
- Длительность каждого кадра должна примерно совпадать с длительностью сегмента.
- Общая длительность всех кадров ≈ ${fmtTime(totalDurationMs)}.
`
}

/**
 * Build the full system prompt: director profile + shot format instructions.
 * If no custom prompt, uses built-in Fincher.
 */
function buildDirectorPrompt(customPrompt?: string): string {
  const directorBlock = customPrompt?.trim() || `Ты — Дэвид Финчер + Эрик Мессершмидт. Тебе дают текст сцены, описание персонажей и локаций.

Сделай ПОЛНУЮ РАСКАДРОВКУ в стиле Финчера: 4-6 кадров. Для КАЖДОГО кадра напиши развёрнутое описание + промпт для генерации изображения.

═══ ФИНЧЕРОВСКИЕ ПРИНЦИПЫ ═══
- КАМЕРА НАБЛЮДАЕТ. Surveillance footage. Персонаж не знает что мы смотрим.
- ГЕОМЕТРИЯ. Предметы = улики на операционном столе.
- ОДИН ИСТОЧНИК СВЕТА. Жёсткая граница свет/тень. Причина света конкретная (щель двери, ТВ экран, лампа).
- ЦВЕТ БОЛЕЕТ. Steel blue тени. Sick yellow бумаги. Desaturated. Кожа — единственное тепло.
- ПЕРВЫЙ КАДР — самый нестандартный (bird's eye, через предмет, отражение).`

  return directorBlock + SHOT_FORMAT_INSTRUCTIONS
}

function parseFincherResponse(raw: string): FincherResponse {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("No JSON found in response")

  const parsed = JSON.parse(match[0])
  if (!parsed.shots || !Array.isArray(parsed.shots)) {
    throw new Error("Response missing 'shots' array")
  }

  return {
    essence: parsed.essence || "",
    shots: parsed.shots.map((s: Record<string, string>, i: number) => ({
      id: s.id || `shot-${i + 1}`,
      title: s.title || `Shot ${i + 1}`,
      angle: s.angle || "",
      composition: s.composition || "",
      light: s.light || "",
      color: s.color || "",
      lens: s.lens || "",
      purpose: s.purpose || "",
      prompt: s.prompt || "",
    })),
  }
}

function extractShotSize(angle: string): string {
  const lower = angle.toLowerCase()
  if (lower.includes("extreme close") || lower.includes("ecu") || lower.includes("macro")) return "ECU"
  if (lower.includes("close-up") || lower.includes("close up") || lower.includes("крупн")) return "Close-up"
  if (lower.includes("medium") || lower.includes("средн")) return "Medium"
  if (lower.includes("wide") || lower.includes("общ") || lower.includes("bird") || lower.includes("overhead")) return "Wide"
  if (lower.includes("extreme wide") || lower.includes("establishing")) return "Extreme Wide"
  return "Medium"
}

function extractCameraMotion(lens: string): string {
  const lower = lens.toLowerCase()
  if (lower.includes("push-in") || lower.includes("push in") || lower.includes("drift") || lower.includes("dolly in")) return "Push In"
  if (lower.includes("pull") || lower.includes("dolly out")) return "Pull Out"
  if (lower.includes("track") || lower.includes("слежен")) return "Tracking"
  if (lower.includes("pan")) return "Pan"
  if (lower.includes("handheld") || lower.includes("ручн")) return "Handheld"
  if (lower.includes("crane") || lower.includes("кран")) return "Crane"
  if (lower.includes("static") || lower.includes("статик") || lower.includes("статич") || lower.includes("неподвижн")) return "Static"
  return "Static"
}

// ─── Dialogue-aware duration calculation ─────────────────────

interface SceneDialogueBlock {
  character: string
  text: string
  parenthetical?: string
  isVO: boolean
}

/** Extract dialogue blocks from raw scene text */
function extractDialogueFromSceneText(sceneText: string): SceneDialogueBlock[] {
  const lines = sceneText.split("\n")
  const blocks: SceneDialogueBlock[] = []
  let currentChar: string | null = null
  let currentParen: string | null = null
  let isVO = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { currentChar = null; continue }

    // Character line: ALL CAPS, possibly with (V.O.) etc.
    const charMatch = trimmed.match(/^([A-ZА-ЯЁ][A-ZА-ЯЁ\s.'-]{1,30})(\s*\(.*\))?\s*$/)
    if (charMatch && !/^(INT|EXT|FADE|CUT|DISSOLVE)/.test(trimmed)) {
      currentChar = charMatch[1].trim()
      const ext = (charMatch[2] ?? "").toUpperCase()
      isVO = /V\.?O\.?/.test(ext)
      currentParen = null
      continue
    }

    // Parenthetical
    if (/^\(.*\)$/.test(trimmed) && currentChar) {
      currentParen = trimmed.replace(/^\(|\)$/g, "").trim()
      continue
    }

    // Dialogue text (follows character)
    if (currentChar && !trimmed.match(/^(INT|EXT)\b/i)) {
      blocks.push({
        character: currentChar,
        text: trimmed,
        parenthetical: currentParen ?? undefined,
        isVO,
      })
      currentParen = null
      // Don't reset currentChar — multi-line dialogue continues
    } else {
      currentChar = null
    }
  }

  return blocks
}

/** Words per minute for duration estimation */
const DIALOGUE_WPM = 150
const VO_WPM = 120
const ACTION_BUFFER_MS = 1500  // visual breathing room per shot
const MIN_SHOT_MS = 2000
const MAX_SHOT_MS = 12000

/**
 * Calculate smart durations for shots based on scene dialogue.
 * Distributes dialogue blocks to shots sequentially,
 * then calculates duration from text length.
 */
function calculateSmartDurations(jenkinsShots: JenkinsShot[], sceneText: string, sceneDurationMs?: number): void {
  const dialogues = extractDialogueFromSceneText(sceneText)

  if (dialogues.length === 0) {
    // No dialogue — use scene duration if available, else estimate from text
    const totalMs = sceneDurationMs ?? Math.max(5000, Math.round((sceneText.length / 3000) * 60 * 1000))
    const perShot = Math.round(totalMs / Math.max(1, jenkinsShots.length))
    jenkinsShots.forEach((s) => { s.duration = Math.max(MIN_SHOT_MS, Math.min(MAX_SHOT_MS, perShot)) })
    return
  }

  // Distribute dialogues across shots evenly (round-robin-ish)
  // Better: match by shot caption/notes mentioning character names
  const shotDialogues: SceneDialogueBlock[][] = jenkinsShots.map(() => [])

  // Try to match dialogues to shots by character mention in shot notes/caption
  let unmatched: SceneDialogueBlock[] = []

  for (const dlg of dialogues) {
    let assigned = false
    for (let i = 0; i < jenkinsShots.length; i++) {
      const shot = jenkinsShots[i]
      const shotText = `${shot.caption} ${shot.directorNote} ${shot.notes} ${shot.label}`.toUpperCase()
      if (shotText.includes(dlg.character.toUpperCase())) {
        shotDialogues[i].push(dlg)
        assigned = true
        break
      }
    }
    if (!assigned) unmatched.push(dlg)
  }

  // Distribute unmatched dialogues sequentially across shots
  if (unmatched.length > 0) {
    const perShot = Math.ceil(unmatched.length / jenkinsShots.length)
    for (let i = 0; i < unmatched.length; i++) {
      const shotIdx = Math.min(Math.floor(i / perShot), jenkinsShots.length - 1)
      shotDialogues[shotIdx].push(unmatched[i])
    }
  }

  // Calculate duration per shot
  for (let i = 0; i < jenkinsShots.length; i++) {
    const dlgs = shotDialogues[i]
    if (dlgs.length === 0) {
      // Silent shot — give it action-only duration
      jenkinsShots[i].duration = ACTION_BUFFER_MS + 500
    } else {
      let dialogueMs = 0
      for (const dlg of dlgs) {
        const words = dlg.text.split(/\s+/).filter(Boolean).length
        const wpm = dlg.isVO ? VO_WPM : DIALOGUE_WPM
        dialogueMs += (words / wpm) * 60_000 + 300 // 300ms pause between lines
      }
      jenkinsShots[i].duration = Math.round(dialogueMs + ACTION_BUFFER_MS)
    }
    // Clamp
    jenkinsShots[i].duration = Math.max(MIN_SHOT_MS, Math.min(MAX_SHOT_MS, jenkinsShots[i].duration))
  }
}

function fincherShotToJenkins(shot: FincherShot, index: number, sceneTextLength: number): JenkinsShot {
  return {
    id: shot.id || `fincher-${index}`,
    label: shot.title,
    type: "image",
    duration: 3000,
    notes: `РАКУРС: ${shot.angle}\nКОМПОЗИЦИЯ: ${shot.composition}\nСВЕТ: ${shot.light}\nЦВЕТ: ${shot.color}\nОБЪЕКТИВ: ${shot.lens}\nМОНТАЖНАЯ ФУНКЦИЯ: ${shot.purpose}`,
    shotSize: extractShotSize(shot.angle),
    cameraMotion: extractCameraMotion(shot.lens),
    caption: shot.composition,
    directorNote: shot.purpose,
    cameraNote: `${shot.angle}. ${shot.lens}`,
    imagePrompt: shot.prompt,
    videoPrompt: "",
    visualDescription: `${shot.angle}. ${shot.composition}. ${shot.light}. ${shot.color}`,
    svg: "",
  }
}

async function readStream(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error("No response body")

  const decoder = new TextDecoder()
  let fullText = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    fullText += decoder.decode(value, { stream: true })
  }
  fullText += decoder.decode()

  if (!fullText.trim()) {
    throw new Error("Empty response from LLM — model may be unavailable or API key invalid")
  }

  return fullText
}

/** Ordered fallback chain: try primary model, then alternatives */
const FALLBACK_MODELS = ["claude-sonnet-4-20250514", "gpt-4o", "gemini-2.0-flash"]

async function callLLM(
  parts: string[],
  modelId: string,
  directorSystemPrompt?: string,
): Promise<{ raw: string; usedModel: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90_000) // 90s timeout

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        messages: [{ role: "user", content: parts.join("\n\n") }],
        modelId,
        system: buildDirectorPrompt(directorSystemPrompt),
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`)
    }

    const raw = await readStream(response)
    return { raw, usedModel: modelId }
  } finally {
    clearTimeout(timeout)
  }
}

/** Run multi-stage pipeline from Pipeline Constructor preset */
async function runPipelinePreset(
  preset: PipelinePreset,
  sceneText: string,
  options?: FincherOptions,
): Promise<BreakdownResult> {
  const results = new Map<string, unknown>()

  devlog.breakdown("breakdown_start", `Pipeline "${preset.name}" with ${preset.modules.length} modules`, "", {}, `pipeline-${Date.now()}`)

  const buildContext = () => {
    const parts: string[] = []
    results.forEach((val, key) => parts.push(`${key}: ${JSON.stringify(val)}`))
    parts.push(`scene: ${sceneText}`)
    // Style is NOT injected into breakdown — it's applied as a separate layer at generation time
    if (options?.bible) {
      if (options.bible.characters.length) parts.push(`characters: ${JSON.stringify(options.bible.characters)}`)
      if (options.bible.locations.length) parts.push(`locations: ${JSON.stringify(options.bible.locations)}`)
      if ("props" in options.bible && Array.isArray((options.bible as unknown as Record<string, unknown>).props)) {
        parts.push(`props: ${JSON.stringify((options.bible as unknown as Record<string, unknown>).props)}`)
      }
    }
    if (options?.timelineSegments && options.timelineSegments.length > 0) {
      const totalMs = options.sceneDurationMs ?? options.timelineSegments.reduce((max, s) => Math.max(max, s.endMs), 0)
      parts.push(buildTimelineContext(options.timelineSegments, totalMs))
    }
    return parts
  }

  for (const mod of preset.modules) {
    // Check if this module should run per-shot (ForEach)
    // Convention: if module has "shotPlan" in inputs and previous result has shots[] → run per-shot
    const prevShotsArr = (() => {
      for (const [, val] of results) {
        if (val && typeof val === "object" && Array.isArray((val as Record<string, unknown>).shots)) {
          return (val as Record<string, unknown>).shots as Record<string, unknown>[]
        }
      }
      return null
    })()

    const isPerShot = mod.inputs.includes("shotPlan") && prevShotsArr && prevShotsArr.length > 0

    if (isPerShot) {
      // ── ForEach: run module per-shot sequentially ──
      devlog.breakdown("breakdown_scene_analysis", `ForEach ${mod.name}: ${prevShotsArr!.length} shots`, "", {}, `pipeline-${mod.moduleId}`)
      const perItemResults: unknown[] = []
      for (const item of prevShotsArr!) {
        try {
          const parts = buildContext()
          parts.push(`current_item: ${JSON.stringify(item)}`)
          const { raw } = await callLLM(
            [parts.join("\n\n")],
            mod.model,
            mod.systemPrompt + `\n\nProcess ONE shot:\n${JSON.stringify(item)}`,
          )
          const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()
          const match = cleaned.match(/\{[\s\S]*\}/) || cleaned.match(/\[[\s\S]*\]/)
          perItemResults.push(match ? JSON.parse(match[0]) : null)
        } catch (err) {
          devlog.breakdown("breakdown_scene_analysis", `ForEach ${mod.name} item failed: ${err}`, "", {}, `pipeline-${mod.moduleId}`)
          perItemResults.push(null)
        }
      }
      const merged = { prompts: perItemResults.filter(Boolean) }
      results.set(mod.moduleId, merged)
      mod.outputs.forEach((out) => results.set(out, merged))
    } else {
      // ── Normal: single LLM call ──
      try {
        const parts = buildContext()
        const { raw } = await callLLM(
          [parts.join("\n\n")],
          mod.model,
          mod.systemPrompt,
        )
        const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()
        const match = cleaned.match(/\{[\s\S]*\}/) || cleaned.match(/\[[\s\S]*\]/)
        const parsed = match ? JSON.parse(match[0]) : null
        results.set(mod.moduleId, parsed)
        mod.outputs.forEach((out) => results.set(out, parsed))
      } catch (err) {
        devlog.breakdown("breakdown_scene_analysis", `Module "${mod.name}" failed: ${err}`, "", {}, `pipeline-${mod.moduleId}`)
      }
    }
  }

  // Extract shots from the last module's result (or any module that produced shots/prompts)
  let finalShots: FincherShot[] = []
  let essence = ""

  for (const [, val] of results) {
    if (!val || typeof val !== "object") continue
    const obj = val as Record<string, unknown>

    // Try to extract shots
    if (Array.isArray(obj.shots) && obj.shots.length > 0 && !finalShots.length) {
      finalShots = obj.shots.map((s: Record<string, string>, i: number) => ({
        id: s.id || `shot-${i + 1}`,
        title: s.title || s.label || `Shot ${i + 1}`,
        angle: s.angle || "",
        composition: s.composition || "",
        light: s.light || "",
        color: s.color || "",
        lens: s.lens || s.cameraMotion || "",
        purpose: s.purpose || s.directorNote || "",
        prompt: s.prompt || s.imagePrompt || "",
      }))
    }
    // Try to extract prompts and merge
    if (Array.isArray(obj.prompts) && obj.prompts.length > 0) {
      const prompts = obj.prompts as Record<string, string>[]
      if (finalShots.length === 0) {
        finalShots = prompts.map((p, i) => ({
          id: p.shotId || `shot-${i + 1}`,
          title: p.label || `Shot ${i + 1}`,
          angle: "", composition: "", light: "", color: "", lens: "",
          purpose: p.directorNote || "",
          prompt: p.imagePrompt || "",
        }))
      } else {
        // Merge prompts into existing shots
        for (const p of prompts) {
          const shot = finalShots.find((s) => s.id === p.shotId)
          if (shot && p.imagePrompt) shot.prompt = p.imagePrompt
          if (shot && p.directorNote) shot.purpose = p.directorNote
        }
      }
    }
    if (obj.sceneSummary) essence = obj.sceneSummary as string
    if (obj.essence) essence = obj.essence as string
  }

  const jenkinsShots = finalShots.map((s, i) => fincherShotToJenkins(s, i, sceneText.length))
  calculateSmartDurations(jenkinsShots, sceneText, options?.sceneDurationMs)

  return {
    shots: jenkinsShots,
    diagnostics: { usedFallback: false, actionSplitFallback: false, shotPlannerFallback: false, promptComposerFallback: false },
  }
}

export async function breakdownSceneFincher(
  sceneText: string,
  options?: FincherOptions,
): Promise<BreakdownResult> {
  const normalizedSceneText = sceneText.trim()
  if (!normalizedSceneText) {
    return { shots: [], diagnostics: { usedFallback: false, actionSplitFallback: false, shotPlannerFallback: false, promptComposerFallback: false } }
  }

  // Check if Pipeline Constructor preset is active
  const pipelinePreset = useBreakdownConfigStore.getState().activePipelinePreset
  if (pipelinePreset && pipelinePreset.modules.length > 0) {
    return runPipelinePreset(pipelinePreset, normalizedSceneText, options)
  }

  const primaryModel = options?.modelId || "gemini-2.5-flash"
  const sceneId = options?.sceneId || `scene-${Date.now()}`

  // Build user message with all context
  // Style is NOT included — it's applied as a separate layer at generation time
  const parts: string[] = [`scene: ${normalizedSceneText}`]
  if (options?.bible) {
    if (options.bible.characters.length) parts.push(`characters: ${JSON.stringify(options.bible.characters)}`)
    if (options.bible.locations.length) parts.push(`locations: ${JSON.stringify(options.bible.locations)}`)
  }
  // Inject timeline map so AI knows where voice/action happens
  if (options?.timelineSegments && options.timelineSegments.length > 0) {
    const totalMs = options.sceneDurationMs ?? options.timelineSegments.reduce((max, s) => Math.max(max, s.endMs), 0)
    parts.push(buildTimelineContext(options.timelineSegments, totalMs))
  }

  devlog.breakdown("breakdown_start", `Fincher Breakdown: ${normalizedSceneText.slice(0, 60)}...`, `Model: ${primaryModel}`, { sceneId, modelId: primaryModel }, `fincher-${sceneId}`)

  const t = Date.now()
  let fincherResult: FincherResponse
  let usedFallback = false

  // Build model chain: primary first, then fallbacks (excluding primary)
  const modelChain = [primaryModel, ...FALLBACK_MODELS.filter(m => m !== primaryModel)]

  let lastError: Error | null = null
  for (const modelId of modelChain) {
    try {
      if (modelId !== primaryModel) {
        devlog.breakdown("breakdown_scene_analysis", `Trying fallback model: ${modelId}`, `Primary (${primaryModel}) failed: ${lastError?.message}`, { sceneId, modelId }, `fincher-${sceneId}`)
      }

      const { raw } = await callLLM(parts, modelId, options?.directorSystemPrompt)
      fincherResult = parseFincherResponse(raw)
      usedFallback = modelId !== primaryModel

      if (usedFallback) {
        devlog.breakdown("breakdown_scene_analysis", `Fallback ${modelId} succeeded with ${fincherResult.shots.length} shots`, "", { sceneId, modelId }, `fincher-${sceneId}`)
      }

      devlog.breakdown("breakdown_scene_analysis", `Fincher produced ${fincherResult.shots.length} shots in ${Date.now() - t}ms (${modelId})`, JSON.stringify(fincherResult, null, 2), {
        sceneId,
        shotCount: fincherResult.shots.length,
        essence: fincherResult.essence,
        duration: Date.now() - t,
        model: modelId,
      }, `fincher-${sceneId}`)

      // Success — break out of loop
      break
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      devlog.breakdown("breakdown_scene_analysis", `Model ${modelId} failed: ${lastError.message}`, "", { sceneId, error: lastError.message, modelId }, `fincher-${sceneId}`)
      continue
    }
  }

  // If all models failed
  if (!fincherResult!) {
    throw lastError || new Error("All breakdown models failed")
  }

  // Convert to JenkinsShot format
  const jenkinsShots = fincherResult.shots.map((s, i) => fincherShotToJenkins(s, i, normalizedSceneText.length))
  calculateSmartDurations(jenkinsShots, normalizedSceneText, options?.sceneDurationMs)

  const diagnostics: BreakdownDiagnostics = {
    usedFallback,
    actionSplitFallback: false,
    shotPlannerFallback: false,
    promptComposerFallback: false,
  }

  return { shots: jenkinsShots, diagnostics }
}
