import type { ImageGenModel } from "@/lib/pipeline/imageGenerator"
import { extractJsonObject } from "@/lib/cinematic/stageUtils"
import { buildConnectionLabel, canConnectNodes } from "@/lib/configurator/graph"
import type {
  AiNodeMode,
  ConfiguratorFlowEdge,
  ConfiguratorFlowNode,
  ConfiguratorNodeData,
  ConfiguratorNodeKind,
} from "@/types/configurator"

const SUPPORTED_IMAGE_MODELS: ImageGenModel[] = ["gpt-image", "nano-banana", "nano-banana-2", "nano-banana-pro"]
const SUPPORTED_AI_MODES: AiNodeMode[] = ["detail_guard", "style_director", "merge", "rewrite"]

export type ConfiguratorBindingKey =
  | "manual"
  | "scene.raw"
  | "bible.storyHistory"
  | "bible.directorVision"
  | "bible.characters"
  | "bible.locations"
  | "bible.imageDescriptors"
  | "bible.characterReference"
  | "bible.locationReference"

export interface ConfiguratorAgentNodeSpec {
  id: string
  kind: ConfiguratorNodeKind
  title: string
  binding?: ConfiguratorBindingKey
  promptText?: string
  detailHints?: string
  roleLabel?: string
  mode?: AiNodeMode
  instruction?: string
  system?: ImageGenModel
  caption?: string
  lockedDetails?: string
}

export interface ConfiguratorAgentEdgeSpec {
  source: string
  target: string
  label?: string
}

export interface ConfiguratorAgentPlan {
  name: string
  description: string
  nodes: ConfiguratorAgentNodeSpec[]
  edges: ConfiguratorAgentEdgeSpec[]
  rules?: string[]
}

export const CONFIGURATOR_AGENT_RULES = [
  "Use only these node kinds: prompt, photo, ai, generator, output.",
  "Never invent new node kinds, new agent modes, or new binding keys.",
  "Always produce at least one output node.",
  "AI nodes must have roleLabel, mode, and instruction.",
  "prompt/photo nodes may bind to Bible fields, scene input, or stay manual.",
  "Connections must flow only from prompt/photo/ai into ai/generator/output.",
  "Prefer DAG flows. Do not create self-links or duplicate edges.",
  "If the prompt mentions story continuity, use bible.storyHistory.",
  "If the prompt mentions film philosophy or directing language, use bible.directorVision.",
].join("\n")

export const CONFIGURATOR_AGENT_RULE_SUMMARY = [
  "Only supported node kinds are allowed.",
  "Bible bindings are explicit, not inferred at runtime.",
  "AI nodes need role, mode, and instruction.",
  "Edges are validated against graph rules before render.",
  "At least one output node is mandatory.",
]

function slugifyNodeId(value: string, fallbackIndex: number): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return normalized || `node-${fallbackIndex + 1}`
}

