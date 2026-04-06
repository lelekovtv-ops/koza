"use client"

import { useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Upload } from "lucide-react"
import SlateScreenplayEditor from "@/components/editor/SlateScreenplayEditor"
import { CommandBarTrigger } from "@/components/editor/screenplay/ScreenplayCommandBar"
import { useScreenplaySettings } from "@/store/screenplaySettings"
import {
  SCREENPLAY_OVERLAY_PAGE_ZOOM,
  SCREENPLAY_PAGE_HEIGHT_PX,
  SCREENPLAY_PAGE_WIDTH_PX,
} from "@/components/editor/screenplay/screenplayLayoutConstants"
import { useScriptStore } from "@/store/script"

/**
 * Scriptwriter — independent pure text editor.
 *
 * No timeline, no storyboard, no Bible, no production dependencies.
 * Just write screenplays in any format with AI assistance.
 */
export default function ScriptwriterPage() {
  const router = useRouter()
  const { paperTheme } = useScreenplaySettings()

  const PAGE_WIDTH = SCREENPLAY_PAGE_WIDTH_PX
  const PAGE_HEIGHT = SCREENPLAY_PAGE_HEIGHT_PX
  const PAGE_ZOOM = SCREENPLAY_OVERLAY_PAGE_ZOOM

  const SCALED_PAGE_WIDTH = Math.round(PAGE_WIDTH * PAGE_ZOOM)
  const SCALED_PAGE_HEIGHT = Math.round(PAGE_HEIGHT * PAGE_ZOOM)

  const setScenario = useScriptStore((s) => s.setScenario)
  const title = useScriptStore((s) => s.title)
  const setTitle = useScriptStore((s) => s.setTitle)
  const blocks = useScriptStore((s) => s.blocks)
  const hasContent = blocks.length > 1 || (blocks.length === 1 && !!blocks[0]?.text?.trim())

  const editorRef = useRef<{ getValue: () => string; setValue: (t: string) => void; focus: () => void } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      setScenario(text)
      editorRef.current?.setValue(text)
    }
    reader.readAsText(file)
    e.target.value = ""
  }, [setScenario])

  const paperBg =
    paperTheme === "warm"
      ? "#FAF6F0"
      : paperTheme === "dark"
        ? "#1E1E1E"
        : "#FFFFFF"

  const textColor = paperTheme === "dark" ? "#D4D0C8" : "#1A1A1A"

  return (
    <div className="fixed inset-0 bg-[#0D0C0B] flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-center h-12 px-4 border-b border-white/[0.06] shrink-0">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors text-sm mr-4"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="bg-transparent text-white/80 text-sm font-medium outline-none border-none flex-1 text-center"
          placeholder="Untitled Screenplay"
        />

        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white/40 hover:text-white/60 hover:bg-white/5 transition-colors text-xs"
          >
            <Upload size={13} />
            Import
          </button>
          <input ref={fileInputRef} type="file" accept=".txt,.fountain,.fdx" className="hidden" onChange={handleImport} />
          {hasContent && (
            <button
              onClick={() => router.push("/studio")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#D4A853]/10 text-[#D4A853]/80 hover:bg-[#D4A853]/20 hover:text-[#D4A853] transition-colors text-xs font-medium"
            >
              To Studio <ArrowRight size={13} />
            </button>
          )}
          <CommandBarTrigger />
        </div>
      </div>

      {/* ── Editor area ── */}
      <div className="flex-1 overflow-auto flex justify-center py-8">
        <div
          className="relative shadow-2xl"
          style={{
            width: SCALED_PAGE_WIDTH,
            minHeight: SCALED_PAGE_HEIGHT,
            backgroundColor: paperBg,
            borderRadius: 4,
          }}
        >
          <div
            style={{
              transform: `scale(${PAGE_ZOOM})`,
              transformOrigin: "top left",
              width: PAGE_WIDTH,
              minHeight: PAGE_HEIGHT,
              padding: "72px 72px 72px 108px",
              color: textColor,
            }}
          >
            <SlateScreenplayEditor />
          </div>
        </div>
      </div>
    </div>
  )
}
