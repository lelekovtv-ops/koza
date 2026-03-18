"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Info, Settings } from "lucide-react"

type LineType =
  | "scene-heading"
  | "action"
  | "character"
  | "dialogue"
  | "parenthetical"
  | "transition"
  | "empty"

interface ScreenplayEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  forcedTheme?: "light" | "dark"
}

interface ParsedLine {
  text: string
  type: LineType
  speaker?: string
}

type ThemeMode = "light" | "system" | "dark"
type FontMode = "ibm-plex-mono" | "courier-prime" | "pt-serif"
type ElementTarget = "scene-heading" | "action" | "character" | "dialogue" | "parenthetical" | "transition"

interface EditorSettings {
  theme: ThemeMode
  zoomPercent: number
  font: FontMode
  showWordCount: boolean
  popupPalette: boolean
  elementMenu: boolean
  headersAndFooters: boolean
  autoCapitalize: boolean
  highlightCharacters: boolean
}

const SETTINGS_STORAGE_KEY = "koza-screenplay-editor-settings-v2"
const DEFAULT_SETTINGS: EditorSettings = {
  theme: "system",
  zoomPercent: 90,
  font: "ibm-plex-mono",
  showWordCount: false,
  popupPalette: false,
  elementMenu: false,
  headersAndFooters: true,
  autoCapitalize: true,
  highlightCharacters: false,
}

const SCENE_HEADING_RE = /^(INT\.|EXT\.|INT\.\s*\/\s*EXT\.)/i
const TRANSITION_RE = /^(FADE IN:|FADE OUT\.?|CUT TO:|DISSOLVE TO:|SMASH CUT TO:|MATCH CUT TO:|WIPE TO:|.+ TO:)$/i
const PARENTHETICAL_RE = /^\(.*\)$/

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function isCharacterCandidate(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (trimmed.length > 40) return false
  if (!/[A-Z]/.test(trimmed)) return false
  return trimmed === trimmed.toUpperCase()
}

function normalizeTextFromEditor(text: unknown): string {
  if (typeof text !== "string") return ""
  return text.replace(/\r/g, "").replace(/\u00A0/g, " ")
}

function stripLegacyIndentation(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (!line.trim()) return ""
      return line.replace(/^\s{10,40}/, "")
    })
    .join("\n")
}

function collapseVerticalTypingArtifact(text: string): string {
  const lines = text.split("\n")
  const nonEmpty = lines.map((line) => line.trim()).filter(Boolean)

  if (nonEmpty.length < 8) return text

  const singleCharLines = nonEmpty.filter((line) => line.length === 1).length
  const singleCharRatio = singleCharLines / nonEmpty.length

  if (singleCharRatio < 0.85) return text

  // Recover from accidental one-character-per-line contenteditable state.
  return nonEmpty.join("")
}

function classifyLine(lines: string[], index: number, resolvedTypes: LineType[]): LineType {
  const raw = lines[index] ?? ""
  const trimmed = raw.trim()

  if (!trimmed) return "empty"

  if (SCENE_HEADING_RE.test(trimmed)) return "scene-heading"

  if (TRANSITION_RE.test(trimmed.toUpperCase())) return "transition"

  const prevType = index > 0 ? resolvedTypes[index - 1] : "empty"
  if (PARENTHETICAL_RE.test(trimmed) && (prevType === "character" || prevType === "dialogue")) {
    return "parenthetical"
  }

  const prevRaw = index > 0 ? lines[index - 1] ?? "" : ""
  const prevIsEmpty = prevRaw.trim().length === 0
  if (isCharacterCandidate(trimmed) && prevIsEmpty) {
    return "character"
  }

  if (prevType === "character" || prevType === "parenthetical") {
    return "dialogue"
  }

  return "action"
}

function parseScreenplay(value: string): ParsedLine[] {
  const lines = normalizeTextFromEditor(value).split("\n")
  const types: LineType[] = []
  let lastCharacter = ""

  for (let i = 0; i < lines.length; i++) {
    types.push(classifyLine(lines, i, types))
  }

  return lines.map((text, index) => {
    const type = types[index]
    if (type === "character") {
      lastCharacter = text.trim().toUpperCase()
      return { text, type }
    }
    if (type === "dialogue") {
      return { text, type, speaker: lastCharacter || undefined }
    }
    if (type === "scene-heading" || type === "action" || type === "transition" || type === "empty") {
      lastCharacter = ""
    }
    return { text, type }
  })
}

function getCharacterColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  const hue = hash % 360
  return `hsla(${hue}, 70%, 90%, 0.5)`
}

function getLineStyle(type: LineType, highlight: boolean, speaker?: string): string {
  const highlightStyle = highlight && speaker ? `background:linear-gradient(90deg, ${getCharacterColor(speaker)} 0%, transparent 72%);` : ""
  const stroke = "-webkit-text-stroke:0.4px currentColor;"
  switch (type) {
    case "scene-heading":
      return `padding-left:0px;font-weight:700;text-decoration:underline;${stroke}`
    case "character":
      return `padding-left:192px;text-transform:uppercase;font-weight:700;${stroke}`
    case "dialogue":
      return `padding-left:96px;padding-right:96px;font-weight:700;${stroke}${highlightStyle}`
    case "parenthetical":
      return `padding-left:144px;font-style:italic;color:#5a5450;font-weight:600;${stroke}`
    case "transition":
      return `padding-left:0px;text-transform:uppercase;text-align:right;font-weight:700;${stroke}`
    case "action":
      return `padding-left:0px;font-weight:700;${stroke}`
    case "empty":
    default:
      return `padding-left:0px;font-weight:700;${stroke}`
  }
}

function getSelectionOffsets(editor: HTMLDivElement): { start: number; end: number } | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null

  const preRange = range.cloneRange()
  preRange.selectNodeContents(editor)
  preRange.setEnd(range.startContainer, range.startOffset)
  const start = normalizeTextFromEditor(preRange.toString()).length
  const selected = normalizeTextFromEditor(range.toString()).length

  return { start, end: start + selected }
}

function getLineIndexFromOffset(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length - 1
}

function ensureLineType(line: string, target: ElementTarget): string {
  const trimmed = line.trim()
  switch (target) {
    case "scene-heading": {
      const upper = trimmed.toUpperCase()
      if (SCENE_HEADING_RE.test(upper)) return upper
      return `INT. ${upper}`
    }
    case "character":
      return trimmed.toUpperCase()
    case "parenthetical":
      if (trimmed.startsWith("(") && trimmed.endsWith(")")) return trimmed
      return `(${trimmed})`
    case "transition": {
      const upper = trimmed.toUpperCase()
      if (upper.endsWith(":") || upper.endsWith(".")) return upper
      return `${upper}:`
    }
    case "dialogue":
    case "action":
    default:
      return trimmed
  }
}

function applyAutoCaps(text: string): string {
  const lines = normalizeTextFromEditor(text).split("\n")
  const resolved: LineType[] = []

  for (let i = 0; i < lines.length; i++) {
    resolved.push(classifyLine(lines, i, resolved))
  }

  return lines
    .map((line, index) => {
      const type = resolved[index]
      if (type === "scene-heading" || type === "character" || type === "transition") {
        return line.toUpperCase()
      }
      return line
    })
    .join("\n")
}

