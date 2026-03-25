"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Clapperboard, KeyRound, Sparkles } from "lucide-react"
import type { KeyframeRole } from "@/types/pipeline"

export interface PipelineShotNodeData {
  index: number
  label: string
  actionText: string
  directorNote: string
  operatorNote: string
  promptText?: string
  keyframeRole: KeyframeRole
  isGenerated?: boolean
  [key: string]: unknown
}

const handleStyle = {
  width: 10,
  height: 10,
  borderRadius: 999,
  borderWidth: 1.5,
  background: "#1A1816",
  borderColor: "rgba(255,255,255,0.28)",
}

const ROLE_BADGES: Record<KeyframeRole, { label: string; className: string }> = {
  key: { label: "KEY", className: "border-[#D4A853]/30 bg-[#D4A853]/12 text-[#D4A853]" },
  secondary: { label: "SEC", className: "border-cyan-400/25 bg-cyan-400/10 text-cyan-300" },
  insert: { label: "INS", className: "border-white/10 bg-white/5 text-white/45" },
}

function FieldBlock({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "prompt" }) {
  return (
    <div className="rounded-lg border border-white/6 bg-black/12 px-2.5 py-2">
      <p className="text-[8px] uppercase tracking-[0.14em] text-white/28">{label}</p>
      <p className={`mt-1 text-[10px] leading-relaxed ${tone === "prompt" ? "text-[#EBD9AE]" : "text-white/62"}`}>
        {value || "—"}
      </p>
    </div>
  )
}

function PipelineShotNode({ data }: NodeProps) {
  const {
    index,
    label,
    actionText,
    directorNote,
    operatorNote,
    promptText,
    keyframeRole,
    isGenerated = false,
  } = data as PipelineShotNodeData

  const role = ROLE_BADGES[keyframeRole]

  return (
    <div className="flex min-h-65 w-70 flex-col rounded-2xl border border-white/8 bg-[#171512]/96 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-lg">
      <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2.5">
        <Clapperboard className="h-3.5 w-3.5 text-[#D4A853]" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#D4A853]">Кадр {index + 1}</span>
        <span className={`ml-auto rounded-full border px-2 py-0.5 text-[8px] font-semibold tracking-[0.12em] ${role.className}`}>
          {keyframeRole === "key" ? <KeyRound className="mr-1 inline-block h-2.5 w-2.5" /> : null}
          {role.label}
        </span>
      </div>

      <div className="border-b border-white/6 px-3 py-2">
        <p className="text-[11px] font-semibold text-[#E5E0DB]">{label}</p>
        <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-white/28">
          {isGenerated ? "Промпт готов" : "Черновик готов"}
          {isGenerated ? <Sparkles className="ml-1 inline-block h-3 w-3 text-[#D4A853]" /> : null}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <FieldBlock label="Действие" value={actionText} />
        <FieldBlock label="Режиссер" value={directorNote} />
        <FieldBlock label="Оператор" value={operatorNote} />
        {promptText ? <FieldBlock label="Промпт" value={promptText} tone="prompt" /> : null}
      </div>

      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
    </div>
  )
}

export default memo(PipelineShotNode)