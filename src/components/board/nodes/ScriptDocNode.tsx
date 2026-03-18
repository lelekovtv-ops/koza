"use client"

import { useEffect, useRef, useState } from "react"
import { type NodeProps } from "@xyflow/react"
import { FileText, Plus, Upload } from "lucide-react"
import { SCRIPT_DOC_HEIGHT, SCRIPT_DOC_WIDTH } from "./scriptDocConstants"

type NodeScreenRect = {
  x: number
  y: number
  width: number
  height: number
}

type ScriptDocData = {
  onEnterEditor?: (nodeId: string, type: "new" | "upload", initialRect: NodeScreenRect) => void
  scriptTitle?: string
  scriptAuthor?: string
  scriptDate?: string
  scriptDraft?: string
}

export default function ScriptDocNode({ id, data }: NodeProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const nodeData = (data || {}) as ScriptDocData
  const hasSavedTitle = Boolean(nodeData.scriptTitle && nodeData.scriptTitle !== "UNTITLED")

  const getNodeScreenRect = (): NodeScreenRect => {
    const nodeEl = document.querySelector(`[data-id="${id}"]`) as HTMLElement | null
    const rect = nodeEl?.getBoundingClientRect() ?? sheetRef.current?.getBoundingClientRect()

    if (rect) {
      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      }
    }

    return {
      x: 0,
      y: 0,
      width: SCRIPT_DOC_WIDTH,
      height: SCRIPT_DOC_HEIGHT,
    }
  }

  const handleEnter = (type: "new" | "upload") => {
    const initialRect = getNodeScreenRect()
    nodeData.onEnterEditor?.(id, type, initialRect)
    console.log(type === "new" ? "new script" : "upload script")
  }

  const handleOpenSaved = () => {
    const initialRect = getNodeScreenRect()
    nodeData.onEnterEditor?.(id, "new", initialRect)
  }

  return (
    <div
      ref={sheetRef}
      onDoubleClick={(event) => {
        event.stopPropagation()
        if (hasSavedTitle) {
          handleOpenSaved()
          return
        }
        handleEnter("new")
      }}
      className="group nodrag nopan relative rounded-[3px] border border-[#E5E0DB] bg-white shadow-[0_8px_20px_rgba(60,44,28,0.14)]"
      style={{ width: SCRIPT_DOC_WIDTH, height: SCRIPT_DOC_HEIGHT }}
    >
      {hasSavedTitle && (
        <button
          type="button"
          className="absolute inset-0 z-[4] cursor-pointer bg-transparent"
          aria-label="Open script"
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            handleOpenSaved()
          }}
        />
      )}

      {!hasSavedTitle && (
        <button
          type="button"
          className="absolute inset-0 z-[3] cursor-pointer bg-transparent"
          aria-label="Open script"
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            handleEnter("new")
          }}
        />
      )}

      {hasSavedTitle && (
        <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center p-8">
          <div className="w-full max-w-[340px] text-center">
            <p
              className="text-[20px] leading-tight text-[#2D2A26]"
              style={{ fontFamily: '"PT Serif", "Times New Roman", serif' }}
            >
              {nodeData.scriptTitle}
            </p>
            <p
              className="mt-8 text-[13px] text-[#8A8178]"
              style={{ fontFamily: '"PT Serif", "Times New Roman", serif' }}
            >
              Автор
            </p>
            <p
              className="mt-1 text-[15px] text-[#2D2A26]"
              style={{ fontFamily: '"PT Serif", "Times New Roman", serif' }}
            >
              {nodeData.scriptAuthor || "-"}
            </p>
            <p
              className="mt-6 text-[12px] text-[#A09890]"
              style={{ fontFamily: '"PT Serif", "Times New Roman", serif' }}
            >
              {nodeData.scriptDate || ""}
            </p>
            <p
              className="mt-2 text-[12px] text-[#A09890]"
              style={{ fontFamily: '"PT Serif", "Times New Roman", serif' }}
            >
              Черновик {nodeData.scriptDraft || ""}
            </p>
            <p
              className="mt-6 text-[11px] uppercase tracking-[0.08em] text-[#B8AEA3] opacity-0 transition-opacity duration-150 group-hover:opacity-100"
              style={{ fontFamily: '"PT Serif", "Times New Roman", serif' }}
            >
              Double click to open
            </p>
          </div>
        </div>
      )}

      <div className="absolute inset-0 z-[4] flex items-center justify-center">
        {hasSavedTitle ? null : (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              aria-label="Create script"
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleEnter("new")
              }}
              onClick={(event) => {
                event.stopPropagation()
                handleEnter("new")
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
                handleEnter("new")
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/85 text-[#C4B9AC]/90 transition-all duration-200 hover:scale-110 hover:text-[#B8AA9A]"
            >
              <Plus size={22} strokeWidth={1.6} />
            </button>

            <button
              type="button"
              aria-label="Upload script"
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleEnter("upload")
              }}
              onClick={(event) => {
                event.stopPropagation()
                handleEnter("upload")
              }}
              className="flex h-7 items-center gap-1 rounded-full border border-[#E8DED2] bg-white px-2 text-[10px] text-[#7A6C60] transition-colors hover:bg-[#F8F4EF]"
            >
              <Upload size={12} />
              <span>Upload</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
