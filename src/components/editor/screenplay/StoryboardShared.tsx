"use client"

import Image from "next/image"
import { Loader2, Plus, Sparkles, Wand2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useBibleStore } from "@/store/bible"
import { useBoardStore } from "@/store/board"
import { trySaveBlob } from "@/lib/fileStorage"
import type { CharacterEntry, LocationEntry, PropEntry } from "@/lib/bibleParser"

const BIBLE_STYLE_PRESETS = [
  { id: "cinematic", label: "Cinematic", prompt: "Cinematic portrait, studio lighting, dark background, film still" },
  { id: "realistic", label: "Realistic", prompt: "Photorealistic, natural lighting, ARRI Alexa look, subtle film grain" },
  { id: "noir", label: "Film Noir", prompt: "Film noir, high contrast black and white, dramatic shadows" },
  { id: "anime", label: "Anime", prompt: "Anime style, cel shading, dramatic lighting" },
  { id: "sketch", label: "Sketch", prompt: "Pencil sketch, clean lines, storyboard style, white background" },
  { id: "watercolor", label: "Watercolor", prompt: "Watercolor illustration, soft washes, muted palette" },
] as const

export async function generateBibleImageFromModal(prompt: string, model: string, referenceImages: string[] = []): Promise<Blob> {
  const apiUrl = model === "gpt-image" ? "/api/gpt-image" : "/api/nano-banana"
  const body = model === "gpt-image" ? { prompt, referenceImages } : { prompt, model, referenceImages }

  console.log("[SceneBible] Generating:", { apiUrl, model, promptLength: prompt.length, prompt: prompt.slice(0, 200) })

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    console.error("[SceneBible] Generation failed:", response.status, errorText)
    let errorMsg = `Generation failed: ${response.status}`
    try { const parsed = JSON.parse(errorText); if (parsed.error) errorMsg = parsed.error } catch {}
    throw new Error(errorMsg)
  }

  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("image")) {
    const text = await response.text()
    console.error("[SceneBible] Non-image response:", text.slice(0, 300))
    throw new Error("No image generated")
  }

  return response.blob()
}

export function EditableDuration({ durationMs, onChange }: { durationMs: number; onChange: (ms: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startMs: number } | null>(null)
  const seconds = (durationMs / 1000).toFixed(1)

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startMs: durationMs }
    setDragging(true)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    // 10px = 0.1s (100ms)
    const deltaMs = Math.round(dx / 10) * 100
    const next = Math.max(500, Math.min(60000, dragRef.current.startMs + deltaMs))
    if (next !== durationMs) onChange(next)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    const wasDrag = dragRef.current && Math.abs(e.clientX - dragRef.current.startX) > 3
    dragRef.current = null
    setDragging(false)
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    if (!wasDrag) {
      setDraft(seconds)
      setEditing(true)
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false)
          const parsed = parseFloat(draft)
          if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 60) {
            onChange(Math.round(parsed * 1000))
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          if (e.key === "Escape") setEditing(false)
        }}
        className="w-10 rounded border border-[#D4A853]/30 bg-black/40 px-1 py-0 text-center text-[10px] tabular-nums text-[#D4A853] outline-none"
      />
    )
  }

  return (
    <span
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`select-none tabular-nums text-[10px] transition-colors ${dragging ? "cursor-ew-resize text-[#D4A853]" : "cursor-ew-resize text-[#6B7280] hover:text-[#D4A853]"}`}
      title="Click to type · Drag to scrub"
    >
      {seconds}s
    </span>
  )
}

