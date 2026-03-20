#!/bin/bash
set -e
PROJECT="/Users/macbookbpm/Desktop/KOZA"
echo "Writing screenplayFormat.ts..."
cat > "$PROJECT/src/lib/screenplayFormat.ts" << 'ENDOFFILE'
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
// SMART ENTER — what block comes next
// ─────────────────────────────────────────────────────────────

/**
 * Given the current block and its text state, return the next block type.
 * This is the central routing logic — deterministic, no guessing.
 *
 * Special cases:
 *  - Empty dialogue + Enter → exit dialogue block → action
 *  - Filled dialogue + Enter → next character (default) or action (flow config)
 *  - Tab on empty action → character
 *  - Tab on empty character → action (toggle)
 */
export function getNextBlockType(
  current: Block,
  flow: FlowConfig = DEFAULT_FLOW
): BlockType {
  switch (current.type) {
    case "scene_heading":   return flow.afterSceneHeading
    case "action":          return flow.afterAction
    case "character":       return flow.afterCharacter
    case "parenthetical":   return flow.afterParenthetical
    case "dialogue":
      // Empty dialogue line = exit block → action
      if (!current.text.trim()) return "action"
      return flow.afterDialogue
    case "transition":      return flow.afterTransition
    case "shot":            return flow.afterShot
    default:                return "action"
  }
}

// ─────────────────────────────────────────────────────────────
// TAB BEHAVIOUR — Arc Studio style
// ─────────────────────────────────────────────────────────────

/**
 * Tab key logic (Arc Studio model):
 *  - Empty action   → character
 *  - Empty character → action  (toggle)
 *  - Filled character → parenthetical
 *  - Everything else → cycle through element list
 */
export function getTabBlockType(current: Block): BlockType {
  const empty = !current.text.trim()

  if (current.type === "action" && empty) return "character"
  if (current.type === "character" && empty) return "action"
  if (current.type === "character" && !empty) return "parenthetical"

  // Generic cycle for power users
  return cycleBlockType(current.type, false)
}

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
    default:
      return block.text
  }
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
    default:
      return clean
  }
}

// ─────────────────────────────────────────────────────────────
// SCENE HEADING AUTOCOMPLETE
// ─────────────────────────────────────────────────────────────

const TIME_OF_DAY_OPTIONS = ["DAY", "NIGHT", "MORNING", "EVENING", "AFTERNOON", "DUSK", "DAWN", "CONTINUOUS", "LATER", "MOMENTS LATER"]

/**
 * Given a partial scene heading, suggest completions.
 * Triggers after the user types " - " (dash with spaces).
 */
export function getSceneHeadingCompletions(text: string): string[] {
  const upper = text.toUpperCase()
  const hasDash = upper.includes(" - ")
  if (!hasDash) return []

  const afterDash = upper.split(" - ").pop() ?? ""
  return TIME_OF_DAY_OPTIONS.filter((t) => t.startsWith(afterDash) && t !== afterDash)
}

// ─────────────────────────────────────────────────────────────
// CHARACTER AUTOCOMPLETE
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

/**
 * Given partial character name input, return matching known names.
 */
