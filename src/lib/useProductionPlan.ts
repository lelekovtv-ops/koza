/**
 * useProductionPlan.ts
 * PIECE — React hook для управления production plan в UI
 *
 * Использование:
 *   const { plan, generate, runJob, progress } = useProductionPlan(segments, sections, bible)
 */

"use client"

import { useState, useCallback, useMemo } from "react"
import {
  buildProductionPlan,
  getReadyJobs,
  getPlanProgress,
  getJobsByType,
  updateJobStatus,
  DEFAULT_BIBLE,
  type ProductionPlan,
  type ProjectBible,
  type JobType,
  type JobStatus,
} from "@/lib/productionPlan"
import type { Segment, Section } from "@/lib/segmentEngine"

// ─── Job type metadata for UI ─────────────────────────────────────────────────

export const JOB_META: Record<JobType, { label: string; color: string; icon: string }> = {
  "tts":        { label: "TTS",        color: "#8B5CF6", icon: "🎙" },
  "lipsync":    { label: "Lip Sync",   color: "#EC4899", icon: "👄" },
  "video-gen":  { label: "Video Gen",  color: "#D4A853", icon: "🎬" },
  "image-gen":  { label: "Image Gen",  color: "#10B981", icon: "🖼" },
  "music-gen":  { label: "Music Gen",  color: "#3B82F6", icon: "🎵" },
  "sfx":        { label: "SFX",        color: "#F59E0B", icon: "🔊" },
  "title-card": { label: "Titles",     color: "#8B8B8B", icon: "T" },
  "assemble":   { label: "Assemble",   color: "#E05C5C", icon: "⚙" },
}

export const STATUS_META: Record<JobStatus, { label: string; color: string }> = {
  pending: { label: "Ожидает",    color: "#999" },
  running: { label: "Генерация", color: "#D4A853" },
  done:    { label: "Готово",    color: "#10B981" },
  error:   { label: "Ошибка",   color: "#E05C5C" },
  skipped: { label: "Пропущен", color: "#8B8B8B" },
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProductionPlan(
  segments: Segment[],
  sections: Section[],
  bible: ProjectBible = DEFAULT_BIBLE
) {
  const [plan, setPlan] = useState<ProductionPlan | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  // Build the plan from current segments
  const generate = useCallback(() => {
    const newPlan = buildProductionPlan(segments, sections, bible)
    setPlan(newPlan)
    return newPlan
  }, [segments, sections, bible])

  // Manually update a job (for when runners report back)
  const setJobStatus = useCallback(
    (jobId: string, status: JobStatus, outputUrl?: string) => {
      setPlan((prev) => (prev ? updateJobStatus(prev, jobId, status, outputUrl) : prev))
    },
    []
  )

  // Simulate running a single job (for UI demo / testing)
  const simulateJob = useCallback(
    async (jobId: string, durationMs = 2000) => {
      setJobStatus(jobId, "running")
      await new Promise((r) => setTimeout(r, durationMs))
      // Randomly succeed or fail (90% success) for demo
      const success = Math.random() > 0.1
      setJobStatus(jobId, success ? "done" : "error")
    },
    [setJobStatus]
  )

  // Run all ready jobs in parallel (demo mode)
  const runReadyJobs = useCallback(async () => {
    if (!plan) return
    const ready = getReadyJobs(plan)
    if (!ready.length) return
    setIsGenerating(true)
    await Promise.all(ready.map((j) => simulateJob(j.id, 1000 + Math.random() * 3000)))
    setIsGenerating(false)
  }, [plan, simulateJob])

  // Run entire plan sequentially (respecting dependencies)
  const runAll = useCallback(async () => {
    if (!plan) return
    setIsGenerating(true)
    let iterations = 0
    while (iterations < 50) {
      const ready = plan ? getReadyJobs(plan) : []
      if (!ready.length) break
      await Promise.all(ready.map((j) => simulateJob(j.id, 500 + Math.random() * 1500)))
      iterations++
    }
    setIsGenerating(false)
  }, [plan, simulateJob])

  // Derived stats
  const stats = useMemo(() => {
    if (!plan) return null
    const byType = getJobsByType(plan)
    const progress = getPlanProgress(plan)
    const ready = getReadyJobs(plan)
    const totalJobs = plan.jobs.length
    const doneJobs = plan.jobs.filter((j) => j.status === "done").length
    const errorJobs = plan.jobs.filter((j) => j.status === "error").length
    const runningJobs = plan.jobs.filter((j) => j.status === "running").length

    return {
      byType,
      progress,
      ready: ready.length,
      total: totalJobs,
      done: doneJobs,
      errors: errorJobs,
      running: runningJobs,
      estimatedMin: Math.ceil(plan.estimatedTimeSec / 60),
      criticalPath: plan.criticalPath,
    }
  }, [plan])

  return {
    plan,
    generate,
    setJobStatus,
    simulateJob,
    runReadyJobs,
    runAll,
    isGenerating,
    stats,
  }
}
