"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { BookOpen } from "lucide-react"
import { nodeBase, nodeHover, nodeSelected, handleStyle } from "./shared"

export type BibleRefData = {
  label: string
  characters: string[]
  locations: string[]
  props: string[]
}

export const BibleRefNode = memo(({ data, selected }: NodeProps) => {
  const d = data as BibleRefData
  return (
    <div className={`${nodeBase} ${selected ? nodeSelected : nodeHover} w-52 p-4`}>
      <div className="mb-3 flex items-center gap-1.5">
        <BookOpen size={12} className="text-white/30" />
        <span className="text-[11px] text-white/50">{d.label || "Bible"}</span>
      </div>
      <div className="space-y-1">
        {d.characters.map((c, i) => (
          <div key={`c${i}`} className="text-[11px] text-white/50">{"👤"} {c}</div>
        ))}
        {d.locations.map((l, i) => (
          <div key={`l${i}`} className="text-[11px] text-white/50">{"📍"} {l}</div>
        ))}
        {d.props.map((p, i) => (
          <div key={`p${i}`} className="text-[11px] text-white/50">{"📦"} {p}</div>
        ))}
        {d.characters.length + d.locations.length + d.props.length === 0 && (
          <div className="text-[11px] text-white/20 italic">No Bible data</div>
        )}
      </div>
      <Handle type="source" position={Position.Right} id="text-out" style={{ ...handleStyle("text"), top: "35%" }} />
      <Handle type="source" position={Position.Right} id="bible-out" style={{ ...handleStyle("bible"), top: "65%" }} />
    </div>
  )
})
BibleRefNode.displayName = "BibleRefNode"
