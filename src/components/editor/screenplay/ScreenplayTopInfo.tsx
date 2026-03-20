import React from "react"
import type { ScreenplayColors } from "./screenplayUiTypes"

interface ScreenplayTopInfoProps {
  focusMode: boolean
  colors: ScreenplayColors
  sceneCount: number
  pageCount: number
  zoomPercent: number
  setZoomPercent: React.Dispatch<React.SetStateAction<number>>
}

export function ScreenplayTopInfo({
  focusMode,
  colors,
  sceneCount,
  pageCount,
  zoomPercent,
  setZoomPercent,
}: ScreenplayTopInfoProps) {
  if (focusMode) return null

  return (
    <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
      <div
        className="rounded-full px-3 py-1 text-xs font-semibold"
        style={{
          backgroundColor: colors.surfaceElevatedBg,
          border: `1px solid ${colors.border}`,
          color: colors.text,
        }}
      >
        {sceneCount} scenes · {pageCount} pages
      </div>
      <div
        className="flex items-center gap-2 rounded-lg px-2 py-1"
        title="Scale"
        style={{
          backgroundColor: colors.surfaceElevatedBg,
          border: `1px solid ${colors.border}`,
          minWidth: 200,
        }}
      >
        <span style={{ fontSize: 11, color: colors.muted, width: 36, textAlign: "right" }}>50%</span>
        <input
          type="range"
          min={50}
          max={140}
          step={5}
          value={zoomPercent}
          onChange={(e) => setZoomPercent(Number(e.target.value))}
          style={{ width: 100, accentColor: colors.accent }}
          aria-label="Screenplay zoom"
        />
        <button
          type="button"
          onClick={() => setZoomPercent(100)}
          className="rounded-md px-2 py-1 text-xs"
          style={{
            color: zoomPercent === 100 ? colors.accent : colors.text,
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.surfaceBg,
          }}
          title="Reset to 100%"
        >
          {zoomPercent}%
        </button>
      </div>
    </div>
  )
}
