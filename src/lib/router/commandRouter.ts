/**
 * Command Router — three-tier classification.
 *
 * Tier 1: Slash commands + fuzzy match (0ms)
 * Tier 2: Keyword-based category classification (0ms)
 * Tier 3: LLM fallback for ambiguous 1-3 word input (~200ms)
 */

import type { PanelId } from "@/store/panels"
import type { Intent } from "@/lib/intentParser"
import { fuzzyMatch, type FuzzyIntent } from "./fuzzyMatch"

// ─── Route result ───────────────────────────────────────────

export type RouteCategory = "UI_COMMAND" | "SCRIPT_EDIT" | "GENERATION" | "PHOTO_SEARCH" | "CREATIVE_CHAT"

export interface RouteResult {
  category: RouteCategory
  intent: Intent
  confidence: number
}

// ─── Slash commands ─────────────────────────────────────────

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

// ─── Fuzzy intent → Intent mapper ───────────────────────────

function fuzzyToIntent(fi: FuzzyIntent): Intent {
  switch (fi) {
    case "open_script":    return { type: "open_panel", panel: "script" }
    case "open_timeline":  return { type: "open_panel", panel: "timeline" }
    case "open_emotions":  return { type: "open_panel", panel: "emotions" }
    case "open_plan":      return { type: "open_panel", panel: "plan" }
    case "open_inspector": return { type: "open_panel", panel: "inspector" }
    case "open_generator": return { type: "open_panel", panel: "generator" }
    case "close_panel_script":    return { type: "close_panel", panel: "script" }
    case "close_panel_timeline":  return { type: "close_panel", panel: "timeline" }
    case "close_panel_emotions":  return { type: "close_panel", panel: "emotions" }
    case "close_panel_plan":      return { type: "close_panel", panel: "plan" }
    case "close_panel_generator": return { type: "close_panel", panel: "generator" }
    case "close_all":        return { type: "close_all" }
    case "open_sessions":    return { type: "open_sessions" }
    case "new_session":      return { type: "new_session" }
    case "gesture_test":     return { type: "gesture_test" }
    case "run_generation":   return { type: "run_generation" }
    case "smart_distribute": return { type: "smart_distribute" }
  }
}

// ─── Keyword detection ──────────────────────────────────────

const RE_GENERATION = /сгенер|генерируй|generate|render|нарисуй|покажи кадр|visualize/i
const RE_EDIT = /измени|поменяй|замени|перепиши|переделай|убери|добавь|удали|укороти|удлини|edit|change|replace|rewrite|remove|add|update|fix|shorten|extend/i
const RE_STYLE_CHANGE = /в стил[еьи]|в формат|style of|format as|комикс|comic|переписа?ть весь|rewrite all/i
const RE_POSITION = /перв|втор|трет|послед|начал|конец|блок|секци|first|second|last|block|section/i
const RE_PHOTO_SEARCH = /найди фото|найди картинк|найди изображ|поищи фото|поищи картинк|покажи фото|покажи картинк|search photo|search image|find photo|find image|show photo|фото для|картинки для|референс|reference|мудборд|moodboard|подбери фото|подбери картинк|фотки|фотографи/i

// ─── LLM fallback ───────────────────────────────────────────

const LLM_INTENT_MAP: Record<string, Intent> = {
  open_sessions: { type: "open_sessions" },
  new_session: { type: "new_session" },
  open_script: { type: "open_panel", panel: "script" },
  open_timeline: { type: "open_panel", panel: "timeline" },
  open_emotions: { type: "open_panel", panel: "emotions" },
  open_plan: { type: "open_panel", panel: "plan" },
  open_generator: { type: "open_panel", panel: "generator" },
  close_all: { type: "close_all" },
  run_generation: { type: "run_generation" },
  smart_distribute: { type: "smart_distribute" },
  gesture_test: { type: "gesture_test" },
  photo_search: { type: "photo_search", query: "" },
}

