"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { ImageIcon } from "lucide-react"
import type { PipelineStageStatus } from "@/types/pipeline"
import { StatusDot } from "./PipelineSceneNode"

export interface PipelineOutputNodeData {
  modelId: string
  status: PipelineStageStatus
  shotCount: number
  dropHighlight?: "valid" | "invalid" | "pulse" | null
  onSelect?: () => void
  [key: string]: unknown
}

const handleStyle = {
  width: 10,
  height: 10,
  borderRadius: 999,
  borderWidth: 1.5,
  background: "#1A1816",
  borderColor: "rgba(255,255,255,0.28)",
}

function PipelineOutputNode({ data }: NodeProps) {
  const { modelId, status, shotCount, dropHighlight, onSelect } = data as PipelineOutputNodeData

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
      <div className="h-[3px] w-full rounded-t-xl bg-emerald-500" />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <StatusDot status={status} />
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#E5E0DB]">
          Генератор Изображений
        </span>
        <ImageIcon className="h-3.5 w-3.5 text-emerald-400/60" />
      </div>

      {/* Info */}
      <p className="px-3 text-[10px] leading-tight text-white/35">
        Generate images from composed prompts
      </p>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-white/5 px-3 py-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-white/30">Модель</span>
          <span className="text-[9px] text-white/55">{modelId}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-white/30">Кадры</span>
          <span className="text-[9px] text-white/55">{shotCount > 0 ? shotCount : "—"}</span>
        </div>
      </div>

      <Handle type="target" position={Position.Left} style={handleStyle} />
    </div>
  )
}

export default memo(PipelineOutputNode)
