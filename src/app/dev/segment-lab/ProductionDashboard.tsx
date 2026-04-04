/**
 * ProductionDashboard.tsx
 * PIECE — UI панель управления production plan
 *
 * Встраивается в page.tsx как четвёртый таб рядом с Timeline / Storyboard.
 *
 * <ProductionDashboard segments={segments} sections={sections} bible={bible} />
 */

"use client"

import { useMemo } from "react"
import { useProductionPlan, JOB_META, STATUS_META } from "@/lib/useProductionPlan"
import type { Segment, Section } from "@/lib/segmentEngine"
import type { ProjectBible, ProductionJob, JobType } from "@/lib/productionPlan"

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  segments: Segment[]
  sections: Section[]
  bible?: ProjectBible
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-[#F0EDE7] rounded-lg px-3 py-2 min-w-[72px]">
      <span className="text-[9px] uppercase tracking-[0.1em] text-[#999] font-semibold">{label}</span>
      <span className="text-[18px] font-semibold tabular-nums leading-tight" style={{ color: color ?? "#1A1A1A" }}>
        {value}
      </span>
    </div>
  )
}

function ProgressBar({ value, color = "#D4A853" }: { value: number; color?: string }) {
  return (
    <div className="w-full h-[4px] bg-[#E8E5DF] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, value * 100).toFixed(1)}%`, background: color }}
      />
    </div>
  )
}

