"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useScenesStore } from "@/store/scenes"
import { useScriptStore } from "@/store/script"

export interface ScriptViewerProps {
  onSceneClick: (sceneId: string) => void
  selectedSceneId: string | null
  fontSize: number
}

const MIN_FONT_SIZE = 12
const MAX_FONT_SIZE = 24
const ZOOM_STEP = 2
const ZOOM_DEBOUNCE_MS = 100

export function ScriptViewer({ onSceneClick, selectedSceneId, fontSize }: ScriptViewerProps) {
  const blocks = useScriptStore((state) => state.blocks)
  const scenes = useScenesStore((state) => state.scenes)
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomTimerRef = useRef<number | null>(null)
  const [resolvedFontSize, setResolvedFontSize] = useState(fontSize)

  const sceneByHeadingBlockId = useMemo(
    () => new Map(scenes.map((scene) => [scene.headingBlockId, scene])),
    [scenes],
  )

  useEffect(() => {
    return () => {
      if (zoomTimerRef.current !== null) {
        window.clearTimeout(zoomTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!selectedSceneId) return
    const scene = scenes.find((entry) => entry.id === selectedSceneId)
    if (!scene?.headingBlockId) return

    const element = containerRef.current?.querySelector<HTMLElement>(`[data-block-id="${scene.headingBlockId}"]`)
    element?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [scenes, selectedSceneId])

  const scheduleFontSize = useCallback((nextFontSize: number) => {
    if (zoomTimerRef.current !== null) {
      window.clearTimeout(zoomTimerRef.current)
    }

    const container = containerRef.current
    const currentScrollTop = container?.scrollTop ?? 0

    zoomTimerRef.current = window.setTimeout(() => {
      setResolvedFontSize(nextFontSize)

      window.requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = currentScrollTop
        }
      })

      zoomTimerRef.current = null
    }, ZOOM_DEBOUNCE_MS)
  }, [])

  const zoomOut = useCallback(() => {
    scheduleFontSize(Math.max(resolvedFontSize - ZOOM_STEP, MIN_FONT_SIZE))
  }, [resolvedFontSize, scheduleFontSize])

  const zoomIn = useCallback(() => {
    scheduleFontSize(Math.min(resolvedFontSize + ZOOM_STEP, MAX_FONT_SIZE))
  }, [resolvedFontSize, scheduleFontSize])

  return (
    <div className="h-full overflow-hidden bg-[#1A1816] text-[#E5E0DB]">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto px-6 py-4 text-[#E5E0DB]"
        style={{
          fontSize: resolvedFontSize,
          fontFamily: '"Courier New", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          lineHeight: 1.55,
        }}
      >
        <div className="sticky top-0 z-10 -mx-6 mb-4 flex justify-end bg-[#1A1816]/95 px-6 py-2 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 p-1 text-[#D4A853]">
            <button
              type="button"
              onClick={zoomOut}
              className="rounded px-2 py-1 text-[10px] transition-colors hover:bg-white/8 hover:text-[#E8C98A]"
              aria-label="Zoom out script"
            >
              A
            </button>
            <button
              type="button"
              onClick={zoomIn}
              className="rounded px-2 py-1 text-[14px] leading-none transition-colors hover:bg-white/8 hover:text-[#E8C98A]"
              aria-label="Zoom in script"
            >
              A
            </button>
          </div>
        </div>

        <div className="pb-8">
          {blocks.map((block, index) => {
            const scene = block.type === "scene_heading"
              ? sceneByHeadingBlockId.get(block.id) ?? null
              : null
            const isSelectedScene = scene?.id === selectedSceneId

            return (
              <div key={block.id}>
                {scene ? (
                  <button
                    type="button"
                    onClick={() => onSceneClick(scene.id)}
                    className={`mb-3 flex w-full items-center gap-3 border-l-2 pl-3 text-left text-[0.8em] font-semibold uppercase tracking-[0.18em] text-[#D4A853] transition-colors hover:text-[#E8C98A] ${isSelectedScene ? "bg-white/5" : "bg-transparent"}`}
                    style={{ borderLeftColor: isSelectedScene ? scene.color : "transparent" }}
                  >
                    <span>● SCENE {scene.index}</span>
                    <span className="truncate text-[#E5E0DB]">{scene.title}</span>
                  </button>
                ) : null}

                <div
                  data-block-id={block.type === "scene_heading" ? block.id : undefined}
                  className={[
                    "whitespace-pre-wrap",
                    block.type === "scene_heading" ? `${index > 0 ? "mt-6" : "mt-0"} font-bold uppercase tracking-[0.08em]` : "",
                    block.type === "action" ? "mt-2 text-[#E5E0DB]" : "",
                    block.type === "character" ? "mt-4 uppercase" : "",
                    block.type === "dialogue" ? "text-[#E5E0DB]" : "",
                    block.type === "parenthetical" ? "text-[#A7A19A]" : "",
                    block.type === "transition" ? "mt-4 text-right uppercase tracking-[0.08em]" : "",
                    block.type === "shot" ? "mt-4 text-[0.82em] uppercase tracking-[0.12em] text-[#C8C1B6]" : "",
                  ].filter(Boolean).join(" ")}
                  style={{
                    marginLeft: block.type === "character"
                      ? "24ch"
                      : block.type === "dialogue"
                        ? "11ch"
                        : block.type === "parenthetical"
                          ? "18ch"
                          : 0,
                    marginTop: block.type === "scene_heading" ? undefined : block.type === "action" ? "0.45em" : undefined,
                  }}
                >
                  {block.text}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}