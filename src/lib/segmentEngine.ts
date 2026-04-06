/**
 * Segment Engine — unified data model for Script ↔ Timeline ↔ Board.
 *
 * Everything is a Segment. Three views are projections of one Segment[].
 * Script = text serialization. Timeline = multi-track layout. Board = A/B interleave.
 */

// ─── Types ───────────────────────────────────────────────────

export type SegmentRole =
  | "section-heading"
  | "setup-a"
  | "setup-b"
  | "voice"
  | "title"
  | "graphic"
  | "music"
  | "action"
  | "transition"

export type TrackId =
  | "visual-a"   // V1: main camera / talking head
  | "visual-b"   // V2: B-roll / graphics / cutaway
  | "visual-c"   // V3: titles / lower thirds overlay
  | "visual-d"   // V4: additional layer
  | "voice"
  | "titles"
  | "music"

export interface Segment {
  id: string
  content: string
  role: SegmentRole
  track: TrackId
  startMs: number
  durationMs: number
  sectionId: string
  order: number
  media: { thumbnailUrl: string | null; imagePrompt: string } | null
  /** Source line index in the original text (for script highlighting) */
  sourceLine: number
}

export interface Section {
  id: string
  title: string
  order: number
  color: string
}

export interface BoardCard {
  segmentId: string
  type: "setup-a" | "setup-b"
  label: string
  content: string
  thumbnailUrl: string | null
  startMs: number
  durationMs: number
  sectionTitle: string
  sectionColor: string
  isRepeated: boolean
}

export interface TrackData {
  trackId: TrackId
  label: string
  color: string
  segments: Segment[]
}

// ─── Constants ───────────────────────────────────────────────

const VOICE_WPM = 155
const ACTION_WPM = 60
const HEADING_MS = 2000
const TITLE_MS = 3000
const MUSIC_MS = 5000
const TRANSITION_MS = 1500
const MIN_MS = 500

const SECTION_COLORS = [
  "#D4A853", "#4A9C6F", "#7C6FD8", "#E05C5C",
  "#3B82F6", "#F59E0B", "#EC4899", "#14B8A6",
  "#8B5CF6", "#EF4444", "#10B981", "#6366F1",
]

const TRACK_META: Record<TrackId, { label: string; color: string }> = {
  "visual-a": { label: "VISUAL",  color: "#D4A853" },
  "visual-b": { label: "B-ROLL",  color: "#10B981" },
  "visual-c": { label: "OVERLAY", color: "#F59E0B" },
  "visual-d": { label: "EXTRA",   color: "#EC4899" },
  voice:      { label: "VOICE",   color: "#8B5CF6" },
  titles:     { label: "TITLES",  color: "#8B8B8B" },
  music:      { label: "MUSIC",   color: "#3B82F6" },
}

// ─── Helpers ─────────────────────────────────────────────────

