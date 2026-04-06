"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Upload } from "lucide-react"
import { ScreenplayCommandBar, CommandBarTrigger } from "@/components/editor/screenplay/ScreenplayCommandBar"
import { SceneNavigatorButton } from "@/components/editor/screenplay/SceneNavigator"
import { useScreenplaySettings } from "@/store/screenplaySettings"
import { AmbientFocusMode } from "@/components/editor/screenplay/AmbientFocusMode"
import { useAutosave } from "@/hooks/useAutosave"
import SlateScreenplayEditor from "@/components/editor/SlateScreenplayEditor"
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
import { useSyncOrchestrator } from "@/hooks/useSyncOrchestrator"

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

  // Bidirectional sync: screenplay ↔ scenes ↔ timeline ↔ voice
  useSyncOrchestrator()

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

  const scrollToWorkspaceTop = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: "auto" })
    }

    if (screenplayPaneRef.current) {
      screenplayPaneRef.current.scrollTo({ top: 0, behavior: "auto" })
    }
  }, [])

  // Cmd+F → toggle Focus Mode (override browser find)
  const isFocusMode = useScreenplaySettings((s) => s.focusMode)
  const toggleFocusMode = useScreenplaySettings((s) => s.toggleFocusMode)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f" && !e.shiftKey) {
        e.preventDefault()
        toggleFocusMode()
      }
    }
    window.addEventListener("keydown", handler, true)
    return () => window.removeEventListener("keydown", handler, true)
  }, [toggleFocusMode])

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
      const isGrammarFix = payload.action === "fix_grammar"
      const minVisualDurationMs = isGrammarFix ? 800 : 3000
      const liveScenario = useScriptStore.getState().scenario
      const liveBlocksBefore = useScriptStore.getState().blocks

      // For block-mode (Shift+Enter), find the block's position in the exported scenario
      let rippleStart: number
      let rippleEnd: number

      if (payload.targetMode === "block" && payload.blockId) {
        // Calculate accurate position by finding the block text in the exported scenario
        const blockText = payload.selectedText.trim()
        const idx = liveScenario.indexOf(blockText)
        if (idx >= 0) {
          rippleStart = idx
          rippleEnd = idx + blockText.length
        } else {
          rippleStart = Math.max(0, payload.selectionStart)
          rippleEnd = Math.max(rippleStart + 1, payload.selectionEnd)
        }
      } else {
        const liveRange = resolveSelectionRange(
          liveScenario,
          payload.selectionStart,
          payload.selectionEnd,
          payload.selectedText
        )
        rippleStart = liveRange?.start ?? Math.max(0, payload.selectionStart)
        rippleEnd = liveRange?.end ?? Math.max(rippleStart + 1, payload.selectionEnd)
      }

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
    if (!active) return

    // No initialRect = direct open (from ProjectsScreen), skip animation
    if (!initialRect) {
      setPhase("open")
      setBackdropVisible(true)
      setOpenMotionStarted(true)
      setFloatingFromRect(null)
      return
    }

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
    const storeBlocks = useScriptStore.getState().blocks
    const hasContent = (storeTitle.trim().length > 0 && storeTitle !== "UNTITLED") || storeBlocks.length > 1
    setTitleCommitted(hasContent)
    setShowStartHint(false)
    setShowSecondPage(hasContent)
    setSecondPageVisible(hasContent)
  }, [active, type])

  useEffect(() => {
    if (!active || type !== "upload") return
    setTitleCommitted(true)
    setShowStartHint(false)
    setShowSecondPage(true)
    setSecondPageVisible(true)
  }, [active, type])


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


  useEffect(() => {
    return () => {
      if (openTimerRef.current) window.clearTimeout(openTimerRef.current)
      if (openCompleteTimerRef.current) window.clearTimeout(openCompleteTimerRef.current)
    }
  }, [])

  const showFloatingSheet = phase === "opening"

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
      {/* Ambient focus mode — background layer */}
      <AmbientFocusMode />

      <div
        className={`fixed inset-0 z-1 ${isFocusMode ? "" : "backdrop-blur-sm"}`}
        style={{
          backgroundColor: isFocusMode ? "transparent" : OVERLAY_BG,
          opacity: isBackdropVisible ? 1 : 0,
          transition: "opacity 500ms ease",
          pointerEvents: isFocusMode ? "none" : "auto",
        }}
      />

      <div ref={scrollContainerRef} className="fixed inset-0 z-2 overflow-hidden">

        <div
          className="relative z-2 h-full px-6"
          style={{
            paddingTop: isFocusMode ? 0 : PAGE_TOP,
            paddingBottom: 0,
          }}
        >
          {phase === "open" && type === "new" && !showSecondPage && (
            <div
              className="relative flex h-full w-screen max-w-none items-stretch justify-center overflow-hidden transition-opacity duration-300"
              style={{
                height: isFocusMode ? "100dvh" : `calc(100dvh - ${PAGE_TOP}px)`,
              }}
            >
              <div
                className="relative flex h-full w-full items-stretch justify-center overflow-visible"
              >
                <div
                  ref={screenplayPaneRef}
                  className="h-full w-full overflow-y-auto overflow-x-hidden"
                  style={{ overscrollBehaviorY: "contain" }}
                >
                  <div
                    className="flex min-h-full items-start justify-center px-6 pb-10"
                  >
                    <div
                      ref={openSheetRef}
                      className={`relative rounded-[3px] ${isFocusMode ? "border-none bg-transparent shadow-none" : "border border-[#E5E0DB] bg-white shadow-[0_8px_60px_rgba(0,0,0,0.4)]"}`}
                      style={{
                        width: PAGE_WIDTH,
                        minHeight: PAGE_HEIGHT,
                        transform: `scale(${overlayPageZoom})`,
                        transformOrigin: "top center",
                        marginBottom: overlayPageBottomGap,
                      }}
                    >
                      {type === "new" && (
                        <div className="relative w-full" style={{ height: PAGE_HEIGHT, fontFamily: '"Courier New", Courier, monospace' }}>
                          {/* Title — centered at ~40% from top (standard screenplay) */}
                          <div className="absolute left-0 right-0" style={{ top: "33%" }}>
                            <div className="mx-auto text-center" style={{ paddingLeft: 108, paddingRight: 72 }}>
                              <input
                                ref={titleInputRef}
                                value={title === "UNTITLED" && !titleCommitted ? "" : title}
                                onChange={(event) => {
                                  setTitle(event.target.value.toUpperCase())
                                }}
                                onKeyDown={handleTitleEnter}
                                placeholder="TITLE"
                                className="w-full bg-transparent text-center text-[12pt] font-bold uppercase text-[#1a1a1a] outline-none placeholder:text-[#C4B9AC]"
                                style={{ fontFamily: '"Courier New", Courier, monospace', lineHeight: "1" }}
                              />
                            </div>
                          </div>

                          {/* Written by + Author — centered, below title */}
                          <div
                            className={`absolute left-0 right-0 transition-opacity duration-300 ${revealMeta ? "opacity-100" : "opacity-0"}`}
                            style={{ top: "40%" }}
                          >
                            <div className="mx-auto text-center" style={{ paddingLeft: 108, paddingRight: 72 }}>
                              <p className="text-[12pt] text-[#1a1a1a]" style={{ fontFamily: '"Courier New", Courier, monospace', lineHeight: "2" }}>
                                {writtenByLabel}
                              </p>
                              <input
                                value={author}
                                onChange={(event) => setAuthor(event.target.value)}
                                placeholder={isCyrillicTitle ? "Имя автора" : "Author name"}
                                className="w-full bg-transparent text-center text-[12pt] text-[#1a1a1a] outline-none placeholder:text-[#C4B9AC]"
                                style={{ fontFamily: '"Courier New", Courier, monospace', lineHeight: "1" }}
                              />
                            </div>
                          </div>

                          {/* Draft + Date — bottom left (standard screenplay placement) */}
                          <div
                            className={`absolute transition-opacity duration-300 ${revealMeta ? "opacity-100" : "opacity-0"}`}
                            style={{ bottom: 72, left: 108 }}
                          >
                            <div className="flex flex-col gap-0 text-left">
                              <div className="flex items-baseline gap-0">
                                <input
                                  value={draft}
                                  onChange={(event) => setDraft(event.target.value)}
                                  className="bg-transparent text-left text-[12pt] text-[#1a1a1a] outline-none"
                                  style={{ fontFamily: '"Courier New", Courier, monospace', lineHeight: "2", width: 200 }}
                                />
                              </div>
                              <input
                                value={date}
                                onChange={(event) => setDate(event.target.value)}
                                className="bg-transparent text-left text-[12pt] text-[#1a1a1a] outline-none"
                                style={{ fontFamily: '"Courier New", Courier, monospace', lineHeight: "2", width: 200 }}
                              />
                            </div>
                          </div>

                          {showStartHint && (
                            <div className="absolute bottom-6 left-0 right-0 text-center text-[10pt] text-[#B5ABA0]" style={{ fontFamily: '"Courier New", Courier, monospace' }}>
                              {startWritingLabel}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {phase === "open" && (type === "new" || type === "upload") && showSecondPage && (
                <div
                  className="relative -mx-6 flex h-full w-screen max-w-none items-stretch overflow-hidden transition-opacity duration-300"
                  style={{
                    opacity: secondPageVisible ? 1 : 0,
                    height: isFocusMode ? "100dvh" : `calc(100dvh - ${PAGE_TOP}px)`,
                  }}
                >
                  <div
                    className="relative flex h-full w-full items-stretch justify-center overflow-visible"
                  >
                    <div
                      ref={screenplayPaneRef}
                      className="h-full w-full overflow-y-auto overflow-x-hidden"
                      style={{ overscrollBehaviorY: "contain" }}
                    >
                      <div
                        className="flex min-h-full items-start justify-center px-6 pb-10"
                      >
                        <div
                          className="relative"
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
                            focusMode={isFocusMode}
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
                </div>
          )}
        </div>
      </div>

      {visible && !isFocusMode && (
        <div className="fixed bottom-6 right-6 z-5 rounded-md bg-[#1f1b17]/55 px-3 py-1 text-xs text-white/80 backdrop-blur-sm">
          {status === "saving" ? <span className="animate-pulse">Saving...</span> : <span>Saved</span>}
        </div>
      )}

      {aiLoading && !isFocusMode && (
        <div className="fixed bottom-16 right-6 z-6 rounded-md bg-[#1f1b17]/70 px-3 py-1 text-xs text-white/90 backdrop-blur-sm">
          {aiStatus}
        </div>
      )}

      {!isFocusMode && <CommandBarTrigger />}
      <ScreenplayCommandBar />
      <KeyboardHints />
      <ViewModeButton />
      <SceneNavigatorButton />

      {aiError && !aiLoading && !isFocusMode && (
        <button
          type="button"
          onClick={() => setAiError(null)}
          className="fixed bottom-16 right-6 z-6 max-w-85 rounded-md bg-[#7b2d2d]/90 px-3 py-1 text-left text-xs text-white backdrop-blur-sm"
          title="Dismiss AI error"
        >
          AI edit error: {aiError}
        </button>
      )}

      {uploadError && !isFocusMode && (
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

function ViewModeButton() {
  const [open, setOpen] = useState(false)
  const viewMode = useScreenplaySettings((s) => s.viewMode)
  const setViewMode = useScreenplaySettings((s) => s.setViewMode)
  const focusMode = useScreenplaySettings((s) => s.focusMode)
  const toggleFocusMode = useScreenplaySettings((s) => s.toggleFocusMode)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  // Auto-close after 4s
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => setOpen(false), 4000)
    return () => clearTimeout(t)
  }, [open])

  // Close when other popups open
  useEffect(() => {
    const handler = () => setOpen(false)
    window.addEventListener("koza-popup-open", handler)
    return () => window.removeEventListener("koza-popup-open", handler)
  }, [])

  const modes = [
    { id: "single" as const, label: "Single Page", icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="4" y="1" width="8" height="14" rx="1" />
      </svg>
    )},
    { id: "spread" as const, label: "Two Pages", icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="1" y="2" width="6" height="12" rx="1" />
        <rect x="9" y="2" width="6" height="12" rx="1" />
      </svg>
    )},
    { id: "scroll" as const, label: "Continuous", icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="4" y="0" width="8" height="16" rx="1" />
        <line x1="6" y1="4" x2="10" y2="4" strokeWidth="0.8" strokeOpacity="0.4" />
        <line x1="6" y1="7" x2="10" y2="7" strokeWidth="0.8" strokeOpacity="0.4" />
        <line x1="6" y1="10" x2="10" y2="10" strokeWidth="0.8" strokeOpacity="0.4" />
      </svg>
    )},
  ]

  return (
    <>
      <button
        type="button"
        onClick={() => { const next = !open; setOpen(next); if (next) window.dispatchEvent(new Event("koza-popup-open")) }}
        title="View mode"
        style={{
          position: "fixed",
          left: 18,
          top: 122,
          zIndex: 500,
          pointerEvents: "auto",
          width: 42,
          height: 42,
          borderRadius: "50%",
          border: open ? "1px solid rgba(212, 168, 83, 0.3)" : "1px solid rgba(255,255,255,0.08)",
          background: open ? "rgba(212, 168, 83, 0.12)" : "rgba(255,255,255,0.05)",
          color: open ? "#D4A853" : "rgba(255,255,255,0.35)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="1" y="1" width="6" height="6" rx="1" />
          <rect x="9" y="1" width="6" height="6" rx="1" />
          <rect x="1" y="9" width="6" height="6" rx="1" />
          <rect x="9" y="9" width="6" height="6" rx="1" />
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            left: 14,
            top: 172,
            zIndex: 500,
            pointerEvents: "auto",
            userSelect: "none",
            fontFamily: "system-ui, sans-serif",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            background: "rgba(30, 30, 30, 0.9)",
            backdropFilter: "blur(12px)",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)",
            padding: 6,
          }}
        >
          {modes.map((mode) => {
            const active = viewMode === mode.id
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => { setViewMode(mode.id); setOpen(false) }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: active ? "rgba(212, 168, 83, 0.15)" : "transparent",
                  color: active ? "#D4A853" : "rgba(255,255,255,0.4)",
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.06)" }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent" }}
              >
                {mode.icon}
                <span>{mode.label}</span>
              </button>
            )
          })}
          {/* Separator */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "2px 8px" }} />
          {/* Focus Mode */}
          <button
            type="button"
            onClick={() => { toggleFocusMode(); setOpen(false) }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 12px",
              borderRadius: 6,
              border: "none",
              background: focusMode ? "rgba(212, 168, 83, 0.15)" : "transparent",
              color: focusMode ? "#D4A853" : "rgba(255,255,255,0.4)",
              fontSize: 13,
              cursor: "pointer",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => { if (!focusMode) e.currentTarget.style.background = "rgba(255,255,255,0.06)" }}
            onMouseLeave={(e) => { if (!focusMode) e.currentTarget.style.background = "transparent" }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
              <circle cx="8" cy="8" r="6" />
              <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
            </svg>
            <span>Focus Mode</span>
          </button>
        </div>
      )}
    </>
  )
}

