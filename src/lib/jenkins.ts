import { DEFAULT_TEXT_MODEL_ID } from "@/lib/models"
import { DEAKINS_RULES, SHOT_TRANSITION_RULES } from "@/lib/cinematographyRules"
import { DEFAULT_PROJECT_STYLE } from "@/lib/projectStyle"
import { devlog } from "@/store/devlog"

export interface JenkinsShot {
  label: string
  type: "image"
  duration: number
  notes: string
  shotSize?: string
  cameraMotion?: string
  caption?: string
  directorNote?: string
  cameraNote?: string
  videoPrompt?: string
  imagePrompt?: string
  visualDescription?: string
}

export interface BibleContext {
  characters: Array<{ name: string; description: string; appearancePrompt: string }>
  locations: Array<{ name: string; description: string; appearancePrompt: string; intExt: string }>
}

interface BreakdownOptions {
  sceneId?: string
  blockIds?: string[]
  modelId?: string
  bible?: BibleContext
  style?: string
}

function buildBibleContextPrompt(bible?: BibleContext): string {
  if (!bible) {
    return ""
  }

  const characters = bible.characters.length > 0
    ? bible.characters.map((character) => (
      `- ${character.name}: ${character.description || "No description yet"}${character.appearancePrompt ? ` [Visual: ${character.appearancePrompt}]` : ""}`
    )).join("\n")
    : "No characters defined yet."

  const locations = bible.locations.length > 0
    ? bible.locations.map((location) => (
      `- ${location.name} (${location.intExt}): ${location.description || "No description yet"}${location.appearancePrompt ? ` [Visual: ${location.appearancePrompt}]` : ""}`
    )).join("\n")
    : "No locations defined yet."

  return `

PROJECT BIBLE — use this information for accurate descriptions:

CHARACTERS:
${characters}

LOCATIONS:
${locations}

Use character descriptions and visual details from the bible when describing what's in each frame.
Reference characters by name and describe them as specified in the bible.
Reference locations with their visual details from the bible.
`
}

