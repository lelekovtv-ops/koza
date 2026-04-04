import type { PanelId } from "@/store/panels"

export type Intent =
  | { type: "open_panel"; panel: PanelId }
  | { type: "close_panel"; panel: PanelId }
  | { type: "close_all" }
  | { type: "run_generation" }
  | { type: "smart_distribute" }
  | { type: "new_session" }
  | { type: "open_sessions" }
  | { type: "delete_sessions"; query: string }
  | { type: "confirm_yes" }
  | { type: "confirm_no" }
  | { type: "gesture_test" }
  | { type: "photo_search"; query: string }
  | { type: "chat"; text: string }

// ─── Slash commands (instant, exact match) ─────────────────

const SLASH_COMMANDS: Record<string, Intent> = {
  "/script":    { type: "open_panel", panel: "script" },
  "/timeline":  { type: "open_panel", panel: "timeline" },
  "/emotions":  { type: "open_panel", panel: "emotions" },
  "/plan":      { type: "open_panel", panel: "plan" },
  "/inspector": { type: "open_panel", panel: "inspector" },
  "/gen":       { type: "open_panel", panel: "generator" },
  "/image":     { type: "open_panel", panel: "generator" },
  "/run":       { type: "run_generation" },
  "/smart":     { type: "smart_distribute" },
  "/close":     { type: "close_all" },
  "/new":       { type: "new_session" },
  "/session":   { type: "open_sessions" },
  "/sessions":  { type: "open_sessions" },
}

// ─── Sync parser (instant, regex-based) ─────────────────────

export function parseIntent(input: string): Intent {
  const trimmed = input.trim()

  // Slash commands — always instant
  const slashKey = Object.keys(SLASH_COMMANDS).find((cmd) => trimmed.toLowerCase().startsWith(cmd))
  if (slashKey) return SLASH_COMMANDS[slashKey]

  // Default: chat (async parser will override if needed)
  return { type: "chat", text: trimmed }
}

// ─── Async LLM parser ──────────────────────────────────────

const INTENT_CLASSIFY_PROMPT = `You classify user input into one of these intents. User is in a creative production app.

INTENTS:
- open_sessions — user wants to see/open/browse their sessions list
- new_session — user wants to create a new/fresh session
- open_script — open the script/screenplay panel
- open_timeline — open the timeline panel
- open_emotions — open the emotions/mood panel
- open_plan — open the production plan panel
- open_generator — open the image generator panel
- close_all — close all panels
- run_generation — run/start/launch generation pipeline
- smart_distribute — run smart distribution/analysis
- gesture_test — user wants to test hand gestures, enable gesture test mode, try gestures on a photo
- photo_search — user wants to search/find/browse photos, images, references, moodboard, visual materials from the internet
- chat — user is talking to AI, asking a question, or giving a creative instruction

Rules:
- If input is clearly a UI command (open/close/show/create something) → pick the matching intent
- Handle typos, misspellings, transliteration errors VERY generously — the user types fast and makes many mistakes
- A single word that looks like a mangled version of "сессия/session" → open_sessions
- A single word that looks like a mangled version of "таймлайн/timeline" → open_timeline
- A single word that looks like a mangled version of "скрипт/сценарий/script" → open_script
- If input looks like a creative request, question, or greeting → chat
- Respond with ONLY the intent name, nothing else`

export async function parseIntentAsync(input: string): Promise<Intent> {
  const trimmed = input.trim()

  // Slash commands — instant
  const slashKey = Object.keys(SLASH_COMMANDS).find((cmd) => trimmed.toLowerCase().startsWith(cmd))
  if (slashKey) return SLASH_COMMANDS[slashKey]

  // 7+ words → always chat (long creative request)
  const wordCount = trimmed.split(/\s+/).length
  if (wordCount >= 7) return { type: "chat", text: trimmed }

  // 1-6 words: ask LLM to classify
  try {
    const res = await fetch("/api/classify-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: trimmed }),
    })

    if (!res.ok) return { type: "chat", text: trimmed }

    const intentName = (await res.text()).trim().toLowerCase()
    return mapIntentName(intentName, trimmed)
  } catch {
    // LLM failed → fallback to chat
    return { type: "chat", text: trimmed }
  }
}

function mapIntentName(name: string, originalText: string): Intent {
  switch (name) {
    case "open_sessions": return { type: "open_sessions" }
    case "new_session": return { type: "new_session" }
    case "delete_sessions": return { type: "delete_sessions", query: originalText }
    case "open_script": return { type: "open_panel", panel: "script" }
    case "open_timeline": return { type: "open_panel", panel: "timeline" }
    case "open_emotions": return { type: "open_panel", panel: "emotions" }
    case "open_plan": return { type: "open_panel", panel: "plan" }
    case "open_generator": return { type: "open_panel", panel: "generator" }
    case "close_all": return { type: "close_all" }
    case "run_generation": return { type: "run_generation" }
    case "smart_distribute": return { type: "smart_distribute" }
    case "gesture_test": return { type: "gesture_test" }
    default: return { type: "chat", text: originalText }
  }
}

