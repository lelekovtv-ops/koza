"use client"

/**
 * StickyNoteNode — стикер на canvas.
 * Перетаскиваемый, редактируемый, с выбором цвета.
 * Двойной клик = редактирование текста.
 */

import { memo, useState, useRef, useCallback, useEffect } from "react"
import { type NodeProps, Handle, Position } from "@xyflow/react"
import { Palette, Trash2 } from "lucide-react"

const STICKY_COLORS = [
  { name: "Yellow", bg: "#FFF9C4", border: "#F9E547", text: "#5D4E37" },
  { name: "Pink", bg: "#FCE4EC", border: "#F48FB1", text: "#5D3748" },
  { name: "Blue", bg: "#E3F2FD", border: "#90CAF9", text: "#37505D" },
  { name: "Green", bg: "#E8F5E9", border: "#A5D6A7", text: "#375D3B" },
  { name: "Orange", bg: "#FFF3E0", border: "#FFCC80", text: "#5D4B37" },
  { name: "Purple", bg: "#F3E5F5", border: "#CE93D8", text: "#4A375D" },
]

interface StickyNoteData {
  text?: string
  colorIndex?: number
  onUpdate?: (id: string, data: { text?: string; colorIndex?: number }) => void
  onDelete?: (id: string) => void
  [key: string]: unknown
}

function StickyNoteNodeComponent({ id, data, selected }: NodeProps) {
  const { text = "", colorIndex = 0, onUpdate, onDelete } = data as unknown as StickyNoteData
  const [editing, setEditing] = useState(!text)
  const [showColors, setShowColors] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const color = STICKY_COLORS[colorIndex % STICKY_COLORS.length]

  useEffect(() => {
    if (editing && textRef.current) {
      textRef.current.focus()
      textRef.current.select()
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
    // Stop propagation so canvas doesn't handle keys while typing
    e.stopPropagation()
  }, [id, onUpdate])

  const handleColorChange = useCallback((idx: number) => {
    onUpdate?.(id, { colorIndex: idx })
    setShowColors(false)
  }, [id, onUpdate])

  return (
    <div
      className="relative group"
      style={{ width: 200, minHeight: 140 }}
      onDoubleClick={handleDoubleClick}
    >
      {/* Connectors */}
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-transparent !border-0" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-transparent !border-0" />
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-transparent !border-0" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-transparent !border-0" />

      {/* Sticky body */}
      <div
        className="rounded-md p-3 transition-shadow duration-200"
        style={{
          background: color.bg,
          border: `1.5px solid ${color.border}`,
          boxShadow: selected
            ? `0 4px 20px rgba(0,0,0,0.15), 0 0 0 2px ${color.border}`
            : "0 2px 8px rgba(0,0,0,0.08)",
          minHeight: 140,
        }}
      >
        {/* Fold corner */}
        <div
          className="absolute top-0 right-0 w-5 h-5"
          style={{
            background: `linear-gradient(135deg, transparent 50%, ${color.border}40 50%)`,
            borderRadius: "0 6px 0 0",
          }}
        />

        {editing ? (
          <textarea
            ref={textRef}
            defaultValue={text}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-full h-full min-h-[110px] bg-transparent border-none outline-none resize-none text-sm leading-relaxed"
            style={{ color: color.text, fontFamily: "system-ui, sans-serif" }}
            placeholder="Напиши здесь..."
          />
        ) : (
          <div
            className="text-sm leading-relaxed whitespace-pre-wrap break-words min-h-[110px]"
            style={{ color: color.text }}
          >
            {text || <span style={{ opacity: 0.4 }}>Двойной клик для редактирования</span>}
          </div>
        )}
      </div>

      {/* Toolbar — appears on hover/select */}
      <div
        className="absolute -top-9 left-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        style={{ pointerEvents: selected ? "auto" : undefined }}
      >
        {/* Color picker */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowColors(!showColors) }}
          className="flex items-center justify-center w-7 h-7 rounded-md bg-black/60 hover:bg-black/80 text-white/60 hover:text-white transition-colors"
          title="Цвет"
        >
          <Palette size={13} />
        </button>

        {/* Delete */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete?.(id) }}
          className="flex items-center justify-center w-7 h-7 rounded-md bg-black/60 hover:bg-red-600/80 text-white/60 hover:text-white transition-colors"
          title="Удалить"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Color palette popup */}
      {showColors && (
        <div
          className="absolute -top-16 left-0 flex gap-1 p-1.5 rounded-lg bg-black/80 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          {STICKY_COLORS.map((c, idx) => (
            <button
              key={c.name}
              onClick={() => handleColorChange(idx)}
              className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                background: c.bg,
                borderColor: idx === colorIndex ? c.border : "transparent",
              }}
              title={c.name}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default memo(StickyNoteNodeComponent)
