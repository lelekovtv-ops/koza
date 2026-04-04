import { describe, it, expect } from "vitest"
import {
  buildSceneTimingMap,
  buildFullTimingMap,
  mapShotsToBlocks,
  placeShotsOnTimeline,
  placeVoiceClips,
  buildTrackBlocks,
  placeScene,
  placeAllScenes,
} from "../placementEngine"

// ─── Helpers ─────────────────────────────────────────────────

function block(id: string, type: string, text: string) {
  return { id, type, text }
}

function shot(id: string, caption: string, directorNote = "", notes = "") {
  return { id, caption, directorNote, notes, label: id }
}

// ─── Scenario 1: Simple dialogue scene ───────────────────────

describe("Scenario 1: Simple dialogue scene", () => {
  const blocks = [
    block("b1", "scene_heading", "INT. КУХНЯ - УТРО"),
    block("b2", "action", "Марина стоит у окна."),
    block("b3", "character", "МАРИНА"),
    block("b4", "dialogue", "Я больше так не могу."),
    block("b5", "action", "Леон входит."),
    block("b6", "character", "ЛЕОН"),
    block("b7", "dialogue", "Ты уходишь?"),
    block("b8", "character", "МАРИНА"),
    block("b9", "dialogue", "Да."),
  ]

  it("builds timing map with correct block count", () => {
    const map = buildSceneTimingMap("scene-1", blocks, 0)
    // heading, action, dialogue, action, dialogue, dialogue = 6 timed blocks
    expect(map.blocks).toHaveLength(6)
    expect(map.blocks[0].type).toBe("heading")
    expect(map.blocks[1].type).toBe("action")
    expect(map.blocks[2].type).toBe("dialogue")
    expect(map.blocks[2].speaker).toBe("МАРИНА")
    expect(map.blocks[3].type).toBe("action")
    expect(map.blocks[4].type).toBe("dialogue")
    expect(map.blocks[4].speaker).toBe("ЛЕОН")
    expect(map.blocks[5].type).toBe("dialogue")
    expect(map.blocks[5].speaker).toBe("МАРИНА")
  })

  it("blocks are sequential (no gaps, no overlaps)", () => {
    const map = buildSceneTimingMap("scene-1", blocks, 0)
    for (let i = 1; i < map.blocks.length; i++) {
      expect(map.blocks[i].startMs).toBe(map.blocks[i - 1].endMs)
    }
  })

  it("scene duration equals last block endMs", () => {
    const map = buildSceneTimingMap("scene-1", blocks, 0)
    const lastBlock = map.blocks[map.blocks.length - 1]
    expect(map.sceneDurationMs).toBe(lastBlock.endMs)
  })

  it("maps shots to blocks with character affinity", () => {
    const map = buildSceneTimingMap("scene-1", blocks, 0)
    const shots = [
      shot("s1", "Establishing kitchen, Марина у окна"),
      shot("s2", "Леон входит в кухню"),
      shot("s3", "Close-up Марина реакция"),
    ]

    const mapped = mapShotsToBlocks(shots, map)
    expect(mapped).toHaveLength(3)

    // Shot 1 mentions МАРИНА → covers heading + action + dialogue(Марина)
    expect(mapped[0].coveredBlockIds).toContain("b1") // heading
    expect(mapped[0].coveredBlockIds).toContain("b4") // Марина's dialogue

    // Shot 2 mentions ЛЕОН → covers action(Леон входит) + dialogue(Леон)
    expect(mapped[1].coveredBlockIds).toContain("b5") // action
    expect(mapped[1].coveredBlockIds).toContain("b7") // Леон's dialogue

    // Shot 3 (last) → covers remaining (Марина's "Да")
    expect(mapped[2].coveredBlockIds).toContain("b9") // Марина's "Да"
  })

  it("placed shots have correct timing from blocks", () => {
    const map = buildSceneTimingMap("scene-1", blocks, 0)
    const shots = [
      shot("s1", "Марина у окна"),
      shot("s2", "Леон входит"),
      shot("s3", "Close-up Марина"),
    ]

    const mapped = mapShotsToBlocks(shots, map)
    const placed = placeShotsOnTimeline(mapped, map)

    // Shot 1 starts at 0 (heading start)
    expect(placed[0].startMs).toBe(0)

    // Shot 2 starts after shot 1 ends (after Марина's dialogue)
    expect(placed[1].startMs).toBeGreaterThan(placed[0].startMs)

    // Shot 3 starts after shot 2 ends
    expect(placed[2].startMs).toBeGreaterThan(placed[1].startMs)

    // No gaps between shots
    expect(placed[1].startMs).toBe(placed[0].startMs + placed[0].durationMs)
    expect(placed[2].startMs).toBe(placed[1].startMs + placed[1].durationMs)
  })

  it("voice clips are placed at dialogue block positions", () => {
    const map = buildSceneTimingMap("scene-1", blocks, 0)
    const shots = [
      shot("s1", "Марина у окна"),
      shot("s2", "Леон входит"),
      shot("s3", "Close-up Марина"),
    ]

    const mapped = mapShotsToBlocks(shots, map)
    const placed = placeShotsOnTimeline(mapped, map)
    const voice = placeVoiceClips([map], placed)

    expect(voice).toHaveLength(3) // 3 dialogue blocks
    expect(voice[0].speaker).toBe("МАРИНА")
    expect(voice[1].speaker).toBe("ЛЕОН")
    expect(voice[2].speaker).toBe("МАРИНА")

    // Voice clips inherit timing from their blocks
    expect(voice[0].startMs).toBe(map.blocks[2].startMs) // dialogue block b4
    expect(voice[1].startMs).toBe(map.blocks[4].startMs) // dialogue block b7
    expect(voice[2].startMs).toBe(map.blocks[5].startMs) // dialogue block b9

    // Each voice clip has a covering shot
    expect(voice[0].coveringShotId).toBe("s1")
    expect(voice[1].coveringShotId).toBe("s2")
    expect(voice[2].coveringShotId).toBe("s3")
  })
})

