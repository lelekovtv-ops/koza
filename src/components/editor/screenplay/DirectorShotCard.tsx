"use client"

import Image from "next/image"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BookOpen, Camera, ChevronLeft, ChevronRight, Clapperboard, Copy, List, Loader2, Plus, Sparkles, Trash2, Video, Wand2 } from "lucide-react"
import type { TimelineShot } from "@/store/timeline"
import type { CharacterEntry, LocationEntry, PropEntry } from "@/lib/bibleParser"
import { buildImagePrompt, getReferencedBibleEntries } from "@/lib/promptBuilder"
import { getShotGenerationReferenceImages, convertReferenceImagesToDataUrls } from "@/lib/imageGenerationReferences"
import { useBibleStore } from "@/store/bible"
import { useBoardStore } from "@/store/board"
import { useProjectsStore } from "@/store/projects"
import { useLibraryStore } from "@/store/library"
import { trySaveBlob } from "@/lib/fileStorage"
import { devlog } from "@/store/devlog"
import {
  SHOT_SIZE_OPTIONS, CAMERA_MOTION_OPTIONS,
  DIRECTOR_FIELD_VISIBILITY_OPTIONS, DIRECTOR_UPDATE_DEBOUNCE_MS,
  type EditableShotField, type DirectorFieldVisibility,
} from "./storyboardUtils"

export function DebouncedTextarea({
  value,
  onCommit,
  placeholder,
  rows = 3,
  className,
  autoFocusRequested = false,
  dataFocusId,
  autoGrow = false,
}: {
  value: string
  onCommit: (value: string) => void
  placeholder?: string
  rows?: number
  className?: string
  autoFocusRequested?: boolean
  dataFocusId?: string
  autoGrow?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const [isEditing, setIsEditing] = useState(false)
  const lastCommittedRef = useRef(value)
  const timerRef = useRef<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const draftRef = useRef(value)
  const onCommitRef = useRef(onCommit)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    onCommitRef.current = onCommit
  }, [onCommit])

  const scheduleCommit = useCallback((nextValue: string) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
    }

    timerRef.current = window.setTimeout(() => {
      lastCommittedRef.current = nextValue
      onCommit(nextValue)
      timerRef.current = null
    }, DIRECTOR_UPDATE_DEBOUNCE_MS)
  }, [onCommit])

  const flush = useCallback(() => {
    if (draft === lastCommittedRef.current) return
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    lastCommittedRef.current = draft
    onCommit(draft)
  }, [draft, onCommit])

  useEffect(() => {
    if (isEditing) return
    setDraft(value)
    draftRef.current = value
    lastCommittedRef.current = value
  }, [isEditing, value])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }

      if (draftRef.current !== lastCommittedRef.current) {
        onCommitRef.current(draftRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!autoFocusRequested) return

    const node = textareaRef.current
    if (!node) return

    const rafId = window.requestAnimationFrame(() => {
      node.focus()
      const length = node.value.length
      node.setSelectionRange(length, length)
    })

    return () => window.cancelAnimationFrame(rafId)
  }, [autoFocusRequested])

  useEffect(() => {
    const node = textareaRef.current
    if (!node) return

    if (!autoGrow) {
      node.style.height = ""
      return
    }

    node.style.height = "0px"
    node.style.height = `${node.scrollHeight}px`
  }, [autoGrow, draft, isEditing, value])

  return (
    <textarea
      ref={textareaRef}
      rows={rows}
      value={isEditing ? draft : value}
      placeholder={placeholder}
      data-focus-id={dataFocusId}
      onFocus={() => {
        if (isEditing) return
        setDraft(value)
        lastCommittedRef.current = value
        setIsEditing(true)
      }}
      onChange={(event) => {
        const nextValue = event.target.value
        setDraft(nextValue)
        scheduleCommit(nextValue)
      }}
      onBlur={() => {
        flush()
        setIsEditing(false)
      }}
      className={className}
    />
  )
}

