import { describe, it, expect } from "vitest"
import { estimateBlockDurationMs, enrichBlocks } from "@/lib/blockEnricher"
import type { Block } from "@/lib/screenplayFormat"
import type { Scene } from "@/lib/sceneParser"

describe("estimateBlockDurationMs", () => {
  it("scene_heading = 2000ms", () => {
    expect(estimateBlockDurationMs("scene_heading", "INT. OFFICE - DAY")).toBe(2000)
  })

  it("transition = 1200ms", () => {
    expect(estimateBlockDurationMs("transition", "CUT TO:")).toBe(1200)
  })

  it("character = 200ms", () => {
    expect(estimateBlockDurationMs("character", "JOHN")).toBe(200)
  })

  it("parenthetical = 500ms", () => {
    expect(estimateBlockDurationMs("parenthetical", "(beat)")).toBe(500)
  })

  it("dialogue duration scales with word count", () => {
    const short = estimateBlockDurationMs("dialogue", "Hello")
    const long = estimateBlockDurationMs("dialogue", "This is a much longer line of dialogue that should take considerably more time to speak aloud")
    expect(long).toBeGreaterThan(short)
  })

  it("action duration min 2000ms", () => {
    expect(estimateBlockDurationMs("action", "He looks.")).toBeGreaterThanOrEqual(2000)
  })

  it("action duration max 15000ms", () => {
    const longAction = "word ".repeat(500)
    expect(estimateBlockDurationMs("action", longAction)).toBeLessThanOrEqual(15000)
  })
})

describe("enrichBlocks", () => {
  const makeBlock = (id: string, type: Block["type"], text: string, extra?: Partial<Block>): Block => ({
    id, type, text, ...extra,
  })

  const scenes: Scene[] = [{
    id: "s1",
    index: 1,
    title: "INT. OFFICE - DAY",
    headingBlockId: "b1",
    blockIds: ["b1", "b2", "b3"],
    color: "#fff",
    estimatedDurationMs: 5000,
  }]

  it("fills durationMs on blocks that don't have it", () => {
    const blocks: Block[] = [
      makeBlock("b1", "scene_heading", "INT. OFFICE - DAY"),
      makeBlock("b2", "action", "John enters the room."),
      makeBlock("b3", "dialogue", "Hello there."),
    ]

    const enriched = enrichBlocks(blocks, scenes)
    expect(enriched[0].durationMs).toBe(2000)
    expect(enriched[0].durationSource).toBe("auto")
    expect(enriched[1].durationMs).toBeGreaterThan(0)
    expect(enriched[2].durationMs).toBeGreaterThan(0)
  })

  it("does NOT overwrite manual durationMs", () => {
    const blocks: Block[] = [
      makeBlock("b1", "scene_heading", "INT. OFFICE - DAY", { durationMs: 5000, durationSource: "manual" }),
    ]

    const enriched = enrichBlocks(blocks, scenes)
    expect(enriched[0].durationMs).toBe(5000)
  })

  it("returns same reference for unchanged blocks", () => {
    const blocks: Block[] = [
      makeBlock("b1", "action", "Text", { durationMs: 3000, durationSource: "auto" }),
    ]

    const enriched = enrichBlocks(blocks, scenes)
    expect(enriched[0]).toBe(blocks[0]) // same object reference
  })
})
