/**
 * Workers — specialized executors for each route category.
 * Extracted from the monolithic handleChat in page.tsx.
 */

import type { PanelId } from "@/store/panels"
import type { ChatMessage } from "@/store/pieceSession"
import { parseScriptBlocks, replaceBlock, findRelevantBlock, type ScriptBlock } from "@/lib/scriptUtils"

// ─── Shared callbacks interface ─────────────────────────────

export interface WorkerCallbacks {
  setStreamingText: (text: string) => void
  setStreamingScript: (text: string) => void
  setScriptText: (text: string) => void
  setIsStreaming: (v: boolean) => void
  setThinking: (v: boolean) => void
  addMessage: (msg: ChatMessage) => void
  openPanel: (id: PanelId) => void
  setGeneratePrompt: (prompt: string | null) => void
  abortRef: React.MutableRefObject<AbortController | null>
}

// ─── Prompts ────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are PIECE — an AI co-director and creative producer.

RESPONSE FORMAT RULES (CRITICAL):
- Your text appears floating on a dark cinematic screen. It must be SHORT and ELEGANT.
- Maximum 3-4 lines of text. Never write paragraphs on the main screen.
- For clarifying questions: numbered list, 1 line each, max 4 questions.
- For confirmations: one short sentence ("Понял, начинаю работу над сценарием.")
- For tips/suggestions: 1-2 short lines.
- NEVER write long explanations, lists of features, or detailed descriptions on screen.
- If user asks for a script: respond ONLY with the script in format below (it goes to Script panel, not screen):

[SECTION NAME — duration]
ГОЛОС: narrator text
ГРАФИКА: visual description
ТИТР: title text
МУЗЫКА: music description

ALWAYS respond in the same language the user writes in.
Think of yourself as a film title card — minimal, impactful, never cluttered.`

const EDIT_SYSTEM_PROMPT = `You are PIECE script editor. You receive ONE block of a script and an edit instruction.