export function DirectorFieldVisibilityControl({
  value,
  onChange,
}: {
  value: DirectorFieldVisibility
  onChange: (value: DirectorFieldVisibility) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener("pointerdown", handlePointerDown)
    return () => window.removeEventListener("pointerdown", handlePointerDown)
  }, [open])

  const activeOption = DIRECTOR_FIELD_VISIBILITY_OPTIONS.find((option) => option.value === value) ?? DIRECTOR_FIELD_VISIBILITY_OPTIONS[0]

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3 text-left text-[#D7CDC1] transition-colors hover:bg-white/6"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <List size={14} className="text-[#9FA4AE]" />
        <div className="leading-none">
          <p className="text-[9px] uppercase tracking-[0.18em] text-[#8D919B]">Fields</p>
          <p className="mt-1 text-[11px] text-[#E7E3DC]">{activeOption.label}</p>
        </div>
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-64 overflow-hidden rounded-2xl border border-white/8 bg-[#171A20]/96 p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          {DIRECTOR_FIELD_VISIBILITY_OPTIONS.map((option) => {
            const isActive = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${isActive ? "bg-white/7 text-[#E7E3DC]" : "text-[#D7CDC1] hover:bg-white/5"}`}
              >
                <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${isActive ? "bg-white/60" : "bg-white/12"}`} />
                <span className="min-w-0">
                  <span className="block text-[11px] uppercase tracking-[0.16em]">{option.label}</span>
                  <span className="mt-1 block text-[11px] normal-case tracking-normal text-[#8D919B]">{option.description}</span>
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function DirectorShotCard({
  shot,
  index,
  selected,
  canDuplicate,
  isEnhancing,
  autoFocusAction,
  showThumbnail,
  fieldVisibility,
  cardRef,
  onSelect,
  onUpdate,
  onEnhance,
  onBuild,
  isBuilding,
  bibleChars,
  bibleLocs,
  bibleProps,
  onOpenBible,
  onSmartScan,
  isScanning,
  onGenerate,
  isGenerating,
  onOpenStudio,
  onDelete,
  onDuplicate,
}: {
  shot: TimelineShot
  index: number
  selected: boolean
  canDuplicate: boolean
  isEnhancing: boolean
  isBuilding: boolean
  isScanning: boolean
  autoFocusAction: boolean
  showThumbnail: boolean
  fieldVisibility: DirectorFieldVisibility
  bibleChars: CharacterEntry[]
  bibleLocs: LocationEntry[]
  bibleProps: PropEntry[]
  cardRef?: (node: HTMLElement | null) => void
  onSelect: () => void
  onUpdate: (patch: Partial<TimelineShot>) => void
  onEnhance: () => void
  onBuild: () => void
  onOpenBible: () => void
  onSmartScan: () => void
  onGenerate: () => void
  isGenerating: boolean
  onOpenStudio: () => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  const previewSrc = shot.thumbnailUrl || shot.svg || null
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [showFullPrompt, setShowFullPrompt] = useState(false)
  const showAction = fieldVisibility === "all" || fieldVisibility === "action"
  const showDirector = fieldVisibility === "all" || fieldVisibility === "director"
  const showCamera = fieldVisibility === "all" || fieldVisibility === "camera"
  const isSingleFieldMode = fieldVisibility !== "all"
  const isSplitCompactFields = !showThumbnail && !isSingleFieldMode
  const singleFieldConfig = fieldVisibility === "action"
    ? {
        label: "Action",
        value: shot.caption,
        placeholder: "Describe the shot action...",
        textClassName: "text-[#ECE5D8]",
        onCommit: (value: string) => onUpdate({ caption: value }),
        autoFocusRequested: autoFocusAction,
        dataFocusId: `director-action-${shot.id}`,
      }
    : fieldVisibility === "director"
      ? {
          label: "Director",
          value: shot.directorNote,
          placeholder: "Director notes...",
          textClassName: "text-[#D8D0C3]",
          onCommit: (value: string) => onUpdate({ directorNote: value }),
          autoFocusRequested: false,
          dataFocusId: undefined,
        }
      : {
          label: "Camera",
          value: shot.cameraNote,
          placeholder: "DP notes...",
          textClassName: "text-[#D8D0C3]",
          onCommit: (value: string) => onUpdate({ cameraNote: value }),
          autoFocusRequested: false,
          dataFocusId: undefined,
        }
  const previewPanel = showThumbnail ? (
    <div
      className={`relative overflow-hidden rounded-xl border border-white/8 bg-[#0E1014] ${previewSrc ? "cursor-pointer" : ""} ${isSingleFieldMode ? "h-full aspect-video shrink-0" : "w-72 shrink-0 self-start aspect-video"}`}
      onClick={(e) => { if (previewSrc) { e.stopPropagation(); onOpenStudio() } }}
    >
      {previewSrc ? (
        <Image
          src={previewSrc}
          alt=""
          fill
          unoptimized
          className="object-cover transition-transform hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_58%),linear-gradient(180deg,#151922_0%,#0E1014_100%)] px-3 text-center">
          <div>
            <p className="text-[9px] uppercase tracking-[0.16em] text-[#8D919B]">Shot {String(index + 1).padStart(2, "0")}</p>
            <p className="mt-1 text-[10px] text-[#C3B8AA]">No thumbnail</p>
          </div>
        </div>
      )}
    </div>
  ) : null

  return (
    <article
      ref={cardRef}
      data-director-shot-id={shot.id}
      className={`rounded-[18px] border p-3 text-[#E5E0DB] transition-[border-color,background,box-shadow] duration-100 ease-out ${selected ? "border-[#DCC7A3]/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.07)_0%,rgba(255,255,255,0.04)_100%)] shadow-[0_0_0_1px_rgba(220,199,163,0.16),0_0_0_6px_rgba(212,168,83,0.08),0_24px_52px_rgba(0,0,0,0.24)]" : "border-white/8 bg-white/3 shadow-[0_20px_45px_rgba(0,0,0,0.18)] hover:border-white/10 hover:bg-white/4 hover:shadow-[0_22px_48px_rgba(0,0,0,0.2)]"}`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className={`text-[10px] uppercase tracking-[0.18em] ${selected ? "text-[#E4D0AC]" : "text-[#8D919B]"}`}>Shot {String(index + 1).padStart(2, "0")}</p>
          {/* Modifier type selector */}
          <select
            value={(shot as TimelineShot & { _modifierType?: string })._modifierType || "default"}
            onChange={(e) => {
              e.stopPropagation()
              // Store modifier type on shot for now (will move to block.modifier later)
              onUpdate({ notes: `[modifier:${e.target.value}] ${shot.notes.replace(/\[modifier:\w+\]\s*/, "")}` } as Partial<TimelineShot>)
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-6 rounded border border-white/10 bg-white/5 px-1.5 text-[9px] uppercase tracking-wider text-white/50 outline-none hover:bg-white/8 cursor-pointer"
          >
            <option value="default">Default</option>
            <option value="ai-avatar">AI Avatar</option>
            <option value="b-roll">B-Roll</option>
            <option value="effect">Effect</option>
            <option value="title-card">Title Card</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onEnhance() }}
            disabled={isEnhancing || !shot.caption.trim()}
            className="flex h-8 items-center gap-1 rounded-md border border-white/10 bg-white/4 px-2 text-[10px] uppercase tracking-[0.14em] text-[#D7CDC1] transition-colors hover:bg-white/7 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isEnhancing ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
            Enhance
          </button>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onBuild() }}
            disabled={isBuilding || !shot.caption.trim()}
            className="flex h-8 items-center gap-1 rounded-md border border-[#D4A853]/20 bg-[#D4A853]/8 px-2 text-[10px] uppercase tracking-[0.14em] text-[#D4A853] transition-colors hover:bg-[#D4A853]/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isBuilding ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
            Build
          </button>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onDuplicate() }}
            disabled={!canDuplicate}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/4 text-white/55 transition-colors hover:bg-white/7 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Duplicate shot"
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onDelete() }}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-red-400/20 bg-red-400/6 text-red-200/80 transition-colors hover:bg-red-400/10 hover:text-red-100"
            aria-label="Delete shot"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {isSingleFieldMode ? (
        <div className={`mt-3 flex h-40 items-stretch ${showThumbnail ? "gap-4" : "gap-0"}`}>
          <div className="min-w-0 flex-1 rounded-2xl border border-white/8 bg-white/3 px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[11px] uppercase tracking-[0.18em] text-[#8D919B]">{singleFieldConfig.label}</span>
            </div>
            <DebouncedTextarea
              value={singleFieldConfig.value}
              onCommit={singleFieldConfig.onCommit}
              placeholder={singleFieldConfig.placeholder}
              rows={6}
              autoFocusRequested={singleFieldConfig.autoFocusRequested}
              dataFocusId={singleFieldConfig.dataFocusId}
              className={`h-full min-h-0 w-full resize-none overflow-y-auto bg-transparent px-0 py-0 text-[14px] leading-6 outline-none placeholder:text-white/20 ${singleFieldConfig.textClassName}`}
            />
          </div>

          {previewPanel}
        </div>
      ) : (
        <div className={`mt-2.5 flex items-start ${showThumbnail ? "gap-4" : "gap-0"}`}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-1.5">
            {!isSingleFieldMode && showAction ? (
            <div className={`flex gap-3 rounded-xl border px-3 transition-[border-color,background-color] duration-100 ease-out ${selected ? "border-[#DCC7A3]/22 bg-white/5" : "border-white/8 bg-white/3"} ${isSplitCompactFields ? "items-start py-2" : "items-center py-1.5 min-h-10"}`}>
              <span className={`w-20 shrink-0 text-[11px] uppercase tracking-[0.18em] text-[#8D919B] ${isSplitCompactFields ? "pt-1" : ""}`}>Action</span>
              <DebouncedTextarea
                value={shot.caption}
                onCommit={(value) => onUpdate({ caption: value })}
                placeholder="Describe the shot action..."
                rows={1}
                autoFocusRequested={autoFocusAction}
                dataFocusId={`director-action-${shot.id}`}
                autoGrow={isSplitCompactFields}
                className={`w-full bg-transparent px-0 py-0 text-[13px] leading-5 text-[#ECE5D8] outline-none placeholder:text-white/20 ${isSplitCompactFields ? "min-h-5 resize-none overflow-hidden" : "h-6 resize-none overflow-hidden"}`}
              />
            </div>
            ) : null}

            {!isSingleFieldMode && showDirector ? (
            <div className={`flex gap-3 rounded-xl border px-3 transition-[border-color,background-color] duration-100 ease-out ${selected ? "border-[#DCC7A3]/22 bg-white/5" : "border-white/8 bg-white/3"} ${isSplitCompactFields ? "items-start py-2" : "items-center py-1.5 min-h-10"}`}>
              <span className={`w-20 shrink-0 text-[11px] uppercase tracking-[0.18em] text-[#8D919B] ${isSplitCompactFields ? "pt-1" : ""}`}>Director</span>
              <DebouncedTextarea
                value={shot.directorNote}
                onCommit={(value) => onUpdate({ directorNote: value })}
                placeholder="Director notes..."
                rows={1}
                autoGrow={isSplitCompactFields}
                className={`w-full bg-transparent px-0 py-0 text-[13px] leading-5 text-[#D8D0C3] outline-none placeholder:text-white/20 ${isSplitCompactFields ? "min-h-5 resize-none overflow-hidden" : "h-6 resize-none overflow-hidden"}`}
              />
            </div>
            ) : null}

            {!isSingleFieldMode && showCamera ? (
            <div className={`flex gap-3 rounded-xl border px-3 transition-[border-color,background-color] duration-100 ease-out ${selected ? "border-[#DCC7A3]/22 bg-white/5" : "border-white/8 bg-white/3"} ${isSplitCompactFields ? "items-start py-2" : "items-center py-1.5 min-h-10"}`}>
              <span className={`w-20 shrink-0 text-[11px] uppercase tracking-[0.18em] text-[#8D919B] ${isSplitCompactFields ? "pt-1" : ""}`}>Camera</span>
              <DebouncedTextarea
                value={shot.cameraNote}
                onCommit={(value) => onUpdate({ cameraNote: value })}
                placeholder="DP notes..."
                rows={1}
                autoGrow={isSplitCompactFields}
                className={`w-full bg-transparent px-0 py-0 text-[13px] leading-5 text-[#D8D0C3] outline-none placeholder:text-white/20 ${isSplitCompactFields ? "min-h-5 resize-none overflow-hidden" : "h-6 resize-none overflow-hidden"}`}
              />
            </div>
            ) : null}

            {/* ── Bible pills: toggle entities for this shot ── */}
            {!isSingleFieldMode && (() => {
              const excluded = new Set(shot.excludedBibleIds ?? [])
              const allEntries = [
                ...bibleChars.map((c) => ({ id: `char-${c.id}`, label: c.name, type: "char" as const, imageUrl: c.generatedPortraitUrl, prompt: c.appearancePrompt })),
                ...bibleLocs.map((l) => ({ id: `loc-${l.id}`, label: l.name, type: "loc" as const, imageUrl: l.generatedImageUrl, prompt: l.appearancePrompt })),
                ...bibleProps.map((p) => ({ id: `prop-${p.id}`, label: p.name, type: "prop" as const, imageUrl: p.generatedImageUrl, prompt: p.appearancePrompt })),
              ]
              if (allEntries.length === 0) return null
              return (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {allEntries.map((entry) => {
                    const isOff = excluded.has(entry.id)
                    return (
                      <div key={entry.id} className="group/pill relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            const next = new Set(excluded)
                            if (isOff) next.delete(entry.id)
                            else next.add(entry.id)
                            onUpdate({ excludedBibleIds: Array.from(next) })
                          }}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] transition-colors ${
                            isOff
                              ? "bg-white/3 text-white/20 line-through"
                              : entry.type === "char" ? "bg-[#D4A853]/10 text-[#D4A853]/80"
                              : entry.type === "loc" ? "bg-emerald-500/10 text-emerald-400/70"
                              : "bg-sky-500/10 text-sky-400/70"
                          }`}
                        >
                          {entry.imageUrl && <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-60" />}
                          {entry.label}
                        </button>
                        {/* Hover preview */}
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 rounded-lg border border-white/10 bg-black/90 p-1.5 opacity-0 shadow-xl backdrop-blur-xl transition-opacity group-hover/pill:opacity-100">
                          {entry.imageUrl ? (
                            <img src={entry.imageUrl} alt={entry.label} className="h-16 w-16 rounded-md object-cover" />
                          ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded-md bg-white/5 text-[8px] text-white/30">No image</div>
                          )}
                          <p className="mt-1 max-w-[120px] truncate text-center text-[8px] text-white/50">{entry.prompt || entry.label}</p>
                        </div>
                      </div>
                    )
                  })}
                  {/* Smart Scan — find props from shot text */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSmartScan() }}
                    disabled={isScanning || !shot.caption.trim()}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/8 text-white/25 transition-colors hover:bg-[#D4A853]/10 hover:text-[#D4A853]/60 disabled:opacity-30"
                    title="Smart Scan — найти пропсы в тексте шота"
                  >
                    {isScanning ? <Loader2 size={9} className="animate-spin" /> : <Sparkles size={9} />}
                  </button>
                  {/* Open Bible for this scene */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenBible() }}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/8 text-white/25 transition-colors hover:bg-white/8 hover:text-white/50"
                    title="Открыть библию сцены"
                  >
                    <BookOpen size={9} />
                  </button>
                </div>
              )
            })()}
            </div>
          </div>

          {previewPanel}
        </div>
      )}

      {/* ── Expandable prompt block ── */}
      {!isSingleFieldMode && shot.imagePrompt && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setPromptExpanded((v) => !v) }}
            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-white/25 transition-colors hover:bg-white/3 hover:text-white/40"
          >
            <ChevronRight size={10} className={`transition-transform ${promptExpanded ? "rotate-90" : ""}`} />
            Prompt
            <span className="ml-auto text-[8px] tabular-nums text-white/15">{shot.imagePrompt.length} chars</span>
          </button>
          {promptExpanded && (() => {
            const fullPrompt = buildImagePrompt(shot, bibleChars, bibleLocs, useBoardStore.getState().projectStyle, bibleProps)
            const displayPrompt = showFullPrompt ? fullPrompt : shot.imagePrompt
            return (
              <div className="mt-1 rounded-xl border border-white/6 bg-white/2 px-3 py-2">
                {showFullPrompt ? (
                  <DebouncedTextarea
                    value={fullPrompt}
                    onCommit={(value) => onUpdate({ imagePrompt: value })}
                    rows={4}
                    autoGrow
                    className="w-full resize-none bg-transparent font-[system-ui] text-[11px] leading-[1.6] text-white/60 outline-none placeholder:text-white/20"
                    placeholder="Full prompt..."
                  />
                ) : (
                  <DebouncedTextarea
                    value={shot.imagePrompt}
                    onCommit={(value) => onUpdate({ imagePrompt: value })}
                    rows={3}
                    autoGrow
                    className="w-full resize-none bg-transparent font-[system-ui] text-[11px] leading-[1.6] text-white/50 outline-none placeholder:text-white/20"
                    placeholder="Image prompt..."
                  />
                )}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onGenerate() }}
                    disabled={isGenerating}
                    className="flex h-7 items-center gap-1 rounded-md bg-[#D4A853]/15 px-3 text-[9px] uppercase tracking-[0.12em] text-[#D4A853] transition-colors hover:bg-[#D4A853]/25 disabled:opacity-40"
                  >
                    {isGenerating ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                    Generate
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowFullPrompt((v) => !v) }}
                    className={`flex h-7 items-center rounded-md px-2 text-[9px] uppercase tracking-[0.12em] transition-colors ${showFullPrompt ? "bg-white/8 text-white/50" : "text-white/20 hover:text-white/40"}`}
                  >
                    {showFullPrompt ? "Base" : "Full"}
                  </button>
                  {showFullPrompt && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onUpdate({ imagePrompt: fullPrompt, bakedPrompt: true }); setShowFullPrompt(false) }}
                      className="flex h-7 items-center rounded-md px-2 text-[9px] uppercase tracking-[0.12em] text-white/20 transition-colors hover:text-white/40"
                    >
                      Bake
                    </button>
                  )}
                  {shot.videoPrompt && (
                    <span className="text-[8px] text-white/15">+ video prompt</span>
                  )}
                  <span className="ml-auto text-[8px] tabular-nums text-white/15">{displayPrompt.length} chars</span>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </article>
  )
}

// ── AI Image Generation ─────────────────────────────────────────

export async function generateShotImage(
  shot: TimelineShot,
): Promise<{ objectUrl: string; blobKey: string | null }> {
  const { characters, locations, props: bibleProps } = useBibleStore.getState()
  const { selectedImageGenModel, projectStyle } = useBoardStore.getState()
  const selectedModel = selectedImageGenModel || "nano-banana-2"
  const start = Date.now()
  const group = `generate-${shot.id}`
  const references = getShotGenerationReferenceImages(shot, characters, locations)
  const referenceImages = await convertReferenceImagesToDataUrls(references)
  const { characters: mentionedChars, location } = getReferencedBibleEntries(shot, characters, locations, bibleProps)
  const charRefs = mentionedChars
    .map((character) => `${character.name}: ${character.appearancePrompt || character.description || "no description"}`)
    .join("\n")
  const locRef = location?.appearancePrompt || location?.description || location?.name || ""

  devlog.image("image_start", `Generate: ${shot.label}`, "", {
    shotId: shot.id,
    shotSize: shot.shotSize,
    model: selectedModel,
  }, group)

  const referenceInstruction = referenceImages.length > 0
    ? "Use the provided reference images as hard visual anchors. Preserve the exact face identity, hair, costume silhouette, proportions, and environment design from those references. Do not redesign recurring characters or locations."
    : ""
  const prompt = [
    buildImagePrompt(shot, characters, locations, projectStyle, bibleProps),
    referenceInstruction,
  ].filter(Boolean).join("\n\n")

  devlog.image("image_prompt", "Image prompt", prompt, {
    promptLength: prompt.length,
  }, group)

  devlog.image("image_bible_inject", "Bible data injected", `Characters: ${charRefs || "none"}\nLocation: ${locRef || "none"}`, {
    characterCount: mentionedChars.length,
    hasLocation: !!locRef,
  }, group)

  devlog.image("image_style_inject", "Style", projectStyle, {}, group)

  let apiUrl: string
  let body: { prompt: string; model?: string; referenceImages?: string[]; stylePrompt?: string }

  if (selectedModel === "gpt-image") {
    apiUrl = "/api/gpt-image"
    body = { prompt, referenceImages }
  } else {
    apiUrl = "/api/nano-banana"
    body = { prompt, model: selectedModel, referenceImages, stylePrompt: projectStyle || undefined }
  }

  devlog.image("image_api_call", `API call: ${apiUrl}`, JSON.stringify(body, null, 2), {
    model: selectedModel,
    endpoint: apiUrl,
  }, group)

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error((err as { error?: string }).error || `Generation failed: ${response.status}`)
    }

    const respContentType = response.headers.get("content-type") || ""
    if (respContentType.includes("application/json")) {
      const err = await response.json()
      throw new Error((err as { error?: string }).error || "API returned JSON instead of image")
    }

    console.log("[KOZA] Image response received, reading arrayBuffer...")
    const arrayBuffer = await response.arrayBuffer()
    const blob = new Blob([arrayBuffer], { type: respContentType || "image/png" })
    console.log(`[KOZA] Blob created: ${blob.size} bytes, type: ${blob.type}`)
    if (blob.size < 1000) {
      throw new Error(`Image too small (${blob.size} bytes), likely an error response`)
    }
    const blobKey = `shot-thumb-${shot.id}-${Date.now()}`
    let persisted = false
    try {
      persisted = await trySaveBlob(blobKey, blob)
    } catch (e) {
      console.warn("[KOZA] trySaveBlob failed, continuing without persistence:", e)
    }

    const projectId = useProjectsStore.getState().activeProjectId || "global"
    const objectUrl = URL.createObjectURL(blob)

    useLibraryStore.getState().addFile({
      id: blobKey,
      name: `${shot.label || "Shot"} — generated.png`,
      type: "image",
      mimeType: "image/png",
      size: blob.size,
      url: objectUrl,
      thumbnailUrl: objectUrl,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: ["generated", "storyboard"],
      projectId,
      folder: "/storyboard",
      origin: "generated",
    })

    devlog.image("image_result", `Generated in ${Date.now() - start}ms`, "", {
      timing: Date.now() - start,
      blobSize: blob.size,
      model: selectedModel,
      persisted,
    }, group)

    if (!persisted) {
      devlog.warn("Image cache unavailable", "The image was generated, but local blob persistence failed. The preview will work until reload.", {
        shotId: shot.id,
        model: selectedModel,
      })
    }

    console.log(`[KOZA] Image generated in ${Date.now() - start}ms via ${selectedModel}`)

    return { objectUrl, blobKey: persisted ? blobKey : null }
  } catch (error) {
    devlog.image("image_error", "Generation failed", String(error), {
      shotId: shot.id,
      model: selectedModel,
    }, group)
    throw error
  }
}

interface StoryboardPanelProps {
  isOpen: boolean
  isExpanded: boolean
  panelWidth: number
  backgroundColor: string
  onClose: () => void
  onToggleExpanded: () => void
}

// EmbeddedTrackView extracted to ./EmbeddedTrackView.tsx
// DirectorShotCard and related components follow below

