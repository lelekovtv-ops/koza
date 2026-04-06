"use client"

/**
 * BoardToolbar — вертикальная панель инструментов слева (как в Miro).
 * Инструменты: курсор, стикер, текст, картинка, коннектор.
 */

import { memo } from "react"
import {
  MousePointer2,
  StickyNote,
  Type,
  Image,
  Minus,
  Hand,
} from "lucide-react"

export type BoardTool = "select" | "pan" | "sticky" | "text" | "image" | "connector"

const TOOLS: { id: BoardTool; icon: React.ComponentType<{ size?: number }>; label: string; shortcut?: string }[] = [
  { id: "select", icon: MousePointer2, label: "Выбор", shortcut: "V" },
  { id: "pan", icon: Hand, label: "Перемещение", shortcut: "H" },
  { id: "sticky", icon: StickyNote, label: "Стикер", shortcut: "S" },
  { id: "text", icon: Type, label: "Текст", shortcut: "T" },
  { id: "image", icon: Image, label: "Изображение" },
  { id: "connector", icon: Minus, label: "Линия" },
]

interface BoardToolbarProps {
  activeTool: BoardTool
  onToolChange: (tool: BoardTool) => void
}

function BoardToolbarComponent({ activeTool, onToolChange }: BoardToolbarProps) {
  return (
    <div
      className="absolute left-3 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-1 p-1.5 rounded-xl"
      style={{
        background: "rgba(30, 28, 24, 0.85)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
      }}
    >
      {TOOLS.map((tool) => {
        const Icon = tool.icon
        const isActive = activeTool === tool.id
        return (
          <button
            key={tool.id}
            onClick={() => onToolChange(tool.id)}
            className="relative flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-150 group"
            style={{
              background: isActive ? "rgba(212, 168, 83, 0.2)" : "transparent",
              color: isActive ? "#D4A853" : "rgba(255,255,255,0.4)",
            }}
            title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ""}`}
          >
            <Icon size={18} />

            {/* Tooltip */}
            <div className="absolute left-full ml-2 px-2 py-1 rounded-md bg-black/80 text-white text-[10px] tracking-wide whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {tool.label}
              {tool.shortcut && (
                <span className="ml-1.5 text-white/40">{tool.shortcut}</span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default memo(BoardToolbarComponent)
