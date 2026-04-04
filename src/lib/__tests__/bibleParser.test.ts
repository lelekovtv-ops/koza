import { describe, it, expect } from "vitest"
import {
  slugify,
  parseCharacters,
  parseLocations,
  linkCharactersToScenes,
  parseProps,
} from "@/lib/bibleParser"
import type { Block } from "@/lib/screenplayFormat"
import { parseScenes } from "@/lib/sceneParser"

// ── Helpers ──

function block(type: Block["type"], text: string, id?: string): Block {
  return { id: id ?? `blk-${Math.random().toString(36).slice(2, 8)}`, type, text }
}

// ── slugify ──

describe("slugify", () => {
  it("converts latin text to slug", () => {
    expect(slugify("Hello World")).toBe("hello-world")
  })

  it("converts cyrillic text to slug", () => {
    // NFKD normalization decomposes Й → И + combining breve, then strip removes the mark
    // This is expected behavior — slugs are for IDs, not display
    const result = slugify("АНДРЕЙ")
    expect(result).toBe("андреи")
  })

  it("strips accents from latin chars", () => {
    expect(slugify("café")).toBe("cafe")
  })

  it("collapses multiple separators", () => {
    expect(slugify("hello   world!!!")).toBe("hello-world")
  })

  it("returns 'untitled' for empty string", () => {
    expect(slugify("")).toBe("untitled")
    expect(slugify("!!!")).toBe("untitled")
  })
})

// ── parseCharacters ──

describe("parseCharacters", () => {
  it("extracts character from character block", () => {
    const blocks = [
      block("character", "АНДРЕЙ"),
      block("dialogue", "Привет."),
    ]
    const chars = parseCharacters(blocks)
    expect(chars).toHaveLength(1)
    expect(chars[0].name).toBe("АНДРЕЙ")
    expect(chars[0].dialogueCount).toBe(1)
  })

  it("strips V.O. and O.S. extensions", () => {
    const blocks = [
      block("character", "МАРИЯ (V.O.)"),
      block("dialogue", "Текст за кадром."),
    ]
    const chars = parseCharacters(blocks)
    expect(chars).toHaveLength(1)
    expect(chars[0].name).toBe("МАРИЯ")
  })

  it("strips CONT'D extension", () => {
    const blocks = [
      block("character", "АНДРЕЙ (CONT'D)"),
      block("dialogue", "Продолжение."),
    ]
    const chars = parseCharacters(blocks)
    expect(chars[0].name).toBe("АНДРЕЙ")
  })

  it("merges duplicate characters and sums dialogue", () => {
    const blocks = [
      block("character", "АНДРЕЙ"),
      block("dialogue", "Строка 1."),
      block("action", "Пауза."),
      block("character", "АНДРЕЙ"),
      block("dialogue", "Строка 2."),
      block("dialogue", "Строка 3."),
    ]
    const chars = parseCharacters(blocks)
    expect(chars).toHaveLength(1)
    expect(chars[0].dialogueCount).toBe(3)
  })

  it("counts parenthetical as dialogue", () => {
    const blocks = [
      block("character", "МАРИЯ"),
      block("parenthetical", "(шёпотом)"),
      block("dialogue", "Тихо..."),
    ]
    const chars = parseCharacters(blocks)
    expect(chars[0].dialogueCount).toBe(2)
  })

  it("sorts by dialogue count descending", () => {
    const blocks = [
      block("character", "ВАСЯ"),
      block("dialogue", "Один."),
      block("character", "ПЕТЯ"),
      block("dialogue", "Раз."),
      block("dialogue", "Два."),
      block("dialogue", "Три."),
    ]
    const chars = parseCharacters(blocks)
    expect(chars[0].name).toBe("ПЕТЯ")
    expect(chars[1].name).toBe("ВАСЯ")
  })

  it("returns empty for no character blocks", () => {
    const blocks = [
      block("action", "Тишина."),
      block("scene_heading", "INT. КУХНЯ — ДЕНЬ"),
    ]
    expect(parseCharacters(blocks)).toHaveLength(0)
  })

  it("initializes default fields", () => {
    const blocks = [block("character", "ОЛЕГ"), block("dialogue", "Да.")]
    const char = parseCharacters(blocks)[0]
    expect(char.description).toBe("")
    expect(char.appearancePrompt).toBe("")
    expect(char.referenceImages).toEqual([])
    expect(char.generatedPortraitUrl).toBeNull()
    expect(char.sceneIds).toEqual([])
  })
})

