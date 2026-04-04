"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Play, Film } from "lucide-react"
import { nodeBase, handleStyle } from "./shared"

export type VideoGenData = {
  label: string
  model: string
  videoUrl: string | null
  isGenerating: boolean
  onRun?: () => void
}

export const VideoGenNode = memo(({ data, selected }: NodeProps) => {
  const d = data as VideoGenData
  return (
    <div className={`${nodeBase} border-red-500/40 bg-[#0D1117] w-60 p-3 ${selected ? "ring-2 ring-red-500/50 shadow-[0_8px_32px_rgba(239,68,68,0.2)]" : "hover:shadow-[0_12px_28px_rgba(0,0,0,0.45)]"}`}>
      <Handle type="target" position={Position.Left} id="text-in" style={{ ...handleStyle("text"), top: "30%" }} />
      <Handle type="target" position={Position.Left} id="image-in" style={{ ...handleStyle("image"), top: "60%" }} />
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Film size={11} className="text-red-400/70" />
          <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-red-400/70">{d.label || "Video Gen"}</span>
        </div>
        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[8px] text-white/30">{d.model}</span>
      </div>
      <div className="aspect-[16/10] rounded-xl overflow-hidden border border-white/6 bg-black/40">
        {d.isGenerating ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-red-500/30 border-t-red-500" />
          </div>
        ) : d.videoUrl ? (
          <video src={d.videoUrl} className="h-full w-full object-cover" muted loop />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1">
            <Film size={18} className="text-white/10" />
            <span className="text-[9px] text-white/15">No video</span>
          </div>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); d.onRun?.() }}
        disabled={d.isGenerating}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-500/20 py-2 text-[11px] font-semibold text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-30 border border-red-500/20"
      >
        <Play size={11} fill="currentColor" /> Run
      </button>
      <Handle type="source" position={Position.Right} id="video-out" style={handleStyle("video")} />
    </div>
  )
})
VideoGenNode.displayName = "VideoGenNode"
