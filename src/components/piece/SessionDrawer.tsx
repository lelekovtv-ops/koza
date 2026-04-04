"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { usePieceSessionStore } from "@/store/pieceSession"
import { parseSessionCommand, type SessionInfo } from "@/lib/intentParser"
import type { HandState } from "@/hooks/useHandTracking"

interface Props {
  open: boolean
  onClose: () => void
  gestureMode?: boolean
  onToggleGesture?: () => void
  hand?: HandState
  cameraReady?: boolean
}

type DeleteState =
  | { phase: "idle" }
  | { phase: "classifying" }
  | { phase: "confirm"; ids: string[] }
  | { phase: "deleting"; ids: string[] }

export function SessionDrawer({ open, onClose, gestureMode: gestureModeExternal, onToggleGesture, hand: handProp, cameraReady: cameraReadyProp }: Props) {
  const store = usePieceSessionStore()
  const { sessions, activeSessionId } = store
  const [settled, setSettled] = useState(false)
  const [deleteState, setDeleteState] = useState<DeleteState>({ phase: "idle" })
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const gestureMode = gestureModeExternal ?? false
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cardRefsMap = useRef<Map<string, DOMRect>>(new Map())
  const lastGestureRef = useRef<string>("none")
  const gestureDebounceRef = useRef(0)

  // Hand tracking (received from parent)
  const hand = handProp ?? { x: 0.5, y: 0.5, gesture: "none" as const, detected: false }
  const cameraReady = cameraReadyProp ?? false

  const sorted = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions],
  )

  // Reset states when opening/closing
  useEffect(() => {
    if (open) {
      setSettled(false)
      setDeleteState({ phase: "idle" })
      const t = setTimeout(() => setSettled(true), 600 + sorted.length * 80)
      return () => clearTimeout(t)
    }
  }, [open, sorted.length])

  useEffect(() => {
    if (renamingId && inputRef.current) inputRef.current.focus()
  }, [renamingId])

  // Escape to close (or cancel delete)
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (deleteState.phase === "confirm") {
          setDeleteState({ phase: "idle" })
        } else {
          onClose()
        }
      }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [open, onClose, deleteState.phase])

  // ── Gesture processing ──

  // Hit-test: which card is the hand cursor over?
  useEffect(() => {
    if (!gestureMode || !hand.detected) {
      setHoveredCardId(null)
      return
    }
    const px = hand.x * window.innerWidth
    const py = hand.y * window.innerHeight

    let found: string | null = null
    cardRefsMap.current.forEach((rect, id) => {
      if (px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom) {
        found = id
      }
    })
    setHoveredCardId(found)
  }, [hand.x, hand.y, hand.detected, gestureMode])

  // Gesture actions (debounced)
  useEffect(() => {
    if (!gestureMode || !hand.detected) return
    const now = Date.now()
    const gesture = hand.gesture

    // Only trigger on gesture CHANGE (not continuous)
    if (gesture === lastGestureRef.current) return
    if (now - gestureDebounceRef.current < 600) return

    lastGestureRef.current = gesture
    gestureDebounceRef.current = now

    // Pinch on a card → select/open
    if (gesture === "pinch" && hoveredCardId) {
      if (deleteState.phase === "idle") {
        store.openSession(hoveredCardId)
        onClose()
      }
    }

    // Open palm → confirm yes
    if (gesture === "open_palm" && deleteState.phase === "confirm") {
      executeDelete(deleteState.ids)
    }

    // Fist → cancel
    if (gesture === "fist" && deleteState.phase === "confirm") {
      setDeleteState({ phase: "idle" })
    }
  }, [hand.gesture, hand.detected, gestureMode, hoveredCardId, deleteState]) // eslint-disable-line react-hooks/exhaustive-deps

  // Store card rects for hit-testing
  const registerCard = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      cardRefsMap.current.set(id, el.getBoundingClientRect())
    } else {
      cardRefsMap.current.delete(id)
    }
  }, [])

  // Update rects on scroll/resize
  useEffect(() => {
    if (!gestureMode || !open) return
    const update = () => {
      document.querySelectorAll<HTMLDivElement>("[data-session-card]").forEach(el => {
        const id = el.dataset.sessionCard!
        cardRefsMap.current.set(id, el.getBoundingClientRect())
      })
    }
    const interval = setInterval(update, 500)
    return () => clearInterval(interval)
  }, [gestureMode, open])

  // ── Session command handler (called from CommandBar) ──

  // Build session info for LLM context
  const sessionInfos: SessionInfo[] = useMemo(() =>
    sorted.map((s, i) => ({
      id: s.id,
      name: s.name,
      position: i + 1,
      isEmpty: s.messages.length === 0 && !s.scriptText.trim(),
      isActive: s.id === activeSessionId,
      msgCount: s.messages.length,
    })),
    [sorted, activeSessionId],
  )

  const resolveIds = useCallback((positions: number[]): string[] => {
    return positions
      .map(p => sorted[p - 1])
      .filter(s => s && s.id !== activeSessionId)
      .map(s => s.id)
  }, [sorted, activeSessionId])

  const findByName = useCallback((name: string): string[] => {
    const lower = name.toLowerCase()
    return sorted
      .filter(s => s.id !== activeSessionId && s.name.toLowerCase().includes(lower))
      .map(s => s.id)
  }, [sorted, activeSessionId])

  const markForDelete = useCallback((ids: string[]) => {
    if (ids.length > 0) setDeleteState({ phase: "confirm", ids })
    else setDeleteState({ phase: "idle" })
  }, [])

  const handleSessionCommand = useCallback(async (text: string) => {
    // If confirming deletion
    if (deleteState.phase === "confirm") {
      const lower = text.trim().toLowerCase()
      if (/^(да|yes|ок|ok|давай|удаляй|точно|подтвер|конечно|ладно|угу)$/i.test(lower)) {
        executeDelete(deleteState.ids)
        return
      }
      if (/^(нет|no|не|отмен|стоп|cancel|назад)$/i.test(lower)) {
        setDeleteState({ phase: "idle" })
        return
      }
      const cmd = await parseSessionCommand(text, sessionInfos)
      if (cmd.action === "confirm_yes" && deleteState.phase === "confirm") {
        executeDelete(deleteState.ids)
      } else {
        setDeleteState({ phase: "idle" })
      }
      return
    }

    // Normal command — classify with full session context
    setDeleteState({ phase: "classifying" })
    const cmd = await parseSessionCommand(text, sessionInfos)

    switch (cmd.action) {
      case "delete_positions":
        markForDelete(resolveIds(cmd.positions))
        break
      case "delete_last": {
        const candidates = sorted.filter(s => s.id !== activeSessionId)
        markForDelete(candidates.slice(0, Math.min(cmd.count, candidates.length)).map(s => s.id))
        break
      }
      case "delete_empty":
        markForDelete(sorted.filter(s => s.id !== activeSessionId && s.messages.length === 0 && !s.scriptText.trim()).map(s => s.id))
        break
      case "delete_all":
        markForDelete(sorted.filter(s => s.id !== activeSessionId).map(s => s.id))
        break
      case "delete_by_name":
        markForDelete(findByName(cmd.name))
        break
      case "open_position": {
        const s = sorted[cmd.position - 1]
        if (s) { store.openSession(s.id); onClose() }
        else setDeleteState({ phase: "idle" })
        break
      }
      case "open_by_name": {
        const matches = sorted.filter(s => s.name.toLowerCase().includes(cmd.name.toLowerCase()))
        if (matches.length > 0) { store.openSession(matches[0].id); onClose() }
        else setDeleteState({ phase: "idle" })
        break
      }
      default:
        setDeleteState({ phase: "idle" })
    }
  }, [deleteState, sorted, activeSessionId, sessionInfos, resolveIds, findByName, markForDelete]) // eslint-disable-line react-hooks/exhaustive-deps

  const executeDelete = useCallback((ids: string[]) => {
    setDeleteState({ phase: "deleting", ids })
    // Wait for animation, then delete
    setTimeout(() => {
      ids.forEach(id => store.deleteSession(id))
      setDeleteState({ phase: "idle" })
    }, 700)
  }, [store])

  // Expose handler for parent
  useEffect(() => {
    if (open) {
      (window as any).__sessionCommand = handleSessionCommand
    } else {
      delete (window as any).__sessionCommand
    }
    return () => { delete (window as any).__sessionCommand }
  }, [open, handleSessionCommand])

  const handleOpen = (id: string) => {
    if (renamingId || deleteState.phase !== "idle") return
    store.openSession(id)
    onClose()
  }

  const handleNew = () => {
    store.createSession()
    onClose()
  }

  const startRename = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation()
    setRenamingId(id)
    setRenameValue(name)
  }

  const commitRename = () => {
    if (renamingId && renameValue.trim()) store.renameSession(renamingId, renameValue.trim())
    setRenamingId(null)
  }

  const formatDate = (ts: number) => {
    const d = new Date(ts)
    const now = new Date()
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
  }

  const markedIds = deleteState.phase === "confirm" || deleteState.phase === "deleting"
    ? new Set(deleteState.ids)
    : new Set<string>()

  const hasMarked = markedIds.size > 0
  const isDeleting = deleteState.phase === "deleting"

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100]"
        onClick={() => deleteState.phase === "idle" ? onClose() : setDeleteState({ phase: "idle" })}
        style={{
          background: "radial-gradient(ellipse 90% 80% at 50% 50%, rgba(14,14,13,0.88) 0%, rgba(8,8,7,0.96) 100%)",
          backdropFilter: "blur(16px)",
          animation: "sessionBackdropIn 0.4s ease-out both",
        }}
      />

      {/* Cards */}
      <div className="fixed inset-0 z-[101] flex items-center justify-center overflow-hidden">
        <div className="flex items-stretch gap-5 px-16 py-12" style={{ maxWidth: "95vw", perspective: "800px" }}>
          {/* New session card */}
          <div
            onClick={handleNew}
            className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed hover:border-[#D4A853]/30 hover:bg-[#D4A853]/[0.04]"
            style={{
              width: 160, minHeight: 200,
              borderColor: "rgba(255,255,255,0.08)",
              animation: "sessionCardIn 0.5s cubic-bezier(0.16,1,0.3,1) both",
              transition: "transform 0.5s cubic-bezier(0.16,1,0.3,1), opacity 0.5s, filter 0.5s, border-color 0.3s, background 0.3s",
              ...(hasMarked ? {
                transform: "scale(0.85) translateZ(-60px)",
                opacity: 0.2,
                filter: "blur(4px)",
                pointerEvents: "none" as const,
              } : {}),
            }}
          >
            <span className="text-[28px] font-light leading-none transition-colors group-hover:text-[#D4A853]" style={{ color: "rgba(255,255,255,0.15)" }}>+</span>
            <span className="mt-2 text-[11px] tracking-wider text-white/20 transition-colors group-hover:text-[#D4A853]/60">NEW</span>
          </div>

          {/* Session cards */}
          {sorted.map((s, i) => {
            const isActive = s.id === activeSessionId
            const msgCount = s.messages.length
            const hasScript = !!s.scriptText.trim()
            const firstMsg = s.messages.find((m) => m.role === "user")?.text || ""
            const delay = (i + 1) * 70
            const floatDuration = 3 + (i % 3) * 0.5
            const floatDelay = i * 0.3
            const isMarked = markedIds.has(s.id)

            const isHandHovered = gestureMode && hoveredCardId === s.id

            return (
              <div
                key={s.id}
                data-session-card={s.id}
                onClick={() => handleOpen(s.id)}
                className="group relative flex cursor-pointer flex-col rounded-2xl border"
                style={{
                  width: 200, minHeight: 200,
                  background: isMarked
                    ? "linear-gradient(180deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.03) 100%)"
                    : isHandHovered
                      ? "linear-gradient(180deg, rgba(212,168,83,0.1) 0%, rgba(212,168,83,0.04) 100%)"
                      : isActive
                      ? "linear-gradient(180deg, rgba(212,168,83,0.06) 0%, rgba(212,168,83,0.02) 100%)"
                      : "linear-gradient(180deg, rgba(30,28,25,0.9) 0%, rgba(22,21,19,0.95) 100%)",
                  borderColor: isMarked
                    ? "rgba(239,68,68,0.3)"
                    : isHandHovered
                      ? "rgba(212,168,83,0.4)"
                      : isActive ? "rgba(212,168,83,0.15)" : "rgba(255,255,255,0.05)",
                  boxShadow: isMarked
                    ? "0 0 20px rgba(239,68,68,0.15), 0 0 1px rgba(239,68,68,0.4)"
                    : isActive
                      ? "0 8px 40px rgba(212,168,83,0.08), 0 0 1px rgba(212,168,83,0.3)"
                      : "0 8px 30px rgba(0,0,0,0.3)",
                  animation: isDeleting && isMarked
                    ? "sessionCardDelete 0.6s cubic-bezier(0.55,0.06,0.68,0.19) forwards"
                    : isMarked
                      ? "sessionCardShake 0.4s ease-in-out"
                      : settled
                        ? `sessionCardFloat ${floatDuration}s ease-in-out ${floatDelay}s infinite`
                        : `sessionCardIn 0.5s cubic-bezier(0.16,1,0.3,1) ${delay}ms both`,
                  transition: "background 0.3s, border-color 0.3s, box-shadow 0.3s, transform 0.5s cubic-bezier(0.16,1,0.3,1), opacity 0.5s, filter 0.5s",
                  ...(!isMarked && hasMarked ? {
                    transform: "scale(0.85) translateZ(-60px)",
                    opacity: 0.2,
                    filter: "blur(4px)",
                    pointerEvents: "none" as const,
                  } : {}),
                }}
                onMouseEnter={(e) => {
                  if (!isActive && !isMarked) {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"
                    e.currentTarget.style.transform = "translateY(-4px) scale(1.02)"
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive && !isMarked) {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)"
                    e.currentTarget.style.transform = ""
                  }
                }}
              >
                {/* Red X overlay when marked */}
                {isMarked && !isDeleting && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl" style={{ background: "rgba(239,68,68,0.03)" }}>
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ opacity: 0.5 }}>
                      <circle cx="16" cy="16" r="14" stroke="rgba(239,68,68,0.4)" strokeWidth="1.5" />
                      <path d="M11 11l10 10M21 11l-10 10" stroke="rgba(239,68,68,0.6)" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                )}

                {/* Active glow */}
                {isActive && !isMarked && (
                  <div className="pointer-events-none absolute -inset-px rounded-2xl" style={{ background: "linear-gradient(180deg, rgba(212,168,83,0.1) 0%, transparent 60%)", animation: "sessionGlow 2s ease-in-out infinite" }} />
                )}

                <div className="relative flex flex-1 flex-col p-4" style={{ opacity: isMarked ? 0.5 : 1, transition: "opacity 0.3s" }}>
                  <div className="flex items-center justify-between">
                    <div className="h-2 w-2 rounded-full" style={{ background: isActive ? "#D4A853" : "rgba(255,255,255,0.1)", boxShadow: isActive ? "0 0 8px rgba(212,168,83,0.6)" : "none" }} />
                    <span className="text-[10px] text-white/20">{formatDate(s.updatedAt)}</span>
                  </div>

                  <div className="mt-3">
                    {renamingId === s.id ? (
                      <input
                        ref={inputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingId(null) }}
                        className="w-full bg-transparent text-[14px] font-semibold text-white/80 outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <h3 className="line-clamp-2 text-[14px] font-semibold leading-5" style={{ color: isActive ? "rgba(212,168,83,0.9)" : "rgba(255,255,255,0.6)" }}>
                        {s.name}
                      </h3>
                    )}
                  </div>

                  {firstMsg && <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-white/15">{firstMsg}</p>}
                  <div className="flex-1" />
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {msgCount > 0 && <span className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[9px] text-white/25">{msgCount} msg</span>}
                    {hasScript && <span className="rounded-md bg-[#D4A853]/[0.06] px-2 py-0.5 text-[9px] text-[#D4A853]/40">script</span>}
                    {s.images.length > 0 && <span className="rounded-md bg-[#D4A853]/[0.06] px-2 py-0.5 text-[9px] text-[#D4A853]/40">{s.images.length} img</span>}
                  </div>
                </div>

                {/* Hover actions */}
                {!isMarked && (
                  <div className="absolute right-2 top-2 flex gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <button onClick={(e) => startRename(e, s.id, s.name)} className="rounded-md p-1.5 text-white/20 hover:bg-white/5 hover:text-white/50">
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 2l3 3-9 9H2v-3z" /></svg>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Camera toggle */}
        <button
          onClick={() => onToggleGesture?.()}
          className="absolute right-6 top-6 flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] tracking-wider transition-all duration-300"
          style={{
            background: gestureMode ? "rgba(212,168,83,0.1)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${gestureMode ? "rgba(212,168,83,0.25)" : "rgba(255,255,255,0.06)"}`,
            color: gestureMode ? "#D4A853" : "rgba(255,255,255,0.25)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6.5 6.5a2 2 0 013 0l.5.5.5-.5a2 2 0 013 0l.5.5.5-.5a2 2 0 013 0V15a6 6 0 01-6 6h-1a6 6 0 01-6-6V8.5l.5-.5.5-.5a2 2 0 011 0z" />
          </svg>
          {gestureMode ? (cameraReady ? "HANDS ON" : "LOADING...") : "HANDS"}
        </button>

        {/* Camera preview (small, bottom-right) */}
        {gestureMode && cameraReady && (
          <div
            className="absolute bottom-20 right-6 overflow-hidden rounded-xl border"
            style={{
              width: 120, height: 90,
              borderColor: "rgba(212,168,83,0.2)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
              opacity: 0.6,
              transform: "scaleX(-1)", // mirror
            }}
          >
            <video
              ref={(el) => {
                // Attach the same stream to this visible video element
                if (el && !el.srcObject) {
                  navigator.mediaDevices.getUserMedia({ video: { width: 160, height: 120 } })
                    .then(s => { el.srcObject = s; el.play() })
                    .catch(() => {})
                }
              }}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 rounded-xl border border-[#D4A853]/10" />
          </div>
        )}

        {/* Bottom hint / confirmation */}
        <div className="absolute bottom-16 flex flex-col items-center gap-2" style={{ animation: "sessionBackdropIn 0.6s ease-out 0.3s both" }}>
          {deleteState.phase === "classifying" && (
            <div className="flex items-center gap-2 text-[12px] text-[#D4A853]/50">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#D4A853]/50" />
              understanding...
            </div>
          )}
          {deleteState.phase === "confirm" && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-[14px] font-medium" style={{ color: "rgba(239,68,68,0.8)" }}>
                Delete {deleteState.ids.length} session{deleteState.ids.length > 1 ? "s" : ""}?
              </p>
              <p className="text-[11px] text-white/20">
                {gestureMode
                  ? "open palm = yes, fist = no"
                  : "say \"да\" to confirm or \"нет\" to cancel"}
              </p>
            </div>
          )}
          {deleteState.phase === "idle" && (
            <p className="text-[11px] tracking-wider text-white/10">
              {gestureMode
                ? "point to a card, pinch to select"
                : "choose a session, or say \"delete last 3\""}
            </p>
          )}
        </div>
      </div>


      <style jsx global>{`
        @keyframes sessionBackdropIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes sessionCardIn {
          from { opacity: 0; transform: translateY(30px) scale(0.92); filter: blur(4px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes sessionCardFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes sessionGlow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes sessionCardShake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          20% { transform: translateX(-3px) rotate(-0.5deg); }
          40% { transform: translateX(3px) rotate(0.5deg); }
          60% { transform: translateX(-2px) rotate(-0.3deg); }
          80% { transform: translateX(2px) rotate(0.3deg); }
        }
        @keyframes sessionCardDelete {
          0% { opacity: 1; transform: scale(1) translateY(0); }
          30% { opacity: 0.8; transform: scale(0.95) translateY(-10px); }
          100% { opacity: 0; transform: scale(0.3) translateY(120px) rotate(8deg); filter: blur(6px); }
        }
      `}</style>
    </>
  )
}
