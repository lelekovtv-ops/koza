"use client"

import Image from "next/image"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Film,
  Mic,
  Music,
  Volume2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ZoomIn,
  ZoomOut,
  Eye,
  EyeOff,
} from "lucide-react"
import {
  useTimelineStore,
  getTotalDuration,
  getShotIndexAtTime,
  getShotStartTime,
  type TimelineShot,
  type AudioClip,
} from "@/store/timeline"
import { prefetchAhead } from "@/lib/timelineCache"
import { generateDemoShots } from "@/lib/timelineDemoData"
import { audioEngine } from "@/lib/audioEngine"
import { loadBlob } from "@/lib/fileStorage"

/* ─── constants ─── */

const LABEL_COL_W = 80
const SHOT_TRACK_H = 64
const AUDIO_TRACK_H = 48
const RULER_H = 24
const HEADER_H = 40
import { getAccentColors } from "@/lib/themeColors"
function getPlayheadColor() { return getAccentColors().accent }
const RATE_STEPS = [0.5, 1, 1.5, 2] as const

/* ─── helpers ─── */

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, ms) / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const tenths = Math.floor((totalSeconds * 10) % 10)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`
}

function msToX(ms: number, zoom: number): number {
  return (ms / 1000) * zoom
}

function xToMs(x: number, zoom: number): number {
  return (x / zoom) * 1000
}

/* ─── ShotPlaceholder (SVG stub for missing thumbnails) ─── */

function getShotTint(label: string): { from: string; to: string; accent: string } {
  const upper = label.toUpperCase()
  if (upper.includes("WIDE"))         return { from: "#0f1a2e", to: "#0a1220", accent: "#3b82f6" }
  if (upper.includes("CLOSE"))        return { from: "#2a1a0e", to: "#1a1008", accent: "#f59e0b" }
  if (upper.includes("OVER SHOULDER")) return { from: "#0e1f18", to: "#081610", accent: "#22c55e" }
  /* MEDIUM / default */              return { from: "#1a1a1e", to: "#111114", accent: "#9ca3af" }
}

function ShotPlaceholder({ shot, width, height }: { shot: TimelineShot; width: number; height: number }) {
  const { from, to, accent } = getShotTint(shot.label)
  const cx = width / 2
  const cy = height / 2
  const gradId = `sp-${shot.id}`
  const isVideo = shot.type === "video"
  const orderNum = String(shot.order + 1)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      className="pointer-events-none absolute inset-0"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width={width} height={height} fill={`url(#${gradId})`} />

      {/* shot number */}
      <text
        x={cx}
        y={cy + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fill={accent}
        opacity={0.18}
        fontSize={Math.min(height * 0.6, width * 0.5, 32)}
        fontWeight={700}
        fontFamily="system-ui, sans-serif"
      >
        {orderNum}
      </text>

      {/* type icon — camera or film */}
      {isVideo ? (
        /* film strip icon */
        <g transform={`translate(${cx - 6}, ${cy - 16})`} opacity={0.35} fill={accent}>
          <rect x="1" y="1" width="10" height="12" rx="1" fill="none" stroke={accent} strokeWidth="1.2" />
          <line x1="0" y1="4" x2="3" y2="4" stroke={accent} strokeWidth="1" />
          <line x1="0" y1="7" x2="3" y2="7" stroke={accent} strokeWidth="1" />
          <line x1="0" y1="10" x2="3" y2="10" stroke={accent} strokeWidth="1" />
          <line x1="9" y1="4" x2="12" y2="4" stroke={accent} strokeWidth="1" />
          <line x1="9" y1="7" x2="12" y2="7" stroke={accent} strokeWidth="1" />
          <line x1="9" y1="10" x2="12" y2="10" stroke={accent} strokeWidth="1" />
        </g>
      ) : (
        /* camera icon */
        <g transform={`translate(${cx - 7}, ${cy - 16})`} opacity={0.35} fill="none" stroke={accent} strokeWidth="1.2">
          <rect x="0" y="3" width="10" height="8" rx="1.5" />
          <path d="M10 5.5l4-2v7l-4-2z" />
        </g>
      )}
    </svg>
  )
}

/* ─── ShotThumb ─── */

