import type { ShotSpec } from "@/types/cinematic"

export interface ShotMemory {
  shotId: string
  sceneId: string
  characterIds: string[]
  wardrobeState: Record<string, string>
  propState: Record<string, string>
  locationId: string | null
  lightingState: string
  paletteState: string[]
  compositionSignature: string
  screenDirection: string
  eyeline: string
  axisOfAction: string
  lockedAnchors: string[]
  carryOverInstructions: string
  setupForNext: string
  keyframeRole: ShotSpec["continuity"]["keyframeRole"]
  anchorShotId: string | null
  promptBlocks: ShotSpec["continuity"]["promptBlocks"]
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function buildPropState(props: string[]): Record<string, string> {
  return Object.fromEntries(uniqueStrings(props).map((prop) => [prop, "present"]))
}

export function buildCompositionSignature(shot: ShotSpec): string {
  return [shot.shotType, shot.shotSize, shot.composition, shot.camera]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" | ")
}

export function createShotMemory(shot: ShotSpec): ShotMemory {
  return {
    shotId: shot.id,
    sceneId: shot.sceneId,
    characterIds: uniqueStrings(shot.continuity.characterIds),
    wardrobeState: { ...shot.continuity.wardrobeState },
    propState: buildPropState(shot.props.length > 0 ? shot.props : shot.continuity.propIds),
    locationId: shot.continuity.locationId,
    lightingState: shot.lighting,
    paletteState: uniqueStrings(shot.palette),
    compositionSignature: buildCompositionSignature(shot),
    screenDirection: shot.continuity.screenDirection,
    eyeline: shot.continuity.eyeline,
    axisOfAction: shot.continuity.axisOfAction,
    lockedAnchors: uniqueStrings(shot.continuity.lockedVisualAnchors),
    carryOverInstructions: shot.continuity.carryOverFromPrevious,
    setupForNext: shot.continuity.setupForNext,
    keyframeRole: shot.continuity.keyframeRole,
    anchorShotId: shot.continuity.anchorShotId,
    promptBlocks: shot.continuity.promptBlocks,
  }
}