"use client"

import { StoryboardPanel } from "@/components/editor/screenplay/StoryboardPanel"
import { BlockCanvas } from "@/components/editor/canvas/BlockCanvas"
import { useBlockCanvasStore } from "@/store/blockCanvas"
import { useRouter } from "next/navigation"
import { useCallback, useEffect } from "react"
import { useSyncOrchestrator } from "@/hooks/useSyncOrchestrator"
import { Grid } from "lucide-react"

export default function WorkspacePage() {
  const router = useRouter()
  useSyncOrchestrator()

  const handleClose = useCallback(() => {
    router.push("/")
  }, [router])

  const lastBlockId = useBlockCanvasStore((s) => s.lastBlockId)
  const activeBlockId = useBlockCanvasStore((s) => s.activeBlockId)

  // Global hotkey: Cmd+. to reopen last canvas
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "." && (e.metaKey || e.ctrlKey) && !activeBlockId) {
        e.preventDefault()
        useBlockCanvasStore.getState().reopenLast()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [activeBlockId])

  return (
    <div className="fixed inset-0 top-[56px] overflow-hidden bg-[#1A1916]">
      <StoryboardPanel
        isOpen
        isExpanded
        panelWidth={0}
        backgroundColor="#1A1916"
        onClose={handleClose}
        onToggleExpanded={handleClose}
      />

      {/* Floating "Back to Canvas" button when last canvas exists */}
      {lastBlockId && !activeBlockId && (
        <button
          onClick={() => useBlockCanvasStore.getState().reopenLast()}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-[#111317]/90 px-4 py-2.5 text-[12px] uppercase tracking-[0.12em] text-cyan-300 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-all hover:bg-cyan-500/15 hover:border-cyan-400/40 hover:shadow-[0_8px_32px_rgba(0,200,255,0.15)]"
        >
          <Grid size={14} />
          Back to Canvas
          <kbd className="ml-1 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] text-white/30">
            {"\u2318"}.
          </kbd>
        </button>
      )}

      {/* Block Canvas — rendered at page level to avoid overflow/transform clipping */}
      <BlockCanvas />
    </div>
  )
}
