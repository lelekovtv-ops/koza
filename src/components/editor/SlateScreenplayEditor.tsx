"use client"

import { createPortal } from "react-dom"
import React, {
  forwardRef,
  useRef,
  useState,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
} from "react"
import {
  createEditor,
  Descendant,
  Editor,
  Path,
  Point,
  Text,
  Transforms,
  Node,
  Element as SlateElement,
  Range,
} from "slate"
import {
  Slate,
  Editable,
  withReact,
  ReactEditor,
} from "slate-react"
import { withHistory } from "slate-history"
import { useBoardStore } from "@/store/board"
import { useScriptStore } from "@/store/script"
import { makeBlock, type BlockType } from "@/lib/screenplayFormat"
import { withScreenplay } from "./screenplay/withScreenplay"
import { handleTabBehavior } from "./screenplay/screenplayTabBehavior"
import {
  handleAutoCapsKey,
  handleEscapeKey,
  handleModShortcuts,
  handleOpenParentheticalKey,
} from "./screenplay/screenplayKeyboardBehavior"
import { createRenderElement, createRenderLeaf } from "./screenplay/screenplayRenderers"
import { palette, focusPalette } from "./screenplay/screenplayTheme"
import {
  findSlugSuggestion,
  getCurrentElementEntry,
  getSelectedText,
  toggleMark,
} from "./screenplay/screenplayEditorUtils"
import { isSlugGhostEligibleType } from "./screenplay/screenplaySlugBehavior"
import {
  buildFloatingSelectionAction,
  buildShiftEnterGrammarAction,
  type ScreenplaySelectionAction,
} from "./screenplay/screenplayAssistant"
import { ScreenplayToolbar } from "./screenplay/ScreenplayToolbar"
import { ScreenplayTopInfo } from "./screenplay/ScreenplayTopInfo"
import { ScreenplayFloatingAiToolbar } from "./screenplay/ScreenplayFloatingAiToolbar"
import { ScreenplayFooter } from "./screenplay/ScreenplayFooter"
import {
  applyAutocompleteChoice,
  computeAutocompleteModel,
  type ScreenplayAutocompleteKind,
} from "./screenplay/screenplayAutocomplete"
import {
  SCREENPLAY_CHARACTER_INDENT_CH,
  SCREENPLAY_DIALOGUE_INDENT_LEFT_CH,
  SCREENPLAY_DIALOGUE_INDENT_RIGHT_CH,
  SCREENPLAY_FONT_SIZE_PX,
  SCREENPLAY_LINE_HEIGHT_PX,
  SCREENPLAY_LINES_PER_PAGE,
  SCREENPLAY_PAGE_GAP_PX,
  SCREENPLAY_PAGE_HEIGHT_PX,
  SCREENPLAY_PAGE_PADDING_BOTTOM_PX,
  SCREENPLAY_PAGE_PADDING_LEFT_PX,
  SCREENPLAY_PAGE_PADDING_RIGHT_PX,
  SCREENPLAY_PAGE_PADDING_TOP_PX,
  SCREENPLAY_PAGE_WIDTH_PX,
  SCREENPLAY_PARENTHETICAL_INDENT_CH,
  SCREENPLAY_SCENE_HEADING_MARGIN_TOP_PX,
  SCREENPLAY_CHARACTER_MARGIN_TOP_PX,
  SCREENPLAY_TRANSITION_MARGIN_TOP_PX,
  SCREENPLAY_ACTION_AFTER_SCENE_HEADING_MARGIN_TOP_PX,
  SCREENPLAY_ACTION_AFTER_ACTION_MARGIN_TOP_PX,
  SCREENPLAY_TEXT_AREA_HEIGHT_PX,
} from "./screenplay/screenplayLayoutConstants"
import type { ScreenplayColors } from "./screenplay/screenplayUiTypes"
import type {
  ScreenplayElement,
  ScreenplayElementType,
} from "@/lib/screenplayTypes"
import { createScreenplayElement } from "@/lib/screenplayTypes"

// ─── Types ───────────────────────────────────────────────

type ScreenplayEditorHandle = {
  getValue: () => string
  setValue: (text: string) => void
  focus: () => void
  undo: () => boolean
  redo: () => boolean
}

export type { ScreenplaySelectionAction } from "./screenplay/screenplayAssistant"

interface ScreenplayEditorProps {
  onChange?: (text: string) => void
  onSelectionAction?: (payload: ScreenplaySelectionAction) => void
  onRequestUndo?: () => boolean
  onRequestRedo?: () => boolean
  aiRippleRange?: { start: number; end: number; token: number } | null
  focusMode?: boolean
  embedded?: boolean
}

interface FloatingToolbarState {
  visible: boolean
  selectedText: string
}

interface AutocompleteState {
  kind: ScreenplayAutocompleteKind
  items: string[]
  selected: number
}

type AudioContextWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext
  }

type CaretSnapshot = {
  blockId?: string
  blockIndex: number
  offsetInBlock: number
  absoluteOffset: number
  wasFocused: boolean
}

const VALID_BLOCK_TYPES = new Set<BlockType>([
  "scene_heading",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
  "shot",
])

function findScrollableAncestor(node: HTMLElement | null): HTMLElement | null {
  let current = node?.parentElement ?? null

  while (current) {
    const style = window.getComputedStyle(current)
    const overflowY = style.overflowY
    const canScroll =
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      current.scrollHeight > current.clientHeight

    if (canScroll) {
      return current
    }

    current = current.parentElement
  }

  return document.scrollingElement as HTMLElement | null
}

function getCollapsedSelectionOffset(editor: Editor): number | null {
  const { selection } = editor
  if (!selection || !Range.isCollapsed(selection)) return null

  const anchor = selection.anchor
  if (anchor.path.length < 2) return null

  let absolute = 0
  for (let i = 0; i < anchor.path[0] && i < editor.children.length; i++) {
    absolute += Node.string(editor.children[i]).length + 1
  }
  absolute += anchor.offset
  return absolute
}

