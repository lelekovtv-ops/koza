"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react"
import Link from "next/link"
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
  type NodeTypes,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Bot,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Image as ImageIcon,
  type LucideIcon,
  Play,
  Plus,
  Sparkles,
  ScanSearch,
  Trash2,
  Type,
  WandSparkles,
  X,
} from "lucide-react"
import { useBibleStore } from "@/store/bible"
import { useLibraryStore, type LibraryFile } from "@/store/library"
import { useProjectsStore } from "@/store/projects"
import { useProjectProfilesStore } from "@/store/projectProfiles"
import { trySaveBlob } from "@/lib/fileStorage"

import {
  buildConnectionLabel,
  canConnectNodes,
  compileGeneratorFromGraph,
  compilePromptFromGraph,
  CONFIGURATOR_TEMPLATES,
  createConfiguratorTemplate,
} from "@/lib/configurator/graph"
import { CONFIGURATOR_AGENT_RULE_SUMMARY } from "@/lib/configurator/agent"
import {
  applyKozaDirectingDefaults,
  getKozaDirectingMissingTitles,
  getLucBessonMissingTitles,
  getTemplate777MissingTitles,
  isLucBessonGraph,
  isKozaDirectingMvpGraph,
  isTemplate777Graph,
  runKozaDirectingMvp,
  runLucBessonTemplate,
  runTemplate777PrePrompt,
  type KozaDirectingStageName,
} from "@/lib/configurator/kozaDirectingMvp"
import type { ImageGenModel } from "@/lib/pipeline/imageGenerator"
import type {
  AiNodeMode,
  CompiledGeneratorRequest,
  CompiledPromptResult,
  ConfiguratorAiNodeData,
  ConfiguratorFlowEdge,
  ConfiguratorFlowNode,
  ConfiguratorGeneratorNodeData,
  ConfiguratorNodeData,
  ConfiguratorNodeKind,
  ConfiguratorOutputNodeData,
  ConfiguratorPhotoNodeData,
  ConfiguratorPromptNodeData,
  ConfiguratorTemplateId,
  ConfiguratorTemplateMeta,
} from "@/types/configurator"

const graphSeed = createConfiguratorTemplate("default_directing")
const CUSTOM_TEMPLATES_STORAGE_KEY = "koza-configurator-custom-templates-v1"
const CONFIGURATOR_WORKSPACE_DB = "koza-configurator-workspace-db"
const CONFIGURATOR_WORKSPACE_STORE = "workspace"
const CONFIGURATOR_WORKSPACE_KEY = "sandbox-v1"

const handleStyle = {
  width: 12,
  height: 12,
  borderRadius: 999,
  background: "#171513",
  border: "1.5px solid rgba(255,255,255,0.35)",
}

const KIND_META: Record<ConfiguratorNodeKind, { label: string; color: string; icon: LucideIcon; io: string }> = {
  photo: { label: "Photo Node", color: "#3b82f6", icon: ImageIcon, io: "source only" },
  prompt: { label: "Prompt Node", color: "#f59e0b", icon: Type, io: "source only" },
  ai: { label: "AI Node", color: "#10b981", icon: Bot, io: "source + transform" },
  generator: { label: "Generator Node", color: "#8b5cf6", icon: WandSparkles, io: "terminal" },
  output: { label: "Output Node", color: "#e11d48", icon: ScanSearch, io: "terminal" },
}

const fieldClassName = "w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-[#E7E1DB] outline-none transition-colors placeholder:text-white/20 focus:border-[#D4A853]/35"
const ACTIVITY_COLORS = {
  idle: "rgba(255,255,255,0.08)",
  active: "rgba(212,168,83,0.45)",
  completed: "rgba(16,185,129,0.35)",
} as const

type NodeActivityState = "idle" | "active" | "completed"

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createNodeData(kind: ConfiguratorNodeKind): ConfiguratorNodeData {
  switch (kind) {
    case "photo":
      return {
        kind,
        title: "Photo Node",
        imageUrl: "",
        caption: "",
        lockedDetails: "",
      }
    case "prompt":
      return {
        kind,
        title: "Prompt Node",
        promptText: "",
        detailHints: "",
      }
    case "ai":
      return {
        kind,
        title: "AI Node",
        roleLabel: "Prompt AI",
        mode: "merge",
        instruction: "Merge incoming nodes into a coherent image prompt while keeping every concrete detail.",
      }
    case "generator":
      return {
        kind,
        title: "Image Generator",
        system: "gpt-image",
      }
    case "output":
      return {
        kind,
        title: "Output Node",
        previewPrompt: "",
        sourceCount: 0,
        imageUrl: "",
      }
  }
}

function getBessonGeneratedShotLabel(title: string): string {
  return title
    .replace(/ Director Block$/, "")
    .replace(/ Image Prompt$/, "")
    .replace(/ REF DISTRIBUTOR$/, "")
    .replace(/ Generator$/, "")
    .replace(/ Output$/, "")
    .replace(/ Image$/, "")
    .trim()
}

function ConfiguratorCanvasNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ConfiguratorNodeData
  const meta = KIND_META[nodeData.kind]
  const Icon = meta.icon
  const activityState = (nodeData.activityState as NodeActivityState | undefined) ?? "idle"
  const outputImageUrl = nodeData.kind === "output" ? nodeData.imageUrl?.trim() ?? "" : ""
  const isVisualImageOutput = Boolean(outputImageUrl)
  const isGeneratorNode = nodeData.kind === "generator"

  let summary = ""

  if (nodeData.kind === "photo") {
    summary = nodeData.caption || "Reference anchor"
  }

  if (nodeData.kind === "prompt") {
    summary = nodeData.promptText || "Text fragment"
  }

  if (nodeData.kind === "ai") {
    summary = `${nodeData.roleLabel} · ${nodeData.mode}`
  }

  if (nodeData.kind === "generator") {
    summary = nodeData.requestPreview || `System: ${nodeData.system}`
  }

  if (nodeData.kind === "output") {
    summary = outputImageUrl || nodeData.previewPrompt
      ? outputImageUrl
        ? "Rendered image preview"
        : nodeData.previewPrompt || ""
      : "Connect nodes to generate final prompt"
  }

  const canReceive = nodeData.kind === "ai" || nodeData.kind === "generator" || nodeData.kind === "output"
  const canSend = nodeData.kind === "photo" || nodeData.kind === "prompt" || nodeData.kind === "ai"

  return (
    <div
      className={`relative ${isGeneratorNode ? "w-104" : isVisualImageOutput ? "w-80" : "w-72"} rounded-2xl border bg-[#171513]/95 shadow-[0_20px_50px_rgba(0,0,0,0.28)] transition-all duration-300 ${selected ? "border-white/20" : "border-white/8"} ${activityState === "active" ? "scale-[1.01] shadow-[0_0_0_1px_rgba(212,168,83,0.2),0_24px_60px_rgba(212,168,83,0.18)]" : ""}`}
      style={{ boxShadow: activityState === "completed" ? "0 0 0 1px rgba(16,185,129,0.16), 0 20px 50px rgba(0,0,0,0.28)" : undefined }}
    >
      {activityState !== "idle" ? (
        <div className={`pointer-events-none absolute inset-0 rounded-2xl ${activityState === "active" ? "animate-pulse" : ""}`} style={{ boxShadow: `inset 0 0 0 1px ${ACTIVITY_COLORS[activityState]}` }} />
      ) : null}
      {canReceive ? <Handle type="target" position={Position.Left} style={handleStyle} /> : null}
      {canSend ? <Handle type="source" position={Position.Right} style={handleStyle} /> : null}

      <div className="h-1 rounded-t-2xl" style={{ background: meta.color }} />
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5">
          <Icon className="h-4 w-4" style={{ color: meta.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-white/85">{meta.label}</p>
          <p className="truncate text-sm text-[#E7E1DB]">{nodeData.title}</p>
        </div>
        {activityState !== "idle" ? (
          <span className={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] ${activityState === "active" ? "bg-[#D4A853]/20 text-[#F2E7CB]" : "bg-emerald-500/16 text-emerald-100"}`}>
            {activityState === "active" ? "live" : "done"}
          </span>
        ) : null}
      </div>

      {nodeData.kind === "photo" && nodeData.imageUrl ? (
        <div className="px-4">
          <img src={nodeData.imageUrl} alt={nodeData.title} className="h-28 w-full rounded-xl border border-white/10 object-cover" />
        </div>
      ) : null}

      {nodeData.kind === "output" && outputImageUrl ? (
        <div className="px-4">
          <img src={outputImageUrl} alt={nodeData.title} className="aspect-video w-full rounded-xl border border-white/10 object-cover" />
        </div>
      ) : null}

      {nodeData.kind === "generator" ? (
        <div className="space-y-3 px-4 pb-1">
          {(nodeData.shotActionText || nodeData.shotDirectorNote || nodeData.shotCameraNote) ? (
            <div className="grid gap-2 rounded-xl border border-white/8 bg-black/20 p-3">
              {nodeData.shotActionText ? (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/32">Action</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-white/74">{nodeData.shotActionText}</p>
                </div>
              ) : null}
              {nodeData.shotDirectorNote ? (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/32">Director Intent</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-white/74">{nodeData.shotDirectorNote}</p>
                </div>
              ) : null}
              {nodeData.shotCameraNote ? (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/32">Camera Vision</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-white/74">{nodeData.shotCameraNote}</p>
                </div>
              ) : null}
              {nodeData.shotVisualDescription ? (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/32">Visible Frame</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-white/74">{nodeData.shotVisualDescription}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-xl border border-white/8 bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/32">Final Shot Prompt</p>
            <p className="mt-2 line-clamp-6 text-[12px] leading-relaxed text-white/74">
              {nodeData.requestPreview?.trim() || "Connect upstream prompt nodes to prepare the last prompt for this shot."}
            </p>
          </div>

          <div className="rounded-xl border border-white/8 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/32">Linked Images</p>
              <span className="text-[10px] text-white/38">{nodeData.referencePreviews?.length ?? 0}</span>
            </div>
            {nodeData.referencePreviews && nodeData.referencePreviews.length > 0 ? (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {nodeData.referencePreviews.map((reference) => (
                  <div key={reference.id} className="w-20 shrink-0">
                    <img src={reference.imageUrl} alt={reference.title} className="h-16 w-full rounded-lg border border-white/10 object-cover" />
                    <p className="mt-1 truncate text-[10px] text-white/48">{reference.title}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[11px] leading-relaxed text-white/44">
                If you connect a photo node here, it will be used as a visual reference for generation.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => nodeData.onGenerate?.()}
            disabled={!nodeData.canGenerate || nodeData.generationStatus === "running"}
            className="w-full rounded-xl border border-[#8b5cf6]/35 bg-[#8b5cf6]/18 px-3 py-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#F2EAFE] transition-colors hover:bg-[#8b5cf6]/24 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {nodeData.generationStatus === "running"
              ? "Generating Image..."
              : nodeData.generatedImageUrl
                ? "Generate Again"
                : "Generate Image"}
          </button>

          {nodeData.generationError ? (
            <div className="rounded-xl border border-red-500/18 bg-red-950/35 px-3 py-2 text-[12px] leading-relaxed text-red-100/88">
              {nodeData.generationError}
            </div>
          ) : null}

          {nodeData.generatedImageUrl ? (
            <div className="rounded-xl border border-white/8 bg-black/20 p-2">
              <img src={nodeData.generatedImageUrl} alt={`${nodeData.title} result`} className="aspect-video w-full rounded-lg border border-white/10 object-cover" />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-white/28">Summary</p>
          <span className="rounded-full border border-white/8 bg-white/4 px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-white/36">
            {meta.io}
          </span>
        </div>
        <p className="mt-1 line-clamp-4 text-[12px] leading-relaxed text-white/62">{summary}</p>
      </div>

      <div className="border-t border-white/6 px-4 py-2 text-[10px] text-white/34">
        {canSend && canReceive ? "Drag from right handle to connect, receive on left handle." : canSend ? "Drag from the right handle to connect this source." : "Drop incoming links on the left handle."}
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  configNode: ConfiguratorCanvasNode,
}

const applyConfiguratorNodeChanges = applyNodeChanges as unknown as (
  changes: NodeChange[],
  nodes: ConfiguratorFlowNode[],
) => ConfiguratorFlowNode[]

type CustomConfiguratorTemplate = {
  id: string
  label: string
  description: string
  nodes: ConfiguratorFlowNode[]
  edges: ConfiguratorFlowEdge[]
}

function cloneNodes(nodes: ConfiguratorFlowNode[]): ConfiguratorFlowNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: { ...node.position },
    data: { ...node.data },
  }))
}

function cloneEdges(edges: ConfiguratorFlowEdge[]): ConfiguratorFlowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: edge.animated,
  }))
}

function clearNodeTextContent(data: ConfiguratorNodeData): ConfiguratorNodeData {
  switch (data.kind) {
    case "photo":
      return {
        ...data,
        caption: "",
        lockedDetails: "",
      }
    case "prompt":
      return {
        ...data,
        promptText: "",
        detailHints: "",
      }
    case "ai":
      return {
        ...data,
        roleLabel: "",
        instruction: "",
      }
    case "generator":
      return {
        ...data,
        requestPreview: "",
      }
    case "output":
      return {
        ...data,
        previewPrompt: "",
      }
  }
}

type DirectorVisionShot = {
  shotId: string
  label: string
  shotType: string
  shotSize: string
  composition: string
  cameraMotion: string
  shotDescription: string
  actionText: string
  directorNote: string
  cameraNote: string
  visualDescription: string
  continuityNote: string
}

type DirectorVisionPacket = {
  philosophy: string
  emotionalAxis: string
  rhythmStrategy: string
  directorNotes: string[]
  stagingPrinciples: string[]
  visualRules: string[]
  continuityRules: string[]
  recommendedNextStep: string
  shots: DirectorVisionShot[]
}

type BessonShot = {
  shotId: string
  label: string
  actionText: string
  directorNote: string
  cameraNote: string
  visualDescription: string
  shotDescription: string
  shotSize: string
  composition: string
  cameraMotion: string
  emotionalGoal: string
  actionState: string
  backgroundLock: string
}

type BessonShotPacket = {
  sceneStyle: string
  sceneLogic: string
  locationLock: string
  shotCount: number
  shots: BessonShot[]
}

type BessonPromptShot = BessonShot & {
  imagePrompt: string
  selectedRefTitles: string[]
  maxRefCount: number
  refReason: string
}

type BessonPromptPack = {
  sceneBase: string
  lightLock: string
  styleLock: string
  validationNotes: string[]
  shots: BessonPromptShot[]
}

type ShotGenerationResult = {
  imageUrl: string
  prompt: string
  model: ImageGenModel
}

type GeneratorReferencePreview = {
  id: string
  title: string
  imageUrl: string
}

type PersistedConfiguratorWorkspaceState = {
  version: 1
  activeTemplateId: string
  selectedNodeId: string | null
  nodes: ConfiguratorFlowNode[]
  edges: ConfiguratorFlowEdge[]
  runtimeOutputs: Partial<Record<KozaDirectingStageName, string>>
  runStatus: "idle" | "running" | "done" | "error"
  runMessage: string
  runModelId: string
  templateDraftName: string
  templateDraftDescription: string
  shotGenerationResults: Record<string, ShotGenerationResult>
}

const GENERATED_BESSON_NODE_PREFIX = "besson-generated-"

function isGeneratedBessonNodeId(nodeId: string): boolean {
  return nodeId.startsWith(GENERATED_BESSON_NODE_PREFIX)
}

function isGeneratedBessonNode(node: ConfiguratorFlowNode): boolean {
  return isGeneratedBessonNodeId(node.id)
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => toStringValue(item)).filter(Boolean)
  }

  const single = toStringValue(value)
  return single ? [single] : []
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function parseRuntimeOutput<T>(value: string | null | undefined): T | null {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function deriveDirectorVisionPacket(value: string | null | undefined): DirectorVisionPacket | null {
  const packet = parseRuntimeOutput<Record<string, unknown>>(value)
  if (!packet) {
    return null
  }

  const rawShots = Array.isArray(packet.shots) ? packet.shots : []
  const shots = rawShots
    .map((entry, index) => {
      const shot = toRecord(entry)
      if (!shot) {
        return null
      }

      return {
        shotId: toStringValue(shot.shot_id) || `shot-${index + 1}`,
        label: toStringValue(shot.label) || `Shot ${index + 1}`,
        shotType: toStringValue(shot.shot_type),
        shotSize: toStringValue(shot.shot_size),
        composition: toStringValue(shot.composition),
        cameraMotion: toStringValue(shot.camera_motion),
        shotDescription: toStringValue(shot.shot_description),
        actionText: toStringValue(shot.action_text),
        directorNote: toStringValue(shot.director_note),
        cameraNote: toStringValue(shot.camera_note),
        visualDescription: toStringValue(shot.visual_description),
        continuityNote: toStringValue(shot.continuity_note),
      } satisfies DirectorVisionShot
    })
    .filter((entry): entry is DirectorVisionShot => Boolean(entry))

  return {
    philosophy: toStringValue(packet.philosophy),
    emotionalAxis: toStringValue(packet.emotional_axis),
    rhythmStrategy: toStringValue(packet.rhythm_strategy),
    directorNotes: toStringArray(packet.director_notes),
    stagingPrinciples: toStringArray(packet.staging_principles),
    visualRules: toStringArray(packet.visual_rules),
    continuityRules: toStringArray(packet.continuity_rules),
    recommendedNextStep: toStringValue(packet.recommended_next_step),
    shots,
  }
}

function deriveBessonShotPacket(value: string | null | undefined): BessonShotPacket | null {
  const packet = parseRuntimeOutput<Record<string, unknown>>(value)
  if (!packet) {
    return null
  }

  const rawShots = Array.isArray(packet.shots) ? packet.shots : []
  const shots = rawShots
    .map((entry, index) => {
      const shot = toRecord(entry)
      if (!shot) {
        return null
      }

      return {
        shotId: toStringValue(shot.shot_id) || `shot-${index + 1}`,
        label: toStringValue(shot.label) || `Shot ${index + 1}`,
        actionText: toStringValue(shot.action_text),
        directorNote: toStringValue(shot.director_note),
        cameraNote: toStringValue(shot.camera_note),
        visualDescription: toStringValue(shot.visual_description),
        shotDescription: toStringValue(shot.shot_description),
        shotSize: toStringValue(shot.shot_size),
        composition: toStringValue(shot.composition),
        cameraMotion: toStringValue(shot.camera_motion),
        emotionalGoal: toStringValue(shot.emotional_goal),
        actionState: toStringValue(shot.action_state),
        backgroundLock: toStringValue(shot.background_lock),
      } satisfies BessonShot
    })
    .filter((entry): entry is BessonShot => Boolean(entry))

  return {
    sceneStyle: toStringValue(packet.scene_style),
    sceneLogic: toStringValue(packet.scene_logic),
    locationLock: toStringValue(packet.location_lock),
    shotCount: Number(packet.shot_count) || shots.length,
    shots,
  }
}

function deriveBessonPromptPack(value: string | null | undefined): BessonPromptPack | null {
  const packet = parseRuntimeOutput<Record<string, unknown>>(value)
  if (!packet) {
    return null
  }

  const rawShots = Array.isArray(packet.shots) ? packet.shots : []
  const shots = rawShots
    .map((entry, index) => {
      const shot = toRecord(entry)
      if (!shot) {
        return null
      }

      return {
        shotId: toStringValue(shot.shot_id) || `shot-${index + 1}`,
        label: toStringValue(shot.label) || `Shot ${index + 1}`,
        actionText: toStringValue(shot.action_text),
        directorNote: toStringValue(shot.director_note),
        cameraNote: toStringValue(shot.camera_note),
        visualDescription: toStringValue(shot.visual_description),
        shotDescription: toStringValue(shot.shot_description),
        shotSize: toStringValue(shot.shot_size),
        composition: toStringValue(shot.composition),
        cameraMotion: toStringValue(shot.camera_motion),
        emotionalGoal: "",
        actionState: "",
        backgroundLock: "",
        imagePrompt: toStringValue(shot.image_prompt),
        selectedRefTitles: toStringArray(shot.selected_ref_titles),
        maxRefCount: Number(shot.max_ref_count) || 0,
        refReason: toStringValue(shot.ref_reason),
      } satisfies BessonPromptShot
    })
    .filter((entry): entry is BessonPromptShot => Boolean(entry))

  return {
    sceneBase: toStringValue(packet.scene_base),
    lightLock: toStringValue(packet.light_lock),
    styleLock: toStringValue(packet.style_lock),
    validationNotes: toStringArray(packet.validation_notes),
    shots,
  }
}

function mergeBessonGraphPatch(
  currentNodes: ConfiguratorFlowNode[],
  currentEdges: ConfiguratorFlowEdge[],
  patch: { nodes: ConfiguratorFlowNode[]; edges: ConfiguratorFlowEdge[] },
): { nodes: ConfiguratorFlowNode[]; edges: ConfiguratorFlowEdge[] } {
  const generatedNodeIds = new Set(
    currentNodes
      .filter((node) => node.id.startsWith(GENERATED_BESSON_NODE_PREFIX))
      .map((node) => node.id),
  )

  return {
    nodes: [...currentNodes.filter((node) => !node.id.startsWith(GENERATED_BESSON_NODE_PREFIX)), ...patch.nodes],
    edges: [
      ...currentEdges.filter((edge) => (
        !edge.id.startsWith(GENERATED_BESSON_NODE_PREFIX)
        && !generatedNodeIds.has(edge.source)
        && !generatedNodeIds.has(edge.target)
      )),
      ...patch.edges,
    ],
  }
}

function collectPhotoNodeImages(nodes: ConfiguratorFlowNode[], selectedTitles?: string[]): string[] {
  const titleSet = selectedTitles && selectedTitles.length > 0 ? new Set(selectedTitles) : null

  return nodes
    .flatMap((node) => {
      if (node.data.kind !== "photo") {
        return []
      }

      const photoData = node.data as ConfiguratorPhotoNodeData

      if (!photoData.imageUrl.trim()) {
        return []
      }

      if (titleSet && !titleSet.has(photoData.title)) {
        return []
      }

      return [photoData.imageUrl.trim()]
    })
}

function collectGeneratorReferencePreviews(
  sourceNodeIds: string[] | undefined,
  nodes: ConfiguratorFlowNode[],
): GeneratorReferencePreview[] {
  if (!sourceNodeIds || sourceNodeIds.length === 0) {
    return []
  }

  const seen = new Set<string>()

  return sourceNodeIds.flatMap((sourceNodeId) => {
    if (seen.has(sourceNodeId)) {
      return []
    }

    const sourceNode = nodes.find((entry) => entry.id === sourceNodeId)
    if (!sourceNode || sourceNode.data.kind !== "photo") {
      return []
    }

    const imageUrl = sourceNode.data.imageUrl.trim()
    if (!imageUrl) {
      return []
    }

    seen.add(sourceNodeId)
    return [{
      id: sourceNode.id,
      title: sourceNode.data.title,
      imageUrl,
    } satisfies GeneratorReferencePreview]
  })
}

function normalizeBessonRefText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function textIncludesAnyNeedle(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle))
}

function collectDynamicBessonReferencePreviews(
  nodes: ConfiguratorFlowNode[],
  shot: Pick<BessonPromptShot, "label" | "actionText" | "directorNote" | "cameraNote" | "visualDescription" | "shotDescription" | "imagePrompt" | "selectedRefTitles" | "maxRefCount">,
): GeneratorReferencePreview[] {
  const photoNodes = nodes.filter((node): node is ConfiguratorFlowNode & { data: ConfiguratorPhotoNodeData } => node.data.kind === "photo")
  const shotText = normalizeBessonRefText([
    shot.label,
    shot.actionText,
    shot.directorNote,
    shot.cameraNote,
    shot.visualDescription,
    shot.shotDescription,
    shot.imagePrompt,
  ].join(" "))

  const wantsAngela = textIncludesAnyNeedle(shotText, ["angela", "angel a", "angel-a", "ангела", "анжела", "ангел"])
  const wantsAndre = textIncludesAnyNeedle(shotText, ["andrea", "andre", "андре", "андреа"])
  const wantsClosePortrait = textIncludesAnyNeedle(shotText, ["close up", "close-up", "portrait", "круп", "лицо", "face", "medium close"])
  const maxRefs = shot.maxRefCount > 0 ? shot.maxRefCount : 3
  const explicitTitles = new Set(shot.selectedRefTitles)

  const explicit = photoNodes
    .filter((node) => explicitTitles.has(node.data.title) && node.data.imageUrl.trim())
    .map((node) => ({ id: node.id, title: node.data.title, imageUrl: node.data.imageUrl.trim() }))

  const scored = photoNodes
    .map((node) => {
      const imageUrl = node.data.imageUrl.trim()
      if (!imageUrl) {
        return null
      }

      const descriptor = normalizeBessonRefText(`${node.data.title} ${node.data.caption} ${node.data.lockedDetails}`)
      const isLocationRef = textIncludesAnyNeedle(descriptor, ["seine", "bridge", "embankment", "paris", "набереж", "мост", "сены", "river", "location"])
      const isAngelaRef = textIncludesAnyNeedle(descriptor, ["angela", "angel a", "angel-a", "анжела", "ангел"])
      const isAndreRef = textIncludesAnyNeedle(descriptor, ["andrea", "andre", "андре", "андреа"])
      const isPortraitRef = textIncludesAnyNeedle(descriptor, ["close up", "close-up", "portrait", "круп", "face"])

      let score = explicitTitles.has(node.data.title) ? 100 : 0
      if (isLocationRef) {
        score += 20
      }
      if (wantsAngela && isAngelaRef) {
        score += wantsClosePortrait && isPortraitRef ? 80 : isPortraitRef ? 20 : 60
      }
      if (wantsAndre && isAndreRef) {
        score += 60
      }
      if ((wantsAngela || wantsAndre) && isLocationRef) {
        score += 10
      }

      return score > 0
        ? { id: node.id, title: node.data.title, imageUrl, score }
        : null
    })
    .filter((entry): entry is { id: string; title: string; imageUrl: string; score: number } => Boolean(entry))
    .sort((left, right) => right.score - left.score)

  const merged = [...explicit, ...scored].reduce<GeneratorReferencePreview[]>((accumulator, entry) => {
    if (accumulator.some((item) => item.id === entry.id) || accumulator.length >= maxRefs) {
      return accumulator
    }

    accumulator.push({ id: entry.id, title: entry.title, imageUrl: entry.imageUrl })
    return accumulator
  }, [])

  if (merged.length > 0) {
    return merged
  }

  return photoNodes
    .filter((node) => node.data.imageUrl.trim())
    .slice(0, maxRefs)
    .map((node) => ({ id: node.id, title: node.data.title, imageUrl: node.data.imageUrl.trim() }))
}

function syncBessonPromptPackWithLiveRefs(pack: BessonPromptPack | null, nodes: ConfiguratorFlowNode[]): BessonPromptPack | null {
  if (!pack) {
    return null
  }

  return {
    ...pack,
    shots: pack.shots.map((shot) => {
      const liveRefs = collectDynamicBessonReferencePreviews(nodes, shot)
      return {
        ...shot,
        selectedRefTitles: liveRefs.map((reference) => reference.title),
        maxRefCount: shot.maxRefCount > 0 ? shot.maxRefCount : Math.min(3, Math.max(1, liveRefs.length)),
        refReason: liveRefs.length > 0
          ? "Live ref sync from current photo nodes and shot content."
          : shot.refReason,
      }
    }),
  }
}

function findBessonPromptShotByGeneratorTitle(title: string, pack: BessonPromptPack | null): BessonPromptShot | null {
  if (!pack) {
    return null
  }

  const shotLabel = getBessonGeneratedShotLabel(title)
  return pack.shots.find((shot) => shot.label === shotLabel) ?? null
}

function sanitizeStillImagePrompt(prompt: string): string {
  return prompt
    .replace(/["“”«»][^"“”«»]{1,240}["“”«»]/g, "")
    .replace(/\b(?:dialogue|spoken line|line of dialogue|quote|quoted speech|subtitle|caption)\s*:\s*[^.]+\.?/giu, "")
    .replace(/\b(?:says|said|speaks|speaking|whispers|whispering|shouts|shouting|asks|asking|replies|replying|answers|answering)\b\s+(?:softly|quietly|calmly|angrily|thoughtfully|gently|loudly)?\s*["“”«»][^"“”«»]{1,240}["“”«»]/giu, "")
    .replace(/\s+/g, " ")
    .trim()
}

function getPromptNodeTextByTitle(nodes: ConfiguratorFlowNode[], title: string): string {
  const node = nodes.find((entry) => entry.data.kind === "prompt" && entry.data.title === title)
  return node?.data.kind === "prompt" ? node.data.promptText.trim() : ""
}

function resolveBessonShotModel(nodes: ConfiguratorFlowNode[], shotLabel: string): ImageGenModel {
  const generatorNode = nodes.find((node) => (
    node.data.kind === "generator" && node.data.title === `${shotLabel} Generator`
  ))

  return generatorNode?.data.kind === "generator" ? generatorNode.data.system : "gpt-image"
}

async function generateImageFromNode(args: {
  endpoint: string
  model: ImageGenModel
  prompt: string
  referenceImages: string[]
}): Promise<string> {
  const sanitizedPrompt = sanitizeStillImagePrompt(args.prompt)
  const promptWithTextGuard = [
    sanitizedPrompt,
    "No subtitles, no captions, no title cards, no visible text, no letters, no words, no typography, no logos, no watermarks, no printed signage in frame.",
  ].filter(Boolean).join(" ")

  const response = await fetch(args.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: promptWithTextGuard,
      model: args.model,
      referenceImages: args.referenceImages,
    }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string; details?: string } | null
    throw new Error(payload?.details || payload?.error || `Image generation failed: ${response.status}`)
  }

  const blob = await response.blob()
  return blobToDataUrl(blob)
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",")
  const mime = header?.match(/:(.*?);/)?.[1] ?? "image/png"
  const binary = atob(base64 ?? "")
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob"))
    reader.readAsDataURL(blob)
  })
}

function openConfiguratorWorkspaceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(CONFIGURATOR_WORKSPACE_DB, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CONFIGURATOR_WORKSPACE_STORE)) {
        db.createObjectStore(CONFIGURATOR_WORKSPACE_STORE)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Failed to open workspace DB"))
  })
}

async function readWorkspaceState(): Promise<PersistedConfiguratorWorkspaceState | null> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return null
  }

  const db = await openConfiguratorWorkspaceDb()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONFIGURATOR_WORKSPACE_STORE, "readonly")
    const request = transaction.objectStore(CONFIGURATOR_WORKSPACE_STORE).get(CONFIGURATOR_WORKSPACE_KEY)

    request.onsuccess = () => {
      const result = request.result as PersistedConfiguratorWorkspaceState | undefined
      resolve(result?.version === 1 ? result : null)
      db.close()
    }
    request.onerror = () => {
      reject(request.error ?? new Error("Failed to read workspace state"))
      db.close()
    }
  })
}

async function writeWorkspaceState(state: PersistedConfiguratorWorkspaceState): Promise<void> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return
  }

  const db = await openConfiguratorWorkspaceDb()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONFIGURATOR_WORKSPACE_STORE, "readwrite")
    const request = transaction.objectStore(CONFIGURATOR_WORKSPACE_STORE).put(state, CONFIGURATOR_WORKSPACE_KEY)

    request.onsuccess = () => {
      resolve()
      db.close()
    }
    request.onerror = () => {
      reject(request.error ?? new Error("Failed to write workspace state"))
      db.close()
    }
  })
}

async function clearWorkspaceState(): Promise<void> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return
  }

  const db = await openConfiguratorWorkspaceDb()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONFIGURATOR_WORKSPACE_STORE, "readwrite")
    const request = transaction.objectStore(CONFIGURATOR_WORKSPACE_STORE).delete(CONFIGURATOR_WORKSPACE_KEY)

    request.onsuccess = () => {
      resolve()
      db.close()
    }
    request.onerror = () => {
      reject(request.error ?? new Error("Failed to clear workspace state"))
      db.close()
    }
  })
}

function readCustomTemplates(): CustomConfiguratorTemplate[] {
  if (typeof window === "undefined") {
    return []
  }

  try {
    const raw = window.localStorage.getItem(CUSTOM_TEMPLATES_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as CustomConfiguratorTemplate[]
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((template) => (
      template
      && typeof template.id === "string"
      && typeof template.label === "string"
      && typeof template.description === "string"
      && Array.isArray(template.nodes)
      && Array.isArray(template.edges)
    ))
  } catch {
    return []
  }
}

function writeCustomTemplates(templates: CustomConfiguratorTemplate[]) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(CUSTOM_TEMPLATES_STORAGE_KEY, JSON.stringify(templates))
}

function isBuiltInTemplateId(templateId: string): templateId is ConfiguratorTemplateId {
  return CONFIGURATOR_TEMPLATES.some((template) => template.id === templateId)
}

function hasNodeTitle(nodes: ConfiguratorFlowNode[], title: string): boolean {
  return nodes.some((node) => node.data.title === title)
}

function inferBuiltInTemplateId(nodes: ConfiguratorFlowNode[], fallback: string): string {
  if (
    hasNodeTitle(nodes, "Stage 1: Scene Breakdown")
    || hasNodeTitle(nodes, "Stage 2: Prompt Composer")
    || hasNodeTitle(nodes, "Prompt Pack Output")
    || hasNodeTitle(nodes, "Scene Script")
  ) {
    return "default_directing"
  }

  if (
    hasNodeTitle(nodes, "BessonShotPlannerNode")
    || hasNodeTitle(nodes, "NODE: IMAGE PROMPT CONSISTENCY BUILDER")
    || hasNodeTitle(nodes, "Besson Prompt Pack Output")
    || hasNodeTitle(nodes, "Сценарий")
  ) {
    return "test_luc_besson"
  }

  if (
    hasNodeTitle(nodes, "DirectorVisionNode")
    || hasNodeTitle(nodes, "Director Vision Output")
    || hasNodeTitle(nodes, "Story History")
  ) {
    return "template_777"
  }

  if (
    hasNodeTitle(nodes, "FinalPackagingNode")
    || hasNodeTitle(nodes, "ScenePacket Output")
    || hasNodeTitle(nodes, "SceneInput")
  ) {
    return "koza_scene_to_directing_mvp"
  }

  return fallback
}

function migrateLucBessonGraph(
  currentNodes: ConfiguratorFlowNode[],
  currentEdges: ConfiguratorFlowEdge[],
): { nodes: ConfiguratorFlowNode[]; edges: ConfiguratorFlowEdge[] } {
  const template = createConfiguratorTemplate("test_luc_besson")
  const existingByTitle = new Map(currentNodes.map((node) => [node.data.title, node] as const))
  const baseTemplateIdsByTitle = new Map(template.nodes.map((node) => [node.data.title, node.id] as const))
  const resolvedNodes = template.nodes.map((templateNode) => {
    const existing = existingByTitle.get(templateNode.data.title)
    if (!existing) {
      return templateNode
    }

    return {
      ...templateNode,
      id: existing.id,
      type: existing.type,
      position: existing.position,
      data: existing.data,
    }
  })

  const resolvedIdByTemplateId = new Map(template.nodes.map((templateNode) => {
    const existing = existingByTitle.get(templateNode.data.title)
    return [templateNode.id, existing?.id ?? templateNode.id] as const
  }))

  const resolvedEdges = template.edges.map((edge) => ({
    ...edge,
    source: resolvedIdByTemplateId.get(edge.source) ?? edge.source,
    target: resolvedIdByTemplateId.get(edge.target) ?? edge.target,
    id: `${resolvedIdByTemplateId.get(edge.source) ?? edge.source}-${resolvedIdByTemplateId.get(edge.target) ?? edge.target}`,
  }))

  const generatedNodes = currentNodes.filter((node) => node.id.startsWith(GENERATED_BESSON_NODE_PREFIX))
  const generatedNodeIds = new Set(generatedNodes.map((node) => node.id))
  const generatedEdges = currentEdges.filter((edge) => (
    edge.id.startsWith(GENERATED_BESSON_NODE_PREFIX)
    || generatedNodeIds.has(edge.source)
    || generatedNodeIds.has(edge.target)
  ))

  return {
    nodes: [...resolvedNodes, ...generatedNodes],
    edges: [...resolvedEdges, ...generatedEdges],
  }
}

export default function ConfiguratorSandboxPage() {
  const { characters, locations, storyHistory, directorVision } = useBibleStore()
  const activeProjectId = useProjectsStore((state) => state.activeProjectId)
  const projects = useProjectsStore((state) => state.projects)
  const addFileToLibrary = useLibraryStore((state) => state.addFile)
  const libraryFiles = useLibraryStore((state) => state.files)
  const removeLibraryFile = useLibraryStore((state) => state.removeFile)
  const setLucBessonProfile = useProjectProfilesStore((state) => state.setLucBessonProfile)
  const [isLibraryOpen, setIsLibraryOpen] = useState(false)
  const [nodes, setNodes] = useState<ConfiguratorFlowNode[]>(() => applyKozaDirectingDefaults(graphSeed.nodes, characters, locations, storyHistory, directorVision))
  const [edges, setEdges] = useState<ConfiguratorFlowEdge[]>(graphSeed.edges)
  const [activeTemplateId, setActiveTemplateId] = useState<string>("default_directing")
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(graphSeed.nodes[2]?.id ?? null)
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null)
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "done" | "error">("idle")
  const [runMessage, setRunMessage] = useState<string>("Запусков пока не было")
  const [runModelId, setRunModelId] = useState<string>("")
  const [runtimeOutputs, setRuntimeOutputs] = useState<Partial<Record<KozaDirectingStageName, string>>>({})
  const [generationPrompt, setGenerationPrompt] = useState<string>("Собери компактный конфиг для KOZA: Story History, Director Vision, SceneInput, Context Enricher, Meaning Node, Directing Structure, Director Prompt, Cinematography Prompt и финальный output.")
  const [generationStatus, setGenerationStatus] = useState<"idle" | "running" | "done" | "error">("idle")
  const [generationMessage, setGenerationMessage] = useState<string>("Агент пока не генерировал конфиг")
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([])
  const [isAgentPanelOpen, setIsAgentPanelOpen] = useState(false)
  const [isWorkspacePanelOpen, setIsWorkspacePanelOpen] = useState(false)
  const [customTemplates, setCustomTemplates] = useState<CustomConfiguratorTemplate[]>([])
  const [templateDraftName, setTemplateDraftName] = useState<string>("My Template")
  const [templateDraftDescription, setTemplateDraftDescription] = useState<string>("Custom graph saved from the configurator canvas.")
  const [templateMessage, setTemplateMessage] = useState<string>("Пользовательских шаблонов пока нет")
  const [activeStages, setActiveStages] = useState<KozaDirectingStageName[]>([])
  const [completedStages, setCompletedStages] = useState<KozaDirectingStageName[]>([])
  const [isMiniInspectorOpen, setIsMiniInspectorOpen] = useState(true)
  const [shotGenerationResults, setShotGenerationResults] = useState<Record<string, ShotGenerationResult>>({})
  const [shotGenerationStatus, setShotGenerationStatus] = useState<Record<string, "idle" | "running" | "done" | "error">>({})
  const [shotGenerationErrors, setShotGenerationErrors] = useState<Record<string, string>>({})
  const [workspaceMessage, setWorkspaceMessage] = useState<string>("Сборка пока не сохранена")
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<ConfiguratorFlowNode, ConfiguratorFlowEdge> | null>(null)
  const graphFingerprintRef = useRef<string>("")
  const hasHydratedWorkspaceRef = useRef(false)

  const outputNodeIds = useMemo(
    () => nodes.filter((node) => node.data.kind === "output").map((node) => node.id),
    [nodes],
  )
  const generatorNodeIds = useMemo(
    () => nodes.filter((node) => node.data.kind === "generator").map((node) => node.id),
    [nodes],
  )
  const effectiveTemplateId = useMemo(() => inferBuiltInTemplateId(nodes, activeTemplateId), [activeTemplateId, nodes])
  const isLucBessonTemplate = effectiveTemplateId === "test_luc_besson"

  const compiledByOutput = useMemo(() => {
    const entries = outputNodeIds.map((outputId) => [outputId, compilePromptFromGraph(outputId, nodes, edges)] as const)
    return new Map(entries)
  }, [edges, nodes, outputNodeIds])

  const compiledByGenerator = useMemo(() => {
    const entries = generatorNodeIds.map((generatorId) => {
      const generator = nodes.find((node) => node.id === generatorId)
      if (!generator || generator.data.kind !== "generator") {
        return [generatorId, null] as const
      }

      return [generatorId, compileGeneratorFromGraph(generator.data.system, generatorId, nodes, edges)] as const
    })

    return new Map(entries)
  }, [edges, generatorNodeIds, nodes])

  const bessonPromptPack = useMemo(
    () => syncBessonPromptPackWithLiveRefs(
      deriveBessonPromptPack(runtimeOutputs["Besson Prompt Pack Output"] ?? null),
      nodes,
    ),
    [nodes, runtimeOutputs],
  )
  const activeProjectName = useMemo(
    () => projects.find((project) => project.id === activeProjectId)?.name ?? "Active Project",
    [activeProjectId, projects],
  )

  function handleApplyLucBessonToProject() {
    if (!activeProjectId) {
      setWorkspaceMessage("Сначала открой основной проект, затем применяй Luc Besson профиль")
      return
    }

    if (!bessonPromptPack || !isLucBessonTemplate) {
      setWorkspaceMessage("Сначала собери Luc Besson shot pack через Run MVP")
      return
    }

    const stylePrompt = getPromptNodeTextByTitle(nodes, "Стиль правил Люка Бессона")
    const sceneText = getPromptNodeTextByTitle(nodes, "Сценарий")
    const angelaDescription = getPromptNodeTextByTitle(nodes, "описание Персонаж Ангел А")
    const angelaDetails = getPromptNodeTextByTitle(nodes, "Детали Ангел А для консистенции")
    const andreDescription = getPromptNodeTextByTitle(nodes, "описание Персонаж Андреа")
    const andreDetails = getPromptNodeTextByTitle(nodes, "детали Андреа для консистенции")
    const locationLock = getPromptNodeTextByTitle(nodes, "локация")
    const photoNodes = nodes.filter((node): node is ConfiguratorFlowNode & { data: ConfiguratorPhotoNodeData } => node.data.kind === "photo")
    const angelaReferenceTitles = photoNodes
      .filter((node) => normalizeBessonRefText(node.data.title).includes("ангел") || normalizeBessonRefText(node.data.title).includes("angela") || normalizeBessonRefText(node.data.title).includes("angel a"))
      .map((node) => node.data.title)
    const andreReferenceTitles = photoNodes
      .filter((node) => normalizeBessonRefText(node.data.title).includes("андре") || normalizeBessonRefText(node.data.title).includes("andrea") || normalizeBessonRefText(node.data.title).includes("andre"))
      .map((node) => node.data.title)
    const locationReferenceTitles = photoNodes
      .filter((node) => textIncludesAnyNeedle(normalizeBessonRefText(`${node.data.title} ${node.data.caption}`), ["seine", "bridge", "embankment", "paris", "набереж", "мост", "сены", "river"]))
      .map((node) => node.data.title)

    setLucBessonProfile({
      projectId: activeProjectId,
      sourceTemplateId: activeTemplateId,
      appliedAt: Date.now(),
      profileName: `${activeTemplate.label} profile`,
      sceneText,
      stylePrompt,
      directorVisionPrompt: [bessonPromptPack.styleLock, bessonPromptPack.lightLock, bessonPromptPack.validationNotes.join(" ")].filter(Boolean).join("\n"),
      sceneBase: bessonPromptPack.sceneBase,
      lightLock: bessonPromptPack.lightLock,
      styleLock: bessonPromptPack.styleLock,
      validationNotes: bessonPromptPack.validationNotes,
      characterOverrides: [
        {
          name: "Angela",
          description: angelaDescription,
          appearancePrompt: angelaDetails,
          referenceImageTitles: angelaReferenceTitles,
        },
        {
          name: "Andrea",
          description: andreDescription,
          appearancePrompt: andreDetails,
          referenceImageTitles: andreReferenceTitles,
        },
      ].filter((entry) => entry.description || entry.appearancePrompt || entry.referenceImageTitles.length > 0),
      locationOverrides: [{
        name: "Luc Besson Location Lock",
        description: bessonPromptPack.sceneBase || locationLock,
        appearancePrompt: locationLock,
        referenceImageTitles: locationReferenceTitles,
      }].filter((entry) => entry.description || entry.appearancePrompt || entry.referenceImageTitles.length > 0),
      shots: bessonPromptPack.shots.map((shot) => ({
        shotId: shot.shotId,
        label: shot.label,
        actionText: shot.actionText,
        directorNote: shot.directorNote,
        cameraNote: shot.cameraNote,
        visualDescription: shot.visualDescription,
        shotDescription: shot.shotDescription,
        imagePrompt: shot.imagePrompt,
        selectedRefTitles: shot.selectedRefTitles,
        maxRefCount: shot.maxRefCount,
        refReason: shot.refReason,
      })),
    })

    setWorkspaceMessage(`Luc Besson профиль подключён к проекту ${activeProjectName}`)
  }

  async function saveGeneratedImageToLibrary(imageDataUrl: string, label: string, prompt: string, model: string) {
    const id = makeId("lib")
    const now = Date.now()
    const blob = dataUrlToBlob(imageDataUrl)
    const blobSaved = await trySaveBlob(id, blob)

    const file: LibraryFile = {
      id,
      name: `${label} — ${model}`,
      type: "image",
      mimeType: blob.type || "image/png",
      size: blob.size,
      url: imageDataUrl,
      thumbnailUrl: imageDataUrl,
      createdAt: now,
      updatedAt: now,
      tags: ["configurator", "generated", model],
      projectId: "configurator",
      folder: "/configurator/generated",
      origin: "generated",
    }

    addFileToLibrary(file)
    setIsLibraryOpen(true)
    setWorkspaceMessage(
      blobSaved
        ? `Изображение ${label} сохранено в библиотеку configurator`
        : `Изображение ${label} добавлено в библиотеку configurator, но постоянное сохранение blob не удалось`,
    )
  }

  async function handleGenerateGeneratorNode(generatorNodeId: string, shotOverride?: BessonPromptShot | null) {
    const generatorNode = nodes.find((node) => node.id === generatorNodeId)
    if (!generatorNode || generatorNode.data.kind !== "generator") {
      return
    }

    const compiled = compiledByGenerator.get(generatorNodeId) ?? null
    const prompt = compiled?.prompt?.trim() ?? ""
    const shot = shotOverride ?? findBessonPromptShotByGeneratorTitle(generatorNode.data.title, bessonPromptPack)
    const generationKey = shot?.shotId ?? generatorNodeId

    if (!prompt) {
      setShotGenerationStatus((current) => ({ ...current, [generationKey]: "error" }))
      setShotGenerationErrors((current) => ({ ...current, [generationKey]: "Generator prompt is empty" }))
      return
    }

    const model = generatorNode.data.system
    const endpoint = model === "gpt-image" ? "/api/gpt-image" : "/api/nano-banana"
    const referenceImages = shot
      ? collectDynamicBessonReferencePreviews(nodes, shot).map((reference) => reference.imageUrl)
      : collectGeneratorReferencePreviews(compiled?.sourceNodeIds, nodes).map((reference) => reference.imageUrl)

    setShotGenerationStatus((current) => ({ ...current, [generationKey]: "running" }))
    setShotGenerationErrors((current) => ({ ...current, [generationKey]: "" }))

    try {
      const imageUrl = await generateImageFromNode({ endpoint, model, prompt, referenceImages })

      setShotGenerationResults((current) => ({
        ...current,
        [generationKey]: {
          imageUrl,
          prompt,
          model,
        },
      }))
      setShotGenerationStatus((current) => ({ ...current, [generationKey]: "done" }))

      const shotLabel = shot?.label ?? generatorNode.data.title
      void saveGeneratedImageToLibrary(imageUrl, shotLabel, prompt, model)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setShotGenerationStatus((current) => ({ ...current, [generationKey]: "error" }))
      setShotGenerationErrors((current) => ({ ...current, [generationKey]: message }))
    }
  }

  const displayNodes = useMemo(() => {
    const mappedNodes = nodes.map((node) => {
    const title = node.data.title as KozaDirectingStageName
    const activityState: NodeActivityState = activeStages.includes(title)
      ? "active"
      : completedStages.includes(title)
        ? "completed"
        : "idle"

    if (node.data.kind === "output") {
      const compiled = compiledByOutput.get(node.id)
      const shotLabel = getBessonGeneratedShotLabel(node.data.title)
      const shot = bessonPromptPack?.shots.find((entry) => entry.label === shotLabel)
      const renderedImage = shot ? shotGenerationResults[shot.shotId] ?? null : null

      return {
        ...node,
        position: isLucBessonTemplate && isGeneratedBessonNode(node)
          ? {
              x: 2440,
              y: 120 + (bessonPromptPack?.shots.findIndex((entry) => entry.label === shot?.label) ?? 0) * 420,
            }
          : node.position,
        data: {
          ...node.data,
          activityState,
          previewPrompt: compiled?.finalPrompt ?? "",
          sourceCount: compiled?.sourceNodeIds.length ?? 0,
          imageUrl: renderedImage?.imageUrl ?? node.data.imageUrl,
        } satisfies ConfiguratorOutputNodeData,
      }
    }

    if (node.data.kind === "generator") {
      const compiled = compiledByGenerator.get(node.id)
      const shot = findBessonPromptShotByGeneratorTitle(node.data.title, bessonPromptPack)
      const generationKey = shot?.shotId ?? node.id
      const renderedImage = shotGenerationResults[generationKey] ?? null
      const referencePreviews = shot
        ? collectDynamicBessonReferencePreviews(nodes, shot)
        : collectGeneratorReferencePreviews(compiled?.sourceNodeIds, nodes)

      return {
        ...node,
        data: {
          ...node.data,
          activityState,
          requestPreview: sanitizeStillImagePrompt(compiled?.prompt ?? ""),
          sourceCount: compiled?.sourceNodeIds.length ?? 0,
          shotActionText: shot?.actionText ?? "",
          shotDirectorNote: shot?.directorNote ?? "",
          shotCameraNote: shot?.cameraNote ?? "",
          shotVisualDescription: shot?.visualDescription ?? "",
          canGenerate: Boolean((compiled?.prompt ?? "").trim()),
          generationStatus: shotGenerationStatus[generationKey] ?? "idle",
          generationError: shotGenerationErrors[generationKey] ?? "",
          generatedImageUrl: renderedImage?.imageUrl ?? "",
          referencePreviews,
          onGenerate: () => void handleGenerateGeneratorNode(node.id, shot),
        } satisfies ConfiguratorGeneratorNodeData,
      }
    }

    return {
      ...node,
      data: {
        ...node.data,
        activityState,
      },
    }
    })

    if (!isLucBessonTemplate) {
      return mappedNodes
    }

    return mappedNodes.filter((node) => {
      if (!isGeneratedBessonNodeId(node.id)) {
        return true
      }

      return node.data.kind === "generator"
    })
  }, [activeStages, bessonPromptPack, compiledByGenerator, compiledByOutput, completedStages, isLucBessonTemplate, nodes, shotGenerationErrors, shotGenerationResults, shotGenerationStatus])

  const displayEdges = useMemo(() => {
    const activeNodeIds = new Set(
      nodes
        .filter((node) => activeStages.includes(node.data.title as KozaDirectingStageName))
        .map((node) => node.id),
    )
    const completedNodeIds = new Set(
      nodes
        .filter((node) => completedStages.includes(node.data.title as KozaDirectingStageName))
        .map((node) => node.id),
    )

    const styledEdges = edges.map((edge) => {
      const isActiveEdge = activeNodeIds.has(edge.source) || activeNodeIds.has(edge.target)
      const isCompletedEdge = completedNodeIds.has(edge.source) && completedNodeIds.has(edge.target)

      return {
        ...edge,
        animated: isActiveEdge,
        style: {
          stroke: isActiveEdge
            ? "rgba(212,168,83,0.9)"
            : isCompletedEdge
              ? "rgba(16,185,129,0.6)"
              : "rgba(231,225,219,0.28)",
          strokeWidth: isActiveEdge ? 2.4 : 1.4,
        },
        labelStyle: {
          fill: isActiveEdge ? "rgba(255,247,230,0.95)" : "rgba(231,225,219,0.72)",
          fontSize: 11,
        },
        labelBgStyle: {
          fill: isActiveEdge ? "rgba(92,64,12,0.92)" : "rgba(9,8,7,0.92)",
          fillOpacity: 0.92,
        },
      }
    })

    if (!isLucBessonTemplate) {
      return styledEdges
    }

    const visibleNodeIds = new Set(displayNodes.map((node) => node.id))
    const baseEdges = styledEdges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    const liveRefEdges = displayNodes
      .flatMap((node) => {
        if (node.data.kind !== "generator") {
          return []
        }

        return (node.data.referencePreviews ?? []).map((reference, index) => ({
          id: `live-ref-${reference.id}-${node.id}-${index}`,
          source: reference.id,
          target: node.id,
          label: "live ref",
          animated: false,
          style: { stroke: "rgba(139,92,246,0.42)", strokeWidth: 1.6 },
          labelStyle: { fill: "rgba(232,222,255,0.78)", fontSize: 11 },
          labelBgStyle: { fill: "rgba(34,20,54,0.94)", fillOpacity: 0.94 },
        }))
      })

    return [...baseEdges, ...liveRefEdges]
  }, [activeStages, completedStages, displayNodes, edges, isLucBessonTemplate, nodes])

  useEffect(() => {
    if (!selectedNodeId || displayNodes.some((node) => node.id === selectedNodeId)) {
      return
    }

    if (!isLucBessonTemplate) {
      setSelectedNodeId(displayNodes[0]?.id ?? null)
      return
    }

    const hiddenNode = nodes.find((node) => node.id === selectedNodeId)
    if (!hiddenNode) {
      setSelectedNodeId(displayNodes[0]?.id ?? null)
      return
    }

    const shotLabel = getBessonGeneratedShotLabel(hiddenNode.data.title)
    const generatorNode = displayNodes.find((node) => node.data.kind === "generator" && node.data.title === `${shotLabel} Generator`)
    setSelectedNodeId(generatorNode?.id ?? displayNodes[0]?.id ?? null)
  }, [displayNodes, isLucBessonTemplate, nodes, selectedNodeId])

  const selectedNode = displayNodes.find((node) => node.id === selectedNodeId) ?? null
  const selectedCompiled = selectedNode && selectedNode.data.kind === "output"
    ? compiledByOutput.get(selectedNode.id) ?? null
    : null
  const selectedGeneratorRequest = selectedNode && selectedNode.data.kind === "generator"
    ? compiledByGenerator.get(selectedNode.id) ?? null
    : null
  const selectedRuntimeOutput = selectedNode ? runtimeOutputs[selectedNode.data.title as KozaDirectingStageName] ?? null : null
  const canRunKozaMvp = useMemo(() => isKozaDirectingMvpGraph(nodes), [nodes])
  const missingKozaTitles = useMemo(() => getKozaDirectingMissingTitles(nodes), [nodes])
  const canRunTemplate777 = useMemo(() => isTemplate777Graph(nodes), [nodes])
  const missingTemplate777Titles = useMemo(() => getTemplate777MissingTitles(nodes), [nodes])
  const canRunLucBesson = useMemo(() => isLucBessonGraph(nodes), [nodes])
  const missingLucBessonTitles = useMemo(() => getLucBessonMissingTitles(nodes), [nodes])
  const allTemplates = useMemo<Array<ConfiguratorTemplateMeta | { id: string; label: string; description: string }>>(
    () => [...CONFIGURATOR_TEMPLATES, ...customTemplates],
    [customTemplates],
  )
  const activeTemplate = allTemplates.find((template) => template.id === effectiveTemplateId) ?? CONFIGURATOR_TEMPLATES[0]
  const isPrePromptTemplate = effectiveTemplateId === "template_777"
  const canRunActiveFlow = isPrePromptTemplate
    ? canRunTemplate777
    : isLucBessonTemplate
      ? canRunLucBesson
      : canRunKozaMvp
  const activeMissingTitles = isPrePromptTemplate
    ? missingTemplate777Titles
    : isLucBessonTemplate
      ? missingLucBessonTitles
      : missingKozaTitles
  const hasRuntimeOutputs = Object.keys(runtimeOutputs).length > 0
  const finalOutputKey: KozaDirectingStageName = isPrePromptTemplate
    ? "Director Vision Output"
    : isLucBessonTemplate
      ? "Besson Prompt Pack Output"
      : "ScenePacket Output"
  const finalOutputLabel = isPrePromptTemplate
    ? "Director Vision Output"
    : isLucBessonTemplate
      ? "Besson Prompt Pack"
      : "Final ScenePacket"
  const directorVisionPacket = useMemo(
    () => isPrePromptTemplate ? deriveDirectorVisionPacket(runtimeOutputs["Director Vision Output"] ?? null) : null,
    [isPrePromptTemplate, runtimeOutputs],
  )
  const bessonShotPacket = useMemo(
    () => isLucBessonTemplate ? deriveBessonShotPacket(runtimeOutputs["Besson Shot Output"] ?? null) : null,
    [isLucBessonTemplate, runtimeOutputs],
  )
  const selectedBessonPromptShot = useMemo(() => {
    if (!selectedNode || selectedNode.data.kind !== "generator" || !bessonPromptPack) {
      return null
    }

    const shotLabel = getBessonGeneratedShotLabel(selectedNode.data.title)
    return bessonPromptPack.shots.find((shot) => shot.label === shotLabel) ?? null
  }, [bessonPromptPack, selectedNode])
  const shouldShowSelectedRuntimeJson = Boolean(selectedRuntimeOutput) && (
    !isPrePromptTemplate
    || !["DirectorVisionNode", "Director Vision Output"].includes(selectedNode?.data.title ?? "")
  )

  const configuratorLibraryFiles = useMemo(
    () => libraryFiles.filter((file) => file.projectId === "configurator"),
    [libraryFiles],
  )

  useEffect(() => {
    const storedTemplates = readCustomTemplates()
    setCustomTemplates(storedTemplates)
    if (storedTemplates.length > 0) {
      setTemplateMessage(`Сохранено шаблонов: ${storedTemplates.length}`)
    }
  }, [])

  useEffect(() => {
    if (effectiveTemplateId !== activeTemplateId && isBuiltInTemplateId(effectiveTemplateId)) {
      setActiveTemplateId(effectiveTemplateId)
    }
  }, [activeTemplateId, effectiveTemplateId])

  useEffect(() => {
    if (effectiveTemplateId !== "test_luc_besson") {
      return
    }

    const missingDistributorNodes = ["REF DISTRIBUTOR", "REF DISTRIBUTOR Output"].filter((title) => !hasNodeTitle(nodes, title))
    if (missingDistributorNodes.length === 0) {
      return
    }

    const migrated = migrateLucBessonGraph(nodes, edges)
    setNodes(migrated.nodes)
    setEdges(migrated.edges)
    setRunMessage("Luc Besson graph автоматически обновлён до новой схемы с REF DISTRIBUTOR")
  }, [edges, effectiveTemplateId, nodes])

  useEffect(() => {
    let cancelled = false

    void readWorkspaceState()
      .then((savedState) => {
        if (cancelled) {
          return
        }

        if (savedState) {
          setNodes(savedState.nodes)
          setEdges(savedState.edges)
          setActiveTemplateId(savedState.activeTemplateId)
          setSelectedNodeId(savedState.selectedNodeId)
          setRuntimeOutputs(savedState.runtimeOutputs)
          setRunStatus(savedState.runStatus)
          setRunMessage(savedState.runMessage)
          setRunModelId(savedState.runModelId)
          setTemplateDraftName(savedState.templateDraftName)
          setTemplateDraftDescription(savedState.templateDraftDescription)
          setShotGenerationResults(savedState.shotGenerationResults)
          setWorkspaceMessage("Сохранённая сборка восстановлена")
        }

        hasHydratedWorkspaceRef.current = true
      })
      .catch(() => {
        if (!cancelled) {
          hasHydratedWorkspaceRef.current = true
        }
      })

    return () => {
      cancelled = true
    }
  }, [])
  const graphFingerprint = useMemo(() => JSON.stringify({
    nodes: nodes.map((node) => ({
      id: node.id,
      position: node.position,
      data: node.data,
    })),
    edges: edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      label: edge.label,
    })),
  }), [edges, nodes])

  useEffect(() => {
    setNodes((current) => isKozaDirectingMvpGraph(current)
      ? applyKozaDirectingDefaults(current, characters, locations, storyHistory, directorVision)
      : current)
  }, [characters, directorVision, locations, storyHistory])

  useEffect(() => {
    if (!graphFingerprintRef.current) {
      graphFingerprintRef.current = graphFingerprint
      return
    }

    if (graphFingerprintRef.current === graphFingerprint) {
      return
    }

    graphFingerprintRef.current = graphFingerprint

    if (runStatus !== "running" && Object.keys(runtimeOutputs).length > 0) {
      setRuntimeOutputs({})
      setRunStatus("idle")
      setRunMessage("Граф изменён, старые финальные промпты очищены")
      setRunModelId("")
      setActiveStages([])
      setCompletedStages([])
    }
  }, [graphFingerprint, runStatus, runtimeOutputs])

  useEffect(() => {
    if (!hasHydratedWorkspaceRef.current) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void writeWorkspaceState({
        version: 1,
        activeTemplateId,
        selectedNodeId,
        nodes,
        edges,
        runtimeOutputs,
        runStatus,
        runMessage,
        runModelId,
        templateDraftName,
        templateDraftDescription,
        shotGenerationResults,
      }).then(() => {
        setWorkspaceMessage("Сборка сохранена")
      }).catch(() => {
        setWorkspaceMessage("Не удалось сохранить сборку")
      })
    }, 500)

    return () => window.clearTimeout(timeoutId)
  }, [
    activeTemplateId,
    edges,
    nodes,
    runMessage,
    runModelId,
    runStatus,
    runtimeOutputs,
    selectedNodeId,
    shotGenerationResults,
    templateDraftDescription,
    templateDraftName,
  ])

  function clearRunOutputs() {
    setRuntimeOutputs({})
    setRunStatus("idle")
    setRunMessage("Финальные промпты очищены")
    setRunModelId("")
    setActiveStages([])
    setCompletedStages([])
    setShotGenerationResults({})
    setShotGenerationStatus({})
    setShotGenerationErrors({})
  }

  function clearAllText() {
    setNodes((current) => current.map((node) => ({
      ...node,
      data: clearNodeTextContent(node.data),
    })))
    setRuntimeOutputs({})
    setRunStatus("idle")
    setRunMessage("Все текстовые поля очищены")
    setRunModelId("")
    setActiveStages([])
    setCompletedStages([])
    setConnectionMessage(null)
    setShotGenerationResults({})
    setShotGenerationStatus({})
    setShotGenerationErrors({})
  }

  function updateNode(nodeId: string, updater: (data: ConfiguratorNodeData) => ConfiguratorNodeData) {
    setNodes((current) => current.map((node) => (
      node.id === nodeId
        ? { ...node, data: updater(node.data) }
        : node
    )))
  }

  function addNode(kind: ConfiguratorNodeKind) {
    const count = nodes.length
    const id = makeId(kind)
    const position = { x: 80 + (count % 3) * 420, y: 160 + Math.floor(count / 3) * 250 }

    const nextNode: ConfiguratorFlowNode = {
      id,
      type: "configNode",
      position,
      data: createNodeData(kind),
    }

    setNodes((current) => [...current, nextNode])
    setSelectedNodeId(id)
  }

  function loadTemplate(templateId: string) {
    if (isBuiltInTemplateId(templateId)) {
      const template = createConfiguratorTemplate(templateId)
      setNodes(templateId === "koza_scene_to_directing_mvp"
        ? applyKozaDirectingDefaults(template.nodes, characters, locations, storyHistory, directorVision)
        : template.nodes)
      setEdges(template.edges)
      setActiveTemplateId(templateId)
      setSelectedNodeId(template.nodes[0]?.id ?? null)
      setTemplateMessage("Шаблон загружен")
    } else {
      const template = customTemplates.find((entry) => entry.id === templateId)
      if (!template) {
        return
      }

      setNodes(cloneNodes(template.nodes))
      setEdges(cloneEdges(template.edges))
      setActiveTemplateId(template.id)
      setSelectedNodeId(template.nodes[0]?.id ?? null)
      setTemplateDraftName(template.label)
      setTemplateDraftDescription(template.description)
      setTemplateMessage(`Загружен пользовательский шаблон: ${template.label}`)
    }

    setConnectionMessage(null)
    setRunStatus("idle")
    setRunMessage(
      templateId === "template_777"
        ? "Pre-prompt сборка загружена"
        : templateId === "test_luc_besson"
          ? "Шаблон ЛЮК БЕССОН загружен"
          : "Шаблон загружен",
    )
    setRunModelId("")
    setRuntimeOutputs({})
    setShotGenerationResults({})
    setShotGenerationStatus({})
    setShotGenerationErrors({})
    setWorkspaceMessage("Загружена исходная сборка шаблона")
  }

  async function saveCurrentWorkspace() {
    try {
      await writeWorkspaceState({
        version: 1,
        activeTemplateId,
        selectedNodeId,
        nodes,
        edges,
        runtimeOutputs,
        runStatus,
        runMessage,
        runModelId,
        templateDraftName,
        templateDraftDescription,
        shotGenerationResults,
      })
      setWorkspaceMessage("Сборка сохранена вручную")
    } catch {
      setWorkspaceMessage("Не удалось сохранить сборку")
    }
  }

  async function resetWorkspaceToTemplateStart() {
    const templateId = activeTemplateId

    if (isBuiltInTemplateId(templateId)) {
      const template = createConfiguratorTemplate(templateId)
      setNodes(templateId === "koza_scene_to_directing_mvp"
        ? applyKozaDirectingDefaults(template.nodes, characters, locations, storyHistory, directorVision)
        : template.nodes)
      setEdges(template.edges)
      setSelectedNodeId(template.nodes[0]?.id ?? null)
    } else {
      const template = customTemplates.find((entry) => entry.id === templateId)
      if (!template) {
        return
      }

      setNodes(cloneNodes(template.nodes))
      setEdges(cloneEdges(template.edges))
      setSelectedNodeId(template.nodes[0]?.id ?? null)
    }

    setConnectionMessage(null)
    setRunStatus("idle")
    setRunMessage("Сборка сброшена к стартовому состоянию шаблона")
    setRunModelId("")
    setRuntimeOutputs({})
    setActiveStages([])
    setCompletedStages([])
    setShotGenerationResults({})
    setShotGenerationStatus({})
    setShotGenerationErrors({})
    await clearWorkspaceState().catch(() => undefined)
    setWorkspaceMessage("Сохранённая сборка очищена, загружен стартовый шаблон")
  }

  function saveCurrentTemplate() {
    const label = templateDraftName.trim()
    const description = templateDraftDescription.trim() || "Custom graph saved from the configurator canvas."

    if (!label) {
      setTemplateMessage("Укажи имя шаблона перед сохранением")
      return
    }

    const templateId = `custom-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || Date.now().toString(36)}`
    const nextTemplate: CustomConfiguratorTemplate = {
      id: templateId,
      label,
      description,
      nodes: cloneNodes(nodes),
      edges: cloneEdges(edges),
    }

    const nextTemplates = [
      ...customTemplates.filter((template) => template.id !== templateId && template.label !== label),
      nextTemplate,
    ]

    setCustomTemplates(nextTemplates)
    writeCustomTemplates(nextTemplates)
    setActiveTemplateId(templateId)
    setTemplateMessage(`Шаблон сохранён: ${label}`)
  }

  function resetTemplateDraft() {
    const currentTemplate = allTemplates.find((template) => template.id === activeTemplateId)

    setTemplateDraftName(currentTemplate?.label ?? "My Template")
    setTemplateDraftDescription(currentTemplate?.description ?? "Custom graph saved from the configurator canvas.")
    setTemplateMessage("Черновик шаблона сброшен")
  }

  function deleteCurrentTemplate() {
    if (isBuiltInTemplateId(activeTemplateId)) {
      setTemplateMessage("Базовый шаблон удалить нельзя")
      return
    }

    const nextTemplates = customTemplates.filter((template) => template.id !== activeTemplateId)
    setCustomTemplates(nextTemplates)
    writeCustomTemplates(nextTemplates)
    setActiveTemplateId("template_777")
    setTemplateMessage("Пользовательский шаблон удалён")
    loadTemplate("template_777")
  }

  async function handleRun() {
    if (runStatus === "running") {
      return
    }

    if (!canRunActiveFlow) {
      setRunStatus("idle")
      setRunMessage(`Для запуска не хватает нод: ${activeMissingTitles.join(", ")}`)
      return
    }

    setRunStatus("running")
    setRunMessage(
      isPrePromptTemplate
        ? "Собираю Director Vision..."
        : isLucBessonTemplate
          ? "Строю shot breakdown и image prompt consistency pack..."
          : "Выполняю узлы KOZA Directing MVP...",
    )
    setRuntimeOutputs({})
    setActiveStages([])
    setCompletedStages([])

    try {
      const runner = isPrePromptTemplate
        ? runTemplate777PrePrompt
        : isLucBessonTemplate
          ? runLucBessonTemplate
          : runKozaDirectingMvp
      const result = await runner(
        nodes,
        (stage, output) => {
          setActiveStages((current) => current.filter((entry) => entry !== stage))
          setCompletedStages((current) => current.includes(stage) ? current : [...current, stage])
          setRuntimeOutputs((current) => ({
            ...current,
            [stage]: JSON.stringify(output, null, 2),
          }))
          setRunMessage(`Готов этап: ${stage}`)
        },
        (stage) => {
          setActiveStages((current) => current.includes(stage) ? current : [...current, stage])
          setRunMessage(`Ноды взаимодействуют: ${stage}`)
        },
      )

      if (isLucBessonTemplate && result.graphPatch) {
        const merged = mergeBessonGraphPatch(nodes, edges, result.graphPatch)
        setNodes(merged.nodes)
        setEdges(merged.edges)
        setSelectedNodeId(
          result.graphPatch.nodes.find((node) => node.data.kind === "generator")?.id
          ?? result.graphPatch.nodes[0]?.id
          ?? null,
        )
        setTimeout(() => {
          flowInstance?.fitView({ duration: 500, padding: 0.14 })
        }, 0)
      }

      setRunModelId(result.modelId)
      setRunStatus("done")
      setRunMessage(
        isPrePromptTemplate
          ? "Director Vision собран"
          : isLucBessonTemplate
            ? "Besson shot pack и image prompts собраны"
            : "ScenePacket собран",
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setActiveStages([])
      setRunStatus("error")
      setRunMessage(message)
    }
  }

  async function handleGenerateBessonShot(shot: BessonPromptShot) {
    const generatorNode = nodes.find((node) => node.data.kind === "generator" && node.data.title === `${shot.label} Generator`)
    if (generatorNode) {
      await handleGenerateGeneratorNode(generatorNode.id, shot)
      return
    }

    const prompt = shot.imagePrompt.trim()
    if (!prompt) {
      setShotGenerationStatus((current) => ({ ...current, [shot.shotId]: "error" }))
      setShotGenerationErrors((current) => ({ ...current, [shot.shotId]: "Shot prompt is empty" }))
      return
    }

    const model = resolveBessonShotModel(nodes, shot.label)
    const endpoint = model === "gpt-image" ? "/api/gpt-image" : "/api/nano-banana"
    const referenceImages = collectDynamicBessonReferencePreviews(nodes, shot)
      .map((reference) => reference.imageUrl)
      .slice(0, shot.maxRefCount > 0 ? shot.maxRefCount : undefined)

    setShotGenerationStatus((current) => ({ ...current, [shot.shotId]: "running" }))
    setShotGenerationErrors((current) => ({ ...current, [shot.shotId]: "" }))

    try {
      const imageUrl = await generateImageFromNode({ endpoint, model, prompt, referenceImages })

      setShotGenerationResults((current) => ({
        ...current,
        [shot.shotId]: {
          imageUrl,
          prompt,
          model,
        },
      }))
      setShotGenerationStatus((current) => ({ ...current, [shot.shotId]: "done" }))

      void saveGeneratedImageToLibrary(imageUrl, shot.label, prompt, model)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setShotGenerationStatus((current) => ({ ...current, [shot.shotId]: "error" }))
      setShotGenerationErrors((current) => ({ ...current, [shot.shotId]: message }))
    }
  }

  async function handleGenerateConfig() {
    const prompt = generationPrompt.trim()

    if (!prompt || generationStatus === "running") {
      return
    }

    setGenerationStatus("running")
    setGenerationMessage("Агент собирает конфигурацию по правилам...")
    setGenerationWarnings([])

    try {
      const response = await fetch("/api/configurator-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      })

      const payload = await response.json().catch(() => null) as {
        error?: string
        modelId?: string
        nodes?: ConfiguratorFlowNode[]
        edges?: ConfiguratorFlowEdge[]
        warnings?: string[]
      } | null

      if (!response.ok || !payload?.nodes || !payload?.edges) {
        throw new Error(payload?.error || `Configurator generation failed: ${response.status}`)
      }

      setNodes(payload.nodes)
      setEdges(payload.edges)
      setSelectedNodeId(payload.nodes[0]?.id ?? null)
      setConnectionMessage(null)
      setRunStatus("idle")
      setRunMessage("Сгенерированный граф загружен")
      setRunModelId(payload.modelId || "")
      setRuntimeOutputs({})
      setActiveStages([])
      setCompletedStages([])
      setGenerationWarnings(payload.warnings ?? [])
      setGenerationStatus("done")
      setGenerationMessage(`Конфиг сгенерирован${payload.modelId ? ` через ${payload.modelId}` : ""}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setGenerationStatus("error")
      setGenerationMessage(message)
    }
  }

  function removeSelectedNode() {
    if (!selectedNodeId) {
      return
    }

    setNodes((current) => current.filter((node) => node.id !== selectedNodeId))
    setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId))
    setSelectedNodeId(null)
  }

  function handleNodesChange(changes: NodeChange[]) {
    setNodes((current) => applyConfiguratorNodeChanges(changes, current))
  }

  function handleEdgesChange(changes: EdgeChange[]) {
    setEdges((current) => applyEdgeChanges(changes, current))
  }

  function handleConnect(connection: Connection) {
    const sourceNode = nodes.find((node) => node.id === connection.source)
    const targetNode = nodes.find((node) => node.id === connection.target)

    if (!sourceNode || !targetNode || sourceNode.id === targetNode.id) {
      setConnectionMessage("Connection ignored: source and target must be different nodes.")
      return
    }

    if (!canConnectNodes(sourceNode.data, targetNode.data)) {
      setConnectionMessage("This connection type is blocked. Sources can flow into AI, generator, or output nodes only.")
      return
    }

    if (edges.some((edge) => edge.source === sourceNode.id && edge.target === targetNode.id)) {
      setConnectionMessage("These nodes are already connected.")
      return
    }

    const label = buildConnectionLabel(sourceNode.data, targetNode.data)
    setConnectionMessage(null)
    setEdges((current) => addEdge({ ...connection, id: makeId("edge"), label }, current))
  }

  function handlePhotoUpload(nodeId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      updateNode(nodeId, (data) => data.kind === "photo"
        ? { ...data, imageUrl: typeof reader.result === "string" ? reader.result : "" }
        : data)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="grid min-h-screen grid-cols-[minmax(0,1fr)_380px] bg-[radial-gradient(circle_at_top_left,rgba(212,168,83,0.14),transparent_28%),linear-gradient(180deg,#161310_0%,#0f0d0b_100%)] text-[#E7E1DB]">
        <div className="relative min-h-180 border-r border-white/8">
          <div className="absolute left-4 top-4 z-10 flex w-52 flex-col gap-2">
            <Link href="/dev" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-sm text-white/72 backdrop-blur-xl transition-colors hover:bg-black/60">
              <ArrowLeft className="h-4 w-4" />
              Back to Dev
            </Link>

            <div className="rounded-2xl border border-white/10 bg-black/45 p-2 backdrop-blur-xl">
              <div className="mb-2 px-2 text-[10px] uppercase tracking-[0.16em] text-white/28">Canvas Tools</div>
              <div className="flex flex-col gap-2">
                <ToolbarButton icon={ImageIcon} label="Add Photo" onClick={() => addNode("photo")} compact />
                <ToolbarButton icon={Type} label="Add Prompt" onClick={() => addNode("prompt")} compact />
                <ToolbarButton icon={Bot} label="Add AI" onClick={() => addNode("ai")} compact />
                <ToolbarButton icon={WandSparkles} label="Add Generator" onClick={() => addNode("generator")} compact />
                <ToolbarButton icon={ScanSearch} label="Add Output" onClick={() => addNode("output")} compact />
                <ToolbarButton icon={Trash2} label="Clear All Text" onClick={clearAllText} tone="danger" compact />
                <ToolbarButton icon={Trash2} label="Delete Node" onClick={removeSelectedNode} disabled={!selectedNodeId} tone="danger" compact />
                <ToolbarButton icon={BookOpen} label={`Library (${configuratorLibraryFiles.length})`} onClick={() => setIsLibraryOpen((v) => !v)} compact />
              </div>
            </div>
          </div>

          <div className="absolute right-4 top-4 z-10 flex max-w-[min(56vw,760px)] flex-col items-end gap-2">
            <ToolbarButton
              icon={Play}
              label={runStatus === "running" ? "Running..." : isPrePromptTemplate ? "Build Director Vision" : "Run MVP"}
              onClick={() => void handleRun()}
              disabled={runStatus === "running"}
            />

            <div className="w-[min(56vw,760px)] rounded-2xl border border-white/10 bg-black/45 p-3 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/28">Workspace</p>
                  <p className="mt-1 text-sm font-medium text-white/84">{activeTemplate.label}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAgentPanelOpen((current) => !current)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-white/62 transition-colors hover:bg-black/30 hover:text-white"
                  >
                    {isAgentPanelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    Agent
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsWorkspacePanelOpen((current) => !current)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-white/62 transition-colors hover:bg-black/30 hover:text-white"
                  >
                    {isWorkspacePanelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {isWorkspacePanelOpen ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/48">
                <span className="rounded-full border border-white/8 bg-black/20 px-2 py-1">status: {runStatus}</span>
                <span className="rounded-full border border-white/8 bg-black/20 px-2 py-1">model: {runModelId || "auto"}</span>
                <span className="rounded-full border border-white/8 bg-black/20 px-2 py-1">template: {activeTemplateId}</span>
              </div>

              <div className="mt-2 text-[12px] leading-relaxed text-white/60">
                {isPrePromptTemplate && !hasRuntimeOutputs
                  ? "Сборка заканчивается на Director Vision."
                  : isLucBessonTemplate && !hasRuntimeOutputs
                    ? "Сборка заканчивается на Besson Prompt Pack и создаёт shot-based image nodes справа на канвасе."
                    : runMessage}
              </div>

              {!canRunActiveFlow ? (
                <div className="mt-2 rounded-xl border border-amber-500/20 bg-amber-950/30 px-3 py-2 text-[12px] leading-relaxed text-amber-100">
                  {isPrePromptTemplate
                    ? "Текущий граф не runnable для Director Vision flow."
                    : isLucBessonTemplate
                      ? "Текущий граф не runnable для Luc Besson flow."
                      : "Текущий граф не runnable для KOZA MVP."} Не хватает: {activeMissingTitles.join(", ")}.
                </div>
              ) : null}

              {hasRuntimeOutputs ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <ToolbarButton icon={Trash2} label="Clear Outputs" onClick={clearRunOutputs} tone="danger" compact />
                  {isLucBessonTemplate ? (
                    <ToolbarButton
                      icon={Sparkles}
                      label={activeProjectId ? `Apply To ${activeProjectName}` : "Open Project First"}
                      onClick={handleApplyLucBessonToProject}
                      disabled={!activeProjectId || !bessonPromptPack}
                      compact
                    />
                  ) : null}
                </div>
              ) : null}

              {isWorkspacePanelOpen ? (
                <div className="mt-3 flex flex-col gap-3 border-t border-white/8 pt-3">
                  <select
                    className={`${fieldClassName} bg-black/15`}
                    value={activeTemplateId}
                    onChange={(event) => loadTemplate(event.target.value)}
                  >
                    {allTemplates.map((template) => (
                      <option key={template.id} value={template.id}>{template.label}</option>
                    ))}
                  </select>
                  <p className="text-[12px] leading-relaxed text-white/45">{activeTemplate.description}</p>
                  <div className="grid gap-2 lg:grid-cols-[minmax(180px,0.9fr)_minmax(0,1.1fr)_auto_auto_auto_auto_auto]">
                    <input
                      className={fieldClassName}
                      value={templateDraftName}
                      onChange={(event) => setTemplateDraftName(event.target.value)}
                      placeholder="Template name"
                    />
                    <input
                      className={fieldClassName}
                      value={templateDraftDescription}
                      onChange={(event) => setTemplateDraftDescription(event.target.value)}
                      placeholder="Short description"
                    />
                    <ToolbarButton icon={Plus} label="Save" onClick={saveCurrentTemplate} compact />
                    <ToolbarButton icon={WandSparkles} label="Save Workspace" onClick={() => void saveCurrentWorkspace()} compact />
                    <ToolbarButton icon={Trash2} label="Reset Graph" onClick={() => void resetWorkspaceToTemplateStart()} tone="danger" compact />
                    <ToolbarButton icon={ChevronDown} label="Reset" onClick={resetTemplateDraft} compact />
                    <ToolbarButton icon={Trash2} label="Delete Template" onClick={deleteCurrentTemplate} disabled={isBuiltInTemplateId(activeTemplateId)} tone="danger" compact />
                  </div>
                  <p className="text-[12px] leading-relaxed text-white/48">{templateMessage}</p>
                  <p className="text-[12px] leading-relaxed text-white/48">{workspaceMessage}</p>

                  {isAgentPanelOpen ? (
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                      <div>
                        <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-white/32">Generate From Prompt</div>
                        <textarea
                          className={fieldClassName}
                          rows={4}
                          value={generationPrompt}
                          onChange={(event) => setGenerationPrompt(event.target.value)}
                          placeholder="Опиши, какие ноды, какие Bible-блоки и какие выходы должен собрать агент."
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          <ToolbarButton
                            icon={WandSparkles}
                            label={generationStatus === "running" ? "Generating..." : "Generate Config"}
                            onClick={() => void handleGenerateConfig()}
                            disabled={generationStatus === "running"}
                            compact
                          />
                          <span className="rounded-full border border-white/8 bg-black/20 px-2 py-1 text-[11px] text-white/48">
                            {generationMessage}
                          </span>
                        </div>
                        {generationWarnings.length > 0 ? (
                          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-950/35 p-3 text-[12px] leading-relaxed text-amber-100">
                            {generationWarnings.map((warning) => (
                              <p key={warning}>{warning}</p>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-xl border border-white/8 bg-black/15 p-3 text-[12px] leading-relaxed text-white/58">
                        <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-white/32">Agent Rules</div>
                        <ul className="space-y-2">
                          {CONFIGURATOR_AGENT_RULE_SUMMARY.map((rule) => (
                            <li key={rule}>{rule}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {connectionMessage ? (
            <div className="absolute left-60 top-4 z-10 max-w-sm rounded-2xl border border-amber-500/20 bg-amber-950/60 px-4 py-3 text-[12px] leading-relaxed text-amber-100">
              {connectionMessage}
            </div>
          ) : null}

          {isLibraryOpen ? (
            <ConfiguratorLibraryPanel
              files={configuratorLibraryFiles}
              onClose={() => setIsLibraryOpen(false)}
              onRemove={removeLibraryFile}
            />
          ) : null}

          <MiniRuntimeInspector
            isOpen={isMiniInspectorOpen}
            onToggle={() => setIsMiniInspectorOpen((current) => !current)}
            runStatus={runStatus}
            runMessage={runMessage}
            selectedNodeTitle={selectedNode?.data.title ?? null}
            activeStages={activeStages}
            completedCount={completedStages.length}
            hasFinalOutput={Boolean(runtimeOutputs[finalOutputKey])}
            finalOutputLabel={finalOutputLabel}
          />

          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            onInit={setFlowInstance}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            fitView
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              style: { stroke: "rgba(231,225,219,0.28)", strokeWidth: 1.4 },
              labelStyle: { fill: "rgba(231,225,219,0.72)", fontSize: 11 },
              labelBgStyle: { fill: "rgba(9,8,7,0.92)", fillOpacity: 0.92 },
            }}
          >
            <MiniMap
              pannable
              zoomable
              style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.08)" }}
              nodeStrokeWidth={3}
            />
            <Background variant={BackgroundVariant.Dots} color="rgba(255,255,255,0.08)" gap={20} size={1.2} />
          </ReactFlow>
        </div>

        <aside className="flex min-h-0 flex-col bg-[#12100d]/92">
          <div className="border-b border-white/8 px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/30">Inspector</p>
            <h2 className="mt-1 text-base font-semibold">{selectedNode ? selectedNode.data.title : "Select a node"}</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {!selectedNode ? (
              <EmptyInspector />
            ) : (
              <div className="flex flex-col gap-4">
                <Card title="Node Meta" description="Обычный пользователь должен понимать узел без чтения кода: что это, что принимает, что выдаёт.">
                  <FieldLabel label="Title" />
                  <input
                    className={fieldClassName}
                    value={selectedNode.data.title}
                    onChange={(event) => updateNode(selectedNode.id, (data) => ({ ...data, title: event.target.value }))}
                  />
                </Card>

                {selectedNode.data.kind === "photo" ? (
                  <PhotoInspector
                    data={selectedNode.data}
                    onUpload={(event) => handlePhotoUpload(selectedNode.id, event)}
                    onChange={(patch) => updateNode(selectedNode.id, (data) => data.kind === "photo" ? { ...data, ...patch } : data)}
                  />
                ) : null}

                {selectedNode.data.kind === "prompt" ? (
                  <PromptInspector
                    data={selectedNode.data}
                    onChange={(patch) => updateNode(selectedNode.id, (data) => data.kind === "prompt" ? { ...data, ...patch } : data)}
                  />
                ) : null}

                {selectedNode.data.kind === "ai" ? (
                  <AiInspector
                    data={selectedNode.data}
                    onChange={(patch) => updateNode(selectedNode.id, (data) => data.kind === "ai" ? { ...data, ...patch } : data)}
                  />
                ) : null}

                {selectedNode.data.kind === "generator" ? (
                  <GeneratorInspector
                    data={selectedNode.data}
                    compiled={selectedGeneratorRequest}
                    bessonShot={selectedBessonPromptShot}
                    generationResult={shotGenerationResults[selectedBessonPromptShot?.shotId ?? selectedNode.id] ?? null}
                    generationStatus={shotGenerationStatus[selectedBessonPromptShot?.shotId ?? selectedNode.id] ?? "idle"}
                    generationError={shotGenerationErrors[selectedBessonPromptShot?.shotId ?? selectedNode.id] ?? ""}
                    onGenerate={() => void handleGenerateGeneratorNode(selectedNode.id, selectedBessonPromptShot)}
                    onChange={(patch) => updateNode(selectedNode.id, (data) => data.kind === "generator" ? { ...data, ...patch } : data)}
                  />
                ) : null}

                {selectedNode.data.kind === "output" ? (
                  <OutputInspector compiled={selectedCompiled} imageUrl={selectedNode.data.imageUrl} title={selectedNode.data.title} />
                ) : null}

                {shouldShowSelectedRuntimeJson ? (
                  <Card title="Execution Output" description="Последний реальный результат для выбранной ноды. Это уже не deterministic preview, а ответ раннера.">
                    <pre className="whitespace-pre-wrap rounded-xl border border-emerald-500/16 bg-emerald-500/8 p-3 text-[12px] leading-relaxed text-emerald-50">{selectedRuntimeOutput}</pre>
                  </Card>
                ) : null}

                {isPrePromptTemplate && directorVisionPacket ? (
                  <DirectorVisionShotsCard packet={directorVisionPacket} />
                ) : null}

                {isLucBessonTemplate && bessonShotPacket ? (
                  <BessonShotPlannerCard packet={bessonShotPacket} />
                ) : null}

                {isLucBessonTemplate && bessonPromptPack ? (
                  <BessonPromptPackCard
                    pack={bessonPromptPack}
                    referenceCount={collectPhotoNodeImages(nodes).length}
                    generationResults={shotGenerationResults}
                    generationStatus={shotGenerationStatus}
                    generationErrors={shotGenerationErrors}
                    onGenerateShot={(shot) => void handleGenerateBessonShot(shot)}
                  />
                ) : null}

                <Card title="Migration Strategy" description="Как переносить то, что уже есть в pipeline, не ломая UX для обычного пользователя.">
                  <ul className="space-y-2 text-[12px] leading-relaxed text-white/62">
                    <li>1. Использовать простые шаблоны как входную точку: Scene to Image и Reference Lock.</li>
                    <li>2. Под капотом привязывать существующие stage functions из pipeline как backend для AI nodes.</li>
                    <li>3. Оставить Pipeline Blueprint для продвинутой настройки и внутренних экспериментов.</li>
                    <li>4. Скрывать лишние технические поля за presets и human-readable labels.</li>
                  </ul>
                </Card>

                {runtimeOutputs[finalOutputKey] && !isPrePromptTemplate ? (
                  <Card title={finalOutputLabel} description={isPrePromptTemplate ? "Собранный directorial vision packet для текущего запуска." : "Собранный output пакета режиссуры для текущего запуска."}>
                    <pre className="whitespace-pre-wrap rounded-xl border border-[#D4A853]/16 bg-[#D4A853]/8 p-3 text-[12px] leading-relaxed text-[#F2E7CB]">{runtimeOutputs[finalOutputKey]}</pre>
                  </Card>
                ) : null}
              </div>
            )}
          </div>
        </aside>
    </div>
  )
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone = "default",
  compact = false,
}: {
  icon: typeof Plus
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: "default" | "danger"
  compact?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${compact ? "w-full justify-start px-3 py-2 text-[13px]" : "px-3 py-2 text-sm"} ${tone === "danger" ? "border-red-500/20 bg-red-500/10 text-red-200 hover:bg-red-500/15" : "border-white/10 bg-white/5 text-white/78 hover:bg-white/8"}`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function EmptyInspector() {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/3 p-4 text-sm leading-relaxed text-white/52">
      Выберите узел на канвасе. Соединения теперь делаются через handles на левой и правой стороне карточек.
      Для обычного пользователя достаточно шаблонов Scene to Image или Reference Lock. Pipeline Blueprint нужен, когда вы переносите весь старый pipeline в graph.
    </div>
  )
}

function MiniRuntimeInspector({
  isOpen,
  onToggle,
  runStatus,
  runMessage,
  selectedNodeTitle,
  activeStages,
  completedCount,
  hasFinalOutput,
  finalOutputLabel,
}: {
  isOpen: boolean
  onToggle: () => void
  runStatus: "idle" | "running" | "done" | "error"
  runMessage: string
  selectedNodeTitle: string | null
  activeStages: KozaDirectingStageName[]
  completedCount: number
  hasFinalOutput: boolean
  finalOutputLabel: string
}) {
  return (
    <div className="absolute bottom-4 left-5 z-10 max-w-sm">
      <button
        type="button"
        onClick={onToggle}
        className="mb-2 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-white/72 backdrop-blur-xl transition-colors hover:bg-black/55"
      >
        {isOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        {isOpen ? "Hide Mini Inspector" : "Show Mini Inspector"}
      </button>

      {isOpen ? (
        <div className="rounded-2xl border border-white/10 bg-black/45 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-white/34">
            <Activity className={`h-4 w-4 ${runStatus === "running" ? "animate-pulse text-[#D4A853]" : "text-white/50"}`} />
            Mini Inspector
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/60">
            <span className="rounded-full border border-white/8 bg-white/5 px-2 py-1">status: {runStatus}</span>
            <span className="rounded-full border border-white/8 bg-white/5 px-2 py-1">completed: {completedCount}</span>
            <span className="rounded-full border border-white/8 bg-white/5 px-2 py-1">{finalOutputLabel}: {hasFinalOutput ? "ready" : "pending"}</span>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-white/82">{runMessage}</p>
          <div className="mt-3 space-y-2 text-[12px] leading-relaxed text-white/56">
            <p>Selected: <span className="text-white/82">{selectedNodeTitle ?? "none"}</span></p>
            <p>Live stages: <span className="text-white/82">{activeStages.length > 0 ? activeStages.join(", ") : "none"}</span></p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Card({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/8 bg-white/3 p-4 backdrop-blur-xl">
      <div className="mb-3">
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/28">{title}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-white/48">{description}</p>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

function FieldLabel({ label }: { label: string }) {
  return <label className="text-[10px] uppercase tracking-[0.14em] text-white/34">{label}</label>
}

function PhotoInspector({
  data,
  onUpload,
  onChange,
}: {
  data: ConfiguratorPhotoNodeData
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void
  onChange: (patch: Partial<ConfiguratorPhotoNodeData>) => void
}) {
  return (
    <Card title="Photo Node" description="Референс-изображение не исполняет AI. Оно фиксирует внешний вид, фактуру, props и continuity-якоря.">
      <FieldLabel label="Preview" />
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/14 bg-black/15 px-4 py-5 text-center text-sm text-white/52 hover:border-white/22">
        <ImageIcon className="h-5 w-5" />
        <span>{data.imageUrl ? "Replace image" : "Upload reference image"}</span>
        <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
      </label>
      {data.imageUrl ? <img src={data.imageUrl} alt={data.title} className="h-40 w-full rounded-xl border border-white/10 object-cover" /> : null}

      <FieldLabel label="Caption" />
      <textarea className={fieldClassName} rows={3} value={data.caption} onChange={(event) => onChange({ caption: event.target.value })} />

      <FieldLabel label="Locked Details" />
      <textarea className={fieldClassName} rows={5} value={data.lockedDetails} onChange={(event) => onChange({ lockedDetails: event.target.value })} />
    </Card>
  )
}

function PromptInspector({
  data,
  onChange,
}: {
  data: ConfiguratorPromptNodeData
  onChange: (patch: Partial<ConfiguratorPromptNodeData>) => void
}) {
  return (
    <Card title="Prompt Node" description="Чистый текстовый источник. Здесь должна жить сама сцена, задача или смысловой блок без лишней оркестрации.">
      <FieldLabel label="Prompt Text" />
      <textarea className={fieldClassName} rows={6} value={data.promptText} onChange={(event) => onChange({ promptText: event.target.value })} />

      <FieldLabel label="Detail Hints" />
      <textarea className={fieldClassName} rows={4} value={data.detailHints} onChange={(event) => onChange({ detailHints: event.target.value })} />
    </Card>
  )
}

function AiInspector({
  data,
  onChange,
}: {
  data: ConfiguratorAiNodeData
  onChange: (patch: Partial<ConfiguratorAiNodeData>) => void
}) {
  return (
    <Card title="AI Node" description="Это настраиваемая трансформация. Узел не привязан к конкретному агенту проекта: он описывает роль, режим и точный instruction, что AI должен сделать.">
      <FieldLabel label="Role" />
      <input className={fieldClassName} value={data.roleLabel} onChange={(event) => onChange({ roleLabel: event.target.value })} />

      <FieldLabel label="Mode" />
      <select className={fieldClassName} value={data.mode} onChange={(event) => onChange({ mode: event.target.value as AiNodeMode })}>
        <option value="detail_guard">detail_guard</option>
        <option value="style_director">style_director</option>
        <option value="merge">merge</option>
        <option value="rewrite">rewrite</option>
      </select>

      <FieldLabel label="What It Does" />
      <textarea className={fieldClassName} rows={6} value={data.instruction} onChange={(event) => onChange({ instruction: event.target.value })} />
    </Card>
  )
}

function GeneratorInspector({
  data,
  compiled,
  bessonShot,
  generationResult,
  generationStatus,
  generationError,
  onGenerate,
  onChange,
}: {
  data: ConfiguratorGeneratorNodeData
  compiled: CompiledGeneratorRequest | null
  bessonShot?: BessonPromptShot | null
  generationResult?: ShotGenerationResult | null
  generationStatus?: "idle" | "running" | "done" | "error"
  generationError?: string
  onGenerate?: () => void
  onChange: (patch: Partial<ConfiguratorGeneratorNodeData>) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card title="Generator Node" description="Terminal-нода генерации. Здесь обычный пользователь выбирает image system, а upstream graph подаёт уже собранный prompt.">
        <FieldLabel label="System" />
        <select className={fieldClassName} value={data.system} onChange={(event) => onChange({ system: event.target.value as ImageGenModel })}>
          <option value="gpt-image">gpt-image</option>
          <option value="nano-banana">nano-banana</option>
          <option value="nano-banana-2">nano-banana-2</option>
          <option value="nano-banana-pro">nano-banana-pro</option>
        </select>

        <div className="grid grid-cols-2 gap-3">
          <Metric label="Sources" value={String(compiled?.sourceNodeIds.length ?? 0)} />
          <Metric label="Warnings" value={String(compiled?.warnings.length ?? 0)} />
        </div>

        {data.referencePreviews && data.referencePreviews.length > 0 ? (
          <div className="space-y-2">
            <FieldLabel label="Linked Images" />
            <div className="flex gap-2 overflow-x-auto pb-1">
              {data.referencePreviews.map((reference) => (
                <div key={reference.id} className="w-20 shrink-0">
                  <img src={reference.imageUrl} alt={reference.title} className="h-16 w-full rounded-lg border border-white/10 object-cover" />
                  <p className="mt-1 truncate text-[10px] text-white/48">{reference.title}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {(data.shotActionText || data.shotDirectorNote || data.shotCameraNote) ? (
          <div className="space-y-2">
            <FieldLabel label="Shot Summary" />
            {data.shotActionText ? <p className="text-[12px] leading-relaxed text-white/64"><span className="text-white/38">action:</span> {data.shotActionText}</p> : null}
            {data.shotDirectorNote ? <p className="text-[12px] leading-relaxed text-white/64"><span className="text-white/38">director:</span> {data.shotDirectorNote}</p> : null}
            {data.shotCameraNote ? <p className="text-[12px] leading-relaxed text-white/64"><span className="text-white/38">camera:</span> {data.shotCameraNote}</p> : null}
          </div>
        ) : null}

        {onGenerate ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onGenerate}
              disabled={generationStatus === "running"}
              className="rounded-xl border border-[#8b5cf6]/25 bg-[#8b5cf6]/12 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#E8DEFF] transition-colors hover:bg-[#8b5cf6]/18 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generationStatus === "running" ? "Rendering..." : generationResult ? "Render Again" : "Render Image"}
            </button>
            <span className="text-[11px] leading-relaxed text-white/48">
              {bessonShot && bessonShot.selectedRefTitles.length > 0
                ? `refs: ${bessonShot.selectedRefTitles.join(", ")}`
                : data.referencePreviews && data.referencePreviews.length > 0
                  ? `refs: ${data.referencePreviews.map((reference) => reference.title).join(", ")}`
                  : "refs: auto / none"}
            </span>
          </div>
        ) : null}

        {generationError ? (
          <div className="rounded-xl border border-red-500/18 bg-red-950/35 px-3 py-2 text-[12px] leading-relaxed text-red-100/88">
            {generationError}
          </div>
        ) : null}
      </Card>

      <Card title="Generation Request" description="Это preview запроса, который можно будет позже отправлять в существующий pipeline image backend.">
        <pre className="whitespace-pre-wrap rounded-xl border border-[#8b5cf6]/16 bg-[#8b5cf6]/8 p-3 text-[12px] leading-relaxed text-[#E8DEFF]">{compiled?.prompt ?? "Connect upstream nodes to prepare a generation request."}</pre>
      </Card>

      {generationResult ? (
        <Card title="Rendered Image" description="Последний результат для выбранного generator node.">
          <img src={generationResult.imageUrl} alt={data.title} className="aspect-video w-full rounded-xl border border-white/8 object-cover" />
          <p className="text-[11px] leading-relaxed text-white/48">model: {generationResult.model}</p>
        </Card>
      ) : null}
    </div>
  )
}

function OutputInspector({ compiled, imageUrl, title }: { compiled: CompiledPromptResult | null; imageUrl?: string; title: string }) {
  return (
    <div className="flex flex-col gap-4">
      {imageUrl ? (
        <Card title="Rendered Image" description="Финальная image-нода в конце цепочки. Здесь виден последний сгенерированный результат для этого блока.">
          <img src={imageUrl} alt={title} className="aspect-video w-full rounded-xl border border-white/8 object-cover" />
        </Card>
      ) : null}

      <Card title="Output Summary" description="Финальный prompt собирается детерминированно из связанных узлов. Это позволяет сначала найти правильную конфигурацию, а уже потом подключать исполнение.">
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Sources" value={String(compiled?.sourceNodeIds.length ?? 0)} />
          <Metric label="Warnings" value={String(compiled?.warnings.length ?? 0)} />
        </div>
      </Card>

      {compiled?.warnings.length ? (
        <Card title="Warnings" description="Эти сигналы показывают, почему на выходе prompt может быть слабым или недоопределённым.">
          {compiled.warnings.map((warning) => (
            <div key={warning} className="rounded-xl border border-amber-500/18 bg-amber-950/35 px-3 py-2 text-sm text-amber-100/88">
              {warning}
            </div>
          ))}
        </Card>
      ) : null}

      {compiled?.sections.map((section) => (
        <Card key={section.title} title={section.title} description="Секция финальной сборки prompt.">
          <pre className="whitespace-pre-wrap rounded-xl border border-white/8 bg-black/20 p-3 text-[12px] leading-relaxed text-white/72">{section.content}</pre>
        </Card>
      ))}

      <Card title="Final Prompt" description="Именно эту строку можно дальше отдавать image-model или отдельному AI-rewriter узлу.">
        <pre className="whitespace-pre-wrap rounded-xl border border-[#D4A853]/16 bg-[#D4A853]/8 p-3 text-[12px] leading-relaxed text-[#F2E7CB]">{compiled?.finalPrompt ?? "Connect sources to see the final prompt."}</pre>
      </Card>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-white/28">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white/82">{value}</p>
    </div>
  )
}

function DirectorVisionShotsCard({ packet }: { packet: DirectorVisionPacket }) {
  return (
    <Card title="Director Vision Shots" description="Справа показан тот же смысловой формат шотов, что и в основном проекте, но без photo/video prompts. Только разбор сцены и режиссёрские решения по кадрам.">
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Shots" value={String(packet.shots.length)} />
        <Metric label="Vision Rules" value={String(packet.visualRules.length + packet.stagingPrinciples.length)} />
      </div>

      <VisionMetaRow label="Philosophy" value={packet.philosophy} />
      <VisionMetaRow label="Emotional Axis" value={packet.emotionalAxis} />
      <VisionMetaRow label="Rhythm" value={packet.rhythmStrategy} />
      <VisionBulletRow label="Staging Principles" values={packet.stagingPrinciples} />
      <VisionBulletRow label="Visual Rules" values={packet.visualRules} />
      <VisionBulletRow label="Continuity Rules" values={packet.continuityRules} />
      <VisionBulletRow label="Director Notes" values={packet.directorNotes} />

      {packet.shots.length > 0 ? (
        <div className="flex flex-col gap-3">
          {packet.shots.map((shot, index) => (
            <DirectorVisionShotCard key={shot.shotId} shot={shot} index={index} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/18 bg-amber-950/35 px-3 py-2 text-sm text-amber-100/88">
          Система ещё не вернула shot breakdown. Запусти Build Director Vision ещё раз после обновлённого раннера.
        </div>
      )}

      {packet.recommendedNextStep ? <VisionMetaRow label="Next Step" value={packet.recommendedNextStep} /> : null}
    </Card>
  )
}

function DirectorVisionShotCard({ shot, index }: { shot: DirectorVisionShot; index: number }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#171512] p-3">
      <div className="flex items-center gap-2 border-b border-white/6 pb-2">
        <span className="text-[10px] font-semibold text-[#D4A853]">#{index + 1}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#E5E0DB]">{shot.label}</span>
        {shot.shotSize ? <span className="rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-cyan-100 border border-cyan-400/25 bg-cyan-500/10">{shot.shotSize}</span> : null}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <ShotInfoRow label="Shot Description" value={shot.shotDescription} tone="gold" />
        <ShotInfoRow label="Action" value={shot.actionText} />
        <ShotInfoRow label="Director Note" value={shot.directorNote} />
        <ShotInfoRow label="Camera Note" value={shot.cameraNote} />
        <ShotInfoRow label="Visual Description" value={shot.visualDescription} />
      </div>

      {(shot.shotType || shot.composition || shot.cameraMotion) ? (
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-white/6 bg-black/10 p-2">
          <MiniMeta label="Type" value={shot.shotType || "—"} />
          <MiniMeta label="Composition" value={shot.composition || "—"} />
          <MiniMeta label="Motion" value={shot.cameraMotion || "—"} />
        </div>
      ) : null}

      {shot.continuityNote ? <p className="mt-3 text-[10px] leading-relaxed text-white/35">{shot.continuityNote}</p> : null}
    </div>
  )
}

function BessonShotPlannerCard({ packet }: { packet: BessonShotPacket }) {
  return (
    <Card title="Besson Shot Planner" description="Shot-by-shot режиссёрский расклад по ТЗ: короткое действие, режиссёрское намерение и операторское решение на каждый кадр.">
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Shots" value={String(packet.shots.length || packet.shotCount)} />
        <Metric label="Location Lock" value={packet.locationLock ? "set" : "missing"} />
      </div>

      <VisionMetaRow label="Scene Style" value={packet.sceneStyle} />
      <VisionMetaRow label="Scene Logic" value={packet.sceneLogic} />
      <VisionMetaRow label="Location Lock" value={packet.locationLock} />

      <div className="flex flex-col gap-3">
        {packet.shots.map((shot, index) => (
          <BessonShotCard key={shot.shotId} shot={shot} index={index} />
        ))}
      </div>
    </Card>
  )
}

function BessonPromptPackCard({
  pack,
  referenceCount,
  generationResults,
  generationStatus,
  generationErrors,
  onGenerateShot,
}: {
  pack: BessonPromptPack
  referenceCount: number
  generationResults: Record<string, ShotGenerationResult>
  generationStatus: Record<string, "idle" | "running" | "done" | "error">
  generationErrors: Record<string, string>
  onGenerateShot: (shot: BessonPromptShot) => void
}) {
  return (
    <Card title="Besson Prompt Pack" description="Готовый consistency pack для image generation. Эти prompts одновременно выводятся в новые shot-based nodes на канвасе.">
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Prompt Shots" value={String(pack.shots.length)} />
        <Metric label="Reference Photos" value={String(referenceCount)} />
      </div>

      <VisionMetaRow label="Scene Base" value={pack.sceneBase} />
      <VisionMetaRow label="Light Lock" value={pack.lightLock} />
      <VisionMetaRow label="Style Lock" value={pack.styleLock} />
      <VisionBulletRow label="Validation Notes" values={pack.validationNotes} />

      <div className="rounded-xl border border-white/6 bg-black/10 px-3 py-2 text-[12px] leading-relaxed text-white/68">
        Все photo nodes с загруженными картинками уходят в финальную image generation как reference images. Для одного shot можно использовать несколько референсов сразу.
      </div>

      <div className="flex flex-col gap-3">
        {pack.shots.map((shot, index) => (
          <BessonPromptShotCard
            key={shot.shotId}
            shot={shot}
            index={index}
            result={generationResults[shot.shotId] ?? null}
            status={generationStatus[shot.shotId] ?? "idle"}
            error={generationErrors[shot.shotId] ?? ""}
            onGenerate={() => onGenerateShot(shot)}
          />
        ))}
      </div>
    </Card>
  )
}

function BessonShotCard({ shot, index }: { shot: BessonShot; index: number }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#171512] p-3">
      <div className="flex items-center gap-2 border-b border-white/6 pb-2">
        <span className="text-[10px] font-semibold text-[#D4A853]">#{index + 1}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#E5E0DB]">{shot.label}</span>
        {shot.shotSize ? <span className="rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-cyan-100 border border-cyan-400/25 bg-cyan-500/10">{shot.shotSize}</span> : null}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <ShotInfoRow label="Shot Description" value={shot.shotDescription} tone="gold" />
        <ShotInfoRow label="Action" value={shot.actionText} />
        <ShotInfoRow label="Director Note" value={shot.directorNote} />
        <ShotInfoRow label="Camera Note" value={shot.cameraNote} />
        <ShotInfoRow label="Visual Description" value={shot.visualDescription} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-white/6 bg-black/10 p-2">
        <MiniMeta label="Composition" value={shot.composition || "—"} />
        <MiniMeta label="Motion" value={shot.cameraMotion || "—"} />
        <MiniMeta label="Goal" value={shot.emotionalGoal || "—"} />
      </div>

      {(shot.actionState || shot.backgroundLock) ? (
        <div className="mt-3 flex flex-col gap-2">
          <ShotInfoRow label="Action State" value={shot.actionState} />
          <ShotInfoRow label="Background Lock" value={shot.backgroundLock} />
        </div>
      ) : null}
    </div>
  )
}

function BessonPromptShotCard({
  shot,
  index,
  result,
  status,
  error,
  onGenerate,
}: {
  shot: BessonPromptShot
  index: number
  result: ShotGenerationResult | null
  status: "idle" | "running" | "done" | "error"
  error: string
  onGenerate: () => void
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#171512] p-3">
      <div className="flex items-center gap-2 border-b border-white/6 pb-2">
        <span className="text-[10px] font-semibold text-[#D4A853]">#{index + 1}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#E5E0DB]">{shot.label}</span>
        <button
          type="button"
          onClick={onGenerate}
          disabled={status === "running"}
          className="rounded-lg border border-[#8b5cf6]/25 bg-[#8b5cf6]/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#E8DEFF] transition-colors hover:bg-[#8b5cf6]/18 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "running" ? "Generating" : result ? "Regenerate" : "Generate"}
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <ShotInfoRow label="Image Prompt" value={shot.imagePrompt} tone="gold" />
        <ShotInfoRow label="Action" value={shot.actionText} />
        <ShotInfoRow label="Director Note" value={shot.directorNote} />
        <ShotInfoRow label="Camera Note" value={shot.cameraNote} />
      </div>

      {shot.selectedRefTitles.length > 0 ? (
        <div className="mt-3 rounded-xl border border-white/6 bg-black/10 px-3 py-2">
          <p className="text-[9px] uppercase tracking-[0.12em] text-white/30">Selected Refs</p>
          {shot.maxRefCount > 0 ? <p className="mt-1 text-[11px] leading-relaxed text-white/46">max refs: {shot.maxRefCount}</p> : null}
          {shot.refReason ? <p className="mt-1 text-[11px] leading-relaxed text-white/46">{shot.refReason}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {shot.selectedRefTitles.map((title) => (
              <span key={title} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/72">{title}</span>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-xl border border-red-500/18 bg-red-950/35 px-3 py-2 text-[12px] leading-relaxed text-red-100/88">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-3 overflow-hidden rounded-2xl border border-white/8 bg-black/10">
          <img src={result.imageUrl} alt={shot.label} className="aspect-video w-full object-cover" />
          <div className="border-t border-white/6 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-white/38">
            model: {result.model}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ShotInfoRow({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "gold" }) {
  if (!value) {
    return null
  }

  return (
    <div className={`rounded-xl border px-3 py-2 ${tone === "gold" ? "border-[#D4A853]/16 bg-[#D4A853]/8" : "border-white/6 bg-black/10"}`}>
      <p className="text-[9px] uppercase tracking-[0.12em] text-white/30">{label}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-[#E5E0DB]">{value}</p>
    </div>
  )
}

function MiniMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/6 bg-white/3 px-2 py-1.5">
      <p className="text-[8px] uppercase tracking-[0.12em] text-white/28">{label}</p>
      <p className="mt-1 text-[10px] leading-snug text-white/74">{value}</p>
    </div>
  )
}

function VisionMetaRow({ label, value }: { label: string; value: string }) {
  if (!value) {
    return null
  }

  return (
    <div className="rounded-xl border border-white/6 bg-black/10 px-3 py-2">
      <p className="text-[9px] uppercase tracking-[0.12em] text-white/28">{label}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-white/78">{value}</p>
    </div>
  )
}

function VisionBulletRow({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) {
    return null
  }

  return (
    <div className="rounded-xl border border-white/6 bg-black/10 px-3 py-2">
      <p className="text-[9px] uppercase tracking-[0.12em] text-white/28">{label}</p>
      <div className="mt-2 flex flex-col gap-1">
        {values.map((value) => (
          <p key={value} className="text-[12px] leading-relaxed text-white/74">{value}</p>
        ))}
      </div>
    </div>
  )
}

function ConfiguratorLibraryPanel({
  files,
  onClose,
  onRemove,
}: {
  files: LibraryFile[]
  onClose: () => void
  onRemove: (id: string) => void
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  return (
    <div className="absolute bottom-4 left-4 z-20 flex w-85 max-h-[70vh] flex-col rounded-2xl border border-white/10 bg-[#12100d]/95 backdrop-blur-xl shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-[#D4A853]" />
          <span className="text-sm font-medium text-white/84">Configurator Library</span>
          <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-white/48">{files.length}</span>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-white/40 transition-colors hover:bg-white/8 hover:text-white/70">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-white/6 px-4 py-2 text-[11px] leading-relaxed text-white/42">
        Сюда автоматически попадают изображения, сгенерированные прямо в configurator.
      </div>

      {files.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12px] text-white/32">
          Сгенерированные изображения появятся здесь автоматически.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-2 gap-2">
            {files.map((file) => (
              <div key={file.id} className="group relative overflow-hidden rounded-xl border border-white/8 bg-black/20">
                {file.url ? (
                  <button type="button" className="block w-full" onClick={() => setPreviewUrl(file.url)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={file.thumbnailUrl || file.url}
                      alt={file.name}
                      className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </button>
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-black/30 text-[10px] text-white/24">
                    No preview
                  </div>
                )}
                <div className="px-2 py-1.5">
                  <p className="truncate text-[10px] leading-tight text-white/60" title={file.name}>{file.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {file.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-white/6 px-1.5 py-0.5 text-[8px] text-white/36">{tag}</span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(file.id)}
                  className="absolute right-1 top-1 rounded-lg bg-black/60 p-1 text-white/40 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  title="Удалить из библиотеки"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {previewUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setPreviewUrl(null)}>
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Preview" className="max-h-[85vh] max-w-[85vw] rounded-2xl object-contain" />
            <button
              type="button"
              onClick={() => setPreviewUrl(null)}
              className="absolute -right-2 -top-2 rounded-full bg-black/80 p-2 text-white/60 transition-colors hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}