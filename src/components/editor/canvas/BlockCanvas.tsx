"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ReactFlow,
  Background,
  MiniMap,
  type Node,
  type Edge,
  type OnConnect,
  type Connection,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  ConnectionLineType,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { blockCanvasNodeTypes } from "./blockCanvasNodes"
import { useBlockCanvasStore } from "@/store/blockCanvas"
import { isValidCanvasConnection, getEdgeColor } from "@/lib/canvas/connectionValidator"
import { getNodeDef, getPortDef } from "@/lib/canvas/nodeRegistry"
import { CATEGORY_RING_COLORS } from "./nodes/shared"
import { NodePalette } from "./NodePalette"
import { NodeSidebar } from "./NodeSidebar"
import { CanvasToolbar } from "./CanvasToolbar"
import { runImageGenNode } from "@/lib/canvas/canvasGenerate"

// ─── Palette state ──────────────────────────────────────────

interface PaletteState {
  screen: { x: number; y: number }
  canvas: { x: number; y: number }
  // When opened from a dangling edge drop
  connectFrom?: {
    nodeId: string
    handleId: string
    handleType: "source" | "target"
  }
}

// ─── Inner Component (needs ReactFlow context) ──────────────

function BlockCanvasInner() {
  const {
    activeBlockId,
    nodes: storeNodes,
    edges: storeEdges,
    selectedNodeId,
    setNodes: setStoreNodes,
    setEdges: setStoreEdges,
    selectNode,
    addNode,
    updateNodeData,
    closeBlock,
    saveToBlock,
  } = useBlockCanvasStore()

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges)
  const [palette, setPalette] = useState<PaletteState | null>(null)
  const reactFlow = useReactFlow()
  const pendingConnectRef = useRef<{ nodeId: string; handleId: string; handleType: "source" | "target" } | null>(null)

  // Sync from store → local only on initial open
  const openedRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeBlockId && activeBlockId !== openedRef.current) {
      openedRef.current = activeBlockId
      setNodes(storeNodes)
      setEdges(storeEdges)
    }
  }, [activeBlockId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for node data updates from custom events (from nodes)
  useEffect(() => {
    const handler = (e: Event) => {
      const { nodeId, patch } = (e as CustomEvent).detail
      updateNodeData(nodeId, patch)
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
      )
    }
    window.addEventListener("canvas-node-update", handler)
    return () => window.removeEventListener("canvas-node-update", handler)
  }, [updateNodeData, setNodes])

  // Run generation node — called from ImageGenNode "Run Model" button
  const handleRunNode = useCallback(async (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return

    // Set generating state
    setNodes((nds) => nds.map((n) =>
      n.id === nodeId ? { ...n, data: { ...n.data, isGenerating: true } } : n,
    ))

    try {
      const { imageUrl } = await runImageGenNode(node)

      // Update ImageGen node with result
      setNodes((nds) => nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, isGenerating: false, thumbnailUrl: imageUrl } } : n,
      ))

      // Also update connected Output/ShotOutput nodes
      const outEdges = edges.filter((e) => e.source === nodeId)
      for (const edge of outEdges) {
        setNodes((nds) => nds.map((n) =>
          n.id === edge.target ? { ...n, data: { ...n.data, thumbnailUrl: imageUrl } } : n,
        ))
      }
    } catch (err) {
      console.error("[Canvas] Generation failed:", err)
      setNodes((nds) => nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, isGenerating: false } } : n,
      ))
    }
  }, [nodes, edges, setNodes])

  // Inject onRun callbacks into generation nodes
  const nodesWithCallbacks = nodes.map((n) => {
    if (n.type === "imageGen" || n.type === "videoGen") {
      return { ...n, data: { ...n.data, onRun: () => handleRunNode(n.id) } }
    }
    return n
  })

  // Connection with type validation + smoothstep + color
  const onConnect: OnConnect = useCallback(
    (connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source)
      const color = sourceNode?.type
        ? getEdgeColor(sourceNode.type, connection.sourceHandle || "")
        : "#6B7280"

      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "smoothstep",
            animated: false,
            style: { stroke: color, strokeWidth: 2 },
          },
          eds,
        ),
      )
    },
    [nodes, setEdges],
  )

  // Track edge drag start
  const onConnectStart = useCallback((_: unknown, params: { nodeId: string | null; handleId: string | null; handleType: "source" | "target" | null }) => {
    if (params.nodeId && params.handleId && params.handleType) {
      pendingConnectRef.current = { nodeId: params.nodeId, handleId: params.handleId, handleType: params.handleType }
    }
  }, [])

  // Edge dropped on empty canvas → open palette to create + auto-connect
  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    const pending = pendingConnectRef.current
    pendingConnectRef.current = null
    if (!pending) return

    // Check if dropped on a node (ReactFlow handles that via onConnect)
    const target = (event as MouseEvent).target as HTMLElement
    if (target?.closest(".react-flow__node")) return

    // Dropped on empty space → show palette
    const clientX = "clientX" in event ? event.clientX : event.changedTouches[0].clientX
    const clientY = "clientY" in event ? event.clientY : event.changedTouches[0].clientY
    const canvasPos = reactFlow.screenToFlowPosition({ x: clientX, y: clientY })

    setPalette({
      screen: { x: clientX, y: clientY },
      canvas: canvasPos,
      connectFrom: pending,
    })
  }, [reactFlow])

  // Manual save
  const handleManualSave = useCallback(() => {
    setStoreNodes(nodes)
    setStoreEdges(edges)
    setTimeout(() => saveToBlock(), 50)
  }, [nodes, edges, setStoreNodes, setStoreEdges, saveToBlock])

  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      const conn: Connection = {
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? null,
        targetHandle: connection.targetHandle ?? null,
      }
      return isValidCanvasConnection(conn, nodes)
    },
    [nodes],
  )

  // Right-click → palette
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const canvasPos = reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      setPalette({ screen: { x: e.clientX, y: e.clientY }, canvas: canvasPos })
    },
    [reactFlow],
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Tab" && !e.shiftKey && !e.metaKey) {
        e.preventDefault()
        const rect = document.querySelector(".react-flow")?.getBoundingClientRect()
        if (rect) {
          const cx = rect.left + rect.width / 2
          const cy = rect.top + rect.height / 2
          const canvasPos = reactFlow.screenToFlowPosition({ x: cx, y: cy })
          setPalette({ screen: { x: cx - 112, y: cy - 160 }, canvas: canvasPos })
        }
      }
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        if (palette) {
          setPalette(null)
        } else {
          closeBlock()
        }
        return
      }
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleManualSave()
      }
      // Duplicate node: Cmd+D
      if (e.key === "d" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (selectedNodeId) {
          const node = nodes.find((n) => n.id === selectedNodeId)
          if (node?.type) {
            addNode(node.type, { x: node.position.x + 60, y: node.position.y + 60 })
            setTimeout(() => {
              const latest = useBlockCanvasStore.getState()
              setNodes(latest.nodes)
            }, 0)
          }
        }
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeId && document.activeElement === document.body) {
          useBlockCanvasStore.getState().removeNode(selectedNodeId)
          setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId))
          setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId))
        }
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [palette, closeBlock, reactFlow, selectedNodeId, nodes, edges, handleManualSave, addNode, setNodes, setEdges])

  // Add node from palette (with optional auto-connect from dangling edge)
  const handleAddNode = useCallback(
    (type: string, position: { x: number; y: number }) => {
      addNode(type, position)

      const connectFrom = palette?.connectFrom
      setTimeout(() => {
        const latest = useBlockCanvasStore.getState()
        const newNode = latest.nodes[latest.nodes.length - 1]
        setNodes(latest.nodes)

        // Auto-connect if palette was opened from a dangling edge
        if (connectFrom && newNode) {
          const def = getNodeDef(type)
          if (!def) return

          let source: string, sourceHandle: string, target: string, targetHandle: string

          if (connectFrom.handleType === "source") {
            source = connectFrom.nodeId
            sourceHandle = connectFrom.handleId
            target = newNode.id
            const sourcePort = getPortDef(
              nodes.find((n) => n.id === connectFrom.nodeId)?.type || "",
              connectFrom.handleId,
            )
            const compatInput = def.inputs.find((p) =>
              p.dataType === "any" || !sourcePort || sourcePort.dataType === "any" || p.dataType === sourcePort.dataType,
            )
            targetHandle = compatInput?.id || def.inputs[0]?.id || ""
          } else {
            target = connectFrom.nodeId
            targetHandle = connectFrom.handleId
            source = newNode.id
            const targetPort = getPortDef(
              nodes.find((n) => n.id === connectFrom.nodeId)?.type || "",
              connectFrom.handleId,
            )
            const compatOutput = def.outputs.find((p) =>
              p.dataType === "any" || !targetPort || targetPort.dataType === "any" || p.dataType === targetPort.dataType,
            )
            sourceHandle = compatOutput?.id || def.outputs[0]?.id || ""
          }

          if (sourceHandle && targetHandle) {
            const sourceNode = [...latest.nodes, ...nodes].find((n) => n.id === source)
            const color = sourceNode?.type
              ? getEdgeColor(sourceNode.type, sourceHandle)
              : "#6B7280"

            setEdges((eds) => addEdge({
              source,
              sourceHandle,
              target,
              targetHandle,
              type: "smoothstep",
              animated: false,
              style: { stroke: color, strokeWidth: 2 },
            }, eds))
          }
        }
      }, 0)
    },
    [addNode, setNodes, setEdges, palette, nodes],
  )

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => selectNode(node.id),
    [selectNode],
  )

  const handlePaneClick = useCallback(() => {
    selectNode(null)
    setPalette(null)
  }, [selectNode])

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null

  if (!activeBlockId) return null

  return (
    <div className="fixed inset-0 z-200 bg-[#08090C]">
      {/* Toolbar */}
      <CanvasToolbar
        onSave={handleManualSave}
        onRunAll={() => { /* dataflow engine */ }}
        onFitView={() => reactFlow.fitView({ padding: 0.3 })}
        onZoomIn={() => reactFlow.zoomIn()}
        onZoomOut={() => reactFlow.zoomOut()}
        onClose={closeBlock}
      />

      {/* ReactFlow Canvas */}
      <div
        className="absolute inset-0"
        style={{ right: selectedNode ? 288 : 0, transition: "right 200ms ease" }}
        onContextMenu={handleContextMenu}
      >
        <ReactFlow
          nodes={nodesWithCallbacks}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          isValidConnection={isValidConnection}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          nodeTypes={blockCanvasNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.15}
          maxZoom={4}
          snapToGrid
          snapGrid={[16, 16]}
          connectionLineType={ConnectionLineType.SmoothStep}
          connectionLineStyle={{ stroke: "#ffffff30", strokeWidth: 2 }}
          defaultEdgeOptions={{
            type: "smoothstep",
            animated: false,
            style: { strokeWidth: 2 },
          }}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={null}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="rgba(255,255,255,0.04)"
          />
          <MiniMap
            nodeColor={(node) => {
              const c = CATEGORY_RING_COLORS[node.type || ""] || "#333"
              return c
            }}
            nodeStrokeWidth={0}
            nodeBorderRadius={4}
            maskColor="rgba(0,0,0,0.7)"
            style={{
              backgroundColor: "#0D0E12",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              bottom: 16,
              right: 16,
              width: 180,
              height: 120,
            }}
          />
        </ReactFlow>
      </div>

      {/* Node Palette (context menu) */}
      {palette && (
        <NodePalette
          position={palette.screen}
          canvasPosition={palette.canvas}
          onAdd={handleAddNode}
          onClose={() => setPalette(null)}
        />
      )}

      {/* Node Sidebar */}
      {selectedNode && (
        <NodeSidebar
          node={selectedNode}
          onClose={() => selectNode(null)}
        />
      )}
    </div>
  )
}

// ─── Wrapper with ReactFlowProvider ─────────────────────────

export function BlockCanvas() {
  const activeBlockId = useBlockCanvasStore((s) => s.activeBlockId)
  if (!activeBlockId) return null

  return (
    <ReactFlowProvider>
      <BlockCanvasInner />
    </ReactFlowProvider>
  )
}
