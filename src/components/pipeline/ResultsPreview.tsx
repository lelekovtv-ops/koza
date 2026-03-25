"use client"

import Image from "next/image"
import { ChevronDown, ChevronUp, Key, Layers, ArrowRight, LoaderCircle } from "lucide-react"
import { useState } from "react"
import type { NormalizedRunResult, ShotExecutionEntry, KeyframeRole, PipelineDraftShot } from "@/types/pipeline"
import { usePipelineStore } from "@/store/pipeline"
import { extractPipelinePromptEntries, generatePipelineShotImage } from "@/lib/pipeline/imageGenerator"
import ImageLightbox from "@/components/pipeline/ImageLightbox"

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
  const [selectedGeneratedShotId, setSelectedGeneratedShotId] = useState<string | null>(null)
  const [lightboxShotId, setLightboxShotId] = useState<string | null>(null)
  const [imageGenError, setImageGenError] = useState<string | null>(null)
  const imageGenModel = usePipelineStore((s) => s.imageGenModel)
  const breakdownDraft = usePipelineStore((s) => s.breakdownDraft)
  const imageGenResults = usePipelineStore((s) => s.imageGenResults)
  const imageGenRunning = usePipelineStore((s) => s.imageGenRunning)
  const setImageGenResult = usePipelineStore((s) => s.setImageGenResult)
  const setImageGenRunning = usePipelineStore((s) => s.setImageGenRunning)
  const updateDraftShot = usePipelineStore((s) => s.updateDraftShot)

  const shotCount = result?.shotCount ?? breakdownDraft?.draftShots.length ?? 0
  const keyCount = result?.imagePlan.keyframeCandidates.length ?? 0
  const promptEntries = extractPipelinePromptEntries(result)
  const generatedEntries = promptEntries.filter((entry) => imageGenResults[entry.shotId])
  const selectedGenerated = selectedGeneratedShotId ? imageGenResults[selectedGeneratedShotId] : null
  const lightboxGenerated = lightboxShotId ? imageGenResults[lightboxShotId] : null
  const lightboxEntry = lightboxShotId
    ? promptEntries.find((entry) => entry.shotId === lightboxShotId) ?? null
    : null

  const handleGenerateShot = async (shotId: string) => {
    if (!result) return
    const entry = promptEntries.find((item) => item.shotId === shotId)
    if (!entry) return

    setImageGenError(null)
    setImageGenRunning(entry.shotId)
    try {
      const generated = await generatePipelineShotImage(result.sceneId, entry, imageGenModel)
      setImageGenResult(entry.shotId, generated)
      setSelectedGeneratedShotId(entry.shotId)
    } catch (error) {
      setImageGenError(error instanceof Error ? error.message : String(error))
    } finally {
      setImageGenRunning(null)
    }
  }

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
        <div className="max-h-80 overflow-y-auto px-4 pb-4">
          {!result && !breakdownDraft && !isRunning && (
            <p className="py-4 text-center text-[11px] text-white/20">
              Запустите пайплайн для просмотра результатов
            </p>
          )}

          {breakdownDraft && (
            <div className="mb-4 rounded-xl border border-cyan-400/12 bg-cyan-400/5 p-3 backdrop-blur-lg">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-200/65">Phase 1 Draft</p>
                  <p className="mt-1 text-[11px] text-white/55">
                    Отредактируйте описание кадра, action, director note и camera note. Затем запустите Этап 2.
                  </p>
                </div>
                <span className="rounded-full border border-cyan-400/15 bg-cyan-400/8 px-2 py-1 text-[10px] text-cyan-100/80">
                  {breakdownDraft.draftShots.length} shots
                </span>
              </div>

              <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                {breakdownDraft.draftShots
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((shot, index) => (
                    <DraftShotCard
                      key={shot.shotId}
                      shot={shot}
                      index={index}
                      onChange={(patch) => updateDraftShot(shot.shotId, patch)}
                    />
                  ))}
              </div>
            </div>
          )}

          {result && result.shotCount > 0 && (
            <>
              {generatedEntries.length > 0 && (
                <div className="mb-4 flex flex-col gap-2 rounded-xl border border-white/8 bg-white/2 p-3 backdrop-blur-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-white/35">Сгенерированные кадры</span>
                    <span className="text-[10px] text-white/30">{generatedEntries.length}/{promptEntries.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                    {generatedEntries.map((entry) => {
                      const generated = imageGenResults[entry.shotId]
                      return (
                        <button
                          key={entry.shotId}
                          onClick={() => setSelectedGeneratedShotId(entry.shotId)}
                          className={`overflow-hidden rounded-lg border bg-black/10 text-left transition-colors ${selectedGeneratedShotId === entry.shotId ? "border-[#D4A853]/40" : "border-white/6 hover:border-white/12"}`}
                        >
                          <div className="relative aspect-16/10 w-full bg-black/20">
                            <Image src={generated.imageUrl} alt={entry.label} fill unoptimized className="object-cover" />
                            <button
                              onClick={(event) => {
                                event.stopPropagation()
                                setLightboxShotId(entry.shotId)
                              }}
                              className="absolute right-2 top-2 rounded-md border border-black/20 bg-black/55 px-2 py-1 text-[9px] font-medium text-white transition-colors hover:bg-black/70"
                            >
                              Увеличить
                            </button>
                          </div>
                          <div className="px-2 py-1.5">
                            <p className="truncate text-[10px] font-medium text-[#E5E0DB]">{entry.label}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {selectedGenerated ? (
                    <div className="rounded-lg border border-white/6 bg-black/10 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.14em] text-white/30">Промпт</p>
                          <p className="mt-1 text-[10px] text-white/45">{selectedGenerated.model} · {selectedGenerated.durationMs}ms</p>
                        </div>
                        <button
                          onClick={() => void handleGenerateShot(selectedGenerated.shotId)}
                          disabled={Boolean(imageGenRunning)}
                          className="rounded-md border border-[#D4A853]/30 bg-[#D4A853]/12 px-2.5 py-1.5 text-[10px] font-medium text-[#D4A853] transition-colors hover:bg-[#D4A853]/18 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {imageGenRunning === selectedGenerated.shotId ? "Regenerating" : "Перегенерить"}
                        </button>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-[10px] leading-relaxed text-white/55">{selectedGenerated.prompt}</p>
                    </div>
                  ) : null}

                  {imageGenError ? (
                    <div className="rounded-md border border-red-500/20 bg-red-950/50 px-2.5 py-2 text-[10px] text-red-300">
                      {imageGenError}
                    </div>
                  ) : null}
                </div>
              )}

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

      <ImageLightbox
        imageUrl={lightboxGenerated?.imageUrl ?? null}
        alt={lightboxEntry?.label ?? "Generated pipeline frame"}
        title={lightboxEntry?.label}
        subtitle={lightboxGenerated ? `${lightboxGenerated.model} · ${lightboxGenerated.durationMs}ms` : undefined}
        onClose={() => setLightboxShotId(null)}
      />
    </div>
  )
}

function DraftShotCard({
  shot,
  index,
  onChange,
}: {
  shot: PipelineDraftShot
  index: number
  onChange: (patch: Partial<PipelineDraftShot>) => void
}) {
  const role = ROLE_COLORS[shot.keyframeRole]

  return (
    <div className="flex min-h-72 w-[320px] shrink-0 flex-col rounded-xl border border-white/8 bg-[#171512] p-3">
      <div className="flex items-center gap-2 border-b border-white/6 pb-2">
        <span className="text-[10px] font-semibold text-[#D4A853]">#{index + 1}</span>
        <input
          value={shot.label}
          onChange={(event) => onChange({ label: event.target.value })}
          className="min-w-0 flex-1 border-none bg-transparent text-[11px] font-medium text-[#E5E0DB] outline-none"
        />
        <span className={`rounded px-1 py-0.5 text-[7px] font-bold ${role.bg} ${role.text}`}>{role.label}</span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <DraftField
          label="Shot Description"
          value={shot.shotDescription}
          onChange={(value) => onChange({ shotDescription: value })}
        />
        <DraftField
          label="Action"
          value={shot.actionText}
          onChange={(value) => onChange({ actionText: value })}
        />
        <DraftField
          label="Director Note"
          value={shot.directorNote}
          onChange={(value) => onChange({ directorNote: value })}
        />
        <DraftField
          label="Camera Note"
          value={shot.cameraNote}
          onChange={(value) => onChange({ cameraNote: value })}
        />
        <DraftField
          label="Visual Description"
          value={shot.visualDescription}
          onChange={(value) => onChange({ visualDescription: value })}
          rows={2}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-white/6 bg-black/10 p-2">
        <MiniInput
          label="Type"
          value={shot.shotType}
          onChange={(value) => onChange({ shotType: value })}
        />
        <MiniInput
          label="Size"
          value={shot.shotSize}
          onChange={(value) => onChange({ shotSize: value })}
        />
        <MiniInput
          label="Composition"
          value={shot.composition}
          onChange={(value) => onChange({ composition: value })}
        />
        <MiniInput
          label="Camera"
          value={shot.camera}
          onChange={(value) => onChange({ camera: value })}
        />
      </div>

      {shot.continuitySummary ? (
        <p className="mt-3 text-[9px] leading-relaxed text-white/30">{shot.continuitySummary}</p>
      ) : null}
    </div>
  )
}

function DraftField({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-[0.12em] text-white/28">{label}</span>
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-none rounded-md border border-white/8 bg-white/3 px-2.5 py-2 text-[10px] leading-relaxed text-[#E5E0DB] outline-none transition-colors placeholder:text-white/20 focus:border-cyan-400/35"
      />
    </label>
  )
}

function MiniInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[8px] uppercase tracking-[0.12em] text-white/25">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-white/8 bg-white/3 px-2 py-1.5 text-[10px] text-[#E5E0DB] outline-none transition-colors focus:border-cyan-400/35"
      />
    </label>
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
  const imageGenResults = usePipelineStore((s) => s.imageGenResults)
  const imageGenRunning = usePipelineStore((s) => s.imageGenRunning)
  const role = ROLE_COLORS[shot.keyframeRole]
  const hasImage = Boolean(imageGenResults[shot.shotId])

  return (
    <div className="flex h-35 w-50 shrink-0 flex-col rounded-lg border border-white/8 bg-white/3">
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
        <div className="flex items-center gap-1">
          <span className="text-[8px] uppercase text-white/25">Image</span>
          <span className="text-[9px] text-white/40">
            {imageGenRunning === shot.shotId ? (
              <span className="inline-flex items-center gap-1 text-emerald-300"><LoaderCircle className="h-3 w-3 animate-spin" />gen</span>
            ) : hasImage ? "ready" : "—"}
          </span>
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
