"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { FileText } from "lucide-react"
import type { PipelineStageStatus } from "@/types/pipeline"

export interface PipelineSceneNodeData {
  sceneText: string
  status: PipelineStageStatus
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

function PipelineSceneNode({ data }: NodeProps) {
  const { sceneText, status, onSelect } = data as PipelineSceneNodeData
  const preview = sceneText ? sceneText.slice(0, 60) + (sceneText.length > 60 ? "…" : "") : "Нет текста сцены"

  return (
    <div
      className="flex h-[120px] w-[220px] cursor-pointer flex-col rounded-xl border border-white/8 bg-[#1A1816]/95 shadow-[0_14px_28px_rgba(0,0,0,0.2)] transition-colors hover:border-white/15"
      onClick={onSelect}
    >
      <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2">
        <StatusDot status={status} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#E5E0DB]">
          Вход Сцены
        </span>
        <FileText className="ml-auto h-3.5 w-3.5 text-white/30" />
      </div>
      <div className="flex flex-1 items-start px-3 py-2">
        <p className="line-clamp-3 text-[11px] leading-relaxed text-white/50">
          {preview}
        </p>
      </div>
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  )
}

export function StatusDot({ status }: { status: PipelineStageStatus }) {
  const colors: Record<PipelineStageStatus, string> = {
    idle: "bg-white/20",
    running: "bg-amber-400 animate-pulse",
    done: "bg-emerald-400",
    error: "bg-red-400",
  }
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status]}`} />
}

export default memo(PipelineSceneNode)
