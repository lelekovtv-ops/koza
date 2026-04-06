"use client"

import { useScreenplaySettings } from "@/store/screenplaySettings"

export function MainContent({ children }: { children: React.ReactNode }) {
  const focusMode = useScreenplaySettings((s) => s.focusMode)

  return (
    <main className={`flex-1 overflow-auto ${focusMode ? "pt-0" : "pt-[56px]"}`}>
      {children}
    </main>
  )
}
