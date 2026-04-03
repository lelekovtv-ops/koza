import { describe, it, expect } from "vitest"
import {
  textToSegments,
  segmentsToText,
  segmentsToTracks,
  segmentsToBoardCards,
  segmentsToSimpleTracks,
  getTitleOverlays,
  getSectionMarkers,
  getTotalDurationMs,
  applyTimelineEdit,
  type Segment,
} from "../segmentEngine"

// ─── YouTube format ──────────────────────────────────────────

describe("textToSegments — YouTube format", () => {
  const YOUTUBE_SCRIPT = `[HOOK — 3 сек]
ТИТР: ЛЕНИН
МУЗЫКА: тревожный эмбиент

[ГОВОРЯЩАЯ ГОЛОВА — 15 сек]
ГОЛОС: Владимир Ленин. Одна из самых противоречивых фигур.

[АРХИВНЫЕ КАДРЫ — 10 сек]
ГОЛОС: Родившийся в семье инспектора.
ГРАФИКА: карта Российской Империи
ТИТР: Симбирск, 1870`

  it("creates sections from [SECTION] tags", () => {
    const { sections } = textToSegments(YOUTUBE_SCRIPT)
    expect(sections).toHaveLength(3)
    expect(sections[0].title).toBe("HOOK")
    expect(sections[1].title).toBe("ГОВОРЯЩАЯ ГОЛОВА")
    expect(sections[2].title).toBe("АРХИВНЫЕ КАДРЫ")
  })

  it("strips duration from section title", () => {
    const { sections } = textToSegments("[ИНТРО — 5 сек]\nТИТР: test")
    expect(sections[0].title).toBe("ИНТРО")
  })

  it("creates voice segments from ГОЛОС:", () => {
    const { segments } = textToSegments(YOUTUBE_SCRIPT)
    const voices = segments.filter((s) => s.role === "voice")
    expect(voices).toHaveLength(2)
    expect(voices[0].content).toContain("Владимир Ленин")
    expect(voices[0].track).toBe("voice")
  })

  it("creates graphic segments on visual-b track", () => {
    const { segments } = textToSegments(YOUTUBE_SCRIPT)
    const graphics = segments.filter((s) => s.role === "graphic")
    expect(graphics).toHaveLength(1)
    expect(graphics[0].content).toBe("карта Российской Империи")
    expect(graphics[0].track).toBe("visual-b")
  })

  it("creates title segments on visual-c track", () => {
    const { segments } = textToSegments(YOUTUBE_SCRIPT)
    const titles = segments.filter((s) => s.role === "title")
    expect(titles.length).toBeGreaterThanOrEqual(2)
    expect(titles[0].track).toBe("visual-c")
  })

  it("creates music segments on music track", () => {
    const { segments } = textToSegments(YOUTUBE_SCRIPT)
    const music = segments.filter((s) => s.role === "music")
    expect(music).toHaveLength(1)
    expect(music[0].track).toBe("music")
  })

  it("creates V1 setup-a clips co-dependent with each ГОЛОС", () => {
    const { segments } = textToSegments(YOUTUBE_SCRIPT)
    const voices = segments.filter((s) => s.role === "voice")
    const setups = segments.filter((s) => s.role === "setup-a")
    // Each ГОЛОС creates a paired V1 clip
    expect(setups.length).toBe(voices.length)
    expect(setups[0].track).toBe("visual-a")
    // V1 clip has same startMs and durationMs as its voice
    expect(setups[0].startMs).toBe(voices[0].startMs)
    expect(setups[0].durationMs).toBe(voices[0].durationMs)
  })
})

// ─── Film format ─────────────────────────────────────────────

