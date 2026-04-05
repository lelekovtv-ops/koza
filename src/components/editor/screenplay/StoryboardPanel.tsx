"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { AlertTriangle, BookOpen, Camera, ChevronLeft, ChevronRight, Clapperboard, Copy, Crop, Download, Film, FlipHorizontal2, FlipVertical2, Grid, Image as ImageIcon, List, Loader2, Maximize, Minimize, MoreHorizontal, Music, Pause, Pencil, Play, Plus, RefreshCw, RotateCcw, RotateCw, Settings, SkipBack, SkipForward, Sparkles, Trash2, Video, Volume2, Wand2, X } from "lucide-react"
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { buildBreakdownBibleContext, buildScenePromptDrafts, createSceneTimelineShotsFromBreakdown } from "@/features/breakdown"
import { breakdownSceneFincher } from "@/lib/fincher"
import type { JenkinsShot } from "@/lib/breakdownTypes"
import { createTimelineShot, getTotalDuration, useTimelineStore } from "@/store/timeline"
import type { TimelineShot } from "@/store/timeline"
import { timelineShotToStoryboardView, createShotFromStoryboardDefaults } from "@/lib/storyboardBridge"
import { useScriptStore } from "@/store/script"
import { useScenesStore } from "@/store/scenes"
import { useNavigationStore } from "@/store/navigation"
import { trySaveBlob } from "@/lib/fileStorage"
import { applyColorTransfer, imageUrlToCanvas } from "@/lib/colorTransfer"
import { convertReferenceImagesToDataUrls, getShotGenerationReferenceImages } from "@/lib/imageGenerationReferences"
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
import { useDialogueStore } from "@/store/dialogue"
import { useVoiceTrackStore } from "@/store/voiceTrack"
import { useSpeech } from "@/hooks/useSpeech"
import { MoodSynth, detectMoodFromText, type Mood } from "@/lib/moodSynth"
import { buildFullTimingMap, buildSceneTimingMap, mapShotsToBlocks, placeShotsOnTimeline, placeVoiceClips } from "@/lib/placementEngine"
import { syncBus } from "@/lib/syncBus"
import { enrichBlocksFromBreakdown } from "@/features/breakdown/enrichFromBreakdown"
import { BlockCanvas } from "@/components/editor/canvas/BlockCanvas"
import { useBlockCanvasStore } from "@/store/blockCanvas"
import { useProjectsStore } from "@/store/projects"
import { useProjectProfilesStore } from "@/store/projectProfiles"
import { slugify, type CharacterEntry, type LocationEntry, type PropEntry } from "@/lib/bibleParser"
import { generateBibleImageFromModal, EditableDuration, SceneBibleBubble, InlineSelect, InlineDuration, InlineText } from "./StoryboardShared"
import { InspectorView } from "./views/InspectorView"
import { EmbeddedTrackView } from "./EmbeddedTrackView"
import { DirectorShotCard, DirectorFieldVisibilityControl, generateShotImage } from "./DirectorShotCard"
import { getAccentColors } from "@/lib/themeColors"
import {
  SHOT_SIZE_OPTIONS, CAMERA_MOTION_OPTIONS, IMAGE_GEN_MODELS,
  DIRECTOR_ASSISTANT_SYSTEM, DIRECTOR_ASSISTANT_MAX_LINES, DIRECTOR_UPDATE_DEBOUNCE_MS, MAX_DIRECTOR_SHOTS_PER_SCENE,
  DIRECTOR_FIELD_VISIBILITY_OPTIONS,
  applyLucBessonProfileToScene, formatSummaryTime, sanitizeDirectorAssistantText, mergeDirectorNotes, readStreamedText, buildSceneContextText,
  type EditableShotField, type DirectorFieldVisibility,
} from "./storyboardUtils"



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
  const [enhancingIds, setEnhancingIds] = useState<Set<string>>(new Set())
  const [buildingPromptIds, setBuildingPromptIds] = useState<Set<string>>(new Set())
  const [scanningIds, setScanningIds] = useState<Set<string>>(new Set())
  const [pendingActionFocusShotId, setPendingActionFocusShotId] = useState<string | null>(null)
  const [isSplitScreen, setIsSplitScreen] = useState(false)
  // canvasShotId removed — now using useBlockCanvasStore
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
  const breakdownConfig = {} as Record<string, string>
  const setBreakdownGlobalConfig = (_config: Record<string, string>) => {}
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
    } else {
      setIsSplitScreen((current) => !current)
    }

    // Scroll script to the block at current playhead position
    const time = useTimelineStore.getState().currentTime
    if (time > 0) {
      // Find which block the playhead is on by matching timeline shots
      const tlShots = useTimelineStore.getState().shots
      let acc = 0
      for (const shot of tlShots) {
        if (time >= acc && time < acc + shot.duration && shot.parentBlockId) {
          // Find the scene for this block and select it
          const scene = scenes.find((s) => s.blockIds.includes(shot.parentBlockId!))
          if (scene) {
            selectScene(scene.id)
          }
          break
        }
        acc += shot.duration
      }
    }
  }, [isExpanded, onToggleExpanded, scenes, selectScene])

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
    jenkinsShots: JenkinsShot[],
  ) => {
    // Get scene blocks for placement engine
    const allBlocks = useScriptStore.getState().blocks
    const sceneBlocks = sceneBlockIds
      .map((id) => allBlocks.find((b) => b.id === id))
      .filter((b) => b != null)

    const existingSceneShots = useTimelineStore.getState().shots.filter((s) => s.sceneId === sceneId)
    const preservedShots = useTimelineStore.getState().shots.filter((shot) => shot.sceneId !== sceneId)

    const newBreakdownShots = createSceneTimelineShotsFromBreakdown({
      sceneId,
      sceneText,
      sceneBlockIds,
    }, jenkinsShots, sceneBlocks)

    // Merge strategy: update existing shots, add new ones
    const mergedShots: typeof newBreakdownShots = []

    for (let i = 0; i < newBreakdownShots.length; i++) {
      const newShot = newBreakdownShots[i]
      const existingShot = existingSceneShots[i]

      if (existingShot) {
        // Update existing shot — preserve user edits (thumbnails, locked state, custom refs)
        mergedShots.push(createTimelineShot({
          ...existingShot,
          // Update from breakdown
          label: newShot.label,
          shotSize: newShot.shotSize,
          cameraMotion: newShot.cameraMotion,
          caption: newShot.caption,
          directorNote: newShot.directorNote,
          cameraNote: newShot.cameraNote,
          imagePrompt: existingShot.locked ? existingShot.imagePrompt : newShot.imagePrompt,
          videoPrompt: existingShot.locked ? existingShot.videoPrompt : newShot.videoPrompt,
          visualDescription: newShot.visualDescription,
          duration: existingShot.locked ? existingShot.duration : newShot.duration,
          blockRange: newShot.blockRange,
          sourceText: newShot.sourceText,
          // Preserve user data
          thumbnailUrl: existingShot.thumbnailUrl,
          thumbnailBlobKey: existingShot.thumbnailBlobKey,
          originalUrl: existingShot.originalUrl,
          originalBlobKey: existingShot.originalBlobKey,
          generationHistory: existingShot.generationHistory,
          activeHistoryIndex: existingShot.activeHistoryIndex,
          customReferenceUrls: existingShot.customReferenceUrls,
          excludedBibleIds: existingShot.excludedBibleIds,
          locked: existingShot.locked,
          notes: existingShot.notes,
        }))
      } else {
        // New shot from breakdown
        mergedShots.push(newShot)
      }
    }

    // Log merge info
    const updated = Math.min(existingSceneShots.length, newBreakdownShots.length)
    const added = Math.max(0, newBreakdownShots.length - existingSceneShots.length)
    const removed = Math.max(0, existingSceneShots.length - newBreakdownShots.length)
    console.log(`[KOZA] Breakdown merge: ${updated} updated, ${added} added, ${removed} removed`)

    reorderShots([...preservedShots, ...mergedShots])
    selectScene(sceneId)
    setViewMode("board")
    setExpandedShotId(mergedShots[0]?.id ?? null)
    setExpandedSceneShotIds((current) => new Set(current).add(sceneId))

    // Auto-generate voice clips using placement engine
    const dialogueLines = useDialogueStore.getState().lines
    if (dialogueLines.length > 0) {
      const allShots = useTimelineStore.getState().shots
      const voiceStore = useVoiceTrackStore.getState()
      if (sceneBlocks.length > 0) {
        const timingMap = buildSceneTimingMap(sceneId, sceneBlocks, 0)
        const shotInputs = mergedShots.map((s: { id: string; label: string; caption: string; directorNote: string; notes: string }) => ({
          id: s.id,
          label: s.label,
          caption: s.caption,
          directorNote: s.directorNote,
          notes: s.notes,
        }))
        const mapped = mapShotsToBlocks(shotInputs, timingMap)
        const placed = placeShotsOnTimeline(mapped, timingMap)
        const placedVoice = placeVoiceClips([timingMap], placed)
        voiceStore.generateFromPlacement(placedVoice, placed, sceneId)
      } else {
        const shotRefs = allShots.map((s, i) => ({ id: s.id, sceneId: s.sceneId, order: i }))
        voiceStore.generateFromDialogue(dialogueLines, shotRefs)
      }
    }

    return mergedShots.length
  }, [reorderShots, selectScene])

  const handleJenkinsBreakdown = useCallback(async () => {
    const text = scenario.trim()
    if (!text || jenkinsLoading) return
    setJenkinsLoading(true)
    try {
      const bible = buildBreakdownBibleContext(characters, locations, bibleProps)
      const dirProfile = useBibleStore.getState().directorProfile
      const { shots: jenkinsShots, diagnostics } = await breakdownSceneFincher(text, { bible, style: projectStyle, directorSystemPrompt: dirProfile?.systemPrompt })

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

  const handleSceneBreakdown = useCallback(async (scene: { id: string; blockIds: string[]; title: string; estimatedDurationMs?: number }) => {
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

    // Check if scene already has shots with generated content — soft confirm
    const existingSceneShots = shots.filter((s) => s.sceneId === scene.id)
    const hasGeneratedContent = existingSceneShots.some((s) => s.thumbnailUrl || s.locked)
    if (hasGeneratedContent) {
      const lockedCount = existingSceneShots.filter((s) => s.locked).length
      const withImages = existingSceneShots.filter((s) => s.thumbnailUrl).length
      const parts = [
        `${existingSceneShots.length} шотов`,
        withImages > 0 ? `${withImages} с картинками` : "",
        lockedCount > 0 ? `${lockedCount} locked` : "",
      ].filter(Boolean).join(", ")
      if (!confirm(`Обновить ${parts}?\n\nКартинки и locked промпты сохранятся.`)) return
    }

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
      const directorProfile = useBibleStore.getState().directorProfile

      // Build timeline segments from scene blocks for the AI
      const sceneBlockData = scene.blockIds
        .map((bid) => scriptBlocks.find((b) => b.id === bid))
        .filter((b) => b != null)

      const timelineSegments: import("@/lib/fincher").TimelineSegment[] = []
      let segTimeMs = 0
      let segChar: string | null = null
      const DIALOGUE_WPM = 155
      const ACTION_WPM = 100

      for (const blk of sceneBlockData) {
        const txt = blk.text.trim()
        if (!txt) { segChar = null; continue }

        if (blk.type === "scene_heading") {
          segChar = null
          const dur = 2500
          timelineSegments.push({ startMs: segTimeMs, endMs: segTimeMs + dur, type: "heading", text: txt })
          segTimeMs += dur
        } else if (blk.type === "character") {
          segChar = txt.replace(/\s*\(.*\)\s*$/, "").trim()
        } else if (blk.type === "parenthetical") {
          // skip
        } else if (blk.type === "dialogue" && segChar) {
          const words = txt.split(/\s+/).filter(Boolean).length
          const dur = Math.max(800, Math.round((words / DIALOGUE_WPM) * 60_000) + 300)
          const isVO = /V\.?O\.?/i.test(segChar)
          timelineSegments.push({ startMs: segTimeMs, endMs: segTimeMs + dur, type: "voice", speaker: segChar, text: txt, isVO })
          segTimeMs += dur
        } else if (blk.type === "transition") {
          segChar = null
          timelineSegments.push({ startMs: segTimeMs, endMs: segTimeMs + 1500, type: "transition", text: txt })
          segTimeMs += 1500
        } else {
          segChar = null
          const words = txt.split(/\s+/).filter(Boolean).length
          const dur = Math.max(1500, Math.round((words / ACTION_WPM) * 60_000))
          timelineSegments.push({ startMs: segTimeMs, endMs: segTimeMs + dur, type: "action", text: txt })
          segTimeMs += dur
        }
      }

      const { shots: jenkinsShots, diagnostics } = await breakdownSceneFincher(sceneText, {
        sceneId: scene.id,
        bible,
        style: projectStyle,
        directorSystemPrompt: directorProfile?.systemPrompt,
        sceneDurationMs: scene.estimatedDurationMs || segTimeMs || undefined,
        timelineSegments,
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

      // Enrich blocks with production fields from breakdown
      const sceneBlocksFull = scene.blockIds
        .map((bid) => scriptBlocks.find((b) => b.id === bid))
        .filter((b): b is typeof scriptBlocks[number] => b != null)

      if (sceneBlocksFull.length > 0) {
        const enrichResult = enrichBlocksFromBreakdown({
          sceneId: scene.id,
          sceneBlocks: sceneBlocksFull,
          shots: jenkinsShots,
        })

        // Update blocks with production fields
        const { updateBlockProduction } = useScriptStore.getState()
        for (const enrichedBlock of enrichResult.enrichedBlocks) {
          const original = sceneBlocksFull.find((b) => b.id === enrichedBlock.id)
          if (original && enrichedBlock !== original) {
            updateBlockProduction(enrichedBlock.id, {
              visual: enrichedBlock.visual,
              shotGroupId: enrichedBlock.shotGroupId,
              durationMs: enrichedBlock.durationMs,
            }, "system")
          }
        }

        // Save shot groups (deprecated)
        const { setShotGroups, shotGroups: existingSG } = useScriptStore.getState()
        const otherSceneSG = existingSG.filter((sg) => sg.sceneId !== scene.id)
        setShotGroups([...otherSceneSG, ...enrichResult.shotGroups])

        // Save child shots (new parent-child model)
        if (enrichResult.shots.length > 0) {
          const { shots: existingShots, setShots } = useScriptStore.getState()
          // Remove existing shots for blocks in this scene, keep others
          const sceneBlockIds = new Set(scene.blockIds)
          const otherShots = existingShots.filter((s) => !sceneBlockIds.has(s.parentBlockId))
          setShots([...otherShots, ...enrichResult.shots])
        }
      }

      // Only run promptBuilder if NO pipeline preset is active
      // (pipeline presets already generate their own prompts — don't overwrite)
      const pipelinePreset = useBreakdownConfigStore.getState().activePipelinePreset
      const hasPipelinePrompts = pipelinePreset && pipelinePreset.modules.length > 0

      if (useBreakdownConfigStore.getState().autoPromptBuild && !hasPipelinePrompts) {
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
      // If pipeline preset is active and shots already have prompts from pipeline — skip overwrite
      const pipelinePreset = useBreakdownConfigStore.getState().activePipelinePreset
      const hasPipelinePrompts = pipelinePreset && pipelinePreset.modules.length > 0
      const allHavePrompts = hasPipelinePrompts && sceneShots.every((s) => s.imagePrompt && s.imagePrompt.length > 20)

      if (allHavePrompts) {
        // Prompts from pipeline already exist — don't overwrite
        console.log("[StoryboardPanel] Pipeline prompts preserved, skipping promptBuilder")
      } else {
        const promptDrafts = buildScenePromptDrafts(sceneShots, characters, locations, projectStyle, bibleProps)
        promptDrafts.forEach((draft) => {
          updateShot(draft.shotId, {
            imagePrompt: draft.imagePrompt,
            videoPrompt: draft.videoPrompt,
          })
        })
      }

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
      setBreakdownWarning("Luc Besson профиль ещё не подключён")
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

  const [breakdownShotId, setBreakdownShotId] = useState<string | null>(null)

  const handleBreakdownShot = useCallback(async (shotId: string) => {
    const shot = useTimelineStore.getState().shots.find((s) => s.id === shotId)
    if (!shot || breakdownShotId) return

    const text = shot.sourceText || shot.caption
    if (!text.trim()) return

    setBreakdownShotId(shotId)
    try {
      const bible = buildBreakdownBibleContext(characters, locations, bibleProps)
      const dirProfile = useBibleStore.getState().directorProfile
      const { shots: jenkinsShots } = await breakdownSceneFincher(text, {
        bible,
        style: projectStyle,
        directorSystemPrompt: dirProfile?.systemPrompt,
      })

      if (jenkinsShots.length <= 1) {
        // AI didn't split — nothing to do
        setBreakdownShotId(null)
        return
      }

      // Replace the single shot with multiple shots at the same position
      const allShots = useTimelineStore.getState().shots
      const shotIndex = allShots.findIndex((s) => s.id === shotId)
      const newShots = jenkinsShots.map((js, i) => createTimelineShot({
        label: `${shot.label}.${i + 1}`,
        shotSize: js.shotSize ?? "",
        cameraMotion: js.cameraMotion ?? "",
        duration: js.duration,
        caption: js.caption ?? "",
        directorNote: js.directorNote ?? "",
        cameraNote: js.cameraNote ?? "",
        imagePrompt: js.imagePrompt ?? "",
        videoPrompt: js.videoPrompt ?? "",
        visualDescription: js.visualDescription ?? "",
        notes: js.notes,
        type: js.type,
        sceneId: shot.sceneId,
        blockRange: shot.blockRange,
        locked: false,
        autoSynced: false,
        sourceText: text,
      }))

      // Splice: remove original, insert new shots at same position
      const updated = [...allShots]
      updated.splice(shotIndex, 1, ...newShots)
      reorderShots(updated)

      // Select first new shot
      if (newShots[0]) selectShot(newShots[0].id)
    } catch (error) {
      console.error("Shot breakdown error:", error)
    } finally {
      setBreakdownShotId(null)
    }
  }, [breakdownShotId, characters, locations, bibleProps, projectStyle, reorderShots, selectShot])

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
    ghost.style.boxShadow = `0 30px 60px rgba(0,0,0,0.5), 0 0 0 1px ${getAccentColors().shadowGlow}`
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
  const activeTheme = typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme") : null
  const panelChrome = activeTheme === "synthwave"
    ? "linear-gradient(180deg, rgba(17,11,34,0.98) 0%, rgba(10,6,20,0.98) 100%)"
    : activeTheme === "architect"
      ? "linear-gradient(180deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.75) 100%)"
      : backgroundColor === "#0B0C10"
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
                        background: `linear-gradient(90deg, ${getAccentColors().glowGradient(0.08)} 0%, ${getAccentColors().glowGradient(0.18)} 60%, ${getAccentColors().glowGradient(0.06)} 100%)`,
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
                      <span>{Math.round(scene.estimatedDurationMs / 1000)}s</span>
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
                  {(() => {
                    // Group shots by parentBlockId for block→shot hierarchy
                    const blockGroups = new Map<string, TimelineShot[]>()
                    const ungrouped: TimelineShot[] = []
                    for (const shot of relatedShots) {
                      if (shot.parentBlockId) {
                        const group = blockGroups.get(shot.parentBlockId) || []
                        group.push(shot)
                        blockGroups.set(shot.parentBlockId, group)
                      } else {
                        ungrouped.push(shot)
                      }
                    }

                    const renderShotCard = (shot: TimelineShot, index: number) => (
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
                        onDelete={() => {
                          // If shot has parentBlockId, remove through scriptStore (preserves block)
                          if (shot.parentBlockId) {
                            useScriptStore.getState().removeShotFromBlock(shot.id)
                          } else {
                            removeShot(shot.id)
                          }
                        }}
                        onDuplicate={() => handleDuplicateSceneShot(shot)}
                      />
                    )

                    let globalIndex = 0
                    return (
                      <>
                        {/* Block-grouped shots */}
                        {Array.from(blockGroups.entries()).map(([blockId, blockShots]) => {
                          const block = scriptBlocks.find((b) => b.id === blockId)
                          const blockLabel = block
                            ? `${block.type === "scene_heading" ? "🎬" : block.type === "dialogue" ? "💬" : block.type === "action" ? "▶" : "◆"} ${block.text.slice(0, 50)}${block.text.length > 50 ? "…" : ""}`
                            : blockId.slice(0, 12)
                          return (
                            <div key={blockId} className="flex flex-col gap-2">
                              {/* Block header */}
                              <div className="flex items-center gap-2 px-1 py-1">
                                <div className="h-px flex-1 bg-white/6" />
                                <span className="text-[9px] uppercase tracking-[0.1em] text-[#7F8590] max-w-[200px] truncate" title={block?.text}>
                                  {blockLabel}
                                </span>
                                <span className="text-[9px] text-white/20">{blockShots.length} shot{blockShots.length !== 1 ? "s" : ""}</span>
                                <div className="h-px flex-1 bg-white/6" />
                              </div>
                              {/* Shots within block */}
                              {blockShots.map((shot) => {
                                const card = renderShotCard(shot, globalIndex)
                                globalIndex++
                                return card
                              })}
                            </div>
                          )
                        })}
                        {/* Ungrouped shots (legacy, no parentBlockId) */}
                        {ungrouped.map((shot) => {
                          const card = renderShotCard(shot, globalIndex)
                          globalIndex++
                          return card
                        })}
                      </>
                    )
                  })()}
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
      <div className="border-b border-white/6 px-3 py-2 text-[#E5E0DB]">
        <div className="flex items-center gap-3 text-[#9FA4AE] overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode("scenes")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] uppercase tracking-[0.1em] transition-colors whitespace-nowrap ${isDirectorWorkflow ? "bg-white/8 text-white" : "text-white/40 hover:text-white/60"}`}
            >
              <Camera size={12} />
              Director Cut
            </button>
            <button
              type="button"
              onClick={() => setViewMode("board")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] uppercase tracking-[0.1em] transition-colors whitespace-nowrap ${viewMode === "board" ? "bg-white/8 text-white" : "text-white/40 hover:text-white/60"}`}
            >
              <Grid size={12} />
              Board
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] uppercase tracking-[0.1em] transition-colors whitespace-nowrap ${viewMode === "list" ? "bg-white/8 text-white" : "text-white/40 hover:text-white/60"}`}
            >
              <List size={12} />
              Shot List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("inspector")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] uppercase tracking-[0.1em] transition-colors whitespace-nowrap ${viewMode === "inspector" ? "bg-white/8 text-white" : "text-white/40 hover:text-white/60"}`}
            >
              <BookOpen size={12} />
              Inspector
            </button>
            <button
              type="button"
              onClick={() => setViewMode("tracks")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] uppercase tracking-[0.1em] transition-colors whitespace-nowrap ${viewMode === "tracks" ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300" : "text-white/40 hover:text-white/60"}`}
            >
              <Film size={12} />
              Tracks
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.1em] text-[#7F8590] shrink-0 ml-auto">
            <span>{scenes.length} scenes</span>
            <span className="h-3 w-px bg-white/8" />
            <span>{frames.length} frames</span>
            <span className="h-3 w-px bg-white/8" />
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
      className="absolute inset-0 z-3 overflow-hidden transition-[width,transform,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{
        width: isOpen ? resolvedPanelWidth : 0,
        minWidth: isOpen ? resolvedPanelWidth : 0,
        opacity: isOpen ? 1 : 0,
        transform: isOpen ? "translateX(0)" : "translateX(108%)",
        pointerEvents: isOpen ? "auto" : "none",
      }}
    >
      <div
        className="relative flex h-full w-full flex-col overflow-hidden border-l border-white/10"
        style={{
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
              onClick={handleToggleSplitScreen}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-[12px] uppercase tracking-[0.12em] transition-colors ${
                isDuoMode
                  ? "border-violet-500/30 bg-violet-500/12 text-violet-300"
                  : "border-white/10 bg-white/4 text-white/50 hover:bg-white/8 hover:text-white/70"
              }`}
            >
              <Pencil size={14} />
              Script
            </button>
            <a
              href="/bible"
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/4 px-4 py-2 text-[12px] uppercase tracking-[0.12em] text-white/50 transition-colors hover:bg-white/8 hover:text-white/70"
            >
              <BookOpen size={14} />
              Bible
            </a>

            {/* Model selector dropdown */}
            <div className="relative">
              <select
                value={selectedImageGenModel || "nano-banana-2"}
                onChange={(e) => setSelectedImageGenModel(e.target.value)}
                className="appearance-none rounded-lg border border-white/8 bg-white/4 py-2 pl-3 pr-7 text-[11px] font-medium text-white/60 outline-none transition-colors hover:bg-white/8 hover:text-white/80"
              >
                {IMAGE_GEN_MODELS.map((model) => (
                  <option key={model.id} value={model.id} className="bg-[#1a1d24] text-white">
                    {model.label} {model.price}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center">
                <ChevronRight size={12} className="rotate-90 text-white/25" />
              </div>
            </div>

            <ProjectStylePicker projectStyle={projectStyle} setProjectStyle={setProjectStyle} />
          </div>

          {/* Right — utility */}
          <div className="flex items-center gap-1.5">
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

        <div className={isDuoMode ? "flex-1 min-h-0 overflow-hidden" : "flex-1 min-h-0 overflow-y-auto px-5 py-5"} style={isDuoMode ? undefined : { overscrollBehaviorY: "contain" }}>
          {isDuoMode ? (
          <div className="flex h-full w-full">
            <div className="shrink-0 overflow-y-auto border-r border-white/8" style={{ width: "33.333%", minWidth: 280, maxWidth: "33.333%" }}>
              <ScriptViewer
                selectedSceneId={selectedSceneId}
                onSceneClick={(sceneId) => {
                  selectScene(selectedSceneId === sceneId ? null : sceneId)
                  // Click-to-seek: find first shot of this scene and scroll timeline to it
                  const sceneShots = shots.filter((s) => s.sceneId === sceneId).sort((a, b) => a.order - b.order)
                  if (sceneShots[0]) {
                    selectShot(sceneShots[0].id)
                    // Seek timeline to shot position
                    const shotIndex = shots.findIndex((s) => s.id === sceneShots[0].id)
                    if (shotIndex >= 0) {
                      const startMs = shots.slice(0, shotIndex).reduce((sum, s) => sum + s.duration, 0)
                      useTimelineStore.getState().seekTo(startMs)
                    }
                  }
                }}
                fontSize={scriptFontSize}
              />
            </div>
            <div className="flex flex-1 flex-col overflow-y-auto" style={{ overscrollBehaviorY: "contain" }}>
              {workspaceChrome}
              <div className="flex-1 px-4 py-4">
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
                        className={`group relative rounded-[14px] border bg-[#111317] p-2 shadow-[0_20px_45px_rgba(0,0,0,0.28)] transition-all duration-200 ${recentInsertedFrameId === frame.id ? "storyboard-card-enter" : ""} ${selectedShotId === shot?.id ? "border-[#D4A853]/40 ring-1 ring-[#D4A853]/20" : "border-white/6"} ${dropTargetIndex === index || dropTargetIndex === index + 1 ? "border-[#D8C4A5]/40 shadow-[0_0_0_1px_rgba(216,196,165,0.18),0_20px_45px_rgba(0,0,0,0.34)]" : "hover:-translate-y-px hover:border-white/10 hover:bg-[#14171C]"}`}
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
                            onClick={() => { if (shot) { selectShot(shot.id); if (shot.sceneId) selectScene(shot.sceneId) } }}
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
                            {/* Canvas button — top right corner of card */}
                            {shot && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const blockId = shot.blockRange?.[0] || shot.id
                                  useBlockCanvasStore.getState().openBlock(blockId, shot.id)
                                }}
                                className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-md border border-cyan-500/25 bg-black/40 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-cyan-300/70 backdrop-blur-sm transition-all hover:bg-cyan-500/15 hover:text-cyan-200"
                                title="Open in Canvas"
                              >
                                <Grid size={10} />
                                <span className="hidden sm:inline">Canvas</span>
                              </button>
                            )}

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
                                  onClick={() => shot && handleBreakdownShot(shot.id)}
                                  disabled={breakdownShotId === shot?.id}
                                  className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3.5 py-2 text-[12px] uppercase tracking-[0.14em] text-emerald-300 backdrop-blur-sm transition-colors hover:bg-emerald-500/25 disabled:opacity-40"
                                >
                                  {breakdownShotId === shot?.id ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                  Split
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!shot) return
                                    const blockId = shot.blockRange?.[0] || shot.id
                                    useBlockCanvasStore.getState().openBlock(blockId, shot.id)
                                  }}
                                  className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-2 text-[12px] uppercase tracking-[0.14em] text-cyan-300 backdrop-blur-sm transition-colors hover:bg-cyan-500/20"
                                >
                                  <Grid size={13} />
                                  Canvas
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
                <InspectorView
                  shots={inspectorShots}
                  expandedShotId={expandedShotId}
                  onToggleExpand={(id) => setExpandedShotId(expandedShotId === id ? null : id)}
                  editingShotField={editingShotField}
                  editingShotDraft={editingShotDraft}
                  onStartEdit={startEditingShotField}
                  onCommitEdit={commitEditingShotField}
                  onDraftChange={setEditingShotDraft}
                  onUpdateShot={(id, patch) => updateShot(id, patch)}
                  characters={characters}
                  locations={locations}
                  bibleProps={bibleProps}
                  projectStyle={projectStyle}
                />
                ) : viewMode === "pieces" ? (
                <div className="-mx-4 -my-4 flex h-full bg-[#0A0A09]">
                  <div className="w-1/4 min-w-[260px] overflow-y-auto border-r border-white/6 bg-[#0E0E0D]">
                    <ScriptViewer
                      selectedSceneId={selectedSceneId}
                      onSceneClick={(sceneId) => selectScene(selectedSceneId === sceneId ? null : sceneId)}
                      fontSize={scriptFontSize}
                    />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <EmbeddedTrackView blocks={scriptBlocks} scenes={scenes} shots={sortedShots} />
                  </div>
                </div>
                ) : viewMode === "tracks" ? (
                <div className="-mx-4 -my-4 h-full">
                  <EmbeddedTrackView blocks={scriptBlocks} scenes={scenes} shots={sortedShots} />
                </div>
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
                    {/* Canvas button — card level, outside image overflow */}
                    {shot && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          const blockId = shot.blockRange?.[0] || shot.id
                          useBlockCanvasStore.getState().openBlock(blockId, shot.id)
                        }}
                        className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border border-cyan-500/30 bg-black/60 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-cyan-300 backdrop-blur-sm transition-all hover:bg-cyan-500/20 hover:text-cyan-100 pointer-events-auto cursor-pointer"
                        title="Open in Canvas"
                      >
                        <Grid size={10} />
                        Canvas
                      </button>
                    )}
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
                      {/* Canvas button removed from here — moved to card level below */}

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
                            onClick={() => shot && handleBreakdownShot(shot.id)}
                            disabled={breakdownShotId === shot?.id}
                            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3.5 py-2 text-[12px] uppercase tracking-[0.14em] text-emerald-300 backdrop-blur-sm transition-colors hover:bg-emerald-500/25 disabled:opacity-40"
                          >
                            {breakdownShotId === shot?.id ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                            Split
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
          <InspectorView
            shots={inspectorShots}
            expandedShotId={expandedShotId}
            onToggleExpand={(id) => setExpandedShotId(expandedShotId === id ? null : id)}
            editingShotField={editingShotField}
            editingShotDraft={editingShotDraft}
            onStartEdit={startEditingShotField}
            onCommitEdit={commitEditingShotField}
            onDraftChange={setEditingShotDraft}
            onUpdateShot={(id, patch) => updateShot(id, patch)}
            characters={characters}
            locations={locations}
            bibleProps={bibleProps}
            projectStyle={projectStyle}
          />
          ) : viewMode === "pieces" ? (
          <div className="-mx-5 -my-5 flex h-full items-start justify-center overflow-y-auto bg-[#0A0A09]">
            <div className="my-8 w-full max-w-[680px] rounded-xl border border-white/6 bg-[#111110] px-10 py-8 shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
              <ScriptViewer
                selectedSceneId={selectedSceneId}
                onSceneClick={(sceneId) => selectScene(selectedSceneId === sceneId ? null : sceneId)}
                fontSize={scriptFontSize}
              />
            </div>
          </div>
          ) : viewMode === "tracks" ? (
          <div className="-mx-5 -my-5 h-full">
            <EmbeddedTrackView blocks={scriptBlocks} scenes={scenes} shots={sortedShots} />
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

      {/* Block Canvas — node graph editor per shot */}
      <BlockCanvas />

    </aside>
    </>
  )
}