function getPointInBlock(editor: Editor, blockIndex: number, offsetInBlock: number): Point | null {
  const blockNode = editor.children[blockIndex]
  if (!blockNode) return null

  const textEntries = Array.from(Node.texts(blockNode))
  if (textEntries.length === 0) return null

  let remaining = Math.max(0, offsetInBlock)

  for (let i = 0; i < textEntries.length; i++) {
    const [textNode, relativePath] = textEntries[i]
    const textLen = textNode.text.length

    if (remaining <= textLen) {
      return {
        path: [blockIndex, ...relativePath],
        offset: remaining,
      }
    }

    remaining -= textLen
  }

  const [lastTextNode, lastRelativePath] = textEntries[textEntries.length - 1]
  return {
    path: [blockIndex, ...lastRelativePath],
    offset: lastTextNode.text.length,
  }
}

function getPointFromAbsoluteOffset(editor: Editor, absoluteOffset: number): Point | null {
  if (editor.children.length === 0) return null

  let remaining = Math.max(0, absoluteOffset)

  for (let i = 0; i < editor.children.length; i++) {
    const len = Node.string(editor.children[i]).length
    if (remaining <= len) {
      return getPointInBlock(editor, i, remaining)
    }
    remaining -= len + 1
  }

  const lastIndex = editor.children.length - 1
  const lastLen = Node.string(editor.children[lastIndex]).length
  return getPointInBlock(editor, lastIndex, lastLen)
}

function getAbsoluteOffsetFromPoint(editor: Editor, point: Point): number | null {
  if (point.path.length < 2) return null

  const blockIndex = point.path[0]
  if (blockIndex < 0 || blockIndex >= editor.children.length) return null

  let absolute = 0

  for (let i = 0; i < blockIndex; i++) {
    absolute += Node.string(editor.children[i]).length + 1
  }

  const blockNode = editor.children[blockIndex]
  const textEntries = Array.from(Node.texts(blockNode))

  for (const [textNode, relativePath] of textEntries) {
    const fullPath = [blockIndex, ...relativePath]
    if (Path.equals(fullPath, point.path)) {
      return absolute + point.offset
    }

    absolute += textNode.text.length
  }

  return null
}

function captureCaretSnapshot(editor: Editor): CaretSnapshot | null {
  const { selection } = editor
  if (!selection || !Range.isCollapsed(selection)) return null

  const anchor = selection.anchor
  if (anchor.path.length < 2) return null

  const blockIndex = anchor.path[0]
  const node = editor.children[blockIndex] as { id?: unknown } | undefined
  const blockId = typeof node?.id === "string" ? node.id : undefined
  const absoluteOffset = getCollapsedSelectionOffset(editor)
  if (absoluteOffset === null) return null

  let wasFocused = false
  try {
    wasFocused = ReactEditor.isFocused(editor as ReactEditor)
  } catch {
    wasFocused = false
  }

  return {
    blockId,
    blockIndex,
    offsetInBlock: anchor.offset,
    absoluteOffset,
    wasFocused,
  }
}

function getPointFromCaretSnapshot(editor: Editor, snapshot: CaretSnapshot): Point | null {
  if (editor.children.length === 0) return null

  let targetIndex = -1

  if (snapshot.blockId) {
    targetIndex = editor.children.findIndex((n) => {
      const candidate = n as { id?: unknown }
      return typeof candidate.id === "string" && candidate.id === snapshot.blockId
    })
  }

  if (targetIndex < 0 && snapshot.blockIndex >= 0 && snapshot.blockIndex < editor.children.length) {
    targetIndex = snapshot.blockIndex
  }

  if (targetIndex >= 0) {
    const len = Node.string(editor.children[targetIndex]).length
    return {
      path: [targetIndex, 0],
      offset: Math.max(0, Math.min(snapshot.offsetInBlock, len)),
    }
  }

  return getPointFromAbsoluteOffset(editor, snapshot.absoluteOffset)
}

// ─── Component ───────────────────────────────────────────

const SlateScreenplayEditor = forwardRef<
  ScreenplayEditorHandle,
  ScreenplayEditorProps