// ─── Scenario 2: Voice-over scene ────────────────────────────

describe("Scenario 2: Voice-over scene", () => {
  const blocks = [
    block("b1", "scene_heading", "INT. ГОРОД - НОЧЬ"),
    block("b2", "character", "МАРИНА (V.O.)"),
    block("b3", "dialogue", "Город засыпал, а я не могла."),
    block("b4", "action", "Марина идёт по пустой улице."),
    block("b5", "character", "МАРИНА (V.O.)"),
    block("b6", "dialogue", "Каждый фонарь напоминал мне о нём."),
  ]

  it("detects V.O. on dialogue blocks", () => {
    const map = buildSceneTimingMap("scene-vo", blocks, 0)
    const dialogues = map.blocks.filter((b) => b.type === "dialogue")
    expect(dialogues).toHaveLength(2)
    expect(dialogues[0].isVO).toBe(true)
    expect(dialogues[1].isVO).toBe(true)
  })

  it("B-roll shots cover action blocks, voice is parallel", () => {
    const map = buildSceneTimingMap("scene-vo", blocks, 0)
    const shots = [
      shot("s1", "Wide city night establishing"),
      shot("s2", "Tracking shot Марина walking"),
    ]

    const mapped = mapShotsToBlocks(shots, map)
    const placed = placeShotsOnTimeline(mapped, map)
    const voice = placeVoiceClips([map], placed)

    // Both shots have placement
    expect(placed).toHaveLength(2)

    // Voice clips exist at dialogue positions
    expect(voice).toHaveLength(2)
    expect(voice[0].isVO).toBe(true)
    expect(voice[1].isVO).toBe(true)
  })
})

// ─── Scenario 3: Action-only (no dialogue) ───────────────────

describe("Scenario 3: Action-only scene", () => {
  const blocks = [
    block("b1", "scene_heading", "INT. СКЛАД - НОЧЬ"),
    block("b2", "action", "Дверь взрывается. Обломки летят по складу."),
    block("b3", "action", "Леон перекатывается за ящики."),
    block("b4", "action", "Выстрелы прошивают стену."),
  ]

  it("no voice clips generated", () => {
    const map = buildSceneTimingMap("scene-action", blocks, 0)
    const voice = placeVoiceClips([map], [])
    expect(voice).toHaveLength(0)
  })

  it("shots map sequentially to action blocks", () => {
    const map = buildSceneTimingMap("scene-action", blocks, 0)
    const shots = [
      shot("s1", "Wide explosion"),
      shot("s2", "Medium Леон rolling"),
      shot("s3", "Close-up bullet holes"),
    ]

    const mapped = mapShotsToBlocks(shots, map)
    const placed = placeShotsOnTimeline(mapped, map)

    expect(placed).toHaveLength(3)

    // Shot 1: heading + first action
    expect(placed[0].startMs).toBe(0)

    // Shots are sequential with no gaps
    for (let i = 1; i < placed.length; i++) {
      expect(placed[i].startMs).toBe(placed[i - 1].startMs + placed[i - 1].durationMs)
    }
  })
})

