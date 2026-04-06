/**
 * Fuzzy matcher — instant (0ms) bilingual command recognition.
 * Uses Levenshtein distance to handle typos without LLM.
 */

// ─── Levenshtein ────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const la = a.length
  const lb = b.length
  const dp: number[][] = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0))
  for (let i = 0; i <= la; i++) dp[i][0] = i
  for (let j = 0; j <= lb; j++) dp[0][j] = j
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[la][lb]
}

function maxDistForLength(len: number): number {
  if (len <= 4) return 1
  if (len <= 6) return 2
  return 3
}

// ─── Intent IDs (must match Intent type in intentParser) ────

export type FuzzyIntent =
  | "open_script"
  | "open_timeline"
  | "open_emotions"
  | "open_plan"
  | "open_inspector"
  | "open_generator"
  | "close_panel_script"
  | "close_panel_timeline"
  | "close_panel_emotions"
  | "close_panel_plan"
  | "close_panel_generator"
  | "close_all"
  | "open_sessions"
  | "new_session"
  | "gesture_test"
  | "run_generation"
  | "smart_distribute"

// ─── Dictionary ─────────────────────────────────────────────

interface DictEntry {
  intent: FuzzyIntent
  words: string[]  // all acceptable forms
}

const NOUNS: DictEntry[] = [
  { intent: "open_script",    words: ["скрипт", "сценарий", "script", "текст", "сценарий", "скрипта", "сценария"] },
  { intent: "open_timeline",  words: ["таймлайн", "timeline", "раскадровка", "раскадр", "тайм"] },
  { intent: "open_emotions",  words: ["эмоции", "emotions", "настроение", "mood", "кривая", "кривые"] },
  { intent: "open_plan",      words: ["план", "plan", "продакшн", "production", "задачи"] },
  { intent: "open_inspector", words: ["инспектор", "inspector", "детали", "настройки"] },
  { intent: "open_generator", words: ["генератор", "generator", "картинки", "изображения", "фото"] },
  { intent: "open_sessions",  words: ["сессии", "сессия", "сессию", "sessions", "session", "проекты", "проект"] },
  { intent: "gesture_test",   words: ["жесты", "жест", "gesture", "gestures"] },
]

// Standalone phrases (no verb needed)
const STANDALONE: DictEntry[] = [
  { intent: "open_sessions",    words: ["сессии", "сессия", "сессию", "sessions", "session"] },
  { intent: "new_session",      words: ["новая", "новый", "new"] },
  { intent: "close_all",        words: ["закрыть", "закрой"] },
  { intent: "gesture_test",     words: ["жесты", "жест"] },
  { intent: "run_generation",   words: ["запусти", "запуск", "run", "start"] },
  { intent: "smart_distribute", words: ["распредели", "distribute", "smart"] },
]

const OPEN_VERBS = ["открой", "покажи", "open", "show", "включи", "давай", "хочу"]
const CLOSE_VERBS = ["закрой", "убери", "скрой", "close", "hide", "выключи"]
const NEW_VERBS = ["создай", "новая", "новый", "new", "create", "начни", "начать"]
const TEST_VERBS = ["тест", "test", "тестируй", "попробуй", "включи"]

// ─── Match result ───────────────────────────────────────────

export interface FuzzyResult {
  intent: FuzzyIntent
  confidence: number // 0-1
}

// ─── Single word matcher ────────────────────────────────────

function matchWord(input: string, candidates: string[]): { word: string; distance: number } | null {
  let best: { word: string; distance: number } | null = null
  for (const w of candidates) {
    const d = levenshtein(input, w)
    const maxD = maxDistForLength(w.length)
    if (d <= maxD && (!best || d < best.distance)) {
      best = { word: w, distance: d }
    }
  }
  return best
}

function matchWordInList(input: string, entries: DictEntry[]): { entry: DictEntry; distance: number } | null {
  let best: { entry: DictEntry; distance: number } | null = null
  for (const entry of entries) {
    const m = matchWord(input, entry.words)
    if (m && (!best || m.distance < best.distance)) {
      best = { entry, distance: m.distance }
    }
  }
  return best
}

// ─── Main fuzzy match ───────────────────────────────────────

