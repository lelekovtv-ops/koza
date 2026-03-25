"use client"

import { X, Lock, Unlock, ChevronDown, ChevronRight, LoaderCircle, Sparkles } from "lucide-react"
import Image from "next/image"
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import type { PipelineStageId } from "@/types/pipeline"
import { usePipelineStore } from "@/store/pipeline"
import { useBibleStore } from "@/store/bible"
import ImageLightbox from "@/components/pipeline/ImageLightbox"
import { STAGE_EXPLANATIONS, summarizeStageForDisplay } from "@/lib/pipeline/stageExplanations"
import { extractPipelinePromptEntries, generatePipelineShotImage, type PipelinePromptEntry } from "@/lib/pipeline/imageGenerator"
import {
  getConfiguratorValue,
  getStageConfiguratorSections,
  validatePipelineConfig,
  type ConfigValidationIssue,
  type ConfiguratorField,
  type SystemCapabilities,
} from "@/lib/pipeline/configuratorSchema"
import {
  LOCKABLE_DIRECTOR_FIELDS,
  LOCKABLE_DP_FIELDS,
  getFieldDisplayName,
} from "@/lib/pipeline/presetMerge"

interface InspectorPanelProps {
  selectedStage: PipelineStageId | null
  onClose: () => void
}

const STAGE_INFO: Record<PipelineStageId, { title: string; description: string }> = {
  sceneInput: { title: "Вход Сцены", description: "Текст сцены и выбор источника" },
  sceneAnalyst: { title: "Аналитик Сцены", description: "AI-анализ драматургии сцены" },
  actionSplitter: { title: "Разбивка Действий", description: "Разбивает сцену на отдельные действия" },
  contextRouter: { title: "Контекстный Роутер", description: "Раздаёт primary/secondary локации, props и переходы среды дальше по pipeline" },
  creativePlanner: { title: "Креативщик", description: "Ищет редкие и нестандартные операторские решения" },
  censor: { title: "Цензор", description: "Отсеивает ложные и декоративные решения перед shot planning" },
  shotPlanner: { title: "Планировщик Кадров", description: "Планирует кадры из действий" },
  continuitySupervisor: { title: "Контроль Непрерывности", description: "Обеспечивает визуальную непрерывность между кадрами" },
  promptComposer: { title: "Компоновщик Промптов", description: "Составляет финальные промпты" },
  promptOptimizer: { title: "Оптимизатор Промпта", description: "Показывает, как raw prompt был сжат перед image generation" },
  imageGenerator: { title: "Генератор Изображений", description: "Генерирует изображения из промптов" },
}

const fieldClass =
  "w-full rounded-md border border-white/8 bg-white/3 px-3 py-2 text-sm text-[#E5E0DB] outline-none transition-colors placeholder:text-white/22 focus:border-[#D4A853]/40"
const labelClass = "text-[10px] font-medium uppercase tracking-[0.12em] text-white/40"

