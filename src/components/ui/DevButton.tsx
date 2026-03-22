"use client"

import { Bug, FlaskConical } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useDevLogStore } from "@/store/devlog"

export function DevButton() {
  const router = useRouter()
  const pathname = usePathname()
  const entryCount = useDevLogStore((state) => state.entries.length)
  const hasErrors = useDevLogStore((state) => state.entries.some((entry) => entry.type.includes("error")))

  if (process.env.NODE_ENV !== "development") return null

  return (
    <>
      {pathname !== "/lab" ? (
        <button
          onClick={() => router.push(`/lab?from=${encodeURIComponent(pathname)}`)}
          className="fixed bottom-4 right-16 z-[9999] flex items-center gap-1.5 rounded-full border border-[#D4A853]/20 bg-[#D4A853]/10 px-3 py-2 text-[11px] font-medium text-[#D4A853]/70 shadow-lg backdrop-blur transition-all hover:scale-105 hover:text-[#D4A853]"
        >
          <FlaskConical className="h-3.5 w-3.5" />
          LAB
        </button>
      ) : null}

      {pathname !== "/dev" ? (
        <button
          onClick={() => router.push(`/dev?from=${encodeURIComponent(pathname)}`)}
          className={`fixed bottom-4 right-4 z-[9999] flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-medium shadow-lg backdrop-blur transition-all hover:scale-105 ${
            hasErrors
              ? "border border-red-500/30 bg-red-500/20 text-red-400"
              : "border border-white/10 bg-white/10 text-white/50 hover:text-white/80"
          }`}
        >
          <Bug className="h-3.5 w-3.5" />
          DEV
          {entryCount > 0 && (
            <span className="ml-1 min-w-[18px] rounded-full bg-white/10 px-1 text-center text-[9px]">
              {entryCount > 99 ? "99+" : entryCount}
            </span>
          )}
        </button>
      ) : null}
    </>
  )
}