// ─── Session context parser (when session view is open) ─────

export interface SessionInfo {
  id: string
  name: string
  position: number  // 1-based left to right
  isEmpty: boolean
  isActive: boolean
  msgCount: number
}

function buildSessionPrompt(sessions: SessionInfo[]): string {
  const list = sessions.map((s) =>
    `  #${s.position}: "${s.name}" ${s.isActive ? "(ACTIVE)" : ""} ${s.isEmpty ? "(EMPTY)" : `(${s.msgCount} msg)`}`
  ).join("\n")

  return `You parse commands about managing sessions displayed as cards in a row, left to right.

CURRENT SESSIONS (left to right):
${list}
Total: ${sessions.length} sessions.

Possible commands:
- delete_by_positions — user refers to sessions by position: "удали первую", "вторую и третью", "the last one", "средние"
- delete_by_name — user refers to a session by name or part of name
- delete_last_N — "удали последние три", "delete last 2"
- delete_all_empty — "удали пустые", "delete empty ones"
- delete_all — "удали все", "delete all" (except active)
- open_by_position — "открой вторую", "open the third"
- open_by_name — "открой Session 3 апр"
- confirm_yes — да, yes, ок, давай, удаляй, точно
- confirm_no — нет, no, отмена, стоп, не надо
- other — anything unrelated

Rules:
- Handle typos VERY generously
- Position words: первая/первую=1, вторая/вторую=2, третья/третью=3, четвёртая=4, пятая=5, последняя=last, предпоследняя=second-to-last
- "все"/"all" = delete all except active
- "пустые"/"empty" = delete empty ones
- Respond ONLY in format: COMMAND|PARAM
- PARAM for positions = comma-separated position numbers (e.g. "2,3")
- PARAM for names = the session name or fragment
- Examples: "delete_by_positions|2,3", "delete_last_N|3", "delete_by_name|Session 3", "open_by_position|2", "confirm_yes|"`
}

export type SessionCommandResult =
  | { action: "delete_positions"; positions: number[] }
  | { action: "delete_last"; count: number }
  | { action: "delete_empty" }
  | { action: "delete_all" }
  | { action: "delete_by_name"; name: string }
  | { action: "open_position"; position: number }
  | { action: "open_by_name"; name: string }
  | { action: "confirm_yes" }
  | { action: "confirm_no" }
  | { action: "other" }

export async function parseSessionCommand(input: string, sessions: SessionInfo[]): Promise<SessionCommandResult> {
  // Quick regex for instant yes/no
  const lower = input.trim().toLowerCase()
  if (/^(да|yes|ок|ok|давай|удаляй|точно|подтвер|конечно|ладно|угу)$/i.test(lower)) {
    return { action: "confirm_yes" }
  }
  if (/^(нет|no|не|отмен|стоп|cancel|назад|не надо)$/i.test(lower)) {
    return { action: "confirm_no" }
  }

  try {
    const system = buildSessionPrompt(sessions)
    const res = await fetch("/api/classify-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: input.trim(), system }),
    })
    if (!res.ok) return { action: "other" }

    const raw = (await res.text()).trim()
    const pipeIdx = raw.indexOf("|")
    const cmd = pipeIdx >= 0 ? raw.slice(0, pipeIdx) : raw
    const param = pipeIdx >= 0 ? raw.slice(pipeIdx + 1) : ""

    if (cmd === "delete_by_positions") {
      const positions = param.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n))
      return positions.length > 0 ? { action: "delete_positions", positions } : { action: "other" }
    }
    if (cmd === "delete_last_N" || cmd === "delete_last_n") {
      return { action: "delete_last", count: parseInt(param) || 3 }
    }
    if (cmd === "delete_all_empty") return { action: "delete_empty" }
    if (cmd === "delete_all") return { action: "delete_all" }
    if (cmd === "delete_by_name") return { action: "delete_by_name", name: param }
    if (cmd === "open_by_position") {
      const pos = parseInt(param)
      return !isNaN(pos) ? { action: "open_position", position: pos } : { action: "other" }
    }
    if (cmd === "open_by_name") return { action: "open_by_name", name: param }
    if (cmd === "confirm_yes") return { action: "confirm_yes" }
    if (cmd === "confirm_no") return { action: "confirm_no" }
    return { action: "other" }
  } catch {
    return { action: "other" }
  }
}

// ─── Slash suggestions ──────────────────────────────────────

export function getSlashSuggestions(partial: string): { command: string; label: string }[] {
  if (!partial.startsWith("/")) return []
  const lower = partial.toLowerCase()
  return Object.keys(SLASH_COMMANDS)
    .filter((cmd) => cmd.startsWith(lower))
    .map((cmd) => ({
      command: cmd,
      label: cmd.slice(1).charAt(0).toUpperCase() + cmd.slice(2),
    }))
}

export { INTENT_CLASSIFY_PROMPT }
