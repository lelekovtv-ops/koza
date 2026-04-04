"use client"

import type { HandState } from "@/hooks/useHandTracking"

interface Props {
  hand: HandState
  cameraReady: boolean
}

export function HandCursor({ hand, cameraReady }: Props) {
  if (!cameraReady || !hand.detected) return null

  // Smoothing already done in useHandTracking — use directly
  const px = hand.x * window.innerWidth
  const py = hand.y * window.innerHeight

  const isPinch = hand.gesture === "pinch"
  const isOpenPalm = hand.gesture === "open_palm"
  const isFist = hand.gesture === "fist"

  return (
    <div
      className="pointer-events-none fixed z-[200]"
      style={{
        left: px,
        top: py,
        transform: "translate(-50%, -50%)",
      }}
    >
      {/* Outer ring */}
      <div
        style={{
          width: isPinch ? 20 : isOpenPalm ? 50 : isFist ? 16 : 32,
          height: isPinch ? 20 : isOpenPalm ? 50 : isFist ? 16 : 32,
          borderRadius: "50%",
          border: `2px solid ${isPinch ? "#D4A853" : isOpenPalm ? "#4ADE80" : isFist ? "#EF4444" : "rgba(255,255,255,0.3)"}`,
          background: isPinch
            ? "rgba(212,168,83,0.15)"
            : isOpenPalm
              ? "rgba(74,222,128,0.1)"
              : isFist
                ? "rgba(239,68,68,0.1)"
                : "rgba(255,255,255,0.05)",
          boxShadow: isPinch
            ? "0 0 20px rgba(212,168,83,0.4)"
            : isOpenPalm
              ? "0 0 20px rgba(74,222,128,0.3)"
              : isFist
                ? "0 0 15px rgba(239,68,68,0.3)"
                : "0 0 10px rgba(255,255,255,0.1)",
          transition: "all 0.15s ease-out",
        }}
      />

      {/* Center dot */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: 4,
          height: 4,
          borderRadius: "50%",
          background: isPinch ? "#D4A853" : "rgba(255,255,255,0.5)",
          transition: "all 0.1s",
        }}
      />

      {/* Gesture label */}
      {(isPinch || isOpenPalm || isFist) && (
        <div
          className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-medium tracking-wider"
          style={{
            top: isPinch ? -18 : isOpenPalm ? -18 : -18,
            color: isPinch ? "#D4A853" : isOpenPalm ? "#4ADE80" : "#EF4444",
            textShadow: "0 0 8px rgba(0,0,0,0.8)",
          }}
        >
          {isPinch ? "SELECT" : isOpenPalm ? "YES" : "NO"}
        </div>
      )}
    </div>
  )
}
