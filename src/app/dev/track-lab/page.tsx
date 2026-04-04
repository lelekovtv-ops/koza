"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Play,
  Pause,
  SkipBack,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Trash2,
  Type,
  Mic,
  Image as ImageIcon,
  Subtitles,
  Music,
  Volume2,
  VolumeX,
  Clock,
  Maximize2,
  Minimize2,
} from "lucide-react"
import { useSpeech, type SpeechSegment } from "@/hooks/useSpeech"

// ─── Types ───────────────────────────────────────────────────

type TrackId = "visual" | "voice" | "graphics" | "titles" | "music"

interface TextBlock {
  id: string
  track: TrackId
  text: string
  label?: string
  startMs: number
  durationMs: number
  color?: string
  mediaType: "none" | "image" | "video" | "audio"
  mediaBlobKey?: string
  mediaStale: boolean
  sourceLineIndex?: number
}

interface FormatPreset {
  id: string
  name: string
  maxDurationMs: number
  description: string
  tracks: TrackId[]
  wpm: number // words per minute for duration estimation
}

// ─── Format Presets ──────────────────────────────────────────

const FORMAT_PRESETS: FormatPreset[] = [
  {
    id: "reels",
    name: "Reels / TikTok",
    maxDurationMs: 60_000,
    description: "15–60 сек, быстрый монтаж",
    tracks: ["visual", "voice", "titles", "music"],
    wpm: 180,
  },
  {
    id: "youtube",
    name: "YouTube",
    maxDurationMs: 600_000,
    description: "1–10 мин, говорящая голова + графика",
    tracks: ["visual", "voice", "graphics", "titles", "music"],
    wpm: 150,
  },
  {
    id: "ad",
    name: "Реклама",
    maxDurationMs: 30_000,
    description: "15/30/60 сек, жёсткий тайминг",
    tracks: ["visual", "voice", "titles", "music"],
    wpm: 160,
  },
  {
    id: "film",
    name: "Кино",
    maxDurationMs: 10_800_000,
    description: "Полный метр, диалоги + визуал",
    tracks: ["visual", "voice", "graphics", "titles", "music"],
    wpm: 130,
  },
]

// ─── Track styling ───────────────────────────────────────────

const TRACK_META: Record<TrackId, { label: string; color: string; icon: typeof Mic }> = {
  visual: { label: "VISUAL", color: "#D4A853", icon: ImageIcon },
  voice: { label: "VOICE", color: "#8B5CF6", icon: Mic },
  graphics: { label: "GRAPHICS", color: "#10B981", icon: Sparkles },
  titles: { label: "TITLES", color: "#F59E0B", icon: Type },
  music: { label: "MUSIC", color: "#3B82F6", icon: Music },
}

// ─── Parser ──────────────────────────────────────────────────

