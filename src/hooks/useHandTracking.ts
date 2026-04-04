"use client"

import { useRef, useEffect, useState, useCallback } from "react"

export type HandGesture = "none" | "point" | "pinch" | "open_palm" | "fist" | "two_fingers"

export interface HandState {
  /** Normalized x (0-1, left to right) */
  x: number
  /** Normalized y (0-1, top to bottom) */
  y: number
  /** Current gesture */
  gesture: HandGesture
  /** Is hand detected */
  detected: boolean
}

const INITIAL: HandState = { x: 0.5, y: 0.5, gesture: "none", detected: false }

// Finger tip & pip landmark indices (MediaPipe 21-point model)
const INDEX_TIP = 8
const INDEX_PIP = 6
const MIDDLE_TIP = 12
const MIDDLE_PIP = 10
const RING_TIP = 16
const RING_PIP = 14
const PINKY_TIP = 20
const PINKY_PIP = 18
const THUMB_TIP = 4
const THUMB_IP = 3

function isFingerExtended(landmarks: any[], tip: number, pip: number): boolean {
  return landmarks[tip].y < landmarks[pip].y
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function detectGesture(landmarks: any[]): HandGesture {
  const indexUp = isFingerExtended(landmarks, INDEX_TIP, INDEX_PIP)
  const middleUp = isFingerExtended(landmarks, MIDDLE_TIP, MIDDLE_PIP)
  const ringUp = isFingerExtended(landmarks, RING_TIP, RING_PIP)
  const pinkyUp = isFingerExtended(landmarks, PINKY_TIP, PINKY_PIP)
  const thumbOut = landmarks[THUMB_TIP].x < landmarks[THUMB_IP].x // for right hand

  const pinchDist = distance(landmarks[THUMB_TIP], landmarks[INDEX_TIP])

  // Pinch: thumb and index close together
  if (pinchDist < 0.06) return "pinch"

  // Open palm: all fingers extended
  if (indexUp && middleUp && ringUp && pinkyUp) return "open_palm"

  // Fist: no fingers extended
  if (!indexUp && !middleUp && !ringUp && !pinkyUp) return "fist"

  // Two fingers: index + middle up, rest down
  if (indexUp && middleUp && !ringUp && !pinkyUp) return "two_fingers"

  // Point: only index finger up
  if (indexUp && !middleUp && !ringUp && !pinkyUp) return "point"

  return "none"
}

export function useHandTracking(enabled: boolean) {
  const [hand, setHand] = useState<HandState>(INITIAL)
  const [cameraReady, setCameraReady] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const handLandmarkerRef = useRef<any>(null)
  const rafRef = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    handLandmarkerRef.current?.close()
    handLandmarkerRef.current = null
    setCameraReady(false)
    setHand(INITIAL)
  }, [])

  useEffect(() => {
    if (!enabled) {
      stop()
      return
    }

    let cancelled = false

    async function init() {
      try {
        const { HandLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision")

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        )

        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })

        if (cancelled) { landmarker.close(); return }
        handLandmarkerRef.current = landmarker

        // Start camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        const video = document.createElement("video")
        video.srcObject = stream
        video.autoplay = true
        video.playsInline = true
        video.muted = true
        await video.play()
        videoRef.current = video
        setCameraReady(true)

        // Detection loop with smoothing
        let lastTime = -1
        let smoothX = 0.5
        let smoothY = 0.5
        const SMOOTH = 0.35          // EMA factor (0 = frozen, 1 = raw)
        const DEAD_ZONE = 0.004      // ignore jitter below this threshold

        function detect() {
          if (cancelled || !videoRef.current || !handLandmarkerRef.current) return
          const v = videoRef.current
          if (v.readyState >= 2 && v.currentTime !== lastTime) {
            lastTime = v.currentTime
            const result = handLandmarkerRef.current.detectForVideo(v, performance.now())

            if (result.landmarks && result.landmarks.length > 0) {
              const lm = result.landmarks[0]
              const gesture = detectGesture(lm)
              const rawX = 1 - lm[INDEX_TIP].x
              const rawY = lm[INDEX_TIP].y

              // Dead zone: ignore micro-movements (hand tremor)
              const dx = Math.abs(rawX - smoothX)
              const dy = Math.abs(rawY - smoothY)

              if (dx > DEAD_ZONE || dy > DEAD_ZONE) {
                // Adaptive smoothing: small moves = more smoothing, big moves = less
                const moveSize = Math.hypot(dx, dy)
                const adaptiveSmooth = Math.min(0.7, SMOOTH + moveSize * 2)
                smoothX += (rawX - smoothX) * adaptiveSmooth
                smoothY += (rawY - smoothY) * adaptiveSmooth
              }

              setHand({
                x: smoothX,
                y: smoothY,
                gesture,
                detected: true,
              })
            } else {
              setHand(prev => prev.detected ? { ...prev, detected: false } : prev)
            }
          }
          rafRef.current = requestAnimationFrame(detect)
        }
        detect()
      } catch (e) {
        console.error("[HandTracking] init error:", e)
      }
    }

    init()

    return () => {
      cancelled = true
      stop()
    }
  }, [enabled, stop])

  return { hand, cameraReady, videoRef, canvasRef, stop }
}
