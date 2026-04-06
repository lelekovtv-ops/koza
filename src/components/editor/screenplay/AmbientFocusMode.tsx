"use client"

/**
 * Ambient Focus Mode
 *
 * Browser fullscreen + background illustrations that come alive
 * as you write. The cheapest image model (nano-banana) generates
 * expressive comic-style visuals from the current scene text.
 *
 * Max 6 generations per page. Bible characters/locations used as anchors.
 */

import React, { useCallback, useEffect, useRef, useState } from "react"
import { useScreenplaySettings } from "@/store/screenplaySettings"
import { useScriptStore } from "@/store/script"
import { useBibleStore } from "@/store/bible"
import { useScenesStore } from "@/store/scenes"
import { saveBlob, loadBlob } from "@/lib/fileStorage"

// ─── Config ───

/** Max images kept in memory — oldest get replaced (rolling window) */
const MAX_IMAGES_KEPT = 6
/** Cooldown between generations */
const GENERATION_COOLDOWN_MS = 30_000
/** Crossfade duration */
const CROSSFADE_DURATION_MS = 3000
/** Image model */
const IMAGE_MODEL = "nano-banana" // cheapest

const DEFAULT_AMBIENT_STYLE = [
  "Comic book panel, graphic novel style,",
  "bold black ink outlines, halftone dots,",
  "dramatic camera angles like storyboard frames,",
  "expressive close-ups with visible emotions,",
  "speed lines for motion, impact stars for hits,",
  "onomatopoeia sound effects (BOOM, CRASH, WHOOSH, BANG) integrated into composition,",
  "split panel layout with dynamic gutters,",
  "high contrast chiaroscuro lighting,",
  "limited noir color palette with one accent color,",
  "cinematic worm's eye or bird's eye angles,",
  "motion blur on action, frozen splash on impact,",
  "16:9 widescreen frame.",
].join(" ")

// ─── Prompt builder ───

function buildAmbientPrompt(sceneText: string, bible: { characters: string; locations: string }, panelCount: number, customStyle?: string): string {
  const scene = sceneText.slice(0, 500).trim()
  const style = customStyle?.trim() || DEFAULT_AMBIENT_STYLE
  const parts = [style]

  // Panel layout instruction based on how many images we have
  if (panelCount <= 1) {
    parts.push("Single dramatic splash page, full bleed, one powerful moment.")
  } else if (panelCount === 2) {
    parts.push("Two-panel layout: top and bottom, showing cause and effect.")
  } else if (panelCount === 3) {
    parts.push("Three-panel strip: left to right, sequential action flow.")
  } else {
    parts.push(`${Math.min(panelCount, 6)}-panel grid layout, each panel a different beat of the scene, reading left-to-right top-to-bottom.`)
  }

  if (bible.characters) {
    parts.push(`Characters: ${bible.characters}.`)
  }
  if (bible.locations) {
    parts.push(`Setting: ${bible.locations}.`)
  }

  parts.push(`Scene action: ${scene}`)

  return parts.join(" ").slice(0, 1000)
}

// ─── Image generator + persistence ───

const AMBIENT_STORAGE_PREFIX = "ambient-focus-"

/** Get project-scoped storage keys */
function getProjectId(): string {
  try {
    const raw = localStorage.getItem("koza-projects")
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.state?.activeProjectId) return parsed.state.activeProjectId
    }
  } catch { /* ignore */ }
  return "default"
}

function getAmbientIndexKey(): string { return `koza-ambient-images-${getProjectId()}` }
function getAmbientHashesKey(): string { return `koza-ambient-hashes-${getProjectId()}` }

async function generateAmbientImage(prompt: string): Promise<{ url: string; blobKey: string } | null> {
  try {
    const res = await fetch("/api/nano-banana", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, model: IMAGE_MODEL }),
    })

    if (!res.ok) return null

    const blob = await res.blob()
    const blobKey = `${AMBIENT_STORAGE_PREFIX}${Date.now()}`
    await saveBlob(blobKey, blob)
    const url = URL.createObjectURL(blob)
    return { url, blobKey }
  } catch {
    return null
  }
}


/** Save image keys to localStorage for restore */
function saveAmbientIndex(keys: string[]) {
  try { localStorage.setItem(getAmbientIndexKey(), JSON.stringify(keys)) } catch { /* ignore */ }
}

function loadAmbientIndex(): string[] {
  try { return JSON.parse(localStorage.getItem(getAmbientIndexKey()) || "[]") } catch { return [] }
}

function saveAmbientHashes(hashes: Set<string>) {
  try { localStorage.setItem(getAmbientHashesKey(), JSON.stringify([...hashes])) } catch { /* ignore */ }
}