const TAG_RE = /^\[(.*?)\]\s*$/
const TRACK_HINT_RE = /^(ГОЛОС|VOICE|ТИТР|TITLE|ГРАФИКА|GRAPHICS|МУЗЫКА|MUSIC|B-ROLL|CTA|ИНТРО|INTRO|АУТРО|OUTRO):\s*/i
const SCENE_HEADING_RE = /^(INT\.|EXT\.|INT\/EXT\.|ИНТ\.|НАТ\.)\s*/i
const CHARACTER_RE = /^([A-ZА-ЯЁ][A-ZА-ЯЁ\s.'-]{1,30})(\s*\(.*\))?\s*$/
const PARENTHETICAL_RE = /^\(.*\)$/
const TRANSITION_RE = /^(FADE\s*(IN|OUT|TO)|CUT\s+TO|DISSOLVE|SMASH\s+CUT|ПЕРЕХОД)[.:]*\s*$/i

function parseScriptToBlocks(text: string, preset: FormatPreset): TextBlock[] {
  const lines = text.split("\n")
  const blocks: TextBlock[] = []
  let accumulatedMs = 0
  let order = 0
  // Screenplay state
  let currentCharacter: string | null = null
  let currentParenthetical: string | null = null
  let inDialogueChain = false

  const estimateMs = (txt: string) => {
    const words = txt.trim().split(/\s+/).filter(Boolean).length
    return Math.max(1000, Math.round((words / preset.wpm) * 60_000) + 500)
  }

  const createId = () => `tb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${order}`

  const pushBlock = (track: TrackId, txt: string, label?: string, durationMs?: number) => {
    const dur = durationMs ?? estimateMs(txt)
    blocks.push({
      id: createId(),
      track,
      text: txt,
      label,
      startMs: accumulatedMs,
      durationMs: dur,
      color: TRACK_META[track].color,
      mediaType: "none",
      mediaStale: false,
      sourceLineIndex: order,
    })
    order++
    // Only visual and voice advance the timeline clock
    if (track === "visual" || track === "voice") accumulatedMs += dur
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) {
      // Blank line breaks dialogue chain
      if (inDialogueChain) { inDialogueChain = false; currentCharacter = null }
      continue
    }

    // ── [SECTION] tags (YouTube/Ad format) ──
    const tagMatch = trimmed.match(TAG_RE)
    if (tagMatch) {
      inDialogueChain = false; currentCharacter = null
      const inner = tagMatch[1]
      const durMatch = inner.match(/(\d+)\s*(сек|sec|мин|min)/i)
      let dur = 3000
      if (durMatch) {
        const val = parseInt(durMatch[1])
        const unit = durMatch[2].toLowerCase()
        dur = (unit.startsWith("мін") || unit.startsWith("мин") || unit.startsWith("min")) ? val * 60_000 : val * 1000
      }
      const sectionName = inner.replace(/\s*[—\-–]\s*\d+\s*(сек|sec|мін|мин|min).*/i, "").trim()
      pushBlock("visual", sectionName, sectionName, dur)
      continue
    }

    // ── Track hints: ГОЛОС: / ТИТР: / ГРАФИКА: ──
    const hintMatch = trimmed.match(TRACK_HINT_RE)
    if (hintMatch) {
      inDialogueChain = false; currentCharacter = null
      const hint = hintMatch[1].toUpperCase()
      const content = trimmed.slice(hintMatch[0].length).trim()
      if (!content) continue

      let track: TrackId = "voice"
      if (/ГОЛОС|VOICE/.test(hint)) track = "voice"
      else if (/ТИТР|TITLE/.test(hint)) track = "titles"
      else if (/ГРАФИКА|GRAPHICS|B-ROLL/.test(hint)) track = "graphics"
      else if (/МУЗЫКА|MUSIC/.test(hint)) track = "music"
      else if (/CTA|ИНТРО|INTRO|АУТРО|OUTRO/.test(hint)) track = "visual"

      pushBlock(track, content, hint)
      continue
    }

    // ── TRANSITIONS ──
    if (TRANSITION_RE.test(trimmed)) {
      inDialogueChain = false; currentCharacter = null
      pushBlock("titles", trimmed, "TRANSITION", 1500)
      continue
    }

    // ── SCENE HEADING: INT. / EXT. ──
    if (SCENE_HEADING_RE.test(trimmed)) {
      inDialogueChain = false; currentCharacter = null
      // Scene heading = visual block (the establishing shot / location)
      pushBlock("visual", trimmed, trimmed.slice(0, 30), 3000)
      continue
    }

    // ── CHARACTER NAME ──
    if (!inDialogueChain && CHARACTER_RE.test(trimmed) && trimmed.length < 40) {
      const name = trimmed.replace(/\s*\(.*\)\s*$/, "").trim()
      // Don't match scene headings or transitions
      if (!SCENE_HEADING_RE.test(trimmed) && !TRANSITION_RE.test(trimmed)) {
        currentCharacter = name
        currentParenthetical = null
        inDialogueChain = true
        // Check for (V.O.) extension
        const ext = (trimmed.match(/\(([^)]+)\)/) ?? [])[1] ?? ""
        if (/V\.?O\.?/i.test(ext)) {
          currentParenthetical = "V.O."
        }
        continue
      }
    }

    // ── PARENTHETICAL ──
    if (inDialogueChain && PARENTHETICAL_RE.test(trimmed)) {
      currentParenthetical = trimmed.replace(/^\(|\)$/g, "").trim()
      continue
    }

    // ── DIALOGUE (follows character) ──
    if (inDialogueChain && currentCharacter) {
      const isVO = currentParenthetical?.toUpperCase().includes("V.O.")
      const label = currentParenthetical
        ? `${currentCharacter} (${currentParenthetical})`
        : currentCharacter
      pushBlock(
        isVO ? "voice" : "voice",
        trimmed,
        label,
      )
      // Add character name to titles track as a subtitle indicator
      pushBlock("titles", `${currentCharacter}: ${trimmed}`, currentCharacter, estimateMs(trimmed))
      // Rewind titles — it should overlap with voice, not advance
      accumulatedMs -= estimateMs(trimmed)
      currentParenthetical = null
      continue
    }

    // ── ACTION / DESCRIPTION ──
    inDialogueChain = false; currentCharacter = null
    pushBlock("visual", trimmed, "ACTION", estimateMs(trimmed))
  }

  return blocks
}

