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
