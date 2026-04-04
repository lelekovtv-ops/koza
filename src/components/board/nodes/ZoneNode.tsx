"use client"

/**
 * ZoneNode — визуальная граница зоны на canvas.
 * Рисует рамку 16:9, лейбл, иконку.
 * Не перетаскивается — фиксированная позиция.
 */

import { memo } from "react"
import { type NodeProps } from "@xyflow/react"
import { PenTool, LayoutDashboard, Calendar, Music } from "lucide-react"

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  PenTool,
  LayoutDashboard,
  Calendar,
  Music,
}

interface ZoneNodeData {
  label: string
  icon: string
  color: string
  description: string
  width: number
  height: number
  zoneId: number
  [key: string]: unknown
}

function ZoneNodeComponent({ data }: NodeProps) {
  const { label, icon, color, description, width, height, zoneId } = data as unknown as ZoneNodeData
  const Icon = ICON_MAP[icon]

  return (
    <div
      style={{
        width,
        height,
        border: `1.5px dashed ${color}30`,
        borderRadius: 16,
        position: "relative",
        pointerEvents: "none",
        background: `radial-gradient(ellipse at center, ${color}08 0%, ${color}03 60%, transparent 100%)`,
      }}
    >
      {/* Zone label — top left */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 20,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 14px",
          borderRadius: 8,
          background: `${color}10`,
          border: `1px solid ${color}20`,
        }}
      >
        {Icon && <Icon size={14} style={{ color }} />}
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.15em",
            color,
            fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
          }}
        >
          {label}
        </span>
      </div>

      {/* Zone number — top right */}
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 24,
          fontSize: 11,
          fontFamily: "monospace",
          color: `${color}40`,
        }}
      >
        {zoneId}
      </div>

      {/* Center placeholder (only for empty zones) */}
      {zoneId !== 1 && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            opacity: 0.3,
          }}
        >
          {Icon && <Icon size={48} style={{ color }} />}
          <span
            style={{
              fontSize: 13,
              color: `${color}`,
              letterSpacing: "0.2em",
            }}
          >
            {label}
          </span>
          <span
            style={{
              fontSize: 11,
              color: `${color}80`,
              maxWidth: 200,
              textAlign: "center",
            }}
          >
            {description}
          </span>
        </div>
      )}
    </div>
  )
}

export default memo(ZoneNodeComponent)
