import { Editor, Node, Point, Range } from "slate"
import { DEFAULT_TEXT_MODEL_ID } from "@/lib/models"
import {
  computeSelectionPositions,
  findPreviousNonEmptyBlock,
  getBlockTextStartOffset,
  getCurrentElementEntry,
} from "./screenplayEditorUtils"
import { buildScreenplayAssistantSystemPrompt } from "./screenplayAssistantRules"

export type ScreenplayAssistantAction = "rewrite" | "expand" | "shorten" | "fix_grammar"

export interface ScreenplaySelectionAction {
  action: ScreenplayAssistantAction | string
  selectedText: string
  selectionStart: number
  selectionEnd: number
  blockType?: string
  targetMode?: "selection" | "block"
  blockId?: string
  blockIndex?: number
  blockTextSnapshot?: string
}

const SCREENPLAY_ASSISTANT_SYSTEM_PROMPT = buildScreenplayAssistantSystemPrompt()

const SCREENPLAY_ACTION_PROMPTS: Record<string, string> = {
  rewrite: "Rewrite the selection to sound stronger and more cinematic while preserving intent.",
  expand: "Expand the selection with concrete and relevant detail while preserving tone and continuity.",
  shorten: "Shorten the selection while preserving key meaning, tone, and screenplay style.",
  fix_grammar: "Fix grammar, punctuation, and wording while preserving original meaning and style.",
}

function getBlockTypeAtIndex(editor: Editor, blockIndex: number): string | undefined {
  const node = editor.children[blockIndex] as { type?: unknown } | undefined
  return typeof node?.type === "string" ? node.type : undefined
}

function getBlockIdAtIndex(editor: Editor, blockIndex: number): string | undefined {
  const node = editor.children[blockIndex] as { id?: unknown } | undefined
  return typeof node?.id === "string" ? node.id : undefined
}

function findNearestOccurrence(
  sourceText: string,
  query: string,
  expectedStart: number,
  ignoreCase: boolean
): number {
  if (!query) return -1

  const haystack = ignoreCase ? sourceText.toLowerCase() : sourceText
  const needle = ignoreCase ? query.toLowerCase() : query

  const matches: number[] = []
  let from = 0

  while (from <= haystack.length) {
    const idx = haystack.indexOf(needle, from)
    if (idx === -1) break
    matches.push(idx)
    from = idx + 1
  }

  if (matches.length === 0) return -1

  let best = matches[0]
  let bestDistance = Math.abs(best - expectedStart)
  for (let i = 1; i < matches.length; i++) {
    const distance = Math.abs(matches[i] - expectedStart)
    if (distance < bestDistance) {
      best = matches[i]
      bestDistance = distance
    }
  }

  return best
}

function getBlockSemanticsGuidance(blockType?: string): string[] {
  const base = [
    "Preserve screenplay block role and formatting.",
    "Do not convert Action/Dialogue/Character/Parenthetical/Transition/Scene Heading into another role.",
  ]

  if (!blockType) return base

  switch (blockType) {
    case "character":
      return [
        ...base,
        "Keep character cue uppercase.",
        "Preserve suffixes like (V.O.), (O.S.), (CONT'D) when present.",
      ]
    case "dialogue":
      return [
        ...base,
        "Keep spoken-line style and character voice.",
        "Do not rewrite into action narration.",
      ]
    case "parenthetical":
      return [
        ...base,
        "Keep concise parenthetical intent (emotion/beat/voice direction).",
        "Preserve parenthetical form with parentheses.",
      ]
    case "action":
      return [
        ...base,
        "Keep action line style in present tense.",
      ]
    case "transition":
      return [
        ...base,
        "Keep transition style uppercase and screenplay-friendly (e.g. CUT TO:).",
      ]
    case "scene_heading":
      return [
        ...base,
        "Keep slugline structure (INT./EXT., location, time-of-day).",
      ]
    default:
      return base
  }
}

function sanitizeAssistantOutput(raw: string): string {
  return raw
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim()
    .replace(/^"([\s\S]*)"$/, "$1")
    .replace(/^'([\s\S]*)'$/, "$1")
    .trim()
}

function isLikelyCommentaryOutput(output: string): boolean {
  const lower = output.toLowerCase()
  const markers = [
    "i notice",
    "selected fragment",
    "context provided",
    "cannot",
    "i can't",
    "please provide",
    "corrected version would be",
    "doesn't appear",
    "while preserving",
    "in this context",
  ]

  const hitCount = markers.reduce((sum, marker) => (lower.includes(marker) ? sum + 1 : sum), 0)
  if (hitCount >= 2) return true

  // Commentary responses are usually long multi-sentence prose.
  const sentenceCount = (output.match(/[.!?]\s+/g) || []).length
  if (sentenceCount >= 3 && output.length > 220) return true

  return false
}

export function getAssistantStatus(action: string): string {
  return action === "fix_grammar" ? "Fixing grammar..." : "Applying AI edit..."
}

