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
  zoomPercent?: number
}

// ─────────────────────────────────────────────────────────────
// MULTI-BLOCK SELECTION
// ─────────────────────────────────────────────────────────────

interface MultiBlockSel {
  anchorBlockId: string
  anchorOffset: number
  focusBlockId: string
  focusOffset: number
}

function getSelBlockRange(blocks: Block[], sel: MultiBlockSel) {
  const ai = blocks.findIndex(b => b.id === sel.anchorBlockId)
  const fi = blocks.findIndex(b => b.id === sel.focusBlockId)
  if (ai === -1 || fi === -1) return null
  return { startIdx: Math.min(ai, fi), endIdx: Math.max(ai, fi), forward: ai <= fi }
}

function getSelectedText(blocks: Block[], sel: MultiBlockSel): string {
  const r = getSelBlockRange(blocks, sel)
  if (!r) return ''
  const startOff = r.forward ? sel.anchorOffset : sel.focusOffset
  const endOff = r.forward ? sel.focusOffset : sel.anchorOffset
  const parts: string[] = []
  for (let i = r.startIdx; i <= r.endIdx; i++) {
    const t = blocks[i].text
    if (i === r.startIdx) parts.push(t.slice(startOff))
    else if (i === r.endIdx) parts.push(t.slice(0, endOff))
    else parts.push(t)
  }
  return parts.join('\n')
}

// ─────────────────────────────────────────────────────────────
// STYLE MAPS
// ─────────────────────────────────────────────────────────────

const FONT = "'Courier Prime', 'Courier New', monospace"
const BASE_FONT_SIZE = 16
const LINE_HEIGHT = 1.5

// ── US-Letter screenplay page metrics (Final Draft standard) ──
// Page: 8.5" × 11" at 96dpi = 816 × 1056 px
// Font: Courier 12pt = 16px. Each character ≈ 9.6px wide → 60 chars per 6" line.
// Left margin 1.5" = 144px, Right margin 1" = 96px.
// Usable text width = 576px (6").
const PAGE_MARGIN_LEFT = 144
const PAGE_MARGIN_RIGHT = 96

// Padding-left per block type (Final Draft standard indents from left margin)
// Character: starts at col 37 → (37-16) × 9.6 ≈ 202px from text area left
// Dialogue: starts at col 25 → (25-16) × 9.6 ≈ 86px
// Parenthetical: starts at col 31 → (31-16) × 9.6 ≈ 144px
const INDENT: Record<BlockType, string> = {
  scene_heading:  "0px",
  action:         "0px",
  character:      "202px",
  parenthetical:  "144px",
  dialogue:       "86px",
  transition:     "0px",
  shot:           "0px",
}

// Text-align for transition (right)
const TEXT_ALIGN: Partial<Record<BlockType, "left" | "right">> = {
  transition: "right",
}

// Max-width: dialogue 25 chars = 240px, parenthetical 18 chars ≈ 173px
const MAX_WIDTH: Partial<Record<BlockType, string>> = {
  dialogue:      "336px",
  parenthetical: "240px",
  action:        "100%",
}

// Colors: light mode only (dark via CSS var fallback)
const COLORS: Record<BlockType, string> = {
  scene_heading: "#111111",
  action:        "#111111",
  character:     "#111111",
  parenthetical: "#111111",
  dialogue:      "#111111",
  transition:    "#111111",
  shot:          "#111111",
}

const FONT_WEIGHT: Partial<Record<BlockType, number>> = {
  scene_heading: 400,
  character:     400,
  transition:    400,
}

// Margin-top per block type (Final Draft spacing)
const MARGIN_TOP: Partial<Record<BlockType, number>> = {
  scene_heading: 24,
  character:     24,
  dialogue:      0,
  transition:    24,
  parenthetical: 0,
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
  topGap?: number
  isFocused: boolean
  acState: ACState
  selHighlight: 'none' | 'full' | 'anchor' | 'focus'
  onFocus: (id: string) => void
  onBlur: (id: string, text: string) => void
  onInput: (id: string, text: string, el: HTMLTextAreaElement) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>, id: string) => void
  onMouseDown: (e: React.MouseEvent<HTMLTextAreaElement>, id: string) => void
  onTypeMenuClick: (id: string, anchor: HTMLElement) => void
  onACPick: (idx: number) => void
}

