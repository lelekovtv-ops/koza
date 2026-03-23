"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Eraser,
  FlaskConical,
  Loader2,
  MessageSquare,
  Play,
  RefreshCcw,
  Send,
  Sparkles,
  Upload,
  User,
  WandSparkles,
  X,
} from "lucide-react"
import {
  Fragment,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { BREAKDOWN_MODELS, mapBoardModelToBreakdownModel, type BreakdownTextModelId } from "@/features/breakdown"
import { type BibleReferenceImage, type CharacterEntry, type LocationEntry } from "@/lib/bibleParser"
import { DEAKINS_RULES, SHOT_TRANSITION_RULES } from "@/lib/cinematographyRules"
import { saveBlob } from "@/lib/fileStorage"
import { convertReferenceImagesToDataUrls, getShotGenerationReferenceImages } from "@/lib/imageGenerationReferences"
import { type JenkinsShot } from "@/lib/jenkins"
import { DEFAULT_PROJECT_STYLE } from "@/lib/projectStyle"
import { buildImagePrompt, getReferencedBibleEntries } from "@/lib/promptBuilder"
import { parseScenes, type Scene } from "@/lib/sceneParser"
import { GENERATED_CANONICAL_IMAGE_ID, useBibleStore } from "@/store/bible"
import { useBoardStore } from "@/store/board"
import { devlog } from "@/store/devlog"
import { createTimelineShot, type TimelineShot } from "@/store/timeline"
import { useScriptStore } from "@/store/script"

type ImageModelId = "gpt-image" | "nano-banana" | "nano-banana-2" | "nano-banana-pro"
type StylePresetId = "noir" | "sketch" | "realistic" | "custom"

type LabShot = JenkinsShot & {
  id: string
  shotNumber: number
}

type PromptSection = {
  title: string
  content: string
  tone: "white" | "gold" | "purple" | "yellow" | "green"
}

type AssistantMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

type GalleryItem = {
  id: string
  shotId: string
  shotLabel: string
  imageUrl: string
  model: string
  style: string
  prompt: string
  durationMs: number
}

type GenerationSnapshot = {
  shotId: string
  imageUrl: string
  model: ImageModelId
  endpoint: string
  durationMs: number
  prompt: string
}

const IMAGE_MODELS: Array<{ id: ImageModelId; label: string }> = [
  { id: "gpt-image", label: "GPT Image" },
  { id: "nano-banana", label: "NB1" },
  { id: "nano-banana-2", label: "NB2" },
  { id: "nano-banana-pro", label: "NB Pro" },
]

const STYLE_PRESETS: Array<{ id: StylePresetId; label: string; prompt: string }> = [
  { id: "noir", label: "Noir", prompt: DEFAULT_PROJECT_STYLE },
  { id: "sketch", label: "Sketch", prompt: "Pencil storyboard sketch, rough lines, hatching for shadows, clean white background" },
  { id: "realistic", label: "Realistic", prompt: "Photorealistic, natural lighting, ARRI Alexa look, subtle film grain" },
  { id: "custom", label: "Custom", prompt: "" },
]

const textFieldClassName = "w-full rounded-md border border-white/8 bg-white/3 px-3 py-2 text-sm text-[#E5E0DB] outline-none transition-colors placeholder:text-white/22 focus:border-[#D4A853]/40"
const actionButtonClassName = "inline-flex items-center gap-2 rounded-md border border-[#D4A853]/20 bg-[#D4A853]/10 px-3 py-2 text-xs font-medium text-[#D4A853] transition-colors hover:bg-[#D4A853]/20 disabled:cursor-not-allowed disabled:opacity-50"

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function clampTemperature(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.3))
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

function formatSeconds(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`
}

function truncate(text: string, size: number): string {
  if (text.length <= size) return text
  return `${text.slice(0, size).trimEnd()}…`
}

function getStylePresetId(style: string): StylePresetId {
  return STYLE_PRESETS.find((preset) => preset.prompt === style)?.id ?? "custom"
}

function getSceneText(scene: Scene | null | undefined, blocks: ReturnType<typeof useScriptStore.getState>["blocks"]): string {
  if (!scene) return ""

  const blocksById = new Map(blocks.map((block) => [block.id, block]))
  return scene.blockIds
    .map((blockId) => blocksById.get(blockId)?.text ?? "")
    .join("\n")
    .trim()
}

function getBestEntryImage(entry: CharacterEntry | LocationEntry): string | null {
  if ("generatedPortraitUrl" in entry) {
    if (entry.canonicalImageId === GENERATED_CANONICAL_IMAGE_ID && entry.generatedPortraitUrl) {
      return entry.generatedPortraitUrl
    }

    const canonicalReference = entry.referenceImages.find((image) => image.id === entry.canonicalImageId)
    return entry.generatedPortraitUrl || canonicalReference?.url || entry.referenceImages[0]?.url || null
  }

  if (entry.canonicalImageId === GENERATED_CANONICAL_IMAGE_ID && entry.generatedImageUrl) {
    return entry.generatedImageUrl
  }

  const canonicalReference = entry.referenceImages.find((image) => image.id === entry.canonicalImageId)
  return entry.generatedImageUrl || canonicalReference?.url || entry.referenceImages[0]?.url || null
}

function extractJsonArray(rawText: string): string {
  const trimmed = rawText.trim()
  if (trimmed.startsWith("[")) return trimmed

  const startIndex = trimmed.indexOf("[")
  const endIndex = trimmed.lastIndexOf("]")

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error("Model returned invalid JSON array")
  }

  return trimmed.slice(startIndex, endIndex + 1)
}

function normalizeLabShot(item: unknown, index: number): LabShot {
  const shot = typeof item === "object" && item !== null ? item as Record<string, unknown> : {}

  return {
    id: makeId(`lab-shot-${index + 1}`),
    shotNumber: index + 1,
    label: typeof shot.label === "string" && shot.label.trim() ? shot.label : `Shot ${index + 1}`,
    type: "image",
    duration: typeof shot.duration === "number" && Number.isFinite(shot.duration) ? shot.duration : 3000,
    notes: typeof shot.notes === "string" ? shot.notes : "",
    shotSize: typeof shot.shotSize === "string" ? shot.shotSize : "",
    cameraMotion: typeof shot.cameraMotion === "string" ? shot.cameraMotion : "",
    caption: typeof shot.caption === "string" ? shot.caption : "",
    directorNote: typeof shot.directorNote === "string" ? shot.directorNote : "",
    cameraNote: typeof shot.cameraNote === "string" ? shot.cameraNote : "",
    imagePrompt: typeof shot.imagePrompt === "string" ? shot.imagePrompt : "",
    videoPrompt: typeof shot.videoPrompt === "string" ? shot.videoPrompt : "",
    visualDescription: typeof shot.visualDescription === "string" ? shot.visualDescription : "",
  }
}

async function readStreamingText(response: Response): Promise<string> {
  if (!response.body) {
    return await response.text()
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ""

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    fullText += decoder.decode(value, { stream: true })
  }

  fullText += decoder.decode()
  return fullText
}

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: string; details?: string; message?: string }
    return payload.details || payload.error || payload.message || `Request failed: ${response.status}`
  } catch {
    const text = await response.text().catch(() => "")
    return text || `Request failed: ${response.status}`
  }
}

function buildBiblePromptSummary(characters: CharacterEntry[], locations: LocationEntry[]): string {
  const characterLines = characters.length > 0
    ? characters.map((character) => `- ${character.name}: ${character.description || "No description yet"}${character.appearancePrompt ? ` [Visual: ${character.appearancePrompt}]` : ""}`).join("\n")
    : "No characters defined yet."

  const locationLines = locations.length > 0
    ? locations.map((location) => `- ${location.name} (${location.intExt}): ${location.description || "No description yet"}${location.appearancePrompt ? ` [Visual: ${location.appearancePrompt}]` : ""}`).join("\n")
    : "No locations defined yet."

  return `CHARACTERS:\n${characterLines}\n\nLOCATIONS:\n${locationLines}`
}

function buildDefaultSystemPrompt(characters: CharacterEntry[], locations: LocationEntry[], stylePrompt: string): string {
  return [
    "## JENKINS CORE",
    "You are JENKINS — a veteran cinematographer and 1st AD with 30 years of experience.",
    "You think like Roger Deakins shoots: every frame has purpose, every cut has rhythm.",
    "Your job: break down screenplay text into a DETAILED shot-by-shot sequence.",
    "",
    "RULES:",
    "1. EVERY physical action = separate shot.",
    "2. EVERY dialogue line = its own shot, plus reaction if dramatically important.",
    "3. Establish geography first for every new location.",
    "4. Think in sequences: establish → develop → climax → resolve.",
    "5. Be specific about framing, motivation, light, and focus.",
    "6. Keep label, caption, and directorNote in the screenplay language.",
    "7. Keep imagePrompt and videoPrompt in English only.",
    "8. Respond only with a valid JSON array.",
    "",
    "## BIBLE CONTEXT",
    buildBiblePromptSummary(characters, locations),
    "",
    "## STYLE DIRECTIVE",
    `PROJECT VISUAL STYLE: ${stylePrompt || DEFAULT_PROJECT_STYLE}`,
    "All imagePrompt values must incorporate this style.",
    "All videoPrompt values must reference this style.",
    "",
    "## DEAKINS RULES",
    DEAKINS_RULES.trim(),
    "",
    "## SHOT TRANSITION RULES",
    SHOT_TRANSITION_RULES.trim(),
    "",
    "## OUTPUT FORMAT",
    "Return an array of objects with: label, shotSize, cameraMotion, duration, caption, directorNote, cameraNote, imagePrompt, videoPrompt, notes, type.",
    "Give 6-12 shots per scene depending on complexity.",
    "Make imagePrompt describe a frozen frame as a photograph.",
  ].join("\n")
}

function parsePromptSections(prompt: string): PromptSection[] {
  const chunks = prompt.split(/^##\s+/m).filter(Boolean)
  if (chunks.length === 1 && !prompt.includes("## ")) {
    return [{ title: "CUSTOM PROMPT", content: prompt, tone: "white" }]
  }

  return chunks.map((chunk) => {
    const [rawTitle, ...rest] = chunk.split("\n")
    const title = rawTitle.trim()
    let tone: PromptSection["tone"] = "white"

    if (/DEAKINS/i.test(title)) tone = "yellow"
    else if (/TRANSITION/i.test(title)) tone = "green"
    else if (/BIBLE/i.test(title)) tone = "gold"
    else if (/STYLE/i.test(title)) tone = "purple"

    return {
      title,
      content: rest.join("\n").trim(),
      tone,
    }
  })
}

function splitCodeBlocks(content: string): Array<{ type: "text" | "code"; value: string }> {
  const parts: Array<{ type: "text" | "code"; value: string }> = []
  const regex = /```([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, match.index).trim() })
    }
    parts.push({ type: "code", value: match[1].trim() })
    lastIndex = regex.lastIndex
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex).trim() })
  }

  return parts.filter((part) => part.value.length > 0)
}

