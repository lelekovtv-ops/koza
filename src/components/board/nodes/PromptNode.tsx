'use client'

import { useCallback, useMemo, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Clipboard, Check } from 'lucide-react'
import { buildImagePrompt, getReferencedBibleEntries } from '@/lib/promptBuilder'
import { getProjectStylePresetId } from '@/lib/projectStyle'
import { useBibleStore } from '@/store/bible'
import { useBoardStore } from '@/store/board'
import { useTimelineStore } from '@/store/timeline'

type PromptNodeData = {
  shotId: string
}

const handleStyle = {
  width: 10,
  height: 10,
  borderRadius: 999,
  borderWidth: 1.5,
  background: '#1A1816',
  borderColor: 'rgba(229,224,219,0.4)',
}

export default function PromptNode({ data }: NodeProps) {
  const { shotId } = (data || {}) as PromptNodeData
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const shot = useTimelineStore((state) => state.shots.find((s) => s.id === shotId))
  const characters = useBibleStore((state) => state.characters)
  const locations = useBibleStore((state) => state.locations)
  const bibleProps = useBibleStore((state) => state.props)
  const projectStyle = useBoardStore((state) => state.projectStyle)

  const prompt = useMemo(() => {
    if (!shot) return ''
    return buildImagePrompt(shot, characters, locations, projectStyle, bibleProps)
  }, [shot, characters, locations, projectStyle, bibleProps])

  const bibleRefs = useMemo(() => {
    if (!shot) return { characters: [], location: null, props: [] }
    return getReferencedBibleEntries(shot, characters, locations, bibleProps)
  }, [shot, characters, locations, bibleProps])

  const bibleBadge = useMemo(() => {
    const charNames = bibleRefs.characters
      .filter((c) => c.appearancePrompt)
      .map((c) => c.name)
    const locName = bibleRefs.location?.appearancePrompt ? bibleRefs.location.name : null
    const parts = [...charNames, ...(locName ? [locName] : [])]
    return parts.length > 0 ? parts.join(' + ') : null
  }, [bibleRefs])

  const stylePresetId = getProjectStylePresetId(projectStyle)
  const isCustomStyle = stylePresetId === 'custom'

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [prompt])

  if (!shot) {
    return (
      <div className="nopan relative flex h-[50px] w-[160px] items-center justify-center rounded-xl border border-white/8 bg-[#1A1816]/95 text-[10px] text-white/30">
        No shot
      </div>
    )
  }

  return (
    <div
      onDoubleClick={() => setExpanded((prev) => !prev)}
      className={`nopan relative rounded-xl border border-white/8 bg-[#1A1816]/95 p-2.5 text-[#E5E0DB] shadow-[0_14px_28px_rgba(0,0,0,0.2)] transition-all ${
        expanded ? 'h-[200px] w-[300px]' : 'h-[50px] w-[160px]'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!left-[-6px] !h-[10px] !w-[10px] !rounded-full !border-[1.5px]" style={handleStyle} />
      <Handle type="source" position={Position.Right} className="!right-[-6px] !h-[10px] !w-[10px] !rounded-full !border-[1.5px]" style={handleStyle} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-white/50">PROMPT</span>
          <span className="rounded-sm bg-white/8 px-1 py-0.5 text-[8px] font-medium text-white/35">EN</span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handleCopy()
          }}
          className="nodrag nopan text-white/30 transition-colors hover:text-white/60"
        >
          {copied ? <Check size={12} className="text-[#4A7C6F]" /> : <Clipboard size={12} />}
        </button>
      </div>

      {expanded ? (
        <div className="mt-2 flex h-[155px] flex-col">
          <div className="nodrag nopan flex-1 overflow-y-auto pr-1 font-mono text-[10px] leading-relaxed text-white/50">
            {prompt.split('\n').map((line, i) => {
              const isBibleRef = /character reference|characters:|visual:/i.test(line)
              const isStyleRef = /style|noir|sketch|watercolor|anime|realistic/i.test(line) && !isCustomStyle
              return (
                <div
                  key={i}
                  className={
                    isBibleRef ? 'text-[#D4A853]' : isStyleRef ? 'text-[#7C4A6F]' : ''
                  }
              >
                {line || '\u00A0'}
              </div>
            )
          })}
          </div>
          <div className="mt-1 shrink-0 border-t border-white/5 pt-1">
            {bibleBadge ? (
              <div className="truncate text-[9px] text-[#D4A853]/70">📖 Bible: {bibleBadge}</div>
            ) : (
              <div className="text-[9px] text-amber-400/60">⚠ No Bible data</div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-1">
          <div className="truncate font-mono text-[9px] text-white/40">
            {prompt.slice(0, 60)}{prompt.length > 60 ? '…' : ''}
          </div>
          {bibleBadge ? (
            <div className="mt-0.5 truncate text-[9px] text-[#D4A853]/70">📖 Bible: {bibleBadge}</div>
          ) : (
            <div className="mt-0.5 text-[9px] text-amber-400/60">⚠ No Bible data</div>
          )}
        </div>
      )}
    </div>
  )
}
