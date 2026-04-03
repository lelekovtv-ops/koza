"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, Pause, Play, SkipBack, Sparkles, Loader2, ZoomIn, ZoomOut } from "lucide-react"
import {
  textToSegments,
  getTotalDurationMs,
  formatTime,
  type Segment,
  type Section,
} from "@/lib/segmentEngine"
import {
  buildProductionPlan,
  DEFAULT_BIBLE,
  type ProductionPlan,
  type ProductionJob,
  type JobType,
} from "@/lib/productionPlan"

// ─── Demo script ────────────────────────────────────────────

const DEMO = `[HOOK — 3 сек]
ТИТР: ЛЕНИН: ЧЕЛОВЕК, КОТОРЫЙ ИЗМЕНИЛ ВСЁ
МУЗЫКА: тревожный эмбиент, низкие струнные

[ГОВОРЯЩАЯ ГОЛОВА — 15 сек]
ГОЛОС: Владимир Ленин. Одна из самых противоречивых фигур двадцатого века. Революционер, философ, основатель первого в мире социалистического государства.

[АРХИВНЫЕ КАДРЫ — 10 сек]
ГОЛОС: Родившийся в семье инспектора народных училищ, молодой Владимир Ульянов казался обычным гимназистом.
ГРАФИКА: карта Российской Империи, маркер на Симбирске
ТИТР: Симбирск, 1870

[ПОВОРОТНЫЙ МОМЕНТ — 12 сек]
ГОЛОС: Всё изменилось в 1887 году. Казнь старшего брата Александра за покушение на царя.
ГРАФИКА: чёрно-белое фото Александра Ульянова
ТИТР: 1887 — ТОЧКА НЕВОЗВРАТА

[РЕВОЛЮЦИЯ — 15 сек]
ГОЛОС: Апрель 1917-го. Пломбированный вагон. Финляндский вокзал. Ленин произносит Апрельские тезисы.
ГРАФИКА: архивное фото Финляндского вокзала
ТИТР: АПРЕЛЬ 1917

[CTA — 5 сек]
ГОЛОС: Подписывайтесь на канал. В следующем выпуске — Сталин.
ТИТР: ПОДПИШИСЬ`

// ─── Production track config ────────────────────────────────

const PROD_TRACKS: { type: JobType; label: string; color: string }[] = [
  { type: "video-gen",  label: "VIDEO",   color: "#D4A853" },
  { type: "tts",        label: "TTS",     color: "#8B5CF6" },
  { type: "lipsync",    label: "LIPSYNC", color: "#EC4899" },
  { type: "image-gen",  label: "IMAGE",   color: "#10B981" },
  { type: "music-gen",  label: "MUSIC",   color: "#3B82F6" },
  { type: "title-card", label: "TITLES",  color: "#8B8B8B" },
  { type: "sfx",        label: "SFX",     color: "#F59E0B" },
]

const STATUS_COLORS: Record<string, string> = {
  pending: "#999",
  running: "#D4A853",
  done: "#10B981",
  error: "#E05C5C",
}

function jobLabel(job: ProductionJob): string {
  const p = job.params as Record<string, unknown>
  return (
    (p.text as string) ??
    (p.prompt as string) ??
    (p.event as string) ??
    ""
  ).slice(0, 60) || job.type
}

function jobSubLabel(job: ProductionJob): string {
  const p = job.params as Record<string, unknown>
  if (job.type === "video-gen") return `${p.api} · ${p.cameraPreset ?? "auto"}`
  if (job.type === "image-gen") return `${p.api} · ${p.width}×${p.height}`
  if (job.type === "tts") return `${p.model}`
  if (job.type === "lipsync") return `${p.model}`
  if (job.type === "music-gen") return `${p.api} · ${p.durationSec}s`
  if (job.type === "sfx") return `${p.api}`
  if (job.type === "title-card") return `${p.style} · ${p.animationIn}`
  return ""
}

