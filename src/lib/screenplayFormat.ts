/**
 * KOZA Screenplay Format Engine v2
 * Block-based architecture inspired by Arc Studio Pro.
 *
 * Core idea: the screenplay is NOT a flat string of lines.
 * It's an ordered list of BLOCKS, each with an explicit type.
 * Formatting is deterministic — no regex guessing from context.
 *
 * Block types follow WGA / Final Draft industry standard:
 *   scene_heading  — INT./EXT. LOCATION — TIME
 *   action         — narrative description (present tense)
 *   character      — speaker name (ALL CAPS, centered-ish)
 *   parenthetical  — (wryly), (beat), (V.O.), (O.S.)
 *   dialogue       — spoken text
 *   transition     — CUT TO:, FADE OUT., SMASH CUT TO:
 *   shot           — INSERT, CLOSE ON, ANGLE ON (optional)
 *   separator      — blank line between blocks (virtual)
 */

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type BlockType =
  | "scene_heading"
  | "action"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "transition"
  | "shot"

export interface Block {
  id: string
  type: BlockType
  text: string
  // ── Production fields (optional, Slate.js ignores unknown props) ──
  durationMs?: number
  durationSource?: "auto" | "manual" | "media"
  visual?: import("./productionTypes").ProductionVisual | null
  voiceClipId?: string | null
  sfxHints?: string[]
  shotGroupId?: string | null
  modifier?: import("./productionTypes").BlockModifier | null
  locked?: boolean
}

/** What the Enter key produces after each block type */
export type FlowConfig = {
  afterSceneHeading: BlockType   // default: "action"
  afterAction: BlockType         // default: "action"
  afterCharacter: BlockType      // default: "dialogue"
  afterParenthetical: BlockType  // default: "dialogue"
  afterDialogue: BlockType       // default: "character"
  afterTransition: BlockType     // default: "action"
  afterShot: BlockType           // default: "action"
}

export const DEFAULT_FLOW: FlowConfig = {
  afterSceneHeading: "action",
  afterAction: "action",
  afterCharacter: "dialogue",
  afterParenthetical: "dialogue",
  afterDialogue: "character",
  afterTransition: "action",
  afterShot: "action",
}

// ─────────────────────────────────────────────────────────────
// BLOCK ID GENERATOR
// ─────────────────────────────────────────────────────────────

let _idCounter = 0
export function makeBlockId(): string {
  return `blk_${Date.now()}_${++_idCounter}`
}

export function makeBlock(type: BlockType, text = ""): Block {
  return { id: makeBlockId(), type, text }
}

// ─────────────────────────────────────────────────────────────
// BLOCK CYCLE
// ─────────────────────────────────────────────────────────────

const CYCLE_ORDER: BlockType[] = [
  "action",
  "scene_heading",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
  "shot",
]

export function cycleBlockType(current: BlockType, reverse = false): BlockType {
  const idx = CYCLE_ORDER.indexOf(current)
  if (idx === -1) return "action"
  const next = reverse
    ? (idx - 1 + CYCLE_ORDER.length) % CYCLE_ORDER.length
    : (idx + 1) % CYCLE_ORDER.length
  return CYCLE_ORDER[next]
}

// ─────────────────────────────────────────────────────────────
// AUTO-DETECT FROM RAW TEXT (for paste / import)
// ─────────────────────────────────────────────────────────────