describe("textToSegments — Film format", () => {
  it("parses INT./EXT. as section heading", () => {
    const { segments, sections } = textToSegments("INT. КУХНЯ - УТРО\nМарина стоит у окна.")
    expect(sections).toHaveLength(1)
    expect(sections[0].title).toBe("INT. КУХНЯ - УТРО")
    expect(segments[0].role).toBe("section-heading")
  })

  it("parses action text as action segments", () => {
    const { segments } = textToSegments("INT. КУХНЯ\nМарина стоит у окна.\nОна открывает окно.")
    const actions = segments.filter((s) => s.role === "action")
    expect(actions).toHaveLength(2)
    expect(actions[0].track).toBe("visual-a")
  })

  it("parses CHARACTER + dialogue as voice segments", () => {
    const { segments } = textToSegments("INT. КУХНЯ\nМАРИНА\nДоброе утро.")
    const voices = segments.filter((s) => s.role === "voice")
    expect(voices).toHaveLength(1)
    expect(voices[0].content).toBe("Доброе утро.")
  })
})

// ─── segmentsToText (roundtrip) ──────────────────────────────

describe("segmentsToText", () => {
  it("roundtrips YouTube format", () => {
    const input = `[HOOK]
ТИТР: ЛЕНИН
МУЗЫКА: эмбиент

[ГОВОРЯЩАЯ ГОЛОВА]
ГОЛОС: Привет мир.
ГРАФИКА: карта`

    const { segments, sections } = textToSegments(input)
    const output = segmentsToText(segments, sections)

    expect(output).toContain("[HOOK]")
    expect(output).toContain("ТИТР: ЛЕНИН")
    expect(output).toContain("МУЗЫКА: эмбиент")
    expect(output).toContain("[ГОВОРЯЩАЯ ГОЛОВА]")
    expect(output).toContain("ГОЛОС: Привет мир.")
    expect(output).toContain("ГРАФИКА: карта")
  })

  it("roundtrips film section headings", () => {
    const input = "INT. КУХНЯ - УТРО"
    const { segments, sections } = textToSegments(input)
    const output = segmentsToText(segments, sections)
    expect(output).toContain("INT. КУХНЯ - УТРО")
  })
})

// ─── segmentsToTracks ────────────────────────────────────────

describe("segmentsToTracks", () => {
  it("groups segments by track (7 tracks)", () => {
    const { segments } = textToSegments(`[СЕКЦИЯ]
ГОЛОС: текст
ГРАФИКА: картинка
ТИТР: заголовок
МУЗЫКА: бит`)

    const tracks = segmentsToTracks(segments)
    expect(tracks).toHaveLength(7) // visual-a,b,c,d + voice + titles + music

    const visualA = tracks.find((t) => t.trackId === "visual-a")!
    const visualB = tracks.find((t) => t.trackId === "visual-b")!
    const visualC = tracks.find((t) => t.trackId === "visual-c")!
    const voice = tracks.find((t) => t.trackId === "voice")!

    expect(visualA.segments.length).toBeGreaterThanOrEqual(1) // V1 from ГОЛОС
    expect(visualB.segments).toHaveLength(1) // ГРАФИКА
    expect(visualC.segments).toHaveLength(1) // ТИТР
    expect(voice.segments).toHaveLength(1)
  })
})

// ─── segmentsToBoardCards ────────────────────────────────────

