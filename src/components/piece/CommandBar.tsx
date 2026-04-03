"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Mic, SendHorizonal, Sparkles } from "lucide-react"
import { parseIntent, getSlashSuggestions } from "@/lib/intentParser"
import { usePanelsStore } from "@/store/panels"

interface CommandBarProps {
  onChat?: (text: string) => void
  onRunGeneration?: () => void
  onSmartDistribute?: () => void
}

export function CommandBar({ onChat, onRunGeneration, onSmartDistribute }: CommandBarProps) {
  const [input, setInput] = useState("")
  const [suggestions, setSuggestions] = useState<{ command: string; label: string }[]>([])
  const [selectedSuggestion, setSelectedSuggestion] = useState(0)
  const [lastAction, setLastAction] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { openPanel, closePanel, closeAll, togglePanel } = usePanelsStore()
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

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed) return

    // If suggestion selected, use it
    if (suggestions.length > 0 && input.startsWith("/")) {
      const cmd = suggestions[selectedSuggestion]?.command ?? trimmed
      const intent = parseIntent(cmd)
      executeIntent(intent)
      setInput("")
      setSuggestions([])
      return
    }

    const intent = parseIntent(trimmed)
    executeIntent(intent)
    setInput("")
    setSuggestions([])
  }, [input, suggestions, selectedSuggestion]) // eslint-disable-line react-hooks/exhaustive-deps

  const executeIntent = useCallback(
    (intent: ReturnType<typeof parseIntent>) => {
      switch (intent.type) {
        case "open_panel":
          openPanel(intent.panel)
          setLastAction(`Opened ${intent.panel}`)
          break
        case "close_panel":
          closePanel(intent.panel)
          setLastAction(`Closed ${intent.panel}`)
          break
        case "close_all":
          closeAll()
          setLastAction("Closed all panels")
          break
        case "run_generation":
          onRunGeneration?.()
          setLastAction("Running generation...")
          break
        case "smart_distribute":
          onSmartDistribute?.()
          setLastAction("Smart distributing...")
          break
        case "chat":
          onChat?.(intent.text)
          setLastAction(null)
          break
      }
    },
    [openPanel, closePanel, closeAll, onChat, onRunGeneration, onSmartDistribute],
  )

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

      {/* Last action flash */}
      {lastAction && (
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
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What do you want to create?  ⌘/"
          className="flex-1 bg-transparent text-[14px] text-[#2A2520] outline-none placeholder:text-[#B5AFA5]"
        />
        {input.trim() ? (
          <button
            type="button"
            onClick={handleSubmit}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2A2520]/10 text-[#8A7A60] transition-colors hover:bg-[#2A2520]/20 hover:text-[#5A4E3E]"
          >
            <SendHorizonal size={14} />
          </button>
        ) : (
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#C5BDB0] transition-colors hover:bg-[#2A2520]/8 hover:text-[#8A7A60]"
          >
            <Mic size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
