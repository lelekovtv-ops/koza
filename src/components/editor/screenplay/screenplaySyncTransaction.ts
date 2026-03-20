import type { Block } from "@/lib/screenplayFormat"
import { exportBlocksToText } from "@/lib/screenplayFormat"
import type { ScreenplaySelectionAction } from "./screenplayAssistant"

export type ScreenplayTransactionSource =
  | "ai_floating"
  | "ai_shift_enter"
  | "manual_grammar"
  | "unknown"

export interface ScreenplayReplacementTransactionInput {
  blocks: Block[]
  payload: ScreenplaySelectionAction
  replacement: string
  source?: ScreenplayTransactionSource
}

export interface ScreenplayReplacementTransactionResult {
  blocks: Block[]
  scenario: string
  touchedBlockIds: string[]
}

type ResolvedPoint = {
  blockIndex: number
  offset: number
}

function normalizeReplacement(text: string): string {
  return text.replace(/\r\n/g, "\n")
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function resolvePoint(blocks: Block[], absoluteOffset: number, preferNextOnBoundary: boolean): ResolvedPoint {
  if (blocks.length === 0) return { blockIndex: 0, offset: 0 }

  let cursor = 0
  for (let i = 0; i < blocks.length; i++) {
    const textLen = blocks[i].text.length
    const blockStart = cursor
    const blockEnd = blockStart + textLen

    if (absoluteOffset < blockEnd || (absoluteOffset === blockEnd && !preferNextOnBoundary)) {
      return {
        blockIndex: i,
        offset: clamp(absoluteOffset - blockStart, 0, textLen),
      }
    }

    if (absoluteOffset === blockEnd && preferNextOnBoundary) {
      if (i < blocks.length - 1) {
        return { blockIndex: i + 1, offset: 0 }
      }
      return { blockIndex: i, offset: textLen }
    }

    const separatorOffset = blockEnd + 1
    if (absoluteOffset === separatorOffset) {
      if (i < blocks.length - 1) {
        return { blockIndex: i + 1, offset: 0 }
      }
      return { blockIndex: i, offset: textLen }
    }

    cursor = separatorOffset
  }

  const lastIndex = blocks.length - 1
  return {
    blockIndex: lastIndex,
    offset: blocks[lastIndex].text.length,
  }
}

function findRangeInScenario(
  scenario: string,
  selectedText: string,
  expectedStart: number,
  expectedEnd: number
): { start: number; end: number } | null {
  if (!selectedText) return null

  const start = clamp(expectedStart, 0, scenario.length)
  const end = clamp(expectedEnd, start, scenario.length)

  if (scenario.slice(start, end) === selectedText) {
    return { start, end }
  }

  const directIndex = scenario.indexOf(selectedText, Math.max(0, start - 200))
  if (directIndex >= 0) {
    return { start: directIndex, end: directIndex + selectedText.length }
  }

  const fallbackIndex = scenario.indexOf(selectedText)
  if (fallbackIndex >= 0) {
    return { start: fallbackIndex, end: fallbackIndex + selectedText.length }
  }

  const normalized = selectedText.trim()
  if (!normalized || normalized === selectedText) return null

  const normalizedIndex = scenario.indexOf(normalized)
  if (normalizedIndex >= 0) {
    return { start: normalizedIndex, end: normalizedIndex + normalized.length }
  }

  return null
}

function applyWithinSingleBlock(
  blocks: Block[],
  targetBlockIndex: number,
  startOffset: number,
  endOffset: number,
  replacement: string
): ScreenplayReplacementTransactionResult {
  const next = [...blocks]
  const target = next[targetBlockIndex]
  const safeStart = clamp(startOffset, 0, target.text.length)
  const safeEnd = clamp(endOffset, safeStart, target.text.length)

  next[targetBlockIndex] = {
    ...target,
    text: target.text.slice(0, safeStart) + replacement + target.text.slice(safeEnd),
  }

  return {
    blocks: next,
    scenario: exportBlocksToText(next),
    touchedBlockIds: [target.id],
  }
}

function applyWholeBlockReplacement(
  blocks: Block[],
  payload: ScreenplaySelectionAction,
  replacement: string
): ScreenplayReplacementTransactionResult {
  const idxById = payload.blockId ? blocks.findIndex((b) => b.id === payload.blockId) : -1
  const idx = idxById >= 0
    ? idxById
    : typeof payload.blockIndex === "number"
      ? payload.blockIndex
      : -1

  if (idx < 0 || idx >= blocks.length) {
    throw new Error("Target block was not found for block transaction.")
  }

  const nextText = normalizeReplacement(replacement).replace(/\n+/g, " ").trim()
  if (!nextText) {
    throw new Error("Replacement is empty after normalization.")
  }

  const next = [...blocks]
  next[idx] = { ...next[idx], text: nextText }
  return {
    blocks: next,
    scenario: exportBlocksToText(next),
    touchedBlockIds: [next[idx].id],
  }
}

export function applyScreenplayReplacementTransaction(
  input: ScreenplayReplacementTransactionInput
): ScreenplayReplacementTransactionResult {
  const { blocks, payload } = input
  const replacement = normalizeReplacement(input.replacement)

  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new Error("Cannot apply transaction: screenplay blocks are empty.")
  }

  if (!replacement.trim()) {
    throw new Error("Cannot apply transaction: replacement is empty.")
  }

  if (payload.targetMode === "block") {
    return applyWholeBlockReplacement(blocks, payload, replacement)
  }

  const scenario = exportBlocksToText(blocks)
  const range = findRangeInScenario(
    scenario,
    payload.selectedText,
    payload.selectionStart,
    payload.selectionEnd
  )

  if (!range) {
    throw new Error("Selected fragment was not found in latest screenplay blocks.")
  }

  const startPoint = resolvePoint(blocks, range.start, false)
  const endPoint = resolvePoint(blocks, range.end, true)

  if (startPoint.blockIndex !== endPoint.blockIndex) {
    throw new Error("Transaction only supports single-block replacements.")
  }

  return applyWithinSingleBlock(
    blocks,
    startPoint.blockIndex,
    startPoint.offset,
    endPoint.offset,
    replacement
  )
}
