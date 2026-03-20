import type React from "react"
import { Editor, Node, Range, Transforms } from "slate"
import type { ScreenplayElementType } from "@/lib/screenplayTypes"
import { AUTO_CAPS_TYPES, getCurrentElementEntry, toggleMark } from "./screenplayEditorUtils"

type InsertNewBlock = (type: ScreenplayElementType, text?: string) => void

interface ExternalUndoRedoHandlers {
  onUndoExternal?: () => boolean
  onRedoExternal?: () => boolean
}

type SetFloatingToolbar = React.Dispatch<
  React.SetStateAction<{ visible: boolean; selectedText: string }>
>

type SetSlugGhost = React.Dispatch<React.SetStateAction<{ ghost: string; full: string } | null>>

export function handleAutoCapsKey(
  e: React.KeyboardEvent<HTMLDivElement>,
  editor: Editor
): boolean {
  const isMod = e.metaKey || e.ctrlKey
  if (isMod || e.altKey || e.key.length !== 1) return false

  const entry = getCurrentElementEntry(editor)
  if (!entry) return false

  const [el] = entry
  if (!AUTO_CAPS_TYPES.has(el.type)) return false

  const upper = e.key.toUpperCase()
  if (upper !== e.key && /[a-zа-яёі-ї]/i.test(e.key)) {
    e.preventDefault()
    Editor.insertText(editor, upper)
    return true
  }

  return false
}

export function handleOpenParentheticalKey(
  e: React.KeyboardEvent<HTMLDivElement>,
  editor: Editor
): boolean {
  const isMod = e.metaKey || e.ctrlKey
  if (isMod || e.key !== "(") return false

  const entry = getCurrentElementEntry(editor)
  if (!entry) return false

  const [el, path] = entry
  if (el.type !== "dialogue") return false

  const text = Node.string(el)
  const { selection } = editor
  if (selection && Range.isCollapsed(selection) && selection.anchor.offset === 0 && text.trim() === "") {
    e.preventDefault()
    Transforms.setNodes(editor, { type: "parenthetical" as ScreenplayElementType }, { at: path })
    Editor.insertText(editor, "(")
    return true
  }

  return false
}

export function handleModShortcuts(
  e: React.KeyboardEvent<HTMLDivElement>,
  editor: Editor,
  insertNewBlock: InsertNewBlock,
  externalUndoRedoHandlers?: ExternalUndoRedoHandlers
): boolean {
  const isMod = e.metaKey || e.ctrlKey
  if (!isMod) return false

  const history = (editor as unknown as { history?: { undos?: unknown[]; redos?: unknown[] } }).history
  const hasSlateUndo = !!history?.undos?.length
  const hasSlateRedo = !!history?.redos?.length

  if (e.key === "z" && !e.shiftKey) {
    e.preventDefault()
    if (hasSlateUndo) {
      editor.undo()
    } else {
      externalUndoRedoHandlers?.onUndoExternal?.()
    }
    return true
  }

  if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
    e.preventDefault()
    if (hasSlateRedo) {
      editor.redo()
    } else {
      externalUndoRedoHandlers?.onRedoExternal?.()
    }
    return true
  }

  if (e.key === "b") {
    e.preventDefault()
    toggleMark(editor, "bold")
    return true
  }

  if (e.key === "i" && !e.shiftKey) {
    e.preventDefault()
    toggleMark(editor, "italic")
    return true
  }

  if (e.key === "u") {
    e.preventDefault()
    toggleMark(editor, "underline")
    return true
  }

  if (e.shiftKey && e.key === "I") {
    e.preventDefault()
    insertNewBlock("scene_heading", "INT. ")
    return true
  }

  if (e.shiftKey && e.key === "E") {
    e.preventDefault()
    insertNewBlock("scene_heading", "EXT. ")
    return true
  }

  if (e.shiftKey && e.key === "C") {
    e.preventDefault()
    insertNewBlock("character", "")
    return true
  }

  if (e.shiftKey && e.key === "T") {
    e.preventDefault()
    insertNewBlock("transition", "CUT TO:")
    return true
  }

  return false
}

export function handleEscapeKey(
  e: React.KeyboardEvent<HTMLDivElement>,
  setFloatingToolbar: SetFloatingToolbar,
  setSlugGhost: SetSlugGhost
): boolean {
  if (e.key !== "Escape") return false

  setFloatingToolbar((prev) => ({ ...prev, visible: false }))
  setSlugGhost(null)
  return true
}
