import { describe, it, expect, vi } from "vitest"
import {
  buildAutoShotUnits,
  snapshotBlocks,
  diffBlockSnapshots,
  reconcileShots,
  updateShotTextsOnly,
  simpleHash,
  type BlockInput,
  type SceneInput,
  type ShotRef,
} from "../shotSyncEngine"

// ─── Helpers ─────────────────────────────────────────────────

function block(id: string, type: string, text: string): BlockInput {
  return { id, type, text }
}

function scene(id: string, blockIds: string[], title = ""): SceneInput {
  return { id, blockIds, title }
}

function shotRef(id: string, blockRange: [string, string] | null, opts: Partial<ShotRef> = {}): ShotRef {
  return {
    id,
    sceneId: opts.sceneId ?? "s1",
    blockRange,
    autoSynced: opts.autoSynced ?? true,
    locked: opts.locked ?? false,
    caption: opts.caption ?? "",
    imagePrompt: opts.imagePrompt ?? "",
    thumbnailUrl: opts.thumbnailUrl ?? null,
  }
}

// ─── buildAutoShotUnits ──────────────────────────────────────

describe("buildAutoShotUnits", () => {
  it("does NOT create shot from scene heading alone", () => {
    const blocks = [block("b1", "scene_heading", "INT. КУХНЯ - УТРО")]
    const scenes = [scene("s1", ["b1"])]
    const units = buildAutoShotUnits(blocks, scenes)

    expect(units).toHaveLength(0)
  })

  it("first action in scene becomes establishing shot", () => {
    const blocks = [
      block("b1", "scene_heading", "INT. КУХНЯ"),
      block("b2", "action", "Марина стоит у окна."),
    ]
    const scenes = [scene("s1", ["b1", "b2"])]
    const units = buildAutoShotUnits(blocks, scenes)

    expect(units).toHaveLength(1)
    expect(units[0].type).toBe("establishing")
    expect(units[0].primaryBlockId).toBe("b2")
    expect(units[0].caption).toBe("Марина стоит у окна.")
  })

  it("creates dialogue shot from character + dialogue", () => {
    const blocks = [
      block("b1", "scene_heading", "INT. КУХНЯ"),
      block("b2", "character", "МАРИНА"),
      block("b3", "dialogue", "Доброе утро."),
    ]
    const scenes = [scene("s1", ["b1", "b2", "b3"])]
    const units = buildAutoShotUnits(blocks, scenes)

    expect(units).toHaveLength(1) // dialogue only, no heading shot
    expect(units[0].type).toBe("dialogue")
    expect(units[0].speaker).toBe("МАРИНА")
    expect(units[0].caption).toBe("Доброе утро.")
    expect(units[0].blockIds).toEqual(["b2", "b3"])
    expect(units[0].primaryBlockId).toBe("b3") // dialogue block is primary
  })

  it("includes parenthetical in dialogue group", () => {
    const blocks = [
      block("b1", "scene_heading", "INT. КУХНЯ"),
      block("b2", "character", "МАРИНА"),
      block("b3", "parenthetical", "(тихо)"),
      block("b4", "dialogue", "Доброе утро."),
    ]
    const scenes = [scene("s1", ["b1", "b2", "b3", "b4"])]
    const units = buildAutoShotUnits(blocks, scenes)

    expect(units).toHaveLength(1) // dialogue only
    expect(units[0].blockIds).toEqual(["b2", "b3", "b4"])
  })

  it("skips transition blocks", () => {
    const blocks = [
      block("b1", "scene_heading", "INT. КУХНЯ"),
      block("b2", "action", "Действие."),
      block("b3", "transition", "FADE OUT."),
    ]
    const scenes = [scene("s1", ["b1", "b2", "b3"])]
    const units = buildAutoShotUnits(blocks, scenes)

    expect(units).toHaveLength(1) // action only, no heading, no transition
    expect(units[0].type).toBe("establishing") // first action = establishing
  })

  it("handles mixed scene correctly", () => {
    const blocks = [
      block("b1", "scene_heading", "EXT. МОСТ - ЗАКАТ"),
      block("b2", "action", "Марина стоит на краю моста."),
      block("b3", "character", "ЛЕОН"),
      block("b4", "dialogue", "Не делай этого!"),
      block("b5", "action", "Марина оборачивается."),
      block("b6", "character", "МАРИНА"),
      block("b7", "dialogue", "Ты опоздал."),
    ]
    const scenes = [scene("s1", ["b1", "b2", "b3", "b4", "b5", "b6", "b7"])]
    const units = buildAutoShotUnits(blocks, scenes)

    expect(units).toHaveLength(4) // establishing(action) + dialogue + action + dialogue
    expect(units[0].type).toBe("establishing")
    expect(units[0].caption).toBe("Марина стоит на краю моста.")
    expect(units[1].type).toBe("dialogue")
    expect(units[1].speaker).toBe("ЛЕОН")
    expect(units[2].type).toBe("action")
    expect(units[2].caption).toBe("Марина оборачивается.")
    expect(units[3].type).toBe("dialogue")
    expect(units[3].speaker).toBe("МАРИНА")
  })

  it("handles multiple scenes", () => {
    const blocks = [
      block("a1", "scene_heading", "INT. КУХНЯ"),
      block("a2", "action", "Тишина."),
      block("b1", "scene_heading", "EXT. УЛИЦА"),
      block("b2", "action", "Шум."),
    ]
    const scenes = [
      scene("s1", ["a1", "a2"]),
      scene("s2", ["b1", "b2"]),
    ]
    const units = buildAutoShotUnits(blocks, scenes)

    expect(units).toHaveLength(2) // 1 per scene (first action = establishing)
    expect(units[0].sceneId).toBe("s1")
    expect(units[0].type).toBe("establishing")
    expect(units[1].sceneId).toBe("s2")
    expect(units[1].type).toBe("establishing")
  })

  it("strips V.O. from character name", () => {
    const blocks = [
      block("b1", "scene_heading", "INT. ГОРОД"),
      block("b2", "character", "МАРИНА (V.O.)"),
      block("b3", "dialogue", "Город засыпал."),
    ]
    const scenes = [scene("s1", ["b1", "b2", "b3"])]
    const units = buildAutoShotUnits(blocks, scenes)

    expect(units[0].speaker).toBe("МАРИНА")
  })

  it("returns empty array for empty blocks", () => {
    expect(buildAutoShotUnits([], [])).toEqual([])
  })
})

