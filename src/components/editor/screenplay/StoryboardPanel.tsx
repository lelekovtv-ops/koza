"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { AlertTriangle, BookOpen, Camera, ChevronLeft, ChevronRight, Clapperboard, Copy, Crop, Download, Film, FlipHorizontal2, FlipVertical2, Grid, Image as ImageIcon, List, Loader2, Maximize, Minimize, MoreHorizontal, Pause, Pencil, Play, Plus, RefreshCw, RotateCcw, RotateCw, Settings, SkipBack, SkipForward, Sparkles, Trash2, Video, Wand2, X } from "lucide-react"
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { breakdownScene, buildBreakdownBibleContext, buildScenePromptDrafts, createSceneTimelineShotsFromBreakdown } from "@/features/breakdown"
import { breakdownSceneFincher } from "@/lib/fincher"
import { getTotalDuration, useTimelineStore } from "@/store/timeline"
import type { TimelineShot } from "@/store/timeline"
import { timelineShotToStoryboardView, createShotFromStoryboardDefaults } from "@/lib/storyboardBridge"
import { useScriptStore } from "@/store/script"
import { useScenesStore } from "@/store/scenes"
import { useNavigationStore } from "@/store/navigation"
import { trySaveBlob } from "@/lib/fileStorage"
import { applyColorTransfer, imageUrlToCanvas } from "@/lib/colorTransfer"
import { convertReferenceImagesToDataUrls, getShotGenerationReferenceImages } from "@/lib/imageGenerationReferences"
import { PromptLab, PromptLabPanel } from "./PromptLab"
import { buildImagePrompt, buildVideoPrompt, getReferencedBibleEntries } from "@/lib/promptBuilder"
import { ImageEditOverlay } from "@/components/ui/ImageEditOverlay"
import { ShotStudio } from "@/components/editor/ShotStudio"
import { ProjectStylePicker } from "@/components/ui/ProjectStylePicker"
import { ScriptViewer } from "@/components/editor/screenplay/ScriptViewer"
import { useBibleStore } from "@/store/bible"
import { useBoardStore } from "@/store/board"
import { useBreakdownConfigStore } from "@/store/breakdownConfig"
import { useReEditConfigStore } from "@/store/reEditConfig"
import { devlog } from "@/store/devlog"
import { useLibraryStore } from "@/store/library"
import { useProjectsStore } from "@/store/projects"
import { useProjectProfilesStore } from "@/store/projectProfiles"
import { slugify, type CharacterEntry, type LocationEntry, type PropEntry } from "@/lib/bibleParser"
import { generateBibleImageFromModal, EditableDuration, SceneBibleBubble } from "./StoryboardShared"

const SHOT_SIZE_OPTIONS = ["WIDE", "MEDIUM", "CLOSE", "EXTREME CLOSE", "OVER SHOULDER", "POV", "INSERT", "AERIAL", "TWO SHOT"] as const
const CAMERA_MOTION_OPTIONS = ["Static", "Pan Left", "Pan Right", "Pan Up", "Tilt Down", "Push In", "Pull Out", "Track Left", "Track Right", "Track Around", "Dolly In", "Crane Up", "Crane Down", "Drone In", "Handheld", "Steadicam"] as const

// ViewMode type is now imported from navigation store via StoryboardViewMode
type EditableShotField = "caption" | "directorNote" | "cameraNote" | "imagePrompt" | "videoPrompt"
type DirectorFieldVisibility = "all" | "action" | "director" | "camera"

const DIRECTOR_FIELD_VISIBILITY_OPTIONS: Array<{ value: DirectorFieldVisibility; label: string; description: string }> = [
  { value: "all", label: "Show All", description: "Action, Director, and Camera" },
  { value: "action", label: "Action Only", description: "Keep only the action line" },
  { value: "director", label: "Director Only", description: "Keep only director notes" },
  { value: "camera", label: "Camera Only", description: "Keep only camera notes" },
]

const DIRECTOR_ASSISTANT_SYSTEM = [
  "You are a Director Assistant inside a cinematic storyboard system.",
  "Your role is to help a human director develop shots, not replace them.",
  "You receive a single shot Action plus optional scene context and optional bible context.",
  "Your job is to enhance the action, clarify visual behavior, strengthen intention, and keep it cinematic and natural.",
  "Return short director notes only.",
  "Use 2 to 4 short lines maximum.",
  "Each line should express intention, focus, emotional direction, or visual meaning.",
  "Use clear language, visual thinking, and subtle emotion.",
  "Do not rewrite the action.",
  "Do not create multiple shots.",
  "Do not invent new actions.",
  "Do not describe camera.",
  "Do not use technical terms.",
  "Do not explain your reasoning.",
  "Preserve the user's original intent.",
  "If bible context is relevant, integrate it naturally without forcing it.",
].join("\n")

const DIRECTOR_ASSISTANT_MAX_LINES = 4
const DIRECTOR_UPDATE_DEBOUNCE_MS = 250
const MAX_DIRECTOR_SHOTS_PER_SCENE = 30

const IMAGE_GEN_MODELS = [
  { id: "gpt-image", label: "GPT Image", price: "$0.04" },
  { id: "nano-banana", label: "NB1", price: "$0.039" },
  { id: "nano-banana-2", label: "NB2", price: "$0.045" },
  { id: "nano-banana-pro", label: "NB Pro", price: "$0.13" },
] as const

function mergeProfileText(existing: string, incoming: string): string {
  const nextIncoming = incoming.trim()
  const nextExisting = existing.trim()

  if (!nextIncoming) {
    return nextExisting
  }

  if (!nextExisting) {
    return nextIncoming
  }

  if (nextExisting.includes(nextIncoming)) {
    return nextExisting
  }

  return `${nextExisting}\n\n${nextIncoming}`.trim()
}

function applyLucBessonProfileToScene({
  lucBessonProfile,
  targetScene,
  selectedSceneContext,
  setProjectStyle,
  updateDirectorVision,
  replaceSceneShots,
}: {
  lucBessonProfile: NonNullable<ReturnType<typeof useProjectProfilesStore.getState>["lucBessonByProjectId"][string]>
  targetScene: { id: string; title: string; blockIds: string[] }
  selectedSceneContext: string
  setProjectStyle: (value: string) => void
  updateDirectorVision: (value: string) => void
  replaceSceneShots: (
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
  ) => number
}) {
  useBibleStore.setState((state) => {
    const nextCharacters = [...state.characters]
    const nextLocations = [...state.locations]

    lucBessonProfile.characterOverrides.forEach((override) => {
      const entryId = slugify(override.name)
      const existingIndex = nextCharacters.findIndex((entry) => entry.id === entryId)

      if (existingIndex >= 0) {
        const current = nextCharacters[existingIndex]
        nextCharacters[existingIndex] = {
          ...current,
          description: mergeProfileText(current.description, override.description),
          appearancePrompt: mergeProfileText(current.appearancePrompt, override.appearancePrompt),
          sceneIds: current.sceneIds.includes(targetScene.id) ? current.sceneIds : [...current.sceneIds, targetScene.id],
        }
        return
      }

      nextCharacters.push({
        id: entryId,
        name: override.name,
        description: override.description,
        referenceImages: [],
        canonicalImageId: null,
        generatedPortraitUrl: null,
        portraitBlobKey: null,
        appearancePrompt: override.appearancePrompt,
        sceneIds: [targetScene.id],
        dialogueCount: 0,
      } satisfies CharacterEntry)
    })

    lucBessonProfile.locationOverrides.forEach((override) => {
      const entryId = slugify(override.name)
      const existingIndex = nextLocations.findIndex((entry) => entry.id === entryId)

      if (existingIndex >= 0) {
        const current = nextLocations[existingIndex]
        nextLocations[existingIndex] = {
          ...current,
          description: mergeProfileText(current.description, override.description),
          appearancePrompt: mergeProfileText(current.appearancePrompt, override.appearancePrompt),
          sceneIds: current.sceneIds.includes(targetScene.id) ? current.sceneIds : [...current.sceneIds, targetScene.id],
        }
        return
      }

      nextLocations.push({
        id: entryId,
        name: override.name,
        fullHeading: override.name,
        intExt: "INT",
        timeOfDay: "",
        description: override.description,
        referenceImages: [],
        canonicalImageId: null,
        generatedImageUrl: null,
        imageBlobKey: null,
        appearancePrompt: override.appearancePrompt,
        sceneIds: [targetScene.id],
      } satisfies LocationEntry)
    })

    return {
      characters: nextCharacters,
      locations: nextLocations,
    }
  })

  if (lucBessonProfile.stylePrompt.trim()) {
    setProjectStyle(lucBessonProfile.stylePrompt.trim())
  }

  if (lucBessonProfile.directorVisionPrompt.trim()) {
    updateDirectorVision(lucBessonProfile.directorVisionPrompt.trim())
  }

  replaceSceneShots(
    targetScene.id,
    lucBessonProfile.sceneText.trim() || selectedSceneContext || targetScene.title,
    targetScene.blockIds,
    lucBessonProfile.shots.map((shot) => ({
      label: shot.label,
      type: "image" as const,
      duration: 3200,
      notes: shot.refReason,
      shotSize: "",
      cameraMotion: "",
      caption: shot.visualDescription,
      directorNote: shot.directorNote,
      cameraNote: shot.cameraNote,
      videoPrompt: "",
      imagePrompt: shot.imagePrompt,
      visualDescription: shot.visualDescription,
    })),
  )
}