describe("segmentsToBoardCards", () => {
  it("interleaves A and B cards for YouTube format", () => {
    const { segments, sections } = textToSegments(`[ГОВОРЯЩАЯ ГОЛОВА]
ГОЛОС: Первая часть текста. Мы рассказываем историю.
ГРАФИКА: карта
ГОЛОС: Вторая часть текста. Продолжение истории.`)

    const cards = segmentsToBoardCards(segments, sections)

    // Should have: A₁, B (карта), A₂ — at minimum
    const aCards = cards.filter((c) => c.type === "setup-a")
    const bCards = cards.filter((c) => c.type === "setup-b")

    expect(bCards).toHaveLength(1)
    expect(bCards[0].content).toBe("карта")

    // A cards wrap around B
    expect(aCards.length).toBeGreaterThanOrEqual(1)
  })

  it("creates A cards for each V1 clip (one per ГОЛОС)", () => {
    const { segments, sections } = textToSegments(`[СЕКЦИЯ]
ГОЛОС: Начало.
ГРАФИКА: вставка первая
ГОЛОС: Середина.
ГРАФИКА: вставка вторая
ГОЛОС: Конец.`)

    const cards = segmentsToBoardCards(segments, sections)
    const aCards = cards.filter((c) => c.type === "setup-a")
    const bCards = cards.filter((c) => c.type === "setup-b")

    expect(aCards).toHaveLength(3) // one per ГОЛОС
    expect(bCards).toHaveLength(2) // one per ГРАФИКА
  })

  it("film format: actions become individual cards", () => {
    const { segments, sections } = textToSegments(`INT. КУХНЯ
Марина стоит у окна.
Она поворачивается.`)

    const cards = segmentsToBoardCards(segments, sections)
    expect(cards).toHaveLength(2)
    expect(cards[0].type).toBe("setup-a")
    expect(cards[1].type).toBe("setup-a")
    expect(cards[0].isRepeated).toBe(false)
    expect(cards[1].isRepeated).toBe(false)
  })
})

// ─── Utility ─────────────────────────────────────────────────

describe("getTotalDurationMs", () => {
  it("returns max(startMs + durationMs) across all segments", () => {
    const { segments } = textToSegments("[СЕКЦИЯ]\nГОЛОС: Текст для тестирования длительности.")
    const total = getTotalDurationMs(segments)
    expect(total).toBeGreaterThan(0)
  })

  it("returns 0 for empty segments", () => {
    expect(getTotalDurationMs([])).toBe(0)
  })
})

// ─── segmentsToSimpleTracks (3-track projection) ────────────

describe("segmentsToSimpleTracks", () => {
  const SCRIPT = `[СЕКЦИЯ]
ГОЛОС: текст голоса
ГРАФИКА: картинка
ТИТР: заголовок
МУЗЫКА: бит`

  it("returns exactly 3 tracks: video, voice, music", () => {
    const { segments } = textToSegments(SCRIPT)
    const tracks = segmentsToSimpleTracks(segments)
    expect(tracks).toHaveLength(3)
    expect(tracks.map((t) => t.trackId)).toEqual(["video", "voice", "music"])
  })

  it("puts setup-a and graphic on video track", () => {
    const { segments } = textToSegments(SCRIPT)
    const tracks = segmentsToSimpleTracks(segments)
    const video = tracks.find((t) => t.trackId === "video")!
    const roles = video.segments.map((s) => s.role)
    expect(roles).toContain("setup-a")
    expect(roles).toContain("graphic")
  })

  it("puts voice on voice track", () => {
    const { segments } = textToSegments(SCRIPT)
    const tracks = segmentsToSimpleTracks(segments)
    const voice = tracks.find((t) => t.trackId === "voice")!
    expect(voice.segments).toHaveLength(1)
    expect(voice.segments[0].role).toBe("voice")
  })

  it("puts music on music track", () => {
    const { segments } = textToSegments(SCRIPT)
    const tracks = segmentsToSimpleTracks(segments)
    const music = tracks.find((t) => t.trackId === "music")!
    expect(music.segments).toHaveLength(1)
  })

  it("excludes section-heading and title from tracks", () => {
    const { segments } = textToSegments(SCRIPT)
    const tracks = segmentsToSimpleTracks(segments)
    const allTrackSegs = tracks.flatMap((t) => t.segments)
    expect(allTrackSegs.find((s) => s.role === "section-heading")).toBeUndefined()
    expect(allTrackSegs.find((s) => s.role === "title")).toBeUndefined()
  })
})

// ─── getTitleOverlays ───────────────────────────────────────

describe("getTitleOverlays", () => {
  it("returns only title segments sorted by time", () => {
    const { segments } = textToSegments(`[СЕКЦИЯ]
ТИТР: первый
ГОЛОС: голос
ТИТР: второй`)
    const titles = getTitleOverlays(segments)
    expect(titles.length).toBeGreaterThanOrEqual(2)
    expect(titles.every((s) => s.role === "title")).toBe(true)
    for (let i = 1; i < titles.length; i++) {
      expect(titles[i].startMs).toBeGreaterThanOrEqual(titles[i - 1].startMs)
    }
  })
})

