import type { CharacterEntry, LocationEntry } from "@/lib/bibleParser"
import { getCharactersForShot } from "@/lib/promptBuilder"
import { GENERATED_CANONICAL_IMAGE_ID } from "@/store/bible"
import type { TimelineShot } from "@/store/timeline"

export type GenerationReferenceKind = "character" | "location"

export interface GenerationReferenceImage {
  id: string
  url: string
  kind: GenerationReferenceKind
  label: string
}

function pushUniqueReference(
  references: GenerationReferenceImage[],
  nextReference: GenerationReferenceImage,
  seenUrls: Set<string>,
  maxCount: number,
) {
  if (!nextReference.url || seenUrls.has(nextReference.url) || references.length >= maxCount) {
    return
  }

  seenUrls.add(nextReference.url)
  references.push(nextReference)
}

function getCharacterReferenceImages(character: CharacterEntry, maxCount: number): GenerationReferenceImage[] {
  const references: GenerationReferenceImage[] = []
  const seenUrls = new Set<string>()

  const pushGenerated = () => {
    if (!character.generatedPortraitUrl) {
      return
    }

    pushUniqueReference(references, {
      id: GENERATED_CANONICAL_IMAGE_ID,
      url: character.generatedPortraitUrl,
      kind: "character",
      label: character.name,
    }, seenUrls, maxCount)
  }

  const pushReferenceById = (referenceId: string | null) => {
    const image = character.referenceImages.find((entry) => entry.id === referenceId)
    if (!image) {
      return
    }

    pushUniqueReference(references, {
      id: image.id,
      url: image.url,
      kind: "character",
      label: character.name,
    }, seenUrls, maxCount)
  }

  if (character.canonicalImageId === GENERATED_CANONICAL_IMAGE_ID) {
    pushGenerated()
  } else {
    pushReferenceById(character.canonicalImageId)
  }

  if (character.canonicalImageId !== GENERATED_CANONICAL_IMAGE_ID) {
    pushGenerated()
  }

  for (const image of character.referenceImages) {
    pushReferenceById(image.id)
  }

  return references
}

function getLocationReferenceImages(location: LocationEntry, maxCount: number): GenerationReferenceImage[] {
  const references: GenerationReferenceImage[] = []
  const seenUrls = new Set<string>()

  const pushGenerated = () => {
    if (!location.generatedImageUrl) {
      return
    }

    pushUniqueReference(references, {
      id: GENERATED_CANONICAL_IMAGE_ID,
      url: location.generatedImageUrl,
      kind: "location",
      label: location.name,
    }, seenUrls, maxCount)
  }

  const pushReferenceById = (referenceId: string | null) => {
    const image = location.referenceImages.find((entry) => entry.id === referenceId)
    if (!image) {
      return
    }

    pushUniqueReference(references, {
      id: image.id,
      url: image.url,
      kind: "location",
      label: location.name,
    }, seenUrls, maxCount)
  }

  if (location.canonicalImageId === GENERATED_CANONICAL_IMAGE_ID) {
    pushGenerated()
  } else {
    pushReferenceById(location.canonicalImageId)
  }

  if (location.canonicalImageId !== GENERATED_CANONICAL_IMAGE_ID) {
    pushGenerated()
  }

  for (const image of location.referenceImages) {
    pushReferenceById(image.id)
  }

  return references
}

export function getShotGenerationReferenceImages(
  shot: TimelineShot,
  characters: CharacterEntry[],
  locations: LocationEntry[],
): GenerationReferenceImage[] {
  const references: GenerationReferenceImage[] = []
  const seenUrls = new Set<string>()
  const shotCharacters = getCharactersForShot(shot, characters).slice(0, 2)
  const shotLocation = locations.find((entry) => entry.sceneIds.includes(shot.sceneId || "")) || null

  for (const character of shotCharacters) {
    const characterReferences = getCharacterReferenceImages(character, character.generatedPortraitUrl ? 1 : 2)
    for (const reference of characterReferences) {
      pushUniqueReference(references, reference, seenUrls, 5)
    }
  }

  if (shotLocation) {
    for (const reference of getLocationReferenceImages(shotLocation, 2)) {
      pushUniqueReference(references, reference, seenUrls, 5)
    }
  }

  return references
}

export function getCharacterGenerationReferenceImages(character: CharacterEntry): GenerationReferenceImage[] {
  return getCharacterReferenceImages(character, 4)
}

export function getLocationGenerationReferenceImages(location: LocationEntry): GenerationReferenceImage[] {
  return getLocationReferenceImages(location, 4)
}

export async function convertReferenceImagesToDataUrls(
  references: GenerationReferenceImage[],
): Promise<string[]> {
  return Promise.all(references.map(async (reference) => {
    const response = await fetch(reference.url)
    if (!response.ok) {
      throw new Error(`Failed to load reference image: ${reference.label}`)
    }

    const blob = await response.blob()

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result)
          return
        }

        reject(new Error(`Failed to encode reference image: ${reference.label}`))
      }
      reader.onerror = () => reject(reader.error ?? new Error(`Failed to read reference image: ${reference.label}`))
      reader.readAsDataURL(blob)
    })
  }))
}