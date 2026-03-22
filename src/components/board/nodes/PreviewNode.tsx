'use client'

import { useEffect, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Clock3, MonitorPlay } from 'lucide-react'
import { useTimelineStore } from '@/store/timeline'

type PreviewNodeData = {
  shotId: string
  thumbnailUrl: string | null
  duration: number
}

const handleStyle = {
  width: 10,
  height: 10,
  borderRadius: 999,
  borderWidth: 1.5,
  background: '#1A1816',
  borderColor: 'rgba(255,255,255,0.28)',
}

export default function PreviewNode({ data }: NodeProps) {
  const { shotId, thumbnailUrl, duration } = (data || {}) as PreviewNodeData
  const updateShot = useTimelineStore((state) => state.updateShot)
  const liveShot = useTimelineStore((state) => state.shots.find((shot) => shot.id === shotId))
  const liveDuration = liveShot?.duration ?? duration
  const liveThumbnailUrl = liveShot?.thumbnailUrl ?? thumbnailUrl
  const [editingDuration, setEditingDuration] = useState(false)
  const [durationInput, setDurationInput] = useState((liveDuration / 1000).toFixed(1))

  useEffect(() => {
    setDurationInput((liveDuration / 1000).toFixed(1))
  }, [liveDuration])

  const commitDuration = () => {
    const parsed = Number(durationInput)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setDurationInput((liveDuration / 1000).toFixed(1))
      setEditingDuration(false)
      return
    }

    updateShot(shotId, { duration: Math.round(parsed * 1000) })
    setEditingDuration(false)
  }

  return (
    <div className="nopan relative h-25 w-45 rounded-xl border border-white/8 bg-[#1A1816]/95 p-2.5 text-[#E5E0DB] shadow-[0_14px_28px_rgba(0,0,0,0.2)]">
      <Handle type="target" position={Position.Left} className="-left-1.5! h-2.5! w-2.5! rounded-full! border-[1.5px]!" style={handleStyle} />

      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-white/50">PREVIEW</div>
        <MonitorPlay size={15} className="text-white/35" />
      </div>

      <div className="mt-2 flex h-11.25 w-20 items-center justify-center overflow-hidden rounded-md border border-white/8 bg-white/5">
        {liveThumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={liveThumbnailUrl} alt="Preview" className="h-full w-full object-cover" />
        ) : (
          <div className="text-[10px] text-white/30">Preview</div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        {editingDuration ? (
          <input
            autoFocus
            value={durationInput}
            onChange={(event) => setDurationInput(event.target.value)}
            onBlur={commitDuration}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitDuration()
              }
              if (event.key === 'Escape') {
                  setDurationInput((liveDuration / 1000).toFixed(1))
                setEditingDuration(false)
              }
            }}
            className="nodrag nopan w-14 rounded-full border border-[#D4A853]/20 bg-[#221f1b] px-2 py-0.5 text-[10px] text-[#E5E0DB] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setEditingDuration(true)
            }}
            className="nodrag nopan inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/65"
          >
            <Clock3 size={10} />
            {(liveDuration / 1000).toFixed(1)}s
          </button>
        )}

        <div className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/65">
          16:9
        </div>
      </div>
    </div>
  )
}