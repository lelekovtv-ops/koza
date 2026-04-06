"use client"

import { useState, useEffect, useRef } from "react"
import type { HandState } from "@/hooks/useHandTracking"

interface Props {
  open: boolean
  onClose: () => void
  hand: HandState
  cameraReady: boolean
}

const IMAGES = [
  "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80",
  "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800&q=80",
  "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=800&q=80",
  "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=800&q=80",
  "https://images.unsplash.com/photo-1524712245354-2c4e5e7121c0?w=800&q=80",
  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&q=80",
  "https://images.unsplash.com/photo-1460881680858-30d872d5b530?w=800&q=80",
  "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=800&q=80",
  "https://images.unsplash.com/photo-1595769816263-9b910be24d5f?w=800&q=80",
  "https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=800&q=80",
  "https://images.unsplash.com/photo-1585951237318-9ea5e175b891?w=800&q=80",
  "https://images.unsplash.com/photo-1574267432553-4b4628081c31?w=800&q=80",
]

const SCALE_NORMAL = 1
const SCALE_CLOSE = 1.8

export function GestureTestOverlay({ open, onClose, hand, cameraReady }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [zoomScale, setZoomScale] = useState(SCALE_NORMAL)
  const lastGestureRef = useRef("none")
  const palmRef = useRef<{ active: boolean; startY: number; startScale: number }>({
    active: false, startY: 0, startScale: SCALE_NORMAL,
  })

  // Pinch-drag tracking
  const dragRef = useRef<{
    active: boolean
    startX: number
    lastIdx: number
    history: { x: number; t: number }[]  // for velocity calc
  }>({ active: false, startX: 0, lastIdx: 0, history: [] })
  const inertiaRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Reset on open
  useEffect(() => {
    if (open) {
      setCurrentIdx(0)
      setZoomScale(SCALE_NORMAL)
      palmRef.current.active = false
      inertiaRef.current.forEach(t => clearTimeout(t))
      inertiaRef.current = []
    }
    return () => inertiaRef.current.forEach(t => clearTimeout(t))
  }, [open])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [open, onClose])

  // How many normalized units per photo step
  const DRAG_SENSITIVITY = 0.14 // ~14% of screen width per photo

  // Gesture processing
  useEffect(() => {
    if (!open || !hand.detected || !cameraReady) return
    const gesture = hand.gesture
    const dr = dragRef.current

    // ── Pinch = grab & drag ──
    if (gesture === "pinch") {
      // Cancel any running inertia
      inertiaRef.current.forEach(t => clearTimeout(t))
      inertiaRef.current = []

      if (!dr.active) {
        dr.active = true
        dr.startX = hand.x
        dr.lastIdx = currentIdx
        dr.history = [{ x: hand.x, t: Date.now() }]
      } else {
        // Track position history (last 5 frames)
        dr.history.push({ x: hand.x, t: Date.now() })
        if (dr.history.length > 5) dr.history.shift()

        const dx = hand.x - dr.startX
        const steps = Math.round(dx / DRAG_SENSITIVITY)
        const newIdx = dr.lastIdx - steps
        const clamped = ((newIdx % IMAGES.length) + IMAGES.length) % IMAGES.length
        if (clamped !== currentIdx) {
          setCurrentIdx(clamped)
          setZoomScale(SCALE_NORMAL)
        }
      }
    } else if (dr.active) {
      // Released — calculate velocity for inertia
      dr.active = false
      const h = dr.history
      if (h.length >= 2) {
        const first = h[0]
        const last = h[h.length - 1]
        const dt = (last.t - first.t) / 1000 // seconds
        if (dt > 0) {
          const velocity = (last.x - first.x) / dt // normalized units per second
          const absVel = Math.abs(velocity)

          // If moving fast enough, add inertia steps
          if (absVel > 0.3) {
            const dir = velocity > 0 ? -1 : 1
            const extraSteps = Math.min(4, Math.round(absVel * 2))

            let elapsed = 0
            for (let i = 0; i < extraSteps; i++) {
              // Each step takes longer (deceleration)
              elapsed += 200 + i * 150
              const timer = setTimeout(() => {
                setCurrentIdx(prev => {
                  const next = prev + dir
                  return ((next % IMAGES.length) + IMAGES.length) % IMAGES.length
                })
              }, elapsed)
              inertiaRef.current.push(timer)
            }
          }
        }
      }
      dr.history = []
    }

    // ── Open palm = zoom by moving hand up/down ──
    const pm = palmRef.current
    if (gesture === "open_palm" && !dr.active) {
      if (!pm.active) {
        // Lock anchor
        pm.active = true
        pm.startY = hand.y
        pm.startScale = zoomScale
      } else {
        // Hand up (lower Y) = zoom in, hand down = zoom out
        const dy = pm.startY - hand.y
        const newScale = Math.max(0.5, Math.min(2.5, pm.startScale + dy * 10))
        setZoomScale(newScale)
      }
    } else {
      pm.active = false
    }

    // Fist = reset zoom
    if (gesture === "fist" && lastGestureRef.current !== "fist" && !dr.active) {
      setZoomScale(SCALE_NORMAL)
    }

    lastGestureRef.current = gesture
  }, [hand, open, cameraReady, currentIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  const isZoomed = zoomScale > 1.1

  const CARD_W = 480
  const CARD_GAP = 40
  const CARD_STEP = CARD_W + CARD_GAP // distance between card centers

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[150]"
        onClick={onClose}
        style={{
          background: "radial-gradient(ellipse 80% 70% at 50% 50%, rgba(10,10,9,0.95) 0%, rgba(5,5,4,0.98) 100%)",
          animation: "sessionBackdropIn 0.3s ease-out both",
        }}
      />

      {/* Content */}
      <div className="fixed inset-0 z-[151] flex flex-col items-center justify-center overflow-hidden">
        {/* Title + counter */}
        <div className="absolute left-1/2 top-8 -translate-x-1/2 flex items-center gap-3">
          <span className="text-[13px] font-medium tracking-wider" style={{ color: "rgba(212,168,83,0.5)" }}>
            GESTURE TEST
          </span>
          <span className="text-[11px] text-white/20">
            {currentIdx + 1} / {IMAGES.length}
          </span>
        </div>

        {/* Carousel — whole strip moves */}
        <div className="relative flex items-center justify-center" style={{ width: "100%", height: 400 }}>
          <div
            className="absolute flex items-center"
            style={{
              left: "50%",
              transition: "transform 0.7s cubic-bezier(0.16,1,0.3,1)",
              transform: `translateX(${-currentIdx * CARD_STEP - CARD_W / 2}px)`,
              gap: `${CARD_GAP}px`,
            }}
          >
            {IMAGES.map((src, i) => {
              const dist = Math.abs(i - currentIdx)
              const isCenter = dist === 0
              const cardScale = isCenter ? zoomScale : Math.max(0.55, 0.85 - dist * 0.15)
              const opacity = isCenter ? 1 : Math.max(0.08, 0.5 - dist * 0.2)
              const blur = isCenter ? 0 : dist * 2.5

              return (
                <div
                  key={i}
                  className="flex-shrink-0 overflow-hidden rounded-2xl"
                  style={{
                    width: CARD_W,
                    height: 320,
                    transition: "transform 0.7s cubic-bezier(0.16,1,0.3,1), opacity 0.7s, filter 0.7s, box-shadow 0.7s",
                    transform: `scale(${cardScale})`,
                    opacity,
                    filter: blur > 0 ? `blur(${blur}px)` : "none",
                    boxShadow: isCenter
                      ? isZoomed
                        ? "0 30px 100px rgba(0,0,0,0.7), 0 0 1px rgba(212,168,83,0.3)"
                        : "0 20px 80px rgba(0,0,0,0.6), 0 0 1px rgba(255,255,255,0.1)"
                      : "0 10px 40px rgba(0,0,0,0.4)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Photo ${i + 1}`}
                    className="pointer-events-none select-none"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />

                  {isCenter && (
                    <div
                      className="absolute bottom-3 right-3 rounded-lg px-2.5 py-1 text-[11px] font-semibold tracking-wider backdrop-blur-md"
                      style={{
                        background: "rgba(0,0,0,0.5)",
                        color: isZoomed ? "#D4A853" : "rgba(255,255,255,0.5)",
                        border: `1px solid ${isZoomed ? "rgba(212,168,83,0.3)" : "rgba(255,255,255,0.1)"}`,
                      }}
                    >
                      {Math.round(zoomScale * 100)}%
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Dots */}
        <div className="mt-4 flex items-center gap-2">
          {IMAGES.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-500"
              style={{
                width: i === currentIdx ? 20 : 6,
                height: 6,
                background: i === currentIdx ? "#D4A853" : "rgba(255,255,255,0.15)",
                boxShadow: i === currentIdx ? "0 0 8px rgba(212,168,83,0.4)" : "none",
              }}
            />
          ))}
        </div>

        {/* Instructions */}
        <div
          className="absolute bottom-12 flex flex-col items-center gap-4"
          style={{ animation: "sessionBackdropIn 0.5s ease-out 0.3s both" }}
        >
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5">
                <span className="text-[16px]">👈</span>
              </div>
              <span className="text-[10px] text-white/30">swipe</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-green-500/20 bg-green-500/5">
                <span className="text-[16px]">🖐</span>
              </div>
              <span className="text-[10px] text-white/30">close-up</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-red-500/20 bg-red-500/5">
                <span className="text-[16px]">✊</span>
              </div>
              <span className="text-[10px] text-white/30">wide</span>
            </div>
          </div>
          <p className="text-[10px] tracking-wider text-white/10">ESC to close</p>
        </div>
      </div>
    </>
  )
}
