import { generateObject } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import { z } from "zod"

const SYSTEM = `You are KOZA — an AI film director and production planner.

You receive a parsed script with sections and segments. Your job is to make SMART CREATIVE DECISIONS about how each piece should be produced.

For each segment you must decide:
- The best API/tool to generate it
- A detailed, cinematic production prompt (in English, regardless of script language)
- Camera/motion settings
- How it connects to adjacent segments (transitions, visual rhymes, tonal arc)

Think like David Fincher meets a YouTube producer: every frame has intent.

RULES:
- Voice segments → TTS config (speed, emotion, pauses)
- Visual segments with "talking head" / "ведущий" → Video Gen with face consistency
- Visual segments with archive/photo references → Image Gen with Ken Burns motion hint
- Visual segments with action/dynamic → Video Gen with camera movement
- Titles → animation style matching the mood (kinetic for energy, fade for drama)
- Music → detailed mood description with BPM and instrument hints
- Think about the EMOTIONAL ARC across sections: hook should grab, middle should build, climax should peak, CTA should release
- Add SFX where they enhance impact (transitions, reveals, emphasis)
- Add transition hints between sections (cut, dissolve, whip-pan)

OUTPUT: Return an array of enriched jobs with creative decisions.`

const JobSchema = z.object({
  segmentId: z.string(),
  type: z.enum(["tts", "video-gen", "image-gen", "music-gen", "sfx", "title-card", "lipsync"]),
  prompt: z.string().describe("Detailed production prompt for this asset"),
  api: z.string().describe("Which API to use: kling-2.0, seedance-1.0, runway-gen4, flux-1.1-pro, flux-kontext, eleven_multilingual_v2, suno-v4, elevenlabs-sfx, remotion"),
  camera: z.string().optional().describe("Camera preset: static, slow-push-in, pull-back, orbit-left, handheld, crane-up, dutch-tilt"),
  motionStrength: z.number().optional().describe("0-1, how much movement"),
  emotionalNote: z.string().describe("1-line creative intent for this asset"),
  transitionTo: z.string().optional().describe("How to transition to next section: cut, dissolve, whip-pan, match-cut, fade-to-black"),
  titleStyle: z.string().optional().describe("For title-card: lower-third, full-screen, kinetic, subtitle"),
  musicBpm: z.number().optional(),
  musicInstruments: z.string().optional(),
  voiceSpeed: z.number().optional().describe("TTS speed 0.8-1.2"),
  voiceEmotion: z.string().optional().describe("calm, urgent, dramatic, warm, cold"),
})

const ResponseSchema = z.object({
  directorNote: z.string().describe("Overall creative direction for the piece, 2-3 sentences"),
  colorGrade: z.string().describe("Color grading direction for the whole piece"),
  pacing: z.string().describe("Pacing strategy: slow-burn, energetic, building, etc"),
  jobs: z.array(JobSchema),
})

export async function POST(req: Request) {
  try {
    const { segments, sections, scriptText } = await req.json()

    const userPrompt = `Here is the script and its parsed structure. Make creative production decisions for each segment.

SCRIPT TEXT:
${scriptText}

SECTIONS:
${JSON.stringify(sections.map((s: { id: string; title: string; order: number; color: string }) => ({ id: s.id, title: s.title, order: s.order })), null, 2)}

SEGMENTS:
${JSON.stringify(segments.map((s: { id: string; role: string; track: string; content: string; startMs: number; durationMs: number; sectionId: string }) => ({
  id: s.id,
  role: s.role,
  track: s.track,
  content: s.content,
  startMs: s.startMs,
  durationMs: s.durationMs,
  sectionId: s.sectionId,
})), null, 2)}

Analyze the emotional arc, decide on APIs, write cinematic prompts, choose camera moves. Return enriched jobs.`

    const result = await generateObject({
      model: anthropic("claude-sonnet-4-20250514"),
      system: SYSTEM,
      prompt: userPrompt,
      schema: ResponseSchema,
      temperature: 0.7,
    })

    return Response.json(result.object)
  } catch (error) {
    console.error("Smart distribute error:", error)
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
