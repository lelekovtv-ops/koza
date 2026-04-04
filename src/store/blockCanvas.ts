import { create } from "zustand"
import type { Node, Edge } from "@xyflow/react"
import type { CanvasData } from "@/lib/canvas/canvasTypes"
import { NODE_REGISTRY } from "@/lib/canvas/nodeRegistry"
import { compileBlockToGraph } from "@/lib/canvas/modifierGraphCompiler"
import { useScriptStore } from "@/store/script"
import { useTimelineStore } from "@/store/timeline"
import { syncBus } from "@/lib/syncBus"

// ─── Types ──────────────────────────────────────────────────

interface BlockCanvasState {
  activeBlockId: string | null
  activeShotId: string | null
  lastBlockId: string | null
  lastShotId: string | null

  nodes: Node[]
  edges: Edge[]
  viewport: { x: number; y: number; zoom: number }

  selectedNodeId: string | null
  executingNodeIds: string[]

  // Actions
  openBlock: (blockId: string, shotId: string | null) => void
  closeBlock: () => void
  reopenLast: () => void
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void
  selectNode: (nodeId: string | null) => void
  addNode: (type: string, position: { x: number; y: number }) => void
  removeNode: (nodeId: string) => void
  updateNodeData: (nodeId: string, patch: Record<string, unknown>) => void
  setExecuting: (nodeId: string, executing: boolean) => void
  saveToBlock: () => void
}

// ─── Helpers ────────────────────────────────────────────────

let nodeCounter = 0

function makeNodeId(type: string): string {
  return `${type}_${Date.now()}_${++nodeCounter}`
}

function serializeCanvas(nodes: Node[], edges: Edge[], viewport: { x: number; y: number; zoom: number }): CanvasData {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type || "blockText",
      position: n.position,
      data: n.data as Record<string, unknown>,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle ?? null,
      target: e.target,
      targetHandle: e.targetHandle ?? null,
    })),
    viewport,
  }
}

function deserializeCanvas(data: CanvasData): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: data.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data,
    })),
    edges: data.edges.map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle,
      target: e.target,
      targetHandle: e.targetHandle,
      animated: true,
      style: { strokeWidth: 1.5 },
    })),
  }
}

// ─── Store ──────────────────────────────────────────────────

export const useBlockCanvasStore = create<BlockCanvasState>()((set, get) => ({
  activeBlockId: null,
  activeShotId: null,
  lastBlockId: null as string | null,
  lastShotId: null as string | null,
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedNodeId: null,
  executingNodeIds: [],

  openBlock: (blockId, shotId) => {
    const shot = shotId
      ? useTimelineStore.getState().shots.find((s) => s.id === shotId) ?? null
      : null

    // Find block from script store, or create fallback from shot data
    let block = useScriptStore.getState().blocks.find((b) => b.id === blockId)
    if (!block && shot) {
      block = {
        id: blockId,
        type: "action" as const,
        text: shot.caption || shot.label || "",
        visual: {
          thumbnailUrl: shot.thumbnailUrl,
          thumbnailBlobKey: shot.thumbnailBlobKey,
          originalUrl: shot.originalUrl,
          originalBlobKey: shot.originalBlobKey,
          imagePrompt: shot.imagePrompt,
          videoPrompt: shot.videoPrompt,
          shotSize: shot.shotSize,
          cameraMotion: shot.cameraMotion,
          generationHistory: shot.generationHistory,
          activeHistoryIndex: shot.activeHistoryIndex,
          type: shot.type,
        },
        durationMs: shot.duration,
      }
    }
    if (!block) return

    // Try to restore saved canvas data
    if (block.modifier?.type === "canvas" && block.modifier.canvasData) {
      const { nodes, edges } = deserializeCanvas(block.modifier.canvasData)
      const viewport = block.modifier.canvasData.viewport ?? { x: 0, y: 0, zoom: 1 }
      set({ activeBlockId: blockId, activeShotId: shotId, nodes, edges, viewport, selectedNodeId: null, executingNodeIds: [] })
      return
    }

    // No saved data — compile from modifier type
    const { nodes, edges } = compileBlockToGraph(block, shot)
    set({
      activeBlockId: blockId,
      activeShotId: shotId,
      nodes,
      edges,
      viewport: { x: 0, y: 0, zoom: 1 },
      selectedNodeId: null,
      executingNodeIds: [],
    })
  },

  closeBlock: () => {
    const { activeBlockId, activeShotId } = get()
    set({
      activeBlockId: null,
      activeShotId: null,
      lastBlockId: activeBlockId,
      lastShotId: activeShotId,
      nodes: [],
      edges: [],
      selectedNodeId: null,
      executingNodeIds: [],
    })
  },

  reopenLast: () => {
    const { lastBlockId, lastShotId } = get()
    if (lastBlockId) get().openBlock(lastBlockId, lastShotId)
  },

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setViewport: (viewport) => set({ viewport }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  addNode: (type, position) => {
    const def = NODE_REGISTRY[type]
    if (!def) return

    const id = makeNodeId(type)
    const node: Node = {
      id,
      type,
      position,
      data: { ...def.defaultData },
    }

    set((s) => ({ nodes: [...s.nodes, node] }))
  },

  removeNode: (nodeId) => {
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== nodeId),
      edges: s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: s.selectedNodeId === nodeId ? null : s.selectedNodeId,
    }))
  },

  updateNodeData: (nodeId, patch) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    }))
  },

  setExecuting: (nodeId, executing) => {
    set((s) => ({
      executingNodeIds: executing
        ? [...s.executingNodeIds, nodeId]
        : s.executingNodeIds.filter((id) => id !== nodeId),
    }))
  },

  saveToBlock: () => {
    const { activeBlockId, nodes, edges, viewport } = get()
    if (!activeBlockId || nodes.length === 0) return

    const canvasData = serializeCanvas(nodes, edges, viewport)
    useScriptStore.getState().updateBlockProduction(activeBlockId, {
      modifier: {
        type: "canvas",
        templateId: null,
        canvasData,
        params: {},
      },
    }, "canvas")

    syncBus.dispatch("canvas", "block-production", { canvasData }, { blockId: activeBlockId })
  },
}))
