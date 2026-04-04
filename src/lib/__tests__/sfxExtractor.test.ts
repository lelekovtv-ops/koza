import { describe, it, expect } from "vitest"
import { extractSfxHints } from "@/lib/sfxExtractor"
import type { Block } from "@/lib/screenplayFormat"

const makeBlock = (id: string, type: Block["type"], text: string): Block => ({ id, type, text })

describe("extractSfxHints", () => {
  it("finds explosion in action block", () => {
    const blocks = [makeBlock("b1", "action", "Огромный взрыв сотрясает здание.")]
    const hints = extractSfxHints(blocks)
    expect(hints.length).toBeGreaterThanOrEqual(1)
    expect(hints[0].description).toBe("Explosion")
    expect(hints[0].blockId).toBe("b1")
    expect(hints[0].confidence).toBe("high")
  })

  it("finds door knock", () => {
    const blocks = [makeBlock("b1", "action", "Стук в дверь. Тишина.")]
    const hints = extractSfxHints(blocks)
    const doorHint = hints.find((h) => h.description.includes("Door"))
    expect(doorHint).toBeDefined()
  })

  it("finds gunshot", () => {
    const blocks = [makeBlock("b1", "action", "A gunshot rings out across the valley.")]
    const hints = extractSfxHints(blocks)
    expect(hints.some((h) => h.description === "Gunshot")).toBe(true)
  })

  it("finds rain", () => {
    const blocks = [makeBlock("b1", "action", "За окном идёт дождь.")]
    const hints = extractSfxHints(blocks)
    expect(hints.some((h) => h.description === "Rain")).toBe(true)
  })

  it("finds glass breaking", () => {
    const blocks = [makeBlock("b1", "action", "Стекло разбивается вдребезги.")]
    const hints = extractSfxHints(blocks)
    expect(hints.some((h) => h.description === "Glass breaking")).toBe(true)
  })

  it("finds phone ring", () => {
    const blocks = [makeBlock("b1", "action", "Телефон звонит не переставая.")]
    const hints = extractSfxHints(blocks)
    expect(hints.some((h) => h.description === "Phone ring")).toBe(true)
  })

  it("ignores dialogue blocks", () => {
    const blocks = [makeBlock("b1", "dialogue", "Был такой взрыв!")]
    const hints = extractSfxHints(blocks)
    expect(hints.length).toBe(0)
  })

  it("ignores scene_heading blocks", () => {
    const blocks = [makeBlock("b1", "scene_heading", "INT. EXPLOSION ROOM - NIGHT")]
    const hints = extractSfxHints(blocks)
    expect(hints.length).toBe(0)
  })

  it("finds multiple SFX in one block", () => {
    const blocks = [makeBlock("b1", "action", "Взрыв. Стёкла разбиваются. Сирена воет.")]
    const hints = extractSfxHints(blocks)
    expect(hints.length).toBeGreaterThanOrEqual(3)
  })

  it("returns hints sorted by suggestedStartMs", () => {
    const blocks = [
      makeBlock("b1", "action", "Дверь хлопает."),
      makeBlock("b2", "action", "Через минуту — выстрел."),
    ]
    const hints = extractSfxHints(blocks)
    for (let i = 1; i < hints.length; i++) {
      expect(hints[i].suggestedStartMs).toBeGreaterThanOrEqual(hints[i - 1].suggestedStartMs)
    }
  })

  it("finds explicit SFX: cue", () => {
    const blocks = [makeBlock("b1", "action", "SFX: тяжёлые шаги по металлу")]
    const hints = extractSfxHints(blocks)
    expect(hints.length).toBeGreaterThanOrEqual(1)
    expect(hints[0].description).toContain("тяжёлые шаги")
    expect(hints[0].confidence).toBe("high")
  })

  it("finds explicit звуки cue in Russian", () => {
    const blocks = [makeBlock("b1", "action", "Звуки капающей воды")]
    const hints = extractSfxHints(blocks)
    expect(hints.length).toBeGreaterThanOrEqual(1)
    expect(hints[0].description).toContain("капающей воды")
  })

  it("returns empty for blocks with no SFX keywords", () => {
    const blocks = [makeBlock("b1", "action", "Иван садится за стол и открывает книгу.")]
    const hints = extractSfxHints(blocks)
    expect(hints.length).toBe(0)
  })

  it("handles empty blocks array", () => {
    expect(extractSfxHints([])).toEqual([])
  })
})
