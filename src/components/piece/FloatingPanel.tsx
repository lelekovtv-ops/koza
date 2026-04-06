"use client"

import { useState, useEffect } from "react"
import { usePanelsStore, type PanelId } from "@/store/panels"

interface FloatingPanelProps {
  id: PanelId
  title: string
  children: React.ReactNode
  /** Position in pipeline: 0 = first, 1 = second, etc */
  order: number
  /** Total visible panels count */
  total: number
  /** Is this the active (latest) panel? */
  active: boolean
  className?: string
}

export function FloatingPanel({ id, title, children, order, total, active, className = "" }: FloatingPanelProps) {
  const panel = usePanelsStore((s) => s.panels[id])

  // Appear animation
  const [mounted, setMounted] = useState(false)
  const [animReady, setAnimReady] = useState(false)

  useEffect(() => {
    if (panel.visible && !panel.minimized) {
      setMounted(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimReady(true))
      })
    } else {
      setAnimReady(false)
      const t = setTimeout(() => setMounted(false), 600)
      return () => clearTimeout(t)
    }
  }, [panel.visible, panel.minimized])

  if (!mounted) return null

  // Auto-layout: system decides position based on order and total
  // Active panel = large, previous panels = compressed to left
  const layout = computeLayout(order, total, active)

  return (
    <div
      className={`fixed overflow-hidden rounded-2xl ${className}`}
      style={{
        // Position — system-controlled, no mouse
        left: layout.left,
        top: layout.top,
        width: layout.width,
        height: layout.height,
        zIndex: 100 + order,
        // Glass background
        background: active
          ? "linear-gradient(160deg, rgba(24,22,20,0.94) 0%, rgba(18,16,14,0.97) 100%)"
          : "linear-gradient(160deg, rgba(24,22,20,0.6) 0%, rgba(18,16,14,0.7) 100%)",
        // Glow on active
        boxShadow: active
          ? `0 0 0 1px rgba(212,168,83,0.2),
             0 0 30px rgba(212,168,83,0.06),
             0 20px 60px rgba(0,0,0,0.4),
             inset 0 1px 0 rgba(255,255,255,0.04)`
          : `0 0 0 1px rgba(255,255,255,0.04),
             0 10px 30px rgba(0,0,0,0.2)`,
        // Apple spring animation
        opacity: animReady ? (active ? 1 : 0.5) : 0,
        transform: animReady
          ? `translateX(0) scale(${active ? 1 : 0.92})`
          : "translateX(-40px) scale(0.95)",
        transition: "all 0.7s cubic-bezier(0.16, 1, 0.3, 1)",
        // No pointer events on inactive panels
        pointerEvents: active ? "auto" : "none",
        filter: active ? "none" : "brightness(0.7)",
      }}
    >
      {/* Breathing border on active panel */}
      {active && (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            border: "1px solid transparent",
            backgroundImage: "linear-gradient(160deg, rgba(212,168,83,0.25) 0%, rgba(212,168,83,0.05) 40%, rgba(212,168,83,0.18) 100%)",
            backgroundOrigin: "border-box",
            backgroundClip: "border-box",
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
            padding: 1,
            animation: "borderBreath 4s ease-in-out infinite",
          }}
        />
      )}

      {/* Header — no drag, just label */}
      <div
        className="flex items-center px-4 py-2.5"
        style={{ borderBottom: `1px solid rgba(212,168,83,${active ? 0.1 : 0.04})` }}
      >
        <div className="flex items-center gap-2">
          {active && (
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: "#D4A853",
                boxShadow: "0 0 4px rgba(212,168,83,0.6)",
                animation: "borderBreath 4s ease-in-out infinite",
              }}
            />
          )}
          <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${active ? "text-white/50" : "text-white/20"}`}>
            {title}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="h-[calc(100%-44px)] overflow-auto">
        {children}
      </div>
    </div>
  )
}

// ─── Auto-layout engine ─────────────────────────────────────

function computeLayout(order: number, total: number, active: boolean) {
  const vh = typeof window !== "undefined" ? window.innerHeight : 800
  const vw = typeof window !== "undefined" ? window.innerWidth : 1400
  const navH = 50    // top nav
  const barH = 80    // bottom command bar area
  const padY = 20
  const padX = 20

  const availH = vh - navH - barH - padY * 2
  const availW = vw - padX * 2

  if (total === 1) {
    // Single panel: centered, large
    const w = Math.min(560, availW - 100)
    const h = Math.min(availH - 40, 600)
    return {
      left: padX + (availW - w) / 2,
      top: navH + padY + (availH - h) / 2,
      width: w,
      height: h,
    }
  }

  if (active) {
    // Active panel: right side, large
    const prevWidth = total > 1 ? 280 : 0
    const gap = 40
    const w = Math.min(560, availW - prevWidth - gap - padX)
    const h = Math.min(availH - 20, 600)
    return {
      left: padX + prevWidth + gap,
      top: navH + padY + (availH - h) / 2,
      width: w,
      height: h,
    }
  }

  // Inactive (previous) panel: stacked left, compressed
  const prevPanelH = Math.min(400, availH - 40)
  const stackOffset = order * 20 // slight vertical stacking
  return {
    left: padX + order * 10,
    top: navH + padY + stackOffset + (availH - prevPanelH) / 2,
    width: 260,
    height: prevPanelH,
  }
}
