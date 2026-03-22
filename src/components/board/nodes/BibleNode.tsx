'use client'

import { useMemo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { BookOpen, MapPinned, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useBibleStore } from '@/store/bible'

const handleStyle = {
  width: 10,
  height: 10,
  borderRadius: 999,
  borderWidth: 1.5,
  background: '#1A1816',
  borderColor: '#D4A853',
}

export default function BibleNode() {
  const router = useRouter()
  const characters = useBibleStore((state) => state.characters)
  const locations = useBibleStore((state) => state.locations)

  const initials = useMemo(
    () => characters.slice(0, 3).map((entry) => entry.name.trim().charAt(0).toUpperCase() || '?'),
    [characters],
  )

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push('/bible')}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          router.push('/bible')
        }
      }}
      className="nopan relative flex h-[120px] w-[220px] cursor-pointer flex-col rounded-xl border border-[#D4A853]/20 bg-[#1A1816]/95 p-3 text-[#E5E0DB] shadow-[0_14px_28px_rgba(0,0,0,0.22)] transition-transform hover:-translate-y-0.5"
    >
      <Handle type="target" position={Position.Left} className="!left-[-6px] !h-[10px] !w-[10px] !rounded-full !border-[1.5px]" style={handleStyle} />
      <Handle type="source" position={Position.Right} className="!right-[-6px] !h-[10px] !w-[10px] !rounded-full !border-[1.5px]" style={handleStyle} />

      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-white/50">BIBLE</div>
        <BookOpen size={15} className="text-[#D4A853]" />
      </div>

      <div className="mt-3 text-sm font-medium text-[#E5E0DB]">
        {characters.length} characters · {locations.length} locations
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="flex items-center -space-x-2">
          {initials.length > 0 ? (
            initials.map((initial, index) => (
              <div
                key={`${initial}-${index}`}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-[#D4A853]/30 bg-[#2B2723] text-[10px] font-semibold text-[#E5E0DB]"
              >
                {initial}
              </div>
            ))
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] text-white/40">
              ?
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3 text-[10px] text-white/40">
          <span className="flex items-center gap-1">
            <Users size={13} />
            Cast
          </span>
          <span className="flex items-center gap-1">
            <MapPinned size={13} />
            World
          </span>
        </div>
      </div>
    </div>
  )
}