function ShotThumb({
  shot,
  x,
  width,
  selected,
  isDragged,
  onClick,
  onDoubleClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onContextMenu,
}: {
  shot: TimelineShot
  x: number
  width: number
  selected: boolean
  isDragged: boolean
  onClick: () => void
  onDoubleClick: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  return (
    <button
      type="button"
      draggable
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onContextMenu={onContextMenu}
      className="absolute top-0 flex items-center justify-center overflow-hidden border-r border-white/8 transition-colors"
      style={{
        left: x,
        width: Math.max(2, width),
        height: SHOT_TRACK_H,
        background: selected ? getAccentColors().accent18 : "rgba(255,255,255,0.04)",
        opacity: isDragged ? 0.5 : 1,
      }}
      title={shot.label}
    >
      {shot.thumbnailUrl ? (
        <Image
          src={shot.thumbnailUrl}
          alt={shot.label}
          fill
          unoptimized
          sizes={`${Math.max(2, Math.round(width))}px`}
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <ShotPlaceholder shot={shot} width={Math.max(2, width)} height={SHOT_TRACK_H} />
      )}
      {selected && (
        <div className="absolute inset-0 border-2 rounded-[1px]" style={{ borderColor: getPlayheadColor() }} />
      )}
    </button>
  )
}

/* ─── AudioClipRect ─── */

const EDGE_ZONE = 6
const WAVEFORM_H = 40

function AudioClipRect({
  clip,
  zoom,
  selected,
  onClick,
  onMove,
  onTrim,
}: {
  clip: AudioClip
  zoom: number
  selected: boolean
  onClick: () => void
  onMove: (id: string, startTime: number) => void
  onTrim: (id: string, patch: Partial<AudioClip>) => void
}) {
  const x = msToX(clip.startTime, zoom)
  const w = Math.max(4, msToX(clip.duration, zoom))
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [waveform, setWaveform] = useState<Float32Array | null>(null)

  // Load audio & get waveform
  useEffect(() => {
    const url = clip.originalUrl || clip.blobKey
    if (!url) return
    let cancelled = false
    audioEngine.loadClip(clip.id, url).then(() => {
      if (cancelled) return
      setWaveform(audioEngine.getWaveformData(clip.id, 200))
    }).catch(() => { /* load failed, no waveform */ })
    return () => { cancelled = true }
  }, [clip.id, clip.originalUrl, clip.blobKey])

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !waveform || waveform.length === 0) return
    const cW = Math.max(4, Math.round(w))
    const cH = WAVEFORM_H
    const dpr = window.devicePixelRatio || 1
    canvas.width = cW * dpr
    canvas.height = cH * dpr
    canvas.style.width = `${cW}px`
    canvas.style.height = `${cH}px`
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cW, cH)
    ctx.strokeStyle = "rgba(255,255,255,0.3)"
    ctx.lineWidth = 1
    const step = cW / waveform.length
    const mid = cH / 2
    for (let i = 0; i < waveform.length; i++) {
      const amp = waveform[i] * mid
      const xPos = i * step
      ctx.beginPath()
      ctx.moveTo(xPos, mid - amp)
      ctx.lineTo(xPos, mid + amp)
      ctx.stroke()
    }
  }, [waveform, w])

  // Drag to move clip
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const localX = e.clientX - rect.left
    const isLeftEdge = localX < EDGE_ZONE
    const isRightEdge = localX > rect.width - EDGE_ZONE

    if (isLeftEdge || isRightEdge) {
      // Edge trim
      e.preventDefault()
      e.stopPropagation()
      const startClientX = e.clientX
      const origStart = clip.startTime
      const origDur = clip.duration

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startClientX
        const dMs = xToMs(dx, zoom)
        if (isLeftEdge) {
          const newStart = Math.max(0, origStart + dMs)
          const newDur = Math.max(100, origDur - (newStart - origStart))
          onTrim(clip.id, { startTime: newStart, duration: newDur })
        } else {
          const newDur = Math.max(100, origDur + dMs)
          onTrim(clip.id, { duration: newDur })
        }
      }
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove)
        document.removeEventListener("mouseup", onMouseUp)
      }
      document.addEventListener("mousemove", onMouseMove)
      document.addEventListener("mouseup", onMouseUp)
      return
    }

    // Move drag
    e.preventDefault()
    e.stopPropagation()
    const dragOffsetMs = xToMs(localX, zoom)

    const onMouseMove = (ev: MouseEvent) => {
      const parent = (e.currentTarget as HTMLElement).parentElement
      if (!parent) return
      const parentRect = parent.getBoundingClientRect()
      const newX = ev.clientX - parentRect.left
      const newStartMs = Math.max(0, xToMs(newX, zoom) - dragOffsetMs)
      onMove(clip.id, newStartMs)
    }
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
    }
    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  }, [clip.id, clip.startTime, clip.duration, zoom, onMove, onTrim])

  // Cursor style on hover
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const localX = e.clientX - rect.left
    if (localX < EDGE_ZONE || localX > rect.width - EDGE_ZONE) {
      (e.currentTarget as HTMLDivElement).style.cursor = "col-resize"
    } else {
      (e.currentTarget as HTMLDivElement).style.cursor = "grab"
    }
  }, [])

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick() }}
      className="absolute top-1 rounded-sm transition-colors"
      style={{
        left: x,
        width: w,
        height: AUDIO_TRACK_H - 8,
        background: selected ? getAccentColors().accent35 : "rgba(255,255,255,0.08)",
        border: selected ? `1px solid ${getPlayheadColor()}` : "1px solid rgba(255,255,255,0.1)",
        overflow: "hidden",
      }}
      title={clip.trackId}
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
      <span className="relative truncate px-1 text-[9px] text-white/50">{clip.trackId}</span>
    </div>
  )
}

