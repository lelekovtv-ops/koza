"use client"

import { Play, Undo2, Redo2, ChevronDown, Maximize, X } from "lucide-react"
import { useBlockCanvasStore } from "@/store/blockCanvas"
import { useScriptStore } from "@/store/script"

interface CanvasToolbarProps {
  onSave: () => void
  onRunAll: () => void
  onFitView: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onClose: () => void
  zoom?: number
}

export function CanvasToolbar({ onSave, onRunAll, onFitView, onZoomIn, onZoomOut, onClose, zoom = 100 }: CanvasToolbarProps) {
  const activeBlockId = useBlockCanvasStore((s) => s.activeBlockId)
  const nodes = useBlockCanvasStore((s) => s.nodes)
  const block = useScriptStore((s) => s.blocks.find((b) => b.id === activeBlockId))

  const blockText = block?.text || ""
  const truncated = blockText.length > 40 ? blockText.slice(0, 40) + "..." : blockText

  return (
    <>
      {/* Close button — fixed to viewport, always visible */}
      <button
        onClick={onClose}
        className="fixed top-20 left-4 z-[210] flex items-center gap-2 rounded-xl border border-white/10 bg-[#1C1D21] px-4 py-2.5 text-[12px] text-white/60 backdrop-blur-xl hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30 transition-all shadow-[0_4px_24px_rgba(0,0,0,0.6)]"
      >
        <X size={14} /> Close
        <kbd className="ml-1 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] text-white/25">Esc</kbd>
      </button>


      {/* Bottom floating toolbar — Weavy style pill */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-2xl border border-white/[0.08] bg-[#1C1D21]/90 backdrop-blur-xl px-2 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        {/* Run All */}
        <button
          onClick={onRunAll}
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
          title="Run All"
        >
          <Play size={14} fill="currentColor" />
        </button>

        <div className="w-px h-5 bg-white/[0.08] mx-1" />

        {/* Fit view */}
        <button
          onClick={onFitView}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
          title="Fit View"
        >
          <Maximize size={14} />
        </button>

        {/* Undo / Redo placeholder */}
        <button className="flex h-8 w-8 items-center justify-center rounded-xl text-white/20 hover:text-white/40 hover:bg-white/5 transition-colors" title="Undo">
          <Undo2 size={14} />
        </button>
        <button className="flex h-8 w-8 items-center justify-center rounded-xl text-white/20 hover:text-white/40 hover:bg-white/5 transition-colors" title="Redo">
          <Redo2 size={14} />
        </button>

        <div className="w-px h-5 bg-white/[0.08] mx-1" />

        {/* Zoom display */}
        <button
          onClick={onFitView}
          className="flex items-center gap-1 rounded-xl px-2 py-1 text-[11px] text-white/30 hover:text-white/50 hover:bg-white/5 transition-colors"
        >
          {zoom}%
          <ChevronDown size={10} />
        </button>
      </div>
    </>
  )
}
