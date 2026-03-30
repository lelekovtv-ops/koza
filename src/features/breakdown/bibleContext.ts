import type { CharacterEntry, LocationEntry, PropEntry } from "@/lib/bibleParser"
import type { BreakdownBibleContext } from "@/features/breakdown/types"

export function buildBreakdownBibleContext(
  characters: CharacterEntry[],
  locations: LocationEntry[],
  props?: PropEntry[],
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
    props: props?.map((prop) => ({
      name: prop.name,
      description: prop.description,
      appearancePrompt: prop.appearancePrompt,
    })),
  }
}