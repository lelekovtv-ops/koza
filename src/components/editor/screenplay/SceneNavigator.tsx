"use client"

import { useState, useMemo, useCallback } from "react"
import { useScriptStore } from "@/store/script"
import { useScenesStore } from "@/store/scenes"

export function SceneNavigatorButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Scene navigator"
        style={{
          position: "fixed",
          left: 18,
          top: 172,
          zIndex: 500,
          pointerEvents: "auto",
          width: 42,
          height: 42,
          borderRadius: "50%",
          border: open ? "1px solid rgba(212, 168, 83, 0.3)" : "1px solid rgba(255,255,255,0.08)",
          background: open ? "rgba(212, 168, 83, 0.12)" : "rgba(255,255,255,0.05)",
          color: open ? "#D4A853" : "rgba(255,255,255,0.35)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s",
          fontSize: 14,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
          <line x1="3" y1="3" x2="13" y2="3" />
          <line x1="3" y1="7" x2="10" y2="7" />
          <line x1="3" y1="11" x2="12" y2="11" />
          <circle cx="1" cy="3" r="0.8" fill="currentColor" stroke="none" />
          <circle cx="1" cy="7" r="0.8" fill="currentColor" stroke="none" />
          <circle cx="1" cy="11" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      </button>

      {open && <SceneNavigatorPanel onClose={() => setOpen(false)} />}
    </>
  )
}

function SceneNavigatorPanel({ onClose }: { onClose: () => void }) {
  const blocks = useScriptStore((s) => s.blocks)
  const scenes = useScenesStore((s) => s.scenes)

  const sceneHeadings = useMemo(() => {
    return blocks
      .filter((b) => b.type === "scene_heading")
      .map((b, idx) => ({
        id: b.id,
        text: b.text,
        number: idx + 1,
        sceneId: scenes.find((s) => s.headingBlockId === b.id)?.id,
      }))
  }, [blocks, scenes])

  const scrollToBlock = useCallback((blockId: string) => {
    const el = document.querySelector(`[data-block-id="${blockId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      // Brief highlight
      const prev = (el as HTMLElement).style.backgroundColor
      ;(el as HTMLElement).style.backgroundColor = "rgba(212, 168, 83, 0.15)"
      setTimeout(() => { (el as HTMLElement).style.backgroundColor = prev }, 1500)
    }
    onClose()
  }, [onClose])

  return (
    <div
      style={{
        position: "fixed",
        left: 14,
        top: 222,
        zIndex: 500,
        pointerEvents: "auto",
        width: 280,
        maxHeight: "60vh",
        overflowY: "auto",
        background: "rgba(30, 30, 30, 0.92)",
        backdropFilter: "blur(14px)",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        padding: "8px 4px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ padding: "4px 10px 8px", fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1 }}>
        Scenes ({sceneHeadings.length})
      </div>
      {sceneHeadings.length === 0 && (
        <div style={{ padding: "12px 10px", fontSize: 12, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>
          No scenes yet
        </div>
      )}
      {sceneHeadings.map((scene) => (
        <button
          key={scene.id}
          type="button"
          onClick={() => scrollToBlock(scene.id)}
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            width: "100%",
            padding: "6px 10px",
            borderRadius: 6,
            border: "none",
            background: "transparent",
            color: "rgba(255,255,255,0.55)",
            fontSize: 12,
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.15s",
            fontFamily: "'Courier Prime', monospace",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.06)"
            e.currentTarget.style.color = "#D4A853"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent"
            e.currentTarget.style.color = "rgba(255,255,255,0.55)"
          }}
        >
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", minWidth: 20, textAlign: "right" }}>
            {scene.number}
          </span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {scene.text || "—"}
          </span>
        </button>
      ))}
    </div>
  )
}
