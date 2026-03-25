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
  generatedCount?: number
  generatingShotId?: string | null
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
  const { modelId, status, shotCount, generatedCount = 0, generatingShotId, dropHighlight, onSelect } = data as PipelineOutputNodeData

  const highlightClass =
    dropHighlight === "valid"
      ? "ring-2 ring-[#D4A853]/60 border-[#D4A853]/40"
      : dropHighlight === "invalid"
        ? "ring-2 ring-red-500/60 border-red-500/40"
        : dropHighlight === "pulse"
          ? "ring-2 ring-emerald-400/60 border-emerald-400/40 animate-pulse"
          : ""

  const progressLabel = shotCount === 0
    ? "ожидает промпты"
    : generatingShotId
      ? `generating ${Math.min(generatedCount + 1, shotCount)}/${shotCount}`
      : generatedCount >= shotCount && shotCount > 0
        ? `done ${generatedCount}/${shotCount}`
        : `${shotCount} prompts ready`

  return (
    <div
      className={`flex h-30 w-55 cursor-pointer flex-col rounded-xl border border-white/8 bg-[#1A1816]/95 shadow-[0_14px_28px_rgba(0,0,0,0.2)] transition-all hover:border-white/15 ${highlightClass}`}
      onClick={onSelect}
    >
      {/* Accent bar */}
      <div className="h-0.75 w-full rounded-t-xl bg-emerald-500" />

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
        Генерирует изображения из готовых pipeline prompts
      </p>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-white/5 px-3 py-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-white/30">Статус</span>
          <span className="text-[9px] text-emerald-300/70">{progressLabel}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-white/30">Модель</span>
          <span className="text-[9px] text-white/55">{modelId}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-white/30">Кадры</span>
          <span className="text-[9px] text-white/55">{shotCount > 0 ? `${generatedCount}/${shotCount}` : "—"}</span>
        </div>
      </div>

      <Handle type="target" position={Position.Left} style={handleStyle} />
    </div>
  )
}

export default memo(PipelineOutputNode)
