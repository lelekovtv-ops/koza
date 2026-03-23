import type { CharacterEntry, LocationEntry } from "@/lib/bibleParser"

export type BreakdownBibleCharacterContext = {
  name: string
  description: string
  appearancePrompt: string
}

export type BreakdownBibleLocationContext = {
  name: string
  description: string
  appearancePrompt: string
  intExt: LocationEntry["intExt"]
}

export type BreakdownBibleContext = {
  characters: BreakdownBibleCharacterContext[]
  locations: BreakdownBibleLocationContext[]
}

export type BreakdownTextModelId = "claude-sonnet-4-20250514" | "gpt-4o" | "gemini-1.5-pro"

export type BreakdownModelOption = {
  id: BreakdownTextModelId
  label: string
}

export type BreakdownSceneSource = {
  sceneId: string
  sceneText: string
  sceneBlockIds: string[]
}

export type BreakdownBibleEntries = {
  characters: CharacterEntry[]
  locations: LocationEntry[]
}