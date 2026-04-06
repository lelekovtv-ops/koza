"use client"

import { useMemo } from "react"
import { formatTime, type Segment, type Section } from "@/lib/segmentEngine"

interface Props {
  segments: Segment[]
  sections: Section[]
  currentTime: number
  onSeek: (ms: number) => void
}

interface BeatRow {
  startMs: number
  sectionId: string
  sectionTitle: string
  sectionColor: string
  shot: string | null
  voice: string | null
  graphic: string | null
  title: string | null
  music: string | null
  durationMs: number
}

export function VerticalTimeline({ segments, sections, currentTime, onSeek }: Props) {
  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])

  // Group segments into beat rows by startMs proximity
  const beats = useMemo(() => {
    const rows: BeatRow[] = []
    const sorted = [...segments]
      .filter((s) => s.role !== "section-heading" && s.role !== "setup-a")
      .sort((a, b) => a.startMs - b.startMs)

    for (const seg of sorted) {
      // Try to merge into last row if startMs is close enough (< 500ms gap)
      const last = rows[rows.length - 1]
      if (last && Math.abs(seg.startMs - last.startMs) < 500 && seg.sectionId === last.sectionId) {
        assignToRow(last, seg)
        last.durationMs = Math.max(last.durationMs, seg.durationMs)
      } else {
        const section = sectionMap.get(seg.sectionId)
        const row: BeatRow = {
          startMs: seg.startMs,
          sectionId: seg.sectionId,
          sectionTitle: section?.title ?? "",
          sectionColor: section?.color ?? "#666",
          shot: null,
          voice: null,
          graphic: null,
          title: null,
          music: null,
          durationMs: seg.durationMs,
        }
        assignToRow(row, seg)
        rows.push(row)
      }
    }

    return rows
  }, [segments, sectionMap])

  // Add section headers
  const rowsWithHeaders = useMemo(() => {
    const result: Array<{ type: "header"; section: Section } | { type: "beat"; beat: BeatRow }> = []
    let lastSectionId = ""

    for (const beat of beats) {
      if (beat.sectionId !== lastSectionId) {
        const section = sectionMap.get(beat.sectionId)
        if (section) result.push({ type: "header", section })
        lastSectionId = beat.sectionId
      }
      result.push({ type: "beat", beat })
    }

    return result
  }, [beats, sectionMap])

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-white/[0.06] bg-[#1A1A1A]">
            <th className="w-[60px] px-2 py-2 text-left font-semibold uppercase tracking-wider text-white/25">TC</th>
            <th className="w-[180px] px-2 py-2 text-left font-semibold uppercase tracking-wider text-[#D4A853]/60">Shot</th>
            <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider text-[#8B5CF6]/60">Voice</th>
            <th className="w-[140px] px-2 py-2 text-left font-semibold uppercase tracking-wider text-[#F59E0B]/60">Title</th>
            <th className="w-[120px] px-2 py-2 text-left font-semibold uppercase tracking-wider text-[#3B82F6]/60">Music</th>
          </tr>
        </thead>
        <tbody>
          {rowsWithHeaders.map((row, i) => {
            if (row.type === "header") {
              return (
                <tr key={`h-${row.section.id}`} className="border-b border-white/[0.04]">
                  <td colSpan={5} className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: row.section.color }} />
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: row.section.color }}>
                        {row.section.title}
                      </span>
                    </div>
                  </td>
                </tr>
              )
            }

            const beat = row.beat
            const isActive = currentTime >= beat.startMs && currentTime < beat.startMs + beat.durationMs

            return (
              <tr
                key={`b-${i}-${beat.startMs}`}
                onClick={() => onSeek(beat.startMs)}
                className={`cursor-pointer border-b border-white/[0.03] transition-colors ${
                  isActive ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"
                }`}
              >
                <td className="px-2 py-2 font-mono text-white/20">
                  {formatTime(beat.startMs)}
                </td>
                <td className="px-2 py-2">
                  {(beat.shot || beat.graphic) && (
                    <span className={`text-white/50 ${beat.graphic ? "text-[#10B981]/70" : ""}`}>
                      {beat.graphic ?? beat.shot}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {beat.voice && (
                    <span className="text-white/60">{beat.voice}</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {beat.title && (
                    <span className="rounded bg-[#F59E0B]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#F59E0B]/70">
                      {beat.title}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {beat.music && (
                    <span className="text-[#3B82F6]/50">{beat.music}</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {beats.length === 0 && (
        <div className="flex h-40 items-center justify-center text-[13px] text-white/20">
          Open /script and write something
        </div>
      )}
    </div>
  )
}

function assignToRow(row: BeatRow, seg: Segment) {
  switch (seg.role) {
    case "voice":
      row.voice = seg.content
      break
    case "graphic":
      row.graphic = seg.content
      break
    case "action":
      row.shot = seg.content
      break
    case "title":
      row.title = seg.content
      break
    case "music":
      row.music = seg.content
      break
    case "transition":
      row.shot = seg.content
      break
  }
}
