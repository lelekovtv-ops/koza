import type { ScreenplayElementType } from "@/lib/screenplayTypes"

const SLUG_SUGGESTIONS: { prefix: string; completion: string; full: string }[] = [
  { prefix: "i", completion: "NT.", full: "INT." },
  { prefix: "in", completion: "T.", full: "INT." },
  { prefix: "int", completion: ".", full: "INT." },
  { prefix: "e", completion: "XT.", full: "EXT." },
  { prefix: "ex", completion: "T.", full: "EXT." },
  { prefix: "ext", completion: ".", full: "EXT." },
  { prefix: "i/", completion: "E.", full: "I/E." },
  { prefix: "i/e", completion: ".", full: "I/E." },
  { prefix: "и", completion: "НТ.", full: "ИНТ." },
  { prefix: "ин", completion: "Т.", full: "ИНТ." },
  { prefix: "инт", completion: ".", full: "ИНТ." },
  { prefix: "э", completion: "КСТ.", full: "ЭКСТ." },
  { prefix: "эк", completion: "СТ.", full: "ЭКСТ." },
  { prefix: "экс", completion: "Т.", full: "ЭКСТ." },
  { prefix: "экст", completion: ".", full: "ЭКСТ." },
]

// Full or near-full slug prefixes that should switch block to scene heading.
// Keep "EX"/"IN" out of this list to preserve ghost-first behavior.
export const SCENE_HEADING_FULL_TRIGGERS = [
  "int.",
  "int. ",
  "ext.",
  "ext. ",
  "int./ext.",
  "int./ext. ",
  "ext./int.",
  "ext./int. ",
  "i/e.",
  "i/e. ",
  "инт.",
  "инт. ",
  "экст.",
  "экст. ",
  "инт./экст.",
  "инт./экст. ",
]

export const SCENE_PREFIX_RE = /^(INT\.\s*\/\s*EXT\.\s*|EXT\.\s*\/\s*INT\.\s*|INT\.\s*|EXT\.\s*|I\/E\.\s*|ИНТ\.\s*\/\s*ЭКСТ\.\s*|ИНТ\.\s*|ЭКСТ\.\s*)/i

export const SLUG_PREFIX_NO_DOT_RE = /^(INT|EXT|I\/?E|ИНТ|ЭКСТ)(\b|\s|\/|-|\.)/i

// Single source of truth: where slug ghost can be shown and applied.
export const SLUG_GHOST_ELIGIBLE_TYPES = new Set<ScreenplayElementType>([
  "action",
  "character",
])

export function findSlugSuggestion(text: string): { ghost: string; full: string } | null {
  if (!text) return null
  const lower = text.trimStart().toLowerCase()
  if (!lower) return null

  let best: { ghost: string; full: string } | null = null
  for (const suggestion of SLUG_SUGGESTIONS) {
    if (lower === suggestion.prefix && suggestion.completion.length > 0) {
      if (!best || suggestion.prefix.length > 0) {
        best = { ghost: suggestion.completion, full: suggestion.full }
      }
    }
  }
  return best
}

export function isSceneHeadingTriggerText(text: string): boolean {
  const lower = text.trimStart().toLowerCase()
  for (const trigger of SCENE_HEADING_FULL_TRIGGERS) {
    if (lower.startsWith(trigger)) {
      return true
    }
  }
  return false
}

export function isSlugGhostEligibleType(type: string): boolean {
  return SLUG_GHOST_ELIGIBLE_TYPES.has(type as ScreenplayElementType)
}