function buildAssistantSystemPrompt({
  projectStyle,
  selectedImageGenModel,
  characters,
  locations,
  lastShotCount,
}: {
  projectStyle: string
  selectedImageGenModel: string
  characters: CharacterEntry[]
  locations: LocationEntry[]
  lastShotCount: number
}): string {
  return [
    "You are a pipeline tuning assistant for KOZA — a film production AI studio.",
    "The user is configuring the breakdown pipeline. You can:",
    "1. Suggest changes to the Jenkins system prompt",
    "2. Explain why shots look a certain way",
    "3. Help write better appearance prompts for Bible",
    "4. Suggest style adjustments",
    "5. Help debug why consistency is poor",
    "",
    "Current pipeline state:",
    `- Style: ${projectStyle}`,
    `- Image model: ${selectedImageGenModel}`,
    `- Bible characters: ${characters.map((character) => `${character.name}: ${character.appearancePrompt || "No appearance prompt"}`).join(" | ") || "none"}`,
    `- Bible locations: ${locations.map((location) => `${location.name}: ${location.appearancePrompt || "No appearance prompt"}`).join(" | ") || "none"}`,
    `- Last breakdown: ${lastShotCount} shots`,
    "",
    "When the user asks to change something, output the EXACT text they should put in the field.",
    "Use markdown code blocks for prompts.",
    "Be specific and actionable.",
  ].join("\n")
}

