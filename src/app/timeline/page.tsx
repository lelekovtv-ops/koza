"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  SkipBack,
  Play,
  Pause,
  SkipForward,
  ZoomOut,
  ZoomIn,
  Film,
  Mic,
  Music,
  Volume2,
  Upload,
} from "lucide-react"
import { saveBlob, loadBlob } from "@/lib/fileStorage"
import {
  useTimelineStore,
  getTotalDuration,
  getShotIndexAtTime,
  getShotStartTime,
  type TimelineShot,
} from "@/store/timeline"

/* ─── helpers ─── */

function formatTime(ms: number): string {
  const totalSec = Math.max(0, ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = Math.floor(totalSec % 60)
  const frac = Math.floor((totalSec * 10) % 10)
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${frac}`
}

const SPEED_STEPS = [0.5, 1, 1.5, 2] as const
const LABEL_POOL = "ABCDE"
const TRACK_LABEL_W = 80 // px

async function getVideoDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video")
      video.preload = "metadata"
      video.onloadedmetadata = () => {
        resolve(video.duration * 1000)
      }
      video.onerror = () => reject(new Error("Failed to load video metadata"))
      video.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function createVideoThumbnail(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<string>((resolve, reject) => {
      const video = document.createElement("video")
      video.preload = "auto"
      video.muted = true
      video.onloadedmetadata = () => {
        video.currentTime = Math.min(1, video.duration * 0.1)
      }
      video.onseeked = () => {
        const canvas = document.createElement("canvas")
        canvas.width = 320
        canvas.height = 180
        const ctx = canvas.getContext("2d")
        if (!ctx) { reject(new Error("No canvas context")); return }
        ctx.drawImage(video, 0, 0, 320, 180)
        resolve(canvas.toDataURL("image/jpeg", 0.8))
      }
      video.onerror = () => reject(new Error("Failed to load video for thumbnail"))
      video.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/* ─── playback hook ─── */

function usePlaybackTick() {
  const isPlaying = useTimelineStore((s) => s.isPlaying)
  const playbackRate = useTimelineStore((s) => s.playbackRate)
  const seekTo = useTimelineStore((s) => s.seekTo)
  const pause = useTimelineStore((s) => s.pause)
  const lastTs = useRef<number | null>(null)

  useEffect(() => {
    if (!isPlaying) {
      lastTs.current = null
      return
    }
    let rafId: number
    const tick = (now: number) => {
      if (lastTs.current !== null) {
        const delta = (now - lastTs.current) * playbackRate
        const state = useTimelineStore.getState()
        const total = getTotalDuration(state.shots)
        const next = state.currentTime + delta
        if (next >= total) {
          seekTo(total)
          pause()
          lastTs.current = null
          return
        }
        seekTo(next)
      }
      lastTs.current = now
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPlaying, playbackRate, seekTo, pause])
}

/* ─── page ─── */

export default function TimelinePage() {
  /* store selectors */
  const shots = useTimelineStore((s) => s.shots)
  const currentTime = useTimelineStore((s) => s.currentTime)
  const isPlaying = useTimelineStore((s) => s.isPlaying)
  const playbackRate = useTimelineStore((s) => s.playbackRate)
  const zoom = useTimelineStore((s) => s.zoom)
  const scrollLeft = useTimelineStore((s) => s.scrollLeft)
  const selectedShotId = useTimelineStore((s) => s.selectedShotId)

  const togglePlay = useTimelineStore((s) => s.togglePlay)
  const seekTo = useTimelineStore((s) => s.seekTo)
  const setPlaybackRate = useTimelineStore((s) => s.setPlaybackRate)
  const setZoom = useTimelineStore((s) => s.setZoom)
  const setScrollLeft = useTimelineStore((s) => s.setScrollLeft)
  const selectShot = useTimelineStore((s) => s.selectShot)
  const addShot = useTimelineStore((s) => s.addShot)
  const updateShot = useTimelineStore((s) => s.updateShot)
  const clearTimeline = useTimelineStore((s) => s.clearTimeline)

  usePlaybackTick()

  /* drag & drop state */
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* process media files (shared by upload & drop) */
  const processMediaFiles = useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith("video/")
        const type: "video" | "image" = isVideo ? "video" : "image"
        const label = file.name.replace(/\.[^.]+$/, "")

        let duration = 3000
        let thumbnailUrl: string | null = null

        try {
          if (isVideo) {
            duration = await getVideoDuration(file)
            thumbnailUrl = await createVideoThumbnail(file)
          } else {
            thumbnailUrl = URL.createObjectURL(file)
          }
        } catch {
          // fallback: keep defaults
        }

        const blobKey = `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        await saveBlob(blobKey, file)

        addShot({ type, label, duration, thumbnailUrl, originalBlobKey: blobKey })
      }
    },
    [addShot],
  )

  /* drop on existing shot: replace its media */
  const handleShotDrop = useCallback(
    async (shotId: string, files: FileList | File[]) => {
      const file = Array.from(files).find(
        (f) => f.type.startsWith("video/") || f.type.startsWith("image/"),
      )
      if (!file) return

      const isVideo = file.type.startsWith("video/")
      let thumbnailUrl: string | null = null
      let duration: number | undefined

      try {
        if (isVideo) {
          duration = await getVideoDuration(file)
          thumbnailUrl = await createVideoThumbnail(file)
        } else {
          thumbnailUrl = URL.createObjectURL(file)
        }
      } catch {
        // fallback
      }

      const blobKey = `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await saveBlob(blobKey, file)

      updateShot(shotId, {
        type: isVideo ? "video" : "image",
        thumbnailUrl,
        originalBlobKey: blobKey,
        ...(duration !== undefined ? { duration } : {}),
      })
    },
    [updateShot],
  )

  /* derived values */
  const totalDuration = useMemo(() => getTotalDuration(shots), [shots])
  const totalWidth = useMemo(() => (totalDuration / 1000) * zoom, [totalDuration, zoom])
  const playheadX = (currentTime / 1000) * zoom
  const currentShotIdx = useMemo(() => getShotIndexAtTime(shots, currentTime), [shots, currentTime])

  /* shot offsets (cumulative left positions) */
  const shotOffsets = useMemo(() => {
    const offsets: number[] = []
    let acc = 0
    for (const shot of shots) {
      offsets.push(acc)
      acc += (shot.duration / 1000) * zoom
    }
    return offsets
  }, [shots, zoom])

  /* container ref for width measurement */
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(800)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* visible range for virtualisation */
  const visibleRange = useMemo(() => {
    if (shots.length === 0) return { start: 0, end: 0 }
    const viewStart = scrollLeft
    const viewEnd = scrollLeft + containerWidth + 200 // overscan
    let start = 0
    let end = shots.length
    for (let i = 0; i < shots.length; i++) {
      const shotRight = (shotOffsets[i] ?? 0) + (shots[i].duration / 1000) * zoom
      if (shotRight < viewStart) start = i + 1
      if ((shotOffsets[i] ?? 0) > viewEnd) { end = i; break }
    }
    return { start: Math.max(0, start - 1), end: Math.min(shots.length, end + 1) }
  }, [shots, shotOffsets, scrollLeft, containerWidth, zoom])

  /* ruler canvas */
  const rulerCanvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = rulerCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    // determine tick interval based on zoom
    let interval = 1 // seconds
    if (zoom < 30) interval = 10
    else if (zoom < 60) interval = 5
    else if (zoom < 100) interval = 2

    const startSec = Math.floor(scrollLeft / zoom / interval) * interval
    const endSec = Math.ceil((scrollLeft + w) / zoom / interval) * interval + interval

    ctx.strokeStyle = "rgba(255,255,255,0.12)"
    ctx.fillStyle = "rgba(255,255,255,0.35)"
    ctx.font = "9px ui-monospace, monospace"
    ctx.textBaseline = "bottom"

    for (let sec = startSec; sec <= endSec; sec += interval) {
      const x = (sec * zoom) - scrollLeft
      if (x < -10 || x > w + 10) continue
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
      const m = Math.floor(sec / 60)
      const s = sec % 60
      ctx.fillText(`${m}:${String(s).padStart(2, "0")}`, x + 3, h - 2)
    }

    // playhead triangle
    const phX = playheadX - scrollLeft
    if (phX >= -6 && phX <= w + 6) {
      ctx.fillStyle = "#D4A853"
      ctx.beginPath()
      ctx.moveTo(phX - 5, 0)
      ctx.lineTo(phX + 5, 0)
      ctx.lineTo(phX, 8)
      ctx.closePath()
      ctx.fill()
    }
  }, [zoom, scrollLeft, currentTime, playheadX, containerWidth, totalDuration])

  /* ruler click → seek */
  const handleRulerClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left + scrollLeft
      const time = (x / zoom) * 1000
      seekTo(Math.max(0, time))
    },
    [scrollLeft, zoom, seekTo],
  )

  /* speed cycle */
  const cycleSpeed = useCallback(() => {
    const idx = SPEED_STEPS.indexOf(playbackRate as (typeof SPEED_STEPS)[number])
    const next = SPEED_STEPS[(idx + 1) % SPEED_STEPS.length]
    setPlaybackRate(next)
  }, [playbackRate, setPlaybackRate])

  /* skip forward (next shot) */
  const skipForward = useCallback(() => {
    if (shots.length === 0) return
    const idx = getShotIndexAtTime(shots, currentTime)
    const nextIdx = Math.min(idx + 1, shots.length - 1)
    seekTo(getShotStartTime(shots, nextIdx))
  }, [shots, currentTime, seekTo])

  /* keyboard */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable) return

      const state = useTimelineStore.getState()
      const total = getTotalDuration(state.shots)

      switch (e.code) {
        case "Space":
          e.preventDefault()
          togglePlay()
          break
        case "ArrowLeft": {
          const idx = getShotIndexAtTime(state.shots, state.currentTime)
          seekTo(getShotStartTime(state.shots, Math.max(0, idx - 1)))
          break
        }
        case "ArrowRight": {
          const idx = getShotIndexAtTime(state.shots, state.currentTime)
          seekTo(getShotStartTime(state.shots, Math.min(idx + 1, state.shots.length - 1)))
          break
        }
        case "KeyJ":
          seekTo(state.currentTime - 5000)
          break
        case "KeyK":
          togglePlay()
          break
        case "KeyL":
          seekTo(state.currentTime + 5000)
          break
        case "Home":
          seekTo(0)
          break
        case "End":
          seekTo(total)
          break
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [togglePlay, seekTo])

  /* wheel zoom / scroll */
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        setZoom(zoom + (e.deltaY > 0 ? -10 : 10))
      } else {
        setScrollLeft(scrollLeft + e.deltaX + e.deltaY)
      }
    },
    [zoom, scrollLeft, setZoom, setScrollLeft],
  )

  /* auto-scroll during playback */
  useEffect(() => {
    if (!isPlaying) return
    const trackW = containerWidth - TRACK_LABEL_W
    if (playheadX > scrollLeft + trackW - 40) {
      setScrollLeft(playheadX - 60)
    }
  }, [isPlaying, playheadX, scrollLeft, containerWidth, setScrollLeft])

  /* generate demo shots */
  const generateDemoShots = useCallback(() => {
    clearTimeline()
    const types: Array<"image" | "video"> = ["image", "video"]
    for (let i = 0; i < 100; i++) {
      const group = Math.floor(i / 5) + 1
      const sub = LABEL_POOL[i % 5]
      addShot({
        duration: 1500 + Math.floor(Math.random() * 4500),
        type: types[i % 2],
        label: `Shot ${group}${sub}`,
      })
    }
  }, [addShot, clearTimeline])

  /* ─── render ─── */

  return (
    <main className="flex min-h-screen flex-col bg-[#0E0D0B] text-white">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-2">
        <Link href="/?storyboard=open" className="text-xs text-white/40 hover:text-white/70 transition-colors">
          ← Back to Storyboard
        </Link>
        <span className="text-xs font-medium tracking-wider text-white/60 uppercase">KOZA Timeline</span>
      </header>

      {/* Main timeline block */}
      <div
        className="relative mx-3 mb-3 flex flex-1 flex-col border border-white/[0.08] rounded-lg overflow-hidden"
        onWheel={handleWheel}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
        onDragEnter={(e) => {
          e.preventDefault()
          dragCounter.current++
          if (dragCounter.current === 1) setIsDragOver(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          dragCounter.current--
          if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragOver(false) }
        }}
        onDrop={(e) => {
          e.preventDefault()
          dragCounter.current = 0
          setIsDragOver(false)
          const files = e.dataTransfer.files
          if (files.length) processMediaFiles(files)
        }}
      >
        {/* Drop overlay */}
        {isDragOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#D4A853]/10 border-2 border-dashed border-[#D4A853]/40 rounded-lg pointer-events-none">
            <span className="text-sm font-medium text-[#D4A853]/80">Drop video or image files</span>
          </div>
        )}
        {/* 1 — Transport Bar */}
        <div className="flex h-10 items-center gap-1 border-b border-white/[0.08] px-2">
          <TBtn title="Rewind" onClick={() => seekTo(0)}><SkipBack size={14} /></TBtn>
          <TBtn title={isPlaying ? "Pause" : "Play"} onClick={togglePlay}>
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </TBtn>
          <TBtn title="Next shot" onClick={skipForward}><SkipForward size={14} /></TBtn>

          <span className="ml-2 select-none font-mono text-[11px] tabular-nums">
            <span style={{ color: "#D4A853" }}>{formatTime(currentTime)}</span>
            <span className="text-white/35"> / {formatTime(totalDuration)}</span>
          </span>

          <TBtn title="Playback speed" onClick={cycleSpeed} className="ml-1 text-[10px] font-mono">
            ×{playbackRate}
          </TBtn>

          <div className="flex-1" />

          <TBtn title="Zoom out" onClick={() => setZoom(zoom - 20)}><ZoomOut size={13} /></TBtn>
          <input
            type="range"
            min={20}
            max={500}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="mx-1 h-1 w-20 cursor-pointer appearance-none rounded bg-white/10 accent-[#D4A853]"
          />
          <TBtn title="Zoom in" onClick={() => setZoom(zoom + 20)}><ZoomIn size={13} /></TBtn>

          <TBtn title="Upload media" onClick={() => fileInputRef.current?.click()} className="ml-1">
            <Upload size={13} />
          </TBtn>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) processMediaFiles(e.target.files)
              e.target.value = ""
            }}
          />

          <span className="ml-2 select-none text-[10px] text-white/25">{shots.length} shots</span>
        </div>

        {shots.length === 0 ? (
          /* 5 — Empty state */
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
            <p className="text-sm text-white/30">No shots on timeline</p>
            <button
              type="button"
              onClick={generateDemoShots}
              className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            >
              Generate 100 demo shots
            </button>
          </div>
        ) : (
          <>
            {/* 2 — Ruler */}
            <div className="flex h-6 border-b border-white/[0.06]">
              <div style={{ width: TRACK_LABEL_W }} className="shrink-0" />
              <div className="relative flex-1 overflow-hidden" ref={containerRef}>
                <canvas
                  ref={rulerCanvasRef}
                  className="h-full w-full cursor-pointer"
                  onClick={handleRulerClick}
                />
              </div>
            </div>

            {/* Preview */}
            <PreviewPanel
              shots={shots}
              currentTime={currentTime}
              currentShotIdx={currentShotIdx}
              selectedShotId={selectedShotId}
              isPlaying={isPlaying}
            />

            {/* 3 — Video Track */}
            <div className="flex h-[64px] border-b border-white/[0.06]">
              <div
                style={{ width: TRACK_LABEL_W }}
                className="flex shrink-0 flex-col items-center justify-center gap-0.5 border-r border-white/[0.06]"
              >
                <Film size={12} className="text-white/40" />
                <span className="text-[9px] uppercase tracking-wider text-white/40">Video</span>
              </div>
              <div className="relative flex-1 overflow-hidden">
                <div
                  className="relative h-full"
                  style={{ width: totalWidth, transform: `translateX(${-scrollLeft}px)` }}
                >
                  {shots.slice(visibleRange.start, visibleRange.end).map((shot, vi) => {
                    const i = visibleRange.start + vi
                    const left = shotOffsets[i] ?? 0
                    const w = (shot.duration / 1000) * zoom
                    const isSelected = selectedShotId === shot.id
                    const isCurrent = i === currentShotIdx
                    return (
                      <ShotThumb
                        key={shot.id}
                        shot={shot}
                        index={i}
                        left={left}
                        width={w}
                        isSelected={isSelected}
                        isCurrent={isCurrent}
                        onSelect={() => selectShot(shot.id)}
                        onDropFile={handleShotDrop}
                      />
                    )
                  })}

                  {/* Playhead */}
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 w-px bg-[#D4A853]"
                    style={{ left: playheadX }}
                  />
                </div>
              </div>
            </div>

            {/* 4 — Audio Tracks */}
            <AudioTrackRow icon={<Mic size={12} />} label="Voice" />
            <AudioTrackRow icon={<Music size={12} />} label="Music" />
            <AudioTrackRow icon={<Volume2 size={12} />} label="SFX" />
          </>
        )}
      </div>
    </main>
  )
}

/* ─── small reusable pieces ─── */

function TBtn({
  children,
  onClick,
  title,
  className = "",
}: {
  children: React.ReactNode
  onClick: () => void
  title?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-7 min-w-7 items-center justify-center rounded hover:bg-white/10 text-white/60 hover:text-white/90 transition-colors ${className}`}
    >
      {children}
    </button>
  )
}

function AudioTrackRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex h-12 border-t border-white/[0.06]">
      <div
        style={{ width: TRACK_LABEL_W }}
        className="flex shrink-0 items-center justify-center gap-1.5 border-r border-white/[0.06]"
      >
        <span className="text-white/40">{icon}</span>
        <span className="text-[9px] uppercase tracking-wider text-white/40">{label}</span>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <span className="text-[10px] text-white/15">Drop audio here</span>
      </div>
    </div>
  )
}

/* ─── ShotThumb (static thumbnail only, no video) ─── */

function ShotThumb({
  shot,
  index,
  left,
  width,
  isSelected,
  isCurrent,
  onSelect,
  onDropFile,
}: {
  shot: TimelineShot
  index: number
  left: number
  width: number
  isSelected: boolean
  isCurrent: boolean
  onSelect: () => void
  onDropFile: (shotId: string, files: FileList | File[]) => void
}) {
  const [shotDropOver, setShotDropOver] = useState(false)

  return (
    <div
      className="absolute top-1 bottom-1 group"
      style={{ left, width }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setShotDropOver(true) }}
      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setShotDropOver(false) }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setShotDropOver(false)
        if (e.dataTransfer.files.length) onDropFile(shot.id, e.dataTransfer.files)
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        className={`relative h-[56px] w-full rounded-md overflow-hidden border transition-colors ${
          shotDropOver ? "border-[#D4A853] bg-[#D4A853]/10" : isSelected ? "border-[#D4A853]" : "border-white/[0.08]"
        }`}
        style={
          shot.thumbnailUrl
            ? { backgroundImage: `url(${shot.thumbnailUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { background: "linear-gradient(135deg, #1A1816, #2A2622)" }
        }
      >
        {/* hover brighten overlay */}
        <span className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.06] transition-colors pointer-events-none" />
        {/* shot number watermark */}
        <span className="absolute inset-0 flex items-center justify-center text-[18px] font-bold text-white/[0.06] select-none pointer-events-none">
          {index + 1}
        </span>
        {/* label */}
        {shot.label && (
          <span className="absolute left-1 top-1 max-w-[calc(100%-8px)] truncate rounded bg-black/50 px-1 text-[8px] text-white/70">
            {shot.label}
          </span>
        )}
        {/* duration badge */}
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] text-white/60">
          {(shot.duration / 1000).toFixed(1)}s
        </span>
        {/* current indicator */}
        {isCurrent && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D4A853]" />}
      </button>
    </div>
  )
}

/* ─── Preview Panel ─── */

function PreviewPanel({
  shots,
  currentTime,
  currentShotIdx,
  selectedShotId,
  isPlaying,
}: {
  shots: TimelineShot[]
  currentTime: number
  currentShotIdx: number
  selectedShotId: string | null
  isPlaying: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const prevBlobKeyRef = useRef<string | null>(null)

  // Determine which shot to preview
  const previewShot = useMemo(() => {
    if (selectedShotId) return shots.find((s) => s.id === selectedShotId) ?? null
    if (currentShotIdx >= 0 && currentShotIdx < shots.length) return shots[currentShotIdx]
    return null
  }, [shots, selectedShotId, currentShotIdx])

  const previewShotIdx = useMemo(() => {
    if (!previewShot) return -1
    return shots.findIndex((s) => s.id === previewShot.id)
  }, [shots, previewShot])

  // Compute shot start time for video sync
  const shotStartTime = useMemo(() => {
    if (previewShotIdx < 0) return 0
    return getShotStartTime(shots, previewShotIdx)
  }, [shots, previewShotIdx])

  // Load video blob when shot changes
  useEffect(() => {
    const blobKey = previewShot?.type === "video" ? previewShot.originalBlobKey : null

    if (blobKey === prevBlobKeyRef.current) return
    prevBlobKeyRef.current = blobKey

    // Revoke old URL
    if (videoSrc) {
      URL.revokeObjectURL(videoSrc)
      setVideoSrc(null)
    }

    if (!blobKey) return

    let cancelled = false
    loadBlob(blobKey).then((url) => {
      if (!cancelled && url) setVideoSrc(url)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewShot?.id, previewShot?.type, previewShot?.originalBlobKey])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (videoSrc) URL.revokeObjectURL(videoSrc)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Play/pause sync
  useEffect(() => {
    const v = videoRef.current
    if (!v || !videoSrc) return
    if (isPlaying) { v.play().catch(() => {}) }
    else { v.pause() }
  }, [isPlaying, videoSrc])

  // Time sync
  useEffect(() => {
    const v = videoRef.current
    if (!v || !videoSrc || previewShot?.type !== "video") return
    const localTime = (currentTime - shotStartTime) / 1000
    // Only seek if difference is significant (> 0.3s) to avoid constant seeking during playback
    if (Math.abs(v.currentTime - localTime) > 0.3) {
      v.currentTime = Math.max(0, localTime)
    }
  }, [currentTime, shotStartTime, videoSrc, previewShot?.type])

  // Format local time within shot
  const localTimeMs = previewShot ? Math.max(0, currentTime - shotStartTime) : 0
  const shotDurationMs = previewShot?.duration ?? 0

  if (!previewShot) return null

  const hasMedia = previewShot.thumbnailUrl || previewShot.originalBlobKey
  const isVideo = previewShot.type === "video" && videoSrc

  return (
    <div className="flex h-[240px] items-center justify-center border-b border-white/[0.06] bg-black">
      <div className="relative aspect-video max-h-full max-w-full">
        {isVideo ? (
          <video
            ref={videoRef}
            src={videoSrc}
            muted
            playsInline
            className="h-full w-full object-contain"
            poster={previewShot.thumbnailUrl ?? undefined}
          />
        ) : hasMedia && previewShot.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewShot.thumbnailUrl}
            alt={previewShot.label}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-[240px] w-[427px] flex-col items-center justify-center gap-2 bg-[#1A1816]">
            <Film size={32} className="text-white/20" />
            <span className="text-xs text-white/30">Shot {previewShotIdx + 1}</span>
            {previewShot.label && (
              <span className="text-[11px] text-white/40">{previewShot.label}</span>
            )}
          </div>
        )}

        {/* Overlays */}
        {/* Top-left: Shot badge */}
        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/60">
          Shot {previewShotIdx + 1}
        </span>
        {/* Bottom-left: label */}
        {previewShot.label && (
          <span className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-1 text-[11px] text-white/80">
            {previewShot.label}
          </span>
        )}
        {/* Bottom-right: time */}
        <span className="absolute bottom-2 right-2 rounded bg-black/50 px-2 py-1 font-mono text-[10px] text-white/60">
          {formatTime(localTimeMs)} / {formatTime(shotDurationMs)}
        </span>
      </div>
    </div>
  )
}