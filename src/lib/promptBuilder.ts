import type { CharacterEntry, LocationEntry } from "@/lib/bibleParser"
import type { TimelineShot } from "@/store/timeline"

export function buildImagePrompt(
  shot: TimelineShot,
  allShots: TimelineShot[],
  characters: CharacterEntry[],
  locations: LocationEntry[]
): string {
  void allShots

  if (shot.imagePrompt) {
    const charRefs = characters
      .filter((character) => {
        const text = `${shot.caption} ${shot.label} ${shot.imagePrompt}`.toLowerCase()
        return text.includes(character.name.toLowerCase()) && character.appearancePrompt
      })
      .map((character) => `[${character.name}: ${character.appearancePrompt}]`)
      .join(" ")

    const location = locations.find((entry) => entry.sceneIds.includes(shot.sceneId || ""))

    return [
      shot.imagePrompt,
      charRefs ? `Character reference: ${charRefs}` : "",
      location?.appearancePrompt ? `Environment reference: ${location.appearancePrompt}` : "",
    ].filter(Boolean).join("\n")
  }

  if (shot.cameraNote) {
    const location = locations.find((entry) => entry.sceneIds.includes(shot.sceneId || ""))
    return [
      `${shot.shotSize || "WIDE"} shot. ${shot.cameraNote}`,
      `Scene: ${shot.caption || shot.label}.`,
      location?.appearancePrompt ? `Setting: ${location.appearancePrompt}.` : "",
      "Film noir, high contrast black and white, cinematic still, 16:9. No text.",
    ].filter(Boolean).join(" ")
  }

  return [
    `${shot.shotSize || "WIDE"} shot, ${shot.cameraMotion || "static"}.`,
    `${shot.caption || shot.label}.`,
    "Film noir, high contrast B&W. 16:9. No text.",
  ].filter(Boolean).join(" ")
}

export function buildVideoPrompt(
  shot: TimelineShot,
  characters: CharacterEntry[],
  locations: LocationEntry[]
): string {
  if (shot.videoPrompt) return shot.videoPrompt

  const duration = (shot.duration / 1000).toFixed(1)
  const base = shot.imagePrompt || shot.caption || shot.label
  void characters
  void locations
  return `${duration}s clip. ${base}. ${shot.cameraMotion || "static"} camera. Cinematic pace.`
}

export function getReferencedBibleEntries(
  shot: TimelineShot,
  characters: CharacterEntry[],
  locations: LocationEntry[]
): { characters: CharacterEntry[]; location: LocationEntry | null } {
  const text = `${shot.caption} ${shot.label} ${shot.notes} ${shot.directorNote} ${shot.cameraNote} ${shot.imagePrompt} ${shot.videoPrompt} ${shot.visualDescription}`.toLowerCase()

  return {
    characters: characters.filter((character) => text.includes(character.name.toLowerCase())),
    location: locations.find((location) => location.sceneIds.includes(shot.sceneId || "")) || null,
  }
}