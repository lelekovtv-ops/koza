"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

interface GeneratedImage {
  id: string
  prompt: string
  url: string
  timestamp: number
  blockTitle?: string
}

interface Props {
  /** Called from parent when user says "generate first scene" */
  generatePrompt?: string | null
  onGenerated?: (img: GeneratedImage) => void
}

export function ImageGenerator({ generatePrompt, onGenerated }: Props) {
  const [images, setImages] = useState<GeneratedImage[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [currentPrompt, setCurrentPrompt] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Generate image from prompt
  const generate = async (prompt: string, blockTitle?: string) => {
    if (!prompt.trim() || isGenerating) return
    setIsGenerating(true)
    setCurrentPrompt(prompt)
    setError(null)

    try {
      const res = await fetch("/api/nano-banana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model: "nb2" }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)

      const img: GeneratedImage = {
        id: `img-${Date.now()}`,
        prompt,
        url,
        timestamp: Date.now(),
        blockTitle,
      }

      setImages((prev) => [img, ...prev])
      onGenerated?.(img)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsGenerating(false)
      setCurrentPrompt("")
    }
  }

  // Auto-generate when parent passes a prompt
  if (generatePrompt && !isGenerating && generatePrompt !== currentPrompt) {
    generate(generatePrompt)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Status */}
      {isGenerating && (
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          <Loader2 size={14} className="animate-spin text-[#D4A853]" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-white/50">Generating...</div>
            <div className="truncate text-[10px] text-white/25">{currentPrompt.slice(0, 80)}</div>
          </div>
        </div>
      )}

      {error && (
        <div className="border-b border-red-500/20 bg-red-500/5 px-4 py-2 text-[11px] text-red-400">
          {error}
        </div>
      )}

      {/* Gallery */}
      <div className="flex-1 overflow-y-auto p-3">
        {images.length === 0 && !isGenerating ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <div className="text-[40px] opacity-10">🎨</div>
            <p className="text-[13px] text-white/20">Скажи «сгенерируй первую сцену»</p>
            <p className="text-[11px] text-white/10">Изображения появятся здесь</p>
          </div>
        ) : (
          <div className="space-y-3">
            {images.map((img) => (
              <div key={img.id} className="overflow-hidden rounded-xl border border-white/[0.06]">
                <img
                  src={img.url}
                  alt={img.prompt}
                  className="w-full"
                  style={{ aspectRatio: "3/2", objectFit: "cover" }}
                />
                <div className="bg-white/[0.02] px-3 py-2">
                  {img.blockTitle && (
                    <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[#D4A853]/60">
                      {img.blockTitle}
                    </div>
                  )}
                  <p className="text-[10px] leading-4 text-white/30">{img.prompt}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
