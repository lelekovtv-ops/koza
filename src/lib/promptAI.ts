/**
 * AI-powered prompt composition for image/video generation.
 * Shared between ShotStudio (?? rewrite) and StoryboardPanel (BUILD button).
 */

import type { CharacterEntry, LocationEntry, PropEntry } from "@/lib/bibleParser"

export interface PromptAIContext {
  sceneTitle?: string
  caption?: string
  directorNote?: string
  cameraNote?: string
  shotSize?: string
  cameraMotion?: string
  currentImagePrompt?: string
  characters: CharacterEntry[]
  locations: LocationEntry[]
  props: PropEntry[]
  projectStyle: string
  storyHistory?: string
  directorVision?: string
  excludedBibleIds?: string[]
}

function buildContextBlock(ctx: PromptAIContext): string {
  const excluded = new Set(ctx.excludedBibleIds ?? [])
  const charList = ctx.characters
    .filter((c) => !excluded.has(`char-${c.id}`))
    .map((c) => `${c.name}${c.appearancePrompt ? ` (${c.appearancePrompt})` : ""}`)
    .join(", ")
  const locList = ctx.locations
    .filter((l) => !excluded.has(`loc-${l.id}`))
    .map((l) => `${l.name} ${l.intExt}${l.appearancePrompt ? ` (${l.appearancePrompt})` : ""}`)
    .join(", ")
  const propList = ctx.props
    .filter((p) => !excluded.has(`prop-${p.id}`))
    .map((p) => `${p.name}${p.appearancePrompt ? ` (${p.appearancePrompt})` : ""}`)
    .join(", ")

  return [
    ctx.storyHistory ? `Story context: ${ctx.storyHistory}` : "",
    ctx.directorVision ? `Director vision: ${ctx.directorVision}` : "",
    ctx.sceneTitle ? `Scene: ${ctx.sceneTitle}` : "",
    ctx.caption ? `Shot action: ${ctx.caption}` : "",
    ctx.directorNote ? `Director note: ${ctx.directorNote}` : "",
    ctx.cameraNote ? `Camera: ${ctx.cameraNote}` : "",
    ctx.shotSize ? `Shot size: ${ctx.shotSize}` : "",
    ctx.cameraMotion ? `Camera motion: ${ctx.cameraMotion}` : "",
    charList ? `Characters in scene: ${charList}` : "",
    locList ? `Location: ${locList}` : "",
    propList ? `Props: ${propList}` : "",
    // Style is NOT passed to LLM — it's applied as a separate layer at generation time
    ctx.currentImagePrompt ? `Current prompt: ${ctx.currentImagePrompt}` : "",
  ].filter(Boolean).join("\n")
}

async function readStreamResponse(res: Response): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) throw new Error("No response body")
  const chunks: string[] = []
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(new TextDecoder().decode(value))
  }
  return chunks.join("").trim()
}

/**
 * Build an image prompt using AI, given shot context + user instruction.
 * Used by ShotStudio ?? rewrite and StoryboardPanel BUILD button.
 */
export async function buildImagePromptWithAI(
  ctx: PromptAIContext,
  instruction?: string,
): Promise<string> {
  const context = buildContextBlock(ctx)
  const userInstruction = instruction?.trim()
    || ctx.caption?.trim()
    || "Describe this shot visually for image generation"

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{
        role: "user",
        content: `You are a cinematic image prompt writer for AI image generation. You write detailed, visual, cinematic prompts in English.

CONTEXT OF THIS SHOT:
${context}

USER INSTRUCTION:
${userInstruction}

Write a complete image generation prompt based on the context and instruction. Include:
- Shot composition and framing
- Character appearances (use the provided descriptions)
- Environment/location details
- Lighting and mood
- Camera lens/style if mentioned
- Props if relevant to the shot

Keep the prompt concise (3-5 sentences), visual, and specific. Write ONLY the prompt text, nothing else. No explanations, no markdown.`,
      }],
      temperature: 0.7,
    }),
  })

  if (!res.ok) throw new Error("AI prompt build failed")
  return readStreamResponse(res)
}

export interface BuildShotResult {
  directorNote: string
  cameraNote: string
  imagePrompt: string
  videoPrompt: string
}

/**
 * Build full shot package: director note, camera note, image prompt, video prompt.
 * Used by StoryboardPanel BUILD button — one click fills everything from ACTION.
 */
export async function buildShotPromptsWithAI(
  ctx: PromptAIContext,
): Promise<BuildShotResult> {
  const context = buildContextBlock(ctx)

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{
        role: "user",
        content: `You are a cinematic director and DP working on a film. Based on the shot action and context, write all production notes.

CONTEXT:
${context}

Write ALL FOUR fields for this shot. Write in the SAME LANGUAGE as the action text (if Russian — write directorNote and cameraNote in Russian, prompts in English).

1. directorNote — 2-3 lines: emotional intention, what the audience should feel, visual metaphor, actor direction. Short, poetic, intentional.
2. cameraNote — 2-3 lines: specific lens (e.g. 35mm), camera position, angle, movement, foreground elements, depth. Technical but creative.
3. imagePrompt — 3-5 sentences in English: complete image generation prompt with composition, character appearances, environment, lighting, mood, lens style. Visual and specific.
4. videoPrompt — 2-3 sentences in English: extends image into motion — camera movement, character action, pacing.

Return ONLY valid JSON, no markdown:
{"directorNote": "...", "cameraNote": "...", "imagePrompt": "...", "videoPrompt": "..."}`,
      }],
      temperature: 0.7,
    }),
  })

  if (!res.ok) throw new Error("AI prompt build failed")
  const raw = await readStreamResponse(res)

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<BuildShotResult>
      return {
        directorNote: parsed.directorNote?.trim() || "",
        cameraNote: parsed.cameraNote?.trim() || "",
        imagePrompt: parsed.imagePrompt?.trim() || raw,
        videoPrompt: parsed.videoPrompt?.trim() || "",
      }
    }
  } catch { /* fallback below */ }

  return { directorNote: "", cameraNote: "", imagePrompt: raw, videoPrompt: "" }
}
