import { Editor, Node, Transforms, Element as SlateElement, Range } from "slate"
import type { ScreenplayElement, ScreenplayElementType } from "@/lib/screenplayTypes"
import { generateBlockId } from "@/lib/screenplayTypes"
import { deserializeFromText } from "@/lib/screenplaySerializer"
import {
  getCurrentElementEntry,
  SCENE_PREFIX_RE,
  isLikelyCharacterCue,
  isLikelyTransitionCue,
} from "./screenplayEditorUtils"
import { findSlugSuggestion, isSceneHeadingTriggerText, SLUG_PREFIX_NO_DOT_RE } from "./screenplaySlugBehavior"

export function withScreenplay(editor: Editor): Editor {
  const { insertBreak, deleteBackward, insertData, normalizeNode } = editor

  editor.normalizeNode = (entry) => {
    const [node, path] = entry
    if (SlateElement.isElement(node) && path.length === 1) {
      const el = node as ScreenplayElement
      if (el.type === "action" || el.type === "character") {
        const text = Node.string(el)
        const trimmed = text.trim()
        if (trimmed.length >= 2) {
          let targetType: ScreenplayElementType | null = null

          if (isSceneHeadingTriggerText(text)) {
            targetType = "scene_heading"
          }

          if (!targetType && isLikelyTransitionCue(trimmed)) {
            targetType = "transition"
          }

          if (!targetType && el.type === "action" && isLikelyCharacterCue(trimmed)) {
            const prev = path[0] > 0 ? editor.children[path[0] - 1] : null
            const prevType =
              prev && SlateElement.isElement(prev)
                ? ((prev as ScreenplayElement).type ?? null)
                : null

            // Character cue is valid at scene/action boundaries, but not inside dialogue chains.
            if (
              prevType === null ||
              prevType === "action" ||
              prevType === "scene_heading" ||
              prevType === "transition" ||
              prevType === "shot"
            ) {
              targetType = "character"
            }
          }

          // Revert character → action when text is a slug prefix (e.g. "EXT," "INT ") or partial slug ("IN", "EX").
          if (!targetType && el.type === "character" && !isLikelyCharacterCue(trimmed)) {
            if (
              (SLUG_PREFIX_NO_DOT_RE.test(trimmed) || findSlugSuggestion(trimmed)) &&
              !SCENE_PREFIX_RE.test(trimmed)
            ) {
              targetType = "action"
            }
          }

          if (targetType && el.type !== targetType) {
            Transforms.setNodes(
              editor,
              { type: targetType },
              { at: path }
            )
            return
          }
        }
      }
    }
    normalizeNode(entry)
  }

  editor.insertBreak = () => {
    const match = getCurrentElementEntry(editor)
    if (!match) {
      insertBreak()
      return
    }

    const [el, path] = match
    const text = Node.string(el)
    const isEmpty = text.trim() === ""

    let nextType: ScreenplayElementType

    switch (el.type) {
      case "scene_heading":
        nextType = "action"
        break
      case "action":
        nextType = "action"
        break
      case "character":
        if (isEmpty) {
          nextType = "action"
          break
        }
        nextType = "dialogue"
        break
      case "dialogue":
        if (isEmpty) {
          Transforms.setNodes(
            editor,
            {
              type: "action" as ScreenplayElementType,
              id: generateBlockId(),
            } as Partial<ScreenplayElement>,
            { at: path }
          )
          return
        }
        nextType = "character"
        break
      case "parenthetical":
        nextType = "dialogue"
        break
      case "transition":
        nextType = "action"
        break
      case "shot":
        nextType = "action"
        break
      default:
        nextType = "action"
    }

    Transforms.splitNodes(editor, { always: true })
    Transforms.setNodes(
      editor,
      {
        type: nextType,
        id: generateBlockId(),
      } as Partial<ScreenplayElement>
    )
  }

  editor.deleteBackward = (unit) => {
    const { selection } = editor
    if (selection && Range.isCollapsed(selection)) {
      const match = getCurrentElementEntry(editor)
      if (match) {
        const [el, path] = match
        const text = Node.string(el)
        const point = selection.anchor

        if (el.type === "scene_heading") {
          const prefixMatch = text.match(SCENE_PREFIX_RE)
          if (prefixMatch) {
            const prefixLen = prefixMatch[0].length
            if (point.offset <= prefixLen) {
              const remaining = text.slice(prefixLen).trim()
              Transforms.select(editor, {
                anchor: { path: [...path, 0], offset: 0 },
                focus: { path: [...path, 0], offset: text.length },
              })
              Editor.insertText(editor, remaining)
              Transforms.setNodes(
                editor,
                { type: "action" as ScreenplayElementType },
                { at: path }
              )
              Transforms.select(editor, { path: [...path, 0], offset: 0 })
              return
            }
          }
        }

        if (point.offset === 0 && path[0] > 0) {
          if (text === "") {
            Transforms.removeNodes(editor, { at: path })
            const prevEnd = Editor.end(editor, [path[0] - 1])
            Transforms.select(editor, prevEnd)
            return
          }

          Transforms.mergeNodes(editor, { at: path })
          return
        }
      }
    }

    deleteBackward(unit)
  }

  editor.insertData = (data: DataTransfer) => {
    const text = data.getData("text/plain")
    if (text) {
      const normalized = text
        .replace(/\r\n/g, "\n")
        .replace(/[\u200B\uFEFF]/g, "")
        .replace(/\n{3,}/g, "\n\n")
      const fragments = deserializeFromText(normalized)
      Transforms.insertFragment(editor, fragments)
      return
    }

    insertData(data)
  }

  return editor
}
