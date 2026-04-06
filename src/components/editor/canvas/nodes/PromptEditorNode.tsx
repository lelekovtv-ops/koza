"use client"

import { memo, useState, useCallback } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Pencil } from "lucide-react"
import { nodeBase, handleStyle } from "./shared"

export type PromptEditorData = {
  label: string
  editedPrompt: string
  useEdited: boolean
}

export const PromptEditorNode = memo(({ data, id }: NodeProps) => {
  const d = data as PromptEditorData
  const [editing, setEditing] = useState(false)
  const [localPrompt, setLocalPrompt] = useState(d.editedPrompt || "")

  const handleSave = useCallback(() => {
    setEditing(false)
    const event = new CustomEvent("canvas-node-update", {
      detail: { nodeId: id, patch: { editedPrompt: localPrompt, useEdited: true } },
    })
    window.dispatchEvent(event)
  }, [id, localPrompt])

  return (
    <div className={`${nodeBase} border-blue-500/30 bg-blue-500/[0.06] w-64 p-3`}>
      <Handle type="target" position={Position.Left} id="text-in" style={handleStyle("text")} />
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-blue-400/60">{d.label || "Prompt Editor"}</span>
        <button
          onClick={() => setEditing(!editing)}
          className="flex h-5 w-5 items-center justify-center rounded text-white/30 hover:text-white/60 hover:bg-white/5"
        >
          <Pencil size={10} />
        </button>
      </div>
      {editing ? (
        <div>
          <textarea
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => { if (e.key === "Escape") handleSave() }}
            autoFocus
            className="w-full resize-none rounded-lg border border-white/10 bg-black/30 p-2 text-[10px] text-white/70 font-mono outline-none focus:border-blue-500/40"
            rows={4}
          />
        </div>
      ) : (
        <div className="text-[10px] text-white/50 leading-relaxed line-clamp-6 font-mono">
          {d.editedPrompt || "Click edit to write prompt..."}
        </div>
      )}
      {d.useEdited && <div className="mt-1 text-[8px] text-blue-400/40 uppercase">Edited</div>}
      <Handle type="source" position={Position.Right} id="text-out" style={handleStyle("text")} />
    </div>
  )
})
PromptEditorNode.displayName = "PromptEditorNode"
