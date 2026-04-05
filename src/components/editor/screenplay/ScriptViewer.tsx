"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useScenesStore } from "@/store/scenes"
import { useScriptStore } from "@/store/script"
import { useNavigationStore } from "@/store/navigation"
import { useRundownStore } from "@/store/rundown"
import { getEffectiveDuration } from "@/lib/durationEngine"
import { getChildren } from "@/lib/rundownHierarchy"

export type ScriptViewMode = "screenplay" | "rundown"

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
  const scriptShots = useScriptStore((state) => state.shots)
  const scenes = useScenesStore((state) => state.scenes)
  const rundownEntries = useRundownStore((state) => state.entries)

  // Shot count per block for badges (prefer rundown entries, fallback to scriptStore shots)
  const shotCountByBlock = useMemo(() => {
    const counts = new Map<string, number>()
    if (rundownEntries.length > 0) {
      for (const entry of rundownEntries) {
        if (entry.parentEntryId === null) {
          counts.set(entry.parentBlockId, (counts.get(entry.parentBlockId) ?? 0) + 1)
        }
      }
    } else {
      for (const shot of scriptShots) {
        counts.set(shot.parentBlockId, (counts.get(shot.parentBlockId) ?? 0) + 1)
      }
    }
    return counts
  }, [rundownEntries, scriptShots])
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

  // Scroll to selected scene
  useEffect(() => {
    if (!selectedSceneId) return
    const scene = scenes.find((entry) => entry.id === selectedSceneId)
    if (!scene?.headingBlockId) return

    const element = containerRef.current?.querySelector<HTMLElement>(`[data-block-id="${scene.headingBlockId}"]`)
    element?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [scenes, selectedSceneId])

  // Scroll to specific block (from timeline playhead sync)
  const scrollToBlockId = useNavigationStore((s) => s.scrollToBlockId)
  const clearScrollRequest = useNavigationStore((s) => s.clearScrollRequest)
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)

  useEffect(() => {
    if (!scrollToBlockId) return

    setActiveBlockId(scrollToBlockId)
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-block-id="${scrollToBlockId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
    clearScrollRequest()
  }, [scrollToBlockId, clearScrollRequest])

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

  const [viewMode, setViewMode] = useState<ScriptViewMode>("screenplay")
  const [rundownStyle, setRundownStyle] = useState<"scene-first" | "voice-first">("scene-first")

  // ── Rundown: convert blocks to production format ──
  const rundownSections = useMemo(() => {
    if (viewMode !== "rundown") return []

    type Section = {
      sceneId: string | null
      heading: string
      durationS: number
      lines: { type: "voice" | "titles" | "graphics" | "action" | "music"; label: string; text: string }[]
    }

    const sections: Section[] = []
    let current: Section | null = null
    let currentChar: string | null = null

    for (const block of blocks) {
      const scene = block.type === "scene_heading" ? sceneByHeadingBlockId.get(block.id) ?? null : null

      if (block.type === "scene_heading") {
        if (current) sections.push(current)
        const sceneObj = scenes.find((s) => s.headingBlockId === block.id)
        current = {
          sceneId: scene?.id ?? null,
          heading: block.text.trim(),
          durationS: sceneObj ? Math.round(sceneObj.estimatedDurationMs / 1000) : 0,
          lines: [],
        }
        currentChar = null
        continue
      }

      if (!current) {
        current = { sceneId: null, heading: "ПРОЛОГ", durationS: 0, lines: [] }
      }

      if (block.type === "character") {
        currentChar = block.text.replace(/\s*\(.*\)\s*$/, "").trim()
        continue
      }

      if (block.type === "parenthetical") {
        continue // handled inline with dialogue
      }

      if (block.type === "dialogue" && currentChar) {
        const isVO = /V\.?O\.?/i.test(currentChar)
        current.lines.push({
          type: "voice",
          label: isVO ? `${currentChar} (V.O.)` : currentChar,
          text: block.text.trim(),
        })
        continue
      }

      if (block.type === "transition") {
        current.lines.push({ type: "titles", label: "ПЕРЕХОД", text: block.text.trim() })
        currentChar = null
        continue
      }

      // Action — no speaker label
      currentChar = null
      current.lines.push({ type: "action", label: "", text: block.text.trim() })
    }

    if (current) sections.push(current)
    return sections
  }, [blocks, scenes, sceneByHeadingBlockId, viewMode])

  // ── Voice-first: continuous voice stream with visual annotations ──
  const voiceFirstData = useMemo(() => {
    if (viewMode !== "rundown" || rundownStyle !== "voice-first") return []

    type VoiceBlock = {
      id: string
      type: "voice" | "visual-cue" | "pause"
      speaker?: string
      text: string
      sceneLabel?: string
      durationS: number
    }

    const items: VoiceBlock[] = []
    let currentChar: string | null = null
    let blockIdx = 0
    const WPM = 150

    const estS = (text: string) => {
      const words = text.trim().split(/\s+/).filter(Boolean).length
      return Math.max(1, Math.round((words / WPM) * 60 + 0.5))
    }

    for (const block of blocks) {
      const text = block.text.trim()
      if (!text) { currentChar = null; continue }

      if (block.type === "scene_heading") {
        currentChar = null
        // Visual cue marker
        const clean = text.replace(/^(INT\.|EXT\.|INT\/EXT\.|ИНТ\.|НАТ\.)\s*/i, "").replace(/\s*[—\-–]\s*/g, " · ")
        items.push({ id: `vh-${blockIdx++}`, type: "visual-cue", text: clean, sceneLabel: `СЦЕНА ${items.filter((i) => i.type === "visual-cue").length + 1}`, durationS: 2 })
        continue
      }

      if (block.type === "character") {
        currentChar = text.replace(/\s*\(.*\)\s*$/, "").trim()
        continue
      }

      if (block.type === "parenthetical") continue

      if (block.type === "dialogue" && currentChar) {
        items.push({ id: `vv-${blockIdx++}`, type: "voice", speaker: currentChar, text, durationS: estS(text) })
        continue
      }

      if (block.type === "transition") {
        currentChar = null
        items.push({ id: `vp-${blockIdx++}`, type: "pause", text, durationS: 1 })
        continue
      }

      // Action → visual cue (what's on screen while voice continues)
      currentChar = null
      items.push({ id: `vc-${blockIdx++}`, type: "visual-cue", text, durationS: estS(text) })
    }

    return items
  }, [blocks, viewMode, rundownStyle])

  const RUNDOWN_COLORS: Record<string, string> = {
    voice: "#8B5CF6",
    titles: "#F59E0B",
    graphics: "#10B981",
    action: "#D4A853",
    music: "#3B82F6",
  }

  return (
    <div className="relative h-full overflow-hidden bg-[#1A1816] text-[#E5E0DB]">
      {/* Top toolbar: mode switch + zoom */}
      <div className="pointer-events-none absolute left-4 top-3 z-10 flex items-center gap-2">
        <div className="pointer-events-auto flex items-center rounded-md border border-white/10 bg-[#1A1816]/90 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setViewMode("screenplay")}
            className={`rounded-l-md px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] transition-colors ${
              viewMode === "screenplay" ? "bg-white/10 text-white" : "text-white/35 hover:text-white/60"
            }`}
          >
            Screenplay
          </button>
          <button
            type="button"
            onClick={() => setViewMode("rundown")}
            className={`rounded-r-md px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] transition-colors ${
              viewMode === "rundown" ? "bg-emerald-500/15 text-emerald-300" : "text-white/35 hover:text-white/60"
            }`}
          >
            Rundown
          </button>
        </div>
        {viewMode === "rundown" && (
          <div className="pointer-events-auto flex items-center rounded-md border border-white/10 bg-[#1A1816]/90 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setRundownStyle("scene-first")}
              className={`rounded-l-md px-2 py-1 text-[8px] font-semibold uppercase tracking-wider transition-colors ${
                rundownStyle === "scene-first" ? "bg-white/10 text-white/70" : "text-white/25 hover:text-white/50"
              }`}
            >
              Scenes
            </button>
            <button
              type="button"
              onClick={() => setRundownStyle("voice-first")}
              className={`rounded-r-md px-2 py-1 text-[8px] font-semibold uppercase tracking-wider transition-colors ${
                rundownStyle === "voice-first" ? "bg-[#8B5CF6]/15 text-[#8B5CF6]" : "text-white/25 hover:text-white/50"
              }`}
            >
              Voice
            </button>
          </div>
        )}
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-md border border-white/10 bg-[#1A1816]/90 p-0.5 backdrop-blur-sm">
          <button type="button" onClick={zoomOut} className="rounded px-1.5 py-0.5 text-[10px] text-[#D4A853] transition-colors hover:bg-white/8">A</button>
          <button type="button" onClick={zoomIn} className="rounded px-1.5 py-0.5 text-[14px] leading-none text-[#D4A853] transition-colors hover:bg-white/8">A</button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="h-full overflow-y-auto px-6 py-4 pt-12"
        style={{
          fontSize: resolvedFontSize,
          fontFamily: viewMode === "screenplay"
            ? '"Courier New", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
            : 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          lineHeight: viewMode === "screenplay" ? 1.55 : 1.6,
        }}
      >
        {viewMode === "screenplay" ? (
          /* ── SCREENPLAY MODE ── */
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
                    data-block-id={block.id}
                    className={[
                      "whitespace-pre-wrap transition-colors duration-300",
                      activeBlockId === block.id ? "bg-[#D4A853]/8 rounded -mx-2 px-2" : "",
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
                    {/* Shot count badge */}
                    {shotCountByBlock.has(block.id) && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-[#D4A853]/15 px-1.5 py-0 text-[8px] font-medium text-[#D4A853]/70 align-middle">
                        {shotCountByBlock.get(block.id)} shot{(shotCountByBlock.get(block.id) ?? 0) !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* ── RUNDOWN MODE ── */
          rundownStyle === "voice-first" ? (
          /* ── VOICE-FIRST: continuous script with visual cues ── */
          <div className="pb-8">
            {(() => {
              let accS = 0
              const fmtTc = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
              return voiceFirstData.map((item) => {
                const tc = fmtTc(accS)
                accS += item.durationS

                if (item.type === "visual-cue") {
                  return (
                    <div key={item.id} className="flex items-start gap-3 my-3 py-2 border-t border-[#D4A853]/10">
                      <span className="shrink-0 font-mono text-[0.65em] text-white/15 tabular-nums w-[40px] text-right mt-0.5">{tc}</span>
                      <div className="flex-1">
                        {item.sceneLabel && (
                          <span className="text-[0.6em] font-bold uppercase tracking-[0.2em] text-[#D4A853]/40 mr-2">{item.sceneLabel}</span>
                        )}
                        <span className="text-[0.75em] text-[#D4A853]/60 italic">[{item.text}]</span>
                      </div>
                    </div>
                  )
                }

                if (item.type === "pause") {
                  return (
                    <div key={item.id} className="flex items-center gap-3 my-2">
                      <span className="shrink-0 font-mono text-[0.65em] text-white/15 tabular-nums w-[40px] text-right">{tc}</span>
                      <span className="text-[0.7em] text-white/15 uppercase tracking-wider">{item.text}</span>
                    </div>
                  )
                }

                // Voice
                return (
                  <div key={item.id} className="flex items-start gap-3 my-0.5">
                    <span className="shrink-0 font-mono text-[0.65em] text-white/15 tabular-nums w-[40px] text-right mt-0.5">{tc}</span>
                    <div className="flex-1">
                      {item.speaker && (
                        <span className="text-[0.7em] font-semibold text-[#8B5CF6]/60 mr-1.5">{item.speaker}:</span>
                      )}
                      <span className="text-[0.85em] text-white/70 leading-relaxed">{item.text}</span>
                    </div>
                    <span className="shrink-0 font-mono text-[0.6em] text-white/12 tabular-nums">{item.durationS}s</span>
                  </div>
                )
              })
            })()}

            {/* Total */}
            <div className="flex items-center gap-3 border-t border-white/8 mt-4 pt-3">
              <span className="w-[40px]" />
              <span className="flex-1 text-[0.7em] font-semibold uppercase tracking-wider text-white/25">
                Голос: {voiceFirstData.filter((i) => i.type === "voice").length} блоков
              </span>
              <span className="font-mono text-[0.7em] font-semibold text-white/35 tabular-nums">
                {(() => {
                  const total = voiceFirstData.reduce((s, i) => s + i.durationS, 0)
                  const m = Math.floor(total / 60)
                  const ss = total % 60
                  return m > 0 ? `${m}m${ss}s` : `${ss}s`
                })()}
              </span>
            </div>
          </div>
          ) : (
          /* ── SCENE-FIRST: production rundown ── */
          <div className="pb-8">
            {/* Header row */}
            <div className="flex items-center gap-2 border-b border-white/8 pb-2 mb-3 text-[0.6em] font-bold uppercase tracking-[0.2em] text-white/20">
              <span className="w-[32px] text-center">#</span>
              <span className="w-[52px] text-right">TIME</span>
              <span className="w-[52px] text-right">TC</span>
              <span className="flex-1">SCENE</span>
              <span className="w-[40px] text-right">DUR</span>
            </div>

            {(() => {
              let tcAccMs = 0
              return rundownSections.map((section, si) => {
                const isSelected = section.sceneId === selectedSceneId
                const tcStart = tcAccMs
                tcAccMs += section.durationS * 1000
                const fmtTc = (ms: number) => {
                  const s = Math.floor(ms / 1000)
                  const m = Math.floor(s / 60)
                  return `${m}:${String(s % 60).padStart(2, "0")}`
                }
                // Clean heading: strip INT./EXT. prefix for cleaner look
                const cleanHeading = section.heading
                  .replace(/^(INT\.|EXT\.|INT\/EXT\.|ИНТ\.|НАТ\.)\s*/i, "")
                  .replace(/\s*[—\-–]\s*/g, " · ")

                return (
                  <div key={si} className="mb-1">
                    {/* Scene row */}
                    <button
                      type="button"
                      onClick={() => section.sceneId && onSceneClick(section.sceneId)}
                      className={`flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors ${
                        isSelected
                          ? "bg-[#D4A853]/8 border border-[#D4A853]/15"
                          : "hover:bg-white/3 border border-transparent"
                      }`}
                    >
                      <span className="w-[32px] text-center text-[0.85em] font-bold text-[#D4A853]/50 tabular-nums">
                        {si + 1}
                      </span>
                      <span className="w-[52px] text-right font-mono text-[0.7em] text-white/20 tabular-nums">
                        {fmtTc(tcStart)}
                      </span>
                      <span className="w-[52px] text-right font-mono text-[0.65em] text-white/12 tabular-nums">
                        {fmtTc(tcAccMs)}
                      </span>
                      <span className="flex-1 text-[0.82em] font-medium text-white/70 truncate">
                        {cleanHeading}
                      </span>
                      <span className="w-[40px] text-right font-mono text-[0.7em] text-white/25 tabular-nums">
                        {section.durationS}s
                      </span>
                    </button>

                    {/* Content lines — indented, with rundown entries + sub-shots */}
                    {isSelected && section.lines.length > 0 && (
                      <div className="ml-[88px] mr-[44px] mt-1 mb-2 space-y-1 border-l-2 border-white/6 pl-3">
                        {section.lines.map((line, li) => {
                          // Find matching rundown entry for this line
                          const matchingEntry = rundownEntries.find(
                            (e) => e.caption === line.text && e.parentEntryId === null,
                          )
                          const subShots = matchingEntry
                            ? getChildren(rundownEntries, matchingEntry.id)
                            : []

                          return (
                            <div key={li}>
                              <div className="flex items-start gap-2 py-0.5">
                                {line.label ? (
                                  <span
                                    className="shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-[0.55em] font-bold uppercase tracking-wider"
                                    style={{
                                      backgroundColor: `${RUNDOWN_COLORS[line.type] ?? "#888"}12`,
                                      color: `${RUNDOWN_COLORS[line.type] ?? "#888"}99`,
                                    }}
                                  >
                                    {line.label}
                                  </span>
                                ) : null}
                                <span className={`text-[0.78em] leading-snug ${line.type === "action" ? "text-white/30 italic" : "text-white/50"}`}>
                                  {line.text}
                                </span>
                                {matchingEntry && (
                                  <span className="ml-auto shrink-0 font-mono text-[0.6em] text-white/15 tabular-nums">
                                    {(getEffectiveDuration(matchingEntry) / 1000).toFixed(1)}s
                                  </span>
                                )}
                              </div>
                              {/* Sub-shots hierarchy */}
                              {subShots.length > 0 && (
                                <div className="ml-6 mt-0.5 mb-1 space-y-0.5 border-l border-[#D4A853]/15 pl-2">
                                  {subShots.map((sub) => (
                                    <div key={sub.id} className="flex items-center gap-2 py-0.5">
                                      <span className="text-[0.55em] font-bold text-[#D4A853]/30 uppercase tracking-wider">
                                        {sub.shotSize || `Shot ${sub.order + 1}`}
                                      </span>
                                      <span className="text-[0.7em] text-white/30 truncate">
                                        {sub.caption}
                                      </span>
                                      <span className="ml-auto shrink-0 font-mono text-[0.6em] text-white/12 tabular-nums">
                                        {(getEffectiveDuration(sub) / 1000).toFixed(1)}s
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            })()}

            {/* Total */}
            <div className="flex items-center gap-2 border-t border-white/8 mt-4 pt-3 px-1">
              <span className="w-[32px]" />
              <span className="w-[52px]" />
              <span className="w-[52px]" />
              <span className="flex-1 text-[0.75em] font-semibold uppercase tracking-[0.15em] text-white/30">
                Итого: {rundownSections.length} сцен
              </span>
              <span className="w-[40px] text-right font-mono text-[0.75em] font-semibold text-white/40 tabular-nums">
                {(() => {
                  const total = rundownSections.reduce((s, sec) => s + sec.durationS, 0)
                  const m = Math.floor(total / 60)
                  const ss = total % 60
                  return m > 0 ? `${m}m${ss}s` : `${ss}s`
                })()}
              </span>
            </div>
          </div>
          )
        )}
      </div>
    </div>
  )
}