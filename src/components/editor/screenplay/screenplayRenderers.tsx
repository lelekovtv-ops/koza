import React, { useState, useRef, useCallback } from "react"
import { Editor, Element as SlateElement } from "slate"
import type { RenderElementProps, RenderLeafProps } from "slate-react"
import { ReactEditor } from "slate-react"
import type { CustomText, ScreenplayElement } from "@/lib/screenplayTypes"
import { useBibleStore, GENERATED_CANONICAL_IMAGE_ID } from "@/store/bible"
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
  /** Indices after which (MORE) should be shown */
  moreAfter?: Set<number>
  /** Indices before which CHARACTER (CONT'D) should be shown */
  contdBefore?: Map<number, string>
  sceneMap?: Map<string, SceneMarkerInfo>
  highlightBlockId?: string | null
  lockedBlockIds?: Set<string>
  /** Block duration in ms from placement engine */
  durationMap?: Map<string, number>
  /** Shot status per block */
  shotStatusMap?: Map<string, "empty" | "prompt" | "image">
}

export function createRenderElement({
  editor,
  colors,
  editorFontSize,
  editorLineHeightPx,
  pageBreakMargins,
  moreAfter,
  contdBefore,
  sceneMap,
  highlightBlockId,
  lockedBlockIds,
  durationMap,
  shotStatusMap,
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

    // Resolve element index for MORE/CONT'D decorations
    let elemIdx = -1
    try {
      const path = ReactEditor.findPath(editor as ReactEditor, element)
      if (path.length === 1) elemIdx = path[0]
    } catch { /* ignore */ }

    const showMore = elemIdx >= 0 && moreAfter?.has(elemIdx)
    const contdName = elemIdx >= 0 ? contdBefore?.get(elemIdx) : undefined

    const baseStyle: React.CSSProperties = {
      fontFamily: "'Courier Prime', 'Courier New', monospace",
      fontSize: `${editorFontSize}px`,
      lineHeight: `${editorLineHeightPx}px`,
      minHeight: `${editorLineHeightPx}px`,
      marginTop: `${marginTop}px`,
    }

    const moreContdStyle: React.CSSProperties = {
      fontFamily: "'Courier Prime', 'Courier New', monospace",
      fontSize: `${editorFontSize}px`,
      lineHeight: `${editorLineHeightPx}px`,
      color: colors.character,
      opacity: 0.5,
      pointerEvents: "none",
      userSelect: "none",
    }

    const isLocked = lockedBlockIds?.has(el.id) ?? false

    // Duration badge + shot status dot
    const blockDurationMs = durationMap?.get(el.id)
    const shotStatus = shotStatusMap?.get(el.id)
    const showBadge = blockDurationMs != null && (el.type === "scene_heading" || el.type === "action" || el.type === "dialogue")

    const durationBadge = showBadge ? (
      <span
        contentEditable={false}
        style={{
          position: "absolute",
          right: -68,
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 9,
          fontFamily: "system-ui, sans-serif",
          userSelect: "none",
          whiteSpace: "nowrap",
          lineHeight: "14px",
          pointerEvents: "none",
        }}
      >
        {shotStatus && (
          <span style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            backgroundColor: shotStatus === "image" ? "#4ADE80" : shotStatus === "prompt" ? "#FBBF24" : "#555",
            flexShrink: 0,
          }} />
        )}
        <span style={{ color: "#666", opacity: 0.7 }}>
          {(blockDurationMs / 1000).toFixed(1)}s
        </span>
      </span>
    ) : null

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
            {durationBadge}
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
          <>
            {contdName && (
              <div contentEditable={false} style={{ ...moreContdStyle, paddingLeft: `${SCREENPLAY_CHARACTER_INDENT_CH}ch`, fontWeight: "bold", textTransform: "uppercase" }}>
                {contdName} (CONT&apos;D)
              </div>
            )}
            <div
              {...attributes}
              style={{
                ...baseStyle,
                paddingLeft: `${SCREENPLAY_DIALOGUE_INDENT_LEFT_CH}ch`,
                paddingRight: `${SCREENPLAY_DIALOGUE_INDENT_RIGHT_CH}ch`,
                position: "relative",
              }}
            >
              {durationBadge}
              {children}
            </div>
            {showMore && (
              <div contentEditable={false} style={{ ...moreContdStyle, paddingLeft: `${SCREENPLAY_CHARACTER_INDENT_CH}ch` }}>
                (MORE)
              </div>
            )}
          </>
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
              position: (isLocked || showBadge) ? "relative" as const : undefined,
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
            {durationBadge}
            {children}
          </div>
        )
    }
  }

  RenderElement.displayName = "ScreenplayRenderElement"
  return RenderElement
}