Return ONLY the edited block text. Nothing else — no explanations, no markdown, no "here's the edit".
Keep the same format: [SECTION — duration], ГОЛОС:, ГРАФИКА:, ТИТР:, МУЗЫКА:.
Respond in the same language as the block.`

// ─── Generation Worker ──────────────────────────────────────

export async function executeGeneration(params: {
  text: string
  scriptText: string
  cb: WorkerCallbacks
}) {
  const { text, scriptText, cb } = params
  const blocks = parseScriptBlocks(scriptText)
  const blockIdx = findRelevantBlock(blocks, text)
  const block = blockIdx >= 0 ? blocks[blockIdx] : blocks[0]
  if (!block) {
    cb.addMessage({ id: `a-${Date.now()}`, role: "assistant", text: "Нет блоков для генерации" })
    cb.setIsStreaming(false)
    cb.setThinking(false)
    return
  }

  const graphicLine = block.text.split("\n").find((l) => /ГРАФИКА:|GRAPHIC:/i.test(l))
  const visualDesc = graphicLine?.replace(/^ГРАФИКА:\s*|^GRAPHIC:\s*/i, "").trim() || block.title

  // Check if user added style instructions
  const hasStyle = /стил[еьи]|style|комикс|comic|аниме|anime|реалист|realistic|промпт|prompt|по-друг|другой|новый|new|как|like/i.test(text)

  let prompt: string
  let msg: string

  if (hasStyle) {
    const userStyle = text.replace(/сгенер\S*|генерируй|generate|render|нарисуй|покажи кадр|visualize/gi, "").trim()
    prompt = `${visualDesc}. ${userStyle}. High quality, widescreen 3:2.`
    msg = `Генерирую "${block.title}" — ${userStyle}`
  } else {
    prompt = `Cinematic frame: ${visualDesc}. Film quality, dramatic lighting, widescreen 3:2 aspect ratio.`
    msg = `Генерирую кадр для "${block.title}"...`
  }

  cb.openPanel("generator")
  cb.setGeneratePrompt(prompt)
  cb.setThinking(false)
  cb.setIsStreaming(false)
  cb.addMessage({ id: `a-${Date.now()}`, role: "assistant", text: msg })
}

// ─── Script Edit Worker ─────────────────────────────────────

export async function executeScriptEdit(params: {
  text: string
  scriptText: string
  cb: WorkerCallbacks
}) {
  const { text, scriptText, cb } = params
  const blocks = parseScriptBlocks(scriptText)
  const blockIdx = findRelevantBlock(blocks, text)

  if (blockIdx >= 0 && blocks[blockIdx]) {
    const block = blocks[blockIdx]
    cb.setStreamingText(`Редактирую блок "${block.title}"...`)

    try {
      cb.abortRef.current = new AbortController()
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: `Edit this script block:\n\n${block.text}\n\nInstruction: ${text}` }],
          system: EDIT_SYSTEM_PROMPT,
          modelId: "claude-sonnet-4-20250514",
          temperature: 0.5,
        }),
        signal: cb.abortRef.current.signal,
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const reader = res.body?.getReader()
      if (!reader) throw new Error("No reader")

      const decoder = new TextDecoder()
      let edited = ""
      cb.setThinking(false)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        edited += decoder.decode(value, { stream: true })
        cb.setScriptText(replaceBlock(scriptText, blockIdx, edited))
      }

      cb.setScriptText(replaceBlock(scriptText, blockIdx, edited))
      cb.setStreamingText("")
      cb.addMessage({ id: `a-${Date.now()}`, role: "assistant", text: `Блок "${block.title}" обновлён` })
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        cb.addMessage({ id: `e-${Date.now()}`, role: "assistant", text: `Ошибка: ${(e as Error).message}` })
      }
    } finally {
      cb.setStreamingText("")
      cb.setStreamingScript("")
      cb.setIsStreaming(false)
      cb.setThinking(false)
      cb.abortRef.current = null
    }
    return
  }

  // Can't find which block — ask user
  if (blockIdx < 0) {
    const blockList = blocks.map((b, i) => `${i + 1}. ${b.title}`).join("\n")
    cb.setThinking(false)
    cb.setStreamingText("")
    cb.addMessage({
      id: `a-${Date.now()}`,
      role: "assistant",
      text: `Какой блок изменить?\n\n${blockList}`,
    })
    cb.setIsStreaming(false)
  }
}

// ─── Chat Worker ────────────────────────────────────────────

export async function executeChat(params: {
  text: string
  messages: ChatMessage[]
  cb: WorkerCallbacks
}) {
  const { text, messages, cb } = params

  const chatHistory = messages.slice(-10).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.text,
  }))
  chatHistory.push({ role: "user", content: text.trim() })

  try {
    cb.abortRef.current = new AbortController()
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: chatHistory,
        system: SYSTEM_PROMPT,
        modelId: "claude-sonnet-4-20250514",
        temperature: 0.7,
      }),
      signal: cb.abortRef.current.signal,
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const reader = res.body?.getReader()
    if (!reader) throw new Error("No reader")

    const decoder = new TextDecoder()
    let accumulated = ""
    let isScriptMode = false
    cb.setThinking(false)

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      accumulated += decoder.decode(value, { stream: true })

      const looksLikeScript = /^\[.+\]/m.test(accumulated) && /ГОЛОС:|ТИТР:|ГРАФИКА:|МУЗЫКА:|VOICE:|INT\.|EXT\./m.test(accumulated)

      if (looksLikeScript && !isScriptMode) {
        isScriptMode = true
        cb.openPanel("script")
        cb.setStreamingText("Пишу сценарий...")
      }

      if (isScriptMode) {
        cb.setStreamingScript(accumulated)
      } else {
        cb.setStreamingText(accumulated)
      }
    }

    if (isScriptMode) {
      cb.setScriptText(accumulated)
      cb.addMessage({ id: `a-${Date.now()}`, role: "assistant", text: "Сценарий готов — смотри в панели Script" })
    } else {
      cb.addMessage({ id: `a-${Date.now()}`, role: "assistant", text: accumulated })
    }
  } catch (e) {
    if ((e as Error).name !== "AbortError") {
      cb.addMessage({ id: `e-${Date.now()}`, role: "assistant", text: `Ошибка: ${(e as Error).message}` })
    }
  } finally {
    cb.setStreamingText("")
    cb.setStreamingScript("")
    cb.setIsStreaming(false)
    cb.setThinking(false)
    cb.abortRef.current = null
  }
}
