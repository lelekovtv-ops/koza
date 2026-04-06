"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { FileText } from "lucide-react"
import { nodeBase, nodeHover, nodeSelected, handleStyle } from "./shared"

export type BlockTextData = {
  label: string
  text: string
  blockType: string
}

export const BlockTextNode = memo(({ data, selected }: NodeProps) => {
  const d = data as BlockTextData
  return (
    <div className={`${nodeBase} ${selected ? nodeSelected : nodeHover} w-60 p-4`}>
      <div className="mb-3 flex items-center gap-1.5">
        <FileText size={12} className="text-white/30" />
        <span className="text-[11px] text-white/50">{d.label || "Block Text"}</span>
        <span className="ml-auto rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-white/25">{d.blockType}</span>
      </div>
      <div className="text-[12px] text-white/70 leading-relaxed">{d.text || "Empty block"}</div>
      <Handle type="source" position={Position.Right} id="text-out" style={handleStyle("text")} />
    </div>
  )
})
BlockTextNode.displayName = "BlockTextNode"
