import React from "react"
import { Editor, Element as SlateElement } from "slate"
import type { RenderElementProps, RenderLeafProps } from "slate-react"
import { ReactEditor } from "slate-react"
import type { CustomText, ScreenplayElement } from "@/lib/screenplayTypes"
import {
  SCREENPLAY_ACTION_AFTER_ACTION_MARGIN_TOP_PX,
  SCREENPLAY_ACTION_AFTER_SCENE_HEADING_MARGIN_TOP_PX,
  SCREENPLAY_CHARACTER_MARGIN_TOP_PX,
  SCREENPLAY_CHARACTER_INDENT_CH,
  SCREENPLAY_DIALOGUE_INDENT_LEFT_CH,
  SCREENPLAY_DIALOGUE_INDENT_RIGHT_CH,
  SCREENPLAY_PARENTHETICAL_INDENT_CH,
  SCREENPLAY_SCENE_HEADING_MARGIN_TOP_PX,
  SCREENPLAY_TRANSITION_MARGIN_TOP_PX,
} from "./screenplayLayoutConstants"

interface SceneMarkerInfo {
  index: number
  color: string
}

interface CreateRenderElementArgs {
  editor: Editor
  colors: {
    scene: string
    character: string
    parenthetical: string
    transition: string
  }
  editorFontSize: number
  editorLineHeightPx: number
  pageBreakMargins?: Map<number, number>
  sceneMap?: Map<string, SceneMarkerInfo>
  highlightBlockId?: string | null
  lockedBlockIds?: Set<string>
}

