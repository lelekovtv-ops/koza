import React from "react"
import type { ScreenplayColors } from "./screenplayUiTypes"

interface ScreenplayFooterProps {
  focusMode: boolean
  colors: ScreenplayColors
  sceneCount: number
  pageCount: number
  scenarioLength: number
  zoomPercent: number
}

export function ScreenplayFooter({
  focusMode,
  colors,
  sceneCount,
  pageCount,
  scenarioLength,
  zoomPercent,
}: ScreenplayFooterProps) {
  if (focusMode) {
    return (
      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 24,
          color: colors.muted,
          fontSize: 11,
          opacity: 0.5,
          pointerEvents: "none",
          fontFamily: "'Courier Prime', monospace",
        }}
      >
        {sceneCount} scenes · {pageCount} pg
      </div>
    )
  }

  return (
    <div
      style={{
        borderTop: `1px solid ${colors.border}`,
        padding: "6px 16px",
        color: colors.muted,
        fontSize: 11,
        backgroundColor: "transparent",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>{sceneCount} scenes · {pageCount} pages</span>
      <span>{scenarioLength} chars · zoom {zoomPercent}%</span>
    </div>
  )
}
