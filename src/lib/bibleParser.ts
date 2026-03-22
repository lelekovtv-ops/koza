import { type Block } from "@/lib/screenplayFormat"
import { type Scene } from "@/lib/sceneParser"

export interface BibleReferenceImage {
  id: string
  url: string
  blobKey: string
}

export interface CharacterEntry {
  id: string
  name: string
  description: string
  referenceImages: BibleReferenceImage[]
  canonicalImageId: string | null
  generatedPortraitUrl: string | null
  portraitBlobKey: string | null
  appearancePrompt: string
  sceneIds: string[]
  dialogueCount: number
}

export interface LocationEntry {
  id: string
  name: string
  fullHeading: string
  intExt: "INT" | "EXT" | "INT/EXT"
  timeOfDay: string
  description: string
  referenceImages: BibleReferenceImage[]
  canonicalImageId: string | null
  generatedImageUrl: string | null
  imageBlobKey: string | null
  appearancePrompt: string
  sceneIds: string[]
}

type ParsedHeading = {
  name: string
  fullHeading: string
  intExt: "INT" | "EXT" | "INT/EXT"
  timeOfDay: string
}

const CHARACTER_EXTENSION_RE = /\s*\((?:V\.?O\.?|O\.?S\.?|CONT'?D)\)\s*$/gi
const INT_EXT_RE = /^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\.?|EXT\.?|I\/E\.?)/i
const HEADING_SPLIT_RE = /\s+[\-–—]+\s+/

function normalizeCharacterName(text: string): string {
  return text.replace(CHARACTER_EXTENSION_RE, "").replace(/\s{2,}/g, " ").trim()
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function getSceneForBlockId(scenes: Scene[], blockId: string): Scene | undefined {
  return scenes.find((scene) => scene.blockIds.includes(blockId))
}

function parseSceneHeading(text: string): ParsedHeading | null {
  const fullHeading = text.trim()
  if (!fullHeading) return null

  const prefixMatch = fullHeading.match(INT_EXT_RE)
  const rawPrefix = prefixMatch?.[0]?.toUpperCase().replace(/\./g, "") ?? "INT"

  let intExt: "INT" | "EXT" | "INT/EXT" = "INT"
  if (rawPrefix.includes("EXT") && rawPrefix.includes("INT")) {
    intExt = "INT/EXT"
  } else if (rawPrefix.includes("EXT")) {
    intExt = "EXT"
  }

  const withoutPrefix = fullHeading.replace(INT_EXT_RE, "").trim().replace(/^[\s.]+/, "")
  const parts = withoutPrefix.split(HEADING_SPLIT_RE).map((part) => part.trim()).filter(Boolean)
  const timeOfDay = parts.length > 1 ? parts[parts.length - 1] : ""
  const name = (parts.length > 1 ? parts.slice(0, -1) : parts).join(" — ").trim() || withoutPrefix

  return {
    name,
    fullHeading,
    intExt,
    timeOfDay,
  }
}

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "untitled"
}

export function parseCharacters(blocks: Block[]): CharacterEntry[] {
  const characters = new Map<string, CharacterEntry>()

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    if (block.type !== "character") continue

    const name = normalizeCharacterName(block.text)
    if (!name) continue

    const id = slugify(name)
    const existing = characters.get(id)
    let dialogueCount = existing?.dialogueCount ?? 0

    for (let nextIndex = index + 1; nextIndex < blocks.length; nextIndex += 1) {
      const nextBlock = blocks[nextIndex]
      if (nextBlock.type === "parenthetical" || nextBlock.type === "dialogue") {
        dialogueCount += 1
        continue
      }
      break
    }

    characters.set(id, {
      id,
      name,
      description: existing?.description ?? "",
      referenceImages: existing?.referenceImages ?? [],
      canonicalImageId: existing?.canonicalImageId ?? null,
      generatedPortraitUrl: existing?.generatedPortraitUrl ?? null,
      portraitBlobKey: existing?.portraitBlobKey ?? null,
      appearancePrompt: existing?.appearancePrompt ?? "",
      sceneIds: [],
      dialogueCount,
    })
  }

  return Array.from(characters.values()).sort((left, right) => right.dialogueCount - left.dialogueCount || left.name.localeCompare(right.name, "ru"))
}

export function parseLocations(blocks: Block[], scenes: Scene[]): LocationEntry[] {
  const locations = new Map<string, LocationEntry>()
  const scenesByHeadingBlockId = new Map(scenes.map((scene) => [scene.headingBlockId, scene]))

  for (const block of blocks) {
    if (block.type !== "scene_heading") continue

    const parsedHeading = parseSceneHeading(block.text)
    if (!parsedHeading?.name) continue

    const id = slugify(parsedHeading.name)
    const scene = scenesByHeadingBlockId.get(block.id) ?? getSceneForBlockId(scenes, block.id)
    const existing = locations.get(id)
    const nextSceneIds = uniqueStrings([
      ...(existing?.sceneIds ?? []),
      scene?.id ?? "",
    ])

    locations.set(id, {
      id,
      name: parsedHeading.name,
      fullHeading: existing?.fullHeading || parsedHeading.fullHeading,
      intExt: existing?.intExt || parsedHeading.intExt,
      timeOfDay: existing?.timeOfDay || parsedHeading.timeOfDay,
      description: existing?.description ?? "",
      referenceImages: existing?.referenceImages ?? [],
      canonicalImageId: existing?.canonicalImageId ?? null,
      generatedImageUrl: existing?.generatedImageUrl ?? null,
      imageBlobKey: existing?.imageBlobKey ?? null,
      appearancePrompt: existing?.appearancePrompt ?? "",
      sceneIds: nextSceneIds,
    })
  }

  return Array.from(locations.values()).sort((left, right) => left.name.localeCompare(right.name, "ru"))
}

export function linkCharactersToScenes(
  characters: CharacterEntry[],
  blocks: Block[],
  scenes: Scene[],
): CharacterEntry[] {
  const sceneIdsByCharacterId = new Map<string, Set<string>>()

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    if (block.type !== "character") continue

    const name = normalizeCharacterName(block.text)
    if (!name) continue

    const characterId = slugify(name)
    let speaksInThisCue = false

    for (let nextIndex = index + 1; nextIndex < blocks.length; nextIndex += 1) {
      const nextBlock = blocks[nextIndex]
      if (nextBlock.type === "parenthetical") {
        speaksInThisCue = true
        continue
      }
      if (nextBlock.type === "dialogue") {
        speaksInThisCue = true
        continue
      }
      break
    }

    if (!speaksInThisCue) continue

    const scene = getSceneForBlockId(scenes, block.id)
    if (!scene) continue

    if (!sceneIdsByCharacterId.has(characterId)) {
      sceneIdsByCharacterId.set(characterId, new Set())
    }

    sceneIdsByCharacterId.get(characterId)?.add(scene.id)
  }

  return characters.map((character) => ({
    ...character,
    sceneIds: Array.from(sceneIdsByCharacterId.get(character.id) ?? []).sort(),
  }))
}