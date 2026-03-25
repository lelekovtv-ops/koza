"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import type { PipelineStageId, PipelineStageStatus } from "@/types/pipeline"
import { StatusDot } from "./PipelineSceneNode"

export interface PipelineStageNodeData {
  stageId: PipelineStageId
  label: string
  description: string
  explanationPreview: string
  inputSummary: string
  outputSummary: string
  bibleSummary?: string | null
  modelId: string
  accentColor: string
  status: PipelineStageStatus
  settings: Array<{ key: string; value: string }>
  isSelected?: boolean
  dropHighlight?: "valid" | "invalid" | "pulse" | null
  onSelect?: () => void
  [key: string]: unknown
}

const MODEL_BADGES: Record<string, { label: string; fullLabel: string; color: string }> = {
  "claude-sonnet-4-20250514": { label: "Claude", fullLabel: "Claude Sonnet 4", color: "#d97706" },
  "gpt-4o": { label: "GPT-4o", fullLabel: "GPT-4o", color: "#10b981" },
  "gpt-4o-mini": { label: "GPT-mini", fullLabel: "GPT-4o Mini", color: "#10b981" },
  "gemini-1.5-pro": { label: "Gemini", fullLabel: "Gemini 1.5 Pro", color: "#3b82f6" },
  "gemini-2.5-flash": { label: "Gemini", fullLabel: "Gemini 2.5 Flash", color: "#3b82f6" },
  local: { label: "Local", fullLabel: "Local", color: "#8b8b8b" },
}

const handleStyle = {
  width: 10,
  height: 10,
  borderRadius: 999,
  borderWidth: 1.5,
  background: "#1A1816",
  borderColor: "rgba(255,255,255,0.28)",
}

function PipelineStageNode({ data }: NodeProps) {
  const {
    label,
    description,
    explanationPreview,
    inputSummary,
    outputSummary,
    bibleSummary,
    modelId,
    accentColor,
    status,
    settings,
    isSelected,
    dropHighlight,
    onSelect,
  } = data as PipelineStageNodeData

  const badge = MODEL_BADGES[modelId] ?? { label: modelId.slice(0, 8), fullLabel: modelId, color: "#888" }

  const highlightClass =
    dropHighlight === "valid"
      ? "ring-2 ring-[#D4A853]/60 border-[#D4A853]/40"
      : dropHighlight === "invalid"
        ? "ring-2 ring-red-500/60 border-red-500/40"
        : dropHighlight === "pulse"
          ? "ring-2 ring-emerald-400/60 border-emerald-400/40 animate-pulse"
          : ""

  return (
    <div
      className={`flex min-h-30 w-60 cursor-pointer flex-col rounded-xl border border-white/8 bg-[#1A1816]/95 shadow-[0_14px_28px_rgba(0,0,0,0.2)] transition-all hover:border-white/15 ${isSelected ? "border-white/16" : ""} ${highlightClass}`}
      onClick={onSelect}
    >
      {/* Accent bar */}
      <div
        className="h-0.75 w-full rounded-t-xl"
        style={{ background: accentColor }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <StatusDot status={status} />
        <span className="flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-[#E5E0DB]">
          {label}
        </span>
        <span
          className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
          style={{
            background: `${badge.color}20`,
            color: badge.color,
            border: `1px solid ${badge.color}30`,
          }}
        >
          {badge.label}
        </span>
      </div>

      {/* Description */}
      <p className="px-3 text-[10px] leading-tight text-white/35">{description}</p>
      <div className="mt-1 px-3">
        <span className="inline-flex rounded-full border px-2 py-0.5 text-[9px] font-medium"
          style={{
            background: `${badge.color}14`,
            color: badge.color,
            borderColor: `${badge.color}2f`,
          }}
        >
          Модель: {badge.fullLabel}
        </span>
      </div>
      <p className="mt-1 px-3 text-[10px] leading-tight text-white/48">{explanationPreview}</p>

      {status === "done" && isSelected && (
        <div className="mt-2 flex flex-col gap-1.5 border-y border-white/6 bg-black/10 px-3 py-2">
          <StageLine label="ЧТО ДЕЛАЕТ" value={explanationPreview} />
          <StageLine label="ВХОД" value={inputSummary} />
          <StageLine label="ВЫХОД" value={outputSummary} />
          {bibleSummary ? <StageLine label="БИБЛИЯ" value={bibleSummary} tone="gold" /> : null}
        </div>
      )}

      {/* Settings preview */}
      <div className="mt-auto flex flex-col gap-0.5 border-t border-white/5 px-3 py-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-white/30">Модель</span>
          <span className="text-[9px] text-white/55">{badge.fullLabel}</span>
        </div>
        {settings.slice(0, 2).map((s) => (
          <div key={s.key} className="flex items-center justify-between">
            <span className="text-[9px] text-white/30">{s.key}</span>
            <span className="text-[9px] text-white/55">{s.value}</span>
          </div>
        ))}
      </div>

      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  )
}

function StageLine({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string
  tone?: "default" | "gold"
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[8px] uppercase tracking-[0.14em] text-white/26">{label}</span>
      <span className={`text-[10px] leading-tight ${tone === "gold" ? "text-[#D4A853]" : "text-white/60"}`}>
        {value}
      </span>
    </div>
  )
}

export default memo(PipelineStageNode)