export function getCharacterCompletions(partial: string, blocks: Block[]): string[] {
  const all = extractCharacterNames(blocks)
  const up = partial.toUpperCase()
  return all.filter((name) => name.startsWith(up) && name !== up)
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
// DISPLAY HELPERS
// ─────────────────────────────────────────────────────────────

export function getBlockLabel(type: BlockType): string {
  switch (type) {
    case "scene_heading":  return "Scene Heading"
    case "action":         return "Action"
    case "character":      return "Character"
    case "parenthetical":  return "Parenthetical"
    case "dialogue":       return "Dialogue"
    case "transition":     return "Transition"
    case "shot":           return "Shot"
    default:               return "Action"
  }
}

/** Keyboard shortcut label for each block type (Arc Studio Cmd+1..7 style) */
export function getBlockShortcut(type: BlockType): string {
  switch (type) {
    case "scene_heading":  return "⌘1"
    case "action":         return "⌘2"
    case "character":      return "⌘3"
    case "parenthetical":  return "⌘4"
    case "dialogue":       return "⌘5"
    case "shot":           return "⌘6"
    case "transition":     return "⌘7"
    default:               return ""
  }
}

/** Map Cmd+1..7 key number to block type */
export function blockTypeFromShortcutKey(key: string): BlockType | null {
  const map: Record<string, BlockType> = {
    "1": "scene_heading",
    "2": "action",
    "3": "character",
    "4": "parenthetical",
    "5": "dialogue",
    "6": "shot",
    "7": "transition",
  }
  return map[key] ?? null
}

// ─────────────────────────────────────────────────────────────
// STATISTICS
// ─────────────────────────────────────────────────────────────

export interface ScreenplayStats {
  scenes: number
  pages: number       // approx: 1 page ≈ 55 lines of Courier 12pt
  characters: number  // unique character names
  words: number
}

export function getScreenplayStats(blocks: Block[]): ScreenplayStats {
  const scenes     = blocks.filter((b) => b.type === "scene_heading").length
  const totalLines = blocks.length + blocks.filter((b) => b.type === "scene_heading").length // blank lines after headings
  const pages      = Math.max(1, Math.ceil(totalLines / 55))
  const charNames  = extractCharacterNames(blocks)
  const words      = blocks.reduce((sum, b) => sum + b.text.split(/\s+/).filter(Boolean).length, 0)

  return { scenes, pages, characters: charNames.length, words }
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

/** Merge block with the previous one (Backspace on empty block) */
export function mergeWithPrev(blocks: Block[], id: string): Block[] {
  const idx = blocks.findIndex((b) => b.id === id)
  if (idx <= 0) return blocks
  const prev = blocks[idx - 1]
  const curr = blocks[idx]
  const merged: Block = { ...prev, text: prev.text + curr.text }
  return [...blocks.slice(0, idx - 1), merged, ...blocks.slice(idx + 1)]
}

ENDOFFILE
echo "Writing script.ts..."
cat > "$PROJECT/src/store/script.ts" << 'ENDOFFILE'
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { useProjectsStore } from "@/store/projects"
import {
  type Block,
  type FlowConfig,
  DEFAULT_FLOW,
  makeBlock,
  parseTextToBlocks,
  exportBlocksToText,
  insertBlockAfter,
  updateBlockText,
  changeBlockType,
  removeBlock,
  type BlockType,
} from "@/lib/screenplayFormat"

type ScriptDocument = {
  scenario: string   // plain text (export from blocks, kept for compat)
  blocks: Block[]    // source of truth
  title: string
  author: string
  draft: string
  date: string
  flow: FlowConfig   // per-project flow config
}

interface ScriptState extends ScriptDocument {
  activeProjectId: string | null
  projectScripts: Record<string, ScriptDocument>

  // ── Scenario (plain text, legacy compat) ──
  setScenario: (text: string) => void

  // ── Block operations ──
  setBlocks: (blocks: Block[]) => void
  addBlockAfter: (afterId: string, type: BlockType) => void
  updateBlock: (id: string, text: string) => void
  changeType: (id: string, type: BlockType) => void
  deleteBlock: (id: string) => void
  setFlow: (flow: Partial<FlowConfig>) => void

  // ── Metadata ──
  setTitle: (title: string) => void
  setAuthor: (author: string) => void
  setDraft: (draft: string) => void
  setDate: (date: string) => void

  // ── Project switching ──
  setActiveProject: (projectId: string | null) => void
}

const createDefaultScript = (): ScriptDocument => {
  const defaultBlocks: Block[] = [makeBlock("action", "")]
  return {
    scenario: "",
    blocks: defaultBlocks,
    title: "UNTITLED",
    author: "",
    draft: "First Draft",
    date: new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    flow: DEFAULT_FLOW,
  }
}

// Sync blocks → scenario text on every block change
function syncScenario(blocks: Block[]): string {
  return exportBlocksToText(blocks)
}

function updateCurrentProjectScript(
  state: ScriptState,
  patch: Partial<ScriptDocument>
): Pick<ScriptState, "projectScripts"> {
  if (!state.activeProjectId) return { projectScripts: state.projectScripts }
  const current = state.projectScripts[state.activeProjectId] || createDefaultScript()
  return {
    projectScripts: {
      ...state.projectScripts,
      [state.activeProjectId]: { ...current, ...patch },
    },
  }
}

export const useScriptStore = create<ScriptState>()(
  persist(
    (set, get) => ({
      ...createDefaultScript(),
      activeProjectId: null,
      projectScripts: {},

      // ── Scenario (plain text import) ──
      setScenario: (text) => {
        const blocks = parseTextToBlocks(text)
        const scenario = syncScenario(blocks)
        set((state) => ({
          scenario,
          blocks,
          ...updateCurrentProjectScript(state, { scenario, blocks }),
        }))
      },

      // ── Block operations ──
      setBlocks: (blocks) => {
        const scenario = syncScenario(blocks)
        set((state) => ({
          blocks,
          scenario,
          ...updateCurrentProjectScript(state, { blocks, scenario }),
        }))
      },

      addBlockAfter: (afterId, type) => {
        const newBlock = makeBlock(type)
        set((state) => {
          const blocks = insertBlockAfter(state.blocks, afterId, newBlock)
          const scenario = syncScenario(blocks)
          return {
            blocks,
            scenario,
            ...updateCurrentProjectScript(state, { blocks, scenario }),
          }
        })
        return newBlock.id
      },

      updateBlock: (id, text) => {
        set((state) => {
          const blocks = updateBlockText(state.blocks, id, text)
          const scenario = syncScenario(blocks)
          return {
            blocks,
            scenario,
            ...updateCurrentProjectScript(state, { blocks, scenario }),
          }
        })
      },

      changeType: (id, type) => {
        set((state) => {
          const blocks = changeBlockType(state.blocks, id, type)
          const scenario = syncScenario(blocks)
          return {
            blocks,
            scenario,
            ...updateCurrentProjectScript(state, { blocks, scenario }),
          }
        })
      },

      deleteBlock: (id) => {
        set((state) => {
          const blocks = removeBlock(state.blocks, id)
          const finalBlocks = blocks.length === 0 ? [makeBlock("action")] : blocks
          const scenario = syncScenario(finalBlocks)
          return {
            blocks: finalBlocks,
            scenario,
            ...updateCurrentProjectScript(state, { blocks: finalBlocks, scenario }),
          }
        })
      },

      setFlow: (flowPatch) => {
        set((state) => {
          const flow = { ...state.flow, ...flowPatch }
          return {
            flow,
            ...updateCurrentProjectScript(state, { flow }),
          }
        })
      },

      // ── Metadata ──
      setTitle: (title) =>
        set((state) => {
          const normalized = title.trim()
          if (state.activeProjectId && normalized && normalized !== "UNTITLED") {
            useProjectsStore.getState().updateProjectName?.(state.activeProjectId, normalized)
          }
          return { title, ...updateCurrentProjectScript(state, { title }) }
        }),

      setAuthor: (author) =>
        set((state) => ({ author, ...updateCurrentProjectScript(state, { author }) })),

      setDraft: (draft) =>
        set((state) => ({ draft, ...updateCurrentProjectScript(state, { draft }) })),

      setDate: (date) =>
        set((state) => ({ date, ...updateCurrentProjectScript(state, { date }) })),

      // ── Project switching ──
      setActiveProject: (projectId) =>
        set((state) => {
          if (!projectId) return { activeProjectId: null, ...createDefaultScript() }
          const projectScript = state.projectScripts[projectId] || createDefaultScript()
          // Migrate old projects that have scenario but no blocks
          if (projectScript.scenario && (!projectScript.blocks || projectScript.blocks.length === 0)) {
            projectScript.blocks = parseTextToBlocks(projectScript.scenario)
          }
          return {
            activeProjectId: projectId,
            ...projectScript,
            projectScripts: state.projectScripts[projectId]
              ? state.projectScripts
              : {
                  ...state.projectScripts,
                  [projectId]: projectScript,
                },
          }
        }),
    }),
    { name: "koza-script" }
  )
)

ENDOFFILE
echo "Creating ScreenplayBlockEditor.tsx..."
cat > "$PROJECT/src/components/editor/ScreenplayBlockEditor.tsx" << 'ENDOFFILE'
"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import {
  type Block,
  type BlockType,
  type FlowConfig,
  DEFAULT_FLOW,
  makeBlock,
  getNextBlockType,
  getTabBlockType,
  getLiveTypeConversion,
  normalizeBlockText,
  reformatBlockAsType,
  blockTypeFromShortcutKey,
  getBlockLabel,
  getCharacterCompletions,
  getSceneHeadingCompletions,
  getScreenplayStats,
  insertBlockAfter,
  updateBlockText,
  changeBlockType,
  removeBlock,
} from "@/lib/screenplayFormat"

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface ScreenplayBlockEditorProps {
  blocks: Block[]
  onChange: (blocks: Block[]) => void
  flow?: FlowConfig
  readOnly?: boolean
  className?: string
}

// ─────────────────────────────────────────────────────────────
// STYLE MAPS
// ─────────────────────────────────────────────────────────────

const FONT = "'Courier Prime', 'Courier New', monospace"
const BASE_FONT_SIZE = 14
const LINE_HEIGHT = 1.8

// Padding-left per block type (screenplay standard indents)
const INDENT: Record<BlockType, string> = {
  scene_heading:  "0px",
  action:         "0px",
  character:      "180px",
  parenthetical:  "140px",
  dialogue:       "96px",
  transition:     "0px",
  shot:           "0px",
}

// Text-align for transition (right)
const TEXT_ALIGN: Partial<Record<BlockType, "left" | "right">> = {
  transition: "right",
}

// Max-width for dialogue block (wrap narrow like real screenplay)
const MAX_WIDTH: Partial<Record<BlockType, string>> = {
  dialogue:      "380px",
  parenthetical: "320px",
  action:        "100%",
}

// Colors: light mode only (dark via CSS var fallback)
const COLORS: Record<BlockType, string> = {
  scene_heading: "#1a4fa0",
  action:        "var(--sp-text, #1a1a1a)",
  character:     "#2d2d2d",
  parenthetical: "#6b6b6b",
  dialogue:      "var(--sp-text, #1a1a1a)",
  transition:    "#4f4fa8",
  shot:          "#2d7a5f",
}

const FONT_WEIGHT: Partial<Record<BlockType, number>> = {
  scene_heading: 700,
  character:     600,
  transition:    600,
}

// Margin-top per block type (spacing above)
const MARGIN_TOP: Partial<Record<BlockType, number>> = {
  scene_heading: 28,
  character:     16,
  transition:    16,
}

// ─────────────────────────────────────────────────────────────
// AUTOCOMPLETE HOOK
// ─────────────────────────────────────────────────────────────

interface ACState {
  items: string[]
  selected: number
  blockId: string | null
}

// ─────────────────────────────────────────────────────────────
// BLOCK ROW
// ─────────────────────────────────────────────────────────────

interface BlockRowProps {
  block: Block
  isFocused: boolean
  acState: ACState
  onFocus: (id: string) => void
  onBlur: (id: string, text: string) => void
  onInput: (id: string, text: string, el: HTMLTextAreaElement) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>, id: string) => void
  onTypeMenuClick: (id: string, anchor: HTMLElement) => void
  onACPick: (idx: number) => void
}

