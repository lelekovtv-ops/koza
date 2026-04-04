"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"

// ─── Shared styles ───────────────────────────────────────────

const handleStyle = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: "#1A1816",
  borderWidth: 1.5,
  borderColor: "rgba(255,255,255,0.25)",
}

const nodeBase = "rounded-xl border text-white/80 shadow-lg"

// ─── Block Text Input Node ───────────────────────────────────

export type BlockTextData = {
  label: string
  text: string
  blockType: string
}

export const BlockTextNode = memo(({ data }: NodeProps) => {
  const d = data as BlockTextData
  return (
    <div className={`${nodeBase} border-emerald-500/30 bg-emerald-500/[0.06] w-56 p-3`}>
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.15em] text-emerald-400/60">{d.label || "Block Text"}</div>
      <div className="text-[11px] text-white/60 leading-relaxed line-clamp-4">{d.text || "Empty block"}</div>
      <div className="mt-1 text-[8px] text-emerald-400/30 uppercase">{d.blockType}</div>
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  )
})
BlockTextNode.displayName = "BlockTextNode"

// ─── Bible Reference Node ────────────────────────────────────

export type BibleRefData = {
  label: string
  characters: string[]
  locations: string[]
  props: string[]
}

export const BibleRefNode = memo(({ data }: NodeProps) => {
  const d = data as BibleRefData
  const items = [
    ...d.characters.map((c) => `👤 ${c}`),
    ...d.locations.map((l) => `📍 ${l}`),
    ...d.props.map((p) => `📦 ${p}`),
  ]
  return (
    <div className={`${nodeBase} border-amber-500/30 bg-amber-500/[0.06] w-48 p-3`}>
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.15em] text-amber-400/60">{d.label || "Bible"}</div>
      {items.length > 0 ? (
        <div className="space-y-0.5">
          {items.map((item, i) => (
            <div key={i} className="text-[10px] text-white/50 truncate">{item}</div>
          ))}
        </div>
      ) : (
        <div className="text-[10px] text-white/25 italic">No Bible data</div>
      )}
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  )
})
BibleRefNode.displayName = "BibleRefNode"

// ─── Style Node ──────────────────────────────────────────────

export type StyleData = {
  label: string
  styleName: string
  stylePrompt: string
  enabled: boolean
}

export const StyleInputNode = memo(({ data }: NodeProps) => {
  const d = data as StyleData
  return (
    <div className={`${nodeBase} w-48 p-3 ${d.enabled ? "border-purple-500/30 bg-purple-500/[0.06]" : "border-white/10 bg-white/[0.02] opacity-50"}`}>
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.15em] text-purple-400/60">{d.label || "Style"}</div>
      <div className="text-[11px] text-white/60 font-medium">{d.styleName || "No style"}</div>
      <div className="mt-0.5 text-[9px] text-white/25 line-clamp-2">{d.stylePrompt}</div>
      {!d.enabled && <div className="mt-1 text-[8px] text-red-400/50 uppercase">Disabled</div>}
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  )
})
StyleInputNode.displayName = "StyleInputNode"

// ─── Prompt Builder Node ─────────────────────────────────────

export type PromptBuilderData = {
  label: string
  prompt: string
  isProcessing: boolean
}

export const PromptBuilderNode = memo(({ data }: NodeProps) => {
  const d = data as PromptBuilderData
  return (
    <div className={`${nodeBase} border-blue-500/30 bg-blue-500/[0.06] w-64 p-3`}>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-blue-400/60">{d.label || "Prompt Builder"}</span>
        {d.isProcessing && <span className="text-[8px] text-blue-400/80 animate-pulse">Processing...</span>}
      </div>
      {d.prompt ? (
        <div className="text-[10px] text-white/50 leading-relaxed line-clamp-6 font-mono">{d.prompt}</div>
      ) : (
        <div className="text-[10px] text-white/20 italic">Connect inputs to generate prompt</div>
      )}
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  )
})
PromptBuilderNode.displayName = "PromptBuilderNode"

// ─── Image Generation Node ───────────────────────────────────

export type ImageGenData = {
  label: string
  model: string
  thumbnailUrl: string | null
  isGenerating: boolean
}

export const ImageGenNode = memo(({ data }: NodeProps) => {
  const d = data as ImageGenData
  return (
    <div className={`${nodeBase} border-[#D4A853]/30 bg-[#D4A853]/[0.04] w-56 p-3`}>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#D4A853]/60">{d.label || "Image Gen"}</span>
        <span className="text-[8px] text-white/25">{d.model}</span>
      </div>
      <div className="aspect-video rounded-lg overflow-hidden border border-white/8 bg-black/30">
        {d.isGenerating ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#D4A853]/30 border-t-[#D4A853]" />
          </div>
        ) : d.thumbnailUrl ? (
          <img src={d.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-white/15">No image</div>
        )}
      </div>
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  )
})
ImageGenNode.displayName = "ImageGenNode"

// ─── Output Node ─────────────────────────────────────────────

export type OutputData = {
  label: string
  thumbnailUrl: string | null
  prompt: string
  duration: number
}

export const OutputNode = memo(({ data }: NodeProps) => {
  const d = data as OutputData
  return (
    <div className={`${nodeBase} border-white/20 bg-white/[0.04] w-60 p-3`}>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.15em] text-white/40">{d.label || "Output"}</div>
      {d.thumbnailUrl && (
        <div className="mb-2 aspect-video rounded-lg overflow-hidden border border-white/8">
          <img src={d.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      {d.prompt && <div className="text-[9px] text-white/30 font-mono line-clamp-3 mb-1">{d.prompt}</div>}
      {d.duration > 0 && <div className="text-[8px] text-white/20">{(d.duration / 1000).toFixed(1)}s</div>}
    </div>
  )
})
OutputNode.displayName = "OutputNode"

// ─── Node Types Registry ─────────────────────────────────────

export const blockCanvasNodeTypes = {
  blockText: BlockTextNode,
  bibleRef: BibleRefNode,
  styleInput: StyleInputNode,
  promptBuilder: PromptBuilderNode,
  imageGen: ImageGenNode,
  output: OutputNode,
}
