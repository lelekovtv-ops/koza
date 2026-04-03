"use client"

import { useMemo, useState, useCallback, useRef, useEffect } from "react"
import { textToSegments } from "@/lib/segmentEngine"
import { usePanelsStore, type PanelId } from "@/store/panels"
import { CommandBar } from "@/components/piece/CommandBar"
import { FloatingPanel } from "@/components/piece/FloatingPanel"
import { VerticalTimeline } from "@/components/piece/VerticalTimeline"
import { EmotionCurves } from "@/components/piece/EmotionCurves"
import { ImageGenerator } from "@/components/piece/ImageGenerator"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  text: string
}

const SYSTEM_PROMPT = `You are PIECE — an AI co-director and creative producer.

When a user describes a project idea, FIRST ask 3-5 short clarifying questions to understand their vision. Format questions as a numbered list. Questions should cover: tone/mood, target audience, visual style, references, constraints.

Be warm but professional. Keep each question to 1 line. After questions, add a brief encouraging note.

When the user answers, help them step by step.

IMPORTANT: When the user asks you to write a script/scenario, respond ONLY with the script text in this format:
[SECTION NAME — duration]
ГОЛОС: narrator text
ГРАФИКА: visual description
ТИТР: title text
МУЗЫКА: music description

ALWAYS respond in the same language the user writes in. Keep responses concise.`

const EDIT_SYSTEM_PROMPT = `You are PIECE script editor. You receive ONE block of a script and an edit instruction.

Return ONLY the edited block text. Nothing else — no explanations, no markdown, no "here's the edit".
Keep the same format: [SECTION — duration], ГОЛОС:, ГРАФИКА:, ТИТР:, МУЗЫКА:.
Respond in the same language as the block.`

// ─── Script block utilities ─────────────────────────────────

interface ScriptBlock {
  index: number
  title: string
  text: string      // full block text including [HEADER]
  startLine: number
}

function parseScriptBlocks(script: string): ScriptBlock[] {
  if (!script.trim()) return []
  const lines = script.split("\n")
  const blocks: ScriptBlock[] = []
  let current: ScriptBlock | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\[.+\]/.test(line.trim())) {
      if (current) blocks.push(current)
      current = {
        index: blocks.length,
        title: line.trim().replace(/^\[|\]$/g, "").replace(/\s*[—\-–]\s*\d+.*/, "").trim(),
        text: line,
        startLine: i,
      }
    } else if (current) {
      current.text += "\n" + line
    } else {
      // Text before first block
      current = { index: 0, title: "INTRO", text: line, startLine: i }
    }
  }
  if (current) blocks.push(current)
  return blocks
}

function replaceBlock(script: string, blockIndex: number, newBlockText: string): string {
  const blocks = parseScriptBlocks(script)
  if (blockIndex < 0 || blockIndex >= blocks.length) return script
  const newBlocks = blocks.map((b, i) => i === blockIndex ? newBlockText.trim() : b.text)
  return newBlocks.join("\n\n")
}

function findRelevantBlock(blocks: ScriptBlock[], userText: string): number {
  const lower = userText.toLowerCase()

  // Direct block reference: "в блоке HOOK", "секцию ОТКРЫТИЕ", "block 2"
  for (const block of blocks) {
    if (lower.includes(block.title.toLowerCase())) return block.index
  }

  // Number reference: "первый блок", "второй", "блок 3"
  const numWords: Record<string, number> = {
    "перв": 0, "втор": 1, "трет": 2, "четвёрт": 3, "четверт": 3, "пят": 4, "шест": 5,
    "first": 0, "second": 1, "third": 2, "fourth": 3, "fifth": 4,
  }
  for (const [word, idx] of Object.entries(numWords)) {
    if (lower.includes(word) && idx < blocks.length) return idx
  }

  const numMatch = lower.match(/блок\s*(\d+)|block\s*(\d+)|секци[юя]\s*(\d+)/)
  if (numMatch) {
    const n = parseInt(numMatch[1] || numMatch[2] || numMatch[3]) - 1
    if (n >= 0 && n < blocks.length) return n
  }

  // Content match: check if user mentions content from a specific block
  for (const block of blocks) {
    const blockWords = block.text.toLowerCase().split(/\s+/).filter((w) => w.length > 4)
    const matches = blockWords.filter((w) => lower.includes(w))
    if (matches.length >= 2) return block.index
  }

  // Last resort: "последн" = last block, "начало/открытие" = first
  if (/последн|last|конец|финал|cta/i.test(lower)) return blocks.length - 1
  if (/начал|first|открыт|hook|intro/i.test(lower)) return 0

  return -1 // can't determine — will edit full script
}