let _idCounter = 0
export function segId(stableKey?: string): string {
  if (stableKey) return `seg-${stableKey}`
  return `seg-${Date.now()}-${++_idCounter}`
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function voiceDurationMs(text: string): number {
  return Math.max(MIN_MS, Math.round((wordCount(text) / VOICE_WPM) * 60_000) + 300)
}

function actionDurationMs(text: string): number {
  return Math.max(2000, Math.min(15000, Math.round((wordCount(text) / ACTION_WPM) * 60_000)))
}

// ─── Parser: Text → Segments ─────────────────────────────────

const RE_SECTION    = /^\[(.+)\]\s*$/
const RE_VOICE      = /^(ГОЛОС|VOICE|NARRATOR|ВЕДУЩИЙ|СПИКЕР):\s*/i
const RE_GRAPHIC    = /^(ГРАФИКА|GRAPHICS|B-ROLL):\s*/i
const RE_TITLE      = /^(ТИТР|TITLE|CTA):\s*/i
const RE_MUSIC      = /^(МУЗЫКА|MUSIC|SFX|ЗВУК):\s*/i
const RE_SCENE      = /^(INT\.|EXT\.|ИНТ\.|ЭКСТ\.|НАТ\.)\s*/i
const RE_TRANSITION = /^(FADE|CUT\s+TO|DISSOLVE|ПЕРЕХОД|ЗАТЕМНЕНИЕ)/i
const RE_CHARACTER  = /^([A-ZА-ЯЁ][A-ZА-ЯЁ\s.'-]{1,30})(\s*\(.*\))?\s*$/

/**
 * Parse raw text into Segments.
 * Handles both YouTube/Reels format ([SECTION], ГОЛОС:, ГРАФИКА:)
 * and traditional film format (INT./EXT., CHARACTER, dialogue).
 */
export function textToSegments(text: string): { segments: Segment[]; sections: Section[] } {
  const lines = text.split("\n")
  const segments: Segment[] = []
  const sections: Section[] = []

  let currentSectionId = ""
  let currentSectionTitle = ""
  let sectionOrder = 0
  let timeMs = 0
  let order = 0
  let inDialogue = false
  let currentCharacter = ""
  let segCounter = 0

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const trimmed = lines[lineIdx].trim()
    if (!trimmed) { inDialogue = false; continue }

    // ── [SECTION — Ns] ──
    const sectionMatch = trimmed.match(RE_SECTION)
    if (sectionMatch) {
      inDialogue = false
      const inner = sectionMatch[1]
      const title = inner.replace(/\s*[—\-–]\s*\d+\s*(сек|sec|с|s|мин|min|мін)\s*/i, "").trim()
      const durMatch = inner.match(/(\d+)\s*(сек|sec|с|s|мин|min|мін)/i)
      const sectionDurMs = durMatch
        ? /мин|min|мін/i.test(durMatch[2]) ? parseInt(durMatch[1]) * 60_000 : parseInt(durMatch[1]) * 1000
        : undefined

      currentSectionId = `section-L${lineIdx}`
      currentSectionTitle = title || inner
      sections.push({
        id: currentSectionId,
        title: currentSectionTitle,
        order: sectionOrder++,
        color: SECTION_COLORS[sections.length % SECTION_COLORS.length],
      })

      // Section heading segment
      segments.push({
        id: segId(`L${lineIdx}-${segCounter++}`),
        content: currentSectionTitle,
        role: "section-heading",
        track: "visual-a",
        startMs: timeMs,
        durationMs: HEADING_MS,
        sectionId: currentSectionId,
        order: order++,
        media: null,
        sourceLine: lineIdx,
      })

      // No global setup-a anymore — V1 clips are created per ГОЛОС segment

      timeMs += HEADING_MS
      continue
    }

    // ── INT./EXT. (film scene heading) ──
    if (RE_SCENE.test(trimmed)) {
      inDialogue = false
      currentSectionId = `section-L${lineIdx}`
      currentSectionTitle = trimmed
      sections.push({
        id: currentSectionId,
        title: trimmed,
        order: sectionOrder++,
        color: SECTION_COLORS[sections.length % SECTION_COLORS.length],
      })

      segments.push({
        id: segId(`L${lineIdx}-${segCounter++}`),
        content: trimmed,
        role: "section-heading",
        track: "visual-a",
        startMs: timeMs,
        durationMs: HEADING_MS,
        sectionId: currentSectionId,
        order: order++,
        media: null,
        sourceLine: lineIdx,
      })
      timeMs += HEADING_MS
      continue
    }

    // ── ГОЛОС: text → voice + V1 (talking head visual) ──
    const voiceMatch = trimmed.match(RE_VOICE)
    if (voiceMatch) {
      inDialogue = false
      const voiceText = trimmed.slice(voiceMatch[0].length).trim()
      if (voiceText) {
        const dur = voiceDurationMs(voiceText)
        // Voice track (audio)
        segments.push({
          id: segId(`L${lineIdx}-${segCounter++}`),
          content: voiceText,
          role: "voice",
          track: "voice",
          startMs: timeMs,
          durationMs: dur,
          sectionId: currentSectionId,
          order: order++,
          media: null,
          sourceLine: lineIdx,
        })
        // V1 — co-dependent visual (talking head on camera while speaking)
        segments.push({
          id: segId(`L${lineIdx}-${segCounter++}`),
          content: currentSectionTitle || voiceText.slice(0, 40),
          role: "setup-a",
          track: "visual-a",
          startMs: timeMs,
          durationMs: dur,
          sectionId: currentSectionId,
          order: order++,
          media: null,
          sourceLine: lineIdx,
        })
        timeMs += dur
      }
      continue
    }

    // ── ГРАФИКА: text ──
    const graphicMatch = trimmed.match(RE_GRAPHIC)
    if (graphicMatch) {
      inDialogue = false
      const desc = trimmed.slice(graphicMatch[0].length).trim()
      segments.push({
        id: segId(`L${lineIdx}-${segCounter++}`),
        content: desc || trimmed,
        role: "graphic",
        track: "visual-b",
        startMs: Math.max(0, timeMs - 2000), // overlap slightly with voice
        durationMs: 4000,
        sectionId: currentSectionId,
        order: order++,
        media: null,
        sourceLine: lineIdx,
      })
      continue
    }

    // ── ТИТР: text ──
    const titleMatch = trimmed.match(RE_TITLE)
    if (titleMatch) {
      inDialogue = false
      const titleText = trimmed.slice(titleMatch[0].length).trim()
      segments.push({
        id: segId(`L${lineIdx}-${segCounter++}`),
        content: titleText || trimmed,
        role: "title",
        track: "visual-c",
        startMs: Math.max(0, timeMs - 1000),
        durationMs: TITLE_MS,
        sectionId: currentSectionId,
        order: order++,
        media: null,
        sourceLine: lineIdx,
      })
      continue
    }

    // ── МУЗЫКА: text ──
    const musicMatch = trimmed.match(RE_MUSIC)
    if (musicMatch) {
      inDialogue = false
      const musicText = trimmed.slice(musicMatch[0].length).trim()
      segments.push({
        id: segId(`L${lineIdx}-${segCounter++}`),
        content: musicText || trimmed,
        role: "music",
        track: "music",
        startMs: timeMs,
        durationMs: MUSIC_MS,
        sectionId: currentSectionId,
        order: order++,
        media: null,
        sourceLine: lineIdx,
      })
      continue
    }

    // ── Transition ──
    if (RE_TRANSITION.test(trimmed)) {
      inDialogue = false
      segments.push({
        id: segId(`L${lineIdx}-${segCounter++}`),
        content: trimmed,
        role: "transition",
        track: "visual-a",
        startMs: timeMs,
        durationMs: TRANSITION_MS,
        sectionId: currentSectionId,
        order: order++,
        media: null,
        sourceLine: lineIdx,
      })
      timeMs += TRANSITION_MS
      continue
    }

    // ── CHARACTER (film) ──
    if (!inDialogue && RE_CHARACTER.test(trimmed) && trimmed.length < 40) {
      // Check it's not a scene heading or transition
      if (!RE_SCENE.test(trimmed) && !RE_TRANSITION.test(trimmed)) {
        inDialogue = true
        currentCharacter = trimmed.replace(/\s*\(.*\)\s*$/, "").trim()
        continue
      }
    }

    // ── Dialogue (follows character) ──
    if (inDialogue && currentCharacter) {
      const dur = voiceDurationMs(trimmed)
      segments.push({
        id: segId(`L${lineIdx}-${segCounter++}`),
        content: trimmed,
        role: "voice",
        track: "voice",
        startMs: timeMs,
        durationMs: dur,
        sectionId: currentSectionId,
        order: order++,
        media: null,
        sourceLine: lineIdx,
      })
      // Also a title overlay with character name
      segments.push({
        id: segId(`L${lineIdx}-${segCounter++}`),
        content: `${currentCharacter}: ${trimmed}`,
        role: "title",
        track: "titles",
        startMs: timeMs,
        durationMs: dur,
        sectionId: currentSectionId,
        order: order++,
        media: null,
        sourceLine: lineIdx,
      })
      timeMs += dur
      continue
    }

    // ── Action / default ──
    inDialogue = false
    const dur = actionDurationMs(trimmed)
    segments.push({
      id: segId(`L${lineIdx}-${segCounter++}`),
      content: trimmed,
      role: "action",
      track: "visual-a",
      startMs: timeMs,
      durationMs: dur,
      sectionId: currentSectionId,
      order: order++,
      media: null,
      sourceLine: lineIdx,
    })
    timeMs += dur
  }

  // V1 clips are already created per ГОЛОС segment — no stretching needed

  return { segments, sections }
}

// ─── Projection: Segments → Text ─────────────────────────────

export function segmentsToText(segments: Segment[], sections: Section[]): string {
  const lines: string[] = []
  const sectionMap = new Map(sections.map((s) => [s.id, s]))

  // Group by section, then sort by order
  const bySection = new Map<string, Segment[]>()
  for (const seg of segments) {
    if (seg.role === "setup-a") continue // implicit, don't serialize
    const arr = bySection.get(seg.sectionId) ?? []
    arr.push(seg)
    bySection.set(seg.sectionId, arr)
  }

  let first = true
  for (const section of sections) {
    const segs = bySection.get(section.id) ?? []
    segs.sort((a, b) => a.order - b.order)

    if (!first) lines.push("")
    first = false

    for (const seg of segs) {
      switch (seg.role) {
        case "section-heading": {
          // Detect if film-style (INT./EXT.) or YouTube-style
          if (RE_SCENE.test(seg.content)) {
            lines.push(seg.content)
          } else {
            lines.push(`[${seg.content}]`)
          }
          break
        }
        case "voice":
          lines.push(`ГОЛОС: ${seg.content}`)
          break
        case "graphic":
          lines.push(`ГРАФИКА: ${seg.content}`)
          break
        case "title":
          // Skip auto-generated dialogue titles (CHARACTER: text)
          if (seg.content.includes(": ") && !seg.content.startsWith("ТИТР")) {
            // This is a dialogue subtitle — skip (voice already serialized)
          } else {
            lines.push(`ТИТР: ${seg.content}`)
          }
          break
        case "music":
          lines.push(`МУЗЫКА: ${seg.content}`)
          break
        case "action":
          lines.push(seg.content)
          break
        case "transition":
          lines.push(seg.content)
          break
      }
    }
  }

  return lines.join("\n")
}

// ─── Projection: Segments → Tracks ───────────────────────────

export function segmentsToTracks(segments: Segment[]): TrackData[] {
  const trackOrder: TrackId[] = ["visual-a", "visual-b", "visual-c", "visual-d", "voice", "titles", "music"]

  return trackOrder.map((trackId) => ({
    trackId,
    label: TRACK_META[trackId].label,
    color: TRACK_META[trackId].color,
    segments: segments
      .filter((s) => s.track === trackId && s.role !== "section-heading")
      .sort((a, b) => a.startMs - b.startMs),
  }))
}

// ─── Projection: Segments → Board Cards (A/B interleave) ─────

export function segmentsToBoardCards(segments: Segment[], sections: Section[]): BoardCard[] {
  const sectionMap = new Map(sections.map((s) => [s.id, s]))

  // Board = all visual segments (V1, V2, V3, V4 + actions) sorted by time
  // Each visual segment = one card in the final edit sequence
  const visualSegments = segments
    .filter((s) =>
      s.track === "visual-a" || s.track === "visual-b" ||
      s.track === "visual-c" || s.track === "visual-d" ||
      s.role === "action")
    .filter((s) => s.role !== "section-heading")
    .sort((a, b) => a.startMs - b.startMs)

  // Track how many times we've seen each segmentId (for isRepeated)
  const seenIds = new Set<string>()

  return visualSegments.map((seg) => {
    const section = sectionMap.get(seg.sectionId) ?? sections[0]
    const repeated = seenIds.has(seg.id)
    seenIds.add(seg.id)

    const typeLabel: "setup-a" | "setup-b" =
      seg.track === "visual-b" || seg.track === "visual-c" || seg.track === "visual-d"
        ? "setup-b" : "setup-a"

    return {
      segmentId: seg.id,
      type: typeLabel,
      label: seg.track === "visual-a" ? (section?.title ?? "SETUP A") : seg.content.slice(0, 30),
      content: seg.track === "visual-a" ? (section?.title ?? "") : seg.content,
      thumbnailUrl: seg.media?.thumbnailUrl ?? null,
      startMs: seg.startMs,
      durationMs: seg.durationMs,
      sectionTitle: section?.title ?? "",
      sectionColor: section?.color ?? "#D4A853",
      isRepeated: repeated,
    }
  })
}

// ─── Total duration ──────────────────────────────────────────

export function getTotalDurationMs(segments: Segment[]): number {
  if (segments.length === 0) return 0
  return Math.max(...segments.map((s) => s.startMs + s.durationMs))
}

// ─── Format time ─────────────────────────────────────────────

export function formatTime(ms: number): string {
  const sec = Math.floor(ms / 1000)
  const min = Math.floor(sec / 60)
  const s = sec % 60
  return `${min}:${String(s).padStart(2, "0")}`
}

// ─── Simple 3-Track Projection ──────────────────────────────

export type SimpleTrackId = "video" | "voice" | "music"

export interface SimpleTrackData {
  trackId: SimpleTrackId
  label: string
  color: string
  segments: Segment[]
}

const SIMPLE_TRACK_META: Record<SimpleTrackId, { label: string; color: string }> = {
  video: { label: "VIDEO", color: "#D4A853" },
  voice: { label: "VOICE", color: "#8B5CF6" },
  music: { label: "MUSIC", color: "#3B82F6" },
}

const ROLE_TO_SIMPLE_TRACK: Record<SegmentRole, SimpleTrackId | null> = {
  "section-heading": null,  // rendered as dividers, not clips
  "setup-a": "video",
  "setup-b": "video",
  voice: "voice",
  title: null,              // rendered as overlays on video clips
  graphic: "video",
  music: "music",
  action: "video",
  transition: "video",
}

/** Map segments to 3 simple tracks: VIDEO, VOICE, MUSIC.
 *  Section headings and titles are excluded (rendered separately). */
export function segmentsToSimpleTracks(segments: Segment[]): SimpleTrackData[] {
  const order: SimpleTrackId[] = ["video", "voice", "music"]

  return order.map((trackId) => ({
    trackId,
    label: SIMPLE_TRACK_META[trackId].label,
    color: SIMPLE_TRACK_META[trackId].color,
    segments: segments
      .filter((s) => ROLE_TO_SIMPLE_TRACK[s.role] === trackId)
      .sort((a, b) => a.startMs - b.startMs),
  }))
}

/** Get title overlays that should appear on top of video clips */
export function getTitleOverlays(segments: Segment[]): Segment[] {
  return segments.filter((s) => s.role === "title").sort((a, b) => a.startMs - b.startMs)
}

/** Get section headings as timeline markers */
export function getSectionMarkers(segments: Segment[], sections: Section[]): Array<{ sectionId: string; title: string; color: string; startMs: number }> {
  const sectionMap = new Map(sections.map((s) => [s.id, s]))
  return segments
    .filter((s) => s.role === "section-heading")
    .map((s) => ({
      sectionId: s.sectionId,
      title: sectionMap.get(s.sectionId)?.title ?? s.content,
      color: sectionMap.get(s.sectionId)?.color ?? "#D4A853",
      startMs: s.startMs,
    }))
    .sort((a, b) => a.startMs - b.startMs)
}

// ─── Timeline Editing ───────────────────────────────────────

export type TimelineEdit =
  | { type: "move"; segmentId: string; newStartMs: number }
  | { type: "resize"; segmentId: string; newStartMs: number; newDurationMs: number }
  | { type: "reorder"; segmentId: string; newOrder: number }

/** Apply a timeline edit to segments. Returns new arrays (immutable).
 *  Handles paired voice+setup-a segments (same sourceLine). */
export function applyTimelineEdit(
  segments: Segment[],
  sections: Section[],
  edit: TimelineEdit,
): { segments: Segment[]; sections: Section[] } {
  const next = segments.map((s) => ({ ...s }))
  const target = next.find((s) => s.id === edit.segmentId)
  if (!target) return { segments, sections }

  // Find paired segment (voice ↔ setup-a on same sourceLine)
  const paired = next.find(
    (s) =>
      s.id !== target.id &&
      s.sourceLine === target.sourceLine &&
      ((target.role === "voice" && s.role === "setup-a") ||
        (target.role === "setup-a" && s.role === "voice")),
  )

  switch (edit.type) {
    case "move": {
      const delta = edit.newStartMs - target.startMs
      target.startMs = Math.max(0, edit.newStartMs)
      if (paired) paired.startMs = Math.max(0, paired.startMs + delta)
      break
    }
    case "resize": {
      target.startMs = Math.max(0, edit.newStartMs)
      target.durationMs = Math.max(MIN_MS, edit.newDurationMs)
      if (paired) {
        paired.startMs = target.startMs
        paired.durationMs = target.durationMs
      }
      break
    }
    case "reorder": {
      // Get all segments in the same section, sorted by startMs
      const sectionSegs = next
        .filter((s) => s.sectionId === target.sectionId && s.role !== "section-heading")
        .sort((a, b) => a.startMs - b.startMs)

      // Remove target (and paired) from the list
      const without = sectionSegs.filter((s) => s.id !== target.id && s.id !== paired?.id)

      // Insert at new position
      const insertAt = Math.max(0, Math.min(without.length, edit.newOrder))
      without.splice(insertAt, 0, target)
      if (paired) without.splice(insertAt + 1, 0, paired)

      // Recalculate startMs sequentially within section
      const sectionHeading = next.find(
        (s) => s.sectionId === target.sectionId && s.role === "section-heading",
      )
      let cursor = sectionHeading ? sectionHeading.startMs + sectionHeading.durationMs : 0

      for (const seg of without) {
        seg.startMs = cursor
        seg.order = without.indexOf(seg)
        // Only advance cursor for segments that "push" time forward
        if (seg.role !== "graphic" && seg.role !== "title") {
          cursor += seg.durationMs
        }
      }
      break
    }
  }

  // Re-sort by startMs for consistent ordering
  next.sort((a, b) => a.startMs - b.startMs || a.order - b.order)

  return { segments: next, sections: [...sections] }
}
