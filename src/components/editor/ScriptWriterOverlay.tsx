"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Maximize2, Minimize2, Upload } from "lucide-react"
import { useAutosave } from "@/hooks/useAutosave"
import SlateScreenplayEditor from "@/components/editor/SlateScreenplayEditor"
import { StoryboardPanel } from "@/components/editor/screenplay/StoryboardPanel"
import {
  SCREENPLAY_OVERLAY_PAGE_ZOOM,
  SCREENPLAY_PAGE_HEIGHT_PX,
  SCREENPLAY_PAGE_WIDTH_PX,
} from "@/components/editor/screenplay/screenplayLayoutConstants"
import {
  getAssistantStatus,
  requestScreenplayAssistantReplacement,
  resolveSelectionRange,
  type ScreenplaySelectionAction,
} from "@/components/editor/screenplay/screenplayAssistant"
import { applyScreenplayReplacementTransaction } from "@/components/editor/screenplay/screenplaySyncTransaction"
import {
  createUndoState,
  pushUndoSnapshot,
  redoSnapshot,
  undoSnapshot,
} from "@/components/editor/screenplay/screenplayUndo"
import { useScriptStore } from "@/store/script"
import { useSceneSync } from "@/hooks/useSceneSync"

type EditorType = "new" | "upload" | null
type OverlayPhase = "hidden" | "opening" | "open" | "closing"

type AiRippleRange = {
  start: number
  end: number
  token: number
}

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