function BlockRow({
  block,
  topGap,
  isFocused,
  acState,
  selHighlight,
  onFocus,
  onBlur,
  onInput,
  onKeyDown,
  onMouseDown,
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
      data-block-id={block.id}
      style={{
        position: "relative",
        marginTop: topGap ?? MARGIN_TOP[block.type] ?? 0,
      }}
    >
      {/* Left margin: type label (floats outside page margin) */}
      <div
        className="sp-margin"
        style={{
          position: "absolute",
          left: -64,
          top: 2,
          width: 58,
          display: "flex",
          justifyContent: "flex-end",
          opacity: isFocused ? 1 : 0,
          pointerEvents: isFocused ? "auto" : "none",
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
      <div style={{ flex: 1 }}>
        <textarea
          ref={taRef}
          value={block.text}
          rows={1}
          spellCheck
          onMouseDown={(e) => onMouseDown(e, block.id)}
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
            textTransform:
              block.type === "scene_heading" || block.type === "character" || block.type === "transition"
                ? "uppercase"
                : "none",
            border: "none",
            outline: "none",
            background: "transparent",
            resize: "none",
            overflow: "hidden",
            minHeight: block.text.trim() === "" ? "28px" : "auto",
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
      {/* Multi-block selection highlight */}
      {selHighlight !== 'none' && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(66, 133, 244, 0.18)',
            pointerEvents: 'none',
            borderRadius: 2,
          }}
        />
      )}
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
  zoomPercent = 100,
}: ScreenplayBlockEditorProps) {
  const [focusId, setFocusId] = useState<string | null>(null)
  const [acState, setAcState] = useState<ACState>({ items: [], selected: 0, blockId: null })
  const [typeMenu, setTypeMenu] = useState<{
    blockId: string
    anchor: { x: number; y: number }
  } | null>(null)
  const [multiSel, setMultiSel] = useState<MultiBlockSel | null>(null)

  const pendingFocusId = useRef<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragAnchorRef = useRef<{ blockId: string; offset: number } | null>(null)
  const zoomScale = zoomPercent / 100

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

  const handleInput = useCallback((id: string, text: string, el: HTMLTextAreaElement) => {
    const block = blocks.find((b) => b.id === id)
    if (!block) return
    const blockIndex = blocks.findIndex((b) => b.id === id)
    const prevType = blockIndex > 0 ? blocks[blockIndex - 1]?.type : null

    // Update text
    let updated = updateBlockText(blocks, id, text)

    // Parenthetical trigger works only in the dialogue line right after character name.
    if (block.type === "dialogue" && prevType === "character") {
      const trimmed = text.trimStart()
      if (trimmed.startsWith("(")) {
        const inner = trimmed.slice(1).replace(/\)$/, "").trim()
        const wrapped = `(${inner})`
        updated = changeBlockType(updateBlockText(updated, id, wrapped), id, "parenthetical")
        onChange(updated)

        requestAnimationFrame(() => {
          const caret = Math.max(1, wrapped.length - 1)
          el.setSelectionRange(caret, caret)
        })

        const liveBlock = updated.find((b) => b.id === id)
        if (liveBlock) updateAC(liveBlock)
        return
      }
    }

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

      // If caret is at the very start, insert a blank action block ABOVE current.
      if (e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
        const idx = updatedBlocks.findIndex((b) => b.id === id)
        if (idx !== -1) {
          const newBlock = makeBlock("action")
          const withInserted = [
            ...updatedBlocks.slice(0, idx),
            newBlock,
            ...updatedBlocks.slice(idx),
          ]
          onChange(withInserted)
          focusBlock(newBlock.id)
          return
        }
      }

      const nextType = normalized.trim() === "" ? "action" : getNextBlockType(block, flow)
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

  // ── Multi-block selection handlers ──

  const deleteMultiSel = useCallback(() => {
    if (!multiSel) return
    const r = getSelBlockRange(blocks, multiSel)
    if (!r) return
    const startOff = r.forward ? multiSel.anchorOffset : multiSel.focusOffset
    const endOff = r.forward ? multiSel.focusOffset : multiSel.anchorOffset
    const beforeText = blocks[r.startIdx].text.slice(0, startOff)
    const afterText = blocks[r.endIdx].text.slice(endOff)
    const merged = { ...blocks[r.startIdx], text: beforeText + afterText }
    const next = [...blocks.slice(0, r.startIdx), merged, ...blocks.slice(r.endIdx + 1)]
    if (next.length === 0) next.push(makeBlock("action"))
    onChange(next)
    setMultiSel(null)
    focusBlock(merged.id)
    requestAnimationFrame(() => {
      const ta = containerRef.current?.querySelector(
        `[data-block-id="${merged.id}"] textarea`
      ) as HTMLTextAreaElement | null
      ta?.setSelectionRange(startOff, startOff)
    })
  }, [multiSel, blocks, onChange, focusBlock])

  const handleTextareaMouseDown = useCallback((e: React.MouseEvent<HTMLTextAreaElement>, blockId: string) => {
    if (e.shiftKey && focusId && focusId !== blockId) {
      // Shift+Click → cross-block selection
      const anchorTa = containerRef.current?.querySelector(
        `[data-block-id="${focusId}"] textarea`
      ) as HTMLTextAreaElement | null
      const anchorOffset = anchorTa?.selectionStart ?? 0
      const targetTa = e.currentTarget
      // Let default click position cursor, then read offset
      requestAnimationFrame(() => {
        setMultiSel({
          anchorBlockId: focusId,
          anchorOffset,
          focusBlockId: blockId,
          focusOffset: targetTa.selectionStart ?? 0,
        })
      })
      return
    }
    // Normal click: clear multi-selection, start drag tracking
    if (multiSel) setMultiSel(null)
    const ta = e.currentTarget
    requestAnimationFrame(() => {
      dragAnchorRef.current = { blockId, offset: ta.selectionStart ?? 0 }
    })
  }, [focusId, multiSel])

  // ── Drag detection for cross-block selection ──
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragAnchorRef.current || e.buttons !== 1) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const blockEl = el?.closest('[data-block-id]') as HTMLElement | null
      const hoveredId = blockEl?.getAttribute('data-block-id')
      if (!hoveredId || hoveredId === dragAnchorRef.current.blockId) return
      const hb = blocks.find(b => b.id === hoveredId)
      if (!hb) return
      const anchor = dragAnchorRef.current
      const anchorIdx = blocks.findIndex(b => b.id === anchor.blockId)
      const hoverIdx = blocks.findIndex(b => b.id === hoveredId)
      setMultiSel({
        anchorBlockId: anchor.blockId,
        anchorOffset: anchor.offset,
        focusBlockId: hoveredId,
        focusOffset: hoverIdx > anchorIdx ? hb.text.length : 0,
      })
    }
    const handleUp = () => { dragAnchorRef.current = null }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [blocks])

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
  const activeBlockId = focusId ?? pendingFocusId.current
  const visibleBlocks = blocks.filter((b, i) =>
    b.text.trim() !== "" || i === blocks.length - 1 || b.id === activeBlockId
  )

  return (
    <div
      className={className}
      style={{
        position: "relative",
        fontFamily: FONT,
        minHeight: "100%",
        transform: zoomScale === 1 ? undefined : `scale(${zoomScale})`,
        transformOrigin: "top left",
        width: zoomScale === 1 ? undefined : `${100 / zoomScale}%`,
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
          padding: `6px ${PAGE_MARGIN_RIGHT}px 6px ${PAGE_MARGIN_LEFT}px`,
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
        ref={containerRef}
        style={{ padding: `32px ${PAGE_MARGIN_RIGHT}px 160px ${PAGE_MARGIN_LEFT}px` }}
        onClick={() => setTypeMenu(null)}
        onKeyDownCapture={(e) => {
          if (!multiSel) return
          // Copy
          if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
            e.preventDefault(); e.stopPropagation()
            navigator.clipboard.writeText(getSelectedText(blocks, multiSel))
            return
          }
          // Cut
          if ((e.metaKey || e.ctrlKey) && e.key === 'x') {
            e.preventDefault(); e.stopPropagation()
            navigator.clipboard.writeText(getSelectedText(blocks, multiSel))
            deleteMultiSel()
            return
          }
          // Select all: clear multi-sel, let default handle
          if ((e.metaKey || e.ctrlKey) && e.key === 'a') { setMultiSel(null); return }
          // Delete
          if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault(); e.stopPropagation()
            deleteMultiSel()
            return
          }
          // Escape
          if (e.key === 'Escape') { setMultiSel(null); return }
          // Enter: delete selection first
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); e.stopPropagation()
            deleteMultiSel()
            return
          }
          // Tab: clear selection, let normal tab handle
          if (e.key === 'Tab') { setMultiSel(null); return }
          // Arrow keys: clear selection
          if (e.key.startsWith('Arrow')) { setMultiSel(null); return }
          // Printable character: replace selection
          if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
            e.preventDefault(); e.stopPropagation()
            const r = getSelBlockRange(blocks, multiSel)
            if (!r) return
            const startOff = r.forward ? multiSel.anchorOffset : multiSel.focusOffset
            const endOff = r.forward ? multiSel.focusOffset : multiSel.anchorOffset
            const beforeText = blocks[r.startIdx].text.slice(0, startOff)
            const afterText = blocks[r.endIdx].text.slice(endOff)
            const merged = { ...blocks[r.startIdx], text: beforeText + e.key + afterText }
            const next = [...blocks.slice(0, r.startIdx), merged, ...blocks.slice(r.endIdx + 1)]
            onChange(next)
            setMultiSel(null)
            focusBlock(merged.id)
            requestAnimationFrame(() => {
              const ta = containerRef.current?.querySelector(
                `[data-block-id="${merged.id}"] textarea`
              ) as HTMLTextAreaElement | null
              ta?.setSelectionRange(startOff + 1, startOff + 1)
            })
            return
          }
        }}
      >
        {visibleBlocks.map((block, idx) => {
          const prev = idx > 0 ? visibleBlocks[idx - 1] : null
          const topGap =
            prev?.type === "action" && block.type === "action"
              ? Math.round(BASE_FONT_SIZE * LINE_HEIGHT)
              : undefined

          // Compute selection highlight for this block
          let selHL: 'none' | 'full' | 'anchor' | 'focus' = 'none'
          if (multiSel) {
            const r = getSelBlockRange(blocks, multiSel)
            const blockIdx = blocks.indexOf(block)
            if (r && blockIdx >= r.startIdx && blockIdx <= r.endIdx) {
              if (block.id === multiSel.anchorBlockId) selHL = 'anchor'
              else if (block.id === multiSel.focusBlockId) selHL = 'focus'
              else selHL = 'full'
            }
          }

          return (
            <BlockRow
              key={block.id}
              block={block}
              topGap={topGap}
              isFocused={focusId === block.id}
              acState={acState}
              selHighlight={selHL}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              onMouseDown={handleTextareaMouseDown}
              onTypeMenuClick={handleTypeMenuClick}
              onACPick={applyAC}
            />
          )
        })}
      </div>

      {/* Keyboard hint bar */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          padding: `5px ${PAGE_MARGIN_RIGHT}px 5px ${PAGE_MARGIN_LEFT}px`,
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
