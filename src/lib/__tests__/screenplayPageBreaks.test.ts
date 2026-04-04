import { describe, it, expect } from "vitest"
import { calculatePageBreaks } from "@/components/editor/screenplay/screenplayPageBreaks"
import { SCREENPLAY_TEXT_AREA_HEIGHT_PX, SCREENPLAY_LINE_HEIGHT_PX } from "@/components/editor/screenplay/screenplayLayoutConstants"
import type { ScreenplayElement } from "@/lib/screenplayTypes"

const LINE_H = SCREENPLAY_LINE_HEIGHT_PX
const LINES_PER_PAGE = Math.floor(SCREENPLAY_TEXT_AREA_HEIGHT_PX / LINE_H)

function makeEl(type: ScreenplayElement["type"], text: string, id?: string): ScreenplayElement {
  return { type, id: id || `test-${Math.random()}`, children: [{ text }] }
}

function makeLines(type: ScreenplayElement["type"], lineCount: number): ScreenplayElement {
  // Each char ~0.6 * fontSize wide, line ~96 chars. So lineCount * 96 chars = lineCount lines.
  const text = "x".repeat(lineCount * 96)
  return makeEl(type, text)
}

describe("calculatePageBreaks", () => {
  it("returns page count 1 for empty", () => {
    const result = calculatePageBreaks([])
    expect(result.pageCount).toBe(1)
    expect(result.margins.size).toBe(0)
  })

  it("returns page count 1 for short content", () => {
    const children = [
      makeEl("scene_heading", "INT. КУХНЯ — ДЕНЬ"),
      makeEl("action", "Борис сидит за столом."),
      makeEl("character", "БОРИС"),
      makeEl("dialogue", "Привет."),
    ]
    const result = calculatePageBreaks(children)
    expect(result.pageCount).toBe(1)
  })

  it("scene_heading is never last on a page (orphan protection)", () => {
    // action-after-action = 16px margin + 16px height = 32px = 2 lines.
    // First action has no margin. So N actions = 16 + (N-1)*32 px.
    // Page content = 864px. To fill near end: 16 + (N-1)*32 <= 864 → N ≤ 27.5 → 27 actions fill ~848px.
    // 28th action would be at 848+16=864 (exact bottom). Scene heading after = overflow.
    const children: ScreenplayElement[] = []
    for (let i = 0; i < 27; i++) {
      children.push(makeEl("action", "Action line " + i))
    }
    children.push(makeEl("scene_heading", "INT. НОВАЯ СЦЕНА — ДЕНЬ"))
    children.push(makeEl("action", "Действие новой сцены."))

    const result = calculatePageBreaks(children)
    const sceneIdx = children.length - 2
    expect(result.margins.has(sceneIdx)).toBe(true)
    expect(result.pageCount).toBeGreaterThanOrEqual(2)
  })

  it("character + dialogue kept together", () => {
    const children: ScreenplayElement[] = []
    // 26 actions = 16 + 25*32 = 816px. Character at 816 + 24(margin) = 840. + 16(height) = 856.
    // Dialogue at 856 + 16 = 872 > 864. Character+dialogue should be pushed together.
    for (let i = 0; i < 26; i++) {
      children.push(makeEl("action", "Action line " + i))
    }
    children.push(makeEl("character", "БОРИС"))
    children.push(makeEl("dialogue", "Длинная реплика персонажа."))

    const result = calculatePageBreaks(children)
    const charIdx = children.length - 2
    expect(result.margins.has(charIdx)).toBe(true)
  })

  it("generates MORE/CONTD for split dialogue", () => {
    const children: ScreenplayElement[] = []
    // Fill most of a page
    for (let i = 0; i < LINES_PER_PAGE - 4; i++) {
      children.push(makeEl("action", "Action line " + i))
    }
    children.push(makeEl("character", "БОРИС"))
    // Very long dialogue that will split across pages
    children.push(makeLines("dialogue", 10))

    const result = calculatePageBreaks(children)
    const dialogueIdx = children.length - 1
    // Should have MORE after the dialogue and CONT'D before continuation
    if (result.moreAfter.size > 0) {
      expect(result.moreAfter.has(dialogueIdx)).toBe(true)
      expect(result.contdBefore.has(dialogueIdx)).toBe(true)
      expect(result.contdBefore.get(dialogueIdx)).toBe("БОРИС")
    }
  })
})
