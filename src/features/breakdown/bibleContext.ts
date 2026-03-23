import type { CharacterEntry, LocationEntry } from "@/lib/bibleParser"
import type { BreakdownBibleContext } from "@/features/breakdown/types"

export function buildBreakdownBibleContext(
  characters: CharacterEntry[],
  locations: LocationEntry[],
): BreakdownBibleContext {
  return {
    characters: characters.map((character) => ({
      name: character.name,
      description: character.description,
      appearancePrompt: character.appearancePrompt,
    })),
    locations: locations.map((location) => ({
      name: location.name,
      description: location.description,
      appearancePrompt: location.appearancePrompt,
      intExt: location.intExt,
    })),
  }
}