export function buildFloatingSelectionAction(
  editor: Editor,
  scenario: string,
  action: string,
  selectedText: string
): ScreenplaySelectionAction | null {
  if (!selectedText.trim()) return null
  const pos = computeSelectionPositions(editor, selectedText, scenario)
  const currentEntry = getCurrentElementEntry(editor)
  const blockType = currentEntry?.[0]?.type
  return {
    action,
    selectedText: pos.text,
    selectionStart: pos.start,
    selectionEnd: pos.end,
    blockType,
    targetMode: "selection",
  }
}

export function buildShiftEnterGrammarAction(editor: Editor): ScreenplaySelectionAction | null {
  const entry = getCurrentElementEntry(editor)
  if (!entry) return null

  const [currentEl, currentPath] = entry
  const currentBlockIndex = currentPath[0]
  const currentText = Node.string(currentEl)

  // Target: current block if it has text, otherwise look back for previous non-empty block.
  const target = currentText.trim()
    ? { blockIndex: currentBlockIndex, text: currentText }
    : findPreviousNonEmptyBlock(editor, currentBlockIndex)

  if (!target) return null

  const selectionStart = getBlockTextStartOffset(editor, target.blockIndex)
  const blockType = getBlockTypeAtIndex(editor, target.blockIndex)
  const blockId = getBlockIdAtIndex(editor, target.blockIndex)
  return {
    action: "fix_grammar",
    selectedText: target.text,
    selectionStart,
    selectionEnd: selectionStart + target.text.length,
    blockType,
    targetMode: "block",
    blockId,
    blockIndex: target.blockIndex,
    blockTextSnapshot: target.text,
  }
}

export function resolveSelectionRange(
  text: string,
  start: number,
  end: number,
  selectedText: string
): { start: number; end: number } | null {
  if (!selectedText) return null

  const expectedStart = Math.max(0, start)

  if (start >= 0 && end >= start && end <= text.length && text.slice(start, end) === selectedText) {
    return { start, end }
  }

  const normalized = selectedText.trim()

  const queries = normalized && normalized !== selectedText
    ? [selectedText, normalized]
    : [selectedText]

  for (const query of queries) {
    const idx = findNearestOccurrence(text, query, expectedStart, false)
    if (idx >= 0) {
      return { start: idx, end: idx + query.length }
    }
  }

  for (const query of queries) {
    const idx = findNearestOccurrence(text, query, expectedStart, true)
    if (idx >= 0) {
      return { start: idx, end: idx + query.length }
    }
  }

  return null
}

export async function requestScreenplayAssistantReplacement(
  scenario: string,
  payload: ScreenplaySelectionAction
): Promise<string> {
  const range = payload.targetMode === "block"
    ? {
        start: Math.max(0, Math.min(payload.selectionStart, scenario.length)),
        end: Math.max(0, Math.min(payload.selectionEnd, scenario.length)),
      }
    : resolveSelectionRange(
        scenario,
        payload.selectionStart,
        payload.selectionEnd,
        payload.selectedText
      )

  if (!range && payload.targetMode !== "block") {
    throw new Error("Selected fragment was not found in the latest scenario.")
  }

  const effectiveRange = range ?? {
    start: Math.max(0, Math.min(payload.selectionStart, scenario.length)),
    end: Math.max(0, Math.min(payload.selectionEnd, scenario.length)),
  }

  const contextStart = Math.max(0, effectiveRange.start - 1200)
  const contextEnd = Math.min(scenario.length, effectiveRange.end + 1200)
  const contextSnippet = scenario.slice(contextStart, contextEnd)
  const actionInstruction = SCREENPLAY_ACTION_PROMPTS[payload.action] || SCREENPLAY_ACTION_PROMPTS.rewrite
  const semanticsGuidance = getBlockSemanticsGuidance(payload.blockType)

  const userPrompt = [
    `Task: ${actionInstruction}`,
    payload.blockType ? `Block type: ${payload.blockType}` : "Block type: unknown",
    "Apply the edit ONLY to the selected fragment.",
    "Keep language and screenplay formatting consistent with surrounding text.",
    "Return only replacement text. Do not explain.",
    ...semanticsGuidance,
    "",
    "Context:",
    contextSnippet,
    "",
    "Selected fragment:",
    payload.selectedText,
  ].join("\n")

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modelId: DEFAULT_TEXT_MODEL_ID,
      system: SCREENPLAY_ASSISTANT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(errorText || "Failed to get AI rewrite.")
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error("AI response body is empty.")

  const decoder = new TextDecoder()
  let rewritten = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    rewritten += decoder.decode(value, { stream: true })
  }

  const replacement = sanitizeAssistantOutput(rewritten)
  if (!replacement) {
    throw new Error("AI returned an empty result.")
  }

  if (isLikelyCommentaryOutput(replacement)) {
    throw new Error("AI returned commentary instead of replacement text.")
  }

  return replacement
}
