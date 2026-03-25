"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { BookOpen } from "lucide-react"

export interface PipelineBibleNodeData {
  characterCount: number
  locationCount: number
  onOpen?: () => void
  [key: string]: unknown
}

const handleStyle = {
  width: 10,
  height: 10,
  borderRadius: 999,
  borderWidth: 1.5,
  background: "#1A1816",
  borderColor: "rgba(212,168,83,0.5)",
}

function PipelineBibleNode({ data }: NodeProps) {
  const { characterCount, locationCount, onOpen } = data as PipelineBibleNodeData

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-[96px] w-[220px] cursor-pointer flex-col rounded-xl border border-[#D4A853]/25 bg-[#1A1816]/95 text-left shadow-[0_14px_28px_rgba(0,0,0,0.2)] backdrop-blur-lg transition-colors hover:border-[#D4A853]/40 hover:bg-[#211d17]/95"
    >
      <div className="flex items-center gap-2 border-b border-[#D4A853]/15 px-3 py-2">
        <BookOpen className="h-3.5 w-3.5 text-[#D4A853]" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#E5E0DB]">
          Bible Feed
        </span>
        <span className="ml-auto rounded-full border border-[#D4A853]/25 bg-[#D4A853]/10 px-2 py-0.5 text-[8px] uppercase tracking-[0.14em] text-[#D4A853]">
          Edit
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-center px-3 py-2">
        <p className="text-[12px] font-medium text-[#E5E0DB]">
          Bible: {characterCount} chars, {locationCount} locs
        </p>
        <p className="mt-1 text-[10px] leading-tight text-white/40">
          Канон персонажей и локаций подмешивается в анализ и сборку промптов. Нажмите, чтобы открыть редактор.
        </p>
      </div>

      <Handle type="source" position={Position.Right} style={handleStyle} />
    </button>
  )
}

export default memo(PipelineBibleNode)