>(function SlateScreenplayEditor(
  {
    onChange,
    onSelectionAction,
    onRequestUndo,
    onRequestRedo,
    aiRippleRange,
    focusMode = false,
    embedded = false,
  },
  ref
) {
  const { theme } = useBoardStore()
  const scenario = useScriptStore((s) => s.scenario)
  const blocks = useScriptStore((s) => s.blocks)
  const setBlocks = useScriptStore((s) => s.setBlocks)
  const setScenario = useScriptStore((s) => s.setScenario)
  const isDark = theme === "sepia"

  const lastPushedRef = useRef(scenario)
  const embeddedInitialFocusDoneRef = useRef(false)
  const lastKnownCaretSnapshotRef = useRef<CaretSnapshot | null>(null)
  const pendingCaretRestoreSnapshotRef = useRef<CaretSnapshot | null>(null)
  const [resetKey, setResetKey] = useState(0)

  const editor = useMemo(() => {
    void resetKey
    return withScreenplay(withHistory(withReact(createEditor())))
  }, [resetKey])
  const initialValue = useMemo<Descendant[]>(() => {
    void resetKey
    const currentBlocks = useScriptStore.getState().blocks
    if (!currentBlocks || currentBlocks.length === 0) {
      return [createScreenplayElement("action", "")]
    }

    return currentBlocks.map((block) => ({
      type: block.type as ScreenplayElementType,
      id: block.id,
      children: [{ text: block.text }],
    }))
  }, [resetKey])

  const [floatingToolbar, setFloatingToolbar] = useState<FloatingToolbarState>({
    visible: false,
    selectedText: "",
  })
  const [toolbarCollapsed, setToolbarCollapsed] = useState(focusMode)
  const [zoomPercent, setZoomPercent] = useState(100)
  const [typewriterSound, setTypewriterSound] = useState(false)
  const [slugGhost, setSlugGhost] = useState<{ ghost: string; full: string } | null>(null)
  const [autocomplete, setAutocomplete] = useState<AutocompleteState | null>(null)
  const standaloneScrollRef = useRef<HTMLDivElement | null>(null)
  const embeddedRootRef = useRef<HTMLDivElement | null>(null)
  const hasAnimatedSecondPageRef = useRef(false)
  const autoScrollRafRef = useRef<number | null>(null)

  // ── Industry standard: 12pt Courier = 16px, single-spaced = ×1.25 ──
  const zoomScale = zoomPercent / 100
  const editorFontSize = SCREENPLAY_FONT_SIZE_PX * zoomScale
  const editorLineHeightPx = SCREENPLAY_LINE_HEIGHT_PX * zoomScale
  const initialPlaceholder = ""

  // ── Industry standard margins: top 1", right 1", bottom 1", left 1.5" ──
  const editorPadding = `${SCREENPLAY_PAGE_PADDING_TOP_PX * zoomScale}px ${SCREENPLAY_PAGE_PADDING_RIGHT_PX * zoomScale}px ${SCREENPLAY_PAGE_PADDING_BOTTOM_PX * zoomScale}px ${SCREENPLAY_PAGE_PADDING_LEFT_PX * zoomScale}px`

  // ── Colors ──

  const colors = useMemo<ScreenplayColors>(() => {
    let nextColors: ScreenplayColors = isDark ? { ...palette.sepia } : { ...palette.light }
    if (focusMode) {
      const fp = isDark ? focusPalette.sepia : focusPalette.light
      nextColors = { ...nextColors, ...fp }
    }
    return nextColors
  }, [focusMode, isDark])

  // ── Stats ──

  const sceneCount = useMemo(() => {
    try {
      return editor.children.filter(
        (n) => SlateElement.isElement(n) && (n as ScreenplayElement).type === "scene_heading"
      ).length
    } catch {
      return 0
    }
  }, [editor.children])

  const pageCount = useMemo(() => {
    const contentWidthPx =
      SCREENPLAY_PAGE_WIDTH_PX -
      SCREENPLAY_PAGE_PADDING_LEFT_PX -
      SCREENPLAY_PAGE_PADDING_RIGHT_PX

    // Courier Prime at 16px is close to ~0.6em per character.
    const baseCharsPerLine = Math.max(20, Math.floor(contentWidthPx / (SCREENPLAY_FONT_SIZE_PX * 0.6)))

    const estimatedLines = editor.children.reduce((sum, node) => {
      if (!SlateElement.isElement(node)) return sum

      const el = node as ScreenplayElement
      const text = Node.string(el).trim()
      if (!text) return sum + 1

      let availableChars = baseCharsPerLine
      if (el.type === "character") {
        availableChars -= SCREENPLAY_CHARACTER_INDENT_CH
      } else if (el.type === "dialogue") {
        availableChars -= SCREENPLAY_DIALOGUE_INDENT_LEFT_CH + SCREENPLAY_DIALOGUE_INDENT_RIGHT_CH
      } else if (el.type === "parenthetical") {
        availableChars -= SCREENPLAY_PARENTHETICAL_INDENT_CH
      }

      const safeChars = Math.max(8, availableChars)
      return sum + Math.max(1, Math.ceil(text.length / safeChars))
    }, 0)

    return Math.max(1, Math.ceil((estimatedLines || 1) / SCREENPLAY_LINES_PER_PAGE))
  }, [editor.children])

  // ── Page break calculation for paginated layout ──

  const { pageBreakMargins, visualPageCount } = useMemo(() => {
    const PAGE_H = SCREENPLAY_PAGE_HEIGHT_PX
    const GAP = SCREENPLAY_PAGE_GAP_PX
    const PAD_TOP = SCREENPLAY_PAGE_PADDING_TOP_PX
    const CONTENT_H = SCREENPLAY_TEXT_AREA_HEIGHT_PX
    const LINE_H = SCREENPLAY_LINE_HEIGHT_PX
    const FONT_SZ = SCREENPLAY_FONT_SIZE_PX

    const contentWidth =
      SCREENPLAY_PAGE_WIDTH_PX - SCREENPLAY_PAGE_PADDING_LEFT_PX - SCREENPLAY_PAGE_PADDING_RIGHT_PX
    const charsPerLine = Math.max(20, Math.floor(contentWidth / (FONT_SZ * 0.6)))

    const pageContentStart = (n: number) => n * (PAGE_H + GAP) + PAD_TOP
    const pageContentEnd = (n: number) => pageContentStart(n) + CONTENT_H

    const margins = new Map<number, number>()
    let pageIdx = 0
    let visualY = PAD_TOP

    for (let i = 0; i < editor.children.length; i++) {
      const node = editor.children[i]
      if (!SlateElement.isElement(node)) continue
      const el = node as ScreenplayElement

      // Normal margin
      let normalMargin = 0
      if (i > 0) {
        if (el.type === "scene_heading") normalMargin = SCREENPLAY_SCENE_HEADING_MARGIN_TOP_PX
        else if (el.type === "character") normalMargin = SCREENPLAY_CHARACTER_MARGIN_TOP_PX
        else if (el.type === "transition") normalMargin = SCREENPLAY_TRANSITION_MARGIN_TOP_PX
        else if (el.type === "action") {
          const prev = editor.children[i - 1]
          if (SlateElement.isElement(prev)) {
            const pt = (prev as ScreenplayElement).type
            if (pt === "scene_heading") normalMargin = SCREENPLAY_ACTION_AFTER_SCENE_HEADING_MARGIN_TOP_PX
            else if (pt === "action") normalMargin = SCREENPLAY_ACTION_AFTER_ACTION_MARGIN_TOP_PX
          }
        }
      }

      // Estimate element height in pixels
      const text = Node.string(el).trim()
      let avail = charsPerLine
      if (el.type === "character") avail -= SCREENPLAY_CHARACTER_INDENT_CH
      else if (el.type === "dialogue")
        avail -= SCREENPLAY_DIALOGUE_INDENT_LEFT_CH + SCREENPLAY_DIALOGUE_INDENT_RIGHT_CH
      else if (el.type === "parenthetical") avail -= SCREENPLAY_PARENTHETICAL_INDENT_CH
      avail = Math.max(8, avail)
      const lines = !text ? 1 : Math.max(1, Math.ceil(text.length / avail))
      const elemH = lines * LINE_H

      const elemTop = visualY + normalMargin
      const elemBottom = elemTop + elemH
      const curPageEnd = pageContentEnd(pageIdx)

      if (elemBottom > curPageEnd && visualY > pageContentStart(pageIdx)) {
        // Element crosses page boundary; push to next page
        pageIdx++
        const newTop = pageContentStart(pageIdx)
        margins.set(i, newTop - visualY)
        visualY = newTop + elemH
      } else {
        visualY = elemBottom
      }

      while (visualY > pageContentEnd(pageIdx)) pageIdx++
    }

    return { pageBreakMargins: margins, visualPageCount: pageIdx + 1 }
  }, [editor.children])

  // ── Typewriter sound ──

  const playTypeSound = useCallback(() => {
    if (!typewriterSound) return
    const Ctor = window.AudioContext || (window as AudioContextWindow).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 800 + Math.random() * 400
    gain.gain.value = 0.03
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)
    osc.start()
    osc.stop(ctx.currentTime + 0.05)
  }, [typewriterSound])

  // ── External sync ──

  useEffect(() => {
    if (scenario !== lastPushedRef.current) {
      const currentSnapshot = captureCaretSnapshot(editor)
      const restoreSnapshot = currentSnapshot ?? lastKnownCaretSnapshotRef.current
      pendingCaretRestoreSnapshotRef.current = restoreSnapshot

      lastPushedRef.current = scenario
      setResetKey((k) => k + 1)
    }
  }, [scenario, blocks, editor])

  // ── Imperative handle ──

  useImperativeHandle(ref, () => ({
    getValue: () => useScriptStore.getState().scenario,
    setValue: (text: string) => {
      setScenario(text)
      lastPushedRef.current = useScriptStore.getState().scenario
      onChange?.(text)
    },
    focus: () => {
      try { ReactEditor.focus(editor) } catch { /* */ }
    },
    undo: () => {
      const history = (editor as unknown as { history?: { undos?: unknown[] } }).history
      if (history?.undos?.length) {
        editor.undo()
        return true
      }
      return onRequestUndo?.() ?? false
    },
    redo: () => {
      const history = (editor as unknown as { history?: { redos?: unknown[] } }).history
      if (history?.redos?.length) {
        editor.redo()
        return true
      }
      return onRequestRedo?.() ?? false
    },
  }))

  useEffect(() => {
    if (!embedded) return
    if (embeddedInitialFocusDoneRef.current) return

    embeddedInitialFocusDoneRef.current = true
    const timer = window.setTimeout(() => {
      try {
        Transforms.select(editor, { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 0 } })
        ReactEditor.focus(editor)
      } catch { /* */ }
    }, 50)
    return () => window.clearTimeout(timer)
  }, [embedded, editor])

  useEffect(() => {
    if (!embedded) return

    const restoreSnapshot = pendingCaretRestoreSnapshotRef.current
    if (!restoreSnapshot) return

    const timer = window.setTimeout(() => {
      try {
        const point = getPointFromCaretSnapshot(editor, restoreSnapshot)
        if (!point) return

        Transforms.select(editor, { anchor: point, focus: point })
        lastKnownCaretSnapshotRef.current = {
          ...restoreSnapshot,
          blockIndex: point.path[0],
          offsetInBlock: point.offset,
        }

        if (restoreSnapshot.wasFocused) {
          ReactEditor.focus(editor)
        }
      } catch {
        // Ignore restore failures during transient render states.
      } finally {
        pendingCaretRestoreSnapshotRef.current = null
      }
    }, 0)

    return () => window.clearTimeout(timer)
  }, [embedded, editor, resetKey])

  // ── onChange ──

  const handleChange = useCallback(
    (newValue: Descendant[]) => {
      const snapshot = captureCaretSnapshot(editor)
      if (snapshot) {
        lastKnownCaretSnapshotRef.current = snapshot
      }

      const nextBlocks = newValue
        .filter((node): node is ScreenplayElement => SlateElement.isElement(node))
        .map((node) => {
          const rawType = typeof node.type === "string" ? node.type : "action"
          const safeType = VALID_BLOCK_TYPES.has(rawType as BlockType)
            ? (rawType as BlockType)
            : "action"
          const safeId = typeof node.id === "string" && node.id.trim() ? node.id : makeBlock(safeType).id

          return {
            id: safeId,
            type: safeType,
            text: Node.string(node),
          }
        })

      const finalBlocks = nextBlocks.length > 0 ? nextBlocks : [makeBlock("action", "")]
      setBlocks(finalBlocks)

      const syncedScenario = useScriptStore.getState().scenario
      lastPushedRef.current = syncedScenario
      onChange?.(syncedScenario)

      // Compute slug ghost suggestion
      try {
        const entry = getCurrentElementEntry(editor)
        if (entry) {
          const [el] = entry
          if (isSlugGhostEligibleType(el.type)) {
            const nodeText = Node.string(el)
            setSlugGhost(findSlugSuggestion(nodeText))
          } else {
            setSlugGhost(null)
          }
        } else {
          setSlugGhost(null)
        }
      } catch {
        setSlugGhost(null)
      }

      try {
        const model = computeAutocompleteModel(editor)
        if (!model || model.items.length === 0) {
          setAutocomplete(null)
        } else {
          setAutocomplete((prev) => ({
            kind: model.kind,
            items: model.items,
            selected: prev && prev.kind === model.kind ? Math.min(prev.selected, model.items.length - 1) : 0,
          }))
        }
      } catch {
        setAutocomplete(null)
      }
    },
    [setBlocks, onChange, editor]
  )

  const applyAutocomplete = useCallback(() => {
    if (!autocomplete || autocomplete.items.length === 0) return false
    const safeIndex = Math.min(
      Math.max(autocomplete.selected, 0),
      autocomplete.items.length - 1
    )
    const choice = autocomplete.items[safeIndex] ?? autocomplete.items[0]
    if (!choice) return false

    const ok = applyAutocompleteChoice(editor, autocomplete.kind, choice)
    if (ok) {
      setAutocomplete(null)
      setSlugGhost(null)
      ReactEditor.focus(editor)
    }
    return ok
  }, [autocomplete, editor])

  // ── Insert helpers ──

  const insertNewBlock = useCallback(
    (type: ScreenplayElementType, text: string = "") => {
      const entry = getCurrentElementEntry(editor)
      const insertPath = entry ? [entry[1][0] + 1] : [editor.children.length]
      Transforms.insertNodes(editor, createScreenplayElement(type, text), { at: insertPath })
      Transforms.select(editor, Editor.end(editor, insertPath))
      ReactEditor.focus(editor)
    },
    [editor]
  )

  // ── AI floating action ──

  const applyAIAction = useCallback(
    (action: string) => {
      const text = floatingToolbar.selectedText
      if (!text) return

      const payload = buildFloatingSelectionAction(editor, scenario, action, text)
      if (!payload) return

      onSelectionAction?.(payload)
      setFloatingToolbar({ visible: false, selectedText: "" })
    },
    [editor, floatingToolbar.selectedText, onSelectionAction, scenario]
  )

  const applyGrammarToPreviousBlock = useCallback(() => {
    if (!onSelectionAction) return false

    const payload = buildShiftEnterGrammarAction(editor)
    if (!payload) return false

    onSelectionAction(payload)

    setFloatingToolbar({ visible: false, selectedText: "" })
    return true
  }, [editor, onSelectionAction])

  // ── Mouse handling for selection toolbar ──

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      try {
        const { selection } = editor
        if (selection && !Range.isCollapsed(selection)) {
          const text = getSelectedText(editor)
          if (text.trim()) {
            setFloatingToolbar({ visible: true, selectedText: text })
            return
          }
        }
      } catch { /* */ }
      setFloatingToolbar({ visible: false, selectedText: "" })
    }, 10)
  }, [editor])

  // ── Key handling (Rules 8, 9, 10, 12, 18 + shortcuts) ──

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const snapshot = captureCaretSnapshot(editor)
      if (snapshot) {
        lastKnownCaretSnapshotRef.current = snapshot
      }

      const isMod = e.metaKey || e.ctrlKey

      if (e.key === "Enter" && e.shiftKey) {
        // Trigger grammar assist, but keep native Enter screenplay flow intact.
        applyGrammarToPreviousBlock()
      }

      // Typewriter sound for normal keys
      if (!isMod && !e.altKey && e.key.length === 1) {
        playTypeSound()
      }

      // Hybrid Pro priority: active autocomplete consumes navigation and accept keys.
      if (autocomplete && autocomplete.items.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault()
          setAutocomplete((prev) =>
            prev
              ? { ...prev, selected: (prev.selected + 1) % prev.items.length }
              : prev
          )
          return
        }

        if (e.key === "ArrowUp") {
          e.preventDefault()
          setAutocomplete((prev) =>
            prev
              ? {
                  ...prev,
                  selected: (prev.selected - 1 + prev.items.length) % prev.items.length,
                }
              : prev
          )
          return
        }

        if (e.key === "Tab") {
          e.preventDefault()
          const applied = applyAutocomplete()
          if (applied) {
            return
          }
          // If autocomplete could not be applied, close it and continue with
          // normal Enter/Tab behavior for the current block.
          setAutocomplete(null)
        }

        if (e.key === "Enter") {
          e.preventDefault()
          const applied = applyAutocomplete()
          if (applied) {
            return
          }
          setAutocomplete(null)
          return
        }

        if (e.key === " ") {
          // Allow typing a space normally, but dismiss suggestions.
          setAutocomplete(null)
          return
        }

        if (e.key === "Escape") {
          e.preventDefault()
          setAutocomplete(null)
          handleEscapeKey(e, setFloatingToolbar, setSlugGhost)
          return
        }
      }

      if (handleAutoCapsKey(e, editor)) return
      if (handleOpenParentheticalKey(e, editor)) return

      // ── Rules 8, 9, 10 + Ghost slug acceptance: Tab behavior ──
      if (e.key === "Tab") {
        e.preventDefault()
        handleTabBehavior({
          editor,
          shiftKey: e.shiftKey,
          slugGhost,
          setSlugGhost,
        })
        return
      }

      if (
        handleModShortcuts(e, editor, insertNewBlock, {
          onUndoExternal: onRequestUndo,
          onRedoExternal: onRequestRedo,
        })
      ) return
      if (e.key === "Escape") {
        setAutocomplete(null)
      }
      handleEscapeKey(e, setFloatingToolbar, setSlugGhost)
    },
    [
      editor,
      insertNewBlock,
      playTypeSound,
      slugGhost,
      autocomplete,
      applyAutocomplete,
      applyGrammarToPreviousBlock,
      onRequestUndo,
      onRequestRedo,
    ]
  )

  const autocompleteTitle =
    autocomplete?.kind === "character"
      ? "Character"
      : autocomplete?.kind === "location"
        ? "Location"
        : "Time of day"

  // ── Page break margins scaled to current zoom ──

  const scaledPageBreakMargins = useMemo(() => {
    if (pageBreakMargins.size === 0) return pageBreakMargins
    const scaled = new Map<number, number>()
    for (const [idx, margin] of pageBreakMargins) {
      scaled.set(idx, margin * zoomScale)
    }
    return scaled
  }, [pageBreakMargins, zoomScale])

  // ── Render element (with industry-standard indents) ──

  const renderElement = useMemo(
    () => createRenderElement({ editor, colors, editorFontSize, editorLineHeightPx, pageBreakMargins: scaledPageBreakMargins }),
    [editor, colors, editorFontSize, editorLineHeightPx, scaledPageBreakMargins]
  )

  useEffect(() => {
    if (autoScrollRafRef.current !== null) {
      window.cancelAnimationFrame(autoScrollRafRef.current)
      autoScrollRafRef.current = null
    }

    if (visualPageCount < 2) {
      hasAnimatedSecondPageRef.current = false
      return
    }

    if (hasAnimatedSecondPageRef.current) {
      return
    }

    const scrollHost = embedded
      ? findScrollableAncestor(embeddedRootRef.current)
      : standaloneScrollRef.current

    if (!scrollHost) {
      return
    }

    const targetTop = (SCREENPLAY_PAGE_HEIGHT_PX + SCREENPLAY_PAGE_GAP_PX) * zoomScale
    if (targetTop <= 0) {
      hasAnimatedSecondPageRef.current = true
      return
    }

    if (scrollHost.scrollTop > targetTop * 0.25) {
      hasAnimatedSecondPageRef.current = true
      return
    }

    const startTop = scrollHost.scrollTop
    const distance = Math.max(0, targetTop - startTop)
    if (distance < 1) {
      hasAnimatedSecondPageRef.current = true
      return
    }

    const durationMs = 900
    const startedAt = performance.now()

    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

    const tick = (now: number) => {
      const elapsed = now - startedAt
      const t = Math.min(1, elapsed / durationMs)
      const eased = easeInOutCubic(t)
      scrollHost.scrollTop = startTop + distance * eased

      if (t < 1) {
        autoScrollRafRef.current = window.requestAnimationFrame(tick)
      } else {
        autoScrollRafRef.current = null
        hasAnimatedSecondPageRef.current = true
      }
    }

    autoScrollRafRef.current = window.requestAnimationFrame(tick)

    return () => {
      if (autoScrollRafRef.current !== null) {
        window.cancelAnimationFrame(autoScrollRafRef.current)
        autoScrollRafRef.current = null
      }
    }
  }, [embedded, visualPageCount, zoomScale])

  const decorate = useCallback((entry: [Node, number[]]) => {
    if (!aiRippleRange) return []

    const [node, path] = entry
    if (!Text.isText(node)) return []

    const startOffset = Math.max(0, aiRippleRange.start)
    const endOffset = Math.max(startOffset + 1, aiRippleRange.end)

    const anchor = getPointFromAbsoluteOffset(editor, startOffset)
    const focus = getPointFromAbsoluteOffset(editor, endOffset)
    if (!anchor || !focus) return []

    const globalRange: Range = { anchor, focus }
    const nodeRange = Editor.range(editor, path)
    const intersection = Range.intersection(globalRange, nodeRange)
    if (!intersection) return []

    const intersectionStart = getAbsoluteOffsetFromPoint(editor, Range.start(intersection))
    const intersectionEnd = getAbsoluteOffsetFromPoint(editor, Range.end(intersection))
    if (intersectionStart === null || intersectionEnd === null) return []

    const rippleRangeLength = Math.max(1, endOffset - startOffset)
    const rippleSegmentStart = Math.max(0, intersectionStart - startOffset)
    const rippleSegmentLength = Math.max(1, intersectionEnd - intersectionStart)

    return [
      {
        anchor: intersection.anchor,
        focus: intersection.focus,
        aiRipple: true,
        aiRippleToken: aiRippleRange.token,
        aiRippleRangeLength: rippleRangeLength,
        aiRippleSegmentStart: rippleSegmentStart,
        aiRippleSegmentLength: rippleSegmentLength,
      },
    ]
  }, [aiRippleRange, editor])

  // ── Render leaf ──

  const renderLeaf = useMemo(() => createRenderLeaf(), [])

  const rememberCaret = useCallback(() => {
    const snapshot = captureCaretSnapshot(editor)
    if (snapshot) {
      lastKnownCaretSnapshotRef.current = snapshot
    }
  }, [editor])

  // ─── Embedded mode (inside ScriptWriterOverlay) ───

  if (embedded) {
    return (
      <div
        ref={embeddedRootRef}
        className="w-full"
        style={{
          position: "relative",
          width: SCREENPLAY_PAGE_WIDTH_PX,
          minHeight: visualPageCount * SCREENPLAY_PAGE_HEIGHT_PX + (visualPageCount - 1) * SCREENPLAY_PAGE_GAP_PX,
        }}
      >
        {/* Page paper backgrounds */}
        {Array.from({ length: visualPageCount }).map((_, i) => (
          <div
            key={`emb-page-${i}`}
            style={{
              position: "absolute",
              top: i * (SCREENPLAY_PAGE_HEIGHT_PX + SCREENPLAY_PAGE_GAP_PX),
              left: 0,
              width: "100%",
              height: SCREENPLAY_PAGE_HEIGHT_PX,
              backgroundColor: "#FFFFFF",
              borderRadius: 3,
              border: "1px solid #E5E0DB",
              boxShadow: "0 8px 60px rgba(0,0,0,0.4)",
              pointerEvents: "none",
            }}
          />
        ))}

        {/* Page numbers */}
        {visualPageCount > 1 && Array.from({ length: visualPageCount }).map((_, i) => (
          <div
            key={`emb-pgnum-${i}`}
            style={{
              position: "absolute",
              top: i * (SCREENPLAY_PAGE_HEIGHT_PX + SCREENPLAY_PAGE_GAP_PX) + SCREENPLAY_PAGE_PADDING_TOP_PX * 0.35,
              right: SCREENPLAY_PAGE_PADDING_RIGHT_PX * 0.5,
              fontSize: 11,
              color: "rgba(0,0,0,0.3)",
              pointerEvents: "none",
              zIndex: 2,
              fontFamily: "'Courier Prime', monospace",
            }}
          >
            {i + 1}.
          </div>
        ))}

        <Slate key={resetKey} editor={editor} initialValue={initialValue} onChange={handleChange}>
          <Editable
            renderElement={renderElement}
            renderLeaf={renderLeaf}
            decorate={decorate}
            onKeyDown={handleKeyDown}
            onSelect={rememberCaret}
            onMouseUp={handleMouseUp}
            placeholder={initialPlaceholder}
            spellCheck={false}
            className="slate-screenplay-editor"
            style={{
              position: "relative",
              zIndex: 1,
              padding: `${SCREENPLAY_PAGE_PADDING_TOP_PX}px ${SCREENPLAY_PAGE_PADDING_RIGHT_PX}px ${SCREENPLAY_PAGE_PADDING_BOTTOM_PX}px ${SCREENPLAY_PAGE_PADDING_LEFT_PX}px`,
              outline: "none",
              color: "#1a1a1a",
              caretColor: "#333",
              background: "transparent",
              minHeight: visualPageCount * SCREENPLAY_PAGE_HEIGHT_PX + (visualPageCount - 1) * SCREENPLAY_PAGE_GAP_PX,
              fontFamily: "'Courier Prime', 'Courier New', monospace",
            }}
          />
        </Slate>
        {/* Portal overlays to document.body to escape parent transform: scale() */}
        {typeof document !== "undefined" && createPortal(
          <>
            {autocomplete && autocomplete.items.length > 0 && (
              <div
                style={{
                  position: "fixed",
                  left: "50%",
                  bottom: 58,
                  transform: "translateX(-50%)",
                  minWidth: 320,
                  maxWidth: 520,
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: "rgba(255,255,255,0.98)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  zIndex: 200,
                  padding: "6px",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "rgba(0,0,0,0.45)",
                    padding: "4px 8px 6px",
                    fontFamily: "'Courier Prime', monospace",
                  }}
                >
                  {autocompleteTitle} suggestions
                </div>
                {autocomplete.items.map((item, index) => (
                  <div
                    key={`${autocomplete.kind}-${item}`}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      fontSize: 13,
                      fontFamily: "'Courier Prime', monospace",
                      background: index === autocomplete.selected ? "rgba(0,0,0,0.08)" : "transparent",
                      color: "#1a1a1a",
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            )}
            <ScreenplayFloatingAiToolbar
              floatingToolbar={floatingToolbar}
              colors={colors}
              applyAIAction={applyAIAction}
              setFloatingToolbar={setFloatingToolbar}
            />
          </>,
          document.body
        )}
        <style jsx>{`
          .slate-screenplay-editor ::selection {
            background: rgba(70, 130, 220, 0.25);
            color: #000;
          }
          .slate-screenplay-editor [data-slate-placeholder="true"] {
            color: #9d948b !important;
            opacity: 1;
            font-style: italic;
          }
        `}</style>
      </div>
    )
  }

  // ─── Standalone mode (ScreenplayPanel) ───

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: focusMode ? "transparent" : colors.bg }}>
      <div className="relative mx-auto flex w-full flex-1 overflow-hidden" style={focusMode ? undefined : { maxWidth: Math.max(720, SCREENPLAY_PAGE_WIDTH_PX * zoomScale + 120) }}>
        <ScreenplayToolbar
          colors={colors}
          focusMode={focusMode}
          toolbarCollapsed={toolbarCollapsed}
          setToolbarCollapsed={setToolbarCollapsed}
          insertNewBlock={insertNewBlock}
          onBold={() => {
            toggleMark(editor, "bold")
            ReactEditor.focus(editor)
          }}
          onItalic={() => {
            toggleMark(editor, "italic")
            ReactEditor.focus(editor)
          }}
          onUnderline={() => {
            toggleMark(editor, "underline")
            ReactEditor.focus(editor)
          }}
          onUndo={() => {
            editor.undo()
            ReactEditor.focus(editor)
          }}
          onRedo={() => {
            editor.redo()
            ReactEditor.focus(editor)
          }}
          onToggleTypewriter={() => setTypewriterSound((v) => !v)}
          typewriterSound={typewriterSound}
        />

        {/* EDITOR AREA */}
        <div className="relative flex-1 overflow-hidden" style={{ backgroundColor: focusMode ? "transparent" : (isDark ? "#201E1B" : "#EDEDED"), padding: focusMode ? "40px 0" : "0 0 0 72px" }}>
          <div
            ref={standaloneScrollRef}
            className="relative h-full w-full overflow-auto"
            style={{
              backgroundColor: focusMode ? "rgba(10,11,16,0.75)" : "transparent",
              borderRadius: focusMode ? "3px" : undefined,
              border: focusMode ? `1px solid ${colors.border}` : undefined,
              width: focusMode ? 660 : undefined,
              maxWidth: focusMode ? "calc(100vw - 48px)" : undefined,
              margin: focusMode ? "0 auto" : undefined,
              backdropFilter: focusMode ? "blur(12px)" : undefined,
            }}
          >
            <ScreenplayTopInfo
              focusMode={focusMode}
              colors={colors}
              sceneCount={sceneCount}
              pageCount={pageCount}
              zoomPercent={zoomPercent}
              setZoomPercent={setZoomPercent}
            />

            {/* Pages container */}
            <div
              style={{
                position: "relative",
                width: SCREENPLAY_PAGE_WIDTH_PX * zoomScale,
                margin: `${SCREENPLAY_PAGE_GAP_PX * zoomScale}px auto`,
                minHeight: visualPageCount * SCREENPLAY_PAGE_HEIGHT_PX * zoomScale + (visualPageCount - 1) * SCREENPLAY_PAGE_GAP_PX * zoomScale,
              }}
            >
              {/* Page paper backgrounds */}
              {Array.from({ length: visualPageCount }).map((_, i) => (
                <div
                  key={`page-${i}`}
                  style={{
                    position: "absolute",
                    top: i * (SCREENPLAY_PAGE_HEIGHT_PX + SCREENPLAY_PAGE_GAP_PX) * zoomScale,
                    left: 0,
                    width: "100%",
                    height: SCREENPLAY_PAGE_HEIGHT_PX * zoomScale,
                    backgroundColor: focusMode ? colors.surfaceBg : colors.surfaceBg,
                    boxShadow: isDark
                      ? "0 1px 3px rgba(0,0,0,0.24), 0 1px 2px rgba(0,0,0,0.16)"
                      : "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)",
                    borderRadius: 2,
                    pointerEvents: "none",
                  }}
                />
              ))}

              {/* Page numbers */}
              {visualPageCount > 1 && Array.from({ length: visualPageCount }).map((_, i) => (
                <div
                  key={`pgnum-${i}`}
                  style={{
                    position: "absolute",
                    top: i * (SCREENPLAY_PAGE_HEIGHT_PX + SCREENPLAY_PAGE_GAP_PX) * zoomScale + SCREENPLAY_PAGE_PADDING_TOP_PX * zoomScale * 0.35,
                    right: SCREENPLAY_PAGE_PADDING_RIGHT_PX * zoomScale * 0.5,
                    fontSize: 11 * zoomScale,
                    color: colors.muted,
                    pointerEvents: "none",
                    zIndex: 2,
                    fontFamily: "'Courier Prime', monospace",
                  }}
                >
                  {i + 1}.
                </div>
              ))}

              {/* Slate editor */}
              <Slate key={resetKey} editor={editor} initialValue={initialValue} onChange={handleChange}>
                <Editable
                  renderElement={renderElement}
                  renderLeaf={renderLeaf}
                  decorate={decorate}
                  onKeyDown={handleKeyDown}
                  onSelect={rememberCaret}
                  onMouseUp={handleMouseUp}
                  placeholder={initialPlaceholder}
                  spellCheck={false}
                  className="slate-screenplay-editor"
                  style={{
                    position: "relative",
                    zIndex: 1,
                    padding: editorPadding,
                    outline: "none",
                    color: colors.text,
                    caretColor: colors.accent,
                    background: "transparent",
                    minHeight: visualPageCount * SCREENPLAY_PAGE_HEIGHT_PX * zoomScale + (visualPageCount - 1) * SCREENPLAY_PAGE_GAP_PX * zoomScale,
                  }}
                />
              </Slate>
            </div>

            {autocomplete && autocomplete.items.length > 0 && (
              <div
                style={{
                  position: "fixed",
                  left: "50%",
                  bottom: 58,
                  transform: "translateX(-50%)",
                  minWidth: 320,
                  maxWidth: 520,
                  borderRadius: 10,
                  border: `1px solid ${colors.border}`,
                  background: colors.surfaceElevatedBg,
                  boxShadow: colors.shadow,
                  zIndex: 30,
                  padding: "6px",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: colors.muted,
                    padding: "4px 8px 6px",
                    fontFamily: "'Courier Prime', monospace",
                  }}
                >
                  {autocompleteTitle} suggestions
                </div>
                {autocomplete.items.map((item, index) => (
                  <div
                    key={`${autocomplete.kind}-${item}`}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      fontSize: 13,
                      fontFamily: "'Courier Prime', monospace",
                      background: index === autocomplete.selected ? colors.buttonHover : "transparent",
                      color: colors.text,
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <ScreenplayFloatingAiToolbar
          floatingToolbar={floatingToolbar}
          colors={colors}
          applyAIAction={applyAIAction}
          setFloatingToolbar={setFloatingToolbar}
        />
      </div>

      <ScreenplayFooter
        focusMode={focusMode}
        colors={colors}
        sceneCount={sceneCount}
        pageCount={pageCount}
        scenarioLength={scenario.length}
        zoomPercent={zoomPercent}
      />

      <style jsx>{`
        .slate-screenplay-editor ::selection {
          background: ${colors.selection};
          color: ${colors.selectionText};
        }
        .slate-screenplay-editor::-webkit-scrollbar { width: 10px; }
        .slate-screenplay-editor::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.1); }
        .slate-screenplay-editor::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 999px; border: 2px solid transparent; background-clip: padding-box; }
        .slate-screenplay-editor::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.3); }
      `}</style>
    </div>
  )
})

SlateScreenplayEditor.displayName = "SlateScreenplayEditor"

export default SlateScreenplayEditor as React.ForwardRefExoticComponent<
  ScreenplayEditorProps & React.RefAttributes<ScreenplayEditorHandle>
>
