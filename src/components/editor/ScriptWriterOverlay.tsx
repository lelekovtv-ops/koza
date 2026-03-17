"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Upload, X } from "lucide-react"
import { useAutosave } from "@/hooks/useAutosave"
import { useScriptStore } from "@/store/script"

type EditorType = "new" | "upload" | null
type OverlayPhase = "hidden" | "opening" | "open" | "closing"

type NodeScreenRect = {
  x: number
  y: number
  width: number
  height: number
}

interface ScriptWriterOverlayProps {
  active: boolean
  type: EditorType
  initialRect: NodeScreenRect | null
  onCloseStart: () => void
  onCloseComplete: () => void
}

export default function ScriptWriterOverlay({
  active,
  type,
  initialRect,
  onCloseStart,
  onCloseComplete,
}: ScriptWriterOverlayProps) {
  const OVERLAY_BG_VARIANTS = {
    A: "#2C2825",
    B: "#35322F",
    C: "#2A2C25",
  } as const
  const OVERLAY_BG = OVERLAY_BG_VARIANTS.A

  const PAGE_WIDTH = 816
  const PAGE_HEIGHT = 1056
  const PAGE_TOP = 80

  const [titleCommitted, setTitleCommitted] = useState(false)
  const [showStartHint, setShowStartHint] = useState(false)
  const [showSecondPage, setShowSecondPage] = useState(false)
  const [secondPageVisible, setSecondPageVisible] = useState(false)
  const [phase, setPhase] = useState<OverlayPhase>("hidden")
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [isBackdropVisible, setBackdropVisible] = useState(false)
  const [openMotionStarted, setOpenMotionStarted] = useState(false)
  const [closeMotionStarted, setCloseMotionStarted] = useState(false)
  const [floatingFromRect, setFloatingFromRect] = useState<NodeScreenRect | null>(null)

  const titleInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const secondPageRef = useRef<HTMLDivElement>(null)
  const openSheetRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const openTimerRef = useRef<number | null>(null)
  const openCompleteTimerRef = useRef<number | null>(null)
  const closeTimerRef = useRef<number | null>(null)

  const scenario = useScriptStore((state) => state.scenario)
  const title = useScriptStore((state) => state.title)
  const author = useScriptStore((state) => state.author)
  const draft = useScriptStore((state) => state.draft)
  const date = useScriptStore((state) => state.date)
  const setScenario = useScriptStore((state) => state.setScenario)
  const setTitle = useScriptStore((state) => state.setTitle)
  const setAuthor = useScriptStore((state) => state.setAuthor)
  const setDraft = useScriptStore((state) => state.setDraft)
  const setDate = useScriptStore((state) => state.setDate)
  const { status, visible } = useAutosave(active && phase === "open" && type === "new")

  const getRegisteredAuthorName = () => {
    if (typeof window === "undefined") return "Александр Лелеков"

    const directName = localStorage.getItem("koza-user-name")
    if (directName && directName.trim()) return directName.trim()

    const profileRaw = localStorage.getItem("koza-user-profile")
    if (profileRaw) {
      try {
        const profile = JSON.parse(profileRaw) as { name?: string; fullName?: string }
        const candidate = profile.fullName || profile.name
        if (candidate && candidate.trim()) return candidate.trim()
      } catch {
        // Ignore malformed profile payload.
      }
    }

    return "Александр Лелеков"
  }

  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  useEffect(() => {
    if (!active || !initialRect) return
    setPhase("opening")
    setFloatingFromRect(initialRect)
    setOpenMotionStarted(false)
    setBackdropVisible(false)

    if (openTimerRef.current) window.clearTimeout(openTimerRef.current)
    openTimerRef.current = window.setTimeout(() => {
      setBackdropVisible(true)
      setOpenMotionStarted(true)
    }, 50)

    if (openCompleteTimerRef.current) window.clearTimeout(openCompleteTimerRef.current)
    openCompleteTimerRef.current = window.setTimeout(() => {
      setPhase("open")
      setFloatingFromRect(null)
    }, 560)

    return () => {
      if (openTimerRef.current) window.clearTimeout(openTimerRef.current)
      if (openCompleteTimerRef.current) window.clearTimeout(openCompleteTimerRef.current)
    }
  }, [active, initialRect])

  useEffect(() => {
    if (!active || type !== "new") return
    setTitleCommitted(title.trim().length > 0 && title !== "UNTITLED")
    setShowStartHint(false)
    setShowSecondPage(true)
    setSecondPageVisible(true)
  }, [active, type, title, scenario])

  const isCyrillicTitle = /[\u0400-\u04FF]/.test(title)
  const writtenByLabel = isCyrillicTitle ? "Автор" : "Written by"
  const draftLabel = isCyrillicTitle ? "Черновик" : "Draft"
  const startWritingLabel = isCyrillicTitle
    ? "Нажмите Enter чтобы продолжить"
    : "Press Enter to continue"

  useEffect(() => {
    if (phase !== "open" || type !== "new" || titleCommitted) return
    const timer = window.setTimeout(() => {
      titleInputRef.current?.focus()
    }, 30)
    return () => window.clearTimeout(timer)
  }, [phase, type, titleCommitted])

  useEffect(() => {
    if (!active || type !== "new" || phase !== "open" || !showSecondPage) return

    const timer = window.setTimeout(() => {
      secondPageRef.current?.scrollIntoView({ behavior: "auto", block: "start" })
      textareaRef.current?.focus()
    }, 60)

    return () => window.clearTimeout(timer)
  }, [active, type, phase, showSecondPage])

  const finalRect = useMemo(
    () => ({
      x: viewport.width / 2 - PAGE_WIDTH / 2,
      y: PAGE_TOP,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
    }),
    [viewport.width]
  )

  const animatedRect = openMotionStarted || phase === "closing" ? finalRect : floatingFromRect

  const handleClose = () => {
    if (phase === "closing" || phase === "hidden") return

    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: "auto" })
    }

    const sheetRect = openSheetRef.current?.getBoundingClientRect()
    if (sheetRect) {
      setFloatingFromRect({ x: sheetRect.left, y: sheetRect.top, width: sheetRect.width, height: sheetRect.height })
    } else {
      setFloatingFromRect(finalRect)
    }

    onCloseStart()
    setBackdropVisible(true)
    setCloseMotionStarted(false)
    setPhase("closing")

    requestAnimationFrame(() => {
      setCloseMotionStarted(true)
    })

    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      setBackdropVisible(false)
      setPhase("hidden")
      setOpenMotionStarted(false)
      setCloseMotionStarted(false)
      setFloatingFromRect(null)
      onCloseComplete()
    }, 520)
  }

  useEffect(() => {
    return () => {
      if (openTimerRef.current) window.clearTimeout(openTimerRef.current)
      if (openCompleteTimerRef.current) window.clearTimeout(openCompleteTimerRef.current)
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [])

  const showFloatingSheet = phase === "opening" || phase === "closing"

  const revealMeta = titleCommitted && title.trim().length > 0

  useEffect(() => {
    if (!revealMeta) {
      setShowStartHint(false)
      return
    }

    const timer = window.setTimeout(() => {
      setShowStartHint(true)
    }, 320)

    return () => window.clearTimeout(timer)
  }, [revealMeta])

  const handleTitleEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return
    event.preventDefault()

    if (!titleCommitted && title.trim()) {
      setTitle(title.trim())
      if (!author.trim()) {
        setAuthor(getRegisteredAuthorName())
      }
      setTitleCommitted(true)
      return
    }

    if (titleCommitted && revealMeta) {
      if (!showSecondPage) {
        setShowSecondPage(true)
        requestAnimationFrame(() => {
          setSecondPageVisible(true)
          window.setTimeout(() => {
            secondPageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
          }, 40)
        })
        return
      }

      secondPageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      return
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120]"
      style={{
        opacity: phase === "hidden" ? 0 : 1,
        transition: "opacity 120ms linear",
        pointerEvents: phase === "hidden" ? "none" : "auto",
      }}
    >
      <div
        className="fixed inset-0 z-[1] backdrop-blur-sm"
        style={{
          backgroundColor: OVERLAY_BG,
          opacity: isBackdropVisible ? 1 : 0,
          transition: "opacity 500ms ease",
        }}
      />

      <div ref={scrollContainerRef} className="fixed inset-0 z-[2] overflow-y-auto">
        <button
          type="button"
          onClick={handleClose}
          className="fixed right-5 top-5 z-[4] rounded-md p-2 text-[#D8CEC2] transition-colors hover:bg-[#3A3530] hover:text-white"
          aria-label="Close editor"
        >
          <X size={18} />
        </button>

        <div className="relative z-[2] flex flex-col items-center gap-10 px-6 pb-[300px] pt-[80px]">
          {phase === "open" && (
            <div
              ref={openSheetRef}
              className="relative rounded-[3px] border border-[#E5E0DB] bg-white shadow-[0_8px_60px_rgba(0,0,0,0.4)]"
              style={{ width: PAGE_WIDTH, minHeight: PAGE_HEIGHT }}
            >
              {type === "new" && (
                <div className="relative h-[1056px] w-full">
                  <div className="absolute left-1/2 top-[40%] w-[78%] -translate-x-1/2 -translate-y-1/2 text-center">
                    <input
                      ref={titleInputRef}
                      value={title === "UNTITLED" && !titleCommitted ? "" : title}
                      onChange={(event) => {
                        setTitle(event.target.value.toUpperCase())
                      }}
                      onKeyDown={handleTitleEnter}
                      placeholder="Write film title"
                      className="w-full bg-transparent text-center text-[28px] font-normal text-[#1a1a1a] outline-none placeholder:text-[#C4B9AC]"
                      style={{ fontFamily: '"PT Serif", "Times New Roman", serif' }}
                    />

                    <div
                      className={`mx-auto mt-10 flex w-full max-w-[360px] flex-col items-center text-center transition-opacity duration-300 ${revealMeta ? "opacity-100" : "opacity-0"}`}
                    >
                      <p className="text-[16px] font-normal text-[#8A8178]" style={{ fontFamily: '"PT Serif", "Times New Roman", serif' }}>
                        {writtenByLabel}
                      </p>
                      <input
                        value={author}
                        onChange={(event) => setAuthor(event.target.value)}
                        placeholder={isCyrillicTitle ? "Имя автора" : "Author name"}
                        className="mt-3 w-full bg-transparent text-center text-[18px] font-normal text-[#1a1a1a] outline-none placeholder:text-[#C4B9AC]"
                        style={{ fontFamily: '"PT Serif", "Times New Roman", serif' }}
                      />
                      <input
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                        className="mt-10 w-full bg-transparent text-center text-[14px] font-normal text-[#A09890] outline-none"
                        style={{ fontFamily: '"PT Serif", "Times New Roman", serif' }}
                      />
                      <div className="mt-3 flex flex-col items-center gap-1 text-center">
                        <span className="text-[14px] font-normal text-[#A09890]" style={{ fontFamily: '"PT Serif", "Times New Roman", serif' }}>
                          {draftLabel}
                        </span>
                        <input
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          className="w-[170px] bg-transparent text-center text-[14px] font-normal text-[#A09890] outline-none"
                          style={{ fontFamily: '"PT Serif", "Times New Roman", serif' }}
                        />
                      </div>
                    </div>

                    {showStartHint && (
                      <div className="mt-6 text-center text-[12px] text-[#B5ABA0]" style={{ fontFamily: '"PT Serif", "Times New Roman", serif' }}>
                        {startWritingLabel}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {type === "upload" && (
                <textarea
                  ref={textareaRef}
                  value={scenario}
                  onChange={(event) => setScenario(event.target.value)}
                  className="h-full min-h-[1056px] w-full resize-none bg-transparent pb-[72px] pl-[96px] pr-[72px] pt-[72px] text-[#1a1a1a] outline-none placeholder:text-[#C4B9AC]"
                  style={{ fontFamily: '"PT Serif", "Times New Roman", serif', fontSize: 18, lineHeight: 1.7, color: "#1a1a1a" }}
                  placeholder=""
                  aria-label="Script editor"
                />
              )}

              {type === "upload" && (
                <button
                  type="button"
                  className="absolute inset-0 m-auto flex h-[160px] w-[78%] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[#D8CEC1] bg-[#FCFAF7] text-[#8A8075]"
                >
                  <Upload size={20} />
                  <span className="text-xs">Drop your script here or click to browse</span>
                </button>
              )}
            </div>
          )}

          {phase === "open" && type === "new" && showSecondPage && (
            <div
              ref={secondPageRef}
              className="relative rounded-[3px] border border-[#E5E0DB] bg-white shadow-[0_8px_60px_rgba(0,0,0,0.4)] transition-opacity duration-300"
              style={{ width: PAGE_WIDTH, minHeight: PAGE_HEIGHT, opacity: secondPageVisible ? 1 : 0 }}
            >
              <textarea
                ref={textareaRef}
                value={scenario}
                onChange={(event) => setScenario(event.target.value)}
                className="h-full min-h-[1056px] w-full resize-none bg-transparent pb-[72px] pl-[96px] pr-[72px] pt-[72px] text-[#1a1a1a] outline-none placeholder:text-[#C4B9AC]"
                style={{ fontFamily: '"PT Serif", "Times New Roman", serif', fontSize: 18, lineHeight: 1.7, color: "#1a1a1a" }}
                placeholder=""
                aria-label="Screenplay page"
              />
            </div>
          )}
        </div>
      </div>

      {visible && (
        <div className="fixed bottom-6 right-6 z-[5] rounded-md bg-[#1f1b17]/55 px-3 py-1 text-xs text-white/80 backdrop-blur-sm">
          {status === "saving" ? <span className="animate-pulse">Saving...</span> : <span>Saved</span>}
        </div>
      )}

      {showFloatingSheet && animatedRect && initialRect && (
        <div
          className="fixed z-[3] rounded-[3px] border border-[#E5E0DB] bg-white shadow-[0_8px_60px_rgba(0,0,0,0.4)]"
          style={{
            left: phase === "closing" ? (closeMotionStarted ? initialRect.x : animatedRect.x) : animatedRect.x,
            top: phase === "closing" ? (closeMotionStarted ? initialRect.y : animatedRect.y) : animatedRect.y,
            width: phase === "closing" ? (closeMotionStarted ? initialRect.width : animatedRect.width) : animatedRect.width,
            height: phase === "closing" ? (closeMotionStarted ? initialRect.height : animatedRect.height) : animatedRect.height,
            transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      )}
    </div>
  )
}
