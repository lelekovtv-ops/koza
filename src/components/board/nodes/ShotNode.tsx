'use client'

import { useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ChevronDown, ChevronRight, Clock3, ImageIcon } from 'lucide-react'
import { type TimelineShot, useTimelineStore } from '@/store/timeline'

type ShotNodeData = {
  shot: TimelineShot
  isExpanded?: boolean
  onToggleExpand?: (shotId: string) => void
}

const handleStyle = {
  width: 10,
  height: 10,
  borderRadius: 999,
  borderWidth: 1.5,
  background: '#1A1816',
  borderColor: 'rgba(255,255,255,0.28)',
}

function formatSeconds(durationMs: number) {
  return `${(durationMs / 1000).toFixed(1)}s`
}

export default function ShotNode({ data, selected }: NodeProps) {
  const { shot, isExpanded = false, onToggleExpand } = (data || {}) as ShotNodeData
  const currentShot = useTimelineStore((state) => state.shots.find((entry) => entry.id === shot.id) ?? shot)
  const selectShot = useTimelineStore((state) => state.selectShot)
  const updateShot = useTimelineStore((state) => state.updateShot)
  const [durationDraft, setDurationDraft] = useState<string | null>(null)
  const durationInput = durationDraft ?? (currentShot.duration / 1000).toFixed(1)
  const editingDuration = durationDraft !== null

  const commitDuration = () => {
    const parsed = Number(durationInput)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setDurationDraft(null)
      return
    }

    updateShot(currentShot.id, { duration: Math.round(parsed * 1000) })
    setDurationDraft(null)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => selectShot(currentShot.id)}
      onDoubleClick={() => onToggleExpand?.(currentShot.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          selectShot(currentShot.id)
        }
      }}
      className={`nopan relative flex h-16.25 w-42.5 items-center gap-2 rounded-xl border bg-[#1A1816]/95 px-2.5 py-2 text-[#E5E0DB] shadow-[0_14px_28px_rgba(0,0,0,0.2)] ${
        selected ? 'border-[#D4A853]' : 'border-white/8'
      }`}
    >
      <Handle type="target" position={Position.Left} className="-left-1.5! h-2.5! w-2.5! rounded-full! border-[1.5px]!" style={handleStyle} />
      <Handle type="source" position={Position.Right} className="-right-1.5! h-2.5! w-2.5! rounded-full! border-[1.5px]!" style={handleStyle} />

      <div className="flex h-8 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/8 bg-white/5">
        {currentShot.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentShot.thumbnailUrl} alt={currentShot.label} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon size={15} className="text-white/25" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[#E5E0DB]">{currentShot.label}</div>
        <div className="mt-1 flex items-center gap-1.5">
          <div className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60">
            {currentShot.shotSize || 'Shot'}
          </div>

          {editingDuration ? (
            <input
              autoFocus
              value={durationInput}
              onChange={(event) => setDurationDraft(event.target.value)}
              onBlur={commitDuration}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commitDuration()
                }
                if (event.key === 'Escape') {
                  setDurationDraft(null)
                }
              }}
              onClick={(event) => event.stopPropagation()}
              className="nodrag nopan w-12 rounded-full border border-[#D4A853]/20 bg-[#221f1b] px-2 py-0.5 text-[10px] text-[#E5E0DB] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setDurationDraft((currentShot.duration / 1000).toFixed(1))
              }}
              className="nodrag nopan inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60"
            >
              <Clock3 size={10} />
              {formatSeconds(currentShot.duration)}
            </button>
          )}
        </div>
      </div>

      <div className="self-start text-white/28">
        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </div>
    </div>
  )
}