import { create } from "zustand"
import { persist } from "zustand/middleware"
import { loadBlob } from "@/lib/fileStorage"
import {
  type BibleReferenceImage,
  type CharacterEntry,
  type LocationEntry,
  linkCharactersToScenes,
  parseCharacters,
  parseLocations,
} from "@/lib/bibleParser"
import { type Scene } from "@/lib/sceneParser"
import { type Block } from "@/lib/screenplayFormat"

interface BibleState {
  characters: CharacterEntry[]
  locations: LocationEntry[]
  updateFromScreenplay: (blocks: Block[], scenes: Scene[]) => void
  updateCharacter: (id: string, patch: Partial<CharacterEntry>) => void
  updateLocation: (id: string, patch: Partial<LocationEntry>) => void
}

export const GENERATED_CANONICAL_IMAGE_ID = "__generated_primary__"

type LegacyReferenceFields = {
  referenceImages?: BibleReferenceImage[]
  referenceImageUrl?: string | null
  referenceBlobKey?: string | null
  canonicalImageId?: string | null
}

function resolveCanonicalImageId(
  entry: LegacyReferenceFields | null | undefined,
  referenceImages: BibleReferenceImage[],
  generatedUrl?: string | null,
): string | null {
  if (entry?.canonicalImageId === GENERATED_CANONICAL_IMAGE_ID && generatedUrl) {
    return GENERATED_CANONICAL_IMAGE_ID
  }

  if (entry?.canonicalImageId && referenceImages.some((image) => image.id === entry.canonicalImageId)) {
    return entry.canonicalImageId
  }

  if (generatedUrl) {
    return GENERATED_CANONICAL_IMAGE_ID
  }

  return referenceImages[0]?.id ?? null
}

function getReferenceImages(entry?: LegacyReferenceFields | null): BibleReferenceImage[] {
  if (!entry) {
    return []
  }

  if (Array.isArray(entry.referenceImages)) {
    return entry.referenceImages
      .filter((image) => image && image.blobKey)
      .map((image) => ({
        id: image.id,
        url: image.url,
        blobKey: image.blobKey,
      }))
  }

  if (entry.referenceImageUrl && entry.referenceBlobKey) {
    return [{
      id: entry.referenceBlobKey,
      url: entry.referenceImageUrl,
      blobKey: entry.referenceBlobKey,
    }]
  }

  return []
}

async function restoreReferenceImages(referenceImages: BibleReferenceImage[]): Promise<BibleReferenceImage[]> {
  return Promise.all(referenceImages.map(async (image) => ({
    ...image,
    url: await loadBlob(image.blobKey).catch(() => image.url) ?? image.url,
  })))
}

async function restorePrimaryImage(blobKey: string | null, fallbackUrl: string | null): Promise<string | null> {
  if (!blobKey) {
    return fallbackUrl
  }

  return await loadBlob(blobKey).catch(() => fallbackUrl) ?? fallbackUrl
}

function mergeCharacters(existing: CharacterEntry[], parsed: CharacterEntry[]): CharacterEntry[] {
  const existingById = new Map(existing.map((entry) => [entry.id, entry]))
  const parsedById = new Map(parsed.map((entry) => [entry.id, entry]))
  const ids = new Set([...existingById.keys(), ...parsedById.keys()])

  return Array.from(ids).map((id) => {
    const current = existingById.get(id)
    const next = parsedById.get(id)
    const currentReferences = getReferenceImages(current)
    const nextReferences = getReferenceImages(next)

    if (!next && current) {
      return {
        ...current,
        sceneIds: [],
        dialogueCount: 0,
      }
    }

    return {
      id,
      name: next?.name ?? current?.name ?? "",
      description: current?.description ?? next?.description ?? "",
      referenceImages: currentReferences.length > 0 ? currentReferences : nextReferences,
      canonicalImageId: resolveCanonicalImageId(
        current ?? next,
        currentReferences.length > 0 ? currentReferences : nextReferences,
        current?.generatedPortraitUrl ?? next?.generatedPortraitUrl ?? null,
      ),
      generatedPortraitUrl: current?.generatedPortraitUrl ?? next?.generatedPortraitUrl ?? null,
      portraitBlobKey: current?.portraitBlobKey ?? next?.portraitBlobKey ?? null,
      appearancePrompt: current?.appearancePrompt ?? next?.appearancePrompt ?? "",
      sceneIds: next?.sceneIds ?? current?.sceneIds ?? [],
      dialogueCount: next?.dialogueCount ?? current?.dialogueCount ?? 0,
    }
  }).sort((left, right) => right.dialogueCount - left.dialogueCount || left.name.localeCompare(right.name, "ru"))
}

