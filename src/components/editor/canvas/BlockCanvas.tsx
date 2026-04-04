"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  type OnConnect,
  addEdge,
  BackgroundVariant,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { X, Play, Save } from "lucide-react"
import { blockCanvasNodeTypes } from "./blockCanvasNodes"
import type { Block } from "@/lib/screenplayFormat"
import type { TimelineShot } from "@/store/timeline"
import { useScriptStore } from "@/store/script"
import { useBibleStore } from "@/store/bible"
import { buildImagePrompt } from "@/lib/promptBuilder"

// ─── Types ───────────────────────────────────────────────────

interface BlockCanvasProps {
  block: Block
  shot: TimelineShot | null
  onClose: () => void
  onSave: (canvasData: unknown) => void
}

// ─── Build initial graph from block data ─────────────────────

function buildInitialGraph(
  block: Block,
  shot: TimelineShot | null,
): { nodes: Node[]; edges: Edge[] } {
  const { characters, locations, props: bibleProps } = useBibleStore.getState()

  // Find characters/locations mentioned in this block's scene
  const sceneChars = characters.filter((c) =>
    shot?.caption?.toUpperCase().includes(c.name.toUpperCase()) ||
    block.text.toUpperCase().includes(c.name.toUpperCase())
  )
  const sceneLocs = locations.filter((l) =>
    shot?.sceneId && l.sceneIds.includes(shot.sceneId)
  )
  const sceneProps = bibleProps.filter((p) =>
    shot?.sceneId && p.sceneIds.includes(shot.sceneId)
  )

  // Build prompt if shot exists
  const prompt = shot
    ? buildImagePrompt(shot, characters, locations, undefined, bibleProps)
    : ""

  const nodes: Node[] = [
    {
      id: "block-text",
      type: "blockText",
      position: { x: 0, y: 80 },
      data: {
        label: "Block Text",
        text: block.text,
        blockType: block.type,
      },
    },
    {
      id: "bible-ref",
      type: "bibleRef",
      position: { x: 0, y: 260 },
      data: {
        label: "Bible",
        characters: sceneChars.map((c) => c.name),
        locations: sceneLocs.map((l) => l.name),
        props: sceneProps.map((p) => p.name),
      },
    },
    {
      id: "style-input",
      type: "styleInput",
      position: { x: 0, y: 440 },
      data: {
        label: "Style Layer",
        styleName: "From Project",
        stylePrompt: useBibleStore.getState().directorVision || "No style set",
        enabled: true,
      },
    },
    {
      id: "prompt-builder",
      type: "promptBuilder",
      position: { x: 320, y: 140 },
      data: {
        label: "Prompt Builder",
        prompt,
        isProcessing: false,
      },
    },
    {
      id: "image-gen",
      type: "imageGen",
      position: { x: 640, y: 100 },
      data: {
        label: "Image Generation",
        model: "Nano Banana 2",
        thumbnailUrl: shot?.thumbnailUrl || null,
        isGenerating: false,
      },
    },
    {
      id: "output",
      type: "output",
      position: { x: 640, y: 340 },
      data: {
        label: "Shot Output",
        thumbnailUrl: shot?.thumbnailUrl || null,
        prompt,
        duration: shot?.duration || block.durationMs || 3000,
      },
    },
  ]

  const edges: Edge[] = [
    { id: "e-text-prompt", source: "block-text", target: "prompt-builder", animated: true, style: { stroke: "#10B981", strokeWidth: 1.5 } },
    { id: "e-bible-prompt", source: "bible-ref", target: "prompt-builder", animated: true, style: { stroke: "#F59E0B", strokeWidth: 1.5 } },
    { id: "e-style-prompt", source: "style-input", target: "prompt-builder", animated: true, style: { stroke: "#8B5CF6", strokeWidth: 1.5 } },
    { id: "e-prompt-gen", source: "prompt-builder", target: "image-gen", animated: true, style: { stroke: "#3B82F6", strokeWidth: 1.5 } },
    { id: "e-gen-output", source: "image-gen", target: "output", animated: true, style: { stroke: "#D4A853", strokeWidth: 1.5 } },
  ]

  return { nodes, edges }
}

// ─── Restore saved graph or build new ────────────────────────

function getInitialGraph(block: Block, shot: TimelineShot | null) {
  // Try to restore from block.modifier.canvasData
  if (block.modifier?.type === "canvas" && block.modifier.canvasData) {
    const saved = block.modifier.canvasData as { nodes?: Node[]; edges?: Edge[] }
    if (saved.nodes?.length) {
      return { nodes: saved.nodes, edges: saved.edges || [] }
    }
  }
  return buildInitialGraph(block, shot)
}

// ─── Component ───────────────────────────────────────────────

export function BlockCanvas({ block, shot, onClose, onSave }: BlockCanvasProps) {
  const initial = useMemo(() => getInitialGraph(block, shot), [block.id])
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)

  const onConnect: OnConnect = useCallback(
    (connection) => setEdges((eds) => addEdge({ ...connection, animated: true, style: { stroke: "#ffffff30", strokeWidth: 1.5 } }, eds)),
    [setEdges],
  )

  const handleSave = useCallback(() => {
    const canvasData = {
      nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    }
    onSave(canvasData)
  }, [nodes, edges, onSave])

  // Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave() }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose, handleSave])

  return (
    <div className="fixed inset-0 z-[200] bg-[#0A0B0E]">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-[#0A0B0E]/90 backdrop-blur-md px-4 h-12">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Block Canvas</span>
          <span className="text-[11px] text-white/50 truncate max-w-md">{block.text.slice(0, 60)}{block.text.length > 60 ? "..." : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-lg bg-[#D4A853]/10 px-3 py-1.5 text-[11px] font-medium text-[#D4A853] hover:bg-[#D4A853]/20 transition-colors"
          >
            <Save size={13} /> Save
          </button>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 hover:bg-white/5 hover:text-white/60 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ReactFlow Canvas */}
      <div className="absolute inset-0 top-12">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={blockCanvasNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={2}
          defaultEdgeOptions={{ animated: true }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.03)" />
        </ReactFlow>
      </div>
    </div>
  )
}
