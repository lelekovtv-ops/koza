"use client"

/**
 * TextBlockNode — свободный текстовый блок на canvas.
 * Двойной клик = редактирование. Поддержка markdown-like стилей.
 */

import { memo, useState, useRef, useCallback, useEffect } from "react"
import { type NodeProps, Handle, Position } from "@xyflow/react"
import { Trash2 } from "lucide-react"

interface TextBlockData {
  text?: string
  fontSize?: number
  onUpdate?: (id: string, data: { text?: string }) => void
  onDelete?: (id: string) => void
  [key: string]: unknown
}

function TextBlockNodeComponent({ id, data, selected }: NodeProps) {
  const { text = "", fontSize = 16, onUpdate, onDelete } = data as unknown as TextBlockData
  const [editing, setEditing] = useState(!text)
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing && textRef.current) {
      textRef.current.focus()
    }
  }, [editing])

  const handleDoubleClick = useCallback(() => {
    setEditing(true)
  }, [])

  const handleBlur = useCallback(() => {
    setEditing(false)
    const val = textRef.current?.value ?? ""
    onUpdate?.(id, { text: val })
  }, [id, onUpdate])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setEditing(false)
      const val = textRef.current?.value ?? ""
      onUpdate?.(id, { text: val })
    }
    e.stopPropagation()
  }, [id, onUpdate])

  return (
    <div
      className="relative group"
      style={{ minWidth: 120, maxWidth: 400 }}
      onDoubleClick={handleDoubleClick}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-transparent !border-0" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-transparent !border-0" />
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-transparent !border-0" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-transparent !border-0" />

      <div
        className="px-2 py-1 rounded-md transition-all duration-150"
        style={{
          background: selected ? "rgba(45, 42, 38, 0.05)" : "transparent",
          outline: selected ? "1.5px solid rgba(212, 168, 83, 0.4)" : "none",
          outlineOffset: 4,
        }}
      >
        {editing ? (
          <textarea
            ref={textRef}
            defaultValue={text}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-full min-h-[40px] bg-transparent border-none outline-none resize-none leading-relaxed"
            style={{
              fontSize,
              color: "#2D2A26",
              fontFamily: "system-ui, sans-serif",
              minWidth: 200,
            }}
            placeholder="Введи текст..."
            rows={3}
          />
        ) : (
          <div
            className="whitespace-pre-wrap break-words leading-relaxed"
            style={{
              fontSize,
              color: "#2D2A26",
              minHeight: 24,
            }}
          >
            {text || <span style={{ opacity: 0.3 }}>Двойной клик</span>}
          </div>
        )}
      </div>

      {/* Delete button */}
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

export default memo(TextBlockNodeComponent)
