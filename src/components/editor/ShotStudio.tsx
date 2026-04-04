"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Copy,
  Download,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Maximize,
  Minimize,
  MousePointer2,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Settings,
  SkipBack,
  SkipForward,
  Wand2,
  X,
  Loader2,
  Palette,
} from "lucide-react"
import { type GenerationHistoryEntry, useTimelineStore } from "@/store/timeline"
import { useBibleStore } from "@/store/bible"
import { useBoardStore } from "@/store/board"
import { useScenesStore } from "@/store/scenes"
import { ImageEditOverlay } from "@/components/ui/ImageEditOverlay"
import { trySaveBlob } from "@/lib/fileStorage"
import { buildImagePrompt, getCharactersForShot, getPropsForShot, getLocationsForShot } from "@/lib/promptBuilder"
import { SceneBibleBubble } from "@/components/editor/screenplay/StoryboardShared"
import { useScriptStore } from "@/store/script"
import { convertReferenceImagesToDataUrls, getShotGenerationReferenceImages } from "@/lib/imageGenerationReferences"
import type { SAMResult, SAMStatus } from "@/lib/sam/samService"

const samService = () => import("@/lib/sam/samService")
const loadSAM = async () => (await samService()).loadModels()
const samSetImage = async (url: string) => (await samService()).setImage(url)
const samSegment = async (x: number, y: number) => (await samService()).segment(x, y)
const renderMaskOverlay = async (...args: Parameters<Awaited<ReturnType<typeof samService>>["renderMaskOverlay"]>) => (await samService()).renderMaskOverlay(...args)
const cropMaskedRegion = async (...args: Parameters<Awaited<ReturnType<typeof samService>>["cropMaskedRegion"]>) => (await samService()).cropMaskedRegion(...args)

// ── Types ──

interface ShotStudioProps {
  shotId: string
  fullscreen?: boolean
  onClose: () => void
  onNavigate?: (shotId: string) => void
  /** Standalone mode: no Bible injection, clean prompt, no playback/inspector */
  standalone?: boolean
  /** Called on close in standalone mode with final prompt & image URL */
  onSync?: (prompt: string, imageUrl: string | null) => void
}

// ── Helpers ──

