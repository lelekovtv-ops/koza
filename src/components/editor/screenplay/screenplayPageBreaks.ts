/**
 * KOZA Screenplay Page Break Engine
 *
 * Industry-standard page break rules (Final Draft / Movie Magic compatible):
 *
 * 1. KEEP-TOGETHER: CHARACTER + first line of DIALOGUE/PARENTHETICAL never split
 * 2. ORPHAN HEADINGS: scene_heading never last element on a page
 * 3. ORPHAN CHARACTER: character cue never last element on a page
 * 4. MORE/CONT'D: when dialogue splits across pages, add (MORE) and CHARACTER (CONT'D)
 * 5. WIDOW LINES: at least 2 lines of action/dialogue must stay on each side of a break
 * 6. TRANSITIONS: keep with the following scene heading if possible
 */

import { Node, Element as SlateElement } from "slate"
import type { ScreenplayElement, ScreenplayElementType } from "@/lib/screenplayTypes"
import {
  SCREENPLAY_PAGE_HEIGHT_PX,
  SCREENPLAY_PAGE_GAP_PX,
  SCREENPLAY_PAGE_PADDING_TOP_PX,
  SCREENPLAY_PAGE_PADDING_LEFT_PX,
  SCREENPLAY_PAGE_PADDING_RIGHT_PX,
  SCREENPLAY_PAGE_WIDTH_PX,
  SCREENPLAY_TEXT_AREA_HEIGHT_PX,
  SCREENPLAY_LINE_HEIGHT_PX,
  SCREENPLAY_FONT_SIZE_PX,
  SCREENPLAY_SCENE_HEADING_MARGIN_TOP_PX,
  SCREENPLAY_CHARACTER_MARGIN_TOP_PX,
  SCREENPLAY_TRANSITION_MARGIN_TOP_PX,
  SCREENPLAY_ACTION_AFTER_ACTION_MARGIN_TOP_PX,
  SCREENPLAY_ACTION_AFTER_SCENE_HEADING_MARGIN_TOP_PX,
  SCREENPLAY_CHARACTER_INDENT_CH,
  SCREENPLAY_DIALOGUE_INDENT_LEFT_CH,
  SCREENPLAY_DIALOGUE_INDENT_RIGHT_CH,
  SCREENPLAY_PARENTHETICAL_INDENT_CH,
} from "./screenplayLayoutConstants"

// ─── Types ───

export interface PageBreakInfo {
  /** Extra margin-top to push element to next page (px) */
  margins: Map<number, number>
  /** Total page count */
  pageCount: number
  /** Indices of elements that need (MORE) after them */
  moreAfter: Set<number>
  /** Indices of elements that need CHARACTER (CONT'D) before them */
  contdBefore: Map<number, string>
}

// ─── Constants ───

const CONTENT_WIDTH = SCREENPLAY_PAGE_WIDTH_PX - SCREENPLAY_PAGE_PADDING_LEFT_PX - SCREENPLAY_PAGE_PADDING_RIGHT_PX
const CHARS_PER_LINE = Math.max(20, Math.floor(CONTENT_WIDTH / (SCREENPLAY_FONT_SIZE_PX * 0.6)))
const LINE_H = SCREENPLAY_LINE_HEIGHT_PX
const PAGE_CONTENT_H = SCREENPLAY_TEXT_AREA_HEIGHT_PX

/** Minimum lines that must remain on a page side when splitting (widow/orphan) */
const MIN_LINES_ON_SIDE = 2

// ─── Helpers ───

function getMarginTop(type: ScreenplayElementType, prevType: ScreenplayElementType | null): number {
  if (type === "scene_heading") return SCREENPLAY_SCENE_HEADING_MARGIN_TOP_PX
  if (type === "character") return SCREENPLAY_CHARACTER_MARGIN_TOP_PX
  if (type === "transition") return SCREENPLAY_TRANSITION_MARGIN_TOP_PX
  if (type === "action") {
    if (prevType === "scene_heading") return SCREENPLAY_ACTION_AFTER_SCENE_HEADING_MARGIN_TOP_PX
    if (prevType === "action") return SCREENPLAY_ACTION_AFTER_ACTION_MARGIN_TOP_PX
  }
  return 0
}

function getAvailChars(type: ScreenplayElementType): number {
  let avail = CHARS_PER_LINE
  if (type === "character") avail -= SCREENPLAY_CHARACTER_INDENT_CH
  else if (type === "dialogue") avail -= SCREENPLAY_DIALOGUE_INDENT_LEFT_CH + SCREENPLAY_DIALOGUE_INDENT_RIGHT_CH
  else if (type === "parenthetical") avail -= SCREENPLAY_PARENTHETICAL_INDENT_CH
  return Math.max(8, avail)
}

function estimateLines(text: string, type: ScreenplayElementType): number {
  const t = text.trim()
  if (!t) return 1
  return Math.max(1, Math.ceil(t.length / getAvailChars(type)))
}

function pageContentStart(pageIdx: number): number {
  return pageIdx * (SCREENPLAY_PAGE_HEIGHT_PX + SCREENPLAY_PAGE_GAP_PX) + SCREENPLAY_PAGE_PADDING_TOP_PX
}

function pageContentEnd(pageIdx: number): number {
  return pageContentStart(pageIdx) + PAGE_CONTENT_H
}

/** Check if a type is part of a dialogue block (character/parenthetical/dialogue) */
function isDialogueGroup(type: ScreenplayElementType): boolean {
  return type === "character" || type === "parenthetical" || type === "dialogue"
}

