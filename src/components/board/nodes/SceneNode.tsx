'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ChevronDown, ChevronRight, Clapperboard } from 'lucide-react'
import { type Scene } from '@/lib/sceneParser'
import { useNavigationStore } from '@/store/navigation'
import { useScenesStore } from '@/store/scenes'

type SceneNodeData = {
  scene: Scene
  shotCount: number
  isExpanded?: boolean
  onToggleExpand?: (sceneId: string) => void
}

const handleStyle = {
  width: 10,
  height: 10,
  borderRadius: 999,
  borderWidth: 1.5,
  background: '#1A1816',
  borderColor: 'rgba(255,255,255,0.28)',
}

export default function SceneNode({ data }: NodeProps) {
  const { scene, shotCount, isExpanded = false, onToggleExpand } = (data || {}) as SceneNodeData
  const selectScene = useScenesStore((state) => state.selectScene)
  const requestScrollToBlock = useNavigationStore((state) => state.requestScrollToBlock)

  const handleClick = () => {
    selectScene(scene.id)
    if (scene.headingBlockId) {
      requestScrollToBlock(scene.headingBlockId)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleClick()
        }
      }}
      className="nopan relative flex h-[70px] w-[240px] items-stretch overflow-hidden rounded-xl border border-white/8 bg-[#1A1816]/95 text-[#E5E0DB] shadow-[0_14px_28px_rgba(0,0,0,0.2)]"
    >
      <Handle type="target" position={Position.Left} className="!left-[-6px] !h-[10px] !w-[10px] !rounded-full !border-[1.5px]" style={handleStyle} />
      <Handle type="source" position={Position.Right} className="!right-[-6px] !h-[10px] !w-[10px] !rounded-full !border-[1.5px]" style={handleStyle} />

      <div className="w-1 shrink-0" style={{ backgroundColor: scene.color }} />

      <div className="flex min-w-0 flex-1 items-center justify-between px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/50">
            <span>SC {scene.index}</span>
            <Clapperboard size={14} className="text-white/35" />
          </div>
          <div className="mt-1 truncate text-sm font-medium text-[#E5E0DB]">{scene.title}</div>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onToggleExpand?.(scene.id)
          }}
          className="nodrag nopan ml-3 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/65"
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>{shotCount}</span>
        </button>
      </div>
    </div>
  )
}