// ─── diffBlockSnapshots ──────────────────────────────────────

describe("diffBlockSnapshots", () => {
  it("detects added blocks", () => {
    const prev = snapshotBlocks([block("b1", "action", "Hello")])
    const next = snapshotBlocks([
      block("b1", "action", "Hello"),
      block("b2", "action", "World"),
    ])
    const diff = diffBlockSnapshots(prev, next)

    expect(diff.hasStructuralChanges).toBe(true)
    expect(diff.addedBlockIds).toEqual(["b2"])
  })

  it("detects removed blocks", () => {
    const prev = snapshotBlocks([
      block("b1", "action", "Hello"),
      block("b2", "action", "World"),
    ])
    const next = snapshotBlocks([block("b1", "action", "Hello")])
    const diff = diffBlockSnapshots(prev, next)

    expect(diff.hasStructuralChanges).toBe(true)
    expect(diff.removedBlockIds).toEqual(["b2"])
  })

  it("detects type changes", () => {
    const prev = snapshotBlocks([block("b1", "action", "HELLO")])
    const next = snapshotBlocks([block("b1", "character", "HELLO")])
    const diff = diffBlockSnapshots(prev, next)

    expect(diff.hasStructuralChanges).toBe(true)
    expect(diff.typeChangedBlockIds).toEqual(["b1"])
  })

  it("detects text-only changes", () => {
    const prev = snapshotBlocks([block("b1", "action", "Hello")])
    const next = snapshotBlocks([block("b1", "action", "Hello world")])
    const diff = diffBlockSnapshots(prev, next)

    expect(diff.hasStructuralChanges).toBe(false)
    expect(diff.textChangedBlockIds).toEqual(["b1"])
  })

  it("no changes detected", () => {
    const prev = snapshotBlocks([block("b1", "action", "Hello")])
    const next = snapshotBlocks([block("b1", "action", "Hello")])
    const diff = diffBlockSnapshots(prev, next)

    expect(diff.hasStructuralChanges).toBe(false)
    expect(diff.textChangedBlockIds).toEqual([])
  })
})

// ─── reconcileShots ──────────────────────────────────────────