function PanelCard({ title, border, children, actions }: { title: string; border: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className={`rounded-xl border bg-[#12110F] p-4 ${border}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#E5E0DB]/78">{title}</h2>
        {actions}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function PipelineArrow({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-1.5">
      <div className="flex h-12 items-center">
        <div className="h-full border-l-2 border-dashed" style={{ borderColor: color }} />
      </div>
      <div className="rounded-full border border-white/8 bg-white/3 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-white/45">
        {label}
      </div>
    </div>
  )
}

function PipelineBlock({ title, badge, accent, children, sideFeed }: { title: string; badge?: string; accent?: string; children: ReactNode; sideFeed?: ReactNode }) {
  return (
    <section className="relative rounded-lg border border-white/8 bg-[#16140F] p-4">
      {accent ? <div className="absolute inset-y-4 left-0 border-l-2 border-dashed" style={{ borderColor: accent }} /> : null}
      {sideFeed ? <div className="absolute -left-3 top-4 hidden xl:block">{sideFeed}</div> : null}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 pl-3">
        <h3 className="text-sm font-semibold tracking-[0.08em] text-[#E5E0DB]">{title}</h3>
        {badge ? <span className="rounded-full border border-white/10 bg-white/3 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white/45">{badge}</span> : null}
      </div>
      <div className="pl-3">{children}</div>
    </section>
  )
}

function MarkdownMessage({ content }: { content: string }) {
  const parts = splitCodeBlocks(content)

  return (
    <div className="space-y-2 text-sm leading-6 text-[#E5E0DB]">
      {parts.map((part, index) => (
        <Fragment key={`${part.type}-${index}`}>
          {part.type === "text" ? (
            <p className="whitespace-pre-wrap text-white/78">{part.value}</p>
          ) : (
            <pre className="overflow-x-auto rounded-md border border-white/8 bg-black/20 p-3 font-mono text-[11px] leading-5 text-[#E5E0DB]">
              {part.value}
            </pre>
          )}
        </Fragment>
      ))}
    </div>
  )
}

function LabPageContent() {
  const router = useRouter()
  const blocks = useScriptStore((state) => state.blocks)
  const characters = useBibleStore((state) => state.characters)
  const locations = useBibleStore((state) => state.locations)
  const updateFromScreenplay = useBibleStore((state) => state.updateFromScreenplay)
  const updateCharacter = useBibleStore((state) => state.updateCharacter)
  const updateLocation = useBibleStore((state) => state.updateLocation)
  const selectedImageGenModel = useBoardStore((state) => state.selectedImageGenModel) as ImageModelId
  const setSelectedImageGenModel = useBoardStore((state) => state.setSelectedImageGenModel)
  const selectedChatModel = useBoardStore((state) => state.selectedChatModel)
  const setSelectedChatModel = useBoardStore((state) => state.setSelectedChatModel)
  const projectStyle = useBoardStore((state) => state.projectStyle)
  const setProjectStyle = useBoardStore((state) => state.setProjectStyle)

  const leftPanelRef = useRef<HTMLDivElement | null>(null)
  const characterRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const locationRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const chatScrollRef = useRef<HTMLDivElement | null>(null)

  const scenes = useMemo(() => parseScenes(blocks), [blocks])
  const firstScene = scenes[0] ?? null
  const firstSceneText = useMemo(() => getSceneText(firstScene, blocks), [firstScene, blocks])

  const [selectedSceneId, setSelectedSceneId] = useState<string>(firstScene?.id ?? "")
  const [sceneText, setSceneText] = useState<string>(firstSceneText)
  const [sceneTextDirty, setSceneTextDirty] = useState(false)

  const [stylePresetId, setStylePresetId] = useState<StylePresetId>(getStylePresetId(projectStyle))
  const [customStylePrompt, setCustomStylePrompt] = useState<string>(getStylePresetId(projectStyle) === "custom" ? projectStyle : "")
  const [selectedBreakdownModel, setSelectedBreakdownModel] = useState<BreakdownTextModelId>(mapBoardModelToBreakdownModel(selectedChatModel))
  const [breakdownTemperature, setBreakdownTemperature] = useState(0.3)

  const defaultSystemPrompt = useMemo(
    () => buildDefaultSystemPrompt(characters, locations, projectStyle || DEFAULT_PROJECT_STYLE),
    [characters, locations, projectStyle],
  )
  const [customSystemPrompt, setCustomSystemPrompt] = useState(defaultSystemPrompt)
  const [systemPromptDirty, setSystemPromptDirty] = useState(false)
  const [templateNotice, setTemplateNotice] = useState<string | null>(null)

  const [breakdownRunning, setBreakdownRunning] = useState(false)
  const [breakdownStartedAt, setBreakdownStartedAt] = useState<number | null>(null)
  const [breakdownDurationMs, setBreakdownDurationMs] = useState<number | null>(null)
  const [rawResponse, setRawResponse] = useState("")
  const [rawExpanded, setRawExpanded] = useState(false)
  const [parsedShots, setParsedShots] = useState<LabShot[]>([])
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
  const [shotSectionOpen, setShotSectionOpen] = useState<Record<string, boolean>>({})
  const [finalPromptDrafts, setFinalPromptDrafts] = useState<Record<string, string>>({})

  const [generationRunningShotId, setGenerationRunningShotId] = useState<string | null>(null)
  const [generationSnapshots, setGenerationSnapshots] = useState<Record<string, GenerationSnapshot>>({})
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [resultsGallery, setResultsGallery] = useState<GalleryItem[]>([])

  const [assistantOpen, setAssistantOpen] = useState(true)
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([])
  const [assistantInput, setAssistantInput] = useState("")
  const [assistantLoading, setAssistantLoading] = useState(false)

  useEffect(() => {
    updateFromScreenplay(blocks, scenes)
  }, [blocks, scenes, updateFromScreenplay])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!window.location.search) return

    router.replace("/lab")
  }, [router])

  useEffect(() => {
    if (!selectedSceneId && firstScene?.id) {
      setSelectedSceneId(firstScene.id)
    }
  }, [firstScene, selectedSceneId])

  useEffect(() => {
    if (!sceneTextDirty) {
      setSceneText(firstSceneText)
    }
  }, [firstSceneText, sceneTextDirty])

  useEffect(() => {
    if (!systemPromptDirty) {
      setCustomSystemPrompt(defaultSystemPrompt)
    }
  }, [defaultSystemPrompt, systemPromptDirty])

  useEffect(() => {
    setStylePresetId(getStylePresetId(projectStyle))
    if (getStylePresetId(projectStyle) === "custom") {
      setCustomStylePrompt(projectStyle)
    }
  }, [projectStyle])

  useEffect(() => {
    setSelectedBreakdownModel(mapBoardModelToBreakdownModel(selectedChatModel))
  }, [selectedChatModel])

  useEffect(() => {
    if (!chatScrollRef.current) return
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
  }, [assistantMessages, assistantLoading])

  const selectedScene = useMemo(
    () => scenes.find((scene) => scene.id === selectedSceneId) ?? firstScene,
    [scenes, selectedSceneId, firstScene],
  )

  const selectedShot = useMemo(
    () => parsedShots.find((shot) => shot.id === selectedShotId) ?? null,
    [parsedShots, selectedShotId],
  )

  const promptSections = useMemo(
    () => parsePromptSections(customSystemPrompt),
    [customSystemPrompt],
  )

  const breakdownElapsedMs = useMemo(() => {
    if (!breakdownRunning || !breakdownStartedAt) {
      return breakdownDurationMs ?? 0
    }

    return Date.now() - breakdownStartedAt
  }, [breakdownRunning, breakdownStartedAt, breakdownDurationMs])

  const bibleContextCharacters = useMemo(
    () => characters.filter((character) => !selectedScene || character.sceneIds.includes(selectedScene.id)),
    [characters, selectedScene],
  )

  const bibleContextLocations = useMemo(
    () => locations.filter((location) => !selectedScene || location.sceneIds.includes(selectedScene.id)),
    [locations, selectedScene],
  )

  const selectedTimelineShot = useMemo<TimelineShot | null>(() => {
    if (!selectedShot) return null

    return createTimelineShot({
      id: selectedShot.id,
      sceneId: selectedScene?.id ?? null,
      label: selectedShot.label,
      type: selectedShot.type,
      duration: selectedShot.duration,
      notes: selectedShot.notes,
      shotSize: selectedShot.shotSize,
      cameraMotion: selectedShot.cameraMotion,
      caption: selectedShot.caption,
      directorNote: selectedShot.directorNote,
      cameraNote: selectedShot.cameraNote,
      imagePrompt: selectedShot.imagePrompt,
      videoPrompt: selectedShot.videoPrompt,
      visualDescription: selectedShot.visualDescription,
      sourceText: sceneText,
      locked: false,
    })
  }, [selectedShot, selectedScene, sceneText])

  const allTimelineShots = useMemo(
    () => parsedShots.map((shot) => createTimelineShot({
      id: shot.id,
      sceneId: selectedScene?.id ?? null,
      label: shot.label,
      type: shot.type,
      duration: shot.duration,
      notes: shot.notes,
      shotSize: shot.shotSize,
      cameraMotion: shot.cameraMotion,
      caption: shot.caption,
      directorNote: shot.directorNote,
      cameraNote: shot.cameraNote,
      imagePrompt: shot.imagePrompt,
      videoPrompt: shot.videoPrompt,
      visualDescription: shot.visualDescription,
      sourceText: sceneText,
      locked: false,
    })),
    [parsedShots, selectedScene, sceneText],
  )

  const computedSelectedFinalPrompt = useMemo(() => {
    if (!selectedTimelineShot) return ""
    return buildImagePrompt(selectedTimelineShot, allTimelineShots, characters, locations, projectStyle)
  }, [selectedTimelineShot, allTimelineShots, characters, locations, projectStyle])

  const selectedFinalPrompt = selectedShot
    ? finalPromptDrafts[selectedShot.id] ?? computedSelectedFinalPrompt
    : ""

  const selectedRefs = useMemo(() => {
    if (!selectedTimelineShot) {
      return { characters: [], location: null as LocationEntry | null }
    }
    return getReferencedBibleEntries(selectedTimelineShot, characters, locations)
  }, [selectedTimelineShot, characters, locations])

  const currentGeneration = selectedShot ? generationSnapshots[selectedShot.id] ?? null : null

  const handleScrollToBibleField = (entryId: string, kind: "character" | "location") => {
    const target = kind === "character" ? characterRefs.current[entryId] : locationRefs.current[entryId]
    if (!target) return

    target.scrollIntoView({ behavior: "smooth", block: "center" })
    leftPanelRef.current?.scrollTo({ top: Math.max(0, target.offsetTop - 120), behavior: "smooth" })
  }

  const handleLoadScene = (sceneId: string) => {
    const nextScene = scenes.find((scene) => scene.id === sceneId)
    if (!nextScene) return
    setSelectedSceneId(sceneId)
    setSceneText(getSceneText(nextScene, blocks))
    setSceneTextDirty(false)
  }

  const updateLabShot = (shotId: string, patch: Partial<LabShot>) => {
    setParsedShots((current) => current.map((shot) => (shot.id === shotId ? { ...shot, ...patch } : shot)))
  }

  const updateFinalPromptDraft = (shotId: string, prompt: string) => {
    setFinalPromptDrafts((current) => ({ ...current, [shotId]: prompt }))
  }

  const handleCharacterReferenceUpload = async (character: CharacterEntry, files: File[]) => {
    const nextFiles = files.slice(0, Math.max(0, 4 - character.referenceImages.length))
    if (nextFiles.length === 0) return

    const newReferences = await Promise.all(nextFiles.map(async (file, index) => {
      const blobKey = `lab-char-ref-${character.id}-${Date.now()}-${index}`
      await saveBlob(blobKey, file)
      return {
        id: blobKey,
        url: URL.createObjectURL(file),
        blobKey,
      } satisfies BibleReferenceImage
    }))

    updateCharacter(character.id, {
      canonicalImageId: character.canonicalImageId
        ?? (character.generatedPortraitUrl ? GENERATED_CANONICAL_IMAGE_ID : newReferences[0]?.id ?? null),
      referenceImages: [...character.referenceImages, ...newReferences],
    })
  }

  const handleLocationReferenceUpload = async (location: LocationEntry, files: File[]) => {
    const nextFiles = files.slice(0, Math.max(0, 4 - location.referenceImages.length))
    if (nextFiles.length === 0) return

    const newReferences = await Promise.all(nextFiles.map(async (file, index) => {
      const blobKey = `lab-location-ref-${location.id}-${Date.now()}-${index}`
      await saveBlob(blobKey, file)
      return {
        id: blobKey,
        url: URL.createObjectURL(file),
        blobKey,
      } satisfies BibleReferenceImage
    }))

    updateLocation(location.id, {
      canonicalImageId: location.canonicalImageId
        ?? (location.generatedImageUrl ? GENERATED_CANONICAL_IMAGE_ID : newReferences[0]?.id ?? null),
      referenceImages: [...location.referenceImages, ...newReferences],
    })
  }

  const runBreakdown = async () => {
    const trimmedSceneText = sceneText.trim()
    if (!trimmedSceneText || breakdownRunning) return

    const group = `lab-breakdown-${Date.now()}`
    setBreakdownRunning(true)
    setBreakdownStartedAt(Date.now())
    setBreakdownDurationMs(null)
    setRawResponse("")
    setParsedShots([])
    setSelectedShotId(null)

    devlog.breakdown("breakdown_start", "Pipeline Lab breakdown", "", {
      sceneId: selectedScene?.id,
      modelId: selectedBreakdownModel,
      temperature: breakdownTemperature,
      sceneLength: trimmedSceneText.length,
    }, group)

    devlog.breakdown("breakdown_prompt", "Pipeline Lab system prompt", customSystemPrompt, {
      promptLength: customSystemPrompt.length,
      tokenEstimate: estimateTokens(customSystemPrompt),
    }, group)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: `Break down this scene into shots:\n\n${trimmedSceneText}` }],
          modelId: selectedBreakdownModel,
          system: customSystemPrompt,
          temperature: clampTemperature(breakdownTemperature),
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `Breakdown failed: ${response.status}`)
      }

      const fullText = await readStreamingText(response)
      setRawResponse(fullText)
      devlog.breakdown("breakdown_response", "Pipeline Lab raw response", fullText, {
        responseLength: fullText.length,
      }, group)

      const parsed = JSON.parse(extractJsonArray(fullText)) as unknown
      if (!Array.isArray(parsed)) {
        throw new Error("Breakdown response is not an array")
      }

      const shots = parsed.map((item, index) => normalizeLabShot(item, index))
      const nextPromptDrafts = Object.fromEntries(shots.map((shot) => {
        const timelineShot = createTimelineShot({
          id: shot.id,
          sceneId: selectedScene?.id ?? null,
          label: shot.label,
          type: shot.type,
          duration: shot.duration,
          notes: shot.notes,
          shotSize: shot.shotSize,
          cameraMotion: shot.cameraMotion,
          caption: shot.caption,
          directorNote: shot.directorNote,
          cameraNote: shot.cameraNote,
          imagePrompt: shot.imagePrompt,
          videoPrompt: shot.videoPrompt,
          visualDescription: shot.visualDescription,
          sourceText: trimmedSceneText,
        })
        const prompt = buildImagePrompt(timelineShot, [], characters, locations, projectStyle)
        return [shot.id, prompt]
      }))

      setParsedShots(shots)
      setSelectedShotId(shots[0]?.id ?? null)
      setFinalPromptDrafts(nextPromptDrafts)
      setShotSectionOpen(Object.fromEntries(shots.map((shot) => [shot.id, false])))
      setBreakdownDurationMs(Date.now() - (breakdownStartedAt ?? Date.now()))

      devlog.breakdown("breakdown_result", `Pipeline Lab parsed ${shots.length} shots`, JSON.stringify(shots, null, 2), {
        shotCount: shots.length,
      }, group)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setRawResponse(message)
      devlog.breakdown("breakdown_error", "Pipeline Lab breakdown failed", message, {
        sceneId: selectedScene?.id,
      }, group)
    } finally {
      setBreakdownRunning(false)
      setBreakdownDurationMs(Date.now() - (breakdownStartedAt ?? Date.now()))
      setBreakdownStartedAt(null)
    }
  }

  const generateImageForShot = async (shot: LabShot) => {
    if (generationRunningShotId) return

    const timelineShot = createTimelineShot({
      id: shot.id,
      sceneId: selectedScene?.id ?? null,
      label: shot.label,
      type: shot.type,
      duration: shot.duration,
      notes: shot.notes,
      shotSize: shot.shotSize,
      cameraMotion: shot.cameraMotion,
      caption: shot.caption,
      directorNote: shot.directorNote,
      cameraNote: shot.cameraNote,
      imagePrompt: shot.imagePrompt,
      videoPrompt: shot.videoPrompt,
      visualDescription: shot.visualDescription,
      sourceText: sceneText,
      locked: false,
    })
    const allShots = parsedShots.map((entry) => createTimelineShot({
      id: entry.id,
      sceneId: selectedScene?.id ?? null,
      label: entry.label,
      type: entry.type,
      duration: entry.duration,
      notes: entry.notes,
      shotSize: entry.shotSize,
      cameraMotion: entry.cameraMotion,
      caption: entry.caption,
      directorNote: entry.directorNote,
      cameraNote: entry.cameraNote,
      imagePrompt: entry.imagePrompt,
      videoPrompt: entry.videoPrompt,
      visualDescription: entry.visualDescription,
      sourceText: sceneText,
      locked: false,
    }))

    const prompt = finalPromptDrafts[shot.id] ?? buildImagePrompt(timelineShot, allShots, characters, locations, projectStyle)
    const endpoint = selectedImageGenModel === "gpt-image" ? "/api/gpt-image" : "/api/nano-banana"
    const group = `lab-image-${shot.id}-${Date.now()}`
    const startedAt = Date.now()

    devlog.image("image_start", `Pipeline Lab image generation: ${shot.label}`, "", {
      shotId: shot.id,
      model: selectedImageGenModel,
    }, group)
    devlog.image("image_prompt", "Pipeline Lab final image prompt", prompt, {
      promptLength: prompt.length,
    }, group)

    setSelectedShotId(shot.id)
    setGenerationRunningShotId(shot.id)
    setGenerationError(null)

    try {
      const references = await convertReferenceImagesToDataUrls(getShotGenerationReferenceImages(timelineShot, characters, locations))
      const body = selectedImageGenModel === "gpt-image"
        ? { prompt, referenceImages: references }
        : { prompt, model: selectedImageGenModel, referenceImages: references }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        throw new Error(await readApiError(response))
      }

      const blob = await response.blob()
      const imageUrl = URL.createObjectURL(blob)
      const snapshot: GenerationSnapshot = {
        shotId: shot.id,
        imageUrl,
        model: selectedImageGenModel,
        endpoint,
        durationMs: Date.now() - startedAt,
        prompt,
      }

      setGenerationSnapshots((current) => ({ ...current, [shot.id]: snapshot }))
      setGenerationError(null)

      devlog.image("image_result", `Pipeline Lab generated ${shot.label}`, "", {
        shotId: shot.id,
        model: selectedImageGenModel,
        durationMs: snapshot.durationMs,
      }, group)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setGenerationError(message)
      devlog.image("image_error", `Pipeline Lab generation failed: ${shot.label}`, message, {
        shotId: shot.id,
        model: selectedImageGenModel,
      }, group)
    } finally {
      setGenerationRunningShotId(null)
    }
  }

  const handleGenerateAll = async () => {
    for (const shot of parsedShots) {
      await generateImageForShot(shot)
    }
  }

  const handleSendToResults = () => {
    if (!selectedShot || !currentGeneration) return

    setResultsGallery((current) => ([
      {
        id: makeId("gallery"),
        shotId: selectedShot.id,
        shotLabel: selectedShot.label,
        imageUrl: currentGeneration.imageUrl,
        model: currentGeneration.model,
        style: stylePresetId === "custom" ? "Custom" : STYLE_PRESETS.find((preset) => preset.id === stylePresetId)?.label || "Custom",
        prompt: currentGeneration.prompt,
        durationMs: currentGeneration.durationMs,
      },
      ...current,
    ]))
  }

  const handleSendAssistant = async () => {
    const trimmedInput = assistantInput.trim()
    if (!trimmedInput || assistantLoading) return

    const userMessage: AssistantMessage = {
      id: makeId("assistant-user"),
      role: "user",
      content: trimmedInput,
    }

    setAssistantMessages((current) => [...current, userMessage])
    setAssistantInput("")
    setAssistantLoading(true)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: trimmedInput }],
          modelId: selectedBreakdownModel,
          system: buildAssistantSystemPrompt({
            projectStyle,
            selectedImageGenModel,
            characters,
            locations,
            lastShotCount: parsedShots.length,
          }),
          temperature: 0.4,
        }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const fullText = await readStreamingText(response)
      setAssistantMessages((current) => ([
        ...current,
        {
          id: makeId("assistant-answer"),
          role: "assistant",
          content: fullText.trim(),
        },
      ]))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setAssistantMessages((current) => ([
        ...current,
        {
          id: makeId("assistant-error"),
          role: "assistant",
          content: `Assistant error:\n\n${message}`,
        },
      ]))
    } finally {
      setAssistantLoading(false)
    }
  }

  const clearLocalState = () => {
    setParsedShots([])
    setSelectedShotId(null)
    setRawResponse("")
    setRawExpanded(false)
    setResultsGallery([])
    setGenerationSnapshots({})
    setGenerationError(null)
    setFinalPromptDrafts({})
    setAssistantMessages([])
    setCustomSystemPrompt(defaultSystemPrompt)
    setSystemPromptDirty(false)
    setTemplateNotice(null)
  }

  return (
    <main className="h-screen overflow-hidden bg-[#0A0908] text-[#E5E0DB]">
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/6 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="rounded-md border border-white/8 bg-white/3 px-3 py-2 text-sm text-white/72 transition-colors hover:bg-white/5 hover:text-white"
            >
              ← Back
            </button>
            <div className="flex items-center gap-2 text-sm font-semibold tracking-[0.22em] text-[#D4A853]">
              <FlaskConical className="h-4 w-4" />
              KOZA PIPELINE LAB
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/dev/breakdown-studio")}
              className="inline-flex items-center gap-2 rounded-md border border-[#7FAED8]/28 bg-[#7FAED8]/12 px-3 py-2 text-xs font-medium text-[#BFD9F0] transition-colors hover:bg-[#7FAED8]/18 hover:text-[#D8EAFA]"
            >
              <WandSparkles className="h-4 w-4" />
              Breakdown Studio
            </button>
            <button
              type="button"
              onClick={() => setAssistantOpen((current) => !current)}
              className="inline-flex items-center gap-2 rounded-md border border-[#4A6F7C]/20 bg-[#4A6F7C]/10 px-3 py-2 text-xs font-medium text-[#9FC2CE] transition-colors hover:bg-[#4A6F7C]/18"
            >
              <Bot className="h-4 w-4" />
              Assistant {assistantOpen ? "On" : "Off"}
            </button>
            <button type="button" onClick={clearLocalState} className={actionButtonClassName}>
              <Eraser className="h-4 w-4" />
              Clear
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 gap-4 px-4 py-4">
          <aside ref={leftPanelRef} className="w-75 shrink-0 overflow-y-auto rounded-xl border border-white/6 bg-[#12110F] p-3">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">Pipeline Inputs</div>

            <div className="space-y-3">
              <PanelCard title="Bible" border="border-[#D4A853]/20">
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/32">Characters</div>
                    {characters.map((character) => (
                      <div key={character.id} ref={(node) => { characterRefs.current[character.id] = node }} className="rounded-lg border border-white/6 bg-white/2 p-3">
                        <div className="mb-2 flex items-start gap-2">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/4">
                            {getBestEntryImage(character) ? (
                              <Image src={getBestEntryImage(character) || ""} alt={character.name} width={24} height={24} unoptimized className="h-6 w-6 object-cover" />
                            ) : (
                              <User className="h-3.5 w-3.5 text-white/35" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-[#E5E0DB]">{character.name}</div>
                            <div className="text-[11px] text-white/35">{character.referenceImages.length} refs</div>
                          </div>
                        </div>

                        <textarea
                          value={character.appearancePrompt}
                          rows={3}
                          placeholder="Appearance prompt"
                          onChange={(event) => updateCharacter(character.id, { appearancePrompt: event.target.value })}
                          className={`${textFieldClassName} text-[12px]`}
                        />

                        <div className="mt-2 flex items-center gap-2">
                          <label className={`${actionButtonClassName} cursor-pointer`}>
                            <Upload className="h-3.5 w-3.5" />
                            + Upload ref
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(event) => {
                                const files = Array.from(event.target.files ?? [])
                                if (files.length > 0) {
                                  void handleCharacterReferenceUpload(character, files)
                                }
                                event.target.value = ""
                              }}
                            />
                          </label>

                          <div className="flex flex-wrap gap-1">
                            {character.referenceImages.map((reference) => (
                              <div key={reference.id} className="flex h-8 w-8 overflow-hidden rounded-md border border-white/10 bg-white/4">
                                <Image src={reference.url} alt={`${character.name} ref`} width={32} height={32} unoptimized className="h-8 w-8 object-cover" />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/32">Locations</div>
                    {locations.map((location) => (
                      <div key={location.id} ref={(node) => { locationRefs.current[location.id] = node }} className="rounded-lg border border-white/6 bg-white/2 p-3">
                        <div className="mb-2 flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-medium text-[#E5E0DB]">{location.name}</div>
                              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/45">{location.intExt}</span>
                            </div>
                            <div className="text-[11px] text-white/35">{location.referenceImages.length} refs</div>
                          </div>
                        </div>

                        <textarea
                          value={location.appearancePrompt}
                          rows={3}
                          placeholder="Appearance prompt"
                          onChange={(event) => updateLocation(location.id, { appearancePrompt: event.target.value })}
                          className={`${textFieldClassName} text-[12px]`}
                        />

                        <div className="mt-2 flex items-center gap-2">
                          <label className={`${actionButtonClassName} cursor-pointer`}>
                            <Upload className="h-3.5 w-3.5" />
                            + Upload ref
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(event) => {
                                const files = Array.from(event.target.files ?? [])
                                if (files.length > 0) {
                                  void handleLocationReferenceUpload(location, files)
                                }
                                event.target.value = ""
                              }}
                            />
                          </label>

                          <div className="flex flex-wrap gap-1">
                            {location.referenceImages.map((reference) => (
                              <div key={reference.id} className="flex h-8 w-8 overflow-hidden rounded-md border border-white/10 bg-white/4">
                                <Image src={reference.url} alt={`${location.name} ref`} width={32} height={32} unoptimized className="h-8 w-8 object-cover" />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </PanelCard>

              <PanelCard title="Style" border="border-[#7C4A6F]/20">
                <select
                  value={stylePresetId}
                  onChange={(event) => {
                    const nextPresetId = event.target.value as StylePresetId
                    setStylePresetId(nextPresetId)
                    const preset = STYLE_PRESETS.find((entry) => entry.id === nextPresetId)
                    if (!preset) return
                    if (preset.id === "custom") {
                      setProjectStyle(customStylePrompt || projectStyle)
                      return
                    }
                    setProjectStyle(preset.prompt)
                  }}
                  className={textFieldClassName}
                >
                  {STYLE_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.label}</option>
                  ))}
                </select>

                <textarea
                  value={stylePresetId === "custom" ? customStylePrompt : projectStyle}
                  rows={4}
                  placeholder="Custom style prompt"
                  onChange={(event) => {
                    setCustomStylePrompt(event.target.value)
                    if (stylePresetId === "custom") {
                      setProjectStyle(event.target.value)
                    }
                  }}
                  className={textFieldClassName}
                />
              </PanelCard>

              <PanelCard title="Assistant" border="border-[#4A6F7C]/20">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-white/35">Breakdown model</div>
                  <select
                    value={selectedBreakdownModel}
                    onChange={(event) => {
                      const nextModel = event.target.value as BreakdownTextModelId
                      setSelectedBreakdownModel(nextModel)
                      setSelectedChatModel(nextModel)
                    }}
                    className={textFieldClassName}
                  >
                    {BREAKDOWN_MODELS.map((model) => (
                      <option key={model.id} value={model.id}>{model.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-white/35">Image model</div>
                  <select
                    value={selectedImageGenModel}
                    onChange={(event) => setSelectedImageGenModel(event.target.value)}
                    className={textFieldClassName}
                  >
                    {IMAGE_MODELS.map((model) => (
                      <option key={model.id} value={model.id}>{model.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-white/35">
                    <span>Temperature</span>
                    <span>{breakdownTemperature.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={breakdownTemperature}
                    onChange={(event) => setBreakdownTemperature(clampTemperature(Number(event.target.value)))}
                    className="w-full accent-[#D4A853]"
                  />
                </div>
              </PanelCard>

              <PanelCard title="Test Scene" border="border-white/10">
                <textarea
                  value={sceneText}
                  rows={10}
                  onChange={(event) => {
                    setSceneText(event.target.value)
                    setSceneTextDirty(true)
                  }}
                  className={textFieldClassName}
                />

                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => handleLoadScene(selectedSceneId)} className={actionButtonClassName}>
                    Load from screenplay
                  </button>
                  <select value={selectedSceneId} onChange={(event) => setSelectedSceneId(event.target.value)} className={`${textFieldClassName} flex-1`}>
                    {scenes.map((scene) => (
                      <option key={scene.id} value={scene.id}>{scene.index}. {scene.title}</option>
                    ))}
                  </select>
                </div>
              </PanelCard>
            </div>
          </aside>

          <section className="min-w-0 flex-1 overflow-y-auto rounded-xl border border-white/6 bg-[#12110F] p-4">
            <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">Pipeline Chain</div>

            <div className="space-y-2">
              <PipelineBlock title="SCENE TEXT" badge={`${sceneText.length} symbols`} accent="#FFFFFF55">
                <div className="rounded-md border border-white/8 bg-white/3 p-3 text-sm leading-6 text-white/78">
                  <div className="max-h-48 overflow-y-auto whitespace-pre-wrap">{sceneText || "No scene text"}</div>
                </div>
              </PipelineBlock>

              <PipelineArrow label="text → Jenkins" color="#FFFFFF55" />

              <PipelineBlock
                title="BIBLE CONTEXT"
                accent="#D4A853"
                sideFeed={<div className="rounded-full border border-[#D4A853]/20 bg-[#D4A853]/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#D4A853]">Bible →</div>}
              >
                <div className="space-y-3">
                  <div>
                    <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-white/35">Characters</div>
                    <div className="space-y-2">
                      {bibleContextCharacters.map((character) => (
                        <button
                          key={character.id}
                          type="button"
                          onClick={() => handleScrollToBibleField(character.id, "character")}
                          className="block w-full rounded-md border border-white/6 bg-white/3 px-3 py-2 text-left text-sm text-white/78 transition-colors hover:bg-white/5"
                        >
                          <span className="font-medium text-[#D4A853]">{character.name}</span>
                          <span className="text-white/55"> {character.appearancePrompt ? `(${character.appearancePrompt})` : "⚠ No appearance prompt"}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-white/35">Locations</div>
                    <div className="space-y-2">
                      {bibleContextLocations.map((location) => (
                        <button
                          key={location.id}
                          type="button"
                          onClick={() => handleScrollToBibleField(location.id, "location")}
                          className="block w-full rounded-md border border-white/6 bg-white/3 px-3 py-2 text-left text-sm text-white/78 transition-colors hover:bg-white/5"
                        >
                          <span className="font-medium text-[#D4A853]">{location.name}</span>
                          <span className="text-white/55"> {location.appearancePrompt ? `(${location.appearancePrompt})` : "⚠ No appearance prompt"}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </PipelineBlock>

              <PipelineArrow label="bible + text → System Prompt" color="#D4A853" />

              <PipelineBlock
                title="SYSTEM PROMPT"
                badge={`~${estimateTokens(customSystemPrompt)} tokens`}
                accent="#7C4A6F"
                sideFeed={<div className="rounded-full border border-[#7C4A6F]/20 bg-[#7C4A6F]/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#C398B5]">Style →</div>}
              >
                <div className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {promptSections.map((section) => {
                    const toneClassName = section.tone === "yellow"
                      ? "border-yellow-400/18 bg-yellow-400/8"
                      : section.tone === "green"
                        ? "border-emerald-400/18 bg-emerald-400/8"
                        : section.tone === "gold"
                          ? "border-[#D4A853]/18 bg-[#D4A853]/10"
                          : section.tone === "purple"
                            ? "border-[#7C4A6F]/18 bg-[#7C4A6F]/10"
                            : "border-white/8 bg-white/3"

                    return (
                      <div key={section.title} className={`rounded-md border p-3 ${toneClassName}`}>
                        <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-white/40">{section.title}</div>
                        <div className="max-h-28 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-5 text-white/64">
                          {section.content || "Section empty"}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomSystemPrompt(defaultSystemPrompt)
                      setSystemPromptDirty(false)
                    }}
                    className={actionButtonClassName}
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Reset to default
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTemplateNotice("Save as template will be wired next.")
                    }}
                    className={actionButtonClassName}
                  >
                    <Sparkles className="h-4 w-4" />
                    Save as template
                  </button>
                  {templateNotice ? <span className="text-xs text-white/40">{templateNotice}</span> : null}
                </div>

                <textarea
                  value={customSystemPrompt}
                  rows={20}
                  onChange={(event) => {
                    setCustomSystemPrompt(event.target.value)
                    setSystemPromptDirty(true)
                    setTemplateNotice(null)
                  }}
                  className={`${textFieldClassName} min-h-85 font-mono text-[11px] leading-5`}
                />
              </PipelineBlock>

              <PipelineArrow label="system prompt + scene text → API call" color="#FFFFFF55" />

              <PipelineBlock title="API CALL" badge={BREAKDOWN_MODELS.find((model) => model.id === selectedBreakdownModel)?.label || selectedBreakdownModel} accent="#4A6F7C">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/8 bg-white/3 p-3">
                  <div>
                    <div className="text-sm font-medium text-white/82">{selectedBreakdownModel}</div>
                    <div className="text-[12px] text-white/40">endpoint: /api/chat</div>
                  </div>
                  <button type="button" onClick={() => void runBreakdown()} disabled={breakdownRunning} className="inline-flex items-center gap-2 rounded-md border border-[#D4A853]/25 bg-[#D4A853]/14 px-4 py-2 text-sm font-semibold text-[#D4A853] transition-colors hover:bg-[#D4A853]/22 disabled:cursor-wait disabled:opacity-60">
                    {breakdownRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    RUN BREAKDOWN
                  </button>
                </div>

                <div className="mt-3 text-sm text-white/65">
                  {breakdownRunning
                    ? `Running... ${formatSeconds(breakdownElapsedMs)}`
                    : breakdownDurationMs && parsedShots.length > 0
                      ? `Done in ${formatSeconds(breakdownDurationMs)}, ${parsedShots.length} shots`
                      : "Ready"}
                </div>
              </PipelineBlock>

              <PipelineArrow label="JSON response → Parser" color="#4A6F7C" />

              <PipelineBlock title="RAW RESPONSE" badge={`${rawResponse.length} characters`} accent="#FFFFFF33">
                <div className="flex items-center justify-between gap-3">
                  <button type="button" onClick={() => setRawExpanded((current) => !current)} className="inline-flex items-center gap-2 rounded-md border border-white/8 bg-white/3 px-3 py-2 text-xs text-white/62 transition-colors hover:bg-white/5">
                    {rawExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {rawExpanded ? "Hide raw" : "Show raw"}
                  </button>
                </div>

                {rawExpanded ? (
                  <textarea value={rawResponse} readOnly rows={16} className={`${textFieldClassName} mt-3 font-mono text-[11px] leading-5`} />
                ) : null}
              </PipelineBlock>

              <PipelineArrow label="parsed → Shots" color="#FFFFFF55" />

              <PipelineBlock title="PARSED SHOTS" badge={`${parsedShots.length} shots`} accent="#FFFFFF33">
                <div className="mb-3 flex justify-between gap-3">
                  <div className="text-xs text-white/40">Edits here are local to the lab and do not write into store.</div>
                  <button type="button" onClick={() => void handleGenerateAll()} disabled={parsedShots.length === 0 || Boolean(generationRunningShotId)} className={actionButtonClassName}>
                    <WandSparkles className="h-4 w-4" />
                    Generate All
                  </button>
                </div>

                <div className="space-y-3">
                  {parsedShots.map((shot) => {
                    const isSelected = shot.id === selectedShotId
                    const isExpanded = shotSectionOpen[shot.id] ?? false
                    const livePrompt = finalPromptDrafts[shot.id] ?? ""

                    return (
                      <div key={shot.id} className={`rounded-lg border p-3 transition-colors ${isSelected ? "border-[#D4A853]/35 bg-[#D4A853]/5" : "border-white/8 bg-white/2"}`}>
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                          <button type="button" onClick={() => setSelectedShotId(shot.id)} className="text-left">
                            <div className="text-sm font-semibold text-[#E5E0DB]">
                              {String(shot.shotNumber).padStart(2, "0")} — {shot.label}
                            </div>
                            <div className="text-[11px] text-white/42">{shot.shotSize || "Shot size pending"}</div>
                          </button>

                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setShotSectionOpen((current) => ({ ...current, [shot.id]: !isExpanded }))} className="rounded-md border border-white/8 bg-white/3 px-3 py-2 text-xs text-white/65 transition-colors hover:bg-white/5">
                              {isExpanded ? "Collapse" : "Expand"}
                            </button>
                            <button type="button" onClick={() => void generateImageForShot(shot)} disabled={Boolean(generationRunningShotId)} className={actionButtonClassName}>
                              {generationRunningShotId === shot.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                              Generate
                            </button>
                          </div>
                        </div>

                        {isExpanded ? (
                          <div className="space-y-2">
                            {[
                              { key: "caption", label: "caption (RU)", value: shot.caption },
                              { key: "directorNote", label: "directorNote", value: shot.directorNote },
                              { key: "cameraNote", label: "cameraNote", value: shot.cameraNote },
                              { key: "imagePrompt", label: "imagePrompt [EN]", value: shot.imagePrompt },
                              { key: "videoPrompt", label: "videoPrompt [EN]", value: shot.videoPrompt },
                            ].map((field) => (
                              <details key={field.key} open className="rounded-md border border-white/8 bg-white/2 p-3">
                                <summary className="cursor-pointer text-xs uppercase tracking-[0.16em] text-white/44">{field.label}</summary>
                                <textarea
                                  value={(shot[field.key as keyof LabShot] as string) || ""}
                                  rows={field.key === "imagePrompt" || field.key === "videoPrompt" ? 5 : 3}
                                  onChange={(event) => updateLabShot(shot.id, { [field.key]: event.target.value } as Partial<LabShot>)}
                                  className={`${textFieldClassName} mt-2 font-mono text-[11px] leading-5`}
                                />
                              </details>
                            ))}

                            {livePrompt ? (
                              <div className="rounded-md border border-[#D4A853]/16 bg-[#D4A853]/5 p-3">
                                <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-[#D4A853]/80">Final prompt snapshot</div>
                                <div className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-white/66">{truncate(livePrompt, 320)}</div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </PipelineBlock>

              <PipelineArrow label="selected shot → Final prompt" color="#D4A853" />

              <PipelineBlock title="IMAGE PROMPT" badge={selectedShot ? selectedShot.label : "Select a shot"} accent="#D4A853">
                {selectedShot && selectedTimelineShot ? (
                  <div className="space-y-3">
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="rounded-md border border-white/8 bg-white/3 p-3">
                        <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-white/38">Jenkins imagePrompt</div>
                        <div className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-white/70">{selectedShot.imagePrompt || "No imagePrompt from breakdown"}</div>
                      </div>
                      <div className="rounded-md border border-[#D4A853]/16 bg-[#D4A853]/7 p-3">
                        <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-[#D4A853]/78">Character references</div>
                        <div className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-white/70">
                          {selectedRefs.characters.length > 0
                            ? selectedRefs.characters.map((character) => `${character.name}: ${character.appearancePrompt || "No appearance prompt"}`).join("\n")
                            : "No character references"}
                        </div>
                      </div>
                      <div className="rounded-md border border-[#D4A853]/16 bg-[#D4A853]/7 p-3">
                        <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-[#D4A853]/78">Location reference</div>
                        <div className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-white/70">{selectedRefs.location?.appearancePrompt || selectedRefs.location?.name || "No location reference"}</div>
                      </div>
                      <div className="rounded-md border border-[#7C4A6F]/16 bg-[#7C4A6F]/10 p-3">
                        <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-[#C398B5]">Style</div>
                        <div className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-white/70">{projectStyle}</div>
                      </div>
                    </div>

                    <textarea
                      value={selectedFinalPrompt}
                      rows={10}
                      onChange={(event) => updateFinalPromptDraft(selectedShot.id, event.target.value)}
                      className={`${textFieldClassName} font-mono text-[11px] leading-5`}
                    />

                    <div className="flex flex-wrap items-center gap-3">
                      <button type="button" onClick={() => void generateImageForShot(selectedShot)} disabled={Boolean(generationRunningShotId)} className="inline-flex items-center gap-2 rounded-md border border-[#D4A853]/25 bg-[#D4A853]/14 px-4 py-2 text-sm font-semibold text-[#D4A853] transition-colors hover:bg-[#D4A853]/22 disabled:cursor-wait disabled:opacity-60">
                        {generationRunningShotId === selectedShot.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        GENERATE IMAGE
                      </button>
                      <select value={selectedImageGenModel} onChange={(event) => setSelectedImageGenModel(event.target.value)} className={`${textFieldClassName} w-auto min-w-40`}>
                        {IMAGE_MODELS.map((model) => (
                          <option key={model.id} value={model.id}>{model.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-white/8 bg-white/3 p-4 text-sm text-white/45">Select a parsed shot to inspect the final image prompt.</div>
                )}
              </PipelineBlock>

              <PipelineArrow label="prompt → API → Image" color="#4A6F7C" />

              <PipelineBlock title="GENERATION" badge={currentGeneration ? currentGeneration.model : "Idle"} accent="#4A6F7C">
                {currentGeneration ? (
                  <div className="space-y-3">
                    {generationError ? (
                      <div className="rounded-md border border-[#A84B4B]/35 bg-[#A84B4B]/10 p-3 text-sm text-[#F0B5B5]">
                        {generationError}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-3 text-sm text-white/65">
                      <span>endpoint: {currentGeneration.endpoint}</span>
                      <span>model: {currentGeneration.model}</span>
                      <span>timing: {formatSeconds(currentGeneration.durationMs)}</span>
                    </div>

                    <div className="overflow-hidden rounded-lg border border-white/8 bg-white/3">
                      <Image src={currentGeneration.imageUrl} alt="Generated frame" width={640} height={360} unoptimized className="aspect-video w-full object-cover" />
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {selectedShot ? (
                        <button type="button" onClick={() => void generateImageForShot(selectedShot)} disabled={Boolean(generationRunningShotId)} className={actionButtonClassName}>
                          <RefreshCcw className="h-4 w-4" />
                          Retry
                        </button>
                      ) : null}
                      <button type="button" onClick={handleSendToResults} className={actionButtonClassName}>
                        <Send className="h-4 w-4" />
                        Send to Results →
                      </button>
                    </div>
                  </div>
                ) : generationError ? (
                  <div className="rounded-md border border-[#A84B4B]/35 bg-[#A84B4B]/10 p-4 text-sm text-[#F0B5B5]">{generationError}</div>
                ) : (
                  <div className="rounded-md border border-white/8 bg-white/3 p-4 text-sm text-white/45">Generate an image from a shot to inspect endpoint, model, timing, and preview here.</div>
                )}
              </PipelineBlock>
            </div>
          </section>

          <aside className="w-88 shrink-0 overflow-y-auto rounded-xl border border-white/6 bg-[#12110F] p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">Results</div>
              <button type="button" onClick={() => setResultsGallery([])} className="rounded-md border border-white/8 bg-white/3 px-3 py-2 text-xs text-white/58 transition-colors hover:bg-white/5">
                Clear All
              </button>
            </div>

            <div className="space-y-3">
              {resultsGallery.map((item) => (
                <article key={item.id} className="rounded-lg border border-white/8 bg-white/2 p-3">
                  <div className="overflow-hidden rounded-md border border-white/8 bg-white/3">
                    <Image src={item.imageUrl} alt={item.shotLabel} width={600} height={338} unoptimized className="aspect-video w-full object-cover" />
                  </div>

                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-[#E5E0DB]">{item.shotLabel}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em]">
                        <span className="rounded-full border border-white/10 px-2 py-1 text-white/55">{item.model}</span>
                        <span className="rounded-full border border-white/10 px-2 py-1 text-white/55">{item.style}</span>
                        <span className="rounded-full border border-white/10 px-2 py-1 text-white/55">{formatSeconds(item.durationMs)}</span>
                      </div>
                      <div className="mt-2 text-[12px] text-white/45">{truncate(item.prompt, 60)}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setResultsGallery((current) => current.filter((entry) => entry.id !== item.id))}
                      className="rounded-md border border-white/8 bg-white/3 p-2 text-white/55 transition-colors hover:bg-white/5 hover:text-white/78"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              ))}

              {resultsGallery.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 bg-white/2 p-4 text-sm text-white/38">
                  Send generated images here to compare models, prompts, and styles side by side.
                </div>
              ) : null}
            </div>
          </aside>
        </div>

        <section className={`mx-4 mb-4 flex shrink-0 flex-col overflow-hidden rounded-xl border border-white/6 bg-[#12110F] transition-[height] duration-200 ${assistantOpen ? "h-60" : "h-13"}`}>
          <div className="flex items-center justify-between border-b border-white/6 px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">
              <MessageSquare className="h-4 w-4 text-[#4A6F7C]" />
              Assistant Chat
            </div>
            <button type="button" onClick={() => setAssistantOpen((current) => !current)} className="rounded-md border border-white/8 bg-white/3 px-3 py-2 text-xs text-white/58 transition-colors hover:bg-white/5">
              {assistantOpen ? "Collapse" : "Expand"}
            </button>
          </div>

          {assistantOpen ? (
            <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto]">
              <div ref={chatScrollRef} className="overflow-y-auto px-4 py-3">
                <div className="space-y-3">
                  {assistantMessages.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-white/10 bg-white/2 p-4 text-sm text-white/40">
                      Ask for pipeline tuning, shot diagnosis, prompt edits, or Bible consistency fixes.
                    </div>
                  ) : null}

                  {assistantMessages.map((message) => {
                    const hasCodeBlock = message.role === "assistant" && message.content.includes("```")

                    return (
                      <div key={message.id} className={`rounded-lg border p-3 ${message.role === "user" ? "border-[#4A6F7C]/20 bg-[#4A6F7C]/10" : "border-white/8 bg-white/2"}`}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-white/40">{message.role === "user" ? "You" : "Assistant"}</div>
                          {hasCodeBlock ? (
                            <button type="button" disabled className="rounded-md border border-white/8 bg-white/3 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white/35">
                              Apply
                            </button>
                          ) : null}
                        </div>
                        <MarkdownMessage content={message.content} />
                      </div>
                    )
                  })}

                  {assistantLoading ? (
                    <div className="inline-flex items-center gap-2 rounded-md border border-white/8 bg-white/3 px-3 py-2 text-sm text-white/52">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Thinking...
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-white/6 px-4 py-3">
                <div className="flex items-center gap-2">
                  <input
                    value={assistantInput}
                    onChange={(event) => setAssistantInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault()
                        void handleSendAssistant()
                      }
                    }}
                    placeholder="Сделай breakdown более детальным — добавь больше крупных планов"
                    className={`${textFieldClassName} flex-1`}
                  />
                  <button type="button" onClick={() => void handleSendAssistant()} disabled={assistantLoading || assistantInput.trim().length === 0} className={actionButtonClassName}>
                    <Send className="h-4 w-4" />
                    Send
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}

export default function LabPage() {
  return (
    <Suspense fallback={<main className="h-screen bg-[#0A0908]" />}>
      <LabPageContent />
    </Suspense>
  )
}