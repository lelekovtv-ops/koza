"use client"

import { memo, useState } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { nodeBase, handleStyle } from "./shared"

export type CompareData = {
  label: string
  imageA: string | null
  imageB: string | null
  mode: "slider" | "toggle"
}

export const CompareNode = memo(({ data }: NodeProps) => {
  const d = data as CompareData
  const [sliderPos, setSliderPos] = useState(50)
  const [showB, setShowB] = useState(false)

  const hasImages = d.imageA && d.imageB

  return (
    <div className={`${nodeBase} border-white/15 bg-white/[0.03] w-64 p-3`}>
      <Handle type="target" position={Position.Left} id="image-a" style={handleStyle("image")} />
      <Handle type="target" position={Position.Left} id="image-b" style={{ ...handleStyle("image"), top: "70%" }} />
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/40">{d.label || "Compare"}</span>
        {hasImages && (
          <button
            onClick={() => setShowB(!showB)}
            className="text-[8px] text-white/30 hover:text-white/60 px-1.5 py-0.5 rounded bg-white/5"
          >
            {d.mode === "toggle" ? (showB ? "B" : "A") : "A|B"}
          </button>
        )}
      </div>
      <div className="relative aspect-video rounded-lg overflow-hidden border border-white/8 bg-black/30">
        {hasImages ? (
          d.mode === "slider" ? (
            <>
              <img src={d.imageA!} alt="A" className="absolute inset-0 h-full w-full object-cover" />
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${sliderPos}%` }}
              >
                <img src={d.imageB!} alt="B" className="h-full object-cover" style={{ width: `${100 / (sliderPos / 100)}%` }} />
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={sliderPos}
                onChange={(e) => setSliderPos(Number(e.target.value))}
                className="absolute bottom-2 left-2 right-2 opacity-50"
              />
            </>
          ) : (
            <img src={showB ? d.imageB! : d.imageA!} alt={showB ? "B" : "A"} className="h-full w-full object-cover" />
          )
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-white/15">Connect two images</div>
        )}
      </div>
    </div>
  )
})
CompareNode.displayName = "CompareNode"