const LW = 80
const TRACK_H = 44
const RULER_H = 28

// ─── Page ───────────────────────────────────────────────────

export default function SegmentLabPage() {
  const [scriptText, setScriptText] = useState(DEMO)
  const [isEditing, setIsEditing] = useState(false)
  const [zoom, setZoom] = useState(80)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  // Playback
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const rafRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)

  const tlRef = useRef<HTMLDivElement | null>(null)
  const scriptScrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Smart distribute
  const [smartResult, setSmartResult] = useState<{
    directorNote: string; colorGrade: string; pacing: string;
    jobs: Array<{ segmentId: string; type: string; prompt: string; api: string; camera?: string; motionStrength?: number; emotionalNote: string; transitionTo?: string; titleStyle?: string; musicBpm?: number; musicInstruments?: string; voiceSpeed?: number; voiceEmotion?: string }>
  } | null>(null)
  const [isSmartLoading, setIsSmartLoading] = useState(false)
  const [smartError, setSmartError] = useState<string | null>(null)

  // ── Parse script → segments → production plan ──
  const { segments, sections } = useMemo(() => textToSegments(scriptText), [scriptText])
  const totalMs = useMemo(() => getTotalDurationMs(segments), [segments])

  const plan: ProductionPlan | null = useMemo(() => {
    if (segments.length === 0) return null
    const basePlan = buildProductionPlan(segments, sections, DEFAULT_BIBLE)

    // If we have smart results, enrich the plan jobs
    if (smartResult) {
      for (const enriched of smartResult.jobs) {
        const job = basePlan.jobs.find((j) => j.segmentId === enriched.segmentId && j.type === enriched.type)
        if (job) {
          const p = job.params as Record<string, unknown>
          if (enriched.prompt) p.prompt = enriched.prompt
          if (enriched.api) p.api = enriched.api
          if (enriched.camera && "cameraPreset" in p) p.cameraPreset = enriched.camera
          if (enriched.motionStrength != null && "motionStrength" in p) p.motionStrength = enriched.motionStrength
          if (enriched.voiceSpeed != null && "speed" in p) p.speed = enriched.voiceSpeed
          if (enriched.titleStyle && "style" in p) p.style = enriched.titleStyle
          if (enriched.musicBpm != null && "bpmHint" in p) p.bpmHint = enriched.musicBpm
          // Store extra metadata
          ;(job as unknown as Record<string, unknown>)._emotionalNote = enriched.emotionalNote
          ;(job as unknown as Record<string, unknown>)._transitionTo = enriched.transitionTo
          ;(job as unknown as Record<string, unknown>)._voiceEmotion = enriched.voiceEmotion
          ;(job as unknown as Record<string, unknown>)._musicInstruments = enriched.musicInstruments
        }
      }
    }

    return basePlan
  }, [segments, sections, smartResult])

  // ── Smart Distribute handler ──
  const handleSmartDistribute = useCallback(async () => {
    setIsSmartLoading(true)
    setSmartError(null)
    try {
      const res = await fetch("/api/smart-distribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments, sections, scriptText }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setSmartResult(data)
    } catch (e) {
      setSmartError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setIsSmartLoading(false)
    }
  }, [segments, sections, scriptText])

  // ── Group jobs by track type ──
  const jobTracks = useMemo(() => {
    if (!plan) return []
    return PROD_TRACKS
      .map((t) => ({
        ...t,
        jobs: plan.jobs.filter((j) => j.type === t.type),
      }))
      .filter((t) => t.jobs.length > 0)
  }, [plan])

  // Total width
  const totalWidth = useMemo(() => Math.max(800, (totalMs / 1000) * zoom + 200), [totalMs, zoom])
  const tracksH = jobTracks.length * TRACK_H
  const playheadX = LW + (currentTime / 1000) * zoom

  // ── Duration badges for script ──
  const lineDurations = useMemo(() => {
    const map = new Map<number, { durationMs: number; role: string }>()
    for (const seg of segments) {
      if (seg.role === "setup-a" || seg.role === "section-heading") continue
      map.set(seg.sourceLine, { durationMs: seg.durationMs, role: seg.role })
    }
    return map
  }, [segments])

  // ── Active lines for script highlighting ──
  const activeLines = useMemo(() => {
    const lines = new Set<number>()
    for (const seg of segments) {
      if (currentTime >= seg.startMs && currentTime < seg.startMs + seg.durationMs) {
        lines.add(seg.sourceLine)
      }
    }
    return lines
  }, [segments, currentTime])

  const scriptLines = useMemo(() => scriptText.split("\n"), [scriptText])

  // ── Active jobs at current time ──
  const activeJobIds = useMemo(() => {
    if (!plan) return new Set<string>()
    const ids = new Set<string>()
    for (const job of plan.jobs) {
      if (currentTime >= job.startMs && currentTime < job.startMs + job.durationMs) {
        ids.add(job.id)
      }
    }
    return ids
  }, [plan, currentTime])

  // Find job's startMs — jobs don't have startMs natively, need to compute from segment
  // Actually they DO have durationMs but not startMs. We need to derive startMs from their segment.
  const jobPositions = useMemo(() => {
    if (!plan) return new Map<string, { startMs: number; durationMs: number }>()
    const map = new Map<string, { startMs: number; durationMs: number }>()
    for (const job of plan.jobs) {
      // Find the segment this job is attached to
      const seg = segments.find((s) => s.id === job.segmentId)
      const startMs = seg?.startMs ?? 0
      map.set(job.id, { startMs, durationMs: job.durationMs })
    }
    return map
  }, [plan, segments])

  // Recompute active jobs with positions
  const activeJobIdsComputed = useMemo(() => {
    const ids = new Set<string>()
    for (const [id, pos] of jobPositions) {
      if (currentTime >= pos.startMs && currentTime < pos.startMs + pos.durationMs) {
        ids.add(id)
      }
    }
    return ids
  }, [jobPositions, currentTime])

  // Selected job
  const selectedJob = useMemo(
    () => plan?.jobs.find((j) => j.id === selectedJobId) ?? null,
    [plan, selectedJobId],
  )

  // Section markers
  const sectionMarkers = useMemo(() => {
    return sections.map((sec) => {
      const sectionSegs = segments.filter((s) => s.sectionId === sec.id)
      const startMs = sectionSegs.length > 0 ? Math.min(...sectionSegs.map((s) => s.startMs)) : 0
      return { id: sec.id, title: sec.title, color: sec.color, startMs }
    })
  }, [sections, segments])

  // ── Playback ──
  useEffect(() => {
    if (currentTime > totalMs) setCurrentTime(totalMs)
  }, [currentTime, totalMs])

  useEffect(() => {
    if (!isPlaying) { if (rafRef.current) cancelAnimationFrame(rafRef.current); return }
    lastFrameRef.current = performance.now()
    const tick = (now: number) => {
      const dt = now - lastFrameRef.current
      lastFrameRef.current = now
      setCurrentTime((prev) => {
        const next = prev + dt
        if (next >= totalMs) { setIsPlaying(false); return 0 }
        return next
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isPlaying, totalMs])

  // Auto-scroll timeline
  useEffect(() => {
    if (!isPlaying || !tlRef.current) return
    const el = tlRef.current
    const vw = el.clientWidth - LW
    const phLocal = playheadX - LW - el.scrollLeft
    if (phLocal > vw * 0.7) el.scrollLeft = Math.max(0, playheadX - LW - vw * 0.33)
    if (phLocal < 0) el.scrollLeft = Math.max(0, playheadX - LW - vw * 0.1)
  }, [isPlaying, playheadX])

  // Auto-scroll script
  useEffect(() => {
    if (!scriptScrollRef.current || activeLines.size === 0) return
    const firstActive = Math.min(...activeLines)
    const lh = 19.5
    const target = firstActive * lh - scriptScrollRef.current.clientHeight / 3
    if (Math.abs(scriptScrollRef.current.scrollTop - target) > lh * 3)
      scriptScrollRef.current.scrollTo({ top: Math.max(0, target), behavior: "smooth" })
  }, [activeLines])

  // ── Keyboard ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "TEXTAREA" || tag === "INPUT") return
      switch (e.code) {
        case "Space": case "KeyK": e.preventDefault(); setIsPlaying((p) => !p); break
        case "Home": e.preventDefault(); setCurrentTime(0); if (tlRef.current) tlRef.current.scrollLeft = 0; break
        case "End": e.preventDefault(); setCurrentTime(totalMs); break
        case "ArrowLeft": e.preventDefault(); setCurrentTime((v) => Math.max(0, v - 1000)); break
        case "ArrowRight": e.preventDefault(); setCurrentTime((v) => Math.min(totalMs, v + 1000)); break
        case "KeyJ": e.preventDefault(); setCurrentTime((v) => Math.max(0, v - 5000)); break
        case "KeyL": e.preventDefault(); setCurrentTime((v) => Math.min(totalMs, v + 5000)); break
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [totalMs])

  // ── Zoom via Ctrl+Wheel ──
  useEffect(() => {
    const el = tlRef.current
    if (!el) return
    const h = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        setZoom((v) => Math.max(20, Math.min(250, v + (e.deltaY > 0 ? -6 : 6))))
      }
    }
    el.addEventListener("wheel", h, { passive: false })
    return () => el.removeEventListener("wheel", h)
  }, [])

  // ── Timeline click → seek ──
  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-clip]")) return
    const el = tlRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const xInContent = e.clientX - rect.left + el.scrollLeft
    const ms = Math.max(0, ((xInContent - LW) / zoom) * 1000)
    setCurrentTime(Math.max(0, Math.min(ms, totalMs)))
  }, [zoom, totalMs])

  // ── Script click → seek ──
  const handleScriptClick = useCallback((e: React.MouseEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget
    const lineIdx = ta.value.slice(0, ta.selectionStart).split("\n").length - 1
    const seg = segments.find((s) => s.sourceLine === lineIdx && s.role !== "setup-a")
    if (seg) {
      setCurrentTime(seg.startMs)
      if (tlRef.current) {
        const vw = tlRef.current.clientWidth - LW
        tlRef.current.scrollLeft = Math.max(0, (seg.startMs / 1000) * zoom - vw * 0.3)
      }
    }
  }, [segments, zoom])

  // ─── RENDER ───────────────────────────────────────────────

  return (
    <div className="fixed inset-0 flex flex-col bg-[#F5F3EF] text-[#1A1A1A]">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-black/10 px-4 py-2">
        <Link href="/dev" className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/15 text-[#777] hover:bg-black/5 hover:text-[#333]">
          <ArrowLeft size={14} />
        </Link>
        <h1 className="text-sm font-medium">Segment Lab</h1>

        <div className="ml-4 flex items-center gap-1">
          <button type="button" onClick={() => { setCurrentTime(0); if (tlRef.current) tlRef.current.scrollLeft = 0 }} className="flex h-7 w-7 items-center justify-center rounded-md text-[#666] hover:bg-black/5">
            <SkipBack size={14} />
          </button>
          <button type="button" onClick={() => setIsPlaying((p) => !p)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1A1A1A] text-white hover:bg-[#333]">
            {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
          </button>
        </div>
        <span className="font-mono text-sm tabular-nums text-[#555]">{formatTime(currentTime)}</span>
        <span className="text-[11px] text-[#BBB]">/ {formatTime(totalMs)}</span>

        <div className="ml-3 flex items-center gap-1">
          <button type="button" onClick={() => setZoom((v) => Math.max(20, v - 8))} className="text-[#888] hover:text-[#222]"><ZoomOut size={13} /></button>
          <span className="min-w-[28px] text-center font-mono text-[10px] text-[#999]">{zoom}</span>
          <button type="button" onClick={() => setZoom((v) => Math.min(250, v + 8))} className="text-[#888] hover:text-[#222]"><ZoomIn size={13} /></button>
        </div>

        <div className="ml-auto flex items-center gap-3 text-[11px] uppercase tracking-[0.1em] text-[#999]">
          <span>{sections.length} sec</span>
          <span className="h-3 w-px bg-black/10" />
          <span>{plan?.jobs.length ?? 0} jobs</span>
          {smartResult && <span className="text-[#10B981]">AI</span>}
        </div>

        {/* Smart Distribute */}
        <button
          type="button"
          onClick={handleSmartDistribute}
          disabled={isSmartLoading || segments.length === 0}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${
            smartResult
              ? "border border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]"
              : "bg-gradient-to-r from-[#D4A853] to-[#E05C5C] text-white hover:opacity-90"
          } disabled:opacity-40`}
        >
          {isSmartLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {isSmartLoading ? "Analyzing..." : smartResult ? "Re-analyze" : "Smart Distribute"}
        </button>
      </header>

      {/* ── Panels ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* LEFT: Script */}
        <div className="flex w-[300px] shrink-0 flex-col border-r border-black/10">
          <div className="flex items-center justify-between border-b border-black/10 px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#999]">Script</span>
            {isEditing && <span className="animate-pulse text-[9px] text-[#D4A853]">editing...</span>}
          </div>
          <div ref={scriptScrollRef} className="relative flex-1 overflow-hidden">
            {/* Highlight + duration badges */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ padding: "8px 12px" }}>
              {scriptLines.map((line, idx) => {
                const isActive = !isEditing && activeLines.has(idx)
                const dur = lineDurations.get(idx)
                return (
                  <div key={idx} style={{
                    position: "relative", fontFamily: "'Courier New', monospace", fontSize: 12, lineHeight: "1.625",
                    whiteSpace: "pre-wrap", overflowWrap: "break-word", paddingRight: 38, color: "transparent",
                    backgroundColor: isActive ? "#D4A85320" : "transparent",
                    boxShadow: isActive ? "inset 0 -2px 0 #D4A853" : "none", borderRadius: isActive ? 2 : 0,
                  }}>
                    {line || "\u00A0"}
                    {dur && (
                      <span style={{ position: "absolute", right: 2, top: 2, fontSize: 9, fontFamily: "system-ui, sans-serif", fontWeight: 500, color: isActive ? "#D4A853" : "#CCC" }}>
                        {(dur.durationMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            <textarea ref={textareaRef} value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              onFocus={() => setIsEditing(true)} onBlur={() => setIsEditing(false)}
              onClick={handleScriptClick} onKeyDown={(e) => e.stopPropagation()} spellCheck={false}
              className="relative h-full w-full resize-none bg-transparent outline-none"
              style={{ padding: "8px 12px", paddingRight: 38, fontFamily: "'Courier New', monospace", fontSize: 12, lineHeight: "1.625", color: "#333", caretColor: "#D4A853", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}
              placeholder="Write your script here..."
            />
          </div>
        </div>

        {/* CENTER: Production Timeline + Inspector */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

          {/* Production Timeline */}
          <div
            ref={tlRef}
            className="relative flex-1 overflow-x-auto overflow-y-hidden bg-[#EDEAE4] cursor-crosshair"
            onClick={handleTimelineClick}
          >
            <div className="relative" style={{ width: totalWidth, minHeight: RULER_H + tracksH }}>

              {/* Ruler (sticky top) */}
              <div className="sticky top-0 z-20 flex border-b border-black/10 bg-[#E8E5DF]" style={{ height: RULER_H, width: totalWidth }}>
                <div className="sticky left-0 z-30 shrink-0 bg-[#E8E5DF]" style={{ width: LW }} />
                <div className="relative flex-1">
                  {Array.from({ length: Math.ceil(totalMs / 1000) + 1 }, (_, i) => {
                    const x = i * zoom
                    const major = i % 5 === 0
                    return (
                      <div key={i} className="absolute top-0 h-full" style={{ left: x }}>
                        <div className={`h-full border-l ${major ? "border-black/15" : "border-black/6"}`} />
                        {major && <span className="absolute left-1 top-1 font-mono text-[9px] text-[#999]">{formatTime(i * 1000)}</span>}
                      </div>
                    )
                  })}
                  {/* Section markers */}
                  {sectionMarkers.map((m) => (
                    <div key={m.id} className="absolute top-0 z-10 h-full" style={{ left: (m.startMs / 1000) * zoom }}>
                      <div className="h-full border-l-2" style={{ borderColor: m.color }} />
                      <span className="absolute left-1.5 top-0.5 rounded bg-white/80 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider" style={{ color: m.color }}>{m.title}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Job tracks */}
              {jobTracks.map((track) => (
                <div key={track.type} className="relative flex border-b border-black/6" style={{ height: TRACK_H }}>
                  {/* Label (sticky left) */}
                  <div className="sticky left-0 z-10 flex shrink-0 items-center border-r border-black/8 bg-[#E8E5DF]/90 px-2.5 backdrop-blur-sm" style={{ width: LW }}>
                    <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: track.color }}>{track.label}</span>
                  </div>
                  {/* Job clips */}
                  <div className="relative flex-1" style={{ width: totalWidth - LW }}>
                    {track.jobs.map((job) => {
                      const pos = jobPositions.get(job.id)
                      if (!pos) return null
                      const left = (pos.startMs / 1000) * zoom
                      const width = Math.max(6, (pos.durationMs / 1000) * zoom)
                      const isActive = activeJobIdsComputed.has(job.id)
                      const isSelected = selectedJobId === job.id
                      const statusColor = STATUS_COLORS[job.status] ?? "#999"
                      const hasDeps = job.dependsOn.length > 0

                      return (
                        <div
                          key={job.id}
                          data-clip
                          onClick={(e) => { e.stopPropagation(); setSelectedJobId(job.id === selectedJobId ? null : job.id) }}
                          className={`absolute flex items-center overflow-hidden rounded text-[9px] cursor-pointer transition-shadow ${
                            isActive ? "z-10 shadow-[0_0_8px_rgba(0,0,0,0.15)]" : "hover:shadow-sm"
                          } ${isSelected ? "ring-2 ring-[#1A1A1A]/30" : ""}`}
                          style={{
                            left, top: 3, width, height: TRACK_H - 6,
                            backgroundColor: isActive ? `${track.color}50` : `${track.color}22`,
                            borderLeft: `3px solid ${track.color}`,
                            color: "#333",
                          }}
                        >
                          {/* Status dot */}
                          <div className="ml-1.5 h-[5px] w-[5px] shrink-0 rounded-full" style={{ backgroundColor: statusColor }} />
                          {/* Label */}
                          <span className="truncate px-1 font-medium">{jobLabel(job)}</span>
                          {/* Duration */}
                          {width > 50 && (
                            <span className="ml-auto shrink-0 pr-1.5 text-[8px] tabular-nums opacity-50">
                              {(pos.durationMs / 1000).toFixed(1)}s
                            </span>
                          )}
                          {/* Dependency indicator */}
                          {hasDeps && width > 30 && (
                            <div className="absolute right-1 top-0.5 text-[7px] text-[#999]">
                              ←{job.dependsOn.length}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Section dividers */}
                    {sectionMarkers.map((m) => (
                      <div key={m.id} className="pointer-events-none absolute top-0 h-full" style={{ left: (m.startMs / 1000) * zoom }}>
                        <div className="h-full border-l border-dashed" style={{ borderColor: `${m.color}40` }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Unified Playhead */}
              <div className="pointer-events-none absolute z-30" style={{ left: playheadX, top: 0, height: RULER_H + tracksH }}>
                <div className="relative">
                  <div className="absolute -left-[5px] top-0 h-0 w-0" style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "6px solid #E05C5C" }} />
                </div>
                <div className="h-full w-[2px] bg-[#E05C5C]" style={{ marginLeft: -1 }} />
              </div>

              {segments.length === 0 && (
                <div className="flex items-center justify-center text-sm text-[#999]" style={{ height: 120 }}>
                  Write a script to see the production plan
                </div>
              )}
            </div>
          </div>

          {/* ── Inspector (bottom) ── */}
          <div className="h-[200px] shrink-0 flex flex-col overflow-hidden border-t border-black/10 bg-[#F0EDE7]">
            {selectedJob ? (() => {
              const pos = jobPositions.get(selectedJob.id)
              const trackMeta = PROD_TRACKS.find((t) => t.type === selectedJob.type)
              const deps = selectedJob.dependsOn.map((id) => plan?.jobs.find((j) => j.id === id)).filter(Boolean) as ProductionJob[]
              return (
                <div className="flex h-full overflow-hidden">
                  {/* Job info */}
                  <div className="flex-1 overflow-y-auto px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="rounded px-2 py-0.5 text-[9px] font-bold uppercase" style={{ backgroundColor: (trackMeta?.color ?? "#999") + "20", color: trackMeta?.color }}>
                        {selectedJob.type}
                      </span>
                      <span className="rounded px-2 py-0.5 text-[9px] font-semibold uppercase" style={{ backgroundColor: STATUS_COLORS[selectedJob.status] + "20", color: STATUS_COLORS[selectedJob.status] }}>
                        {selectedJob.status}
                      </span>
                      <span className="text-[10px] text-[#999]">{formatTime(pos?.startMs ?? 0)} · {((pos?.durationMs ?? 0) / 1000).toFixed(1)}s</span>
                    </div>
                    <div className="text-[12px] text-[#333] font-medium mb-1">{jobLabel(selectedJob)}</div>
                    <div className="text-[10px] text-[#999] mb-3">{jobSubLabel(selectedJob)}</div>

                    {/* AI creative notes */}
                    {(() => {
                      const extra = selectedJob as unknown as Record<string, unknown>
                      const note = extra._emotionalNote as string | undefined
                      const transition = extra._transitionTo as string | undefined
                      const emotion = extra._voiceEmotion as string | undefined
                      const instruments = extra._musicInstruments as string | undefined
                      const hasAI = note || transition || emotion || instruments
                      if (!hasAI) return null
                      return (
                        <div className="mb-3 rounded-lg border border-[#D4A853]/20 bg-[#D4A853]/5 px-3 py-2">
                          <div className="text-[9px] font-bold uppercase tracking-wider text-[#D4A853] mb-1">AI Director</div>
                          {note && <div className="text-[11px] text-[#555] italic">{note}</div>}
                          {transition && <div className="text-[10px] text-[#888] mt-1">Transition → {transition}</div>}
                          {emotion && <div className="text-[10px] text-[#888] mt-0.5">Voice: {emotion}</div>}
                          {instruments && <div className="text-[10px] text-[#888] mt-0.5">Instruments: {instruments}</div>}
                        </div>
                      )
                    })()}

                    {/* Params */}
                    <div className="space-y-1">
                      {Object.entries(selectedJob.params).map(([key, value]) => (
                        <div key={key} className="flex items-start gap-2 text-[10px]">
                          <span className="shrink-0 font-mono text-[#BBB] w-[100px] text-right">{key}</span>
                          <span className="text-[#555] break-all">{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dependencies */}
                  {deps.length > 0 && (
                    <div className="w-[200px] shrink-0 border-l border-black/8 overflow-y-auto px-3 py-3">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-[#999] mb-2">Depends on ({deps.length})</div>
                      {deps.map((dep) => {
                        const depMeta = PROD_TRACKS.find((t) => t.type === dep.type)
                        return (
                          <button
                            key={dep.id}
                            onClick={() => setSelectedJobId(dep.id)}
                            className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[10px] hover:bg-black/5 mb-1"
                          >
                            <div className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ backgroundColor: depMeta?.color }} />
                            <span className="truncate font-medium text-[#333]">{dep.type}</span>
                            <span className="ml-auto shrink-0 text-[8px]" style={{ color: STATUS_COLORS[dep.status] }}>{dep.status}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })() : (
              <div className="flex-1 flex flex-col overflow-y-auto px-4 py-3">
                {plan ? (
                  <>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#999]">Production Plan</span>
                      <span className="text-[10px] text-[#BBB]">{plan.jobs.length} jobs · ~{Math.ceil(plan.estimatedTimeSec / 60)}мин</span>
                      <button
                        type="button"
                        onClick={handleSmartDistribute}
                        disabled={isSmartLoading || segments.length === 0}
                        className={`ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${
                          smartResult
                            ? "border border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]"
                            : "bg-gradient-to-r from-[#D4A853] to-[#E05C5C] text-white shadow-sm hover:shadow-md hover:opacity-90"
                        } disabled:opacity-40`}
                      >
                        {isSmartLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                        {isSmartLoading ? "AI анализирует..." : smartResult ? "Переанализировать" : "Smart Distribute"}
                      </button>
                    </div>
                    {/* Summary by type */}
                    <div className="flex flex-wrap gap-2">
                      {jobTracks.map((track) => (
                        <div key={track.type} className="flex items-center gap-1.5 rounded-lg border border-black/8 bg-white/60 px-2.5 py-1.5">
                          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: track.color }} />
                          <span className="text-[10px] font-semibold" style={{ color: track.color }}>{track.label}</span>
                          <span className="text-[10px] text-[#999]">{track.jobs.length}</span>
                        </div>
                      ))}
                    </div>
                    {/* Critical path */}
                    {plan.criticalPath.length > 0 && (
                      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[9px] font-bold text-[#D4A853] uppercase tracking-wider">Critical path:</span>
                        {plan.criticalPath.slice(0, 8).map((id, i) => {
                          const job = plan.jobs.find((j) => j.id === id)
                          if (!job) return null
                          const meta = PROD_TRACKS.find((t) => t.type === job.type)
                          return (
                            <span key={id} className="flex items-center gap-1">
                              {i > 0 && <span className="text-[#CCC] text-[9px]">→</span>}
                              <button
                                onClick={() => setSelectedJobId(id)}
                                className="text-[8px] font-semibold px-1.5 py-0.5 rounded hover:opacity-80"
                                style={{ background: (meta?.color ?? "#999") + "20", color: meta?.color }}
                              >
                                {meta?.label ?? job.type}
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    )}
                    {/* Smart distribute result */}
                    {smartResult && (
                      <div className="mt-3 rounded-lg border border-[#D4A853]/20 bg-[#D4A853]/5 px-3 py-2">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-[#D4A853] mb-1">AI Director Note</div>
                        <div className="text-[11px] text-[#555]">{smartResult.directorNote}</div>
                        <div className="mt-1.5 flex gap-3 text-[10px] text-[#888]">
                          <span>Color: {smartResult.colorGrade}</span>
                          <span>Pacing: {smartResult.pacing}</span>
                        </div>
                      </div>
                    )}
                    {smartError && (
                      <div className="mt-3 rounded-lg border border-[#E05C5C]/20 bg-[#E05C5C]/5 px-3 py-2 text-[11px] text-[#E05C5C]">
                        {smartError}
                      </div>
                    )}
                    <div className="mt-3 text-[10px] text-[#BBB]">Click a job on the timeline to inspect its config</div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center text-sm text-[#999]">
                    Write a script to see the production plan
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
