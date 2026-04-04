"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Cpu } from "lucide-react"
import { nodeBase, nodeHover, nodeSelected, handleStyle } from "./shared"

export type PromptBuilderData = {
  label: string
  prompt: string
  isProcessing: boolean
}

export const PromptBuilderNode = memo(({ data, selected }: NodeProps) => {
  const d = data as PromptBuilderData
  return (
    <div className={`${nodeBase} ${selected ? nodeSelected : nodeHover} w-64 p-4`}>
      <Handle type="target" position={Position.Left} id="text-in" style={{ ...handleStyle("text"), top: "25%" }} />
      <Handle type="target" position={Position.Left} id="bible-in" style={{ ...handleStyle("bible"), top: "50%" }} />
      <Handle type="target" position={Position.Left} id="style-in" style={{ ...handleStyle("style"), top: "75%" }} />
      <div className="mb-3 flex items-center gap-1.5">
        <Cpu size={12} className="text-white/30" />
        <span className="text-[11px] text-white/50">{d.label || "Prompt Builder"}</span>
        {d.isProcessing && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />}
      </div>
      {d.prompt ? (
        <div className="text-[11px] text-white/45 leading-relaxed line-clamp-8 font-mono">{d.prompt}</div>
      ) : (
        <div className="text-[11px] text-white/20 italic">Connect inputs to build prompt</div>
      )}
      <div className="mt-3 text-[10px] text-purple-400/40 cursor-pointer hover:text-purple-400/60">+ Add variable</div>
      <Handle type="source" position={Position.Right} id="text-out" style={handleStyle("text")} />
    </div>
  )
})
PromptBuilderNode.displayName = "PromptBuilderNode"