// ─── Scenario 4: Mixed action + dialogue + V.O. ─────────────

describe("Scenario 4: Mixed scene", () => {
  const blocks = [
    block("b1", "scene_heading", "EXT. МОСТ - ЗАКАТ"),
    block("b2", "action", "Марина стоит на краю моста."),
    block("b3", "character", "МАРИНА (V.O.)"),
    block("b4", "dialogue", "Это был последний день."),
    block("b5", "action", "Леон бежит к ней."),
    block("b6", "character", "ЛЕОН"),
    block("b7", "dialogue", "Не делай этого!"),
    block("b8", "action", "Марина оборачивается."),
    block("b9", "character", "МАРИНА"),
    block("b10", "dialogue", "Ты опоздал."),
  ]

  it("correctly handles all block types", () => {
    const map = buildSceneTimingMap("scene-mixed", blocks, 0)
    // heading + action + dialogue(VO) + action + dialogue + action + dialogue = 7
    expect(map.blocks).toHaveLength(7)
  })

  it("shot placement respects dialogue positions", () => {
    const map = buildSceneTimingMap("scene-mixed", blocks, 0)
    const shots = [
      shot("s1", "Establishing Марина on bridge"),
      shot("s2", "Tracking Леон running"),
      shot("s3", "Close-up Марина reaction"),
    ]

    const mapped = mapShotsToBlocks(shots, map)
    const placed = placeShotsOnTimeline(mapped, map)

    // Shot 1 with МАРИНА covers up to her V.O. dialogue
    expect(mapped[0].coveredBlockIds).toContain("b4") // Марина's V.O.

    // Shot 2 with ЛЕОН covers up to his dialogue
    expect(mapped[1].coveredBlockIds).toContain("b7") // Леон's dialogue

    // Shot 3 (last) covers remaining including final Марина dialogue
    expect(mapped[2].coveredBlockIds).toContain("b10") // Марина's "Ты опоздал"
  })

  it("voice clips sync with covering shots", () => {
    const map = buildSceneTimingMap("scene-mixed", blocks, 0)
    const shots = [
      shot("s1", "Establishing Марина on bridge"),
      shot("s2", "Tracking Леон running"),
      shot("s3", "Close-up Марина"),
    ]

    const mapped = mapShotsToBlocks(shots, map)
    const placed = placeShotsOnTimeline(mapped, map)
    const voice = placeVoiceClips([map], placed)

    expect(voice).toHaveLength(3)

    // Each voice clip is WITHIN its covering shot's time range
    for (const vc of voice) {
      if (vc.coveringShotId) {
        const coveringShot = placed.find((s) => s.shotId === vc.coveringShotId)!
        expect(vc.startMs).toBeGreaterThanOrEqual(coveringShot.startMs)
        expect(vc.startMs + vc.durationMs).toBeLessThanOrEqual(coveringShot.startMs + coveringShot.durationMs)
      }
    }
  })
})

// ─── Scenario 5: Multi-scene ─────────────────────────────────

describe("Scenario 5: Multi-scene screenplay", () => {
  const allBlocks = [
    block("a1", "scene_heading", "INT. КУХНЯ - УТРО"),
    block("a2", "action", "Марина готовит завтрак."),
    block("a3", "character", "МАРИНА"),
    block("a4", "dialogue", "Доброе утро."),
    block("b1", "scene_heading", "EXT. УЛИЦА - ДЕНЬ"),
    block("b2", "action", "Леон идёт по тротуару."),
    block("b3", "character", "ЛЕОН"),
    block("b4", "dialogue", "Опаздываю."),
  ]

  const scenes = [
    { id: "s1", blockIds: ["a1", "a2", "a3", "a4"] },
    { id: "s2", blockIds: ["b1", "b2", "b3", "b4"] },
  ]

  it("buildFullTimingMap lays scenes end-to-end", () => {
    const maps = buildFullTimingMap(allBlocks, scenes)
    expect(maps).toHaveLength(2)
    expect(maps[0].sceneStartMs).toBe(0)
    expect(maps[1].sceneStartMs).toBe(maps[0].sceneDurationMs)
  })

  it("placeAllScenes works across scenes", () => {
    const shotsByScene = new Map([
      ["s1", [shot("shot-a1", "Марина at stove")]],
      ["s2", [shot("shot-b1", "Леон walking")]],
    ])

    const result = placeAllScenes(allBlocks, scenes, shotsByScene)

    expect(result.placedShots).toHaveLength(2)
    expect(result.placedVoice).toHaveLength(2)

    // Scene 2 shots start after scene 1
    const scene1Shot = result.placedShots.find((s) => s.sceneId === "s1")!
    const scene2Shot = result.placedShots.find((s) => s.sceneId === "s2")!
    expect(scene2Shot.startMs).toBeGreaterThan(scene1Shot.startMs)
  })
})

