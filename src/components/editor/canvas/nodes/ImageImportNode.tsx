"use client"

import { memo, useCallback } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Upload, ImageIcon } from "lucide-react"
import { nodeBase, handleStyle } from "./shared"

export type ImageImportData = {
  label: string
  imageUrl: string | null
  fileName: string | null
}

export const ImageImportNode = memo(({ data, id, selected }: NodeProps) => {
  const d = data as ImageImportData

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file)
      window.dispatchEvent(new CustomEvent("canvas-node-update", {
        detail: { nodeId: id, patch: { imageUrl: url, fileName: file.name } },
      }))
    }
  }, [id])

  return (
    <div
      className={`${nodeBase} border-emerald-500/40 bg-[#0D1117] w-52 p-3 ${selected ? "ring-2 ring-emerald-500/50 shadow-[0_8px_32px_rgba(16,185,129,0.2)]" : "hover:shadow-[0_12px_28px_rgba(0,0,0,0.45)]"}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <ImageIcon size={11} className="text-emerald-400/70" />
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-emerald-400/70">{d.label || "Image Import"}</span>
      </div>
      {d.imageUrl ? (
        <div className="aspect-[16/10] rounded-xl overflow-hidden border border-white/6 bg-black/40">
          <img src={d.imageUrl} alt={d.fileName || ""} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="flex aspect-[16/10] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] gap-1.5">
          <Upload size={16} className="text-white/15" />
          <span className="text-[9px] text-white/20">Drop image here</span>
        </div>
      )}
      {d.fileName && <div className="mt-1.5 text-[8px] text-white/25 truncate">{d.fileName}</div>}
      <Handle type="source" position={Position.Right} id="image-out" style={handleStyle("image")} />
    </div>
  )
})
ImageImportNode.displayName = "ImageImportNode"
