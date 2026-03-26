"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Minus, Plus, Sparkles, Upload, X } from "lucide-react"
import Image from "next/image"
import { useTimelineStore } from "@/store/timeline"
import { useBibleStore } from "@/store/bible"
import { useBoardStore } from "@/store/board"
import { getCharactersForShot, getLocationsForShot } from "@/lib/promptBuilder"
import { getShotGenerationReferenceImages, convertReferenceImagesToDataUrls } from "@/lib/imageGenerationReferences"
import { DEFAULT_PROJECT_STYLE } from "@/lib/projectStyle"
import type { CharacterEntry, LocationEntry } from "@/lib/bibleParser"
import type { TimelineShot } from "@/store/timeline"
import { censorPrompt, censorSceneContinuity, type CensorResult, type ContinuityCensorResult } from "@/lib/cinematic/promptCensor"

// ─── Types ───

type ImageGenModel = "gpt-image" | "nano-banana" | "nano-banana-2" | "nano-banana-pro"

const MODEL_LIST: { id: ImageGenModel; label: string; provider: string }[] = [
  { id: "nano-banana", label: "Nano Banana", provider: "Google" },
  { id: "nano-banana-2", label: "Nano Banana 2", provider: "Google" },
  { id: "nano-banana-pro", label: "Nano Banana Pro", provider: "Google" },
  { id: "gpt-image", label: "GPT Image", provider: "OpenAI" },
]


// ─── Modifiers ───

interface Modifier {
  id: string
  label: string
  content: string
  enabled: boolean
  color: string
}

function buildModifiers(shot: TimelineShot, characters: CharacterEntry[], locations: LocationEntry[], style: string): Modifier[] {
  const mods: Modifier[] = []
  const shotChars = getCharactersForShot(shot, characters)
  const loc = getLocationsForShot(shot, locations)[0] ?? null
  const hasImagePrompt = Boolean(shot.imagePrompt)

  // ── 1. Кадр — основное описание
  if (hasImagePrompt) {
    // imagePrompt из брейкдауна уже содержит полное описание кадра
    mods.push({ id: "base", label: "Кадр", content: shot.imagePrompt, enabled: true, color: "#E5E0DB" })
  } else {
    // Собираем вручную из метаданных
    const parts = [
      `${shot.shotSize || "Общий"} план, ${shot.cameraMotion || "статика"}.`,
      shot.caption || shot.label,
      shot.visualDescription || "",
    ].filter(Boolean)
    mods.push({ id: "base", label: "Кадр", content: parts.join(" "), enabled: true, color: "#E5E0DB" })
  }

  // ── 2. Персонажи — только если imagePrompt не содержит их уже
  const charRefs = shotChars
    .filter((c) => c.appearancePrompt)
    .map((c) => `[${c.name}: ${c.appearancePrompt}]`)
    .join(" ")
  if (charRefs) {
    // Если imagePrompt уже упоминает персонажа — выключаем по умолчанию чтобы не дублировать
    const alreadyInPrompt = hasImagePrompt && shotChars.some((c) => shot.imagePrompt.toLowerCase().includes(c.name.toLowerCase()))
    mods.push({ id: "chars", label: "Персонажи", content: charRefs, enabled: !alreadyInPrompt, color: "#7DD3FC" })
  }

  // ── 3. Локация
  if (loc?.appearancePrompt) {
    const alreadyInPrompt = hasImagePrompt && shot.imagePrompt.toLowerCase().includes(loc.name.toLowerCase())
    mods.push({ id: "loc", label: "Локация", content: loc.appearancePrompt, enabled: !alreadyInPrompt, color: "#86EFAC" })
  }

  // ── 4. Освещение
  if (loc?.timeOfDay) {
    mods.push({ id: "light", label: "Свет", content: `Освещение: ${loc.timeOfDay}`, enabled: true, color: "#FDE68A" })
  }

  // ── 5. Стиль (без "No text" — это отдельный модификатор)
  mods.push({ id: "style", label: "Стиль", content: `${style}. 16:9.`, enabled: true, color: "#F9A8D4" })

  // ── 6. Режиссёрская заметка
  if (shot.directorNote) {
    mods.push({ id: "dir", label: "Режиссёр", content: shot.directorNote, enabled: true, color: "#FDBA74" })
  }

  // ── 7. Операторская заметка
  if (shot.cameraNote && !hasImagePrompt) {
    mods.push({ id: "cam", label: "Камера", content: shot.cameraNote, enabled: true, color: "#67E8F9" })
  }

  // ── 8. Continuity / Заметки
  if (shot.notes) {
    mods.push({ id: "notes", label: "Continuity", content: shot.notes, enabled: true, color: "#94A3B8" })
  }

  // ── 9. Референс-инструкция (когда есть рефы — важный модификатор)
  const hasAnyRefs = shotChars.some((c) => Boolean(c.generatedPortraitUrl) || c.referenceImages.length > 0)
    || Boolean(loc && (loc.generatedImageUrl || loc.referenceImages.length > 0))
  if (hasAnyRefs) {
    mods.push({
      id: "refs",
      label: "Рефы",
      content: "Use the provided reference images as hard visual anchors. Preserve the exact face identity, hair, costume silhouette, proportions, and environment design from those references. Do not redesign recurring characters or locations.",
      enabled: true,
      color: "#C4B5FD",
    })
  }

  // ── 10. Без текста (отдельный guardrail)
  mods.push({ id: "notext", label: "Без текста", content: "No visible text, no logos, no watermarks, no labels.", enabled: true, color: "#FCA5A5" })

  // ── 11. Исходный текст сценария (выключен — для контекста)
  if (shot.sourceText && shot.sourceText.length > 10) {
    mods.push({ id: "src", label: "Сценарий", content: shot.sourceText, enabled: false, color: "#A78BFA" })
  }

  return mods
}