export default function PiecePage() {
  const [scriptText, setScriptText] = useState("")
  const [currentTime, setCurrentTime] = useState(0)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamingText, setStreamingText] = useState("")
  const [streamingScript, setStreamingScript] = useState("") // script goes here during stream
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

  const displayLines = useMemo(() => {
    if (!displayText) return []
    return displayText.split("\n").filter((l) => l.trim()).map((line, i) => ({
      text: line,
      isQuestion: /^\d+[\.\)]\s/.test(line.trim()) || /^[-•]\s/.test(line.trim()),
      key: i,
    }))
  }, [displayText])

  // Visible panels in pipeline order (system-controlled)
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

  // Script blocks (live parsed from scriptText)
  const scriptBlocks = useMemo(() => parseScriptBlocks(scriptText), [scriptText])

  // Detect if user wants to edit existing script vs write new / general chat
  const isEditRequest = useCallback((text: string): boolean => {
    // No script → can't edit
    if (!scriptText.trim() || scriptBlocks.length === 0) return false
    // Explicitly asks for NEW script → not an edit
    if (/напиши новый|новый сценарий|write new|create new|с нуля|from scratch/i.test(text)) return false
    // If user mentions a block name → it's an edit
    const lower = text.toLowerCase()
    for (const block of scriptBlocks) {
      if (lower.includes(block.title.toLowerCase())) return true
    }
    // If user uses edit-like words → it's an edit
    if (/измени|поменяй|замени|перепиши|переделай|сделай|убери|добавь|удали|укороти|удлини|edit|change|replace|rewrite|remove|add|update|fix|shorten|extend/i.test(text)) return true
    // If user references position → it's an edit
    if (/перв|втор|трет|послед|начал|конец|блок|секци|first|second|last|block|section/i.test(text)) return true
    return false
  }, [scriptText, scriptBlocks])

  const handleChat = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", text: text.trim() }
    setMessages((prev) => [...prev, userMsg])
    setStreamingText("")
    setThinking(true)
    setIsStreaming(true)

    // ── Generate image mode: "сгенерируй первую сцену" ──
    if (scriptBlocks.length > 0 && /сгенер|генерируй|generate|render|нарисуй|покажи кадр|visualize/i.test(text)) {
      const blockIdx = findRelevantBlock(scriptBlocks, text)
      const block = blockIdx >= 0 ? scriptBlocks[blockIdx] : scriptBlocks[0]

      // Build visual prompt from block's ГРАФИКА line
      const graphicLine = block.text.split("\n").find((l) => /ГРАФИКА:|GRAPHIC:/i.test(l))
      const visualDesc = graphicLine?.replace(/^ГРАФИКА:\s*|^GRAPHIC:\s*/i, "").trim() || block.title
      const prompt = `Cinematic frame: ${visualDesc}. Film quality, dramatic lighting, widescreen 3:2 aspect ratio.`

      // Open generator panel
      openPanel("generator")
      setGeneratePrompt(prompt)
      setThinking(false)
      setIsStreaming(false)
      setMessages((prev) => [...prev, {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: `Генерирую кадр для "${block.title}"...`,
      }])
      return
    }

    // ── Block edit mode: edit one block instead of full rewrite ──
    if (isEditRequest(text)) {
      const blocks = parseScriptBlocks(scriptText)
      const blockIdx = findRelevantBlock(blocks, text)

      if (blockIdx >= 0 && blocks[blockIdx]) {
        const block = blocks[blockIdx]
        setStreamingText(`Редактирую блок "${block.title}"...`)

        try {
          abortRef.current = new AbortController()
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [{ role: "user", content: `Edit this script block:\n\n${block.text}\n\nInstruction: ${text}` }],
              system: EDIT_SYSTEM_PROMPT,
              modelId: "claude-sonnet-4-20250514",
              temperature: 0.5,
            }),
            signal: abortRef.current.signal,
          })

          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const reader = res.body?.getReader()
          if (!reader) throw new Error("No reader")

          const decoder = new TextDecoder()
          let edited = ""
          setThinking(false)

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            edited += decoder.decode(value, { stream: true })
            // Live preview: replace block in real time
            setScriptText(replaceBlock(scriptText, blockIdx, edited))
          }

          setScriptText(replaceBlock(scriptText, blockIdx, edited))
          setStreamingText("")
          setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: "assistant", text: `Блок "${block.title}" обновлён` }])
        } catch (e) {
          if ((e as Error).name !== "AbortError") {
            setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: "assistant", text: `Ошибка: ${(e as Error).message}` }])
          }
        } finally {
          setStreamingText("")
          setStreamingScript("")
          setIsStreaming(false)
          setThinking(false)
          abortRef.current = null
        }
        return
      }
      // If can't find which block — ask user
      if (blockIdx < 0) {
        const blockList = blocks.map((b, i) => `${i + 1}. ${b.title}`).join("\n")
        setThinking(false)
        setStreamingText("")
        setMessages((prev) => [...prev, {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: `Какой блок изменить?\n\n${blockList}`,
        }])
        setIsStreaming(false)
        return
      }
    }

    // ── Normal chat / full script write ──
    const chatHistory = messages.slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.text,
    }))
    chatHistory.push({ role: "user", content: text.trim() })

    try {
      abortRef.current = new AbortController()
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatHistory,
          system: SYSTEM_PROMPT,
          modelId: "claude-sonnet-4-20250514",
          temperature: 0.7,
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const reader = res.body?.getReader()
      if (!reader) throw new Error("No reader")

      const decoder = new TextDecoder()
      let accumulated = ""
      let isScriptMode = false
      setThinking(false)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })

        const looksLikeScript = /^\[.+\]/m.test(accumulated) && /ГОЛОС:|ТИТР:|ГРАФИКА:|МУЗЫКА:|VOICE:|INT\.|EXT\./m.test(accumulated)

        if (looksLikeScript && !isScriptMode) {
          isScriptMode = true
          openPanel("script")
          setStreamingText("Пишу сценарий...")
        }

        if (isScriptMode) {
          setStreamingScript(accumulated)
        } else {
          setStreamingText(accumulated)
        }
      }

      if (isScriptMode) {
        setScriptText(accumulated)
        setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: "assistant", text: "Сценарий готов — смотри в панели Script" }])
      } else {
        setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: "assistant", text: accumulated }])
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: "assistant", text: `Ошибка: ${(e as Error).message}` }])
      }
    } finally {
      setStreamingText("")
      setStreamingScript("")
      setIsStreaming(false)
      setThinking(false)
      abortRef.current = null
    }
  }, [isStreaming, messages])

  return (
    <div className="fixed inset-0 bg-[#0e0e0d]">
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
          {lastUserText && (
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
          {displayLines.length > 0 && !thinking ? (
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
          ) : !thinking && messages.length === 0 ? (
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
          active={i === visiblePanels.length - 1}
        >
          {pid === "script" && (
            <div className="flex h-full flex-col p-4">
              <pre className="flex-1 overflow-auto whitespace-pre-wrap text-[13px] leading-6 text-white/70" style={{ fontFamily: "'Courier New', monospace" }}>
                {scriptText || "Сценарий появится здесь..."}
              </pre>
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
      <CommandBar onChat={handleChat} />
    </div>
  )
}
