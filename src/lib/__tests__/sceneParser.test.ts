import { describe, it, expect } from "vitest"
import {
  parseScenes,
  getSceneForBlock,
  getSceneByIndex,
  getBlockSceneIndex,
  parseScenesToShots,
} from "@/lib/sceneParser"
import type { Block } from "@/lib/screenplayFormat"

function block(type: Block["type"], text: string, id: string): Block {
  return { id, type, text }
}

// ── parseScenes ──

describe("parseScenes", () => {
  it("creates scenes from scene headings", () => {
    const blocks = [
      block("scene_heading", "INT. КУХНЯ — ДЕНЬ", "h1"),
      block("action", "Действие.", "a1"),
      block("scene_heading", "EXT. ДВОР — НОЧЬ", "h2"),
      block("action", "Другое действие.", "a2"),
    ]
    const scenes = parseScenes(blocks)
    expect(scenes).toHaveLength(2)
    expect(scenes[0].index).toBe(1)
    expect(scenes[0].title).toBe("INT. КУХНЯ — ДЕНЬ")
    expect(scenes[0].blockIds).toContain("h1")
    expect(scenes[0].blockIds).toContain("a1")
    expect(scenes[1].index).toBe(2)
    expect(scenes[1].blockIds).toContain("h2")
    expect(scenes[1].blockIds).toContain("a2")
  })

  it("creates scene 0 for blocks before first heading", () => {
    const blocks = [
      block("action", "Пролог.", "a0"),
      block("scene_heading", "INT. КУХНЯ — ДЕНЬ", "h1"),
      block("action", "Действие.", "a1"),
    ]
    const scenes = parseScenes(blocks)
    expect(scenes).toHaveLength(2)
    expect(scenes[0].index).toBe(0)
    expect(scenes[0].title).toBe("UNTITLED SCENE")
    expect(scenes[0].blockIds).toContain("a0")
  })

  it("handles empty blocks array", () => {
    expect(parseScenes([])).toHaveLength(0)
  })

  it("assigns cycling colors", () => {
    const blocks = [
      block("scene_heading", "INT. A", "h1"),
      block("scene_heading", "INT. B", "h2"),
      block("scene_heading", "INT. C", "h3"),
    ]
    const scenes = parseScenes(blocks)
    // All should have colors, and they should differ
    expect(scenes[0].color).toBeTruthy()
    expect(scenes[0].color).not.toBe(scenes[1].color)
  })

  it("includes all block types within a scene", () => {
    const blocks = [
      block("scene_heading", "INT. КУХНЯ — ДЕНЬ", "h1"),
      block("action", "Действие.", "a1"),
      block("character", "АНДРЕЙ", "c1"),
      block("parenthetical", "(тихо)", "p1"),
      block("dialogue", "Привет.", "d1"),
    ]
    const scenes = parseScenes(blocks)
    expect(scenes[0].blockIds).toEqual(["h1", "a1", "c1", "p1", "d1"])
  })
})

// ── getSceneForBlock ──

describe("getSceneForBlock", () => {
  const blocks = [
    block("scene_heading", "INT. КУХНЯ", "h1"),
    block("action", "Действие.", "a1"),
    block("scene_heading", "EXT. ДВОР", "h2"),
    block("action", "Другое.", "a2"),
  ]
  const scenes = parseScenes(blocks)

  it("finds scene for block in first scene", () => {
    const scene = getSceneForBlock(scenes, "a1")
    expect(scene).not.toBeNull()
    expect(scene!.title).toBe("INT. КУХНЯ")
  })

  it("finds scene for block in second scene", () => {
    const scene = getSceneForBlock(scenes, "a2")
    expect(scene).not.toBeNull()
    expect(scene!.title).toBe("EXT. ДВОР")
  })

  it("returns null for unknown block ID", () => {
    expect(getSceneForBlock(scenes, "nonexistent")).toBeNull()
  })
})

// ── getSceneByIndex ──

describe("getSceneByIndex", () => {
  const blocks = [
    block("scene_heading", "INT. A", "h1"),
    block("scene_heading", "INT. B", "h2"),
  ]
  const scenes = parseScenes(blocks)

  it("finds scene by index", () => {
    expect(getSceneByIndex(scenes, 1)!.title).toBe("INT. A")
    expect(getSceneByIndex(scenes, 2)!.title).toBe("INT. B")
  })

  it("returns null for invalid index", () => {
    expect(getSceneByIndex(scenes, 99)).toBeNull()
  })
})

// ── getBlockSceneIndex ──

describe("getBlockSceneIndex", () => {
  const blocks = [
    block("scene_heading", "INT. A", "h1"),
    block("action", "text", "a1"),
    block("scene_heading", "INT. B", "h2"),
    block("action", "text2", "a2"),
  ]
  const scenes = parseScenes(blocks)

  it("returns scene index for known block", () => {
    expect(getBlockSceneIndex(scenes, "a1")).toBe(1)
    expect(getBlockSceneIndex(scenes, "a2")).toBe(2)
  })

  it("returns null for unknown block", () => {
    expect(getBlockSceneIndex(scenes, "nope")).toBeNull()
  })
})

// ── parseScenesToShots (timeline) ──

describe("parseScenesToShots", () => {
  it("creates timeline shots from scene headings", () => {
    const blocks = [
      block("scene_heading", "INT. КУХНЯ — ДЕНЬ", "h1"),
      block("action", "Действие.", "a1"),
      block("scene_heading", "EXT. ДВОР — НОЧЬ", "h2"),
    ]
    const shots = parseScenesToShots(blocks)
    expect(shots).toHaveLength(2)
    expect(shots[0].label).toBe("INT. КУХНЯ — ДЕНЬ")
    expect(shots[0].order).toBe(0)
    expect(shots[1].order).toBe(1)
  })

  it("skips non-heading blocks", () => {
    const blocks = [
      block("action", "Пролог.", "a1"),
      block("scene_heading", "INT. A", "h1"),
    ]
    const shots = parseScenesToShots(blocks)
    expect(shots).toHaveLength(1)
  })

  it("assigns default duration of 5000ms", () => {
    const blocks = [block("scene_heading", "INT. A", "h1")]
    const shots = parseScenesToShots(blocks)
    expect(shots[0].duration).toBe(5000)
  })

  it("initializes all shot fields", () => {
    const blocks = [block("scene_heading", "INT. A", "h1")]
    const shot = parseScenesToShots(blocks)[0]
    expect(shot.locked).toBe(false)
    expect(shot.thumbnailUrl).toBeNull()
    expect(shot.imagePrompt).toBe("")
    expect(shot.generationHistory).toEqual([])
  })
})
