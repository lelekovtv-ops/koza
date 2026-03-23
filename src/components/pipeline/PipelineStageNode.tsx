"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import type { PipelineStageId, PipelineStageStatus } from "@/types/pipeline"
import { StatusDot } from "./PipelineSceneNode"

export interface PipelineStageNodeData {
  stageId: PipelineStageId
  label: string
  description: string
  modelId: string
  accentColor: string
  status: PipelineStageStatus
  settings: Array<{ key: string; value: string }>
  dropHighlight?: "valid" | "invalid" | "pulse" | null
  onSelect?: () => void
  [key: string]: unknown
}

const MODEL_BADGES: Record<string, { label: string; color: string }> = {
  "claude-sonnet-4-20250514": { label: "Claude", color: "#d97706" },
  "gpt-4o": { label: "GPT-4o", color: "#10b981" },
  "gpt-4o-mini": { label: "GPT-mini", color: "#10b981" },
  "gemini-1.5-pro": { label: "Gemini", color: "#3b82f6" },
  "gemini-2.5-flash": { label: "Gemini", color: "#3b82f6" },
  local: { label: "Local", color: "#8b8b8b" },
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
    modelId,
    accentColor,
    status,
    settings,
    dropHighlight,
    onSelect,
  } = data as PipelineStageNodeData

  const badge = MODEL_BADGES[modelId] ?? { label: modelId.slice(0, 8), color: "#888" }

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
      className={`flex h-[120px] w-[220px] cursor-pointer flex-col rounded-xl border border-white/8 bg-[#1A1816]/95 shadow-[0_14px_28px_rgba(0,0,0,0.2)] transition-all hover:border-white/15 ${highlightClass}`}
      onClick={onSelect}
    >
      {/* Accent bar */}
      <div
        className="h-[3px] w-full rounded-t-xl"
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

      {/* Settings preview */}
      <div className="mt-auto flex flex-col gap-0.5 border-t border-white/5 px-3 py-1.5">
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

export default memo(PipelineStageNode)
