"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  type NodeTypes,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { ArrowLeft, BookOpen, Download, Play, Save, Sparkles, RotateCcw, Undo2, Upload } from "lucide-react"

import PipelineSceneNode from "@/components/pipeline/PipelineSceneNode"
import PipelineStageNode from "@/components/pipeline/PipelineStageNode"
import PipelineOutputNode from "@/components/pipeline/PipelineOutputNode"
import PipelineBibleNode from "@/components/pipeline/PipelineBibleNode"
import PipelineStyleNode from "@/components/pipeline/PipelineStyleNode"
import PipelineShotNode from "@/components/pipeline/PipelineShotNode"
import PresetLibrary from "@/components/pipeline/PresetLibrary"
import InspectorPanel from "@/components/pipeline/InspectorPanel"
import ResultsPreview from "@/components/pipeline/ResultsPreview"

import { usePipelineStore } from "@/store/pipeline"
import { useBibleStore } from "@/store/bible"
import { composePipelinePrompts, runPipelineBreakdown } from "@/lib/pipeline/runner"
import { extractPipelinePromptEntries, type PipelinePromptEntry } from "@/lib/pipeline/imageGenerator"
import { isValidDropTarget } from "@/lib/pipeline/presetMerge"
import { STAGE_EXPLANATIONS, summarizeStageForDisplay } from "@/lib/pipeline/stageExplanations"
import { arePipelineConfigsEqual, parseImportedConfigPayload, serializeConfigExport } from "@/lib/pipeline/configTransfer"
import { parseTextToBlocks } from "@/lib/screenplayFormat"
import { parseScenes } from "@/lib/sceneParser"
import type { PipelineBreakdownDraft, PipelineStageId, PipelineStageStatus, PresetDropType } from "@/types/pipeline"
import type { PipelineStageNodeData } from "@/components/pipeline/PipelineStageNode"
import type { PipelineSceneNodeData } from "@/components/pipeline/PipelineSceneNode"
import type { PipelineOutputNodeData } from "@/components/pipeline/PipelineOutputNode"
import type { PipelineBibleNodeData } from "@/components/pipeline/PipelineBibleNode"
import type { PipelineStyleNodeData } from "@/components/pipeline/PipelineStyleNode"
import type { PipelineShotNodeData } from "@/components/pipeline/PipelineShotNode"

const nodeTypes: NodeTypes = {
  pipelineScene: PipelineSceneNode,
  pipelineStage: PipelineStageNode,
  pipelineOutput: PipelineOutputNode,
  pipelineBible: PipelineBibleNode,
  pipelineStyle: PipelineStyleNode,
  pipelineShot: PipelineShotNode,
}

// Stage accent colors from TZ
const STAGE_COLORS: Record<string, string> = {
  sceneAnalyst: "#8b5cf6",    // Фиолетовый
  actionSplitter: "#8b5cf6",  // Фиолетовый
  contextRouter: "#14b8a6", // Зеленовато-бирюзовый
  creativePlanner: "#ec4899", // Розовый
  censor: "#ef4444", // Красный
  shotPlanner: "#d97706",     // Янтарный
  continuitySupervisor: "#06b6d4", // Бирюзовый
  promptComposer: "#f97316",  // Коралловый
  promptOptimizer: "#84cc16", // Лаймовый
  imageGenerator: "#10b981",  // Зелёный
}

const STAGE_DESCRIPTIONS: Record<string, string> = {
  sceneAnalyst: "AI-анализ драматургии",
  actionSplitter: "Разбивка на действия",
  contextRouter: "Роутинг контекста сцен",
  creativePlanner: "Редкие операторские идеи",
  censor: "Цензор смысла и тона",
  shotPlanner: "Планирование кадров",
  continuitySupervisor: "Проверка непрерывности",
  promptComposer: "Компоновка промптов",
  promptOptimizer: "Оптимизация промптов",
}

// Fixed horizontal layout positions
const NODE_X_START = 40
const NODE_X_GAP = 280
const NODE_Y = 160
const SIDE_NODE_Y = 16
const SHOT_NODE_START_X = NODE_X_START + NODE_X_GAP * 4.1
const SHOT_NODE_START_Y = NODE_Y + 255
const SHOT_NODE_GAP_X = 320
const SHOT_NODE_GAP_Y = 310
const SHOT_NODE_COLUMNS = 3

const DEFAULT_SCENE_TEXT = "Старая квартира, облезлые стены, утро: лучи солнца пробиваются через жалюзи в комнату. В комнате тихо слышен только звук потолочного вентилятора. За столом спит Борис, вокруг него разбросаны листы сценария, рядом полная банка окурков. Муха садится ему на нос, он вздрагивает и просыпается."

