"use client"

import { X, Lock, Unlock, ChevronDown, ChevronRight } from "lucide-react"
import { useState } from "react"
import type { PipelineStageId, ReferenceStrategy } from "@/types/pipeline"
import { usePipelineStore } from "@/store/pipeline"
import {
  LOCKABLE_DIRECTOR_FIELDS,
  LOCKABLE_DP_FIELDS,
  getFieldDisplayName,
} from "@/lib/pipeline/presetMerge"

interface InspectorPanelProps {
  selectedStage: PipelineStageId | null
  onClose: () => void
}

const textModels = [
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini" },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
]

const imageModels = [
  { id: "gpt-image", label: "GPT Image" },
  { id: "dall-e-3", label: "DALL-E 3" },
  { id: "flux-1.1-pro", label: "Flux 1.1 Pro" },
  { id: "imagen-4", label: "Imagen 4" },
]

const STAGE_INFO: Record<string, { title: string; description: string }> = {
  sceneInput: { title: "Вход Сцены", description: "Текст сцены и выбор источника" },
  sceneAnalyst: { title: "Аналитик Сцены", description: "AI-анализ драматургии сцены" },
  actionSplitter: { title: "Разбивка Действий", description: "Разбивает сцену на отдельные действия" },
  shotPlanner: { title: "Планировщик Кадров", description: "Планирует кадры из действий" },
  continuitySupervisor: { title: "Контроль Непрерывности", description: "Обеспечивает визуальную непрерывность между кадрами" },
  promptComposer: { title: "Компоновщик Промптов", description: "Составляет финальные промпты" },
  imageGenerator: { title: "Генератор Изображений", description: "Генерирует изображения из промптов" },
}

const fieldClass =
  "w-full rounded-md border border-white/8 bg-white/3 px-3 py-2 text-sm text-[#E5E0DB] outline-none transition-colors placeholder:text-white/22 focus:border-[#D4A853]/40"
const labelClass = "text-[10px] font-medium uppercase tracking-[0.12em] text-white/40"

