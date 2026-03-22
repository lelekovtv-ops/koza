import { type Edge, type Node } from '@xyflow/react'
import { type CharacterEntry, type LocationEntry } from '@/lib/bibleParser'
import { type Scene } from '@/lib/sceneParser'
import { type TimelineShot } from '@/store/timeline'

type BreakdownStatus = 'idle' | 'running' | 'done'
type ImageGenStatus = 'idle' | 'generating' | 'done'

interface GraphInput {
  scenes: Scene[]
  shots: TimelineShot[]
  characters: CharacterEntry[]
  locations: LocationEntry[]
  expandedSceneIds: Set<string>
  expandedShotIds: Set<string>
  breakdownStatusByScene?: Record<string, BreakdownStatus>
  imageGenStatusByShot?: Record<string, ImageGenStatus>
}

interface GraphCallbacks {
  onToggleScene: (sceneId: string) => void
  onToggleShotExpand: (shotId: string) => void
  onRunBreakdown: (sceneId: string) => void
  onGenerateImage: (shotId: string) => void
}

export function buildProjectGraph(input: GraphInput, callbacks: GraphCallbacks): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const COL_BIBLE = 0
  const COL_SCENES = 400
  const COL_BREAKDOWN = 700
  const COL_SHOTS = 1020
  const COL_PROMPT = 1160
  const COL_IMGGEN = 1420
  const COL_PREVIEW = 1650
  const SCENE_GAP = 180
  const SHOT_GAP = 85

  nodes.push({
    id: 'style-node',
    type: 'style',
    position: { x: COL_BIBLE, y: 0 },
    data: {},
  })

  nodes.push({
    id: 'settings-node',
    type: 'settings',
    position: { x: COL_BIBLE, y: 160 },
    data: {},
  })

  let sceneY = 0

  input.scenes.forEach((scene) => {
    const sceneShots = input.shots.filter((shot) => shot.sceneId === scene.id)
    const sceneNodeId = `scene-${scene.id}`
    const isSceneExpanded = input.expandedSceneIds.has(scene.id)
    const breakdownStatus = input.breakdownStatusByScene?.[scene.id] ?? (sceneShots.length > 0 ? 'done' : 'idle')

    nodes.push({
      id: sceneNodeId,
      type: 'scene',
      position: { x: COL_SCENES, y: sceneY },
      data: {
        scene,
        shotCount: sceneShots.length,
        isExpanded: isSceneExpanded,
        onToggleExpand: callbacks.onToggleScene,
      },
    })

    edges.push({
      id: `e-doc1-${sceneNodeId}`,
      source: 'doc-1',
      target: sceneNodeId,
      animated: true,
      style: { stroke: scene.color, strokeWidth: 1.5 },
    })

    const breakdownId = `breakdown-${scene.id}`
    nodes.push({
      id: breakdownId,
      type: 'breakdown',
      position: { x: COL_BREAKDOWN, y: sceneY },
      data: {
        sceneId: scene.id,
        sceneTitle: scene.title,
        shotCount: sceneShots.length,
        status: breakdownStatus,
        isExpanded: isSceneExpanded,
        onToggleExpand: callbacks.onToggleScene,
        onRun: callbacks.onRunBreakdown,
      },
    })

    edges.push({
      id: `e-${sceneNodeId}-${breakdownId}`,
      source: sceneNodeId,
      target: breakdownId,
      style: { stroke: scene.color, strokeWidth: 1.5 },
    })

    edges.push({
      id: `e-style-breakdown-${scene.id}`,
      source: 'style-node',
      target: breakdownId,
      style: { stroke: '#7C4A6F', strokeWidth: 0.5, strokeDasharray: '3 3' },
    })

    edges.push({
      id: `e-settings-breakdown-${scene.id}`,
      source: 'settings-node',
      target: breakdownId,
      style: { stroke: '#4A6F7C', strokeWidth: 0.5, strokeDasharray: '3 3' },
    })

    if (isSceneExpanded) {
      sceneShots.forEach((shot, index) => {
        const shotY = sceneY + index * SHOT_GAP
        const shotNodeId = `shot-${shot.id}`
        const imgGenId = `imggen-${shot.id}`
        const previewId = `preview-${shot.id}`
        const promptId = `prompt-${shot.id}`
        const isShotExpanded = input.expandedShotIds.has(shot.id)

        nodes.push({
          id: shotNodeId,
          type: 'shot',
          position: { x: COL_SHOTS, y: shotY },
          data: {
            shot,
            isExpanded: isShotExpanded,
            onToggleExpand: callbacks.onToggleShotExpand,
          },
        })

        edges.push({
          id: `e-${breakdownId}-${shotNodeId}`,
          source: breakdownId,
          target: shotNodeId,
          style: { stroke: scene.color, strokeWidth: 1 },
        })

        if (isShotExpanded) {
          nodes.push({
            id: promptId,
            type: 'prompt',
            position: { x: COL_PROMPT, y: shotY },
            data: { shotId: shot.id },
          })

          edges.push({
            id: `e-${shotNodeId}-${promptId}`,
            source: shotNodeId,
            target: promptId,
            style: { strokeWidth: 1 },
          })

          edges.push({
            id: `e-style-${promptId}`,
            source: 'style-node',
            target: promptId,
            style: { stroke: '#7C4A6F', strokeWidth: 0.5, strokeDasharray: '3 3' },
          })

          nodes.push({
            id: imgGenId,
            type: 'imageGen',
            position: { x: COL_IMGGEN, y: shotY },
            data: {
              shotId: shot.id,
              thumbnailUrl: shot.thumbnailUrl,
              status: input.imageGenStatusByShot?.[shot.id] ?? (shot.thumbnailUrl ? 'done' : 'idle'),
              onGenerate: callbacks.onGenerateImage,
            },
          })

          edges.push({
            id: `e-${promptId}-${imgGenId}`,
            source: promptId,
            target: imgGenId,
            style: { strokeWidth: 1 },
          })

          edges.push({
            id: `e-settings-${imgGenId}`,
            source: 'settings-node',
            target: imgGenId,
            style: { stroke: '#4A6F7C', strokeWidth: 0.5, strokeDasharray: '3 3' },
          })

          nodes.push({
            id: previewId,
            type: 'preview',
            position: { x: COL_PREVIEW, y: shotY },
            data: { shotId: shot.id, thumbnailUrl: shot.thumbnailUrl, duration: shot.duration },
          })

          edges.push({
            id: `e-${imgGenId}-${previewId}`,
            source: imgGenId,
            target: previewId,
            style: { stroke: '#4A7C6F', strokeWidth: 1 },
          })
        }
      })
    }

    const sceneHeight = isSceneExpanded
      ? Math.max(SCENE_GAP, sceneShots.length * SHOT_GAP + 60)
      : SCENE_GAP

    sceneY += sceneHeight
  })

  return { nodes, edges }
}