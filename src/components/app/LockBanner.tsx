"use client"

import { useCollaborationStore } from "@/store/collaboration"
import { Lock } from "lucide-react"

/**
 * Shows a banner when trying to edit a scene locked by another user.
 * Auto-dismisses after 4 seconds.
 */
export function LockBanner() {
  const lockDenied = useCollaborationStore((s) => s.lockDenied)
  const clearLockDenied = useCollaborationStore((s) => s.clearLockDenied)

  if (!lockDenied) return null

  return (
    <div className="fixed bottom-6 left-1/2 z-[300] -translate-x-1/2 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-[#1A1917]/95 px-5 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <Lock size={16} className="text-amber-400 shrink-0" />
        <div>
          <p className="text-[13px] text-[#E7E3DC]">
            <span className="font-medium text-amber-300">{lockDenied.userName}</span> is editing this scene
          </p>
          <p className="text-[11px] text-white/30">Wait for them to finish, or edit a different scene</p>
        </div>
        <button
          onClick={clearLockDenied}
          className="ml-2 rounded-lg px-2 py-1 text-[11px] text-white/30 hover:bg-white/5 hover:text-white/50 transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  )
}