function JobRow({ job }: { job: ProductionJob }) {
  const meta = JOB_META[job.type]
  const statusMeta = STATUS_META[job.status]

  // Extract meaningful label from job params
  const label = useMemo(() => {
    if (job.type === "tts" || job.type === "title-card" || job.type === "sfx") {
      // @ts-ignore
      return (job.params.text ?? job.params.event ?? job.params.prompt ?? "").slice(0, 60)
    }
    if (job.type === "video-gen" || job.type === "image-gen" || job.type === "music-gen") {
      // @ts-ignore
      return (job.params.prompt ?? "").slice(0, 60)
    }
    if (job.type === "lipsync") return `Lip sync ← tts + video`
    if (job.type === "assemble") return "Final assembly"
    return (job as ProductionJob).id
  }, [job])

  const subLabel = useMemo(() => {
    if (job.type === "video-gen") {
      // @ts-ignore
      return `${job.params.api} · ${job.params.cameraPreset ?? ""}`
    }
    if (job.type === "image-gen") {
      // @ts-ignore
      return `${job.params.api} · ${job.params.width}×${job.params.height}`
    }
    if (job.type === "tts") {
      // @ts-ignore
      return `${job.params.model} · voice: ${job.params.voiceId.slice(0, 8)}…`
    }
    if (job.type === "lipsync") {
      // @ts-ignore
      return `${job.params.model}`
    }
    if (job.type === "music-gen") {
      // @ts-ignore
      return `${job.params.api} · ${job.params.durationSec}s`
    }
    return `${(job.durationMs / 1000).toFixed(1)}s`
  }, [job])

  return (
    <div className={`flex items-center gap-3 px-3 py-2 border-b border-black/5 hover:bg-black/[0.02] transition-colors ${
      job.status === "running" ? "bg-[#D4A853]/5" : ""
    }`}>
      {/* Type badge */}
      <div
        className="shrink-0 w-[56px] flex items-center justify-center rounded-[4px] py-[2px] text-[8px] font-bold uppercase tracking-wider"
        style={{ background: meta.color + "18", color: meta.color }}
      >
        {meta.label}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-[#333] font-medium truncate">{label}</div>
        <div className="text-[9px] text-[#999] truncate mt-0.5">{subLabel}</div>
      </div>

      {/* Duration */}
      <div className="text-[9px] font-mono text-[#BBB] shrink-0">
        {(job.durationMs / 1000).toFixed(1)}s
      </div>

      {/* Status */}
      <div
        className="shrink-0 text-[8px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-[3px]"
        style={{ background: statusMeta.color + "18", color: statusMeta.color }}
      >
        {job.status === "running" ? "●" : ""} {statusMeta.label}
      </div>

      {/* Output preview */}
      {job.outputUrl && (
        <a
          href={job.outputUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-[9px] text-[#3B82F6] hover:underline"
        >
          ↗
        </a>
      )}
    </div>
  )
}

function TypeGroup({ type, jobs }: { type: JobType; jobs: ProductionJob[] }) {
  const meta = JOB_META[type]
  const done = jobs.filter((j) => j.status === "done").length
  const err = jobs.filter((j) => j.status === "error").length
  const running = jobs.filter((j) => j.status === "running").length

  return (
    <div className="mb-1">
      {/* Group header */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 sticky top-0 z-10"
        style={{ background: "#F0EDE7", borderBottom: `1px solid ${meta.color}25` }}
      >
        <div
          className="w-[6px] h-[6px] rounded-full flex-shrink-0"
          style={{ background: meta.color }}
        />
        <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: meta.color }}>
          {meta.label}
        </span>
        <span className="text-[9px] text-[#BBB]">{jobs.length} jobs</span>
        {running > 0 && (
          <span className="text-[9px] text-[#D4A853] animate-pulse ml-auto">{running} running</span>
        )}
        {err > 0 && (
          <span className="text-[9px] text-[#E05C5C] ml-auto">{err} errors</span>
        )}
        <span className="text-[9px] text-[#999] ml-auto">{done}/{jobs.length}</span>
      </div>

      {/* Job rows */}
      {jobs.map((job) => <JobRow key={job.id} job={job} />)}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ProductionDashboard({ segments, sections, bible }: Props) {
  const {
    plan,
    generate,
    runReadyJobs,
    runAll,
    isGenerating,
    stats,
  } = useProductionPlan(segments, sections, bible)

  // Group jobs by type for display
  const groupedJobs = useMemo(() => {
    if (!plan) return []
    const typeOrder: JobType[] = [
      "tts", "video-gen", "lipsync", "image-gen",
      "music-gen", "sfx", "title-card", "assemble",
    ]
    return typeOrder
      .map((type) => ({
        type,
        jobs: plan.jobs.filter((j) => j.type === type),
      }))
      .filter((g) => g.jobs.length > 0)
  }, [plan])

  if (!plan) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-[#F0EDE7]">
        <div className="text-center">
          <p className="text-[13px] text-[#666] mb-1">Нет production plan</p>
          <p className="text-[11px] text-[#999]">Система разберёт сценарий и сконфигурирует все задачи</p>
        </div>
        <button
          onClick={generate}
          className="flex items-center gap-2 bg-[#1A1A1A] text-white text-[12px] font-semibold px-4 py-2 rounded-lg hover:bg-[#333] transition-colors"
        >
          <span>⚙</span>
          Сгенерировать план
        </button>
        <p className="text-[10px] text-[#CCC]">{segments.length} сегментов · {sections.length} секций</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#F0EDE7]">
      {/* Header bar */}
      <div className="shrink-0 flex items-center gap-3 px-3 py-2 border-b border-black/10 bg-[#E8E5DF]">
        {/* Stats */}
        <StatCard label="Jobs" value={stats?.total ?? 0} />
        <StatCard label="Done" value={stats?.done ?? 0} color="#10B981" />
        {(stats?.errors ?? 0) > 0 && (
          <StatCard label="Errors" value={stats?.errors ?? 0} color="#E05C5C" />
        )}
        <StatCard label="ETA" value={`~${stats?.estimatedMin ?? 0}м`} color="#D4A853" />

        {/* Progress */}
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-[#999] uppercase tracking-wider">Progress</span>
            <span className="text-[9px] font-mono text-[#666]">
              {((stats?.progress ?? 0) * 100).toFixed(0)}%
            </span>
          </div>
          <ProgressBar value={stats?.progress ?? 0} />
        </div>

        {/* Actions */}
        <div className="flex gap-2 shrink-0">
          <button
            onClick={generate}
            className="text-[10px] px-2 py-1 rounded bg-[#1A1A1A]/10 text-[#555] hover:bg-[#1A1A1A]/20 transition-colors font-semibold"
          >
            ↻ Rebuild
          </button>
          <button
            onClick={runReadyJobs}
            disabled={isGenerating || (stats?.ready ?? 0) === 0}
            className="text-[10px] px-3 py-1.5 rounded-lg bg-[#D4A853] text-white font-semibold hover:bg-[#c49540] disabled:opacity-40 transition-colors"
          >
            {isGenerating ? "Running…" : `▶ Run ready (${stats?.ready ?? 0})`}
          </button>
          <button
            onClick={runAll}
            disabled={isGenerating}
            className="text-[10px] px-3 py-1.5 rounded-lg bg-[#1A1A1A] text-white font-semibold hover:bg-[#333] disabled:opacity-40 transition-colors"
          >
            ⚡ Run all
          </button>
        </div>
      </div>

      {/* Critical path indicator */}
      {plan.criticalPath.length > 0 && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-[#D4A853]/8 border-b border-[#D4A853]/20">
          <span className="text-[9px] font-bold text-[#D4A853] uppercase tracking-wider">Critical path</span>
          <div className="flex items-center gap-1 overflow-hidden">
            {plan.criticalPath.slice(0, 6).map((id, i) => {
              const job = plan.jobs.find((j) => j.id === id)
              if (!job) return null
              const meta = JOB_META[job.type]
              return (
                <span key={id} className="flex items-center gap-1">
                  {i > 0 && <span className="text-[#CCC] text-[9px]">→</span>}
                  <span
                    className="text-[8px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: meta.color + "20", color: meta.color }}
                  >
                    {meta.label}
                  </span>
                </span>
              )
            })}
            {plan.criticalPath.length > 6 && (
              <span className="text-[9px] text-[#BBB]">+{plan.criticalPath.length - 6}</span>
            )}
          </div>
        </div>
      )}

      {/* Job list */}
      <div className="flex-1 overflow-y-auto">
        {groupedJobs.map(({ type, jobs }) => (
          <TypeGroup key={type} type={type} jobs={jobs} />
        ))}
      </div>
    </div>
  )
}