function buildJenkinsSystemPrompt(options?: BreakdownOptions): string {
  const style = options?.style || DEFAULT_PROJECT_STYLE

  return `You are JENKINS — a veteran cinematographer and 1st AD with 30 years of experience.
You think like Roger Deakins shoots: every frame has purpose, every cut has rhythm.

Your job: break down screenplay text into a DETAILED shot-by-shot sequence.

RULES:
1. EVERY physical action = separate shot. "Boris stands up and walks to the window" = at minimum 2 shots (standing up + walking to window), possibly 3 (+ looking through window).
2. EVERY dialogue line = its own shot (speaker), plus reaction shot of the listener if dramatically important.
3. Establish geography FIRST. Every new location starts with a wide establishing shot.
4. Think in SEQUENCES: establish → develop → climax → resolve. Vary your shot sizes rhythmically.
5. Be SPECIFIC about framing: not just "close-up" but "EXTREME CLOSE-UP on Boris's trembling hands shuffling documents."
6. Describe what's IN THE FRAME, not the action abstractly. Camera sees, camera shows.
7. Include camera MOTIVATION: why this angle? Why this movement? (brief note)
8. Consider SOUND design hints in notes.
9. Duration should reflect the real screen time of the action.
10. LANGUAGE: The screenplay text may be in Russian or any language.
11. Write label, caption, and directorNote in the SAME language as the screenplay.
12. Write cameraNote with technical film terminology in English where needed.
13. Write imagePrompt and videoPrompt in English only.
14. Write notes (technical camera/lens/sound directions) in English.
15. Keep each layer internally consistent: caption for story, directorNote for rhythm, cameraNote for craft, imagePrompt for still frame, videoPrompt for motion.

SHOT SIZE vocabulary:
- EXTREME WIDE (EWS): landscape, city, building exterior
- WIDE (WS): full room, full body in environment
- MEDIUM WIDE (MWS): knee-up, shows body language + environment
- MEDIUM (MS): waist-up, conversational
- MEDIUM CLOSE-UP (MCU): chest-up, emotional read
- CLOSE-UP (CU): face fills frame, pure emotion
- EXTREME CLOSE-UP (ECU): eyes, hands, objects, details
- OVER SHOULDER (OTS): conversation framing
- POV: subjective camera
- INSERT: object detail, document, phone screen
- TWO SHOT: two characters in frame
- LOW ANGLE: power, menace
- HIGH ANGLE: vulnerability, surveillance
- DUTCH ANGLE: unease, tension

CAMERA MOVEMENT vocabulary:
- Static: locked tripod, stability or tension
- Pan Left/Right: follow action or reveal
- Tilt Up/Down: reveal height or shift focus
- Push In: increasing tension or intimacy
- Pull Out: reveal context or isolation
- Track Left/Right: follow walking character
- Track In/Out: dolly move toward/away
- Crane Up/Down: dramatic reveal or descent
- Handheld: urgency, documentary feel, anxiety
- Steadicam: fluid following, dreamlike
- Whip Pan: sudden attention shift

${buildBibleContextPrompt(options?.bible)}

${DEAKINS_RULES}

${SHOT_TRANSITION_RULES}

IMPORTANT: When creating your shot sequence, verify each shot transition 
follows the rules above. Check that no two adjacent shots break the 
continuity guidelines. Your sequence should have a clear visual rhythm.

PROJECT VISUAL STYLE: ${style}
All imagePrompt values MUST incorporate this visual style.
All videoPrompt values MUST reference this style.
Do NOT hardcode "film noir" — use the style above.

RESPOND ONLY with valid JSON array. No markdown, no backticks, no explanation.
Each object in the array:
{
  "label": "КРП — Дрожащие руки Бориса",
  "shotSize": "EXTREME CLOSE-UP",
  "cameraMotion": "Static",
  "duration": 2500,
  "caption": "Крупно на руки Бориса, перебирающего документы. Пальцы дрожат, фотография выскальзывает из стопки.",
  "directorNote": "CU, акцент на деталях, держим 2-3 сек. Этот кадр устанавливает тревожность до того как мы увидим лицо.",
  "cameraNote": "85mm, f1.8, shoulder rig, micro movement допустим. Focus breathing лёгкий. Key light — TV glow screen-left (60%), bounce fill минимальный. ISO 2000, WB 3200K.",
  "imagePrompt": "extreme close-up weathered male hands over scattered papers on dark wooden desk, cigarette ash on documents, faded photograph half exposed from pile, single TV glow from screen-left casting harsh shadows across knuckles, shallow DOF at 85mm f1.8, dust in light beam, background falling into deep black bokeh, ${style}, 16:9",
  "videoPrompt": "extreme close-up trembling hands holding papers, ash falling from cigarette, slow subtle handheld micro-movement, shallow depth of field, TV flicker light source from left, suspense mood, film grain, 24fps, 2.5 seconds, visual style ${style}",
  "notes": "Lens: 85mm f1.8. Sound: paper rustling, clock ticking. Motivated by: establishing anxiety before face reveal.",
  "type": "image"
}

FOR EACH SHOT, PROVIDE 5 LAYERS:

1. "caption" — LITERARY (screenplay language, Russian if screenplay is Russian)
   What happens in the story. For the director to understand the dramatic beat.

2. "directorNote" — DIRECTOR (screenplay language)
   Shot rhythm, hold time, dramatic purpose, editorial intent.
   Example: "WS establishing, hold 4-5 sec, isolation feel. Cut on the flinch."

3. "cameraNote" — CINEMATOGRAPHER (mixed, technical terms in English)
   Exact lens, aperture, ISO, white balance, camera height, rig type.
   Light sources: key %, fill %, what creates them (TV, window, lamp).
   Camera movement speed, stabilization method.
   Example: "85mm f1.8, shoulder rig. TV key light 60% screen-left, WB 3200K. ISO 2000."

4. "imagePrompt" — PHOTO PROMPT (English only)
   Built FROM the cameraNote. Describes the FROZEN FRAME as a photograph.
   Include: subject, foreground, midground, background, light direction and quality,
   depth of field, film stock look, aspect ratio.
  Must end with the project visual style directive provided above.
   NO action verbs (no "walking", "running"). Only static description.

5. "videoPrompt" — VIDEO PROMPT (English only)
   Built FROM imagePrompt + adds MOTION: camera movement, subject movement,
   duration, frame rate, pacing.
   Example: "slow push-in, man walks to window, 3 seconds, subtle handheld, 24fps"

CRITICAL RULES FOR imagePrompt:
- ALWAYS describe light SOURCE and DIRECTION (screen-left, screen-right, above, behind)
- ALWAYS describe what is IN FOCUS and what is BOKEH
- ALWAYS mention lens focal length look (wide distortion / telephoto compression)
- NEVER use the word "cinematic" alone — be specific about WHY it looks cinematic
- Describe the frame as a PHOTOGRAPH, not an action
- Bad: "man walks to window dramatically"
- Good: "silhouette of man framed against bright window, back to camera, hand reaching for curtain, strong backlight creating rim light on shoulders, deep shadow on face, 35mm wide distortion, shallow focus on hand"

Give 6-12 shots per scene depending on complexity.
For action-heavy scenes: 8-12 shots.
For dialogue scenes: 6-10 shots (including reactions).
For transitional/atmospheric scenes: 4-6 shots.

Think about PACING: start slow (wide, static), build tension (tighter, movement), climax (ECU, handheld), resolve (pull back).`
}

