'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type NodeTypes,
  type ReactFlowInstance,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import BoardAssistant from './BoardAssistant'
import LibraryButton from './LibraryButton'
import LibraryPanel from './LibraryPanel'
import ScriptDocNode from './nodes/ScriptDocNode'
import StyleNode from './nodes/StyleNode'
import PromptNode from './nodes/PromptNode'
import StickyNoteNode from './nodes/StickyNoteNode'
import TextBlockNode from './nodes/TextBlockNode'
import ImageCardNode from './nodes/ImageCardNode'
import BoardToolbar, { type BoardTool } from './BoardToolbar'
import ScriptWriterOverlay from '@/components/editor/ScriptWriterOverlay'
import { KozaLogo } from "@/components/ui/KozaLogo";
import { useProjectsStore } from '@/store/projects'
import { useScriptStore } from '@/store/script'
import { useTimelineStore } from '@/store/timeline'
import { useThemeStore } from '@/store/theme'

type NodeScreenRect = {
  x: number
  y: number
  width: number
  height: number
}

interface CanvasProps {
  onBack: () => void
}

const nodeTypes: NodeTypes = {
  scriptDoc: ScriptDocNode,
  style: StyleNode,
  prompt: PromptNode,
  sticky: StickyNoteNode,
  textBlock: TextBlockNode,
  imageCard: ImageCardNode,
}

let _nodeIdCounter = 0
function makeNodeId(prefix: string) {
  return `${prefix}-${Date.now()}-${++_nodeIdCounter}`
}

const nodes: Node[] = [
  {
    id: 'doc-1',
    type: 'scriptDoc',
    position: { x: 0, y: 0 },
    data: {},
  },
]

const edges: Edge[] = []

