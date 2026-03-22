export interface ProjectStyleBible {
  id: string
  projectId: string
  name: string
  visualIntent: string
  genreTone: string
  aspectRatio: string
  colorStrategy: string
  textureStrategy: string
  lightingPrinciples: string[]
  cameraPrinciples: string[]
  continuityRules: string[]
  characterProfiles: CharacterVisualProfile[]
  locationProfiles: LocationVisualProfile[]
  imagePromptBase: string
  videoPromptBase: string
  globalNegativePrompt: string
}

export interface CharacterVisualProfile {
  characterId: string
  name: string
  summary: string
  ageRange: string
  build: string
  wardrobe: string[]
  hairMakeup: string
  palette: string[]
  props: string[]
  silhouette: string
  continuityAnchors: string[]
  imagePromptBase: string
}

export interface LocationVisualProfile {
  locationId: string
  name: string
  summary: string
  architecture: string
  environmentDetails: string[]
  palette: string[]
  lightingMotif: string
  weatherOptions: string[]
  setDressing: string[]
  continuityAnchors: string[]
  imagePromptBase: string
}

export interface SceneBreakdownBeat {
  id: string
  sceneId: string
  order: number
  title: string
  summary: string
  narrativeFunction: string
  emotionalShift: string
  subjectFocus: string
  characterIds: string[]
  locationId: string | null
  propIds: string[]
  visualAnchors: string[]
  transitionOut: string
}

export interface ShotContinuity {
  characterIds: string[]
  wardrobeState: Record<string, string>
  propIds: string[]
  locationId: string | null
  timeOfDay: string
  screenDirection: string
  eyeline: string
  axisOfAction: string
  carryOverFromPrevious: string
  setupForNext: string
  lockedVisualAnchors: string[]
  continuityWarnings: string[]
}

export interface ShotSpec {
  id: string
  sceneId: string
  order: number
  narrativePurpose: string
  dramaticBeat: string
  shotType: string
  shotSize: string
  composition: string
  camera: string
  blocking: string
  subject: string
  environment: string
  props: string[]
  lighting: string
  palette: string[]
  continuity: ShotContinuity
  transitionIn: string
  transitionOut: string
  imagePromptBase: string
  videoPromptBase: string
}

export interface ShotRelation {
  fromShotId: string
  toShotId: string
  relationType:
    | "match_cut"
    | "cut_on_action"
    | "insert"
    | "reaction"
    | "reverse"
    | "establish"
    | "parallel"
  relationIntent:
    | "focus_shift"
    | "reaction"
    | "action_continuation"
    | "geography"
    | "tension"
    | "reveal"
  reason: string
  continuityConstraints: string[]
}

export interface ImagePromptPackage {
  shotId: string
  basePrompt: string
  subjectPrompt: string
  environmentPrompt: string
  lightingPrompt: string
  continuityPrompt: string
  stylePrompt: string
  negativePrompt: string
  referenceImageIds: string[]
  finalPrompt: string
}

export interface VideoPromptPackage {
  shotId: string
  basePrompt: string
  motionPrompt: string
  cameraPrompt: string
  continuityPrompt: string
  transitionPrompt: string
  stylePrompt: string
  negativePrompt: string
  durationMs: number | null
  referenceImageIds: string[]
  finalPrompt: string
}