const RE_SCENE_HEADING = /^(INT\.\s*\/\s*EXT\.\s*|EXT\.\s*\/\s*INT\.\s*|INT\.\s*|EXT\.\s*|I\/E\.\s*|ИНТ\.\s*\/\s*ЭКСТ\.\s*|ЭКСТ\.\s*\/\s*ИНТ\.\s*|ИНТ\.\s*|ЭКСТ\.\s*|EST\.\s*)/i
const RE_TRANSITION    = /^(FADE\s+(IN:?|OUT[\.::]?|TO\s+BLACK:?)|CUT\s+TO:|SMASH\s+CUT\s+TO:|MATCH\s+CUT\s+TO:|DISSOLVE\s+TO:|WIPE\s+TO:|IRIS\s+(IN|OUT):?|JUMP\s+CUT\s+TO:|FREEZE\s+FRAME:?|ЗАТЕМНЕНИЕ:?|ПЕРЕХОД:?|НАПЛЫВ:?|ВЫТЕСНЕНИЕ:?|СТОП-КАДР:?)$|.*\s+TO:$/i
const RE_SHOT          = /^(INSERT|BACK\s+TO\s+SCENE|CLOSE\s+ON|CLOSE-UP|ANGLE\s+ON|POV|WIDE\s+ON|INTERCUT\s+WITH|SERIES\s+OF\s+SHOTS|КРУПНЫЙ\s+ПЛАН:?|КРУПНО:?|ДЕТАЛЬ:?|ОБЩИЙ\s+ПЛАН:?|СРЕДНИЙ\s+ПЛАН:?|ВСТАВКА:?|РАКУРС:?|ИНТЕРКАТ:?|ОБРАТНЫЙ\s+КАДР:?|СЕРИЯ\s+КАДРОВ:?):?$/i
const RE_PARENTHETICAL = /^\(.*\)$/

// ── Universal format: YouTube / Reels / Ad section tags + track hints ──
const RE_SECTION_TAG   = /^\[(.+)\]\s*$/
const RE_VOICE_HINT    = /^(ГОЛОС|VOICE|NARRATOR|ВЕДУЩИЙ|СПИКЕР):\s*/i
const RE_VISUAL_HINT   = /^(ТИТР|TITLE|ГРАФИКА|GRAPHICS|B-ROLL|CTA):\s*/i
const RE_MUSIC_HINT    = /^(МУЗЫКА|MUSIC|SFX|ЗВУК):\s*/i

/**
 * Detect block type from raw text in context of surrounding blocks.
 * Used only for import/paste — not for live typing.
 *
 * Supports both traditional screenplays (INT./EXT.) and
 * universal formats (YouTube/Reels/Ad: [SECTION], ГОЛОС:, ТИТР:).
 */
