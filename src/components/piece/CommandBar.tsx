"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Mic, SendHorizonal, Sparkles } from "lucide-react"
import { getSlashSuggestions } from "@/lib/intentParser"
import { usePanelsStore } from "@/store/panels"

interface CommandBarProps {
  onSubmit?: (text: string) => void
  onSessionCommand?: (text: string) => void
  sessionsOpen?: boolean
  gestureMode?: boolean
  onToggleGesture?: () => void
  classifying?: boolean
}

export function CommandBar({ onSubmit, onSessionCommand, sessionsOpen, gestureMode, onToggleGesture, classifying: classifyingProp }: CommandBarProps) {
  const [input, setInput] = useState("")
  const [suggestions, setSuggestions] = useState<{ command: string; label: string }[]>([])
  const [selectedSuggestion, setSelectedSuggestion] = useState(0)
  const [lastAction, setLastAction] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [interimText, setInterimText] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)
  const submitAfterSpeechRef = useRef(false)

  const panels = usePanelsStore((s) => s.panels)

  // Focus on Cmd+/
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        inputRef.current?.blur()
        setInput("")
        setSuggestions([])
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  // Update suggestions on input
  useEffect(() => {
    if (input.startsWith("/")) {
      setSuggestions(getSlashSuggestions(input))
      setSelectedSuggestion(0)
    } else {
      setSuggestions([])
    }
  }, [input])

  // Flash last action text
  useEffect(() => {
    if (!lastAction) return
    const t = setTimeout(() => setLastAction(null), 2000)
    return () => clearTimeout(t)
  }, [lastAction])

  // ── Voice recognition (Web Speech API) ──
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setLastAction("Speech not supported in this browser")
      return
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop()
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = "ru-RU"
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setListening(true)
      setInterimText("")
    }

    recognition.onresult = (event: any) => {
      let interim = ""
      let final = ""
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          final += transcript
        } else {
          interim += transcript
        }
      }

      if (final) {
        setInput(final)
        setInterimText("")
        submitAfterSpeechRef.current = true
      } else {
        setInterimText(interim)
      }
    }

    recognition.onend = () => {
      setListening(false)
      setInterimText("")
      recognitionRef.current = null
    }

    recognition.onerror = (event: any) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setLastAction(`Mic: ${event.error}`)
      }
      setListening(false)
      setInterimText("")
      recognitionRef.current = null
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [])

  // Auto-submit after speech recognition fills input
  useEffect(() => {
    if (submitAfterSpeechRef.current && input.trim()) {
      submitAfterSpeechRef.current = false
      // Small delay so user sees what was recognized
      const t = setTimeout(() => handleSubmit(), 300)
      return () => clearTimeout(t)
    }
  }, [input]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => { recognitionRef.current?.stop() }
  }, [])

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed) return

    setInput("")
    setSuggestions([])

    // When sessions view is open — route to session commands
    if (sessionsOpen && onSessionCommand) {
      onSessionCommand(trimmed)
      return
    }

    // If suggestion selected, use that command text
    if (suggestions.length > 0 && input.startsWith("/")) {
      const cmd = suggestions[selectedSuggestion]?.command ?? trimmed
      onSubmit?.(cmd)
      return
    }

    // Everything else → parent handles routing
    onSubmit?.(trimmed)
  }, [input, suggestions, selectedSuggestion, sessionsOpen, onSessionCommand, onSubmit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        handleSubmit()
      }
      if (e.key === "ArrowDown" && suggestions.length > 0) {
        e.preventDefault()
        setSelectedSuggestion((i) => Math.min(i + 1, suggestions.length - 1))
      }
      if (e.key === "ArrowUp" && suggestions.length > 0) {
        e.preventDefault()
        setSelectedSuggestion((i) => Math.max(i - 1, 0))
      }
      if (e.key === "Tab" && suggestions.length > 0) {
        e.preventDefault()
        setInput(suggestions[selectedSuggestion]?.command ?? input)
        setSuggestions([])
      }
    },
    [handleSubmit, suggestions, selectedSuggestion, input],
  )

  // Minimized pills
  const minimizedPanels = Object.values(panels).filter((p) => p.visible && p.minimized)

  return (
    <div className="fixed bottom-6 left-1/2 z-[300] flex -translate-x-1/2 flex-col items-center gap-2">
      {/* Minimized panel pills */}
      {minimizedPanels.length > 0 && (
        <div className="flex items-center gap-1.5">
          {minimizedPanels.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => usePanelsStore.getState().restorePanel(p.id)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/40 backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white/60"
            >
              {p.id}
            </button>
          ))}
        </div>
      )}

      {/* Status indicators */}
      {listening && (
        <div className="flex items-center gap-2 text-[12px] font-medium" style={{ color: "rgba(239,68,68,0.7)" }}>
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" style={{ animation: "micDot 0.8s ease-in-out infinite" }} />
          Listening...
        </div>
      )}
      {classifyingProp && !listening && (
        <div className="flex items-center gap-2 text-[11px] text-[#D4A853]/40">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#D4A853]/50" />
          understanding...
        </div>
      )}
      {lastAction && !classifyingProp && !listening && (
        <div className="animate-pulse text-[11px] text-white/30">{lastAction}</div>
      )}

      {/* Suggestions dropdown */}
      {suggestions.length > 0 && (
        <div className="w-[560px] overflow-hidden rounded-xl border border-white/[0.06] bg-[#1A1A1A]/95 backdrop-blur-xl">
          {suggestions.map((s, i) => (
            <button
              key={s.command}
              type="button"
              onClick={() => {
                setInput(s.command)
                handleSubmit()
              }}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-[12px] transition-colors ${
                i === selectedSuggestion ? "bg-white/[0.06] text-white/80" : "text-white/40 hover:bg-white/[0.03]"
              }`}
            >
              <span className="font-mono text-[#D4A853]">{s.command}</span>
              <span className="text-white/25">{s.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Command bar */}
      <div
        className="flex w-[620px] items-center gap-3 rounded-2xl border border-white/[0.12] px-5 py-3.5 shadow-2xl backdrop-blur-xl"
        style={{
          background: "linear-gradient(135deg, rgba(245,243,239,0.95) 0%, rgba(232,228,220,0.92) 50%, rgba(220,215,205,0.90) 100%)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.5), 0 0 80px rgba(212,168,83,0.06), inset 0 1px 0 rgba(255,255,255,0.4)",
        }}
      >
        <Sparkles size={16} className="shrink-0 text-[#B8A070]" />
        <input
          ref={inputRef}
          type="text"
          value={listening ? interimText || input : input}
          onChange={(e) => { if (!listening) setInput(e.target.value) }}
          onKeyDown={handleKeyDown}
          placeholder={listening ? "Listening..." : "What do you want to create?  ⌘/"}
          className="flex-1 bg-transparent text-[14px] text-[#2A2520] outline-none placeholder:text-[#B5AFA5]"
          style={listening ? { color: "#B8A070", fontStyle: "italic" } : undefined}
        />
        {/* Gesture toggle */}
        {onToggleGesture && (
          <button
            type="button"
            onClick={onToggleGesture}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all hover:scale-105"
            style={gestureMode ? {
              background: "rgba(212,168,83,0.2)",
              borderColor: "rgba(212,168,83,0.4)",
              color: "#B8860B",
              boxShadow: "0 0 12px rgba(212,168,83,0.25)",
            } : {
              background: "rgba(60,55,48,0.08)",
              borderColor: "rgba(60,55,48,0.15)",
              color: "#6B5D4D",
            }}
            title="Hand gestures"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.5 6.5a2 2 0 013 0l.5.5.5-.5a2 2 0 013 0l.5.5.5-.5a2 2 0 013 0V15a6 6 0 01-6 6h-1a6 6 0 01-6-6V8.5l.5-.5.5-.5a2 2 0 011 0z" />
            </svg>
          </button>
        )}
        {input.trim() && !listening ? (
          <button
            type="button"
            onClick={handleSubmit}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all hover:scale-105"
            style={{
              background: "rgba(42,37,32,0.12)",
              borderColor: "rgba(42,37,32,0.2)",
              color: "#5A4E3E",
            }}
          >
            <SendHorizonal size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={startListening}
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all hover:scale-105"
            style={listening ? {
              background: "rgba(239,68,68,0.15)",
              borderColor: "rgba(239,68,68,0.4)",
              color: "#DC2626",
              boxShadow: "0 0 14px rgba(239,68,68,0.3)",
            } : {
              background: "rgba(60,55,48,0.08)",
              borderColor: "rgba(60,55,48,0.15)",
              color: "#6B5D4D",
            }}
          >
            {listening && (
              <span
                className="absolute inset-0 rounded-full"
                style={{ border: "2px solid rgba(239,68,68,0.5)", animation: "micPulse 1.2s ease-out infinite" }}
              />
            )}
            <Mic size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
