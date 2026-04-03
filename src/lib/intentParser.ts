import type { PanelId } from "@/store/panels"

export type Intent =
  | { type: "open_panel"; panel: PanelId }
  | { type: "close_panel"; panel: PanelId }
  | { type: "close_all" }
  | { type: "run_generation" }
  | { type: "smart_distribute" }
  | { type: "chat"; text: string }

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
}

const PANEL_KEYWORDS: { patterns: RegExp[]; panel: PanelId }[] = [
  { patterns: [/сценар|script|текст|напиш|write|редактор|editor/i], panel: "script" },
  { patterns: [/таймлайн|timeline|раскадр|rundown|расклад/i], panel: "timeline" },
  { patterns: [/эмоц|emotion|кривая|curve|настроен|mood|чувств/i], panel: "emotions" },
  { patterns: [/план|plan|структур|production|job|задач/i], panel: "plan" },
  { patterns: [/инспект|inspect|деталь|detail|настройк/i], panel: "inspector" },
  { patterns: [/генератор|generator|generate|изображен|картинк|image|фото|photo|визуал/i], panel: "generator" },
]

const ACTION_KEYWORDS: { patterns: RegExp[]; intent: Intent }[] = [
  { patterns: [/запусти|run|генер|generate|старт|start/i], intent: { type: "run_generation" } },
  { patterns: [/smart|умн|распредел|analyz|анализ/i], intent: { type: "smart_distribute" } },
  { patterns: [/закрой всё|close all|убери всё|clear/i], intent: { type: "close_all" } },
]

export function parseIntent(input: string): Intent {
  const trimmed = input.trim()
  const wordCount = trimmed.split(/\s+/).length

  // Slash commands — always work
  const slashKey = Object.keys(SLASH_COMMANDS).find((cmd) => trimmed.toLowerCase().startsWith(cmd))
  if (slashKey) return SLASH_COMMANDS[slashKey]

  // Long phrases (4+ words) → always chat, never intercept as panel command
  // "напиши сценарий про зайца" = chat, not open_panel
  if (wordCount >= 4) return { type: "chat", text: trimmed }

  // Action keywords (short phrases only)
  for (const { patterns, intent } of ACTION_KEYWORDS) {
    if (patterns.some((p) => p.test(trimmed))) return intent
  }

  // Panel keywords — only for short direct commands like "покажи таймлайн", "открой скрипт"
  const wantsOpen = /покажи|открой|open|show/i.test(trimmed)
  const wantsClose = /закрой|close|убери|hide|спрячь/i.test(trimmed)

  if (wantsOpen || wantsClose) {
    for (const { patterns, panel } of PANEL_KEYWORDS) {
      if (patterns.some((p) => p.test(trimmed))) {
        if (wantsClose) return { type: "close_panel", panel }
        return { type: "open_panel", panel }
      }
    }
  }

  // Default: chat with AI
  return { type: "chat", text: trimmed }
}

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