interface HintItem {
  keys: string
  desc: string
  action?: () => void
}

function KeyboardHints() {
  const [open, setOpen] = useState(false)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const settings = useScreenplaySettings()
  const hintsPanelRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (hintsPanelRef.current && !hintsPanelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  // Auto-close after 5s
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => setOpen(false), 5000)
    return () => clearTimeout(t)
  }, [open])

  // Close when other popups open
  useEffect(() => {
    const handler = () => setOpen(false)
    window.addEventListener("koza-popup-open", handler)
    return () => window.removeEventListener("koza-popup-open", handler)
  }, [])

  const sendKey = useCallback((key: string, opts?: { shift?: boolean; meta?: boolean }) => {
    setOpen(false)
    setTimeout(() => {
      const el = document.querySelector(".slate-screenplay-editor") as HTMLElement | null
      if (!el) return
      el.focus()
      el.dispatchEvent(new KeyboardEvent("keydown", {
        key, code: `Key${key.toUpperCase()}`,
        shiftKey: opts?.shift ?? false,
        metaKey: opts?.meta ?? false,
        ctrlKey: false,
        bubbles: true, cancelable: true,
      }))
    }, 50)
  }, [])

  const hints: HintItem[] = useMemo(() => [
    { keys: "Shift ↵", desc: "AI fix", action: () => sendKey("Enter", { shift: true }) },
    { keys: "⌘ /", desc: "Commands", action: () => { settings.setCommandBarOpen(true); setOpen(false) } },
    { keys: "Tab", desc: "Cycle type", action: () => sendKey("Tab") },
    { keys: "⌘ B", desc: "Bold", action: () => sendKey("b", { meta: true }) },
    { keys: "⌘ I", desc: "Italic", action: () => sendKey("i", { meta: true }) },
    { keys: "⌘⇧ I", desc: "INT.", action: () => sendKey("i", { meta: true, shift: true }) },
    { keys: "⌘⇧ E", desc: "EXT.", action: () => sendKey("e", { meta: true, shift: true }) },
    { keys: "⌘⇧ C", desc: "Character", action: () => sendKey("c", { meta: true, shift: true }) },
    { keys: "⌘⇧ T", desc: "Transition", action: () => sendKey("t", { meta: true, shift: true }) },
    { keys: "(", desc: "Parenthetical", action: () => sendKey("(") },
    { keys: "─", desc: "─────────" },
    { keys: "◯", desc: settings.bibleMarkers ? "Hide markers" : "Show markers", action: () => { settings.toggleBibleMarkers(); setOpen(false) } },
    { keys: "♪", desc: settings.typewriterSound ? "Sound off" : "Sound on", action: () => { settings.toggleTypewriterSound(); setOpen(false) } },
  ], [settings, sendKey])

  return (
    <>
      <button
        type="button"
        onClick={() => { const next = !open; setOpen(next); if (next) window.dispatchEvent(new Event("koza-popup-open")) }}
        title="Keyboard shortcuts"
        style={{
          position: "fixed",
          left: 18,
          top: 72,
          zIndex: 200,
          width: 42,
          height: 42,
          borderRadius: "50%",
          border: open ? "1px solid rgba(212, 168, 83, 0.3)" : "1px solid rgba(255,255,255,0.08)",
          background: open ? "rgba(212, 168, 83, 0.12)" : "rgba(255,255,255,0.05)",
          color: open ? "#D4A853" : "rgba(255,255,255,0.35)",
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "system-ui, sans-serif",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s",
        }}
      >
        ?
      </button>

      {open && (
        <div
          ref={hintsPanelRef}
          style={{
            position: "fixed",
            left: 14,
            top: 134,
            zIndex: 200,
            userSelect: "none",
            fontFamily: "system-ui, sans-serif",
            display: "flex",
            flexDirection: "column",
            gap: 13,
          }}
        >
          {hints.map(({ keys, desc, action }, i) => {
            const isSeparator = keys === "─"
            if (isSeparator) {
              return <div key={i} style={{ height: 1, width: 156, background: "rgba(255,255,255,0.06)", margin: "2px 0" }} />
            }
            const isHovered = hoveredIdx === i
            return (
              <div
                key={keys + desc}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={action}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 9,
                  cursor: action ? "pointer" : "default",
                  padding: "5px 10px",
                  marginLeft: -10,
                  borderRadius: 8,
                  background: isHovered && action ? "rgba(255, 255, 255, 0.06)" : "transparent",
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: isHovered && action ? "rgba(212, 168, 83, 0.7)" : "rgba(255,255,255,0.3)",
                  whiteSpace: "nowrap",
                  minWidth: 72,
                  textAlign: "right",
                  transition: "color 0.15s",
                }}>
                  {keys}
                </span>
                <span style={{
                  fontSize: 14,
                  color: isHovered && action ? "rgba(212, 168, 83, 0.5)" : "rgba(255,255,255,0.18)",
                  transition: "color 0.15s",
                }}>
                  {desc}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
