/**
 * Dataflow Engine — topological execution of canvas node graphs.
 *
 * Propagates data through connected nodes when generation nodes are "Run".
 * Generation nodes are async (call API). Non-generation nodes recompute immediately.
 */

import type { Node, Edge } from "@xyflow/react"
import { NODE_REGISTRY, getPortDef } from "./nodeRegistry"

// ─── Topological Sort ───────────────────────────────────────

export function topologicalSort(nodes: Node[], edges: Edge[]): string[] {
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()

  for (const n of nodes) {
    inDegree.set(n.id, 0)
    adj.set(n.id, [])
  }

  for (const e of edges) {
    adj.get(e.source)?.push(e.target)
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1)
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const sorted: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    sorted.push(id)
    for (const next of adj.get(id) || []) {
      const newDeg = (inDegree.get(next) || 1) - 1
      inDegree.set(next, newDeg)
      if (newDeg === 0) queue.push(next)
    }
  }

  return sorted
}

// ─── Collect inputs for a node ──────────────────────────────

export interface NodeInput {
  sourceNodeId: string
  sourceHandle: string
  targetHandle: string
  value: unknown
}

export function collectInputs(
  nodeId: string,
  edges: Edge[],
  outputCache: Map<string, Map<string, unknown>>,
): NodeInput[] {
  const inputs: NodeInput[] = []

  for (const e of edges) {
    if (e.target !== nodeId) continue
    const sourceOutputs = outputCache.get(e.source)
    if (!sourceOutputs || !e.sourceHandle) continue

    inputs.push({
      sourceNodeId: e.source,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle || "",
      value: sourceOutputs.get(e.sourceHandle) ?? null,
    })
  }

  return inputs
}

// ─── Execute a single node ──────────────────────────────────

export type NodeExecutor = (
  node: Node,
  inputs: NodeInput[],
) => Promise<Record<string, unknown>> // returns output handle values

// Built-in executors for non-generation nodes
const builtInExecutors: Record<string, NodeExecutor> = {
  // Source nodes just output their data
  blockText: async (node) => ({
    "text-out": (node.data as Record<string, unknown>).text || "",
  }),

  bibleRef: async (node) => {
    const d = node.data as Record<string, unknown>
    const chars = (d.characters as string[]) || []
    const locs = (d.locations as string[]) || []
    const props = (d.props as string[]) || []
    return {
      "text-out": [...chars, ...locs, ...props].join(", "),
      "bible-out": { characters: chars, locations: locs, props },
    }
  },

  styleInput: async (node) => {
    const d = node.data as Record<string, unknown>
    return {
      "style-out": { name: d.styleName, prompt: d.stylePrompt, enabled: d.enabled },
      "text-out": d.enabled ? (d.stylePrompt as string) || "" : "",
    }
  },

  // Processing nodes merge inputs
  promptBuilder: async (node, inputs) => {
    const textParts: string[] = []
    let stylePrompt = ""

    for (const inp of inputs) {
      if (inp.targetHandle === "text-in" && typeof inp.value === "string") {
        textParts.push(inp.value)
      }
      if (inp.targetHandle === "style-in" && inp.value) {
        const s = inp.value as { prompt?: string; enabled?: boolean }
        if (s.enabled !== false && s.prompt) stylePrompt = s.prompt
      }
      if (inp.targetHandle === "bible-in" && inp.value) {
        const b = inp.value as { characters?: string[]; locations?: string[]; props?: string[] }
        const refs = [...(b.characters || []), ...(b.locations || []), ...(b.props || [])]
        if (refs.length) textParts.push(`[References: ${refs.join(", ")}]`)
      }
    }

    const combined = textParts.join(". ")
    const prompt = stylePrompt ? `${combined}. Style: ${stylePrompt}` : combined
    return { "text-out": prompt }
  },

  promptEditor: async (node, inputs) => {
    const d = node.data as Record<string, unknown>
    if (d.useEdited && d.editedPrompt) {
      return { "text-out": d.editedPrompt as string }
    }
    // Pass through input
    const textIn = inputs.find((i) => i.targetHandle === "text-in")
    return { "text-out": textIn?.value || "" }
  },

  // Router just passes through
  router: async (_node, inputs) => {
    const val = inputs[0]?.value ?? null
    return { "any-out-1": val, "any-out-2": val, "any-out-3": val }
  },

  // Output nodes just consume
  shotOutput: async () => ({}),
  output: async () => ({}),
  preview: async () => ({}),

  // Helper nodes (no-op)
  stickyNote: async () => ({}),
  compare: async () => ({}),
  imageImport: async (node) => ({
    "image-out": (node.data as Record<string, unknown>).imageUrl || null,
  }),
  videoImport: async (node) => ({
    "video-out": (node.data as Record<string, unknown>).videoUrl || null,
  }),
  audioImport: async (node) => ({
    "audio-out": (node.data as Record<string, unknown>).audioUrl || null,
  }),
}

// ─── Execute full graph from a starting node ────────────────

export interface ExecutionCallbacks {
  onNodeStart?: (nodeId: string) => void
  onNodeComplete?: (nodeId: string, outputs: Record<string, unknown>) => void
  onNodeError?: (nodeId: string, error: Error) => void
  executeGeneration?: (node: Node, inputs: NodeInput[]) => Promise<Record<string, unknown>>
}

export async function executeGraph(
  startNodeId: string,
  nodes: Node[],
  edges: Edge[],
  callbacks?: ExecutionCallbacks,
): Promise<Map<string, Map<string, unknown>>> {
  const sorted = topologicalSort(nodes, edges)
  const outputCache = new Map<string, Map<string, unknown>>()

  // Find start index — execute from start node onwards
  const startIdx = sorted.indexOf(startNodeId)
  const execOrder = startIdx >= 0 ? sorted.slice(startIdx) : sorted

  for (const nodeId of execOrder) {
    const node = nodes.find((n) => n.id === nodeId)
    if (!node?.type) continue

    callbacks?.onNodeStart?.(nodeId)

    try {
      const inputs = collectInputs(nodeId, edges, outputCache)
      const def = NODE_REGISTRY[node.type]
      let outputs: Record<string, unknown>

      if (def?.hasRunButton && callbacks?.executeGeneration) {
        // Generation node — delegate to callback (handles API calls)
        outputs = await callbacks.executeGeneration(node, inputs)
      } else {
        // Use built-in executor
        const executor = builtInExecutors[node.type]
        outputs = executor ? await executor(node, inputs) : {}
      }

      // Cache outputs
      const nodeOutputs = new Map<string, unknown>()
      for (const [k, v] of Object.entries(outputs)) {
        nodeOutputs.set(k, v)
      }
      outputCache.set(nodeId, nodeOutputs)

      callbacks?.onNodeComplete?.(nodeId, outputs)
    } catch (err) {
      callbacks?.onNodeError?.(nodeId, err instanceof Error ? err : new Error(String(err)))
    }
  }

  return outputCache
}