function mergeLocations(existing: LocationEntry[], parsed: LocationEntry[]): LocationEntry[] {
  const existingById = new Map(existing.map((entry) => [entry.id, entry]))
  const parsedById = new Map(parsed.map((entry) => [entry.id, entry]))
  const ids = new Set([...existingById.keys(), ...parsedById.keys()])

  return Array.from(ids).map((id) => {
    const current = existingById.get(id)
    const next = parsedById.get(id)
    const currentReferences = getReferenceImages(current)
    const nextReferences = getReferenceImages(next)

    if (!next && current) {
      return {
        ...current,
        sceneIds: [],
      }
    }

    return {
      id,
      name: next?.name ?? current?.name ?? "",
      fullHeading: next?.fullHeading ?? current?.fullHeading ?? "",
      intExt: next?.intExt ?? current?.intExt ?? "INT",
      timeOfDay: next?.timeOfDay ?? current?.timeOfDay ?? "",
      description: current?.description ?? next?.description ?? "",
      referenceImages: currentReferences.length > 0 ? currentReferences : nextReferences,
      canonicalImageId: resolveCanonicalImageId(
        current ?? next,
        currentReferences.length > 0 ? currentReferences : nextReferences,
        current?.generatedImageUrl ?? next?.generatedImageUrl ?? null,
      ),
      generatedImageUrl: current?.generatedImageUrl ?? next?.generatedImageUrl ?? null,
      imageBlobKey: current?.imageBlobKey ?? next?.imageBlobKey ?? null,
      appearancePrompt: current?.appearancePrompt ?? next?.appearancePrompt ?? "",
      sceneIds: next?.sceneIds ?? current?.sceneIds ?? [],
    }
  }).sort((left, right) => left.name.localeCompare(right.name, "ru"))
}

export const useBibleStore = create<BibleState>()(
  persist(
    (set) => ({
      characters: [],
      locations: [],
      updateFromScreenplay: (blocks, scenes) => {
        const characters = linkCharactersToScenes(parseCharacters(blocks), blocks, scenes)
        const locations = parseLocations(blocks, scenes)

        set((state) => ({
          characters: mergeCharacters(state.characters, characters),
          locations: mergeLocations(state.locations, locations),
        }))
      },
      updateCharacter: (id, patch) => {
        set((state) => ({
          characters: state.characters.map((entry) => (
            entry.id === id ? { ...entry, ...patch, id: entry.id } : entry
          )),
        }))
      },
      updateLocation: (id, patch) => {
        set((state) => ({
          locations: state.locations.map((entry) => (
            entry.id === id ? { ...entry, ...patch, id: entry.id } : entry
          )),
        }))
      },
    }),
    {
      name: "koza-bible-v1",
      partialize: (state) => ({
        characters: state.characters,
        locations: state.locations,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return

        void Promise.all([
          Promise.all(state.characters.map(async (entry) => ({
            ...entry,
            referenceImages: await restoreReferenceImages(getReferenceImages(entry)),
            generatedPortraitUrl: await restorePrimaryImage(entry.portraitBlobKey, entry.generatedPortraitUrl),
          }))),
          Promise.all(state.locations.map(async (entry) => ({
            ...entry,
            referenceImages: await restoreReferenceImages(getReferenceImages(entry)),
            generatedImageUrl: await restorePrimaryImage(entry.imageBlobKey, entry.generatedImageUrl),
          }))),
        ]).then(([characters, locations]) => {
          useBibleStore.setState({
            characters,
            locations,
          })
        })
      },
    },
  ),
)