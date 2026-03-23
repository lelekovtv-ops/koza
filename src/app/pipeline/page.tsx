"use client"

import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  useEdgesState,
  useNodesState,
  type NodeTypes,
  type Edge,
  type Node,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { ArrowLeft, Play, Save, RotateCcw, Undo2 } from "lucide-react"

import PipelineSceneNode from "@/components/pipeline/PipelineSceneNode"
import PipelineStageNode from "@/components/pipeline/PipelineStageNode"
import PipelineOutputNode from "@/components/pipeline/PipelineOutputNode"
import PresetLibrary from "@/components/pipeline/PresetLibrary"
import InspectorPanel from "@/components/pipeline/InspectorPanel"
import ResultsPreview from "@/components/pipeline/ResultsPreview"

import { usePipelineStore } from "@/store/pipeline"
import { runPipeline } from "@/lib/pipeline/runner"
import { isValidDropTarget } from "@/lib/pipeline/presetMerge"
import type { PipelineStageId, PipelineStageStatus, PresetDropType } from "@/types/pipeline"
import type { PipelineStageNodeData } from "@/components/pipeline/PipelineStageNode"
import type { PipelineSceneNodeData } from "@/components/pipeline/PipelineSceneNode"
import type { PipelineOutputNodeData } from "@/components/pipeline/PipelineOutputNode"

const nodeTypes: NodeTypes = {
  pipelineScene: PipelineSceneNode,
  pipelineStage: PipelineStageNode,
  pipelineOutput: PipelineOutputNode,
}

// Stage accent colors from TZ
const STAGE_COLORS: Record<string, string> = {
  sceneAnalyst: "#8b5cf6",    // Фиолетовый
  actionSplitter: "#8b5cf6",  // Фиолетовый
  shotPlanner: "#d97706",     // Янтарный
  continuitySupervisor: "#06b6d4", // Бирюзовый
  promptComposer: "#f97316",  // Коралловый
  imageGenerator: "#10b981",  // Зелёный
}

const STAGE_DESCRIPTIONS: Record<string, string> = {
  sceneAnalyst: "AI-анализ драматургии",
  actionSplitter: "Разбивка на действия",
  shotPlanner: "Планирование кадров",
  continuitySupervisor: "Проверка непрерывности",
  promptComposer: "Компоновка промптов",
}

// Fixed horizontal layout positions
const NODE_X_START = 40
const NODE_X_GAP = 280
const NODE_Y = 160

function buildInitialNodes(
  sceneText: string,
  stageStatuses: Record<PipelineStageId, PipelineStageStatus>,
  config: ReturnType<typeof usePipelineStore.getState>["activeConfig"],
  dropFeedback: { nodeId: string | null; type: "valid" | "invalid" | "pulse" | null },
  onSelect: (stageId: PipelineStageId) => void,
): Node[] {
  const getModel = (stageId: PipelineStageId) =>
    config.stageModels.find((sm) => sm.stageId === stageId)?.modelId ?? "—"

  const stageIds: PipelineStageId[] = [
    "sceneAnalyst",
    "actionSplitter",
    "shotPlanner",
    "continuitySupervisor",
    "promptComposer",
  ]

  const nodes: Node[] = [
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
    const settingsMap: Record<string, Array<{ key: string; value: string }>> = {
      sceneAnalyst: [
        { key: "Фокус", value: config.directorPreset.emotionalFocus.slice(0, 25) || "—" },
      ],
      actionSplitter: [
        { key: "Плотность", value: config.directorPreset.dramaticDensity },
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
        modelId: getModel(stageId),
        accentColor: STAGE_COLORS[stageId] ?? "#888",
        status: stageStatuses[stageId],
        settings: settingsMap[stageId] ?? [],
        dropHighlight: dropFeedback.nodeId === stageId ? dropFeedback.type : null,
        onSelect: () => onSelect(stageId),
      } satisfies PipelineStageNodeData,
    })
  })

  nodes.push({
    id: "imageGenerator",
    type: "pipelineOutput",
    position: { x: NODE_X_START + NODE_X_GAP * 6, y: NODE_Y },
    data: {
      modelId: getModel("imageGenerator"),
      status: stageStatuses.imageGenerator,
      shotCount: 0,
      dropHighlight: dropFeedback.nodeId === "imageGenerator" ? dropFeedback.type : null,
      onSelect: () => onSelect("imageGenerator"),
    } satisfies PipelineOutputNodeData,
  })

  return nodes
}