/* ─── Ruler (canvas) ─── */

function Ruler({
  width,
  zoom,
  scrollLeft,
  currentTime,
  totalDuration,
  onSeek,
}: {
  width: number
  zoom: number
  scrollLeft: number
  currentTime: number
  totalDuration: number
  onSeek: (ms: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const canvasW = width - LABEL_COL_W
    canvas.width = canvasW * dpr
    canvas.height = RULER_H * dpr
    canvas.style.width = `${canvasW}px`
    canvas.style.height = `${RULER_H}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvasW, RULER_H)

    // Determine tick interval based on zoom
    let tickIntervalMs = 1000
    if (zoom < 40) tickIntervalMs = 5000
    else if (zoom < 80) tickIntervalMs = 2000
    else if (zoom > 300) tickIntervalMs = 500

    const majorEvery = tickIntervalMs <= 500 ? 2 : tickIntervalMs <= 1000 ? 5 : tickIntervalMs <= 2000 ? 5 : 2
    const startMs = Math.floor(xToMs(scrollLeft, zoom) / tickIntervalMs) * tickIntervalMs
    const endMs = xToMs(scrollLeft + canvasW, zoom)
    const maxMs = Math.max(totalDuration, endMs)

    ctx.strokeStyle = "rgba(255,255,255,0.15)"
    ctx.fillStyle = "rgba(255,255,255,0.35)"
    ctx.font = "9px ui-monospace, monospace"
    ctx.textBaseline = "bottom"

    let tickIndex = 0
    for (let ms = startMs; ms <= maxMs; ms += tickIntervalMs) {
      const x = msToX(ms, zoom) - scrollLeft
      if (x < -10 || x > canvasW + 10) { tickIndex++; continue }

      const isMajor = tickIndex % majorEvery === 0
      ctx.beginPath()
      ctx.moveTo(x, isMajor ? 6 : 14)
      ctx.lineTo(x, RULER_H)
      ctx.stroke()

      if (isMajor) {
        const totalSec = Math.round(ms / 1000)
        const m = Math.floor(totalSec / 60)
        const s = totalSec % 60
        const label = `${m}:${String(s).padStart(2, "0")}`
        ctx.fillText(label, x + 2, 14)
      }
      tickIndex++
    }

    // Playhead triangle
    const phX = msToX(currentTime, zoom) - scrollLeft
    if (phX >= -6 && phX <= canvasW + 6) {
      ctx.fillStyle = getPlayheadColor()
      ctx.beginPath()
      ctx.moveTo(phX - 5, 0)
      ctx.lineTo(phX + 5, 0)
      ctx.lineTo(phX, 8)
      ctx.closePath()
      ctx.fill()
    }
  }, [width, zoom, scrollLeft, currentTime, totalDuration])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const localX = e.clientX - rect.left
    const ms = xToMs(localX + scrollLeft, zoom)
    onSeek(Math.max(0, ms))
  }

  return (
    <div className="flex" style={{ height: RULER_H }}>
      <div style={{ width: LABEL_COL_W, minWidth: LABEL_COL_W }} />
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="cursor-pointer"
        style={{ flex: 1 }}
      />
    </div>
  )
}

function PreviewPanel({
  shots,
  currentTime,
  currentShot,
  selectedShotId,
  isPlaying,
}: {
  shots: TimelineShot[]
  currentTime: number
  currentShot: TimelineShot | null
  selectedShotId: string | null
  isPlaying: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [loadedVideo, setLoadedVideo] = useState<{ shotId: string; url: string } | null>(null)

  const previewShot = useMemo(() => {
    if (isPlaying) return currentShot
    if (selectedShotId) return shots.find((shot) => shot.id === selectedShotId) ?? currentShot
    return currentShot
  }, [currentShot, isPlaying, selectedShotId, shots])

  const previewShotIndex = useMemo(() => {
    if (!previewShot) return -1
    return shots.findIndex((shot) => shot.id === previewShot.id)
  }, [previewShot, shots])

  const shotStartTime = useMemo(() => {
    if (previewShotIndex < 0) return 0
    return getShotStartTime(shots, previewShotIndex)
  }, [previewShotIndex, shots])

  const videoSrc = useMemo(() => {
    if (previewShot?.type !== "video") return null
    if (previewShot.originalUrl) return previewShot.originalUrl
    if (loadedVideo?.shotId === previewShot.id) return loadedVideo.url
    return null
  }, [loadedVideo, previewShot])

  useEffect(() => {
    let cancelled = false

    if (previewShot?.type !== "video") return

    const blobKey = previewShot.originalBlobKey

    if (!blobKey || previewShot.originalUrl) return

    const previousBlobUrl = loadedVideo?.url?.startsWith("blob:") ? loadedVideo.url : null

    loadBlob(blobKey)
      .then((url) => {
        if (!cancelled && url) {
          if (previousBlobUrl && previousBlobUrl !== url) {
            URL.revokeObjectURL(previousBlobUrl)
          }
          setLoadedVideo({ shotId: previewShot.id, url })
        }
      })
      .catch(() => {
        // Ignore missing blob storage entries and keep thumbnail fallback.
      })

    return () => {
      cancelled = true
    }
  }, [loadedVideo?.url, previewShot?.id, previewShot?.originalBlobKey, previewShot?.originalUrl, previewShot?.type])

  useEffect(() => {
    return () => {
      if (loadedVideo?.url?.startsWith("blob:")) {
        URL.revokeObjectURL(loadedVideo.url)
      }
    }
  }, [loadedVideo])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoSrc || previewShot?.type !== "video") return

    video.playbackRate = 1

    if (isPlaying) {
      video.play().catch(() => {
        // Autoplay can be blocked briefly while source changes.
      })
      return
    }

    video.pause()
  }, [isPlaying, previewShot?.type, videoSrc])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoSrc || previewShot?.type !== "video") return

    const localTime = Math.max(0, (currentTime - shotStartTime) / 1000)
    if (Math.abs(video.currentTime - localTime) > 0.25) {
      video.currentTime = localTime
    }
  }, [currentTime, previewShot?.type, shotStartTime, videoSrc])

  if (!previewShot) return null

  const localTimeMs = Math.max(0, currentTime - shotStartTime)
  const shotDurationMs = previewShot.duration
  const hasVideo = previewShot.type === "video" && Boolean(videoSrc)
  const hasImage = Boolean(previewShot.thumbnailUrl)

  return (
    <div className="relative border-b border-white/8 bg-[#0A0908]" style={{ height: 180 }}>
      <div className="flex h-full items-center justify-center p-3">
        <div className="relative aspect-video h-full overflow-hidden rounded-lg bg-black/60">
          {hasVideo ? (
            <video
              ref={videoRef}
              src={videoSrc ?? undefined}
              muted
              playsInline
              preload="metadata"
              poster={previewShot.thumbnailUrl ?? undefined}
              className="h-full w-full object-cover"
            />
          ) : hasImage ? (
            <Image
              src={previewShot.thumbnailUrl!}
              alt={previewShot.label}
              fill
              unoptimized
              sizes="(max-width: 768px) 100vw, 50vw"
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2">
              <Film size={32} className="text-white/15" />
              <span className="text-[13px] font-medium text-white/25">{previewShot.label}</span>
            </div>
          )}

          <div className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/65 backdrop-blur-sm">
            Shot {previewShotIndex + 1}
          </div>
          <div className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/70 backdrop-blur-sm">
            {previewShot.label}
          </div>
          <div className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white/60 backdrop-blur-sm">
            {formatTime(localTimeMs)} / {formatTime(shotDurationMs)}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Main Timeline ─── */

export default function Timeline() {
  const shots = useTimelineStore((s) => s.shots)
  const audioClips = useTimelineStore((s) => s.audioClips)
  const currentTime = useTimelineStore((s) => s.currentTime)
  const isPlaying = useTimelineStore((s) => s.isPlaying)
  const playbackRate = useTimelineStore((s) => s.playbackRate)
  const zoom = useTimelineStore((s) => s.zoom)
  const scrollLeft = useTimelineStore((s) => s.scrollLeft)
  const selectedShotId = useTimelineStore((s) => s.selectedShotId)
  const selectedClipId = useTimelineStore((s) => s.selectedClipId)

  const togglePlay = useTimelineStore((s) => s.togglePlay)
  const pause = useTimelineStore((s) => s.pause)
  const seekTo = useTimelineStore((s) => s.seekTo)
  const setPlaybackRate = useTimelineStore((s) => s.setPlaybackRate)
  const setZoom = useTimelineStore((s) => s.setZoom)
  const setScrollLeft = useTimelineStore((s) => s.setScrollLeft)
  const selectShot = useTimelineStore((s) => s.selectShot)
  const selectClip = useTimelineStore((s) => s.selectClip)
  const addShot = useTimelineStore((s) => s.addShot)
  const removeShot = useTimelineStore((s) => s.removeShot)
  const updateShot = useTimelineStore((s) => s.updateShot)
  const reorderShot = useTimelineStore((s) => s.reorderShot)
  const moveAudioClip = useTimelineStore((s) => s.moveAudioClip)
  const updateAudioClip = useTimelineStore((s) => s.updateAudioClip)
  const activateNode = useTimelineStore((s) => s.activateNode)

  const containerRef = useRef<HTMLDivElement>(null)
  const tracksRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const prevTimeRef = useRef<number>(0)
  const [containerWidth, setContainerWidth] = useState(800)

  // Drag & drop state
  const [draggedShotId, setDraggedShotId] = useState<string | null>(null)
  const [dropIndicatorIdx, setDropIndicatorIdx] = useState<number | null>(null)

  // Preview state
  const [showPreview, setShowPreview] = useState(true)

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ shotId: string; x: number; y: number } | null>(null)

  // Close context menu on outside click / scroll
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener("click", close)
    window.addEventListener("scroll", close, true)
    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("scroll", close, true)
    }
  }, [ctxMenu])

  const totalDuration = useMemo(() => getTotalDuration(shots), [shots])
  const currentShotIndex = useMemo(() => getShotIndexAtTime(shots, currentTime), [shots, currentTime])
  const currentShot = shots[currentShotIndex] ?? null
  const showPreviewCanvas = showPreview && shots.length > 0

  // Container width measurement
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setContainerWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Playback tick
  useEffect(() => {
    if (!isPlaying) return

    prevTimeRef.current = performance.now()

    const tick = (now: number) => {
      const delta = now - prevTimeRef.current
      prevTimeRef.current = now

      const state = useTimelineStore.getState()
      const total = getTotalDuration(state.shots)
      const next = state.currentTime + delta * state.playbackRate

      if (next >= total) {
        seekTo(total)
        pause()
        return
      }

      seekTo(next)

      // Prefetch nearby thumbnails
      const idx = getShotIndexAtTime(state.shots, next)
      prefetchAhead(state.shots, idx, 3, 1)

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, seekTo, pause])

  // Auto-scroll playhead into view during playback
  useEffect(() => {
    if (!isPlaying) return
    const phX = msToX(currentTime, zoom)
    const viewStart = scrollLeft
    const viewEnd = scrollLeft + containerWidth - LABEL_COL_W
    if (phX < viewStart + 20 || phX > viewEnd - 40) {
      setScrollLeft(Math.max(0, phX - 60))
    }
  }, [isPlaying, currentTime, zoom, scrollLeft, containerWidth, setScrollLeft])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

      const state = useTimelineStore.getState()

      switch (e.key) {
        case " ": {
          e.preventDefault()
          togglePlay()
          break
        }
        case "ArrowLeft": {
          e.preventDefault()
          const idx = getShotIndexAtTime(state.shots, state.currentTime)
          const prevIdx = Math.max(0, idx - 1)
          seekTo(getShotStartTime(state.shots, prevIdx))
          break
        }
        case "ArrowRight": {
          e.preventDefault()
          const idx2 = getShotIndexAtTime(state.shots, state.currentTime)
          const nextIdx = Math.min(state.shots.length - 1, idx2 + 1)
          seekTo(getShotStartTime(state.shots, nextIdx))
          break
        }
        case "j":
        case "J": {
          seekTo(Math.max(0, state.currentTime - 5000))
          break
        }
        case "k":
        case "K": {
          pause()
          break
        }
        case "l":
        case "L": {
          seekTo(state.currentTime + 5000)
          break
        }
        case "Home": {
          e.preventDefault()
          seekTo(0)
          break
        }
        case "End": {
          e.preventDefault()
          seekTo(getTotalDuration(state.shots))
          break
        }
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [togglePlay, seekTo, pause])

  // Ctrl+Wheel zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const state = useTimelineStore.getState()
        const delta = e.deltaY > 0 ? -10 : 10
        setZoom(state.zoom + delta)
      }
    }

    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [setZoom])

  // Horizontal scroll
  const handleTracksScroll = useCallback(() => {
    const el = tracksRef.current
    if (el) setScrollLeft(el.scrollLeft)
  }, [setScrollLeft])

  // Pre-compute shot positions
  const shotPositions = useMemo(() => {
    const positions: { shot: TimelineShot; x: number; w: number }[] = []
    let accX = 0
    for (const shot of shots) {
      const w = msToX(shot.duration, zoom)
      positions.push({ shot, x: accX, w })
      accX += w
    }
    return positions
  }, [shots, zoom])

  // Visible shot filtering (virtualization)
  const visibleShots = useMemo(() => {
    const viewStart = scrollLeft - LABEL_COL_W
    const viewEnd = scrollLeft + containerWidth + LABEL_COL_W
    const buffer = 3
    const result: typeof shotPositions = []

    for (let i = 0; i < shotPositions.length; i++) {
      const sp = shotPositions[i]
      const right = sp.x + sp.w
      if (right < viewStart && i < shotPositions.length - buffer) continue
      if (sp.x > viewEnd && i > buffer) break
      result.push(sp)
    }

    return result
  }, [shotPositions, scrollLeft, containerWidth])

  // Auto-scroll to selected shot
  useEffect(() => {
    if (!selectedShotId || !tracksRef.current) return
    const idx = shotPositions.findIndex((sp) => sp.shot.id === selectedShotId)
    if (idx === -1) return
    const sp = shotPositions[idx]
    const viewStart = tracksRef.current.scrollLeft
    const viewWidth = tracksRef.current.clientWidth - LABEL_COL_W
    const shotCenter = sp.x + sp.w / 2
    if (shotCenter < viewStart || shotCenter > viewStart + viewWidth) {
      tracksRef.current.scrollLeft = Math.max(0, shotCenter - viewWidth / 2)
      setScrollLeft(Math.max(0, shotCenter - viewWidth / 2))
    }
  }, [selectedShotId, shotPositions, setScrollLeft])

  const trackContentWidth = useMemo(() => {
    return Math.max(containerWidth - LABEL_COL_W, msToX(totalDuration, zoom) + 100)
  }, [totalDuration, zoom, containerWidth])

  const playheadX = msToX(currentTime, zoom)

  const cycleRate = () => {
    const idx = RATE_STEPS.indexOf(playbackRate as typeof RATE_STEPS[number])
    const next = RATE_STEPS[(idx + 1) % RATE_STEPS.length]
    setPlaybackRate(next)
  }

  const seekToPrevShot = () => {
    const idx = getShotIndexAtTime(shots, currentTime)
    const prev = Math.max(0, idx - 1)
    seekTo(getShotStartTime(shots, prev))
  }

  const seekToNextShot = () => {
    const idx = getShotIndexAtTime(shots, currentTime)
    const next = Math.min(shots.length - 1, idx + 1)
    seekTo(getShotStartTime(shots, next))
  }

  const audioTracks = [
    { id: "voiceover" as const, label: "Voice", icon: Mic },
    { id: "music" as const, label: "Music", icon: Music },
    { id: "sfx" as const, label: "SFX", icon: Volume2 },
  ]

  return (
    <div ref={containerRef} className="flex w-full flex-col rounded-lg border border-white/8 bg-[#0E0D0B]/95 backdrop-blur-xl">
      {/* ─── Header ─── */}
      <div className="flex h-10 items-center gap-3 border-b border-white/8 px-3" style={{ minHeight: HEADER_H }}>
        <div className="flex items-center gap-1">
          <button type="button" onClick={seekToPrevShot} className="flex h-7 w-7 items-center justify-center rounded text-white/50 transition-colors hover:bg-white/8 hover:text-white/80" title="Previous shot">
            <SkipBack size={14} />
          </button>
          <button type="button" onClick={togglePlay} className="flex h-7 w-7 items-center justify-center rounded text-white/70 transition-colors hover:bg-white/8 hover:text-white" title={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button type="button" onClick={seekToNextShot} className="flex h-7 w-7 items-center justify-center rounded text-white/50 transition-colors hover:bg-white/8 hover:text-white/80" title="Next shot">
            <SkipForward size={14} />
          </button>
        </div>

        <div className="font-mono text-[11px] tabular-nums text-white/60">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </div>

        <button
          type="button"
          onClick={cycleRate}
          className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white/50 transition-colors hover:bg-white/8 hover:text-white/70"
          title="Playback rate"
        >
          ×{playbackRate}
        </button>

        <div className="flex flex-1 items-center justify-end gap-2">
          <div className="flex items-center gap-1.5">
            <ZoomOut size={12} className="text-white/30" />
            <input
              type="range"
              min={20}
              max={500}
              step={10}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-1 w-20 cursor-pointer appearance-none rounded bg-white/10 accent-[#D4A853] [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#D4A853]"
            />
            <ZoomIn size={12} className="text-white/30" />
          </div>
          <span className="text-[10px] text-white/35">{shots.length} shots</span>
          {shots.length === 0 && (
            <button
              type="button"
              onClick={() => generateDemoShots(100).forEach((s) => addShot(s))}
              className="rounded border border-[#D4A853]/30 px-2 py-0.5 text-[10px] text-[#D4A853]/70 transition-colors hover:bg-[#D4A853]/10 hover:text-[#D4A853]"
            >
              Demo (100 shots)
            </button>
          )}
          {shots.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/8 hover:text-white/70"
              title={showPreview ? "Hide preview" : "Show preview"}
            >
              {showPreview ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* ─── Preview Canvas ─── */}
      {showPreviewCanvas && (
        <div className="relative">
          <PreviewPanel
            shots={shots}
            currentTime={currentTime}
            currentShot={currentShot}
            selectedShotId={selectedShotId}
            isPlaying={isPlaying}
          />
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded text-white/30 transition-colors hover:bg-white/10 hover:text-white/60"
            title="Hide preview"
          >
            ×
          </button>
        </div>
      )}

      {/* ─── Ruler ─── */}
      <Ruler
        width={containerWidth}
        zoom={zoom}
        scrollLeft={scrollLeft}
        currentTime={currentTime}
        totalDuration={totalDuration}
        onSeek={seekTo}
      />

      {/* ─── Tracks ─── */}
      <div
        ref={tracksRef}
        className="relative overflow-x-auto overflow-y-hidden"
        onScroll={handleTracksScroll}
      >
        {/* Video Track */}
        <div className="flex" style={{ height: SHOT_TRACK_H }}>
          <div
            className="flex shrink-0 items-center gap-1.5 border-r border-white/8 px-2 text-[10px] uppercase tracking-[0.12em] text-white/40"
            style={{ width: LABEL_COL_W, minWidth: LABEL_COL_W }}
          >
            <Film size={12} className="text-white/25" />
            Video
          </div>
          <div
            className="relative"
            style={{ width: trackContentWidth, height: SHOT_TRACK_H }}
            onDragOver={(e) => {
              e.preventDefault()
              // When dragging over the empty track area, compute the drop index
              const rect = e.currentTarget.getBoundingClientRect()
              const relX = e.clientX - rect.left + scrollLeft
              let idx = shots.length
              for (let i = 0; i < shotPositions.length; i++) {
                const mid = shotPositions[i].x + shotPositions[i].w / 2
                if (relX < mid) { idx = i; break }
              }
              setDropIndicatorIdx(idx)
            }}
            onDragLeave={() => setDropIndicatorIdx(null)}
            onDrop={(e) => {
              e.preventDefault()
              if (draggedShotId != null && dropIndicatorIdx != null) {
                reorderShot(draggedShotId, dropIndicatorIdx)
              }
              setDraggedShotId(null)
              setDropIndicatorIdx(null)
            }}
          >
            {visibleShots.map(({ shot, x, w }) => {
              const shotIdx = shotPositions.findIndex((sp) => sp.shot.id === shot.id)
              return (
                <ShotThumb
                  key={shot.id}
                  shot={shot}
                  x={x}
                  width={w}
                  selected={shot.id === selectedShotId}
                  isDragged={shot.id === draggedShotId}
                  onClick={() => selectShot(shot.id)}
                  onDoubleClick={() => activateNode(shot.id)}
                  onDragStart={(e) => {
                    setDraggedShotId(shot.id)
                    e.dataTransfer.effectAllowed = "move"
                  }}
                  onDragEnd={() => {
                    setDraggedShotId(null)
                    setDropIndicatorIdx(null)
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    const rect = e.currentTarget.getBoundingClientRect()
                    const mid = rect.left + rect.width / 2
                    setDropIndicatorIdx(e.clientX < mid ? shotIdx : shotIdx + 1)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (draggedShotId != null && dropIndicatorIdx != null) {
                      reorderShot(draggedShotId, dropIndicatorIdx)
                    }
                    setDraggedShotId(null)
                    setDropIndicatorIdx(null)
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setCtxMenu({ shotId: shot.id, x: e.clientX, y: e.clientY })
                  }}
                />
              )
            })}

            {/* Drop indicator line */}
            {draggedShotId != null && dropIndicatorIdx != null && (() => {
              const indicatorX = dropIndicatorIdx < shotPositions.length
                ? shotPositions[dropIndicatorIdx].x
                : (shotPositions.length > 0
                  ? shotPositions[shotPositions.length - 1].x + shotPositions[shotPositions.length - 1].w
                  : 0)
              return (
                <div
                  className="pointer-events-none absolute top-0 z-20"
                  style={{
                    left: indicatorX - 1,
                    width: 2,
                    height: SHOT_TRACK_H,
                    background: getPlayheadColor(),
                  }}
                />
              )
            })()}

            {/* Playhead line */}
            <div
              className="pointer-events-none absolute top-0 z-10"
              style={{
                left: playheadX,
                width: 1,
                height: SHOT_TRACK_H,
                background: getPlayheadColor(),
              }}
            />
          </div>
        </div>

        {/* Audio Tracks */}
        {audioTracks.map((track) => {
          const clips = audioClips.filter((c) => c.trackId === track.id)
          const Icon = track.icon

          return (
            <div key={track.id} className="flex border-t border-white/6" style={{ height: AUDIO_TRACK_H }}>
              <div
                className="flex shrink-0 items-center gap-1.5 border-r border-white/8 px-2 text-[10px] uppercase tracking-[0.12em] text-white/40"
                style={{ width: LABEL_COL_W, minWidth: LABEL_COL_W }}
              >
                <Icon size={12} className="text-white/25" />
                {track.label}
              </div>
              <div className="relative flex items-center" style={{ width: trackContentWidth, height: AUDIO_TRACK_H }}>
                {clips.length === 0 && (
                  <span className="pointer-events-none pl-3 text-[10px] text-white/20">Drop audio here</span>
                )}
                {clips.map((clip) => (
                  <AudioClipRect
                    key={clip.id}
                    clip={clip}
                    zoom={zoom}
                    selected={clip.id === selectedClipId}
                    onClick={() => selectClip(clip.id)}
                    onMove={moveAudioClip}
                    onTrim={updateAudioClip}
                  />
                ))}
                {/* Playhead line */}
                <div
                  className="pointer-events-none absolute top-0 z-10"
                  style={{
                    left: playheadX,
                    width: 1,
                    height: AUDIO_TRACK_H,
                    background: getPlayheadColor(),
                    opacity: 0.5,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* ─── Context Menu ─── */}
      {ctxMenu && (
        <div
          className="fixed z-50 min-w-35 rounded border border-white/10 bg-[#1A1916] py-1 shadow-xl"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full px-3 py-1.5 text-left text-[12px] text-white/70 hover:bg-white/8 hover:text-white"
            onClick={() => {
              const shot = shots.find((s) => s.id === ctxMenu.shotId)
              if (shot) {
                addShot({ ...shot, id: undefined as unknown as string })
              }
              setCtxMenu(null)
            }}
          >
            Duplicate
          </button>
          <button
            type="button"
            className="flex w-full px-3 py-1.5 text-left text-[12px] text-white/70 hover:bg-white/8 hover:text-white"
            onClick={() => {
              const input = window.prompt("Duration (ms):")
              if (input != null) {
                const val = Number(input)
                if (!Number.isNaN(val) && val > 0) {
                  updateShot(ctxMenu.shotId, { duration: val })
                }
              }
              setCtxMenu(null)
            }}
          >
            Set duration…
          </button>
          <div className="my-1 border-t border-white/8" />
          <button
            type="button"
            className="flex w-full px-3 py-1.5 text-left text-[12px] text-red-400/80 hover:bg-red-500/10 hover:text-red-400"
            onClick={() => {
              removeShot(ctxMenu.shotId)
              setCtxMenu(null)
            }}
          >
            Delete shot
          </button>
        </div>
      )}
    </div>
  )
}
