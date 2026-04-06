"use client"

import { useState, useCallback, useMemo, useRef } from "react"
import { formatTime, getTotalDurationMs, type Segment, type Section } from "@/lib/segmentEngine"

interface Props {
  segments: Segment[]
  sections: Section[]
}

interface CurvePoint {
  timeMs: number
  value: number // 0-100
}

type CurveId = "tension" | "hope" | "melancholy"

const CURVES: { id: CurveId; label: string; color: string }[] = [
  { id: "tension",    label: "Tension",    color: "#E05C5C" },
  { id: "hope",       label: "Hope",       color: "#10B981" },
  { id: "melancholy", label: "Melancholy", color: "#3B82F6" },
]

function deriveMood(tension: number, hope: number, melancholy: number): string {
  if (tension > 70) return "action"
  if (tension > 50) return "tense"
  if (hope > 60 && tension < 30) return "joyful"
  if (melancholy > 60) return "sad"
  if (melancholy > 40 && tension > 30) return "dramatic"
  if (hope < 30 && tension < 30 && melancholy < 30) return "silent"
  return "calm"
}

function deriveMusicalHint(tension: number, hope: number, melancholy: number): string {
  const bpm = Math.round(60 + tension * 0.7 + hope * 0.3)
  const mood = deriveMood(tension, hope, melancholy)
  const hints: string[] = [mood]

  if (tension > 60) hints.push("driving percussion", "minor key")
  if (hope > 50) hints.push("major key", "ascending melody")
  if (melancholy > 50) hints.push("piano", "strings", "slow arpeggios")
  if (tension < 20 && melancholy < 20) hints.push("ambient pad", "soft")

  return `${bpm} BPM, ${hints.join(", ")}`
}

const SVG_W = 660
const SVG_H = 160
const PAD_L = 40
const PAD_R = 10
const PAD_T = 10
const PAD_B = 24
const CHART_W = SVG_W - PAD_L - PAD_R
const CHART_H = SVG_H - PAD_T - PAD_B