function fmtTimecode(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  const millis = ms % 1000
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(millis).padStart(3, "0")}`
}

function sourceLabel(source?: string): { letter: string; color: string } {
  switch (source) {
    case "edit": return { letter: "E", color: "bg-purple-400" }
    case "crop": return { letter: "C", color: "bg-blue-400" }
    case "color": return { letter: "M", color: "bg-amber-400" }
    default: return { letter: "G", color: "bg-emerald-400" }
  }
}

// ── Dock Magnification Strip (macOS-style) ──

const DOCK_BASE = 48       // base thumbnail height
const DOCK_MAX = 60        // max magnified height (~1.25x)
const DOCK_RADIUS = 80     // influence radius in px
const DOCK_ASPECT = 1.4    // w/h ratio for thumbnails

function DockStrip({
  className,
  history,
  historyIdx,
  sourceLabel: srcLabel,
  onSelect,
}: {
  className: string
  history: Array<{ url: string; timestamp: number; source?: string }>
  historyIdx: number
  sourceLabel: (source?: string) => { letter: string; color: string }
  onSelect: (index: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mouseX, setMouseX] = useState<number | null>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) setMouseX(e.clientX - rect.left)
  }, [])

  const handleMouseLeave = useCallback(() => setMouseX(null), [])

  return (
    <div
      ref={containerRef}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ display: "flex", alignItems: "flex-end", gap: 4 }}
    >
      {history.map((entry, i) => {
        const sl = srcLabel(entry.source)
        const isActive = i === historyIdx

        // Compute scale based on distance from cursor
        let scale = 1
        if (mouseX !== null && containerRef.current) {
          const children = containerRef.current.children
          if (children[i]) {
            const child = children[i] as HTMLElement
            const childCenter = child.offsetLeft + child.offsetWidth / 2
            const dist = Math.abs(mouseX - childCenter)
            const proximity = Math.max(0, 1 - dist / DOCK_RADIUS)
            // Smooth Gaussian-like curve
            scale = 1 + (DOCK_MAX / DOCK_BASE - 1) * Math.pow(proximity, 2)
          }
        }

        const h = Math.round(DOCK_BASE * scale)
        const w = Math.round(h * DOCK_ASPECT)

        return (
          <button
            key={`${entry.timestamp}-${i}`}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-dock-ref", entry.url)
              e.dataTransfer.effectAllowed = "copy"
            }}
            onClick={() => onSelect(i)}
            className={`relative flex-shrink-0 overflow-hidden rounded-lg border-2 ${isActive ? "border-[#D4A853]" : "border-transparent opacity-70"} cursor-grab active:cursor-grabbing`}
            style={{
              width: w,
              height: h,
              transition: mouseX !== null ? "width 0.15s ease-out, height 0.15s ease-out" : "width 0.3s ease-out, height 0.3s ease-out",
            }}
          >
            {entry.source === "loading" ? (
              <div className="flex h-full w-full items-center justify-center bg-white/5">
                <Loader2 size={14} className="animate-spin text-[#D4A853]/60" />
              </div>
            ) : (
              <img src={entry.url} alt="" className="h-full w-full object-cover" draggable={false} />
            )}
            <span className={`absolute bottom-1 right-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[7px] font-bold text-black ${sl.color}`}>
              {entry.source === "loading" ? "…" : sl.letter}
            </span>
          </button>
        )
      })}
    </div>
  )
}

const IMAGE_GEN_MODELS = [
  { id: "nano-banana", label: "Banana", tag: "G" },
  { id: "nano-banana-2", label: "Banana 2", tag: "G" },
  { id: "nano-banana-pro", label: "Banana Pro", tag: "G" },
  { id: "gpt-image", label: "GPT Image", tag: "O" },
] as const

// ── Component ──

export function ShotStudio({ shotId, fullscreen: initialFullscreen, onClose, onNavigate, standalone, onSync }: ShotStudioProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showUI, setShowUI] = useState(true)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stores
  const shot = useTimelineStore((s) => s.shots.find((x) => x.id === shotId)) ?? null
  const shots = useTimelineStore((s) => s.shots)
  const updateShot = useTimelineStore((s) => s.updateShot)
  const scenes = useScenesStore((s) => s.scenes)
  const characters = useBibleStore((s) => s.characters)
  const locations = useBibleStore((s) => s.locations)
  const bibleProps = useBibleStore((s) => s.props)
  const selectedModel = useBoardStore((s) => s.selectedImageGenModel) || "nano-banana-2"
  const setSelectedImageGenModel = useBoardStore((s) => s.setSelectedImageGenModel)
  const projectStyle = useBoardStore((s) => s.projectStyle)
  const scriptBlocks = useScriptStore((s) => s.blocks)

  // Sorted shots for navigation
  const sortedShots = useMemo(() => {
    const sceneOrder = new Map<string, number>()
    scenes.forEach((s, i) => sceneOrder.set(s.id, i))
    return [...shots].sort((a, b) => {
      const sa = sceneOrder.get(a.sceneId || "") ?? 999
      const sb = sceneOrder.get(b.sceneId || "") ?? 999
      if (sa !== sb) return sa - sb
      return a.order - b.order
    })
  }, [shots, scenes])

  const shotsWithImages = useMemo(() => sortedShots.filter((s) => s.thumbnailUrl), [sortedShots])
  const currentIdx = shotsWithImages.findIndex((s) => s.id === shotId)
  const hasPrev = currentIdx > 0
  const hasNext = currentIdx < shotsWithImages.length - 1

  // Playback
  const [playing, setPlaying] = useState(false)
  const [playStartTime, setPlayStartTime] = useState(0)
  const [playBaseMs, setPlayBaseMs] = useState(0)
  const [, setTick] = useState(0)
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Toast notification
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 5000)
  }, [])

  // Edit overlay
  const [editOpen, setEditOpen] = useState(false)
  // Prompt editing
  const [promptEditing, setPromptEditing] = useState(false)
  const [promptDraft, setPromptDraft] = useState("")
  const [batchCount, setBatchCount] = useState(1)
  const [generating, setGenerating] = useState(false)
  // Prompt checker
  const [censorIssues, setCensorIssues] = useState<Array<{ severity: string; message: string; suggestion?: string }>>([])
  const [censorOpen, setCensorOpen] = useState(false)
  // Dual-column translate mode
  const [dualMode, setDualMode] = useState(false)
  const [ruDraft, setRuDraft] = useState("")
  const [translating, setTranslating] = useState(false)
  const translateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reference picker & expanded ref
  const [refPickerOpen, setRefPickerOpen] = useState(false)
  const [expandedRefIdx, setExpandedRefIdx] = useState<number | null>(null)
  const [disabledRefs, setDisabledRefsRaw] = useState<Set<string>>(() => new Set(shot?.excludedBibleIds ?? []))
  const setDisabledRefs = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    setDisabledRefsRaw((prev) => {
      const next = updater(prev)
      updateShot(shotId, { excludedBibleIds: Array.from(next) })
      return next
    })
  }, [shotId, updateShot])
  const [refDropHover, setRefDropHover] = useState(false)
  const [refDragIdx, setRefDragIdx] = useState<number | null>(null)
  const [refDragOverIdx, setRefDragOverIdx] = useState<number | null>(null)
  const [refOrder, setRefOrder] = useState<string[] | null>(null)
  // Inspector panel
  const [inspectorOpen, setInspectorOpen] = useState(false)
  // Tools menu
  const [toolsOpen, setToolsOpen] = useState(false)
  const [samReplaceText, setSamReplaceText] = useState("")
  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  // Color match panel
  const [colorMatchOpen, setColorMatchOpen] = useState(false)
  const [colorMatchStrength, setColorMatchStrength] = useState(0.85)
  const [colorMatchApplying, setColorMatchApplying] = useState(false)

  // Transform edit mode
  const [editMode, setEditMode] = useState(false)
  const [xFlipH, setXFlipH] = useState(false)
  const [xFlipV, setXFlipV] = useState(false)
  const [xRotate, setXRotate] = useState(0) // degrees: 0, 90, 180, 270

  // SAM segmentation
  const [samMode, setSamMode] = useState(false)
  const [samStatus, setSamStatus] = useState<SAMStatus>("idle")
  const [samMask, setSamMask] = useState<SAMResult | null>(null)
  const [samOverlay, setSamOverlay] = useState<string | null>(null)
  const [samObjectName, setSamObjectName] = useState<string | null>(null)
  const [samPopup, setSamPopup] = useState<{ x: number; y: number } | null>(null)
  const [samLoading, setSamLoading] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  // History (from store — persisted generations)
  const history = shot?.generationHistory ?? []
  const historyIdx = shot?.activeHistoryIndex ?? history.length - 1

  // ── Save strategy ──
  // Generations → new history entry (immediately persisted to IndexedDB)
  // Edits → overwrite current history entry in-place (no clutter, auto-saved)
  // Undo stack → in-memory only (for Ctrl+Z during session)

  interface UndoEntry { url: string; blob: Blob }
  const undoStackRef = useRef<UndoEntry[]>([])

  // Save a new generation → always creates a NEW history entry
  const pushGeneration = useCallback(async (blob: Blob) => {
    if (!shot) return
    undoStackRef.current = []
    const url = URL.createObjectURL(blob)
    const blobKey = `shot-gen-${shotId}-${Date.now()}`
    const persisted = await trySaveBlob(blobKey, blob)
    const histEntry: GenerationHistoryEntry = {
      url,
      blobKey: persisted ? blobKey : null,
      timestamp: Date.now(),
      source: "generate",
    }
    const newHistory = [...(shot.generationHistory || []), histEntry]
    updateShot(shotId, {
      thumbnailUrl: url,
      thumbnailBlobKey: persisted ? blobKey : null,
      generationHistory: newHistory,
      activeHistoryIndex: newHistory.length - 1,
    })
  }, [shot, shotId, updateShot])

  // Save an edit → overwrites the CURRENT history entry (collapses multiple edits)
  const pushEdit = useCallback(async (blob: Blob, source: "edit" | "crop" | "color" = "edit") => {
    if (!shot) return
    const currentHistory = shot.generationHistory || []
    const currentIdx = shot.activeHistoryIndex ?? currentHistory.length - 1

    // Save undo state before overwriting
    const currentEntry = currentHistory[currentIdx]
    if (currentEntry) {
      undoStackRef.current = [...undoStackRef.current, { url: currentEntry.url, blob: await fetch(currentEntry.url).then((r) => r.blob()).catch(() => blob) }]
    }

    const url = URL.createObjectURL(blob)
    const blobKey = `shot-${source}-${shotId}-${Date.now()}`
    const persisted = await trySaveBlob(blobKey, blob)

    // Check if the current entry is already an edit — overwrite it
    // If it's a generation — create a new edit entry after it
    if (currentEntry && currentEntry.source !== "generate") {
      // Overwrite current edit entry in-place
      const updatedHistory = [...currentHistory]
      updatedHistory[currentIdx] = {
        url,
        blobKey: persisted ? blobKey : null,
        timestamp: Date.now(),
        source,
      }
      updateShot(shotId, {
        thumbnailUrl: url,
        thumbnailBlobKey: persisted ? blobKey : null,
        generationHistory: updatedHistory,
        activeHistoryIndex: currentIdx,
      })
    } else {
      // Current is a generation — add new edit entry after it
      const newHistory = [...currentHistory]
      // Insert after current position (trim any entries after current)
      newHistory.splice(currentIdx + 1)
      newHistory.push({
        url,
        blobKey: persisted ? blobKey : null,
        timestamp: Date.now(),
        source,
      })
      updateShot(shotId, {
        thumbnailUrl: url,
        thumbnailBlobKey: persisted ? blobKey : null,
        generationHistory: newHistory,
        activeHistoryIndex: newHistory.length - 1,
      })
    }
  }, [shot, shotId, updateShot])

  // Ctrl+Z — undo last edit (restore previous state from memory)
  const undoEdit = useCallback(async () => {
    const stack = undoStackRef.current
    if (stack.length === 0 || !shot) return

    const prev = stack[stack.length - 1]
    undoStackRef.current = stack.slice(0, -1)

    const currentHistory = shot.generationHistory || []
    const currentIdx = shot.activeHistoryIndex ?? currentHistory.length - 1

    const blobKey = `shot-undo-${shotId}-${Date.now()}`
    const persisted = await trySaveBlob(blobKey, prev.blob)

    const updatedHistory = [...currentHistory]
    updatedHistory[currentIdx] = {
      url: prev.url,
      blobKey: persisted ? blobKey : null,
      timestamp: Date.now(),
      source: "edit",
    }
    updateShot(shotId, {
      thumbnailUrl: prev.url,
      thumbnailBlobKey: persisted ? blobKey : null,
      generationHistory: updatedHistory,
      activeHistoryIndex: currentIdx,
    })
  }, [shot, shotId, updateShot])

  // flushAndClose defined after stopPlayback below

  // Timecode
  let tcElapsedMs = 0
  for (let i = 0; i < currentIdx; i++) tcElapsedMs += shotsWithImages[i]?.duration || 3000
  let tcTotalMs = 0
  for (const s of shotsWithImages) tcTotalMs += s.duration || 3000
  const liveMs = playing ? playBaseMs + (Date.now() - playStartTime) : tcElapsedMs

  // Shot label
  const shotLabelText = useMemo(() => {
    const sceneOrder = new Map<string, number>()
    scenes.forEach((s, i) => sceneOrder.set(s.id, i + 1))
    const countPerScene = new Map<string, number>()
    for (const s of sortedShots) {
      const sid = s.sceneId || ""
      const n = (countPerScene.get(sid) || 0) + 1
      countPerScene.set(sid, n)
      if (s.id === shotId) {
        const sceneNum = sceneOrder.get(sid) ?? 0
        return sceneNum > 0 ? `S${sceneNum}.${String(n).padStart(2, "0")}` : `Shot ${String(n).padStart(2, "0")}`
      }
    }
    return "Shot"
  }, [sortedShots, scenes, shotId])

  // Bible context for this shot
  const shotChars = shot ? getCharactersForShot(shot, characters) : []
  const shotLocs = shot ? getLocationsForShot(shot, locations) : []
  const shotProps = shot ? getPropsForShot(shot, bibleProps) : []

  // Scene data for SceneBibleBubble
  const currentScene = useMemo(() => scenes.find((s) => s.id === shot?.sceneId), [scenes, shot?.sceneId])
  const currentSceneIndex = useMemo(() => scenes.findIndex((s) => s.id === shot?.sceneId) + 1, [scenes, shot?.sceneId])
  const currentSceneBlockIds = useMemo(() => {
    if (!currentScene) return []
    return scriptBlocks
      .filter((b) => currentScene.blockIds?.includes(b.id))
      .map((b) => b.id)
  }, [currentScene, scriptBlocks])

  // ── Navigation ──

  const goToShot = useCallback((idx: number) => {
    const s = shotsWithImages[idx]
    if (s && onNavigate) onNavigate(s.id)
  }, [shotsWithImages, onNavigate])

  const goNext = useCallback(() => { if (hasNext) goToShot(currentIdx + 1) }, [hasNext, currentIdx, goToShot])
  const goPrev = useCallback(() => { if (hasPrev) goToShot(currentIdx - 1) }, [hasPrev, currentIdx, goToShot])

  // ── History navigation ──

  const goHistoryPrev = () => {
    if (historyIdx <= 0 || !shot) return
    const entry = history[historyIdx - 1]
    if (entry) updateShot(shotId, { thumbnailUrl: entry.url, activeHistoryIndex: historyIdx - 1 })
  }

  const goHistoryNext = () => {
    if (historyIdx >= history.length - 1 || !shot) return
    const entry = history[historyIdx + 1]
    if (entry) updateShot(shotId, { thumbnailUrl: entry.url, activeHistoryIndex: historyIdx + 1 })
  }

  // ── Playback ──

  const startPlayback = useCallback(() => {
    setPlaying(true)
    setPlayStartTime(Date.now())
    setPlayBaseMs(tcElapsedMs)
    if (tickRef.current) clearInterval(tickRef.current)
    tickRef.current = setInterval(() => setTick(Date.now()), 33)

    const advance = (idx: number) => {
      const s = shotsWithImages[idx]
      if (!s) { setPlaying(false); if (tickRef.current) clearInterval(tickRef.current); return }
      if (onNavigate) onNavigate(s.id)
      if (idx < shotsWithImages.length - 1) {
        playTimerRef.current = setTimeout(() => advance(idx + 1), s.duration || 3000)
      } else {
        setTimeout(() => { setPlaying(false); if (tickRef.current) clearInterval(tickRef.current) }, s.duration || 3000)
      }
    }
    advance(currentIdx)
  }, [currentIdx, shotsWithImages, tcElapsedMs, onNavigate])

  const stopPlayback = useCallback(() => {
    setPlaying(false)
    if (playTimerRef.current) { clearTimeout(playTimerRef.current); playTimerRef.current = null }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
  }, [])

  const flushAndClose = useCallback(() => {
    stopPlayback()
    undoStackRef.current = []
    if (standalone && onSync && shot) {
      onSync(shot.imagePrompt || "", shot.thumbnailUrl || null)
    }
    onClose()
  }, [stopPlayback, onClose, standalone, onSync, shot])

  // ── Fullscreen ──

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      containerRef.current.requestFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  // Auto-enter fullscreen if requested
  useEffect(() => {
    if (initialFullscreen && containerRef.current && !document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {})
    }
  }, [initialFullscreen])

  // ── Auto-hide UI ──

  const resetHideTimer = useCallback(() => {
    setShowUI(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (isFullscreen) {
      hideTimerRef.current = setTimeout(() => setShowUI(false), 2000)
    }
  }, [isFullscreen])

  useEffect(() => {
    if (!isFullscreen) { setShowUI(true); return }
    setShowUI(false)
  }, [isFullscreen])

  // ── Keyboard ──

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (editOpen) return

      if (e.key === "Escape") {
        if (deleteConfirm) { setDeleteConfirm(false) }
        else if (isFullscreen) document.exitFullscreen().catch(() => {})
        else { void flushAndClose() }
      }
      if (e.key === "z" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault()
        undoEdit()
      }
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev() }
      if (e.key === "ArrowRight") { e.preventDefault(); goNext() }
      if (e.key === "ArrowUp") { e.preventDefault(); goHistoryPrev() }
      if (e.key === "ArrowDown") { e.preventDefault(); goHistoryNext() }
      if (e.key === " ") {
        e.preventDefault()
        if (playing) stopPlayback(); else startPlayback()
      }
      if (e.key === "f" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        toggleFullscreen()
      }
      if (e.key === "i") { setInspectorOpen((v) => !v); setToolsOpen(false) }
      if (e.key === "t") { setToolsOpen((v) => !v); setInspectorOpen(false) }
      if ((e.key === "Delete" || e.key === "Backspace") && !deleteConfirm) {
        e.preventDefault()
        setDeleteConfirm(true)
      }
      if (e.key === "Enter" && deleteConfirm) {
        e.preventDefault()
        setDeleteConfirm(false)
        updateShot(shotId, { thumbnailUrl: null, thumbnailBlobKey: null, generationHistory: [], activeHistoryIndex: null })
      }
      if (e.key === "Enter" && !deleteConfirm && !promptEditing && !dualMode) {
        e.preventDefault()
        setPromptEditing(true)
        setPromptDraft(shot?.imagePrompt || "")
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isFullscreen, playing, editOpen, goPrev, goNext, startPlayback, stopPlayback, toggleFullscreen, onClose, deleteConfirm, promptEditing, dualMode, shot])

  // ── Edit complete handler — pushes to staging, not to library ──

  const handleEditComplete = async (blob: Blob) => {
    setEditOpen(false)
    if (!shot) return
    await pushEdit(blob, "edit")
  }

  // ── Transform edit mode ──

  const enterEditMode = useCallback((action: "flipH" | "flipV" | "rotateCW" | "rotateCCW") => {
    setEditMode(true)
    setToolsOpen(true)
    switch (action) {
      case "flipH": setXFlipH((v) => !v); break
      case "flipV": setXFlipV((v) => !v); break
      case "rotateCW": setXRotate((v) => (v + 90) % 360); break
      case "rotateCCW": setXRotate((v) => (v - 90 + 360) % 360); break
    }
  }, [])

  const cancelEditMode = useCallback(() => {
    setEditMode(false)
    setXFlipH(false)
    setXFlipV(false)
    setXRotate(0)
  }, [])

  const saveTransform = useCallback(async () => {
    if (!shot?.thumbnailUrl) return
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = shot.thumbnailUrl
    await new Promise((resolve) => { img.onload = resolve })

    const isRotated90 = xRotate === 90 || xRotate === 270
    const cw = isRotated90 ? img.naturalHeight : img.naturalWidth
    const ch = isRotated90 ? img.naturalWidth : img.naturalHeight

    const canvas = document.createElement("canvas")
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext("2d")!
    ctx.translate(cw / 2, ch / 2)
    if (xRotate) ctx.rotate((xRotate * Math.PI) / 180)
    ctx.scale(xFlipH ? -1 : 1, xFlipV ? -1 : 1)
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)

    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"))
    await pushEdit(blob, "edit")
    setEditMode(false)
    setXFlipH(false)
    setXFlipV(false)
    setXRotate(0)
  }, [shot, xFlipH, xFlipV, xRotate, pushEdit])

  // ── Color Transfer ──

  const colorNeighbors = useMemo(() => {
    if (currentIdx < 0) return []
    const result: Array<{ shot: typeof shotsWithImages[0]; label: string; offset: number }> = []
    for (let d = 1; d <= 3; d++) {
      if (currentIdx - d >= 0) result.push({ shot: shotsWithImages[currentIdx - d], label: `−${d}`, offset: -d })
      if (currentIdx + d < shotsWithImages.length) result.push({ shot: shotsWithImages[currentIdx + d], label: `+${d}`, offset: d })
    }
    return result.sort((a, b) => a.offset - b.offset)
  }, [currentIdx, shotsWithImages])

  const handleColorTransfer = useCallback(async (sourceUrl: string, strength?: number) => {
    if (!shot?.thumbnailUrl) return
    setColorMatchApplying(true)
    try {
      const { applyColorTransfer, imageUrlToCanvas } = await import("@/lib/colorTransfer")
      const [targetCanvas, refCanvas] = await Promise.all([
        imageUrlToCanvas(shot.thumbnailUrl),
        imageUrlToCanvas(sourceUrl),
      ])
      applyColorTransfer(targetCanvas, refCanvas, strength ?? colorMatchStrength)
      const blob = await new Promise<Blob>((resolve) => targetCanvas.toBlob((b) => resolve(b!), "image/png"))
      await pushEdit(blob, "color")
    } finally {
      setColorMatchApplying(false)
    }
  }, [shot, colorMatchStrength, pushEdit])

  // ── SAM ──

  const activateSAM = async () => {
    if (!previewSrc) return
    setSamMode(true)
    setSamStatus("loading-models")
    try {
      await loadSAM()
      setSamStatus("encoding-image")
      await samSetImage(previewSrc)
      setSamStatus("ready")
    } catch (err) {
      console.error("[SAM] Init error:", err)
      setSamMode(false)
      setSamStatus("idle")
    }
  }

  const handleSAMClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    e.stopPropagation()
    console.log("[SAM] Click!", { samMode, samStatus, hasRef: !!imgRef.current, imageSize: currentImageSize })
    if (!samMode || samStatus !== "ready" || !imgRef.current) return

    const el = imgRef.current
    const rect = el.getBoundingClientRect()
    const natW = el.naturalWidth || currentImageSize.w
    const natH = el.naturalHeight || currentImageSize.h
    if (!natW || !natH) return

    const scaleX = natW / rect.width
    const scaleY = natH / rect.height
    const clickX = (e.clientX - rect.left) * scaleX
    const clickY = (e.clientY - rect.top) * scaleY

    console.log("[SAM] Click coords:", { clickX: Math.round(clickX), clickY: Math.round(clickY), natW, natH, rectW: Math.round(rect.width), rectH: Math.round(rect.height) })

    setSamLoading(true)
    const result = await samSegment(clickX, clickY)
    setSamLoading(false)

    if (!result || result.score < 0.3) return

    setSamMask(result)

    // Render overlay
    const overlayCanvas = await renderMaskOverlay(result.mask, result.width, result.height)
    setSamOverlay(overlayCanvas.toDataURL())

    // Show popup at click position
    setSamPopup({ x: e.clientX, y: e.clientY })

    // Identify object via LLM
    if (previewSrc) {
      try {
        const cropped = await cropMaskedRegion(previewSrc, result.mask, result.width, result.height)
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{
              role: "user",
              content: [
                { type: "text", text: "What object is shown in this cropped image? Reply with ONLY the object name in Russian, 1-3 words. Example: стакан, пистолет, рука мужчины" },
                { type: "image_url", image_url: { url: cropped } },
              ],
            }],
            temperature: 0,
          }),
        })
        if (res.ok) {
          const reader = res.body?.getReader()
          if (reader) {
            const chunks: string[] = []
            while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(new TextDecoder().decode(value)) }
            setSamObjectName(chunks.join("").trim())
          }
        }
      } catch { /* LLM identification failed, continue without name */ }
    }
  }

  const handleSAMAction = async (action: "remove" | "replace" | "edit", editInstruction?: string) => {
    if (!samMask || !previewSrc || !shot) return
    const objName = samObjectName || "selected object"

    setSamPopup(null)
    setSamMode(false)
    setSamOverlay(null)
    setSamLoading(true)

    try {
      const model = selectedModel
      const apiUrl = model === "gpt-image" ? "/api/gpt-image" : "/api/nano-banana"

      // Send full original image as reference
      let ref = ""
      try {
        const resp = await fetch(previewSrc)
        const blob = await resp.blob()
        ref = await new Promise<string>((resolve) => { const r = new FileReader(); r.onloadend = () => resolve(r.result as string); r.readAsDataURL(blob) })
      } catch {}

      let prompt: string
      if (action === "remove") {
        prompt = `In this image, remove ONLY the "${objName}". Fill that area with natural background that matches the surroundings. Keep EVERYTHING else absolutely identical — same people, same objects, same lighting, same composition, same colors.`
      } else {
        const instruction = editInstruction || `Change the ${objName}`
        prompt = `In this image, find the "${objName}" and apply this change: ${instruction}. Change ONLY that specific object. Keep EVERYTHING else absolutely identical — same people, same other objects, same lighting, same composition, same colors. Do not alter anything outside of "${objName}".`
      }

      const body = model === "gpt-image"
        ? { prompt, referenceImages: [ref] }
        : { prompt, model, referenceImages: [ref] }

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(`SAM action failed: ${response.status}`)

      const blob = await response.blob()
      await handleEditComplete(blob)
    } catch (err) { console.error("[SAM] Action error:", err) }
    finally { setSamLoading(false); setSamMask(null); setSamObjectName(null) }
  }

  const cancelSAM = () => {
    setSamMode(false)
    setSamMask(null)
    setSamOverlay(null)
    setSamPopup(null)
    setSamObjectName(null)
  }

  // Image natural size (for SAM coordinate mapping)
  const [currentImageSize, setCurrentImageSize] = useState({ w: 0, h: 0 })
  // ── Fast translate (Google Translate, not AI) ──

  const [translateDirection, setTranslateDirection] = useState<"ru2en" | "en2ru" | null>(null)

  const fastTranslate = useCallback(async (text: string, from: string, to: string): Promise<string | null> => {
    if (!text.trim()) return ""
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, from, to }),
      })
      if (!res.ok) return null
      const data = await res.json() as { translated: string }
      return data.translated || null
    } catch { return null }
  }, [])

  const handleRuChange = useCallback((text: string) => {
    setRuDraft(text)
    if (translateTimerRef.current) clearTimeout(translateTimerRef.current)
    translateTimerRef.current = setTimeout(async () => {
      setTranslating(true)
      setTranslateDirection("ru2en")
      const result = await fastTranslate(text, "ru", "en")
      if (result !== null) {
        setPromptDraft(result)
        updateShot(shotId, { imagePrompt: result })
      }
      setTranslating(false)
      setTranslateDirection(null)
    }, 150)
  }, [fastTranslate, shotId, updateShot])

  const handleEnChange = useCallback((text: string) => {
    setPromptDraft(text)
    updateShot(shotId, { imagePrompt: text })
    if (translateTimerRef.current) clearTimeout(translateTimerRef.current)
    translateTimerRef.current = setTimeout(async () => {
      setTranslating(true)
      setTranslateDirection("en2ru")
      const result = await fastTranslate(text, "en", "ru")
      if (result !== null) setRuDraft(result)
      setTranslating(false)
      setTranslateDirection(null)
    }, 150)
  }, [fastTranslate, shotId, updateShot])

  // ── ?? AI Rewrite (Enter after ??) ──

  const [aiRewriting, setAiRewriting] = useState(false)

  const handleAIRewrite = async () => {
    if (!shot || aiRewriting) return
    const raw = promptDraft.trim()
    const instruction = raw.replace(/\?\?/g, "").trim()
    if (!instruction) return

    // If ?? is at the start → "from scratch" mode (don't send current prompt)
    // If ?? is in the middle/end → "edit existing" mode (send text before ?? as context)
    const isFromScratch = raw.startsWith("??")

    setAiRewriting(true)
    try {
      const { buildImagePromptWithAI } = await import("@/lib/promptAI")
      const sceneId = shot?.sceneId || ""
      const scene = scenes.find((s) => s.id === sceneId)
      const bible = useBibleStore.getState()

      const aiPrompt = await buildImagePromptWithAI({
        sceneTitle: scene?.title,
        caption: shot?.caption,
        directorNote: shot?.directorNote,
        cameraNote: shot?.cameraNote,
        shotSize: shot?.shotSize,
        cameraMotion: shot?.cameraMotion,
        currentImagePrompt: isFromScratch ? undefined : shot?.imagePrompt,
        characters: shotChars,
        locations: shotLocs,
        props: shotProps,
        projectStyle,
        storyHistory: bible.storyHistory,
        directorVision: bible.directorVision,
        excludedBibleIds: shot?.excludedBibleIds,
      }, instruction)

      setPromptDraft(aiPrompt)
      updateShot(shotId, { imagePrompt: aiPrompt })
    } catch (err) {
      console.error("[ShotStudio] AI rewrite error:", err)
    } finally {
      setAiRewriting(false)
    }
  }

  // ── Generate from prompt ──

  const handleGenerate = async () => {
    if (!shot || generating) return
    setGenerating(true)

    const userPrompt = promptDraft.trim() || shot.imagePrompt || shot.caption || shot.label || ""

    const fullPrompt = standalone
      ? (projectStyle ? `Art style: ${projectStyle}.\n\n${userPrompt}` : userPrompt)
      : buildImagePrompt(
          { ...shot, imagePrompt: userPrompt },
          characters,
          locations,
          projectStyle,
          bibleProps,
        )

    // Save user prompt to shot
    if (promptDraft.trim()) {
      updateShot(shotId, { imagePrompt: promptDraft.trim() })
    }

    try {
      let refDataUrls: string[] = []
      if (standalone) {
        // Standalone: only custom reference URLs
        const customUrls = (shot.customReferenceUrls || []).filter((u) => u)
        refDataUrls = await convertReferenceImagesToDataUrls(
          customUrls.map((url, i) => ({ id: `custom-${i}`, url, kind: "prop" as const, label: `Ref ${i + 1}` }))
        )
      } else {
        const allGenRefs = getShotGenerationReferenceImages(shot, characters, locations, bibleProps)
        // Filter out disabled refs
        const refs = disabledRefs.size > 0
          ? allGenRefs.filter((r) => {
              const charMatch = shotChars.find((c) => c.generatedPortraitUrl === r.url || c.referenceImages.some((ri) => ri.url === r.url))
              if (charMatch && disabledRefs.has(`char-${charMatch.id}`)) return false
              const locMatch = shotLocs.find((l) => l.generatedImageUrl === r.url || l.referenceImages.some((ri) => ri.url === r.url))
              if (locMatch && disabledRefs.has(`loc-${locMatch.id}`)) return false
              const propMatch = shotProps.find((p) => p.generatedImageUrl === r.url || p.referenceImages.some((ri) => ri.url === r.url))
              if (propMatch && disabledRefs.has(`prop-${propMatch.id}`)) return false
              const customUrls = shot.customReferenceUrls || []
              const customIdx = customUrls.indexOf(r.url)
              if (customIdx >= 0 && disabledRefs.has(`custom-${customIdx}`)) return false
              return true
            })
          : allGenRefs
        refDataUrls = await convertReferenceImagesToDataUrls(refs)
      }

      const apiUrl = selectedModel === "gpt-image" ? "/api/gpt-image" : "/api/nano-banana"

      // Add loading placeholders to history strip
      const loadingEntries: GenerationHistoryEntry[] = Array.from({ length: batchCount }, (_, i) => ({
        url: "",
        blobKey: null,
        timestamp: Date.now() + i,
        source: "loading" as const,
      }))
      const currentHistory = shot.generationHistory || []
      updateShot(shotId, {
        generationHistory: [...currentHistory, ...loadingEntries],
        activeHistoryIndex: currentHistory.length,
      })

      // Generate batchCount images in parallel
      const promises = Array.from({ length: batchCount }, async () => {
        const body = selectedModel === "gpt-image"
          ? { prompt: fullPrompt, referenceImages: refDataUrls }
          : { prompt: fullPrompt, model: selectedModel, referenceImages: refDataUrls }

        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const errText = await res.text().catch(() => "")
          console.error("[ShotStudio] Generation error:", res.status, errText)
          throw new Error(`Generation failed: ${res.status} — ${errText.slice(0, 200)}`)
        }
        return res.blob()
      })

      const blobs = await Promise.all(promises)

      // Remove loading placeholders first
      const freshShot = useTimelineStore.getState().shots.find((s) => s.id === shotId)
      const cleanHistory = (freshShot?.generationHistory || []).filter((e) => e.source !== "loading")
      updateShot(shotId, { generationHistory: cleanHistory })

      // All results → each becomes a new history entry
      for (const blob of blobs) {
        await pushGeneration(blob)
      }

      setPromptEditing(false)
    } catch (err) {
      // Remove loading placeholders on error
      const errShot = useTimelineStore.getState().shots.find((s) => s.id === shotId)
      const errClean = (errShot?.generationHistory || []).filter((e) => e.source !== "loading")
      updateShot(shotId, { generationHistory: errClean })
      console.error("[ShotStudio] Generate error:", err)
      const msg = err instanceof Error ? err.message : String(err)
      if (/safety|rejected|policy/i.test(msg)) {
        showToast("Промпт заблокирован safety-фильтром. Попробуй изменить описание или сменить модель.")
      } else {
        showToast(`Ошибка генерации: ${msg.slice(0, 120)}`)
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    console.log("[SAM] Image loaded:", img.naturalWidth, img.naturalHeight)
    setCurrentImageSize({ w: img.naturalWidth, h: img.naturalHeight })
  }, [])

  // ── Copy / Download ──

  const handleCopy = async () => {
    if (!shot?.thumbnailUrl) return
    try {
      const resp = await fetch(shot.thumbnailUrl)
      const blob = await resp.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    } catch {}
  }

  const handleDownload = () => {
    if (!shot?.thumbnailUrl) return
    const a = document.createElement("a")
    a.href = shot.thumbnailUrl
    a.download = `${shotLabelText}.png`
    a.click()
  }

  if (!shot) return null

  const previewSrc = shot.thumbnailUrl

  // Panel visibility class — hide everything in edit mode
  const panelClass = (base: string) =>
    `${base} transition-opacity duration-300 ${showUI && !editMode ? "opacity-100" : "opacity-0 pointer-events-none"}`

  const hasTransform = xFlipH || xFlipV || xRotate !== 0

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 flex items-center justify-center outline-none ${isFullscreen ? "z-[99999] bg-black" : "z-[999] bg-black/85 backdrop-blur-sm"} ${isFullscreen && !showUI ? "cursor-none" : ""}`}
      onMouseMove={resetHideTimer}
      onClick={(e) => { if (e.target === e.currentTarget && !isFullscreen && !editMode) { void flushAndClose() } }}
      tabIndex={0}
    >
      {/* ── Center: Image ── */}
      {previewSrc ? (
        <div
          className={`relative ${refDropHover ? "ring-2 ring-[#D4A853] ring-offset-2 ring-offset-black/50 rounded-lg" : ""}`}
          onClick={(e) => { e.stopPropagation(); setExpandedRefIdx(null) }}
          style={{ display: "inline-block" }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("application/x-dock-ref")) {
              e.preventDefault()
              e.dataTransfer.dropEffect = "copy"
              setRefDropHover(true)
            }
          }}
          onDragLeave={() => setRefDropHover(false)}
          onDrop={(e) => {
            e.preventDefault()
            setRefDropHover(false)
            const url = e.dataTransfer.getData("application/x-dock-ref")
            if (url && shot) {
              const existing = shot.customReferenceUrls || []
              if (!existing.includes(url)) {
                updateShot(shotId, { customReferenceUrls: [...existing, url] })
              }
            }
          }}
        >
          <img
            ref={imgRef}
            src={previewSrc}
            alt={shot.label || shotLabelText}
            className={`block transition-transform duration-300 ${samMode ? "cursor-crosshair" : ""} ${isFullscreen ? "max-h-screen max-w-screen" : editMode ? "max-h-[90vh] max-w-[85vw] rounded-lg shadow-2xl" : "max-h-[80vh] max-w-[75vw] rounded-lg shadow-2xl"}`}
            style={{
              transform: [
                xFlipH ? "scaleX(-1)" : "",
                xFlipV ? "scaleY(-1)" : "",
                xRotate ? `rotate(${xRotate}deg)` : "",
              ].filter(Boolean).join(" ") || undefined,
            }}
            draggable={false}
            onLoad={handleImageLoad}
            onClick={samMode ? handleSAMClick : undefined}
          />
          {/* SAM mask overlay — exactly matches img because parent is inline-block and img is block */}
          {samOverlay && (
            <>
              {/* Futuristic holographic grid — only white lines, no fill */}
              <div
                className="pointer-events-none absolute left-0 top-0 h-full w-full"
                style={{
                  maskImage: `url(${samOverlay})`,
                  WebkitMaskImage: `url(${samOverlay})`,
                  maskSize: "100% 100%",
                  WebkitMaskSize: "100% 100%",
                }}
              >
                {/* Horizontal lines */}
                <div
                  className="absolute inset-0 sam-lines-h"
                  style={{
                    background: "repeating-linear-gradient(0deg, transparent 0px, transparent 6px, rgba(255,255,255,0.5) 6px, rgba(255,255,255,0.5) 8px)",
                  }}
                />
                {/* Vertical lines */}
                <div
                  className="absolute inset-0 sam-lines-v"
                  style={{
                    background: "repeating-linear-gradient(90deg, transparent 0px, transparent 6px, rgba(255,255,255,0.5) 6px, rgba(255,255,255,0.5) 8px)",
                  }}
                />
                {/* Sweep glow — a bright band that moves through */}
                <div className="absolute inset-0 sam-sweep" />
              </div>
              <style>{`
                .sam-lines-h {
                  animation: sam-fade-h 3s ease-in-out infinite;
                }
                .sam-lines-v {
                  animation: sam-fade-v 3s ease-in-out infinite;
                  animation-delay: 1.5s;
                }
                .sam-sweep {
                  background: linear-gradient(
                    180deg,
                    transparent 0%,
                    rgba(255,255,255,0.15) 45%,
                    rgba(255,255,255,0.4) 50%,
                    rgba(255,255,255,0.15) 55%,
                    transparent 100%
                  );
                  background-size: 100% 300%;
                  animation: sam-sweep-move 2.5s ease-in-out infinite;
                }
                @keyframes sam-fade-h {
                  0%, 100% { opacity: 0.15; }
                  50% { opacity: 0.8; }
                }
                @keyframes sam-fade-v {
                  0%, 100% { opacity: 0.15; }
                  50% { opacity: 0.8; }
                }
                @keyframes sam-sweep-move {
                  0% { background-position: 0 -100%; }
                  100% { background-position: 0 200%; }
                }
              `}</style>
            </>
          )}
          {/* SAM loading indicator */}
          {samLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Loader2 className="h-8 w-8 animate-spin text-[#D4A853]" />
            </div>
          )}
          {/* Image prompt overlay — bottom of image */}
          {shot?.imagePrompt && !samMode && (() => {
            // Highlight bible entries in the prompt
            const charNames = shotChars.map((c) => c.name)
            const locNames = shotLocs.map((l) => l.name)
            const propNames = shotProps.map((p) => p.name)
            const allNames = [...charNames, ...locNames, ...propNames].filter(Boolean)

            const highlightPrompt = (text: string) => {
              if (standalone || allNames.length === 0) return text
              const pattern = new RegExp(`(${allNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi")
              const parts = text.split(pattern)
              return parts.map((part, i) => {
                const isMatch = allNames.some((n) => n.toLowerCase() === part.toLowerCase())
                return isMatch
                  ? <span key={i} className="text-[#D4A853] group-hover/prompt:text-[#E8C98A]">{part}</span>
                  : part
              })
            }

            // Unified ref list: bible + custom (standalone = custom only)
            const rawRefs: Array<{ id: string; url: string | null; label: string; source: "bible" | "custom" }> = standalone
              ? (shot.customReferenceUrls || []).map((url, i) => ({ id: `custom-${i}`, url, label: `Ref ${i + 1}`, source: "custom" as const }))
              : [
                  ...shotChars.map((c) => ({ id: `char-${c.id}`, url: c.generatedPortraitUrl, label: c.name, source: "bible" as const })),
                  ...shotLocs.map((l) => ({ id: `loc-${l.id}`, url: l.generatedImageUrl, label: l.name, source: "bible" as const })),
                  ...shotProps.map((p) => ({ id: `prop-${p.id}`, url: p.generatedImageUrl, label: p.name, source: "bible" as const })),
                  ...(shot.customReferenceUrls || []).map((url, i) => ({ id: `custom-${i}`, url, label: "Референс", source: "custom" as const })),
                ]
            // Apply user-defined order if exists
            const allRefs = refOrder
              ? [...rawRefs].sort((a, b) => {
                  const ai = refOrder.indexOf(a.id)
                  const bi = refOrder.indexOf(b.id)
                  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
                })
              : rawRefs
            return (
              <div className={`absolute inset-x-0 bottom-0 transition-opacity duration-300 ${showUI ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                <div className="group/prompt bg-gradient-to-t from-black/70 via-black/30 to-transparent px-8 pb-5 pt-12">

                  {/* ── Inline Reference Strip ── */}
                  <div className="mb-2 flex items-end gap-1" onClick={(e) => e.stopPropagation()}>
                    {allRefs.map((ref, i) => {
                      const isDisabled = disabledRefs.has(ref.id)
                      const isExpanded = expandedRefIdx === i
                      const isDragged = refDragIdx === i
                      const isDragTarget = refDragOverIdx === i && refDragIdx !== i
                      const sz = isExpanded ? 80 : 28
                      const ease = "all 0.25s cubic-bezier(0.22,1,0.36,1)"

                      return (
                        <div
                          key={ref.id}
                          draggable
                          onDragStart={(e) => {
                            setRefDragIdx(i)
                            e.dataTransfer.setData("application/x-ref-reorder", String(i))
                            e.dataTransfer.effectAllowed = "move"
                          }}
                          onDragOver={(e) => {
                            if (!e.dataTransfer.types.includes("application/x-ref-reorder")) return
                            e.preventDefault()
                            e.dataTransfer.dropEffect = "move"
                            if (refDragOverIdx !== i) setRefDragOverIdx(i)
                          }}
                          onDragLeave={() => { if (refDragOverIdx === i) setRefDragOverIdx(null) }}
                          onDrop={(e) => {
                            e.preventDefault()
                            setRefDragOverIdx(null)
                            setRefDragIdx(null)
                            const from = Number(e.dataTransfer.getData("application/x-ref-reorder"))
                            if (Number.isNaN(from) || from === i) return
                            const ids = allRefs.map((r) => r.id)
                            const [moved] = ids.splice(from, 1)
                            ids.splice(i, 0, moved)
                            setRefOrder(ids)
                            if (expandedRefIdx === from) setExpandedRefIdx(i)
                          }}
                          onDragEnd={() => { setRefDragIdx(null); setRefDragOverIdx(null) }}
                          className="relative flex flex-col items-center cursor-grab active:cursor-grabbing"
                          style={{ transition: ease, opacity: isDragged ? 0.3 : 1, transform: isDragTarget ? "scale(1.12)" : undefined }}
                        >
                          {/* Card */}
                          <div
                            onClick={() => setExpandedRefIdx(isExpanded ? null : i)}
                            className={`group/thumb relative shrink-0 overflow-hidden rounded-lg border shadow-sm select-none ${
                              isExpanded ? "border-[#D4A853] shadow-[#D4A853]/20 shadow-lg"
                              : isDragTarget ? "border-[#D4A853]/50"
                              : ref.source === "custom" ? "border-[#D4A853]/25" : "border-white/15"
                            } ${isDisabled ? "opacity-30 grayscale" : ""}`}
                            style={{ width: sz, height: sz, transition: ease }}
                          >
                            {ref.url ? (
                              <img src={ref.url} alt={ref.label} className="h-full w-full object-cover pointer-events-none" draggable={false} />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-white/5">
                                <span className={`font-medium text-white/40 leading-tight truncate px-0.5 ${isExpanded ? "text-[10px]" : "text-[7px]"}`}>
                                  {isExpanded ? ref.label.slice(0, 14) : ref.label.slice(0, 3)}
                                </span>
                              </div>
                            )}

                            {/* Controls — visible on expanded */}
                            {isExpanded && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setDisabledRefs((prev) => { const n = new Set(prev); n.has(ref.id) ? n.delete(ref.id) : n.add(ref.id); return n }) }}
                                  className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full backdrop-blur-sm ${isDisabled ? "bg-red-500/40 text-white" : "bg-black/50 text-white/60 hover:bg-black/70 hover:text-white"}`}
                                  title={isDisabled ? "Включить" : "Выключить"}
                                >
                                  <X size={10} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (ref.source === "custom") {
                                      updateShot(shotId, { customReferenceUrls: (shot.customReferenceUrls || []).filter((u) => u !== ref.url) })
                                      setExpandedRefIdx(null)
                                    } else {
                                      setRefPickerOpen(true)
                                      setExpandedRefIdx(null)
                                    }
                                  }}
                                  className={`absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full backdrop-blur-sm ${
                                    ref.source === "custom" ? "bg-red-500/30 text-white/70 hover:bg-red-500/50" : "bg-black/50 text-white/60 hover:bg-black/70 hover:text-white"
                                  }`}
                                  title={ref.source === "custom" ? "Удалить" : "Редактировать"}
                                >
                                  {ref.source === "custom" ? <Eraser size={9} /> : <Pencil size={9} />}
                                </button>
                              </>
                            )}

                            {/* Tooltip — collapsed only */}
                            {!isExpanded && (
                              <div className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[8px] text-white/60 opacity-0 transition-opacity group-hover/thumb:opacity-100">
                                {ref.label}
                              </div>
                            )}
                          </div>

                          {/* Label under expanded */}
                          {isExpanded && (
                            <span className="mt-1 max-w-[80px] truncate text-center text-[8px] text-white/50">{ref.label}</span>
                          )}
                        </div>
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => setRefPickerOpen(true)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/15 text-white/25 hover:border-white/30 hover:text-white/40"
                      title="Добавить референс"
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  {/* Prompt text — click to edit */}
                  {promptEditing && !dualMode ? (
                    <div className="space-y-2">
                      {/* ── Single column ── */}
                      <div className="relative">
                        <textarea
                          autoFocus
                          rows={3}
                          value={promptDraft}
                          onChange={(e) => setPromptDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); void handleGenerate() }
                            if (e.key === "Enter" && !e.shiftKey && promptDraft.includes("??")) {
                              e.preventDefault()
                              void handleAIRewrite()
                            }
                            if (e.key === "Escape") { setPromptEditing(false); setPromptDraft(shot.imagePrompt || "") }
                          }}
                          className={`w-full resize-none rounded-lg border bg-black/40 px-3 py-2 font-[system-ui] text-[12px] leading-[1.6] outline-none backdrop-blur-xl placeholder:text-white/20 ${
                            promptDraft.includes("??")
                              ? "border-[#D4A853]/30 italic text-[#E8D7B2]"
                              : "border-white/15 text-white"
                          }`}
                          placeholder="Опиши кадр... или ?? для AI"
                        />
                        {promptDraft.includes("??") && (
                          <div className="absolute right-2 top-2 flex items-center gap-1.5 rounded-full bg-[#D4A853]/10 px-2 py-0.5">
                            {aiRewriting
                              ? <Loader2 size={8} className="animate-spin text-[#D4A853]" />
                              : <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#D4A853]" />
                            }
                            <span className="text-[8px] uppercase tracking-[0.12em] text-[#D4A853]/70">
                              {aiRewriting ? "Writing..." : "AI · Enter to build"}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleGenerate()}
                          disabled={generating}
                          className="flex items-center gap-1.5 rounded-lg bg-[#D4A853]/15 px-3 py-1.5 text-[11px] text-[#D4A853] transition-colors hover:bg-[#D4A853]/25 disabled:opacity-40"
                        >
                          {generating ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                          Generate
                        </button>
                        {/* Model selector */}
                        <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-black/30 px-1 py-0.5">
                          {IMAGE_GEN_MODELS.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setSelectedImageGenModel(m.id)}
                              className={`rounded px-1.5 py-1 text-[9px] transition-colors ${selectedModel === m.id ? "bg-[#D4A853]/20 text-[#D4A853]" : "text-white/25 hover:text-white/50"}`}
                              title={m.label}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                        {/* Batch count */}
                        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 px-1.5 py-1">
                          {[1, 2, 3, 4].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setBatchCount(n)}
                              className={`flex h-5 w-5 items-center justify-center rounded text-[10px] transition-colors ${batchCount === n ? "bg-[#D4A853]/20 text-[#D4A853]" : "text-white/30 hover:text-white/60"}`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                        {/* Prompt checker */}
                        <button
                          type="button"
                          onClick={() => {
                            const { censorPrompt } = require("@/lib/cinematic/promptCensor") as typeof import("@/lib/cinematic/promptCensor")
                            const fullPrompt = standalone
                              ? (promptDraft || shot.imagePrompt || "")
                              : buildImagePrompt({ ...shot, imagePrompt: promptDraft || shot.imagePrompt || "" }, characters, locations, projectStyle, bibleProps)
                            const result = censorPrompt(fullPrompt, shot, standalone ? [] : characters, standalone ? [] : locations)
                            setCensorIssues(result.issues)
                            setCensorOpen(true)
                            if (result.optimizedPrompt && result.optimizedPrompt !== (promptDraft || shot.imagePrompt)) {
                              setPromptDraft(result.optimizedPrompt)
                            }
                          }}
                          className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[9px] transition-colors ${censorOpen && censorIssues.length > 0 ? "border-amber-500/30 text-amber-400/70" : "border-white/10 text-white/30 hover:text-white/50"}`}
                        >
                          {censorIssues.some((i) => i.severity === "error") ? "⚠" : "✓"} Check
                        </button>
                        {/* Dual mode toggle */}
                        <button
                          type="button"
                          onClick={() => {
                            setDualMode(true)
                            const currentPrompt = promptDraft || shot.imagePrompt || ""
                            if (currentPrompt && /[a-zA-Z]/.test(currentPrompt)) {
                              setRuDraft("")
                              setTranslating(true)
                              setTranslateDirection("en2ru")
                              void fastTranslate(currentPrompt, "en", "ru").then((result) => {
                                if (result) setRuDraft(result)
                                setTranslating(false)
                                setTranslateDirection(null)
                              })
                            } else {
                              setRuDraft(currentPrompt)
                              setPromptDraft("")
                            }
                          }}
                          className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[9px] text-white/30 transition-colors hover:text-white/50"
                        >
                          RU↔EN
                        </button>
                        <button
                          type="button"
                          onClick={() => { setPromptEditing(false); setDualMode(false); setPromptDraft(shot.imagePrompt || "") }}
                          className="ml-auto text-[10px] text-white/30 transition-colors hover:text-white/60"
                        >
                          Cancel
                        </button>
                      </div>
                      {/* Censor issues */}
                      {censorOpen && censorIssues.length > 0 && (
                        <div className="mb-1 space-y-1">
                          {censorIssues.map((issue, i) => (
                            <div key={i} className={`flex items-start gap-1.5 rounded-md px-2 py-1 text-[10px] ${
                              issue.severity === "error" ? "bg-red-500/10 text-red-300/80" :
                              issue.severity === "warning" ? "bg-amber-500/10 text-amber-300/80" :
                              "bg-sky-500/10 text-sky-300/70"
                            }`}>
                              <span className="mt-0.5 shrink-0">{issue.severity === "error" ? "✕" : issue.severity === "warning" ? "⚠" : "ℹ"}</span>
                              <div>
                                <span>{issue.message}</span>
                                {issue.suggestion && <span className="ml-1 text-white/30">→ {issue.suggestion}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {censorOpen && censorIssues.length === 0 && (
                        <div className="mb-1 flex items-center justify-between rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300/80">
                          <span>✓ Промпт чистый, проблем не найдено</span>
                          <button type="button" onClick={() => setCensorOpen(false)} className="text-emerald-300/50 hover:text-emerald-300">OK</button>
                        </div>
                      )}
                      {censorOpen && censorIssues.length > 0 && (
                        <button type="button" onClick={() => setCensorOpen(false)} className="mb-1 rounded-md bg-white/5 px-3 py-1 text-[9px] text-white/40 transition-colors hover:bg-white/10 hover:text-white/60">OK</button>
                      )}
                      <p className="text-[9px] text-white/15">??инструкция = с нуля · промпт ??доработай = редактирование · Shift+Enter = генерация</p>
                    </div>
                  ) : (
                    <div className="relative">
                      <p
                        onClick={() => { setPromptEditing(true); setPromptDraft(shot.imagePrompt || "") }}
                        className="cursor-text font-[system-ui] text-[12px] leading-[1.6] tracking-wide text-white/25 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition-colors duration-300 group-hover/prompt:text-white/85"
                      >
                        {highlightPrompt(shot.imagePrompt || "Click to write prompt...")}
                      </p>
                      <div className="absolute -right-1 -top-7 flex items-center gap-1 rounded-lg border border-white/10 bg-black/60 px-1.5 py-1 opacity-0 backdrop-blur-sm transition-opacity group-hover/prompt:opacity-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            const textToCopy = standalone
                              ? (shot.imagePrompt || "")
                              : buildImagePrompt(shot, characters, locations, projectStyle, bibleProps)
                            void navigator.clipboard.writeText(textToCopy)
                            const btn = e.currentTarget
                            btn.classList.add("!bg-[#D4A853]/20", "!text-[#D4A853]", "scale-95")
                            setTimeout(() => btn.classList.remove("!bg-[#D4A853]/20", "!text-[#D4A853]", "scale-95"), 400)
                          }}
                          className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[9px] text-white/60 transition-all duration-150 hover:bg-white/10 hover:text-white"
                          title="Copy full prompt"
                        >
                          <Copy size={11} />
                          Copy
                        </button>
                        <button
                          type="button"
                          onClick={() => { setPromptEditing(true); setPromptDraft(shot.imagePrompt || "") }}
                          className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[9px] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                          title="Edit prompt"
                        >
                          <Pencil size={11} />
                          Edit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      ) : (
        <div className="flex h-64 w-96 items-center justify-center rounded-xl border border-white/10 bg-white/3 text-white/20">
          No image
        </div>
      )}

      {/* ── Top: History strip — macOS Dock magnification ── */}
      {history.length >= 1 && (
        <DockStrip
          className={panelClass("absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-2xl border border-white/10 bg-black/70 px-2.5 py-2 backdrop-blur-xl")}
          history={history}
          historyIdx={historyIdx}
          sourceLabel={sourceLabel}
          onSelect={(i) => updateShot(shotId, { thumbnailUrl: history[i].url, activeHistoryIndex: i })}
        />
      )}

      {/* ── Bottom: Player bar / Color Match bar ── */}
      {!standalone && shotsWithImages.length > 1 && (
        <div className={panelClass("absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-xl")}>
          {colorMatchOpen ? (
            <>
              {/* Color match mode: neighbor thumbnails */}
              {colorNeighbors.map((n) => {
                const isCurrent = n.offset === 0
                return (
                  <button
                    key={n.offset}
                    type="button"
                    disabled={colorMatchApplying || !n.shot.thumbnailUrl || isCurrent}
                    onClick={() => n.shot.thumbnailUrl && void handleColorTransfer(n.shot.thumbnailUrl)}
                    className="group/cm relative flex-shrink-0 disabled:opacity-30"
                  >
                    <div className={`relative h-10 w-14 overflow-hidden rounded-lg border transition-all ${
                      isCurrent ? "border-[#D4A853]/50" : "border-white/10 group-hover/cm:border-[#D4A853]/40 group-hover/cm:shadow-md group-hover/cm:shadow-[#D4A853]/10"
                    }`}>
                      {n.shot.thumbnailUrl ? (
                        <img src={n.shot.thumbnailUrl} alt="" className="h-full w-full object-cover" draggable={false} />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-white/5 text-[8px] text-white/20">—</div>
                      )}
                      {/* Palette overlay on hover */}
                      {!isCurrent && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/cm:bg-black/40">
                          <Palette size={14} className="text-[#D4A853] opacity-0 transition-opacity group-hover/cm:opacity-100" />
                        </div>
                      )}
                      {colorMatchApplying && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <Loader2 size={12} className="animate-spin text-[#D4A853]" />
                        </div>
                      )}
                    </div>
                    <span className={`mt-0.5 block text-center text-[8px] tabular-nums ${isCurrent ? "text-[#D4A853]/60" : "text-white/30 group-hover/cm:text-white/60"}`}>{n.label}</span>
                  </button>
                )
              })}
              <div className="mx-1 h-8 w-px bg-white/10" />
              {/* Strength slider */}
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(colorMatchStrength * 100)}
                  onChange={(e) => setColorMatchStrength(Number(e.target.value) / 100)}
                  className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/10 accent-[#D4A853] [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#D4A853]"
                />
                <span className="w-6 text-right text-[8px] tabular-nums text-white/35">{Math.round(colorMatchStrength * 100)}%</span>
              </div>
              <div className="mx-1 h-8 w-px bg-white/10" />
              <button type="button" onClick={() => setColorMatchOpen(false)} className="text-[9px] text-white/40 hover:text-white/70">
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={goPrev} disabled={!hasPrev || playing} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-25">
                <SkipBack size={14} />
              </button>
              <button
                type="button"
                onClick={() => { if (playing) stopPlayback(); else startPlayback() }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#D4A853]/15 text-[#D4A853] transition-colors hover:bg-[#D4A853]/25"
              >
                {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
              </button>
              <button type="button" onClick={goNext} disabled={!hasNext || playing} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-25">
                <SkipForward size={14} />
              </button>
              <div className="mx-1 h-4 w-px bg-white/10" />
              <span className="text-[10px] font-medium tabular-nums text-white/50">{shotLabelText}</span>
              <span className="text-[10px] tabular-nums text-white/30">{currentIdx + 1}/{shotsWithImages.length}</span>
              <div className="mx-1 h-4 w-px bg-white/10" />
              <span className="font-mono text-[11px] tabular-nums text-white/40">{fmtTimecode(liveMs)}</span>
              <span className="font-mono text-[9px] tabular-nums text-white/20">/ {fmtTimecode(tcTotalMs)}</span>
            </>
          )}
        </div>
      )}

      {/* ── Right: Tools menu ── */}
      {toolsOpen && (
        <div className={`absolute right-16 top-1/2 z-50 flex -translate-y-1/2 flex-col gap-0.5 rounded-xl border border-white/10 bg-black/70 p-1.5 backdrop-blur-xl transition-opacity duration-300 ${showUI ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          {[
            { icon: <MousePointer2 size={14} />, label: samMode ? "Exit Select" : "Select Object", action: () => { setToolsOpen(false); samMode ? cancelSAM() : void activateSAM() }, active: samMode },
            { icon: <Pencil size={14} />, label: "Smart Edit", action: () => { setToolsOpen(false); previewSrc && setEditOpen(true) } },
            { icon: <Copy size={14} />, label: "Copy", action: () => { setToolsOpen(false); void handleCopy() } },
            { icon: <Download size={14} />, label: "Download", action: () => { setToolsOpen(false); handleDownload() } },
            { icon: <FlipHorizontal2 size={14} />, label: "Flip H", action: () => enterEditMode("flipH"), active: xFlipH },
            { icon: <FlipVertical2 size={14} />, label: "Flip V", action: () => enterEditMode("flipV"), active: xFlipV },
            { icon: <RotateCcw size={14} />, label: "Rotate ←", action: () => enterEditMode("rotateCCW") },
            { icon: <RotateCw size={14} />, label: "Rotate →", action: () => enterEditMode("rotateCW") },
            { icon: <Palette size={14} />, label: "Color Match", action: () => { setToolsOpen(false); setColorMatchOpen(!colorMatchOpen) }, active: colorMatchOpen, disabled: colorNeighbors.length === 0 },
          ].map((tool) => (
            <button
              key={tool.label}
              type="button"
              onClick={tool.action}
              disabled={"disabled" in tool && !!tool.disabled}
              className={`flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[11px] transition-colors ${"active" in tool && tool.active ? "bg-[#D4A853]/15 text-[#D4A853]" : "text-white/60 hover:bg-white/10 hover:text-white"} disabled:opacity-25 disabled:pointer-events-none`}
            >
              {tool.icon}
              {tool.label}
            </button>
          ))}
          {/* Save + Rotate — appears when transform is active */}
          {editMode && (
            <>
              <div className="mx-1 my-0.5 h-px bg-white/10" />
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => enterEditMode("rotateCCW")} disabled={xRotate === 0 && !xFlipH && !xFlipV} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:pointer-events-none" title="Rotate ←">
                  <RotateCcw size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => void saveTransform()}
                  disabled={!hasTransform}
                  className="flex h-8 flex-1 items-center justify-center rounded-lg bg-[#D4A853]/20 text-[11px] font-medium text-[#D4A853] transition-colors hover:bg-[#D4A853]/30 disabled:opacity-30"
                >
                  Save
                </button>
                <button type="button" onClick={() => enterEditMode("rotateCW")} disabled={xRotate === 270} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:pointer-events-none" title="Rotate →">
                  <RotateCw size={14} />
                </button>
              </div>
              <button
                type="button"
                onClick={cancelEditMode}
                className="flex h-8 items-center justify-center rounded-lg text-[11px] text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Right: Inspector toggle ── */}
      {!standalone && inspectorOpen && shot && (
        <div className={panelClass("absolute right-4 top-1/2 z-50 w-72 -translate-y-1/2 rounded-xl border border-white/10 bg-black/70 p-4 backdrop-blur-xl")}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-[0.18em] text-[#D4A853]/60">Inspector</span>
            <button type="button" onClick={() => setInspectorOpen(false)} className="text-white/30 hover:text-white"><X size={12} /></button>
          </div>

          <div className="space-y-3 text-[11px]">
            <div>
              <p className="text-[8px] uppercase tracking-[0.14em] text-white/25">Shot</p>
              <p className="text-white/70">{shotLabelText} · {shot.shotSize || "WIDE"} · {shot.cameraMotion || "Static"} · {(shot.duration / 1000).toFixed(1)}s</p>
            </div>

            <div>
              <p className="text-[8px] uppercase tracking-[0.14em] text-white/25">Caption</p>
              <p className="text-white/50">{shot.caption || "—"}</p>
            </div>

            {shot.directorNote && (
              <div>
                <p className="text-[8px] uppercase tracking-[0.14em] text-white/25">Director</p>
                <p className="text-white/50">{shot.directorNote}</p>
              </div>
            )}

            {shot.cameraNote && (
              <div>
                <p className="text-[8px] uppercase tracking-[0.14em] text-white/25">Camera</p>
                <p className="text-white/50">{shot.cameraNote}</p>
              </div>
            )}

            {shotChars.length > 0 && (
              <div>
                <p className="text-[8px] uppercase tracking-[0.14em] text-white/25">Characters</p>
                <p className="text-white/50">{shotChars.map((c) => c.name).join(", ")}</p>
              </div>
            )}

            {shotLocs.length > 0 && (
              <div>
                <p className="text-[8px] uppercase tracking-[0.14em] text-white/25">Location</p>
                <p className="text-white/50">{shotLocs.map((l) => l.name).join(", ")}</p>
              </div>
            )}

            {shotProps.length > 0 && (
              <div>
                <p className="text-[8px] uppercase tracking-[0.14em] text-white/25">Props</p>
                <p className="text-white/50">{shotProps.map((p) => p.name).join(", ")}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Top-right: Controls ── */}
      <div className={`absolute right-4 top-4 z-50 flex items-center gap-1 transition-opacity duration-300 ${showUI ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <button
          type="button"
          onClick={() => setToolsOpen((v) => !v)}
          className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${toolsOpen ? "border-[#D4A853]/30 bg-[#D4A853]/15 text-[#D4A853]" : "border-white/10 bg-black/50 text-white/50 hover:bg-white/10 hover:text-white"}`}
          title="Tools (T)"
        >
          <Settings size={16} />
        </button>
        {!standalone && (
          <button
            type="button"
            onClick={() => setInspectorOpen((v) => !v)}
            className={`flex h-9 items-center gap-1 rounded-lg border px-2.5 text-[10px] uppercase tracking-[0.1em] transition-colors ${inspectorOpen ? "border-[#D4A853]/30 bg-[#D4A853]/15 text-[#D4A853]" : "border-white/10 bg-black/50 text-white/50 hover:bg-white/10 hover:text-white"}`}
            title="Inspector (I)"
          >
            i
          </button>
        )}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/50 backdrop-blur-sm transition-colors hover:bg-white/10 hover:text-white"
          title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen (⌘F)"}
        >
          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
        <button
          type="button"
          onClick={() => { if (isFullscreen) document.exitFullscreen().catch(() => {}); void flushAndClose() }}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/50 backdrop-blur-sm transition-colors hover:bg-red-500/20 hover:text-red-400"
          title="Close"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── SAM status bar ── */}
      {samMode && samStatus !== "ready" && (
        <div className="absolute bottom-16 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-[#D4A853]/20 bg-black/70 px-3 py-2 backdrop-blur-xl">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#D4A853]" />
          <span className="text-[11px] text-white/50">
            {samStatus === "loading-models" ? "Loading SAM model..." : "Analyzing image..."}
          </span>
        </div>
      )}

      {samMode && samStatus === "ready" && !samPopup && (
        <div className="absolute bottom-16 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-xl">
          <span className="text-[11px] text-white/40">Click on any object to select it</span>
        </div>
      )}

      {/* ── SAM context popup ── */}
      {samPopup && (
        <div
          className="absolute bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/10 bg-black/50 px-3 py-2 shadow-2xl backdrop-blur-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {samObjectName && (
            <span className="shrink-0 text-[11px] text-white/35">{samObjectName}</span>
          )}
          <input
            autoFocus
            value={samReplaceText}
            onChange={(e) => setSamReplaceText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && samReplaceText.trim()) {
                void handleSAMAction("edit", samReplaceText.trim())
                setSamReplaceText("")
              }
              if (e.key === "Escape") { cancelSAM(); setSamReplaceText("") }
            }}
            className="w-64 bg-transparent text-[13px] text-white outline-none placeholder:text-white/20"
            placeholder="Что сделать..."
          />
          <button
            type="button"
            onClick={() => { if (samReplaceText.trim()) { void handleSAMAction("edit", samReplaceText.trim()); setSamReplaceText("") } }}
            disabled={!samReplaceText.trim()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D4A853]/15 text-[#D4A853] transition-colors hover:bg-[#D4A853]/25 disabled:opacity-25"
          >
            <Wand2 size={12} />
          </button>
          <button
            type="button"
            onClick={() => void handleSAMAction("remove")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-red-400/60 transition-colors hover:bg-red-500/15 hover:text-red-400"
            title="Удалить"
          >
            <Eraser size={12} />
          </button>
          <button
            type="button"
            onClick={() => { cancelSAM(); setSamReplaceText("") }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/25 transition-colors hover:bg-white/8 hover:text-white/50"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* ── Scene Bible Panel ── */}
      {!standalone && refPickerOpen && shot?.sceneId && currentScene && (
        <SceneBibleBubble
          sceneId={shot.sceneId}
          sceneIndex={currentSceneIndex}
          sceneTitle={currentScene.title || ""}
          sceneBlockIds={currentSceneBlockIds}
          characters={characters}
          locations={locations}
          props={bibleProps}
          blocks={scriptBlocks.map((b) => ({ id: b.id, type: b.type, text: b.text }))}
          onClose={() => setRefPickerOpen(false)}
        />
      )}

      {/* ── Delete confirmation ── */}
      {deleteConfirm && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(false) }}>
          <div className="rounded-2xl border border-white/10 bg-[#1A1916] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-[14px] font-medium text-white">Удалить фото?</p>
            <p className="mb-4 text-[12px] text-white/40">{shotLabelText} — фото будет удалено</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(false)}
                className="rounded-lg border border-white/10 px-4 py-2 text-[12px] text-white/60 transition-colors hover:bg-white/5"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirm(false)
                  updateShot(shotId, { thumbnailUrl: null, thumbnailBlobKey: null, generationHistory: [], activeHistoryIndex: null })
                }}
                className="rounded-lg bg-red-500/20 px-4 py-2 text-[12px] text-red-400 transition-colors hover:bg-red-500/30"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fullscreen Dual Column Prompt Checker ── */}
      {dualMode && (
        <div
          className="absolute inset-0 z-[80] flex flex-col bg-black/95 backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-6 py-3">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#D4A853]/70">Prompt Checker</span>
              <span className="text-[10px] text-white/25">{shotLabelText}</span>
              {translating && (
                <span className="flex items-center gap-1.5 text-[10px] text-white/30">
                  <Loader2 size={10} className="animate-spin text-[#D4A853]/50" />
                  {translateDirection === "ru2en" ? "RU → EN..." : "EN → RU..."}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Batch count */}
              <div className="flex items-center gap-1 rounded-lg border border-white/8 bg-white/3 px-1.5 py-1">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setBatchCount(n)}
                    className={`flex h-5 w-5 items-center justify-center rounded text-[10px] transition-colors ${batchCount === n ? "bg-[#D4A853]/20 text-[#D4A853]" : "text-white/25 hover:text-white/50"}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {/* Model selector */}
              <div className="flex items-center gap-0.5 rounded-lg border border-white/8 bg-white/3 px-1 py-0.5">
                {IMAGE_GEN_MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedImageGenModel(m.id)}
                    className={`rounded px-2 py-1 text-[10px] transition-colors ${selectedModel === m.id ? "bg-[#D4A853]/20 text-[#D4A853]" : "text-white/25 hover:text-white/50"}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={generating}
                className="flex items-center gap-1.5 rounded-lg bg-[#D4A853]/15 px-4 py-2 text-[12px] font-medium text-[#D4A853] transition-colors hover:bg-[#D4A853]/25 disabled:opacity-40"
              >
                {generating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                Generate
              </button>
              <button
                type="button"
                onClick={() => { setDualMode(false); setPromptEditing(false) }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/5 hover:text-white/60"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Two columns */}
          <div className="flex flex-1 gap-0 overflow-hidden">
            {/* ── Left: RU ── */}
            <div className="flex flex-1 flex-col border-r border-white/6">
              <div className="flex shrink-0 items-center justify-between px-5 py-2.5">
                <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/20">RU</span>
                {translateDirection === "en2ru" && <Loader2 size={10} className="animate-spin text-[#D4A853]/40" />}
              </div>
              <div className="flex-1 overflow-y-auto px-5 pb-5">
                <textarea
                  autoFocus
                  value={ruDraft}
                  onChange={(e) => handleRuChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); void handleGenerate() }
                    if (e.key === "Escape") { setDualMode(false); setPromptEditing(false) }
                  }}
                  className="h-full min-h-[200px] w-full resize-none bg-transparent font-[system-ui] text-[14px] leading-[1.8] tracking-wide text-white/85 outline-none placeholder:text-white/15"
                  placeholder="Пиши промпт на русском..."
                />
              </div>
            </div>

            {/* ── Right: EN ── */}
            <div className="flex flex-1 flex-col">
              <div className="flex shrink-0 items-center justify-between px-5 py-2.5">
                <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/20">EN</span>
                {translateDirection === "ru2en" && <Loader2 size={10} className="animate-spin text-[#D4A853]/40" />}
              </div>
              <div className="flex-1 overflow-y-auto px-5 pb-5">
                <textarea
                  value={promptDraft}
                  onChange={(e) => handleEnChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); void handleGenerate() }
                    if (e.key === "Escape") { setDualMode(false); setPromptEditing(false) }
                  }}
                  className="h-full min-h-[200px] w-full resize-none bg-transparent font-[system-ui] text-[14px] leading-[1.8] tracking-wide text-white/85 outline-none placeholder:text-white/15"
                  placeholder="English prompt..."
                />
              </div>
            </div>
          </div>

          {/* Footer hint */}
          <div className="shrink-0 border-t border-white/6 px-6 py-2">
            <p className="text-[10px] text-white/15">Редактируй любую сторону — перевод обновится автоматически · Shift+Enter = генерация · Esc = закрыть</p>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="absolute bottom-20 left-1/2 z-[90] -translate-x-1/2" style={{ animation: "fadeInUp 0.2s ease-out" }}>
          <style>{`@keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#1A1B1F]/95 px-4 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            <span className="text-[12px] text-white/70">{toast}</span>
            <button
              type="button"
              onClick={() => { setToast(null); if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }}
              className="shrink-0 text-white/25 transition-colors hover:text-white/60"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}


      {/* ── Edit Overlay ── */}
      {editOpen && previewSrc && (
        <ImageEditOverlay
          imageUrl={previewSrc}
          model={selectedModel}
          onComplete={(blob) => void handleEditComplete(blob)}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  )
}