function loadAmbientHashes(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(getAmbientHashesKey()) || "[]")) } catch { return new Set() }
}

/** Restore saved images from IndexedDB */
async function restoreAmbientImages(): Promise<{ url: string; blobKey: string }[]> {
  const keys = loadAmbientIndex()
  const results: { url: string; blobKey: string }[] = []
  for (const key of keys) {
    const url = await loadBlob(key).catch(() => null)
    if (url) results.push({ url, blobKey: key })
  }
  return results
}

/** Simple string hash for dedup — takes first+last 200 chars to create a fingerprint */
function textFingerprint(text: string): string {
  const t = text.trim()
  const head = t.slice(0, 200)
  const tail = t.slice(-200)
  // Simple hash: length + first/last chars
  return `${t.length}:${head.slice(0, 40)}:${tail.slice(-40)}`
}

// ─── Get current scene context ───

/** Returns the text of the scene currently being written (last scene with recent edits) */
function useCurrentSceneInfo(): { text: string; heading: string } {
  const blocks = useScriptStore((s) => s.blocks)
  const scenes = useScenesStore((s) => s.scenes)

  if (scenes.length === 0) {
    return { text: blocks.map((b) => b.text).join("\n").slice(0, 800), heading: "" }
  }

  // Use the last scene as "current" — most likely where the cursor is
  const lastScene = scenes[scenes.length - 1]
  const sceneBlocks = lastScene.blockIds
    .map((id) => blocks.find((b) => b.id === id))
    .filter(Boolean)

  const heading = sceneBlocks.find((b) => b!.type === "scene_heading")?.text ?? ""
  const text = sceneBlocks.map((b) => b!.text).join("\n")

  return { text: text || blocks.map((b) => b.text).join("\n").slice(0, 800), heading }
}

function useBibleContext(): { characters: string; locations: string } {
  const characters = useBibleStore((s) => s.characters)
  const locations = useBibleStore((s) => s.locations)

  const charStr = characters
    .slice(0, 3)
    .map((c) => {
      const prompt = c.appearancePrompt?.trim()
      return prompt ? `${c.name}: ${prompt}` : c.name
    })
    .join("; ")

  const locStr = locations
    .slice(0, 2)
    .map((l) => {
      const prompt = l.appearancePrompt?.trim()
      return prompt ? `${l.name}: ${prompt}` : l.name
    })
    .join("; ")

  return { characters: charStr, locations: locStr }
}

// ─── Component ───