export function EmotionCurves({ segments, sections }: Props) {
  const totalMs = useMemo(() => getTotalDurationMs(segments), [segments])

  // Initialize with section-based default points
  const defaultPoints = useMemo(() => {
    const pts: Record<CurveId, CurvePoint[]> = { tension: [], hope: [], melancholy: [] }
    if (totalMs === 0) return pts

    // Add start + end + one per section
    pts.tension = [
      { timeMs: 0, value: 30 },
      { timeMs: totalMs * 0.3, value: 60 },
      { timeMs: totalMs * 0.7, value: 80 },
      { timeMs: totalMs, value: 40 },
    ]
    pts.hope = [
      { timeMs: 0, value: 50 },
      { timeMs: totalMs * 0.4, value: 40 },
      { timeMs: totalMs * 0.8, value: 70 },
      { timeMs: totalMs, value: 60 },
    ]
    pts.melancholy = [
      { timeMs: 0, value: 10 },
      { timeMs: totalMs * 0.35, value: 45 },
      { timeMs: totalMs * 0.6, value: 30 },
      { timeMs: totalMs, value: 15 },
    ]
    return pts
  }, [totalMs])

  const [curves, setCurves] = useState<Record<CurveId, CurvePoint[]>>(defaultPoints)
  const [activeCurve, setActiveCurve] = useState<CurveId>("tension")
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const msToX = useCallback((ms: number) => PAD_L + (ms / Math.max(1, totalMs)) * CHART_W, [totalMs])
  const valToY = useCallback((v: number) => PAD_T + CHART_H - (v / 100) * CHART_H, [])
  const xToMs = useCallback((x: number) => Math.max(0, Math.min(totalMs, ((x - PAD_L) / CHART_W) * totalMs)), [totalMs])
  const yToVal = useCallback((y: number) => Math.max(0, Math.min(100, ((CHART_H - (y - PAD_T)) / CHART_H) * 100)), [])

  const buildPath = useCallback(
    (points: CurvePoint[]) => {
      if (points.length < 2) return ""
      const sorted = [...points].sort((a, b) => a.timeMs - b.timeMs)
      return sorted.map((p, i) => `${i === 0 ? "M" : "L"} ${msToX(p.timeMs)} ${valToY(p.value)}`).join(" ")
    },
    [msToX, valToY],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, curveId: CurveId, idx: number) => {
      e.preventDefault()
      e.stopPropagation()
      setActiveCurve(curveId)
      setDraggingIdx(idx)

      const onMove = (ev: MouseEvent) => {
        if (!svgRef.current) return
        const rect = svgRef.current.getBoundingClientRect()
        const x = ev.clientX - rect.left
        const y = ev.clientY - rect.top
        const ms = xToMs(x)
        const val = yToVal(y)

        setCurves((prev) => {
          const pts = [...prev[curveId]]
          pts[idx] = { timeMs: Math.round(ms), value: Math.round(val) }
          return { ...prev, [curveId]: pts }
        })
      }

      const onUp = () => {
        setDraggingIdx(null)
        document.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseup", onUp)
      }

      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    },
    [xToMs, yToVal],
  )

  // Add point on double-click
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const ms = xToMs(e.clientX - rect.left)
      const val = yToVal(e.clientY - rect.top)

      setCurves((prev) => ({
        ...prev,
        [activeCurve]: [...prev[activeCurve], { timeMs: Math.round(ms), value: Math.round(val) }]
          .sort((a, b) => a.timeMs - b.timeMs),
      }))
    },
    [activeCurve, xToMs, yToVal],
  )

  // Current mood summary
  const moodSummary = useMemo(() => {
    const midMs = totalMs / 2
    const getVal = (pts: CurvePoint[], ms: number) => {
      const sorted = [...pts].sort((a, b) => a.timeMs - b.timeMs)
      const before = sorted.filter((p) => p.timeMs <= ms).pop()
      const after = sorted.find((p) => p.timeMs > ms)
      if (!before) return sorted[0]?.value ?? 50
      if (!after) return before.value
      const t = (ms - before.timeMs) / (after.timeMs - before.timeMs)
      return before.value + t * (after.value - before.value)
    }

    const t = getVal(curves.tension, midMs)
    const h = getVal(curves.hope, midMs)
    const m = getVal(curves.melancholy, midMs)

    return {
      mood: deriveMood(t, h, m),
      hint: deriveMusicalHint(t, h, m),
    }
  }, [curves, totalMs])

  // Section markers
  const sectionMarkers = useMemo(() => {
    return sections.map((sec) => {
      const segs = segments.filter((s) => s.sectionId === sec.id)
      return {
        id: sec.id,
        title: sec.title,
        color: sec.color,
        startMs: segs.length > 0 ? Math.min(...segs.map((s) => s.startMs)) : 0,
      }
    })
  }, [sections, segments])

  return (
    <div className="flex h-full flex-col">
      {/* Curve selector */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2">
        {CURVES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveCurve(c.id)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              activeCurve === c.id
                ? "bg-white/10 text-white/70"
                : "text-white/25 hover:text-white/40"
            }`}
          >
            <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.color }} />
            {c.label}
          </button>
        ))}
        <div className="ml-auto text-[10px] text-white/20">
          Mood: <span className="text-white/40">{moodSummary.mood}</span>
        </div>
      </div>

      {/* SVG canvas */}
      <div className="flex-1 px-2 py-2">
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          preserveAspectRatio="xMidYMid meet"
          onDoubleClick={handleDoubleClick}
          className="cursor-crosshair"
        >
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={PAD_L} y1={valToY(v)} x2={PAD_L + CHART_W} y2={valToY(v)} stroke="white" strokeOpacity={0.04} />
              <text x={PAD_L - 4} y={valToY(v) + 3} textAnchor="end" fill="white" fillOpacity={0.15} fontSize={8}>{v}</text>
            </g>
          ))}

          {/* Section markers */}
          {sectionMarkers.map((m) => (
            <g key={m.id}>
              <line x1={msToX(m.startMs)} y1={PAD_T} x2={msToX(m.startMs)} y2={PAD_T + CHART_H} stroke={m.color} strokeOpacity={0.2} strokeDasharray="3,3" />
              <text x={msToX(m.startMs) + 3} y={SVG_H - 4} fill={m.color} fillOpacity={0.3} fontSize={7} fontWeight="bold">{m.title}</text>
            </g>
          ))}

          {/* Time axis */}
          <line x1={PAD_L} y1={PAD_T + CHART_H} x2={PAD_L + CHART_W} y2={PAD_T + CHART_H} stroke="white" strokeOpacity={0.06} />

          {/* Curves */}
          {CURVES.map((c) => {
            const pts = curves[c.id]
            return (
              <g key={c.id}>
                <path
                  d={buildPath(pts)}
                  fill="none"
                  stroke={c.color}
                  strokeWidth={activeCurve === c.id ? 2 : 1}
                  strokeOpacity={activeCurve === c.id ? 0.7 : 0.2}
                />
                {/* Fill area */}
                {pts.length >= 2 && (
                  <path
                    d={`${buildPath(pts)} L ${msToX(pts[pts.length - 1].timeMs)} ${valToY(0)} L ${msToX(pts[0].timeMs)} ${valToY(0)} Z`}
                    fill={c.color}
                    fillOpacity={activeCurve === c.id ? 0.06 : 0.02}
                  />
                )}
                {/* Control points */}
                {activeCurve === c.id &&
                  pts.map((p, i) => (
                    <circle
                      key={i}
                      cx={msToX(p.timeMs)}
                      cy={valToY(p.value)}
                      r={draggingIdx === i ? 6 : 4}
                      fill={c.color}
                      fillOpacity={0.8}
                      stroke="black"
                      strokeWidth={1}
                      className="cursor-grab active:cursor-grabbing"
                      onMouseDown={(e) => handleMouseDown(e, c.id, i)}
                    />
                  ))}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Music hint */}
      <div className="border-t border-white/[0.06] px-4 py-2">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-white/20">Music prompt hint</div>
        <div className="mt-1 text-[11px] text-white/40">{moodSummary.hint}</div>
      </div>
    </div>
  )
}
