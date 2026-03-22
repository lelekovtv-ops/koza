"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { BookOpen, Camera, Clapperboard, Film, Grid, Image as ImageIcon, List, Loader2, MoreHorizontal, Plus, RefreshCw, Wand2 } from "lucide-react"
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createTimelineShot, useTimelineStore } from "@/store/timeline"
import type { TimelineShot } from "@/store/timeline"
import { timelineShotToStoryboardView, createShotFromStoryboardDefaults } from "@/lib/storyboardBridge"
import { useScriptStore } from "@/store/script"
import { useScenesStore } from "@/store/scenes"
import { useNavigationStore } from "@/store/navigation"
import { breakdownScene } from "@/lib/jenkins"
import { saveBlob } from "@/lib/fileStorage"
import { convertReferenceImagesToDataUrls, getShotGenerationReferenceImages } from "@/lib/imageGenerationReferences"
import { buildImagePrompt, buildVideoPrompt, getReferencedBibleEntries } from "@/lib/promptBuilder"
import { ProjectStylePicker } from "@/components/ui/ProjectStylePicker"
import { useBibleStore } from "@/store/bible"
import { useBoardStore } from "@/store/board"
import { devlog } from "@/store/devlog"
import { useLibraryStore } from "@/store/library"
import { useProjectsStore } from "@/store/projects"

const SHOT_SIZE_OPTIONS = ["WIDE", "MEDIUM", "CLOSE", "EXTREME CLOSE", "OVER SHOULDER", "POV", "INSERT", "AERIAL", "TWO SHOT"] as const
const CAMERA_MOTION_OPTIONS = ["Static", "Pan Left", "Pan Right", "Pan Up", "Tilt Down", "Push In", "Pull Out", "Track Left", "Track Right", "Track Around", "Dolly In", "Crane Up", "Crane Down", "Drone In", "Handheld", "Steadicam"] as const

type ViewMode = "scenes" | "board" | "list" | "inspector"
type EditableShotField = "caption" | "directorNote" | "cameraNote" | "imagePrompt" | "videoPrompt"

const IMAGE_GEN_MODELS = [
  { id: "gpt-image", label: "GPT Image", price: "$0.04" },
  { id: "nano-banana", label: "NB1", price: "$0.039" },
  { id: "nano-banana-2", label: "NB2", price: "$0.045" },
  { id: "nano-banana-pro", label: "NB Pro", price: "$0.13" },
] as const

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

