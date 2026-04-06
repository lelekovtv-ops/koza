"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronDown,
  Download,
  ImageIcon,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { deleteBlob, saveBlob } from "@/lib/fileStorage"
import { type LibraryFile, useLibraryStore } from "@/store/library"
import { useProjectsStore } from "@/store/projects"
import { useBoardStore } from "@/store/board"
import { useTimelineStore } from "@/store/timeline"
import { ShotStudio } from "@/components/editor/ShotStudio"
import type { ImageGenModel } from "@/lib/pipeline/imageGenerator"

// ── Helpers ──

function uid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function detectType(file: File): LibraryFile["type"] {
  if (file.type.startsWith("image/")) return "image"
  if (file.type.startsWith("video/")) return "video"
  if (file.type.startsWith("audio/")) return "audio"
  return "other"
}

async function createThumbnail(file: File): Promise<string | undefined> {
  try {
    const bitmap = await createImageBitmap(file, { resizeWidth: 320, resizeQuality: "medium" })
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext("2d")
    if (!ctx) return undefined
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    return canvas.toDataURL("image/jpeg", 0.7)
  } catch {
    return undefined
  }
}

// ── Model config with ref limits ──

const MODELS: { id: string; label: string; maxRefs: number }[] = [
  { id: "nano-banana",     label: "Gemini Flash", maxRefs: 3 },
  { id: "nano-banana-2",   label: "Gemini 2",     maxRefs: 3 },
  { id: "nano-banana-pro", label: "Gemini Pro",   maxRefs: 3 },
  { id: "gpt-image",       label: "GPT Image",    maxRefs: 4 },
]

const MODEL_MAP = Object.fromEntries(MODELS.map((m) => [m.id, m]))

function getMaxRefs(modelId: string): number {
  return MODEL_MAP[modelId]?.maxRefs ?? 3
}

type ViewMode = "all" | "generated" | "uploaded"
const LIBRARY_SHOT_PREFIX = "__lib_"

// Convert image URL (blob:/object) to data URL for generation API
async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    if (url.startsWith("data:")) return url
    const res = await fetch(url)
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ── Main Page ──

