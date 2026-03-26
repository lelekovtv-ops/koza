'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, BookOpen, GitBranch, Settings } from 'lucide-react'
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
  type NodeChange,
  type OnSelectionChangeFunc,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import BoardAssistant from './BoardAssistant'
import LibraryButton from './LibraryButton'
import LibraryPanel from './LibraryPanel'
import BibleNode from './nodes/BibleNode'
import BreakdownNode from './nodes/BreakdownNode'
import ImageGenNode from './nodes/ImageGenNode'
import PreviewNode from './nodes/PreviewNode'
import PromptNode from './nodes/PromptNode'
import SceneNode from './nodes/SceneNode'
import SettingsNode from './nodes/SettingsNode'
import ShotNode from './nodes/ShotNode'
import ScriptDocNode from './nodes/ScriptDocNode'
import StyleNode from './nodes/StyleNode'
import ScriptWriterOverlay from '@/components/editor/ScriptWriterOverlay'
import { KozaLogo } from "@/components/ui/KozaLogo";
import { buildProjectGraph } from '@/lib/boardGraphBuilder'
import { trySaveBlob } from '@/lib/fileStorage'
import { buildImagePrompt, getReferencedBibleEntries } from '@/lib/promptBuilder'
import { useBibleStore } from '@/store/bible'
import { useBoardStore } from '@/store/board'
import { useBreakdownConfigStore } from '@/store/breakdownConfig'
import { devlog } from '@/store/devlog'
import { useLibraryStore } from '@/store/library'
import { useNavigationStore } from '@/store/navigation'
import { useProjectsStore } from '@/store/projects'
import { useScenesStore } from '@/store/scenes'
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
  bible: BibleNode,
  scene: SceneNode,
  breakdown: BreakdownNode,
  shot: ShotNode,
  imageGen: ImageGenNode,
  preview: PreviewNode,
  style: StyleNode,
  settings: SettingsNode,
  prompt: PromptNode,
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
  const shouldFitPipelineRef = useRef(false)
  const activeProjectId = useProjectsStore((state) => state.activeProjectId)
  const scriptTitle = useScriptStore((state) => state.title)
  const scriptAuthor = useScriptStore((state) => state.author)
  const scriptDate = useScriptStore((state) => state.date)
  const scriptDraft = useScriptStore((state) => state.draft)
  const timelineShots = useTimelineStore((state) => state.shots)
  const [nodesState, setNodesState, onNodesChangeBase] = useNodesState(nodes)
  const [edgesState, setEdgesState, onEdgesChange] = useEdgesState(edges)
  const [pipelineVisible, setPipelineVisible] = useState(false)
  const [expandedSceneIds, setExpandedSceneIds] = useState<Set<string>>(new Set())
  const [expandedShotIds, setExpandedShotIds] = useState<Set<string>>(new Set())
  const [breakdownStatusByScene, setBreakdownStatusByScene] = useState<Record<string, 'idle' | 'running' | 'done'>>({})
  const [imageGenStatusByShot, setImageGenStatusByShot] = useState<Record<string, 'idle' | 'generating' | 'done'>>({})
  const [canvasConfigOpen, setCanvasConfigOpen] = useState(false)
  const breakdownConfig = useBreakdownConfigStore((s) => s.global)
  const setBreakdownGlobalConfig = useBreakdownConfigStore((s) => s.setGlobal)
  const customNodePositionsRef = useRef<Record<string, { x: number; y: number }>>({})
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

  useEffect(() => {
    let prev = useTimelineStore.getState().selectedShotId
    return useTimelineStore.subscribe((state) => {
      const selectedShotId = state.selectedShotId
      if (selectedShotId === prev) return
      prev = selectedShotId
      if (!selectedShotId || !reactFlowRef.current) return
      const rf = reactFlowRef.current
      const node = rf.getNode(`shot-${selectedShotId}`) ?? rf.getNode(selectedShotId)
      if (!node) return
      syncFromTimelineRef.current = true
      setNodesState((nds) =>
        nds.map((n) => ({ ...n, selected: n.id === node.id }))
      )
      rf.fitView({ nodes: [{ id: node.id }], duration: 500, padding: 0.4 })
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
      const node = rf.getNode(`shot-${activateNodeId}`) ?? rf.getNode(activateNodeId)
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

  // Board → Timeline: when a node is selected on the board, sync to timeline
  const handleSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes }) => {
      if (syncFromTimelineRef.current) return
      const selected = selectedNodes[0]
      if (!selected) return
      const timelineState = useTimelineStore.getState()
      const selectedData = (selected.data ?? {}) as {
        shot?: { id?: string }
        scene?: { id?: string; headingBlockId?: string }
      }
      const selectedShotId = typeof selectedData.shot?.id === 'string'
        ? selectedData.shot.id
        : selected.id.startsWith('shot-')
          ? selected.id.slice(5)
          : null
      if (selectedShotId && timelineState.shots.some((shot) => shot.id === selectedShotId)) {
        timelineState.selectShot(selectedShotId)
        timelineState.scrollToShot(selectedShotId)
      }

      if (selected.type === 'scene' && typeof selectedData.scene?.id === 'string') {
        useScenesStore.getState().selectScene(selectedData.scene.id)
        if (selectedData.scene.headingBlockId) {
          useNavigationStore.getState().requestScrollToBlock(selectedData.scene.headingBlockId)
        }
      }
    },
    [],
  )

  const toggleSceneExpand = useCallback((sceneId: string) => {
    setExpandedShotIds(new Set())
    setExpandedSceneIds((prev) => (prev.has(sceneId) ? new Set() : new Set([sceneId])))
  }, [])

  const toggleShotExpand = useCallback((shotId: string) => {
    setExpandedShotIds((prev) => (prev.has(shotId) ? new Set() : new Set([shotId])))
  }, [])

  const handleRunBreakdown = useCallback(async (sceneId: string) => {
    const {
      breakdownScene,
      buildBreakdownBibleContext,
      buildScenePromptDrafts,
      createSceneTimelineShotsFromBreakdown,
    } = await import('@/features/breakdown')

    const scenes = useScenesStore.getState().scenes
    const scene = scenes.find((s) => s.id === sceneId)
    if (!scene) return

    const blocks = useScriptStore.getState().blocks
    const sceneText = scene.blockIds
      .map((bid) => blocks.find((b) => b.id === bid)?.text)
      .filter(Boolean)
      .join('\n')
    if (!sceneText.trim()) return

    const { characters, locations } = useBibleStore.getState()
    const bible = buildBreakdownBibleContext(characters, locations)

    setBreakdownStatusByScene((prev) => ({ ...prev, [sceneId]: 'running' }))

    try {
      const existingSceneShots = useTimelineStore.getState().shots.filter((shot) => shot.sceneId === scene.id)
      const breakdownConfig = useBreakdownConfigStore.getState().getConfigForScene(scene.id)
      const { shots: jenkinsShots, diagnostics } = await breakdownScene(sceneText, {
        sceneId: scene.id,
        blockIds: scene.blockIds,
        bible,
        config: breakdownConfig,
      })

      if (diagnostics.usedFallback && existingSceneShots.length > 0) {
        devlog.warn(
          'Board scene breakdown preserved existing shots',
          'Fallback mode was used, so the existing scene storyboard was kept instead of being overwritten.',
          {
            sceneId: scene.id,
            existingShotCount: existingSceneShots.length,
            ...diagnostics,
          },
        )
        setBreakdownStatusByScene((prev) => ({ ...prev, [sceneId]: 'done' }))
        setExpandedSceneIds(new Set([sceneId]))
        setExpandedShotIds(new Set(existingSceneShots[0] ? [existingSceneShots[0].id] : []))
        return
      }

      const reorderShots = useTimelineStore.getState().reorderShots
      const preservedShots = useTimelineStore.getState().shots.filter((shot) => shot.sceneId !== scene.id)
      const replacementShots = createSceneTimelineShotsFromBreakdown({
        sceneId: scene.id,
        sceneText,
        sceneBlockIds: scene.blockIds,
      }, jenkinsShots)

      reorderShots([...preservedShots, ...replacementShots])

      if (useBreakdownConfigStore.getState().autoPromptBuild) {
        const { characters, locations } = useBibleStore.getState()
        const projectStyle = useBoardStore.getState().projectStyle
        const prompts = buildScenePromptDrafts(replacementShots, characters, locations, projectStyle)
        const updateShot = useTimelineStore.getState().updateShot
        for (const p of prompts) {
          updateShot(p.shotId, { imagePrompt: p.imagePrompt, videoPrompt: p.videoPrompt })
        }
      }

      if (diagnostics.usedFallback) {
        devlog.warn(
          'Board scene breakdown used fallback',
          'Fallback mode completed and replaced the scene because there was no prior scene result to protect.',
          {
            sceneId: scene.id,
            shotCount: replacementShots.length,
            ...diagnostics,
          },
        )
      }

      setBreakdownStatusByScene((prev) => ({ ...prev, [sceneId]: 'done' }))
      setExpandedSceneIds(new Set([sceneId]))
      setExpandedShotIds(new Set(replacementShots[0] ? [replacementShots[0].id] : []))
    } catch (error) {
      console.error('Pipeline breakdown error:', error)
      setBreakdownStatusByScene((prev) => ({ ...prev, [sceneId]: 'idle' }))
    }
  }, [])

  const handleGenerateImage = useCallback(async (shotId: string) => {
    const shot = useTimelineStore.getState().shots.find((s) => s.id === shotId)
    if (!shot) return

    const { characters, locations } = useBibleStore.getState()
    const allShots = useTimelineStore.getState().shots
    const projectStyle = useBoardStore.getState().projectStyle
    const selectedModel = useBoardStore.getState().selectedImageGenModel || 'nano-banana-2'
    const group = `generate-${shotId}`
    const startTime = Date.now()
    const { characters: mentionedChars, location } = getReferencedBibleEntries(shot, characters, locations)
    const charRefs = mentionedChars
      .map((character) => `${character.name}: ${character.appearancePrompt || character.description || 'no description'}`)
      .join('\n')
    const locRef = location?.appearancePrompt || location?.description || location?.name || ''

    devlog.image('image_start', `Generate: ${shot.label}`, '', {
      shotId,
      shotSize: shot.shotSize,
      model: selectedModel,
    }, group)

    const prompt = buildImagePrompt(shot, characters, locations, projectStyle)

    devlog.image('image_prompt', 'Image prompt', prompt, {
      promptLength: prompt.length,
    }, group)

    devlog.image('image_bible_inject', 'Bible data injected', `Characters: ${charRefs || 'none'}\nLocation: ${locRef || 'none'}`, {
      characterCount: mentionedChars.length,
      hasLocation: !!locRef,
    }, group)

    devlog.image('image_style_inject', 'Style', projectStyle, {}, group)

    setImageGenStatusByShot((prev) => ({ ...prev, [shotId]: 'generating' }))

    try {
      const apiUrl = selectedModel === 'gpt-image' ? '/api/gpt-image' : '/api/nano-banana'
      const body = selectedModel === 'gpt-image' ? { prompt } : { prompt, model: selectedModel }

      devlog.image('image_api_call', `API call: ${apiUrl}`, JSON.stringify(body, null, 2), {
        model: selectedModel,
        endpoint: apiUrl,
      }, group)

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) throw new Error(`Generation failed: ${response.status}`)

      const blob = await response.blob()
      const blobKey = `shot-thumb-${shotId}`
      const persisted = await trySaveBlob(blobKey, blob)
      const objectUrl = URL.createObjectURL(blob)

      const currentShot = useTimelineStore.getState().shots.find((s) => s.id === shotId)
      const entry = { url: objectUrl, blobKey: persisted ? blobKey : null, timestamp: Date.now() }
      const history = [...(currentShot?.generationHistory || []), entry]
      useTimelineStore.getState().updateShot(shotId, {
        thumbnailUrl: objectUrl,
        thumbnailBlobKey: persisted ? blobKey : null,
        generationHistory: history,
        activeHistoryIndex: history.length - 1,
      })

      const projectId = useProjectsStore.getState().activeProjectId || 'global'
      useLibraryStore.getState().addFile({
        id: blobKey,
        name: `${shot.label || 'Shot'} — generated.png`,
        type: 'image',
        mimeType: 'image/png',
        size: blob.size,
        url: objectUrl,
        thumbnailUrl: objectUrl,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: ['generated', 'storyboard', 'pipeline'],
        projectId,
        folder: '/storyboard',
        origin: 'generated',
      })

      devlog.image('image_result', `Generated in ${Date.now() - startTime}ms`, '', {
        timing: Date.now() - startTime,
        blobSize: blob.size,
        model: selectedModel,
        persisted,
      }, group)

      if (!persisted) {
        devlog.warn('Image cache unavailable', 'The image was generated, but local blob persistence failed. The preview will work until reload.', {
          shotId,
          model: selectedModel,
        })
      }

      setImageGenStatusByShot((prev) => ({ ...prev, [shotId]: 'done' }))
    } catch (error) {
      devlog.image('image_error', 'Generation failed', String(error), {
        shotId,
        model: selectedModel,
      }, group)
      console.error('Pipeline image generation error:', error)
      setImageGenStatusByShot((prev) => ({ ...prev, [shotId]: 'idle' }))
    }
  }, [])

  const rebuildPipelineGraph = useCallback(() => {
    const currentScenes = useScenesStore.getState().scenes
    const currentShots = useTimelineStore.getState().shots
    const currentCharacters = useBibleStore.getState().characters
    const currentLocations = useBibleStore.getState().locations

    const { nodes: graphNodes, edges: graphEdges } = buildProjectGraph(
      {
        scenes: currentScenes,
        shots: currentShots,
        characters: currentCharacters,
        locations: currentLocations,
        expandedSceneIds,
        expandedShotIds,
        breakdownStatusByScene,
        imageGenStatusByShot,
      },
      {
        onToggleScene: toggleSceneExpand,
        onToggleShotExpand: toggleShotExpand,
        onRunBreakdown: handleRunBreakdown,
        onGenerateImage: handleGenerateImage,
      },
    )

    setNodesState((prev) => {
      const previousNodes = new Map(prev.map((node) => [node.id, node]))
      const scriptNode = previousNodes.get('doc-1')
      const positions = customNodePositionsRef.current
      const mergedNodes = graphNodes.map((node) => ({
        ...node,
        position: positions[node.id] ?? node.position,
        selected: previousNodes.get(node.id)?.selected,
      }))

      return scriptNode ? [scriptNode, ...mergedNodes] : mergedNodes
    })
    setEdgesState(graphEdges)

    if (shouldFitPipelineRef.current) {
      shouldFitPipelineRef.current = false
      window.setTimeout(() => {
        reactFlowRef.current?.fitView({ duration: 800, padding: 0.08 })
      }, 100)
    }
  }, [
    expandedSceneIds,
    expandedShotIds,
    breakdownStatusByScene,
    imageGenStatusByShot,
    handleRunBreakdown,
    handleGenerateImage,
    setEdgesState,
    setNodesState,
    toggleSceneExpand,
    toggleShotExpand,
  ])

  const handleTogglePipeline = useCallback(() => {
    if (pipelineVisible) {
      setNodesState((prev) => prev.filter((node) => node.id === 'doc-1'))
      setEdgesState([])
      setExpandedSceneIds(new Set())
      setExpandedShotIds(new Set())
      setPipelineVisible(false)
      window.setTimeout(() => {
        reactFlowRef.current?.fitView({ nodes: [{ id: 'doc-1' }], duration: 600, padding: 0.3 })
      }, 50)
      return
    }

    shouldFitPipelineRef.current = true
    setExpandedSceneIds(new Set())
    setExpandedShotIds(new Set())
    setPipelineVisible(true)
  }, [pipelineVisible, setEdgesState, setNodesState])

  // Rebuild graph ONLY on structural changes — NOT on drag or store data updates
  useEffect(() => {
    if (!pipelineVisible) return
    rebuildPipelineGraph()
  }, [pipelineVisible, expandedSceneIds, expandedShotIds, breakdownStatusByScene, imageGenStatusByShot]) // eslint-disable-line react-hooks/exhaustive-deps

  // Data-only update: refresh node data (thumbnails, durations) without touching positions
  useEffect(() => {
    if (!pipelineVisible) return
    setNodesState((prev) =>
      prev.map((node) => {
        const d = node.data as Record<string, unknown>
        if (node.type === 'shot') {
          const shotData = d.shot as { id?: string } | undefined
          if (shotData?.id) {
            const freshShot = timelineShots.find((s) => s.id === shotData.id)
            if (freshShot && freshShot !== shotData) {
              return { ...node, data: { ...d, shot: freshShot } }
            }
          }
        }
        if (node.type === 'imageGen' && typeof d.shotId === 'string') {
          const freshShot = timelineShots.find((s) => s.id === d.shotId) as { thumbnailUrl?: string } | undefined
          if (freshShot) {
            return { ...node, data: { ...d, thumbnailUrl: freshShot.thumbnailUrl } }
          }
        }
        if (node.type === 'preview' && typeof d.shotId === 'string') {
          const freshShot = timelineShots.find((s) => s.id === d.shotId) as { thumbnailUrl?: string; duration?: number } | undefined
          if (freshShot) {
            return { ...node, data: { ...d, thumbnailUrl: freshShot.thumbnailUrl, duration: freshShot.duration } }
          }
        }
        return node
      }),
    )
  }, [pipelineVisible, timelineShots, setNodesState])

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
          onClick={handleTogglePipeline}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm backdrop-blur transition-all hover:shadow-md ${
            pipelineVisible
              ? 'border border-[#D4A853]/30 bg-[#D4A853]/20 text-[#D4A853]'
              : 'bg-white/80 text-[#2D2A26] hover:bg-white'
          }`}
        >
          <GitBranch className="h-4 w-4" />
          Pipeline
        </button>
        <button
          onClick={() => setCanvasConfigOpen((v) => !v)}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm backdrop-blur transition-all hover:shadow-md ${
            canvasConfigOpen
              ? 'border border-[#D4A853]/30 bg-[#D4A853]/20 text-[#D4A853]'
              : 'bg-white/80 text-[#2D2A26] hover:bg-white'
          }`}
        >
          <Settings className="h-4 w-4" />
          Config
        </button>
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-lg bg-white/80 px-3 py-2 text-sm font-medium text-[#2D2A26] shadow-sm backdrop-blur transition-all hover:bg-white hover:shadow-md"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>
      {canvasConfigOpen && (
        <div className="absolute top-4 left-[220px] z-50 w-[340px] rounded-xl border border-[#C4B9AC]/60 bg-white/95 p-3 shadow-lg backdrop-blur">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B6356]">Breakdown Engine Config</p>
          <div className="flex flex-col gap-2">
            {([
              { key: 'shotDensity' as const, label: 'Density', options: ['lean', 'balanced', 'dense'] },
              { key: 'continuityStrictness' as const, label: 'Continuity', options: ['flexible', 'standard', 'strict'] },
              { key: 'textRichness' as const, label: 'Richness', options: ['simple', 'rich', 'lush'] },
              { key: 'relationMode' as const, label: 'Relations', options: ['minimal', 'balanced', 'explicit'] },
              { key: 'fallbackMode' as const, label: 'Fallback', options: ['balanced', 'prefer_speed', 'fail_fast'] },
              { key: 'keyframePolicy' as const, label: 'Keyframes', options: ['opening_anchor', 'story_turns', 'every_major_shift'] },
            ] as const).map(({ key, label, options }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-[70px] text-[10px] text-[#8B7E6E]">{label}</span>
                <div className="flex rounded-lg border border-[#D8D0C3]/60 bg-[#F5F0EA]">
                  {options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setBreakdownGlobalConfig({ [key]: opt })}
                      className={`px-2 py-1 text-[9px] transition-all ${
                        breakdownConfig[key] === opt
                          ? 'bg-[#D4A853]/25 font-medium text-[#8B6914]'
                          : 'text-[#8B7E6E] hover:text-[#4A3F2F]'
                      }`}
                    >
                      {opt.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
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