function buildBreakdownUserMessage(sceneText: string): string {
  return `Break down this scene into shots:\n\n${sceneText.trim()}`
}

function extractJsonArray(rawText: string): string {
  const trimmed = rawText.trim()

  if (trimmed.startsWith("[")) {
    return trimmed
  }

  const startIndex = trimmed.indexOf("[")
  const endIndex = trimmed.lastIndexOf("]")

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error("Jenkins returned invalid JSON array")
  }

  return trimmed.slice(startIndex, endIndex + 1)
}

function normalizeShot(item: unknown, index: number): JenkinsShot {
  const shot = typeof item === "object" && item !== null ? item as Record<string, unknown> : {}

  return {
    label: typeof shot.label === "string" && shot.label.trim()
      ? shot.label
      : `Shot ${index + 1}`,
    type: "image",
    duration: typeof shot.duration === "number" && Number.isFinite(shot.duration)
      ? shot.duration
      : 3000,
    notes: typeof shot.notes === "string" ? shot.notes : "",
    shotSize: typeof shot.shotSize === "string" ? shot.shotSize : undefined,
    cameraMotion: typeof shot.cameraMotion === "string" ? shot.cameraMotion : undefined,
    caption: typeof shot.caption === "string" ? shot.caption : undefined,
    directorNote: typeof shot.directorNote === "string" ? shot.directorNote : undefined,
    cameraNote: typeof shot.cameraNote === "string" ? shot.cameraNote : undefined,
    videoPrompt: typeof shot.videoPrompt === "string" ? shot.videoPrompt : undefined,
    imagePrompt: typeof shot.imagePrompt === "string" ? shot.imagePrompt : undefined,
    visualDescription: typeof shot.visualDescription === "string" ? shot.visualDescription : undefined,
  }
}

export async function breakdownScene(
  sceneText: string,
  optionsOrModelId?: BreakdownOptions | string,
): Promise<{ shots: JenkinsShot[] }> {
  const normalizedSceneText = sceneText.trim()

  if (!normalizedSceneText) {
    return { shots: [] }
  }

  const opts: BreakdownOptions = typeof optionsOrModelId === "string"
    ? { modelId: optionsOrModelId }
    : optionsOrModelId ?? {}
  const modelId = opts.modelId ?? DEFAULT_TEXT_MODEL_ID
  const group = `breakdown-${opts.sceneId || Date.now()}`
  const systemPrompt = buildJenkinsSystemPrompt(opts)
  const userMessage = buildBreakdownUserMessage(normalizedSceneText)

  devlog.breakdown("breakdown_start", `Breakdown: ${normalizedSceneText.slice(0, 60)}...`, "", {
    sceneId: opts.sceneId,
    modelId,
    textLength: normalizedSceneText.length,
  }, group)

  devlog.breakdown("breakdown_prompt", "System prompt", systemPrompt, {
    hasBible: !!opts.bible,
    characterCount: opts.bible?.characters.length || 0,
    locationCount: opts.bible?.locations.length || 0,
  }, group)

  devlog.breakdown("breakdown_request", "User message", userMessage, {}, group)

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: userMessage }],
        modelId,
        system: systemPrompt,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Jenkins breakdown failed: ${errorText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    const decoder = new TextDecoder()
    let fullText = ""

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      fullText += decoder.decode(value, { stream: true })
    }

    fullText += decoder.decode()

    devlog.breakdown("breakdown_response", "Raw AI response", fullText, {
      responseLength: fullText.length,
    }, group)

    const parsed: unknown = JSON.parse(extractJsonArray(fullText))

    if (!Array.isArray(parsed)) {
      throw new Error("Jenkins returned non-array response")
    }

    const shots = parsed.map(normalizeShot)

    devlog.breakdown("breakdown_result", `Parsed ${shots.length} shots`, JSON.stringify(shots, null, 2), {
      shotCount: shots.length,
      labels: shots.map((shot) => shot.label),
    }, group)

    return { shots }
  } catch (error) {
    devlog.breakdown("breakdown_error", "Breakdown failed", String(error), {
      sceneId: opts.sceneId,
    }, group)
    throw error
  }
}