export default function InspectorPanel({ selectedStage, onClose }: InspectorPanelProps) {
  const config = usePipelineStore((s) => s.activeConfig)
  const setStageModel = usePipelineStore((s) => s.setStageModel)
  const setStageCustomPrompt = usePipelineStore((s) => s.setStageCustomPrompt)
  const setDirectorPreset = usePipelineStore((s) => s.setDirectorPreset)
  const setCinematographerPreset = usePipelineStore((s) => s.setCinematographerPreset)
  const setFallbackMode = usePipelineStore((s) => s.setFallbackMode)
  const setStylePrompt = usePipelineStore((s) => s.setStylePrompt)
  const setLanguage = usePipelineStore((s) => s.setLanguage)
  const toggleFieldLock = usePipelineStore((s) => s.toggleFieldLock)
  const isFieldLocked = usePipelineStore((s) => s.isFieldLocked)
  const setReferenceStrategy = usePipelineStore((s) => s.setReferenceStrategy)
  const stageResults = usePipelineStore((s) => s.runState.stageResults)
  const runSnapshot = usePipelineStore((s) => s.runSnapshot)

  if (!selectedStage) {
    return (
      <aside className="flex h-full w-[320px] flex-shrink-0 flex-col border-l border-white/8 bg-[#12110F]">
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[11px] text-white/25">Выберите этап для настройки</p>
        </div>
      </aside>
    )
  }

  const info = STAGE_INFO[selectedStage]
  const stageModel = config.stageModels.find((sm) => sm.stageId === selectedStage)

  return (
    <aside className="flex h-full w-[320px] flex-shrink-0 flex-col border-l border-white/8 bg-[#12110F]">
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
          {/* sceneInput */}
          {selectedStage === "sceneInput" && <SceneInputInspector />}

          {/* AI stages with model selector */}
          {(selectedStage === "sceneAnalyst" ||
            selectedStage === "actionSplitter" ||
            selectedStage === "shotPlanner" ||
            selectedStage === "promptComposer") && (
            <>
              <Field label="AI Модель">
                <select
                  className={fieldClass}
                  value={stageModel?.modelId ?? ""}
                  onChange={(e) => setStageModel(selectedStage, e.target.value)}
                >
                  {textModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Суффикс системного промпта">
                <textarea
                  className={`${fieldClass} h-20 resize-none`}
                  placeholder="Дополнительные инструкции для этого этапа..."
                  value={stageModel?.customSystemPromptSuffix ?? ""}
                  onChange={(e) => setStageCustomPrompt(selectedStage, e.target.value)}
                />
              </Field>
            </>
          )}

          {/* Scene Analyst specifics */}
          {selectedStage === "sceneAnalyst" && (
            <Field label="Эмоциональный фокус (Режиссёр)">
              <textarea
                className={`${fieldClass} h-16 resize-none`}
                value={config.directorPreset.emotionalFocus}
                onChange={(e) =>
                  setDirectorPreset({ ...config.directorPreset, emotionalFocus: e.target.value })
                }
              />
            </Field>
          )}

          {/* Action Splitter specifics */}
          {selectedStage === "actionSplitter" && (
            <Field label="Драматическая плотность">
              <ToggleGroup
                options={["lean", "balanced", "dense"]}
                value={config.directorPreset.dramaticDensity}
                onChange={(v) =>
                  setDirectorPreset({
                    ...config.directorPreset,
                    dramaticDensity: v as "lean" | "balanced" | "dense",
                  })
                }
              />
            </Field>
          )}

          {/* Shot Planner specifics */}
          {selectedStage === "shotPlanner" && (
            <>
              <Field label="Диапазон кадров">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    className={`${fieldClass} w-16 text-center`}
                    value={config.directorPreset.shotCountRange[0]}
                    onChange={(e) =>
                      setDirectorPreset({
                        ...config.directorPreset,
                        shotCountRange: [
                          Number(e.target.value),
                          config.directorPreset.shotCountRange[1],
                        ],
                      })
                    }
                  />
                  <span className="text-[10px] text-white/30">до</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    className={`${fieldClass} w-16 text-center`}
                    value={config.directorPreset.shotCountRange[1]}
                    onChange={(e) =>
                      setDirectorPreset({
                        ...config.directorPreset,
                        shotCountRange: [
                          config.directorPreset.shotCountRange[0],
                          Number(e.target.value),
                        ],
                      })
                    }
                  />
                </div>
              </Field>
              <Field label="Политика ключевых кадров">
                <ToggleGroup
                  options={["opening_anchor", "story_turns", "every_major_shift"]}
                  labels={["Anchor", "Turns", "Every Shift"]}
                  value={config.directorPreset.keyframePolicy}
                  onChange={(v) =>
                    setDirectorPreset({
                      ...config.directorPreset,
                      keyframePolicy: v as "opening_anchor" | "story_turns" | "every_major_shift",
                    })
                  }
                />
              </Field>
              <PresetSummary label="Режиссёр" name={config.directorPreset.name} />
            </>
          )}

          {/* Continuity Supervisor */}
          {selectedStage === "continuitySupervisor" && (
            <>
              <Field label="Строгость непрерывности">
                <ToggleGroup
                  options={["flexible", "standard", "strict"]}
                  value={config.cinematographerPreset.continuityStrictness}
                  onChange={(v) =>
                    setCinematographerPreset({
                      ...config.cinematographerPreset,
                      continuityStrictness: v as "flexible" | "standard" | "strict",
                    })
                  }
                />
              </Field>
              <Field label="Режим связей">
                <ToggleGroup
                  options={["minimal", "balanced", "explicit"]}
                  value={config.cinematographerPreset.relationMode}
                  onChange={(v) =>
                    setCinematographerPreset({
                      ...config.cinematographerPreset,
                      relationMode: v as "minimal" | "balanced" | "explicit",
                    })
                  }
                />
              </Field>
              <PresetSummary label="Оператор" name={config.cinematographerPreset.name} />
            </>
          )}

          {/* Prompt Composer */}
          {selectedStage === "promptComposer" && (
            <>
              <Field label="Текстовое богатство">
                <ToggleGroup
                  options={["simple", "rich", "lush"]}
                  value={config.cinematographerPreset.textRichness}
                  onChange={(v) =>
                    setCinematographerPreset({
                      ...config.cinematographerPreset,
                      textRichness: v as "simple" | "rich" | "lush",
                    })
                  }
                />
              </Field>
              <Field label="Стилистический промпт">
                <textarea
                  className={`${fieldClass} h-20 resize-none`}
                  placeholder="Инструкции по стилю..."
                  value={config.stylePrompt}
                  onChange={(e) => setStylePrompt(e.target.value)}
                />
              </Field>
              <Field label="Язык">
                <ToggleGroup
                  options={["auto", "english", "russian"]}
                  labels={["Auto", "EN", "RU"]}
                  value={config.language}
                  onChange={(v) => setLanguage(v as "auto" | "english" | "russian")}
                />
              </Field>
              <PresetSummary label="Оператор" name={config.cinematographerPreset.name} />
            </>
          )}

          {/* Image Generator */}
          {selectedStage === "imageGenerator" && (
            <>
              <Field label="Модель изображений">
                <select
                  className={fieldClass}
                  value={stageModel?.modelId ?? "gpt-image"}
                  onChange={(e) => setStageModel("imageGenerator", e.target.value)}
                >
                  {imageModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Стратегия референсов">
                <ToggleGroup
                  options={["none", "previous_shot", "keyframe_cascade"]}
                  labels={["None", "Previous", "Cascade"]}
                  value={config.referenceStrategy}
                  onChange={(v) => setReferenceStrategy(v as ReferenceStrategy)}
                />
              </Field>
            </>
          )}

          {/* Fallback mode — shown for all stages */}
          {selectedStage !== "sceneInput" && selectedStage !== "imageGenerator" && (
            <Field label="Режим отката">
              <ToggleGroup
                options={["balanced", "prefer_speed", "fail_fast"]}
                labels={["Balanced", "Speed", "Fail Fast"]}
                value={config.fallbackMode}
                onChange={(v) => setFallbackMode(v as "balanced" | "prefer_speed" | "fail_fast")}
              />
            </Field>
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
    </aside>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      {children}
    </div>
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
                <Lock className="h-3 w-3 flex-shrink-0" />
              ) : (
                <Unlock className="h-3 w-3 flex-shrink-0" />
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
  const [inputOpen, setInputOpen] = useState(false)
  const [outputOpen, setOutputOpen] = useState(false)

  const stageData = stageResults[stageId] as { input?: unknown; output?: unknown } | undefined
  const hasInput = stageData?.input !== undefined
  const hasOutput = stageData?.output !== undefined

  if (!hasInput && !hasOutput && !runSnapshot) return null

  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelClass}>Данные Этапа</span>

      {/* Input */}
      <CollapsibleJSON
        label="Вход"
        open={inputOpen}
        onToggle={() => setInputOpen(!inputOpen)}
        data={hasInput ? stageData!.input : (stageId === "sceneAnalyst" && runSnapshot ? { sceneText: runSnapshot.sceneText.slice(0, 500) } : null)}
      />

      {/* Output */}
      <CollapsibleJSON
        label="Выход"
        open={outputOpen}
        onToggle={() => setOutputOpen(!outputOpen)}
        data={hasOutput ? stageData!.output : null}
      />
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
        <pre className="max-h-[200px] overflow-auto border-t border-white/4 px-2.5 py-2 text-[8px] leading-relaxed text-white/35">
          {jsonStr}
        </pre>
      )}
    </div>
  )
}
