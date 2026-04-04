/**
 * Breakdown types — shared between Fincher engine and storyboard.
 * Extracted from the old jenkins.ts.
 */

export interface JenkinsShot {
  id: string
  label: string
  type: "image"
  duration: number
  notes: string
  shotSize: string
  cameraMotion: string
  caption: string
  directorNote: string
  cameraNote: string
  imagePrompt: string
  videoPrompt: string
  visualDescription: string
  svg: string
}

export interface BreakdownDiagnostics {
  usedFallback: boolean
  actionSplitFallback?: boolean
  shotPlannerFallback?: boolean
  promptComposerFallback?: boolean
}

export interface BreakdownResult {
  shots: JenkinsShot[]
  diagnostics: BreakdownDiagnostics
}

export interface BibleContext {
  characters: { name: string; appearance?: string; description?: string; appearancePrompt?: string }[]
  locations: { name: string; description?: string; appearancePrompt?: string; intExt?: string }[]
  props?: { name: string; description?: string; appearancePrompt?: string }[]
}
