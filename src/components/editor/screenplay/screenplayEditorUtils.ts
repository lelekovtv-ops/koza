import { Editor, Node, Range, Element as SlateElement } from "slate"
import type { CustomText, ScreenplayElement } from "@/lib/screenplayTypes"
import {
  findSlugSuggestion,
  SCENE_PREFIX_RE,
  SLUG_PREFIX_NO_DOT_RE,
} from "./screenplaySlugBehavior"

export const AUTO_CAPS_TYPES = new Set<ScreenplayElement["type"]>([
  "scene_heading",
  "character",
  "transition",
])

export { SCENE_PREFIX_RE }

const CHARACTER_SUFFIX_RE = /\s*\((V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT'?D|ПРОД\.?)\)\s*$/i
const CHARACTER_AGE_RE = /\s*\(\d+(?:\s*(?:лет|years?|г\.?))?\)\s*$/i
const TRANSITION_RE = /^(FADE\s+(IN:?|OUT[\.::]?|TO\s+BLACK:?)|CUT\s+TO:|SMASH\s+CUT\s+TO:|MATCH\s+CUT\s+TO:|DISSOLVE\s+TO:|WIPE\s+TO:|JUMP\s+CUT\s+TO:|IRIS\s+(IN|OUT):?|ЗАТЕМНЕНИЕ:?|ПЕРЕХОД:?|НАПЛЫВ:?|ВЫТЕСНЕНИЕ:?|СТОП-КАДР:?|.+\s+TO:)$/i
export { findSlugSuggestion }

export function getCurrentElementEntry(editor: Editor): [ScreenplayElement, number[]] | null {
  const entry = Editor.above(editor, {
    match: (n) => SlateElement.isElement(n),
    mode: "lowest",
  })
  if (!entry) return null
  const [node, path] = entry
  return [node as ScreenplayElement, path]
}

export function getBlockTextStartOffset(editor: Editor, blockIndex: number): number {
  let start = 0
  for (let i = 0; i < blockIndex && i < editor.children.length; i++) {
    start += Node.string(editor.children[i]).length + 1
  }
  return start
}

export function findPreviousNonEmptyBlock(
  editor: Editor,
  currentBlockIndex: number
): { blockIndex: number; text: string } | null {
  for (let i = currentBlockIndex - 1; i >= 0; i--) {
    const node = editor.children[i]
    if (!SlateElement.isElement(node)) continue
    const text = Node.string(node)
    if (text.trim()) {
      return { blockIndex: i, text }
    }
  }

  return null
}

export function getSelectedText(editor: Editor): string {
  const { selection } = editor
  if (!selection || Range.isCollapsed(selection)) return ""
  const fragment = Editor.fragment(editor, selection)
  return fragment.map((node) => Node.string(node)).join("\n")
}

export function computeSelectionPositions(
  editor: Editor,
  selectedText: string,
  scenario: string
): { start: number; end: number; text: string } {
  const lowerSelected = selectedText.toLowerCase()
  const lowerScenario = scenario.toLowerCase()

  const { selection } = editor
  let approxStart = 0
  if (selection) {
    const anchor = Range.start(selection)
    for (let i = 0; i < anchor.path[0] && i < editor.children.length; i++) {
      approxStart += Node.string(editor.children[i]).length + 1
    }
    approxStart += anchor.offset
  }

  const searchFrom = Math.max(0, approxStart - 200)
  const idx = lowerScenario.indexOf(lowerSelected, searchFrom)

  if (idx >= 0) {
    return {
      start: idx,
      end: idx + selectedText.length,
      text: scenario.slice(idx, idx + selectedText.length),
    }
  }

  const fallback = lowerScenario.indexOf(lowerSelected)
  if (fallback >= 0) {
    return {
      start: fallback,
      end: fallback + selectedText.length,
      text: scenario.slice(fallback, fallback + selectedText.length),
    }
  }

  return { start: 0, end: selectedText.length, text: selectedText }
}

export function isMarkActive(editor: Editor, format: keyof Omit<CustomText, "text">): boolean {
  const marks = Editor.marks(editor) as CustomText | null
  return marks ? marks[format] === true : false
}

export function toggleMark(editor: Editor, format: keyof Omit<CustomText, "text">): void {
  if (isMarkActive(editor, format)) {
    Editor.removeMark(editor, format)
  } else {
    Editor.addMark(editor, format, true)
  }
}

export function isLikelyCharacterCue(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > 52) return false

  const normalized = trimmed.replace(CHARACTER_SUFFIX_RE, "").replace(CHARACTER_AGE_RE, "")
  if (!normalized || normalized.length < 2) return false

  if (SCENE_PREFIX_RE.test(normalized)) return false
  if (SLUG_PREFIX_NO_DOT_RE.test(normalized)) return false
  if (findSlugSuggestion(normalized)) return false
  if (TRANSITION_RE.test(normalized)) return false

  // Character cues are usually uppercase words with spaces and optional punctuation like apostrophes.
  if (!/[A-ZА-ЯЁ]/.test(normalized)) return false
  if (normalized !== normalized.toUpperCase()) return false
  if (/[:.!?]/.test(normalized)) return false

  return true
}

export function isLikelyTransitionCue(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  return TRANSITION_RE.test(trimmed.toUpperCase())
}
