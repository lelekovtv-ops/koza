import type { CharacterEntry, LocationEntry, PropEntry } from "@/lib/bibleParser"
import { DEFAULT_PROJECT_STYLE, STYLE_PRESETS } from "@/lib/projectStyle"
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

function normalizeLocationText(value: string): string {
  return value
    .toLowerCase()
    .replace(/^(int\.?|ext\.?|int\.?\/ext\.?|ext\.?\/int\.?|i\/e\.?)\s*/i, "")
    .replace(/[—–-]\s*(утро|день|вечер|ночь|dawn|morning|day|afternoon|evening|night|dusk|sunset|sunrise).*$/i, "")
    .trim()
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

export function locationMentionedInShot(location: LocationEntry, shot: TimelineShot): boolean {
  const shotText = getShotText(shot)
  const candidates = [location.name, location.fullHeading]
    .map((value) => normalizeLocationText(value))
    .filter(Boolean)

  return candidates.some((candidate) => {
    if (shotText.includes(candidate)) {
      return true
    }

    if (candidate.length >= 6) {
      const shortened = candidate.slice(0, Math.max(6, candidate.length - 3))
      return shotText.includes(shortened)
    }

    return false
  })
}

export function getLocationsForShot(shot: TimelineShot, locations: LocationEntry[]): LocationEntry[] {
  const primary = locations.find((entry) => entry.sceneIds.includes(shot.sceneId || "")) || null
  const mentioned = locations.filter((location) => locationMentionedInShot(location, shot))

  return [primary, ...mentioned]
    .filter((location): location is LocationEntry => Boolean(location))
    .filter((location, index, all) => all.findIndex((entry) => entry.id === location.id) === index)
}

function getLocationForShot(shot: TimelineShot, locations: LocationEntry[]): LocationEntry | null {
  return getLocationsForShot(shot, locations)[0] ?? null
}

function formatCharacterRefs(characters: CharacterEntry[]): string {
  return characters
    .map((character) => character.appearancePrompt?.trim()
      ? `${character.name} — ${character.appearancePrompt.trim()}`
      : character.name)
    .join("; ")
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

export function propMentionedInShot(prop: PropEntry, shot: TimelineShot): boolean {
  const shotText = getShotText(shot)
  const name = prop.name.toLowerCase()

  if (!name) return false
  if (shotText.includes(name)) return true

  if (name.length >= 4) {
    const stem = name.slice(0, Math.max(4, name.length - 2))
    if (shotText.includes(stem)) return true
  }

  return false
}

export function getPropsForShot(shot: TimelineShot, props: PropEntry[]): PropEntry[] {
  const mentioned = props.filter((prop) => propMentionedInShot(prop, shot))

  if (mentioned.length === 0 && shot.sceneId) {
    return props.filter((prop) => prop.sceneIds.includes(shot.sceneId!))
  }

  return mentioned
}

function formatPropRefs(props: PropEntry[]): string {
  return props
    .map((prop) => prop.appearancePrompt?.trim()
      ? `${prop.name} — ${prop.appearancePrompt.trim()}`
      : prop.name)
    .join("; ")
}

function hasPropVisualAnchors(props: PropEntry[]): boolean {
  return props.some((prop) => Boolean(prop.generatedImageUrl) || prop.referenceImages.length > 0)
}

function buildImageStyleSuffix(style: string): string {
  return `${style}. 16:9. No text.`
}

/** Strip all known style preset prompts + common style keywords from text */
function stripStyleFromPrompt(text: string): string {
  let cleaned = text
  // Remove full preset prompts
  for (const preset of STYLE_PRESETS) {
    if (preset.prompt) {
      cleaned = cleaned.replace(new RegExp(preset.prompt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[.,;]?\\s*", "gi"), "")
    }
  }
  // Remove common leaked style fragments
  cleaned = cleaned
    .replace(/\bPhotorealistic,?\s*(natural lighting,?\s*)?(ARRI Alexa[^,.]*,?\s*)?(subtle film grain,?\s*)?/gi, "")
    .replace(/\bAnime style,?\s*(cel shading,?\s*)?(dramatic lighting,?\s*)?(cinematic composition,?\s*)?/gi, "")
    .replace(/\bFilm noir,?\s*(high contrast[^,.]*,?\s*)?(dramatic chiaroscuro[^,.]*,?\s*)?(deep shadows,?\s*)?/gi, "")
    .replace(/\bNeo-noir[^,.]*,?\s*(teal and orange,?\s*)?(moody desaturated,?\s*)?(practical lighting,?\s*)?/gi, "")
    .replace(/\bWatercolor illustration,?\s*(soft washes,?\s*)?(muted palette,?\s*)?(artistic storyboard,?\s*)?/gi, "")
    .replace(/\b16:9\.?\s*/g, "")
    .replace(/\bNo text\.?\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
  return cleaned
}

export function buildImagePrompt(
  shot: TimelineShot,
  characters: CharacterEntry[],
  locations: LocationEntry[],
  style?: string,
  props?: PropEntry[],
): string {
  const artStyle = style || DEFAULT_PROJECT_STYLE
  const excluded = new Set(shot.excludedBibleIds ?? [])
  const shotCharacters = getCharactersForShot(shot, characters).filter((c) => !excluded.has(`char-${c.id}`))
  const charRefs = formatCharacterRefs(shotCharacters)
  const allLocations = getLocationsForShot(shot, locations)
  const location = allLocations.find((l) => !excluded.has(`loc-${l.id}`)) ?? null
  const timeOfDay = location?.timeOfDay || ""
  const lightingHint = timeOfDay ? `Lighting: ${timeOfDay}.` : ""
  const shotProps = (props ? getPropsForShot(shot, props) : []).filter((p) => !excluded.has(`prop-${p.id}`))
  const propRefs = formatPropRefs(shotProps)

  // Baked prompt — already contains everything, return as-is
  if (shot.imagePrompt && shot.bakedPrompt) {
    return shot.imagePrompt
  }

  if (shot.imagePrompt) {
    const cleanedPrompt = stripStyleFromPrompt(shot.imagePrompt)
    return [
      cleanedPrompt,
      charRefs ? `Characters: ${charRefs}.` : "",
      location?.appearancePrompt ? `Environment: ${location.appearancePrompt}.` : "",
      propRefs ? `Props: ${propRefs}.` : "",
      hasCharacterVisualAnchors(shotCharacters) ? "Preserve character identity from visual references." : "",
      hasLocationVisualAnchors(location) ? "Preserve environment from visual references." : "",
      lightingHint,
      buildImageStyleSuffix(artStyle),
    ].filter(Boolean).join("\n")
  }

  if (shot.cameraNote) {
    return [
      `${shot.shotSize || "WIDE"} shot. ${shot.cameraNote}`,
      `Scene: ${shot.caption || shot.label}.`,
      charRefs ? `Characters: ${charRefs}.` : "",
      location?.appearancePrompt ? `Setting: ${location.appearancePrompt}.` : "",
      propRefs ? `Props: ${propRefs}.` : "",
      hasCharacterVisualAnchors(shotCharacters) ? "Preserve character identity from visual references." : "",
      hasLocationVisualAnchors(location) ? "Preserve environment from visual references." : "",
      lightingHint,
      buildImageStyleSuffix(artStyle),
    ].filter(Boolean).join(" ")
  }

  return [
    `${shot.shotSize || "WIDE"} shot, ${shot.cameraMotion || "static"}.`,
    `${shot.caption || shot.label}.`,
    charRefs ? `Characters: ${charRefs}.` : "",
    location?.appearancePrompt ? `Setting: ${location.appearancePrompt}.` : "",
    propRefs ? `Props: ${propRefs}.` : "",
    hasCharacterVisualAnchors(shotCharacters) ? "Preserve character identity from visual references." : "",
    hasLocationVisualAnchors(location) ? "Preserve environment from visual references." : "",
    lightingHint,
    buildImageStyleSuffix(artStyle),
  ].filter(Boolean).join(" ")
}

export function buildVideoPrompt(
  shot: TimelineShot,
  characters: CharacterEntry[],
  locations: LocationEntry[],
  style?: string,
  props?: PropEntry[],
): string {
  const artStyle = style || DEFAULT_PROJECT_STYLE
  const excluded = new Set(shot.excludedBibleIds ?? [])
  const shotCharacters = getCharactersForShot(shot, characters).filter((c) => !excluded.has(`char-${c.id}`))
  const charRefs = formatCharacterRefs(shotCharacters)
  const allLocations = getLocationsForShot(shot, locations)
  const location = allLocations.find((l) => !excluded.has(`loc-${l.id}`)) ?? null
  const shotProps = (props ? getPropsForShot(shot, props) : []).filter((p) => !excluded.has(`prop-${p.id}`))
  const propRefs = formatPropRefs(shotProps)

  if (shot.videoPrompt) {
    return [
      stripKnownStyleDirective(shot.videoPrompt, artStyle),
      charRefs ? `Characters: ${charRefs}` : "",
      location?.appearancePrompt ? `Environment: ${location.appearancePrompt}.` : "",
      propRefs ? `Props: ${propRefs}` : "",
      `Visual style: ${artStyle}.`,
    ].filter(Boolean).join(" ")
  }

  const duration = (shot.duration / 1000).toFixed(1)
  const base = shot.imagePrompt || shot.caption || shot.label
  return [
    `${duration}s clip. ${base}.`,
    charRefs ? `Characters: ${charRefs}` : "",
    location?.appearancePrompt ? `Environment: ${location.appearancePrompt}.` : "",
    propRefs ? `Props: ${propRefs}` : "",
    `${shot.cameraMotion || "static"} camera.`,
    `Visual style: ${artStyle}.`,
    "Cinematic pace.",
  ].filter(Boolean).join(" ")
}

export function getReferencedBibleEntries(
  shot: TimelineShot,
  characters: CharacterEntry[],
  locations: LocationEntry[],
  props?: PropEntry[],
): { characters: CharacterEntry[]; location: LocationEntry | null; props: PropEntry[] } {
  return {
    characters: getCharactersForShot(shot, characters),
    location: getLocationForShot(shot, locations),
    props: props ? getPropsForShot(shot, props) : [],
  }
}