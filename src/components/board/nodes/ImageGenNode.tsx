'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Loader2, Play, Sparkles } from 'lucide-react'
import { useBoardStore } from '@/store/board'
import { useTimelineStore } from '@/store/timeline'

type ImageGenStatus = 'idle' | 'generating' | 'done'

type ImageGenNodeData = {
  shotId: string
  thumbnailUrl: string | null
  status: ImageGenStatus
  onGenerate?: (shotId: string) => void
}

const handleStyle = {
  width: 10,
  height: 10,
  borderRadius: 999,
  borderWidth: 1.5,
  background: '#1A1816',
  borderColor: 'rgba(255,255,255,0.28)',
}

export default function ImageGenNode({ data }: NodeProps) {
  const nodeData = (data || {}) as ImageGenNodeData
  const selectedImageGenModel = useBoardStore((state) => state.selectedImageGenModel)
  const liveThumbnailUrl = useTimelineStore((state) => state.shots.find((shot) => shot.id === nodeData.shotId)?.thumbnailUrl ?? nodeData.thumbnailUrl)
  const isGenerating = nodeData.status === 'generating'

  return (
    <div className="nopan relative h-[80px] w-[150px] rounded-xl border border-white/8 bg-[#1A1816]/95 p-2.5 text-[#E5E0DB] shadow-[0_14px_28px_rgba(0,0,0,0.2)]">
      <Handle type="target" position={Position.Left} className="!left-[-6px] !h-[10px] !w-[10px] !rounded-full !border-[1.5px]" style={handleStyle} />
      <Handle type="source" position={Position.Right} className="!right-[-6px] !h-[10px] !w-[10px] !rounded-full !border-[1.5px]" style={handleStyle} />

      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-white/50">IMAGE</div>
        {isGenerating ? <Loader2 size={15} className="animate-spin text-[#D4A853]" /> : <Sparkles size={15} className="text-white/30" />}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="flex h-[34px] w-[60px] items-center justify-center overflow-hidden rounded-md border border-white/8 bg-white/5">
          {liveThumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={liveThumbnailUrl} alt="Generated shot" className="h-full w-full object-cover" />
          ) : (
            <div className="text-[10px] text-white/30">No img</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/65">
            {selectedImageGenModel}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          nodeData.onGenerate?.(nodeData.shotId)
        }}
        disabled={isGenerating}
        className="nodrag nopan mt-2 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/6 px-2 py-1 text-[11px] text-[#E5E0DB] transition-colors hover:bg-white/10 disabled:cursor-wait disabled:opacity-70"
      >
        {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
        <span>Generate</span>
      </button>
    </div>
  )
}