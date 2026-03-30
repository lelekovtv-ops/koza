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

interface CanvasProps {
  onBack: () => void
}

const nodeTypes: NodeTypes = {
  scriptDoc: ScriptDocNode,
  style: StyleNode,
  prompt: PromptNode,
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
  const [nodesState, setNodesState, onNodesChangeBase] = useNodesState(nodes)
  const [edgesState, , onEdgesChange] = useEdgesState(edges)
  const customNodePositionsRef = useRef<Record<string, { x: number; y: number }>>({})
  const [editorMode, setEditorMode] = useState<{
    active: boolean
    nodeId: string | null
    type: 'new' | 'upload' | null
    initialRect: NodeScreenRect | null
  }>(() => {
    const blocks = useScriptStore.getState().blocks
    const title = useScriptStore.getState().title
    const hasContent = (title.trim().length > 0 && title !== "UNTITLED") || blocks.length > 1
    if (hasContent) return { active: true, nodeId: 'doc-1', type: 'new', initialRect: null }
    return { active: false, nodeId: null, type: null, initialRect: null }
  })

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

        return node
      }),
    [nodesState, enterEditor, scriptTitle, scriptAuthor, scriptDate, scriptDraft]
  )

  return (
    <div className="relative h-screen w-screen" style={{ backgroundColor: '#FAF6F1' }}>
      <div className="h-full w-full" style={{ pointerEvents: editorMode.active ? 'none' : 'auto' }}>
        <ReactFlow
          nodes={viewNodes}
          edges={edgesState}
          onNodesChange={handleNodesChange}
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
        </ReactFlow>
      </div>
      <div className="absolute top-4 left-4 z-50">
        <KozaLogo size="md" variant="default" className="text-[#2D2A26]" />
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
