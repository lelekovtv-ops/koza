"use client"

import { useMemo, useState, useCallback, useRef, useEffect } from "react"
import { textToSegments } from "@/lib/segmentEngine"
import { usePanelsStore, type PanelId } from "@/store/panels"
import { usePieceSessionStore, type ChatMessage } from "@/store/pieceSession"
import { CommandBar } from "@/components/piece/CommandBar"
import { FloatingPanel } from "@/components/piece/FloatingPanel"
import { VerticalTimeline } from "@/components/piece/VerticalTimeline"
import { EmotionCurves } from "@/components/piece/EmotionCurves"
import { ImageGenerator } from "@/components/piece/ImageGenerator"
import { SessionDrawer } from "@/components/piece/SessionDrawer"
import { useHandTracking } from "@/hooks/useHandTracking"
import { GestureTestOverlay } from "@/components/piece/GestureTestOverlay"
import { PhotoSearch3D } from "@/components/piece/PhotoSearch3D"
import { route as routeCommand, type RouteResult } from "@/lib/router/commandRouter"
import { executeGeneration, executeScriptEdit, executeChat, type WorkerCallbacks } from "@/lib/router/workers"

// Script block utilities (extracted to shared module)
import { parseScriptBlocks } from "@/lib/scriptUtils"

export default function PiecePage() {
  // ── Session store ──
  const sessionStore = usePieceSessionStore()
  const session = sessionStore.activeSession()

  // Client mount flag (prevents hydration mismatch)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Auto-create session if none
  useEffect(() => {
    if (mounted && !session) sessionStore.createSession()
  }, [mounted, session]) // eslint-disable-line react-hooks/exhaustive-deps

  // Session data
  const scriptText = session?.scriptText ?? ""
  const messages = session?.messages ?? []
  const activePanel = session?.activePanel ?? null

  const setScriptText = useCallback((text: string) => sessionStore.setScript(text), [sessionStore])
  const addMessage = useCallback((msg: ChatMessage) => sessionStore.addMessage(msg), [sessionStore])

  // Local UI state (not persisted)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [gestureMode, setGestureMode] = useState(false)
  const [gestureTestOpen, setGestureTestOpen] = useState(false)
  const [photoSearchOpen, setPhotoSearchOpen] = useState(false)
  const [photoSearchQuery, setPhotoSearchQuery] = useState("")
  const [scriptZoom, setScriptZoom] = useState(1)
  const { hand, cameraReady } = useHandTracking(gestureMode)
  const scriptScrollRef = useRef<HTMLPreElement>(null)
  const palmZoomRef = useRef<{ active: boolean; startY: number; startScale: number }>({ active: false, startY: 0, startScale: 1 })
  const [currentTime, setCurrentTime] = useState(0)
  const [streamingText, setStreamingText] = useState("")
  const [streamingScript, setStreamingScript] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [generatePrompt, setGeneratePrompt] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const { segments, sections } = useMemo(() => textToSegments(scriptText), [scriptText])
  const { openPanel } = usePanelsStore()
  const scriptPanelVisible = usePanelsStore((s) => s.panels.script.visible)

  // Display text = last assistant message on screen (not script)
  const displayText = streamingText || messages.filter((m) => m.role === "assistant").at(-1)?.text || ""
  const lastUserText = messages.filter((m) => m.role === "user").at(-1)?.text || ""

  // Live update script panel during streaming
  useEffect(() => {
    if (streamingScript) {
      setScriptText(streamingScript)
    }
  }, [streamingScript])

  const MAX_DISPLAY_LINES = 6

  const displayLines = useMemo(() => {
    if (!displayText) return []
    const all = displayText.split("\n").filter((l) => l.trim()).map((line, i) => ({
      text: line,
      isQuestion: /^\d+[\.\)]\s/.test(line.trim()) || /^[-•]\s/.test(line.trim()),
      key: i,
    }))
    return all.slice(0, MAX_DISPLAY_LINES)
  }, [displayText])

  // Sync open panels to session
  const allPanels = usePanelsStore((s) => s.panels)
  const visiblePanels = useMemo(() => {
    const order: PanelId[] = ["script", "generator", "timeline", "emotions", "plan"]
    return order.filter((id) => allPanels[id].visible && !allPanels[id].minimized)
  }, [allPanels])

  const panelTitles: Record<PanelId, string> = {
    script: "Script",
    timeline: "Timeline",
    emotions: "Emotions",
    plan: "Production",
    inspector: "Inspector",
    generator: "Generator",
  }

  const hasLeftPanel = visiblePanels.length > 0

  // Active panel navigation (arrow keys + gestures)
  const [activePanelIdx, setActivePanelIdx] = useState(0)

  // Keep activePanelIdx in bounds
  useEffect(() => {
    if (visiblePanels.length > 0 && activePanelIdx >= visiblePanels.length) {
      setActivePanelIdx(visiblePanels.length - 1)
    }
  }, [visiblePanels.length, activePanelIdx])

  // Arrow keys ← → to navigate panels
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (visiblePanels.length < 2) return
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        setActivePanelIdx(i => Math.max(0, i - 1))
      }
      if (e.key === "ArrowRight") {
        e.preventDefault()
        setActivePanelIdx(i => Math.min(visiblePanels.length - 1, i + 1))
      }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [visiblePanels.length])

  // Script blocks (live parsed from scriptText)
  const scriptBlocks = useMemo(() => parseScriptBlocks(scriptText), [scriptText])

  // ── Worker callbacks (shared by all workers) ──
  const workerCb: WorkerCallbacks = useMemo(() => ({
    setStreamingText,
    setStreamingScript,
    setScriptText,
    setIsStreaming,
    setThinking,
    addMessage,
    openPanel,
    setGeneratePrompt,
    abortRef,
  }), [setScriptText, addMessage, openPanel]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Classifying state (for "understanding..." indicator) ──
  const [classifying, setClassifying] = useState(false)

  // ── Main command handler — routes through commandRouter ──
  const handleSubmit = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return

    const trimmed = text.trim()

    // Route through three-tier system
    setClassifying(true)
    const result = await routeCommand(trimmed, { hasScript: !!scriptText.trim() })
    setClassifying(false)

    // ── UI commands — execute instantly ──
    if (result.category === "UI_COMMAND") {
      const intent = result.intent
      switch (intent.type) {
        case "open_panel":   openPanel(intent.panel); break
        case "close_panel":  usePanelsStore.getState().closePanel(intent.panel); break
        case "close_all":    usePanelsStore.getState().closeAll(); break
        case "new_session":  usePanelsStore.getState().closeAll(); sessionStore.createSession(); break
        case "open_sessions": setDrawerOpen(true); break
        case "gesture_test":
          if (!gestureMode) setGestureMode(true)
          setGestureTestOpen(true)
          break
        case "run_generation": break // TODO
        case "smart_distribute": break // TODO
      }
      return
    }

    // ── Photo search — open 3D overlay ──
    if (result.category === "PHOTO_SEARCH" && result.intent.type === "photo_search") {
      setPhotoSearchQuery(result.intent.query)
      setPhotoSearchOpen(true)
      return
    }

    // ── Creative commands — add user message and dispatch to worker ──
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", text: trimmed }
    addMessage(userMsg)
    setStreamingText("")
    setThinking(true)
    setIsStreaming(true)

    switch (result.category) {
      case "GENERATION":
        await executeGeneration({ text: trimmed, scriptText, cb: workerCb })
        break
      case "SCRIPT_EDIT":
        await executeScriptEdit({ text: trimmed, scriptText, cb: workerCb })
        break
      case "CREATIVE_CHAT":
        await executeChat({ text: trimmed, messages, cb: workerCb })
        break
    }
  }, [isStreaming, messages, scriptText, workerCb, openPanel, sessionStore, gestureMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Gesture zoom for script panel (open palm) ──
  useEffect(() => {
    if (!gestureMode || !hand.detected || !cameraReady || !scriptPanelVisible || gestureTestOpen || drawerOpen) {
      palmZoomRef.current.active = false
      return
    }
    const pm = palmZoomRef.current
    if (hand.gesture === "open_palm") {
      if (!pm.active) {
        pm.active = true
        pm.startY = hand.y
        pm.startScale = scriptZoom
      } else {
        const dy = pm.startY - hand.y
        setScriptZoom(Math.max(0.8, Math.min(1.4, pm.startScale + dy * 6)))
      }
    } else {
      pm.active = false
    }
    if (hand.gesture === "fist") {
      setScriptZoom(1)
    }
  }, [hand, gestureMode, cameraReady, scriptPanelVisible, gestureTestOpen, drawerOpen, scriptZoom])

  // ── Two fingers: vertical = scroll, horizontal = switch panels ──
  const twoFingerRef = useRef<{ active: boolean; startX: number; startY: number; switched: boolean }>({ active: false, startX: 0, startY: 0, switched: false })
  useEffect(() => {
    if (!gestureMode || !hand.detected || !cameraReady || gestureTestOpen) {
      twoFingerRef.current.active = false
      return
    }
    const tf = twoFingerRef.current
    if (hand.gesture === "two_fingers") {
      if (!tf.active) {
        tf.active = true
        tf.startX = hand.x
        tf.startY = hand.y
        tf.switched = false
      } else {
        const dx = hand.x - tf.startX
        const dy = hand.y - tf.startY

        // Horizontal → switch panels (threshold 0.1)
        if (!tf.switched && Math.abs(dx) > 0.1 && visiblePanels.length > 1) {
          tf.switched = true
          if (dx > 0) setActivePanelIdx(i => Math.max(0, i - 1))
          else setActivePanelIdx(i => Math.min(visiblePanels.length - 1, i + 1))
        }

        // Vertical → scroll
        if (!tf.switched && Math.abs(dy) > 0.008) {
          const scrollAmount = (dy - Math.sign(dy) * 0.008) * 40
          const target = scriptScrollRef.current || document.documentElement
          target.scrollBy({ top: scrollAmount })
          tf.startY = hand.y
        }
      }
    } else {
      tf.active = false
    }
  }, [hand, gestureMode, cameraReady, gestureTestOpen, visiblePanels.length])

  // ── Arrow keys scroll script panel ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!scriptPanelVisible || !scriptScrollRef.current) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "ArrowDown") {
        e.preventDefault()
        scriptScrollRef.current.scrollBy({ top: 60, behavior: "smooth" })
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        scriptScrollRef.current.scrollBy({ top: -60, behavior: "smooth" })
      }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [scriptPanelVisible])

  return (
    <div className="fixed inset-0 bg-[#0e0e0d]">
      {/* Session name + active panel context */}
      {mounted && session && (
        <div className="absolute left-5 top-14 z-50 flex items-center gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="group flex items-center gap-2 rounded-md px-2 py-1 -ml-2 transition-colors hover:bg-white/[0.04]"
          >
            <svg className="text-white/15 transition-colors group-hover:text-white/30" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h12M2 8h12M2 12h12" />
            </svg>
            <span className="text-[10px] font-medium tracking-wider text-white/15 transition-colors group-hover:text-white/30">{session.name}</span>
          </button>
          {visiblePanels.length > 0 && (
            <>
              <span className="text-white/8">&middot;</span>
              <span className="text-[10px] tracking-wider text-[#D4A853]/30">
                {panelTitles[visiblePanels[visiblePanels.length - 1]]}
              </span>
            </>
          )}
        </div>
      )}

      {/* Session drawer */}
      <SessionDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} gestureMode={gestureMode} onToggleGesture={() => setGestureMode(g => !g)} hand={hand} cameraReady={cameraReady} />


      {/* Ambient depth */}
      <div className="pointer-events-none absolute inset-0" style={{
        background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(40,36,30,1) 0%, rgba(18,17,15,1) 60%, rgba(10,10,9,1) 100%)",
      }} />
      <div className="pointer-events-none absolute inset-0" style={{
        background: "radial-gradient(ellipse 50% 30% at 50% 95%, rgba(212,168,83,0.05) 0%, transparent 70%)",
      }} />

      {/* ── Assistant text — always in free space, never overlapping panels ── */}
      <div
        className="pointer-events-none absolute flex items-center transition-all duration-700 ease-out"
        style={{
          // When panels visible: text lives to the right of panels
          // Single panel ~560px + 20px padding. Multiple: compressed left panels + active
          top: 50,
          bottom: 100,
          left: hasLeftPanel ? (visiblePanels.length > 1 ? 620 : 600) : 0,
          right: 0,
          justifyContent: "center",
          paddingLeft: hasLeftPanel ? 40 : 32,
          paddingRight: 40,
        }}
      >
        <div
          className="w-full space-y-5 transition-all duration-700"
          style={{
            maxWidth: hasLeftPanel ? 460 : 640,
            textAlign: hasLeftPanel ? "left" : "center",
          }}
        >
          {/* User's request */}
          {mounted && lastUserText && (
            <p
              className="text-[13px] italic text-white/20 transition-all duration-500"
              style={{ textAlign: hasLeftPanel ? "left" : "center" }}
            >
              {lastUserText}
            </p>
          )}

          {/* Thinking indicator */}
          {thinking && (
            <div className="flex items-center gap-2" style={{ justifyContent: hasLeftPanel ? "flex-start" : "center" }}>
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#D4A853]/50" />
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#D4A853]/30" style={{ animationDelay: "150ms" }} />
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#D4A853]/20" style={{ animationDelay: "300ms" }} />
            </div>
          )}

          {/* Assistant response */}
          {mounted && displayLines.length > 0 && !thinking ? (
            <div className="space-y-5">
              {displayLines.map((line) => {
                const cleanText = line.text.replace(/^\d+[\.\)]\s*/, "")
                const words = cleanText.split(" ").filter(Boolean)
                const isLast = line.key === displayLines.length - 1

                return (
                  <p
                    key={line.key}
                    className={`transition-all duration-300 ${
                      line.isQuestion
                        ? "text-[22px] font-semibold leading-10"
                        : "text-[18px] font-medium leading-9"
                    }`}
                    style={{
                      textAlign: hasLeftPanel ? "left" : "center",
                      color: line.isQuestion ? "rgba(255, 248, 235, 0.97)" : "rgba(240, 235, 225, 0.85)",
                      textShadow: line.isQuestion
                        ? "0 0 10px rgba(212,168,83,0.5), 0 0 30px rgba(212,168,83,0.3), 0 0 60px rgba(212,168,83,0.15)"
                        : "0 0 15px rgba(212,168,83,0.2), 0 0 40px rgba(212,168,83,0.08)",
                    }}
                  >
                    {line.isQuestion && (
                      <span
                        className="mr-3 inline-block h-2.5 w-2.5 rounded-full align-middle"
                        style={{
                          backgroundColor: "#D4A853",
                          boxShadow: "0 0 6px rgba(212,168,83,0.8), 0 0 16px rgba(212,168,83,0.4), 0 0 30px rgba(212,168,83,0.2)",
                        }}
                      />
                    )}
                    {words.map((word, wi) => (
                      <span
                        key={wi}
                        style={{
                          display: "inline-block",
                          animation: "fadeInWord 0.5s ease-out both",
                          animationDelay: `${wi * 50}ms`,
                          marginRight: "0.3em",
                        }}
                      >
                        {word}
                      </span>
                    ))}
                    {streamingText && isLast && (
                      <span
                        className="ml-1 inline-block h-5 w-[2px] animate-pulse align-middle"
                        style={{ backgroundColor: "#D4A853", boxShadow: "0 0 10px rgba(212,168,83,0.7)" }}
                      />
                    )}
                  </p>
                )
              })}
            </div>
          ) : !thinking && (!mounted || messages.length === 0) ? (
            <p
              className="text-[22px] font-light tracking-wide"
              style={{ color: "rgba(232,228,220,0.10)", textAlign: hasLeftPanel ? "left" : "center" }}
            >
              What do you want to create?
            </p>
          ) : null}
        </div>
      </div>

      {/* ── Pipeline panels (auto-layout, no mouse) ── */}
      {visiblePanels.map((pid, i) => (
        <FloatingPanel
          key={pid}
          id={pid}
          title={panelTitles[pid]}
          order={i}
          total={visiblePanels.length}
          active={i === activePanelIdx}
        >
          {pid === "script" && (
            <div className="flex h-full flex-col p-4">
              <pre
                ref={scriptScrollRef}
                className="flex-1 overflow-auto whitespace-pre-wrap text-white/70"
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: `${13 * scriptZoom}px`,
                  lineHeight: `${24 * scriptZoom}px`,
                  transition: "font-size 0.3s, line-height 0.3s",
                  transformOrigin: "top left",
                }}
              >
                {scriptText || "Сценарий появится здесь..."}
              </pre>
              {scriptZoom !== 1 && (
                <div className="absolute bottom-2 right-2 rounded-md bg-black/40 px-2 py-0.5 text-[10px] text-white/30 backdrop-blur-sm">
                  {Math.round(scriptZoom * 100)}%
                </div>
              )}
            </div>
          )}
          {pid === "timeline" && (
            <VerticalTimeline segments={segments} sections={sections} currentTime={currentTime} onSeek={() => {}} />
          )}
          {pid === "emotions" && (
            <EmotionCurves segments={segments} sections={sections} />
          )}
          {pid === "generator" && (
            <ImageGenerator
              generatePrompt={generatePrompt}
              onGenerated={() => setGeneratePrompt(null)}
            />
          )}
          {pid === "plan" && (
            <div className="flex h-full items-center justify-center p-6 text-center text-[13px] text-white/30">
              {segments.length} segments · {sections.length} sections
            </div>
          )}
        </FloatingPanel>
      ))}

      {/* Command bar */}
      <CommandBar
        onSubmit={handleSubmit}
        sessionsOpen={drawerOpen}
        onSessionCommand={(text) => {
          const handler = (window as any).__sessionCommand
          if (handler) handler(text)
        }}
        gestureMode={gestureMode}
        onToggleGesture={() => setGestureMode(g => !g)}
        classifying={classifying}
      />

      {/* Gesture test overlay */}
      <GestureTestOverlay
        open={gestureTestOpen}
        onClose={() => setGestureTestOpen(false)}
        hand={hand}
        cameraReady={cameraReady}
      />

      {/* Minority Report photo search */}
      <PhotoSearch3D
        open={photoSearchOpen}
        onClose={() => setPhotoSearchOpen(false)}
        onSelect={(photo) => {
          setPhotoSearchOpen(false)
          addMessage({ id: `a-${Date.now()}`, role: "assistant", text: `Выбрано фото: ${photo.alt} (${photo.photographer})` })
        }}
        hand={hand}
        cameraReady={cameraReady}
        gestureMode={gestureMode}
        initialQuery={photoSearchQuery}
      />
    </div>
  )
}
