import type { JenkinsShot } from "@/lib/breakdownTypes"
import type { BreakdownSceneSource } from "@/features/breakdown/types"
import { createTimelineShot, type TimelineShot } from "@/store/timeline"
import { buildSceneTimingMap, mapShotsToBlocks, placeShotsOnTimeline } from "@/lib/placementEngine"

interface BlockInput {
  id: string
  type: string
  text: string
}

export function createSceneTimelineShotsFromBreakdown(
  source: BreakdownSceneSource,
  shots: JenkinsShot[],
  sceneBlocks?: BlockInput[],
): TimelineShot[] {
  // Use placement engine for per-shot blockRange and duration if blocks provided
  let perShotMappings: { blockRange: [string, string]; durationMs: number }[] | null = null

  if (sceneBlocks && sceneBlocks.length > 0) {
    const timingMap = buildSceneTimingMap(source.sceneId, sceneBlocks, 0)
    const shotInputs = shots.map((s) => ({
      id: s.id,
      label: s.label,
      caption: s.caption,
      directorNote: s.directorNote,
      notes: s.notes,
    }))
    const mapped = mapShotsToBlocks(shotInputs, timingMap)
    const placed = placeShotsOnTimeline(mapped, timingMap)
    perShotMappings = placed.map((p) => ({
      blockRange: p.blockRange,
      durationMs: p.durationMs,
    }))
  }

  const firstBlockId = source.sceneBlockIds[0] ?? ""
  const lastBlockId = source.sceneBlockIds[source.sceneBlockIds.length - 1] ?? ""

  return shots.map((shot, i) => createTimelineShot({
    label: shot.label,
    shotSize: shot.shotSize ?? "",
    cameraMotion: shot.cameraMotion ?? "",
    duration: perShotMappings?.[i]?.durationMs ?? shot.duration,
    caption: shot.caption ?? "",
    directorNote: shot.directorNote ?? "",
    cameraNote: shot.cameraNote ?? "",
    imagePrompt: shot.imagePrompt ?? "",
    videoPrompt: shot.videoPrompt ?? "",
    visualDescription: shot.visualDescription ?? "",
    notes: shot.notes,
    type: shot.type,
    sceneId: source.sceneId,
    blockRange: perShotMappings?.[i]?.blockRange ?? (firstBlockId && lastBlockId ? [firstBlockId, lastBlockId] : null),
    locked: true,
    sourceText: source.sceneText,
  }))
}