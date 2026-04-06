"use client"

import { useCollaborationStore } from "@/store/collaboration"
import { Lock } from "lucide-react"

/**
 * Small lock icon shown next to scene headings when locked by another user.
 * Use inline next to scene title.
 */
export function SceneLockIndicator({ sceneId }: { sceneId: string }) {
  const locks = useCollaborationStore((s) => s.locks)

  const lock = locks.find((l) => l.sceneId === sceneId)
  if (!lock) return null

  // Generate color from userId for consistency
  const colors = ["#4A7C6F", "#7C4A6F", "#6F7C4A", "#4A6F7C", "#7C6F4A", "#6F4A7C"]
  let hash = 0
  for (const ch of lock.userId) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  const color = colors[Math.abs(hash) % colors.length]

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px]"
      style={{ backgroundColor: `${color}20`, color }}
      title={`Locked by ${lock.userName}`}
    >
      <Lock size={9} />
      {lock.userName.split(/[\s@]/)[0]}
    </span>
  )
}