export default function ScriptWriterOverlay(props: ScriptWriterOverlayProps) {
  const {
    active,
    type,
    initialRect,
  } = props
  const OVERLAY_BG_VARIANTS = {
    A: "#2C2825",
    B: "#35322F",
    C: "#2A2C25",
  } as const
  const OVERLAY_BG = OVERLAY_BG_VARIANTS.A

  // Standard US Letter screenplay page (Final Draft pixel-perfect)
  const PAGE_WIDTH = SCREENPLAY_PAGE_WIDTH_PX
  const PAGE_HEIGHT = SCREENPLAY_PAGE_HEIGHT_PX
  const PAGE_TOP = 60
  const PAGE_ZOOM = SCREENPLAY_OVERLAY_PAGE_ZOOM

  // Sync scene headings → timeline shots
  useSceneSync()

  // Scaled dimensions for layout calculations
  const SCALED_PAGE_WIDTH = Math.round(PAGE_WIDTH * PAGE_ZOOM)
  const SCALED_PAGE_HEIGHT = Math.round(PAGE_HEIGHT * PAGE_ZOOM)

  const [titleCommitted, setTitleCommitted] = useState(false)
  const [showStartHint, setShowStartHint] = useState(false)
  const [showSecondPage, setShowSecondPage] = useState(false)
  const [secondPageVisible, setSecondPageVisible] = useState(false)
  const [phase, setPhase] = useState<OverlayPhase>("hidden")
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [isBackdropVisible, setBackdropVisible] = useState(false)
  const [openMotionStarted, setOpenMotionStarted] = useState(false)
  const [floatingFromRect, setFloatingFromRect] = useState<NodeScreenRect | null>(null)
  const [isStoryboardPanelOpen, setIsStoryboardPanelOpen] = useState(false)
  const [isStoryboardPanelExpanded, setIsStoryboardPanelExpanded] = useState(false)

  const titleInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const screenplayPaneRef = useRef<HTMLDivElement>(null)
  const screenplayEditorRef = useRef<{
    getValue: () => string
    setValue: (text: string) => void
    focus: () => void
    undo: () => boolean
    redo: () => boolean
  } | null>(null)
  const openSheetRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const openTimerRef = useRef<number | null>(null)
  const openCompleteTimerRef = useRef<number | null>(null)
  const undoStateRef = useRef(createUndoState())

  const setBlocks = useScriptStore((state) => state.setBlocks)
  const setScenario = useScriptStore((state) => state.setScenario)
  const title = useScriptStore((state) => state.title)
  const author = useScriptStore((state) => state.author)
  const draft = useScriptStore((state) => state.draft)
  const date = useScriptStore((state) => state.date)
  const setTitle = useScriptStore((state) => state.setTitle)
  const setAuthor = useScriptStore((state) => state.setAuthor)
  const setDraft = useScriptStore((state) => state.setDraft)
  const setDate = useScriptStore((state) => state.setDate)
  const { status, visible } = useAutosave(active && phase === "open" && type === "new")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiStatus, setAiStatus] = useState<string>("Applying AI edit...")
  const [aiRippleRange, setAiRippleRange] = useState<AiRippleRange | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const storyboardPanelWidth = useMemo(
    () => Math.min(348, Math.max(292, Math.round(viewport.width * 0.26))),
    [viewport.width]
  )

  const scrollToWorkspaceTop = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: "auto" })
    }

    if (screenplayPaneRef.current) {
      screenplayPaneRef.current.scrollTo({ top: 0, behavior: "auto" })
    }
  }, [])

  const handleUploadFile = useCallback(async (file: File) => {
    try {
      const text = await file.text()
      const normalized = text
        .replace(/\r\n/g, "\n")
        .replace(/[\u200B\uFEFF]/g, "")
        .replace(/\n{3,}/g, "\n\n")
      setScenario(normalized)
      setUploadError(null)

      if (!showSecondPage) {
        setShowSecondPage(true)
        setSecondPageVisible(true)
      }

      window.setTimeout(() => {
        scrollToWorkspaceTop()
        screenplayEditorRef.current?.focus()
      }, 40)
    } catch {
      setUploadError("Could not read this file. Please upload a plain text screenplay.")
    }
  }, [scrollToWorkspaceTop, setScenario, showSecondPage])

  const handleSelectionAction = useCallback(async (payload: ScreenplaySelectionAction) => {
    if (aiLoading) return

    const selectedText = payload.selectedText.trim()
    if (!selectedText) return

    setAiStatus(getAssistantStatus(payload.action))
    setAiLoading(true)
    setAiError(null)

    try {
      const startedAt = Date.now()
      const minVisualDurationMs = 3000
      const liveScenario = useScriptStore.getState().scenario
      const liveBlocksBefore = useScriptStore.getState().blocks

      const liveRange = resolveSelectionRange(
        liveScenario,
        payload.selectionStart,
        payload.selectionEnd,
        payload.selectedText
      )
      const rippleStart = liveRange?.start ?? Math.max(0, payload.selectionStart)
      const rippleEnd = liveRange?.end ?? Math.max(rippleStart + 1, payload.selectionEnd)

      setAiRippleRange({
        start: rippleStart,
        end: Math.max(rippleStart + 1, rippleEnd),
        token: Date.now(),
      })

      undoStateRef.current = pushUndoSnapshot(undoStateRef.current, {
        scenario: liveScenario,
        blocks: liveBlocksBefore,
      })

      const replacement = await requestScreenplayAssistantReplacement(liveScenario, payload)
      const elapsed = Date.now() - startedAt
      if (elapsed < minVisualDurationMs) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, minVisualDurationMs - elapsed)
        })
      }

      const liveBlocks = useScriptStore.getState().blocks
      const transaction = applyScreenplayReplacementTransaction({
        blocks: liveBlocks,
        payload,
        replacement,
        source: payload.action === "fix_grammar" ? "manual_grammar" : "ai_floating",
      })

      setBlocks(transaction.blocks)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setAiError(message)
    } finally {
      setAiLoading(false)
      setAiRippleRange(null)
    }
  }, [aiLoading, setBlocks])

  const handleUndoAssistant = useCallback((): boolean => {
    const current = useScriptStore.getState()
    const res = undoSnapshot(undoStateRef.current, {
      scenario: current.scenario,
      blocks: current.blocks,
    })
    undoStateRef.current = res.state
    if (!res.snapshot) return false

    setBlocks(res.snapshot.blocks)
    setAiError(null)
    return true
  }, [setBlocks])

  const handleRedoAssistant = useCallback((): boolean => {
    const current = useScriptStore.getState()
    const res = redoSnapshot(undoStateRef.current, {
      scenario: current.scenario,
      blocks: current.blocks,
    })
    undoStateRef.current = res.state
    if (!res.snapshot) return false

    setBlocks(res.snapshot.blocks)
    setAiError(null)
    return true
  }, [setBlocks])

  useEffect(() => {
    if (!active || phase !== "open") return

    const onKeyDown = (event: KeyboardEvent) => {
      const isMod = event.metaKey || event.ctrlKey
      if (!isMod || event.altKey) return

      const targetEl = event.target as HTMLElement | null
      const isInsideSlateEditor = !!targetEl?.closest('[data-slate-editor="true"]')
      if (isInsideSlateEditor) return

      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        const handled = screenplayEditorRef.current?.undo() ?? false
        if (handled) event.preventDefault()
        return
      }

      if (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey)) {
        const handled = screenplayEditorRef.current?.redo() ?? false
        if (handled) event.preventDefault()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [active, phase])

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
    // Read title directly from store so this effect only runs on activation,
    // not on every keystroke while the user types a new title.
    const storeTitle = useScriptStore.getState().title
    const hasExistingTitle = storeTitle.trim().length > 0 && storeTitle !== "UNTITLED"
    setTitleCommitted(hasExistingTitle)
    setShowStartHint(false)
    setShowSecondPage(hasExistingTitle)
    setSecondPageVisible(hasExistingTitle)
  }, [active, type])

  useEffect(() => {
    if (!active || type !== "upload") return
    setTitleCommitted(true)
    setShowStartHint(false)
    setShowSecondPage(true)
    setSecondPageVisible(true)
  }, [active, type])

  useEffect(() => {
    if (!active || phase !== "open" || !showSecondPage) {
      setIsStoryboardPanelOpen(false)
      setIsStoryboardPanelExpanded(false)
    }
  }, [active, phase, showSecondPage])

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
      scrollToWorkspaceTop()
      screenplayEditorRef.current?.focus()
    }, 60)

    return () => window.clearTimeout(timer)
  }, [active, type, phase, scrollToWorkspaceTop, showSecondPage])

  const finalRect = useMemo(
    () => ({
      x: viewport.width / 2 - SCALED_PAGE_WIDTH / 2,
      y: PAGE_TOP,
      width: SCALED_PAGE_WIDTH,
      height: SCALED_PAGE_HEIGHT,
    }),
    [PAGE_TOP, SCALED_PAGE_HEIGHT, SCALED_PAGE_WIDTH, viewport.width]
  )

  const animatedRect = openMotionStarted || phase === "closing" ? finalRect : floatingFromRect
  const overlayPageZoom = PAGE_ZOOM
  const overlayPageBottomGap = Math.max(10, Math.round(PAGE_HEIGHT * Math.max(0, overlayPageZoom - 1)))

  const handleToggleStoryboardFullscreen = () => {
    if (isStoryboardPanelOpen && isStoryboardPanelExpanded) {
      setIsStoryboardPanelOpen(false)
      setIsStoryboardPanelExpanded(false)
      return
    }

    setIsStoryboardPanelOpen(true)
    setIsStoryboardPanelExpanded(true)
  }

  useEffect(() => {
    return () => {
      if (openTimerRef.current) window.clearTimeout(openTimerRef.current)
      if (openCompleteTimerRef.current) window.clearTimeout(openCompleteTimerRef.current)
    }
  }, [])

  const showFloatingSheet = phase === "opening"
  const showStoryboardOnTitlePage = phase === "open" && type === "new" && !showSecondPage

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
            scrollToWorkspaceTop()
          }, 40)
        })
        return
      }

      scrollToWorkspaceTop()
      return
    }
  }

  return (
    <div
      className="fixed inset-0 z-120"
      style={{
        opacity: phase === "hidden" ? 0 : 1,
        transition: "opacity 120ms linear",
        pointerEvents: phase === "hidden" ? "none" : "auto",
      }}
    >
      <div
        className="fixed inset-0 z-1 backdrop-blur-sm"
        style={{
          backgroundColor: OVERLAY_BG,
          opacity: isBackdropVisible ? 1 : 0,
          transition: "opacity 500ms ease",
        }}
      />

      <div ref={scrollContainerRef} className="fixed inset-0 z-2 overflow-hidden">
        <div className="fixed right-16 top-5 z-4 flex items-center gap-2">
          {phase === "open" && (
            <button
              type="button"
              onClick={handleToggleStoryboardFullscreen}
              className="flex h-9 items-center justify-center rounded-md border border-white/12 bg-[#35322F] px-3 text-[11px] uppercase tracking-[0.18em] text-[#D8CEC2] transition-colors hover:bg-[#403B37] hover:text-white"
              aria-label={isStoryboardPanelOpen && isStoryboardPanelExpanded ? "Close storyboard" : "Open storyboard fullscreen"}
              title={isStoryboardPanelOpen && isStoryboardPanelExpanded ? "Close storyboard" : "Open storyboard fullscreen"}
            >
              <span className="mr-2 flex items-center">{isStoryboardPanelOpen && isStoryboardPanelExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</span>
              {isStoryboardPanelOpen && isStoryboardPanelExpanded ? "Close Storyboard" : "Storyboard"}
            </button>
          )}
        </div>

        <div
          className="relative z-2 h-full px-6"
          style={{
            paddingTop: PAGE_TOP,
            paddingBottom: 0,
          }}
        >
          {phase === "open" && type === "new" && !showSecondPage && (
            <div
              className="relative flex h-full w-screen max-w-none items-stretch justify-center overflow-hidden transition-opacity duration-300"
              style={{
                height: `calc(100dvh - ${PAGE_TOP}px)`,
              }}
            >
              <div
                className="relative flex h-full w-full items-stretch justify-center overflow-visible transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  opacity: showStoryboardOnTitlePage && isStoryboardPanelExpanded ? 0 : 1,
                  transform: "translateX(0)",
                  pointerEvents: showStoryboardOnTitlePage && isStoryboardPanelExpanded ? "none" : "auto",
                }}
              >
                <div
                  ref={screenplayPaneRef}
                  className="h-full w-full overflow-y-auto overflow-x-hidden"
                  style={{ overscrollBehaviorY: "contain" }}
                >
                  <div
                    className="flex min-h-full items-start justify-center px-6 pb-10 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                    style={{
                      transform: showStoryboardOnTitlePage && isStoryboardPanelOpen && !isStoryboardPanelExpanded
                        ? `translateX(-${Math.round(storyboardPanelWidth / 2)}px)`
                        : "translateX(0)",
                    }}
                  >
                    <div
                      ref={openSheetRef}
                      className="relative rounded-[3px] border border-[#E5E0DB] bg-white shadow-[0_8px_60px_rgba(0,0,0,0.4)] transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                      style={{
                        width: PAGE_WIDTH,
                        minHeight: PAGE_HEIGHT,
                        transform: `scale(${overlayPageZoom})`,
                        transformOrigin: "top center",
                        marginBottom: overlayPageBottomGap,
                      }}
                    >
                      {type === "new" && (
                        <div className="relative w-full" style={{ height: PAGE_HEIGHT }}>
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
                    </div>
                  </div>
                </div>
              </div>

              {showStoryboardOnTitlePage && (
                <StoryboardPanel
                  isOpen={isStoryboardPanelOpen}
                  isExpanded={isStoryboardPanelExpanded}
                  panelWidth={storyboardPanelWidth}
                  backgroundColor={OVERLAY_BG}
                  onClose={() => {
                    setIsStoryboardPanelOpen(false)
                    setIsStoryboardPanelExpanded(false)
                  }}
                  onToggleExpanded={() => {
                    setIsStoryboardPanelOpen((currentOpen) => !currentOpen)
                    setIsStoryboardPanelExpanded(false)
                  }}
                />
              )}
            </div>
          )}

          {phase === "open" && (type === "new" || type === "upload") && showSecondPage && (
                <div
                  className="relative -mx-6 flex h-full w-screen max-w-none items-stretch overflow-hidden transition-opacity duration-300"
                  style={{
                    opacity: secondPageVisible ? 1 : 0,
                    height: `calc(100dvh - ${PAGE_TOP}px)`,
                  }}
                >
                  <div
                    className="relative flex h-full w-full items-stretch justify-center overflow-visible transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                    style={{
                      opacity: isStoryboardPanelExpanded ? 0 : 1,
                      transform: "translateX(0)",
                      pointerEvents: isStoryboardPanelExpanded ? "none" : "auto",
                    }}
                  >
                    <div
                      ref={screenplayPaneRef}
                      className="h-full w-full overflow-y-auto overflow-x-hidden"
                      style={{ overscrollBehaviorY: "contain" }}
                    >
                      <div
                        className="flex min-h-full items-start justify-center px-6 pb-10 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                        style={{
                          transform: isStoryboardPanelOpen && !isStoryboardPanelExpanded
                            ? `translateX(-${Math.round(storyboardPanelWidth / 2)}px)`
                            : "translateX(0)",
                        }}
                      >
                        <div
                          className="relative transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                          style={{
                            transform: `scale(${overlayPageZoom})`,
                            transformOrigin: "top center",
                            cursor: "text",
                            marginBottom: overlayPageBottomGap,
                          }}
                          onClick={(e) => {
                            const target = e.target as HTMLElement
                            if (target.closest('[data-slate-editor="true"]')) return
                            screenplayEditorRef.current?.focus()
                          }}
                        >
                          {type === "upload" && (
                            <>
                              <input
                                ref={uploadInputRef}
                                type="file"
                                accept=".txt,.fountain,.fdx,.md,.rtf"
                                className="hidden"
                                onChange={(event) => {
                                  const file = event.target.files?.[0]
                                  if (!file) return
                                  void handleUploadFile(file)
                                  event.currentTarget.value = ""
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => uploadInputRef.current?.click()}
                                className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-md border border-[#E5E0DB] bg-white/90 px-2.5 py-1 text-xs text-[#6F6459] shadow-sm"
                                title="Upload screenplay file"
                              >
                                <Upload size={12} />
                                <span>Upload file</span>
                              </button>
                            </>
                          )}

                          <SlateScreenplayEditor
                            embedded
                            ref={screenplayEditorRef}
                            aiRippleRange={aiRippleRange}
                            onSelectionAction={handleSelectionAction}
                            onRequestUndo={handleUndoAssistant}
                            onRequestRedo={handleRedoAssistant}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <StoryboardPanel
                    isOpen={isStoryboardPanelOpen}
                    isExpanded={isStoryboardPanelExpanded}
                    panelWidth={storyboardPanelWidth}
                    backgroundColor={OVERLAY_BG}
                    onClose={() => {
                      setIsStoryboardPanelOpen(false)
                      setIsStoryboardPanelExpanded(false)
                    }}
                    onToggleExpanded={() => {
                      setIsStoryboardPanelOpen((currentOpen) => !currentOpen)
                      setIsStoryboardPanelExpanded(false)
                    }}
                  />
                </div>
          )}
        </div>
      </div>

      {visible && (
        <div className="fixed bottom-6 right-6 z-5 rounded-md bg-[#1f1b17]/55 px-3 py-1 text-xs text-white/80 backdrop-blur-sm">
          {status === "saving" ? <span className="animate-pulse">Saving...</span> : <span>Saved</span>}
        </div>
      )}

      {aiLoading && (
        <div className="fixed bottom-16 right-6 z-6 rounded-md bg-[#1f1b17]/70 px-3 py-1 text-xs text-white/90 backdrop-blur-sm">
          {aiStatus}
        </div>
      )}

      {aiError && !aiLoading && (
        <button
          type="button"
          onClick={() => setAiError(null)}
          className="fixed bottom-16 right-6 z-6 max-w-85 rounded-md bg-[#7b2d2d]/90 px-3 py-1 text-left text-xs text-white backdrop-blur-sm"
          title="Dismiss AI error"
        >
          AI edit error: {aiError}
        </button>
      )}

      {uploadError && (
        <button
          type="button"
          onClick={() => setUploadError(null)}
          className="fixed bottom-28 right-6 z-6 max-w-85 rounded-md bg-[#7b2d2d]/90 px-3 py-1 text-left text-xs text-white backdrop-blur-sm"
          title="Dismiss upload error"
        >
          Upload error: {uploadError}
        </button>
      )}

      {showFloatingSheet && animatedRect && initialRect && (
        <div
          className="fixed z-3 rounded-[3px] border border-[#E5E0DB] bg-white shadow-[0_8px_60px_rgba(0,0,0,0.4)]"
          style={{
            left: animatedRect.x,
            top: animatedRect.y,
            width: animatedRect.width,
            height: animatedRect.height,
            transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      )}
    </div>
  )
}