function hasExplicitSceneHeading(text: string): boolean {
  return /^\s*(INT\.|EXT\.|INT\.\/EXT\.|EXT\.\/INT\.|I\/E\.)/im.test(text)
}

function inferTimeOfDay(text: string): string {
  const normalized = text.toLowerCase()

  if (normalized.includes("ноч")) return "НОЧЬ"
  if (normalized.includes("вечер")) return "ВЕЧЕР"
  if (normalized.includes("утро")) return "УТРО"
  if (normalized.includes("день")) return "ДЕНЬ"

  return "ДЕНЬ"
}

function inferLocationName(text: string): string {
  const firstSentence = text
    .split(/[.!?\n]/)
    .map((part) => part.trim())
    .find(Boolean) ?? "ЛОКАЦИЯ"

  const firstClause = firstSentence
    .split(/[:,;]|\s[—-]\s/)
    .map((part) => part.trim())
    .find(Boolean) ?? firstSentence

  const words = firstClause
    .replace(/["']/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)

  if (words.length === 0) {
    return "ЛОКАЦИЯ"
  }

  return words.join(" ").toUpperCase()
}

function buildBibleSyncBlocks(sceneText: string) {
  const trimmed = sceneText.trim()

  if (!trimmed) {
    return parseTextToBlocks(trimmed)
  }

  if (hasExplicitSceneHeading(trimmed)) {
    return parseTextToBlocks(trimmed)
  }

  const syntheticHeading = `INT. ${inferLocationName(trimmed)} — ${inferTimeOfDay(trimmed)}`
  return parseTextToBlocks(`${syntheticHeading}\n\n${trimmed}`)
}

interface CanvasShotNodeEntry {
  shotId: string
  order: number
  label: string
  actionText: string
  directorNote: string
  operatorNote: string
  promptText?: string
  keyframeRole: PipelineShotNodeData["keyframeRole"]
  isGenerated: boolean
}

function buildCanvasShotEntries(
  breakdownDraft: PipelineBreakdownDraft | null,
  promptEntries: PipelinePromptEntry[],
): CanvasShotNodeEntry[] {
  if (!breakdownDraft) {
    return []
  }

  const promptByShotId = new Map(promptEntries.map((entry) => [entry.shotId, entry]))

  return breakdownDraft.draftShots
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((shot) => {
      const promptEntry = promptByShotId.get(shot.shotId)

      return {
        shotId: shot.shotId,
        order: shot.order,
        label: shot.label,
        actionText: shot.actionText,
        directorNote: shot.directorNote,
        operatorNote: shot.cameraNote,
        promptText: promptEntry?.prompt,
        keyframeRole: shot.keyframeRole,
        isGenerated: Boolean(promptEntry),
      }
    })
}

const PIPELINE_STAGE_IDS: PipelineStageId[] = [
  "sceneInput",
  "sceneAnalyst",
  "actionSplitter",
  "contextRouter",
  "creativePlanner",
  "censor",
  "shotPlanner",
  "continuitySupervisor",
  "promptComposer",
  "promptOptimizer",
  "imageGenerator",
]

function isPipelineStageId(value: string): value is PipelineStageId {
  return PIPELINE_STAGE_IDS.includes(value as PipelineStageId)
}

function buildInitialNodes(
  sceneText: string,
  stageStatuses: Record<PipelineStageId, PipelineStageStatus>,
  config: ReturnType<typeof usePipelineStore.getState>["activeConfig"],
  bibleSummary: { characterCount: number; locationCount: number },
  stageResults: ReturnType<typeof usePipelineStore.getState>["runState"]["stageResults"],
  runSnapshot: ReturnType<typeof usePipelineStore.getState>["runSnapshot"],
  bibleEntries: { characters: Array<{ name: string }>; locations: Array<{ name: string }> },
  imageGenState: {
    model: ReturnType<typeof usePipelineStore.getState>["imageGenModel"]
    generatedCount: number
    runningShotId: string | null
    promptCount: number
  },
  shotEntries: CanvasShotNodeEntry[],
  shotNodePositions: Record<string, { x: number; y: number }>,
  selectedStage: PipelineStageId | null,
  dropFeedback: { nodeId: string | null; type: "valid" | "invalid" | "pulse" | null },
  onOpenBible: () => void,
  onSelect: (stageId: PipelineStageId) => void,
): Node[] {
  const getModel = (stageId: PipelineStageId) =>
    config.stageModels.find((sm) => sm.stageId === stageId)?.modelId ?? "—"

  const stageIds: PipelineStageId[] = [
    "sceneAnalyst",
    "actionSplitter",
    "contextRouter",
    "creativePlanner",
    "censor",
    "shotPlanner",
    "continuitySupervisor",
    "promptComposer",
    "promptOptimizer",
  ]

  const nodes: Node[] = [
    {
      id: "bibleNode",
      type: "pipelineBible",
      position: { x: NODE_X_START + NODE_X_GAP * 0.6, y: SIDE_NODE_Y },
      draggable: false,
      selectable: false,
      data: {
        characterCount: bibleSummary.characterCount,
        locationCount: bibleSummary.locationCount,
        onOpen: onOpenBible,
      } satisfies PipelineBibleNodeData,
    },
    {
      id: "sceneInput",
      type: "pipelineScene",
      position: { x: NODE_X_START, y: NODE_Y },
      data: {
        sceneText,
        status: stageStatuses.sceneInput,
        onSelect: () => onSelect("sceneInput"),
      } satisfies PipelineSceneNodeData,
    },
  ]

  stageIds.forEach((stageId, i) => {
    const explanation = STAGE_EXPLANATIONS[stageId]
    const summary = summarizeStageForDisplay(stageId, stageResults[stageId], runSnapshot, bibleEntries)
    const settingsMap: Record<string, Array<{ key: string; value: string }>> = {
      sceneAnalyst: [
        { key: "Фокус", value: config.directorPreset.emotionalFocus.slice(0, 25) || "—" },
      ],
      actionSplitter: [
        { key: "Плотность", value: config.directorPreset.dramaticDensity },
      ],
      contextRouter: [
        { key: "Фокус", value: "соседние сцены" },
      ],
      creativePlanner: [
        { key: "Фокус", value: "необычные планы" },
      ],
      censor: [
        { key: "Режим", value: "сверка смысла" },
      ],
      shotPlanner: [
        { key: "Кадры", value: `${config.directorPreset.shotCountRange[0]}–${config.directorPreset.shotCountRange[1]}` },
        { key: "Ключ. кадр", value: config.directorPreset.keyframePolicy.replace(/_/g, " ") },
      ],
      continuitySupervisor: [
        { key: "Строгость", value: config.cinematographerPreset.continuityStrictness },
        { key: "Связи", value: config.cinematographerPreset.relationMode },
      ],
      promptComposer: [
        { key: "Богатство", value: config.cinematographerPreset.textRichness },
        { key: "Язык", value: config.language },
      ],
      promptOptimizer: [
        { key: "Режим", value: "local cleanup" },
      ],
    }

    nodes.push({
      id: stageId,
      type: "pipelineStage",
      position: { x: NODE_X_START + NODE_X_GAP * (i + 1), y: NODE_Y },
      data: {
        stageId,
        label: stageId
          .replace(/([A-Z])/g, " $1")
          .trim()
          .split(" ")
          .map((w) => w[0].toUpperCase() + w.slice(1))
          .join(" "),
        description: STAGE_DESCRIPTIONS[stageId] ?? "",
        explanationPreview: explanation.whatItDoes,
        inputSummary: summary.inputSummary,
        outputSummary: summary.outputSummary,
        bibleSummary: summary.bibleSummary,
        modelId: getModel(stageId),
        accentColor: STAGE_COLORS[stageId] ?? "#888",
        status: stageStatuses[stageId],
        settings: settingsMap[stageId] ?? [],
        isSelected: selectedStage === stageId,
        dropHighlight: dropFeedback.nodeId === stageId ? dropFeedback.type : null,
        onSelect: () => onSelect(stageId),
      } satisfies PipelineStageNodeData,
    })
  })

  nodes.push({
    id: "styleNode",
    type: "pipelineStyle",
    position: { x: NODE_X_START + NODE_X_GAP * 4.65, y: SIDE_NODE_Y },
    draggable: false,
    selectable: false,
    data: {
      stylePrompt: config.stylePrompt,
    } satisfies PipelineStyleNodeData,
  })

  nodes.push({
    id: "imageGenerator",
    type: "pipelineOutput",
    position: { x: NODE_X_START + NODE_X_GAP * 7, y: NODE_Y },
    data: {
      modelId: imageGenState.model,
      status: stageStatuses.imageGenerator,
      shotCount: imageGenState.promptCount,
      generatedCount: imageGenState.generatedCount,
      generatingShotId: imageGenState.runningShotId,
      dropHighlight: dropFeedback.nodeId === "imageGenerator" ? dropFeedback.type : null,
      onSelect: () => onSelect("imageGenerator"),
    } satisfies PipelineOutputNodeData,
  })

  shotEntries.forEach((shot, index) => {
    const column = index % SHOT_NODE_COLUMNS
    const row = Math.floor(index / SHOT_NODE_COLUMNS)

    nodes.push({
      id: `shotNode-${shot.shotId}`,
      type: "pipelineShot",
      position: shotNodePositions[`shotNode-${shot.shotId}`] ?? {
        x: SHOT_NODE_START_X + column * SHOT_NODE_GAP_X,
        y: SHOT_NODE_START_Y + row * SHOT_NODE_GAP_Y,
      },
      draggable: true,
      selectable: true,
      data: {
        index,
        label: shot.label,
        actionText: shot.actionText,
        directorNote: shot.directorNote,
        operatorNote: shot.operatorNote,
        promptText: shot.promptText,
        keyframeRole: shot.keyframeRole,
        isGenerated: shot.isGenerated,
      } satisfies PipelineShotNodeData,
    })
  })

  return nodes
}

const MAIN_PIPELINE_EDGES: Edge[] = [
  { id: "e-scene-analyst", source: "sceneInput", target: "sceneAnalyst", animated: false },
  { id: "e-analyst-splitter", source: "sceneAnalyst", target: "actionSplitter", animated: false },
  { id: "e-splitter-context", source: "actionSplitter", target: "contextRouter", animated: false },
  { id: "e-context-creative", source: "contextRouter", target: "creativePlanner", animated: false },
  { id: "e-creative-censor", source: "creativePlanner", target: "censor", animated: false },
  { id: "e-censor-planner", source: "censor", target: "shotPlanner", animated: false },
  { id: "e-planner-continuity", source: "shotPlanner", target: "continuitySupervisor", animated: false },
  { id: "e-continuity-composer", source: "continuitySupervisor", target: "promptComposer", animated: false },
  { id: "e-composer-optimizer", source: "promptComposer", target: "promptOptimizer", animated: false },
  { id: "e-optimizer-image", source: "promptOptimizer", target: "imageGenerator", animated: false },
].map((e) => ({
  ...e,
  style: { stroke: "rgba(255,255,255,0.12)", strokeWidth: 1.5 },
  markerEnd: { type: "arrowclosed" as const, color: "rgba(255,255,255,0.12)" },
}))

const CONTEXT_FEED_EDGES: Edge[] = [
  {
    id: "e-bible-analyst",
    source: "bibleNode",
    target: "sceneAnalyst",
    animated: false,
    style: { stroke: "#D4A853", strokeWidth: 1.5, strokeDasharray: "5 5" },
    markerEnd: { type: "arrowclosed" as const, color: "#D4A853" },
  },
  {
    id: "e-bible-composer",
    source: "bibleNode",
    target: "promptComposer",
    animated: false,
    style: { stroke: "#D4A853", strokeWidth: 1.5, strokeDasharray: "5 5" },
    markerEnd: { type: "arrowclosed" as const, color: "#D4A853" },
  },
  {
    id: "e-style-composer",
    source: "styleNode",
    target: "promptComposer",
    animated: false,
    style: { stroke: "#8b5cf6", strokeWidth: 1.5, strokeDasharray: "5 5" },
    markerEnd: { type: "arrowclosed" as const, color: "#8b5cf6" },
  },
]

function buildCanvasEdges(
  stageStatuses: Record<PipelineStageId, PipelineStageStatus>,
  edgeLabels: Record<string, string>,
  shotEntries: CanvasShotNodeEntry[],
  options: { isRunning: boolean; isDone: boolean },
): Edge[] {
  const mainEdges = MAIN_PIPELINE_EDGES.map((edge) => {
    const sourceStatus = stageStatuses[edge.source as PipelineStageId]
    const isActive = options.isRunning && (sourceStatus === "running" || sourceStatus === "done")
    const label = options.isDone ? edgeLabels[edge.id] : undefined

    return {
      ...edge,
      animated: isActive,
      label,
      labelStyle: label
        ? {
            fill: "#E5E0DB",
            fontSize: 10,
            fontWeight: 600,
          }
        : undefined,
      labelBgStyle: label
        ? {
            fill: "rgba(18,17,15,0.92)",
            stroke: "rgba(255,255,255,0.08)",
          }
        : undefined,
      labelBgPadding: label ? ([6, 4] as [number, number]) : undefined,
      labelBgBorderRadius: label ? 6 : undefined,
      style: {
        stroke: isActive ? "#D4A853" : "rgba(255,255,255,0.12)",
        strokeWidth: isActive ? 2 : 1.5,
      },
      markerEnd: {
        type: "arrowclosed" as const,
        color: isActive ? "#D4A853" : "rgba(255,255,255,0.12)",
      },
    }
  })

  const shotEdges = shotEntries.flatMap((shot, index) => {
    const shotNodeId = `shotNode-${shot.shotId}`
    const baseStroke = shot.isGenerated ? "rgba(212,168,83,0.45)" : "rgba(255,255,255,0.14)"
    const activeStroke = shot.isGenerated ? "#D4A853" : "rgba(255,255,255,0.22)"

    return [
      {
        id: `e-composer-shot-${shot.shotId}`,
        source: "promptComposer",
        target: shotNodeId,
        animated: options.isRunning && stageStatuses.promptComposer === "running",
        label: `shot ${index + 1}`,
        labelStyle: { fill: "#E5E0DB", fontSize: 9, fontWeight: 600 },
        labelBgStyle: { fill: "rgba(18,17,15,0.92)", stroke: "rgba(255,255,255,0.08)" },
        labelBgPadding: [6, 4] as [number, number],
        labelBgBorderRadius: 6,
        style: { stroke: activeStroke, strokeWidth: 1.4 },
        markerEnd: { type: "arrowclosed" as const, color: activeStroke },
      },
      {
        id: `e-shot-image-${shot.shotId}`,
        source: shotNodeId,
        target: "imageGenerator",
        animated: false,
        style: { stroke: shot.isGenerated ? activeStroke : baseStroke, strokeWidth: 1.4, strokeDasharray: "5 5" },
        markerEnd: { type: "arrowclosed" as const, color: shot.isGenerated ? activeStroke : baseStroke },
      },
    ]
  })

  return [...mainEdges, ...CONTEXT_FEED_EDGES, ...shotEdges]
}

export default function PipelinePage() {
  const router = useRouter()
  const [isHydrated, setIsHydrated] = useState(false)
  const [sceneText, setSceneText] = useState(DEFAULT_SCENE_TEXT)
  const [selectedStage, setSelectedStage] = useState<PipelineStageId | null>(null)
  const [configNotice, setConfigNotice] = useState<string | null>(null)
  const [shotNodePositions, setShotNodePositions] = useState<Record<string, { x: number; y: number }>>({})
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const config = usePipelineStore((s) => s.activeConfig)
  const configBaseline = usePipelineStore((s) => s.configBaseline)
  const savedConfigs = usePipelineStore((s) => s.savedConfigs)
  const runState = usePipelineStore((s) => s.runState)
  const resetRun = usePipelineStore((s) => s.resetRun)
  const saveConfig = usePipelineStore((s) => s.saveConfig)
  const loadConfig = usePipelineStore((s) => s.loadConfig)
  const importConfig = usePipelineStore((s) => s.importConfig)
  const dropFeedback = usePipelineStore((s) => s.dropFeedback)
  const undo = usePipelineStore((s) => s.undo)
  const canUndo = usePipelineStore((s) => s.canUndo)
  const normalizedResult = usePipelineStore((s) => s.normalizedResult)
  const breakdownDraft = usePipelineStore((s) => s.breakdownDraft)
  const edgeLabels = usePipelineStore((s) => s.edgeLabels)
  const stageResults = usePipelineStore((s) => s.runState.stageResults)
  const runSnapshot = usePipelineStore((s) => s.runSnapshot)
  const runNotice = usePipelineStore((s) => s.runNotice)
  const imageGenModel = usePipelineStore((s) => s.imageGenModel)
  const imageGenResults = usePipelineStore((s) => s.imageGenResults)
  const imageGenRunning = usePipelineStore((s) => s.imageGenRunning)
  const characters = useBibleStore((s) => s.characters)
  const locations = useBibleStore((s) => s.locations)
  const updateBibleFromScreenplay = useBibleStore((s) => s.updateFromScreenplay)
  const characterCount = useBibleStore((s) => s.characters.length)
  const locationCount = useBibleStore((s) => s.locations.length)

  const isRunning = runState.status === "running"
  const isDone = runState.status === "done"
  const promptEntries = useMemo(() => extractPipelinePromptEntries(normalizedResult), [normalizedResult])
  const canvasShotEntries = useMemo(
    () => buildCanvasShotEntries(breakdownDraft, promptEntries),
    [breakdownDraft, promptEntries],
  )
  const isConfigDirty = useMemo(
    () => !arePipelineConfigsEqual(config, configBaseline),
    [config, configBaseline],
  )

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const blocks = buildBibleSyncBlocks(sceneText)
      const scenes = parseScenes(blocks)
      updateBibleFromScreenplay(blocks, scenes)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [sceneText, updateBibleFromScreenplay])

  const handleOpenBible = useCallback(() => {
    router.push("/bible")
  }, [router])

  const initialNodes = useMemo(
    () => buildInitialNodes(
      sceneText,
      runState.stageStatuses,
      config,
      { characterCount, locationCount },
      stageResults,
      runSnapshot,
      { characters, locations },
      {
        model: imageGenModel,
        generatedCount: Object.keys(imageGenResults).length,
        runningShotId: imageGenRunning,
        promptCount: normalizedResult?.imagePlan.orderedShots.length ?? 0,
      },
      canvasShotEntries,
      shotNodePositions,
      selectedStage,
      dropFeedback,
      handleOpenBible,
      setSelectedStage,
    ),
    [sceneText, runState.stageStatuses, config, characterCount, locationCount, stageResults, runSnapshot, characters, locations, imageGenModel, imageGenResults, imageGenRunning, normalizedResult, canvasShotEntries, shotNodePositions, selectedStage, dropFeedback, handleOpenBible],
  )

  const animatedEdges = useMemo(
    () => buildCanvasEdges(runState.stageStatuses, edgeLabels, canvasShotEntries, { isRunning, isDone }),
    [runState.stageStatuses, edgeLabels, canvasShotEntries, isRunning, isDone],
  )

  const [nodes, setNodes] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(animatedEdges)

  const handleNodesChange = useCallback((changes: NodeChange<Node>[]) => {
    setNodes((currentNodes) => applyNodeChanges(changes, currentNodes))

    setShotNodePositions((currentPositions) => {
      let nextPositions = currentPositions

      changes.forEach((change) => {
        if (change.type !== "position" || !change.id.startsWith("shotNode-") || !change.position) {
          return
        }

        if (nextPositions === currentPositions) {
          nextPositions = { ...currentPositions }
        }

        nextPositions[change.id] = change.position
      })

      return nextPositions
    })
  }, [setNodes])

  // Sync nodes when config/status changes
  useEffect(() => {
    setNodes(initialNodes)
  }, [initialNodes, setNodes])

  useEffect(() => {
    setEdges(animatedEdges)
  }, [animatedEdges, setEdges])

  const handleRunBreakdown = useCallback(async () => {
    if (!sceneText.trim() || isRunning) return
    try {
      await runPipelineBreakdown(sceneText)
    } catch {
      // Error is already tracked in store via failRun
    }
  }, [sceneText, isRunning])

  const handleComposePrompts = useCallback(async () => {
    if (!breakdownDraft || isRunning) return
    try {
      await composePipelinePrompts()
    } catch {
      // Error is already tracked in store via failRun
    }
  }, [breakdownDraft, isRunning])

  const handleReset = useCallback(() => {
    resetRun()
  }, [resetRun])

  const handleSave = useCallback(() => {
    const name = config.name === "Default Pipeline"
      ? `Config ${new Date().toLocaleString("ru-RU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
      : config.name
    saveConfig(name)
    setConfigNotice(`Snapshot saved: ${name}`)
  }, [config.name, saveConfig])

  const handleExport = useCallback(() => {
    const blob = new Blob([serializeConfigExport(config)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    const safeName = config.name.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "pipeline-config"
    anchor.href = url
    anchor.download = `${safeName}.pipeline.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setConfigNotice(`Config exported: ${config.name}`)
  }, [config])

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImportFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const rawText = await file.text()
      const imported = parseImportedConfigPayload(rawText)
      importConfig(imported)
      setConfigNotice(`Config imported: ${imported.name}`)
    } catch (error) {
      setConfigNotice(error instanceof Error ? error.message : "Import failed")
    } finally {
      event.target.value = ""
    }
  }, [importConfig])

  const handleLoadSavedConfig = useCallback((id: string) => {
    if (!id) return
    loadConfig(id)
    const loaded = savedConfigs.find((item) => item.id === id)
    if (loaded) {
      setConfigNotice(`Loaded snapshot: ${loaded.name}`)
    }
  }, [loadConfig, savedConfigs])

  useEffect(() => {
    if (!configNotice) return
    const timer = window.setTimeout(() => setConfigNotice(null), 2800)
    return () => window.clearTimeout(timer)
  }, [configNotice])

  // Detect which preset type is being dragged
  const detectDragType = useCallback((dt: DataTransfer): PresetDropType | null => {
    if (dt.types.includes("application/koza-director-preset")) return "director"
    if (dt.types.includes("application/koza-dp-preset")) return "cinematographer"
    if (dt.types.includes("application/koza-pipeline-config")) return "config"
    return null
  }, [])

  // Find which node the cursor is over based on position
  const findNodeUnderCursor = useCallback(
    (clientX: number, clientY: number): PipelineStageId | "canvas" => {
      const el = document.elementFromPoint(clientX, clientY)
      const nodeEl = el?.closest("[data-id]") as HTMLElement | null
      if (nodeEl) {
        const id = nodeEl.getAttribute("data-id")
        if (id && isPipelineStageId(id)) return id
      }
      return "canvas"
    },
    [],
  )

  // Drop handler with context-dependent validation
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const store = usePipelineStore.getState()
      store.clearDropFeedback()

      const presetType = detectDragType(event.dataTransfer)
      if (!presetType) return

      const targetNode = findNodeUnderCursor(event.clientX, event.clientY)
      const valid = isValidDropTarget(presetType, targetNode)

      if (!valid) {
        store.setDropFeedback({
          nodeId: targetNode === "canvas" ? null : targetNode,
          type: "invalid",
          timestamp: Date.now(),
        })
        setTimeout(() => store.clearDropFeedback(), 800)
        return
      }

      // Show success pulse
      store.setDropFeedback({
        nodeId: targetNode === "canvas" ? null : targetNode,
        type: "pulse",
        timestamp: Date.now(),
      })
      setTimeout(() => store.clearDropFeedback(), 600)

      if (presetType === "director") {
        try {
          const preset = JSON.parse(event.dataTransfer.getData("application/koza-director-preset"))
          store.applyDirectorPreset(preset)
        } catch { /* ignore */ }
      } else if (presetType === "cinematographer") {
        try {
          const preset = JSON.parse(event.dataTransfer.getData("application/koza-dp-preset"))
          store.applyCinematographerPreset(preset)
        } catch { /* ignore */ }
      } else if (presetType === "config") {
        try {
          const parsed = JSON.parse(event.dataTransfer.getData("application/koza-pipeline-config"))
          if (parsed.id) store.loadConfig(parsed.id)
          else store.applyFullConfig(parsed)
        } catch { /* ignore */ }
      }
    },
    [detectDragType, findNodeUnderCursor],
  )

  const handleDragOver = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const presetType = detectDragType(event.dataTransfer)
      if (!presetType) return

      const targetNode = findNodeUnderCursor(event.clientX, event.clientY)
      const valid = isValidDropTarget(presetType, targetNode)
      event.dataTransfer.dropEffect = valid ? "copy" : "none"

      usePipelineStore.getState().setDropFeedback({
        nodeId: targetNode === "canvas" ? null : targetNode,
        type: valid ? "valid" : "invalid",
        timestamp: Date.now(),
      })
    },
    [detectDragType, findNodeUnderCursor],
  )

  const handleDragLeave = useCallback(() => {
    usePipelineStore.getState().clearDropFeedback()
  }, [])

  if (!isHydrated) {
    return (
      <div className="flex h-screen w-screen flex-col bg-[#0E0D0B]">
        <header className="flex items-center gap-3 border-b border-white/8 bg-[#12110F] px-4 py-2">
          <button
            onClick={() => router.back()}
            className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/70"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-[13px] font-semibold tracking-[0.06em] text-[#E5E0DB]">
            Конфигуратор Пайплайна
          </h1>
        </header>

        <div className="flex flex-1 items-center justify-center">
          <div className="rounded-xl border border-white/8 bg-[#12110F]/90 px-4 py-3 text-[11px] text-white/35 backdrop-blur-lg">
            Загружаю pipeline workspace...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0E0D0B]">
      {/* ─── Header ─── */}
      <header className="flex items-center gap-3 border-b border-white/8 bg-[#12110F] px-4 py-2">
        <button
          onClick={() => router.back()}
          className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/70"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <h1 className="text-[13px] font-semibold tracking-[0.06em] text-[#E5E0DB]">
          Конфигуратор Пайплайна
        </h1>

        <button
          onClick={handleOpenBible}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#D4A853]/20 bg-[#D4A853]/8 px-2.5 py-1.5 text-[11px] font-medium text-[#D4A853] transition-colors hover:bg-[#D4A853]/14"
          title="Открыть Bible"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Bible
        </button>

        <div className="flex items-center gap-2 rounded-md border border-white/8 bg-white/3 px-2.5 py-1">
          <div className={`h-1.5 w-1.5 rounded-full ${isConfigDirty ? "bg-amber-400" : "bg-emerald-400"}`} />
          <div className="flex flex-col">
            <span className="text-[10px] font-medium text-[#E5E0DB]">{config.name}</span>
            <span className="text-[9px] text-white/35">{isConfigDirty ? "Unsaved changes" : "Snapshot aligned"}</span>
          </div>
        </div>

        {/* Scene input */}
        <div className="ml-4 flex-1">
          <textarea
            className="h-9 w-full resize-none rounded-md border border-white/8 bg-white/3 px-3 py-2 text-[12px] text-[#E5E0DB] outline-none transition-colors placeholder:text-white/20 focus:border-[#D4A853]/40"
            placeholder="Вставьте текст сцены…"
            value={sceneText}
            onChange={(e) => setSceneText(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <select
            className="max-w-44 rounded-md border border-white/8 bg-white/3 px-2.5 py-1.5 text-[11px] text-[#E5E0DB] outline-none transition-colors focus:border-[#D4A853]/40"
            value={savedConfigs.some((item) => item.id === config.id) ? config.id : ""}
            onChange={(e) => handleLoadSavedConfig(e.target.value)}
          >
            <option value="">Snapshots</option>
            {savedConfigs.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <button
            onClick={undo}
            disabled={!canUndo()}
            className="rounded-md border border-white/8 p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/60 disabled:cursor-not-allowed disabled:opacity-25"
            title="Отменить (пресет)"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleReset}
            className="rounded-md border border-white/8 p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/60"
            title="Сброс"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleSave}
            className="rounded-md border border-white/8 p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/60"
            title="Сохранить конфиг"
          >
            <Save className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleExport}
            className="rounded-md border border-white/8 p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/60"
            title="Экспортировать конфиг"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleImportClick}
            className="rounded-md border border-white/8 p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/60"
            title="Импортировать конфиг"
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleRunBreakdown}
            disabled={!sceneText.trim() || isRunning}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/12 px-4 py-1.5 text-[12px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" />
            {isRunning && runState.currentStage !== "promptComposer" ? "Этап 1…" : breakdownDraft ? "Этап 1 заново" : "Этап 1: Breakdown"}
          </button>
          <button
            onClick={handleComposePrompts}
            disabled={!breakdownDraft || isRunning}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#D4A853]/30 bg-[#D4A853]/12 px-4 py-1.5 text-[12px] font-semibold text-[#D4A853] transition-colors hover:bg-[#D4A853]/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {isRunning && runState.currentStage === "promptComposer" ? "Этап 2…" : normalizedResult ? "Этап 2 заново" : "Этап 2: Prompts"}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleImportFile}
        />
      </header>

      {/* ─── Body ─── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Preset Library */}
        <PresetLibrary
          activeDirectorId={config.directorPreset.id}
          activeCinematographerId={config.cinematographerPreset.id}
        />

        {/* Center: ReactFlow Canvas */}
        <div
          className="flex-1"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.4}
            maxZoom={1.5}
            panOnDrag={[1]}
            panOnScroll
            zoomOnPinch
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="rgba(141,126,109,0.15)"
            />
            <MiniMap
              nodeColor={() => "rgba(212,168,83,0.4)"}
              maskColor="rgba(14,13,11,0.85)"
              style={{
                background: "rgba(18,17,15,0.9)",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            />
          </ReactFlow>
        </div>

        {/* Right: Inspector Panel */}
        <InspectorPanel
          selectedStage={selectedStage}
          onClose={() => setSelectedStage(null)}
        />
      </div>

      {/* ─── Bottom: Results Preview ─── */}
      <ResultsPreview result={normalizedResult} isRunning={isRunning} />

      {/* Run error toast */}
      {runState.status === "error" && runState.error && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-red-500/20 bg-red-950/90 px-4 py-2 text-[11px] text-red-300 shadow-lg backdrop-blur">
          {runState.error}
        </div>
      )}

      {runNotice && (
        <div className="fixed bottom-16 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-[#D4A853]/25 bg-[#2A2215]/90 px-4 py-2 text-[11px] text-[#E5D1A1] shadow-lg backdrop-blur">
          {runNotice}
        </div>
      )}

      {breakdownDraft && !normalizedResult && runState.status !== "error" && (
        <div className="fixed bottom-16 right-4 z-40 rounded-lg border border-cyan-500/20 bg-cyan-950/70 px-3 py-2 text-[11px] text-cyan-100 shadow-lg backdrop-blur">
          Этап 1 готов. Отредактируйте breakdown ниже и запустите Этап 2.
        </div>
      )}

      {configNotice && (
        <div className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-white/10 bg-[#171512]/95 px-4 py-2 text-[11px] text-[#E5E0DB] shadow-lg backdrop-blur">
          {configNotice}
        </div>
      )}
    </div>
  )
}
