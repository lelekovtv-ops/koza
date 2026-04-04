import { Editor, Node, Range, Element as SlateElement, Transforms } from "slate"
import type { ScreenplayElement } from "@/lib/screenplayTypes"
import { SCENE_PREFIX_RE, getCurrentElementEntry } from "./screenplayEditorUtils"

export const SCREENPLAY_TIME_OF_DAY_OPTIONS = [
  "DAY",
  "NIGHT",
  "MORNING",
  "EVENING",
  "DAWN",
  "DUSK",
  "CONTINUOUS",
  "LATER",
  "MOMENTS LATER",
  "ДЕНЬ",
  "НОЧЬ",
  "УТРО",
  "ВЕЧЕР",
  "РАССВЕТ",
  "ЗАКАТ",
  "НЕПРЕРЫВНО",
]

export type ScreenplayAutocompleteKind = "character" | "location" | "time"

export interface ScreenplayAutocompleteModel {
  kind: ScreenplayAutocompleteKind
  items: string[]
}

/** External Bible data for enriched autocomplete */
export interface BibleAutocompleteData {
  characterNames: string[]
  locationNames: string[]
}

function getSceneSeparator(text: string): " — " | " - " | null {
  const emIndex = text.lastIndexOf(" — ")
  const hyphenIndex = text.lastIndexOf(" - ")

  if (emIndex === -1 && hyphenIndex === -1) return null
  return emIndex > hyphenIndex ? " — " : " - "
}

function getKnownCharacterNames(editor: Editor, currentIndex: number, bible?: BibleAutocompleteData): string[] {
  const names = new Set<string>()

  // From screenplay blocks
  editor.children.forEach((node, index) => {
    if (!SlateElement.isElement(node)) return
    const el = node as ScreenplayElement
    if (index === currentIndex || el.type !== "character") return

    const candidate = Node.string(el)
      .trim()
      .toUpperCase()
      .replace(/\s*\((V\.?O\.?|O\.?S\.?|CONT'?D)\)\s*$/i, "")
      .replace(/\s*\(\d+(?:\s*(?:лет|years?|г\.?))?\)\s*$/i, "")

    if (candidate.length > 1) names.add(candidate)
  })

  // From Bible store
  if (bible?.characterNames) {
    for (const name of bible.characterNames) {
      const upper = name.toUpperCase()
      if (upper.length > 1) names.add(upper)
    }
  }

  return Array.from(names).sort()
}

function getKnownLocations(editor: Editor, currentIndex: number, bible?: BibleAutocompleteData): string[] {
  const locations = new Set<string>()

  // From screenplay blocks
  editor.children.forEach((node, index) => {
    if (!SlateElement.isElement(node)) return
    const el = node as ScreenplayElement
    if (index === currentIndex || el.type !== "scene_heading") return

    const heading = Node.string(el).trim().toUpperCase()
    if (!heading) return

    const prefixMatch = heading.match(SCENE_PREFIX_RE)
    if (!prefixMatch) return

    const afterPrefix = heading.slice(prefixMatch[0].length).trim()
    if (!afterPrefix) return

    const separator = getSceneSeparator(afterPrefix)
    const location = separator
      ? afterPrefix.slice(0, afterPrefix.lastIndexOf(separator)).trim()
      : afterPrefix

    if (location) locations.add(location)
  })

  // From Bible store
  if (bible?.locationNames) {
    for (const name of bible.locationNames) {
      const upper = name.toUpperCase()
      if (upper.length > 1) locations.add(upper)
    }
  }

  return Array.from(locations).sort()
}

export function computeAutocompleteModel(editor: Editor, bible?: BibleAutocompleteData): ScreenplayAutocompleteModel | null {
  const { selection } = editor
  if (!selection || !Range.isCollapsed(selection)) return null

  const entry = getCurrentElementEntry(editor)
  if (!entry) return null

  const [el, path] = entry
  if (selection.anchor.path.join(",") !== [...path, 0].join(",")) return null

  const text = Node.string(el).toUpperCase()
  const blockIndex = path[0]

  if (el.type === "character") {
    const partial = text.trim()
    if (!partial) return null
    const items = getKnownCharacterNames(editor, blockIndex, bible).filter(
      (name) => name.startsWith(partial) && name !== partial
    )
    return items.length ? { kind: "character", items: items.slice(0, 8) } : null
  }

  if (el.type !== "scene_heading") return null

  const prefixMatch = text.match(SCENE_PREFIX_RE)
  if (!prefixMatch) return null

  const afterPrefix = text.slice(prefixMatch[0].length).trim()
  const bodySeparator = getSceneSeparator(afterPrefix)

  if (bodySeparator) {
    const partial = afterPrefix.slice(afterPrefix.lastIndexOf(bodySeparator) + bodySeparator.length).trim()
    if (!partial) return null
    const items = SCREENPLAY_TIME_OF_DAY_OPTIONS.filter(
      (option) => option.startsWith(partial) && option !== partial
    )
    return items.length ? { kind: "time", items: items.slice(0, 10) } : null
  }

  const partialLocation = afterPrefix
  if (!partialLocation) return null
  const items = getKnownLocations(editor, blockIndex, bible).filter(
    (location) => location.startsWith(partialLocation) && location !== partialLocation
  )

  return items.length ? { kind: "location", items: items.slice(0, 8) } : null
}

function replaceCurrentBlockText(editor: Editor, path: number[], text: string): void {
  const currentText = Node.string(editor.children[path[0]])

  Transforms.select(editor, {
    anchor: { path: [...path, 0], offset: 0 },
    focus: { path: [...path, 0], offset: currentText.length },
  })
  Editor.insertText(editor, text)
}

export function applyAutocompleteChoice(
  editor: Editor,
  kind: ScreenplayAutocompleteKind,
  value: string
): boolean {
  const entry = getCurrentElementEntry(editor)
  if (!entry) return false

  const [el, path] = entry
  const text = Node.string(el).toUpperCase()

  if (kind === "character" && el.type === "character") {
    replaceCurrentBlockText(editor, path, value)
    return true
  }

  if (el.type !== "scene_heading") return false

  const prefixMatch = text.match(SCENE_PREFIX_RE)
  if (!prefixMatch) return false

  const prefixRaw = text.slice(0, prefixMatch[0].length).trimEnd()
  const body = text.slice(prefixMatch[0].length).trim()
  const bodySeparator = getSceneSeparator(body)

  const location = bodySeparator
    ? body.slice(0, body.lastIndexOf(bodySeparator)).trim()
    : body

  const time = bodySeparator
    ? body.slice(body.lastIndexOf(bodySeparator) + bodySeparator.length).trim()
    : ""

  if (kind === "location") {
    const next = `${prefixRaw} ${value}${time ? `${bodySeparator || " — "}${time}` : ""}`.trim()
    replaceCurrentBlockText(editor, path, next)
    return true
  }

  if (kind === "time") {
    const separator = bodySeparator || " — "
    const next = `${prefixRaw}${location ? ` ${location}` : ""}${separator}${value}`.trim()
    replaceCurrentBlockText(editor, path, next)
    return true
  }

  return false
}
