import type { JenkinsShot } from "@/lib/jenkins"
import type { BreakdownSceneSource } from "@/features/breakdown/types"
import { createTimelineShot, type TimelineShot } from "@/store/timeline"

export function createSceneTimelineShotsFromBreakdown(
  source: BreakdownSceneSource,
  shots: JenkinsShot[],
): TimelineShot[] {
  const firstBlockId = source.sceneBlockIds[0] ?? ""
  const lastBlockId = source.sceneBlockIds[source.sceneBlockIds.length - 1] ?? ""

  return shots.map((shot) => createTimelineShot({
    label: shot.label,
    shotSize: shot.shotSize ?? "",
    cameraMotion: shot.cameraMotion ?? "",
    duration: shot.duration,
    caption: shot.caption ?? "",
    directorNote: shot.directorNote ?? "",
    cameraNote: shot.cameraNote ?? "",
    imagePrompt: shot.imagePrompt ?? "",
    videoPrompt: shot.videoPrompt ?? "",
    visualDescription: shot.visualDescription ?? "",
    notes: shot.notes,
    type: shot.type,
    sceneId: source.sceneId,
    blockRange: firstBlockId && lastBlockId ? [firstBlockId, lastBlockId] : null,
    locked: true,
    sourceText: source.sceneText,
  }))
}