export function fuzzyMatch(input: string): FuzzyResult | null {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return null

  const words = trimmed.split(/\s+/)

  // ── Single word ──
  if (words.length === 1) {
    const w = words[0]

    // Try standalone first
    const standalone = matchWordInList(w, STANDALONE)
    if (standalone) {
      const conf = 1 - standalone.distance / Math.max(w.length, 3)
      return { intent: standalone.entry.intent, confidence: Math.max(0.5, conf) }
    }

    // Try nouns (implicit "open")
    const noun = matchWordInList(w, NOUNS)
    if (noun) {
      const conf = 1 - noun.distance / Math.max(w.length, 3)
      return { intent: noun.entry.intent, confidence: Math.max(0.5, conf) }
    }

    return null
  }

  // ── Two words: verb + noun ──
  if (words.length === 2) {
    const [w1, w2] = words

    // Try "verb noun" pattern
    const isOpen = matchWord(w1, OPEN_VERBS)
    const isClose = matchWord(w1, CLOSE_VERBS)
    const isNew = matchWord(w1, NEW_VERBS)
    const isTest = matchWord(w1, TEST_VERBS)

    if (isOpen || isClose || isNew || isTest) {
      const noun = matchWordInList(w2, NOUNS)
      if (noun) {
        let intent = noun.entry.intent

        // close + noun → close_panel_*
        if (isClose) {
          const panelName = intent.replace("open_", "")
          intent = `close_panel_${panelName}` as FuzzyIntent
        }

        // new + session noun
        if (isNew && intent === "open_sessions") {
          intent = "new_session"
        }

        // test + gesture noun
        if (isTest && intent === "gesture_test") {
          intent = "gesture_test"
        }

        const verbDist = isOpen?.distance ?? isClose?.distance ?? isNew?.distance ?? isTest?.distance ?? 0
        const nounDist = noun.distance
        const avgDist = (verbDist + nounDist) / 2
        const conf = 1 - avgDist / 3
        return { intent, confidence: Math.max(0.5, conf) }
      }
    }

    // Try "noun verb" pattern (reversed): "скрипт открой"
    const noun1 = matchWordInList(w1, NOUNS)
    const isOpen2 = matchWord(w2, OPEN_VERBS)
    const isClose2 = matchWord(w2, CLOSE_VERBS)

    if (noun1 && (isOpen2 || isClose2)) {
      let intent = noun1.entry.intent
      if (isClose2) {
        const panelName = intent.replace("open_", "")
        intent = `close_panel_${panelName}` as FuzzyIntent
      }
      return { intent, confidence: 0.8 }
    }

    // "новая сессия", "new session"
    const new1 = matchWord(w1, NEW_VERBS)
    const sess2 = matchWordInList(w2, [{ intent: "new_session", words: ["сессия", "сессию", "session", "проект"] }])
    if (new1 && sess2) return { intent: "new_session", confidence: 0.9 }

    // "тест жестов", "gesture test"
    const test1 = matchWord(w1, TEST_VERBS) || matchWord(w1, ["жест", "gesture", "жесты", "gestures"])
    const gesture2 = matchWord(w2, ["жестов", "жесты", "gesture", "gestures", "test", "тест"])
    if (test1 && gesture2) return { intent: "gesture_test", confidence: 0.9 }

    // "закрой все" / "close all"
    if (isClose) {
      const allMatch = matchWord(w2, ["все", "всё", "all", "панели", "panels"])
      if (allMatch) return { intent: "close_all", confidence: 0.95 }
    }
  }

  // ── Three words: "включи тест жестов", "открой мне скрипт" ──
  if (words.length === 3) {
    // Try dropping middle word ("мне", "мой", "the", "a") and matching as 2 words
    const filler = ["мне", "мой", "мою", "the", "a", "для", "этот", "тот"]
    for (let skip = 0; skip < 3; skip++) {
      if (filler.includes(words[skip])) {
        const remaining = words.filter((_, i) => i !== skip).join(" ")
        const sub = fuzzyMatch(remaining)
        if (sub && sub.confidence >= 0.6) {
          return { ...sub, confidence: sub.confidence * 0.9 }
        }
      }
    }

    // "включи тест жестов" → gesture_test
    const w0test = matchWord(words[0], [...TEST_VERBS, ...OPEN_VERBS])
    const w1test = matchWord(words[1], ["тест", "test"])
    const w2gesture = matchWord(words[2], ["жестов", "жесты", "gesture", "gestures"])
    if (w0test && w1test && w2gesture) return { intent: "gesture_test", confidence: 0.9 }
  }

  return null
}
