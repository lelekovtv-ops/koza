import { Editor, Node, Point, Range, Transforms } from "slate"
import { cycleBlockType } from "@/lib/screenplayFormat"
import type { ScreenplayElementType } from "@/lib/screenplayTypes"
import { createScreenplayElement } from "@/lib/screenplayTypes"
import { getCurrentElementEntry } from "./screenplayEditorUtils"
import { isSlugGhostEligibleType } from "./screenplaySlugBehavior"

type SlugGhost = { ghost: string; full: string } | null

interface HandleTabBehaviorArgs {
  editor: Editor
  shiftKey: boolean
  slugGhost: SlugGhost
  setSlugGhost: (value: SlugGhost) => void
}

export function handleTabBehavior({
  editor,
  shiftKey,
  slugGhost,
  setSlugGhost,
}: HandleTabBehaviorArgs): boolean {
  if (slugGhost && slugGhost.ghost) {
    const entry = getCurrentElementEntry(editor)
    if (entry) {
      const [el, path] = entry
      if (isSlugGhostEligibleType(el.type)) {
        const { selection } = editor
        const blockEnd = Editor.end(editor, path)
        const isCursorAtEnd =
          !!selection &&
          Range.isCollapsed(selection) &&
          Point.equals(selection.anchor, blockEnd)

        if (!isCursorAtEnd) {
          setSlugGhost(null)
        } else {
          // Select all text and replace with full slug + space
          const blockStart = Editor.start(editor, path)
          Transforms.select(editor, {
            anchor: blockStart,
            focus: blockEnd,
          })
          Editor.insertText(editor, slugGhost.full + " ")
          Transforms.setNodes(
            editor,
            { type: "scene_heading" as ScreenplayElementType },
            { at: path }
          )
          setSlugGhost(null)
          return true
        }
      }
    }
  }

  const entry = getCurrentElementEntry(editor)
  if (!entry) return true

  const [el, path] = entry
  const text = Node.string(el)
  const isEmpty = text.trim() === ""

  if (el.type === "action" && isEmpty) {
    Transforms.setNodes(editor, { type: "character" as ScreenplayElementType }, { at: path })
    return true
  }

  if (el.type === "character" && isEmpty) {
    Transforms.setNodes(editor, { type: "action" as ScreenplayElementType }, { at: path })
    return true
  }

  if (el.type === "character" && !isEmpty) {
    Transforms.insertNodes(editor, createScreenplayElement("parenthetical", "("), {
      at: [path[0] + 1],
    })
    Transforms.select(editor, { path: [path[0] + 1, 0], offset: 1 })
    return true
  }

  if (el.type === "scene_heading") {
    const hasTimeSep = text.includes(" - ") || text.includes(" — ")
    if (!hasTimeSep) {
      Editor.insertText(editor, " — ")
    }
    return true
  }

  const nextType = cycleBlockType(el.type, shiftKey) as ScreenplayElementType
  Transforms.setNodes(editor, { type: nextType }, { at: path })
  return true
}