async function llmClassify(input: string): Promise<RouteResult> {
  try {
    const res = await fetch("/api/classify-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    })
    if (!res.ok) return { category: "CREATIVE_CHAT", intent: { type: "chat", text: input }, confidence: 0.5 }

    const name = (await res.text()).trim().toLowerCase().replace(/[^a-z_]/g, "")
    if (name === "photo_search") {
      return { category: "PHOTO_SEARCH", intent: { type: "photo_search", query: input }, confidence: 0.85 }
    }
    const mapped = LLM_INTENT_MAP[name]
    if (mapped) return { category: "UI_COMMAND", intent: mapped, confidence: 0.85 }
    return { category: "CREATIVE_CHAT", intent: { type: "chat", text: input }, confidence: 0.7 }
  } catch {
    return { category: "CREATIVE_CHAT", intent: { type: "chat", text: input }, confidence: 0.5 }
  }
}

// ─── Main router ────────────────────────────────────────────

interface RouterContext {
  hasScript: boolean
}

export async function route(input: string, ctx: RouterContext): Promise<RouteResult> {
  const trimmed = input.trim()
  if (!trimmed) return { category: "CREATIVE_CHAT", intent: { type: "chat", text: "" }, confidence: 1 }

  const lower = trimmed.toLowerCase()
  const wordCount = trimmed.split(/\s+/).length

  // ── Tier 1A: Slash commands (instant) ──
  const slashKey = Object.keys(SLASH_COMMANDS).find((cmd) => lower.startsWith(cmd))
  if (slashKey) {
    return { category: "UI_COMMAND", intent: SLASH_COMMANDS[slashKey], confidence: 1 }
  }

  // ── Tier 1B: Fuzzy dictionary match (instant) ──
  if (wordCount <= 3) {
    const fuzzy = fuzzyMatch(trimmed)
    if (fuzzy && fuzzy.confidence >= 0.6) {
      return { category: "UI_COMMAND", intent: fuzzyToIntent(fuzzy.intent), confidence: fuzzy.confidence }
    }
  }

  // ── Tier 2: Keyword-based category (instant) ──

  // Photo search keywords
  if (RE_PHOTO_SEARCH.test(lower)) {
    // Extract search query from the text (remove command words)
    const searchQuery = trimmed
      .replace(/найди|поищи|search|find|покажи|фото|картинк\S*|изображен\S*|photo\S*|image\S*|референс\S*|reference\S*|мудборд\S*|moodboard\S*|для/gi, "")
      .trim() || trimmed
    return { category: "PHOTO_SEARCH", intent: { type: "photo_search", query: searchQuery }, confidence: 0.9 }
  }

  // Generation keywords
  if (ctx.hasScript && RE_GENERATION.test(lower)) {
    return { category: "GENERATION", intent: { type: "chat", text: trimmed }, confidence: 0.9 }
  }

  // Style change → goes to chat (full rewrite)
  if (ctx.hasScript && RE_STYLE_CHANGE.test(lower)) {
    return { category: "CREATIVE_CHAT", intent: { type: "chat", text: trimmed }, confidence: 0.9 }
  }

  // Edit keywords (only if script exists)
  if (ctx.hasScript && (RE_EDIT.test(lower) || RE_POSITION.test(lower))) {
    return { category: "SCRIPT_EDIT", intent: { type: "chat", text: trimmed }, confidence: 0.8 }
  }

  // 7+ words → always creative chat (no LLM routing needed)
  if (wordCount >= 7) {
    return { category: "CREATIVE_CHAT", intent: { type: "chat", text: trimmed }, confidence: 0.9 }
  }

  // ── Tier 3: LLM fallback (only for ambiguous 1-4 word input) ──
  if (wordCount <= 4) {
    return llmClassify(trimmed)
  }

  // 5-6 words without keywords → creative chat
  return { category: "CREATIVE_CHAT", intent: { type: "chat", text: trimmed }, confidence: 0.7 }
}
