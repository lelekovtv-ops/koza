import { buildImagePrompt, buildVideoPrompt } from "@/lib/promptBuilder"
import type { CharacterEntry, LocationEntry, PropEntry } from "@/lib/bibleParser"
import type { TimelineShot } from "@/store/timeline"

const SPATIAL_CONTINUITY_LOCK = [
  "Continuity lock:",
  "preserve shot-to-shot spatial geography,",
  "body positions, prop placement, background structure,",
  "and environment continuity unless the shot notes explicitly change them.",
].join(" ")

export type GeneratedScenePrompt = {
  shotId: string
  imagePrompt: string
  videoPrompt: string
}

export function buildScenePromptDrafts(
  sceneShots: TimelineShot[],
  characters: CharacterEntry[],
  locations: LocationEntry[],
  projectStyle: string,
  props?: PropEntry[],
): GeneratedScenePrompt[] {
  return sceneShots.map((shot) => {
    const baseImagePrompt = buildImagePrompt(shot, characters, locations, projectStyle, props)
    const baseVideoPrompt = buildVideoPrompt(shot, characters, locations, projectStyle, props)

    return {
      shotId: shot.id,
      imagePrompt: `${baseImagePrompt}\n\n${SPATIAL_CONTINUITY_LOCK}`.trim(),
      videoPrompt: baseVideoPrompt,
    }
  })
}