export default function LibraryPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const refInputRef = useRef<HTMLInputElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const promptBarRef = useRef<HTMLDivElement>(null)
  const [dragCounter, setDragCounter] = useState(0)
  const [viewMode, setViewMode] = useState<ViewMode>("all")
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Prompt bar
  const [prompt, setPrompt] = useState("")
  const [generating, setGenerating] = useState(false)
  const [batchCount, setBatchCount] = useState(1)
  const [modelOpen, setModelOpen] = useState(false)
  // Ref images: stored as { url: display URL, dataUrl: base64 for API }
  const [refImages, setRefImages] = useState<Array<{ url: string; dataUrl: string }>>([])
  const [refDropHover, setRefDropHover] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  // ShotStudio overlay
  const [studioShotId, setStudioShotId] = useState<string | null>(null)
  const [studioLibFileId, setStudioLibFileId] = useState<string | null>(null)

  const projectId = useProjectsStore((s) => s.activeProjectId)
  const files = useLibraryStore((s) => s.files)
  const searchQuery = useLibraryStore((s) => s.searchQuery)
  const addFile = useLibraryStore((s) => s.addFile)
  const addFiles = useLibraryStore((s) => s.addFiles)
  const removeFile = useLibraryStore((s) => s.removeFile)
  const updateFile = useLibraryStore((s) => s.updateFile)
  const setSearchQuery = useLibraryStore((s) => s.setSearchQuery)

  const addShot = useTimelineStore((s) => s.addShot)
  const removeShot = useTimelineStore((s) => s.removeShot)

  const selectedModel = useBoardStore((s) => s.selectedImageGenModel) as ImageGenModel
  const setSelectedModel = useBoardStore((s) => s.setSelectedImageGenModel)
  const projectStyle = useBoardStore((s) => s.projectStyle)

  const isDragOver = dragCounter > 0
  const maxRefs = getMaxRefs(selectedModel)

  // Trim refs if model changes to one with lower limit
  useEffect(() => {
    setRefImages((prev) => prev.slice(0, maxRefs))
  }, [maxRefs])

  // Track fullscreen
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  // ── Upload ──

  const processFiles = useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return
      const now = Date.now()
      const pid = projectId ?? "global"
      const prepared = await Promise.all(
        incoming.map(async (file) => {
          const id = uid()
          const objectUrl = URL.createObjectURL(file)
          const type = detectType(file)
          const thumbnailUrl = type === "image" ? await createThumbnail(file) : undefined
          try { await saveBlob(id, file) } catch {}
          return {
            id, name: file.name, type, mimeType: file.type || "application/octet-stream",
            size: file.size, url: objectUrl, thumbnailUrl, createdAt: now, updatedAt: now,
            tags: [] as string[], projectId: pid, folder: "/", origin: "uploaded" as const,
          }
        })
      )
      addFiles(prepared)
    },
    [addFiles, projectId]
  )

  const handleDelete = async (file: LibraryFile) => {
    removeFile(file.id)
    if (file.url.startsWith("blob:")) URL.revokeObjectURL(file.url)
    try { await deleteBlob(file.id) } catch {}
  }

  // ── Add ref image (from file picker) ──

  const addRefFromFile = useCallback(async (fileList: FileList | null) => {
    if (!fileList) return
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith("image/")) continue
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setRefImages((prev) => {
            if (prev.length >= getMaxRefs(useBoardStore.getState().selectedImageGenModel)) return prev
            return [...prev, { url: reader.result as string, dataUrl: reader.result as string }]
          })
        }
      }
      reader.readAsDataURL(file)
    }
  }, [])

  // ── Add ref from library image (drag & drop or click) ──

  const addRefFromLibrary = useCallback(async (imageUrl: string) => {
    if (refImages.length >= maxRefs) return
    // Check for duplicates
    if (refImages.some((r) => r.url === imageUrl)) return
    const dataUrl = await urlToDataUrl(imageUrl)
    if (!dataUrl) return
    setRefImages((prev) => {
      if (prev.length >= maxRefs) return prev
      return [...prev, { url: imageUrl, dataUrl }]
    })
  }, [refImages, maxRefs])

  // ── Generate ──

  const handleGenerate = useCallback(async () => {
    const userPrompt = prompt.trim()
    if (!userPrompt || generating) return
    setGenerating(true)
    setGenError(null)

    const fullPrompt = projectStyle ? `Art style: ${projectStyle}.\n\n${userPrompt}` : userPrompt
    const pid = projectId ?? "global"
    const refDataUrls = refImages.map((r) => r.dataUrl)

    try {
      const apiUrl = selectedModel === "gpt-image" ? "/api/gpt-image" : "/api/nano-banana"

      const promises = Array.from({ length: batchCount }, async () => {
        const body = selectedModel === "gpt-image"
          ? { prompt: fullPrompt, referenceImages: refDataUrls.length > 0 ? refDataUrls : undefined }
          : { prompt: fullPrompt, model: selectedModel, referenceImages: refDataUrls.length > 0 ? refDataUrls : undefined }

        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const errBody = await res.text().catch(() => "")
          throw new Error(`${res.status}: ${errBody.slice(0, 300)}`)
        }
        return res.blob()
      })

      const results = await Promise.allSettled(promises)
      let hasError = false

      for (const result of results) {
        if (result.status === "rejected") {
          console.error("[Library] Generation failed:", result.reason)
          hasError = true
          continue
        }
        const blob = result.value
        const id = uid()
        const objectUrl = URL.createObjectURL(blob)
        try { await saveBlob(id, blob) } catch {}
        addFile({
          id, name: `gen_${Date.now()}.png`, type: "image", mimeType: "image/png",
          size: blob.size, url: objectUrl, thumbnailUrl: objectUrl,
          createdAt: Date.now(), updatedAt: Date.now(), tags: [],
          projectId: pid, folder: "/", origin: "generated",
          prompt: userPrompt, model: selectedModel, fullPrompt,
        })
      }
      if (hasError && results.every((r) => r.status === "rejected")) {
        const msg = (results[0] as PromiseRejectedResult).reason?.message || "Unknown error"
        setGenError(msg)
      }
    } catch (err) {
      console.error("[Library] Generation error:", err)
      setGenError(err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
    }
  }, [prompt, generating, selectedModel, batchCount, refImages, projectStyle, projectId, addFile])

  // ── Open ShotStudio ──

  const openStudio = useCallback((file: LibraryFile) => {
    const shotId = addShot({
      label: LIBRARY_SHOT_PREFIX + file.id,
      imagePrompt: file.prompt || "",
      thumbnailUrl: file.url || null,
      generationHistory: file.url
        ? [{ url: file.url, blobKey: null, timestamp: file.createdAt || Date.now(), source: "generate" as const }]
        : [],
      activeHistoryIndex: file.url ? 0 : null,
    })
    setStudioShotId(shotId)
    setStudioLibFileId(file.id)
  }, [addShot])

  const handleStudioClose = useCallback(() => {
    if (!studioShotId) return
    const shot = useTimelineStore.getState().shots.find((s) => s.id === studioShotId)
    const pid = projectId ?? "global"

    if (shot && shot.thumbnailUrl && studioLibFileId) {
      updateFile(studioLibFileId, {
        url: shot.thumbnailUrl,
        prompt: shot.imagePrompt || undefined,
        model: selectedModel,
      })
      const history = shot.generationHistory || []
      for (let i = 1; i < history.length; i++) {
        const entry = history[i]
        if (!entry.url || entry.source === "loading") continue
        addFile({
          id: uid(), name: `gen_${Date.now()}.png`, type: "image", mimeType: "image/png",
          size: 0, url: entry.url, thumbnailUrl: entry.url,
          createdAt: entry.timestamp, updatedAt: entry.timestamp, tags: [],
          projectId: pid, folder: "/", origin: "generated",
          prompt: shot.imagePrompt || undefined, model: selectedModel,
        })
      }
    }

    removeShot(studioShotId)
    setStudioShotId(null)
    setStudioLibFileId(null)
  }, [studioShotId, studioLibFileId, projectId, selectedModel, updateFile, addFile, removeShot])

  // ── Filter ──

  const filtered = useMemo(() => {
    let items = files.filter((f) => projectId ? f.projectId === projectId : true)
    if (viewMode === "generated") items = items.filter((f) => f.origin === "generated")
    else if (viewMode === "uploaded") items = items.filter((f) => f.origin === "uploaded")
    items = items.filter((f) => f.type === "image")
    const q = searchQuery.trim().toLowerCase()
    if (q) items = items.filter((f) => f.name.toLowerCase().includes(q) || f.prompt?.toLowerCase().includes(q))
    return items.sort((a, b) => b.createdAt - a.createdAt)
  }, [files, projectId, viewMode, searchQuery])

  const generatedCount = files.filter((f) => f.origin === "generated" && f.type === "image").length
  const uploadedCount = files.filter((f) => f.origin === "uploaded" && f.type === "image").length

  const downloadImage = (file: LibraryFile) => {
    const a = document.createElement("a")
    a.href = file.url
    a.download = file.name
    a.click()
  }

  const showPromptBar = !isFullscreen
  const isViewing = !!studioShotId
  const [barHovered, setBarHovered] = useState(false)

  // ── Prompt bar drop handler ──

  const handlePromptBarDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setRefDropHover(false)
    const libUrl = e.dataTransfer.getData("application/x-library-ref")
    if (libUrl) {
      void addRefFromLibrary(libUrl)
    }
  }, [addRefFromLibrary])

  // Ref slot count
  const emptySlots = maxRefs - refImages.length

  return (
    <div
      className="relative flex h-full flex-col bg-[#0A0A09] text-white"
      onDragEnter={(e) => { e.preventDefault(); if (e.dataTransfer.types.includes("Files")) setDragCounter((v) => v + 1) }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy" }}
      onDragLeave={(e) => { e.preventDefault(); if (e.dataTransfer.types.includes("Files")) setDragCounter((v) => Math.max(0, v - 1)) }}
      onDrop={(e) => { e.preventDefault(); setDragCounter(0); if (e.dataTransfer.files.length > 0) void processFiles(Array.from(e.dataTransfer.files)) }}
    >
      {/* ── Gallery ── */}
      <div className="relative flex-1 overflow-y-auto pb-32">
        {/* Mini top bar */}
        <div className="sticky top-0 z-30 flex items-center gap-2 bg-[#0A0A09]/80 px-3 py-2 backdrop-blur-md">
          <div className="flex items-center gap-0.5">
            {([
              ["all", "All", filtered.length],
              ["generated", "Generated", generatedCount],
              ["uploaded", "Uploaded", uploadedCount],
            ] as const).map(([mode, label, count]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode as ViewMode)}
                className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  viewMode === mode ? "bg-white/8 text-white/70" : "text-white/25 hover:text-white/45"
                }`}
              >
                {label} <span className="tabular-nums text-white/15">{count}</span>
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1.5 h-3 w-3 text-white/15" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-[160px] rounded-md border border-white/6 bg-white/3 py-1 pl-6 pr-2 text-[10px] text-white/60 outline-none placeholder:text-white/15 focus:border-white/12"
            />
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            className="rounded-md p-1.5 text-white/20 transition-colors hover:bg-white/5 hover:text-white/50"
            title="Upload"
          >
            <Upload size={12} />
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={(e) => { void processFiles(Array.from(e.target.files ?? [])); e.target.value = "" }}
          className="hidden"
        />

        {filtered.length === 0 ? (
          <div className="flex h-[calc(100%-48px)] items-center justify-center">
            <div className="text-center">
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-white/6" />
              <p className="text-[13px] text-white/20">
                {viewMode === "generated" ? "No generations yet" : "Library is empty"}
              </p>
              <p className="mt-1 text-[11px] text-white/10">Type a prompt below to generate</p>
            </div>
          </div>
        ) : (
          <div className="columns-[240px] gap-1 px-1 pb-1">
            {filtered.map((file) => (
              <div
                key={file.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-library-ref", file.url)
                  e.dataTransfer.effectAllowed = "copy"
                  // Custom ghost
                  const ghost = document.createElement("div")
                  ghost.style.cssText = "width:60px;height:60px;border-radius:8px;overflow:hidden;position:absolute;top:-999px;"
                  const img = document.createElement("img")
                  img.src = file.thumbnailUrl || file.url
                  img.style.cssText = "width:100%;height:100%;object-fit:cover;"
                  ghost.appendChild(img)
                  document.body.appendChild(ghost)
                  e.dataTransfer.setDragImage(ghost, 30, 30)
                  requestAnimationFrame(() => document.body.removeChild(ghost))
                }}
                className="group relative mb-1 cursor-pointer break-inside-avoid overflow-hidden"
                onClick={() => openStudio(file)}
              >
                {file.url ? (
                  <img
                    src={file.thumbnailUrl || file.url}
                    alt=""
                    className="block w-full transition-opacity duration-200 group-hover:opacity-80"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-white/2">
                    <ImageIcon className="h-8 w-8 text-white/10" />
                  </div>
                )}
                {/* Hover actions */}
                <div className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); downloadImage(file) }}
                      className="rounded bg-black/60 p-1.5 text-white/70 backdrop-blur-sm hover:bg-black/80 hover:text-white"
                    >
                      <Download size={11} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleDelete(file) }}
                      className="rounded bg-black/60 p-1.5 text-white/70 backdrop-blur-sm hover:bg-red-900/80 hover:text-red-300"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Drag overlay — only for external file drops, no blur */}
        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 z-40">
            <div className="absolute inset-x-0 top-0 h-1 bg-[#D4A853]/40" />
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════
          ── Floating Prompt Bar ──
          ════════════════════════════════════════════ */}
      {showPromptBar && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[190] pointer-events-none"
          onMouseEnter={() => setBarHovered(true)}
          onMouseLeave={() => setBarHovered(false)}
        >
          <div
            ref={promptBarRef}
            className="pointer-events-auto mx-auto max-w-[760px] px-4 pb-4"
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("application/x-library-ref")) {
                e.preventDefault()
                e.dataTransfer.dropEffect = "copy"
                setRefDropHover(true)
              }
            }}
            onDragLeave={() => setRefDropHover(false)}
            onDrop={handlePromptBarDrop}
          >
            {/* collapsed = viewing photo & not hovered */}
            {(() => {
              const collapsed = isViewing && !barHovered
              return (
                <div
                  className={`rounded-2xl border backdrop-blur-xl ${
                    refDropHover ? "border-[#D4A853]/40" : "border-white/8"
                  } ${collapsed
                    ? "bg-[#141310]/60 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]"
                    : "bg-[#141310]/90 shadow-[0_-8px_40px_rgba(0,0,0,0.6)]"
                  }`}
                  style={{
                    maxHeight: collapsed ? 52 : 400,
                    opacity: collapsed ? 0.45 : 1,
                    transition: collapsed
                      ? "max-height 350ms cubic-bezier(0.32, 0, 0.67, 0), opacity 200ms cubic-bezier(0.32, 0, 0.67, 0), box-shadow 300ms ease, background-color 300ms ease"
                      : "max-height 550ms cubic-bezier(0.22, 1, 0.36, 1), opacity 350ms cubic-bezier(0.22, 1, 0.36, 1) 50ms, box-shadow 400ms ease, background-color 400ms ease",
                  }}
                >
                  {/* ── Reference slots (hidden when collapsed) ── */}
                  <div
                    style={{
                      maxHeight: collapsed ? 0 : 200,
                      opacity: collapsed ? 0 : 1,
                      overflow: "hidden",
                      transition: collapsed
                        ? "max-height 280ms cubic-bezier(0.32, 0, 0.67, 0), opacity 150ms cubic-bezier(0.32, 0, 0.67, 0)"
                        : "max-height 550ms cubic-bezier(0.22, 1, 0.36, 1), opacity 400ms cubic-bezier(0.22, 1, 0.36, 1) 80ms",
                    }}
                  >
                    <div className="flex items-center gap-1.5 px-4 py-2.5">
                      {refImages.map((ref, i) => (
                        <div key={i} className="group/ref relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-white/10">
                          <img src={ref.url} alt="" className="h-full w-full object-cover" />
                          <button
                            onClick={() => setRefImages((prev) => prev.filter((_, j) => j !== i))}
                            className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover/ref:opacity-100"
                          >
                            <X size={12} className="text-white/80" />
                          </button>
                        </div>
                      ))}

                      {Array.from({ length: emptySlots }, (_, i) => (
                        <button
                          key={`empty-${i}`}
                          onClick={() => refInputRef.current?.click()}
                          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg border border-dashed transition-colors ${
                            refDropHover
                              ? "border-[#D4A853]/40 bg-[#D4A853]/5"
                              : "border-white/10 hover:border-white/20 hover:bg-white/[0.03]"
                          }`}
                        >
                          <Plus size={12} className={refDropHover ? "text-[#D4A853]/50" : "text-white/15"} />
                        </button>
                      ))}

                      <input
                        ref={refInputRef}
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={(e) => { void addRefFromFile(e.target.files); e.target.value = "" }}
                        className="hidden"
                      />

                      <span className="ml-1 text-[9px] tabular-nums text-white/15">
                        {refImages.length}/{maxRefs}
                      </span>

                      <div className="flex-1" />

                      <span className="text-[9px] text-white/15">
                        {MODEL_MAP[selectedModel]?.label || selectedModel}
                      </span>
                    </div>

                    {/* Error */}
                    {genError && (
                      <div className="flex items-center justify-between border-t border-red-500/10 bg-red-500/5 px-4 py-1.5">
                        <span className="truncate text-[10px] text-red-400/70">{genError}</span>
                        <button onClick={() => setGenError(null)} className="ml-2 text-red-400/40 hover:text-red-400/70"><X size={10} /></button>
                      </div>
                    )}
                  </div>

                  {/* ── Main input row (always visible, compact when collapsed) ── */}
                  <div
                    className="flex items-center gap-2 border-t border-white/[0.04] px-4"
                    style={{
                      padding: collapsed ? "8px 16px" : "12px 16px",
                      transition: collapsed
                        ? "padding 300ms cubic-bezier(0.32, 0, 0.67, 0)"
                        : "padding 450ms cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                  >
                    <textarea
                      ref={promptRef}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault()
                          void handleGenerate()
                        }
                      }}
                      placeholder={collapsed ? "Generate..." : "Describe what you want to generate..."}
                      rows={1}
                      className="flex-1 resize-none bg-transparent text-[13px] leading-[1.5] text-white/85 outline-none placeholder:text-white/20"
                      style={{
                        maxHeight: collapsed ? 24 : 120,
                        minHeight: collapsed ? 24 : 36,
                        transition: collapsed
                          ? "max-height 300ms cubic-bezier(0.32, 0, 0.67, 0), min-height 300ms cubic-bezier(0.32, 0, 0.67, 0)"
                          : "max-height 450ms cubic-bezier(0.22, 1, 0.36, 1), min-height 450ms cubic-bezier(0.22, 1, 0.36, 1)",
                        fieldSizing: "content",
                      } as React.CSSProperties}
                    />

                    {/* Controls */}
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      {/* Model selector — hidden when collapsed */}
                      <div
                        className="relative"
                        style={{
                          width: collapsed ? 0 : "auto",
                          opacity: collapsed ? 0 : 1,
                          overflow: collapsed ? "hidden" : "visible",
                          transition: collapsed
                            ? "width 250ms cubic-bezier(0.32, 0, 0.67, 0), opacity 150ms cubic-bezier(0.32, 0, 0.67, 0)"
                            : "width 450ms cubic-bezier(0.22, 1, 0.36, 1) 120ms, opacity 350ms cubic-bezier(0.22, 1, 0.36, 1) 150ms",
                        }}
                      >
                        <button
                          onClick={() => setModelOpen((v) => !v)}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-white/30 transition-colors hover:bg-white/5 hover:text-white/50"
                        >
                          {MODEL_MAP[selectedModel]?.label || selectedModel}
                          <ChevronDown size={10} />
                        </button>
                        {modelOpen && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setModelOpen(false)} />
                            <div className="absolute bottom-full right-0 z-20 mb-1 min-w-[160px] rounded-lg border border-white/10 bg-[#1a1917] p-1 shadow-xl">
                              {MODELS.map((m) => (
                                <button
                                  key={m.id}
                                  onClick={() => { setSelectedModel(m.id); setModelOpen(false) }}
                                  className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] transition-colors ${
                                    selectedModel === m.id ? "bg-[#D4A853]/15 text-[#D4A853]" : "text-white/50 hover:bg-white/5 hover:text-white/70"
                                  }`}
                                >
                                  <span>{m.label}</span>
                                  <span className="text-[9px] text-white/20">{m.maxRefs} ref</span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Batch count — hidden when collapsed */}
                      <div
                        className="flex items-center gap-0.5 rounded-lg bg-white/[0.03] px-1 py-0.5"
                        style={{
                          width: collapsed ? 0 : "auto",
                          opacity: collapsed ? 0 : 1,
                          overflow: "hidden",
                          transition: collapsed
                            ? "width 250ms cubic-bezier(0.32, 0, 0.67, 0), opacity 150ms cubic-bezier(0.32, 0, 0.67, 0)"
                            : "width 450ms cubic-bezier(0.22, 1, 0.36, 1) 140ms, opacity 350ms cubic-bezier(0.22, 1, 0.36, 1) 170ms",
                        }}
                      >
                        {[1, 2, 3, 4].map((n) => (
                          <button
                            key={n}
                            onClick={() => setBatchCount(n)}
                            className={`flex h-5 w-5 items-center justify-center rounded text-[10px] transition-colors ${
                              batchCount === n ? "bg-[#D4A853]/20 text-[#D4A853]" : "text-white/20 hover:text-white/40"
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>

                      {/* Generate — always visible */}
                      <button
                        onClick={() => void handleGenerate()}
                        disabled={!prompt.trim() || generating}
                        className="flex items-center justify-center rounded-xl bg-[#D4A853] text-black hover:bg-[#E0BA6A] disabled:opacity-25 disabled:cursor-not-allowed"
                        style={{
                          width: collapsed ? 28 : 32,
                          height: collapsed ? 28 : 32,
                          transition: collapsed
                            ? "width 300ms cubic-bezier(0.32, 0, 0.67, 0), height 300ms cubic-bezier(0.32, 0, 0.67, 0)"
                            : "width 450ms cubic-bezier(0.22, 1, 0.36, 1), height 450ms cubic-bezier(0.22, 1, 0.36, 1)",
                        }}
                      >
                        {generating ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Sparkles size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── ShotStudio overlay ── */}
      {studioShotId && (
        <div className="fixed inset-0 z-[180]">
          <ShotStudio
            shotId={studioShotId}
            standalone
            onClose={handleStudioClose}
          />
        </div>
      )}
    </div>
  )
}
