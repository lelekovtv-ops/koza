"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { GitBranch } from "lucide-react"
import { nodeBase, handleStyle } from "./shared"

export type RouterData = {
  label: string
}

export const RouterNode = memo(({ data }: NodeProps) => {
  const d = data as RouterData
  return (
    <div className={`${nodeBase} border-white/15 bg-white/[0.03] w-32 p-3`}>
      <Handle type="target" position={Position.Left} id="any-in" style={handleStyle("any")} />
      <div className="flex items-center gap-1.5 mb-1">
        <GitBranch size={11} className="text-white/30" />
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/40">{d.label || "Router"}</span>
      </div>
      <div className="space-y-1 mt-2">
        {["1", "2", "3"].map((n) => (
          <div key={n} className="flex items-center justify-end">
            <span className="text-[8px] text-white/20 mr-1">Out {n}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={`any-out-${n}`}
              style={{ ...handleStyle("any"), position: "relative", top: 0, right: 0, transform: "none" }}
            />
          </div>
        ))}
      </div>
    </div>
  )
})
RouterNode.displayName = "RouterNode"
