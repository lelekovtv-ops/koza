import { describe, it, expect } from "vitest"
import {
  detectBlockType,
  cycleBlockType,
  normalizeBlockText,
  reformatBlockAsType,
  parseTextToBlocks,
  exportBlocksToText,
  extractCharacterNames,
  getLiveTypeConversion,
  makeBlock,
  insertBlockAfter,
  updateBlockText,
  removeBlock,
} from "@/lib/screenplayFormat"
import type { Block, BlockType } from "@/lib/screenplayFormat"

// ── detectBlockType ──

describe("detectBlockType", () => {
  it("detects INT. scene heading", () => {
    const lines = ["INT. КУХНЯ — ДЕНЬ"]
    expect(detectBlockType(lines, 0, null)).toBe("scene_heading")
  })

  it("detects EXT. scene heading", () => {
    const lines = ["EXT. ПАРК — НОЧЬ"]
    expect(detectBlockType(lines, 0, null)).toBe("scene_heading")
  })

  it("detects INT./EXT. scene heading", () => {
    const lines = ["INT./EXT. МАШИНА — ВЕЧЕР"]
    expect(detectBlockType(lines, 0, null)).toBe("scene_heading")
  })

  it("detects Fountain force-heading with dot prefix", () => {
    const lines = [".FLASHBACK — 1990"]
    expect(detectBlockType(lines, 0, null)).toBe("scene_heading")
  })

  it("detects CUT TO: transition", () => {
    const lines = ["CUT TO:"]
    expect(detectBlockType(lines, 0, null)).toBe("transition")
  })

  it("detects FADE OUT. transition", () => {
    const lines = ["FADE OUT."]
    expect(detectBlockType(lines, 0, null)).toBe("transition")
  })

  it("detects SMASH CUT TO: transition", () => {
    const lines = ["SMASH CUT TO:"]
    expect(detectBlockType(lines, 0, null)).toBe("transition")
  })

  it("detects FADE IN: as transition (not character)", () => {
    const lines = ["FADE IN:"]
    expect(detectBlockType(lines, 0, null)).toBe("transition")
  })

  it("detects FADE OUT. as transition", () => {
    const lines = ["FADE OUT."]
    expect(detectBlockType(lines, 0, null)).toBe("transition")
  })

  it("detects character (ALL CAPS after blank line)", () => {
    const lines = ["", "АНДРЕЙ"]
    expect(detectBlockType(lines, 1, null)).toBe("character")
  })

  it("detects character with V.O. extension", () => {
    const lines = ["", "МАРИЯ (V.O.)"]
    expect(detectBlockType(lines, 1, null)).toBe("character")
  })

  it("detects dialogue after character", () => {
    const lines = ["АНДРЕЙ", "Привет, как дела?"]
    expect(detectBlockType(lines, 1, "character")).toBe("dialogue")
  })

  it("detects parenthetical after character", () => {
    const lines = ["АНДРЕЙ", "(шёпотом)"]
    expect(detectBlockType(lines, 1, "character")).toBe("parenthetical")
  })

  it("detects dialogue after parenthetical", () => {
    const lines = ["(пауза)", "Ну ладно."]
    expect(detectBlockType(lines, 1, "parenthetical")).toBe("dialogue")
  })

  it("detects action as default", () => {
    const lines = ["Андрей входит в комнату и осматривается."]
    expect(detectBlockType(lines, 0, null)).toBe("action")
  })

  it("detects CLOSE ON as shot", () => {
    const lines = ["CLOSE ON"]
    expect(detectBlockType(lines, 0, null)).toBe("shot")
  })

  it("detects INSERT as shot", () => {
    const lines = ["INSERT"]
    expect(detectBlockType(lines, 0, null)).toBe("shot")
  })

  // ── Cyrillic scene headings ──

  it("detects ИНТ. scene heading (Russian)", () => {
    const lines = ["ИНТ. КВАРТИРА — НОЧЬ"]
    expect(detectBlockType(lines, 0, null)).toBe("scene_heading")
  })

  it("detects ЭКСТ. scene heading (Russian)", () => {
    const lines = ["ЭКСТ. ПАРК — ДЕНЬ"]
    expect(detectBlockType(lines, 0, null)).toBe("scene_heading")
  })

  it("detects ИНТ./ЭКСТ. scene heading (Russian)", () => {
    const lines = ["ИНТ./ЭКСТ. МАШИНА — ВЕЧЕР"]
    expect(detectBlockType(lines, 0, null)).toBe("scene_heading")
  })

  // ── Character with age ──

  it("detects character with age in parentheses", () => {
    const lines = ["", "БОРИС (55)"]
    expect(detectBlockType(lines, 1, null)).toBe("character")
  })

  it("detects character with age and 'лет'", () => {
    const lines = ["", "МАРИНА (35 лет)"]
    expect(detectBlockType(lines, 1, null)).toBe("character")
  })

  it("detects character with hyphen in name", () => {
    const lines = ["", "HR-МЕНЕДЖЕР"]
    expect(detectBlockType(lines, 1, null)).toBe("character")
  })

  // ── Russian transitions ──

  it("detects ЗАТЕМНЕНИЕ: transition (Russian)", () => {
    const lines = ["ЗАТЕМНЕНИЕ:"]
    expect(detectBlockType(lines, 0, null)).toBe("transition")
  })

  it("detects ПЕРЕХОД: transition (Russian)", () => {
    const lines = ["ПЕРЕХОД:"]
    expect(detectBlockType(lines, 0, null)).toBe("transition")
  })

  // ── Russian shots ──

  it("detects КРУПНЫЙ ПЛАН: shot (Russian)", () => {
    const lines = ["КРУПНЫЙ ПЛАН:"]
    expect(detectBlockType(lines, 0, null)).toBe("shot")
  })

  it("detects ДЕТАЛЬ: shot (Russian)", () => {
    const lines = ["ДЕТАЛЬ:"]
    expect(detectBlockType(lines, 0, null)).toBe("shot")
  })
})

