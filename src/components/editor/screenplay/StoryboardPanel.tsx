"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { Clapperboard, Film, Grid, List, Loader2, MoreHorizontal, Plus, RefreshCw, Wand2 } from "lucide-react"
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTimelineStore, createTimelineShot } from "@/store/timeline"
import type { TimelineShot } from "@/store/timeline"
import { timelineShotToStoryboardView, createShotFromStoryboardDefaults } from "@/lib/storyboardBridge"
import { useScriptStore } from "@/store/script"
import { useScenesStore } from "@/store/scenes"
import { useNavigationStore } from "@/store/navigation"
import { breakdownScene } from "@/lib/jenkins"
import { saveBlob } from "@/lib/fileStorage"

const SHOT_SIZE_OPTIONS = ["WIDE", "MEDIUM", "CLOSE", "EXTREME CLOSE", "OVER SHOULDER", "POV", "INSERT", "AERIAL", "TWO SHOT"] as const
const CAMERA_MOTION_OPTIONS = ["Static", "Pan Left", "Pan Right", "Pan Up", "Tilt Down", "Push In", "Pull Out", "Track Left", "Track Right", "Track Around", "Dolly In", "Crane Up", "Crane Down", "Drone In", "Handheld", "Steadicam"] as const

type ViewMode = "scenes" | "board" | "list"

// ── Inline Editable Components ──────────────────────────────────

function InlineSelect({ value, options, onChange }: { value: string; options: readonly string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="cursor-pointer rounded bg-transparent px-0.5 text-left hover:bg-white/5 transition-colors">
        {value || options[0]}
      </button>
    )
  }
  return (
    <select
      autoFocus
      value={value}
      onChange={(e) => { onChange(e.target.value); setOpen(false) }}
      onBlur={() => setOpen(false)}
      className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px] uppercase text-[#ECE5D8] outline-none"
    >
      {options.map((opt) => <option key={opt} value={opt} className="bg-[#1a1d24] text-white">{opt}</option>)}
    </select>
  )
}

function InlineDuration({ value, onChange }: { value: string; onChange: (ms: number) => void }) {
  const [editing, setEditing] = useState(false)
  const numericVal = parseFloat(value) || 0
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="cursor-pointer rounded bg-transparent px-0.5 hover:bg-white/5 transition-colors">
        {value}
      </button>
    )
  }
  return (
    <input
      ref={inputRef}
      type="number"
      step="0.1"
      min="0.5"
      max="30"
      defaultValue={numericVal.toFixed(1)}
      onBlur={(e) => { onChange(parseFloat(e.target.value) * 1000); setEditing(false) }}
      onKeyDown={(e) => { if (e.key === "Enter") { onChange(parseFloat((e.target as HTMLInputElement).value) * 1000); setEditing(false) } }}
      className="w-12 rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px] text-[#B9AEA0] outline-none"
    />
  )
}

function InlineText({ value, onChange, placeholder, multiline }: { value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="w-full cursor-pointer truncate rounded bg-transparent px-0.5 text-left hover:bg-white/5 transition-colors">
        {value || <span className="text-white/20">{placeholder}</span>}
      </button>
    )
  }
  if (multiline) {
    return (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        rows={2}
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(e) => { onChange(e.target.value); setEditing(false) }}
        className="w-full resize-none rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px] text-[#B9AEA0] outline-none placeholder:text-white/20"
      />
    )
  }
  return (
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      type="text"
      defaultValue={value}
      placeholder={placeholder}
      onBlur={(e) => { onChange(e.target.value); setEditing(false) }}
      onKeyDown={(e) => { if (e.key === "Enter") { onChange((e.target as HTMLInputElement).value); setEditing(false) } }}
      className="w-full rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px] text-[#B9AEA0] outline-none placeholder:text-white/20"
    />
  )
}

// ── AI Image Generation ─────────────────────────────────────────

async function generateShotImage(shot: TimelineShot): Promise<string> {
  const rawPrompt = `Cinematic storyboard frame. ${shot.shotSize} shot. ${shot.caption}. ${shot.cameraMotion} camera. Film noir style, high contrast, dramatic lighting.`

  // Enhance prompt via Claude
  const promptRes = await fetch("/api/ambient-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description: rawPrompt }),
  })
  const enhancedPrompt = promptRes.ok ? (await promptRes.json()).prompt : rawPrompt

  // Generate image
  const imageRes = await fetch("/api/ambient-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: enhancedPrompt }),
  })

  if (!imageRes.ok) throw new Error(`Image generation failed: ${imageRes.status}`)

  const blob = await imageRes.blob()
  const blobKey = `shot-thumb-${shot.id}`
  await saveBlob(blobKey, blob)
  return URL.createObjectURL(blob)
}