// ─── Demo script ─────────────────────────────────────────────

const DEMO_YOUTUBE = `[ИНТРО — 3 сек]
МУЗЫКА: энергичный бит, 120 bpm
ТИТР: КАК УВЕЛИЧИТЬ КОНВЕРСИЮ В 4 РАЗА

[ГОВОРЯЩАЯ ГОЛОВА — 12 сек]
Привет! Сегодня разберём три способа увеличить конверсию вашего лендинга. Я протестировал каждый на реальных проектах.
ТИТР: @максмаркетинг

[ГРАФИКА: воронка продаж — 8 сек]
ГОЛОС: Смотрите, вот типичная воронка. Заходят тысяча человек, покупают двадцать.
ГРАФИКА: анимированная воронка, числа 1000 → 20
ТИТР: Конверсия 2%

[СПОСОБ 1 — 15 сек]
ГОЛОС: Первый способ — заголовок. Меняем одно слово и смотрите что происходит с конверсией.
ГРАФИКА: A/B тест, два варианта заголовка
ТИТР: Было: "Купите наш продукт" → Стало: "Попробуйте бесплатно"

[СПОСОБ 2 — 15 сек]
ГОЛОС: Второй способ — социальное доказательство. Добавляем отзывы прямо на первый экран.
ГРАФИКА: скриншот лендинга с отзывами

[СПОСОБ 3 — 12 сек]
ГОЛОС: Третий — убираем всё лишнее. Одна страница, одна кнопка, одно действие.
ГРАФИКА: минималистичный лендинг

[РЕЗУЛЬТАТ — 8 сек]
ГОЛОС: Итого — с двух процентов до восьми. В четыре раза.
ТИТР: 2% → 8% КОНВЕРСИЯ
ГРАФИКА: график роста

[CTA — 5 сек]
ГОЛОС: Подписывайтесь, ставьте лайк. Ссылка на чеклист в описании.
ТИТР: ПОДПИШИСЬ 👇
МУЗЫКА: бит усиливается`

const DEMO_FILM = `EXT. МОРСКОЕ ДНО — ДЕНЬ

Яркий подводный мир. Кораллы всех цветов, стаи тропических рыб, лучи солнца пробиваются сквозь толщу воды. Между кораллами проплывает АРИЭЛЬ — русалка с длинными рыжими волосами и изумрудным хвостом.

АРИЭЛЬ
Себастьян, смотри! Я нашла что-то необыкновенное!

Ариэль поднимает со дна странный блестящий предмет — старинная подзорная труба.

СЕБАСТЬЯН
Ариэль, умоляю! Положи эту человеческую штуковину обратно. Твой отец будет в ярости!

АРИЭЛЬ
(мечтательно)
Мне так хочется узнать, как они живут... Там, наверху.

АРИЭЛЬ (V.O.)
Каждый день я собираю эти маленькие осколки другого мира. И каждый из них шепчет мне — там есть что-то большее.

EXT. ПОВЕРХНОСТЬ ОКЕАНА — ЗАКАТ

Ариэль выныривает из воды. Небо горит оранжевым и розовым. Вдалеке — силуэт корабля с яркими огнями. Звучит музыка и смех.

АРИЭЛЬ
(восхищённо)
Какая красота...

На палубе корабля стоит ПРИНЦ ЭРИК, молодой, с тёмными волосами на ветру. Он играет на флейте.

АРИЭЛЬ (V.O.)
В тот момент я поняла — моё сердце больше не принадлежит океану.

EXT. ТРОННЫЙ ЗАЛ — НОЧЬ

Огромный зал из перламутра и кораллов. На троне — КОРОЛЬ ТРИТОН с серебряной бородой и трезубцем. Он смотрит на Ариэль с гневом.

КОРОЛЬ ТРИТОН
Ты снова была на поверхности?!

АРИЭЛЬ
Папа, послушай...

КОРОЛЬ ТРИТОН
Нет, это ТЫ послушай! Люди опасны. Я запрещаю тебе подниматься наверх!

АРИЭЛЬ
(со слезами)
Ты не понимаешь! Ты никогда не понимал!

Ариэль уплывает. Тритон опускает трезубец. За гневом — страх за дочь.

СЕБАСТЬЯН
(тихо)
Ваше Величество... Она просто мечтает.

КОРОЛЬ ТРИТОН
Именно это меня и пугает.

INT. ПЕЩЕРА УРСУЛЫ — НОЧЬ

Тёмная пещера, обвитая щупальцами. УРСУЛА парит в центре — фиолетовая кожа, щупальца осьминога. Глаза горят жёлтым.

УРСУЛА
(сладко)
Бедная маленькая принцесса... Я могу дать тебе то, что ты хочешь. Ноги. Три дня на суше.

АРИЭЛЬ
А что взамен?

УРСУЛА
Сущий пустяк, дорогая. Твой голос.

АРИЭЛЬ
(шёпотом)
Мой голос...

УРСУЛА
Один поцелуй настоящей любви до заката третьего дня — и ты останешься человеком навсегда. Если нет... ты станешь моей.

Урсула протягивает светящийся контракт. Рука Ариэль дрожит.

АРИЭЛЬ (V.O.)
Я знала, что это безумие. Но когда ты шестнадцать лет мечтаешь о чём-то — ты готова заплатить любую цену.

Ариэль подписывает. Вспышка золотого света. Из горла вылетает светящаяся сфера — её голос. Урсула хватает сферу и смеётся.

FADE OUT.`

