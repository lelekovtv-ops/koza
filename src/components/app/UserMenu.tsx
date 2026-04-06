"use client"

import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { LogOut, User } from "lucide-react"
import { useState, useRef, useEffect } from "react"

export function UserMenu() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  if (status === "loading") return null

  if (!session) {
    return (
      <button
        onClick={() => router.push("/login")}
        className="flex items-center gap-1.5 rounded-lg border border-white/8 px-3 py-1.5 text-[11px] uppercase tracking-[0.1em] text-white/40 transition-colors hover:bg-white/5 hover:text-white/60"
      >
        <User size={13} />
        Sign In
      </button>
    )
  }

  const initials = (session.user?.name || session.user?.email || "?")
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("")

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[#D4A853]/20 text-[11px] font-semibold text-[#D4A853] transition-colors hover:bg-[#D4A853]/30"
        title={session.user?.email || ""}
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-56 rounded-xl border border-white/10 bg-[#1A1917]/95 p-2 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <div className="px-3 py-2">
            <p className="text-[12px] font-medium text-[#E7E3DC]">{session.user?.name}</p>
            <p className="text-[11px] text-white/30">{session.user?.email}</p>
          </div>
          <div className="my-1 h-px bg-white/8" />
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12px] text-white/40 transition-colors hover:bg-white/5 hover:text-white/60"
          >
            <LogOut size={13} />
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}