export function createRenderElement({
  editor,
  colors,
  editorFontSize,
  editorLineHeightPx,
  pageBreakMargins,
  sceneMap,
  highlightBlockId,
  lockedBlockIds,
}: CreateRenderElementArgs) {
  const RenderElement = (props: RenderElementProps) => {
    const { attributes, children, element } = props
    const el = element as ScreenplayElement

    let marginTop = 0

    if (el.type === "scene_heading") {
      marginTop = SCREENPLAY_SCENE_HEADING_MARGIN_TOP_PX
    } else if (el.type === "character") {
      marginTop = SCREENPLAY_CHARACTER_MARGIN_TOP_PX
    } else if (el.type === "transition") {
      marginTop = SCREENPLAY_TRANSITION_MARGIN_TOP_PX
    } else if (el.type === "action") {
      try {
        const path = ReactEditor.findPath(editor as ReactEditor, element)
        if (path.length === 1 && path[0] > 0) {
          const prev = editor.children[path[0] - 1]
          if (SlateElement.isElement(prev)) {
            const prevType = (prev as ScreenplayElement).type
            if (prevType === "scene_heading") {
              marginTop = SCREENPLAY_ACTION_AFTER_SCENE_HEADING_MARGIN_TOP_PX
            } else if (prevType === "action") {
              marginTop = SCREENPLAY_ACTION_AFTER_ACTION_MARGIN_TOP_PX
            }
          }
        }
      } catch {
        // Ignore if path cannot be resolved during intermediate render states.
      }
    }

    // Override margin for page break elements
    if (pageBreakMargins && pageBreakMargins.size > 0) {
      try {
        const path = ReactEditor.findPath(editor as ReactEditor, element)
        if (path.length === 1 && pageBreakMargins.has(path[0])) {
          marginTop = pageBreakMargins.get(path[0])!
        }
      } catch {
        // Ignore
      }
    }

    const baseStyle: React.CSSProperties = {
      fontFamily: "'Courier Prime', 'Courier New', monospace",
      fontSize: `${editorFontSize}px`,
      lineHeight: `${editorLineHeightPx}px`,
      minHeight: `${editorLineHeightPx}px`,
      marginTop: `${marginTop}px`,
    }

    const isLocked = lockedBlockIds?.has(el.id) ?? false

    switch (el.type) {
      case "scene_heading": {
        const sceneInfo = sceneMap?.get(el.id)
        const isHighlighted = highlightBlockId === el.id
        return (
          <div
            {...attributes}
            data-block-id={el.id}
            style={{
              ...baseStyle,
              fontWeight: "bold",
              color: colors.scene,
              textTransform: "uppercase",
              position: "relative",
              transition: "box-shadow 0.3s ease",
              boxShadow: isHighlighted && sceneInfo
                ? `inset 3px 0 0 ${sceneInfo.color}, 0 0 0 1px ${sceneInfo.color}40`
                : sceneInfo
                  ? `inset 3px 0 0 ${sceneInfo.color}`
                  : undefined,
              borderRadius: isHighlighted ? 3 : undefined,
              backgroundColor: isHighlighted ? `${sceneInfo?.color ?? "#4A7C6F"}12` : undefined,
            }}
          >
            {sceneInfo && (
              <span
                contentEditable={false}
                style={{
                  position: "absolute",
                  left: -48,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 8,
                  fontWeight: 700,
                  fontFamily: "system-ui, sans-serif",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: sceneInfo.color,
                  backgroundColor: `${sceneInfo.color}18`,
                  borderRadius: 3,
                  padding: "1px 4px",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                  lineHeight: "14px",
                }}
              >
                SC {sceneInfo.index}
              </span>
            )}
            {children}
          </div>
        )
      }
      case "character":
        return (
          <div
            {...attributes}
            data-block-id={el.id}
            style={{
              ...baseStyle,
              fontWeight: "bold",
              color: colors.character,
              textTransform: "uppercase",
              paddingLeft: `${SCREENPLAY_CHARACTER_INDENT_CH}ch`,
              position: isLocked ? "relative" as const : undefined,
            }}
          >
            {isLocked && (
              <span
                contentEditable={false}
                style={{
                  position: "absolute",
                  left: -16,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 8,
                  opacity: 0.35,
                  userSelect: "none",
                }}
                title="Locked — shot breakdown exists"
              >
                🔒
              </span>
            )}
            {children}
          </div>
        )
      case "dialogue":
        return (
          <div
            {...attributes}
            style={{
              ...baseStyle,
              paddingLeft: `${SCREENPLAY_DIALOGUE_INDENT_LEFT_CH}ch`,
              paddingRight: `${SCREENPLAY_DIALOGUE_INDENT_RIGHT_CH}ch`,
            }}
          >
            {children}
          </div>
        )
      case "parenthetical":
        return (
          <div
            {...attributes}
            style={{
              ...baseStyle,
              fontStyle: "italic",
              color: colors.parenthetical,
              paddingLeft: `${SCREENPLAY_PARENTHETICAL_INDENT_CH}ch`,
            }}
          >
            {children}
          </div>
        )
      case "transition":
        return (
          <div {...attributes} style={{ ...baseStyle, color: colors.transition, textAlign: "right" }}>
            {children}
          </div>
        )
      case "shot":
        return (
          <div
            {...attributes}
            style={{ ...baseStyle, fontWeight: "bold", textTransform: "uppercase", color: colors.scene }}
          >
            {children}
          </div>
        )
      default:
        return (
          <div
            {...attributes}
            data-block-id={el.id}
            style={{
              ...baseStyle,
              position: isLocked ? "relative" as const : undefined,
            }}
          >
            {isLocked && (
              <span
                contentEditable={false}
                style={{
                  position: "absolute",
                  left: -16,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 8,
                  opacity: 0.35,
                  userSelect: "none",
                }}
                title="Locked — shot breakdown exists"
              >
                🔒
              </span>
            )}
            {children}
          </div>
        )
    }
  }

  RenderElement.displayName = "ScreenplayRenderElement"
  return RenderElement
}

export function createRenderLeaf() {
  const RenderLeaf = (props: RenderLeafProps) => {
    const { attributes, leaf } = props
    let { children } = props
    const l = leaf as CustomText & {
      aiRipple?: boolean
      aiRippleToken?: number
      aiRippleRangeLength?: number
      aiRippleSegmentStart?: number
      aiRippleSegmentLength?: number
    }

    if (l.bold) children = <strong>{children}</strong>
    if (l.italic) children = <em>{children}</em>
    if (l.underline) children = <u>{children}</u>

    const rippleStyle = l.aiRipple
      ? {
          ["--ai-ripple-range-length" as string]: String(Math.max(1, l.aiRippleRangeLength ?? 1)),
          ["--ai-ripple-segment-start" as string]: String(Math.max(0, l.aiRippleSegmentStart ?? 0)),
          ["--ai-ripple-segment-length" as string]: String(Math.max(1, l.aiRippleSegmentLength ?? 1)),
        }
      : undefined

    return (
      <span
        {...attributes}
        className={l.aiRipple ? "ai-ripple-leaf" : undefined}
        data-ai-ripple-token={l.aiRipple ? l.aiRippleToken : undefined}
        style={rippleStyle}
      >
        {children}
      </span>
    )
  }

  RenderLeaf.displayName = "ScreenplayRenderLeaf"
  return RenderLeaf
}