export function BibleEntryCard({
  name,
  imageUrl,
  appearancePrompt,
  generating,
  onGenerate,
  onGenerateWithPrompt,
  onUpload,
  onUpdatePrompt,
  onRemove,
}: {
  name: string
  imageUrl: string | null
  appearancePrompt: string
  generating: boolean
  onGenerate: () => void
  onGenerateWithPrompt?: (customPrompt: string, refUrl: string | null) => void
  onUpload: (file: File) => void
  onUpdatePrompt: (value: string) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [promptDraft, setPromptDraft] = useState(appearancePrompt)
  const [varMode, setVarMode] = useState(false)
  const [varPrompt, setVarPrompt] = useState("")
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => { setPromptDraft(appearancePrompt) }, [appearancePrompt])

  // Handle drop — file from OS or dragged image URL from another card
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    // File drop
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith("image/")) { onUpload(file); return }
    // URL drop (from another bible card drag)
    const url = e.dataTransfer.getData("text/plain")
    if (url && (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("http"))) {
      // Use as reference for variation generation
      if (onGenerateWithPrompt) {
        setVarMode(true)
        // Pre-fill with hint
        setVarPrompt("")
        // Store the dropped ref URL for later use
        ;(window as unknown as Record<string, string>).__droppedRefUrl = url
      }
    }
  }

  return (
    <div className="group/card rounded-xl border border-white/8 bg-white/3 p-2 transition-all hover:bg-white/4">
      {/* Image */}
      <div
        className={`group/img relative aspect-square w-full overflow-hidden rounded-lg border bg-white/3 transition-colors ${dragOver ? "border-[#D4A853] bg-[#D4A853]/10" : "border-white/6"}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {imageUrl ? (
          <Image
            src={imageUrl} alt={name} fill unoptimized className="object-cover"
            draggable
            onDragStart={(e) => { e.dataTransfer.setData("text/plain", imageUrl); e.dataTransfer.effectAllowed = "copy" }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/12">
            <span className="text-[24px]">{dragOver ? "↓" : "?"}</span>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/55 opacity-0 transition-opacity group-hover/img:opacity-100">
          <button type="button" onClick={onGenerate} disabled={generating} className="rounded-full border border-white/12 bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20 disabled:opacity-50" title="Генерация">
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          </button>
          {onGenerateWithPrompt && imageUrl && (
            <button type="button" onClick={() => setVarMode(true)} disabled={generating} className="rounded-full border border-white/12 bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20 disabled:opacity-50" title="Вариация с промптом">
              <Sparkles className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" onClick={() => inputRef.current?.click()} disabled={generating} className="rounded-full border border-white/12 bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20 disabled:opacity-50" title="Загрузить">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {generating && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
        )}
        {/* Remove button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white/50 opacity-0 transition-opacity hover:bg-red-900/80 hover:text-red-300 group-hover/img:opacity-100"
          title="Убрать из сцены"
        >
          <X size={10} />
        </button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = "" }} />
      </div>

      {/* Variation prompt input */}
      {varMode && (
        <div className="mt-1.5 rounded-lg border border-[#D4A853]/20 bg-[#D4A853]/5 p-1.5">
          <p className="mb-1 text-[8px] uppercase tracking-[0.1em] text-[#D4A853]/50">Вариация</p>
          <textarea
            autoFocus
            rows={2}
            value={varPrompt}
            onChange={(e) => setVarPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && varPrompt.trim()) {
                e.preventDefault()
                const droppedRef = (window as unknown as Record<string, string>).__droppedRefUrl
                const refUrl = droppedRef || imageUrl
                delete (window as unknown as Record<string, string>).__droppedRefUrl
                onGenerateWithPrompt?.(varPrompt.trim(), refUrl)
                setVarMode(false)
                setVarPrompt("")
              }
              if (e.key === "Escape") { setVarMode(false); setVarPrompt("") }
            }}
            className="w-full resize-none rounded border border-white/10 bg-black/30 px-1.5 py-1 text-[9px] leading-3 text-white outline-none placeholder:text-white/20"
            placeholder="другой ракурс, красное пальто..."
          />
          <div className="mt-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (varPrompt.trim()) {
                  const droppedRef = (window as unknown as Record<string, string>).__droppedRefUrl
                  const refUrl = droppedRef || imageUrl
                  delete (window as unknown as Record<string, string>).__droppedRefUrl
                  onGenerateWithPrompt?.(varPrompt.trim(), refUrl)
                  setVarMode(false)
                  setVarPrompt("")
                }
              }}
              disabled={!varPrompt.trim() || generating}
              className="flex items-center gap-1 rounded bg-[#D4A853]/15 px-2 py-0.5 text-[8px] text-[#D4A853] transition-colors hover:bg-[#D4A853]/25 disabled:opacity-40"
            >
              <Wand2 size={8} /> Генерировать
            </button>
            <button type="button" onClick={() => { setVarMode(false); setVarPrompt("") }} className="text-[8px] text-white/25 hover:text-white/50">Отмена</button>
          </div>
        </div>
      )}

      {/* Name + prompt */}
      <div className="mt-1.5 px-0.5">
        <h3 className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-white">{name}</h3>
        {editingPrompt ? (
          <textarea
            autoFocus
            rows={2}
            value={promptDraft}
            onChange={(e) => setPromptDraft(e.target.value)}
            onBlur={() => { setEditingPrompt(false); if (promptDraft !== appearancePrompt) onUpdatePrompt(promptDraft) }}
            className="mt-1 w-full resize-none rounded border border-white/10 bg-white/4 px-1.5 py-1 text-[9px] leading-3 text-white outline-none placeholder:text-white/20"
            placeholder="Visual prompt..."
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingPrompt(true)}
            className="mt-0.5 w-full truncate text-left text-[9px] text-white/35 transition-colors hover:text-white/60"
          >
            {appearancePrompt || <span className="text-white/15">Visual prompt...</span>}
          </button>
        )}
      </div>
    </div>
  )
}

export function SceneBibleBubble({
  sceneId,
  sceneIndex,
  sceneTitle,
  sceneBlockIds,
  characters,
  locations,
  props,
  blocks,
  onClose,
}: {
  sceneId: string
  sceneIndex: number
  sceneTitle: string
  sceneBlockIds: string[]
  characters: CharacterEntry[]
  locations: LocationEntry[]
  props: PropEntry[]
  blocks: Array<{ id: string; type: string; text: string }>
  onClose: () => void
}) {
  const sceneChars = characters.filter((c) => c.sceneIds.includes(sceneId))
  const sceneLocs = locations.filter((l) => l.sceneIds.includes(sceneId))
  const sceneProps = props.filter((p) => p.sceneIds.includes(sceneId))
  const ref = useRef<HTMLDivElement>(null)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [suggestions, setSuggestions] = useState<Array<{ name: string; appearancePrompt: string; reason: string }>>([])
  const updateCharacter = useBibleStore((s) => s.updateCharacter)
  const updateLocation = useBibleStore((s) => s.updateLocation)
  const updateProp = useBibleStore((s) => s.updateProp)
  const addProp = useBibleStore((s) => s.addProp)
  const bibleStyle = useBoardStore((s) => s.bibleStyle)
  const setBibleStyle = useBoardStore((s) => s.setBibleStyle)
  const selectedModel = useBoardStore((s) => s.selectedImageGenModel) || "nano-banana-2"
  const [generatingAll, setGeneratingAll] = useState(false)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [onClose])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [onClose])

  const handleCharGen = async (c: CharacterEntry) => {
    setGeneratingId(c.id)
    try {
      const style = bibleStyle.trim() || "Cinematic portrait, studio lighting, dark background, film still"
      const prompt = `Cinematic portrait photograph. ${c.appearancePrompt || c.name}. ${style}. Portrait framing, head and shoulders. No text.`
      const blob = await generateBibleImageFromModal(prompt, selectedModel)
      const blobKey = `bible-char-${c.id}-${Date.now()}`
      const persisted = await trySaveBlob(blobKey, blob)
      const url = URL.createObjectURL(blob)
      updateCharacter(c.id, { generatedPortraitUrl: url, portraitBlobKey: persisted ? blobKey : null, canonicalImageId: c.canonicalImageId ?? "__generated_primary__" })
    } catch (err) { console.error("Bible char gen error:", err) }
    finally { setGeneratingId(null) }
  }

  const handleLocGen = async (l: LocationEntry) => {
    setGeneratingId(l.id)
    try {
      const style = bibleStyle.trim() || "Cinematic portrait, studio lighting, dark background, film still"
      const prompt = `Cinematic wide shot of location: ${l.appearancePrompt || l.name}. ${l.intExt === "INT" ? "Interior" : "Exterior"}. ${style}. Wide environmental frame. No text. No people.`
      const blob = await generateBibleImageFromModal(prompt, selectedModel)
      const blobKey = `bible-location-${l.id}-${Date.now()}`
      const persisted = await trySaveBlob(blobKey, blob)
      const url = URL.createObjectURL(blob)
      updateLocation(l.id, { generatedImageUrl: url, imageBlobKey: persisted ? blobKey : null, canonicalImageId: l.canonicalImageId ?? "__generated_primary__" })
    } catch (err) { console.error("Bible loc gen error:", err) }
    finally { setGeneratingId(null) }
  }

  const handlePropGen = async (p: PropEntry) => {
    setGeneratingId(p.id)
    try {
      const style = bibleStyle.trim() || "Cinematic portrait, studio lighting, dark background, film still"
      const prompt = `Cinematic film still of a real full-size prop: ${p.appearancePrompt || p.name}. ${style}. Photographed on set, real-world scale. Uniform dark background, no distracting elements. Cinematic lighting. NOT a miniature, NOT a toy. No text.`
      const blob = await generateBibleImageFromModal(prompt, selectedModel)
      const blobKey = `bible-prop-${p.id}-${Date.now()}`
      const persisted = await trySaveBlob(blobKey, blob)
      const url = URL.createObjectURL(blob)
      updateProp(p.id, { generatedImageUrl: url, imageBlobKey: persisted ? blobKey : null, canonicalImageId: p.canonicalImageId ?? "__generated_primary__" })
    } catch (err) { console.error("Bible prop gen error:", err) }
    finally { setGeneratingId(null) }
  }

  const handleUpload = async (id: string, type: "char" | "loc" | "prop", file: File) => {
    const blobKey = `bible-${type}-${id}-${Date.now()}`
    const persisted = await trySaveBlob(blobKey, file)
    const url = URL.createObjectURL(file)
    if (type === "char") updateCharacter(id, { generatedPortraitUrl: url, portraitBlobKey: persisted ? blobKey : null, canonicalImageId: "__generated_primary__" })
    else if (type === "loc") updateLocation(id, { generatedImageUrl: url, imageBlobKey: persisted ? blobKey : null, canonicalImageId: "__generated_primary__" })
    else updateProp(id, { generatedImageUrl: url, imageBlobKey: persisted ? blobKey : null, canonicalImageId: "__generated_primary__" })
  }

  const handleRemoveFromScene = (id: string, type: "char" | "loc" | "prop") => {
    if (type === "char") {
      const c = characters.find((x) => x.id === id)
      if (c) updateCharacter(id, { sceneIds: c.sceneIds.filter((s) => s !== sceneId) })
    } else if (type === "loc") {
      const l = locations.find((x) => x.id === id)
      if (l) updateLocation(id, { sceneIds: l.sceneIds.filter((s) => s !== sceneId) })
    } else {
      const p = props.find((x) => x.id === id)
      if (p) updateProp(id, { sceneIds: p.sceneIds.filter((s) => s !== sceneId) })
    }
  }

  const handleVariationGen = async (id: string, type: "char" | "loc" | "prop", customPrompt: string, refUrl: string | null) => {
    setGeneratingId(id)
    try {
      const style = bibleStyle.trim() || "Cinematic portrait, studio lighting, dark background, film still"
      let refImages: string[] = []
      if (refUrl) {
        try {
          const resp = await fetch(refUrl)
          const blob = await resp.blob()
          const dataUrl = await new Promise<string>((resolve) => { const r = new FileReader(); r.onloadend = () => resolve(r.result as string); r.readAsDataURL(blob) })
          refImages = [dataUrl]
        } catch {}
      }
      const baseDesc = type === "char"
        ? (characters.find((c) => c.id === id)?.appearancePrompt || "")
        : type === "loc"
          ? (locations.find((l) => l.id === id)?.appearancePrompt || "")
          : (props.find((p) => p.id === id)?.appearancePrompt || "")
      const prompt = `${customPrompt}. Based on: ${baseDesc}. ${style}. ${refImages.length > 0 ? "Use the reference image as visual anchor for identity and style." : ""} No text.`
      const blob = await generateBibleImageFromModal(prompt, selectedModel, refImages)
      const blobKey = `bible-var-${type}-${id}-${Date.now()}`
      const persisted = await trySaveBlob(blobKey, blob)
      const url = URL.createObjectURL(blob)
      if (type === "char") updateCharacter(id, { generatedPortraitUrl: url, portraitBlobKey: persisted ? blobKey : null })
      else if (type === "loc") updateLocation(id, { generatedImageUrl: url, imageBlobKey: persisted ? blobKey : null })
      else updateProp(id, { generatedImageUrl: url, imageBlobKey: persisted ? blobKey : null })
    } catch (err) { console.error("Variation gen error:", err) }
    finally { setGeneratingId(null) }
  }

  const handleSmartScan = async () => {
    setScanning(true)
    setSuggestions([])
    try {
      const sceneBlocks = blocks.filter((b) => sceneBlockIds.includes(b.id) && (b.type === "action" || b.type === "scene_heading"))
      const sceneText = sceneBlocks.map((b) => b.text).join("\n")

      // Build existing elements context with descriptions for synonym detection
      const existingEntries = [
        ...sceneChars.map((c) => ({ name: c.name, type: "персонаж", prompt: c.appearancePrompt, hasImage: !!c.generatedPortraitUrl })),
        ...sceneLocs.map((l) => ({ name: l.name, type: "локация", prompt: l.appearancePrompt, hasImage: !!l.generatedImageUrl })),
        ...sceneProps.map((p) => ({ name: p.name, type: "предмет", prompt: p.appearancePrompt, hasImage: !!p.generatedImageUrl })),
      ]

      const existingContext = existingEntries.length > 0
        ? existingEntries.map((e) => `- ${e.name} (${e.type})${e.prompt ? `: "${e.prompt}"` : " — без описания"}`).join("\n")
        : "нет"

      // Find entries without descriptions for auto-fill
      const needDescription = existingEntries.filter((e) => !e.prompt.trim())

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `Ты — ассистент реквизитора для киносценария. У тебя две задачи:

ЗАДАЧА 1: Найди НОВЫЕ предметы реквизита в тексте сцены, которых ещё нет в списке.
ВАЖНО: Учитывай синонимы! "машина" = "автомобиль", "шторы" = "занавески" и т.д. Если элемент уже есть под другим именем — НЕ дублируй.

ЗАДАЧА 2: Для элементов БЕЗ описания — допиши визуальное описание по контексту сцены.

Уже найденные элементы:
${existingContext}

${needDescription.length > 0 ? `Элементы без описания (допиши): ${needDescription.map((e) => e.name).join(", ")}` : ""}

Текст сцены:
${sceneText}

Верни JSON:
{
  "newProps": [{"name": "название", "appearancePrompt": "визуальное описание для генерации изображения", "reason": "почему нужен"}],
  "updatedDescriptions": [{"name": "точное имя из списка выше", "appearancePrompt": "визуальное описание для генерации"}]
}

Описания пиши подробно для image generation: материал, цвет, форма, состояние, эпоха.
Только JSON, без markdown. Если нечего — пустые массивы.`,
          }],
          temperature: 0.3,
        }),
      })

      if (!res.ok) return
      const reader = res.body?.getReader()
      if (!reader) return
      const chunks: string[] = []
      while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(new TextDecoder().decode(value)) }
      const raw = chunks.join("").trim()

      // Try to parse as object first, fallback to array
      const jsonMatch = raw.match(/\{[\s\S]*\}/) || raw.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return

      const parsed = JSON.parse(jsonMatch[0])

      // Handle new format { newProps, updatedDescriptions }
      if (parsed.newProps) {
        setSuggestions(parsed.newProps)

        // Auto-apply descriptions to existing elements
        if (parsed.updatedDescriptions) {
          for (const upd of parsed.updatedDescriptions as Array<{ name: string; appearancePrompt: string }>) {
            const char = sceneChars.find((c) => c.name.toLowerCase() === upd.name.toLowerCase())
            if (char && !char.appearancePrompt.trim()) { updateCharacter(char.id, { appearancePrompt: upd.appearancePrompt }); continue }
            const loc = sceneLocs.find((l) => l.name.toLowerCase() === upd.name.toLowerCase())
            if (loc && !loc.appearancePrompt.trim()) { updateLocation(loc.id, { appearancePrompt: upd.appearancePrompt }); continue }
            const prop = sceneProps.find((p) => p.name.toLowerCase() === upd.name.toLowerCase())
            if (prop && !prop.appearancePrompt.trim()) { updateProp(prop.id, { appearancePrompt: upd.appearancePrompt }); continue }
          }
        }
      } else if (Array.isArray(parsed)) {
        // Fallback: old format
        setSuggestions(parsed)
      }
    } catch (err) { console.error("Scene scan error:", err) }
    finally { setScanning(false) }
  }

  const handleAcceptSuggestion = (s: { name: string; appearancePrompt: string }) => {
    const id = s.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-zа-яё0-9-]/gi, "")
    addProp({
      id,
      name: s.name,
      description: "",
      sceneIds: [sceneId],
      referenceImages: [],
      canonicalImageId: null,
      generatedImageUrl: null,
      imageBlobKey: null,
      appearancePrompt: s.appearancePrompt,
    })
    setSuggestions((prev) => prev.filter((x) => x.name !== s.name))
  }

  // Add-new state
  const [addingType, setAddingType] = useState<"char" | "loc" | "prop" | null>(null)
  const [addName, setAddName] = useState("")

  // Characters/locations not in this scene — for quick-add
  const unlinkedChars = characters.filter((c) => !c.sceneIds.includes(sceneId))
  const unlinkedLocs = locations.filter((l) => !l.sceneIds.includes(sceneId))
  const unlinkedProps = props.filter((p) => !p.sceneIds.includes(sceneId))

  const handleAddExisting = (id: string, type: "char" | "loc" | "prop") => {
    if (type === "char") {
      const c = characters.find((x) => x.id === id)
      if (c) updateCharacter(id, { sceneIds: [...c.sceneIds, sceneId] })
    } else if (type === "loc") {
      const l = locations.find((x) => x.id === id)
      if (l) updateLocation(id, { sceneIds: [...l.sceneIds, sceneId] })
    } else {
      const p = props.find((x) => x.id === id)
      if (p) updateProp(id, { sceneIds: [...p.sceneIds, sceneId] })
    }
    setAddingType(null)
    setAddName("")
  }

  const handleAddNew = (type: "char" | "loc" | "prop") => {
    if (!addName.trim()) return
    const id = addName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-zа-яё0-9-]/gi, "")
    if (type === "prop") {
      addProp({ id, name: addName.trim(), description: "", sceneIds: [sceneId], referenceImages: [], canonicalImageId: null, generatedImageUrl: null, imageBlobKey: null, appearancePrompt: "" })
    }
    // For char/loc we just link — they should already exist from screenplay parse
    setAddingType(null)
    setAddName("")
  }

  const isEmpty = sceneChars.length === 0 && sceneLocs.length === 0 && sceneProps.length === 0

  // Items without images
  const missingChars = sceneChars.filter((c) => !c.generatedPortraitUrl)
  const missingLocs = sceneLocs.filter((l) => !l.generatedImageUrl)
  const missingProps = sceneProps.filter((p) => !p.generatedImageUrl)
  const missingCount = missingChars.length + missingLocs.length + missingProps.length

  const handleGenerateAll = async () => {
    setGeneratingAll(true)
    for (const c of missingChars) { await handleCharGen(c) }
    for (const l of missingLocs) { await handleLocGen(l) }
    for (const p of missingProps) { await handlePropGen(p) }
    setGeneratingAll(false)
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={ref}
        className="relative z-10 w-[680px] max-h-[85vh] overflow-y-auto rounded-2xl border border-white/12 bg-[#1A1916] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/8 hover:text-white">
          <X size={14} />
        </button>

        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-[9px] uppercase tracking-[0.18em] text-[#D4A853]/60">Scene Bible</p>
            <p className="mt-1 text-[13px] font-semibold text-white">Scene {sceneIndex}</p>
            <p className="mt-0.5 text-[11px] text-white/40">{sceneTitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {missingCount > 0 && (
              <button
                type="button"
                onClick={() => void handleGenerateAll()}
                disabled={generatingAll || !!generatingId}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#D4A853]/25 bg-[#D4A853]/8 px-3 py-1.5 text-[9px] uppercase tracking-[0.14em] text-[#D4A853] transition-colors hover:bg-[#D4A853]/15 disabled:opacity-50"
              >
                {generatingAll ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                Generate All ({missingCount})
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleSmartScan()}
              disabled={scanning}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[9px] uppercase tracking-[0.14em] text-white/60 transition-colors hover:bg-white/8 disabled:opacity-50"
            >
              {scanning ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
              Smart Scan
            </button>
          </div>
        </div>

        {/* Bible Style Picker */}
        <div className="mb-4 flex items-center gap-1.5">
          <span className="text-[8px] uppercase tracking-[0.14em] text-white/25">Style:</span>
          {BIBLE_STYLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setBibleStyle(preset.prompt)}
              className={`rounded-md px-2 py-1 text-[9px] transition-all ${
                bibleStyle === preset.prompt
                  ? "bg-[#D4A853]/15 text-[#D4A853]"
                  : "text-white/30 hover:bg-white/5 hover:text-white/50"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="mb-4 rounded-xl border border-dashed border-[#D4A853]/25 bg-[#D4A853]/4 p-3">
            <p className="mb-2 text-[9px] uppercase tracking-[0.16em] text-[#D4A853]/50">AI Suggestions · {suggestions.length}</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <div key={s.name} className="flex items-center gap-1.5 rounded-lg bg-black/20 px-2 py-1.5">
                  <span className="text-[10px] text-white/60">{s.name}</span>
                  <button type="button" onClick={() => handleAcceptSuggestion(s)} className="rounded-full bg-[#D4A853]/15 p-0.5 text-[#D4A853] transition-colors hover:bg-[#D4A853]/25" title={s.reason}>
                    <Plus size={10} />
                  </button>
                  <button type="button" onClick={() => setSuggestions((prev) => prev.filter((x) => x.name !== s.name))} className="rounded-full bg-white/5 p-0.5 text-white/30 transition-colors hover:bg-white/10">
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {isEmpty && suggestions.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-white/30">Нет данных для этой сцены. Запустите Smart Scan.</p>
        ) : (
          <div className="space-y-5">
            {/* Персонажи */}
            <div>
              <p className="mb-2 text-[9px] uppercase tracking-[0.16em] text-white/30">Персонажи · {sceneChars.length}</p>
              <div className="grid grid-cols-4 gap-2">
                {sceneChars.map((c) => (
                  <BibleEntryCard
                    key={c.id}
                    name={c.name}
                    imageUrl={c.generatedPortraitUrl}
                    appearancePrompt={c.appearancePrompt}
                    generating={generatingId === c.id}
                    onGenerate={() => void handleCharGen(c)}
                    onGenerateWithPrompt={(prompt, refUrl) => void handleVariationGen(c.id, "char", prompt, refUrl)}
                    onUpload={(file) => void handleUpload(c.id, "char", file)}
                    onUpdatePrompt={(v) => updateCharacter(c.id, { appearancePrompt: v })}
                    onRemove={() => handleRemoveFromScene(c.id, "char")}
                  />
                ))}
                {/* Add character button */}
                <button
                  type="button"
                  onClick={() => setAddingType(addingType === "char" ? null : "char")}
                  className={`flex aspect-square items-center justify-center rounded-xl border border-dashed transition-colors ${addingType === "char" ? "border-[#D4A853]/30 bg-[#D4A853]/5" : "border-white/10 hover:border-white/20"}`}
                >
                  <Plus size={16} className="text-white/20" />
                </button>
              </div>
              {addingType === "char" && unlinkedChars.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg border border-white/8 bg-white/3 p-2">
                  {unlinkedChars.map((c) => (
                    <button key={c.id} type="button" onClick={() => handleAddExisting(c.id, "char")} className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[9px] text-white/50 transition-colors hover:bg-white/10 hover:text-white/80">
                      {c.generatedPortraitUrl && <img src={c.generatedPortraitUrl} alt="" className="h-4 w-4 rounded-full object-cover" />}
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Локации */}
            <div>
              <p className="mb-2 text-[9px] uppercase tracking-[0.16em] text-white/30">Локации · {sceneLocs.length}</p>
              <div className="grid grid-cols-4 gap-2">
                {sceneLocs.map((l) => (
                  <BibleEntryCard
                    key={l.id}
                    name={l.name}
                    imageUrl={l.generatedImageUrl}
                    appearancePrompt={l.appearancePrompt}
                    generating={generatingId === l.id}
                    onGenerate={() => void handleLocGen(l)}
                    onGenerateWithPrompt={(prompt, refUrl) => void handleVariationGen(l.id, "loc", prompt, refUrl)}
                    onUpload={(file) => void handleUpload(l.id, "loc", file)}
                    onUpdatePrompt={(v) => updateLocation(l.id, { appearancePrompt: v })}
                    onRemove={() => handleRemoveFromScene(l.id, "loc")}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setAddingType(addingType === "loc" ? null : "loc")}
                  className={`flex aspect-square items-center justify-center rounded-xl border border-dashed transition-colors ${addingType === "loc" ? "border-[#D4A853]/30 bg-[#D4A853]/5" : "border-white/10 hover:border-white/20"}`}
                >
                  <Plus size={16} className="text-white/20" />
                </button>
              </div>
              {addingType === "loc" && unlinkedLocs.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg border border-white/8 bg-white/3 p-2">
                  {unlinkedLocs.map((l) => (
                    <button key={l.id} type="button" onClick={() => handleAddExisting(l.id, "loc")} className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[9px] text-white/50 transition-colors hover:bg-white/10 hover:text-white/80">
                      {l.generatedImageUrl && <img src={l.generatedImageUrl} alt="" className="h-4 w-4 rounded object-cover" />}
                      {l.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Предметы */}
            <div>
              <p className="mb-2 text-[9px] uppercase tracking-[0.16em] text-white/30">Предметы · {sceneProps.length}</p>
              <div className="grid grid-cols-4 gap-2">
                {sceneProps.map((p) => (
                  <BibleEntryCard
                    key={p.id}
                    name={p.name}
                    imageUrl={p.generatedImageUrl}
                    appearancePrompt={p.appearancePrompt}
                    generating={generatingId === p.id}
                    onGenerate={() => void handlePropGen(p)}
                    onGenerateWithPrompt={(prompt, refUrl) => void handleVariationGen(p.id, "prop", prompt, refUrl)}
                    onUpload={(file) => void handleUpload(p.id, "prop", file)}
                    onUpdatePrompt={(v) => updateProp(p.id, { appearancePrompt: v })}
                    onRemove={() => handleRemoveFromScene(p.id, "prop")}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setAddingType(addingType === "prop" ? null : "prop")}
                  className={`flex aspect-square items-center justify-center rounded-xl border border-dashed transition-colors ${addingType === "prop" ? "border-[#D4A853]/30 bg-[#D4A853]/5" : "border-white/10 hover:border-white/20"}`}
                >
                  <Plus size={16} className="text-white/20" />
                </button>
              </div>
              {addingType === "prop" && (
                <div className="mt-2 rounded-lg border border-white/8 bg-white/3 p-2">
                  {unlinkedProps.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {unlinkedProps.map((p) => (
                        <button key={p.id} type="button" onClick={() => handleAddExisting(p.id, "prop")} className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[9px] text-white/50 transition-colors hover:bg-white/10 hover:text-white/80">
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && addName.trim()) handleAddNew("prop"); if (e.key === "Escape") { setAddingType(null); setAddName("") } }}
                      placeholder="Новый предмет..."
                      className="flex-1 rounded border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-white outline-none placeholder:text-white/20"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddNew("prop")}
                      disabled={!addName.trim()}
                      className="rounded bg-[#D4A853]/15 px-2 py-1 text-[9px] text-[#D4A853] transition-colors hover:bg-[#D4A853]/25 disabled:opacity-30"
                    >
                      Добавить
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
