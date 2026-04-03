import { useCallback, useRef, useState } from "react"
import type { TimelineEdit } from "@/lib/segmentEngine"

export type DragMode = "move" | "resize-left" | "resize-right"

interface DragState {
  segmentId: string
  mode: DragMode
  startX: number
  origStartMs: number
  origDurationMs: number
}

export interface DragPreview {
  segmentId: string
  startMs: number
  durationMs: number
}

interface UseTimelineDragOptions {
  zoom: number
  onCommit: (edit: TimelineEdit) => void
}

const EDGE_ZONE = 6
const MIN_MOVE_MS = 50

export function useTimelineDrag({ zoom, onCommit }: UseTimelineDragOptions) {
  const [preview, setPreview] = useState<DragPreview | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const previewRef = useRef<DragPreview | null>(null)

  const pxToMs = useCallback((px: number) => (px / zoom) * 1000, [zoom])

  const detectMode = useCallback(
    (clientX: number, clipLeft: number, clipWidth: number): DragMode => {
      const relX = clientX - clipLeft
      if (relX < EDGE_ZONE) return "resize-left"
      if (relX > clipWidth - EDGE_ZONE) return "resize-right"
      return "move"
    },
    [],
  )

  const onClipMouseDown = useCallback(
    (
      e: React.MouseEvent,
      segmentId: string,
      startMs: number,
      durationMs: number,
      clipRect: DOMRect,
    ) => {
      e.preventDefault()
      e.stopPropagation()

      const mode = detectMode(e.clientX, clipRect.left, clipRect.width)

      dragRef.current = {
        segmentId,
        mode,
        startX: e.clientX,
        origStartMs: startMs,
        origDurationMs: durationMs,
      }

      const initial = { segmentId, startMs, durationMs }
      previewRef.current = initial
      setPreview(initial)

      const handleMove = (ev: MouseEvent) => {
        const drag = dragRef.current
        if (!drag) return

        const deltaMs = pxToMs(ev.clientX - drag.startX)
        let newStart = drag.origStartMs
        let newDur = drag.origDurationMs

        switch (drag.mode) {
          case "move":
            newStart = Math.max(0, drag.origStartMs + deltaMs)
            break
          case "resize-left": {
            const shift = Math.min(deltaMs, drag.origDurationMs - 500)
            newStart = Math.max(0, drag.origStartMs + shift)
            newDur = drag.origDurationMs - shift
            break
          }
          case "resize-right":
            newDur = Math.max(500, drag.origDurationMs + deltaMs)
            break
        }

        const p = { segmentId: drag.segmentId, startMs: newStart, durationMs: newDur }
        previewRef.current = p
        setPreview(p)
      }

      const handleUp = () => {
        document.removeEventListener("mousemove", handleMove)
        document.removeEventListener("mouseup", handleUp)
        document.body.style.cursor = ""

        const drag = dragRef.current
        const final = previewRef.current
        dragRef.current = null
        previewRef.current = null
        setPreview(null)

        if (!drag || !final) return

        const deltaStart = Math.abs(final.startMs - drag.origStartMs)
        const deltaDur = Math.abs(final.durationMs - drag.origDurationMs)
        if (deltaStart < MIN_MOVE_MS && deltaDur < MIN_MOVE_MS) return

        if (drag.mode === "move") {
          onCommit({ type: "move", segmentId: drag.segmentId, newStartMs: final.startMs })
        } else {
          onCommit({
            type: "resize",
            segmentId: drag.segmentId,
            newStartMs: final.startMs,
            newDurationMs: final.durationMs,
          })
        }
      }

      document.body.style.cursor = mode === "move" ? "grabbing" : "col-resize"
      document.addEventListener("mousemove", handleMove)
      document.addEventListener("mouseup", handleUp)
    },
    [detectMode, pxToMs, onCommit],
  )

  const getCursor = useCallback(
    (clientX: number, clipLeft: number, clipWidth: number): string => {
      return detectMode(clientX, clipLeft, clipWidth) === "move" ? "grab" : "col-resize"
    },
    [detectMode],
  )

  return { preview, isDragging: preview !== null, onClipMouseDown, getCursor }
}
