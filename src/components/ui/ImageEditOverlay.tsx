"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { Loader2, Wand2, X } from "lucide-react"

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

async function executeImageEdit(
  instruction: string,
  currentImageUrl: string,
  model: string,
): Promise<Blob> {
  const apiUrl = model === "gpt-image" ? "/api/gpt-image" : "/api/nano-banana"

  const refs: string[] = []
  try {
    refs.push(await imageUrlToDataUrl(currentImageUrl))
  } catch {}

  const prompt = [
    `INSTRUCTION: ${instruction}`,
    "",
    "RULES:",
    "- Apply the instruction above to modify the image.",
    "- Keep ALL other elements intact: identity, pose, lighting, environment, color palette, mood.",
    "- The first reference image is the CURRENT frame — preserve its world, just change what was requested.",
  ].join("\n")

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
  const inputRef = useRef<HTMLInputElement>(null)

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
      const blob = await executeImageEdit(instruction.trim(), imageUrl, model)
      onComplete(blob)
    } catch (err) {
      console.error("Image edit error:", err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-6 z-[1000] flex justify-center">
      <div className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-white/12 bg-[#1A1916]/95 p-3 shadow-2xl backdrop-blur-xl">
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
          placeholder="Измени фон, добавь деталь, сделай темнее..."
        />
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
  )
}