function makeNodeId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`
}

function toNodeData(spec: ConfiguratorAgentNodeSpec): ConfiguratorNodeData {
  switch (spec.kind) {
    case "photo":
      return {
        kind: "photo",
        title: spec.title,
        imageUrl: "",
        caption: spec.caption ?? buildPromptTextFromBinding(spec.binding, spec.title),
        lockedDetails: spec.lockedDetails ?? spec.detailHints ?? "",
      }
    case "prompt":
      return {
        kind: "prompt",
        title: spec.title,
        promptText: spec.promptText ?? buildPromptTextFromBinding(spec.binding, spec.title),
        detailHints: spec.detailHints ?? buildDetailHintsFromBinding(spec.binding),
        binding: spec.binding ?? "manual",
      }
    case "ai":
      return {
        kind: "ai",
        title: spec.title,
        roleLabel: spec.roleLabel ?? spec.title,
        mode: spec.mode ?? "merge",
        instruction: spec.instruction ?? "Transform incoming sources into one coherent result.",
      }
    case "generator":
      return {
        kind: "generator",
        title: spec.title,
        system: spec.system ?? "gpt-image",
      }
    case "output":
      return {
        kind: "output",
        title: spec.title,
      }
  }
}

function buildPromptTextFromBinding(binding: ConfiguratorBindingKey | undefined, title: string): string {
  switch (binding) {
    case "scene.raw":
      return "RAW SCENE: insert raw scene text here."
    case "bible.storyHistory":
      return "Story history and dramatic context from Bible."
    case "bible.directorVision":
      return "Director vision and film philosophy from Bible."
    case "bible.characters":
      return "Character bible JSON or notes."
    case "bible.locations":
      return "Location bible JSON or notes."
    case "bible.imageDescriptors":
      return "Image descriptors or style reference JSON."
    case "manual":
    default:
      return `${title} content.`
  }
}

function buildDetailHintsFromBinding(binding: ConfiguratorBindingKey | undefined): string {
  switch (binding) {
    case "scene.raw":
      return "scene_id; raw_scene; visible facts"
    case "bible.storyHistory":
      return "dramatic continuity; story facts; what happened before"
    case "bible.directorVision":
      return "film philosophy; emotional lens; directorial rules"
    case "bible.characters":
      return "character context; recurring identities; constraints"
    case "bible.locations":
      return "location context; recurring places; continuity anchors"
    case "bible.imageDescriptors":
      return "style context; image descriptors; visual tone"
    default:
      return ""
  }
}

function safeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function normalizeKind(value: unknown): ConfiguratorNodeKind | null {
  return value === "photo" || value === "prompt" || value === "ai" || value === "generator" || value === "output"
    ? value
    : null
}

function normalizeBinding(value: unknown): ConfiguratorBindingKey {
  switch (value) {
    case "scene.raw":
    case "bible.storyHistory":
    case "bible.directorVision":
    case "bible.characters":
    case "bible.locations":
    case "bible.imageDescriptors":
    case "bible.characterReference":
    case "bible.locationReference":
    case "manual":
      return value
    default:
      return "manual"
  }
}

function normalizeMode(value: unknown): AiNodeMode {
  return typeof value === "string" && SUPPORTED_AI_MODES.includes(value as AiNodeMode)
    ? value as AiNodeMode
    : "merge"
}

function normalizeImageModel(value: unknown): ImageGenModel {
  return typeof value === "string" && SUPPORTED_IMAGE_MODELS.includes(value as ImageGenModel)
    ? value as ImageGenModel
    : "gpt-image"
}

function normalizePlanNode(value: unknown, index: number): ConfiguratorAgentNodeSpec | null {
  const record = safeObject(value)
  const kind = normalizeKind(record.kind)
  const title = typeof record.title === "string" && record.title.trim() ? record.title.trim() : ""

  if (!kind || !title) {
    return null
  }

  const id = typeof record.id === "string" && record.id.trim()
    ? slugifyNodeId(record.id, index)
    : makeNodeId(kind, index)

  return {
    id,
    kind,
    title,
    binding: normalizeBinding(record.binding),
    promptText: typeof record.promptText === "string" ? record.promptText.trim() : undefined,
    detailHints: typeof record.detailHints === "string" ? record.detailHints.trim() : undefined,
    roleLabel: typeof record.roleLabel === "string" ? record.roleLabel.trim() : undefined,
    mode: normalizeMode(record.mode),
    instruction: typeof record.instruction === "string" ? record.instruction.trim() : undefined,
    system: normalizeImageModel(record.system),
    caption: typeof record.caption === "string" ? record.caption.trim() : undefined,
    lockedDetails: typeof record.lockedDetails === "string" ? record.lockedDetails.trim() : undefined,
  }
}

function normalizePlanEdge(value: unknown): ConfiguratorAgentEdgeSpec | null {
  const record = safeObject(value)
  const source = typeof record.source === "string" ? record.source.trim() : ""
  const target = typeof record.target === "string" ? record.target.trim() : ""

  if (!source || !target) {
    return null
  }

  return {
    source: slugifyNodeId(source, 0),
    target: slugifyNodeId(target, 0),
    label: typeof record.label === "string" ? record.label.trim() : undefined,
  }
}

export function parseConfiguratorAgentPlan(rawText: string): unknown {
  return JSON.parse(extractJsonObject(rawText))
}

export function validateConfiguratorAgentPlan(rawPlan: unknown): {
  plan: ConfiguratorAgentPlan
  warnings: string[]
} {
  const record = safeObject(rawPlan)
  const warnings: string[] = []
  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : "Generated Config"
  const description = typeof record.description === "string" && record.description.trim()
    ? record.description.trim()
    : "Agent-generated configurator graph."

  const rawNodes = Array.isArray(record.nodes) ? record.nodes : []
  const rawEdges = Array.isArray(record.edges) ? record.edges : []

  const nodes = rawNodes.map((value, index) => normalizePlanNode(value, index)).filter((value): value is ConfiguratorAgentNodeSpec => Boolean(value))
  const nodeIds = new Set<string>()
  const dedupedNodes: ConfiguratorAgentNodeSpec[] = []

  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      warnings.push(`Duplicate node id removed: ${node.id}`)
      continue
    }

    if (node.kind === "ai" && !node.instruction) {
      warnings.push(`AI node ${node.id} had no instruction. Default instruction applied.`)
    }

    nodeIds.add(node.id)
    dedupedNodes.push(node)
  }

  if (!dedupedNodes.some((node) => node.kind === "output")) {
    dedupedNodes.push({
      id: makeNodeId("output", dedupedNodes.length),
      kind: "output",
      title: "Output Node",
      binding: "manual",
    })
    warnings.push("Output node was missing and has been added automatically.")
  }

  const nodeMap = new Map(dedupedNodes.map((node) => [node.id, node]))
  const edges: ConfiguratorAgentEdgeSpec[] = []
  const edgeKeys = new Set<string>()

  for (const rawEdge of rawEdges.map(normalizePlanEdge).filter((value): value is ConfiguratorAgentEdgeSpec => Boolean(value))) {
    const sourceNode = nodeMap.get(rawEdge.source)
    const targetNode = nodeMap.get(rawEdge.target)

    if (!sourceNode || !targetNode) {
      warnings.push(`Edge dropped because node was missing: ${rawEdge.source} -> ${rawEdge.target}`)
      continue
    }

    if (rawEdge.source === rawEdge.target) {
      warnings.push(`Self edge dropped: ${rawEdge.source}`)
      continue
    }

    const sourceData = toNodeData(sourceNode)
    const targetData = toNodeData(targetNode)

    if (!canConnectNodes(sourceData, targetData)) {
      warnings.push(`Blocked edge dropped: ${rawEdge.source} -> ${rawEdge.target}`)
      continue
    }

    const edgeKey = `${rawEdge.source}=>${rawEdge.target}`
    if (edgeKeys.has(edgeKey)) {
      warnings.push(`Duplicate edge dropped: ${rawEdge.source} -> ${rawEdge.target}`)
      continue
    }

    edgeKeys.add(edgeKey)
    edges.push({
      source: rawEdge.source,
      target: rawEdge.target,
      label: rawEdge.label || buildConnectionLabel(sourceData, targetData),
    })
  }

  return {
    plan: {
      name,
      description,
      nodes: dedupedNodes,
      edges,
      rules: CONFIGURATOR_AGENT_RULE_SUMMARY,
    },
    warnings,
  }
}

function computeDepths(nodes: ConfiguratorAgentNodeSpec[], edges: ConfiguratorAgentEdgeSpec[]): Map<string, number> {
  const incoming = new Map<string, string[]>()
  for (const node of nodes) {
    incoming.set(node.id, [])
  }

  for (const edge of edges) {
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source])
  }

  const depthCache = new Map<string, number>()
  const visiting = new Set<string>()

  const visit = (nodeId: string): number => {
    if (depthCache.has(nodeId)) {
      return depthCache.get(nodeId) ?? 0
    }

    if (visiting.has(nodeId)) {
      return 0
    }

    visiting.add(nodeId)
    const depth = Math.max(0, ...(incoming.get(nodeId) ?? []).map((sourceId) => visit(sourceId) + 1))
    visiting.delete(nodeId)
    depthCache.set(nodeId, depth)
    return depth
  }

  for (const node of nodes) {
    visit(node.id)
  }

  return depthCache
}

export function convertConfiguratorAgentPlanToGraph(plan: ConfiguratorAgentPlan): {
  nodes: ConfiguratorFlowNode[]
  edges: ConfiguratorFlowEdge[]
} {
  const depths = computeDepths(plan.nodes, plan.edges)
  const columns = new Map<number, ConfiguratorAgentNodeSpec[]>()

  for (const node of plan.nodes) {
    const depth = depths.get(node.id) ?? 0
    columns.set(depth, [...(columns.get(depth) ?? []), node])
  }

  const graphNodes: ConfiguratorFlowNode[] = []
  for (const [depth, columnNodes] of Array.from(columns.entries()).sort((left, right) => left[0] - right[0])) {
    columnNodes.forEach((node, index) => {
      graphNodes.push({
        id: node.id,
        type: "configNode",
        position: {
          x: 80 + depth * 420,
          y: 100 + index * 250,
        },
        data: toNodeData(node),
      })
    })
  }

  const graphEdges: ConfiguratorFlowEdge[] = plan.edges.map((edge, index) => ({
    id: `generated-edge-${index + 1}`,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: false,
  }))

  return {
    nodes: graphNodes,
    edges: graphEdges,
  }
}