const PIPELINE_EDGES: Edge[] = [
  { id: "e-scene-analyst", source: "sceneInput", target: "sceneAnalyst", animated: false },
  { id: "e-analyst-splitter", source: "sceneAnalyst", target: "actionSplitter", animated: false },
  { id: "e-splitter-planner", source: "actionSplitter", target: "shotPlanner", animated: false },
  { id: "e-planner-continuity", source: "shotPlanner", target: "continuitySupervisor", animated: false },
  { id: "e-continuity-composer", source: "continuitySupervisor", target: "promptComposer", animated: false },
  { id: "e-composer-image", source: "promptComposer", target: "imageGenerator", animated: false },
].map((e) => ({
  ...e,
  style: { stroke: "rgba(255,255,255,0.12)", strokeWidth: 1.5 },
  markerEnd: { type: "arrowclosed" as const, color: "rgba(255,255,255,0.12)" },
}))

export default function PipelinePage() {
  const router = useRouter()
  const [sceneText, setSceneText] = useState("")
  const [selectedStage, setSelectedStage] = useState<PipelineStageId | null>(null)

  const config = usePipelineStore((s) => s.activeConfig)
  const runState = usePipelineStore((s) => s.runState)
  const resetRun = usePipelineStore((s) => s.resetRun)
  const saveConfig = usePipelineStore((s) => s.saveConfig)
  const dropFeedback = usePipelineStore((s) => s.dropFeedback)
  const undo = usePipelineStore((s) => s.undo)
  const canUndo = usePipelineStore((s) => s.canUndo)
  const normalizedResult = usePipelineStore((s) => s.normalizedResult)

  const isRunning = runState.status === "running"
  const isDone = runState.status === "done"

  const initialNodes = useMemo(
    () => buildInitialNodes(sceneText, runState.stageStatuses, config, dropFeedback, setSelectedStage),
    [sceneText, runState.stageStatuses, config, dropFeedback],
  )

  const animatedEdges = useMemo(() => {
    if (!isRunning) return PIPELINE_EDGES
    return PIPELINE_EDGES.map((e) => {
      const sourceStatus = runState.stageStatuses[e.source as PipelineStageId]
      const isActive = sourceStatus === "running" || sourceStatus === "done"
      return {
        ...e,
        animated: isActive,
        style: {
          stroke: isActive ? "#D4A853" : "rgba(255,255,255,0.12)",
          strokeWidth: isActive ? 2 : 1.5,
        },
      }
    })
  }, [isRunning, runState.stageStatuses])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(animatedEdges)

  // Sync nodes when config/status changes
  useMemo(() => {
    setNodes(initialNodes)
  }, [initialNodes, setNodes])

  useMemo(() => {
    setEdges(animatedEdges)
  }, [animatedEdges, setEdges])

  const handleRun = useCallback(async () => {
    if (!sceneText.trim() || isRunning) return
    try {
      await runPipeline(sceneText)
    } catch {
      // Error is already tracked in store via failRun
    }
  }, [sceneText, isRunning])

  const handleReset = useCallback(() => {
    resetRun()
  }, [resetRun])

  const handleSave = useCallback(() => {
    const name = `Config ${new Date().toLocaleString("ru-RU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
    saveConfig(name)
  }, [saveConfig])

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
        const id = nodeEl.getAttribute("data-id") as PipelineStageId | null
        if (id) return id
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

        {/* Scene input */}
        <div className="ml-4 flex-1">
          <textarea
            className="h-[36px] w-full resize-none rounded-md border border-white/8 bg-white/3 px-3 py-2 text-[12px] text-[#E5E0DB] outline-none transition-colors placeholder:text-white/20 focus:border-[#D4A853]/40"
            placeholder="Вставьте текст сцены…"
            value={sceneText}
            onChange={(e) => setSceneText(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
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
            onClick={handleRun}
            disabled={!sceneText.trim() || isRunning}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/12 px-4 py-1.5 text-[12px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" />
            {isRunning ? "Запуск…" : isDone ? "Перезапуск" : "Запуск"}
          </button>
        </div>
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
            onNodesChange={onNodesChange}
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
    </div>
  )
}
