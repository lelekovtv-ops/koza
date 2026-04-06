"use client"

import { memo, useState, useCallback } from "react"
import { type NodeProps } from "@xyflow/react"

export type StickyNoteData = {
  label: string
  text: string
}

export const StickyNoteNode = memo(({ data, id }: NodeProps) => {
  const d = data as StickyNoteData
  const [editing, setEditing] = useState(false)
  const [localText, setLocalText] = useState(d.text || "")

  const handleSave = useCallback(() => {
    setEditing(false)
    const event = new CustomEvent("canvas-node-update", {
      detail: { nodeId: id, patch: { text: localText } },
    })
    window.dispatchEvent(event)
  }, [id, localText])

  return (
    <div
      className="rounded-lg border border-yellow-500/20 bg-yellow-500/[0.08] w-44 p-3 shadow-lg"
      onDoubleClick={() => setEditing(true)}
    >
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.15em] text-yellow-400/50">{d.label || "Note"}</div>
      {editing ? (
        <textarea
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => { if (e.key === "Escape") handleSave() }}
          autoFocus
          className="w-full resize-none rounded border border-yellow-500/20 bg-transparent p-1 text-[11px] text-white/60 outline-none"
          rows={3}
        />
      ) : (
        <div className="text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap min-h-[2em]">
          {d.text || "Double-click to edit..."}
        </div>
      )}
    </div>
  )
})
StickyNoteNode.displayName = "StickyNoteNode"
