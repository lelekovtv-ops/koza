"use client"

import Image from "next/image"
import { Fragment, useMemo, useRef, useState, useEffect, useCallback } from "react"
import { ArrowLeftRight, Film, GripHorizontal, Move, Music, Pause, Play, Scissors, SkipBack, Volume2 } from "lucide-react"
import { useSpeech } from "@/hooks/useSpeech"
import { MoodSynth, detectMoodFromText, type Mood } from "@/lib/moodSynth"
import { buildFullTimingMap, mapShotsToBlocks, placeShotsOnTimeline, placeVoiceClips } from "@/lib/placementEngine"
import { HEADING_MS, TRANSITION_MS, dialogueDurationMs, actionDurationMs, wordCount } from "@/lib/durationEngine"
import { syncBus } from "@/lib/syncBus"
import { useTimelineStore } from "@/store/timeline"
import { useRundownStore } from "@/store/rundown"
import { flattenForTimeline } from "@/lib/rundownHierarchy"
import { useNavigationStore } from "@/store/navigation"
import { useScenesStore } from "@/store/scenes"

// ─── Embedded Track View (text-to-timeline inside storyboard) ────

type TrackId = "visual" | "voice" | "titles" | "music" | "mood"

interface TrackBlock {
  id: string
  track: TrackId
  text: string
  label?: string
  startMs: number
  durationMs: number
  parentBlockId?: string
  thumbnailUrl?: string | null
  gapMs?: number
  sceneIndex?: number      // 1-based scene number
  shotIndex?: number       // 1-based shot number within scene
  shotSize?: string        // WIDE, CLOSE, etc.
  entryType?: string       // establishing, action, dialogue, transition
}

const TRACK_STYLES: Record<TrackId, { label: string; color: string; bg: string }> = {
  visual: { label: "V", color: "#D4A853", bg: "#D4A853" },
  voice: { label: "A", color: "#4ADE80", bg: "#166534" },
  titles: { label: "T", color: "#60A5FA", bg: "#1E3A5F" },
  music: { label: "M", color: "#A78BFA", bg: "#4C1D95" },
  mood: { label: "MOOD", color: "#EC4899", bg: "#831843" },
}

const TRACKS_ORDER: TrackId[] = ["visual", "voice", "titles", "mood"]

/**
 * Parse screenplay blocks into track blocks for timeline visualization.
 *
 * Simple linear layout: every block gets a time slot.
 * - scene_heading → visual (short, 1.5s)
 * - action → visual (WPM-based, 2-8s)
 * - character+dialogue → visual + voice + titles (camera on speaker)
 * - transition → titles
 */
function parseBlocksToTrackBlocks(
  blocks: { id: string; type: string; text: string; durationMs?: number; durationSource?: string; visual?: { thumbnailUrl?: string | null } | null }[],
  scenes: { id: string; blockIds: string[]; title: string }[],
): TrackBlock[] {
  const result: TrackBlock[] = []
  let timeMs = 0
  let currentSpeaker: string | null = null

  const manualDur = (b: typeof blocks[0]) =>
    (b.durationSource === "manual" || b.durationSource === "media") ? b.durationMs : undefined

  for (const block of blocks) {
    const text = block.text.trim()
    if (!text) { currentSpeaker = null; continue }

    switch (block.type) {
      case "scene_heading": {
        currentSpeaker = null
        const dur = manualDur(block) ?? HEADING_MS
        result.push({ id: block.id, track: "visual", text, label: text.slice(0, 25), startMs: timeMs, durationMs: dur, parentBlockId: block.id, thumbnailUrl: block.visual?.thumbnailUrl })
        timeMs += dur
        break
      }
      case "action": {
        currentSpeaker = null
        const dur = manualDur(block) ?? actionDurationMs(text)
        result.push({ id: block.id, track: "visual", text, label: "", startMs: timeMs, durationMs: dur, parentBlockId: block.id, thumbnailUrl: block.visual?.thumbnailUrl })
        timeMs += dur
        break
      }
      case "character": {
        currentSpeaker = text.replace(/\s*\(.*\)\s*$/, "").trim()
        break
      }
      case "parenthetical": {
        // skip — part of dialogue group
        break
      }
      case "dialogue": {
        const speaker = currentSpeaker ?? "?"
        const dur = manualDur(block) ?? dialogueDurationMs(text)
        // Visual: camera on speaker
        result.push({ id: block.id + "-vis", track: "visual", text: `${speaker}: ${text}`, label: speaker, startMs: timeMs, durationMs: dur, parentBlockId: block.id })
        // Voice track
        result.push({ id: block.id + "-v", track: "voice", text, label: speaker, startMs: timeMs, durationMs: dur })
        // Titles/subtitles
        result.push({ id: block.id + "-t", track: "titles", text: `${speaker}: ${text}`, label: speaker, startMs: timeMs, durationMs: dur })
        timeMs += dur
        currentSpeaker = null
        break
      }
      case "transition": {
        currentSpeaker = null
        const dur = manualDur(block) ?? TRANSITION_MS
        result.push({ id: block.id, track: "titles", text, label: "CUT", startMs: timeMs, durationMs: dur })
        timeMs += dur
        break
      }
      default: {
        currentSpeaker = null
        const dur = manualDur(block) ?? HEADING_MS
        result.push({ id: block.id, track: "visual", text, label: "", startMs: timeMs, durationMs: dur, parentBlockId: block.id })
        timeMs += dur
      }
    }
  }

  return result
}

