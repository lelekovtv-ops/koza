'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ChevronDown, ChevronRight, Circle, Loader2, Play, WandSparkles } from 'lucide-react'

type BreakdownStatus = 'idle' | 'running' | 'done'

type BreakdownNodeData = {
  sceneId: string
  sceneTitle: string
  shotCount: number
  status: BreakdownStatus
  isExpanded?: boolean
  onToggleExpand?: (sceneId: string) => void
  onRun?: (sceneId: string) => void
}

const handleStyle = {
  width: 10,
  height: 10,
  borderRadius: 999,
  borderWidth: 1.5,
  background: '#1A1816',
  borderColor: 'rgba(255,255,255,0.28)',
}

const statusColor: Record<BreakdownStatus, string> = {
  idle: 'text-white/35',
  running: 'text-[#D4A853]',
  done: 'text-[#4A7C6F]',
}

export default function BreakdownNode({ data }: NodeProps) {
  const nodeData = (data || {}) as BreakdownNodeData
  const isRunning = nodeData.status === 'running'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => nodeData.onToggleExpand?.(nodeData.sceneId)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          nodeData.onToggleExpand?.(nodeData.sceneId)
        }
      }}
      className={`nopan relative h-[90px] w-[200px] rounded-xl border bg-[#1A1816]/95 p-3 text-[#E5E0DB] shadow-[0_14px_28px_rgba(0,0,0,0.2)] transition-colors ${
        isRunning
          ? 'animate-pulse border-[#D4A853]/45'
          : 'border-white/8'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!left-[-6px] !h-[10px] !w-[10px] !rounded-full !border-[1.5px]" style={handleStyle} />
      <Handle type="source" position={Position.Right} className="!right-[-6px] !h-[10px] !w-[10px] !rounded-full !border-[1.5px]" style={handleStyle} />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/50">
            {nodeData.isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>JENKINS</span>
          </div>
          <div className="mt-1 truncate text-sm font-medium text-[#E5E0DB]">{nodeData.sceneTitle}</div>
        </div>
        <div className={`mt-0.5 ${statusColor[nodeData.status]}`}>
          {isRunning ? <Loader2 size={15} className="animate-spin" /> : <Circle size={14} fill="currentColor" />}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/65">
          {nodeData.shotCount} shots
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            nodeData.onRun?.(nodeData.sceneId)
          }}
          disabled={isRunning}
          className="nodrag nopan inline-flex items-center gap-1.5 rounded-full border border-[#D4A853]/25 bg-[#D4A853]/10 px-2.5 py-1 text-[11px] font-medium text-[#E8C778] transition-colors hover:bg-[#D4A853]/18 disabled:cursor-wait disabled:opacity-70"
        >
          {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          <span>Run</span>
        </button>
      </div>

      {!isRunning && nodeData.status === 'done' ? (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-white/40">
          <WandSparkles size={12} />
          Ready
        </div>
      ) : null}
    </div>
  )
}