/** Find the character name for a dialogue group starting from any index in the group */
function findGroupCharacterName(children: Node[], fromIdx: number): string {
  for (let i = fromIdx; i >= 0; i--) {
    const node = children[i]
    if (!SlateElement.isElement(node)) continue
    const el = node as ScreenplayElement
    if (el.type === "character") return Node.string(el).trim()
    if (!isDialogueGroup(el.type)) break
  }
  return ""
}

// ─── Main Engine ───

export function calculatePageBreaks(children: Node[]): PageBreakInfo {
  const margins = new Map<number, number>()
  const moreAfter = new Set<number>()
  const contdBefore = new Map<number, string>()

  if (children.length === 0) {
    return { margins, pageCount: 1, moreAfter, contdBefore }
  }

  // Pre-calculate element info
  const elems: { type: ScreenplayElementType; lines: number; marginTop: number }[] = []
  let prevType: ScreenplayElementType | null = null

  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (!SlateElement.isElement(node)) {
      elems.push({ type: "action", lines: 1, marginTop: 0 })
      continue
    }
    const el = node as ScreenplayElement
    const text = Node.string(el)
    const type = el.type
    const marginTop = i === 0 ? 0 : getMarginTop(type, prevType)
    const lines = estimateLines(text, type)
    elems.push({ type, lines, marginTop })
    prevType = type
  }

  // Layout pass
  let pageIdx = 0
  let y = SCREENPLAY_PAGE_PADDING_TOP_PX // absolute Y position

  for (let i = 0; i < elems.length; i++) {
    const elem = elems[i]
    const elemH = elem.lines * LINE_H
    const elemTop = y + elem.marginTop
    const elemBottom = elemTop + elemH
    const curPageEnd = pageContentEnd(pageIdx)

    // ──── RULE 1: Scene heading orphan protection ────
    // Scene heading should never be the last element on a page — check BEFORE fit test.
    if (elem.type === "scene_heading" && elemBottom <= curPageEnd) {
      // Heading fits, but is it the last thing before page runs out?
      const nextElem = elems[i + 1]
      if (nextElem) {
        const nextTop = elemBottom + getMarginTop(nextElem.type, elem.type)
        const nextBottom = nextTop + nextElem.lines * LINE_H
        if (nextBottom > curPageEnd) {
          // Next element won't fit — heading would be orphaned. Push heading to next page.
          pushToNextPage(i)
          continue
        }
      }
    }

    // ──── RULE 2: Character keep-together (check BEFORE fit test) ────
    // CHARACTER must bring at least the first line of dialogue/parenthetical with it.
    if (elem.type === "character" && elemBottom <= curPageEnd) {
      const nextElem = elems[i + 1]
      if (nextElem && isDialogueGroup(nextElem.type)) {
        const firstDialogueLine = Math.min(nextElem.lines, 1) * LINE_H
        if (elemBottom + firstDialogueLine > curPageEnd) {
          pushToNextPage(i)
          continue
        }
      }
    }

    // ──── RULE 3: Transition keep-with-next ────
    if (elem.type === "transition" && elemBottom <= curPageEnd) {
      const nextElem = elems[i + 1]
      if (nextElem && nextElem.type === "scene_heading") {
        const nextBottom = elemBottom + getMarginTop(nextElem.type, elem.type) + nextElem.lines * LINE_H
        if (nextBottom > curPageEnd) {
          pushToNextPage(i)
          continue
        }
      }
    }

    // Element fits on current page (no keep-together issue)
    if (elemBottom <= curPageEnd) {
      y = elemBottom
      continue
    }

    // Element doesn't fit — need a page break decision
    const spaceLeft = curPageEnd - elemTop
    const linesOnThisPage = Math.floor(Math.max(0, spaceLeft) / LINE_H)

    // Scene heading / transition / character that doesn't fit — push
    if (elem.type === "scene_heading" || elem.type === "transition" || elem.type === "character") {
      pushToNextPage(i)
      continue
    }

    // ──── RULE 4: Dialogue/action split with widow protection ────
    if ((elem.type === "dialogue" || elem.type === "action") && elem.lines > 1) {
      if (linesOnThisPage >= MIN_LINES_ON_SIDE && (elem.lines - linesOnThisPage) >= MIN_LINES_ON_SIDE) {
        // Can split: enough lines on both sides
        // For dialogue — add (MORE) / (CONT'D)
        if (elem.type === "dialogue") {
          const charName = findGroupCharacterName(children, i)
          if (charName) {
            moreAfter.add(i)
            contdBefore.set(i, charName)
          }
        }
        // Let element overflow — it will naturally flow across page boundary
        y = elemBottom
        // Advance page index
        while (y > pageContentEnd(pageIdx)) pageIdx++
        continue
      }
    }

    // ──── RULE 5: Parenthetical — keep with character ────
    if (elem.type === "parenthetical") {
      // Look back to find character — push character to next page if needed
      if (i > 0 && elems[i - 1].type === "character") {
        // Character was just placed — push both
        pushToNextPage(i - 1)
        // Recalculate i position
        y = pageContentStart(pageIdx) + elems[i - 1].lines * LINE_H
        y += elemH
        continue
      }
      pushToNextPage(i)
      continue
    }

    // ──── DEFAULT: Push to next page ────
    pushToNextPage(i)

    // ──── Helper ────
    function pushToNextPage(idx: number) {
      pageIdx++
      const newTop = pageContentStart(pageIdx)
      margins.set(idx, newTop - (y + elems[idx].marginTop))
      y = newTop + elems[idx].lines * LINE_H
    }
  }

  // Advance to final page
  while (y > pageContentEnd(pageIdx)) pageIdx++

  return {
    margins,
    pageCount: pageIdx + 1,
    moreAfter,
    contdBefore,
  }
}