// ── parseLocations ──

describe("parseLocations", () => {
  it("parses INT location with time of day", () => {
    const blocks = [block("scene_heading", "INT. КУХНЯ — ДЕНЬ", "h1")]
    const scenes = parseScenes(blocks)
    const locs = parseLocations(blocks, scenes)
    expect(locs).toHaveLength(1)
    expect(locs[0].name).toBe("КУХНЯ")
    expect(locs[0].intExt).toBe("INT")
    expect(locs[0].timeOfDay).toBe("ДЕНЬ")
  })

  it("parses EXT location", () => {
    const blocks = [block("scene_heading", "EXT. ПАРК — НОЧЬ", "h1")]
    const scenes = parseScenes(blocks)
    const locs = parseLocations(blocks, scenes)
    expect(locs[0].intExt).toBe("EXT")
    expect(locs[0].name).toBe("ПАРК")
    expect(locs[0].timeOfDay).toBe("НОЧЬ")
  })

  it("parses INT/EXT location", () => {
    const blocks = [block("scene_heading", "INT./EXT. МАШИНА — ВЕЧЕР", "h1")]
    const scenes = parseScenes(blocks)
    const locs = parseLocations(blocks, scenes)
    expect(locs[0].intExt).toBe("INT/EXT")
    expect(locs[0].name).toBe("МАШИНА")
  })

  it("merges duplicate locations and collects scene IDs", () => {
    const blocks = [
      block("scene_heading", "INT. КУХНЯ — ДЕНЬ", "h1"),
      block("action", "Действие.", "a1"),
      block("scene_heading", "EXT. ДВОР — НОЧЬ", "h2"),
      block("action", "Действие.", "a2"),
      block("scene_heading", "INT. КУХНЯ — ВЕЧЕР", "h3"),
    ]
    const scenes = parseScenes(blocks)
    const locs = parseLocations(blocks, scenes)
    // КУХНЯ appears twice but should be merged
    const kitchen = locs.find((l) => l.name === "КУХНЯ")
    expect(kitchen).toBeDefined()
    expect(kitchen!.sceneIds.length).toBe(2)
  })

  it("handles location without time of day", () => {
    const blocks = [block("scene_heading", "INT. КОРИДОР", "h1")]
    const scenes = parseScenes(blocks)
    const locs = parseLocations(blocks, scenes)
    expect(locs[0].name).toBe("КОРИДОР")
    expect(locs[0].timeOfDay).toBe("")
  })
})

// ── linkCharactersToScenes ──

describe("linkCharactersToScenes", () => {
  it("links characters to scenes where they have dialogue", () => {
    const blocks = [
      block("scene_heading", "INT. КУХНЯ — ДЕНЬ", "h1"),
      block("character", "АНДРЕЙ", "c1"),
      block("dialogue", "Привет.", "d1"),
      block("scene_heading", "EXT. ДВОР — НОЧЬ", "h2"),
      block("character", "МАРИЯ", "c2"),
      block("dialogue", "Пока.", "d2"),
    ]
    const scenes = parseScenes(blocks)
    const chars = parseCharacters(blocks)
    const linked = linkCharactersToScenes(chars, blocks, scenes)

    const andrey = linked.find((c) => c.name === "АНДРЕЙ")!
    const maria = linked.find((c) => c.name === "МАРИЯ")!

    expect(andrey.sceneIds).toHaveLength(1)
    expect(maria.sceneIds).toHaveLength(1)
    expect(andrey.sceneIds[0]).not.toBe(maria.sceneIds[0])
  })
})

