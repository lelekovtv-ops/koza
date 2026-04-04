"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useThemeStore } from "@/store/theme"

export function ThemeProvider() {
  const theme = useThemeStore((s) => s.theme)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    setMounted(true)
  }, [theme])

  if (!mounted) return null

  return theme === "architect"
    ? createPortal(
        <div id="architect-grid" aria-hidden>
          <div className="ag-fine" />
          <div className="ag-large" />
        </div>,
        document.body
      )
    : null
}
