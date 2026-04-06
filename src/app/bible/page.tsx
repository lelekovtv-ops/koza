"use client"

import Image from "next/image"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BookOpen, Box, Check, ChevronDown, Copy, Download, FlipHorizontal2, FlipVertical2, Loader2, MapPin, Mic, Pencil, Play, Plus, RotateCcw, RotateCw, Sparkles, Square, Trash2, Upload, User, Volume2, Wand2, X } from "lucide-react"
import { type BibleReferenceImage, type CharacterEntry, type LocationEntry, type PropEntry, type VoiceConfig, type VoiceProvider } from "@/lib/bibleParser"
import { deleteBlob, saveBlob, trySaveBlob } from "@/lib/fileStorage"
import {
  convertReferenceImagesToDataUrls,
  getCharacterGenerationReferenceImages,
  getLocationGenerationReferenceImages,
  getPropGenerationReferenceImages,
} from "@/lib/imageGenerationReferences"
import { ImageEditOverlay } from "@/components/ui/ImageEditOverlay"
import { ProjectStylePicker } from "@/components/ui/ProjectStylePicker"
import { DEFAULT_PROJECT_STYLE, STYLE_PRESETS, getProjectStylePresetId } from "@/lib/projectStyle"
import { useBreakdownConfigStore, BUILT_IN_PRODUCTION_PRESETS, type ProductionPreset } from "@/store/breakdownConfig"
import { parseScenes } from "@/lib/sceneParser"
import { useBoardStore } from "@/store/board"
import { useScriptStore } from "@/store/script"
import { GENERATED_CANONICAL_IMAGE_ID, useBibleStore, BUILT_IN_DIRECTORS, type DirectorProfile } from "@/store/bible"
import { useNavigationStore } from "@/store/navigation"

/* ─── Director Profile Section ─── */