export default function Canvas({ onBack }: CanvasProps) {
  const reactFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null)
  const activeProjectId = useProjectsStore((state) => state.activeProjectId)
  const scriptTitle = useScriptStore((state) => state.title)
  const scriptAuthor = useScriptStore((state) => state.author)
  const scriptDate = useScriptStore((state) => state.date)
  const scriptDraft = useScriptStore((state) => state.draft)
  const appTheme = useThemeStore((s) => s.theme)
  const canvasBg = appTheme === "architect" ? "#080808" : appTheme === "synthwave" ? "#0a0614" : "#FAF6F1"
  const [activeTool, setActiveTool] = useState<BoardTool>("select")
  const [nodesState, setNodesState, onNodesChangeBase] = useNodesState(nodes)
  const [edgesState, , onEdgesChange] = useEdgesState(edges)
  const customNodePositionsRef = useRef<Record<string, { x: number; y: number }>>({})
  const [editorMode, setEditorMode] = useState<{
    active: boolean
    nodeId: string | null
    type: 'new' | 'upload' | null
    initialRect: NodeScreenRect | null
  }>({ active: false, nodeId: null, type: null, initialRect: null })

  // ── Board node operations ──
  const handleNodeUpdate = useCallback((nodeId: string, newData: Record<string, unknown>) => {
    setNodesState((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n))
    )
  }, [setNodesState])

  const handleNodeDelete = useCallback((nodeId: string) => {
    setNodesState((nds) => nds.filter((n) => n.id !== nodeId))
  }, [setNodesState])

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent) => {
      if (activeTool === "select" || activeTool === "pan" || activeTool === "connector") return
      if (editorMode.active) return

      const rf = reactFlowRef.current
      if (!rf) return

      const position = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY })

      let newNode: Node | null = null

      if (activeTool === "sticky") {
        newNode = {
          id: makeNodeId("sticky"),
          type: "sticky",
          position,
          data: { text: "", colorIndex: Math.floor(Math.random() * 6) },
        }
      } else if (activeTool === "text") {
        newNode = {
          id: makeNodeId("text"),
          type: "textBlock",
          position,
          data: { text: "", fontSize: 16 },
        }
      } else if (activeTool === "image") {
        newNode = {
          id: makeNodeId("img"),
          type: "imageCard",
          position,
          data: { src: "", caption: "" },
        }
      }

      if (newNode) {
        setNodesState((nds) => [...nds, newNode!])
        setActiveTool("select")
      }
    },
    [activeTool, editorMode.active, setNodesState],
  )

  const handleInit = (rf: ReactFlowInstance<Node, Edge>) => {
    reactFlowRef.current = rf
    window.setTimeout(() => {
      rf.fitView({ nodes: [{ id: 'doc-1' }], duration: 800, padding: 0.3 })
    }, 40)
  }

  const router = useRouter()
  const enterEditor = useCallback((nodeId: string, type: 'new' | 'upload', initialRect: NodeScreenRect) => {
    setEditorMode({ active: true, nodeId, type, initialRect })
    router.push("/")
  }, [router])

  const handleCloseStart = useCallback(() => {
    reactFlowRef.current?.zoomOut({ duration: 400 })
  }, [])

  const handleCloseComplete = useCallback(() => {
    setEditorMode({ active: false, nodeId: null, type: null, initialRect: null })
  }, [])

  const handleNodesChange = useCallback((changes: NodeChange<Node>[]) => {
    onNodesChangeBase(changes)
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        customNodePositionsRef.current[change.id] = change.position
      }
      if (change.type === 'remove') {
        delete customNodePositionsRef.current[change.id]
      }
    }
  }, [onNodesChangeBase])

  // Timeline → Board: when activateNodeId is set, open editor for that node
  useEffect(() => {
    let prev = useTimelineStore.getState().activateNodeId
    return useTimelineStore.subscribe((state) => {
      const activateNodeId = state.activateNodeId
      if (activateNodeId === prev) return
      prev = activateNodeId
      if (!activateNodeId || !reactFlowRef.current) return
      const rf = reactFlowRef.current
      const node = rf.getNode(activateNodeId)
      useTimelineStore.getState().activateNode(null)
      if (!node) return
      rf.fitView({ nodes: [{ id: node.id }], duration: 500, padding: 0.3 })
      if (node.type === 'scriptDoc') {
        const domNode = document.querySelector(`[data-id="${CSS.escape(activateNodeId)}"]`)
        if (domNode) {
          const rect = domNode.getBoundingClientRect()
          window.setTimeout(() => {
            enterEditor(activateNodeId, 'new', {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            })
          }, 520)
        }
      }
    })
  }, [enterEditor])

  const viewNodes = useMemo(
    () =>
      nodesState.map((node) => {
        if (node.type === 'scriptDoc') {
          return {
            ...node,
            data: {
              ...(node.data || {}),
              onEnterEditor: enterEditor,
              scriptTitle,
              scriptAuthor,
              scriptDate,
              scriptDraft,
            },
          }
        }

        if (node.type === 'sticky' || node.type === 'textBlock' || node.type === 'imageCard') {
          return {
            ...node,
            data: {
              ...node.data,
              onUpdate: handleNodeUpdate,
              onDelete: handleNodeDelete,
            },
          }
        }

        return node
      }),
    [nodesState, enterEditor, scriptTitle, scriptAuthor, scriptDate, scriptDraft, handleNodeUpdate, handleNodeDelete]
  )

  return (
    <div className="relative h-screen w-screen" style={{ backgroundColor: canvasBg }}>
      <div className="h-full w-full" style={{ pointerEvents: editorMode.active ? 'none' : 'auto' }}>
        <ReactFlow
          nodes={viewNodes}
          edges={edgesState}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onInit={handleInit}
          onPaneClick={handleCanvasClick}
          fitView
          minZoom={0.05}
          maxZoom={2}
          zoomOnScroll
          zoomOnPinch
          panOnScroll
          panOnDrag={activeTool === "pan" ? [0, 1] : [1]}
          style={{
            backgroundColor: canvasBg,
            cursor: activeTool === "sticky" || activeTool === "text" || activeTool === "image"
              ? "crosshair"
              : activeTool === "pan" ? "grab" : "default",
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1.5}
            color="rgba(141, 126, 109, 0.45)"
          />
        </ReactFlow>
      </div>
      <div className="absolute top-4 left-4 z-50">
        <KozaLogo size="md" variant="default" className="text-[#2D2A26]" />
      </div>
      {!editorMode.active && <LibraryButton />}
      <LibraryPanel projectId={activeProjectId} hidden={editorMode.active} />
      <BoardAssistant />
      {!editorMode.active && (
        <BoardToolbar activeTool={activeTool} onToolChange={setActiveTool} />
      )}
      <ScriptWriterOverlay
        active={editorMode.active}
        type={editorMode.type}
        initialRect={editorMode.initialRect}
        onCloseStart={handleCloseStart}
        onCloseComplete={handleCloseComplete}
      />
    </div>
  )
}