// ─── Edge cases ──────────────────────────────────────────────

describe("Edge cases", () => {
  it("more shots than blocks — last shots share final block", () => {
    const blocks = [
      block("b1", "scene_heading", "INT. КОМНАТА"),
      block("b2", "action", "Тишина."),
    ]
    const map = buildSceneTimingMap("s", blocks, 0)
    const shots = [
      shot("s1", "Wide"),
      shot("s2", "Medium"),
      shot("s3", "Close"),
    ]

    const mapped = mapShotsToBlocks(shots, map)
    expect(mapped).toHaveLength(3)
    // All mappings should have valid blockRanges
    for (const m of mapped) {
      expect(m.blockRange[0]).toBeTruthy()
      expect(m.blockRange[1]).toBeTruthy()
    }
  })

  it("empty blocks — returns empty timing map", () => {
    const map = buildSceneTimingMap("s", [], 0)
    expect(map.blocks).toHaveLength(0)
    expect(map.sceneDurationMs).toBe(500) // MIN_BLOCK_MS
  })

  it("no shots — mapShotsToBlocks returns empty", () => {
    const blocks = [block("b1", "scene_heading", "INT. КОМНАТА")]
    const map = buildSceneTimingMap("s", blocks, 0)
    const mapped = mapShotsToBlocks([], map)
    expect(mapped).toHaveLength(0)
  })

  it("single shot covers entire scene", () => {
    const blocks = [
      block("b1", "scene_heading", "INT. КОМНАТА"),
      block("b2", "action", "Что-то происходит."),
      block("b3", "character", "ГЕРОЙ"),
      block("b4", "dialogue", "Вот и всё."),
    ]
    const map = buildSceneTimingMap("s", blocks, 0)
    const mapped = mapShotsToBlocks([shot("s1", "Wide")], map)

    expect(mapped).toHaveLength(1)
    // Single shot covers all blocks
    expect(mapped[0].coveredBlockIds.length).toBeGreaterThanOrEqual(2)
  })

  it("buildTrackBlocks produces visual + voice + titles tracks", () => {
    const blocks = [
      block("b1", "scene_heading", "INT. КОМНАТА"),
      block("b2", "character", "ГЕРОЙ"),
      block("b3", "dialogue", "Привет."),
    ]

    const { placedShots, placedVoice } = placeScene("s", blocks, 0, [shot("s1", "Wide")])
    const trackBlocks = buildTrackBlocks(placedShots, placedVoice, [{ id: "s1", label: "Shot 1", shotSize: "Wide" }])

    const visual = trackBlocks.filter((b) => b.track === "visual")
    const voice = trackBlocks.filter((b) => b.track === "voice")
    const titles = trackBlocks.filter((b) => b.track === "titles")

    expect(visual).toHaveLength(1)
    expect(voice).toHaveLength(1)
    expect(titles).toHaveLength(1)
    expect(voice[0].startMs).toBe(titles[0].startMs) // voice and title aligned
  })

  it("scene offset propagates correctly", () => {
    const blocks = [
      block("b1", "scene_heading", "INT. КОМНАТА"),
      block("b2", "action", "Действие."),
    ]
    const offset = 10000
    const map = buildSceneTimingMap("s", blocks, offset)

    expect(map.sceneStartMs).toBe(offset)
    expect(map.blocks[0].startMs).toBe(offset)
    expect(map.blocks[1].startMs).toBe(offset + 2000) // heading is 2000ms
  })
})