// ── parseProps ──

describe("parseProps", () => {
  it("extracts weapon props from action text", () => {
    const blocks = [
      block("scene_heading", "INT. КОМНАТА — НОЧЬ", "h1"),
      block("action", "Андрей достаёт пистолет из ящика.", "a1"),
    ]
    const scenes = parseScenes(blocks)
    const props = parseProps(blocks, scenes)
    const names = props.map((p) => p.name.toLowerCase())
    expect(names.some((n) => n.includes("пистолет"))).toBe(true)
  })

  it("extracts phone/communication props", () => {
    const blocks = [
      block("scene_heading", "INT. ОФИС — ДЕНЬ", "h1"),
      block("action", "Мария берёт телефон со стола.", "a1"),
    ]
    const scenes = parseScenes(blocks)
    const props = parseProps(blocks, scenes)
    const names = props.map((p) => p.name.toLowerCase())
    expect(names.some((n) => n.includes("телефон"))).toBe(true)
  })

  it("extracts furniture props", () => {
    const blocks = [
      block("scene_heading", "INT. ГОСТИНАЯ — ВЕЧЕР", "h1"),
      block("action", "Он садится в кресло и берёт стакан.", "a1"),
    ]
    const scenes = parseScenes(blocks)
    const props = parseProps(blocks, scenes)
    const names = props.map((p) => p.name.toLowerCase())
    expect(names.some((n) => n.includes("кресл"))).toBe(true)
    expect(names.some((n) => n.includes("стакан"))).toBe(true)
  })

  it("does NOT extract props from dialogue blocks", () => {
    const blocks = [
      block("scene_heading", "INT. КОМНАТА — НОЧЬ", "h1"),
      block("character", "АНДРЕЙ", "c1"),
      block("dialogue", "Я видел пистолет на столе.", "d1"),
    ]
    const scenes = parseScenes(blocks)
    const props = parseProps(blocks, scenes)
    expect(props).toHaveLength(0)
  })

  it("preserves existing props and merges new ones", () => {
    const blocks = [
      block("scene_heading", "INT. ОФИС — ДЕНЬ", "h1"),
      block("action", "На столе лежит телефон.", "a1"),
    ]
    const scenes = parseScenes(blocks)
    const existing = [{
      id: "custom-prop",
      name: "Фотография",
      description: "Старая фотография семьи",
      sceneIds: ["scene-1"],
      referenceImages: [],
      canonicalImageId: null,
      generatedImageUrl: null,
      imageBlobKey: null,
      appearancePrompt: "",
    }]
    const props = parseProps(blocks, scenes, existing)
    expect(props.find((p) => p.id === "custom-prop")).toBeDefined()
    expect(props.length).toBeGreaterThan(1)
  })

  it("auto-fills description from script context", () => {
    const blocks = [
      block("scene_heading", "INT. КУХНЯ — УТРО", "h1"),
      block("action", "Андрей берёт нож и режет хлеб.", "a1"),
    ]
    const scenes = parseScenes(blocks)
    const props = parseProps(blocks, scenes)
    const knife = props.find((p) => p.name.toLowerCase().includes("нож"))
    expect(knife).toBeDefined()
    expect(knife!.description).toBeTruthy()
  })

  it("assigns scene IDs to props", () => {
    const blocks = [
      block("scene_heading", "INT. КУХНЯ — ДЕНЬ", "h1"),
      block("action", "Стакан на столе.", "a1"),
      block("scene_heading", "INT. СПАЛЬНЯ — НОЧЬ", "h2"),
      block("action", "Стакан воды у кровати.", "a2"),
    ]
    const scenes = parseScenes(blocks)
    const props = parseProps(blocks, scenes)
    const glass = props.find((p) => p.name.toLowerCase().includes("стакан"))
    expect(glass).toBeDefined()
    expect(glass!.sceneIds.length).toBe(2)
  })
})