export function EmbeddedTrackView({
  blocks: scriptBlocks,
  scenes,
  shots,
}: {
  blocks: { id: string; type: string; text: string; durationMs?: number; durationSource?: string; visual?: { thumbnailUrl?: string | null } | null }[]
  scenes: { id: string; blockIds: string[]; title: string }[]
  shots: { id: string; sceneId: string | null; duration: number; label: string; caption?: string; thumbnailUrl?: string | null; shotSize?: string; cameraMotion?: string; blockRange?: [string, string] | null }[]
}) {
  // Initialize from timelineStore so playhead position survives re-mount (split screen toggle)
  const [currentTime, setCurrentTime] = useState(() => useTimelineStore.getState().currentTime)
  const [isPlaying, setIsPlaying] = useState(false)
  const [voiceOn, setVoiceOn] = useState(true)
  const [musicOn, setMusicOn] = useState(false)

  // Mood curve: array of {timeMs, value} keyframes. Value: 1.0=joyful, 0.7=calm, 0.5=sad, 0.3=tense, 0.0=dramatic
  const [moodKeyframes, setMoodKeyframes] = useState<{ timeMs: number; value: number }[]>([])
  const [zoom, setZoom] = useState(80)
  const [scrollLeft, setScrollLeft] = useState(0)
  // Edit mode: select (pointer), move (slip content), ripple (resize + shift), roll (resize at expense of neighbor)
  type EditMode = "select" | "move" | "ripple" | "roll"
  const [editMode, setEditMode] = useState<EditMode>("select")
  // Drag resize state: blockId → current dragged duration
  const [dragResize, setDragResize] = useState<{ blockId: string; durationMs: number } | null>(null)
  // Drag move state: blockId → pixel offset while dragging
  const [dragMove, setDragMove] = useState<{ blockId: string; offsetPx: number } | null>(null)
  const playRef = useRef<number | null>(null)
  // Cleanup drag listeners on unmount
  const dragAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    return () => { dragAbortRef.current?.abort() }
  }, [])
  const lastFrameRef = useRef(0)
  const speech = useSpeech({})
  const spokenBlockIdRef = useRef<string | null>(null)
  const synthRef = useRef<MoodSynth | null>(null)
  const currentMoodBlockRef = useRef<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Use rundown positions when available (supports sub-shots), fall back to block parsing
  const rundownEntries = useRundownStore((s) => s.entries)
  const timelineShots = useTimelineStore((s) => s.shots)

  const trackBlocks = useMemo(() => {
    // If rundown has entries, use them — they support sub-shots and hierarchy
    if (rundownEntries.length > 0) {
      const positions = flattenForTimeline(rundownEntries)

      // Build blockId → sceneIndex lookup
      const blockToScene = new Map<string, number>()
      for (const scene of scenes) {
        for (const bid of scene.blockIds) {
          blockToScene.set(bid, scenes.indexOf(scene) + 1)
        }
      }

      // Track shot counter per scene for numbering
      const sceneShotCounter = new Map<number, number>()

      // Build shotSize lookup from timeline shots
      const shotSizeByBlockId = new Map<string, string>()
      for (const s of timelineShots) {
        if (s.shotSize && s.parentBlockId) shotSizeByBlockId.set(s.parentBlockId, s.shotSize)
        if (s.shotSize && s.blockRange?.[0]) shotSizeByBlockId.set(s.blockRange[0], s.shotSize)
      }

      return positions.map((p) => {
        const sceneIdx = blockToScene.get(p.parentBlockId) ?? 0
        let shotIdx = 0
        if (p.track === "visual" && sceneIdx > 0) {
          const count = (sceneShotCounter.get(sceneIdx) ?? 0) + 1
          sceneShotCounter.set(sceneIdx, count)
          shotIdx = count
        }

        return {
          id: p.entryId + "-" + p.track,
          track: p.track as TrackId,
          text: p.caption,
          label: p.track === "voice" ? p.speaker ?? "" : p.label,
          startMs: p.startMs,
          durationMs: p.durationMs,
          parentBlockId: p.parentBlockId,
          thumbnailUrl: p.thumbnailUrl,
          gapMs: p.gapMs > 0 ? p.gapMs : undefined,
          sceneIndex: sceneIdx,
          shotIndex: shotIdx,
          shotSize: shotSizeByBlockId.get(p.parentBlockId) ?? "",
          entryType: p.entryType,
        }
      })
    }

    // Fallback: parse from blocks directly
    return parseBlocksToTrackBlocks(scriptBlocks, scenes)
  }, [rundownEntries, scriptBlocks, scenes, shots, timelineShots])
  const totalDuration = useMemo(() => trackBlocks.reduce((max, b) => Math.max(max, b.startMs + b.durationMs), 0), [trackBlocks])
  const totalWidth = (totalDuration / 1000) * zoom
  const playheadX = (currentTime / 1000) * zoom

  const activeIds = useMemo(
    () => new Set(trackBlocks.filter((b) => currentTime >= b.startMs && currentTime < b.startMs + b.durationMs).map((b) => b.id)),
    [trackBlocks, currentTime],
  )

  // Playback
  useEffect(() => {
    if (!isPlaying) { if (playRef.current) cancelAnimationFrame(playRef.current); return }
    lastFrameRef.current = performance.now()
    const tick = (now: number) => {
      const dt = now - lastFrameRef.current
      lastFrameRef.current = now
      setCurrentTime((t) => {
        const next = t + dt
        if (next >= totalDuration) { setIsPlaying(false); return totalDuration }
        return next
      })
      playRef.current = requestAnimationFrame(tick)
    }
    playRef.current = requestAnimationFrame(tick)
    return () => { if (playRef.current) cancelAnimationFrame(playRef.current) }
  }, [isPlaying, totalDuration])

  // Sync currentTime → timelineStore + highlight active block in ScriptViewer
  const lastSyncedBlockRef = useRef<string | null>(null)

  useEffect(() => {
    useTimelineStore.getState().seekTo(currentTime)

    // Find the visual track block under playhead
    const activeVisual = trackBlocks.find(
      (b) => b.track === "visual" && currentTime >= b.startMs && currentTime < b.startMs + b.durationMs,
    )
    const blockId = activeVisual?.parentBlockId
    if (!blockId || blockId === lastSyncedBlockRef.current) return
    lastSyncedBlockRef.current = blockId

    // Find scene for this block and select it (scrolls ScriptViewer)
    const scene = scenes.find((s) => s.blockIds.includes(blockId))
    if (scene) {
      useScenesStore.getState().selectScene(scene.id)
    }
    // Also request scroll to the specific block
    useNavigationStore.getState().requestScrollToBlock(blockId)
  }, [currentTime, trackBlocks, scenes])

  // Auto-scroll
  useEffect(() => {
    if (!isPlaying || !containerRef.current) return
    const viewW = containerRef.current.clientWidth - 70
    const phInView = playheadX - scrollLeft
    if (phInView > viewW * 0.6) setScrollLeft(Math.max(0, playheadX - viewW * 0.33))
    if (phInView < 0) setScrollLeft(Math.max(0, playheadX - viewW * 0.1))
  }, [isPlaying, playheadX, scrollLeft])

  // Wheel scroll
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        setZoom((z) => Math.max(20, Math.min(200, z + (e.deltaY > 0 ? -8 : 8))))
      } else {
        const dx = Math.abs(e.deltaX) > 2 ? e.deltaX : e.deltaY
        setScrollLeft((s) => Math.max(0, s + dx * 1.5))
      }
    }
    el.addEventListener("wheel", handler, { passive: false })
    return () => el.removeEventListener("wheel", handler)
  }, [])

  // Keyboard: Space=play, V=select, Y=move/slip, B=ripple, N=roll
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT") return
      if (e.code === "Space") { e.preventDefault(); setIsPlaying((p) => !p) }
      if (e.code === "KeyV" && !e.metaKey && !e.ctrlKey) setEditMode("select")
      if (e.code === "KeyY") setEditMode("move")
      if (e.code === "KeyB" && !e.metaKey && !e.ctrlKey) setEditMode("ripple")
      if (e.code === "KeyN") setEditMode("roll")
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  // TTS: speak voice blocks with 500ms pre-buffer
  const voiceBlocks = useMemo(
    () => trackBlocks.filter((b) => b.track === "voice").sort((a, b) => a.startMs - b.startMs),
    [trackBlocks],
  )

  useEffect(() => {
    if (!voiceOn || !isPlaying) return
    const active = voiceBlocks.find(
      (b) => currentTime >= b.startMs - 500 && currentTime < b.startMs + b.durationMs,
    )
    if (active && active.id !== spokenBlockIdRef.current) {
      spokenBlockIdRef.current = active.id
      speech.speak([{
        id: active.id,
        text: active.text,
        lang: /[а-яё]/i.test(active.text) ? "ru-RU" : "en-US",
        rate: 1,
      }])
    } else if (!active && spokenBlockIdRef.current) {
      spokenBlockIdRef.current = null
    }
  }, [currentTime, voiceBlocks, voiceOn, isPlaying]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stop on pause
  useEffect(() => {
    if (!isPlaying && speech.speaking) {
      speech.stop()
      spokenBlockIdRef.current = null
    }
  }, [isPlaying]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stop when voice off
  useEffect(() => {
    if (!voiceOn && speech.speaking) {
      speech.stop()
      spokenBlockIdRef.current = null
    }
  }, [voiceOn]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Music: mood synth follows visual/action blocks ──
  useEffect(() => {
    if (!musicOn) {
      synthRef.current?.stop()
      currentMoodBlockRef.current = null
      return
    }
    if (!synthRef.current) synthRef.current = new MoodSynth()
  }, [musicOn])

  // Auto-generate mood keyframes from text analysis
  useEffect(() => {
    const visuals = trackBlocks.filter((b) => b.track === "visual")
    if (visuals.length === 0) return
    // Only auto-generate if user hasn't manually edited
    if (moodKeyframes.length > 0 && moodKeyframes.some((k) => k.timeMs > 0)) return

    const MOOD_TO_VALUE: Record<Mood, number> = {
      joyful: 1.0, calm: 0.75, silent: 0.6, sad: 0.45, mysterious: 0.35, tense: 0.2, dramatic: 0.08, action: 0.0,
    }

    const kfs = visuals.map((v) => {
      const mood = detectMoodFromText(v.text)
      return { timeMs: v.startMs, value: MOOD_TO_VALUE[mood] ?? 0.5 }
    })
    setMoodKeyframes(kfs)
  }, [trackBlocks]) // eslint-disable-line react-hooks/exhaustive-deps

  // Get mood from curve value
  const moodFromValue = (value: number): Mood => {
    if (value > 0.85) return "joyful"
    if (value > 0.6) return "calm"
    if (value > 0.48) return "sad"
    if (value > 0.3) return "mysterious"
    if (value > 0.15) return "tense"
    if (value > 0.05) return "dramatic"
    return "action"
  }

  // Interpolate mood value at current time
  const getMoodValueAtTime = (timeMs: number): number => {
    if (moodKeyframes.length === 0) return 0.5
    if (timeMs <= moodKeyframes[0].timeMs) return moodKeyframes[0].value
    if (timeMs >= moodKeyframes[moodKeyframes.length - 1].timeMs) return moodKeyframes[moodKeyframes.length - 1].value
    for (let i = 0; i < moodKeyframes.length - 1; i++) {
      const a = moodKeyframes[i], b = moodKeyframes[i + 1]
      if (timeMs >= a.timeMs && timeMs < b.timeMs) {
        const t = (timeMs - a.timeMs) / (b.timeMs - a.timeMs)
        return a.value + (b.value - a.value) * t
      }
    }
    return 0.5
  }

  // Change mood when curve value changes significantly
  const lastMoodRef = useRef<Mood>("calm")
  useEffect(() => {
    if (!musicOn || !isPlaying) return
    const value = getMoodValueAtTime(currentTime)
    const mood = moodFromValue(value)
    if (mood !== lastMoodRef.current) {
      lastMoodRef.current = mood
      if (synthRef.current) {
        if (!synthRef.current.playing) synthRef.current.start(mood)
        else synthRef.current.setMood(mood)
      }
    }
  }, [currentTime, musicOn, isPlaying, moodKeyframes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stop music on pause
  useEffect(() => {
    if (!isPlaying) {
      synthRef.current?.stop()
      currentMoodBlockRef.current = null
    }
  }, [isPlaying])

  // Cleanup on unmount
  useEffect(() => {
    return () => { synthRef.current?.destroy(); synthRef.current = null }
  }, [])

  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
  }

  const currentVoice = trackBlocks.find((b) => b.track === "voice" && activeIds.has(b.id))

  // Thumbnail map: parentBlockId → thumbnailUrl
  // Single flat map, reads directly from timelineStore (where images are actually saved)
  const thumbByBlockId = useMemo(() => {
    const map = new Map<string, string>()
    // timelineStore shots — the ACTUAL source of generated images
    for (const s of timelineShots) {
      if (s.thumbnailUrl) {
        if (s.parentBlockId) map.set(s.parentBlockId, s.thumbnailUrl)
        if (s.blockRange?.[0]) map.set(s.blockRange[0], s.thumbnailUrl)
        map.set(s.id, s.thumbnailUrl)
      }
    }
    // scriptBlocks visual field (fallback)
    for (const b of scriptBlocks) {
      if ((b as any).visual?.thumbnailUrl && !map.has(b.id)) {
        map.set(b.id, (b as any).visual.thumbnailUrl)
      }
    }
    return map
  }, [timelineShots, scriptBlocks])

  // Playhead position in screen coordinates (relative to track area start)
  const phScreenX = playheadX - scrollLeft

  // ── Track block renderer ──────────────────────────────────────
  const renderTrackContent = (trackId: TrackId) => {
    const style = TRACK_STYLES[trackId]
    const tBlocks = trackBlocks.filter((b) => b.track === trackId)
    if (tBlocks.length === 0) return null

    return tBlocks.map((block) => {
      // Use dragged duration if this block is being resized
      const effectiveDur = (dragResize?.blockId === block.id) ? dragResize.durationMs : block.durationMs
      const left = (block.startMs / 1000) * zoom
      const width = Math.max(8, (effectiveDur / 1000) * zoom)
      const isActive = activeIds.has(block.id)

      // Thumbnail — simple: check block data, then lookup by parentBlockId
      const thumbUrl = trackId === "visual"
        ? (block.thumbnailUrl ?? thumbByBlockId.get(block.parentBlockId ?? "") ?? null)
        : null

      return (
        <div
          key={block.id}
          className="absolute rounded overflow-hidden"
          style={{
            left,
            width: Math.max(6, width),
            top: 2, bottom: 2,
            border: isActive ? `1px solid ${style.color}` : `1px solid ${style.color}30`,
            zIndex: isActive ? 10 : 1,
            cursor: editMode === "move" ? "grab" : editMode === "roll" || editMode === "ripple" ? "col-resize" : "pointer",
            ...(dragMove?.blockId === block.id ? { transform: `translateX(${dragMove.offsetPx}px)`, opacity: 0.7, zIndex: 20 } : {}),
          }}
          onClick={() => setCurrentTime(block.startMs)}
          onMouseDown={(e) => {
            if (editMode !== "move" || trackId !== "visual") return
            e.preventDefault(); e.stopPropagation()
            dragAbortRef.current?.abort()
            const ac = new AbortController()
            dragAbortRef.current = ac
            const startX = e.clientX
            document.addEventListener("mousemove", (ev) => {
              setDragMove({ blockId: block.id, offsetPx: ev.clientX - startX })
            }, { signal: ac.signal })
            document.addEventListener("mouseup", () => {
              ac.abort()
              setDragMove(null)
            }, { signal: ac.signal })
          }}
        >
          {(() => {
            const si = block.sceneIndex ?? 0
            const sh = block.shotIndex ?? 0
            const info = si ? `S${si}/${sh}${block.shotSize ? ` ${block.shotSize}` : ""}` : (block.label?.slice(0, 15) || "")
            const dur = `${(effectiveDur / 1000).toFixed(1)}s`
            const ts = "0 1px 3px #000, 0 0 8px #000"

            return thumbUrl ? (
              <>
                <div className="absolute inset-0" style={{ backgroundImage: `url(${thumbUrl})`, backgroundRepeat: "repeat-x", backgroundSize: "auto 100%", backgroundPosition: "left center" }} />
                <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-1.5 py-0.5" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)" }}>
                  {width > 25 && <span className="text-[9px] font-bold text-white uppercase tracking-wide truncate" style={{ textShadow: ts }}>{info}</span>}
                  {width > 35 && <span className="text-[8px] text-white/70 font-mono shrink-0 ml-1" style={{ textShadow: ts }}>{dur}</span>}
                </div>
                {width > 80 && (
                  <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5" style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.5) 0%, transparent 100%)" }}>
                    <span className="text-[8px] text-white/70 truncate block" style={{ textShadow: ts }}>{block.text.slice(0, 60)}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col justify-between p-1.5" style={{ backgroundColor: isActive ? style.color + "25" : style.color + "12" }}>
                <div className="flex items-center justify-between">
                  {width > 25 && <span className={`text-[9px] font-bold uppercase tracking-wide truncate ${isActive ? "text-white/80" : "text-white/50"}`}>{info}</span>}
                  {width > 35 && <span className={`text-[8px] font-mono shrink-0 ml-1 ${isActive ? "text-white/50" : "text-white/20"}`}>{dur}</span>}
                </div>
                {width > 70 && <span className={`truncate text-[8px] ${isActive ? "text-white/40" : "text-white/20"}`}>{block.text.slice(0, 60)}</span>}
              </div>
            )
          })()}

          {/* Duration drag handle — Ripple/Roll/Select modes */}
          <div
            className="absolute top-0 bottom-0 right-0 w-2 cursor-ew-resize hover:bg-white/20 z-10"
            onMouseDown={(e) => {
              e.preventDefault(); e.stopPropagation()
              dragAbortRef.current?.abort()
              const ac = new AbortController()
              dragAbortRef.current = ac
              const startX = e.clientX
              const startDur = effectiveDur
              const bid = block.parentBlockId ?? block.id

              const visualBlocks = trackBlocks.filter((b) => b.track === "visual")
              const myIdx = visualBlocks.findIndex((b) => b.id === block.id)
              const nextBlock = myIdx >= 0 && myIdx < visualBlocks.length - 1 ? visualBlocks[myIdx + 1] : null
              const nextStartDur = nextBlock ? nextBlock.durationMs : 0

              document.addEventListener("mousemove", (ev) => {
                const deltaMs = ((ev.clientX - startX) / zoom) * 1000
                setDragResize({ blockId: block.id, durationMs: Math.max(500, Math.round(startDur + deltaMs)) })
              }, { signal: ac.signal })

              document.addEventListener("mouseup", (ev) => {
                ac.abort()
                const deltaMs = ((ev.clientX - startX) / zoom) * 1000
                const finalDur = Math.max(500, Math.round(startDur + deltaMs))
                setDragResize(null)

                if (editMode === "roll" && nextBlock) {
                  const neighborDur = Math.max(500, Math.round(nextStartDur - deltaMs))
                  const neighborBid = nextBlock.parentBlockId ?? nextBlock.id
                  syncBus.dispatch("timeline", "duration-change", { durationMs: finalDur }, { blockId: bid })
                  syncBus.dispatch("timeline", "duration-change", { durationMs: neighborDur }, { blockId: neighborBid })
                } else {
                  syncBus.dispatch("timeline", "duration-change", { durationMs: finalDur }, { blockId: bid })
                }
              }, { signal: ac.signal })
            }}
          />
        </div>
      )
    })
  }

  // Mood track data
  const MOOD_H = 72
  const moodLabels = [
    { y: 0.05, label: "😊", desc: "Joyful" },
    { y: 0.25, label: "😌", desc: "Calm" },
    { y: 0.5, label: "😢", desc: "Sad" },
    { y: 0.7, label: "😰", desc: "Tense" },
    { y: 0.95, label: "💥", desc: "Dramatic" },
  ]
  const pathPoints = moodKeyframes.map((kf) => ({
    x: (kf.timeMs / 1000) * zoom,
    y: (1 - kf.value) * (MOOD_H - 8) + 4,
  }))
  const svgPath = pathPoints.length > 1 ? `M ${pathPoints.map((p) => `${p.x},${p.y}`).join(" L ")}` : ""
  const currentMoodValue = getMoodValueAtTime(currentTime)
  const currentMoodY = (1 - currentMoodValue) * (MOOD_H - 8) + 4

  return (
    <div className="flex h-full flex-col bg-[#1A1B1F]" ref={containerRef}>
      {/* ── Transport bar ── */}
      <div className="flex h-9 items-center gap-1.5 border-b border-white/[0.08] px-3 shrink-0 bg-[#1E1F23]">
        <button onClick={() => { setCurrentTime(0); setScrollLeft(0); setIsPlaying(false) }} className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors">
          <SkipBack size={12} />
        </button>
        <button onClick={() => setIsPlaying(!isPlaying)} className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors">
          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <div className="ml-1 px-2 py-0.5 rounded bg-black/30 font-mono text-[11px] tabular-nums">
          <span className="text-white/80">{fmtTime(currentTime)}</span>
          <span className="text-white/20"> / {fmtTime(totalDuration)}</span>
        </div>
        <div className="w-px h-4 bg-white/[0.06] mx-1" />
        {/* ── Edit mode toolbar ── */}
        {([
          { mode: "select" as EditMode, icon: <GripHorizontal size={12} />, label: "Select", key: "V" },
          { mode: "move" as EditMode, icon: <Move size={12} />, label: "Slip", key: "Y" },
          { mode: "ripple" as EditMode, icon: <Scissors size={12} />, label: "Ripple", key: "B" },
          { mode: "roll" as EditMode, icon: <ArrowLeftRight size={12} />, label: "Roll", key: "N" },
        ]).map((tool) => (
          <button
            key={tool.mode}
            onClick={() => setEditMode(tool.mode)}
            className={`group relative p-1.5 rounded transition-colors ${editMode === tool.mode ? "text-[#D4A853] bg-[#D4A853]/15" : "text-white/30 hover:text-white/60"}`}
          >
            {tool.icon}
            {/* Tooltip */}
            <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-1 rounded bg-black/90 border border-white/10 text-[10px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">
              {tool.label} <span className="text-white/40 ml-0.5">{tool.key}</span>
            </span>
          </button>
        ))}
        <div className="w-px h-4 bg-white/[0.06] mx-1" />
        <button
          onClick={() => setVoiceOn(!voiceOn)}
          className={`p-1.5 rounded transition-colors ${voiceOn ? "text-green-400 bg-green-400/10" : "text-white/20 hover:text-white/40"}`}
          title="Voice"
        >
          <Volume2 size={12} />
        </button>
        <button
          onClick={() => setMusicOn(!musicOn)}
          className={`p-1.5 rounded transition-colors ${musicOn ? "text-purple-400 bg-purple-400/10" : "text-white/20 hover:text-white/40"}`}
          title="Music"
        >
          <Music size={12} />
        </button>
        <div className="flex-1" />
        {currentVoice && (
          <span className="truncate text-[10px] text-white/40 max-w-[300px]">
            <span className="text-green-400/70 font-semibold">{currentVoice.label}</span>
            <span className="text-white/20 mx-1">|</span>
            {currentVoice.text}
          </span>
        )}
      </div>

      {/* ── Timeline area: labels column + scrollable tracks + playhead ── */}
      <div className="flex flex-1 min-h-0">
        {/* Track labels column */}
        <div className="w-[40px] shrink-0 flex flex-col border-r border-white/[0.08] bg-[#16171B]">
          {/* Ruler spacer */}
          <div className="h-[28px] shrink-0" />
          {/* Track labels */}
          {TRACKS_ORDER.map((trackId) => {
            if (trackId === "mood") {
              return (
                <div key={trackId} className="flex flex-col items-center justify-between py-1 border-t border-white/[0.04]" style={{ height: MOOD_H }}>
                  {moodLabels.map((l) => <span key={l.y} className="text-[7px] text-white/15" title={l.desc}>{l.label}</span>)}
                </div>
              )
            }
            const tBlocks = trackBlocks.filter((b) => b.track === trackId)
            if (tBlocks.length === 0) return null
            const h = trackId === "visual" ? 160 : 80
            const st = TRACK_STYLES[trackId]
            return (
              <div key={trackId} className="flex items-center justify-center border-t border-white/[0.04]" style={{ height: h }}>
                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: st.color, opacity: 0.5 }}>{st.label}</span>
              </div>
            )
          })}
        </div>

        {/* Scrollable track area + playhead overlay */}
        <div
          className="flex-1 relative overflow-hidden cursor-pointer"
          onClick={(e) => {
            // Click anywhere on timeline to seek
            const rect = e.currentTarget.getBoundingClientRect()
            const x = e.clientX - rect.left + scrollLeft
            setCurrentTime(Math.max(0, Math.min(totalDuration, (x / zoom) * 1000)))
          }}
        >
          {/* Ruler */}
          <div className="h-[28px] shrink-0 border-b border-white/[0.08] bg-[#1E1F23] relative">
            <div style={{ width: totalWidth, transform: `translateX(${-scrollLeft}px)` }} className="h-full relative">
              {Array.from({ length: Math.ceil(totalDuration / 5000) + 1 }).map((_, i) => (
                <span key={i} className="absolute top-1.5 text-[9px] text-white/25 font-mono tabular-nums" style={{ left: i * 5 * zoom + 4 }}>
                  {Math.floor(i * 5 / 60)}:{String((i * 5) % 60).padStart(2, "0")}
                </span>
              ))}
            </div>
          </div>

          {/* Tracks */}
          {TRACKS_ORDER.map((trackId) => {
            if (trackId === "mood") {
              return (
                <div key={trackId} className="relative overflow-hidden" style={{ height: MOOD_H }}>
                  <div style={{ width: totalWidth, transform: `translateX(${-scrollLeft}px)` }} className="relative h-full">
                    <div className="absolute inset-0 opacity-20" style={{ background: "linear-gradient(180deg, #10B98120 0%, #8B5CF610 50%, #EF444420 100%)" }} />
                    {svgPath && (
                      <svg className="absolute inset-0 pointer-events-none" width={totalWidth} height={MOOD_H} style={{ overflow: "visible" }}>
                        <path d={svgPath} fill="none" stroke="#EC4899" strokeWidth={2} opacity={0.6} />
                        {pathPoints.length > 1 && <path d={`${svgPath} L ${pathPoints[pathPoints.length - 1].x},${MOOD_H} L ${pathPoints[0].x},${MOOD_H} Z`} fill="#EC489910" />}
                      </svg>
                    )}
                    {moodKeyframes.map((kf, ki) => {
                      const x = (kf.timeMs / 1000) * zoom, y = (1 - kf.value) * (MOOD_H - 8) + 4
                      return (
                        <div key={ki} className="absolute w-2.5 h-2.5 rounded-full bg-[#EC4899] border border-[#EC4899]/40 cursor-ns-resize hover:scale-150 transition-transform" style={{ left: x - 5, top: y - 5 }}
                          onMouseDown={(e) => {
                            e.preventDefault(); const startY = e.clientY, startVal = kf.value
                            const onMove = (ev: MouseEvent) => { setMoodKeyframes((prev) => prev.map((k, i) => i === ki ? { ...k, value: Math.max(0, Math.min(1, startVal - (ev.clientY - startY) / (MOOD_H - 8))) } : k)) }
                            const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp) }
                            document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp)
                          }}
                        />
                      )
                    })}
                    <div className="absolute inset-0" onDoubleClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      const timeMs = ((e.clientX - rect.left + scrollLeft) / zoom) * 1000
                      const value = Math.max(0, Math.min(1, 1 - ((e.clientY - rect.top) - 4) / (MOOD_H - 8)))
                      setMoodKeyframes((prev) => [...prev, { timeMs, value }].sort((a, b) => a.timeMs - b.timeMs))
                    }} />
                    {/* Mood indicator on playhead */}
                    <div className="pointer-events-none absolute w-4 h-4 rounded-full border-2 border-[#EC4899] bg-[#0B0A09] flex items-center justify-center text-[7px]" style={{ left: playheadX - 8, top: currentMoodY - 8 }}>
                      <span className="text-[#EC4899]/70">{moodLabels.find((l) => Math.abs(l.y - (1 - currentMoodValue)) < 0.15)?.label ?? "🎵"}</span>
                    </div>
                  </div>
                </div>
              )
            }

            const tBlocks = trackBlocks.filter((b) => b.track === trackId)
            if (tBlocks.length === 0) return null
            const h = trackId === "visual" ? 160 : 80

            return (
              <div key={trackId} className="relative overflow-hidden border-t border-white/[0.04]" style={{ height: h }}>
                <div style={{ width: totalWidth, transform: `translateX(${-scrollLeft}px)` }} className="relative h-full">
                  {renderTrackContent(trackId)}
                </div>
              </div>
            )
          })}

          {/* ── PLAYHEAD — single line over everything ── */}
          <div
            className="pointer-events-none absolute inset-0 z-30"
            style={{ overflow: "visible" }}
          >
            {/* Triangle on ruler */}
            <div
              style={{
                position: "absolute",
                left: phScreenX - 6,
                top: 0,
                width: 13,
                height: 10,
                backgroundColor: "#ef4444",
                clipPath: "polygon(0 0, 100% 0, 50% 100%)",
                filter: "drop-shadow(0 2px 4px rgba(239,68,68,0.5))",
              }}
            />
            {/* Vertical line through all tracks */}
            <div
              style={{
                position: "absolute",
                left: phScreenX - 1,
                top: 10,
                bottom: 0,
                width: 2,
                backgroundColor: "rgba(239,68,68,0.85)",
                boxShadow: "0 0 6px rgba(239,68,68,0.4)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
