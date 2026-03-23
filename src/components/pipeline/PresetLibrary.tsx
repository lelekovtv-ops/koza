"use client"

import { ChevronDown, ChevronRight, Clapperboard, Camera, Save } from "lucide-react"
import { useState, type DragEvent } from "react"
import type { DirectorPreset, CinematographerPreset, PipelineConfig } from "@/types/pipeline"
import { BUILTIN_DIRECTOR_PRESETS, BUILTIN_CINEMATOGRAPHER_PRESETS } from "@/lib/pipeline/presets"
import { usePipelineStore } from "@/store/pipeline"

interface PresetLibraryProps {
  activeDirectorId: string
  activeCinematographerId: string
}

export default function PresetLibrary({
  activeDirectorId,
  activeCinematographerId,
}: PresetLibraryProps) {
  const [directorOpen, setDirectorOpen] = useState(true)
  const [dpOpen, setDpOpen] = useState(true)
  const [configsOpen, setConfigsOpen] = useState(false)

  const customDirectorPresets = usePipelineStore((s) => s.customDirectorPresets)
  const customCinematographerPresets = usePipelineStore((s) => s.customCinematographerPresets)
  const savedConfigs = usePipelineStore((s) => s.savedConfigs)
  const applyDirectorPreset = usePipelineStore((s) => s.applyDirectorPreset)
  const applyCinematographerPreset = usePipelineStore((s) => s.applyCinematographerPreset)
  const loadConfig = usePipelineStore((s) => s.loadConfig)

  const allDirectors = [...BUILTIN_DIRECTOR_PRESETS, ...customDirectorPresets]
  const allDPs = [...BUILTIN_CINEMATOGRAPHER_PRESETS, ...customCinematographerPresets]

  function handleDirectorDragStart(e: DragEvent, preset: DirectorPreset) {
    e.dataTransfer.setData("application/koza-director-preset", JSON.stringify(preset))
    e.dataTransfer.effectAllowed = "copy"
  }

  function handleDPDragStart(e: DragEvent, preset: CinematographerPreset) {
    e.dataTransfer.setData("application/koza-dp-preset", JSON.stringify(preset))
    e.dataTransfer.effectAllowed = "copy"
  }

  function handleConfigDragStart(e: DragEvent, config: PipelineConfig) {
    e.dataTransfer.setData("application/koza-pipeline-config", JSON.stringify(config))
    e.dataTransfer.effectAllowed = "copy"
  }

  return (
    <aside className="flex h-full w-[240px] flex-shrink-0 flex-col border-r border-white/8 bg-[#12110F]">
      <div className="border-b border-white/6 px-4 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
          Библиотека Пресетов
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Director Presets */}
        <AccordionSection
          open={directorOpen}
          onToggle={() => setDirectorOpen(!directorOpen)}
          icon={<Clapperboard className="h-3.5 w-3.5" />}
          label="Пресеты Режиссёра"
          count={allDirectors.length}
        >
          {allDirectors.map((preset) => (
            <DirectorPresetCard
              key={preset.id}
              preset={preset}
              active={preset.id === activeDirectorId}
              onClick={() => applyDirectorPreset(preset)}
              onDragStart={(e) => handleDirectorDragStart(e, preset)}
            />
          ))}
        </AccordionSection>

        {/* Cinematographer Presets */}
        <AccordionSection
          open={dpOpen}
          onToggle={() => setDpOpen(!dpOpen)}
          icon={<Camera className="h-3.5 w-3.5" />}
          label="Пресеты Оператора"
          count={allDPs.length}
        >
          {allDPs.map((preset) => (
            <DPPresetCard
              key={preset.id}
              preset={preset}
              active={preset.id === activeCinematographerId}
              onClick={() => applyCinematographerPreset(preset)}
              onDragStart={(e) => handleDPDragStart(e, preset)}
            />
          ))}
        </AccordionSection>

        {/* Saved Configs */}
        <AccordionSection
          open={configsOpen}
          onToggle={() => setConfigsOpen(!configsOpen)}
          icon={<Save className="h-3.5 w-3.5" />}
          label="Сохранённые Конфиги"
          count={savedConfigs.length}
        >
          {savedConfigs.length === 0 && (
            <p className="px-4 py-2 text-[10px] text-white/25">Нет сохранённых конфигов</p>
          )}
          {savedConfigs.map((config) => (
            <PresetCard
              key={config.id}
              name={config.name}
              description={`${config.directorPreset.name} + ${config.cinematographerPreset.name}`}
              active={false}
              builtIn={false}
              preview={null}
              onClick={() => loadConfig(config.id)}
              onDragStart={(e) => handleConfigDragStart(e, config)}
            />
          ))}
        </AccordionSection>
      </div>
    </aside>
  )
}

