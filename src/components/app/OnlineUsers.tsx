"use client"

import { useCollaborationStore } from "@/store/collaboration"

/**
 * Shows avatars of online users in the project.
 * Displays in the nav bar next to UserMenu.
 */
export function OnlineUsers() {
  const presence = useCollaborationStore((s) => s.presence)
  const connected = useCollaborationStore((s) => s.connected)

  if (!connected || presence.length <= 1) return null

  // Generate consistent color from userId
  const colors = ["#4A7C6F", "#7C4A6F", "#6F7C4A", "#4A6F7C", "#7C6F4A", "#6F4A7C", "#D4A853", "#5A8C7F"]
  const getColor = (userId: string) => {
    let hash = 0
    for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) | 0
    return colors[Math.abs(hash) % colors.length]
  }

  return (
    <div className="flex items-center gap-0.5">
      {presence.slice(0, 6).map((user) => {
        const initial = (user.name || "?")[0].toUpperCase()
        const color = getColor(user.userId)
        const viewLabel = user.cursor.view === "scriptwriter" ? "Script"
          : user.cursor.view === "workspace" ? "Studio"
          : user.cursor.view === "bible" ? "Bible"
          : user.cursor.view

        return (
          <div
            key={user.userId}
            className="relative flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white/90 transition-transform hover:scale-110"
            style={{ backgroundColor: color }}
            title={`${user.name} — ${viewLabel}${user.cursor.sceneId ? ` (${user.cursor.sceneId})` : ""}`}
          >
            {initial}
            {/* Activity dot */}
            <div
              className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[#111] bg-emerald-400"
            />
          </div>
        )
      })}
      {presence.length > 6 && (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[9px] text-white/40">
          +{presence.length - 6}
        </div>
      )}
    </div>
  )
}
