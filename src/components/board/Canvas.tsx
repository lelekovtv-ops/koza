'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, BookOpen } from 'lucide-react'
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
  type OnSelectionChangeFunc,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import BoardAssistant from './BoardAssistant'
import LibraryButton from './LibraryButton'
import LibraryPanel from './LibraryPanel'
import ScriptDocNode from './nodes/ScriptDocNode'
import ScriptWriterOverlay from '@/components/editor/ScriptWriterOverlay'
import { KozaLogo } from "@/components/ui/KozaLogo";
import { useProjectsStore } from '@/store/projects'
import { useScriptStore } from '@/store/script'
import { useTimelineStore } from '@/store/timeline'

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
  const router = useRouter()
  const reactFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null)
  const syncFromTimelineRef = useRef(false)
  const activeProjectId = useProjectsStore((state) => state.activeProjectId)
  const scriptTitle = useScriptStore((state) => state.title)
  const scriptAuthor = useScriptStore((state) => state.author)
  const scriptDate = useScriptStore((state) => state.date)
  const scriptDraft = useScriptStore((state) => state.draft)
  const [nodesState, setNodesState, onNodesChange] = useNodesState(nodes)
  const [edgesState, , onEdgesChange] = useEdgesState(edges)
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

  useEffect(() => {
    let prev = useTimelineStore.getState().selectedShotId
    return useTimelineStore.subscribe((state) => {
      const selectedShotId = state.selectedShotId
      if (selectedShotId === prev) return
      prev = selectedShotId
      if (!selectedShotId || !reactFlowRef.current) return
      const rf = reactFlowRef.current
      const node = rf.getNode(selectedShotId)
      if (!node) return
      syncFromTimelineRef.current = true
      setNodesState((nds) =>
        nds.map((n) => ({ ...n, selected: n.id === selectedShotId }))
      )
      rf.fitView({ nodes: [{ id: selectedShotId }], duration: 500, padding: 0.4 })
      window.setTimeout(() => { syncFromTimelineRef.current = false }, 600)
    })
  }, [setNodesState])

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
      rf.fitView({ nodes: [{ id: activateNodeId }], duration: 500, padding: 0.3 })
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

  // Board → Timeline: when a node is selected on the board, sync to timeline
  const handleSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes }) => {
      if (syncFromTimelineRef.current) return
      const selected = selectedNodes[0]
      if (!selected) return
      const timelineState = useTimelineStore.getState()
      if (timelineState.shots.some((s) => s.id === selected.id)) {
        timelineState.scrollToShot(selected.id)
      }
    },
    [],
  )

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
      <div className="h-full w-full" style={{ pointerEvents: editorMode.active ? 'none' : 'auto' }}>
        <ReactFlow
          nodes={viewNodes}
          edges={edgesState}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onInit={handleInit}
          onSelectionChange={handleSelectionChange}
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
      </div>
      <div className="absolute top-4 left-4 z-50 flex flex-col gap-2">
        <KozaLogo size="md" variant="default" className="text-[#2D2A26]" />
        <button
          onClick={() => router.push('/bible')}
          className="flex items-center gap-2 rounded-lg bg-white/80 px-3 py-2 text-sm font-medium text-[#2D2A26] shadow-sm backdrop-blur transition-all hover:bg-white hover:shadow-md"
        >
          <BookOpen className="h-4 w-4" />
          Bible
        </button>
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-lg bg-white/80 px-3 py-2 text-sm font-medium text-[#2D2A26] shadow-sm backdrop-blur transition-all hover:bg-white hover:shadow-md"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>
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
