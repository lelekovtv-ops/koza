"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type { HandState } from "@/hooks/useHandTracking"

interface SearchPhoto {
  id: string
  src: string
  alt: string
  photographer: string
  width: number
  height: number
}

interface FloatingPhoto extends SearchPhoto {
  x: number      // % from center (-50 to 50)
  y: number      // % from center (-30 to 30)
  z: number      // depth (0 = front, 100 = far back)
  rotX: number   // subtle rotation degrees
  rotY: number
  scale: number
  selected: boolean
  entryDelay: number // staggered entry animation
}

interface Props {
  open: boolean
  onClose: () => void
  onSelect?: (photo: SearchPhoto) => void
  hand: HandState
  cameraReady: boolean
  gestureMode: boolean
  initialQuery?: string
}

function randomInRange(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function layoutPhotos(photos: SearchPhoto[]): FloatingPhoto[] {
  // Distribute photos in 3D space — spiral/scatter pattern
  return photos.map((p, i) => {
    const angle = (i / photos.length) * Math.PI * 2.5 + randomInRange(-0.3, 0.3)
    const radius = 15 + (i % 3) * 12 + randomInRange(-3, 3)
    const row = Math.floor(i / 4)

    return {
      ...p,
      x: Math.cos(angle) * radius + randomInRange(-5, 5),
      y: -15 + row * 15 + randomInRange(-4, 4),
      z: 20 + (i % 4) * 25 + randomInRange(-10, 10),
      rotX: randomInRange(-4, 4),
      rotY: randomInRange(-8, 8),
      scale: 1,
      selected: false,
      entryDelay: i * 80,
    }
  })
}

export function PhotoSearch3D({ open, onClose, onSelect, hand, cameraReady, gestureMode, initialQuery }: Props) {
  const [query, setQuery] = useState(initialQuery || "")
  const [photos, setPhotos] = useState<FloatingPhoto[]>([])
  const [loading, setLoading] = useState(false)
  const [entered, setEntered] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lastGestureRef = useRef("none")

  // Auto-search on open
  useEffect(() => {
    if (open && initialQuery) {
      setQuery(initialQuery)
      doSearch(initialQuery)
    }
    if (!open) {
      setPhotos([])
      setEntered(false)
      setSelectedId(null)
    }
  }, [open, initialQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return
    setLoading(true)
    setEntered(false)
    try {
      const res = await fetch("/api/search-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q.trim(), count: 12 }),
      })
      const data = await res.json()
      setPhotos(layoutPhotos(data.photos || []))
      setTimeout(() => setEntered(true), 100)
    } catch {
      setPhotos([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Escape
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedId) setSelectedId(null)
        else onClose()
      }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [open, onClose, selectedId])

  // Gesture: pinch on hovered → select, fist → close, open palm → deselect
  useEffect(() => {
    if (!open || !gestureMode || !hand.detected || !cameraReady) return
    const gesture = hand.gesture

    // Hit test — which photo is cursor over
    if (containerRef.current) {
      const px = hand.x * window.innerWidth
      const py = hand.y * window.innerHeight
      const els = containerRef.current.querySelectorAll<HTMLDivElement>("[data-photo-id]")
      let found: string | null = null
      // Check in reverse (front photos first due to z-index)
      for (let i = els.length - 1; i >= 0; i--) {
        const rect = els[i].getBoundingClientRect()
        if (px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom) {
          found = els[i].dataset.photoId!
          break
        }
      }
      setHoveredId(found)
    }

    // Pinch → select hovered photo
    if (gesture === "pinch" && lastGestureRef.current !== "pinch" && hoveredId) {
      if (selectedId === hoveredId) {
        // Double pinch = confirm selection
        const photo = photos.find(p => p.id === hoveredId)
        if (photo) onSelect?.(photo)
      } else {
        setSelectedId(hoveredId)
      }
    }

    // Fist → back / close
    if (gesture === "fist" && lastGestureRef.current !== "fist") {
      if (selectedId) setSelectedId(null)
      else onClose()
    }

    // Open palm → deselect
    if (gesture === "open_palm" && lastGestureRef.current !== "open_palm" && selectedId) {
      setSelectedId(null)
    }

    lastGestureRef.current = gesture
  }, [hand, open, gestureMode, cameraReady, hoveredId, selectedId, photos, onSelect, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop — deep dark with blue tint like Minority Report */}
      <div
        className="fixed inset-0 z-[160]"
        onClick={() => selectedId ? setSelectedId(null) : onClose()}
        style={{
          background: "radial-gradient(ellipse 100% 100% at 50% 40%, rgba(8,12,20,0.94) 0%, rgba(3,5,10,0.98) 100%)",
          backdropFilter: "blur(20px)",
          animation: "mrBackdropIn 0.5s ease-out both",
        }}
      />

      {/* 3D Scene */}
      <div
        ref={containerRef}
        className="fixed inset-0 z-[161]"
        style={{ perspective: "1200px", perspectiveOrigin: "50% 45%" }}
      >
        {/* Search bar at top */}
        <div className="absolute left-1/2 top-8 z-10 -translate-x-1/2" style={{ animation: "mrSlideDown 0.6s ease-out both" }}>
          <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-5 py-3 backdrop-blur-xl" style={{ width: 400 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(212,168,83,0.5)" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doSearch(query) }}
              placeholder="Search photos..."
              className="flex-1 bg-transparent text-[14px] text-white/80 outline-none placeholder:text-white/20"
              autoFocus
            />
            {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#D4A853]/30 border-t-[#D4A853]" />}
          </div>
        </div>

        {/* Floating photos */}
        {photos.map((photo) => {
          const isSelected = selectedId === photo.id
          const isHovered = hoveredId === photo.id
          const isFaded = selectedId && !isSelected

          // When selected, bring to center
          const tx = isSelected ? 0 : photo.x
          const ty = isSelected ? 0 : photo.y
          const tz = isSelected ? -50 : photo.z
          const rx = isSelected ? 0 : photo.rotX
          const ry = isSelected ? 0 : photo.rotY
          const sc = isSelected ? 1.8 : isHovered ? 1.15 : 1

          return (
            <div
              key={photo.id}
              data-photo-id={photo.id}
              onClick={() => {
                if (selectedId === photo.id) onSelect?.(photo)
                else setSelectedId(photo.id)
              }}
              className="absolute cursor-pointer"
              style={{
                left: "50%",
                top: "50%",
                width: 220,
                height: 150,
                marginLeft: -110,
                marginTop: -75,
                transform: `translate3d(${tx}vw, ${ty}vh, ${-tz}px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${sc})`,
                transition: entered
                  ? "transform 0.6s cubic-bezier(0.16,1,0.3,1), opacity 0.4s, filter 0.4s, box-shadow 0.4s"
                  : "none",
                opacity: !entered ? 0 : isFaded ? 0.15 : isHovered ? 1 : 0.85,
                filter: isFaded ? "blur(4px)" : isHovered ? "brightness(1.2)" : "none",
                zIndex: isSelected ? 100 : isHovered ? 50 : Math.round(100 - photo.z),
                animation: entered ? undefined : `mrPhotoIn 0.7s cubic-bezier(0.16,1,0.3,1) ${photo.entryDelay}ms both`,
                boxShadow: isSelected
                  ? "0 0 60px rgba(212,168,83,0.3), 0 20px 60px rgba(0,0,0,0.5)"
                  : isHovered
                    ? "0 0 30px rgba(212,168,83,0.15), 0 10px 40px rgba(0,0,0,0.4)"
                    : "0 8px 30px rgba(0,0,0,0.4)",
              }}
            >
              {/* Glass frame */}
              <div className="relative h-full w-full overflow-hidden rounded-xl" style={{
                border: isSelected
                  ? "1px solid rgba(212,168,83,0.4)"
                  : isHovered
                    ? "1px solid rgba(212,168,83,0.2)"
                    : "1px solid rgba(255,255,255,0.06)",
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.src}
                  alt={photo.alt}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />

                {/* Holographic overlay */}
                <div className="pointer-events-none absolute inset-0" style={{
                  background: "linear-gradient(135deg, rgba(212,168,83,0.05) 0%, transparent 50%, rgba(100,150,255,0.05) 100%)",
                }} />

                {/* Info on hover/select */}
                {(isHovered || isSelected) && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6">
                    <p className="truncate text-[11px] font-medium text-white/80">{photo.alt}</p>
                    <p className="text-[9px] text-white/30">{photo.photographer}</p>
                  </div>
                )}
              </div>

              {/* Selection ring */}
              {isSelected && (
                <div
                  className="pointer-events-none absolute -inset-2 rounded-2xl"
                  style={{
                    border: "1px solid rgba(212,168,83,0.3)",
                    boxShadow: "inset 0 0 20px rgba(212,168,83,0.05)",
                    animation: "mrSelectPulse 2s ease-in-out infinite",
                  }}
                />
              )}
            </div>
          )
        })}

        {/* Bottom hint */}
        <div
          className="absolute bottom-12 left-1/2 -translate-x-1/2 text-center"
          style={{ animation: "mrSlideDown 0.6s ease-out 0.5s both" }}
        >
          {selectedId ? (
            <p className="text-[12px] text-[#D4A853]/40">click again to use this photo</p>
          ) : photos.length > 0 ? (
            <p className="text-[11px] text-white/15">
              {gestureMode ? "pinch to select, fist to close" : "click to select, ESC to close"}
            </p>
          ) : !loading ? (
            <p className="text-[11px] text-white/15">type a search query above</p>
          ) : null}
        </div>
      </div>

      <style jsx global>{`
        @keyframes mrBackdropIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes mrSlideDown {
          from { opacity: 0; transform: translate(-50%, -20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes mrPhotoIn {
          from {
            opacity: 0;
            transform: translate3d(0, 0, 200px) rotateX(20deg) rotateY(30deg) scale(0.3);
            filter: blur(10px);
          }
          to {
            opacity: 0.85;
            filter: blur(0);
          }
        }
        @keyframes mrSelectPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
    </>
  )
}
