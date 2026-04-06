"use client"

/**
 * ImageCardNode — карточка изображения на canvas.
 * Drag & drop или URL. Подпись снизу.
 */

import { memo, useState, useCallback } from "react"
import { type NodeProps, Handle, Position } from "@xyflow/react"
import { Trash2, ImagePlus } from "lucide-react"

interface ImageCardData {
  src?: string
  caption?: string
  onUpdate?: (id: string, data: { src?: string; caption?: string }) => void
  onDelete?: (id: string) => void
  [key: string]: unknown
}

function ImageCardNodeComponent({ id, data, selected }: NodeProps) {
  const { src = "", caption = "", onUpdate, onDelete } = data as unknown as ImageCardData
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith("image/")) {
      const url = URL.createObjectURL(file)
      onUpdate?.(id, { src: url })
    }
    const text = e.dataTransfer.getData("text/plain")
    if (text?.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)/i)) {
      onUpdate?.(id, { src: text })
    }
  }, [id, onUpdate])

  const handleCaptionChange = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    onUpdate?.(id, { caption: e.currentTarget.textContent ?? "" })
  }, [id, onUpdate])

  return (
    <div className="relative group" style={{ width: 220 }}>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-transparent !border-0" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-transparent !border-0" />
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-transparent !border-0" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-transparent !border-0" />

      <div
        className="rounded-lg overflow-hidden transition-shadow duration-200"
        style={{
          background: "#fff",
          border: selected ? "2px solid #D4A853" : "1px solid rgba(0,0,0,0.08)",
          boxShadow: selected ? "0 4px 20px rgba(0,0,0,0.12)" : "0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        {/* Image area */}
        {src ? (
          <img
            src={src}
            alt={caption}
            className="w-full h-auto object-cover"
            style={{ maxHeight: 300, minHeight: 120 }}
            draggable={false}
          />
        ) : (
          <div
            className="flex flex-col items-center justify-center gap-2 transition-colors"
            style={{
              height: 140,
              background: dragOver ? "rgba(212,168,83,0.1)" : "rgba(0,0,0,0.02)",
              border: dragOver ? "2px dashed #D4A853" : "2px dashed rgba(0,0,0,0.08)",
              borderRadius: 4,
              margin: 8,
            }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <ImagePlus size={24} style={{ color: "rgba(0,0,0,0.2)" }} />
            <span style={{ fontSize: 11, color: "rgba(0,0,0,0.25)" }}>
              Drop image here
            </span>
          </div>
        )}

        {/* Caption */}
        <div
          contentEditable
          suppressContentEditableWarning
          onBlur={handleCaptionChange}
          onKeyDown={(e) => e.stopPropagation()}
          className="px-3 py-2 text-xs text-[#5D5040] outline-none border-t border-black/5"
          style={{ minHeight: 28, fontFamily: "system-ui" }}
        >
          {caption || ""}
        </div>
      </div>

      {/* Delete */}
      <div className="absolute -top-8 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete?.(id) }}
          className="flex items-center justify-center w-7 h-7 rounded-md bg-black/60 hover:bg-red-600/80 text-white/60 hover:text-white transition-colors"
          title="Удалить"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

export default memo(ImageCardNodeComponent)
