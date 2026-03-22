import type { CharacterEntry, LocationEntry } from "@/lib/bibleParser"
import { DEFAULT_PROJECT_STYLE } from "@/lib/projectStyle"
import type { TimelineShot } from "@/store/timeline"

function getShotText(shot: TimelineShot): string {
  return [
    shot.caption,
    shot.label,
    shot.notes,
    shot.directorNote,
    shot.cameraNote,
    shot.imagePrompt,
    shot.videoPrompt,
    shot.visualDescription,
  ].join(" ").toLowerCase()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function stripKnownStyleDirective(text: string, style: string): string {
  return text
    .replace(new RegExp(escapeRegExp(style), "ig"), "")
    .replace(/film noir,?\s*high contrast(?:\s+(?:black and white|b&w))?(?:,?\s*(?:dramatic lighting|dramatic chiaroscuro lighting|deep shadows|cinematic still))*[, ]*16:9(?:\.\s*no text\.?)?/gi, "")
    .replace(/cinematic still,?\s*16:9(?:\.\s*no text\.?)?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[\s,.;:]+$/, "")
}

function getLocationForShot(shot: TimelineShot, locations: LocationEntry[]): LocationEntry | null {
  return locations.find((entry) => entry.sceneIds.includes(shot.sceneId || "")) || null
}

function formatCharacterRefs(characters: CharacterEntry[]): string {
  return characters
    .filter((character) => character.appearancePrompt)
    .map((character) => `[${character.name}: ${character.appearancePrompt}]`)
    .join(" ")
}

function hasCharacterVisualAnchors(characters: CharacterEntry[]): boolean {
  return characters.some((character) => Boolean(character.generatedPortraitUrl) || character.referenceImages.length > 0)
}

function hasLocationVisualAnchors(location: LocationEntry | null): boolean {
  return Boolean(location && (location.generatedImageUrl || location.referenceImages.length > 0))
}

export function characterMentionedInShot(character: CharacterEntry, shot: TimelineShot): boolean {
  const shotText = getShotText(shot)
  const name = character.name.toLowerCase()

  if (!name) {
    return false
  }

  if (shotText.includes(name)) {
    return true
  }

  if (name.length >= 4) {
    const stem = name.slice(0, Math.max(4, name.length - 2))
    if (shotText.includes(stem)) {
      return true
    }
  }

  return false
}

export function getCharactersForShot(shot: TimelineShot, characters: CharacterEntry[]): CharacterEntry[] {
  const mentioned = characters.filter((character) => characterMentionedInShot(character, shot))

  if (mentioned.length === 0 && shot.sceneId) {
    return characters.filter((character) => character.sceneIds.includes(shot.sceneId!))
  }

  return mentioned
}

function buildImageStyleSuffix(style: string): string {
  return `${style}. 16:9. No text.`
}

export function buildImagePrompt(
  shot: TimelineShot,
  allShots: TimelineShot[],
  characters: CharacterEntry[],
  locations: LocationEntry[],
  style?: string
): string {
  void allShots
  const artStyle = style || DEFAULT_PROJECT_STYLE
  const shotCharacters = getCharactersForShot(shot, characters)
  const charRefs = formatCharacterRefs(shotCharacters)
  const location = getLocationForShot(shot, locations)

  if (shot.imagePrompt) {
    return [
      shot.imagePrompt,
      charRefs ? `Character reference: ${charRefs}` : "",
      location?.appearancePrompt ? `Environment reference: ${location.appearancePrompt}` : "",
      hasCharacterVisualAnchors(shotCharacters) ? "Preserve recurring character identity from the provided visual references." : "",
      hasLocationVisualAnchors(location) ? "Preserve recurring environment design from the provided visual references." : "",
      buildImageStyleSuffix(artStyle),
    ].filter(Boolean).join("\n")
  }

  if (shot.cameraNote) {
    return [
      `${shot.shotSize || "WIDE"} shot. ${shot.cameraNote}`,
      `Scene: ${shot.caption || shot.label}.`,
      charRefs ? `Characters: ${charRefs}` : "",
      location?.appearancePrompt ? `Setting: ${location.appearancePrompt}.` : "",
      hasCharacterVisualAnchors(shotCharacters) ? "Preserve recurring character identity from the provided visual references." : "",
      hasLocationVisualAnchors(location) ? "Preserve recurring environment design from the provided visual references." : "",
      buildImageStyleSuffix(artStyle),
    ].filter(Boolean).join(" ")
  }

  return [
    `${shot.shotSize || "WIDE"} shot, ${shot.cameraMotion || "static"}.`,
    `${shot.caption || shot.label}.`,
    charRefs ? `Characters: ${charRefs}` : "",
    location?.appearancePrompt ? `Setting: ${location.appearancePrompt}.` : "",
    hasCharacterVisualAnchors(shotCharacters) ? "Preserve recurring character identity from the provided visual references." : "",
    hasLocationVisualAnchors(location) ? "Preserve recurring environment design from the provided visual references." : "",
    buildImageStyleSuffix(artStyle),
  ].filter(Boolean).join(" ")
}

export function buildVideoPrompt(
  shot: TimelineShot,
  characters: CharacterEntry[],
  locations: LocationEntry[],
  style?: string
): string {
  const artStyle = style || DEFAULT_PROJECT_STYLE
  const shotCharacters = getCharactersForShot(shot, characters)
  const charRefs = formatCharacterRefs(shotCharacters)
  const location = getLocationForShot(shot, locations)

  if (shot.videoPrompt) {
    return [
      stripKnownStyleDirective(shot.videoPrompt, artStyle),
      charRefs ? `Characters: ${charRefs}` : "",
      location?.appearancePrompt ? `Environment: ${location.appearancePrompt}.` : "",
      `Visual style: ${artStyle}.`,
    ].filter(Boolean).join(" ")
  }

  const duration = (shot.duration / 1000).toFixed(1)
  const base = shot.imagePrompt || shot.caption || shot.label
  return [
    `${duration}s clip. ${base}.`,
    charRefs ? `Characters: ${charRefs}` : "",
    location?.appearancePrompt ? `Environment: ${location.appearancePrompt}.` : "",
    `${shot.cameraMotion || "static"} camera.`,
    `Visual style: ${artStyle}.`,
    "Cinematic pace.",
  ].filter(Boolean).join(" ")
}

export function getReferencedBibleEntries(
  shot: TimelineShot,
  characters: CharacterEntry[],
  locations: LocationEntry[]
): { characters: CharacterEntry[]; location: LocationEntry | null } {
  return {
    characters: getCharactersForShot(shot, characters),
    location: getLocationForShot(shot, locations),
  }
}