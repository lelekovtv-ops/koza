'use client'

import { useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Palette } from 'lucide-react'
import { STYLE_PRESETS, getProjectStylePresetId } from '@/lib/projectStyle'
import { useBoardStore } from '@/store/board'

const handleStyle = {
  width: 10,
  height: 10,
  borderRadius: 999,
  borderWidth: 1.5,
  background: '#1A1816',
  borderColor: '#7C4A6F',
}

export default function StyleNode(_: NodeProps) {
  const projectStyle = useBoardStore((state) => state.projectStyle)
  const setProjectStyle = useBoardStore((state) => state.setProjectStyle)
  const currentPresetId = getProjectStylePresetId(projectStyle)
  const [customText, setCustomText] = useState(currentPresetId === 'custom' ? projectStyle : '')

  return (
    <div className="nopan relative h-[90px] w-[200px] rounded-xl border border-[#7C4A6F]/20 bg-[#1A1816]/95 p-3 text-[#E5E0DB] shadow-[0_14px_28px_rgba(0,0,0,0.2)]">
      <Handle type="source" position={Position.Right} className="!right-[-6px] !h-[10px] !w-[10px] !rounded-full !border-[1.5px]" style={handleStyle} />

      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-white/50">STYLE</div>
        <Palette size={15} className="text-[#7C4A6F]" />
      </div>

      <select
        value={currentPresetId}
        onChange={(e) => {
          const preset = STYLE_PRESETS.find((p) => p.id === e.target.value)
          if (!preset) return
          if (preset.id === 'custom') {
            setProjectStyle(customText)
          } else {
            setProjectStyle(preset.prompt)
          }
        }}
        className="nodrag nopan mt-2 w-full rounded-md border border-white/10 bg-[#2B2723] px-2 py-1 text-[11px] text-[#E5E0DB] outline-none"
      >
        {STYLE_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>{preset.label}</option>
        ))}
      </select>

      {currentPresetId === 'custom' ? (
        <textarea
          value={customText}
          onChange={(e) => {
            setCustomText(e.target.value)
            setProjectStyle(e.target.value)
          }}
          rows={2}
          placeholder="Custom style prompt…"
          className="nodrag nopan mt-1.5 w-full resize-none rounded-md border border-white/10 bg-[#2B2723] px-2 py-1 text-[9px] text-white/50 outline-none placeholder:text-white/20"
        />
      ) : (
        <div className="mt-1.5 truncate text-[9px] text-white/30">{projectStyle.slice(0, 40)}{projectStyle.length > 40 ? '…' : ''}</div>
      )}
    </div>
  )
}