export default function ScreenplayEditor({ value, onChange, placeholder, forcedTheme }: ScreenplayEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<EditorSettings>(DEFAULT_SETTINGS)
  const [systemDark, setSystemDark] = useState(false)
  const [isSafari, setIsSafari] = useState(false)
  const [activeLineType, setActiveLineType] = useState<LineType>("action")
  const [selectionUi, setSelectionUi] = useState<{ x: number; y: number; text: string } | null>(null)
  const safeValue = useMemo(() => {
    const normalized = normalizeTextFromEditor(value)
    return collapseVerticalTypingArtifact(stripLegacyIndentation(normalized))
  }, [value])

  const parsed = useMemo(() => parseScreenplay(safeValue), [safeValue])
  const resolvedTheme = forcedTheme ?? (settings.theme === "system" ? (systemDark ? "dark" : "light") : settings.theme)
  const isDark = resolvedTheme === "dark"
  const fontFamily = settings.font === "ibm-plex-mono"
    ? 'var(--font-screenplay-mono), "IBM Plex Mono", "Courier New", monospace'
    : settings.font === "courier-prime"
      ? '"Courier Prime", "Courier New", monospace'
      : 'var(--font-serif), "PT Serif", "Times New Roman", serif'
  const fontSize = 18 * (settings.zoomPercent / 100)
  const lineHeight = 1.7
  const textStroke = "0.4px currentColor"
  const wordCount = useMemo(() => {
    const words = safeValue.trim().match(/\S+/g)
    return words ? words.length : 0
  }, [safeValue])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
      if (!raw) return
      const parsedSettings = JSON.parse(raw) as Partial<EditorSettings>
      setSettings((prev) => ({ ...prev, ...parsedSettings }))
    } catch {
      // Ignore malformed local settings.
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    if (typeof window === "undefined") return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => setSystemDark(media.matches)
    apply()
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const ua = window.navigator.userAgent
    const safari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/i.test(ua)
    setIsSafari(safari)
  }, [])

  const html = useMemo(() => {
    if (parsed.length === 0) {
      return "<div><br /></div>"
    }

    return parsed
      .map((line) => {
        const safeText = escapeHtml(line.text)
        const content = safeText.length > 0 ? safeText : "<br />"
        return `<div style="${getLineStyle(line.type, settings.highlightCharacters, line.speaker)}">${content}</div>`
      })
      .join("")
  }, [parsed, settings.highlightCharacters])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    const currentText = normalizeTextFromEditor(editor.innerText).replace(/\n$/, "")
    const incoming = safeValue

    if (currentText !== incoming) {
      editor.innerHTML = html
    }
  }, [html, safeValue])

  const updateActiveLine = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!editor.contains(range.startContainer)) return

    const offsets = getSelectionOffsets(editor)
    if (!offsets) return
    const lineIndex = getLineIndexFromOffset(safeValue, offsets.start)
    const lines = safeValue.split("\n")
    const resolved: LineType[] = []
    for (let i = 0; i < lines.length; i++) {
      resolved.push(classifyLine(lines, i, resolved))
    }
    setActiveLineType(resolved[lineIndex] ?? "action")
  }, [safeValue])

  const updateSelectionUi = useCallback(() => {
    if (!settings.popupPalette) {
      setSelectionUi(null)
      return
    }
    const editor = editorRef.current
    const host = hostRef.current
    if (!editor || !host) return
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      setSelectionUi(null)
      return
    }
    const range = selection.getRangeAt(0)
    if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
      setSelectionUi(null)
      return
    }
    const selected = selection.toString().trim()
    if (!selected) {
      setSelectionUi(null)
      return
    }
    const rect = range.getBoundingClientRect()
    const hostRect = host.getBoundingClientRect()
    setSelectionUi({
      x: rect.left - hostRect.left + rect.width / 2,
      y: rect.top - hostRect.top - 44,
      text: selected,
    })
  }, [settings.popupPalette])

  const handleInput = () => {
    const editor = editorRef.current
    if (!editor) return
    let nextValue = normalizeTextFromEditor(editor.innerText).replace(/\n$/, "")
    nextValue = collapseVerticalTypingArtifact(stripLegacyIndentation(nextValue))
    if (settings.autoCapitalize) {
      nextValue = applyAutoCaps(nextValue)
    }
    if (nextValue !== safeValue) {
      onChange(nextValue)
    }
    updateSelectionUi()
    updateActiveLine()
  }

  const applySelectionTransform = (transform: (selected: string) => string) => {
    const editor = editorRef.current
    if (!editor) return
    const offsets = getSelectionOffsets(editor)
    if (!offsets || offsets.start === offsets.end) return
    const selected = safeValue.slice(offsets.start, offsets.end)
    const updated = `${safeValue.slice(0, offsets.start)}${transform(selected)}${safeValue.slice(offsets.end)}`
    onChange(updated)
    setSelectionUi(null)
  }

  const applyElementType = (target: ElementTarget) => {
    const editor = editorRef.current
    if (!editor) return
    const offsets = getSelectionOffsets(editor)
    const offset = offsets?.start ?? 0
    const lines = safeValue.split("\n")
    const lineIndex = getLineIndexFromOffset(safeValue, offset)
    const current = lines[lineIndex] ?? ""
    lines[lineIndex] = ensureLineType(current, target)
    onChange(lines.join("\n"))
  }

  const showPlaceholder = !isFocused && safeValue.trim().length === 0 && !!placeholder

  return (
    <div
      ref={hostRef}
      className="relative h-full min-h-[1056px] w-full bg-transparent pb-[72px] pl-[96px] pr-[72px] pt-[72px]"
      style={{
        color: isDark ? "#f3efe8" : "#1a1a1a",
        backgroundColor: isDark ? "#111111" : "transparent",
      }}
    >
      <button
        type="button"
        onClick={() => setSettingsOpen((v) => !v)}
        className="fixed right-8 top-24 z-50 flex items-center gap-2 rounded-xl border px-3 py-2"
        style={{
          borderColor: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)",
          backgroundColor: isDark ? "rgba(24,24,24,0.9)" : "rgba(255,255,255,0.9)",
          color: isDark ? "#d4d4d8" : "#2a2a2a",
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
        }}
        aria-label="Open screenplay settings"
      >
        <Settings size={18} />
        <span className="text-sm font-semibold">Settings</span>
      </button>

      {settingsOpen && (
        <div
          className="absolute right-6 top-20 z-30 w-[360px] overflow-hidden rounded-2xl border"
          style={{
            backgroundColor: isDark ? "#1b1e24" : "#f7f7f5",
            borderColor: isDark ? "#3a3f49" : "#d6d6d2",
            color: isDark ? "#ececec" : "#2b2b2b",
            boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
          }}
        >
          <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: isDark ? "#3a3f49" : "#d6d6d2" }}>
            <div className="text-[32px] font-semibold leading-none">All Settings</div>
            <div className="rounded-lg px-2 py-1 text-xs" style={{ backgroundColor: isDark ? "#252a33" : "#e9e9e4" }}>⌘ ,</div>
          </div>

          <div className="space-y-4 px-5 py-4">
            <div className="text-sm font-semibold opacity-70">Writing Preferences</div>

            <div className="space-y-2">
              <div className="text-3xl font-semibold leading-none">Theme</div>
              <div className="grid grid-cols-3 gap-2 rounded-xl border p-1" style={{ borderColor: isDark ? "#3a3f49" : "#d6d6d2" }}>
                {(["light", "system", "dark"] as ThemeMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSettings((prev) => ({ ...prev, theme: mode }))}
                    className="rounded-lg px-3 py-2 text-xl font-semibold capitalize"
                    style={{
                      backgroundColor: settings.theme === mode ? (isDark ? "#2b303a" : "#ffffff") : "transparent",
                      color: settings.theme === mode ? "#7c68ff" : undefined,
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-[42px] font-semibold leading-none">
                <span>Page zoom level</span>
                <span className="text-3xl">{settings.zoomPercent}%</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={60}
                  max={140}
                  step={5}
                  value={settings.zoomPercent}
                  onChange={(event) => setSettings((prev) => ({ ...prev, zoomPercent: Number(event.target.value) }))}
                  className="w-full"
                />
                <div className="flex min-w-[88px] items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: isDark ? "#2a2f38" : "#e4e6e3" }}>
                  <span>{settings.zoomPercent}%</span>
                  <ChevronDown size={14} />
                </div>
              </div>
            </div>

            <div className="border-t pt-4" style={{ borderColor: isDark ? "#3a3f49" : "#d6d6d2" }}>
              <div className="flex items-center justify-between text-[42px] font-semibold leading-none">
                <span>Script font</span>
                <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: isDark ? "#2a2f38" : "#e4e6e3" }}>
                  <select
                    value={settings.font}
                    onChange={(event) => setSettings((prev) => ({ ...prev, font: event.target.value as FontMode }))}
                    className="bg-transparent outline-none"
                  >
                    <option value="ibm-plex-mono">IBM Plex Mono</option>
                    <option value="courier-prime">Courier Prime</option>
                    <option value="pt-serif">PT Serif</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-3 border-t pt-4" style={{ borderColor: isDark ? "#3a3f49" : "#d6d6d2" }}>
              {[
                { key: "showWordCount", label: "Word count" },
                { key: "popupPalette", label: "Popup formatting palette" },
                { key: "elementMenu", label: "Element menu", info: true },
                { key: "headersAndFooters", label: "Headers and footers", info: true },
                { key: "autoCapitalize", label: "Auto capitalize" },
              ].map((item) => {
                const key = item.key as keyof EditorSettings
                const active = Boolean(settings[key])
                return (
                  <div key={item.key} className="flex items-center justify-between text-[40px] font-semibold leading-none">
                    <div className="flex items-center gap-2">
                      <span>{item.label}</span>
                      {item.info && <Info size={16} className="opacity-70" />}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSettings((prev) => ({ ...prev, [key]: !active }))}
                      className="relative h-8 w-14 rounded-full"
                      style={{ backgroundColor: active ? "#6d5dfc" : (isDark ? "#434850" : "#b8b8b3") }}
                    >
                      <span
                        className="absolute top-1 h-6 w-6 rounded-full bg-white transition-all"
                        style={{ left: active ? 30 : 4 }}
                      />
                    </button>
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => setSettings((prev) => ({ ...prev, highlightCharacters: !prev.highlightCharacters }))}
              className="w-full rounded-xl px-4 py-3 text-center text-xl font-semibold"
              style={{ backgroundColor: isDark ? "#2a2f38" : "#e4e6e3" }}
            >
              {settings.highlightCharacters ? "Disable Character Highlight" : "Highlight Characters"}
            </button>
          </div>
        </div>
      )}

      {settings.showWordCount && (
        <div
          className="absolute left-6 top-6 z-20 rounded-full px-3 py-1 text-xs"
          style={{
            backgroundColor: isDark ? "rgba(34,34,34,0.9)" : "rgba(255,255,255,0.92)",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}`,
          }}
        >
          {wordCount} words
        </div>
      )}

      {settings.headersAndFooters && (
        <>
          <div className="pointer-events-none absolute left-[96px] right-[96px] top-5 z-10 flex items-center justify-between text-[11px] opacity-70">
            <span>{new Date().toLocaleDateString()}</span>
            <span>KOZA Screenplay Draft</span>
          </div>
          <div className="pointer-events-none absolute bottom-5 left-[96px] right-[96px] z-10 flex items-center justify-between text-[11px] opacity-70">
            <span>Page 1</span>
            <span>{wordCount} words</span>
          </div>
        </>
      )}

      {showPlaceholder && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            pointerEvents: "none",
            color: "#C4B9AC",
            fontFamily,
            fontWeight: 700,
            fontSize,
            lineHeight,
            WebkitFontSmoothing: "auto",
            WebkitTextStroke: textStroke,
          }}
        >
          {placeholder}
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyUp={() => {
          updateSelectionUi()
          updateActiveLine()
        }}
        onMouseUp={() => {
          updateSelectionUi()
          updateActiveLine()
        }}
        className="h-full min-h-[912px] w-full whitespace-pre-wrap break-words outline-none"
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize,
          lineHeight,
          color: isDark ? "#f3efe8" : "#1a1a1a",
          WebkitFontSmoothing: "auto",
          WebkitTextStroke: textStroke,
        }}
        aria-label="Screenplay page"
      />

      {selectionUi && settings.popupPalette && (
        <div
          className="absolute z-30 flex items-center gap-1 rounded-lg border p-1 text-xs"
          style={{
            left: selectionUi.x,
            top: selectionUi.y,
            transform: "translateX(-50%)",
            backgroundColor: isDark ? "#1c2027" : "#ffffff",
            borderColor: isDark ? "#3a3f49" : "#d6d6d2",
          }}
        >
          <button type="button" className="rounded px-2 py-1" onClick={() => applySelectionTransform((text) => `**${text}**`)}>Bold</button>
          <button type="button" className="rounded px-2 py-1" onClick={() => applySelectionTransform((text) => `*${text}*`)}>Italic</button>
          <button type="button" className="rounded px-2 py-1" onClick={() => applySelectionTransform((text) => text.toUpperCase())}>UPPER</button>
        </div>
      )}
    </div>
  )
}
