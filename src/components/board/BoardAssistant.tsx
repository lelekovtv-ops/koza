"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { Sparkles, Send, Minimize2, X } from "lucide-react"
import { ALL_MODELS, DEFAULT_TEXT_MODEL_ID } from "@/lib/models"

type AssistantMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

const KOZA_SYSTEM_PROMPT = `You are KOZA, an AI creative production copilot.
You help with screenwriting, storyboarding, and video production.
Reply in the same language the user writes in.
Keep responses concise and production-oriented.`

export default function BoardAssistant() {
  const textModels = useMemo(() => ALL_MODELS.filter((m) => m.category === "text"), [])

  const [selectedModel, setSelectedModel] = useState(textModels[0]?.id || DEFAULT_TEXT_MODEL_ID)
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)

  const draggingRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  const ensurePosition = useCallback(() => {
    if (position || typeof window === "undefined") return
    setPosition({ x: window.innerWidth - 390, y: 80 })
  }, [position])

  const openAssistant = useCallback(() => {
    ensurePosition()
    setOpen(true)
    setMinimized(false)
  }, [ensurePosition])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    const userMsg: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    }
    const assistantId = `assistant-${Date.now() + 1}`
    const nextMessages = [...messages, userMsg]

    setMessages([...nextMessages, { id: assistantId, role: "assistant", content: "" }])
    setInput("")
    setIsLoading(true)

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: selectedModel,
          system: KOZA_SYSTEM_PROMPT,
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(errorText)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("Empty response body")

      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m))
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: `Error: ${message}` } : m))
      )
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, messages, selectedModel])

  const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!position) return

    draggingRef.current = true
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    }

    const onMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return

      const nextX = ev.clientX - dragOffsetRef.current.x
      const nextY = ev.clientY - dragOffsetRef.current.y

      setPosition({
        x: Math.max(12, Math.min(nextX, window.innerWidth - 372)),
        y: Math.max(12, Math.min(nextY, window.innerHeight - 520)),
      })
    }

    const onMouseUp = () => {
      draggingRef.current = false
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
  }, [position])

  if (!open || minimized) {
    return (
      <button
        onClick={openAssistant}
        className="fixed bottom-6 right-6 z-[240] flex h-12 w-12 items-center justify-center rounded-full border border-[#E5E0DB] bg-white text-[#2D2A26] shadow-lg transition hover:scale-[1.03] hover:shadow-xl"
        title="Open PIECE Assistant"
      >
        <Sparkles size={18} />
      </button>
    )
  }

  return (
    <div
      className="fixed z-[240] flex h-[500px] w-[360px] flex-col overflow-hidden rounded-2xl border border-[#E5E0DB] bg-white shadow-2xl"
      style={{ left: position?.x ?? 24, top: position?.y ?? 24 }}
    >
      <div
        onMouseDown={handleDragStart}
        className="flex cursor-move items-center justify-between border-b border-[#EDE8E2] bg-white/85 px-3 py-2 backdrop-blur"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[#6A8CA8]" />
          <span className="text-xs font-semibold tracking-wide text-[#2D2A26]">PIECE Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(true)}
            className="rounded p-1.5 text-[#7A7269] transition hover:bg-[#F4EFE9] hover:text-[#2D2A26]"
            title="Minimize"
          >
            <Minimize2 size={14} />
          </button>
          <button
            onClick={() => {
              setOpen(false)
              setMinimized(false)
            }}
            className="rounded p-1.5 text-[#7A7269] transition hover:bg-[#F4EFE9] hover:text-[#2D2A26]"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="border-b border-[#EDE8E2] px-3 py-2">
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="w-full rounded-lg border border-[#E5E0DB] bg-[#FFFDFC] px-2.5 py-1.5 text-xs text-[#2D2A26] outline-none focus:border-[#C8BFB5]"
        >
          {textModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-[#FFFEFC] p-3">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-xs leading-6 text-[#8A8279]">
            Ask PIECE about story, shots, screenplay, or production planning.
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[92%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs leading-6 ${
                  msg.role === "user"
                    ? "bg-[#E7EEF4] text-[#2D2A26]"
                    : "bg-[#F5F0EB] text-[#2D2A26]"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-[#EDE8E2] bg-white p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void sendMessage(input)
              }
            }}
            placeholder="Type a message..."
            rows={2}
            className="flex-1 resize-none rounded-xl border border-[#E5E0DB] bg-[#FFFDFC] px-3 py-2 text-xs text-[#2D2A26] outline-none focus:border-[#C8BFB5]"
          />
          <button
            onClick={() => void sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="self-end rounded-xl bg-[#7B9BB4] p-3 text-white transition hover:bg-[#6F8FA8] disabled:cursor-not-allowed disabled:opacity-50"
            title="Send"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