// ── cycleBlockType ──

describe("cycleBlockType", () => {
  it("cycles forward from action to scene_heading", () => {
    expect(cycleBlockType("action")).toBe("scene_heading")
  })

  it("cycles forward from shot back to action (wrap)", () => {
    expect(cycleBlockType("shot")).toBe("action")
  })

  it("cycles reverse from action to shot", () => {
    expect(cycleBlockType("action", true)).toBe("shot")
  })

  it("returns action for unknown type", () => {
    expect(cycleBlockType("unknown" as BlockType)).toBe("action")
  })
})

// ── normalizeBlockText ──

describe("normalizeBlockText", () => {
  it("uppercases scene heading", () => {
    expect(normalizeBlockText({ id: "1", type: "scene_heading", text: "int. кухня — день" }))
      .toBe("INT. КУХНЯ — ДЕНЬ")
  })

  it("uppercases character name", () => {
    expect(normalizeBlockText({ id: "1", type: "character", text: "андрей" }))
      .toBe("АНДРЕЙ")
  })

  it("uppercases transition", () => {
    expect(normalizeBlockText({ id: "1", type: "transition", text: "cut to:" }))
      .toBe("CUT TO:")
  })

  it("preserves action text as-is", () => {
    const result = normalizeBlockText({ id: "1", type: "action", text: "АНДРЕЙ ВХОДИТ В КОМНАТУ" })
    expect(result).toBe("АНДРЕЙ ВХОДИТ В КОМНАТУ")
  })

  it("leaves dialogue as-is", () => {
    expect(normalizeBlockText({ id: "1", type: "dialogue", text: "Привет мир" }))
      .toBe("Привет мир")
  })
})

// ── reformatBlockAsType ──

describe("reformatBlockAsType", () => {
  it("adds INT. prefix for scene_heading", () => {
    expect(reformatBlockAsType("кухня", "scene_heading")).toBe("INT. КУХНЯ")
  })

  it("preserves existing INT. prefix", () => {
    const result = reformatBlockAsType("INT. КУХНЯ — ДЕНЬ", "scene_heading")
    expect(result).toBe("INT. КУХНЯ — ДЕНЬ")
  })

  it("uppercases character", () => {
    expect(reformatBlockAsType("андрей", "character")).toBe("АНДРЕЙ")
  })

  it("wraps parenthetical in parens", () => {
    expect(reformatBlockAsType("шёпотом", "parenthetical")).toBe("(шёпотом)")
  })

  it("doesn't double-wrap parenthetical", () => {
    expect(reformatBlockAsType("(шёпотом)", "parenthetical")).toBe("(шёпотом)")
  })

  it("adds colon for transition", () => {
    const result = reformatBlockAsType("cut to", "transition")
    expect(result.endsWith(":")).toBe(true)
  })
})