// ─── getSectionMarkers ──────────────────────────────────────

describe("getSectionMarkers", () => {
  it("returns markers for each section", () => {
    const { segments, sections } = textToSegments(`[HOOK]
ГОЛОС: привет

[CTA]
ГОЛОС: пока`)
    const markers = getSectionMarkers(segments, sections)
    expect(markers).toHaveLength(2)
    expect(markers[0].title).toBe("HOOK")
    expect(markers[1].title).toBe("CTA")
    expect(markers[1].startMs).toBeGreaterThan(markers[0].startMs)
  })
})

// ─── applyTimelineEdit ──────────────────────────────────────

describe("applyTimelineEdit", () => {
  const SCRIPT = `[СЕКЦИЯ]
ГОЛОС: первый блок текста для теста.
ГОЛОС: второй блок текста для теста.`

  it("move: changes startMs of target segment", () => {
    const { segments, sections } = textToSegments(SCRIPT)
    const voice = segments.find((s) => s.role === "voice")!
    const result = applyTimelineEdit(segments, sections, {
      type: "move",
      segmentId: voice.id,
      newStartMs: 5000,
    })
    const moved = result.segments.find((s) => s.id === voice.id)!
    expect(moved.startMs).toBe(5000)
  })

  it("move: paired setup-a moves with voice", () => {
    const { segments, sections } = textToSegments(SCRIPT)
    const voice = segments.find((s) => s.role === "voice")!
    const setupA = segments.find(
      (s) => s.role === "setup-a" && s.sourceLine === voice.sourceLine,
    )!

    const result = applyTimelineEdit(segments, sections, {
      type: "move",
      segmentId: voice.id,
      newStartMs: 5000,
    })

    const movedVoice = result.segments.find((s) => s.id === voice.id)!
    const movedSetup = result.segments.find((s) => s.id === setupA.id)!
    expect(movedVoice.startMs).toBe(5000)
    expect(movedSetup.startMs).toBe(movedVoice.startMs)
  })

  it("resize: changes startMs and durationMs", () => {
    const { segments, sections } = textToSegments(SCRIPT)
    const voice = segments.find((s) => s.role === "voice")!

    const result = applyTimelineEdit(segments, sections, {
      type: "resize",
      segmentId: voice.id,
      newStartMs: voice.startMs,
      newDurationMs: 8000,
    })

    const resized = result.segments.find((s) => s.id === voice.id)!
    expect(resized.durationMs).toBe(8000)
  })

  it("resize: enforces minimum duration", () => {
    const { segments, sections } = textToSegments(SCRIPT)
    const voice = segments.find((s) => s.role === "voice")!

    const result = applyTimelineEdit(segments, sections, {
      type: "resize",
      segmentId: voice.id,
      newStartMs: voice.startMs,
      newDurationMs: 100, // below MIN_MS
    })

    const resized = result.segments.find((s) => s.id === voice.id)!
    expect(resized.durationMs).toBeGreaterThanOrEqual(500)
  })

  it("move: clamps to 0", () => {
    const { segments, sections } = textToSegments(SCRIPT)
    const voice = segments.find((s) => s.role === "voice")!

    const result = applyTimelineEdit(segments, sections, {
      type: "move",
      segmentId: voice.id,
      newStartMs: -1000,
    })

    const moved = result.segments.find((s) => s.id === voice.id)!
    expect(moved.startMs).toBe(0)
  })

  it("returns original if segmentId not found", () => {
    const { segments, sections } = textToSegments(SCRIPT)
    const result = applyTimelineEdit(segments, sections, {
      type: "move",
      segmentId: "nonexistent",
      newStartMs: 5000,
    })
    expect(result.segments).toBe(segments) // same reference = no mutation
  })
})
