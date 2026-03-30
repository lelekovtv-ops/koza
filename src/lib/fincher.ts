/**
 * Fincher Breakdown — single-prompt cinematic storyboard generator.
 * Replaces the old 7-stage pipeline with one powerful prompt.
 */

import type { JenkinsShot, BreakdownResult, BreakdownDiagnostics, BibleContext } from "./jenkins"
import { devlog } from "@/store/devlog"

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

interface FincherOptions {
  sceneId?: string
  bible?: BibleContext
  style?: string
  modelId?: string
}

const FINCHER_SYSTEM_PROMPT = `Ты — Дэвид Финчер + Эрик Мессершмидт. Тебе дают текст сцены, описание персонажей и локаций.

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
   Структура: Style + angle + subject with position + foreground objects + background + single light source with direction and shadow + color palette + lens + "16:9. No text, no watermark, natural anatomy."
   Стиль берёшь из поля style.

Отвечай НА РУССКОМ (описания) + АНГЛИЙСКИЙ (prompt).
Return ONLY JSON (no markdown, no backticks):
{"essence":"суть сцены","shots":[{"id":"shot-1","title":"название","angle":"ракурс","composition":"что где","light":"свет","color":"палитра","lens":"объектив","purpose":"монтажная функция","prompt":"English prompt"}]}`

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

function fincherShotToJenkins(shot: FincherShot, index: number, sceneTextLength: number): JenkinsShot {
  // Calculate duration based on scene length and shot count
  const charsPerPage = 3000
  const secondsPerPage = 60
  const totalMs = Math.max(5000, Math.round((sceneTextLength / charsPerPage) * secondsPerPage * 1000))
  // Will be adjusted later when we know total shots

  return {
    label: shot.title,
    type: "image",
    duration: 3000, // placeholder, adjusted below
    notes: `РАКУРС: ${shot.angle}\nКОМПОЗИЦИЯ: ${shot.composition}\nСВЕТ: ${shot.light}\nЦВЕТ: ${shot.color}\nОБЪЕКТИВ: ${shot.lens}\nМОНТАЖНАЯ ФУНКЦИЯ: ${shot.purpose}`,
    shotSize: extractShotSize(shot.angle),
    cameraMotion: extractCameraMotion(shot.lens),
    caption: shot.composition,
    directorNote: shot.purpose,
    cameraNote: `${shot.angle}. ${shot.lens}`,
    imagePrompt: shot.prompt,
    videoPrompt: "",
    visualDescription: `${shot.angle}. ${shot.composition}. ${shot.light}. ${shot.color}`,
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
  return fullText
}

export async function breakdownSceneFincher(
  sceneText: string,
  options?: FincherOptions,
): Promise<BreakdownResult> {
  const normalizedSceneText = sceneText.trim()
  if (!normalizedSceneText) {
    return { shots: [], diagnostics: { usedFallback: false, actionSplitFallback: false, shotPlannerFallback: false, promptComposerFallback: false } }
  }

  const modelId = options?.modelId || "gpt-4o"
  const style = options?.style || "Anime style, cel shading, dramatic lighting"
  const sceneId = options?.sceneId || `scene-${Date.now()}`

  // Build user message with all context
  const parts: string[] = [`scene: ${normalizedSceneText}`, `style: ${style}`]
  if (options?.bible) {
    if (options.bible.characters.length) parts.push(`characters: ${JSON.stringify(options.bible.characters)}`)
    if (options.bible.locations.length) parts.push(`locations: ${JSON.stringify(options.bible.locations)}`)
  }

  devlog.breakdown("breakdown_start", `Fincher Breakdown: ${normalizedSceneText.slice(0, 60)}...`, `Model: ${modelId}`, { sceneId, modelId }, `fincher-${sceneId}`)

  const t = Date.now()
  let fincherResult: FincherResponse

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: parts.join("\n\n") }],
        modelId,
        system: FINCHER_SYSTEM_PROMPT,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`)
    }

    const raw = await readStream(response)
    fincherResult = parseFincherResponse(raw)

    devlog.breakdown("breakdown_scene_analysis", `Fincher produced ${fincherResult.shots.length} shots in ${Date.now() - t}ms`, JSON.stringify(fincherResult, null, 2), {
      sceneId,
      shotCount: fincherResult.shots.length,
      essence: fincherResult.essence,
      duration: Date.now() - t,
    }, `fincher-${sceneId}`)

  } catch (error) {
    devlog.breakdown("breakdown_scene_analysis", `Fincher failed: ${error}`, "", { sceneId, error: String(error) }, `fincher-${sceneId}`)
    throw error
  }

  // Convert to JenkinsShot format
  const jenkinsShots = fincherResult.shots.map((s, i) => fincherShotToJenkins(s, i, normalizedSceneText.length))

  // Distribute durations proportionally
  const totalMs = Math.max(5000, Math.round((normalizedSceneText.length / 3000) * 60 * 1000))
  const perShot = Math.round(totalMs / jenkinsShots.length)
  jenkinsShots.forEach((s) => { s.duration = Math.max(1500, Math.min(8000, perShot)) })

  const diagnostics: BreakdownDiagnostics = {
    usedFallback: false,
    actionSplitFallback: false,
    shotPlannerFallback: false,
    promptComposerFallback: false,
  }

  return { shots: jenkinsShots, diagnostics }
}