describe("reconcileShots", () => {
  it("creates shots for new blocks", () => {
    const blocks = [
      block("b1", "scene_heading", "INT. КУХНЯ"),
      block("b2", "action", "Действие."),
    ]
    const scenes = [scene("s1", ["b1", "b2"])]
    const addShot = vi.fn().mockReturnValue("new-id")
    const removeShot = vi.fn()
    const updateShot = vi.fn()
    const reorderShots = vi.fn()

    reconcileShots(blocks, scenes, [], { addShot, removeShot, updateShot, reorderShots })

    expect(addShot).toHaveBeenCalledTimes(1) // action only, no heading
    expect(addShot.mock.calls[0][0]).toMatchObject({
      caption: "Действие.",
      autoSynced: true,
      sceneId: "s1",
    })
  })

  it("removes shots for deleted blocks", () => {
    const blocks: BlockInput[] = []
    const scenes: SceneInput[] = []
    const existingShots: ShotRef[] = [
      shotRef("shot-1", ["b1", "b1"], { autoSynced: true }),
    ]
    const removeShot = vi.fn()

    reconcileShots(blocks, scenes, existingShots, {
      addShot: vi.fn().mockReturnValue("x"),
      removeShot,
      updateShot: vi.fn(),
      reorderShots: vi.fn(),
    })

    expect(removeShot).toHaveBeenCalledWith("shot-1")
  })

  it("updates shots when text changes", () => {
    const blocks = [
      block("b1", "scene_heading", "INT. КУХНЯ"),
      block("b2", "action", "Новый текст действия."),
    ]
    const scenes = [scene("s1", ["b1", "b2"])]
    const existingShots: ShotRef[] = [
      shotRef("shot-2", ["b2", "b2"], { autoSynced: true, caption: "Старый текст." }),
    ]
    const updateShot = vi.fn()

    reconcileShots(blocks, scenes, existingShots, {
      addShot: vi.fn().mockReturnValue("x"),
      removeShot: vi.fn(),
      updateShot,
      reorderShots: vi.fn(),
    })

    expect(updateShot).toHaveBeenCalledTimes(1)
    expect(updateShot).toHaveBeenCalledWith("shot-2", expect.objectContaining({
      caption: "Новый текст действия.",
    }))
  })

  it("never touches locked or non-auto shots", () => {
    const blocks: BlockInput[] = []
    const scenes: SceneInput[] = []
    const existingShots: ShotRef[] = [
      shotRef("locked-1", ["b1", "b1"], { locked: true, autoSynced: false }),
      shotRef("manual-1", null, { autoSynced: false }),
    ]
    const removeShot = vi.fn()
    const updateShot = vi.fn()

    reconcileShots(blocks, scenes, existingShots, {
      addShot: vi.fn().mockReturnValue("x"),
      removeShot,
      updateShot,
      reorderShots: vi.fn(),
    })

    expect(removeShot).not.toHaveBeenCalled()
    expect(updateShot).not.toHaveBeenCalled()
  })
})

// ─── updateShotTextsOnly ─────────────────────────────────────

describe("updateShotTextsOnly", () => {
  it("updates caption and duration for changed blocks", () => {
    const blocks = [block("b1", "action", "Новый длинный текст действия.")]
    const shots: ShotRef[] = [
      shotRef("s1", ["b1", "b1"], { autoSynced: true, caption: "Старый." }),
    ]
    const updateShot = vi.fn()

    updateShotTextsOnly(["b1"], blocks, shots, updateShot)

    expect(updateShot).toHaveBeenCalledWith("s1", expect.objectContaining({
      caption: "Новый длинный текст действия.",
    }))
  })

  it("skips locked shots", () => {
    const blocks = [block("b1", "action", "New text.")]
    const shots: ShotRef[] = [
      shotRef("s1", ["b1", "b1"], { autoSynced: true, locked: true, caption: "Old." }),
    ]
    const updateShot = vi.fn()

    updateShotTextsOnly(["b1"], blocks, shots, updateShot)

    expect(updateShot).not.toHaveBeenCalled()
  })

  it("skips non-auto-synced shots", () => {
    const blocks = [block("b1", "action", "New text.")]
    const shots: ShotRef[] = [
      shotRef("s1", ["b1", "b1"], { autoSynced: false, caption: "Old." }),
    ]
    const updateShot = vi.fn()

    updateShotTextsOnly(["b1"], blocks, shots, updateShot)

    expect(updateShot).not.toHaveBeenCalled()
  })
})

// ─── simpleHash ──────────────────────────────────────────────

describe("simpleHash", () => {
  it("returns same hash for same string", () => {
    expect(simpleHash("hello")).toBe(simpleHash("hello"))
  })

  it("returns different hash for different strings", () => {
    expect(simpleHash("hello")).not.toBe(simpleHash("world"))
  })
})
