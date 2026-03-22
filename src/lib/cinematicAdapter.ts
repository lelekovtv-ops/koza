import { createTimelineShot, type TimelineShot } from "@/store/timeline"
import type { ShotSpec } from "@/types/cinematic"

function compactLines(values: Array<string | null | undefined>): string[] {
  return values.map((value) => value?.trim() ?? "").filter(Boolean)
}

function formatList(label: string, values: string[]): string | null {
  const cleaned = values.map((value) => value.trim()).filter(Boolean)
  return cleaned.length > 0 ? `${label}: ${cleaned.join(", ")}` : null
}

function formatContinuity(spec: ShotSpec): string[] {
  const { continuity } = spec

  return compactLines([
    formatList("Characters", continuity.characterIds),
    formatList("Wardrobe", Object.entries(continuity.wardrobeState).map(([characterId, state]) => `${characterId}=${state}`)),
    formatList("Props", continuity.propIds),
    continuity.locationId ? `Location anchor: ${continuity.locationId}` : null,
    continuity.timeOfDay ? `Time of day: ${continuity.timeOfDay}` : null,
    continuity.screenDirection ? `Screen direction: ${continuity.screenDirection}` : null,
    continuity.eyeline ? `Eyeline: ${continuity.eyeline}` : null,
    continuity.axisOfAction ? `Axis of action: ${continuity.axisOfAction}` : null,
    continuity.carryOverFromPrevious ? `Carry-over: ${continuity.carryOverFromPrevious}` : null,
    continuity.setupForNext ? `Setup for next: ${continuity.setupForNext}` : null,
    formatList("Locked anchors", continuity.lockedVisualAnchors),
  ])
}

function buildLegacyLabel(spec: ShotSpec): string {
  const primary = compactLines([spec.narrativePurpose, spec.dramaticBeat, spec.subject])[0]
  if (primary) {
    return primary
  }

  const technical = compactLines([spec.shotSize, spec.shotType]).join(" ")
  return technical || `Shot ${spec.order + 1}`
}

function buildLegacyCaption(spec: ShotSpec): string {
  return compactLines([spec.subject, spec.environment])[0] ?? buildLegacyLabel(spec)
}

function buildLegacyNotes(spec: ShotSpec): string {
  return compactLines([
    spec.dramaticBeat ? `Beat: ${spec.dramaticBeat}` : null,
    spec.composition ? `Composition: ${spec.composition}` : null,
    spec.blocking ? `Blocking: ${spec.blocking}` : null,
    spec.environment ? `Environment: ${spec.environment}` : null,
    spec.lighting ? `Lighting: ${spec.lighting}` : null,
    formatList("Palette", spec.palette),
    formatList("Props", spec.props),
    ...formatContinuity(spec),
  ]).join("\n")
}

function buildLegacyDirectorNote(spec: ShotSpec): string {
  return compactLines([
    spec.narrativePurpose,
    spec.transitionIn ? `Transition in: ${spec.transitionIn}` : null,
    spec.transitionOut ? `Transition out: ${spec.transitionOut}` : null,
  ]).join("\n")
}

function buildLegacyCameraNote(spec: ShotSpec): string {
  return compactLines([
    spec.shotType ? `Type: ${spec.shotType}` : null,
    spec.composition ? `Composition: ${spec.composition}` : null,
    spec.camera ? `Camera: ${spec.camera}` : null,
  ]).join("\n")
}

function buildLegacyVisualDescription(spec: ShotSpec): string {
  return compactLines([
    spec.subject,
    spec.environment,
    spec.blocking,
    spec.lighting,
    formatList("Palette", spec.palette),
    formatList("Props", spec.props),
  ]).join(". ")
}

export function shotSpecToTimelineShot(spec: ShotSpec, overrides: Partial<TimelineShot> = {}): TimelineShot {
  return createTimelineShot({
    id: overrides.id ?? spec.id,
    sceneId: overrides.sceneId ?? spec.sceneId,
    order: overrides.order ?? spec.order,
    label: overrides.label ?? buildLegacyLabel(spec),
    notes: overrides.notes ?? buildLegacyNotes(spec),
    shotSize: overrides.shotSize ?? spec.shotSize,
    cameraMotion: overrides.cameraMotion ?? spec.camera,
    caption: overrides.caption ?? buildLegacyCaption(spec),
    directorNote: overrides.directorNote ?? buildLegacyDirectorNote(spec),
    cameraNote: overrides.cameraNote ?? buildLegacyCameraNote(spec),
    imagePrompt: overrides.imagePrompt ?? spec.imagePromptBase,
    videoPrompt: overrides.videoPrompt ?? spec.videoPromptBase,
    visualDescription: overrides.visualDescription ?? buildLegacyVisualDescription(spec),
    sourceText: overrides.sourceText ?? compactLines([spec.narrativePurpose, spec.dramaticBeat, spec.subject]).join("\n"),
    duration: overrides.duration,
    type: overrides.type,
    thumbnailUrl: overrides.thumbnailUrl,
    originalUrl: overrides.originalUrl,
    thumbnailBlobKey: overrides.thumbnailBlobKey,
    originalBlobKey: overrides.originalBlobKey,
    svg: overrides.svg,
    blockRange: overrides.blockRange,
    locked: overrides.locked,
  })
}

export function mapShotSpecsToTimelineShots(
  shots: ShotSpec[],
  getOverrides?: (spec: ShotSpec, index: number) => Partial<TimelineShot> | undefined,
): TimelineShot[] {
  return shots.map((spec, index) => shotSpecToTimelineShot(spec, getOverrides?.(spec, index)))
}