function DirectorSection() {
  const setDirectorProfile = useBibleStore((s) => s.setDirectorProfile)
  const setProjectStyle = useBoardStore((s) => s.setProjectStyle)
  const activePipeline = useBreakdownConfigStore((s) => s.activePipelinePreset)
  const activePresetId = activePipeline?.presetId || "fincher"

  const handleSelectPreset = (preset: ProductionPreset) => {
    // One click — set everything
    setDirectorProfile({ name: preset.name, systemPrompt: preset.directorPrompt })
    setProjectStyle(preset.imageStyle)
    const { setActivePipelinePreset } = useBreakdownConfigStore.getState()
    if (preset.pipeline.modules.length > 0) {
      setActivePipelinePreset(preset.pipeline)
    } else {
      setActivePipelinePreset(null) // default fincher.ts fallback
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* ── Production Presets ── */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-3">Пресет производства</div>
        <div className="grid grid-cols-1 gap-3">
          {BUILT_IN_PRODUCTION_PRESETS.map((preset) => {
            const isActive = activePresetId === preset.id || (activePresetId === "fincher" && preset.id === "fincher" && !activePipeline)
            return (
              <button key={preset.id} onClick={() => handleSelectPreset(preset)}
                className={`text-left rounded-xl p-5 transition-all border ${
                  isActive
                    ? "border-[#D4A853]/40 bg-[#D4A853]/8"
                    : "border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/5"
                }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className={`text-[15px] font-semibold ${isActive ? "text-[#D4A853]" : "text-white/70"}`}>
                    {preset.name}
                  </div>
                  {isActive && (
                    <span className="rounded-full bg-[#D4A853]/15 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#D4A853]/70">
                      Активен
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-white/35 mb-2">{preset.description}</p>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-white/25">
                    Стиль: {preset.imageStyle.slice(0, 40)}...
                  </span>
                  <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-white/25">
                    {preset.pipeline.modules.length > 0 ? `${preset.pipeline.modules.length} модулей` : "Дефолтный пайплайн"}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Active preset details */}
      {activePipeline && (
        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-400/50">Активный пайплайн</div>
          </div>
          <div className="text-[11px] text-white/30">
            {activePipeline.modules.length > 0
              ? `${activePipeline.modules.length} модулей: ${activePipeline.modules.map((m) => m.name).join(" → ")}`
              : "Дефолтный Fincher"}
          </div>
        </div>
      )}

      {/* Hint */}
      <p className="text-[11px] text-white/15 text-center">
        Тонкая настройка пресетов — в Breakdown Studio (DEV)
      </p>
    </div>
  )
}

function BibleContextPanel({
  storyHistory,
  directorVision,
  ambientPrompt,
  onStoryHistorySave,
  onDirectorVisionSave,
  onAmbientPromptSave,
}: {
  storyHistory: string
  directorVision: string
  ambientPrompt: string
  onStoryHistorySave: (value: string) => void
  onDirectorVisionSave: (value: string) => void
  onAmbientPromptSave: (value: string) => void
}) {
  return (
    <section className="mb-6 grid gap-4 lg:grid-cols-2">
      <article className="rounded-2xl border border-white/8 bg-white/3 p-4">
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">Story History</p>
          <h2 className="mt-1 text-sm font-semibold uppercase tracking-[0.14em] text-white">История проекта</h2>
        </div>
        <EditableTextArea
          value={storyHistory}
          placeholder="Опиши историю мира, предысторию персонажей, драматический контекст и то, что должно сохраняться между сценами..."
          rows={8}
          onSave={onStoryHistorySave}
        />
      </article>

      <article className="rounded-2xl border border-white/8 bg-white/3 p-4">
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">Director Vision</p>
          <h2 className="mt-1 text-sm font-semibold uppercase tracking-[0.14em] text-white">Философия фильма</h2>
        </div>
        <EditableTextArea
          value={directorVision}
          placeholder="Опиши философию фильма, режиссёрский взгляд, эмоциональную оптику, этику кадра и правила выбора решений..."
          rows={8}
          onSave={onDirectorVisionSave}
        />
      </article>

      <article className="rounded-2xl border border-white/8 bg-white/3 p-4 lg:col-span-2">
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">Ambient Focus Mode</p>
          <h2 className="mt-1 text-sm font-semibold uppercase tracking-[0.14em] text-white">Стиль фона при написании</h2>
          <p className="mt-1 text-[11px] text-white/30">Промпт для генерации фоновых иллюстраций в полноэкранном режиме. Оставь пустым для стиля по умолчанию (comic book).</p>
        </div>
        <EditableTextArea
          value={ambientPrompt}
          placeholder="Comic book panel, graphic novel style, bold black ink outlines, halftone dots, dramatic camera angles, high contrast chiaroscuro lighting, 16:9 widescreen frame..."
          rows={4}
          onSave={onAmbientPromptSave}
        />
      </article>
    </section>
  )
}

const IMAGE_GEN_MODELS = [
  { id: "gpt-image", label: "GPT Image", price: "$0.04" },
  { id: "nano-banana", label: "NB1", price: "$0.039" },
  { id: "nano-banana-2", label: "NB2", price: "$0.045" },
  { id: "nano-banana-pro", label: "NB Pro", price: "$0.13" },
] as const

function formatSceneCount(count: number): string {
  return `${count} ${count === 1 ? "scene" : "scenes"}`
}

async function generateBibleImage(prompt: string, model: string, referenceImages: string[] = []): Promise<Blob> {
  const apiUrl = model === "gpt-image" ? "/api/gpt-image" : "/api/nano-banana"
  const body = model === "gpt-image" ? { prompt, referenceImages } : { prompt, model, referenceImages }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || `Generation failed: ${response.status}`)
  }

  return response.blob()
}

function formatLineCount(count: number): string {
  return `${count} ${count === 1 ? "line" : "lines"}`
}

function buildCharacterPrompt(character: CharacterEntry, style: string, translatedPrompt?: string): string {
  const resolvedStyle = style.trim() || DEFAULT_PROJECT_STYLE
  const referenceHint = character.referenceImages.length > 0 ? " Matching the reference style." : ""
  const identityInstruction = "Preserve the exact same facial identity, hair shape, costume silhouette, and proportions from the provided reference images."
  const textGuard = "No visible text, letters, logos, monograms, or name patches in frame."
  const desc = translatedPrompt || character.appearancePrompt.trim()

  if (desc) {
    return `Cinematic portrait photograph. ${desc}.${referenceHint} ${resolvedStyle}. ${identityInstruction} Portrait framing, head and shoulders, gaze slightly off-camera, neutral observational pose. ${textGuard}`
  }

  return `Cinematic portrait of the same recurring character.${referenceHint} ${resolvedStyle}. ${identityInstruction} Portrait framing, head and shoulders, gaze slightly off-camera, neutral observational pose. ${textGuard}`
}

function buildLocationPrompt(location: LocationEntry, style: string, translatedPrompt?: string): string {
  const resolvedStyle = style.trim() || DEFAULT_PROJECT_STYLE
  const exteriorLabel = location.intExt === "INT" ? "Interior" : "Exterior"
  const referenceHint = location.referenceImages.length > 0 ? " Matching the reference style." : ""
  const desc = translatedPrompt || location.appearancePrompt || location.name
  return `Cinematic wide shot of location: ${desc}. ${exteriorLabel}.${referenceHint} ${resolvedStyle}. Preserve the architecture, layout, and key environmental features from the provided reference images. Wide environmental frame. No text. No people.`
}

function buildPropPrompt(prop: PropEntry, style: string, translatedPrompt?: string): string {
  const resolvedStyle = style.trim() || DEFAULT_PROJECT_STYLE
  const referenceHint = prop.referenceImages.length > 0 ? " Matching the reference style." : ""
  const textGuard = "No visible text, letters, logos, monograms, or labels in frame."
  const desc = translatedPrompt || prop.appearancePrompt.trim() || prop.name

  return `Cinematic film still of a real full-size prop: ${desc}.${referenceHint} ${resolvedStyle}. Photographed on set, practical prop at real-world scale. Uniform dark background, no distracting elements. Cinematic lighting, anamorphic lens. NOT a miniature, NOT a toy, NOT a model kit. ${textGuard}`
}

async function translateToEnglish(text: string): Promise<string> {
  if (!text.trim()) return text
  // If already English, return as-is
  if (/^[\x00-\x7F\s.,!?;:'"()-]+$/.test(text)) return text

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: `Translate to English. Return ONLY the translation, nothing else:\n\n${text}` }],
        temperature: 0,
      }),
    })
    if (!res.ok) return text
    const reader = res.body?.getReader()
    if (!reader) return text
    const chunks: string[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(new TextDecoder().decode(value))
    }
    const result = chunks.join("").trim()
    return result || text
  } catch {
    return text
  }
}

async function replaceBlobImage(currentUrl: string | null, currentBlobKey: string | null, nextBlobKey: string, blob: Blob): Promise<string> {
  if (currentBlobKey) {
    await deleteBlob(currentBlobKey).catch(() => undefined)
  }

  if (currentUrl) {
    URL.revokeObjectURL(currentUrl)
  }

  const persisted = await trySaveBlob(nextBlobKey, blob)

  if (!persisted) {
    console.warn("[KOZA] Bible image generated without IndexedDB persistence")
  }

  return URL.createObjectURL(blob)
}

function PlaceholderImage({ icon }: { icon: React.ReactNode }) {
  return (
    <div className="flex aspect-square w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(229,197,115,0.18),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] text-white/35">
      {icon}
    </div>
  )
}

function PrimaryImage({
  src,
  alt,
  badge,
  placeholder,
  generating,
  editing,
  onGenerate,
  onUpload,
  onEdit,
  onDoubleClick,
}: {
  src: string | null
  alt: string
  badge?: string
  placeholder: React.ReactNode
  generating: boolean
  editing?: boolean
  onGenerate: () => void
  onUpload: () => void
  onEdit?: () => void
  onDoubleClick?: () => void
}) {
  return (
    <div className="group/image relative overflow-hidden rounded-xl border border-white/8 bg-white/3">
      <div className="relative aspect-square w-full" onDoubleClick={src ? onDoubleClick : undefined}>
        {src ? (
          <Image src={src} alt={alt} fill unoptimized className="object-cover" />
        ) : (
          <PlaceholderImage icon={placeholder} />
        )}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgba(8,10,15,0.68)_100%)]" />
        {badge ? (
          <div className="absolute left-3 top-3 rounded-full border border-[#D4A853]/35 bg-[#D4A853]/12 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#E8D7B2]">
            {badge}
          </div>
        ) : null}
        {/* Edit pencil — bottom left */}
        {src && onEdit && !generating && !editing ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit() }}
            className="absolute bottom-2 left-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-black/50 text-white/70 opacity-0 backdrop-blur-sm transition-all hover:bg-[#D4A853]/20 hover:text-[#D4A853] group-hover/image:opacity-100"
            title="Smart Edit"
          >
            <Pencil className="h-3 w-3" />
          </button>
        ) : null}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/55 opacity-0 transition-opacity duration-200 group-hover/image:opacity-100">
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-white transition-colors hover:bg-white/15 disabled:opacity-60"
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            Generate
          </button>
          <button
            type="button"
            onClick={onUpload}
            disabled={generating}
            className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-white transition-colors hover:bg-white/15 disabled:opacity-60"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload
          </button>
        </div>
        {generating || editing ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function EditableTextArea({
  value,
  placeholder,
  rows,
  className,
  onSave,
}: {
  value: string
  placeholder: string
  rows: number
  className?: string
  onSave: (nextValue: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  if (editing) {
    return (
      <textarea
        autoFocus
        rows={rows}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          setEditing(false)
          if (draft !== value) {
            onSave(draft)
          }
        }}
        className={`w-full resize-none rounded-lg border border-white/10 bg-white/4 px-2.5 py-2 text-[12px] leading-5 text-white outline-none placeholder:text-white/20 ${className ?? ""}`}
        placeholder={placeholder}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`w-full rounded-lg border border-transparent bg-transparent px-0 py-0 text-left text-[12px] leading-5 text-white/78 transition-colors hover:text-white ${className ?? ""}`}
    >
      {value ? value : <span className="text-white/20">{placeholder}</span>}
    </button>
  )
}

function ReferenceStrip({
  references,
  canonicalImageId,
  onAdd,
  onSetCanonical,
  onRemove,
}: {
  references: BibleReferenceImage[]
  canonicalImageId: string | null
  onAdd: (files: File[]) => void
  onSetCanonical: (reference: BibleReferenceImage) => void
  onRemove: (reference: BibleReferenceImage) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const atLimit = references.length >= 4

  return (
    <div>
      <p className="mb-2 text-[9px] uppercase tracking-[0.18em] text-white/30">References</p>
      <div className="flex flex-wrap gap-2">
        {references.map((reference) => (
          <div key={reference.id} className={`group relative h-12 w-12 overflow-hidden rounded-md border ${canonicalImageId === reference.id ? "border-[#D4A853]" : "border-white/10"}`}>
            <Image src={reference.url} alt="Reference" fill unoptimized className="object-cover" />
            <button
              type="button"
              onClick={() => onSetCanonical(reference)}
              className={`absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[8px] uppercase tracking-[0.16em] ${canonicalImageId === reference.id ? "bg-[#D4A853] text-black" : "bg-black/60 text-white/80 opacity-0 transition-opacity duration-200 group-hover:opacity-100"}`}
              aria-label="Set canonical reference"
            >
              {canonicalImageId === reference.id ? "Anchor" : "Set"}
            </button>
            <button
              type="button"
              onClick={() => onRemove(reference)}
              className="absolute inset-0 flex items-center justify-center bg-black/60 pt-4 text-xs text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              aria-label="Remove reference"
            >
              ×
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={atLimit}
          className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-white/15 text-white/45 transition-colors hover:border-white/25 hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Add reference"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            if (files.length > 0) {
              onAdd(files)
            }
            event.target.value = ""
          }}
        />
      </div>
    </div>
  )
}

const VOICE_PROVIDERS: { id: VoiceProvider; label: string }[] = [
  { id: "elevenlabs", label: "ElevenLabs" },
  { id: "fish", label: "Fish Audio" },
  { id: "bark", label: "Bark" },
  { id: "custom", label: "Custom" },
]

function VoiceSection({
  voice,
  characterName,
  onUpdate,
}: {
  voice?: VoiceConfig
  characterName: string
  onUpdate: (voice: VoiceConfig | undefined) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const handlePlay = () => {
    if (!voice?.previewUrl) return
    if (playing && audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setPlaying(false)
      return
    }
    const audio = new Audio(voice.previewUrl)
    audioRef.current = audio
    audio.onended = () => setPlaying(false)
    audio.play()
    setPlaying(true)
  }

  if (!voice && !expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          onUpdate({ provider: "elevenlabs", voiceId: "", voiceName: "", settings: { speed: 1.0 } })
          setExpanded(true)
        }}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed border-white/10 px-3 py-2 text-[11px] text-white/30 transition-colors hover:border-white/20 hover:text-white/50"
      >
        <Mic className="h-3.5 w-3.5" />
        Назначить голос
      </button>
    )
  }

  const current = voice ?? { provider: "elevenlabs" as VoiceProvider, voiceId: "", voiceName: "", settings: { speed: 1.0 } }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Volume2 className="h-3.5 w-3.5 text-violet-400/70" />
          <span className="text-[9px] uppercase tracking-[0.18em] text-white/30">Voice</span>
          {voice?.voiceName && (
            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300/80">
              {voice.voiceName}
            </span>
          )}
        </div>
        <ChevronDown className={`h-3 w-3 text-white/25 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="space-y-2 rounded-lg border border-white/6 bg-white/2 p-3">
          {/* Provider */}
          <div>
            <p className="mb-1 text-[9px] uppercase tracking-[0.16em] text-white/25">Провайдер</p>
            <div className="flex flex-wrap gap-1.5">
              {VOICE_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onUpdate({ ...current, provider: p.id })}
                  className={`rounded-md px-2 py-1 text-[10px] transition-colors ${
                    current.provider === p.id
                      ? "bg-violet-500/20 text-violet-300"
                      : "bg-white/4 text-white/40 hover:bg-white/8"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Voice ID + Name */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-[9px] uppercase tracking-[0.16em] text-white/25">Voice ID</p>
              <input
                type="text"
                value={current.voiceId}
                onChange={(e) => onUpdate({ ...current, voiceId: e.target.value })}
                placeholder="ID голоса..."
                className="w-full rounded-md border border-white/8 bg-white/4 px-2 py-1.5 text-[11px] text-white/80 outline-none placeholder:text-white/15"
              />
            </div>
            <div>
              <p className="mb-1 text-[9px] uppercase tracking-[0.16em] text-white/25">Название</p>
              <input
                type="text"
                value={current.voiceName}
                onChange={(e) => onUpdate({ ...current, voiceName: e.target.value })}
                placeholder="Adam, Bella..."
                className="w-full rounded-md border border-white/8 bg-white/4 px-2 py-1.5 text-[11px] text-white/80 outline-none placeholder:text-white/15"
              />
            </div>
          </div>

          {/* Speed slider */}
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[9px] uppercase tracking-[0.16em] text-white/25">Скорость</p>
              <span className="text-[10px] text-white/35">{(current.settings?.speed ?? 1.0).toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={current.settings?.speed ?? 1.0}
              onChange={(e) =>
                onUpdate({ ...current, settings: { ...current.settings, speed: parseFloat(e.target.value) } })
              }
              className="mt-1 w-full accent-violet-500"
            />
          </div>

          {/* Preview URL */}
          <div>
            <p className="mb-1 text-[9px] uppercase tracking-[0.16em] text-white/25">Preview URL</p>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={current.previewUrl ?? ""}
                onChange={(e) => onUpdate({ ...current, previewUrl: e.target.value || undefined })}
                placeholder="https://..."
                className="flex-1 rounded-md border border-white/8 bg-white/4 px-2 py-1.5 text-[11px] text-white/80 outline-none placeholder:text-white/15"
              />
              {current.previewUrl && (
                <button
                  type="button"
                  onClick={handlePlay}
                  className="flex items-center justify-center rounded-md border border-white/8 bg-white/4 px-2 text-white/50 transition-colors hover:bg-white/8 hover:text-white/80"
                >
                  {playing ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                </button>
              )}
            </div>
          </div>

          {/* Remove voice */}
          <button
            type="button"
            onClick={() => {
              onUpdate(undefined)
              setExpanded(false)
            }}
            className="mt-1 text-[10px] text-red-400/50 transition-colors hover:text-red-400/80"
          >
            Убрать голос
          </button>
        </div>
      )}
    </div>
  )
}

function CharacterCard({
  entry,
  generating,
  sceneIndexMap,
  onUpdate,
  onGenerate,
  onSetCanonicalPrimary,
  onUploadPrimary,
  onAddReferences,
  onSetCanonicalReference,
  onRemoveReference,
  onEdit,
  onDoubleClick,
  editingThis,
}: {
  entry: CharacterEntry
  generating: boolean
  sceneIndexMap: Map<string, number>
  onUpdate: (patch: Partial<CharacterEntry>) => void
  onGenerate: () => void
  onSetCanonicalPrimary: () => void
  onUploadPrimary: (file: File) => void
  onAddReferences: (files: File[]) => void
  onSetCanonicalReference: (reference: BibleReferenceImage) => void
  onRemoveReference: (reference: BibleReferenceImage) => void
  onEdit: () => void
  onDoubleClick: () => void
  editingThis: boolean
}) {
  const primaryInputRef = useRef<HTMLInputElement>(null)

  return (
    <article className="w-full max-w-70 rounded-xl border border-white/8 bg-white/2 p-3 transition-all duration-200 hover:bg-white/4">
      <PrimaryImage
        src={entry.generatedPortraitUrl}
        alt={entry.name}
        placeholder={<User className="h-12 w-12" />}
        generating={generating}
        editing={editingThis}
        onGenerate={onGenerate}
        onEdit={onEdit}
        onDoubleClick={onDoubleClick}
        onUpload={() => primaryInputRef.current?.click()}
      />

      <input
        ref={primaryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            onUploadPrimary(file)
          }
          event.target.value = ""
        }}
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-[0.18em] text-white/35">Primary portrait</span>
        <button
          type="button"
          onClick={onSetCanonicalPrimary}
          className={`rounded-full px-2 py-1 text-[9px] uppercase tracking-[0.16em] ${entry.canonicalImageId === GENERATED_CANONICAL_IMAGE_ID ? "bg-[#D4A853] text-black" : "border border-white/10 text-white/60 hover:bg-white/6"}`}
        >
          {entry.canonicalImageId === GENERATED_CANONICAL_IMAGE_ID ? "Canonical" : "Use as anchor"}
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <h2 className="text-[14px] font-bold uppercase tracking-[0.14em] text-white">{entry.name}</h2>
          <p className="mt-1 text-[10px] text-white/40">{formatLineCount(entry.dialogueCount)}</p>
          <div className="mt-1.5">
            <SceneBadges sceneIds={entry.sceneIds} sceneIndexMap={sceneIndexMap} />
          </div>
        </div>

        <EditableTextArea
          value={entry.description}
          placeholder="Add description..."
          rows={3}
          onSave={(description) => onUpdate({ description })}
        />

        <div>
          <p className="mb-1 text-[9px] uppercase tracking-[0.18em] text-white/30">Visual prompt (EN)</p>
          <EditableTextArea
            value={entry.appearancePrompt}
            placeholder="Describe appearance in English..."
            rows={2}
            onSave={(appearancePrompt) => onUpdate({ appearancePrompt })}
          />
        </div>

        <VoiceSection
          voice={entry.voice}
          characterName={entry.name}
          onUpdate={(voice) => onUpdate({ voice })}
        />

        <ReferenceStrip
          references={entry.referenceImages}
          canonicalImageId={entry.canonicalImageId}
          onAdd={onAddReferences}
          onSetCanonical={onSetCanonicalReference}
          onRemove={onRemoveReference}
        />
      </div>
    </article>
  )
}

function LocationCard({
  entry,
  generating,
  sceneIndexMap,
  onUpdate,
  onGenerate,
  onSetCanonicalPrimary,
  onUploadPrimary,
  onAddReferences,
  onSetCanonicalReference,
  onRemoveReference,
  onEdit,
  onDoubleClick,
  editingThis,
}: {
  entry: LocationEntry
  generating: boolean
  sceneIndexMap: Map<string, number>
  onUpdate: (patch: Partial<LocationEntry>) => void
  onGenerate: () => void
  onSetCanonicalPrimary: () => void
  onUploadPrimary: (file: File) => void
  onAddReferences: (files: File[]) => void
  onSetCanonicalReference: (reference: BibleReferenceImage) => void
  onRemoveReference: (reference: BibleReferenceImage) => void
  onEdit: () => void
  onDoubleClick: () => void
  editingThis: boolean
}) {
  const primaryInputRef = useRef<HTMLInputElement>(null)

  return (
    <article className="w-full max-w-70 rounded-xl border border-white/8 bg-white/2 p-3 transition-all duration-200 hover:bg-white/4">
      <PrimaryImage
        src={entry.generatedImageUrl}
        editing={editingThis}
        onEdit={onEdit}
        onDoubleClick={onDoubleClick}
        alt={entry.name}
        badge={entry.intExt}
        placeholder={<MapPin className="h-12 w-12" />}
        generating={generating}
        onGenerate={onGenerate}
        onUpload={() => primaryInputRef.current?.click()}
      />

      <input
        ref={primaryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            onUploadPrimary(file)
          }
          event.target.value = ""
        }}
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-[0.18em] text-white/35">Primary location</span>
        <button
          type="button"
          onClick={onSetCanonicalPrimary}
          className={`rounded-full px-2 py-1 text-[9px] uppercase tracking-[0.16em] ${entry.canonicalImageId === GENERATED_CANONICAL_IMAGE_ID ? "bg-[#D4A853] text-black" : "border border-white/10 text-white/60 hover:bg-white/6"}`}
        >
          {entry.canonicalImageId === GENERATED_CANONICAL_IMAGE_ID ? "Canonical" : "Use as anchor"}
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <h2 className="text-[14px] font-bold uppercase tracking-[0.14em] text-white">{entry.name}</h2>
          <div className="mt-1.5">
            <SceneBadges sceneIds={entry.sceneIds} sceneIndexMap={sceneIndexMap} />
          </div>
        </div>

        <EditableTextArea
          value={entry.description}
          placeholder="Add description..."
          rows={3}
          onSave={(description) => onUpdate({ description })}
        />

        <div>
          <p className="mb-1 text-[9px] uppercase tracking-[0.18em] text-white/30">Visual prompt (EN)</p>
          <EditableTextArea
            value={entry.appearancePrompt}
            placeholder="Describe location in English..."
            rows={2}
            onSave={(appearancePrompt) => onUpdate({ appearancePrompt })}
          />
        </div>

        <ReferenceStrip
          references={entry.referenceImages}
          canonicalImageId={entry.canonicalImageId}
          onAdd={onAddReferences}
          onSetCanonical={onSetCanonicalReference}
          onRemove={onRemoveReference}
        />
      </div>
    </article>
  )
}

interface PropSuggestion {
  name: string
  description: string
  appearancePrompt: string
  reason: string
  sourceScenes: string[]
}

/** Read a streamed response body into a single string */
async function readStreamToString(res: Response): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ""
  const chunks: string[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(new TextDecoder().decode(value))
  }
  return chunks.join("").trim()
}

/** Extract JSON object or array from possible markdown-wrapped response */
function extractJson(raw: string): unknown | null {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()
  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objMatch) { try { return JSON.parse(objMatch[0]) } catch { /* ignore */ } }
  const arrMatch = cleaned.match(/\[[\s\S]*\]/)
  if (arrMatch) { try { return JSON.parse(arrMatch[0]) } catch { /* ignore */ } }
  return null
}

interface SmartScanResult {
  characters: { id: string; description: string; appearancePrompt: string }[]
  locations: { id: string; description: string; appearancePrompt: string }[]
  props: { id: string; description: string; appearancePrompt: string }[]
  newProps: PropSuggestion[]
}

/**
 * Universal Smart Scan — analyses the full screenplay and fills empty
 * description + appearancePrompt for characters, locations, props and discovers new props.
 */
async function smartScanAll(
  scenarioText: string,
  characters: { id: string; name: string; description: string; appearancePrompt: string }[],
  locations: { id: string; name: string; description: string; appearancePrompt: string }[],
  existingProps: { id: string; name: string; description: string; appearancePrompt: string }[],
): Promise<SmartScanResult> {
  const charsToFill = characters.map((c) => ({
    id: c.id,
    name: c.name,
    needsDescription: !c.description.trim(),
    needsPrompt: !c.appearancePrompt.trim(),
  }))

  const locsToFill = locations.map((l) => ({
    id: l.id,
    name: l.name,
    needsDescription: !l.description.trim(),
    needsPrompt: !l.appearancePrompt.trim(),
  }))

  const propsToFill = existingProps.map((p) => ({
    id: p.id,
    name: p.name,
    needsDescription: !p.description.trim(),
    needsPrompt: !p.appearancePrompt.trim(),
  }))

  const existingPropNames = existingProps.map((p) => p.name)

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{
        role: "user",
        content: `Ты — ассистент-библиограф кинопроекта. Проанализируй сценарий и заполни пустые поля.

СЦЕНАРИЙ:
${scenarioText.slice(0, 8000)}

═══ ЗАДАЧА 1: ПЕРСОНАЖИ ═══
Для каждого персонажа заполни description (кто он, роль в истории, 1-2 предложения) и appearancePrompt (визуальное описание для генерации портрета на АНГЛИЙСКОМ, 20-40 слов: возраст, телосложение, лицо, одежда, освещение).

Персонажи: ${JSON.stringify(charsToFill)}

═══ ЗАДАЧА 2: ЛОКАЦИИ ═══
Для каждой локации заполни description (что это за место, атмосфера, 1-2 предложения) и appearancePrompt (визуальное описание для генерации на АНГЛИЙСКОМ, 20-40 слов: архитектура, свет, детали).

Локации: ${JSON.stringify(locsToFill)}

═══ ЗАДАЧА 3: СУЩЕСТВУЮЩИЕ ПРЕДМЕТЫ РЕКВИЗИТА ═══
Заполни пустые поля для существующих предметов. description — что это, зачем в сцене (рус). appearancePrompt — визуальное описание предмета для генерации изображения на АНГЛИЙСКОМ (20-30 слов: материал, цвет, состояние, размер, окружение, освещение).

Предметы: ${JSON.stringify(propsToFill)}

═══ ЗАДАЧА 4: НОВЫЕ ПРЕДМЕТЫ РЕКВИЗИТА ═══
Найди важные предметы из контекста сценария. Уже есть: ${existingPropNames.join(", ") || "нет"}

Верни ТОЛЬКО JSON (без markdown):
{
  "characters": [{ "id": "...", "description": "рус", "appearancePrompt": "eng" }],
  "locations": [{ "id": "...", "description": "рус", "appearancePrompt": "eng" }],
  "props": [{ "id": "...", "description": "рус", "appearancePrompt": "eng" }],
  "newProps": [{ "name": "рус", "description": "рус", "appearancePrompt": "eng visual description for image generation", "reason": "контекст", "sourceScenes": [] }]
}

Правила:
- Если needsDescription=false, верни пустую строку "" для description
- Если needsPrompt=false, верни пустую строку "" для appearancePrompt
- Заполняй ТОЛЬКО пустые поля, не перезаписывай существующие
- ВСЕ appearancePrompt — на АНГЛИЙСКОМ (для генерации изображений)
- description — на РУССКОМ`,
      }],
      temperature: 0.3,
    }),
  })

  if (!res.ok) return { characters: [], locations: [], props: [], newProps: [] }

  const raw = await readStreamToString(res)
  const parsed = extractJson(raw) as SmartScanResult | null
  if (!parsed) return { characters: [], locations: [], props: [], newProps: [] }

  return {
    characters: Array.isArray(parsed.characters) ? parsed.characters : [],
    locations: Array.isArray(parsed.locations) ? parsed.locations : [],
    props: Array.isArray(parsed.props) ? parsed.props : [],
    newProps: Array.isArray(parsed.newProps) ? parsed.newProps : [],
  }
}

function SuggestionCard({
  suggestion,
  onAccept,
  onDismiss,
}: {
  suggestion: PropSuggestion
  onAccept: () => void
  onDismiss: () => void
}) {
  return (
    <article className="rounded-xl border border-dashed border-[#D4A853]/30 bg-[#D4A853]/4 p-3 transition-all duration-200">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#D4A853]/15">
            <Sparkles className="h-4 w-4 text-[#D4A853]" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[#E8D7B2]">{suggestion.name}</h3>
            <p className="text-[10px] text-white/30">{suggestion.sourceScenes.length} {suggestion.sourceScenes.length === 1 ? "сцена" : "сцен"}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onAccept}
            className="inline-flex items-center gap-1 rounded-full border border-[#D4A853]/30 bg-[#D4A853]/10 px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-[#D4A853] transition-colors hover:bg-[#D4A853]/20"
          >
            <Check className="h-3 w-3" />
            Добавить
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/4 px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-white/50 transition-colors hover:bg-white/8"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      <p className="text-[11px] leading-4 text-white/50">{suggestion.description}</p>
      <p className="mt-1 text-[10px] italic text-[#D4A853]/40">{suggestion.reason}</p>
      {suggestion.appearancePrompt ? (
        <p className="mt-1 text-[10px] text-white/30">Prompt: {suggestion.appearancePrompt}</p>
      ) : null}
    </article>
  )
}

function SceneBadges({ sceneIds, sceneIndexMap }: { sceneIds: string[]; sceneIndexMap: Map<string, number> }) {
  const sorted = sceneIds
    .map((id) => sceneIndexMap.get(id))
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b)

  if (sorted.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1">
      {sorted.map((n) => (
        <span key={n} className="rounded bg-white/6 px-1.5 py-0.5 text-[9px] tabular-nums text-white/35">
          S{n}
        </span>
      ))}
    </div>
  )
}

function PropCard({
  entry,
  generating,
  sceneIndexMap,
  onUpdate,
  onGenerate,
  onSetCanonicalPrimary,
  onUploadPrimary,
  onAddReferences,
  onSetCanonicalReference,
  onRemoveReference,
  onEdit,
  onDoubleClick,
  editingThis,
}: {
  entry: PropEntry
  generating: boolean
  sceneIndexMap: Map<string, number>
  onUpdate: (patch: Partial<PropEntry>) => void
  onGenerate: () => void
  onSetCanonicalPrimary: () => void
  onUploadPrimary: (file: File) => void
  onAddReferences: (files: File[]) => void
  onSetCanonicalReference: (reference: BibleReferenceImage) => void
  onRemoveReference: (reference: BibleReferenceImage) => void
  onEdit: () => void
  onDoubleClick: () => void
  editingThis: boolean
}) {
  const primaryInputRef = useRef<HTMLInputElement>(null)

  return (
    <article className="w-full max-w-70 rounded-xl border border-white/8 bg-white/2 p-3 transition-all duration-200 hover:bg-white/4">
      <PrimaryImage
        src={entry.generatedImageUrl}
        alt={entry.name}
        placeholder={<Box className="h-12 w-12" />}
        generating={generating}
        editing={editingThis}
        onGenerate={onGenerate}
        onEdit={onEdit}
        onDoubleClick={onDoubleClick}
        onUpload={() => primaryInputRef.current?.click()}
      />

      <input
        ref={primaryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            onUploadPrimary(file)
          }
          event.target.value = ""
        }}
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-[0.18em] text-white/35">Primary image</span>
        <button
          type="button"
          onClick={onSetCanonicalPrimary}
          className={`rounded-full px-2 py-1 text-[9px] uppercase tracking-[0.16em] ${entry.canonicalImageId === GENERATED_CANONICAL_IMAGE_ID ? "bg-[#D4A853] text-black" : "border border-white/10 text-white/60 hover:bg-white/6"}`}
        >
          {entry.canonicalImageId === GENERATED_CANONICAL_IMAGE_ID ? "Canonical" : "Use as anchor"}
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <h2 className="text-[14px] font-bold uppercase tracking-[0.14em] text-white">{entry.name}</h2>
          <div className="mt-1.5">
            <SceneBadges sceneIds={entry.sceneIds} sceneIndexMap={sceneIndexMap} />
          </div>
        </div>

        <div>
          <p className="mb-1 text-[9px] uppercase tracking-[0.18em] text-white/30">Visual prompt (EN)</p>
          <EditableTextArea
            value={entry.appearancePrompt}
            placeholder="Describe prop appearance in English..."
            rows={2}
            onSave={(appearancePrompt) => onUpdate({ appearancePrompt })}
          />
        </div>

        <ReferenceStrip
          references={entry.referenceImages}
          canonicalImageId={entry.canonicalImageId}
          onAdd={onAddReferences}
          onSetCanonical={onSetCanonicalReference}
          onRemove={onRemoveReference}
        />

        {entry.description ? (
          <div>
            <p className="mb-1 text-[9px] uppercase tracking-[0.18em] text-white/30">Упоминания в сценарии</p>
            <p className="text-[11px] leading-4 text-white/30">{entry.description}</p>
          </div>
        ) : null}
      </div>
    </article>
  )
}

export default function BiblePage() {
  const activeTab = useNavigationStore((s) => s.bibleTab)
  const setActiveTab = useNavigationStore((s) => s.setBibleTab)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [suggestions, setSuggestions] = useState<PropSuggestion[]>([])

  // Edit overlay state
  const [editOverlayTarget, setEditOverlayTarget] = useState<{ id: string; type: "char" | "loc" | "prop"; src: string } | null>(null)

  // Lightbox state
  const [lightbox, setLightbox] = useState<{ src: string; id: string; type: "char" | "loc" | "prop" } | null>(null)
  const [lbTransform, setLbTransform] = useState({ flipH: false, flipV: false, rotate: 0 })
  const blocks = useScriptStore((state) => state.blocks)
  const characters = useBibleStore((state) => state.characters)
  const locations = useBibleStore((state) => state.locations)
  const props = useBibleStore((state) => state.props)
  const storyHistory = useBibleStore((state) => state.storyHistory)
  const directorVision = useBibleStore((state) => state.directorVision)
  const updateFromScreenplay = useBibleStore((state) => state.updateFromScreenplay)
  const updateCharacter = useBibleStore((state) => state.updateCharacter)
  const updateLocation = useBibleStore((state) => state.updateLocation)
  const updateProp = useBibleStore((state) => state.updateProp)
  const addProp = useBibleStore((state) => state.addProp)
  const removeUnusedEntries = useBibleStore((state) => state.removeUnusedEntries)
  const updateStoryHistory = useBibleStore((state) => state.updateStoryHistory)
  const updateDirectorVision = useBibleStore((state) => state.updateDirectorVision)
  const ambientPrompt = useBibleStore((state) => state.ambientPrompt)
  const updateAmbientPrompt = useBibleStore((state) => state.updateAmbientPrompt)
  const selectedImageGenModel = useBoardStore((state) => state.selectedImageGenModel)
  const setSelectedImageGenModel = useBoardStore((state) => state.setSelectedImageGenModel)
  const projectStyle = useBoardStore((state) => state.projectStyle)
  const setProjectStyle = useBoardStore((state) => state.setProjectStyle)

  const scenes = useMemo(() => parseScenes(blocks), [blocks])

  const sceneIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const scene of scenes) {
      map.set(scene.id, scene.index)
    }
    return map
  }, [scenes])

  const firstSceneIndex = useCallback((sceneIds: string[]) => {
    let min = Infinity
    for (const id of sceneIds) {
      const idx = sceneIndexMap.get(id)
      if (idx != null && idx < min) min = idx
    }
    return min === Infinity ? 9999 : min
  }, [sceneIndexMap])

  const sortedCharacters = useMemo(() =>
    [...characters].sort((a, b) => firstSceneIndex(a.sceneIds) - firstSceneIndex(b.sceneIds)),
    [characters, firstSceneIndex],
  )

  const sortedLocations = useMemo(() =>
    [...locations].sort((a, b) => firstSceneIndex(a.sceneIds) - firstSceneIndex(b.sceneIds)),
    [locations, firstSceneIndex],
  )

  const sortedProps = useMemo(() =>
    [...props].sort((a, b) => firstSceneIndex(a.sceneIds) - firstSceneIndex(b.sceneIds)),
    [props, firstSceneIndex],
  )

  useEffect(() => {
    updateFromScreenplay(blocks, scenes)
  }, [blocks, scenes, updateFromScreenplay])

  const handleCharacterGenerate = async (character: CharacterEntry) => {
    setGeneratingId(character.id)
    try {
      const model = selectedImageGenModel || "nano-banana-2"
      const translated = model === "gpt-image" && character.appearancePrompt.trim()
        ? await translateToEnglish(character.appearancePrompt)
        : undefined
      // Only use user-uploaded references (not previous generations) so prompt changes take effect
      const userRefs = getCharacterGenerationReferenceImages(character)
        .filter((ref) => ref.id !== "__generated_primary__")
      const prompt = buildCharacterPrompt(
        { ...character, referenceImages: character.referenceImages },
        projectStyle,
        translated,
      )
      const referenceImages = await convertReferenceImagesToDataUrls(userRefs)
      const resBlob = await generateBibleImage(prompt, model, referenceImages)
      const blobKey = `bible-char-${character.id}-${Date.now()}`
      const url = await replaceBlobImage(character.generatedPortraitUrl, character.portraitBlobKey, blobKey, resBlob)

      updateCharacter(character.id, {
        canonicalImageId: character.canonicalImageId ?? GENERATED_CANONICAL_IMAGE_ID,
        generatedPortraitUrl: url,
        portraitBlobKey: blobKey,
      })
    } catch (err) {
      console.error("Portrait generation error:", err)
    } finally {
      setGeneratingId(null)
    }
  }

  const handleLocationGenerate = async (location: LocationEntry) => {
    setGeneratingId(location.id)
    try {
      const model = selectedImageGenModel || "nano-banana-2"
      const translated = model === "gpt-image"
        ? await translateToEnglish(location.appearancePrompt || location.name)
        : undefined
      const prompt = buildLocationPrompt(location, projectStyle, translated)
      const userRefs = getLocationGenerationReferenceImages(location)
        .filter((ref) => ref.id !== "__generated_primary__")
      const referenceImages = await convertReferenceImagesToDataUrls(userRefs)
      const blob = await generateBibleImage(prompt, model, referenceImages)
      const blobKey = `bible-location-${location.id}-${Date.now()}`
      const url = await replaceBlobImage(location.generatedImageUrl, location.imageBlobKey, blobKey, blob)

      updateLocation(location.id, {
        canonicalImageId: location.canonicalImageId ?? GENERATED_CANONICAL_IMAGE_ID,
        generatedImageUrl: url,
        imageBlobKey: blobKey,
      })
    } catch (err) {
      console.error("Location generation error:", err)
    } finally {
      setGeneratingId(null)
    }
  }

  const handleCharacterPrimaryUpload = async (character: CharacterEntry, file: File) => {
    const blobKey = `bible-char-${character.id}-${Date.now()}`
    const url = await replaceBlobImage(character.generatedPortraitUrl, character.portraitBlobKey, blobKey, file)
    updateCharacter(character.id, {
      canonicalImageId: character.canonicalImageId ?? GENERATED_CANONICAL_IMAGE_ID,
      generatedPortraitUrl: url,
      portraitBlobKey: blobKey,
    })
  }

  const handleLocationPrimaryUpload = async (location: LocationEntry, file: File) => {
    const blobKey = `bible-location-${location.id}-${Date.now()}`
    const url = await replaceBlobImage(location.generatedImageUrl, location.imageBlobKey, blobKey, file)
    updateLocation(location.id, {
      canonicalImageId: location.canonicalImageId ?? GENERATED_CANONICAL_IMAGE_ID,
      generatedImageUrl: url,
      imageBlobKey: blobKey,
    })
  }

  const handleCharacterReferenceAdd = async (character: CharacterEntry, files: File[]) => {
    const remainingSlots = Math.max(0, 4 - character.referenceImages.length)
    const nextFiles = files.slice(0, remainingSlots)
    const newReferences = await Promise.all(nextFiles.map(async (file, index) => {
      const blobKey = `bible-ref-${character.id}-${Date.now()}-${index}`
      await saveBlob(blobKey, file)
      return {
        id: blobKey,
        url: URL.createObjectURL(file),
        blobKey,
      }
    }))

    updateCharacter(character.id, {
      canonicalImageId: character.canonicalImageId
        ?? (character.generatedPortraitUrl ? GENERATED_CANONICAL_IMAGE_ID : newReferences[0]?.id ?? null),
      referenceImages: [...character.referenceImages, ...newReferences],
    })
  }

  const handleLocationReferenceAdd = async (location: LocationEntry, files: File[]) => {
    const remainingSlots = Math.max(0, 4 - location.referenceImages.length)
    const nextFiles = files.slice(0, remainingSlots)
    const newReferences = await Promise.all(nextFiles.map(async (file, index) => {
      const blobKey = `bible-ref-${location.id}-${Date.now()}-${index}`
      await saveBlob(blobKey, file)
      return {
        id: blobKey,
        url: URL.createObjectURL(file),
        blobKey,
      }
    }))

    updateLocation(location.id, {
      canonicalImageId: location.canonicalImageId
        ?? (location.generatedImageUrl ? GENERATED_CANONICAL_IMAGE_ID : newReferences[0]?.id ?? null),
      referenceImages: [...location.referenceImages, ...newReferences],
    })
  }

  const handleCharacterReferenceRemove = async (character: CharacterEntry, reference: BibleReferenceImage) => {
    await deleteBlob(reference.blobKey).catch(() => undefined)
    URL.revokeObjectURL(reference.url)
    const nextReferences = character.referenceImages.filter((item) => item.id !== reference.id)
    updateCharacter(character.id, {
      canonicalImageId: character.canonicalImageId === reference.id
        ? (character.generatedPortraitUrl ? GENERATED_CANONICAL_IMAGE_ID : nextReferences[0]?.id ?? null)
        : character.canonicalImageId,
      referenceImages: nextReferences,
    })
  }

  const handleLocationReferenceRemove = async (location: LocationEntry, reference: BibleReferenceImage) => {
    await deleteBlob(reference.blobKey).catch(() => undefined)
    URL.revokeObjectURL(reference.url)
    const nextReferences = location.referenceImages.filter((item) => item.id !== reference.id)
    updateLocation(location.id, {
      canonicalImageId: location.canonicalImageId === reference.id
        ? (location.generatedImageUrl ? GENERATED_CANONICAL_IMAGE_ID : nextReferences[0]?.id ?? null)
        : location.canonicalImageId,
      referenceImages: nextReferences,
    })
  }

  const handlePropGenerate = async (prop: PropEntry) => {
    setGeneratingId(prop.id)
    try {
      const model = selectedImageGenModel || "nano-banana-2"
      const needsTranslation = model === "gpt-image"
      const translated = needsTranslation ? await translateToEnglish(prop.appearancePrompt || prop.name) : undefined
      const prompt = buildPropPrompt(prop, projectStyle, translated)
      const userRefs = getPropGenerationReferenceImages(prop)
        .filter((ref) => ref.id !== "__generated_primary__")
      const referenceImages = await convertReferenceImagesToDataUrls(userRefs)
      const blob = await generateBibleImage(prompt, selectedImageGenModel || "nano-banana-2", referenceImages)
      const blobKey = `bible-prop-${prop.id}-${Date.now()}`
      const url = await replaceBlobImage(prop.generatedImageUrl, prop.imageBlobKey, blobKey, blob)

      updateProp(prop.id, {
        canonicalImageId: prop.canonicalImageId ?? GENERATED_CANONICAL_IMAGE_ID,
        generatedImageUrl: url,
        imageBlobKey: blobKey,
      })
    } catch (err) {
      console.error("Prop generation error:", err)
    } finally {
      setGeneratingId(null)
    }
  }

  const handlePropPrimaryUpload = async (prop: PropEntry, file: File) => {
    const blobKey = `bible-prop-${prop.id}-${Date.now()}`
    const url = await replaceBlobImage(prop.generatedImageUrl, prop.imageBlobKey, blobKey, file)
    updateProp(prop.id, {
      canonicalImageId: prop.canonicalImageId ?? GENERATED_CANONICAL_IMAGE_ID,
      generatedImageUrl: url,
      imageBlobKey: blobKey,
    })
  }

  const handlePropReferenceAdd = async (prop: PropEntry, files: File[]) => {
    const remainingSlots = Math.max(0, 4 - prop.referenceImages.length)
    const nextFiles = files.slice(0, remainingSlots)
    const newReferences = await Promise.all(nextFiles.map(async (file, index) => {
      const blobKey = `bible-ref-prop-${prop.id}-${Date.now()}-${index}`
      await saveBlob(blobKey, file)
      return {
        id: blobKey,
        url: URL.createObjectURL(file),
        blobKey,
      }
    }))

    updateProp(prop.id, {
      canonicalImageId: prop.canonicalImageId
        ?? (prop.generatedImageUrl ? GENERATED_CANONICAL_IMAGE_ID : newReferences[0]?.id ?? null),
      referenceImages: [...prop.referenceImages, ...newReferences],
    })
  }

  const handlePropReferenceRemove = async (prop: PropEntry, reference: BibleReferenceImage) => {
    await deleteBlob(reference.blobKey).catch(() => undefined)
    URL.revokeObjectURL(reference.url)
    const nextReferences = prop.referenceImages.filter((item) => item.id !== reference.id)
    updateProp(prop.id, {
      canonicalImageId: prop.canonicalImageId === reference.id
        ? (prop.generatedImageUrl ? GENERATED_CANONICAL_IMAGE_ID : nextReferences[0]?.id ?? null)
        : prop.canonicalImageId,
      referenceImages: nextReferences,
    })
  }

  const [scanStats, setScanStats] = useState<{ chars: number; locs: number; props: number } | null>(null)
  const [cleanupStats, setCleanupStats] = useState<{ chars: number; locs: number; props: number } | null>(null)

  const unusedCount = useMemo(() => {
    const chars = characters.filter((c) => c.sceneIds.length === 0 && c.dialogueCount === 0).length
    const locs = locations.filter((l) => l.sceneIds.length === 0).length
    const prps = props.filter((p) => p.sceneIds.length === 0).length
    return chars + locs + prps
  }, [characters, locations, props])

  const handleCleanup = () => {
    const removed = removeUnusedEntries()
    setCleanupStats(removed)
    setTimeout(() => setCleanupStats(null), 4000)
  }

  const handleSmartScan = async () => {
    setScanning(true)
    setSuggestions([])
    setScanStats(null)
    try {
      // Build full scenario text for context
      const scenarioText = blocks.map((b) => b.text).join("\n")
      if (!scenarioText.trim()) return

      const result = await smartScanAll(
        scenarioText,
        characters.map((c) => ({ id: c.id, name: c.name, description: c.description, appearancePrompt: c.appearancePrompt })),
        locations.map((l) => ({ id: l.id, name: l.name, description: l.description, appearancePrompt: l.appearancePrompt })),
        props.map((p) => ({ id: p.id, name: p.name, description: p.description, appearancePrompt: p.appearancePrompt })),
      )

      // Apply character fills
      let charsFilled = 0
      for (const c of result.characters) {
        const patch: Partial<CharacterEntry> = {}
        if (c.description) patch.description = c.description
        if (c.appearancePrompt) patch.appearancePrompt = c.appearancePrompt
        if (Object.keys(patch).length > 0) {
          updateCharacter(c.id, patch)
          charsFilled++
        }
      }

      // Apply location fills
      let locsFilled = 0
      for (const l of result.locations) {
        const patch: Partial<LocationEntry> = {}
        if (l.description) patch.description = l.description
        if (l.appearancePrompt) patch.appearancePrompt = l.appearancePrompt
        if (Object.keys(patch).length > 0) {
          updateLocation(l.id, patch)
          locsFilled++
        }
      }

      // Apply prop fills (existing props)
      let propsFilled = 0
      for (const p of result.props) {
        const patch: Partial<PropEntry> = {}
        if (p.description) patch.description = p.description
        if (p.appearancePrompt) patch.appearancePrompt = p.appearancePrompt
        if (Object.keys(patch).length > 0) {
          updateProp(p.id, patch)
          propsFilled++
        }
      }

      // Show new prop suggestions
      setSuggestions(result.newProps)
      setScanStats({ chars: charsFilled, locs: locsFilled, props: propsFilled + result.newProps.length })
    } catch (err) {
      console.error("Smart scan error:", err)
    } finally {
      setScanning(false)
    }
  }

  const handleAcceptSuggestion = (suggestion: PropSuggestion) => {
    const id = suggestion.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-zа-яё0-9-]/gi, "")
    addProp({
      id,
      name: suggestion.name,
      description: suggestion.description,
      sceneIds: suggestion.sourceScenes,
      referenceImages: [],
      canonicalImageId: null,
      generatedImageUrl: null,
      imageBlobKey: null,
      appearancePrompt: suggestion.appearancePrompt,
    })
    setSuggestions((prev) => prev.filter((s) => s.name !== suggestion.name))
  }

  const handleDismissSuggestion = (suggestion: PropSuggestion) => {
    setSuggestions((prev) => prev.filter((s) => s.name !== suggestion.name))
  }

  // ── Smart Edit ──
  const openEditOverlay = (id: string, type: "char" | "loc" | "prop", src: string) => {
    setEditOverlayTarget({ id, type, src })
  }

  const handleEditComplete = async (blob: Blob) => {
    if (!editOverlayTarget) return
    const { id, type, src } = editOverlayTarget
    setEditOverlayTarget(null)
    setEditingId(id)
    try {
      const blobKey = `bible-edit-${id}-${Date.now()}`
      const url = await replaceBlobImage(src, null, blobKey, blob)

      if (type === "char") updateCharacter(id, { generatedPortraitUrl: url, portraitBlobKey: blobKey })
      else if (type === "loc") updateLocation(id, { generatedImageUrl: url, imageBlobKey: blobKey })
      else updateProp(id, { generatedImageUrl: url, imageBlobKey: blobKey })

      if (lightbox?.id === id) setLightbox({ ...lightbox, src: url })
    } catch (err) { console.error("Smart edit error:", err) }
    finally { setEditingId(null) }
  }

  // ── Lightbox ──
  const openLightbox = (id: string, type: "char" | "loc" | "prop", src: string) => {
    setLightbox({ src, id, type })
    setLbTransform({ flipH: false, flipV: false, rotate: 0 })
  }

  const bakeTransform = async () => {
    if (!lightbox) return
    const img = new window.Image()
    img.crossOrigin = "anonymous"
    img.src = lightbox.src
    await new Promise((resolve) => { img.onload = resolve })

    const canvas = document.createElement("canvas")
    const rotated = lbTransform.rotate % 180 !== 0
    canvas.width = rotated ? img.naturalHeight : img.naturalWidth
    canvas.height = rotated ? img.naturalWidth : img.naturalHeight
    const ctx = canvas.getContext("2d")!
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((lbTransform.rotate * Math.PI) / 180)
    ctx.scale(lbTransform.flipH ? -1 : 1, lbTransform.flipV ? -1 : 1)
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)

    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"))
    const blobKey = `bible-transform-${lightbox.id}-${Date.now()}`
    const url = await replaceBlobImage(lightbox.src, null, blobKey, blob)

    if (lightbox.type === "char") updateCharacter(lightbox.id, { generatedPortraitUrl: url, portraitBlobKey: blobKey })
    else if (lightbox.type === "loc") updateLocation(lightbox.id, { generatedImageUrl: url, imageBlobKey: blobKey })
    else updateProp(lightbox.id, { generatedImageUrl: url, imageBlobKey: blobKey })

    setLightbox({ ...lightbox, src: url })
    setLbTransform({ flipH: false, flipV: false, rotate: 0 })
  }

  const handleLbDownload = () => {
    if (!lightbox) return
    const a = document.createElement("a")
    a.href = lightbox.src
    a.download = `bible-${lightbox.id}.png`
    a.click()
  }

  const handleLbCopy = async () => {
    if (!lightbox) return
    try {
      const resp = await fetch(lightbox.src)
      const blob = await resp.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    } catch {}
  }

  const hasLbTransform = lbTransform.flipH || lbTransform.flipV || lbTransform.rotate !== 0

  return (
    <main className="min-h-screen bg-[#0E0D0B] text-white">
      <div className="mx-auto max-w-7xl p-6">
        <header className="sticky top-0 z-20 mb-6 border-b border-white/8 bg-[#0E0D0B]/92 pb-5 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/?storyboard=open"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-white/75 transition-colors hover:bg-white/8 hover:text-white"
            >
              ← Back
            </Link>
            <div className="flex items-center gap-3 text-[#D4A853]">
              <BookOpen className="h-5 w-5" />
              <span className="text-sm uppercase tracking-[0.32em] text-white/65">PIECE BIBLE</span>
            </div>
          </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveTab("characters")}
              className={`rounded-full px-4 py-2 text-sm uppercase tracking-[0.18em] transition-colors ${activeTab === "characters" ? "bg-[#D4A853] text-black" : "border border-white/10 bg-white/4 text-white/70 hover:bg-white/8 hover:text-white"}`}
            >
              Characters
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("locations")}
              className={`rounded-full px-4 py-2 text-sm uppercase tracking-[0.18em] transition-colors ${activeTab === "locations" ? "bg-[#D4A853] text-black" : "border border-white/10 bg-white/4 text-white/70 hover:bg-white/8 hover:text-white"}`}
            >
              Locations
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("props")}
              className={`rounded-full px-4 py-2 text-sm uppercase tracking-[0.18em] transition-colors ${activeTab === "props" ? "bg-[#D4A853] text-black" : "border border-white/10 bg-white/4 text-white/70 hover:bg-white/8 hover:text-white"}`}
            >
              Props ({props.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("director")}
              className={`rounded-full px-4 py-2 text-sm uppercase tracking-[0.18em] transition-colors ${activeTab === "director" ? "bg-[#D4A853] text-black" : "border border-white/10 bg-white/4 text-white/70 hover:bg-white/8 hover:text-white"}`}
            >
              Director
            </button>
            <div className="ml-auto flex items-center gap-2">
              <ProjectStylePicker projectStyle={projectStyle} setProjectStyle={setProjectStyle} />
              <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1">
              <span className="px-1 text-[8px] uppercase tracking-wider text-white/30">Model:</span>
              {IMAGE_GEN_MODELS.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => setSelectedImageGenModel(model.id)}
                  title={`${model.label} ${model.price}`}
                  className={`rounded px-2 py-1 text-[9px] transition-colors ${
                    selectedImageGenModel === model.id
                      ? "bg-[#D4A853]/20 text-[#D4A853]"
                      : "text-white/40 hover:text-white/60"
                  }`}
                >
                  {model.label}
                </button>
              ))}
              </div>
            </div>
          </div>
        </header>

        <BibleContextPanel
          storyHistory={storyHistory}
          directorVision={directorVision}
          ambientPrompt={ambientPrompt ?? ""}
          onStoryHistorySave={updateStoryHistory}
          onDirectorVisionSave={updateDirectorVision}
          onAmbientPromptSave={updateAmbientPrompt}
        />

        {/* ─── Universal Smart Scan + Cleanup ─── */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSmartScan()}
            disabled={scanning || blocks.length === 0}
            className="inline-flex items-center gap-2 rounded-full border border-[#D4A853]/30 bg-[#D4A853]/8 px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-[#D4A853] transition-colors hover:bg-[#D4A853]/15 disabled:opacity-50"
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Smart Scan
          </button>
          {unusedCount > 0 ? (
            <button
              type="button"
              onClick={handleCleanup}
              className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/8 px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-red-400 transition-colors hover:bg-red-500/15"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Очистить ({unusedCount})
            </button>
          ) : null}
          {scanning ? (
            <span className="text-[11px] text-white/30">Анализирую сценарий — персонажи, локации, реквизит...</span>
          ) : cleanupStats ? (
            <span className="text-[11px] text-green-400/70">
              Удалено: {cleanupStats.chars > 0 ? `${cleanupStats.chars} персонажей` : ""}
              {cleanupStats.chars > 0 && cleanupStats.locs > 0 ? ", " : ""}
              {cleanupStats.locs > 0 ? `${cleanupStats.locs} локаций` : ""}
              {(cleanupStats.chars > 0 || cleanupStats.locs > 0) && cleanupStats.props > 0 ? ", " : ""}
              {cleanupStats.props > 0 ? `${cleanupStats.props} предметов` : ""}
            </span>
          ) : scanStats ? (
            <span className="text-[11px] text-white/40">
              Заполнено: {scanStats.chars > 0 ? `${scanStats.chars} персонажей` : ""}
              {scanStats.chars > 0 && scanStats.locs > 0 ? ", " : ""}
              {scanStats.locs > 0 ? `${scanStats.locs} локаций` : ""}
              {(scanStats.chars > 0 || scanStats.locs > 0) && scanStats.props > 0 ? ", " : ""}
              {scanStats.props > 0 ? `${scanStats.props} новых предметов` : ""}
              {scanStats.chars === 0 && scanStats.locs === 0 && scanStats.props === 0 ? "Всё уже заполнено" : ""}
            </span>
          ) : null}
        </div>

        {/* Prop suggestions from Smart Scan (visible on any tab) */}
        {suggestions.length > 0 ? (
          <div className="mb-6">
            <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-[#D4A853]/60">
              AI Suggestions — {suggestions.length} {suggestions.length === 1 ? "предмет" : "предметов"}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {suggestions.map((s) => (
                <SuggestionCard
                  key={s.name}
                  suggestion={s}
                  onAccept={() => handleAcceptSuggestion(s)}
                  onDismiss={() => handleDismissSuggestion(s)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === "director" ? (
          <DirectorSection />
        ) : activeTab === "props" ? (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {sortedProps.map((entry) => (
                <PropCard
                  key={entry.id}
                  entry={entry}
                  generating={generatingId === entry.id}
                  sceneIndexMap={sceneIndexMap}
                  onUpdate={(patch) => updateProp(entry.id, patch)}
                  onGenerate={() => void handlePropGenerate(entry)}
                  onSetCanonicalPrimary={() => updateProp(entry.id, { canonicalImageId: GENERATED_CANONICAL_IMAGE_ID })}
                  onUploadPrimary={(file) => void handlePropPrimaryUpload(entry, file)}
                  onAddReferences={(files) => void handlePropReferenceAdd(entry, files)}
                  onSetCanonicalReference={(reference) => updateProp(entry.id, { canonicalImageId: reference.id })}
                  onRemoveReference={(reference) => void handlePropReferenceRemove(entry, reference)}
                  onEdit={() => entry.generatedImageUrl && openEditOverlay(entry.id, "prop", entry.generatedImageUrl)}
                  onDoubleClick={() => entry.generatedImageUrl && openLightbox(entry.id, "prop", entry.generatedImageUrl)}
                  editingThis={editingId === entry.id}
                />
              ))}
              {props.length === 0 && suggestions.length === 0 ? (
                <div className="col-span-full rounded-xl border border-dashed border-white/10 bg-white/2 p-10 text-center text-white/45">
                  Предметы пока не найдены. Напишите action-блоки в сценарии.
                </div>
              ) : null}
            </section>
          </>
        ) : activeTab === "characters" ? (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {sortedCharacters.map((entry) => (
              <CharacterCard
                key={entry.id}
                entry={entry}
                generating={generatingId === entry.id}
                sceneIndexMap={sceneIndexMap}
                onUpdate={(patch) => updateCharacter(entry.id, patch)}
                onGenerate={() => void handleCharacterGenerate(entry)}
                onSetCanonicalPrimary={() => updateCharacter(entry.id, { canonicalImageId: GENERATED_CANONICAL_IMAGE_ID })}
                onUploadPrimary={(file) => void handleCharacterPrimaryUpload(entry, file)}
                onAddReferences={(files) => void handleCharacterReferenceAdd(entry, files)}
                onSetCanonicalReference={(reference) => updateCharacter(entry.id, { canonicalImageId: reference.id })}
                onRemoveReference={(reference) => void handleCharacterReferenceRemove(entry, reference)}
                onEdit={() => entry.generatedPortraitUrl && openEditOverlay(entry.id, "char", entry.generatedPortraitUrl)}
                onDoubleClick={() => entry.generatedPortraitUrl && openLightbox(entry.id, "char", entry.generatedPortraitUrl)}
                editingThis={editingId === entry.id}
              />
            ))}
            {characters.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-white/10 bg-white/2 p-10 text-center text-white/45">
                No characters parsed yet. Add character blocks to the screenplay.
              </div>
            ) : null}
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {sortedLocations.map((entry) => (
              <LocationCard
                key={entry.id}
                entry={entry}
                generating={generatingId === entry.id}
                sceneIndexMap={sceneIndexMap}
                onUpdate={(patch) => updateLocation(entry.id, patch)}
                onGenerate={() => void handleLocationGenerate(entry)}
                onSetCanonicalPrimary={() => updateLocation(entry.id, { canonicalImageId: GENERATED_CANONICAL_IMAGE_ID })}
                onUploadPrimary={(file) => void handleLocationPrimaryUpload(entry, file)}
                onAddReferences={(files) => void handleLocationReferenceAdd(entry, files)}
                onSetCanonicalReference={(reference) => updateLocation(entry.id, { canonicalImageId: reference.id })}
                onRemoveReference={(reference) => void handleLocationReferenceRemove(entry, reference)}
                onEdit={() => entry.generatedImageUrl && openEditOverlay(entry.id, "loc", entry.generatedImageUrl)}
                onDoubleClick={() => entry.generatedImageUrl && openLightbox(entry.id, "loc", entry.generatedImageUrl)}
                editingThis={editingId === entry.id}
              />
            ))}
            {locations.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-white/10 bg-white/2 p-10 text-center text-white/45">
                No locations parsed yet. Add scene headings to the screenplay.
              </div>
            ) : null}
          </section>
        )}
      </div>

      {/* ── Edit Overlay (shared component) ── */}
      {editOverlayTarget && (
        <ImageEditOverlay
          imageUrl={editOverlayTarget.src}
          model={selectedImageGenModel || "nano-banana-2"}
          onComplete={(blob) => void handleEditComplete(blob)}
          onClose={() => setEditOverlayTarget(null)}
        />
      )}

      {/* ── Lightbox ── */}
      {lightbox && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => { if (hasLbTransform) void bakeTransform(); setLightbox(null) }}>
          <div className="relative flex max-h-[80vh] max-w-[75vw] flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            {/* Image */}
            <div className="relative overflow-hidden rounded-xl border border-white/10">
              <img
                src={lightbox.src}
                alt="Preview"
                className="max-h-[70vh] max-w-[75vw] object-contain"
                style={{
                  transform: `scaleX(${lbTransform.flipH ? -1 : 1}) scaleY(${lbTransform.flipV ? -1 : 1}) rotate(${lbTransform.rotate}deg)`,
                }}
              />
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#1A1916]/95 px-2 py-1.5 shadow-2xl backdrop-blur-xl">
              <button type="button" onClick={handleLbCopy} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/8 hover:text-white" title="Copy">
                <Copy size={14} />
              </button>
              <button type="button" onClick={handleLbDownload} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/8 hover:text-white" title="Download">
                <Download size={14} />
              </button>

              <div className="mx-1 h-4 w-px bg-white/10" />

              <button type="button" onClick={() => openEditOverlay(lightbox.id, lightbox.type, lightbox.src)} className="flex h-7 items-center gap-1 rounded-lg px-2 text-[10px] uppercase tracking-[0.1em] text-[#D4A853] transition-colors hover:bg-[#D4A853]/10" title="Smart Edit">
                <Pencil size={12} />
                Edit
              </button>

              <div className="mx-1 h-4 w-px bg-white/10" />

              <button type="button" onClick={() => setLbTransform((t) => ({ ...t, flipH: !t.flipH }))} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/8 hover:text-white" title="Flip H">
                <FlipHorizontal2 size={14} />
              </button>
              <button type="button" onClick={() => setLbTransform((t) => ({ ...t, flipV: !t.flipV }))} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/8 hover:text-white" title="Flip V">
                <FlipVertical2 size={14} />
              </button>
              <button type="button" onClick={() => setLbTransform((t) => ({ ...t, rotate: (t.rotate - 90) % 360 }))} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/8 hover:text-white" title="Rotate Left">
                <RotateCcw size={14} />
              </button>
              <button type="button" onClick={() => setLbTransform((t) => ({ ...t, rotate: (t.rotate + 90) % 360 }))} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/8 hover:text-white" title="Rotate Right">
                <RotateCw size={14} />
              </button>

              {hasLbTransform && (
                <>
                  <div className="mx-1 h-4 w-px bg-white/10" />
                  <button
                    type="button"
                    onClick={() => { void bakeTransform() }}
                    className="flex h-7 items-center gap-1 rounded-lg bg-[#D4A853]/10 px-2 text-[10px] uppercase tracking-[0.1em] text-[#D4A853] transition-colors hover:bg-[#D4A853]/20"
                  >
                    <Check size={12} />
                    Apply
                  </button>
                </>
              )}

              <div className="mx-1 h-4 w-px bg-white/10" />

              <button type="button" onClick={() => { if (hasLbTransform) void bakeTransform(); setLightbox(null) }} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/8 hover:text-white" title="Close">
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}