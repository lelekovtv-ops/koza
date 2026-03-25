"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Palette } from "lucide-react"

export interface PipelineStyleNodeData {
  stylePrompt: string
  [key: string]: unknown
}

const handleStyle = {
  width: 10,
  height: 10,
  borderRadius: 999,
  borderWidth: 1.5,
  background: "#1A1816",
  borderColor: "rgba(139,92,246,0.5)",
}

function PipelineStyleNode({ data }: NodeProps) {
  const { stylePrompt } = data as PipelineStyleNodeData
  const preview = stylePrompt.trim() || "Style prompt not set"

  return (
    <div className="flex h-24 w-55 flex-col rounded-xl border border-[#8b5cf6]/25 bg-[#1A1816]/95 shadow-[0_14px_28px_rgba(0,0,0,0.2)] backdrop-blur-lg">
      <div className="flex items-center gap-2 border-b border-[#8b5cf6]/15 px-3 py-2">
        <Palette className="h-3.5 w-3.5 text-[#8b5cf6]" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#E5E0DB]">
          Style Feed
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-center px-3 py-2">
        <p className="line-clamp-2 text-[11px] leading-tight text-[#E5E0DB]">
          {preview}
        </p>
        <p className="mt-1 text-[10px] leading-tight text-white/40">
          Глобальный стиль влияет на финальную формулировку визуальных промптов.
        </p>
      </div>

      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  )
}

export default memo(PipelineStyleNode)