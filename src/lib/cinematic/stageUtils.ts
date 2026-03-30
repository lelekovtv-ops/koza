import { DEFAULT_PROJECT_STYLE } from "@/lib/projectStyle"
import type { ProjectStyleBible } from "@/types/cinematic"

export interface CinematicBibleContext {
  characters: Array<{ name: string; description: string; appearancePrompt: string }>
  locations: Array<{ name: string; description: string; appearancePrompt: string; intExt: string }>
  props?: Array<{ name: string; description: string; appearancePrompt: string }>
}

export type CinematicStyleContext = string | ProjectStyleBible | undefined

export function resolveStyleDirective(style?: CinematicStyleContext): string {
  if (!style) {
    return DEFAULT_PROJECT_STYLE
  }

  if (typeof style === "string") {
    return style.trim() || DEFAULT_PROJECT_STYLE
  }

  return [style.name, style.visualIntent, style.genreTone, style.colorStrategy, style.imagePromptBase]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(". ") || DEFAULT_PROJECT_STYLE
}

export function buildBibleContextPrompt(bible?: CinematicBibleContext): string {
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

  const props = bible.props && bible.props.length > 0
    ? bible.props.map((prop) => (
      `- ${prop.name}: ${prop.description || "No description yet"}${prop.appearancePrompt ? ` [Visual: ${prop.appearancePrompt}]` : ""}`
    )).join("\n")
    : null

  return `\nPROJECT BIBLE:\nCHARACTERS:\n${characters}\n\nLOCATIONS:\n${locations}${props ? `\n\nPROPS:\n${props}` : ""}`
}

export function extractJsonObject(rawText: string): string {
  const trimmed = rawText.trim()

  if (!trimmed) {
    throw new Error("Stage returned invalid JSON object")
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidateText = fencedMatch?.[1]?.trim() || trimmed

  if (candidateText.startsWith("{")) {
    try {
      JSON.parse(candidateText)
      return candidateText
    } catch {
      // Fall through to balanced brace scanning.
    }
  }

  let startIndex = -1
  let depth = 0
  let inString = false
  let isEscaped = false

  for (let index = 0; index < candidateText.length; index += 1) {
    const char = candidateText[index]

    if (inString) {
      if (isEscaped) {
        isEscaped = false
        continue
      }

      if (char === "\\") {
        isEscaped = true
        continue
      }

      if (char === '"') {
        inString = false
      }

      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === "{") {
      if (depth === 0) {
        startIndex = index
      }
      depth += 1
      continue
    }

    if (char === "}" && depth > 0) {
      depth -= 1

      if (depth === 0 && startIndex !== -1) {
        const candidate = candidateText.slice(startIndex, index + 1)

        try {
          JSON.parse(candidate)
          return candidate
        } catch {
          startIndex = -1
        }
      }
    }
  }

  throw new Error("Stage returned invalid JSON object")
}

export function extractJsonArray(rawText: string): string {
  const trimmed = rawText.trim()

  if (trimmed.startsWith("[")) {
    return trimmed
  }

  const startIndex = trimmed.indexOf("[")
  const endIndex = trimmed.lastIndexOf("]")

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error("Stage returned invalid JSON array")
  }

  return trimmed.slice(startIndex, endIndex + 1)
}

export function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((entry) => normalizeString(entry)).filter(Boolean)
}

export function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      const normalized = normalizeString(entry)
      return normalized ? [[key, normalized]] : []
    })
  )
}

export function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.round(value)))
}

export function makeShotSpecId(sceneId: string, order: number): string {
  const normalizedSceneId = sceneId.trim() || "scene"
  return `${normalizedSceneId}-shot-${order + 1}`
}

export function serializeForPrompt(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return String(error)
}