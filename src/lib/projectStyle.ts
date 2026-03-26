export const DEFAULT_PROJECT_STYLE = "Film noir, high contrast black and white, dramatic chiaroscuro lighting, deep shadows"

export const STYLE_PRESETS = [
  {
    id: "noir",
    label: "Film Noir",
    prompt: DEFAULT_PROJECT_STYLE,
  },
  {
    id: "color-noir",
    label: "Color Noir",
    prompt: "Neo-noir color palette, teal and orange, moody desaturated, practical lighting",
  },
  {
    id: "sketch",
    label: "Sketch",
    prompt: "Clean thin-line storyboard sketch, single-weight pencil outline, no shading, no hatching, no fill, no texture, no shadows, no gradients, pure white background, minimal detail, only essential contours, like a clean animation key drawing",
  },
  {
    id: "watercolor",
    label: "Watercolor",
    prompt: "Watercolor illustration, soft washes, muted palette, artistic storyboard",
  },
  {
    id: "realistic",
    label: "Realistic",
    prompt: "Photorealistic, natural lighting, ARRI Alexa look, subtle film grain",
  },
  {
    id: "anime",
    label: "Anime",
    prompt: "Anime style, cel shading, dramatic lighting, cinematic composition",
  },
  {
    id: "custom",
    label: "Custom",
    prompt: "",
  },
] as const

export type StylePresetId = (typeof STYLE_PRESETS)[number]["id"]

export function getProjectStylePresetId(style: string): StylePresetId {
  return STYLE_PRESETS.find((preset) => preset.prompt === style)?.id ?? "custom"
}