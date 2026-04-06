/**
 * Style Layer — separates visual style from content prompts.
 *
 * Content prompt: WHAT is in the shot (subject, action, camera, composition)
 * Style modifier: HOW it looks (anime, noir, realistic, watercolor...)
 *
 * Style is NEVER baked into prompts during breakdown.
 * It's applied as a separate layer at generation time.
 * User can toggle style on/off or swap styles instantly.
 *
 * Final prompt = composePrompt(contentPrompt, styleModifier, styleEnabled)
 */

// ─── Style Modifier ──────────────────────────────────────────

export interface StyleModifier {
  id: string
  name: string
  prompt: string
  negativePrompt?: string
  enabled: boolean
}

// ─── Built-in styles ─────────────────────────────────────────

export const BUILT_IN_STYLES: Omit<StyleModifier, "enabled">[] = [
  {
    id: "realistic",
    name: "Realistic",
    prompt: "Photorealistic, cinematic lighting, shot on ARRI Alexa, shallow depth of field, natural colors",
    negativePrompt: "cartoon, anime, drawing, sketch, painting, illustration",
  },
  {
    id: "anime",
    name: "Anime",
    prompt: "Anime style, cel shading, vibrant colors, Studio Ghibli aesthetic, clean linework",
    negativePrompt: "photorealistic, photograph, 3D render",
  },
  {
    id: "noir",
    name: "Film Noir",
    prompt: "Film noir, high contrast black and white, dramatic chiaroscuro lighting, deep shadows, 1940s aesthetic",
    negativePrompt: "color, bright, cheerful, modern",
  },
  {
    id: "watercolor",
    name: "Watercolor",
    prompt: "Watercolor painting style, soft washes, visible brushstrokes, muted palette, artistic, delicate",
    negativePrompt: "photorealistic, sharp, digital, 3D",
  },
  {
    id: "comic",
    name: "Comic Book",
    prompt: "Comic book style, bold ink outlines, halftone dots, dynamic composition, speech bubbles aesthetic",
    negativePrompt: "photorealistic, soft, blurry",
  },
  {
    id: "pixar",
    name: "3D Animation",
    prompt: "Pixar-style 3D animation, subsurface scattering, soft ambient lighting, expressive characters, colorful",
    negativePrompt: "2D, flat, photograph, live action",
  },
  {
    id: "sketch",
    name: "Pencil Sketch",
    prompt: "Pencil sketch, graphite drawing, crosshatching, rough texture, monochrome, artistic",
    negativePrompt: "color, photorealistic, digital, clean",
  },
  {
    id: "murakami",
    name: "Murakami",
    prompt: "Takashi Murakami style, superflat aesthetic, bold colors, pop art flowers, kawaii elements, psychedelic",
    negativePrompt: "photorealistic, muted, dark, desaturated",
  },
]

// ─── Compose final prompt ────────────────────────────────────

/**
 * Compose final generation prompt from content + style.
 *
 * @param contentPrompt - Pure content: what is in the shot
 * @param style - Style modifier (or null if disabled)
 * @returns Final prompt ready for image generation
 */
export function composePrompt(
  contentPrompt: string,
  style: StyleModifier | null,
): string {
  if (!contentPrompt.trim()) return ""

  const content = contentPrompt.trim()

  // No style or style disabled → content only + basic suffix
  if (!style || !style.enabled) {
    return `${content} 16:9. No text, no watermark.`
  }

  // Style enabled → content + style + suffix
  return `${content}\nStyle: ${style.prompt}. 16:9. No text, no watermark.`
}

/**
 * Strip style from an existing prompt (for re-composing with different style).
 * Removes everything after "Style:" line.
 */
export function stripStyleFromComposedPrompt(prompt: string): string {
  // Remove "Style: ..." line
  const lines = prompt.split("\n")
  const filtered = lines.filter((l) => !l.trim().startsWith("Style:"))

  // Also remove trailing suffix
  let result = filtered.join("\n").trim()
  result = result.replace(/\s*16:9\.\s*No text[^.]*\.\s*$/i, "").trim()
  result = result.replace(/\s*No text,?\s*no watermark\.?\s*$/i, "").trim()

  return result
}

/**
 * Re-apply a new style to an existing composed prompt.
 * Strips old style, applies new one.
 */
export function recomposeWithStyle(
  composedPrompt: string,
  newStyle: StyleModifier | null,
): string {
  const content = stripStyleFromComposedPrompt(composedPrompt)
  return composePrompt(content, newStyle)
}
