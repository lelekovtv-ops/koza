"use client"

import { ChevronDown, ChevronUp, Key, Layers, ArrowRight } from "lucide-react"
import { useState } from "react"
import type { NormalizedRunResult, ShotExecutionEntry, KeyframeRole } from "@/types/pipeline"

interface ResultsPreviewProps {
  result: NormalizedRunResult | null
  isRunning: boolean
}

const ROLE_COLORS: Record<KeyframeRole, { bg: string; text: string; label: string }> = {
  key: { bg: "bg-[#D4A853]/12", text: "text-[#D4A853]", label: "KEY" },
  secondary: { bg: "bg-cyan-400/10", text: "text-cyan-400", label: "SEC" },
  insert: { bg: "bg-white/5", text: "text-white/40", label: "INS" },
}

export default function ResultsPreview({ result, isRunning }: ResultsPreviewProps) {
  const [expanded, setExpanded] = useState(false)
  const [showExecutionView, setShowExecutionView] = useState(true)

  const shotCount = result?.shotCount ?? 0
  const keyCount = result?.imagePlan.keyframeCandidates.length ?? 0

  return (
    <div className="border-t border-white/8 bg-[#12110F]">
      {/* Toggle bar */}
      <button
        className="flex w-full items-center gap-2 px-4 py-2 transition-colors hover:bg-white/3"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/45">
          Результаты
        </span>
        {shotCount > 0 && (
          <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
            {shotCount} кадров
          </span>
        )}
        {keyCount > 0 && (
          <span className="rounded-full bg-[#D4A853]/10 px-1.5 py-0.5 text-[9px] font-medium text-[#D4A853]">
            {keyCount} ключ. кадров
          </span>
        )}
        {result?.imagePlan.referenceStrategy !== "none" && result && (
          <span className="rounded-full bg-cyan-400/10 px-1.5 py-0.5 text-[9px] font-medium text-cyan-400">
            {result.imagePlan.referenceStrategy.replace(/_/g, " ")}
          </span>
        )}
        {isRunning && (
          <span className="animate-pulse rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">
            Запуск…
          </span>
        )}
        <span className="ml-auto text-white/25">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </span>
      </button>

      {/* Content */}
      {expanded && (
        <div className="max-h-[320px] overflow-y-auto px-4 pb-4">
          {!result && !isRunning && (
            <p className="py-4 text-center text-[11px] text-white/20">
              Запустите пайплайн для просмотра результатов
            </p>
          )}

          {result && result.shotCount > 0 && (
            <>
              {/* View toggle */}
              <div className="mb-3 flex gap-1">
                <button
                  onClick={() => setShowExecutionView(true)}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    showExecutionView
                      ? "border border-[#D4A853]/30 bg-[#D4A853]/12 text-[#D4A853]"
                      : "border border-white/6 bg-white/2 text-white/40 hover:bg-white/5"
                  }`}
                >
                  <Layers className="mr-1 inline-block h-3 w-3" />
                  План Выполнения
                </button>
                <button
                  onClick={() => setShowExecutionView(false)}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    !showExecutionView
                      ? "border border-[#D4A853]/30 bg-[#D4A853]/12 text-[#D4A853]"
                      : "border border-white/6 bg-white/2 text-white/40 hover:bg-white/5"
                  }`}
                >
                  Карточки Кадров
                </button>
              </div>

              {showExecutionView ? (
                <ExecutionPlanView shots={result.imagePlan.orderedShots} />
              ) : (
                <ShotCardsView shots={result.imagePlan.orderedShots} />
              )}
            </>
          )}

          {result && result.shotCount === 0 && (
            <p className="py-4 text-center text-[11px] text-white/20">
              Кадры не сгенерированы
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ExecutionPlanView({ shots }: { shots: ShotExecutionEntry[] }) {
  // Sort by execution order
  const sorted = [...shots].sort((a, b) => a.executionOrder - b.executionOrder)

  return (
    <div className="flex flex-col gap-1">
      {/* Header */}
      <div className="grid grid-cols-[32px_40px_60px_80px_1fr] gap-2 px-2 py-1">
        <span className="text-[8px] uppercase text-white/20">#</span>
        <span className="text-[8px] uppercase text-white/20">Роль</span>
        <span className="text-[8px] uppercase text-white/20">Реф.</span>
        <span className="text-[8px] uppercase text-white/20">Метка</span>
        <span className="text-[8px] uppercase text-white/20">Превью промпта</span>
      </div>

      {sorted.map((shot) => {
        const role = ROLE_COLORS[shot.keyframeRole]
        return (
          <div
            key={shot.shotId}
            className="grid grid-cols-[32px_40px_60px_80px_1fr] items-center gap-2 rounded-md border border-white/4 bg-white/2 px-2 py-1.5"
          >
            {/* Execution order */}
            <span className="text-[10px] font-mono text-white/35">
              {shot.executionOrder + 1}
            </span>

            {/* Keyframe role badge */}
            <span className={`rounded px-1 py-0.5 text-center text-[8px] font-bold ${role.bg} ${role.text}`}>
              {shot.keyframeRole === "key" && <Key className="mr-0.5 inline-block h-2.5 w-2.5" />}
              {role.label}
            </span>

            {/* Reference shots */}
            <span className="text-[9px] text-white/30">
              {shot.referenceShotIds.length > 0 ? (
                <span className="flex items-center gap-0.5">
                  <ArrowRight className="h-2.5 w-2.5 text-cyan-400/50" />
                  {shot.referenceShotIds.length}
                </span>
              ) : (
                "—"
              )}
            </span>

            {/* Label */}
            <span className="truncate text-[10px] font-medium text-[#E5E0DB]">
              {shot.label}
            </span>

            {/* Prompt preview */}
            <span className="truncate text-[9px] text-white/25">
              {shot.promptPreview || "—"}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ShotCardsView({ shots }: { shots: ShotExecutionEntry[] }) {
  const sorted = [...shots].sort((a, b) => a.order - b.order)

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {sorted.map((shot, i) => (
        <ShotCard key={shot.shotId} shot={shot} index={i} />
      ))}
    </div>
  )
}

function ShotCard({ shot, index }: { shot: ShotExecutionEntry; index: number }) {
  const role = ROLE_COLORS[shot.keyframeRole]

  return (
    <div className="flex h-[140px] w-[200px] flex-shrink-0 flex-col rounded-lg border border-white/8 bg-white/3">
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-1.5">
        <span className="text-[10px] font-semibold text-[#D4A853]">
          #{index + 1}
        </span>
        <span className="flex-1 truncate text-[10px] font-medium text-[#E5E0DB]">
          {shot.label}
        </span>
        <span className={`rounded px-1 py-0.5 text-[7px] font-bold ${role.bg} ${role.text}`}>
          {role.label}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 overflow-hidden px-3 py-2">
        {shot.referenceShotIds.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-[8px] uppercase text-white/25">Реф.</span>
            <span className="text-[9px] text-cyan-400/50">{shot.referenceShotIds.length} кадр(ов)</span>
          </div>
        )}
        <div className="flex items-center gap-1">
            <span className="text-[8px] uppercase text-white/25">Порядок</span>
          <span className="text-[9px] text-white/40">#{shot.executionOrder + 1}</span>
        </div>
        {shot.promptPreview && (
          <p className="mt-auto line-clamp-3 text-[8px] leading-snug text-white/30">
            {shot.promptPreview}
          </p>
        )}
      </div>
    </div>
  )
}