function assemblePrompt(mods: Modifier[], custom: string): string {
  const parts = mods.filter((m) => m.enabled).map((m) => m.content)
  if (custom.trim()) parts.push(custom.trim())
  return parts.filter(Boolean).join("\n")
}

// ─── PromptLabPanel ───

interface PromptLabPanelProps {
  shotId: string
  onClose: () => void
}

export function PromptLabPanel({ shotId, onClose }: PromptLabPanelProps) {
  const shot = useTimelineStore((s) => s.shots.find((x) => x.id === shotId))
  const updateShot = useTimelineStore((s) => s.updateShot)
  const allShots = useTimelineStore((s) => s.shots)
  const characters = useBibleStore((s) => s.characters)
  const locations = useBibleStore((s) => s.locations)
  const projectStyle = useBoardStore((s) => s.projectStyle)
  const selectedImageGenModel = useBoardStore((s) => s.selectedImageGenModel)
  const setSelectedImageGenModel = useBoardStore((s) => s.setSelectedImageGenModel)

  const [mods, setMods] = useState<Modifier[]>([])
  const [customText, setCustomText] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [genCount, setGenCount] = useState(1)
  const [isManualEdit, setIsManualEdit] = useState(false)
  const [manualPrompt, setManualPrompt] = useState("")

  const referenceImages = useMemo(() => {
    if (!shot) return []
    return getShotGenerationReferenceImages(shot, characters, locations)
  }, [shot, characters, locations])

  const libraryImages = useMemo(() => {
    const entries: { url: string; shotId: string; label: string; ts: number }[] = []
    for (const s of allShots) {
      for (const h of s.generationHistory || []) {
        entries.push({ url: h.url, shotId: s.id, label: s.label, ts: h.timestamp })
      }
    }
    return entries.sort((a, b) => b.ts - a.ts)
  }, [allShots])

  useEffect(() => {
    if (!shot) return
    setMods(buildModifiers(shot, characters, locations, projectStyle || DEFAULT_PROJECT_STYLE))
    setCustomText("")
    setIsManualEdit(false)
    setManualPrompt("")
    setShowLibrary(false)
    setShowModelPicker(false)
  }, [shotId])

  const rawPrompt = useMemo(() => {
    if (isManualEdit) return manualPrompt
    return assemblePrompt(mods, customText)
  }, [mods, customText, isManualEdit, manualPrompt])

  // Цензор: валидация и очистка промпта
  // Per-shot censor
  const censorResult = useMemo((): CensorResult | null => {
    if (!shot || !rawPrompt.trim()) return null
    return censorPrompt(rawPrompt, shot, characters, locations)
  }, [rawPrompt, shot, characters, locations])

  // Cross-shot continuity censor (all shots of the same scene)
  const continuityCensor = useMemo((): ContinuityCensorResult | null => {
    if (!shot?.sceneId) return null
    const sceneShots = allShots.filter((s) => s.sceneId === shot.sceneId).sort((a, b) => a.order - b.order)
    if (sceneShots.length < 2) return null
    return censorSceneContinuity(sceneShots, characters, locations)
  }, [shot?.sceneId, allShots, characters, locations])

  // Merge: per-shot issues + continuity issues for THIS shot + continuity directives
  const allCensorIssues = useMemo(() => {
    const issues = [...(censorResult?.issues || [])]
    if (continuityCensor) {
      issues.push(...continuityCensor.issues)
      // Add directives for this shot as info
      const directives = continuityCensor.shotDirectives.get(shotId)
      if (directives) {
        for (const d of directives) {
          issues.push({ severity: "warning", code: "continuity_directive", message: d })
        }
      }
    }
    return issues
  }, [censorResult, continuityCensor, shotId])

  const finalPrompt = censorResult?.optimizedPrompt || rawPrompt

  const toggleMod = useCallback((id: string) => {
    setIsManualEdit(false)
    setMods((prev) => prev.map((m) => m.id === id ? { ...m, enabled: !m.enabled } : m))
  }, [])

  const currentModel = MODEL_LIST.find((m) => m.id === selectedImageGenModel) ?? MODEL_LIST[1]

  const handleGenerate = useCallback(async () => {
    if (!shot || isGenerating || !finalPrompt.trim()) return
    setIsGenerating(true)
    const model = currentModel.id
    const endpoint = model === "gpt-image" ? "/api/gpt-image" : "/api/nano-banana"

    try {
      const refs = await convertReferenceImagesToDataUrls(referenceImages)
      const body = model === "gpt-image"
        ? { prompt: finalPrompt, referenceImages: refs }
        : { prompt: finalPrompt, model, referenceImages: refs }

      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error((err as { error?: string }).error || `${response.status}`) }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const entry = { url: objectUrl, blobKey: null, timestamp: Date.now() }
      const history = [...(shot.generationHistory || []), entry]
      updateShot(shot.id, { thumbnailUrl: objectUrl, generationHistory: history, activeHistoryIndex: history.length - 1 })
      setShowLibrary(true)
    } catch (error) {
      console.error("PromptLab error:", error)
    } finally {
      setIsGenerating(false)
    }
  }, [shot, isGenerating, finalPrompt, currentModel, referenceImages, updateShot])

  const applyFromLibrary = useCallback((url: string) => {
    if (!shot) return
    const entry = { url, blobKey: null, timestamp: Date.now() }
    const history = [...(shot.generationHistory || []), entry]
    updateShot(shot.id, { thumbnailUrl: url, generationHistory: history, activeHistoryIndex: history.length - 1 })
  }, [shot, updateShot])

  if (!shot) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={onClose}>
      <div className="flex-1" />

      <div
        className="mx-auto mb-8 w-[88%] max-w-[1100px] overflow-hidden rounded-2xl border border-white/10 bg-[#1A1B1F] shadow-[0_8px_60px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Row 1: References + Prompt ─── */}
        <div className="px-5 pt-5 pb-3">
          {/* Reference images */}
          <div className="mb-3 flex items-center gap-2">
            {referenceImages.map((ref, i) => (
              <div key={`ref-${ref.kind}-${i}`} className="relative" title={ref.label}>
                <Image src={ref.url} alt={ref.label} width={52} height={52} unoptimized
                  className="h-[52px] w-[52px] rounded-xl border border-white/10 object-cover transition-transform hover:scale-105" />
              </div>
            ))}
            <button type="button" className="flex h-[52px] w-[52px] items-center justify-center rounded-xl border border-dashed border-white/15 text-white/25 transition-colors hover:border-white/30 hover:text-white/40">
              <Upload size={18} />
            </button>
          </div>

          {/* Prompt textarea */}
          <textarea
            value={finalPrompt}
            onChange={(e) => { setIsManualEdit(true); setManualPrompt(e.target.value) }}
            rows={2}
            className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-white/85 outline-none placeholder:text-white/25"
            placeholder="Опишите, что хотите сгенерировать..."
          />

          {/* Censor issues */}
          {allCensorIssues.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {allCensorIssues.map((issue, i) => (
                <span
                  key={`issue-${i}`}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
                    issue.severity === "error" ? "bg-red-500/15 text-red-300" :
                    issue.severity === "warning" ? "bg-amber-500/15 text-amber-300" :
                    "bg-blue-500/10 text-blue-300/60"
                  }`}
                  title={issue.suggestion || issue.message}
                >
                  <span className={`h-1 w-1 rounded-full ${
                    issue.severity === "error" ? "bg-red-400" :
                    issue.severity === "warning" ? "bg-amber-400" :
                    "bg-blue-400/50"
                  }`} />
                  {issue.message.slice(0, 60)}{issue.message.length > 60 ? "..." : ""}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ─── Row 2: Controls Bar ─── */}
        <div className="flex items-center gap-2 border-t border-white/6 px-5 py-3">
          {/* Modifier dots */}
          <div className="flex items-center gap-1 mr-1">
            {mods.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleMod(m.id)}
                title={`${m.label}${m.enabled ? " ✓" : " (выкл)"}`}
                className="group relative flex h-6 w-6 items-center justify-center rounded-full transition-all hover:scale-125"
              >
                <span
                  className="block h-2.5 w-2.5 rounded-full border transition-all"
                  style={{
                    backgroundColor: m.enabled ? m.color : "transparent",
                    borderColor: m.enabled ? m.color : "#555",
                    opacity: m.enabled ? 1 : 0.35,
                  }}
                />
                <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/90 px-2 py-0.5 text-[10px] text-white/80 opacity-0 transition-opacity group-hover:opacity-100">
                  {m.label}
                </span>
              </button>
            ))}
          </div>

          <span className="h-4 w-px bg-white/10" />

          {/* Model selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowModelPicker(!showModelPicker)}
              className="flex items-center gap-2 rounded-full bg-white/8 px-3.5 py-1.5 text-[13px] text-white/80 transition-colors hover:bg-white/12"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-white/60">
                {currentModel.provider === "Google" ? "G" : "O"}
              </span>
              {currentModel.label}
              <ChevronDown size={14} className="text-white/40" />
            </button>

            {showModelPicker && (
              <div className="absolute bottom-full left-0 mb-2 w-[220px] overflow-hidden rounded-xl border border-white/10 bg-[#1A1B1F] shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
                {MODEL_LIST.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setSelectedImageGenModel(m.id); setShowModelPicker(false) }}
                    className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] transition-colors hover:bg-white/8 ${m.id === currentModel.id ? "bg-white/6 text-white" : "text-white/60"}`}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-white/50">
                      {m.provider === "Google" ? "G" : "O"}
                    </span>
                    <span className="flex-1">{m.label}</span>
                    {m.id === currentModel.id && <span className="text-[10px] text-[#D4A853]">●</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Count selector */}
          <div className="flex items-center gap-1 rounded-full bg-white/8 px-1.5 py-0.5">
            <button type="button" onClick={() => setGenCount(Math.max(1, genCount - 1))} className="flex h-6 w-6 items-center justify-center rounded-full text-white/40 hover:text-white/70 transition-colors">
              <Minus size={14} />
            </button>
            <span className="min-w-[24px] text-center text-[13px] tabular-nums text-white/70">{genCount}/{4}</span>
            <button type="button" onClick={() => setGenCount(Math.min(4, genCount + 1))} className="flex h-6 w-6 items-center justify-center rounded-full text-white/40 hover:text-white/70 transition-colors">
              <Plus size={14} />
            </button>
          </div>

          {/* Generate button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !finalPrompt.trim()}
            className="flex items-center gap-2 rounded-xl bg-[#CCFF00] px-5 py-2 text-[14px] font-semibold text-black transition-all hover:bg-[#D8FF33] disabled:opacity-40 disabled:hover:bg-[#CCFF00]"
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Generate
            {genCount > 1 && <span className="ml-0.5 text-black/60">+{genCount}</span>}
          </button>
        </div>

        {/* ─── Library (Masonry) ─── */}
        {showLibrary && libraryImages.length > 0 && (
          <div className="border-t border-white/6">
            <div className="flex items-center justify-between px-5 py-2">
              <span className="text-[11px] text-white/30">{libraryImages.length} изображений</span>
              <button type="button" onClick={() => setShowLibrary(false)} className="text-[11px] text-white/30 hover:text-white/50 transition-colors">Свернуть</button>
            </div>
            <div className="max-h-[280px] overflow-y-auto px-3 pb-3" style={{ scrollbarWidth: "thin" }}>
              <div className="columns-5 gap-1.5 sm:columns-6 md:columns-8 lg:columns-10">
                {libraryImages.map((img, i) => (
                  <button
                    key={`lib-${img.ts}-${i}`}
                    type="button"
                    onClick={() => applyFromLibrary(img.url)}
                    className={`mb-1.5 block w-full overflow-hidden rounded-lg border transition-all hover:brightness-110 ${img.shotId === shotId ? "border-[#CCFF00]/50 ring-1 ring-[#CCFF00]/30" : "border-white/6 hover:border-white/20"}`}
                    title={img.label}
                  >
                    <Image src={img.url} alt="" width={150} height={0} unoptimized className="w-full object-cover" style={{ height: "auto" }} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Tab mode fallback
export function PromptLab() {
  const selectedShotId = useTimelineStore((s) => s.selectedShotId)
  const shots = useTimelineStore((s) => s.shots)
  if (!selectedShotId || shots.length === 0) {
    return <div className="flex min-h-full flex-col items-center justify-center py-16 text-[12px] text-[#7F8590]">Выберите кадр.</div>
  }
  return <PromptLabPanel shotId={selectedShotId} onClose={() => {}} />
}
