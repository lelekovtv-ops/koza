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

const RE_SCENE_HEADING = /^(INT\.|EXT\.|INT\.\/EXT\.|EXT\.\/INT\.|I\/E\.|EST\.)\s*/i
const RE_TRANSITION    = /^(FADE\s+(IN|OUT(\.|:)|TO\s+BLACK)|CUT\s+TO:|SMASH\s+CUT\s+TO:|MATCH\s+CUT\s+TO:|DISSOLVE\s+TO:|WIPE\s+TO:|IRIS\s+(IN|OUT)|JUMP\s+CUT\s+TO:|FREEZE\s+FRAME:?)$|.*\s+TO:$/i
const RE_SHOT          = /^(INSERT|BACK\s+TO\s+SCENE|CLOSE\s+ON|CLOSE-UP|ANGLE\s+ON|POV|WIDE\s+ON|INTERCUT\s+WITH|SERIES\s+OF\s+SHOTS):?$/i
const RE_PARENTHETICAL = /^\(.*\)$/

/**
 * Detect block type from raw text in context of surrounding blocks.
 * Used only for import/paste — not for live typing.
 */
export function detectBlockType(
  lines: string[],
  index: number,
  prevType: BlockType | null
): BlockType {
  const raw     = lines[index] ?? ""
  const trimmed = raw.trim()

  if (!trimmed) return "action" // blank lines are collapsed

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
  const stripped = trimmed.replace(/\s*\((V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT'?D)\)\s*$/i, "")
  const isAllCaps =
    stripped === stripped.toUpperCase() &&
    stripped.length > 1 &&
    stripped.length < 52 &&
    /[A-Z]/.test(stripped) &&
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
    t.startsWith("i/e.")
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
      return toSentenceCase(block.text)
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
      return toSentenceCase(clean)
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
      const clean = block.text.trim().replace(/\s*\(.*\)\s*$/, "").trim()
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
export function parseTextToBlocks(raw: string): Block[] {
  const lines = raw.split("\n")
  const blocks: Block[] = []
  let prevType: BlockType | null = null

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) {
      prevType = null // blank line resets dialogue chain
      continue
    }
    const type = detectBlockType(lines, i, prevType)
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