function formatSummaryTime(ms: number): string {
  const totalSeconds = Math.max(0, ms) / 1000
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const tenths = Math.floor((totalSeconds * 10) % 10)

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`
}

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

function InlineText({
  value,
  onChange,
  placeholder,
  multiline,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className={`w-full cursor-pointer truncate rounded bg-transparent px-0.5 text-left transition-colors hover:bg-white/5 ${className || ""}`}>
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
        className={`w-full resize-none rounded border border-white/10 bg-white/5 px-2 py-1 text-inherit outline-none placeholder:text-white/20 ${className || ""}`}
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
      className={`w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-inherit outline-none placeholder:text-white/20 ${className || ""}`}
    />
  )
}

function sanitizeDirectorAssistantText(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, ""))
    .filter(Boolean)
    .slice(0, DIRECTOR_ASSISTANT_MAX_LINES)
    .join("\n")
}

function mergeDirectorNotes(existing: string, addition: string): string {
  const current = existing.trim()
  const next = addition.trim()

  if (!next) return current
  if (!current) return next
  if (current.includes(next)) return current

  return `${current}\n${next}`
}

async function readStreamedText(response: Response): Promise<string> {
  if (!response.body) {
    return await response.text()
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    fullText += decoder.decode(value, { stream: true })
  }

  fullText += decoder.decode()
  return fullText
}

function buildSceneContextText(sceneId: string | null, scenes: ReturnType<typeof useScenesStore.getState>["scenes"], scriptBlocks: ReturnType<typeof useScriptStore.getState>["blocks"]): string {
  if (!sceneId) return ""

  const scene = scenes.find((entry) => entry.id === sceneId)
  if (!scene) return ""

  const excerpt = scene.blockIds
    .slice(0, 6)
    .map((blockId) => scriptBlocks.find((block) => block.id === blockId)?.text?.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 500)

  return [
    `Scene: ${scene.title}`,
    excerpt ? `Excerpt: ${excerpt}` : "",
  ].filter(Boolean).join("\n")
}

function DebouncedTextarea({
  value,
  onCommit,
  placeholder,
  rows = 3,
  className,
  autoFocusRequested = false,
  dataFocusId,
  autoGrow = false,
}: {
  value: string
  onCommit: (value: string) => void
  placeholder?: string
  rows?: number
  className?: string
  autoFocusRequested?: boolean
  dataFocusId?: string
  autoGrow?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const [isEditing, setIsEditing] = useState(false)
  const lastCommittedRef = useRef(value)
  const timerRef = useRef<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const draftRef = useRef(value)
  const onCommitRef = useRef(onCommit)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    onCommitRef.current = onCommit
  }, [onCommit])

  const scheduleCommit = useCallback((nextValue: string) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
    }

    timerRef.current = window.setTimeout(() => {
      lastCommittedRef.current = nextValue
      onCommit(nextValue)
      timerRef.current = null
    }, DIRECTOR_UPDATE_DEBOUNCE_MS)
  }, [onCommit])

  const flush = useCallback(() => {
    if (draft === lastCommittedRef.current) return
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    lastCommittedRef.current = draft
    onCommit(draft)
  }, [draft, onCommit])

  useEffect(() => {
    if (isEditing) return
    setDraft(value)
    draftRef.current = value
    lastCommittedRef.current = value
  }, [isEditing, value])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }

      if (draftRef.current !== lastCommittedRef.current) {
        onCommitRef.current(draftRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!autoFocusRequested) return

    const node = textareaRef.current
    if (!node) return

    const rafId = window.requestAnimationFrame(() => {
      node.focus()
      const length = node.value.length
      node.setSelectionRange(length, length)
    })

    return () => window.cancelAnimationFrame(rafId)
  }, [autoFocusRequested])

  useEffect(() => {
    const node = textareaRef.current
    if (!node) return

    if (!autoGrow) {
      node.style.height = ""
      return
    }

    node.style.height = "0px"
    node.style.height = `${node.scrollHeight}px`
  }, [autoGrow, draft, isEditing, value])

  return (
    <textarea
      ref={textareaRef}
      rows={rows}
      value={isEditing ? draft : value}
      placeholder={placeholder}
      data-focus-id={dataFocusId}
      onFocus={() => {
        if (isEditing) return
        setDraft(value)
        lastCommittedRef.current = value
        setIsEditing(true)
      }}
      onChange={(event) => {
        const nextValue = event.target.value
        setDraft(nextValue)
        scheduleCommit(nextValue)
      }}
      onBlur={() => {
        flush()
        setIsEditing(false)
      }}
      className={className}
    />
  )
}

function DirectorFieldVisibilityControl({
  value,
  onChange,
}: {
  value: DirectorFieldVisibility
  onChange: (value: DirectorFieldVisibility) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener("pointerdown", handlePointerDown)
    return () => window.removeEventListener("pointerdown", handlePointerDown)
  }, [open])

  const activeOption = DIRECTOR_FIELD_VISIBILITY_OPTIONS.find((option) => option.value === value) ?? DIRECTOR_FIELD_VISIBILITY_OPTIONS[0]

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3 text-left text-[#D7CDC1] transition-colors hover:bg-white/6"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <List size={14} className="text-[#9FA4AE]" />
        <div className="leading-none">
          <p className="text-[9px] uppercase tracking-[0.18em] text-[#8D919B]">Fields</p>
          <p className="mt-1 text-[11px] text-[#E7E3DC]">{activeOption.label}</p>
        </div>
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-64 overflow-hidden rounded-2xl border border-white/8 bg-[#171A20]/96 p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          {DIRECTOR_FIELD_VISIBILITY_OPTIONS.map((option) => {
            const isActive = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${isActive ? "bg-white/7 text-[#E7E3DC]" : "text-[#D7CDC1] hover:bg-white/5"}`}
              >
                <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${isActive ? "bg-white/60" : "bg-white/12"}`} />
                <span className="min-w-0">
                  <span className="block text-[11px] uppercase tracking-[0.16em]">{option.label}</span>
                  <span className="mt-1 block text-[11px] normal-case tracking-normal text-[#8D919B]">{option.description}</span>
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function DirectorShotCard({
  shot,
  index,
  selected,
  canDuplicate,
  isEnhancing,
  autoFocusAction,
  showThumbnail,
  fieldVisibility,
  cardRef,
  onSelect,
  onUpdate,
  onEnhance,
  onBuild,
  isBuilding,
  bibleChars,
  bibleLocs,
  bibleProps,
  onOpenBible,
  onSmartScan,
  isScanning,
  onGenerate,
  isGenerating,
  onOpenStudio,
  onDelete,
  onDuplicate,
}: {
  shot: TimelineShot
  index: number
  selected: boolean
  canDuplicate: boolean
  isEnhancing: boolean
  isBuilding: boolean
  isScanning: boolean
  autoFocusAction: boolean
  showThumbnail: boolean
  fieldVisibility: DirectorFieldVisibility
  bibleChars: CharacterEntry[]
  bibleLocs: LocationEntry[]
  bibleProps: PropEntry[]
  cardRef?: (node: HTMLElement | null) => void
  onSelect: () => void
  onUpdate: (patch: Partial<TimelineShot>) => void
  onEnhance: () => void
  onBuild: () => void
  onOpenBible: () => void
  onSmartScan: () => void
  onGenerate: () => void
  isGenerating: boolean
  onOpenStudio: () => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  const previewSrc = shot.thumbnailUrl || shot.svg || null
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [showFullPrompt, setShowFullPrompt] = useState(false)
  const showAction = fieldVisibility === "all" || fieldVisibility === "action"
  const showDirector = fieldVisibility === "all" || fieldVisibility === "director"
  const showCamera = fieldVisibility === "all" || fieldVisibility === "camera"
  const isSingleFieldMode = fieldVisibility !== "all"
  const isSplitCompactFields = !showThumbnail && !isSingleFieldMode
  const singleFieldConfig = fieldVisibility === "action"
    ? {
        label: "Action",
        value: shot.caption,
        placeholder: "Describe the shot action...",
        textClassName: "text-[#ECE5D8]",
        onCommit: (value: string) => onUpdate({ caption: value }),
        autoFocusRequested: autoFocusAction,
        dataFocusId: `director-action-${shot.id}`,
      }
    : fieldVisibility === "director"
      ? {
          label: "Director",
          value: shot.directorNote,
          placeholder: "Director notes...",
          textClassName: "text-[#D8D0C3]",
          onCommit: (value: string) => onUpdate({ directorNote: value }),
          autoFocusRequested: false,
          dataFocusId: undefined,
        }
      : {
          label: "Camera",
          value: shot.cameraNote,
          placeholder: "DP notes...",
          textClassName: "text-[#D8D0C3]",
          onCommit: (value: string) => onUpdate({ cameraNote: value }),
          autoFocusRequested: false,
          dataFocusId: undefined,
        }
  const previewPanel = showThumbnail ? (
    <div
      className={`relative overflow-hidden rounded-xl border border-white/8 bg-[#0E1014] ${previewSrc ? "cursor-pointer" : ""} ${isSingleFieldMode ? "h-full aspect-video shrink-0" : "w-72 shrink-0 self-start aspect-video"}`}
      onClick={(e) => { if (previewSrc) { e.stopPropagation(); onOpenStudio() } }}
    >
      {previewSrc ? (
        <Image
          src={previewSrc}
          alt=""
          fill
          unoptimized
          className="object-cover transition-transform hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_58%),linear-gradient(180deg,#151922_0%,#0E1014_100%)] px-3 text-center">
          <div>
            <p className="text-[9px] uppercase tracking-[0.16em] text-[#8D919B]">Shot {String(index + 1).padStart(2, "0")}</p>
            <p className="mt-1 text-[10px] text-[#C3B8AA]">No thumbnail</p>
          </div>
        </div>
      )}
    </div>
  ) : null

  return (
    <article
      ref={cardRef}
      data-director-shot-id={shot.id}
      className={`rounded-[18px] border p-3 text-[#E5E0DB] transition-[border-color,background,box-shadow] duration-100 ease-out ${selected ? "border-[#DCC7A3]/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.07)_0%,rgba(255,255,255,0.04)_100%)] shadow-[0_0_0_1px_rgba(220,199,163,0.16),0_0_0_6px_rgba(212,168,83,0.08),0_24px_52px_rgba(0,0,0,0.24)]" : "border-white/8 bg-white/3 shadow-[0_20px_45px_rgba(0,0,0,0.18)] hover:border-white/10 hover:bg-white/4 hover:shadow-[0_22px_48px_rgba(0,0,0,0.2)]"}`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-3">
        <p className={`text-[10px] uppercase tracking-[0.18em] ${selected ? "text-[#E4D0AC]" : "text-[#8D919B]"}`}>Shot {String(index + 1).padStart(2, "0")}</p>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onEnhance() }}
            disabled={isEnhancing || !shot.caption.trim()}
            className="flex h-8 items-center gap-1 rounded-md border border-white/10 bg-white/4 px-2 text-[10px] uppercase tracking-[0.14em] text-[#D7CDC1] transition-colors hover:bg-white/7 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isEnhancing ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
            Enhance
          </button>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onBuild() }}
            disabled={isBuilding || !shot.caption.trim()}
            className="flex h-8 items-center gap-1 rounded-md border border-[#D4A853]/20 bg-[#D4A853]/8 px-2 text-[10px] uppercase tracking-[0.14em] text-[#D4A853] transition-colors hover:bg-[#D4A853]/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isBuilding ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
            Build
          </button>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onDuplicate() }}
            disabled={!canDuplicate}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/4 text-white/55 transition-colors hover:bg-white/7 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Duplicate shot"
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onDelete() }}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-red-400/20 bg-red-400/6 text-red-200/80 transition-colors hover:bg-red-400/10 hover:text-red-100"
            aria-label="Delete shot"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {isSingleFieldMode ? (
        <div className={`mt-3 flex h-40 items-stretch ${showThumbnail ? "gap-4" : "gap-0"}`}>
          <div className="min-w-0 flex-1 rounded-2xl border border-white/8 bg-white/3 px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[11px] uppercase tracking-[0.18em] text-[#8D919B]">{singleFieldConfig.label}</span>
            </div>
            <DebouncedTextarea
              value={singleFieldConfig.value}
              onCommit={singleFieldConfig.onCommit}
              placeholder={singleFieldConfig.placeholder}
              rows={6}
              autoFocusRequested={singleFieldConfig.autoFocusRequested}
              dataFocusId={singleFieldConfig.dataFocusId}
              className={`h-full min-h-0 w-full resize-none overflow-y-auto bg-transparent px-0 py-0 text-[14px] leading-6 outline-none placeholder:text-white/20 ${singleFieldConfig.textClassName}`}
            />
          </div>

          {previewPanel}
        </div>
      ) : (
        <div className={`mt-2.5 flex items-start ${showThumbnail ? "gap-4" : "gap-0"}`}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-1.5">
            {!isSingleFieldMode && showAction ? (
            <div className={`flex gap-3 rounded-xl border px-3 transition-[border-color,background-color] duration-100 ease-out ${selected ? "border-[#DCC7A3]/22 bg-white/5" : "border-white/8 bg-white/3"} ${isSplitCompactFields ? "items-start py-2" : "items-center py-1.5 min-h-10"}`}>
              <span className={`w-20 shrink-0 text-[11px] uppercase tracking-[0.18em] text-[#8D919B] ${isSplitCompactFields ? "pt-1" : ""}`}>Action</span>
              <DebouncedTextarea
                value={shot.caption}
                onCommit={(value) => onUpdate({ caption: value })}
                placeholder="Describe the shot action..."
                rows={1}
                autoFocusRequested={autoFocusAction}
                dataFocusId={`director-action-${shot.id}`}
                autoGrow={isSplitCompactFields}
                className={`w-full bg-transparent px-0 py-0 text-[13px] leading-5 text-[#ECE5D8] outline-none placeholder:text-white/20 ${isSplitCompactFields ? "min-h-5 resize-none overflow-hidden" : "h-6 resize-none overflow-hidden"}`}
              />
            </div>
            ) : null}

            {!isSingleFieldMode && showDirector ? (
            <div className={`flex gap-3 rounded-xl border px-3 transition-[border-color,background-color] duration-100 ease-out ${selected ? "border-[#DCC7A3]/22 bg-white/5" : "border-white/8 bg-white/3"} ${isSplitCompactFields ? "items-start py-2" : "items-center py-1.5 min-h-10"}`}>
              <span className={`w-20 shrink-0 text-[11px] uppercase tracking-[0.18em] text-[#8D919B] ${isSplitCompactFields ? "pt-1" : ""}`}>Director</span>
              <DebouncedTextarea
                value={shot.directorNote}
                onCommit={(value) => onUpdate({ directorNote: value })}
                placeholder="Director notes..."
                rows={1}
                autoGrow={isSplitCompactFields}
                className={`w-full bg-transparent px-0 py-0 text-[13px] leading-5 text-[#D8D0C3] outline-none placeholder:text-white/20 ${isSplitCompactFields ? "min-h-5 resize-none overflow-hidden" : "h-6 resize-none overflow-hidden"}`}
              />
            </div>
            ) : null}

            {!isSingleFieldMode && showCamera ? (
            <div className={`flex gap-3 rounded-xl border px-3 transition-[border-color,background-color] duration-100 ease-out ${selected ? "border-[#DCC7A3]/22 bg-white/5" : "border-white/8 bg-white/3"} ${isSplitCompactFields ? "items-start py-2" : "items-center py-1.5 min-h-10"}`}>
              <span className={`w-20 shrink-0 text-[11px] uppercase tracking-[0.18em] text-[#8D919B] ${isSplitCompactFields ? "pt-1" : ""}`}>Camera</span>
              <DebouncedTextarea
                value={shot.cameraNote}
                onCommit={(value) => onUpdate({ cameraNote: value })}
                placeholder="DP notes..."
                rows={1}
                autoGrow={isSplitCompactFields}
                className={`w-full bg-transparent px-0 py-0 text-[13px] leading-5 text-[#D8D0C3] outline-none placeholder:text-white/20 ${isSplitCompactFields ? "min-h-5 resize-none overflow-hidden" : "h-6 resize-none overflow-hidden"}`}
              />
            </div>
            ) : null}

            {/* ── Bible pills: toggle entities for this shot ── */}
            {!isSingleFieldMode && (() => {
              const excluded = new Set(shot.excludedBibleIds ?? [])
              const allEntries = [
                ...bibleChars.map((c) => ({ id: `char-${c.id}`, label: c.name, type: "char" as const, imageUrl: c.generatedPortraitUrl, prompt: c.appearancePrompt })),
                ...bibleLocs.map((l) => ({ id: `loc-${l.id}`, label: l.name, type: "loc" as const, imageUrl: l.generatedImageUrl, prompt: l.appearancePrompt })),
                ...bibleProps.map((p) => ({ id: `prop-${p.id}`, label: p.name, type: "prop" as const, imageUrl: p.generatedImageUrl, prompt: p.appearancePrompt })),
              ]
              if (allEntries.length === 0) return null
              return (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {allEntries.map((entry) => {
                    const isOff = excluded.has(entry.id)
                    return (
                      <div key={entry.id} className="group/pill relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            const next = new Set(excluded)
                            if (isOff) next.delete(entry.id)
                            else next.add(entry.id)
                            onUpdate({ excludedBibleIds: Array.from(next) })
                          }}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] transition-colors ${
                            isOff
                              ? "bg-white/3 text-white/20 line-through"
                              : entry.type === "char" ? "bg-[#D4A853]/10 text-[#D4A853]/80"
                              : entry.type === "loc" ? "bg-emerald-500/10 text-emerald-400/70"
                              : "bg-sky-500/10 text-sky-400/70"
                          }`}
                        >
                          {entry.imageUrl && <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-60" />}
                          {entry.label}
                        </button>
                        {/* Hover preview */}
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 rounded-lg border border-white/10 bg-black/90 p-1.5 opacity-0 shadow-xl backdrop-blur-xl transition-opacity group-hover/pill:opacity-100">
                          {entry.imageUrl ? (
                            <img src={entry.imageUrl} alt={entry.label} className="h-16 w-16 rounded-md object-cover" />
                          ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded-md bg-white/5 text-[8px] text-white/30">No image</div>
                          )}
                          <p className="mt-1 max-w-[120px] truncate text-center text-[8px] text-white/50">{entry.prompt || entry.label}</p>
                        </div>
                      </div>
                    )
                  })}
                  {/* Smart Scan — find props from shot text */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSmartScan() }}
                    disabled={isScanning || !shot.caption.trim()}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/8 text-white/25 transition-colors hover:bg-[#D4A853]/10 hover:text-[#D4A853]/60 disabled:opacity-30"
                    title="Smart Scan — найти пропсы в тексте шота"
                  >
                    {isScanning ? <Loader2 size={9} className="animate-spin" /> : <Sparkles size={9} />}
                  </button>
                  {/* Open Bible for this scene */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenBible() }}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/8 text-white/25 transition-colors hover:bg-white/8 hover:text-white/50"
                    title="Открыть библию сцены"
                  >
                    <BookOpen size={9} />
                  </button>
                </div>
              )
            })()}
            </div>
          </div>

          {previewPanel}
        </div>
      )}

      {/* ── Expandable prompt block ── */}
      {!isSingleFieldMode && shot.imagePrompt && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setPromptExpanded((v) => !v) }}
            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-white/25 transition-colors hover:bg-white/3 hover:text-white/40"
          >
            <ChevronRight size={10} className={`transition-transform ${promptExpanded ? "rotate-90" : ""}`} />
            Prompt
            <span className="ml-auto text-[8px] tabular-nums text-white/15">{shot.imagePrompt.length} chars</span>
          </button>
          {promptExpanded && (() => {
            const fullPrompt = buildImagePrompt(shot, bibleChars, bibleLocs, useBoardStore.getState().projectStyle, bibleProps)
            const displayPrompt = showFullPrompt ? fullPrompt : shot.imagePrompt
            return (
              <div className="mt-1 rounded-xl border border-white/6 bg-white/2 px-3 py-2">
                {showFullPrompt ? (
                  <DebouncedTextarea
                    value={fullPrompt}
                    onCommit={(value) => onUpdate({ imagePrompt: value })}
                    rows={4}
                    autoGrow
                    className="w-full resize-none bg-transparent font-[system-ui] text-[11px] leading-[1.6] text-white/60 outline-none placeholder:text-white/20"
                    placeholder="Full prompt..."
                  />
                ) : (
                  <DebouncedTextarea
                    value={shot.imagePrompt}
                    onCommit={(value) => onUpdate({ imagePrompt: value })}
                    rows={3}
                    autoGrow
                    className="w-full resize-none bg-transparent font-[system-ui] text-[11px] leading-[1.6] text-white/50 outline-none placeholder:text-white/20"
                    placeholder="Image prompt..."
                  />
                )}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onGenerate() }}
                    disabled={isGenerating}
                    className="flex h-7 items-center gap-1 rounded-md bg-[#D4A853]/15 px-3 text-[9px] uppercase tracking-[0.12em] text-[#D4A853] transition-colors hover:bg-[#D4A853]/25 disabled:opacity-40"
                  >
                    {isGenerating ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                    Generate
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowFullPrompt((v) => !v) }}
                    className={`flex h-7 items-center rounded-md px-2 text-[9px] uppercase tracking-[0.12em] transition-colors ${showFullPrompt ? "bg-white/8 text-white/50" : "text-white/20 hover:text-white/40"}`}
                  >
                    {showFullPrompt ? "Base" : "Full"}
                  </button>
                  {showFullPrompt && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onUpdate({ imagePrompt: fullPrompt, bakedPrompt: true }); setShowFullPrompt(false) }}
                      className="flex h-7 items-center rounded-md px-2 text-[9px] uppercase tracking-[0.12em] text-white/20 transition-colors hover:text-white/40"
                    >
                      Bake
                    </button>
                  )}
                  {shot.videoPrompt && (
                    <span className="text-[8px] text-white/15">+ video prompt</span>
                  )}
                  <span className="ml-auto text-[8px] tabular-nums text-white/15">{displayPrompt.length} chars</span>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </article>
  )
}

// ── AI Image Generation ─────────────────────────────────────────

async function generateShotImage(
  shot: TimelineShot,
): Promise<{ objectUrl: string; blobKey: string | null }> {
  const { characters, locations, props: bibleProps } = useBibleStore.getState()
  const { selectedImageGenModel, projectStyle } = useBoardStore.getState()
  const selectedModel = selectedImageGenModel || "nano-banana-2"
  const start = Date.now()
  const group = `generate-${shot.id}`
  const references = getShotGenerationReferenceImages(shot, characters, locations)
  const referenceImages = await convertReferenceImagesToDataUrls(references)
  const { characters: mentionedChars, location } = getReferencedBibleEntries(shot, characters, locations, bibleProps)
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
    buildImagePrompt(shot, characters, locations, projectStyle, bibleProps),
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
      throw new Error((err as { error?: string }).error || `Generation failed: ${response.status}`)
    }

    const contentType = response.headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
      const err = await response.json()
      throw new Error((err as { error?: string }).error || "API returned JSON instead of image")
    }

    const blob = await response.blob()
    if (blob.size < 1000) {
      throw new Error(`Image too small (${blob.size} bytes), likely an error response`)
    }
    const blobKey = `shot-thumb-${shot.id}-${Date.now()}`
    const persisted = await trySaveBlob(blobKey, blob)

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
      persisted,
    }, group)

    if (!persisted) {
      devlog.warn("Image cache unavailable", "The image was generated, but local blob persistence failed. The preview will work until reload.", {
        shotId: shot.id,
        model: selectedModel,
      })
    }

    console.log(`[KOZA] Image generated in ${Date.now() - start}ms via ${selectedModel}`)

    return { objectUrl, blobKey: persisted ? blobKey : null }
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
  const removeShot = useTimelineStore((state) => state.removeShot)
  const updateShot = useTimelineStore((state) => state.updateShot)
  const reorderShot = useTimelineStore((state) => state.reorderShot)
  const reorderShots = useTimelineStore((state) => state.reorderShots)
  const selectedShotId = useTimelineStore((state) => state.selectedShotId)
  const selectShot = useTimelineStore((state) => state.selectShot)
  const openShotStudioId = useNavigationStore((s) => s.openShotStudioId)
  const setOpenShotStudioId = useNavigationStore((s) => s.setOpenShotStudioId)
  const [lightbox, setLightboxRaw] = useState<{ src: string; shotId: string } | null>(null)
  const setLightbox = useCallback((val: { src: string; shotId: string } | null) => {
    setLightboxRaw(val)
    setOpenShotStudioId(val?.shotId ?? null)
  }, [setOpenShotStudioId])
  const [lbPlaying, setLbPlaying] = useState(false)
  const [lbFullscreen, setLbFullscreen] = useState(false)
  const lbContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = () => setLbFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])
  const [lbPlayStartTime, setLbPlayStartTime] = useState(0)
  const [lbPlayBaseMs, setLbPlayBaseMs] = useState(0)
  const [lbTickMs, setLbTickMs] = useState(0)
  const lbPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lbTickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Restore ShotStudio on mount if it was open
  useEffect(() => {
    if (openShotStudioId && !lightbox) {
      const s = shots.find((x) => x.id === openShotStudioId)
      if (s?.thumbnailUrl) {
        setLightboxRaw({ src: s.thumbnailUrl, shotId: s.id })
      } else {
        setOpenShotStudioId(null)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [lightboxTransform, setLightboxTransform] = useState<{ flipH: boolean; flipV: boolean; rotate: number }>({ flipH: false, flipV: false, rotate: 0 })
  const [cropMode, setCropMode] = useState(false)
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [cropDrag, setCropDrag] = useState<{ type: "move" | "nw" | "ne" | "sw" | "se"; startX: number; startY: number; startRect: { x: number; y: number; w: number; h: number } } | null>(null)
  const [cropFreeAspect, setCropFreeAspect] = useState(false)
  const [colorMatchPicker, setColorMatchPicker] = useState(false)
  const [colorMatchProgress, setColorMatchProgress] = useState(0) // 0 = idle, 0.01-0.99 = working, 1 = done
  const lightboxCanvasRef = useRef<HTMLCanvasElement>(null)
  const lightboxImgRef = useRef<HTMLImageElement>(null)
  const [recentInsertedFrameId, setRecentInsertedFrameId] = useState<string | null>(null)
  const [draggedFrameId, setDraggedFrameId] = useState<string | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const [dropSlotOpen, setDropSlotOpen] = useState<number | null>(null)
  const dropTimerRef = useRef<number | null>(null)
  const viewMode = useNavigationStore((s) => s.storyboardViewMode)
  const setViewMode = useNavigationStore((s) => s.setStoryboardViewMode)
  const [expandedShotId, setExpandedShotId] = useState<string | null>(null)
  const [expandedSceneShotIds, setExpandedSceneShotIds] = useState<Set<string>>(new Set())
  const [editingShotField, setEditingShotField] = useState<{ shotId: string; field: EditableShotField } | null>(null)
  const [editingShotDraft, setEditingShotDraft] = useState("")
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set())
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set())
  const [promptLabShotId, setPromptLabShotId] = useState<string | null>(null)
  const [enhancingIds, setEnhancingIds] = useState<Set<string>>(new Set())
  const [buildingPromptIds, setBuildingPromptIds] = useState<Set<string>>(new Set())
  const [scanningIds, setScanningIds] = useState<Set<string>>(new Set())
  const [pendingActionFocusShotId, setPendingActionFocusShotId] = useState<string | null>(null)
  const [isSplitScreen, setIsSplitScreen] = useState(false)
  const [directorFieldVisibility, setDirectorFieldVisibility] = useState<DirectorFieldVisibility>("all")
  const [scriptFontSize] = useState(16)
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
  const workflowProfile = useBoardStore((state) => state.workflowProfile)
  const activeProjectId = useProjectsStore((state) => state.activeProjectId)
  const lucBessonProfile = useProjectProfilesStore((state) => (
    activeProjectId ? state.lucBessonByProjectId[activeProjectId] ?? null : null
  ))
  const isLucBessonBreakdownMode = workflowProfile === "legacy-luc-besson" && !!lucBessonProfile
  const characters = useBibleStore((state) => state.characters)
  const locations = useBibleStore((state) => state.locations)
  const bibleProps = useBibleStore((state) => state.props)
  const updateDirectorVision = useBibleStore((state) => state.updateDirectorVision)
  const [bibleBubbleSceneId, setBibleBubbleSceneId] = useState<string | null>(null)
  const cardScale = 90
  // Sort shots by scene order then by shot order within scene
  const sortedShots = useMemo(() => {
    const sceneOrder = new Map<string, number>()
    scenes.forEach((s, i) => sceneOrder.set(s.id, i))
    return [...shots].sort((a, b) => {
      const sa = sceneOrder.get(a.sceneId || "") ?? 999
      const sb = sceneOrder.get(b.sceneId || "") ?? 999
      if (sa !== sb) return sa - sb
      return a.order - b.order
    })
  }, [shots, scenes])
  const frames = useMemo(() => sortedShots.map((shot, index) => timelineShotToStoryboardView(shot, index)), [sortedShots])

  // Build "S1.01" labels: scene number + shot index within scene
  const shotLabel = useMemo(() => {
    const sceneOrder = new Map<string, number>()
    scenes.forEach((s, i) => sceneOrder.set(s.id, i + 1))
    const countPerScene = new Map<string, number>()
    const labels = new Map<string, string>()
    for (const shot of sortedShots) {
      const sid = shot.sceneId || ""
      const sceneNum = sceneOrder.get(sid) ?? 0
      const shotInScene = (countPerScene.get(sid) || 0) + 1
      countPerScene.set(sid, shotInScene)
      labels.set(shot.id, sceneNum > 0
        ? `S${sceneNum}.${String(shotInScene).padStart(2, "0")}`
        : `Shot ${String(shotInScene).padStart(2, "0")}`)
    }
    return (shotId: string) => labels.get(shotId) || "Shot"
  }, [sortedShots, scenes])

  // Setup grouping: same shotSize+cameraMotion within a scene = same Setup letter
  const setupLabel = useMemo(() => {
    const labels = new Map<string, string>()
    const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    // Group shots by scene
    const shotsByScene = new Map<string, typeof shots>()
    for (const shot of sortedShots) {
      const sid = shot.sceneId || "_none"
      const arr = shotsByScene.get(sid) || []
      arr.push(shot)
      shotsByScene.set(sid, arr)
    }
    for (const sceneShots of shotsByScene.values()) {
      const setupKeys = new Map<string, string>() // "Wide|Static" → "A"
      let nextLetter = 0
      for (const shot of sceneShots) {
        const key = `${(shot.shotSize || "").toLowerCase().trim()}|${(shot.cameraMotion || "").toLowerCase().trim()}`
        if (!setupKeys.has(key)) {
          setupKeys.set(key, LETTERS[nextLetter % 26] || "?")
          nextLetter++
        }
        labels.set(shot.id, `Setup ${setupKeys.get(key)}`)
      }
    }
    return (shotId: string) => labels.get(shotId) || ""
  }, [sortedShots])
  const totalShotDurationMs = useMemo(() => getTotalDuration(shots), [shots])
  const shotsBySceneId = useMemo(() => {
    const buckets = new Map<string, TimelineShot[]>()

    for (const shot of sortedShots) {
      if (!shot.sceneId) continue
      const existing = buckets.get(shot.sceneId)
      if (existing) {
        existing.push(shot)
      } else {
        buckets.set(shot.sceneId, [shot])
      }
    }

    return buckets
  }, [shots])
  const scenario = useScriptStore((state) => state.scenario)
  const [jenkinsLoading, setJenkinsLoading] = useState(false)
  const [breakdownLoadingSceneId, setBreakdownLoadingSceneId] = useState<string | null>(null)
  const [breakdownStage, setBreakdownStage] = useState<{ progress: number; message: string }>({ progress: 0, message: "" })
  const [promptLoadingSceneId, setPromptLoadingSceneId] = useState<string | null>(null)
  const [configPanelOpen, setConfigPanelOpen] = useState(false)
  const [videoGeneratingIds, setVideoGeneratingIds] = useState<Set<string>>(new Set())
  const [editOverlayShotId, setEditOverlayShotId] = useState<string | null>(null)
  const [editInstruction, setEditInstruction] = useState("")
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set())
  const editInputRef = useRef<HTMLInputElement>(null)
  const breakdownConfig = useBreakdownConfigStore((s) => s.global)
  const setBreakdownGlobalConfig = useBreakdownConfigStore((s) => s.setGlobal)
  const selectedScene = useMemo(() => scenes.find((scene) => scene.id === selectedSceneId) ?? null, [scenes, selectedSceneId])
  const inspectorShots = useMemo(
    () => (selectedSceneId ? shotsBySceneId.get(selectedSceneId) ?? [] : shots),
    [selectedSceneId, shots, shotsBySceneId]
  )
  const directorShots = useMemo(
    () => selectedSceneId ? (shotsBySceneId.get(selectedSceneId) ?? []).slice(0, MAX_DIRECTOR_SHOTS_PER_SCENE) : [],
    [selectedSceneId, shotsBySceneId]
  )
  const selectedSceneShots = useMemo(
    () => selectedSceneId ? (shotsBySceneId.get(selectedSceneId) ?? []) : [],
    [selectedSceneId, shotsBySceneId]
  )
  const selectedSceneContext = useMemo(
    () => buildSceneContextText(selectedSceneId, scenes, scriptBlocks),
    [selectedSceneId, scenes, scriptBlocks]
  )
  useEffect(() => {
    if (!(viewMode === "scenes" || viewMode === "director")) return
    if (selectedSceneId) return
    if (!scenes[0]) return

    selectScene(scenes[0].id)
  }, [scenes, selectScene, selectedSceneId, viewMode])

  const handleToggleSplitScreen = useCallback(() => {
    if (!isExpanded) {
      onToggleExpanded()
      setIsSplitScreen(true)
      return
    }

    setIsSplitScreen((current) => !current)
  }, [isExpanded, onToggleExpanded])

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
    const preservedShots = useTimelineStore.getState().shots.filter((shot) => shot.sceneId !== sceneId)
    const replacementShots = createSceneTimelineShotsFromBreakdown({
      sceneId,
      sceneText,
      sceneBlockIds,
    }, jenkinsShots)

    reorderShots([...preservedShots, ...replacementShots])
    selectScene(sceneId)
    setViewMode("board")
    setExpandedShotId(replacementShots[0]?.id ?? null)
    setExpandedSceneShotIds((current) => new Set(current).add(sceneId))

    return replacementShots.length
  }, [reorderShots, selectScene])

  const handleJenkinsBreakdown = useCallback(async () => {
    const text = scenario.trim()
    if (!text || jenkinsLoading) return
    setJenkinsLoading(true)
    try {
      const bible = buildBreakdownBibleContext(characters, locations, bibleProps)
      const { shots: jenkinsShots, diagnostics } = await breakdownSceneFincher(text, { bible, style: projectStyle })

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
    if (workflowProfile === "legacy-luc-besson" && lucBessonProfile) {
      applyLucBessonProfileToScene({
        lucBessonProfile,
        targetScene: scene,
        selectedSceneContext,
        setProjectStyle,
        updateDirectorVision,
        replaceSceneShots,
      })
      setBreakdownWarning(`Luc Besson breakdown применён к сцене ${scene.title}. Этот проект сейчас работает в Luc Besson режиме по умолчанию.`)
      return
    }

    if (breakdownLoadingSceneId) return
    setBreakdownLoadingSceneId(scene.id)

    // Animated progress stages
    const stages = [
      { progress: 0.05, message: "Читаю сцену..." },
      { progress: 0.12, message: "Погружаюсь в атмосферу..." },
      { progress: 0.22, message: "Анализирую драматургию..." },
      { progress: 0.32, message: "Разбиваю на действия..." },
      { progress: 0.42, message: "Выстраиваю пространство сцены..." },
      { progress: 0.52, message: "Ищу режиссёрское решение..." },
      { progress: 0.62, message: "Проверяю допустимые границы..." },
      { progress: 0.72, message: "Планирую кадры..." },
      { progress: 0.82, message: "Слежу за непрерывностью..." },
      { progress: 0.90, message: "Сочиняю визуальные промпты..." },
    ]
    let stageIdx = 0
    setBreakdownStage(stages[0])
    const progressTimer = setInterval(() => {
      stageIdx++
      if (stageIdx < stages.length) {
        setBreakdownStage(stages[stageIdx])
      }
    }, 3200)

    try {
      const sceneText = scene.blockIds
        .map((bid) => scriptBlocks.find((b) => b.id === bid)?.text)
        .filter(Boolean)
        .join("\n")
      if (!sceneText.trim()) {
        clearInterval(progressTimer)
        setBreakdownStage({ progress: 0, message: "" })
        setBreakdownWarning(`Сцена ${scene.title} пустая. Для breakdown нужен текст внутри scene blocks.`)
        return
      }
      const bible = buildBreakdownBibleContext(characters, locations, bibleProps)
      const { shots: jenkinsShots, diagnostics } = await breakdownSceneFincher(sceneText, {
        sceneId: scene.id,
        bible,
        style: projectStyle,
      })
      clearInterval(progressTimer)

      if (jenkinsShots.length === 0) {
        const warning = `Breakdown для сцены ${scene.title} вернул 0 shots. Проверь текст сцены и Bible context.`
        setBreakdownWarning(warning)
        devlog.warn("Scene breakdown returned zero shots", warning, {
          ...diagnostics,
          sceneId: scene.id,
        })
        selectScene(scene.id)
        return
      }

      replaceSceneShots(scene.id, sceneText, scene.blockIds, jenkinsShots)

      if (useBreakdownConfigStore.getState().autoPromptBuild) {
        const sceneShots = useTimelineStore.getState().shots.filter((s) => s.sceneId === scene.id).sort((a, b) => a.order - b.order)
        if (sceneShots.length > 0) {
          const promptDrafts = buildScenePromptDrafts(sceneShots, characters, locations, projectStyle, bibleProps)
          promptDrafts.forEach((draft) => {
            updateShot(draft.shotId, { imagePrompt: draft.imagePrompt, videoPrompt: draft.videoPrompt })
          })
        }
      }

      setBreakdownStage({ progress: 1, message: "Готово!" })
      setTimeout(() => setBreakdownStage({ progress: 0, message: "" }), 1200)

      setBreakdownWarning(
        diagnostics.usedFallback
          ? `Scene ${scene.title} completed in fallback mode. Новые shots всё равно применены, но формулировки могут быть слабее полного AI-pass.`
          : null,
      )
    } catch (error) {
      clearInterval(progressTimer)
      setBreakdownStage({ progress: 0, message: "" })
      console.error("Scene breakdown error:", error)
      setBreakdownWarning(`Breakdown failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBreakdownLoadingSceneId(null)
    }
  }, [breakdownLoadingSceneId, scriptBlocks, characters, locations, projectStyle, replaceSceneShots, shots, selectScene, lucBessonProfile, selectedSceneContext, setProjectStyle, updateDirectorVision, workflowProfile])

  const handleScenePromptGeneration = useCallback((scene: { id: string; title: string }) => {
    if (promptLoadingSceneId) return

    const sceneShots = (shotsBySceneId.get(scene.id) ?? []).slice().sort((left, right) => left.order - right.order)
    if (sceneShots.length === 0) {
      setBreakdownWarning(`Сначала сделай breakdown сцены ${scene.title}, потом запускай Generate Prompts.`)
      return
    }

    setPromptLoadingSceneId(scene.id)

    try {
      const promptDrafts = buildScenePromptDrafts(sceneShots, characters, locations, projectStyle, bibleProps)

      promptDrafts.forEach((draft) => {
        updateShot(draft.shotId, {
          imagePrompt: draft.imagePrompt,
          videoPrompt: draft.videoPrompt,
        })
      })

      selectScene(scene.id)
      setViewMode("board")
      setExpandedShotId(sceneShots[0]?.id ?? null)
      setExpandedSceneShotIds((current) => new Set(current).add(scene.id))
      setBreakdownWarning(`Prompt pack собран для сцены ${scene.title}. Теперь можно отдельно генерировать каждый shot.`)
    } finally {
      setPromptLoadingSceneId(null)
    }
  }, [characters, locations, projectStyle, promptLoadingSceneId, selectScene, shotsBySceneId, updateShot])

  const handleLucBessonBreakdown = useCallback(() => {
    if (!lucBessonProfile) {
      setBreakdownWarning("Luc Besson профиль ещё не подключён из configurator")
      return
    }

    const targetScene = selectedScene ?? scenes[0] ?? null
    if (!targetScene) {
      setBreakdownWarning("Сначала выбери сцену в основном проекте, куда применить Luc Besson breakdown")
      return
    }

    applyLucBessonProfileToScene({
      lucBessonProfile,
      targetScene,
      selectedSceneContext,
      setProjectStyle,
      updateDirectorVision,
      replaceSceneShots,
    })

    setBreakdownWarning(`Luc Besson профиль применён к сцене ${targetScene.title}. Основной screenplay не изменён; обновлены только scene Bible overrides, style и scene shots.`)
  }, [lucBessonProfile, replaceSceneShots, scenes, selectedScene, selectedSceneContext, setProjectStyle, updateDirectorVision])

  const handleSceneClick = useCallback((scene: { id: string; headingBlockId: string }) => {
    selectScene(scene.id)
    if (scene.headingBlockId) {
      requestScrollToBlock(scene.headingBlockId)
      requestHighlightBlock(scene.headingBlockId)
    }
  }, [selectScene, requestScrollToBlock, requestHighlightBlock])

  const handleSceneDoubleClick = useCallback((scene: { id: string; headingBlockId: string }) => {
    handleSceneClick(scene)
    setExpandedSceneShotIds((current) => {
      const next = new Set(current)
      if (next.has(scene.id)) {
        next.delete(scene.id)
      } else {
        next.add(scene.id)
      }
      return next
    })
  }, [handleSceneClick])

  const createShotForScene = useCallback((scene: { id: string; headingBlockId: string }) => {
    selectScene(scene.id)

    if (scene.headingBlockId) {
      requestScrollToBlock(scene.headingBlockId)
      requestHighlightBlock(scene.headingBlockId)
    }

    const existingSceneShots = (shotsBySceneId.get(scene.id) ?? []).slice(0, MAX_DIRECTOR_SHOTS_PER_SCENE)
    if (existingSceneShots.length >= MAX_DIRECTOR_SHOTS_PER_SCENE) {
      selectShot(existingSceneShots[0]?.id ?? null)
      return null
    }

    const shotId = addShot({
      sceneId: scene.id,
      caption: "",
      directorNote: "",
      cameraNote: "",
      type: "image",
    })

    setPendingActionFocusShotId(shotId)
    selectShot(shotId)
    setExpandedSceneShotIds((current) => new Set(current).add(scene.id))
    return shotId
  }, [addShot, requestHighlightBlock, requestScrollToBlock, selectScene, selectShot, shotsBySceneId])

  const handleSceneQuickAdd = useCallback((scene: { id: string; headingBlockId: string }) => {
    createShotForScene(scene)
  }, [createShotForScene])

  const handleGenerateImage = useCallback(async (shotId: string) => {
    const shot = useTimelineStore.getState().shots.find((s) => s.id === shotId)
    if (!shot || generatingIds.has(shotId)) return
    setGeneratingIds((prev) => new Set(prev).add(shotId))
    setFailedIds((prev) => { const next = new Set(prev); next.delete(shotId); return next })
    try {
      const result = await generateShotImage(shot)

      // Read fresh shot from store (not stale closure)
      const freshShot = useTimelineStore.getState().shots.find((s) => s.id === shotId)
      const entry = { url: result.objectUrl, blobKey: result.blobKey, timestamp: Date.now(), source: "generate" as const }
      const history = [...(freshShot?.generationHistory || []), entry]

      updateShot(shotId, {
        thumbnailUrl: result.objectUrl,
        thumbnailBlobKey: result.blobKey,
        generationHistory: history,
        activeHistoryIndex: history.length - 1,
      })
    } catch (error) {
      console.error("Image generation error:", error)
      setFailedIds((prev) => new Set(prev).add(shotId))
    } finally {
      setGeneratingIds((prev) => { const next = new Set(prev); next.delete(shotId); return next })
    }
  }, [generatingIds, updateShot])

  const handleHistoryNav = useCallback((shotId: string, direction: -1 | 1) => {
    const shot = shots.find((s) => s.id === shotId)
    if (!shot || !shot.generationHistory?.length) return
    const current = shot.activeHistoryIndex ?? shot.generationHistory.length - 1
    const next = current + direction
    if (next < 0 || next >= shot.generationHistory.length) return
    const entry = shot.generationHistory[next]
    updateShot(shotId, {
      thumbnailUrl: entry.url,
      thumbnailBlobKey: entry.blobKey,
      activeHistoryIndex: next,
    })
  }, [shots, updateShot])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      // Cmd+F / Ctrl+F — open fullscreen lightbox for selected shot
      if (e.key === "f" && (e.metaKey || e.ctrlKey) && !lightbox) {
        e.preventDefault()
        const sid = selectedShotId
        if (!sid) return
        const shot = shots.find((s) => s.id === sid)
        if (shot?.thumbnailUrl) {
          setLightbox({ src: shot.thumbnailUrl, shotId: shot.id })
          setLightboxTransform({ flipH: false, flipV: false, rotate: 0 })
          // Request fullscreen after lightbox renders
          setTimeout(() => {
            lbContainerRef.current?.requestFullscreen().then(() => setLbFullscreen(true)).catch(() => {})
          }, 100)
        }
        return
      }

      if (!selectedShotId) return
      if (lightbox) return // lightbox has its own key handler
      if (e.key === "ArrowLeft") { e.preventDefault(); handleHistoryNav(selectedShotId, -1) }
      if (e.key === "ArrowRight") { e.preventDefault(); handleHistoryNav(selectedShotId, 1) }
      if (e.key === " ") {
        e.preventDefault()
        const shot = shots.find((s) => s.id === selectedShotId)
        if (shot?.thumbnailUrl) {
          setLightbox({ src: shot.thumbnailUrl, shotId: shot.id })
          setLightboxTransform({ flipH: false, flipV: false, rotate: 0 })
        }
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [selectedShotId, handleHistoryNav, lightbox, shots])

  const handleGenerateVideo = useCallback(async (shotId: string) => {
    const shot = shots.find((s) => s.id === shotId)
    if (!shot || videoGeneratingIds.has(shotId)) return
    setVideoGeneratingIds((prev) => new Set(prev).add(shotId))
    try {
      const videoPrompt = shot.videoPrompt || buildVideoPrompt(shot, characters, locations, projectStyle, bibleProps)
      console.info("[Video Generate] Shot:", shotId, "Prompt:", videoPrompt.slice(0, 120))
      // TODO: call video generation API when ready
      // For now, save the generated prompt to the shot
      updateShot(shotId, { videoPrompt })
    } catch (error) {
      console.error("Video generation error:", error)
    } finally {
      setVideoGeneratingIds((prev) => { const next = new Set(prev); next.delete(shotId); return next })
    }
  }, [shots, videoGeneratingIds, updateShot, characters, locations, projectStyle])

  const openEditOverlay = useCallback((shotId: string) => {
    setEditOverlayShotId(shotId)
    setEditInstruction("")
    setTimeout(() => editInputRef.current?.focus(), 100)
  }, [])

  const handleShotReEdit = useCallback(async () => {
    const shotId = editOverlayShotId
    if (!shotId || !editInstruction.trim()) return
    const shot = shots.find((s) => s.id === shotId)
    if (!shot || !shot.thumbnailUrl || editingIds.has(shotId)) return

    setEditingIds((prev) => new Set(prev).add(shotId))
    setEditOverlayShotId(null)
    const instruction = editInstruction.trim()
    setEditInstruction("")

    try {
      const { characters: chars, locations: locs, props: propsState } = useBibleStore.getState()
      const { projectStyle: style } = useBoardStore.getState()
      const reEditCfg = useReEditConfigStore.getState().config
      const selectedModel = reEditCfg.model === "auto"
        ? (useBoardStore.getState().selectedImageGenModel || "nano-banana-2")
        : reEditCfg.model

      // 1. Collect reference images based on config
      const refs: string[] = []

      // Current shot image
      if (reEditCfg.includeCurrentImage && shot.thumbnailUrl) {
        try {
          const resp = await fetch(shot.thumbnailUrl)
          const blob = await resp.blob()
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.readAsDataURL(blob)
          })
          refs.push(dataUrl)
        } catch {
          // continue without current image
        }
      }

      // Bible character refs
      if (reEditCfg.includeBibleRefs) {
        const bibleRefs = getShotGenerationReferenceImages(shot, chars, locs)
        const bibleDataUrls = await convertReferenceImagesToDataUrls(bibleRefs)
        refs.push(...bibleDataUrls)
      }

      const allReferenceImages = refs.slice(0, reEditCfg.maxReferenceImages)

      // 2. Build re-edit prompt
      const basePrompt = shot.imagePrompt || buildImagePrompt(shot, chars, locs, style, propsState)
      const rulesLines = [
        "- Apply the instruction above to modify the shot composition.",
        "- Keep ALL other elements intact: characters, costumes, lighting, environment, color palette, mood.",
        "- The first reference image is the CURRENT frame — preserve its world, just change what was requested.",
        "- Character reference images are visual anchors — preserve exact face identity and appearance.",
      ]
      if (reEditCfg.customRules.trim()) {
        rulesLines.push(...reEditCfg.customRules.trim().split("\n").map((r) => `- ${r.replace(/^-\s*/, "")}`))
      }
      const reEditPrompt = [
        `INSTRUCTION: ${instruction}`,
        "",
        "ORIGINAL SHOT DESCRIPTION:",
        basePrompt,
        "",
        "RULES:",
        ...rulesLines,
      ].join("\n")

      // 3. Call image generation API
      const apiUrl = selectedModel === "gpt-image" ? "/api/gpt-image" : "/api/nano-banana"
      const body = selectedModel === "gpt-image"
        ? { prompt: reEditPrompt, referenceImages: allReferenceImages }
        : { prompt: reEditPrompt, model: selectedModel, referenceImages: allReferenceImages }

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || `Re-edit failed: ${response.status}`)
      }

      const blob = await response.blob()
      const blobKey = `shot-thumb-${shotId}-${Date.now()}`
      const persisted = await trySaveBlob(blobKey, blob)
      const objectUrl = URL.createObjectURL(blob)

      const freshShot = useTimelineStore.getState().shots.find((s) => s.id === shotId)
      const editEntry = { url: objectUrl, blobKey: persisted ? blobKey : null, timestamp: Date.now(), source: "edit" as const }
      const editHistory = [...(freshShot?.generationHistory || []), editEntry]

      updateShot(shotId, {
        thumbnailUrl: objectUrl,
        thumbnailBlobKey: persisted ? blobKey : null,
        generationHistory: editHistory,
        activeHistoryIndex: editHistory.length - 1,
      })

      // Add to library
      if (reEditCfg.saveToLibrary) {
      const projectId = useProjectsStore.getState().activeProjectId || "global"
      useLibraryStore.getState().addFile({
        id: `${blobKey}-edit-${Date.now()}`,
        name: `${shot.label || "Shot"} — re-edit.png`,
        type: "image",
        mimeType: "image/png",
        size: blob.size,
        url: objectUrl,
        thumbnailUrl: objectUrl,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: ["generated", "storyboard", "re-edit"],
        projectId,
        folder: "/storyboard",
        origin: "generated",
      })
      }
    } catch (error) {
      console.error("Shot re-edit error:", error)
      setBreakdownWarning(`Re-edit failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setEditingIds((prev) => { const next = new Set(prev); next.delete(shotId); return next })
    }
  }, [editOverlayShotId, editInstruction, shots, editingIds, updateShot])

  const handleShotReEditFromOverlay = async (shotId: string, blob: Blob) => {
    setEditOverlayShotId(null)
    setEditingIds((prev) => new Set(prev).add(shotId))
    try {
      const blobKey = `shot-thumb-${shotId}-${Date.now()}`
      const persisted = await trySaveBlob(blobKey, blob)
      const objectUrl = URL.createObjectURL(blob)

      const freshShot = useTimelineStore.getState().shots.find((s) => s.id === shotId)
      const editEntry = { url: objectUrl, blobKey: persisted ? blobKey : null, timestamp: Date.now(), source: "edit" as const }
      const editHistory = [...(freshShot?.generationHistory || []), editEntry]

      updateShot(shotId, {
        thumbnailUrl: objectUrl,
        thumbnailBlobKey: persisted ? blobKey : null,
        generationHistory: editHistory,
        activeHistoryIndex: editHistory.length - 1,
      })
    } catch (error) {
      console.error("Shot re-edit error:", error)
    } finally {
      setEditingIds((prev) => { const next = new Set(prev); next.delete(shotId); return next })
    }
  }

  const handleDirectorShotUpdate = useCallback((shotId: string, patch: Partial<TimelineShot>) => {
    updateShot(shotId, patch)
  }, [updateShot])

  const handleAddDirectorShot = useCallback(() => {
    if (!selectedSceneId || directorShots.length >= MAX_DIRECTOR_SHOTS_PER_SCENE) return

    const shotId = addShot({
      sceneId: selectedSceneId,
      caption: "",
      directorNote: "",
      cameraNote: "",
      type: "image",
    })

    setPendingActionFocusShotId(shotId)
  }, [addShot, directorShots.length, selectedSceneId])

  const handleDuplicateSceneShot = useCallback((shot: TimelineShot) => {
    if (!shot.sceneId) return

    const sceneShots = (shotsBySceneId.get(shot.sceneId) ?? []).slice(0, MAX_DIRECTOR_SHOTS_PER_SCENE)
    if (sceneShots.length >= MAX_DIRECTOR_SHOTS_PER_SCENE) return

    const shotId = addShot({ ...shot, id: undefined as unknown as string })
    selectScene(shot.sceneId)
    selectShot(shotId)
    setPendingActionFocusShotId(shotId)
    setExpandedSceneShotIds((current) => new Set(current).add(shot.sceneId as string))
  }, [addShot, selectScene, selectShot, shotsBySceneId])

  const bindDirectorShotCardRef = useCallback((shotId: string) => (node: HTMLElement | null) => {
    if (!node || pendingActionFocusShotId !== shotId) return

    node.scrollIntoView({ behavior: "smooth", block: "nearest" })

    const actionField = node.querySelector<HTMLTextAreaElement>(`[data-focus-id="director-action-${shotId}"]`)
    if (actionField) {
      actionField.focus()
      const length = actionField.value.length
      actionField.setSelectionRange(length, length)
    }

    setPendingActionFocusShotId(null)
  }, [pendingActionFocusShotId])

  const handleEnhanceDirectorShot = useCallback(async (shot: TimelineShot) => {
    if (!shot.caption.trim() || enhancingIds.has(shot.id)) return

    setEnhancingIds((prev) => new Set(prev).add(shot.id))

    try {
      const relevantCharacters = characters.filter((character) => !selectedSceneId || character.sceneIds.includes(selectedSceneId))
      const relevantLocations = locations.filter((location) => !selectedSceneId || location.sceneIds.includes(selectedSceneId))

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: DIRECTOR_ASSISTANT_SYSTEM,
          temperature: 0.6,
          messages: [{
            role: "user",
            content: [
              `Action:\n${shot.caption.trim()}`,
              selectedSceneContext ? `Scene Context:\n${selectedSceneContext}` : "",
              relevantCharacters.length > 0 ? `Bible Characters:\n${relevantCharacters.map((character) => `- ${character.name}: ${character.description || ""}${character.appearancePrompt ? ` [Visual: ${character.appearancePrompt}]` : ""}`).join("\n")}` : "",
              relevantLocations.length > 0 ? `Bible Locations:\n${relevantLocations.map((location) => `- ${location.name}: ${location.description || ""}${location.appearancePrompt ? ` [Visual: ${location.appearancePrompt}]` : ""}`).join("\n")}` : "",
            ].filter(Boolean).join("\n\n"),
          }],
        }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const enhancement = sanitizeDirectorAssistantText(await readStreamedText(response))
      if (!enhancement) return

      updateShot(shot.id, {
        directorNote: mergeDirectorNotes(shot.directorNote, enhancement),
      })
    } catch (error) {
      console.error("Director assist error:", error)
    } finally {
      setEnhancingIds((prev) => {
        const next = new Set(prev)
        next.delete(shot.id)
        return next
      })
    }
  }, [characters, enhancingIds, locations, selectedSceneContext, selectedSceneId, updateShot])

  const handleBuildShotPrompt = useCallback(async (shotArg: TimelineShot) => {
    if (!shotArg.caption.trim() || buildingPromptIds.has(shotArg.id)) return

    setBuildingPromptIds((prev) => new Set(prev).add(shotArg.id))

    try {
      const { buildShotPromptsWithAI } = await import("@/lib/promptAI")

      // Read fresh shot from store (debounced fields may have updated)
      const shot = useTimelineStore.getState().shots.find((s) => s.id === shotArg.id) ?? shotArg
      const sceneId = shot.sceneId || selectedSceneId || ""
      const scene = scenes.find((s) => s.id === sceneId)

      const shotChars = characters.filter((c) =>
        c.sceneIds.includes(sceneId) || shot.caption.toLowerCase().includes(c.name.toLowerCase()),
      )
      const shotLocs = locations.filter((l) => l.sceneIds.includes(sceneId))
      const shotProps = bibleProps.filter((p) =>
        p.sceneIds.includes(sceneId) || shot.caption.toLowerCase().includes(p.name.toLowerCase()),
      )

      const result = await buildShotPromptsWithAI({
        sceneTitle: scene?.title,
        caption: shot.caption,
        directorNote: shot.directorNote,
        cameraNote: shot.cameraNote,
        shotSize: shot.shotSize,
        cameraMotion: shot.cameraMotion,
        characters: shotChars,
        locations: shotLocs,
        props: shotProps,
        projectStyle,
        storyHistory: useBibleStore.getState().storyHistory,
        directorVision: useBibleStore.getState().directorVision,
        excludedBibleIds: shot.excludedBibleIds,
      })

      // Fill all fields — only overwrite empty ones for director/camera
      const patch: Partial<TimelineShot> = {
        imagePrompt: result.imagePrompt,
        videoPrompt: result.videoPrompt,
        bakedPrompt: false,
      }
      if (!shot.directorNote.trim() && result.directorNote) patch.directorNote = result.directorNote
      if (!shot.cameraNote.trim() && result.cameraNote) patch.cameraNote = result.cameraNote
      updateShot(shotArg.id, patch)
    } catch (err) {
      console.error("Build prompt error:", err)
    } finally {
      setBuildingPromptIds((prev) => {
        const next = new Set(prev)
        next.delete(shotArg.id)
        return next
      })
    }
  }, [buildingPromptIds, characters, locations, bibleProps, projectStyle, scenes, selectedSceneId, updateShot])

  const handleShotSmartScan = useCallback(async (shot: TimelineShot) => {
    if (!shot.caption.trim() || scanningIds.has(shot.id)) return
    const sceneId = shot.sceneId || selectedSceneId || ""

    setScanningIds((prev) => new Set(prev).add(shot.id))
    try {
      const shotText = [shot.caption, shot.directorNote, shot.cameraNote, shot.visualDescription].filter(Boolean).join("\n")

      const existingNames = [
        ...characters.filter((c) => c.sceneIds.includes(sceneId)).map((c) => c.name),
        ...locations.filter((l) => l.sceneIds.includes(sceneId)).map((l) => l.name),
        ...bibleProps.filter((p) => p.sceneIds.includes(sceneId)).map((p) => p.name),
      ]


      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `Ты — ассистент реквизитора для кино. Найди ВСЕ физические предметы в тексте кадра.

ПРАВИЛА:
- Любой предмет, который можно потрогать или увидеть — это реквизит: мебель, одежда, еда, документы, техника, аксессуары и т.д.
- Если предмет подразумевается действием — тоже добавь (например "пишет" → ручка, бумага)
- НЕ добавляй людей и локации
- НЕ дублируй те что уже есть (учитывай синонимы)

Уже есть: ${existingNames.join(", ") || "ничего"}

Текст кадра:
${shotText}

Верни JSON массив:
[{"name": "название предмета", "appearancePrompt": "визуальное описание: материал, цвет, форма, состояние, эпоха"}]

ВАЖНО: Верни ТОЛЬКО JSON массив, без markdown, без пояснений. Если нечего — [].`,
          }],
          temperature: 0.3,
        }),
      })

      if (!res.ok) return
      const reader = res.body?.getReader()
      if (!reader) return
      const chunks: string[] = []
      // eslint-disable-next-line no-constant-condition
      while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(new TextDecoder().decode(value)) }
      const raw = chunks.join("").trim()

      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return

      const parsed = JSON.parse(jsonMatch[0]) as Array<{ name: string; appearancePrompt: string }>
      if (!Array.isArray(parsed)) return


      const { addProp } = useBibleStore.getState()
      for (const item of parsed) {
        if (!item.name?.trim() || !item.appearancePrompt?.trim()) continue
        const id = item.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-zа-яё0-9-]/gi, "")
        addProp({
          id,
          name: item.name,
          description: "",
          sceneIds: [sceneId],
          referenceImages: [],
          canonicalImageId: null,
          generatedImageUrl: null,
          imageBlobKey: null,
          appearancePrompt: item.appearancePrompt,
        })
      }
    } catch (err) {
      console.error("Shot smart scan error:", err)
    } finally {
      setScanningIds((prev) => { const n = new Set(prev); n.delete(shot.id); return n })
    }
  }, [scanningIds, characters, locations, bibleProps, selectedSceneId])

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

  const handleDragStart = (frameId: string, e: React.DragEvent) => {
    setDraggedFrameId(frameId)
    setDropSlotOpen(null)
    setDropTargetIndex(null)
    // Create a clean ghost — semi-transparent clone
    const el = e.currentTarget as HTMLElement
    const ghost = el.cloneNode(true) as HTMLElement
    ghost.style.width = `${el.offsetWidth}px`
    ghost.style.opacity = "0.85"
    ghost.style.transform = "scale(1.04) rotate(1.5deg)"
    ghost.style.boxShadow = "0 30px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,168,83,0.3)"
    ghost.style.borderRadius = "14px"
    ghost.style.position = "fixed"
    ghost.style.top = "-9999px"
    ghost.style.left = "-9999px"
    ghost.style.zIndex = "99999"
    ghost.style.pointerEvents = "none"
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, el.offsetWidth / 2, 30)
    requestAnimationFrame(() => document.body.removeChild(ghost))
  }

  const handleDragEnd = () => {
    if (draggedFrameId && dropTargetIndex !== null) {
      reorderShot(draggedFrameId, dropTargetIndex)
    }
    setDraggedFrameId(null)
    setDropTargetIndex(null)
    setDropSlotOpen(null)
  }

  const handleDragOverIndex = (index: number) => {
    if (!draggedFrameId) return
    if (dropTargetIndex === index) return
    setDropTargetIndex(index)
    // Immediately open slot for Apple-style instant feedback
    setDropSlotOpen(index)
  }

  const handleDragLeaveSlot = () => {
    // Don't clear immediately — only clear on dragEnd or new dragOver
  }

  const handleDropAtIndex = (index: number) => {
    if (!draggedFrameId) return
    reorderShot(draggedFrameId, index)
    setDraggedFrameId(null)
    setDropTargetIndex(null)
    setDropSlotOpen(null)
  }

  const minCardWidth = isExpanded
    ? Math.round(298 + ((cardScale - 72) / 32) * 88)
    : Math.round(269 + ((cardScale - 72) / 32) * 36)
  const cardGap = isExpanded ? 17 : 14
  const sceneTitle = selectedScene?.title || "Storyboard Workspace"
  const isDirectorWorkflow = viewMode === "scenes" || viewMode === "director"
  const isDuoMode = isExpanded && isSplitScreen
  const panelChrome = backgroundColor === "#0B0C10"
    ? "linear-gradient(180deg, rgba(16,18,24,0.98) 0%, rgba(12,13,18,0.98) 100%)"
    : `linear-gradient(180deg, ${backgroundColor} 0%, #0E1016 100%)`

  const parsedScenesContent = (
    <div className="flex flex-col gap-1.5 rounded-[18px] border border-white/8 bg-white/3 p-3">
      <div className="flex items-center justify-between gap-3 px-1 pb-1">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#8D919B]">Parsed Scenes</p>
          <p className="mt-1 text-[12px] text-[#D7CDC1]">Scene parsing stays intact and drives Director Cut selection.</p>
        </div>
        <div className="flex items-center gap-2">
          <DirectorFieldVisibilityControl value={directorFieldVisibility} onChange={setDirectorFieldVisibility} />
          <span className="rounded-md border border-white/8 bg-white/4 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#CDBB9E]">
            {scenes.length} scenes
          </span>
        </div>
      </div>

      {scenes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Clapperboard size={28} className="mb-3 text-white/15" />
          <p className="text-[12px] text-[#7F8590]">No scenes yet</p>
          <p className="mt-1 text-[10px] text-white/25">Add a scene heading (INT./EXT.) to your script</p>
        </div>
      ) : (
        scenes.map((scene) => {
          const isSelected = selectedSceneId === scene.id
          const relatedShots = shotsBySceneId.get(scene.id) ?? []
          const isShotsExpanded = expandedSceneShotIds.has(scene.id)
          const isBreaking = breakdownLoadingSceneId === scene.id
          const isGeneratingPrompts = promptLoadingSceneId === scene.id

          return (
            <div key={scene.id} className="flex flex-col">
              <div
                className={`relative flex items-stretch gap-3 rounded-lg px-3 py-2 text-left transition-colors cursor-pointer overflow-hidden ${
                  isSelected
                    ? "bg-white/5 border-l-2"
                    : "hover:bg-white/3 border-l-2 border-transparent"
                }`}
                style={isSelected ? { borderLeftColor: scene.color } : undefined}
                onClick={() => handleSceneClick(scene)}
                onDoubleClick={() => handleSceneDoubleClick(scene)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleSceneQuickAdd(scene)
                    return
                  }
                  if (e.key === " ") {
                    e.preventDefault()
                    handleSceneClick(scene)
                  }
                }}
              >
                {/* Breakdown progress bar — full width behind content */}
                {isBreaking && breakdownStage.progress > 0 && (
                  <div className="absolute inset-0 z-0 pointer-events-none">
                    <div
                      className="h-full rounded-lg"
                      style={{
                        width: `${breakdownStage.progress * 100}%`,
                        background: "linear-gradient(90deg, rgba(212,168,83,0.08) 0%, rgba(212,168,83,0.18) 60%, rgba(212,168,83,0.06) 100%)",
                        transition: "width 1.2s cubic-bezier(0.22, 1, 0.36, 1)",
                      }}
                    />
                  </div>
                )}

                <div
                  className="z-[1] w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: scene.color }}
                />
                <div className="z-[1] min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#8D919B]">
                    Scene {scene.index}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] font-medium text-[#E7E3DC]">
                    {scene.title}
                  </p>
                  {isBreaking && breakdownStage.message ? (
                    <p className="mt-1 text-[11px] text-[#D4A853] animate-pulse">
                      {breakdownStage.message}
                    </p>
                  ) : (
                    <div className="mt-1 flex items-center gap-3 text-[10px] text-[#7F8590]">
                      <span>{scene.blockIds.length} blocks</span>
                      <span>{relatedShots.length} shots</span>
                      {relatedShots.length > 0 ? <span>{isShotsExpanded ? "shots open" : "double click to open"}</span> : null}
                    </div>
                  )}
                </div>
                <div className="z-[1] flex shrink-0 items-center gap-1 relative">
                  {!isBreaking && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setBibleBubbleSceneId(bibleBubbleSceneId === scene.id ? null : scene.id)
                        }}
                        className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                          bibleBubbleSceneId === scene.id
                            ? "bg-[#D4A853]/15 text-[#D4A853]"
                            : "text-[#7F8590] hover:bg-white/5 hover:text-white"
                        }`}
                        aria-label={`Bible for scene ${scene.index}`}
                        title="Scene Bible"
                      >
                        <BookOpen size={10} />
                      </button>
                      <span className="rounded-md border border-white/8 bg-white/3 px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-[#9FA4AE]">
                        Enter
                      </span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleSceneQuickAdd(scene) }}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-[#D4A853]/22 bg-[#D4A853]/8 text-[#DAB56A] transition-colors hover:bg-[#D4A853]/16 hover:text-[#E8C98A]"
                        aria-label={`Create shot for scene ${scene.index}`}
                        title="Create shot for this scene"
                      >
                        <Plus size={12} />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleSceneBreakdown(scene) }}
                    disabled={isBreaking}
                    className={`flex h-6 items-center gap-1 rounded-md px-1.5 text-[9px] uppercase tracking-[0.12em] transition-colors ${
                      isBreaking
                        ? "text-[#D4A853]"
                        : "text-[#7F8590] hover:bg-white/5 hover:text-white"
                    } disabled:cursor-default`}
                    aria-label={`${isLucBessonBreakdownMode ? "Luc Besson breakdown" : "Breakdown"} scene ${scene.index}`}
                  >
                    {isBreaking ? <Loader2 size={10} className="animate-spin" /> : <Clapperboard size={10} />}
                    {isBreaking
                      ? `${Math.round(breakdownStage.progress * 100)}%`
                      : isLucBessonBreakdownMode
                        ? (relatedShots.length > 0 ? "Re-Besson" : "Besson")
                        : (relatedShots.length > 0 ? "Re-breakdown" : "Breakdown")
                    }
                  </button>
                  {!isBreaking && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleScenePromptGeneration(scene) }}
                      disabled={isGeneratingPrompts || relatedShots.length === 0}
                      className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[9px] uppercase tracking-[0.12em] text-[#CBB892] transition-colors hover:bg-[#D4A853]/10 hover:text-[#E7D1A4] disabled:opacity-40"
                      aria-label={`Generate prompts for scene ${scene.index}`}
                    >
                      {isGeneratingPrompts ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                      Prompts
                    </button>
                  )}
                </div>
              </div>

              {relatedShots.length > 0 && isShotsExpanded ? (
                <div className="ml-5 flex flex-col gap-3 border-l border-white/8 pl-3">
                  {relatedShots.map((shot, index) => (
                    <DirectorShotCard
                      key={shot.id}
                      shot={shot}
                      index={index}
                      selected={selectedShotId === shot.id}
                      canDuplicate={relatedShots.length < MAX_DIRECTOR_SHOTS_PER_SCENE}
                      isEnhancing={enhancingIds.has(shot.id)}
                      isBuilding={buildingPromptIds.has(shot.id)}
                      autoFocusAction={pendingActionFocusShotId === shot.id}
                      showThumbnail={!isDuoMode}
                      fieldVisibility={directorFieldVisibility}
                      bibleChars={characters.filter((c) => c.sceneIds.includes(scene.id))}
                      bibleLocs={locations.filter((l) => l.sceneIds.includes(scene.id))}
                      bibleProps={bibleProps.filter((p) => p.sceneIds.includes(scene.id))}
                      cardRef={bindDirectorShotCardRef(shot.id)}
                      onSelect={() => {
                        selectScene(scene.id)
                        selectShot(shot.id)
                      }}
                      onUpdate={(patch) => handleDirectorShotUpdate(shot.id, patch)}
                      onEnhance={() => void handleEnhanceDirectorShot(shot)}
                      onBuild={() => void handleBuildShotPrompt(shot)}
                      onOpenBible={() => setBibleBubbleSceneId(scene.id)}
                      onSmartScan={() => void handleShotSmartScan(shot)}
                      isScanning={scanningIds.has(shot.id)}
                      onGenerate={() => void handleGenerateImage(shot.id)}
                      isGenerating={generatingIds.has(shot.id)}
                      onOpenStudio={() => {
                        if (shot.thumbnailUrl) {
                          setLightbox({ src: shot.thumbnailUrl, shotId: shot.id })
                        }
                      }}
                      onDelete={() => removeShot(shot.id)}
                      onDuplicate={() => handleDuplicateSceneShot(shot)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )
        })
      )}
    </div>
  )

  const workspaceChrome = (
    <div className={isDuoMode ? "sticky top-0 z-30 bg-[#0E1016]" : ""}>
      <div className="border-b border-white/6 px-5 py-3 text-[#E5E0DB]">
        <div className="flex flex-wrap items-center justify-between gap-4 text-[#9FA4AE]">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setViewMode("scenes")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] uppercase tracking-[0.14em] transition-colors ${isDirectorWorkflow ? "bg-white/8 text-white" : "text-white/40 hover:text-white/60"}`}
            >
              <Camera size={13} />
              Director Cut
            </button>
            <button
              type="button"
              onClick={() => setViewMode("board")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] uppercase tracking-[0.14em] transition-colors ${viewMode === "board" ? "bg-white/8 text-white" : "text-white/40 hover:text-white/60"}`}
            >
              <Grid size={13} />
              Board
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] uppercase tracking-[0.14em] transition-colors ${viewMode === "list" ? "bg-white/8 text-white" : "text-white/40 hover:text-white/60"}`}
            >
              <List size={13} />
              Shot List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("inspector")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] uppercase tracking-[0.14em] transition-colors ${viewMode === "inspector" ? "bg-white/8 text-white" : "text-white/40 hover:text-white/60"}`}
            >
              <BookOpen size={13} />
              Inspector
            </button>
            <button
              type="button"
              onClick={() => setViewMode("prompt")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] uppercase tracking-[0.14em] transition-colors ${viewMode === "prompt" ? "bg-[#D4A853]/15 border border-[#D4A853]/30 text-[#E6C887]" : "text-white/40 hover:text-white/60"}`}
            >
              <Wand2 size={13} />
              Prompt Lab
            </button>
          </div>

          <div className="flex items-center gap-2.5 text-[12px] uppercase tracking-[0.16em] text-[#7F8590]">
            <span>{scenes.length} scenes</span>
            <span className="h-3.5 w-px bg-white/8" />
            <span>{frames.length} frames</span>
            <span className="h-3.5 w-px bg-white/8" />
            <span>{formatSummaryTime(totalShotDurationMs)}</span>
          </div>
        </div>
      </div>

      {breakdownWarning ? (
        <div className="border-b border-amber-500/20 bg-amber-500/8 px-4 py-3 text-[11px] text-[#E8D3A2]">
          {breakdownWarning}
        </div>
      ) : null}
    </div>
  )

  const directorWorkspaceContent = parsedScenesContent

  const bibleBubbleScene = bibleBubbleSceneId ? scenes.find((s) => s.id === bibleBubbleSceneId) : null

  return (
    <>
    {bibleBubbleScene && (
      <SceneBibleBubble
        sceneId={bibleBubbleScene.id}
        sceneIndex={bibleBubbleScene.index}
        sceneTitle={bibleBubbleScene.title}
        sceneBlockIds={bibleBubbleScene.blockIds}
        characters={characters}
        locations={locations}
        props={bibleProps}
        blocks={scriptBlocks}
        onClose={() => setBibleBubbleSceneId(null)}
      />
    )}
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
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-3">
          {/* Left — scene title */}
          <div className="min-w-0 pr-5">
            <p className="truncate text-[17px] font-medium tracking-[0.01em] text-[#E7E3DC]">{sceneTitle}</p>
          </div>

          {/* Center — primary actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleJenkinsBreakdown}
              disabled={jenkinsLoading || !scenario.trim()}
              className="flex items-center gap-2 rounded-lg border border-[#D4A853]/20 bg-[#D4A853]/8 px-4 py-2 text-[12px] uppercase tracking-[0.12em] text-[#D4A853] transition-colors hover:bg-[#D4A853]/14 disabled:opacity-35"
            >
              {jenkinsLoading ? <Loader2 size={14} className="animate-spin" /> : <Clapperboard size={14} />}
              Breakdown
            </button>
            {lucBessonProfile && (
              <button
                type="button"
                onClick={handleLucBessonBreakdown}
                className="flex items-center gap-2 rounded-lg border border-[#8b5cf6]/20 bg-[#8b5cf6]/8 px-4 py-2 text-[12px] uppercase tracking-[0.12em] text-[#c4b5fd] transition-colors hover:bg-[#8b5cf6]/14"
              >
                <Wand2 size={14} />
                Fincher
              </button>
            )}

            {/* Model selector */}
            <div className="flex items-center rounded-lg border border-white/8 bg-white/4">
              {IMAGE_GEN_MODELS.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => setSelectedImageGenModel(model.id)}
                  title={`${model.label} ${model.price}`}
                  className={`px-2.5 py-1.5 text-[11px] font-medium transition-all ${
                    selectedImageGenModel === model.id
                      ? "bg-white/8 text-[#D4A853]"
                      : "text-white/25 hover:text-white/50"
                  }`}
                >
                  {model.label}
                </button>
              ))}
            </div>

            <ProjectStylePicker projectStyle={projectStyle} setProjectStyle={setProjectStyle} />
          </div>

          {/* Right — utility */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleToggleSplitScreen}
              className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] uppercase tracking-[0.1em] transition-colors ${
                isDuoMode
                  ? "border-[#D4A853]/25 bg-[#D4A853]/10 text-[#D4A853]"
                  : "border-white/8 text-white/25 hover:text-white/50"
              }`}
              title="Split Screen"
            >
              <Film size={13} />
              Split
            </button>
            <button
              type="button"
              onClick={() => setConfigPanelOpen((v) => !v)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                configPanelOpen
                  ? "border-[#D4A853]/25 bg-[#D4A853]/10 text-[#D4A853]"
                  : "border-white/8 text-white/25 hover:text-white/50"
              }`}
              title="Config"
            >
              <Settings size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 text-white/25 transition-colors hover:text-white/50"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {configPanelOpen && (
          <div className="border-b border-white/8 bg-[#0D0F12] px-5 py-3.5">
            <div className="flex flex-wrap items-center gap-3.5">
              <span className="text-[11px] uppercase tracking-[0.2em] text-[#8D919B]">Engine Config</span>
              {([
                { key: "shotDensity" as const, label: "Density", options: ["lean", "balanced", "dense"] },
                { key: "continuityStrictness" as const, label: "Continuity", options: ["flexible", "standard", "strict"] },
                { key: "textRichness" as const, label: "Richness", options: ["simple", "rich", "lush"] },
                { key: "relationMode" as const, label: "Relations", options: ["minimal", "balanced", "explicit"] },
                { key: "fallbackMode" as const, label: "Fallback", options: ["balanced", "prefer_speed", "fail_fast"] },
                { key: "keyframePolicy" as const, label: "Keyframes", options: ["opening_anchor", "story_turns", "every_major_shift"] },
              ] as const).map(({ key, label, options }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[11px] text-white/40">{label}</span>
                  <div className="flex rounded-lg border border-white/8 bg-white/4">
                    {options.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setBreakdownGlobalConfig({ [key]: opt })}
                        className={`px-2.5 py-1.5 text-[11px] transition-all ${
                          breakdownConfig[key] === opt
                            ? "bg-[#D4A853]/18 text-[#E8C778]"
                            : "text-white/35 hover:text-white/60"
                        }`}
                      >
                        {opt.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isDuoMode ? workspaceChrome : null}

        <div className={isDuoMode ? "flex-1 overflow-hidden" : "flex-1 overflow-y-auto px-5 py-5"} style={isDuoMode ? undefined : { overscrollBehaviorY: "contain" }}>
          {isDuoMode ? (
          <div className="flex h-full">
            <div className="w-1/2 overflow-hidden border-r border-white/8">
              <ScriptViewer
                selectedSceneId={selectedSceneId}
                onSceneClick={(sceneId) => {
                  selectScene(selectedSceneId === sceneId ? null : sceneId)
                }}
                fontSize={scriptFontSize}
              />
            </div>
            <div className="w-1/2 overflow-y-auto" style={{ overscrollBehaviorY: "contain" }}>
              {workspaceChrome}
              <div className="px-4 py-4">
                {isDirectorWorkflow ? (
                directorWorkspaceContent
                ) : viewMode === "board" ? shots.length === 0 ? (
                <div className="flex min-h-full flex-col items-center justify-center py-16 text-center">
                  <Grid size={28} className="mb-3 text-white/15" />
                  <p className="text-[12px] text-[#7F8590]">No shots yet. Use Director Cut to parse scenes and build shots.</p>
                </div>
                ) : (
                <div
                  className="grid min-h-full"
                  style={{
                    gap: cardGap,
                    gridTemplateColumns: "minmax(0, 1fr)",
                    alignContent: "start",
                    transition: "gap 240ms ease, grid-template-columns 240ms ease",
                  }}
                >
                  {frames.map((frame, index) => {
                    const shot = sortedShots[index]
                    const isGenerating = shot ? (generatingIds.has(shot.id) || videoGeneratingIds.has(shot.id)) : false
                    const isFailed = shot ? failedIds.has(shot.id) : false
                    const previewSrc = shot?.thumbnailUrl || frame.svg || null
                    return (
                    <Fragment key={frame.id}>
                      <div
                        className={`group relative overflow-hidden rounded-[14px] border bg-[#111317] p-2 shadow-[0_20px_45px_rgba(0,0,0,0.28)] transition-all duration-200 ${recentInsertedFrameId === frame.id ? "storyboard-card-enter" : ""} ${selectedShotId === shot?.id ? "border-[#D4A853]/40 ring-1 ring-[#D4A853]/20" : "border-white/6"} ${dropTargetIndex === index || dropTargetIndex === index + 1 ? "border-[#D8C4A5]/40 shadow-[0_0_0_1px_rgba(216,196,165,0.18),0_20px_45px_rgba(0,0,0,0.34)]" : "hover:-translate-y-px hover:border-white/10 hover:bg-[#14171C]"}`}
                        draggable
                        onDragStart={(e) => handleDragStart(frame.id, e)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(event) => {
                          event.preventDefault()
                          if (!draggedFrameId || draggedFrameId === frame.id) return
                          const targetIdx = index + (event.nativeEvent.offsetX > event.currentTarget.clientWidth / 2 ? 1 : 0)
                          handleDragOverIndex(targetIdx)
                        }}
                        onDragLeave={handleDragLeaveSlot}
                        onDrop={(event) => {
                          event.preventDefault()
                          const targetIdx = dropSlotOpen ?? (index + (event.nativeEvent.offsetX > event.currentTarget.clientWidth / 2 ? 1 : 0))
                          handleDropAtIndex(targetIdx)
                        }}
                        style={{
                          opacity: draggedFrameId === frame.id ? 0.3 : 1,
                          transform: draggedFrameId === frame.id ? "scale(0.96)" : undefined,
                          marginLeft: dropSlotOpen === index ? minCardWidth + cardGap : 0,
                          transition: "box-shadow 300ms cubic-bezier(0.22,1,0.36,1), transform 300ms cubic-bezier(0.22,1,0.36,1), border-color 240ms ease, background-color 240ms ease, opacity 200ms ease, margin-left 400ms cubic-bezier(0.22,1,0.36,1)",
                        }}
                      >
                        <div className="relative flex h-full flex-col text-[#E5E0DB]">
                          <div
                            className="relative overflow-hidden rounded-[10px] border border-white/8 bg-[#0E1014] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                            style={{ aspectRatio: "16 / 8.7" }}
                            onClick={() => { if (shot) selectShot(shot.id) }}
                            onDoubleClick={() => { if (previewSrc && shot) { setLightbox({ src: previewSrc, shotId: shot.id }); setLightboxTransform({ flipH: false, flipV: false, rotate: 0 }) } }}
                          >
                            {previewSrc ? (
                              <Image
                                src={previewSrc}
                                alt=""
                                width={320}
                                height={320}
                                unoptimized
                                className="h-full w-full cursor-zoom-in object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                draggable={false}
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_58%),linear-gradient(180deg,#151922_0%,#0E1014_100%)] px-6 text-center">
                                <div>
                                  <p className="text-[12px] uppercase tracking-[0.18em] text-[#8D919B]">No image yet</p>
                                  <p className="mt-1.5 text-[13px] text-[#C3B8AA]">Run Breakdown or Generate to create shot artwork.</p>
                                </div>
                              </div>
                            )}
                            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,10,14,0.04)_0%,rgba(8,10,14,0.12)_52%,rgba(8,10,14,0.34)_100%)]" />
                            <div className="absolute left-2.5 top-2.5 flex items-center gap-2">
                              <div className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-[#EAE2D7] backdrop-blur-sm">
                                {shot ? shotLabel(shot.id) : `Shot ${String(index + 1).padStart(2, "0")}`}
                              </div>
                              {shot && setupLabel(shot.id) && (
                                <div className="rounded-md border border-[#D4A853]/25 bg-[#D4A853]/15 px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-[#D4A853] backdrop-blur-sm">
                                  {setupLabel(shot.id)}
                                </div>
                              )}
                            </div>

                            {shot && (shot.generationHistory?.length ?? 0) > 1 && !isGenerating && (() => {
                              const total = shot.generationHistory.length
                              const idx = shot.activeHistoryIndex ?? total - 1
                              const current = idx + 1
                              const entry = shot.generationHistory[idx]
                              const src = entry?.source || "generate"
                              const sourceLabel = src === "edit" ? "E" : src === "crop" ? "C" : src === "color" ? "M" : "G"
                              const sourceColor = src === "edit" ? "bg-purple-400" : src === "crop" ? "bg-blue-400" : src === "color" ? "bg-amber-400" : "bg-emerald-400"
                              return (
                                <div className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-black/60 px-1 py-0.5 backdrop-blur-sm">
                                  <button type="button" onClick={(e) => { e.stopPropagation(); handleHistoryNav(shot.id, -1) }} disabled={current <= 1} className="flex h-5 w-5 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30">
                                    <ChevronLeft size={12} />
                                  </button>
                                  <div className="flex items-center gap-1">
                                    <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[7px] font-bold text-black ${sourceColor}`}>{sourceLabel}</span>
                                    <span className="min-w-[32px] text-center text-[10px] tabular-nums text-white/80">{current}/{total}</span>
                                  </div>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); handleHistoryNav(shot.id, 1) }} disabled={current >= total} className="flex h-5 w-5 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30">
                                    <ChevronRight size={12} />
                                  </button>
                                </div>
                              )
                            })()}

                            {isGenerating ? (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                                <Loader2 size={28} className="animate-spin text-white/70" />
                              </div>
                            ) : isFailed ? (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 backdrop-blur-sm">
                                <AlertTriangle size={22} className="text-red-400/80" />
                                <p className="text-[10px] uppercase tracking-[0.14em] text-red-300/90">Generation failed</p>
                                <button
                                  type="button"
                                  onClick={() => shot && handleGenerateImage(shot.id)}
                                  className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-white/90 backdrop-blur-sm transition-colors hover:bg-white/20"
                                >
                                  <RefreshCw size={12} />
                                  Retry
                                </button>
                              </div>
                            ) : (
                              <>
                              {shot?.thumbnailUrl && !editingIds.has(shot.id) && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); shot && openEditOverlay(shot.id) }}
                                  className="absolute left-2 bottom-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 bg-black/40 text-white/60 backdrop-blur-sm transition-all hover:bg-white/15 hover:text-white/90 opacity-0 group-hover:opacity-100"
                                  aria-label="Edit shot"
                                >
                                  <Pencil size={12} />
                                </button>
                              )}
                              {editingIds.has(shot?.id ?? "") && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                                  <Loader2 size={28} className="animate-spin text-[#DCC7A3]" />
                                </div>
                              )}
                              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={() => shot && handleGenerateImage(shot.id)}
                                  className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/50 px-3.5 py-2 text-[12px] uppercase tracking-[0.14em] text-white/90 backdrop-blur-sm transition-colors hover:bg-white/10"
                                >
                                  <ImageIcon size={13} />
                                  Photo
                                </button>
                                <button
                                  type="button"
                                  onClick={() => shot && handleGenerateVideo(shot.id)}
                                  disabled={videoGeneratingIds.has(shot?.id ?? "")}
                                  className="flex items-center gap-1.5 rounded-lg border border-[#7C6FD8]/30 bg-[#7C6FD8]/15 px-3.5 py-2 text-[12px] uppercase tracking-[0.14em] text-[#C4BBEF] backdrop-blur-sm transition-colors hover:bg-[#7C6FD8]/25 disabled:opacity-40"
                                >
                                  <Video size={13} />
                                  Video
                                </button>
                                <button
                                  type="button"
                                  onClick={() => shot && setPromptLabShotId(shot.id)}
                                  className="flex items-center gap-1.5 rounded-lg border border-[#D4A853]/30 bg-[#D4A853]/15 px-3.5 py-2 text-[12px] uppercase tracking-[0.14em] text-[#E6C887] backdrop-blur-sm transition-colors hover:bg-[#D4A853]/25"
                                >
                                  <Wand2 size={13} />
                                  Edit
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
                              </>
                            )}
                          </div>

                          <div className="mt-2.5 px-2 pb-2">
                            {/* Action line */}
                            <p className="text-[14px] leading-snug text-[#C8CDD5]">{frame.meta.caption || shot?.label || "—"}</p>
                            {/* Tech badge */}
                            <div className="mt-2 flex items-center gap-2 text-[12px] text-[#6B7280]">
                              <span>{frame.meta.shot}</span>
                              <span className="text-white/10">·</span>
                              <span>{frame.meta.motion || "static"}</span>
                              <span className="text-white/10">·</span>
                              {shot ? (
                                <EditableDuration durationMs={shot.duration} onChange={(ms) => updateShot(shot.id, { duration: ms })} />
                              ) : (
                                <span>{((d) => Number.isNaN(d) ? "3.0" : d.toFixed(1))(Number(frame.meta.duration) / 1000)}s</span>
                              )}
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
                        <p className="text-[13px] uppercase tracking-[0.2em] text-[#E7E3DC]">Add Shot</p>
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
                      const imagePrompt = buildImagePrompt(resolvedShot, characters, locations, projectStyle, bibleProps)
                      const videoPrompt = buildVideoPrompt(resolvedShot, characters, locations, projectStyle, bibleProps)
                      const refs = getReferencedBibleEntries(resolvedShot, characters, locations)
                      const previewSrc = shot.thumbnailUrl || shot.svg || null
                      const durationLabel = null // replaced by EditableDuration

                      return (
                        <div key={shot.id} className={`mb-2 overflow-hidden rounded-xl border transition-colors ${isExpanded ? "border-white/15 bg-white/3" : "border-white/8 bg-white/2 hover:bg-white/4"}`}>
                          <button type="button" onClick={() => setExpandedShotId(isExpanded ? null : shot.id)} className="flex w-full items-center gap-3 px-3 py-3 text-left">
                            <div className="relative h-9 w-16 overflow-hidden rounded-md border border-white/8 bg-white/3">
                              {previewSrc ? (
                                <Image src={previewSrc} alt="" fill unoptimized className="object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-[0.16em] text-white/25">No Img</div>
                              )}
                            </div>
                            <div className="w-8 shrink-0 text-[16px] font-medium tracking-[0.14em] text-[#E7E3DC]">{String(index + 1).padStart(2, "0")}</div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-medium text-[#E7E3DC]">{shot.label || `Shot ${index + 1}`}</p>
                              <p className="mt-1 flex items-center gap-1 truncate text-[10px] text-white/35">{shot.shotSize || "WIDE"} · {shot.cameraMotion || "Static"} · <EditableDuration durationMs={shot.duration} onChange={(ms) => updateShot(shot.id, { duration: ms })} /></p>
                            </div>
                            <div className={`shrink-0 text-[16px] text-white/40 transition-transform ${isExpanded ? "rotate-90" : "rotate-0"}`}>▸</div>
                          </button>
                          {isExpanded ? (
                            <div className="grid gap-3 border-t border-white/8 px-3 pb-3 pt-2">
                              <section className="grid gap-1.5">
                                <div className="flex items-center gap-2"><BookOpen size={12} className="text-white/35" /><p className="text-[10px] uppercase tracking-wider text-white/30">Литературный</p></div>
                                {editingShotField?.shotId === shot.id && editingShotField.field === "caption" ? (
                                  <textarea autoFocus rows={4} value={editingShotDraft} onChange={(event) => setEditingShotDraft(event.target.value)} onBlur={() => commitEditingShotField(shot.id)} className="w-full resize-y rounded-lg bg-white/3 p-3 text-[13px] text-white/80 outline-none ring-1 ring-inset ring-white/10" />
                                ) : (
                                  <button type="button" onClick={() => startEditingShotField(shot, "caption", shot.caption || "")} className="w-full rounded-lg bg-white/3 p-3 text-left text-[13px] text-white/80 transition-colors hover:bg-white/4"><span className="whitespace-pre-wrap">{resolvedShot.caption || shot.label || "Нет описания кадра."}</span></button>
                                )}
                              </section>
                              <section className="grid gap-1.5">
                                <div className="flex items-center gap-2"><Clapperboard size={12} className="text-white/35" /><p className="text-[10px] uppercase tracking-wider text-white/30">Режиссёрский</p></div>
                                {editingShotField?.shotId === shot.id && editingShotField.field === "directorNote" ? (
                                  <textarea autoFocus rows={4} value={editingShotDraft} onChange={(event) => setEditingShotDraft(event.target.value)} onBlur={() => commitEditingShotField(shot.id)} className="w-full resize-y rounded-lg bg-white/3 p-3 text-[12px] leading-5 text-white/60 outline-none ring-1 ring-inset ring-white/10" />
                                ) : (
                                  <button type="button" onClick={() => startEditingShotField(shot, "directorNote", shot.directorNote || "")} className="w-full rounded-lg bg-white/3 p-3 text-left text-[12px] leading-5 text-white/60 transition-colors hover:bg-white/4"><span className="whitespace-pre-wrap">{resolvedShot.directorNote || "Нет режиссёрской заметки."}</span></button>
                                )}
                              </section>
                              <section className="grid gap-1.5">
                                <div className="flex items-center gap-2"><Camera size={12} className="text-amber-400/70" /><p className="text-[10px] uppercase tracking-wider text-white/30">Операторский</p></div>
                                {editingShotField?.shotId === shot.id && editingShotField.field === "cameraNote" ? (
                                  <textarea autoFocus rows={5} value={editingShotDraft} onChange={(event) => setEditingShotDraft(event.target.value)} onBlur={() => commitEditingShotField(shot.id)} className="w-full resize-y rounded-lg bg-white/3 p-3 font-mono text-[12px] leading-5 text-amber-400/70 outline-none ring-1 ring-inset ring-white/10" />
                                ) : (
                                  <button type="button" onClick={() => startEditingShotField(shot, "cameraNote", shot.cameraNote || "")} className="w-full rounded-lg bg-white/3 p-3 text-left font-mono text-[12px] leading-5 text-amber-400/70 transition-colors hover:bg-white/4"><span className="whitespace-pre-wrap">{resolvedShot.cameraNote || "Нет операторской заметки."}</span></button>
                                )}
                              </section>
                              <section className="grid gap-1.5">
                                <div className="flex items-center gap-2"><ImageIcon size={12} className="text-white/35" /><p className="text-[10px] uppercase tracking-wider text-white/30">Промпт картинки</p><span className="rounded-full border border-[#D4A853]/35 bg-[#D4A853]/12 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-[#E8D7B2]">EN</span></div>
                                {editingShotField?.shotId === shot.id && editingShotField.field === "imagePrompt" ? (
                                  <textarea autoFocus rows={7} value={editingShotDraft} onChange={(event) => setEditingShotDraft(event.target.value)} onBlur={() => commitEditingShotField(shot.id)} className="w-full resize-y rounded-lg bg-white/2 p-3 font-mono text-[11px] leading-5 text-white/40 outline-none ring-1 ring-inset ring-white/10" />
                                ) : (
                                  <button type="button" onClick={() => startEditingShotField(shot, "imagePrompt", shot.imagePrompt || imagePrompt)} className="w-full rounded-lg bg-white/2 p-3 text-left font-mono text-[11px] leading-5 text-white/40 transition-colors hover:bg-white/4"><span className="whitespace-pre-wrap">{imagePrompt}</span></button>
                                )}
                              </section>
                              <section className="grid gap-1.5 opacity-60">
                                <div className="flex items-center gap-2"><Film size={12} className="text-white/35" /><p className="text-[10px] uppercase tracking-wider text-white/30">Промпт видео</p><span className="rounded-full border border-[#D4A853]/35 bg-[#D4A853]/12 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-[#E8D7B2]">EN</span><span className="rounded-full border border-white/12 bg-white/4 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-white/40">будущее</span></div>
                                {editingShotField?.shotId === shot.id && editingShotField.field === "videoPrompt" ? (
                                  <textarea autoFocus rows={6} value={editingShotDraft} onChange={(event) => setEditingShotDraft(event.target.value)} onBlur={() => commitEditingShotField(shot.id)} className="w-full resize-y rounded-lg bg-white/2 p-3 font-mono text-[11px] leading-5 text-white/30 outline-none ring-1 ring-inset ring-white/10" />
                                ) : (
                                  <button type="button" onClick={() => startEditingShotField(shot, "videoPrompt", shot.videoPrompt || videoPrompt)} className="w-full rounded-lg bg-white/2 p-3 text-left font-mono text-[11px] leading-5 text-white/30 transition-colors hover:bg-white/4"><span className="whitespace-pre-wrap">{videoPrompt}</span></button>
                                )}
                              </section>
                              <section className="grid gap-1.5">
                                <p className="text-[10px] uppercase tracking-wider text-white/30">Библия — референсы</p>
                                <div className="grid gap-2 rounded-lg bg-white/3 p-3">
                                  {refs.characters.length === 0 && !refs.location ? <p className="text-[12px] text-white/35">Нет связанных bible entries для этого шота.</p> : null}
                                  {refs.characters.map((character) => (
                                    <div key={character.id} className="flex items-center gap-3"><div className="relative h-8 w-8 overflow-hidden rounded-md border border-white/10 bg-white/4">{character.generatedPortraitUrl ? <Image src={character.generatedPortraitUrl} alt={character.name} fill unoptimized className="object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-[0.14em] text-white/25">{character.name.slice(0, 2)}</div>}</div><div><p className="text-[12px] text-[#E7E3DC]">{character.name}</p><p className="text-[11px] text-white/35">portrait · ref ×{character.referenceImages.length}</p></div></div>
                                  ))}
                                  {refs.location ? <div className="flex items-center gap-3"><div className="relative h-8 w-8 overflow-hidden rounded-md border border-white/10 bg-white/4">{refs.location.generatedImageUrl ? <Image src={refs.location.generatedImageUrl} alt={refs.location.name} fill unoptimized className="object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-[0.14em] text-white/25">LOC</div>}</div><div><p className="text-[12px] text-[#E7E3DC]">{refs.location.name}</p><p className="text-[11px] text-white/35">{refs.location.intExt} · ref ×{refs.location.referenceImages.length}</p></div></div> : null}
                                </div>
                              </section>
                            </div>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </div>
                ) : viewMode === "prompt" ? (
                <div className="-mx-4 -my-4 h-full"><PromptLab /></div>
                ) : (
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
                        const shot = sortedShots[index]
                        return (
                          <tr key={frame.id} className="border-b border-white/5 transition-colors hover:bg-white/3">
                            <td className="px-2 py-1.5 text-[#7F8590]">{String(index + 1).padStart(2, "0")}</td>
                            <td className="px-2 py-1.5 uppercase"><InlineSelect value={frame.meta.shot} options={SHOT_SIZE_OPTIONS} onChange={(v) => shot && updateShot(shot.id, { shotSize: v })} /></td>
                            <td className="px-2 py-1.5"><InlineText value={frame.meta.caption} onChange={(v) => shot && updateShot(shot.id, { caption: v, label: `${frame.meta.shot} — ${v}` })} placeholder="Caption..." /></td>
                            <td className="px-2 py-1.5"><InlineSelect value={frame.meta.motion} options={CAMERA_MOTION_OPTIONS} onChange={(v) => shot && updateShot(shot.id, { cameraMotion: v })} /></td>
                            <td className="px-2 py-1.5"><InlineDuration value={frame.meta.duration} onChange={(ms) => shot && updateShot(shot.id, { duration: ms })} /></td>
                            <td className="px-2 py-1.5"><InlineText value={shot?.notes || ""} onChange={(v) => shot && updateShot(shot.id, { notes: v })} placeholder="Notes..." multiline /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
            </div>
          </div>
          ) : isDirectorWorkflow ? (
          directorWorkspaceContent
          ) : viewMode === "board" ? shots.length === 0 ? (
          <div className="flex min-h-full flex-col items-center justify-center py-16 text-center">
            <Grid size={28} className="mb-3 text-white/15" />
            <p className="text-[12px] text-[#7F8590]">No shots yet. Use Director Cut to parse scenes and build shots.</p>
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
              const shot = sortedShots[index]
              const isGenerating = shot ? (generatingIds.has(shot.id) || videoGeneratingIds.has(shot.id)) : false
              const isFailed = shot ? failedIds.has(shot.id) : false
              const previewSrc = shot?.thumbnailUrl || frame.svg || null
              return (
              <Fragment key={frame.id}>
                <div
                  className={`group relative overflow-hidden rounded-[14px] border border-white/6 bg-[#111317] p-2 shadow-[0_20px_45px_rgba(0,0,0,0.28)] transition-all duration-200 ${recentInsertedFrameId === frame.id ? "storyboard-card-enter" : ""} ${dropTargetIndex === index || dropTargetIndex === index + 1 ? "border-[#D8C4A5]/40 shadow-[0_0_0_1px_rgba(216,196,165,0.18),0_20px_45px_rgba(0,0,0,0.34)]" : "hover:-translate-y-px hover:border-white/10 hover:bg-[#14171C]"}`}
                  draggable
                  onDragStart={(e) => handleDragStart(frame.id, e)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(event) => {
                    event.preventDefault()
                    if (!draggedFrameId || draggedFrameId === frame.id) return
                    const targetIdx = index + (event.nativeEvent.offsetX > event.currentTarget.clientWidth / 2 ? 1 : 0)
                    handleDragOverIndex(targetIdx)
                  }}
                  onDragLeave={handleDragLeaveSlot}
                  onDrop={(event) => {
                    event.preventDefault()
                    const targetIdx = dropSlotOpen ?? (index + (event.nativeEvent.offsetX > event.currentTarget.clientWidth / 2 ? 1 : 0))
                    handleDropAtIndex(targetIdx)
                  }}
                  style={{
                    opacity: draggedFrameId === frame.id ? 0.3 : 1,
                    transform: draggedFrameId === frame.id ? "scale(0.96)" : undefined,
                    marginLeft: dropSlotOpen === index ? minCardWidth + cardGap : 0,
                    transition: "box-shadow 300ms cubic-bezier(0.22,1,0.36,1), transform 300ms cubic-bezier(0.22,1,0.36,1), border-color 240ms ease, background-color 240ms ease, opacity 200ms ease, margin-left 400ms cubic-bezier(0.22,1,0.36,1)",
                  }}
                >
                  <div className="relative flex h-full flex-col text-[#E5E0DB]">
                    <div
                      className="relative overflow-hidden rounded-[10px] border border-white/8 bg-[#0E1014] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                      style={{ aspectRatio: "16 / 8.7" }}
                      onDoubleClick={() => { if (previewSrc && shot) { setLightbox({ src: previewSrc, shotId: shot.id }); setLightboxTransform({ flipH: false, flipV: false, rotate: 0 }) } }}
                    >
                      {previewSrc ? (
                        <Image
                          src={previewSrc}
                          alt=""
                          width={320}
                          height={320}
                          unoptimized
                          className="h-full w-full cursor-zoom-in object-cover transition-transform duration-300 group-hover:scale-[1.02]"
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
                      <div className="absolute left-2 top-2 flex items-center gap-1.5">
                        <div className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#EAE2D7] backdrop-blur-sm">
                          {shot ? shotLabel(shot.id) : `Shot ${String(index + 1).padStart(2, "0")}`}
                        </div>
                        {shot && setupLabel(shot.id) && (
                          <div className="rounded-md border border-[#D4A853]/25 bg-[#D4A853]/15 px-1.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[#D4A853] backdrop-blur-sm">
                            {setupLabel(shot.id)}
                          </div>
                        )}
                      </div>

                      {shot && (shot.generationHistory?.length ?? 0) > 1 && !isGenerating && (() => {
                        const total = shot.generationHistory.length
                        const idx = shot.activeHistoryIndex ?? total - 1
                        const current = idx + 1
                        const entry = shot.generationHistory[idx]
                        const src = entry?.source || "generate"
                        const sourceLabel = src === "edit" ? "E" : src === "crop" ? "C" : src === "color" ? "M" : "G"
                        const sourceColor = src === "edit" ? "bg-purple-400" : src === "crop" ? "bg-blue-400" : src === "color" ? "bg-amber-400" : "bg-emerald-400"
                        return (
                          <div className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-black/60 px-1 py-0.5 backdrop-blur-sm">
                            <button type="button" onClick={(e) => { e.stopPropagation(); handleHistoryNav(shot.id, -1) }} disabled={current <= 1} className="flex h-5 w-5 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30">
                              <ChevronLeft size={12} />
                            </button>
                            <div className="flex items-center gap-1">
                              <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[7px] font-bold text-black ${sourceColor}`}>{sourceLabel}</span>
                              <span className="min-w-[32px] text-center text-[10px] tabular-nums text-white/80">{current}/{total}</span>
                            </div>
                            <button type="button" onClick={(e) => { e.stopPropagation(); handleHistoryNav(shot.id, 1) }} disabled={current >= total} className="flex h-5 w-5 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30">
                              <ChevronRight size={12} />
                            </button>
                          </div>
                        )
                      })()}

                      {isGenerating ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                          <Loader2 size={28} className="animate-spin text-white/70" />
                        </div>
                      ) : isFailed ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 backdrop-blur-sm">
                          <AlertTriangle size={22} className="text-red-400/80" />
                          <p className="text-[10px] uppercase tracking-[0.14em] text-red-300/90">Generation failed</p>
                          <button
                            type="button"
                            onClick={() => shot && handleGenerateImage(shot.id)}
                            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-white/90 backdrop-blur-sm transition-colors hover:bg-white/20"
                          >
                            <RefreshCw size={12} />
                            Retry
                          </button>
                        </div>
                      ) : (
                        <>
                        {shot?.thumbnailUrl && !editingIds.has(shot.id) && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); shot && openEditOverlay(shot.id) }}
                            className="absolute left-2 bottom-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 bg-black/40 text-white/60 backdrop-blur-sm transition-all hover:bg-white/15 hover:text-white/90 opacity-0 group-hover:opacity-100"
                            aria-label="Edit shot"
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                        {editingIds.has(shot?.id ?? "") && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                            <Loader2 size={28} className="animate-spin text-[#DCC7A3]" />
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => shot && handleGenerateImage(shot.id)}
                            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/50 px-3.5 py-2 text-[12px] uppercase tracking-[0.14em] text-white/90 backdrop-blur-sm transition-colors hover:bg-white/10"
                          >
                            <ImageIcon size={13} />
                            Photo
                          </button>
                          <button
                            type="button"
                            onClick={() => shot && handleGenerateVideo(shot.id)}
                            disabled={videoGeneratingIds.has(shot?.id ?? "")}
                            className="flex items-center gap-1.5 rounded-lg border border-[#7C6FD8]/30 bg-[#7C6FD8]/15 px-3.5 py-2 text-[12px] uppercase tracking-[0.14em] text-[#C4BBEF] backdrop-blur-sm transition-colors hover:bg-[#7C6FD8]/25 disabled:opacity-40"
                          >
                            <Video size={13} />
                            Video
                          </button>
                          <button
                            type="button"
                            onClick={() => shot && setPromptLabShotId(shot.id)}
                            className="flex items-center gap-1.5 rounded-lg border border-[#D4A853]/30 bg-[#D4A853]/15 px-3.5 py-2 text-[12px] uppercase tracking-[0.14em] text-[#E6C887] backdrop-blur-sm transition-colors hover:bg-[#D4A853]/25"
                          >
                            <Wand2 size={13} />
                            Edit
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
                        </>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="mt-2 px-1.5 pb-1.5">
                      <p className="text-[12px] leading-snug text-[#C8CDD5]">{frame.meta.caption || shot?.label || "—"}</p>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[#6B7280]">
                        <span>{frame.meta.shot}</span>
                        <span className="text-white/10">·</span>
                        <span>{frame.meta.motion || "static"}</span>
                        <span className="text-white/10">·</span>
                        {shot ? (
                          <EditableDuration durationMs={shot.duration} onChange={(ms) => updateShot(shot.id, { duration: ms })} />
                        ) : (
                          <span>{((d) => Number.isNaN(d) ? "3.0" : d.toFixed(1))(Number(frame.meta.duration) / 1000)}s</span>
                        )}
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
                  <p className="text-[13px] uppercase tracking-[0.2em] text-[#E7E3DC]">Add Shot</p>
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
                const imagePrompt = buildImagePrompt(resolvedShot, characters, locations, projectStyle, bibleProps)
                const videoPrompt = buildVideoPrompt(resolvedShot, characters, locations, projectStyle, bibleProps)
                const refs = getReferencedBibleEntries(resolvedShot, characters, locations)
                const previewSrc = shot.thumbnailUrl || shot.svg || null
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
                          <Image src={previewSrc} alt="" fill unoptimized className="object-cover" />
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
                        <p className="mt-1 flex items-center gap-1 truncate text-[10px] text-white/35">
                          {shot.shotSize || "WIDE"} · {shot.cameraMotion || "Static"} · <EditableDuration durationMs={shot.duration} onChange={(ms) => updateShot(shot.id, { duration: ms })} />
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
          ) : viewMode === "prompt" ? (
          <div className="-mx-4 -my-4 h-full"><PromptLab /></div>
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
                {(() => {
                  let lastSceneId: string | null = null
                  let globalIdx = 0
                  return frames.map((frame, index) => {
                    const shot = sortedShots[index]
                    const sceneId = shot?.sceneId || null
                    const showSceneHeader = sceneId !== lastSceneId
                    lastSceneId = sceneId
                    globalIdx++

                    const scene = sceneId ? scenes.find((s) => s.id === sceneId) : null
                    const sceneShotCount = sceneId ? (shotsBySceneId.get(sceneId)?.length ?? 0) : 0

                    return (
                      <Fragment key={frame.id}>
                        {showSceneHeader && scene && (
                          <tr className="border-b border-white/[0.06]">
                            <td colSpan={6} className="px-2 py-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: scene.color }}
                                />
                                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
                                  {scene.title}
                                </span>
                                <span className="text-[9px] text-white/20">
                                  {sceneShotCount} {sceneShotCount === 1 ? "shot" : "shots"}
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr className="border-b border-white/5 transition-colors hover:bg-white/3">
                      <td className="px-2 py-1.5 text-[#7F8590]">{String(globalIdx).padStart(2, "0")}</td>
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
                      </Fragment>
                    )
                  })
                })()}
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

      {/* ─── Glass Edit Overlay ─── */}
      {editOverlayShotId && (() => {
        const overlayShot = shots.find(s => s.id === editOverlayShotId)
        if (!overlayShot?.thumbnailUrl) return null
        return (
          <ImageEditOverlay
            imageUrl={overlayShot.thumbnailUrl}
            model={useBoardStore.getState().selectedImageGenModel || "nano-banana-2"}
            onComplete={(blob) => void handleShotReEditFromOverlay(overlayShot.id, blob)}
            onClose={() => setEditOverlayShotId(null)}
          />
        )
      })()}

      {/* ─── Prompt Lab Bottom Panel ─── */}
      {promptLabShotId && (
        <PromptLabPanel shotId={promptLabShotId} onClose={() => setPromptLabShotId(null)} />
      )}

      {/* Shot Studio (replaces old lightbox) */}
      {lightbox && (
        <ShotStudio
          shotId={lightbox.shotId}
          onClose={() => { setLbPlaying(false); setLightbox(null); setCropMode(false); setCropRect(null) }}
          onNavigate={(id) => {
            const s = shots.find((x) => x.id === id)
            if (s?.thumbnailUrl) {
              setLightbox({ src: s.thumbnailUrl, shotId: s.id })
              setLightboxTransform({ flipH: false, flipV: false, rotate: 0 })
            }
          }}
        />
      )}

    </aside>
    </>
  )
}