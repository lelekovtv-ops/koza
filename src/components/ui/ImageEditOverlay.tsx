"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { Loader2, Paperclip, Wand2, X } from "lucide-react"

export interface ImageEditRequest {
  instruction: string
  currentImageUrl: string
}

export interface ImageEditResult {
  blob: Blob
}

async function imageUrlToDataUrl(url: string): Promise<string> {
  const resp = await fetch(url)
  const blob = await resp.blob()
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })
}

async function executeImageEdit(
  instruction: string,
  currentImageUrl: string,
  model: string,
  extraRefDataUrl?: string,
): Promise<Blob> {
  const apiUrl = model === "gpt-image" ? "/api/gpt-image" : "/api/nano-banana"

  const refs: string[] = []
  try {
    refs.push(await imageUrlToDataUrl(currentImageUrl))
  } catch {}
  // Attach extra reference (uploaded by user)
  if (extraRefDataUrl) refs.push(extraRefDataUrl)

  const prompt = [
    `INSTRUCTION: ${instruction}`,
    "",
    "RULES:",
    "- Apply the instruction above to modify the image.",
    "- Keep ALL other elements intact: identity, pose, lighting, environment, color palette, mood.",
    "- The first reference image is the CURRENT frame — preserve its world, just change what was requested.",
    extraRefDataUrl ? "- The second reference image is an ADDITIONAL REFERENCE provided by the user — use it as visual guide for the requested change." : "",
  ].filter(Boolean).join("\n")

  const body = model === "gpt-image"
    ? { prompt, referenceImages: refs }
    : { prompt, model, referenceImages: refs }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    let errorMsg = `Edit failed: ${response.status}`
    try { const parsed = JSON.parse(errorText); if (parsed.error) errorMsg = parsed.error } catch {}
    throw new Error(errorMsg)
  }

  return response.blob()
}

export function ImageEditOverlay({
  imageUrl,
  model,
  onComplete,
  onClose,
}: {
  imageUrl: string
  model: string
  onComplete: (blob: Blob) => void
  onClose: () => void
}) {
  const [instruction, setInstruction] = useState("")
  const [loading, setLoading] = useState(false)
  const [attachedRef, setAttachedRef] = useState<{ file: File; preview: string; dataUrl: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [onClose])

  const handleSubmit = async () => {
    if (!instruction.trim() || loading) return
    setLoading(true)
    try {
      const blob = await executeImageEdit(instruction.trim(), imageUrl, model, attachedRef?.dataUrl)
      onComplete(blob)
    } catch (err) {
      console.error("Image edit error:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleAttach = async (file: File) => {
    const preview = URL.createObjectURL(file)
    const dataUrl = await fileToDataUrl(file)
    setAttachedRef({ file, preview, dataUrl })
  }

  return (
    <div className="fixed inset-x-0 bottom-6 z-[1000] flex justify-center">
      <div className="flex w-full max-w-xl flex-col gap-2 rounded-2xl border border-white/12 bg-[#1A1916]/95 p-3 shadow-2xl backdrop-blur-xl">
        {/* Attached reference preview */}
        {attachedRef && (
          <div className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5">
            <img src={attachedRef.preview} className="h-8 w-8 rounded object-cover" />
            <span className="min-w-0 flex-1 truncate text-[11px] text-white/40">{attachedRef.file.name}</span>
            <button type="button" onClick={() => { URL.revokeObjectURL(attachedRef.preview); setAttachedRef(null) }}
              className="shrink-0 text-white/25 hover:text-white/60"><X size={12} /></button>
          </div>
        )}
        {/* Main row */}
        <div className="flex items-center gap-3">
          <div className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-lg border border-white/8">
            <Image src={imageUrl} alt="Current" fill unoptimized className="object-cover" />
          </div>
          <input
            ref={inputRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && instruction.trim()) void handleSubmit()
              if (e.key === "Escape") onClose()
            }}
            disabled={loading}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/25 disabled:opacity-50"
            placeholder={attachedRef ? "Замени фон на это, используй как референс..." : "Измени фон, добавь деталь, сделай темнее..."}
          />
          {/* Attach reference */}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAttach(f); e.target.value = "" }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={loading}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
              attachedRef ? "bg-[#D4A853]/15 text-[#D4A853]" : "text-white/25 hover:bg-white/8 hover:text-white/50"
            } disabled:opacity-30`}>
            <Paperclip size={14} />
          </button>
          {loading ? (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center">
              <Loader2 size={16} className="animate-spin text-[#D4A853]" />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!instruction.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#D4A853]/15 text-[#D4A853] transition-colors hover:bg-[#D4A853]/25 disabled:opacity-30"
            >
              <Wand2 size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/8 hover:text-white disabled:opacity-50"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