function BlockRow({
  block,
  isFocused,
  acState,
  onFocus,
  onBlur,
  onInput,
  onKeyDown,
  onTypeMenuClick,
  onACPick,
}: BlockRowProps) {
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea to fit content
  const resize = useCallback(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = ta.scrollHeight + "px"
  }, [])

  useLayoutEffect(() => {
    resize()
  }, [block.text, resize])

  useEffect(() => {
    if (isFocused && taRef.current) {
      taRef.current.focus()
      const len = taRef.current.value.length
      taRef.current.setSelectionRange(len, len)
    }
  }, [isFocused])

  const showAC = acState.blockId === block.id && acState.items.length > 0

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        position: "relative",
        marginTop: MARGIN_TOP[block.type] ?? 0,
      }}
    >
      {/* Left margin: type label (visible on hover) */}
      <div
        className="sp-margin"
        style={{
          width: 80,
          flexShrink: 0,
          display: "flex",
          justifyContent: "flex-end",
          paddingRight: 10,
          paddingTop: 3,
          opacity: isFocused ? 1 : 0,
          transition: "opacity 0.15s",
        }}
      >
        <button
          tabIndex={-1}
          onClick={(e) => onTypeMenuClick(block.id, e.currentTarget)}
          style={{
            fontSize: 10,
            padding: "2px 7px",
            borderRadius: 4,
            border: "0.5px solid rgba(0,0,0,0.15)",
            background: "rgba(0,0,0,0.04)",
            color: "#888",
            cursor: "pointer",
            whiteSpace: "nowrap",
            fontFamily: "var(--font-sans, sans-serif)",
          }}
        >
          {getBlockLabel(block.type)}
        </button>
      </div>

      {/* Textarea */}
      <div style={{ flex: 1, paddingRight: 80 }}>
        <textarea
          ref={taRef}
          value={block.text}
          rows={1}
          spellCheck
          onFocus={() => onFocus(block.id)}
          onBlur={(e) => onBlur(block.id, e.target.value)}
          onInput={(e) => {
            resize()
            onInput(block.id, (e.target as HTMLTextAreaElement).value, e.target as HTMLTextAreaElement)
          }}
          onKeyDown={(e) => onKeyDown(e, block.id)}
          placeholder={getPlaceholder(block.type)}
          style={{
            display: "block",
            width: "100%",
            maxWidth: MAX_WIDTH[block.type] ?? "100%",
            fontFamily: FONT,
            fontSize: BASE_FONT_SIZE,
            lineHeight: LINE_HEIGHT,
            color: COLORS[block.type],
            fontWeight: FONT_WEIGHT[block.type] ?? 400,
            textAlign: TEXT_ALIGN[block.type] ?? "left",
            paddingLeft: INDENT[block.type],
            textTransform:
              block.type === "scene_heading" || block.type === "character" || block.type === "transition"
                ? "uppercase"
                : "none",
            border: "none",
            outline: "none",
            background: "transparent",
            resize: "none",
            overflow: "hidden",
            padding: 0,
            paddingLeft: INDENT[block.type],
            margin: 0,
            caretColor: "#1a1a1a",
          }}
        />

        {/* Autocomplete dropdown */}
        {showAC && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: INDENT[block.type],
              zIndex: 50,
              background: "#fff",
              border: "0.5px solid rgba(0,0,0,0.12)",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
              overflow: "hidden",
              minWidth: 200,
            }}
          >
            {acState.items.map((item, idx) => (
              <div
                key={item}
                onMouseDown={(e) => { e.preventDefault(); onACPick(idx) }}
                style={{
                  padding: "6px 14px",
                  fontSize: 13,
                  fontFamily: FONT,
                  cursor: "pointer",
                  background: idx === acState.selected ? "rgba(0,0,0,0.05)" : "transparent",
                  color: "#1a1a1a",
                }}
              >
                {item}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function getPlaceholder(type: BlockType): string {
  switch (type) {
    case "scene_heading":  return "INT. LOCATION — DAY"
    case "action":         return "Action..."
    case "character":      return "CHARACTER NAME"
    case "parenthetical":  return "(beat)"
    case "dialogue":       return "Spoken line..."
    case "transition":     return "CUT TO:"
    case "shot":           return "CLOSE ON:"
  }
}

// ─────────────────────────────────────────────────────────────
// TYPE MENU
// ─────────────────────────────────────────────────────────────

const ALL_TYPES: BlockType[] = [
  "scene_heading", "action", "character",
  "parenthetical", "dialogue", "transition", "shot",
]

const SHORTCUT_KEYS: Partial<Record<BlockType, string>> = {
  scene_heading: "⌘1", action: "⌘2", character: "⌘3",
  parenthetical: "⌘4", dialogue: "⌘5", shot: "⌘6", transition: "⌘7",
}

interface TypeMenuProps {
  anchor: { x: number; y: number }
  onSelect: (type: BlockType) => void
  onClose: () => void
}

function TypeMenu({ anchor, onSelect, onClose }: TypeMenuProps) {
  useEffect(() => {
    const handler = () => onClose()
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        left: anchor.x,
        top: anchor.y + 4,
        zIndex: 1000,
        background: "#fff",
        border: "0.5px solid rgba(0,0,0,0.12)",
        borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        overflow: "hidden",
        minWidth: 210,
      }}
    >
      {ALL_TYPES.map((type) => (
        <div
          key={type}
          onClick={() => { onSelect(type); onClose() }}
          style={{
            padding: "7px 14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 13,
            cursor: "pointer",
            color: "#1a1a1a",
            fontFamily: "var(--font-sans, sans-serif)",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.04)" }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
        >
          <span>{getBlockLabel(type)}</span>
          <span style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>
            {SHORTCUT_KEYS[type] ?? ""}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MAIN EDITOR
// ─────────────────────────────────────────────────────────────

export default function ScreenplayBlockEditor({
  blocks,
  onChange,
  flow = DEFAULT_FLOW,
  readOnly = false,
  className,
}: ScreenplayBlockEditorProps) {
  const [focusId, setFocusId] = useState<string | null>(null)
  const [acState, setAcState] = useState<ACState>({ items: [], selected: 0, blockId: null })
  const [typeMenu, setTypeMenu] = useState<{
    blockId: string
    anchor: { x: number; y: number }
  } | null>(null)

  const pendingFocusId = useRef<string | null>(null)

  // ── Focus management ──
  const focusBlock = useCallback((id: string) => {
    pendingFocusId.current = id
    setFocusId(id)
  }, [])

  // ── Autocomplete ──
  const updateAC = useCallback((block: Block) => {
    if (block.type === "character") {
      const items = getCharacterCompletions(block.text, blocks)
      setAcState({ items, selected: 0, blockId: items.length ? block.id : null })
    } else if (block.type === "scene_heading") {
      const items = getSceneHeadingCompletions(block.text)
      setAcState({ items, selected: 0, blockId: items.length ? block.id : null })
    } else {
      setAcState({ items: [], selected: 0, blockId: null })
    }
  }, [blocks])

  const hideAC = useCallback(() => {
    setAcState({ items: [], selected: 0, blockId: null })
  }, [])

  const applyAC = useCallback((idx: number) => {
    if (!acState.blockId) return
    const block = blocks.find((b) => b.id === acState.blockId)
    if (!block) return
    const chosen = acState.items[idx]
    let newText = chosen
    if (block.type === "scene_heading") {
      const parts = block.text.toUpperCase().split(" - ")
      parts[parts.length - 1] = chosen
      newText = parts.join(" - ")
    }
    const updated = updateBlockText(blocks, block.id, newText)
    onChange(updated)
    hideAC()
    focusBlock(block.id)
  }, [acState, blocks, onChange, hideAC, focusBlock])

  // ── Handlers ──
  const handleFocus = useCallback((id: string) => {
    setFocusId(id)
  }, [])

  const handleBlur = useCallback((id: string, text: string) => {
    // Normalize on blur
    const block = blocks.find((b) => b.id === id)
    if (!block) return
    const normalized = normalizeBlockText({ ...block, text })
    if (normalized !== text) {
      onChange(updateBlockText(blocks, id, normalized))
    }
    hideAC()
  }, [blocks, onChange, hideAC])

  const handleInput = useCallback((id: string, text: string, _el: HTMLTextAreaElement) => {
    const block = blocks.find((b) => b.id === id)
    if (!block) return

    // Update text
    let updated = updateBlockText(blocks, id, text)

    // Live type conversion (e.g. "int." → scene_heading)
    const conv = getLiveTypeConversion({ ...block, text })
    if (conv) {
      const newText = text.trimStart()
      updated = changeBlockType(updateBlockText(updated, id, newText), id, conv)
    }

    onChange(updated)

    // Update autocomplete
    const liveBlock = updated.find((b) => b.id === id)
    if (liveBlock) updateAC(liveBlock)
  }, [blocks, onChange, updateAC])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>, id: string) => {
    const block = blocks.find((b) => b.id === id)
    if (!block) return

    // ── Autocomplete navigation ──
    if (acState.items.length && acState.blockId === id) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setAcState((s) => ({ ...s, selected: (s.selected + 1) % s.items.length }))
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setAcState((s) => ({ ...s, selected: (s.selected - 1 + s.items.length) % s.items.length }))
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        applyAC(acState.selected)
        return
      }
      if (e.key === "Escape") {
        hideAC()
        return
      }
    }

    // ── Enter: create next block ──
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      const normalized = normalizeBlockText(block)
      const updatedBlocks = updateBlockText(blocks, id, normalized)
      const nextType = getNextBlockType(block, flow)
      const newBlock = makeBlock(nextType)
      const withNew = insertBlockAfter(updatedBlocks, id, newBlock)
      onChange(withNew)
      focusBlock(newBlock.id)
      return
    }

    // ── Tab: smart type switch ──
    if (e.key === "Tab" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      const nextType = getTabBlockType(block)
      if (nextType) {
        onChange(changeBlockType(blocks, id, nextType))
      }
      return
    }

    // ── Backspace on empty: delete block ──
    if (e.key === "Backspace" && block.text === "" && blocks.length > 1) {
      e.preventDefault()
      const idx = blocks.findIndex((b) => b.id === id)
      const prevBlock = idx > 0 ? blocks[idx - 1] : null
      onChange(removeBlock(blocks, id))
      if (prevBlock) focusBlock(prevBlock.id)
      return
    }

    // ── Cmd+1..7: change element type ──
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
      const newType = blockTypeFromShortcutKey(e.key)
      if (newType) {
        e.preventDefault()
        const newText = reformatBlockAsType(block.text, newType)
        let updated = updateBlockText(blocks, id, newText)
        updated = changeBlockType(updated, id, newType)
        onChange(updated)
        return
      }
    }
  }, [blocks, flow, acState, onChange, focusBlock, applyAC, hideAC])

  const handleTypeMenuClick = useCallback((id: string, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect()
    setTypeMenu({ blockId: id, anchor: { x: rect.left, y: rect.bottom } })
  }, [])

  const handleTypeMenuSelect = useCallback((type: BlockType) => {
    if (!typeMenu) return
    const block = blocks.find((b) => b.id === typeMenu.blockId)
    if (!block) return
    const newText = reformatBlockAsType(block.text, type)
    let updated = updateBlockText(blocks, block.id, newText)
    updated = changeBlockType(updated, block.id, type)
    onChange(updated)
    focusBlock(block.id)
  }, [typeMenu, blocks, onChange, focusBlock])

  // ── Stats ──
  const stats = getScreenplayStats(blocks)

  return (
    <div
      className={className}
      style={{
        position: "relative",
        fontFamily: FONT,
        minHeight: "100%",
      }}
    >
      {/* Toolbar: stats + element buttons */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 80px",
          borderBottom: "0.5px solid rgba(0,0,0,0.08)",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(8px)",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 11, color: "#aaa", marginRight: 8 }}>
          {stats.scenes} scenes · {stats.pages} pg · {stats.words} words
        </span>

        {(["scene_heading", "action", "character", "parenthetical", "dialogue", "transition"] as BlockType[]).map((type) => {
          const active = focusId ? blocks.find((b) => b.id === focusId)?.type === type : false
          return (
            <button
              key={type}
              tabIndex={-1}
              onClick={() => {
                if (focusId) {
                  const block = blocks.find((b) => b.id === focusId)
                  if (block) {
                    const newText = reformatBlockAsType(block.text, type)
                    let updated = updateBlockText(blocks, focusId, newText)
                    updated = changeBlockType(updated, focusId, type)
                    onChange(updated)
                    focusBlock(focusId)
                  }
                }
              }}
              style={{
                fontSize: 11,
                padding: "2px 9px",
                borderRadius: 5,
                border: "0.5px solid rgba(0,0,0,0.12)",
                background: active ? "#1a1a2e" : "rgba(255,255,255,0.8)",
                color: active ? "#fff" : "#555",
                cursor: "pointer",
                transition: "background 0.1s",
                fontFamily: "var(--font-sans, sans-serif)",
              }}
            >
              {getBlockLabel(type)}
            </button>
          )
        })}
      </div>

      {/* Block list */}
      <div
        style={{ padding: "32px 0 120px 80px" }}
        onClick={() => setTypeMenu(null)}
      >
        {blocks.map((block) => (
          <BlockRow
            key={block.id}
            block={block}
            isFocused={focusId === block.id}
            acState={acState}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onTypeMenuClick={handleTypeMenuClick}
            onACPick={applyAC}
          />
        ))}
      </div>

      {/* Keyboard hint bar */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          padding: "5px 80px",
          borderTop: "0.5px solid rgba(0,0,0,0.06)",
          background: "rgba(255,255,255,0.90)",
          backdropFilter: "blur(8px)",
          display: "flex",
          gap: 16,
          fontSize: 10,
          color: "#bbb",
          fontFamily: "var(--font-sans, sans-serif)",
        }}
      >
        {[
          ["Enter", "next element"],
          ["Tab", "action ↔ character"],
          ["⌘1–7", "set type"],
          ["int.", "→ scene heading"],
        ].map(([key, label]) => (
          <span key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <kbd style={{
              fontFamily: "monospace",
              fontSize: 9,
              padding: "1px 4px",
              borderRadius: 3,
              border: "0.5px solid rgba(0,0,0,0.12)",
              background: "rgba(0,0,0,0.04)",
              color: "#999",
            }}>{key}</kbd>
            {label}
          </span>
        ))}
      </div>

      {/* Type menu */}
      {typeMenu && (
        <TypeMenu
          anchor={typeMenu.anchor}
          onSelect={handleTypeMenuSelect}
          onClose={() => setTypeMenu(null)}
        />
      )}
    </div>
  )
}

ENDOFFILE
echo "All files written. Running build..."
npm --prefix "$PROJECT" run build
