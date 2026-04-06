"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Download } from "lucide-react"
import { nodeBase, nodeHover, nodeSelected, handleStyle } from "./shared"

export type OutputData = {
  label: string
  thumbnailUrl: string | null
  prompt: string
  duration: number
}

export const OutputNode = memo(({ data, selected }: NodeProps) => {
  const d = data as OutputData
  return (
    <div className={`${nodeBase} ${selected ? nodeSelected : nodeHover} w-64 overflow-hidden`}>
      <Handle type="target" position={Position.Left} id="image-in" style={{ ...handleStyle("image"), top: "20%" }} />
      <Handle type="target" position={Position.Left} id="video-in" style={{ ...handleStyle("video"), top: "40%" }} />
      <Handle type="target" position={Position.Left} id="text-in" style={{ ...handleStyle("text"), top: "60%" }} />
      <Handle type="target" position={Position.Left} id="number-in" style={{ ...handleStyle("number"), top: "80%" }} />

      {/* Header */}
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-2">
        <Download size={12} className="text-white/30" />
        <span className="text-[11px] text-white/50">{d.label || "Shot Output"}</span>
        {d.duration > 0 && <span className="ml-auto text-[9px] text-white/20">{(d.duration / 1000).toFixed(1)}s</span>}
      </div>

      {/* Preview */}
      {d.thumbnailUrl ? (
        <div className="mx-3 mb-2 aspect-[16/10] rounded-lg overflow-hidden bg-black/30">
          <img src={d.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}

      {/* Prompt preview */}
      {d.prompt && (
        <div className="mx-4 mb-3 text-[10px] text-white/30 font-mono line-clamp-3">{d.prompt}</div>
      )}

      {!d.thumbnailUrl && !d.prompt && (
        <div className="px-4 pb-3 text-[11px] text-white/15 italic">Connect inputs</div>
      )}
    </div>
  )
})
OutputNode.displayName = "OutputNode"