export function detectBlockType(
  lines: string[],
  index: number,
  prevType: BlockType | null
): BlockType {
  const raw     = lines[index] ?? ""
  const trimmed = raw.trim()

  if (!trimmed) return "action" // blank lines are collapsed

  // ── Universal format: [SECTION] tags → scene_heading ──
  if (RE_SECTION_TAG.test(trimmed)) return "scene_heading"

  // ── Universal format: ГОЛОС: → character (split in parseTextToBlocks) ──
  if (RE_VOICE_HINT.test(trimmed)) return "character"

  // ── Universal format: ТИТР: / ГРАФИКА: → action ──
  if (RE_VISUAL_HINT.test(trimmed)) return "action"

  // ── Universal format: МУЗЫКА: → action ──
  if (RE_MUSIC_HINT.test(trimmed)) return "action"

  if (RE_SCENE_HEADING.test(trimmed)) return "scene_heading"

  // Fountain force-prefix
  if (trimmed.startsWith(".") && trimmed.length > 1 && !trimmed.startsWith(".."))
    return "scene_heading"

  if (RE_TRANSITION.test(trimmed)) return "transition"
  if (RE_SHOT.test(trimmed))       return "shot"

  if (RE_PARENTHETICAL.test(trimmed)) {
    if (prevType === "character" || prevType === "parenthetical" || prevType === "dialogue")
      return "parenthetical"
    return "action"
  }

  // Character heuristic: ALL CAPS, short, no punctuation, after blank/action
  // Strip character extensions: (V.O.), (O.S.), (CONT'D), age (55), (25 лет), etc.
  const stripped = trimmed
    .replace(/\s*\((V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT'?D|ПРОД\.?)\)\s*$/i, "")
    .replace(/\s*\(\d+(?:\s*(?:лет|years?|г\.?))?\)\s*$/i, "")
  const isAllCaps =
    stripped === stripped.toUpperCase() &&
    stripped !== stripped.toLocaleLowerCase() &&
    stripped.length > 1 &&
    stripped.length < 52 &&
    /\p{Lu}/u.test(stripped) &&
    !RE_SCENE_HEADING.test(stripped) &&
    !RE_TRANSITION.test(trimmed)

  if (isAllCaps) {
    const prevLine = lines[index - 1]?.trim()
    const prevEmpty = !prevLine
    if (prevEmpty || prevType === "action" || prevType === "transition" || prevType === "scene_heading") {
      return "character"
    }
  }

  // Dialogue: follows character / parenthetical / dialogue
  if (
    prevType === "character" ||
    prevType === "parenthetical" ||
    prevType === "dialogue"
  ) {
    // After dialogue + blank line: check if this is action, not continuation.
    // Action heuristics: describes what someone DOES (third person),
    // mentions character names as subjects, or is a stage direction.
    if (prevType === "dialogue") {
      // If previous line was blank, and this line looks like action → not dialogue.
      const prevLine = (index > 0 ? lines[index - 1]?.trim() : "") ?? ""
      if (prevLine === "") {
        // After blank: check if text looks like action (third person narrative)
        // Pattern: starts with a name + verb, or describes physical action
        if (/^[A-ZА-ЯЁ][a-zа-яё]+\s+[a-zа-яё]/.test(trimmed)) return "action"
        // Long text after blank = likely action description
        if (trimmed.length > 60) return "action"
        // Contains stage direction verbs
        if (/\b(поднимает|входит|выходит|садится|встаёт|берёт|смотрит|открывает|закрывает|поворачивается|уходит|уплывает|плывёт|стоит|идёт|бежит|reaches|picks up|enters|exits|sits|stands|walks|runs|looks|opens|closes|turns)\b/i.test(trimmed)) return "action"
      }
    }
    return "dialogue"
  }

  return "action"
}

// ─────────────────────────────────────────────────────────────
// SMART TEXT TRANSFORMS (live typing triggers)
// ─────────────────────────────────────────────────────────────

/**
 * Inspect the text of an action block as the user types.
 * If they type "int." or "ext." at the start → auto-convert to scene_heading.
 * Returns a new BlockType or null if no change needed.
 */
export function getLiveTypeConversion(block: Block): BlockType | null {
  if (block.type !== "action") return null

  const t = block.text.trimStart().toLowerCase()

  if (
    t.startsWith("int.") ||
    t.startsWith("ext.") ||
    t.startsWith("int./ext.") ||
    t.startsWith("ext./int.") ||
    t.startsWith("i/e.") ||
    t.startsWith("инт.") ||
    t.startsWith("экст.") ||
    t.startsWith("инт./экст.") ||
    t.startsWith("экст./инт.")
  ) {
    return "scene_heading"
  }

  return null
}

// ─────────────────────────────────────────────────────────────
// TEXT NORMALIZATION PER TYPE
// ─────────────────────────────────────────────────────────────

/**
 * Normalize text when a block is committed (on Enter / blur).
 * Scene heading → UPPERCASE. Character → UPPERCASE.
 * Everything else → as-is.
 */
export function normalizeBlockText(block: Block): string {
  switch (block.type) {
    case "scene_heading":
      return block.text.toUpperCase()
    case "character":
      return block.text.toUpperCase()
    case "transition":
      return block.text.toUpperCase()
    case "action":
      // Preserve original text — don't force sentence case on pasted/imported text.
      // Action blocks keep the author's intended casing.
      return block.text
    default:
      return block.text
  }
}

function stripOuterParentheses(text: string): string {
  const t = text.trim()
  if (t.startsWith("(") && t.endsWith(")") && t.length >= 2) {
    return t.slice(1, -1).trim()
  }
  return t
}

function toSentenceCase(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ""

  const lower = trimmed.toLocaleLowerCase()
  const firstLetterIndex = lower.search(/[\p{L}\p{N}]/u)
  if (firstLetterIndex === -1) return lower

  return (
    lower.slice(0, firstLetterIndex) +
    lower.charAt(firstLetterIndex).toLocaleUpperCase() +
    lower.slice(firstLetterIndex + 1)
  )
}

/**
 * Reformat block text to match a target type (for type-change shortcuts).
 * Strips force-markers and re-applies appropriate casing / wrapping.
 */
export function reformatBlockAsType(text: string, targetType: BlockType): string {
  let clean = text.trim()
  // Strip Fountain force-markers
  if (clean.startsWith(".") && !clean.startsWith("..")) clean = clean.slice(1).trim()
  if (clean.startsWith("@")) clean = clean.slice(1).trim()
  if (clean.startsWith(">") && !clean.startsWith(">>")) clean = clean.slice(1).trim()
  // Strip INT./EXT. prefix before reformatting
  clean = clean.replace(RE_SCENE_HEADING, "").trim() || clean

  // If leaving parenthetical, remove wrapper parentheses.
  if (targetType !== "parenthetical") {
    clean = stripOuterParentheses(clean)
  }

  switch (targetType) {
    case "scene_heading": {
      const up = clean.toUpperCase()
      return RE_SCENE_HEADING.test(up) ? up : "INT. " + up
    }
    case "character":
      return clean.toUpperCase()
    case "parenthetical":
      if (clean.startsWith("(") && clean.endsWith(")")) return clean
      return `(${clean})`
    case "transition": {
      const up = clean.toUpperCase()
      return RE_TRANSITION.test(up) ? up : up + (up.endsWith(":") ? "" : ":")
    }
    case "action":
      return clean
    default:
      return clean
  }
}

// ─────────────────────────────────────────────────────────────
// CHARACTER NAME EXTRACTION
// ─────────────────────────────────────────────────────────────

/**
 * Extract unique character names from the block list.
 * Used for autocomplete when user types in a character block.
 */
export function extractCharacterNames(blocks: Block[]): string[] {
  const names = new Set<string>()
  for (const block of blocks) {
    if (block.type === "character" && block.text.trim().length > 1) {
      // Strip extensions like (V.O.), (O.S.)
      // Strip all trailing parentheticals: (V.O.), (55), (CONT'D) etc.
      const clean = block.text.trim()
        .replace(/\s*\(\d+(?:\s*(?:лет|years?|г\.?))?\)\s*$/i, "")
        .replace(/\s*\(.*\)\s*$/, "")
        .trim()
      if (clean) names.add(clean)
    }
  }
  return Array.from(names).sort()
}

// ─────────────────────────────────────────────────────────────
// IMPORT: plain text / Fountain → blocks
// ─────────────────────────────────────────────────────────────

/**
 * Parse a raw screenplay string (plain text or Fountain) into blocks.
 * Blank lines between elements are collapsed (not stored as blocks).
 */
export function parseTextToBlocks(raw: string, initialPrevType?: BlockType | null): Block[] {
  const lines = raw.split("\n")
  const blocks: Block[] = []
  let prevType: BlockType | null = initialPrevType ?? null
  let blankCount = 0

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) {
      blankCount++
      // Two+ blank lines always break the chain (new scene/section)
      if (blankCount >= 2) {
        prevType = null
      }
      continue
    }

    // Single blank line: check if this looks like a dialogue continuation.
    // In pasted screenplays, character→blank→dialogue is common formatting.
    // Only reset prevType if the blank line is NOT between character/dialogue chain.
    if (blankCount === 1 && prevType !== null) {
      const isDialogueChain = prevType === "character" || prevType === "parenthetical" || prevType === "dialogue"
      if (!isDialogueChain) {
        // Not in a dialogue chain — blank line is a normal separator, keep prevType
        // (prevType stays so action→blank→action still works, and character detection
        //  after action→blank still fires)
      }
      // In dialogue chains, prevType is preserved so the next line can be detected as dialogue
    }

    blankCount = 0
    const type = detectBlockType(lines, i, prevType)

    // ── Universal format: [SECTION — Ns] → scene_heading with clean title ──
    if (type === "scene_heading" && RE_SECTION_TAG.test(trimmed)) {
      const inner = trimmed.match(RE_SECTION_TAG)![1]
      // Strip duration suffix: "ИНТРО — 3 сек" → "ИНТРО"
      const title = inner.replace(/\s*[—\-–]\s*\d+\s*(сек|sec|с|s|мин|min|мін)\s*/i, "").trim()
      blocks.push({ id: makeBlockId(), type: "scene_heading", text: title || inner })
      prevType = "scene_heading"
      continue
    }

    // ── Universal format: ГОЛОС: text → character "ГОЛОС" + dialogue "text" ──
    if (type === "character" && RE_VOICE_HINT.test(trimmed)) {
      const hintMatch = trimmed.match(RE_VOICE_HINT)!
      const speakerName = hintMatch[1].toUpperCase()
      const dialogueText = trimmed.slice(hintMatch[0].length).trim()

      blocks.push({ id: makeBlockId(), type: "character", text: speakerName })
      prevType = "character"

      if (dialogueText) {
        blocks.push({ id: makeBlockId(), type: "dialogue", text: dialogueText })
        prevType = "dialogue"
      }
      continue
    }

    const block: Block = { id: makeBlockId(), type, text: trimmed }
    blocks.push(block)
    prevType = type
  }

  return blocks
}

// ─────────────────────────────────────────────────────────────
// EXPORT: blocks → plain text / Fountain
// ─────────────────────────────────────────────────────────────

const INDENT = {
  scene_heading:  "",
  action:         "",
  character:      "                    ",   // ~20 spaces (standard)
  parenthetical:  "               ",        // ~15 spaces
  dialogue:       "          ",             // ~10 spaces
  transition:     "                                        ", // ~40 spaces (right-aligned approx)
  shot:           "",
}

/**
 * Export blocks to a Courier-formatted plain text string.
 * Standard screenplay margins (approximate with spaces).
 */
export function exportBlocksToText(blocks: Block[]): string {
  const lines: string[] = []

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    const prev  = blocks[i - 1]

    // Blank line before scene headings and transitions (industry standard)
    const needsBlankBefore =
      block.type === "scene_heading" ||
      block.type === "transition" ||
      (block.type === "character" && prev?.type !== "parenthetical")

    if (i > 0 && needsBlankBefore) {
      lines.push("")
    }

    const indent = INDENT[block.type]
    lines.push(indent + normalizeBlockText(block))

    // Blank line after scene headings
    if (block.type === "scene_heading") {
      lines.push("")
    }
  }

  return lines.join("\n")
}

// ─────────────────────────────────────────────────────────────
// BLOCK LIST OPERATIONS
// ─────────────────────────────────────────────────────────────

/** Insert a new block after the block with the given id */
export function insertBlockAfter(
  blocks: Block[],
  afterId: string,
  newBlock: Block
): Block[] {
  const idx = blocks.findIndex((b) => b.id === afterId)
  if (idx === -1) return [...blocks, newBlock]
  return [...blocks.slice(0, idx + 1), newBlock, ...blocks.slice(idx + 1)]
}

/** Update text of a specific block */
export function updateBlockText(blocks: Block[], id: string, text: string): Block[] {
  return blocks.map((b) => (b.id === id ? { ...b, text } : b))
}

/** Change type of a specific block, reformatting its text */
export function changeBlockType(blocks: Block[], id: string, newType: BlockType): Block[] {
  return blocks.map((b) => {
    if (b.id !== id) return b
    return { ...b, type: newType, text: reformatBlockAsType(b.text, newType) }
  })
}

/** Remove a block by id */
export function removeBlock(blocks: Block[], id: string): Block[] {
  return blocks.filter((b) => b.id !== id)
}