export default function InspectorPanel({ selectedStage, onClose }: InspectorPanelProps) {
  const config = usePipelineStore((s) => s.activeConfig)
  const updateConfigValue = usePipelineStore((s) => s.updateConfigValue)
  const toggleFieldLock = usePipelineStore((s) => s.toggleFieldLock)
  const isFieldLocked = usePipelineStore((s) => s.isFieldLocked)
  const normalizedResult = usePipelineStore((s) => s.normalizedResult)
  const imageGenModel = usePipelineStore((s) => s.imageGenModel)
  const imageGenResults = usePipelineStore((s) => s.imageGenResults)
  const imageGenRunning = usePipelineStore((s) => s.imageGenRunning)
  const setImageGenResult = usePipelineStore((s) => s.setImageGenResult)
  const setImageGenRunning = usePipelineStore((s) => s.setImageGenRunning)
  const stageResults = usePipelineStore((s) => s.runState.stageResults)
  const runSnapshot = usePipelineStore((s) => s.runSnapshot)
  const bibleCharacters = useBibleStore((s) => s.characters)
  const bibleLocations = useBibleStore((s) => s.locations)
  const [imageGenError, setImageGenError] = useState<string | null>(null)
  const [activeResultShotId, setActiveResultShotId] = useState<string | null>(null)
  const [lightboxShotId, setLightboxShotId] = useState<string | null>(null)
  const [capabilities, setCapabilities] = useState<SystemCapabilities | null>(null)
  const [capabilitiesState, setCapabilitiesState] = useState<"loading" | "ready" | "error">("loading")

  const resolvedStage = selectedStage ?? "sceneInput"
  const info = STAGE_INFO[resolvedStage]
  const explanation = STAGE_EXPLANATIONS[resolvedStage]
  const summary = summarizeStageForDisplay(
    resolvedStage,
    stageResults[resolvedStage],
    runSnapshot,
    { characters: bibleCharacters, locations: bibleLocations },
  )
  const promptEntries = extractPipelinePromptEntries(normalizedResult)
  const configSections = useMemo(() => getStageConfiguratorSections(resolvedStage), [resolvedStage])
  const validationIssues = useMemo(
    () => validatePipelineConfig(config, imageGenModel, capabilities),
    [capabilities, config, imageGenModel],
  )
  const stageIssues = useMemo(
    () => validationIssues.filter((issue) => issue.stageIds.includes(resolvedStage)),
    [resolvedStage, validationIssues],
  )
  const lightboxResult = lightboxShotId ? imageGenResults[lightboxShotId] : null
  const lightboxEntry = lightboxShotId
    ? promptEntries.find((entry) => entry.shotId === lightboxShotId) ?? null
    : null

  useEffect(() => {
    let active = true

    async function loadCapabilities() {
      try {
        const response = await fetch("/api/system-capabilities")
        if (!response.ok) {
          throw new Error("Failed to fetch system capabilities")
        }

        const data = (await response.json()) as SystemCapabilities
        if (!active) return

        setCapabilities(data)
        setCapabilitiesState("ready")
      } catch {
        if (!active) return
        setCapabilitiesState("error")
      }
    }

    void loadCapabilities()

    return () => {
      active = false
    }
  }, [])

  const handleGenerateShot = useCallback(async (entry: PipelinePromptEntry) => {
    if (!normalizedResult) return
    setImageGenError(null)
    setImageGenRunning(entry.shotId)

    try {
      const result = await generatePipelineShotImage(normalizedResult.sceneId, entry, imageGenModel)
      setImageGenResult(entry.shotId, result)
      setActiveResultShotId(entry.shotId)
    } catch (error) {
      setImageGenError(error instanceof Error ? error.message : String(error))
    } finally {
      setImageGenRunning(null)
    }
  }, [imageGenModel, normalizedResult, setImageGenResult, setImageGenRunning])

  const handleGenerateAll = useCallback(async () => {
    for (const entry of promptEntries) {
      await handleGenerateShot(entry)
    }
  }, [handleGenerateShot, promptEntries])

  if (!selectedStage) {
    return (
      <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-white/8 bg-[#12110F]">
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[11px] text-white/25">Выберите этап для настройки</p>
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-white/8 bg-[#12110F]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/6 px-4 py-3">
        <div className="flex-1">
          <h3 className="text-[12px] font-semibold text-[#E5E0DB]">{info.title}</h3>
          <p className="text-[10px] text-white/35">{info.description}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-white/30 transition-colors hover:bg-white/5 hover:text-white/60"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          <StageExplanationCard
            explanation={explanation}
            summary={summary}
          />

          {selectedStage === "contextRouter" ? <ContextRouterSummaryCard stageResult={stageResults.contextRouter} /> : null}
          {selectedStage === "promptOptimizer" ? <PromptOptimizerComparisonCard stageResult={stageResults.promptOptimizer} /> : null}

          <SystemReadinessCard
            stageId={resolvedStage}
            capabilities={capabilities}
            capabilitiesState={capabilitiesState}
            issues={stageIssues}
          />

          {/* sceneInput */}
          {selectedStage === "sceneInput" && <SceneInputInspector />}

          {selectedStage !== "sceneInput"
            ? configSections.map((section) => (
                <ConfiguratorSectionCard
                  key={section.id}
                  title={section.title}
                  description={section.description}
                >
                  {section.fields.map((field) => (
                    <ConfigFieldControl
                      key={field.id}
                      field={field}
                      value={getConfiguratorValue(config, imageGenModel, field.id)}
                      onChange={(value) => updateConfigValue(field.id, value)}
                    />
                  ))}
                </ConfiguratorSectionCard>
              ))
            : null}

          {selectedStage === "sceneAnalyst" || selectedStage === "actionSplitter" || selectedStage === "shotPlanner" ? (
            <PresetSummary label="Режиссёр" name={config.directorPreset.name} />
          ) : null}

          {selectedStage === "continuitySupervisor" || selectedStage === "promptComposer" ? (
            <PresetSummary label="Оператор" name={config.cinematographerPreset.name} />
          ) : null}

          {selectedStage === "imageGenerator" && (
            <ImageGenerationPanel
              promptEntries={promptEntries}
              imageGenResults={imageGenResults}
              imageGenRunning={imageGenRunning}
              imageGenError={imageGenError}
              activeResultShotId={activeResultShotId}
              activeLightboxShotId={lightboxShotId}
              onSelectResult={setActiveResultShotId}
              onOpenLightbox={setLightboxShotId}
              onGenerateShot={handleGenerateShot}
              onGenerateAll={handleGenerateAll}
            />
          )}

          {/* Field Locks */}
          {selectedStage !== "sceneInput" && (
            <FieldLocks
              fields={
                ["sceneAnalyst", "actionSplitter", "shotPlanner"].includes(selectedStage!)
                  ? LOCKABLE_DIRECTOR_FIELDS as unknown as string[]
                  : ["continuitySupervisor", "promptComposer"].includes(selectedStage!)
                    ? LOCKABLE_DP_FIELDS as unknown as string[]
                    : []
              }
              isFieldLocked={isFieldLocked}
              toggleFieldLock={toggleFieldLock}
            />
          )}

          {/* Stage Data Preview (raw I/O) */}
          {selectedStage !== "sceneInput" && (
            <StageDataPreview
              stageId={selectedStage!}
              stageResults={stageResults}
              runSnapshot={runSnapshot}
            />
          )}
        </div>
      </div>

      <ImageLightbox
        imageUrl={lightboxResult?.imageUrl ?? null}
        alt={lightboxEntry?.label ?? "Generated pipeline frame"}
        title={lightboxEntry?.label}
        subtitle={lightboxResult ? `${lightboxResult.model} · ${lightboxResult.durationMs}ms` : undefined}
        onClose={() => setLightboxShotId(null)}
      />
    </aside>
  )
}

function SystemReadinessCard({
  stageId,
  capabilities,
  capabilitiesState,
  issues,
}: {
  stageId: PipelineStageId
  capabilities: SystemCapabilities | null
  capabilitiesState: "loading" | "ready" | "error"
  issues: ConfigValidationIssue[]
}) {
  const capabilityRows = [
    { label: "Anthropic", ready: capabilities?.anthropicConfigured ?? false },
    { label: "OpenAI", ready: capabilities?.openaiConfigured ?? false },
    { label: "Google", ready: capabilities?.googleConfigured ?? false },
  ]

  return (
    <div className="rounded-xl border border-white/8 bg-white/3 p-3 backdrop-blur-lg">
      <div className="flex items-center justify-between">
        <span className={labelClass}>System Readiness</span>
        <span className="text-[10px] text-white/30">{STAGE_INFO[stageId].title}</span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        {capabilityRows.map((row) => (
          <div key={row.label} className="rounded-md border border-white/6 bg-black/10 px-2 py-1.5">
            <p className="text-[9px] uppercase tracking-[0.12em] text-white/22">{row.label}</p>
            <p className={`mt-1 text-[11px] font-medium ${row.ready ? "text-emerald-300" : "text-white/38"}`}>
              {capabilitiesState === "loading" ? "Checking" : row.ready ? "Ready" : "Missing"}
            </p>
          </div>
        ))}
      </div>

      {capabilitiesState === "error" ? (
        <div className="mt-2 rounded-md border border-amber-500/20 bg-amber-950/35 px-2.5 py-2 text-[10px] text-amber-200">
          Не удалось получить server capabilities. Provider readiness временно неизвестен.
        </div>
      ) : null}

      {issues.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2">
          {issues.map((issue) => (
            <div
              key={issue.id}
              className={`rounded-md border px-2.5 py-2 ${issue.severity === "error" ? "border-red-500/20 bg-red-950/40 text-red-200" : "border-amber-500/20 bg-amber-950/35 text-amber-200"}`}
            >
              <p className="text-[10px] font-medium">{issue.title}</p>
              <p className="mt-1 text-[10px] leading-relaxed opacity-85">{issue.description}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[10px] leading-relaxed text-emerald-300/90">Для этого этапа явных конфликтов конфигурации не найдено.</p>
      )}
    </div>
  )
}

function ImageGenerationPanel({
  promptEntries,
  imageGenResults,
  imageGenRunning,
  imageGenError,
  activeResultShotId,
  activeLightboxShotId,
  onSelectResult,
  onOpenLightbox,
  onGenerateShot,
  onGenerateAll,
}: {
  promptEntries: PipelinePromptEntry[]
  imageGenResults: Record<string, { imageUrl: string; prompt: string; durationMs: number; model: string }>
  imageGenRunning: string | null
  imageGenError: string | null
  activeResultShotId: string | null
  activeLightboxShotId: string | null
  onSelectResult: (shotId: string | null) => void
  onOpenLightbox: (shotId: string) => void
  onGenerateShot: (entry: PipelinePromptEntry) => Promise<void>
  onGenerateAll: () => Promise<void>
}) {
  const activeResult = activeResultShotId ? imageGenResults[activeResultShotId] : null
  const readyCount = Object.keys(imageGenResults).length

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/8 bg-white/3 p-3 backdrop-blur-lg">
      <div className="flex items-center justify-between">
        <span className={labelClass}>Генератор изображений</span>
        <span className="text-[10px] text-white/35">{readyCount}/{promptEntries.length} ready</span>
      </div>

      {promptEntries.length === 0 ? (
        <p className="text-[11px] text-white/35">Сначала запустите pipeline, чтобы получить image prompts.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 rounded-lg border border-white/6 bg-black/10 p-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/32">Промпты из разбора</span>
            {promptEntries.map((entry) => {
              const isRunning = imageGenRunning === entry.shotId
              return (
                <div key={entry.shotId} className="flex items-start gap-2 rounded-md border border-white/5 bg-white/2 p-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-[#E5E0DB]">{entry.label}</p>
                    <p className="mt-1 line-clamp-3 text-[10px] leading-relaxed text-white/40">{entry.prompt}</p>
                  </div>
                  <button
                    onClick={() => void onGenerateShot(entry)}
                    disabled={Boolean(imageGenRunning)}
                    className="rounded-md border border-[#D4A853]/30 bg-[#D4A853]/12 px-2 py-1 text-[10px] font-medium text-[#D4A853] transition-colors hover:bg-[#D4A853]/18 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isRunning ? "Generating" : imageGenResults[entry.shotId] ? "Regenerate" : "Generate"}
                  </button>
                </div>
              )
            })}
          </div>

          <button
            onClick={() => void onGenerateAll()}
            disabled={Boolean(imageGenRunning)}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/12 px-3 py-2 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/18 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {imageGenRunning ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Сгенерировать все
          </button>

          {imageGenError ? (
            <div className="rounded-md border border-red-500/20 bg-red-950/50 px-2.5 py-2 text-[10px] text-red-300">
              {imageGenError}
            </div>
          ) : null}

          {readyCount > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-white/32">Результаты</span>
              <div className="grid grid-cols-2 gap-2">
                {promptEntries.filter((entry) => imageGenResults[entry.shotId]).map((entry) => {
                  const result = imageGenResults[entry.shotId]
                  return (
                    <button
                      key={entry.shotId}
                      onClick={() => onSelectResult(entry.shotId)}
                      className={`overflow-hidden rounded-lg border bg-white/2 text-left transition-colors ${activeResultShotId === entry.shotId ? "border-[#D4A853]/40" : "border-white/6 hover:border-white/12"}`}
                    >
                      <div className="relative aspect-16/10 w-full bg-black/20">
                        <Image src={result.imageUrl} alt={entry.label} fill unoptimized className="object-cover" />
                        <button
                          onClick={(event) => {
                            event.stopPropagation()
                            onOpenLightbox(entry.shotId)
                          }}
                          className={`absolute right-2 top-2 rounded-md border border-black/20 bg-black/55 px-2 py-1 text-[9px] font-medium text-white transition-colors hover:bg-black/70 ${activeLightboxShotId === entry.shotId ? "ring-1 ring-[#D4A853]/60" : ""}`}
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

              {activeResult ? (
                <div className="rounded-lg border border-white/6 bg-black/10 p-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/30">Промпт</p>
                  <p className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed text-white/55">{activeResult.prompt}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

function SceneInputInspector() {
  return (
    <div className="rounded-lg border border-white/6 bg-white/2 p-3">
      <p className="text-[10px] text-white/35">
        Введите текст сцены в поле выше или выберите сцену из проекта.
      </p>
    </div>
  )
}

function StageExplanationCard({
  explanation,
  summary,
}: {
  explanation: { whatItDoes: string; whyItExists: string; inputLabel: string; outputLabel: string; bibleUsage: string | null }
  summary: { inputSummary: string; outputSummary: string; bibleSummary: string | null }
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/3 p-3 backdrop-blur-lg">
      <div className="flex flex-col gap-2">
        <ExplainRow label="Что делает" value={explanation.whatItDoes} />
        <ExplainRow label="Зачем нужен" value={explanation.whyItExists} />
        <ExplainRow label="Ожидает на вход" value={`${explanation.inputLabel}${summary.inputSummary ? `: ${summary.inputSummary}` : ""}`} />
        <ExplainRow label="Отдаёт на выход" value={`${explanation.outputLabel}${summary.outputSummary ? `: ${summary.outputSummary}` : ""}`} />
        {explanation.bibleUsage ? (
          <ExplainRow
            label="Библия"
            value={summary.bibleSummary ?? explanation.bibleUsage}
            tone="gold"
          />
        ) : null}
      </div>
    </div>
  )
}

function ExplainRow({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string
  tone?: "default" | "gold"
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.14em] text-white/32">{label}</span>
      <p className={`text-[11px] leading-relaxed ${tone === "gold" ? "text-[#D4A853]" : "text-[#E5E0DB]/82"}`}>
        {value}
      </p>
    </div>
  )
}

function getStringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function getStringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : []
}

function ContextRouterSummaryCard({ stageResult }: { stageResult: unknown }) {
  const stageData = stageResult as { output?: unknown } | undefined
  const output = stageData?.output && typeof stageData.output === "object"
    ? stageData.output as Record<string, unknown>
    : null

  if (!output) {
    return null
  }

  const primaryLocation = getStringValue(output.primaryLocation)
  const secondaryLocations = getStringArrayValue(output.visibleSecondaryLocations)
  const offscreenLocations = getStringArrayValue(output.offscreenLocations)
  const propAnchors = getStringArrayValue(output.propAnchors)
  const promptHints = getStringArrayValue(output.promptHints)

  return (
    <div className="rounded-xl border border-[#D4A853]/18 bg-[#D4A853]/6 p-3 backdrop-blur-lg">
      <div className="flex flex-col gap-2">
        <ExplainRow label="Primary Location" value={primaryLocation || "Не определена"} tone="gold" />
        {secondaryLocations.length > 0 ? <ExplainRow label="Visible Secondary" value={secondaryLocations.join(", ")} /> : null}
        {offscreenLocations.length > 0 ? <ExplainRow label="Offscreen Pressure" value={offscreenLocations.join(", ")} /> : null}
        {propAnchors.length > 0 ? <ExplainRow label="Prop Anchors" value={propAnchors.join(", ")} /> : null}
        {promptHints.length > 0 ? <ExplainRow label="Prompt Hints" value={promptHints.join(" | ")} /> : null}
      </div>
    </div>
  )
}

function PromptOptimizerComparisonCard({ stageResult }: { stageResult: unknown }) {
  const [openShotId, setOpenShotId] = useState<string | null>(null)
  const stageData = stageResult as { output?: unknown } | undefined
  const output = stageData?.output && typeof stageData.output === "object"
    ? stageData.output as Record<string, unknown>
    : null

  if (!output) {
    return null
  }

  const optimizedEntries = Array.isArray(output.optimizedEntries)
    ? output.optimizedEntries as Array<Record<string, unknown>>
    : []
  const totalCharsSaved = typeof output.totalCharsSaved === "number" ? output.totalCharsSaved : 0

  return (
    <div className="rounded-xl border border-lime-500/18 bg-lime-500/6 p-3 backdrop-blur-lg">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-lime-300/70">Raw vs Optimized</p>
          <p className="text-[11px] leading-relaxed text-[#E5E0DB]/82">Суммарно убрано {totalCharsSaved} символов по всем шотам.</p>
        </div>
        <span className="rounded-full border border-lime-500/20 bg-black/15 px-2 py-1 text-[10px] text-lime-300/90">
          {optimizedEntries.length} shots
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {optimizedEntries.map((entry) => {
          const shotId = getStringValue(entry.shotId)
          const label = getStringValue(entry.label) || shotId
          const rawPrompt = getStringValue(entry.rawPrompt)
          const optimizedPrompt = getStringValue(entry.optimizedPrompt)
          const removedSignals = getStringArrayValue(entry.removedSignals)
          const rawLength = typeof entry.rawLength === "number" ? entry.rawLength : rawPrompt.length
          const optimizedLength = typeof entry.optimizedLength === "number" ? entry.optimizedLength : optimizedPrompt.length
          const charsSaved = typeof entry.charsSaved === "number" ? entry.charsSaved : Math.max(0, rawLength - optimizedLength)
          const isOpen = openShotId === shotId

          return (
            <div key={shotId} className="rounded-lg border border-white/6 bg-black/12">
              <button
                onClick={() => setOpenShotId(isOpen ? null : shotId)}
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-white/4"
              >
                {isOpen ? <ChevronDown className="h-3 w-3 text-white/35" /> : <ChevronRight className="h-3 w-3 text-white/35" />}
                <div className="flex-1">
                  <p className="text-[11px] font-medium text-[#E5E0DB]">{label}</p>
                  <p className="text-[9px] text-white/35">{rawLength} to {optimizedLength} chars, saved {charsSaved}</p>
                </div>
              </button>

              {isOpen ? (
                <div className="flex flex-col gap-2 border-t border-white/6 px-2.5 py-2">
                  <ExplainRow label="Raw Prompt" value={rawPrompt} />
                  <ExplainRow label="Optimized Prompt" value={optimizedPrompt} tone="gold" />
                  {removedSignals.length > 0 ? <ExplainRow label="Removed / Compressed" value={removedSignals.join(" | ")} /> : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      {children}
    </div>
  )
}

function ConfiguratorSectionCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/3 p-3 backdrop-blur-lg">
      <div className="mb-3 flex flex-col gap-1">
        <p className="text-[11px] font-medium text-[#E5E0DB]">{title}</p>
        {description ? <p className="text-[10px] leading-relaxed text-white/35">{description}</p> : null}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

function ConfigFieldControl({
  field,
  value,
  onChange,
}: {
  field: ConfiguratorField
  value: string | [number, number]
  onChange: (value: string | [number, number]) => void
}) {
  if (field.kind === "select") {
    return (
      <Field label={field.label}>
        <select className={fieldClass} value={value as string} onChange={(e) => onChange(e.target.value)}>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
    )
  }

  if (field.kind === "textarea") {
    return (
      <Field label={field.label}>
        <textarea
          className={`${fieldClass} resize-none`}
          rows={field.rows ?? 4}
          placeholder={field.placeholder}
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
    )
  }

  if (field.kind === "toggle") {
    const options = field.options ?? []
    return (
      <Field label={field.label}>
        <ToggleGroup
          options={options.map((option) => option.value)}
          labels={options.map((option) => option.label)}
          value={value as string}
          onChange={(nextValue) => onChange(nextValue)}
        />
      </Field>
    )
  }

  const rangeValue = value as [number, number]
  return (
    <Field label={field.label}>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={field.min}
          max={field.max}
          className={`${fieldClass} w-16 text-center`}
          value={rangeValue[0]}
          onChange={(e) => onChange([Number(e.target.value), rangeValue[1]])}
        />
        <span className="text-[10px] text-white/30">до</span>
        <input
          type="number"
          min={field.min}
          max={field.max}
          className={`${fieldClass} w-16 text-center`}
          value={rangeValue[1]}
          onChange={(e) => onChange([rangeValue[0], Number(e.target.value)])}
        />
      </div>
    </Field>
  )
}

function ToggleGroup({
  options,
  labels,
  value,
  onChange,
}: {
  options: string[]
  labels?: string[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex gap-1">
      {options.map((opt, i) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors ${
            value === opt
              ? "border border-[#D4A853]/30 bg-[#D4A853]/12 text-[#D4A853]"
              : "border border-white/6 bg-white/2 text-white/40 hover:bg-white/5 hover:text-white/60"
          }`}
        >
          {labels?.[i] ?? opt}
        </button>
      ))}
    </div>
  )
}

function PresetSummary({ label, name }: { label: string; name: string }) {
  return (
    <div className="rounded-lg border border-white/6 bg-white/2 p-3">
      <span className="text-[9px] uppercase tracking-[0.12em] text-white/25">Пресет: {label}</span>
      <p className="mt-0.5 text-[11px] font-medium text-[#D4A853]">{name}</p>
    </div>
  )
}

function FieldLocks({
  fields,
  isFieldLocked,
  toggleFieldLock,
}: {
  fields: string[]
  isFieldLocked: (fieldPath: string) => boolean
  toggleFieldLock: (fieldPath: string) => void
}) {
  if (fields.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelClass}>Блокировка полей</span>
      <div className="rounded-lg border border-white/6 bg-white/2 p-2">
        <p className="mb-2 text-[9px] text-white/25">
          Заблокируйте поля для сохранения при слиянии пресетов
        </p>
        {fields.map((field) => {
          const locked = isFieldLocked(field)
          return (
            <button
              key={field}
              onClick={() => toggleFieldLock(field)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                locked
                  ? "bg-[#D4A853]/8 text-[#D4A853]"
                  : "text-white/40 hover:bg-white/3 hover:text-white/60"
              }`}
            >
              {locked ? (
                <Lock className="h-3 w-3 shrink-0" />
              ) : (
                <Unlock className="h-3 w-3 shrink-0" />
              )}
              <span className="text-[10px]">{getFieldDisplayName(field)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StageDataPreview({
  stageId,
  stageResults,
  runSnapshot,
}: {
  stageId: PipelineStageId
  stageResults: Record<PipelineStageId, unknown>
  runSnapshot: { config: unknown; sceneText: string; startedAt: number } | null
}) {
  const [sectionOpen, setSectionOpen] = useState(true)
  const [inputOpen, setInputOpen] = useState(false)
  const [outputOpen, setOutputOpen] = useState(false)

  const stageData = stageResults[stageId] as { input?: unknown; output?: unknown } | undefined
  const hasInput = stageData?.input !== undefined
  const hasOutput = stageData?.output !== undefined

  if (!hasInput && !hasOutput && !runSnapshot) return null

  return (
    <div className="flex flex-col gap-1.5">
      <div className="rounded-lg border border-white/6 bg-white/2">
        <button
          onClick={() => setSectionOpen(!sectionOpen)}
          className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left transition-colors hover:bg-white/3"
        >
          {sectionOpen ? (
            <ChevronDown className="h-3 w-3 text-white/25" />
          ) : (
            <ChevronRight className="h-3 w-3 text-white/25" />
          )}
          <span className={labelClass}>Данные Этапа</span>
        </button>

        {sectionOpen ? (
          <div className="flex flex-col gap-2 border-t border-white/4 p-2">
            <CollapsibleJSON
              label="Вход"
              open={inputOpen}
              onToggle={() => setInputOpen(!inputOpen)}
              data={hasInput ? stageData!.input : (stageId === "sceneAnalyst" && runSnapshot ? { sceneText: runSnapshot.sceneText.slice(0, 500) } : null)}
            />

            <CollapsibleJSON
              label="Выход"
              open={outputOpen}
              onToggle={() => setOutputOpen(!outputOpen)}
              data={hasOutput ? stageData!.output : null}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function CollapsibleJSON({
  label,
  open,
  onToggle,
  data,
}: {
  label: string
  open: boolean
  onToggle: () => void
  data: unknown
}) {
  if (data === null || data === undefined) {
    return (
      <div className="rounded-md border border-white/4 bg-white/2 px-2.5 py-1.5">
        <span className="text-[9px] text-white/20">{label}: ожидание запуска…</span>
      </div>
    )
  }

  const jsonStr = JSON.stringify(data, null, 2)
  const lineCount = jsonStr.split("\n").length

  return (
    <div className="rounded-md border border-white/6 bg-white/2">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left transition-colors hover:bg-white/3"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-white/25" />
        ) : (
          <ChevronRight className="h-3 w-3 text-white/25" />
        )}
        <span className="text-[9px] font-medium text-white/45">{label}</span>
        <span className="ml-auto text-[8px] text-white/20">{lineCount} lines</span>
      </button>
      {open && (
        <pre className="max-h-50 overflow-auto border-t border-white/4 px-2.5 py-2 text-[8px] leading-relaxed text-white/35">
          {jsonStr}
        </pre>
      )}
    </div>
  )
}
