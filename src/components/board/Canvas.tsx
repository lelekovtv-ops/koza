'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type NodeTypes,
  type ReactFlowInstance,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import BoardAssistant from './BoardAssistant'
import LibraryButton from './LibraryButton'
import LibraryPanel from './LibraryPanel'
import ScriptDocNode from './nodes/ScriptDocNode'
import ScriptWriterOverlay from '@/components/editor/ScriptWriterOverlay'
import { useProjectsStore } from '@/store/projects'
import { useScriptStore } from '@/store/script'

type NodeScreenRect = {
  x: number
  y: number
  width: number
  height: number
}

const nodeTypes: NodeTypes = {
  scriptDoc: ScriptDocNode,
}

const nodes: Node[] = [
  {
    id: 'doc-1',
    type: 'scriptDoc',
    position: { x: 0, y: 0 },
    data: { title: 'Untitled' },
  },
]
const edges: Edge[] = []

interface CanvasProps {
  onBack: () => void
}

export default function Canvas({ onBack }: CanvasProps) {
  const reactFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null)
  const activeProjectId = useProjectsStore((state) => state.activeProjectId)
  const scriptTitle = useScriptStore((state) => state.title)
  const scriptAuthor = useScriptStore((state) => state.author)
  const scriptDate = useScriptStore((state) => state.date)
  const scriptDraft = useScriptStore((state) => state.draft)
  const [nodesState, setNodesState, onNodesChange] = useNodesState(nodes)
  const [edgesState, setEdgesState, onEdgesChange] = useEdgesState(edges)
  const [editorMode, setEditorMode] = useState<{
    active: boolean
    nodeId: string | null
    type: 'new' | 'upload' | null
    initialRect: NodeScreenRect | null
  }>({ active: false, nodeId: null, type: null, initialRect: null })

  const handleInit = (rf: ReactFlowInstance<Node, Edge>) => {
    reactFlowRef.current = rf
    window.setTimeout(() => {
      rf.fitView({ nodes: [{ id: 'doc-1' }], duration: 800, padding: 0.3 })
    }, 40)
  }

  const enterEditor = useCallback((nodeId: string, type: 'new' | 'upload', initialRect: NodeScreenRect) => {
    setEditorMode({ active: true, nodeId, type, initialRect })
  }, [])

  const handleCloseStart = useCallback(() => {
    reactFlowRef.current?.zoomOut({ duration: 400 })
  }, [])

  const handleCloseComplete = useCallback(() => {
    setEditorMode({ active: false, nodeId: null, type: null, initialRect: null })
  }, [])

  const viewNodes = useMemo(
    () =>
      nodesState.map((node) => {
        if (node.type !== 'scriptDoc') return node
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
      }),
    [nodesState, enterEditor, scriptTitle, scriptAuthor, scriptDate, scriptDraft]
  )

  return (
    <div className="relative h-screen w-screen" style={{ backgroundColor: '#FAF6F1' }}>
      <ReactFlow
        nodes={viewNodes}
        edges={edgesState}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onInit={handleInit}
        fitView
        minZoom={0.2}
        maxZoom={2}
        zoomOnScroll
        zoomOnPinch
        panOnScroll
        panOnDrag={[1]}
        style={{ backgroundColor: '#FAF6F1' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.5}
          color="rgba(141, 126, 109, 0.45)"
        />
        <MiniMap
          pannable
          zoomable
          style={{
            width: 150,
            height: 100,
            backgroundColor: 'rgba(255, 255, 255, 0.72)',
            border: '1px solid rgba(196, 185, 172, 0.85)',
            borderRadius: '10px',
            backdropFilter: 'blur(4px)',
          }}
          maskColor="rgba(245, 240, 235, 0.32)"
          nodeColor="#D8CEC1"
        />
      </ReactFlow>
      <button
        onClick={onBack}
        className="absolute top-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-white/80 px-3 py-2 text-sm font-medium text-[#2D2A26] shadow-sm backdrop-blur transition-all hover:bg-white hover:shadow-md"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>
      {!editorMode.active && <LibraryButton />}
      <LibraryPanel projectId={activeProjectId} hidden={editorMode.active} />
      <BoardAssistant />
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