export function AmbientFocusMode() {
  const focusMode = useScreenplaySettings((s) => s.focusMode)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [images, setImages] = useState<{ url: string; blobKey: string }[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [restored, setRestored] = useState(false)

  const setIdleFade = useScreenplaySettings((s) => s.setIdleFade)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cooldownRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const generatedHashesRef = useRef<Set<string>>(loadAmbientHashes())
  /** Track last scene heading to detect scene changes */
  const lastHeadingRef = useRef("")
  /** Track last text length to detect significant writing */
  const lastTextLenRef = useRef(0)
  const imageCountRef = useRef(0)

  // Restore saved images on mount
  useEffect(() => {
    restoreAmbientImages().then((saved) => {
      if (saved.length > 0) {
        setImages(saved)
        setActiveIdx(saved.length - 1)
      }
      setRestored(true)
    })
  }, [])

  // Sync image count ref
  useEffect(() => { imageCountRef.current = images.length }, [images.length])

  // ─── Idle detection: fade out page after 60s of inactivity ───
  useEffect(() => {
    if (!focusMode) { setIdleFade(false); return }

    const resetIdle = () => {
      setIdleFade(false)
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => setIdleFade(true), 60_000)
    }

    resetIdle()
    window.addEventListener("keydown", resetIdle)
    window.addEventListener("mousemove", resetIdle)
    window.addEventListener("mousedown", resetIdle)
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      window.removeEventListener("keydown", resetIdle)
      window.removeEventListener("mousemove", resetIdle)
      window.removeEventListener("mousedown", resetIdle)
    }
  }, [focusMode])

  // When entering focus mode, show last image
  useEffect(() => {
    if (focusMode && images.length > 0) {
      setActiveIdx(images.length - 1)
    }
  }, [focusMode, images.length])

  const { text: sceneText, heading: sceneHeading } = useCurrentSceneInfo()
  const bible = useBibleContext()
  const ambientPrompt = useBibleStore((s) => s.ambientPrompt)
  const sceneTextRef = useRef(sceneText)
  const headingRef = useRef(sceneHeading)
  const bibleRef = useRef(bible)
  const ambientPromptRef = useRef(ambientPrompt)
  sceneTextRef.current = sceneText
  headingRef.current = sceneHeading
  bibleRef.current = bible
  ambientPromptRef.current = ambientPrompt

  // ─── Fullscreen ───

  useEffect(() => {
    if (focusMode && !isFullscreen) {
      document.documentElement.requestFullscreen?.().catch(() => {})
      setIsFullscreen(true)
    }
    if (!focusMode && isFullscreen) {
      document.exitFullscreen?.().catch(() => {})
      setIsFullscreen(false)
      // Keep images on exit (they're persisted)
    }
  }, [focusMode, isFullscreen])

  // Listen for browser fullscreen exit (Esc key)
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement && focusMode) {
        useScreenplaySettings.getState().toggleFocusMode()
        setIsFullscreen(false)
      }
    }
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [focusMode])

  // ─── Ambient generation ───

  const generatingRef = useRef(false)

  const tryGenerate = useCallback(async () => {
    if (generatingRef.current) return
    if (Date.now() < cooldownRef.current) return

    const currentText = sceneTextRef.current.trim()
    const currentHeading = headingRef.current.trim()
    if (!currentText || currentText.length < 20) return

    // ── Decide if we should generate ──
    const sceneChanged = currentHeading && currentHeading !== lastHeadingRef.current
    const significantWrite = Math.abs(currentText.length - lastTextLenRef.current) > 100
    const hash = textFingerprint(currentText)
    const alreadyGenerated = generatedHashesRef.current.has(hash)

    if (alreadyGenerated && !sceneChanged) {
      return // exact same text, no new scene
    }

    if (!sceneChanged && !significantWrite) {
      return // not enough new content
    }

    // ── Generate ──
    lastHeadingRef.current = currentHeading
    lastTextLenRef.current = currentText.length
    generatedHashesRef.current.add(hash)
    saveAmbientHashes(generatedHashesRef.current)

    generatingRef.current = true
    setGenerating(true)
    cooldownRef.current = Date.now() + GENERATION_COOLDOWN_MS

    const reason = sceneChanged ? "new scene" : "new text"
    const prompt = buildAmbientPrompt(currentText, bibleRef.current, imageCountRef.current + 1, ambientPromptRef.current)
    console.log(`[Ambient] Generating (${reason}):`, prompt.slice(0, 80) + "...")
    const result = await generateAmbientImage(prompt)

    if (result) {
      console.log("[Ambient] Image ready")
      setImages((prev) => {
        // Rolling window — keep last MAX_IMAGES_KEPT
        const next = [...prev, result]
        if (next.length > MAX_IMAGES_KEPT) {
          // Remove oldest, revoke its object URL
          const removed = next.shift()!
          URL.revokeObjectURL(removed.url)
        }
        saveAmbientIndex(next.map((img) => img.blobKey))
        return next
      })
      setTimeout(() => setImages((cur) => { setActiveIdx(cur.length - 1); return cur }), 500)
    } else {
      console.log("[Ambient] Generation failed")
    }

    generatingRef.current = false
    setGenerating(false)
  }, [])

  // Poll for changes while in focus mode
  useEffect(() => {
    if (!focusMode) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    // First generation after 2s
    const timer = setTimeout(tryGenerate, 2000)
    // Then every 15s
    intervalRef.current = setInterval(tryGenerate, 15_000)
    return () => {
      clearTimeout(timer)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [focusMode, tryGenerate])

  // ─── Crossfade between images ───

  useEffect(() => {
    if (images.length <= 1) return
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % images.length)
    }, 12_000)
    return () => clearInterval(timer)
  }, [images.length])

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        overflow: "hidden",
        backgroundColor: focusMode ? "#000" : "transparent",
        pointerEvents: "none",
        opacity: focusMode ? 1 : 0,
        transition: "opacity 1.5s ease-in-out",
      }}
    >
      {/* Ambient images — 110% scale to guarantee full bleed on any aspect ratio */}
      {images.map((img, i) => (
        <div
          key={img.blobKey}
          style={{
            position: "absolute",
            inset: "-5%",
            width: "110%",
            height: "110%",
            backgroundImage: `url(${img.url})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: i === activeIdx % images.length ? 0.15 : 0,
            transition: `opacity ${CROSSFADE_DURATION_MS}ms ease-in-out`,
          }}
        />
      ))}

      {/* Subtle vignette on edges — images stay vivid near borders */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.4) 100%)",
        }}
      />

      {/* Debug info removed — clean fullscreen */}
    </div>
  )
}