const DEMO_REELS = `[HOOK — 2 сек]
ТИТР: ЭТО ИЗМЕНИТ ВАШИ ФОТО

[ПРИЁМ — 5 сек]
ГОЛОС: Один трюк который используют все фотографы.
ГРАФИКА: до/после фото

[ДЕМО — 5 сек]
ГОЛОС: Просто добавьте контровой свет. Всё.
ГРАФИКА: схема освещения

[CTA — 3 сек]
ТИТР: Сохрани себе ↗
МУЗЫКА: трендовый звук`

// ─── Helper ──────────────────────────────────────────────────

function formatTime(ms: number): string {
  const sec = Math.floor(ms / 1000)
  const min = Math.floor(sec / 60)
  const s = sec % 60
  return `${min}:${String(s).padStart(2, "0")}`
}

// ─── Page ────────────────────────────────────────────────────

export default function TrackLabPage() {
  const [format, setFormat] = useState<FormatPreset>(FORMAT_PRESETS[1]) // YouTube
  const [script, setScript] = useState(DEMO_YOUTUBE)
  const [blocks, setBlocks] = useState<TextBlock[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [zoom, setZoom] = useState(80) // px per second
  const [scrollLeft, setScrollLeft] = useState(0)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [editorCollapsed, setEditorCollapsed] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [voiceOn, setVoiceOn] = useState(true)
  const playRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)
  const trackContainerRef = useRef<HTMLDivElement>(null)
  const TRACK_LABEL_W = 80

  // TTS
  const speech = useSpeech({ defaultRate: playbackRate })
  const prevPlayingRef = useRef(false)
  const spokenBlockIdRef = useRef<string | null>(null)

  // Build sorted voice segments for TTS
  const voiceSegments = useMemo(() => {
    return blocks
      .filter((b) => b.track === "voice")
      .sort((a, b) => a.startMs - b.startMs)
  }, [blocks])

  // Pre-buffer: start speaking BEFORE playhead reaches the block
  // Web Speech API has ~300-500ms startup latency
  const SPEECH_PREBUFFER_MS = 500

  useEffect(() => {
    if (!voiceOn || !isPlaying) return

    // Check: is playhead inside a block, or approaching one within prebuffer window?
    const activeOrUpcoming = voiceSegments.find(
      (b) => currentTime >= b.startMs - SPEECH_PREBUFFER_MS && currentTime < b.startMs + b.durationMs,
    )

    if (activeOrUpcoming && activeOrUpcoming.id !== spokenBlockIdRef.current) {
      spokenBlockIdRef.current = activeOrUpcoming.id
      const lang = /[а-яё]/i.test(activeOrUpcoming.text) ? "ru-RU" : "en-US"
      speech.speak([{
        id: activeOrUpcoming.id,
        text: activeOrUpcoming.text,
        lang,
        rate: playbackRate,
      }])
    } else if (!activeOrUpcoming && spokenBlockIdRef.current) {
      spokenBlockIdRef.current = null
    }
  }, [currentTime, voiceSegments, voiceOn, isPlaying, playbackRate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stop speech on pause/stop
  useEffect(() => {
    if (!isPlaying && prevPlayingRef.current) {
      speech.stop()
      spokenBlockIdRef.current = null
    }
    prevPlayingRef.current = isPlaying
  }, [isPlaying]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stop speech when voice toggled off
  useEffect(() => {
    if (!voiceOn && speech.speaking) {
      speech.stop()
      spokenBlockIdRef.current = null
    }
  }, [voiceOn]) // eslint-disable-line react-hooks/exhaustive-deps

  // Parse on script or format change
  useEffect(() => {
    const parsed = parseScriptToBlocks(script, format)
    setBlocks(parsed)
  }, [script, format])

  // Playback loop
  useEffect(() => {
    if (!isPlaying) {
      if (playRef.current) cancelAnimationFrame(playRef.current)
      return
    }
    lastFrameRef.current = performance.now()
    const tick = (now: number) => {
      const dt = (now - lastFrameRef.current) * playbackRate
      lastFrameRef.current = now
      setCurrentTime((t) => {
        const next = t + dt
        const totalDur = blocks.reduce((max, b) => Math.max(max, b.startMs + b.durationMs), 0)
        if (next >= totalDur) {
          setIsPlaying(false)
          return totalDur
        }
        return next
      })
      playRef.current = requestAnimationFrame(tick)
    }
    playRef.current = requestAnimationFrame(tick)
    return () => { if (playRef.current) cancelAnimationFrame(playRef.current) }
  }, [isPlaying, blocks, playbackRate])

  const totalDuration = useMemo(
    () => blocks.reduce((max, b) => Math.max(max, b.startMs + b.durationMs), 0),
    [blocks],
  )

  const totalWidth = (totalDuration / 1000) * zoom
  const playheadX = (currentTime / 1000) * zoom

  // Auto-scroll: keep playhead visible (DaVinci style — playhead at ~33% of viewport)
  useEffect(() => {
    if (!isPlaying) return
    const container = trackContainerRef.current
    if (!container) return
    const viewW = container.clientWidth - TRACK_LABEL_W
    const playheadInView = playheadX - scrollLeft
    // When playhead passes 60% of view, scroll so playhead is at 33%
    if (playheadInView > viewW * 0.6) {
      setScrollLeft(Math.max(0, playheadX - viewW * 0.33))
    }
    // When playhead goes behind scroll (e.g. after seek backwards)
    if (playheadInView < 0) {
      setScrollLeft(Math.max(0, playheadX - viewW * 0.1))
    }
  }, [isPlaying, playheadX, scrollLeft])

  // Wheel/trackpad on timeline area
  // macOS trackpad: two-finger horizontal → deltaX, two-finger vertical → deltaY
  // Pinch zoom → ctrlKey + deltaY
  const timelineAreaRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const area = timelineAreaRef.current
    if (!area) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()

      // Pinch zoom (macOS) or Ctrl+scroll
      if (e.ctrlKey || e.metaKey) {
        const delta = e.deltaY > 0 ? -10 : 10
        setZoom((z) => Math.max(20, Math.min(300, z + delta)))
        return
      }

      // Trackpad two-finger: use both deltaX and deltaY for horizontal scroll
      // On macOS trackpad, horizontal swipe gives deltaX
      // Vertical swipe gives deltaY — also use for horizontal (timeline is horizontal)
      const dx = Math.abs(e.deltaX) > 2 ? e.deltaX : e.deltaY
      setScrollLeft((s) => Math.max(0, s + dx * 1.5))
    }
    area.addEventListener("wheel", handleWheel, { passive: false })
    return () => area.removeEventListener("wheel", handleWheel)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't capture when typing in textarea/input
      if ((e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT") return

      switch (e.code) {
        case "Space":
          e.preventDefault()
          setIsPlaying((p) => !p)
          break
        case "Home":
          e.preventDefault()
          setCurrentTime(0)
          setScrollLeft(0)
          break
        case "End":
          e.preventDefault()
          setCurrentTime(totalDuration)
          break
        case "ArrowLeft":
          e.preventDefault()
          setCurrentTime((t) => Math.max(0, t - (e.shiftKey ? 5000 : 1000)))
          break
        case "ArrowRight":
          e.preventDefault()
          setCurrentTime((t) => Math.min(totalDuration, t + (e.shiftKey ? 5000 : 1000)))
          break
        case "KeyJ":
          // Reverse (or slow down)
          setPlaybackRate((r) => Math.max(0.25, r - 0.25))
          break
        case "KeyK":
          // Pause
          setIsPlaying(false)
          break
        case "KeyL":
          // Speed up
          if (!isPlaying) setIsPlaying(true)
          else setPlaybackRate((r) => Math.min(4, r + 0.25))
          break
        case "Equal":
        case "NumpadAdd":
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom((z) => Math.min(300, z + 20)) }
          break
        case "Minus":
        case "NumpadSubtract":
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom((z) => Math.max(20, z - 20)) }
          break
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [totalDuration, isPlaying])

  // Click-to-seek on ruler
  const handleRulerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left + scrollLeft
    const timeMs = (x / zoom) * 1000
    setCurrentTime(Math.max(0, Math.min(totalDuration, timeMs)))
  }, [scrollLeft, zoom, totalDuration])

  // Speed cycle
  const SPEED_STEPS = [0.5, 1, 1.5, 2, 4] as const
  const cycleSpeed = () => {
    const idx = SPEED_STEPS.indexOf(playbackRate as typeof SPEED_STEPS[number])
    setPlaybackRate(SPEED_STEPS[(idx + 1) % SPEED_STEPS.length])
  }

  // Active blocks at current time
  const activeBlockIds = useMemo(
    () => new Set(blocks.filter((b) => currentTime >= b.startMs && currentTime < b.startMs + b.durationMs).map((b) => b.id)),
    [blocks, currentTime],
  )

  // Current subtitle
  const currentVoice = useMemo(
    () => blocks.find((b) => b.track === "voice" && currentTime >= b.startMs && currentTime < b.startMs + b.durationMs),
    [blocks, currentTime],
  )

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId)

  const handleFormatChange = (presetId: string) => {
    const p = FORMAT_PRESETS.find((f) => f.id === presetId)
    if (!p) return
    setFormat(p)
    if (presetId === "reels") setScript(DEMO_REELS)
    else if (presetId === "film") setScript(DEMO_FILM)
    else if (presetId === "ad") setScript(DEMO_REELS)
    else setScript(DEMO_YOUTUBE)
    setCurrentTime(0)
    setScrollLeft(0)
    setIsPlaying(false)
    setSelectedBlockId(null)
    speech.stop()
    spokenBlockIdRef.current = null
  }

  return (
    <main className="flex h-screen flex-col bg-[#0B0A09] text-white overflow-hidden">
      {/* Top bar */}
      <div className="flex h-11 items-center gap-3 border-b border-white/[0.06] px-4 shrink-0">
        <Link href="/dev" className="text-white/30 hover:text-white/60 transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#D4A853]/60">Track Lab</span>
        <div className="h-4 w-px bg-white/10" />

        {/* Format selector */}
        <div className="flex gap-1">
          {FORMAT_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handleFormatChange(p.id)}
              className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-all ${
                format.id === p.id
                  ? "bg-[#D4A853]/15 text-[#D4A853]"
                  : "text-white/30 hover:text-white/50 hover:bg-white/5"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Stats */}
        <div className="flex items-center gap-3 text-[10px] text-white/25">
          <span>{blocks.length} blocks</span>
          <span>{formatTime(totalDuration)}</span>
          <span className="text-[#D4A853]/40">{format.description}</span>
        </div>
      </div>

      {/* Main area: editor + timeline */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Script editor */}
        <div
          className={`shrink-0 border-r border-white/[0.06] flex flex-col transition-all ${
            editorCollapsed ? "w-0 overflow-hidden" : "w-[380px]"
          }`}
        >
          <div className="flex h-8 items-center justify-between px-3 border-b border-white/[0.06]">
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/25">Сценарий</span>
            <button
              onClick={() => setEditorCollapsed(true)}
              className="text-white/20 hover:text-white/50"
            >
              <Minimize2 size={12} />
            </button>
          </div>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            className="flex-1 resize-none bg-transparent px-4 py-3 text-[12px] leading-6 text-white/70 outline-none placeholder:text-white/15 font-mono"
            placeholder="Вставь сценарий..."
            spellCheck={false}
          />
        </div>

        {/* Right: Timeline */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Preview / subtitle area */}
          <div className="h-[160px] border-b border-white/[0.06] flex items-center justify-center relative bg-black/30 shrink-0">
            {editorCollapsed && (
              <button
                onClick={() => setEditorCollapsed(false)}
                className="absolute left-3 top-3 text-white/20 hover:text-white/50"
              >
                <Maximize2 size={14} />
              </button>
            )}

            {/* Current visual block */}
            {(() => {
              const visual = blocks.find((b) => b.track === "visual" && activeBlockIds.has(b.id))
              return visual ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#D4A853]/40">{visual.label || "VISUAL"}</span>
                  <span className="text-[14px] text-white/50 max-w-[400px] text-center">{visual.text}</span>
                </div>
              ) : (
                <span className="text-[11px] text-white/15">Нет активного блока</span>
              )
            })()}

            {/* Subtitle */}
            {currentVoice && (
              <div className="absolute bottom-4 inset-x-0 flex justify-center px-8">
                <span className="rounded-md bg-black/70 px-4 py-2 text-[13px] text-white/90 backdrop-blur-sm max-w-[500px] text-center leading-5">
                  {currentVoice.text}
                </span>
              </div>
            )}

            {/* Time */}
            <span className="absolute bottom-2 right-3 font-mono text-[10px] text-white/25">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>
          </div>

          {/* Transport */}
          <div className="flex h-9 items-center gap-1 border-b border-white/[0.06] px-3 shrink-0">
            <button onClick={() => { setCurrentTime(0); setScrollLeft(0); setIsPlaying(false) }} className="p-1.5 text-white/40 hover:text-white/70" title="Rewind (Home)">
              <SkipBack size={13} />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-1.5 text-white/40 hover:text-white/70"
              title="Play/Pause (Space)"
            >
              {isPlaying ? <Pause size={13} /> : <Play size={13} />}
            </button>

            <span className="ml-2 font-mono text-[11px]">
              <span className="text-[#D4A853]">{formatTime(currentTime)}</span>
              <span className="text-white/25"> / {formatTime(totalDuration)}</span>
            </span>

            <button
              onClick={cycleSpeed}
              className="ml-2 rounded px-1.5 py-0.5 font-mono text-[10px] text-white/35 hover:text-white/60 hover:bg-white/5"
              title="Speed (J/K/L)"
            >
              ×{playbackRate}
            </button>

            <button
              onClick={() => setVoiceOn(!voiceOn)}
              className={`ml-1 rounded p-1.5 transition-colors ${voiceOn ? "text-emerald-400" : "text-white/25 hover:text-white/50"}`}
              title={voiceOn ? "Mute voice" : "Enable voice"}
            >
              {voiceOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
            </button>

            <div className="flex-1" />

            <span className="text-[9px] text-white/15 mr-2">Space Play · J/K/L · ←→ Seek · Scroll Zoom</span>

            <button onClick={() => setZoom(Math.max(20, zoom - 20))} className="p-1 text-white/30 hover:text-white/60">
              <ZoomOut size={13} />
            </button>
            <input
              type="range"
              min={20}
              max={300}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="mx-1 h-1 w-16 cursor-pointer appearance-none rounded bg-white/10 accent-[#D4A853]"
            />
            <button onClick={() => setZoom(Math.min(300, zoom + 20))} className="p-1 text-white/30 hover:text-white/60">
              <ZoomIn size={13} />
            </button>
          </div>

          {/* Timeline area (ruler + tracks) — handles wheel/trackpad */}
          <div ref={timelineAreaRef} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Ruler — click to seek */}
          <div className="flex h-6 border-b border-white/[0.04] shrink-0 bg-white/[0.02]">
            <div style={{ width: TRACK_LABEL_W }} className="shrink-0 border-r border-white/[0.06]" />
            <div
              className="relative flex-1 overflow-hidden cursor-pointer"
              onClick={handleRulerClick}
            >
              <div style={{ width: totalWidth, transform: `translateX(${-scrollLeft}px)` }} className="h-full relative">
                {Array.from({ length: Math.ceil(totalDuration / 5000) + 1 }).map((_, i) => {
                  const sec = i * 5
                  const x = sec * zoom
                  return (
                    <div key={i} className="absolute top-0 h-full" style={{ left: x }}>
                      <div className="h-2 w-px bg-white/10" />
                      <span className="absolute top-1.5 left-1 text-[8px] text-white/20 font-mono whitespace-nowrap">
                        {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")}
                      </span>
                    </div>
                  )
                })}
                {/* Playhead on ruler */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-[#D4A853]"
                  style={{ left: playheadX }}
                />
                <div
                  className="absolute top-0 w-2.5 h-3 -translate-x-1/2"
                  style={{
                    left: playheadX,
                    clipPath: "polygon(0 0, 100% 0, 50% 100%)",
                    backgroundColor: "#D4A853",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Tracks */}
          <div className="flex-1 overflow-hidden" ref={trackContainerRef} >
            {format.tracks.map((trackId) => {
              const meta = TRACK_META[trackId]
              const Icon = meta.icon
              const trackBlocks = blocks.filter((b) => b.track === trackId)

              return (
                <div key={trackId} className="flex border-b border-white/[0.04]" style={{ minHeight: 44 }}>
                  {/* Track label */}
                  <div style={{ width: TRACK_LABEL_W }} className="shrink-0 flex items-center justify-center gap-1.5 border-r border-white/[0.06]">
                    <Icon size={11} style={{ color: `${meta.color}66` }} />
                    <span className="text-[8px] font-bold uppercase tracking-[0.15em]" style={{ color: `${meta.color}66` }}>
                      {meta.label}
                    </span>
                  </div>

                  {/* Track content */}
                  <div className="relative flex-1 overflow-hidden" style={{ minHeight: 40 }}>
                    <div
                      className="relative h-full"
                      style={{ width: Math.max(totalWidth, 100), transform: `translateX(${-scrollLeft}px)` }}
                    >
                      {trackBlocks.map((block) => {
                        const left = (block.startMs / 1000) * zoom
                        const width = Math.max(8, (block.durationMs / 1000) * zoom)
                        const isActive = activeBlockIds.has(block.id)
                        const isSelected = selectedBlockId === block.id

                        return (
                          <div
                            key={block.id}
                            className="absolute top-1 bottom-1 rounded-md border cursor-pointer transition-all overflow-hidden"
                            style={{
                              left,
                              width,
                              borderColor: isSelected
                                ? meta.color
                                : isActive
                                  ? `${meta.color}50`
                                  : `${meta.color}20`,
                              backgroundColor: isActive ? `${meta.color}15` : `${meta.color}08`,
                              boxShadow: isSelected ? `0 0 8px ${meta.color}30` : undefined,
                            }}
                            onClick={() => setSelectedBlockId(block.id)}
                          >
                            <div className="px-1.5 py-0.5 min-w-0">
                              {width > 50 && block.label && (
                                <div
                                  className="truncate text-[7px] font-bold uppercase tracking-wider"
                                  style={{ color: `${meta.color}AA` }}
                                >
                                  {block.label}
                                </div>
                              )}
                              {width > 80 && (
                                <div className="truncate text-[9px] text-white/40 leading-tight">
                                  {block.text}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}

                      {/* Playhead — vertical line through all tracks */}
                      <div
                        className="pointer-events-none absolute top-0 bottom-0 w-px bg-[#D4A853]/80"
                        style={{ left: playheadX }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          </div>{/* close timelineAreaRef */}

          {/* Selected block inspector */}
          {selectedBlock && (
            <div className="h-[120px] border-t border-white/[0.08] bg-white/[0.02] px-4 py-3 shrink-0 flex gap-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="rounded-sm px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
                    style={{ backgroundColor: `${TRACK_META[selectedBlock.track].color}20`, color: TRACK_META[selectedBlock.track].color }}
                  >
                    {TRACK_META[selectedBlock.track].label}
                  </span>
                  {selectedBlock.label && (
                    <span className="text-[10px] text-white/40">{selectedBlock.label}</span>
                  )}
                </div>
                <textarea
                  value={selectedBlock.text}
                  onChange={(e) => {
                    setBlocks((prev) =>
                      prev.map((b) => (b.id === selectedBlock.id ? { ...b, text: e.target.value, mediaStale: true } : b)),
                    )
                  }}
                  className="w-full h-[50px] resize-none rounded bg-white/4 border border-white/8 px-2 py-1.5 text-[11px] text-white/70 outline-none"
                />
              </div>
              <div className="flex flex-col gap-2 w-[140px]">
                <div>
                  <span className="text-[8px] uppercase tracking-wider text-white/20">Duration</span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <input
                      type="number"
                      value={Math.round(selectedBlock.durationMs / 1000 * 10) / 10}
                      onChange={(e) => {
                        const ms = Math.max(500, parseFloat(e.target.value) * 1000)
                        setBlocks((prev) =>
                          prev.map((b) => (b.id === selectedBlock.id ? { ...b, durationMs: ms } : b)),
                        )
                      }}
                      className="w-16 rounded bg-white/4 border border-white/8 px-2 py-1 text-[11px] text-white/60 outline-none"
                      step={0.5}
                      min={0.5}
                    />
                    <span className="text-[10px] text-white/25">сек</span>
                  </div>
                </div>
                <div>
                  <span className="text-[8px] uppercase tracking-wider text-white/20">Start</span>
                  <span className="block text-[11px] text-white/40 mt-0.5">
                    {formatTime(selectedBlock.startMs)}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setBlocks((prev) => prev.filter((b) => b.id !== selectedBlock.id))
                    setSelectedBlockId(null)
                  }}
                  className="flex items-center gap-1 text-[10px] text-red-400/50 hover:text-red-400/80 mt-auto"
                >
                  <Trash2 size={10} /> Удалить блок
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