/** Inline SVG icons for Bible entity markers (12px, inline with text) */
const BIBLE_ICONS: Record<string, { svg: string; color: string }> = {
  // Character: bust silhouette
  character: {
    color: "#D4A853",
    svg: `<svg width="10" height="10" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="5" r="3.5" fill="currentColor" opacity="0.7"/><path d="M2.5 15c0-3 2.5-5 5.5-5s5.5 2 5.5 5" fill="currentColor" opacity="0.5"/></svg>`,
  },
  // Location: pin marker
  location: {
    color: "#4A9C6F",
    svg: `<svg width="10" height="10" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 1C5.2 1 3 3.2 3 6c0 4 5 9 5 9s5-5 5-9c0-2.8-2.2-5-5-5zm0 7a2 2 0 110-4 2 2 0 010 4z" fill="currentColor" opacity="0.7"/></svg>`,
  },
  // Prop: cube/box
  prop: {
    color: "#6B9BD2",
    svg: `<svg width="10" height="10" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 1L2 4.5v7L8 15l6-3.5v-7L8 1zM8 8L2 4.5M8 8v7M8 8l6-3.5" stroke="currentColor" stroke-width="1.5" opacity="0.7"/></svg>`,
  },
}

/** Get Bible entity image URL by name and kind */
function useBibleEntityImage(name: string, kind: "character" | "location" | "prop"): { imageUrl: string | null; id: string | null } {
  const characters = useBibleStore((s) => s.characters)
  const locations = useBibleStore((s) => s.locations)
  const props = useBibleStore((s) => s.props)

  const upper = name.toUpperCase().replace(/\s*\(.*\)\s*$/, "").trim()

  if (kind === "character") {
    const entry = characters.find((c) => c.name.toUpperCase() === upper)
    if (!entry) return { imageUrl: null, id: null }
    const url = entry.canonicalImageId === GENERATED_CANONICAL_IMAGE_ID
      ? entry.generatedPortraitUrl
      : entry.referenceImages.find((r) => r.id === entry.canonicalImageId)?.url ?? entry.generatedPortraitUrl
    return { imageUrl: url ?? null, id: entry.id }
  }
  if (kind === "location") {
    const entry = locations.find((l) => l.name.toUpperCase() === upper)
    if (!entry) return { imageUrl: null, id: null }
    const url = entry.canonicalImageId === GENERATED_CANONICAL_IMAGE_ID
      ? entry.generatedImageUrl
      : entry.referenceImages.find((r) => r.id === entry.canonicalImageId)?.url ?? entry.generatedImageUrl
    return { imageUrl: url ?? null, id: entry.id }
  }
  // prop
  const entry = props.find((p) => p.name.toUpperCase() === upper)
  if (!entry) return { imageUrl: null, id: null }
  const url = entry.canonicalImageId === GENERATED_CANONICAL_IMAGE_ID
    ? entry.generatedImageUrl
    : entry.referenceImages.find((r) => r.id === entry.canonicalImageId)?.url ?? entry.generatedImageUrl
  return { imageUrl: url ?? null, id: entry.id }
}

function BibleHoverIcon({ kind, matchedText }: { kind: "character" | "location" | "prop"; matchedText: string }) {
  const icon = BIBLE_ICONS[kind]
  const [hovered, setHovered] = useState(false)
  const [popupPos, setPopupPos] = useState<"above" | "below">("above")
  const iconRef = useRef<HTMLSpanElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { imageUrl } = useBibleEntityImage(matchedText, kind)

  const show = useCallback(() => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
    setHovered(true)
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect()
      setPopupPos(rect.top < 200 ? "below" : "above")
    }
  }, [])

  const hide = useCallback(() => {
    hideTimer.current = setTimeout(() => setHovered(false), 150)
  }, [])

  const handleClick = useCallback(() => {
    const tab = kind === "character" ? "characters" : kind === "location" ? "locations" : "props"
    window.location.href = `/bible?tab=${tab}`
  }, [kind])

  if (!icon) return null

  return (
    <span
      ref={iconRef}
      contentEditable={false}
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={handleClick}
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        marginLeft: "2px",
        marginTop: "-2px",
        color: icon.color,
        opacity: hovered ? 0.9 : 0.55,
        userSelect: "none",
        lineHeight: 0,
        cursor: "pointer",
        position: "relative",
        transition: "opacity 0.15s",
      }}
    >
      <span dangerouslySetInnerHTML={{ __html: icon.svg }} />
      {hovered && (
        <span
          contentEditable={false}
          onMouseEnter={show}
          onMouseLeave={hide}
          style={{
            position: "absolute",
            [popupPos === "above" ? "bottom" : "top"]: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            pointerEvents: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          {/* Card */}
          <span
            style={{
              display: "block",
              width: 80,
              height: 80,
              borderRadius: 6,
              overflow: "hidden",
              border: `1.5px solid ${icon.color}40`,
              backgroundColor: "#1a1a1a",
              boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            }}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={matchedText}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  height: "100%",
                  color: icon.color,
                  opacity: 0.3,
                  fontSize: 28,
                }}
              >
                ?
              </span>
            )}
          </span>
        </span>
      )}
    </span>
  )
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
      bibleHighlight?: "character" | "location" | "prop"
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
        {l.bibleHighlight && (
          <BibleHoverIcon kind={l.bibleHighlight} matchedText={(leaf as CustomText).text.trim()} />
        )}
      </span>
    )
  }

  RenderLeaf.displayName = "ScreenplayRenderLeaf"
  return RenderLeaf
}
