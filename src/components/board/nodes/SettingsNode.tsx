'use client'

import { Handle, Position } from '@xyflow/react'
import { Settings } from 'lucide-react'
import { useBoardStore } from '@/store/board'

const handleStyle = {
  width: 10,
  height: 10,
  borderRadius: 999,
  borderWidth: 1.5,
  background: '#1A1816',
  borderColor: '#4A6F7C',
}

const IMAGE_MODELS = [
  { id: 'gpt-image', label: 'GPT' },
  { id: 'nano-banana', label: 'NB1' },
  { id: 'nano-banana-2', label: 'NB2' },
  { id: 'nano-banana-pro', label: 'NB Pro' },
] as const

export default function SettingsNode() {
  const selectedChatModel = useBoardStore((state) => state.selectedChatModel)
  const selectedImageGenModel = useBoardStore((state) => state.selectedImageGenModel)
  const setSelectedImageGenModel = useBoardStore((state) => state.setSelectedImageGenModel)

  return (
    <div className="nopan relative h-[110px] w-[200px] rounded-xl border border-[#4A6F7C]/20 bg-[#1A1816]/95 p-3 text-[#E5E0DB] shadow-[0_14px_28px_rgba(0,0,0,0.2)]">
      <Handle type="source" position={Position.Right} className="!right-[-6px] !h-[10px] !w-[10px] !rounded-full !border-[1.5px]" style={handleStyle} />

      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-white/50">SETTINGS</div>
        <Settings size={15} className="text-[#4A6F7C]" />
      </div>

      <div className="mt-2">
        <div className="text-[10px] text-white/40">Breakdown model</div>
        <div className="mt-0.5 inline-block rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/65">
          {selectedChatModel}
        </div>
      </div>

      <div className="mt-2">
        <div className="text-[10px] text-white/40">Image model</div>
        <div className="mt-0.5 flex gap-1">
          {IMAGE_MODELS.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => setSelectedImageGenModel(model.id)}
              className={`nodrag nopan rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                selectedImageGenModel === model.id
                  ? 'border border-[#D4A853]/30 bg-[#D4A853]/15 text-[#E8C778]'
                  : 'border border-white/10 bg-white/5 text-white/55 hover:bg-white/10'
              }`}
            >
              {model.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