// ── parseTextToBlocks ──

describe("parseTextToBlocks", () => {
  it("parses a mini-screenplay", () => {
    const raw = `INT. КУХНЯ — ДЕНЬ

Андрей сидит за столом.

АНДРЕЙ
(тихо)
Мне пора.

CUT TO:`

    const blocks = parseTextToBlocks(raw)
    expect(blocks[0].type).toBe("scene_heading")
    expect(blocks[1].type).toBe("action")
    expect(blocks[2].type).toBe("character")
    expect(blocks[3].type).toBe("parenthetical")
    expect(blocks[4].type).toBe("dialogue")
    expect(blocks[5].type).toBe("transition")
  })

  it("skips blank lines", () => {
    const raw = "INT. КУХНЯ\n\n\n\nДействие."
    const blocks = parseTextToBlocks(raw)
    expect(blocks).toHaveLength(2)
  })

  it("assigns unique IDs to every block", () => {
    const raw = "INT. КУХНЯ\nДействие.\nEXT. ДВОР"
    const blocks = parseTextToBlocks(raw)
    const ids = blocks.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("parses full Russian screenplay with all block types", () => {
    const raw = `ИНТ. КВАРТИРА БОРИСА — НОЧЬ

Тесная комната. Единственный источник света — экран старого телевизора. БОРИС (55) сидит за столом, перебирая документы. Пепельница полная. Руки дрожат.

Телефон звонит. Борис смотрит на экран — номер скрыт. Медленно берёт трубку.

БОРИС
Алло?

ГОЛОС (V.O.)
Выходи. У тебя пять минут.

БОРИС
(шёпотом)
Кто это?

ЗАТЕМНЕНИЕ:`

    const blocks = parseTextToBlocks(raw)
    const types = blocks.map(b => b.type)

    expect(types[0]).toBe("scene_heading")   // ИНТ. КВАРТИРА БОРИСА — НОЧЬ
    expect(types[1]).toBe("action")          // Тесная комната...
    expect(types[2]).toBe("action")          // Телефон звонит...
    expect(types[3]).toBe("character")       // БОРИС
    expect(types[4]).toBe("dialogue")        // Алло?
    expect(types[5]).toBe("character")       // ГОЛОС (V.O.)
    expect(types[6]).toBe("dialogue")        // Выходи...
    expect(types[7]).toBe("character")       // БОРИС
    expect(types[8]).toBe("parenthetical")   // (шёпотом)
    expect(types[9]).toBe("dialogue")        // Кто это?
    expect(types[10]).toBe("transition")     // ЗАТЕМНЕНИЕ:
  })

  it("preserves dialogue chain across single blank line", () => {
    const raw = `АНДРЕЙ

Привет, как дела?`

    const blocks = parseTextToBlocks(raw)
    expect(blocks[0].type).toBe("character")
    expect(blocks[1].type).toBe("dialogue")
  })

  it("breaks chain on double blank line", () => {
    const raw = `АНДРЕЙ


Он встал и ушёл.`

    const blocks = parseTextToBlocks(raw)
    expect(blocks[0].type).toBe("character")
    expect(blocks[1].type).toBe("action") // double blank = new section
  })

  it("parses with initialPrevType context", () => {
    const raw = `Привет, как дела?`
    const blocks = parseTextToBlocks(raw, "character")
    expect(blocks[0].type).toBe("dialogue")
  })
})

// ── getLiveTypeConversion ──

describe("getLiveTypeConversion", () => {
  it("converts action starting with int. to scene_heading", () => {
    const result = getLiveTypeConversion({ id: "1", type: "action", text: "int. кухня" })
    expect(result).toBe("scene_heading")
  })

  it("converts action starting with ext. to scene_heading", () => {
    const result = getLiveTypeConversion({ id: "1", type: "action", text: "ext. парк" })
    expect(result).toBe("scene_heading")
  })

  it("converts action starting with инт. to scene_heading (Russian)", () => {
    const result = getLiveTypeConversion({ id: "1", type: "action", text: "инт. квартира" })
    expect(result).toBe("scene_heading")
  })

  it("converts action starting with экст. to scene_heading (Russian)", () => {
    const result = getLiveTypeConversion({ id: "1", type: "action", text: "экст. парк" })
    expect(result).toBe("scene_heading")
  })

  it("returns null for non-action block", () => {
    expect(getLiveTypeConversion({ id: "1", type: "dialogue", text: "int. something" })).toBeNull()
  })

  it("returns null for regular action text", () => {
    expect(getLiveTypeConversion({ id: "1", type: "action", text: "Андрей идёт." })).toBeNull()
  })
})

// ── extractCharacterNames ──

describe("extractCharacterNames", () => {
  it("extracts unique sorted names", () => {
    const blocks: Block[] = [
      { id: "1", type: "character", text: "МАРИЯ" },
      { id: "2", type: "dialogue", text: "Привет." },
      { id: "3", type: "character", text: "АНДРЕЙ" },
      { id: "4", type: "dialogue", text: "Пока." },
      { id: "5", type: "character", text: "МАРИЯ (V.O.)" },
      { id: "6", type: "dialogue", text: "Ещё раз." },
    ]
    const names = extractCharacterNames(blocks)
    expect(names).toContain("МАРИЯ")
    expect(names).toContain("АНДРЕЙ")
  })

  it("ignores non-character blocks", () => {
    const blocks: Block[] = [
      { id: "1", type: "action", text: "АНДРЕЙ" },
    ]
    expect(extractCharacterNames(blocks)).toHaveLength(0)
  })
})

// ── Block operations ──

describe("block operations", () => {
  const blocks: Block[] = [
    { id: "a", type: "scene_heading", text: "INT. КУХНЯ" },
    { id: "b", type: "action", text: "Действие." },
    { id: "c", type: "character", text: "АНДРЕЙ" },
  ]

  it("insertBlockAfter inserts at correct position", () => {
    const newBlock = makeBlock("dialogue", "Привет.")
    const result = insertBlockAfter(blocks, "b", newBlock)
    expect(result).toHaveLength(4)
    expect(result[2].type).toBe("dialogue")
    expect(result[3].id).toBe("c")
  })

  it("insertBlockAfter appends if id not found", () => {
    const newBlock = makeBlock("dialogue", "Привет.")
    const result = insertBlockAfter(blocks, "nonexistent", newBlock)
    expect(result).toHaveLength(4)
    expect(result[3].type).toBe("dialogue")
  })

  it("updateBlockText updates correct block", () => {
    const result = updateBlockText(blocks, "b", "Новое действие.")
    expect(result[1].text).toBe("Новое действие.")
    expect(result[0].text).toBe("INT. КУХНЯ") // untouched
  })

  it("removeBlock removes correct block", () => {
    const result = removeBlock(blocks, "b")
    expect(result).toHaveLength(2)
    expect(result.find((b) => b.id === "b")).toBeUndefined()
  })
})

// ── Universal format (YouTube / Reels / Ad) ──

describe("Universal format parsing", () => {
  it("[SECTION] tag → scene_heading", () => {
    const blocks = parseTextToBlocks("[ИНТРО — 3 сек]\nТИТР: КАК УВЕЛИЧИТЬ КОНВЕРСИЮ")
    expect(blocks[0].type).toBe("scene_heading")
    expect(blocks[0].text).toBe("ИНТРО")
  })

  it("[SECTION] without duration → scene_heading with full text", () => {
    const blocks = parseTextToBlocks("[РЕЗУЛЬТАТ]")
    expect(blocks[0].type).toBe("scene_heading")
    expect(blocks[0].text).toBe("РЕЗУЛЬТАТ")
  })

  it("ГОЛОС: text → character + dialogue", () => {
    const blocks = parseTextToBlocks("[INTRO]\nГОЛОС: Привет, сегодня разберём три способа.")
    expect(blocks).toHaveLength(3) // heading + character + dialogue
    expect(blocks[1].type).toBe("character")
    expect(blocks[1].text).toBe("ГОЛОС")
    expect(blocks[2].type).toBe("dialogue")
    expect(blocks[2].text).toBe("Привет, сегодня разберём три способа.")
  })

  it("VOICE: text → character + dialogue (English)", () => {
    const blocks = parseTextToBlocks("VOICE: Hello, today we discuss three methods.")
    expect(blocks[0].type).toBe("character")
    expect(blocks[0].text).toBe("VOICE")
    expect(blocks[1].type).toBe("dialogue")
  })

  it("ТИТР: text → action", () => {
    const blocks = parseTextToBlocks("ТИТР: КАК УВЕЛИЧИТЬ КОНВЕРСИЮ")
    expect(blocks[0].type).toBe("action")
    expect(blocks[0].text).toBe("ТИТР: КАК УВЕЛИЧИТЬ КОНВЕРСИЮ")
  })

  it("ГРАФИКА: text → action", () => {
    const blocks = parseTextToBlocks("ГРАФИКА: анимированная воронка")
    expect(blocks[0].type).toBe("action")
  })

  it("МУЗЫКА: text → action", () => {
    const blocks = parseTextToBlocks("МУЗЫКА: энергичный бит, 120 bpm")
    expect(blocks[0].type).toBe("action")
  })

  it("full YouTube script parses correctly", () => {
    const script = `[ИНТРО — 3 сек]
МУЗЫКА: энергичный бит
ТИТР: КАК УВЕЛИЧИТЬ КОНВЕРСИЮ

[ГОВОРЯЩАЯ ГОЛОВА — 12 сек]
ГОЛОС: Привет! Сегодня разберём три способа увеличить конверсию.

[СПОСОБ 1 — 15 сек]
ГОЛОС: Первый способ — заголовок. Меняем одно слово.
ГРАФИКА: A/B тест, два варианта

[CTA — 5 сек]
ГОЛОС: Подписывайтесь, ставьте лайк.
ТИТР: ПОДПИШИСЬ`

    const blocks = parseTextToBlocks(script)
    const headings = blocks.filter((b) => b.type === "scene_heading")
    const chars = blocks.filter((b) => b.type === "character")
    const dialogues = blocks.filter((b) => b.type === "dialogue")
    const actions = blocks.filter((b) => b.type === "action")

    expect(headings).toHaveLength(4) // ИНТРО, ГОВОРЯЩАЯ ГОЛОВА, СПОСОБ 1, CTA
    expect(headings[0].text).toBe("ИНТРО")
    expect(headings[1].text).toBe("ГОВОРЯЩАЯ ГОЛОВА")
    expect(headings[2].text).toBe("СПОСОБ 1")
    expect(headings[3].text).toBe("CTA")

    expect(chars).toHaveLength(3) // 3× ГОЛОС
    expect(chars.every((c) => c.text === "ГОЛОС")).toBe(true)

    expect(dialogues).toHaveLength(3)

    // МУЗЫКА, ТИТР×2, ГРАФИКА = 4 actions
    expect(actions.length).toBeGreaterThanOrEqual(4)
  })

  it("mixed film + YouTube works", () => {
    const script = `INT. КУХНЯ - УТРО
Марина стоит у окна.

[ИНТЕРВЬЮ — 10 сек]
ГОЛОС: Расскажите о вашем проекте.`

    const blocks = parseTextToBlocks(script)
    expect(blocks[0].type).toBe("scene_heading") // INT.
    expect(blocks[0].text).toBe("INT. КУХНЯ - УТРО")
    expect(blocks[1].type).toBe("action")
    expect(blocks[2].type).toBe("scene_heading") // [ИНТЕРВЬЮ]
    expect(blocks[2].text).toBe("ИНТЕРВЬЮ")
    expect(blocks[3].type).toBe("character") // ГОЛОС
    expect(blocks[4].type).toBe("dialogue")
  })
})