// ─── Director card with preview ─────────────────────────────

function DirectorPresetCard({
  preset,
  active,
  onClick,
  onDragStart,
}: {
  preset: DirectorPreset
  active: boolean
  onClick: () => void
  onDragStart: (e: DragEvent<HTMLDivElement>) => void
}) {
  const preview = [
    { key: "Темп", value: preset.pacingStyle },
    { key: "Плотность", value: preset.dramaticDensity },
    { key: "Ключ. кадр", value: preset.keyframePolicy.replace(/_/g, " ") },
    { key: "Кадры", value: `${preset.shotCountRange[0]}–${preset.shotCountRange[1]}` },
  ]

  return (
    <PresetCard
      name={preset.name}
      description={preset.description}
      active={active}
      builtIn={preset.builtIn}
      preview={preview}
      onClick={onClick}
      onDragStart={onDragStart}
    />
  )
}

// ─── DP card with preview ───────────────────────────────────

function DPPresetCard({
  preset,
  active,
  onClick,
  onDragStart,
}: {
  preset: CinematographerPreset
  active: boolean
  onClick: () => void
  onDragStart: (e: DragEvent<HTMLDivElement>) => void
}) {
  const preview = [
    { key: "Оптика", value: preset.lensPreference },
    { key: "Свет", value: preset.lightingPhilosophy.slice(0, 40) },
    { key: "Композиция", value: preset.compositionRules.slice(0, 2).join(", ") },
    { key: "Палитра", value: preset.colorPalette.slice(0, 35) },
  ]

  return (
    <PresetCard
      name={preset.name}
      description={preset.description}
      active={active}
      builtIn={preset.builtIn}
      preview={preview}
      onClick={onClick}
      onDragStart={onDragStart}
    />
  )
}

// ─── Accordion ──────────────────────────────────────────────

function AccordionSection({
  open,
  onToggle,
  icon,
  label,
  count,
  children,
}: {
  open: boolean
  onToggle: () => void
  icon: React.ReactNode
  label: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-white/5">
      <button
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-white/3"
        onClick={onToggle}
      >
        <span className="text-white/40">{icon}</span>
        <span className="flex-1 text-[11px] font-semibold tracking-[0.08em] text-white/60">
          {label}
        </span>
        <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] text-white/30">
          {count}
        </span>
        {open ? (
          <ChevronDown className="h-3 w-3 text-white/25" />
        ) : (
          <ChevronRight className="h-3 w-3 text-white/25" />
        )}
      </button>
      {open && <div className="flex flex-col gap-1.5 px-3 pb-3">{children}</div>}
    </div>
  )
}

// ─── Preset Card with hover preview ────────────────────────

function PresetCard({
  name,
  description,
  active,
  builtIn,
  preview,
  onClick,
  onDragStart,
}: {
  name: string
  description: string
  active: boolean
  builtIn: boolean
  preview: Array<{ key: string; value: string }> | null
  onClick: () => void
  onDragStart: (e: DragEvent<HTMLDivElement>) => void
}) {
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onMouseEnter={() => setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
      className={`relative cursor-pointer rounded-lg border px-3 py-2 transition-colors ${
        active
          ? "border-[#D4A853]/30 bg-[#D4A853]/8"
          : "border-white/6 bg-white/2 hover:border-white/12 hover:bg-white/4"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`text-[11px] font-medium ${
            active ? "text-[#D4A853]" : "text-[#E5E0DB]"
          }`}
        >
          {name}
        </span>
        {builtIn && (
          <span className="rounded-full bg-white/5 px-1 py-0.5 text-[8px] text-white/25">
            встроен.
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[9px] leading-snug text-white/30">{description}</p>

      {/* Hover preview tooltip */}
      {showPreview && preview && preview.length > 0 && (
        <div className="absolute left-full top-0 z-50 ml-2 w-[200px] rounded-lg border border-white/10 bg-[#1A1816] p-2.5 shadow-[0_14px_40px_rgba(0,0,0,0.5)]">
          <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.15em] text-white/30">
            Просмотр
          </span>
          {preview.map((p) => (
            <div key={p.key} className="flex items-start justify-between gap-2 py-0.5">
              <span className="text-[9px] text-white/35">{p.key}</span>
              <span className="text-right text-[9px] text-white/55">{p.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}