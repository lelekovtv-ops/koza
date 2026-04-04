"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Palette } from "lucide-react"
import { nodeBase, nodeHover, nodeSelected, handleStyle } from "./shared"

export type StyleData = {
  label: string
  styleName: string
  stylePrompt: string
  enabled: boolean
}

export const StyleInputNode = memo(({ data, selected }: NodeProps) => {
  const d = data as StyleData
  return (
    <div className={`${nodeBase} ${selected ? nodeSelected : nodeHover} w-52 p-4 ${!d.enabled ? "opacity-50" : ""}`}>
      <div className="mb-3 flex items-center gap-1.5">
        <Palette size={12} className="text-white/30" />
        <span className="text-[11px] text-white/50">{d.label || "Style"}</span>
        {!d.enabled && <span className="ml-auto text-[9px] text-red-400/50">off</span>}
      </div>
      <div className="text-[12px] text-white/60 font-medium">{d.styleName || "No style"}</div>
      <div className="mt-1 text-[10px] text-white/25 line-clamp-2">{d.stylePrompt}</div>
      <Handle type="source" position={Position.Right} id="style-out" style={{ ...handleStyle("style"), top: "35%" }} />
      <Handle type="source" position={Position.Right} id="text-out" style={{ ...handleStyle("text"), top: "65%" }} />
    </div>
  )
})
StyleInputNode.displayName = "StyleInputNode"
