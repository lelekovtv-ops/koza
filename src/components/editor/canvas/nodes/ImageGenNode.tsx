"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Sparkles } from "lucide-react"
import { nodeBase, nodeHover, nodeSelected, handleStyle } from "./shared"

export type ImageGenData = {
  label: string
  model: string
  thumbnailUrl: string | null
  isGenerating: boolean
  onRun?: () => void
}

export const ImageGenNode = memo(({ data, selected }: NodeProps) => {
  const d = data as ImageGenData
  return (
    <div className={`${nodeBase} ${selected ? nodeSelected : nodeHover} w-72 overflow-hidden`}>
      <Handle type="target" position={Position.Left} id="text-in" style={{ ...handleStyle("text"), top: "30%" }} />
      <Handle type="target" position={Position.Left} id="image-in" style={{ ...handleStyle("image"), top: "60%" }} />

      {/* Header */}
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-2">
        <Sparkles size={12} className="text-white/30" />
        <span className="text-[11px] text-white/50">{d.label || "Image Generation"}</span>
      </div>

      {/* Large image preview — Weavy style */}
      <div className="mx-3 mb-2 aspect-square rounded-lg overflow-hidden bg-black/30">
        {d.isGenerating ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-white/50" />
          </div>
        ) : d.thumbnailUrl ? (
          <img src={d.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-white/15">No image</div>
        )}
      </div>

      {/* Footer — Weavy style */}
      <div className="flex items-center justify-between px-4 pb-3">
        <span className="text-[10px] text-white/20">+ Add reference image</span>
        <button
          onClick={(e) => { e.stopPropagation(); d.onRun?.() }}
          disabled={d.isGenerating}
          className="text-[10px] text-white/40 hover:text-white/70 transition-colors disabled:opacity-30 cursor-pointer"
        >
          &gt; Run Model
        </button>
      </div>

      {/* Status bar */}
      <div className="border-t border-white/[0.06] px-4 py-1.5 flex items-center justify-between">
        <span className="text-[9px] text-emerald-400/50">{d.model}</span>
      </div>

      <Handle type="source" position={Position.Right} id="image-out" style={handleStyle("image")} />
    </div>
  )
})
ImageGenNode.displayName = "ImageGenNode"
