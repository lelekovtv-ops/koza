"use client"

import Image from "next/image"
import { X } from "lucide-react"

interface ImageLightboxProps {
  imageUrl: string | null
  alt: string
  title?: string
  subtitle?: string
  onClose: () => void
}

export default function ImageLightbox({ imageUrl, alt, title, subtitle, onClose }: ImageLightboxProps) {
  if (!imageUrl) {
    return null
  }

  return (
    <div className="fixed inset-0 z-120 flex items-center justify-center bg-black/82 p-4 backdrop-blur-md">
      <button
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        aria-label="Close enlarged image"
      />

      <div className="relative z-121 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12110F]/96 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-4 py-3">
          <div className="min-w-0">
            {title ? <p className="truncate text-[12px] font-semibold text-[#E5E0DB]">{title}</p> : null}
            {subtitle ? <p className="mt-1 text-[10px] leading-relaxed text-white/40">{subtitle}</p> : null}
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-white/8 bg-white/4 p-1.5 text-white/45 transition-colors hover:bg-white/8 hover:text-white/80"
            aria-label="Close enlarged image"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative min-h-[60vh] flex-1 bg-black/30">
          <Image
            src={imageUrl}
            alt={alt}
            fill
            unoptimized
            className="object-contain"
            sizes="100vw"
          />
        </div>
      </div>
    </div>
  )
}