async function generateShotImage(
  shot: TimelineShot,
  allShots: TimelineShot[],
): Promise<string> {
  const { characters, locations } = useBibleStore.getState()
  const { selectedImageGenModel, projectStyle } = useBoardStore.getState()
  const selectedModel = selectedImageGenModel || "nano-banana-2"
  const start = Date.now()
  const group = `generate-${shot.id}`
  const references = getShotGenerationReferenceImages(shot, characters, locations)
  const referenceImages = await convertReferenceImagesToDataUrls(references)
  const { characters: mentionedChars, location } = getReferencedBibleEntries(shot, characters, locations)
  const charRefs = mentionedChars
    .map((character) => `${character.name}: ${character.appearancePrompt || character.description || "no description"}`)
    .join("\n")
  const locRef = location?.appearancePrompt || location?.description || location?.name || ""

  devlog.image("image_start", `Generate: ${shot.label}`, "", {
    shotId: shot.id,
    shotSize: shot.shotSize,
    model: selectedModel,
  }, group)

  const referenceInstruction = referenceImages.length > 0
    ? "Use the provided reference images as hard visual anchors. Preserve the exact face identity, hair, costume silhouette, proportions, and environment design from those references. Do not redesign recurring characters or locations."
    : ""
  const prompt = [
    buildImagePrompt(shot, allShots, characters, locations, projectStyle),
    referenceInstruction,
  ].filter(Boolean).join("\n\n")

  devlog.image("image_prompt", "Image prompt", prompt, {
    promptLength: prompt.length,
  }, group)

  devlog.image("image_bible_inject", "Bible data injected", `Characters: ${charRefs || "none"}\nLocation: ${locRef || "none"}`, {
    characterCount: mentionedChars.length,
    hasLocation: !!locRef,
  }, group)

  devlog.image("image_style_inject", "Style", projectStyle, {}, group)

  let apiUrl: string
  let body: { prompt: string; model?: string; referenceImages?: string[] }

  if (selectedModel === "gpt-image") {
    apiUrl = "/api/gpt-image"
    body = { prompt, referenceImages }
  } else {
    apiUrl = "/api/nano-banana"
    body = { prompt, model: selectedModel, referenceImages }
  }

  devlog.image("image_api_call", `API call: ${apiUrl}`, JSON.stringify(body, null, 2), {
    model: selectedModel,
    endpoint: apiUrl,
  }, group)

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || `Generation failed: ${response.status}`)
    }

    const blob = await response.blob()
    const blobKey = `shot-thumb-${shot.id}`
    await saveBlob(blobKey, blob)

    const projectId = useProjectsStore.getState().activeProjectId || "global"
    const objectUrl = URL.createObjectURL(blob)

    useLibraryStore.getState().addFile({
      id: blobKey,
      name: `${shot.label || "Shot"} — generated.png`,
      type: "image",
      mimeType: "image/png",
      size: blob.size,
      url: objectUrl,
      thumbnailUrl: objectUrl,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: ["generated", "storyboard"],
      projectId,
      folder: "/storyboard",
      origin: "generated",
    })

    devlog.image("image_result", `Generated in ${Date.now() - start}ms`, "", {
      timing: Date.now() - start,
      blobSize: blob.size,
      model: selectedModel,
    }, group)

    console.log(`[KOZA] Image generated in ${Date.now() - start}ms via ${selectedModel}`)

    return objectUrl
  } catch (error) {
    devlog.image("image_error", "Generation failed", String(error), {
      shotId: shot.id,
      model: selectedModel,
    }, group)
    throw error
  }
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
  const reorderShots = useTimelineStore((state) => state.reorderShots)
  const [recentInsertedFrameId, setRecentInsertedFrameId] = useState<string | null>(null)
  const [draggedFrameId, setDraggedFrameId] = useState<string | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("board")
  const [expandedShotId, setExpandedShotId] = useState<string | null>(null)
  const [editingShotField, setEditingShotField] = useState<{ shotId: string; field: EditableShotField } | null>(null)
  const [editingShotDraft, setEditingShotDraft] = useState("")
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set())
  const [breakdownWarning, setBreakdownWarning] = useState<string | null>(null)
  const scenes = useScenesStore((s) => s.scenes)
  const selectedSceneId = useScenesStore((s) => s.selectedSceneId)
  const selectScene = useScenesStore((s) => s.selectScene)
  const requestScrollToBlock = useNavigationStore((s) => s.requestScrollToBlock)
  const requestHighlightBlock = useNavigationStore((s) => s.requestHighlightBlock)
  const scriptBlocks = useScriptStore((state) => state.blocks)
  const selectedImageGenModel = useBoardStore((state) => state.selectedImageGenModel)
  const setSelectedImageGenModel = useBoardStore((state) => state.setSelectedImageGenModel)
  const projectStyle = useBoardStore((state) => state.projectStyle)
  const setProjectStyle = useBoardStore((state) => state.setProjectStyle)
  const characters = useBibleStore((state) => state.characters)
  const locations = useBibleStore((state) => state.locations)
  const cardScale = 90
  const frames = useMemo(() => shots.map((shot, index) => timelineShotToStoryboardView(shot, index)), [shots])
  const scenario = useScriptStore((state) => state.scenario)
  const [jenkinsLoading, setJenkinsLoading] = useState(false)
  const [breakdownLoadingSceneId, setBreakdownLoadingSceneId] = useState<string | null>(null)
  const inspectorShots = useMemo(
    () => (selectedSceneId ? shots.filter((shot) => shot.sceneId === selectedSceneId) : shots),
    [shots, selectedSceneId]
  )

  const startEditingShotField = useCallback((shot: TimelineShot, field: EditableShotField, value: string) => {
    setEditingShotField({ shotId: shot.id, field })
    setEditingShotDraft(value)
  }, [])

  const commitEditingShotField = useCallback((shotId: string) => {
    setEditingShotField((current) => {
      if (!current || current.shotId !== shotId) return current

      updateShot(shotId, {
        [current.field]: editingShotDraft,
      } as Partial<TimelineShot>)

      return null
    })
    setEditingShotDraft("")
  }, [editingShotDraft, updateShot])

  const replaceSceneShots = useCallback((
    sceneId: string,
    sceneText: string,
    sceneBlockIds: string[],
    jenkinsShots: Array<{
      label: string
      type: "image"
      duration: number
      notes: string
      shotSize?: string
      cameraMotion?: string
      caption?: string
      directorNote?: string
      cameraNote?: string
      videoPrompt?: string
      imagePrompt?: string
      visualDescription?: string
    }>,
  ) => {
    const firstBlockId = sceneBlockIds[0] ?? ""
    const lastBlockId = sceneBlockIds[sceneBlockIds.length - 1] ?? ""
    const preservedShots = useTimelineStore.getState().shots.filter((shot) => shot.sceneId !== sceneId)
    const replacementShots = jenkinsShots.map((shot) => createTimelineShot({
      label: shot.label,
      shotSize: shot.shotSize ?? "",
      cameraMotion: shot.cameraMotion ?? "",
      duration: shot.duration,
      caption: shot.caption ?? "",
      directorNote: shot.directorNote ?? "",
      cameraNote: shot.cameraNote ?? "",
      imagePrompt: shot.imagePrompt ?? "",
      videoPrompt: shot.videoPrompt ?? "",
      visualDescription: shot.visualDescription ?? "",
      notes: shot.notes,
      type: shot.type,
      sceneId,
      blockRange: firstBlockId && lastBlockId ? [firstBlockId, lastBlockId] : null,
      locked: true,
      sourceText: sceneText,
    }))

    reorderShots([...preservedShots, ...replacementShots])
    selectScene(sceneId)
    setViewMode("board")
    setExpandedShotId(replacementShots[0]?.id ?? null)

    return replacementShots.length
  }, [reorderShots, selectScene])

  const handleJenkinsBreakdown = useCallback(async () => {
    const text = scenario.trim()
    if (!text || jenkinsLoading) return
    setJenkinsLoading(true)
    try {
      const bible = {
        characters: characters.map((character) => ({
          name: character.name,
          description: character.description,
          appearancePrompt: character.appearancePrompt,
        })),
        locations: locations.map((location) => ({
          name: location.name,
          description: location.description,
          appearancePrompt: location.appearancePrompt,
          intExt: location.intExt,
        })),
      }
      const { shots: jenkinsShots, diagnostics } = await breakdownScene(text, { bible, style: projectStyle })

      if (diagnostics.usedFallback && shots.length > 0) {
        const warning = "Breakdown switched to fallback mode. Existing storyboard shots were preserved to avoid overwriting the stronger result."
        setBreakdownWarning(warning)
        devlog.warn("Storyboard preserved existing shots", warning, diagnostics)
        return
      }

      for (const shot of jenkinsShots) {
        addShot({
          label: shot.label,
          shotSize: shot.shotSize ?? "",
          cameraMotion: shot.cameraMotion ?? "",
          duration: shot.duration,
          caption: shot.caption ?? "",
          directorNote: shot.directorNote ?? "",
          cameraNote: shot.cameraNote ?? "",
          imagePrompt: shot.imagePrompt ?? "",
          videoPrompt: shot.videoPrompt ?? "",
          visualDescription: shot.visualDescription ?? "",
          notes: shot.notes,
          type: shot.type,
        })
      }
      setBreakdownWarning(
        diagnostics.usedFallback
          ? "Breakdown completed in fallback mode. Result was added, but wording may be flatter than a full AI pass."
          : null,
      )
      setViewMode("board")
      setExpandedShotId(jenkinsShots[0] ? useTimelineStore.getState().shots.at(-jenkinsShots.length)?.id ?? null : null)
    } catch (error) {
      console.error("Jenkins breakdown error:", error)
    } finally {
      setJenkinsLoading(false)
    }
  }, [scenario, jenkinsLoading, addShot, characters, locations, projectStyle, shots])

  const handleSceneBreakdown = useCallback(async (scene: { id: string; blockIds: string[]; title: string }) => {
    if (breakdownLoadingSceneId) return
    setBreakdownLoadingSceneId(scene.id)
    try {
      const sceneText = scene.blockIds
        .map((bid) => scriptBlocks.find((b) => b.id === bid)?.text)
        .filter(Boolean)
        .join("\n")
      if (!sceneText.trim()) return
      const bible = {
        characters: characters.map((character) => ({
          name: character.name,
          description: character.description,
          appearancePrompt: character.appearancePrompt,
        })),
        locations: locations.map((location) => ({
          name: location.name,
          description: location.description,
          appearancePrompt: location.appearancePrompt,
          intExt: location.intExt,
        })),
      }
      const existingSceneShots = shots.filter((shot) => shot.sceneId === scene.id)
      const { shots: jenkinsShots, diagnostics } = await breakdownScene(sceneText, {
        sceneId: scene.id,
        blockIds: scene.blockIds,
        bible,
        style: projectStyle,
      })

      if (diagnostics.usedFallback && existingSceneShots.length > 0) {
        const warning = `Scene ${scene.title} used fallback mode. Existing scene shots were preserved to avoid replacing a better storyboard result.`
        setBreakdownWarning(warning)
        devlog.warn("Scene breakdown preserved existing shots", warning, {
          ...diagnostics,
          sceneId: scene.id,
          existingShotCount: existingSceneShots.length,
        })
        selectScene(scene.id)
        setViewMode("board")
        setExpandedShotId(existingSceneShots[0]?.id ?? null)
        return
      }

      replaceSceneShots(scene.id, sceneText, scene.blockIds, jenkinsShots)
      setBreakdownWarning(
        diagnostics.usedFallback
          ? `Scene ${scene.title} completed in fallback mode. Existing shots were replaced because there was no prior scene result to protect.`
          : null,
      )
    } catch (error) {
      console.error("Scene breakdown error:", error)
    } finally {
      setBreakdownLoadingSceneId(null)
    }
  }, [breakdownLoadingSceneId, scriptBlocks, characters, locations, projectStyle, replaceSceneShots, shots, selectScene])

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
      const objectUrl = await generateShotImage(shot, shots)

      updateShot(shotId, {
        thumbnailUrl: objectUrl,
        thumbnailBlobKey: `shot-thumb-${shot.id}`,
      })
    } catch (error) {
      console.error("Image generation error:", error)
    } finally {
      setGeneratingIds((prev) => { const next = new Set(prev); next.delete(shotId); return next })
    }
  }, [shots, generatingIds, updateShot])

  const nextFrameLabel = `shot ${frames.length + 1}`

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
              onClick={() => router.push("/bible")}
              className="flex items-center gap-1.5 rounded-md border border-white/12 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[#E5E0DB] transition-colors hover:bg-white/6"
              aria-label="Open bible page"
            >
              <BookOpen size={12} />
              Bible
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
            <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1">
              <span className="px-1 text-[8px] uppercase tracking-wider text-white/30">Model:</span>
              {IMAGE_GEN_MODELS.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => setSelectedImageGenModel(model.id)}
                  title={`${model.label} ${model.price}`}
                  className={`rounded px-2 py-1 text-[9px] transition-colors ${
                    selectedImageGenModel === model.id
                      ? "bg-[#D4A853]/20 text-[#D4A853]"
                      : "text-white/40 hover:text-white/60"
                  }`}
                >
                  {model.label}
                </button>
              ))}
            </div>
            <ProjectStylePicker projectStyle={projectStyle} setProjectStyle={setProjectStyle} />
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
            <button
              type="button"
              onClick={() => setViewMode("inspector")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] uppercase tracking-[0.14em] transition-colors ${viewMode === "inspector" ? "bg-white/8 text-white" : "text-white/40 hover:text-white/60"}`}
            >
              <BookOpen size={10} />
              Inspector
            </button>
          </div>
        </div>

        {breakdownWarning ? (
          <div className="border-b border-amber-500/20 bg-amber-500/8 px-4 py-3 text-[11px] text-[#E8D3A2]">
            {breakdownWarning}
          </div>
        ) : null}

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
          ) : viewMode === "board" ? shots.length === 0 ? (
          <div className="flex min-h-full flex-col items-center justify-center py-16 text-center">
            <Grid size={28} className="mb-3 text-white/15" />
            <p className="text-[12px] text-[#7F8590]">No shots yet. Use Scenes tab to breakdown your screenplay.</p>
          </div>
          ) : (
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
              const previewSrc = shot?.thumbnailUrl || frame.svg || null
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
                    <div className="relative overflow-hidden rounded-[10px] border border-white/8 bg-[#0E1014] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" style={{ aspectRatio: "16 / 8.7" }}>
                      {previewSrc ? (
                        <Image
                          src={previewSrc}
                          alt={`${frame.meta.shot} frame preview`}
                          width={320}
                          height={320}
                          unoptimized
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                          draggable={false}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_58%),linear-gradient(180deg,#151922_0%,#0E1014_100%)] px-6 text-center">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-[#8D919B]">No image yet</p>
                            <p className="mt-1 text-[11px] text-[#C3B8AA]">Run Breakdown or Generate to create shot artwork.</p>
                          </div>
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,10,14,0.04)_0%,rgba(8,10,14,0.12)_52%,rgba(8,10,14,0.34)_100%)]" />
                      <div className="absolute left-2 top-2 rounded-md border border-white/10 bg-black/30 px-1.5 py-1 text-[9px] uppercase tracking-[0.18em] text-[#EAE2D7] backdrop-blur-sm">
                        Shot {String(index + 1).padStart(2, "0")}
                      </div>

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
                  <p className="mt-1 text-[10px] text-[#7F8590]">Insert {nextFrameLabel} to the sequence</p>
                </div>
              </div>
            </button>
          </div>
          ) : viewMode === "inspector" ? (
          <div className="flex flex-col gap-2">
            {inspectorShots.length === 0 ? (
              <div className="flex min-h-full flex-col items-center justify-center py-16 text-center">
                <BookOpen size={28} className="mb-3 text-white/15" />
                <p className="text-[12px] text-[#7F8590]">No shots to inspect yet.</p>
              </div>
            ) : (
              inspectorShots.map((shot, index) => {
                const isExpanded = expandedShotId === shot.id
                const resolvedShot = editingShotField?.shotId === shot.id
                  ? { ...shot, [editingShotField.field]: editingShotDraft }
                  : shot
                const imagePrompt = buildImagePrompt(resolvedShot, inspectorShots, characters, locations, projectStyle)
                const videoPrompt = buildVideoPrompt(resolvedShot, characters, locations, projectStyle)
                const refs = getReferencedBibleEntries(resolvedShot, characters, locations)
                const previewSrc = shot.thumbnailUrl || shot.svg || null
                const durationLabel = `${(shot.duration / 1000).toFixed(1)}s`

                return (
                  <div
                    key={shot.id}
                    className={`mb-2 overflow-hidden rounded-xl border transition-colors ${isExpanded ? "border-white/15 bg-white/3" : "border-white/8 bg-white/2 hover:bg-white/4"}`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedShotId(isExpanded ? null : shot.id)}
                      className="flex w-full items-center gap-3 px-3 py-3 text-left"
                    >
                      <div className="relative h-9 w-16 overflow-hidden rounded-md border border-white/8 bg-white/3">
                        {previewSrc ? (
                          <Image src={previewSrc} alt={shot.label || `Shot ${index + 1}`} fill unoptimized className="object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-[0.16em] text-white/25">
                            No Img
                          </div>
                        )}
                      </div>
                      <div className="w-8 shrink-0 text-[16px] font-medium tracking-[0.14em] text-[#E7E3DC]">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-[#E7E3DC]">
                          {shot.label || `Shot ${index + 1}`}
                        </p>
                        <p className="mt-1 truncate text-[10px] text-white/35">
                          {shot.shotSize || "WIDE"} · {shot.cameraMotion || "Static"} · {durationLabel}
                        </p>
                      </div>
                      <div className={`shrink-0 text-[16px] text-white/40 transition-transform ${isExpanded ? "rotate-90" : "rotate-0"}`}>
                        ▸
                      </div>
                    </button>

                    {isExpanded ? (
                      <div className="grid gap-3 border-t border-white/8 px-3 pb-3 pt-2">
                        <section className="grid gap-1.5">
                          <div className="flex items-center gap-2">
                            <BookOpen size={12} className="text-white/35" />
                            <p className="text-[10px] uppercase tracking-wider text-white/30">Литературный</p>
                          </div>
                          {editingShotField?.shotId === shot.id && editingShotField.field === "caption" ? (
                            <textarea
                              autoFocus
                              rows={4}
                              value={editingShotDraft}
                              onChange={(event) => setEditingShotDraft(event.target.value)}
                              onBlur={() => commitEditingShotField(shot.id)}
                              className="w-full resize-y rounded-lg bg-white/3 p-3 text-[13px] text-white/80 outline-none ring-1 ring-inset ring-white/10"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditingShotField(shot, "caption", shot.caption || "")}
                              className="w-full rounded-lg bg-white/3 p-3 text-left text-[13px] text-white/80 transition-colors hover:bg-white/4"
                            >
                              <span className="whitespace-pre-wrap">{resolvedShot.caption || shot.label || "Нет описания кадра."}</span>
                            </button>
                          )}
                        </section>

                        <section className="grid gap-1.5">
                          <div className="flex items-center gap-2">
                            <Clapperboard size={12} className="text-white/35" />
                            <p className="text-[10px] uppercase tracking-wider text-white/30">Режиссёрский</p>
                          </div>
                          {editingShotField?.shotId === shot.id && editingShotField.field === "directorNote" ? (
                            <textarea
                              autoFocus
                              rows={4}
                              value={editingShotDraft}
                              onChange={(event) => setEditingShotDraft(event.target.value)}
                              onBlur={() => commitEditingShotField(shot.id)}
                              className="w-full resize-y rounded-lg bg-white/3 p-3 text-[12px] leading-5 text-white/60 outline-none ring-1 ring-inset ring-white/10"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditingShotField(shot, "directorNote", shot.directorNote || "")}
                              className="w-full rounded-lg bg-white/3 p-3 text-left text-[12px] leading-5 text-white/60 transition-colors hover:bg-white/4"
                            >
                              <span className="whitespace-pre-wrap">{resolvedShot.directorNote || "Нет режиссёрской заметки."}</span>
                            </button>
                          )}
                        </section>

                        <section className="grid gap-1.5">
                          <div className="flex items-center gap-2">
                            <Camera size={12} className="text-amber-400/70" />
                            <p className="text-[10px] uppercase tracking-wider text-white/30">Операторский</p>
                          </div>
                          {editingShotField?.shotId === shot.id && editingShotField.field === "cameraNote" ? (
                            <textarea
                              autoFocus
                              rows={5}
                              value={editingShotDraft}
                              onChange={(event) => setEditingShotDraft(event.target.value)}
                              onBlur={() => commitEditingShotField(shot.id)}
                              className="w-full resize-y rounded-lg bg-white/3 p-3 font-mono text-[12px] leading-5 text-amber-400/70 outline-none ring-1 ring-inset ring-white/10"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditingShotField(shot, "cameraNote", shot.cameraNote || "")}
                              className="w-full rounded-lg bg-white/3 p-3 text-left font-mono text-[12px] leading-5 text-amber-400/70 transition-colors hover:bg-white/4"
                            >
                              <span className="whitespace-pre-wrap">{resolvedShot.cameraNote || "Нет операторской заметки."}</span>
                            </button>
                          )}
                        </section>

                        <section className="grid gap-1.5">
                          <div className="flex items-center gap-2">
                            <ImageIcon size={12} className="text-white/35" />
                            <p className="text-[10px] uppercase tracking-wider text-white/30">Промпт картинки</p>
                            <span className="rounded-full border border-[#D4A853]/35 bg-[#D4A853]/12 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-[#E8D7B2]">EN</span>
                          </div>
                          {editingShotField?.shotId === shot.id && editingShotField.field === "imagePrompt" ? (
                            <textarea
                              autoFocus
                              rows={7}
                              value={editingShotDraft}
                              onChange={(event) => setEditingShotDraft(event.target.value)}
                              onBlur={() => commitEditingShotField(shot.id)}
                              className="w-full resize-y rounded-lg bg-white/2 p-3 font-mono text-[11px] leading-5 text-white/40 outline-none ring-1 ring-inset ring-white/10"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditingShotField(shot, "imagePrompt", shot.imagePrompt || imagePrompt)}
                              className="w-full rounded-lg bg-white/2 p-3 text-left font-mono text-[11px] leading-5 text-white/40 transition-colors hover:bg-white/4"
                            >
                              <span className="whitespace-pre-wrap">{imagePrompt}</span>
                            </button>
                          )}
                        </section>

                        <section className="grid gap-1.5 opacity-60">
                          <div className="flex items-center gap-2">
                            <Film size={12} className="text-white/35" />
                            <p className="text-[10px] uppercase tracking-wider text-white/30">Промпт видео</p>
                            <span className="rounded-full border border-[#D4A853]/35 bg-[#D4A853]/12 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-[#E8D7B2]">EN</span>
                            <span className="rounded-full border border-white/12 bg-white/4 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-white/40">будущее</span>
                          </div>
                          {editingShotField?.shotId === shot.id && editingShotField.field === "videoPrompt" ? (
                            <textarea
                              autoFocus
                              rows={6}
                              value={editingShotDraft}
                              onChange={(event) => setEditingShotDraft(event.target.value)}
                              onBlur={() => commitEditingShotField(shot.id)}
                              className="w-full resize-y rounded-lg bg-white/2 p-3 font-mono text-[11px] leading-5 text-white/30 outline-none ring-1 ring-inset ring-white/10"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditingShotField(shot, "videoPrompt", shot.videoPrompt || videoPrompt)}
                              className="w-full rounded-lg bg-white/2 p-3 text-left font-mono text-[11px] leading-5 text-white/30 transition-colors hover:bg-white/4"
                            >
                              <span className="whitespace-pre-wrap">{videoPrompt}</span>
                            </button>
                          )}
                        </section>

                        <section className="grid gap-1.5">
                          <p className="text-[10px] uppercase tracking-wider text-white/30">Библия — референсы</p>
                          <div className="grid gap-2 rounded-lg bg-white/3 p-3">
                            {refs.characters.length === 0 && !refs.location ? (
                              <p className="text-[12px] text-white/35">Нет связанных bible entries для этого шота.</p>
                            ) : null}

                            {refs.characters.map((character) => (
                              <div key={character.id} className="flex items-center gap-3">
                                <div className="relative h-8 w-8 overflow-hidden rounded-md border border-white/10 bg-white/4">
                                  {character.generatedPortraitUrl ? (
                                    <Image src={character.generatedPortraitUrl} alt={character.name} fill unoptimized className="object-cover" />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-[0.14em] text-white/25">
                                      {character.name.slice(0, 2)}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <p className="text-[12px] text-[#E7E3DC]">{character.name}</p>
                                  <p className="text-[11px] text-white/35">portrait · ref ×{character.referenceImages.length}</p>
                                </div>
                              </div>
                            ))}

                            {refs.location ? (
                              <div className="flex items-center gap-3">
                                <div className="relative h-8 w-8 overflow-hidden rounded-md border border-white/10 bg-white/4">
                                  {refs.location.generatedImageUrl ? (
                                    <Image src={refs.location.generatedImageUrl} alt={refs.location.name} fill unoptimized className="object-cover" />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-[0.14em] text-white/25">
                                      LOC
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <p className="text-[12px] text-[#E7E3DC]">{refs.location.name}</p>
                                  <p className="text-[11px] text-white/35">{refs.location.intExt} · ref ×{refs.location.referenceImages.length}</p>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </section>

                      </div>
                    ) : null}
                  </div>
                )
              })
            )}
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