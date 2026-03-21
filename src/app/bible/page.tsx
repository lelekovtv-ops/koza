"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { BookOpen, Loader2, MapPin, Plus, Upload, User, Wand2 } from "lucide-react"
import { type BibleReferenceImage, type CharacterEntry, type LocationEntry } from "@/lib/bibleParser"
import { deleteBlob, saveBlob } from "@/lib/fileStorage"
import { parseScenes } from "@/lib/sceneParser"
import { useBoardStore } from "@/store/board"
import { useScriptStore } from "@/store/script"
import { useBibleStore } from "@/store/bible"

type BibleTab = "characters" | "locations"

const IMAGE_GEN_MODELS = [
  { id: "gpt-image", label: "GPT Image", price: "$0.04" },
  { id: "nano-banana", label: "NB1", price: "$0.039" },
  { id: "nano-banana-2", label: "NB2", price: "$0.045" },
  { id: "nano-banana-pro", label: "NB Pro", price: "$0.13" },
] as const

function formatSceneCount(count: number): string {
  return `${count} ${count === 1 ? "scene" : "scenes"}`
}

async function generateBibleImage(prompt: string, model: string): Promise<Blob> {
  const apiUrl = model === "gpt-image" ? "/api/gpt-image" : "/api/nano-banana"
  const body = model === "gpt-image" ? { prompt } : { prompt, model }

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

function buildCharacterPrompt(character: CharacterEntry): string {
  const referenceHint = character.referenceImages.length > 0 ? " Matching the reference style." : ""

  if (character.appearancePrompt.trim()) {
    return `Cinematic portrait photograph. ${character.appearancePrompt.trim()}.${referenceHint} Dark moody lighting, film noir style. Head and shoulders, looking into camera. No text.`
  }

  return `Cinematic portrait of a character named ${character.name}.${referenceHint} Dark moody lighting, film noir style. Head and shoulders. No text.`
}

function buildLocationPrompt(location: LocationEntry): string {
  const exteriorLabel = location.intExt === "INT" ? "Interior" : "Exterior"
  const referenceHint = location.referenceImages.length > 0 ? " Matching the reference style." : ""
  return `Cinematic wide shot of location: ${location.appearancePrompt || location.name}. ${exteriorLabel}.${referenceHint} Atmospheric, film noir style. No text. No people.`
}

async function replaceBlobImage(currentUrl: string | null, currentBlobKey: string | null, nextBlobKey: string, blob: Blob): Promise<string> {
  if (currentBlobKey) {
    await deleteBlob(currentBlobKey).catch(() => undefined)
  }

  if (currentUrl) {
    URL.revokeObjectURL(currentUrl)
  }

  await saveBlob(nextBlobKey, blob)
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
  onGenerate,
  onUpload,
}: {
  src: string | null
  alt: string
  badge?: string
  placeholder: React.ReactNode
  generating: boolean
  onGenerate: () => void
  onUpload: () => void
}) {
  return (
    <div className="group/image relative overflow-hidden rounded-xl border border-white/8 bg-white/3">
      <div className="relative aspect-square w-full">
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
        {generating ? (
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
  onAdd,
  onRemove,
}: {
  references: BibleReferenceImage[]
  onAdd: (files: File[]) => void
  onRemove: (reference: BibleReferenceImage) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const atLimit = references.length >= 4

  return (
    <div>
      <p className="mb-2 text-[9px] uppercase tracking-[0.18em] text-white/30">References</p>
      <div className="flex flex-wrap gap-2">
        {references.map((reference) => (
          <div key={reference.id} className="group relative h-12 w-12 overflow-hidden rounded-md border border-white/10">
            <Image src={reference.url} alt="Reference" fill unoptimized className="object-cover" />
            <button
              type="button"
              onClick={() => onRemove(reference)}
              className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100"
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

function CharacterCard({
  entry,
  generating,
  onUpdate,
  onGenerate,
  onUploadPrimary,
  onAddReferences,
  onRemoveReference,
}: {
  entry: CharacterEntry
  generating: boolean
  onUpdate: (patch: Partial<CharacterEntry>) => void
  onGenerate: () => void
  onUploadPrimary: (file: File) => void
  onAddReferences: (files: File[]) => void
  onRemoveReference: (reference: BibleReferenceImage) => void
}) {
  const primaryInputRef = useRef<HTMLInputElement>(null)

  return (
    <article className="w-full max-w-70 rounded-xl border border-white/8 bg-white/2 p-3 transition-all duration-200 hover:bg-white/4">
      <PrimaryImage
        src={entry.generatedPortraitUrl}
        alt={entry.name}
        placeholder={<User className="h-12 w-12" />}
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

      <div className="mt-3 space-y-3">
        <div>
          <h2 className="text-[14px] font-bold uppercase tracking-[0.14em] text-white">{entry.name}</h2>
          <p className="mt-1 text-[10px] text-white/40">{formatSceneCount(entry.sceneIds.length)} · {formatLineCount(entry.dialogueCount)}</p>
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

        <ReferenceStrip
          references={entry.referenceImages}
          onAdd={onAddReferences}
          onRemove={onRemoveReference}
        />
      </div>
    </article>
  )
}

function LocationCard({
  entry,
  generating,
  onUpdate,
  onGenerate,
  onUploadPrimary,
  onAddReferences,
  onRemoveReference,
}: {
  entry: LocationEntry
  generating: boolean
  onUpdate: (patch: Partial<LocationEntry>) => void
  onGenerate: () => void
  onUploadPrimary: (file: File) => void
  onAddReferences: (files: File[]) => void
  onRemoveReference: (reference: BibleReferenceImage) => void
}) {
  const primaryInputRef = useRef<HTMLInputElement>(null)

  return (
    <article className="w-full max-w-70 rounded-xl border border-white/8 bg-white/2 p-3 transition-all duration-200 hover:bg-white/4">
      <PrimaryImage
        src={entry.generatedImageUrl}
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

      <div className="mt-3 space-y-3">
        <div>
          <h2 className="text-[14px] font-bold uppercase tracking-[0.14em] text-white">{entry.name}</h2>
          <p className="mt-1 text-[10px] text-white/40">Used in {formatSceneCount(entry.sceneIds.length)}</p>
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
          onAdd={onAddReferences}
          onRemove={onRemoveReference}
        />
      </div>
    </article>
  )
}

export default function BiblePage() {
  const [activeTab, setActiveTab] = useState<BibleTab>("characters")
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const blocks = useScriptStore((state) => state.blocks)
  const characters = useBibleStore((state) => state.characters)
  const locations = useBibleStore((state) => state.locations)
  const updateFromScreenplay = useBibleStore((state) => state.updateFromScreenplay)
  const updateCharacter = useBibleStore((state) => state.updateCharacter)
  const updateLocation = useBibleStore((state) => state.updateLocation)
  const selectedImageGenModel = useBoardStore((state) => state.selectedImageGenModel)
  const setSelectedImageGenModel = useBoardStore((state) => state.setSelectedImageGenModel)

  const scenes = useMemo(() => parseScenes(blocks), [blocks])

  useEffect(() => {
    updateFromScreenplay(blocks, scenes)
  }, [blocks, scenes, updateFromScreenplay])

  const handleCharacterGenerate = async (character: CharacterEntry) => {
    setGeneratingId(character.id)
    try {
      const prompt = buildCharacterPrompt(character)
      const resBlob = await generateBibleImage(prompt, selectedImageGenModel || "nano-banana-2")
      const blobKey = `bible-char-${character.id}-${Date.now()}`
      const url = await replaceBlobImage(character.generatedPortraitUrl, character.portraitBlobKey, blobKey, resBlob)

      updateCharacter(character.id, {
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
      const prompt = buildLocationPrompt(location)
      const blob = await generateBibleImage(prompt, selectedImageGenModel || "nano-banana-2")
      const blobKey = `bible-location-${location.id}-${Date.now()}`
      const url = await replaceBlobImage(location.generatedImageUrl, location.imageBlobKey, blobKey, blob)

      updateLocation(location.id, {
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
      generatedPortraitUrl: url,
      portraitBlobKey: blobKey,
    })
  }

  const handleLocationPrimaryUpload = async (location: LocationEntry, file: File) => {
    const blobKey = `bible-location-${location.id}-${Date.now()}`
    const url = await replaceBlobImage(location.generatedImageUrl, location.imageBlobKey, blobKey, file)
    updateLocation(location.id, {
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
      referenceImages: [...location.referenceImages, ...newReferences],
    })
  }

  const handleCharacterReferenceRemove = async (character: CharacterEntry, reference: BibleReferenceImage) => {
    await deleteBlob(reference.blobKey).catch(() => undefined)
    URL.revokeObjectURL(reference.url)
    updateCharacter(character.id, {
      referenceImages: character.referenceImages.filter((item) => item.id !== reference.id),
    })
  }

  const handleLocationReferenceRemove = async (location: LocationEntry, reference: BibleReferenceImage) => {
    await deleteBlob(reference.blobKey).catch(() => undefined)
    URL.revokeObjectURL(reference.url)
    updateLocation(location.id, {
      referenceImages: location.referenceImages.filter((item) => item.id !== reference.id),
    })
  }

  return (
    <main className="min-h-screen bg-[#0E0D0B] text-white">
      <div className="mx-auto max-w-7xl p-6">
        <header className="sticky top-0 z-20 mb-6 border-b border-white/8 bg-[#0E0D0B]/92 pb-5 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-white/75 transition-colors hover:bg-white/8 hover:text-white"
            >
              ← Back
            </Link>
            <div className="flex items-center gap-3 text-[#D4A853]">
              <BookOpen className="h-5 w-5" />
              <span className="text-sm uppercase tracking-[0.32em] text-white/65">KOZA BIBLE</span>
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
            <div className="ml-auto flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1">
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
        </header>

        {activeTab === "characters" ? (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {characters.map((entry) => (
              <CharacterCard
                key={entry.id}
                entry={entry}
                generating={generatingId === entry.id}
                onUpdate={(patch) => updateCharacter(entry.id, patch)}
                onGenerate={() => void handleCharacterGenerate(entry)}
                onUploadPrimary={(file) => void handleCharacterPrimaryUpload(entry, file)}
                onAddReferences={(files) => void handleCharacterReferenceAdd(entry, files)}
                onRemoveReference={(reference) => void handleCharacterReferenceRemove(entry, reference)}
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
            {locations.map((entry) => (
              <LocationCard
                key={entry.id}
                entry={entry}
                generating={generatingId === entry.id}
                onUpdate={(patch) => updateLocation(entry.id, patch)}
                onGenerate={() => void handleLocationGenerate(entry)}
                onUploadPrimary={(file) => void handleLocationPrimaryUpload(entry, file)}
                onAddReferences={(files) => void handleLocationReferenceAdd(entry, files)}
                onRemoveReference={(reference) => void handleLocationReferenceRemove(entry, reference)}
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
    </main>
  )
}