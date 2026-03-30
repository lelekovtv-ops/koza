"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import NextImage from "next/image"
import {
  FolderOpen,
  Search,
  Trash2,
  Upload,
  X,
  Film,
  FileText,
  Music,
  File,
} from "lucide-react"
import { deleteBlob, saveBlob } from "@/lib/fileStorage"
import { type LibraryFile, useLibraryStore } from "@/store/library"
import { useProjectsStore } from "@/store/projects"

const ACCEPT_TYPES = "image/*,video/*,audio/*,.pdf,.txt,.fdx,.fountain"

function createFileId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function detectLibraryType(file: File): LibraryFile["type"] {
  if (file.type.startsWith("image/")) return "image"
  if (file.type.startsWith("video/")) return "video"
  if (file.type.startsWith("audio/")) return "audio"
  if (file.type.includes("pdf") || file.type.includes("text") || file.name.endsWith(".fdx") || file.name.endsWith(".fountain")) return "document"
  return "other"
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

async function createImageThumbnail(file: File): Promise<string | undefined> {
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

function FileTypeIcon({ type }: { type: string }) {
  const cls = "h-8 w-8 text-white/20"
  switch (type) {
    case "video": return <Film className={cls} />
    case "audio": return <Music className={cls} />
    case "document": return <FileText className={cls} />
    default: return <File className={cls} />
  }
}

export default function LibraryPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragCounter, setDragCounter] = useState(0)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const projectId = useProjectsStore((state) => state.activeProjectId)

  const files = useLibraryStore((state) => state.files)
  const searchQuery = useLibraryStore((state) => state.searchQuery)
  const addFiles = useLibraryStore((state) => state.addFiles)
  const removeFile = useLibraryStore((state) => state.removeFile)
  const setSearchQuery = useLibraryStore((state) => state.setSearchQuery)

  const isDragOver = dragCounter > 0

  const processFiles = useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return
      const now = Date.now()
      const targetProjectId = projectId ?? "global"

      const prepared = await Promise.all(
        incoming.map(async (file) => {
          const id = createFileId()
          const objectUrl = URL.createObjectURL(file)
          const type = detectLibraryType(file)
          const thumbnailUrl = type === "image" ? await createImageThumbnail(file) : undefined
          try { await saveBlob(id, file) } catch {}

          return {
            id,
            name: file.name,
            type,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            url: objectUrl,
            thumbnailUrl,
            createdAt: now,
            updatedAt: now,
            tags: [] as string[],
            projectId: targetProjectId,
            folder: "/",
            origin: "uploaded" as const,
          }
        })
      )
      addFiles(prepared)
    },
    [addFiles, projectId]
  )

  const handleDeleteFile = async (file: LibraryFile) => {
    removeFile(file.id)
    if (file.url.startsWith("blob:")) URL.revokeObjectURL(file.url)
    if (file.thumbnailUrl?.startsWith("blob:")) URL.revokeObjectURL(file.thumbnailUrl)
    try { await deleteBlob(file.id) } catch {}
  }

  const filteredFiles = useMemo(() => {
    const scoped = files.filter((file) => (projectId ? file.projectId === projectId : true))
    const q = searchQuery.trim().toLowerCase()
    if (!q) return scoped
    return scoped.filter((file) => file.name.toLowerCase().includes(q))
  }, [files, projectId, searchQuery])

  const imageFiles = filteredFiles.filter((f) => f.type === "image")
  const otherFiles = filteredFiles.filter((f) => f.type !== "image")

  return (
    <div
      className="flex h-full flex-col bg-[#0E0D0B] text-white"
      onDragEnter={(e) => { e.preventDefault(); setDragCounter((v) => v + 1) }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy" }}
      onDragLeave={(e) => { e.preventDefault(); setDragCounter((v) => Math.max(0, v - 1)) }}
      onDrop={(e) => { e.preventDefault(); setDragCounter(0); void processFiles(Array.from(e.dataTransfer.files)) }}
    >
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-white/6 px-6 py-4">
        <h1 className="text-[15px] font-medium tracking-[0.01em] text-white/80">Media</h1>
        <div className="relative flex-1 max-w-[320px]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-white/20" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full rounded-lg border border-white/8 bg-white/4 py-2 pl-8 pr-3 text-[13px] text-white outline-none placeholder:text-white/20 focus:border-white/15"
          />
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-[12px] font-medium text-white/70 transition-colors hover:bg-white/8 hover:text-white"
        >
          <Upload size={14} />
          Upload
        </button>
        <span className="text-[12px] tabular-nums text-white/25">{filteredFiles.length} files</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_TYPES}
        onChange={(e) => { void processFiles(Array.from(e.target.files ?? [])); e.target.value = "" }}
        className="hidden"
      />

      {/* Content */}
      <div className="relative flex-1 overflow-y-auto p-6">
        {filteredFiles.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center">
              <FolderOpen className="mx-auto mb-4 h-12 w-12 text-white/10" />
              <p className="text-[14px] font-medium text-white/30">Library is empty</p>
              <p className="mt-2 text-[12px] text-white/15">Drop files here or click Upload</p>
              <button
                onClick={() => inputRef.current?.click()}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#D4A853]/15 px-4 py-2 text-[12px] font-medium text-[#D4A853] transition-colors hover:bg-[#D4A853]/25"
              >
                <Upload size={14} />
                Upload
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Images */}
            {imageFiles.length > 0 && (
              <div>
                <p className="mb-3 text-[11px] uppercase tracking-[0.16em] text-white/25">{imageFiles.length} Images</p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                  {imageFiles.map((file) => (
                    <div key={file.id} className="group overflow-hidden rounded-xl border border-white/8 bg-white/3 transition-colors hover:border-white/15">
                      <button
                        className="relative block aspect-[4/3] w-full overflow-hidden"
                        onClick={() => setPreviewImage(file.url || null)}
                      >
                        <NextImage
                          src={file.thumbnailUrl || file.url}
                          alt={file.name}
                          fill
                          unoptimized
                          sizes="220px"
                          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); void handleDeleteFile(file) }}
                          className="absolute right-2 top-2 rounded-md bg-black/60 p-1 text-white/50 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-900/80 hover:text-red-300"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </button>
                      <div className="px-2.5 py-2">
                        <p className="truncate text-[11px] font-medium text-white/60">{file.name}</p>
                        <p className="mt-0.5 text-[10px] text-white/20">{formatSize(file.size)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Other files */}
            {otherFiles.length > 0 && (
              <div className={imageFiles.length > 0 ? "mt-8" : ""}>
                <p className="mb-3 text-[11px] uppercase tracking-[0.16em] text-white/25">{otherFiles.length} Files</p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                  {otherFiles.map((file) => (
                    <div key={file.id} className="group flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 p-3 transition-colors hover:border-white/15">
                      <FileTypeIcon type={file.type} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium text-white/60">{file.name}</p>
                        <p className="mt-0.5 text-[10px] text-white/20">{formatSize(file.size)}</p>
                      </div>
                      <button
                        onClick={() => void handleDeleteFile(file)}
                        className="rounded-md p-1 text-white/20 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-900/60 hover:text-red-300"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Drag overlay */}
        {isDragOver && (
          <div className="pointer-events-none absolute inset-4 rounded-2xl border-2 border-dashed border-[#D4A853]/50 bg-[#D4A853]/5 backdrop-blur-sm">
            <div className="flex h-full items-center justify-center">
              <p className="text-[14px] font-medium text-[#D4A853]/70">Drop files here</p>
            </div>
          </div>
        )}
      </div>

      {/* Image preview lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <button
            className="absolute right-5 top-5 rounded-lg bg-black/50 p-2 text-white/60 transition hover:bg-black/70 hover:text-white"
            onClick={() => setPreviewImage(null)}
          >
            <X size={20} />
          </button>
          <NextImage
            src={previewImage}
            alt="Preview"
            width={1600}
            height={900}
            unoptimized
            className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain"
          />
        </div>
      )}
    </div>
  )
}