interface StoryboardPanelProps {
  isOpen: boolean
  isExpanded: boolean
  panelWidth: number
  backgroundColor: string
  onClose: () => void
  onToggleExpanded: () => void
}

export function StoryboardPanel({
  isOpen,
  isExpanded,
  panelWidth,
  backgroundColor,
  onClose,
  onToggleExpanded,
}: StoryboardPanelProps) {
  const router = useRouter()
  const resolvedPanelWidth = isExpanded ? "100vw" : `${panelWidth}px`
  const shots = useTimelineStore((state) => state.shots)
  const addShot = useTimelineStore((state) => state.addShot)
  const updateShot = useTimelineStore((state) => state.updateShot)
  const reorderShot = useTimelineStore((state) => state.reorderShot)
  const [recentInsertedFrameId, setRecentInsertedFrameId] = useState<string | null>(null)
  const [draggedFrameId, setDraggedFrameId] = useState<string | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("board")
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set())
  const scenes = useScenesStore((s) => s.scenes)
  const selectedSceneId = useScenesStore((s) => s.selectedSceneId)
  const selectScene = useScenesStore((s) => s.selectScene)
  const requestScrollToBlock = useNavigationStore((s) => s.requestScrollToBlock)
  const requestHighlightBlock = useNavigationStore((s) => s.requestHighlightBlock)
  const scriptBlocks = useScriptStore((state) => state.blocks)
  const cardScale = 90
  const frames = useMemo(() => shots.map((shot, index) => timelineShotToStoryboardView(shot, index)), [shots])
  const scenario = useScriptStore((state) => state.scenario)
  const [jenkinsLoading, setJenkinsLoading] = useState(false)
  const [breakdownLoadingSceneId, setBreakdownLoadingSceneId] = useState<string | null>(null)

  const handleJenkinsBreakdown = useCallback(async () => {
    const text = scenario.trim()
    if (!text || jenkinsLoading) return
    setJenkinsLoading(true)
    try {
      const { shots: jenkinsShots } = await breakdownScene(text)
      for (const shot of jenkinsShots) {
        addShot({
          duration: shot.duration,
          type: shot.type,
          label: shot.label,
          notes: shot.notes,
        })
      }
    } catch (error) {
      console.error("Jenkins breakdown error:", error)
    } finally {
      setJenkinsLoading(false)
    }
  }, [scenario, jenkinsLoading, addShot])

  const handleSceneBreakdown = useCallback(async (scene: { id: string; blockIds: string[]; title: string }) => {
    if (breakdownLoadingSceneId) return
    setBreakdownLoadingSceneId(scene.id)
    try {
      const sceneText = scene.blockIds
        .map((bid) => scriptBlocks.find((b) => b.id === bid)?.text)
        .filter(Boolean)
        .join("\n")
      if (!sceneText.trim()) return
      const { shots: jenkinsShots } = await breakdownScene(sceneText, {
        sceneId: scene.id,
        blockIds: scene.blockIds,
      })
      const firstBlockId = scene.blockIds[0] ?? ""
      const lastBlockId = scene.blockIds[scene.blockIds.length - 1] ?? ""
      for (const shot of jenkinsShots) {
        addShot({
          duration: shot.duration,
          type: shot.type,
          label: shot.label,
          notes: shot.notes,
          shotSize: shot.shotSize ?? "",
          cameraMotion: shot.cameraMotion ?? "",
          caption: shot.caption ?? "",
          sceneId: scene.id,
          blockRange: firstBlockId && lastBlockId ? [firstBlockId, lastBlockId] : null,
          locked: true,
          sourceText: sceneText,
        })
      }
    } catch (error) {
      console.error("Scene breakdown error:", error)
    } finally {
      setBreakdownLoadingSceneId(null)
    }
  }, [breakdownLoadingSceneId, scriptBlocks, addShot])

  const handleSceneClick = useCallback((scene: { id: string; headingBlockId: string }) => {
    selectScene(selectedSceneId === scene.id ? null : scene.id)
    if (scene.headingBlockId) {
      requestScrollToBlock(scene.headingBlockId)
      requestHighlightBlock(scene.headingBlockId)
    }
  }, [selectScene, selectedSceneId, requestScrollToBlock, requestHighlightBlock])

  const handleGenerateImage = useCallback(async (shotId: string) => {
    const shot = shots.find((s) => s.id === shotId)
    if (!shot || generatingIds.has(shotId)) return
    setGeneratingIds((prev) => new Set(prev).add(shotId))
    try {
      const imageUrl = await generateShotImage(shot)
      updateShot(shotId, { thumbnailUrl: imageUrl })
    } catch (error) {
      console.error("Image generation error:", error)
    } finally {
      setGeneratingIds((prev) => { const next = new Set(prev); next.delete(shotId); return next })
    }
  }, [shots, generatingIds, updateShot])

  const nextFrame = useMemo(() => {
    return timelineShotToStoryboardView(
      createTimelineShot(createShotFromStoryboardDefaults(shots.length)),
      shots.length,
    )
  }, [shots.length])

  useEffect(() => {
    if (!recentInsertedFrameId) return

    const timer = window.setTimeout(() => {
      setRecentInsertedFrameId(null)
    }, 650)

    return () => window.clearTimeout(timer)
  }, [recentInsertedFrameId])

  const handleInsertFrameAt = (index: number) => {
    const defaults = createShotFromStoryboardDefaults(shots.length)
    const insertedFrameId = addShot({ ...defaults, order: index })
    setRecentInsertedFrameId(insertedFrameId)
    setDropTargetIndex(null)
  }

  const handleDragStart = (frameId: string) => {
    setDraggedFrameId(frameId)
  }

  const handleDragEnd = () => {
    setDraggedFrameId(null)
    setDropTargetIndex(null)
  }

  const handleDropAtIndex = (index: number) => {
    if (!draggedFrameId) return
    reorderShot(draggedFrameId, index)
    setDraggedFrameId(null)
    setDropTargetIndex(null)
  }

  const minCardWidth = isExpanded
    ? Math.round(248 + ((cardScale - 72) / 32) * 74)
    : Math.round(224 + ((cardScale - 72) / 32) * 30)
  const cardGap = isExpanded ? 14 : 12
  const sceneTitle = "SCENE 03 - Lonely man in mountains"
  const panelChrome = backgroundColor === "#0B0C10"
    ? "linear-gradient(180deg, rgba(16,18,24,0.98) 0%, rgba(12,13,18,0.98) 100%)"
    : `linear-gradient(180deg, ${backgroundColor} 0%, #0E1016 100%)`

  return (
    <aside
      aria-hidden={!isOpen}
      className="absolute inset-y-0 right-0 z-3 overflow-hidden transition-[width,transform,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{
        width: isOpen ? resolvedPanelWidth : 0,
        minWidth: isOpen ? resolvedPanelWidth : 0,
        height: "100%",
        opacity: isOpen ? 1 : 0,
        transform: isOpen ? "translateX(0)" : "translateX(108%)",
        pointerEvents: isOpen ? "auto" : "none",
      }}
    >
      <div
        className="relative flex h-full w-full flex-col overflow-hidden border-l border-white/10"
        style={{
          height: "100%",
          background: panelChrome,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-3 text-[#E5E0DB]">
          <div className="min-w-0 pr-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#8D919B]">Scene Engine</p>
            <p className="mt-1 truncate text-[16px] font-medium tracking-[0.01em] text-[#E7E3DC]">{sceneTitle}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleJenkinsBreakdown}
              disabled={jenkinsLoading || !scenario.trim()}
              className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/8 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[#E5E0DB] transition-colors hover:bg-amber-500/16 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Jenkins shot breakdown"
            >
              {jenkinsLoading ? <Loader2 size={12} className="animate-spin" /> : <Clapperboard size={12} />}
              {jenkinsLoading ? "Breaking down…" : "Jenkins Breakdown"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/timeline")}
              className="flex items-center gap-1.5 rounded-md border border-white/12 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[#E5E0DB] transition-colors hover:bg-white/6"
              aria-label="Open timeline page"
            >
              <Film size={12} />
              Timeline
            </button>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#BDAF9F] transition-colors hover:bg-white/6 hover:text-white"
              aria-label="More storyboard actions"
            >
              <MoreHorizontal size={16} />
            </button>
            <button
              type="button"
              onClick={onToggleExpanded}
              className="rounded-md border border-white/12 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[#E5E0DB] transition-colors hover:bg-white/6"
            >
              {isExpanded ? "Split view" : "Expand"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-white/12 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[#E5E0DB] transition-colors hover:bg-white/6"
            >
              Close
            </button>
          </div>
        </div>

        <div className="border-b border-white/6 px-4 py-3 text-[#E5E0DB]">
          <div className="flex items-center gap-2 text-[#9FA4AE]">
            <span className="rounded-md border border-white/8 bg-white/3 px-2 py-1 text-[10px] uppercase tracking-[0.16em]">Shots</span>
            <span className="rounded-md border border-white/8 bg-white/2 px-2 py-1 text-[10px] uppercase tracking-[0.16em]">Frames {frames.length}</span>
            <span className="mx-1 h-3 w-px bg-white/8" />
            <button
              type="button"
              onClick={() => setViewMode("scenes")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] uppercase tracking-[0.14em] transition-colors ${viewMode === "scenes" ? "bg-white/8 text-white" : "text-white/40 hover:text-white/60"}`}
            >
              <Clapperboard size={10} />
              Scenes
            </button>
            <button
              type="button"
              onClick={() => setViewMode("board")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] uppercase tracking-[0.14em] transition-colors ${viewMode === "board" ? "bg-white/8 text-white" : "text-white/40 hover:text-white/60"}`}
            >
              <Grid size={10} />
              Board
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] uppercase tracking-[0.14em] transition-colors ${viewMode === "list" ? "bg-white/8 text-white" : "text-white/40 hover:text-white/60"}`}
            >
              <List size={10} />
              Shot List
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4" style={{ overscrollBehaviorY: "contain" }}>
          {viewMode === "scenes" ? (
          <div className="flex flex-col gap-1.5">
            {scenes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Clapperboard size={28} className="mb-3 text-white/15" />
                <p className="text-[12px] text-[#7F8590]">No scenes yet</p>
                <p className="mt-1 text-[10px] text-white/25">Add a scene heading (INT./EXT.) to your script</p>
              </div>
            ) : (
              scenes.map((scene) => {
                const isSelected = selectedSceneId === scene.id
                const relatedShots = shots.filter((s) => s.sceneId === scene.id)
                const isBreaking = breakdownLoadingSceneId === scene.id
                return (
                  <div
                    key={scene.id}
                    className={`flex items-stretch gap-3 rounded-lg px-3 py-2 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-white/5 border-l-2"
                        : "hover:bg-white/3 border-l-2 border-transparent"
                    }`}
                    style={isSelected ? { borderLeftColor: scene.color } : undefined}
                    onClick={() => handleSceneClick(scene)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleSceneClick(scene) }}
                  >
                    <div
                      className="w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: scene.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[#8D919B]">
                        Scene {scene.index}
                      </p>
                      <p className="mt-0.5 truncate text-[13px] font-medium text-[#E7E3DC]">
                        {scene.title}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-[10px] text-[#7F8590]">
                        <span>{scene.blockIds.length} blocks</span>
                        <span>{relatedShots.length} shots</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleSceneBreakdown(scene) }}
                        disabled={isBreaking}
                        className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[9px] uppercase tracking-[0.12em] text-[#7F8590] transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
                        aria-label={`Breakdown scene ${scene.index}`}
                      >
                        {isBreaking ? <Loader2 size={10} className="animate-spin" /> : <Clapperboard size={10} />}
                        {relatedShots.length > 0 ? "Re-breakdown" : "Breakdown"}
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
          ) : viewMode === "board" ? (
          <div
            className="grid min-h-full"
            style={{
              gap: cardGap,
              gridTemplateColumns: isExpanded
                ? `repeat(auto-fill, minmax(${minCardWidth}px, 1fr))`
                : "minmax(0, 1fr)",
              alignContent: "start",
              transition: "gap 240ms ease, grid-template-columns 240ms ease",
            }}
          >
            {frames.map((frame, index) => {
              const shot = shots[index]
              const isGenerating = shot ? generatingIds.has(shot.id) : false
              return (
              <Fragment key={frame.id}>
                <div
                  className={`group relative overflow-hidden rounded-[14px] border border-white/6 bg-[#111317] p-2 shadow-[0_20px_45px_rgba(0,0,0,0.28)] transition-all duration-200 ${recentInsertedFrameId === frame.id ? "storyboard-card-enter" : ""} ${dropTargetIndex === index || dropTargetIndex === index + 1 ? "border-[#D8C4A5]/40 shadow-[0_0_0_1px_rgba(216,196,165,0.18),0_20px_45px_rgba(0,0,0,0.34)]" : "hover:-translate-y-px hover:border-white/10 hover:bg-[#14171C]"}`}
                  draggable
                  onDragStart={() => handleDragStart(frame.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(event) => {
                    event.preventDefault()
                    if (!draggedFrameId || draggedFrameId === frame.id) return
                    setDropTargetIndex(index + (event.nativeEvent.offsetX > event.currentTarget.clientWidth / 2 ? 1 : 0))
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    handleDropAtIndex(index + (event.nativeEvent.offsetX > event.currentTarget.clientWidth / 2 ? 1 : 0))
                  }}
                  style={{
                    opacity: draggedFrameId === frame.id ? 0.46 : 1,
                    transition: "box-shadow 240ms ease, transform 240ms ease, border-color 240ms ease, background-color 240ms ease",
                  }}
                >
                  <div className="relative flex h-full flex-col text-[#E5E0DB]">
                    {/* Image area with hover overlay */}
                    <div className="relative overflow-hidden rounded-[10px] border border-white/8 bg-[#0E1014] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" style={{ aspectRatio: "16 / 8.7" }}>
                      <Image
                        src={shot?.thumbnailUrl || frame.svg}
                        alt={`${frame.meta.shot} frame preview`}
                        width={320}
                        height={320}
                        unoptimized
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        draggable={false}
                      />
                      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,10,14,0.04)_0%,rgba(8,10,14,0.12)_52%,rgba(8,10,14,0.34)_100%)]" />
                      <div className="absolute left-2 top-2 rounded-md border border-white/10 bg-black/30 px-1.5 py-1 text-[9px] uppercase tracking-[0.18em] text-[#EAE2D7] backdrop-blur-sm">
                        Shot {String(index + 1).padStart(2, "0")}
                      </div>

                      {/* AI generation overlay */}
                      {isGenerating ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                          <Loader2 size={28} className="animate-spin text-white/70" />
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => shot && handleGenerateImage(shot.id)}
                            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-white/90 backdrop-blur-sm transition-colors hover:bg-white/10"
                          >
                            <Wand2 size={14} />
                            Generate
                          </button>
                          {shot?.thumbnailUrl && (
                            <button
                              type="button"
                              onClick={() => shot && handleGenerateImage(shot.id)}
                              className="flex items-center gap-1 rounded-lg border border-white/15 bg-black/50 px-2 py-1.5 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/10 hover:text-white/90"
                            >
                              <RefreshCw size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Editable metadata */}
                    <div className="mt-2 flex items-start justify-between gap-3 px-0.5 pb-0.5 pt-0.5 text-[#D7CDC1]">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center text-[11px] uppercase tracking-[0.08em] text-[#ECE5D8]">
                          <InlineSelect
                            value={frame.meta.shot}
                            options={SHOT_SIZE_OPTIONS}
                            onChange={(v) => shot && updateShot(shot.id, { shotSize: v })}
                          />
                          <span className="mx-1.5 text-white/20">-</span>
                          <span className="normal-case tracking-normal text-[#B9AEA0]">
                            <InlineSelect
                              value={frame.meta.motion}
                              options={CAMERA_MOTION_OPTIONS}
                              onChange={(v) => shot && updateShot(shot.id, { cameraMotion: v })}
                            />
                          </span>
                          <span className="mx-1.5 text-white/20">-</span>
                          <span className="normal-case tracking-normal text-[#B9AEA0]">
                            <InlineDuration
                              value={frame.meta.duration}
                              onChange={(ms) => shot && updateShot(shot.id, { duration: ms })}
                            />
                          </span>
                        </div>
                        <div className="mt-1 text-[10px] text-[#7F8590]">
                          <InlineText
                            value={frame.meta.caption}
                            onChange={(v) => shot && updateShot(shot.id, { caption: v, label: `${frame.meta.shot} — ${v}` })}
                            placeholder="Shot caption..."
                          />
                        </div>
                        <div className="mt-1 text-[10px] text-[#5F636B]">
                          <InlineText
                            value={shot?.notes || ""}
                            onChange={(v) => shot && updateShot(shot.id, { notes: v })}
                            placeholder="Director's notes..."
                            multiline
                          />
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => router.push("/timeline")}
                          className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[9px] uppercase tracking-[0.12em] transition-colors text-[#7F8590] hover:bg-white/5 hover:text-white"
                          aria-label={`Go to timeline for shot ${index + 1}`}
                        >
                          <Film size={10} />
                          Timeline
                        </button>
                        <button
                          type="button"
                          className="flex h-6 w-6 items-center justify-center rounded-md text-[#7F8590] transition-colors hover:bg-white/5 hover:text-white"
                          aria-label={`More actions for shot ${index + 1}`}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </Fragment>
              )
            })}

            <button
              type="button"
              onClick={() => handleInsertFrameAt(frames.length)}
              className={`flex min-h-29 items-center justify-center rounded-[14px] border border-dashed px-4 py-5 text-[#D7CDC1] transition-colors hover:bg-[#171A20] hover:text-white ${dropTargetIndex === frames.length ? "border-[#D8C4A5]/55 bg-[#171A20]" : "border-white/10 bg-[#12151A]"}`}
              onDragOver={(event) => {
                event.preventDefault()
                if (draggedFrameId) setDropTargetIndex(frames.length)
              }}
              onDragLeave={() => {
                if (dropTargetIndex === frames.length) setDropTargetIndex(null)
              }}
              onDrop={(event) => {
                event.preventDefault()
                handleDropAtIndex(frames.length)
              }}
              style={{
                transition: "background-color 180ms ease, color 180ms ease, border-color 180ms ease",
              }}
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/3 text-[#E7E3DC]">
                  <Plus size={15} />
                </span>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#E7E3DC]">Add Shot</p>
                  <p className="mt-1 text-[10px] text-[#7F8590]">Insert {nextFrame.title.toLowerCase()} to the sequence</p>
                </div>
              </div>
            </button>
          </div>
          ) : (
          /* Shot List (table) view */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] text-[#D7CDC1]">
              <thead>
                <tr className="border-b border-white/8 text-[9px] uppercase tracking-[0.18em] text-[#7F8590]">
                  <th className="px-2 py-2 font-medium">#</th>
                  <th className="px-2 py-2 font-medium">Shot Size</th>
                  <th className="px-2 py-2 font-medium">Caption</th>
                  <th className="px-2 py-2 font-medium">Motion</th>
                  <th className="px-2 py-2 font-medium">Duration</th>
                  <th className="px-2 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {frames.map((frame, index) => {
                  const shot = shots[index]
                  return (
                    <tr key={frame.id} className="border-b border-white/5 transition-colors hover:bg-white/3">
                      <td className="px-2 py-1.5 text-[#7F8590]">{String(index + 1).padStart(2, "0")}</td>
                      <td className="px-2 py-1.5 uppercase">
                        <InlineSelect
                          value={frame.meta.shot}
                          options={SHOT_SIZE_OPTIONS}
                          onChange={(v) => shot && updateShot(shot.id, { shotSize: v })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <InlineText
                          value={frame.meta.caption}
                          onChange={(v) => shot && updateShot(shot.id, { caption: v, label: `${frame.meta.shot} — ${v}` })}
                          placeholder="Caption..."
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <InlineSelect
                          value={frame.meta.motion}
                          options={CAMERA_MOTION_OPTIONS}
                          onChange={(v) => shot && updateShot(shot.id, { cameraMotion: v })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <InlineDuration
                          value={frame.meta.duration}
                          onChange={(ms) => shot && updateShot(shot.id, { duration: ms })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <InlineText
                          value={shot?.notes || ""}
                          onChange={(v) => shot && updateShot(shot.id, { notes: v })}
                          placeholder="Notes..."
                          multiline
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>

        <style jsx>{`
          .storyboard-card-enter {
            animation: storyboard-card-enter 420ms cubic-bezier(0.22, 1, 0.36, 1);
          }

          @keyframes storyboard-card-enter {
            0% {
              opacity: 0;
              transform: translateY(10px) scale(0.97);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}</style>
      </div>
    </aside>
  )
}