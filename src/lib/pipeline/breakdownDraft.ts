import type { BreakdownDetailedResult, JenkinsShot } from "@/lib/jenkins"
import type { PromptComposerShot } from "@/lib/cinematic/promptComposer"
import type { PipelineBreakdownDraft, PipelineDraftShot } from "@/types/pipeline"
import type { ShotSpec } from "@/types/cinematic"

function compactText(values: Array<string | null | undefined>): string {
  return values.map((value) => value?.trim() ?? "").filter(Boolean).join(". ")
}

function buildDraftLabel(index: number, spec: ShotSpec, composed?: PromptComposerShot, legacy?: JenkinsShot): string {
  return composed?.label?.trim()
    || legacy?.label?.trim()
    || spec.narrativePurpose.trim()
    || spec.subject.trim()
    || `Кадр ${index + 1}`
}

function buildDraftShot(index: number, spec: ShotSpec, composed?: PromptComposerShot, legacy?: JenkinsShot): PipelineDraftShot {
  return {
    shotId: spec.id,
    order: spec.order,
    label: buildDraftLabel(index, spec, composed, legacy),
    shotType: spec.shotType,
    shotSize: composed?.shotSize?.trim() || spec.shotSize,
    composition: spec.composition,
    camera: composed?.cameraMotion?.trim() || spec.camera,
    actionText: spec.blocking.trim() || spec.narrativePurpose.trim(),
    shotDescription: composed?.caption?.trim() || compactText([spec.subject, spec.environment]),
    directorNote: composed?.directorNote?.trim() || compactText([spec.narrativePurpose, spec.dramaticBeat, spec.transitionOut]),
    cameraNote: composed?.cameraNote?.trim() || compactText([spec.shotType, spec.composition, spec.camera, spec.lighting]),
    visualDescription: composed?.visualDescription?.trim() || compactText([spec.subject, spec.environment, spec.lighting]),
    continuitySummary: compactText([spec.continuity.carryOverFromPrevious, spec.continuity.setupForNext]),
    keyframeRole: spec.continuity.keyframeRole,
  }
}

export function createPipelineBreakdownDraft(
  result: Pick<BreakdownDetailedResult, "sceneId" | "analysis" | "actionSplit" | "contextPlan" | "creativePlan" | "censorReport" | "shotPlan" | "continuity" | "diagnostics"> & {
    promptPackages?: PromptComposerShot[]
    shots?: JenkinsShot[]
  },
  sceneText: string,
): PipelineBreakdownDraft {
  const composedById = new Map((result.promptPackages ?? []).map((shot) => [shot.shotId, shot]))

  return {
    sceneId: result.sceneId,
    sceneText,
    analysis: result.analysis,
    actionSplit: result.actionSplit,
    contextPlan: result.contextPlan,
    creativePlan: result.creativePlan,
    censorReport: result.censorReport,
    shotPlan: result.shotPlan,
    continuity: result.continuity,
    draftShots: result.continuity.shots.map((spec, index) => buildDraftShot(index, spec, composedById.get(spec.id), result.shots?.[index])),
    diagnostics: result.diagnostics,
  }
}

export function applyDraftToShotSpecs(baseShots: ShotSpec[], draftShots: PipelineDraftShot[]): ShotSpec[] {
  const draftByShotId = new Map(draftShots.map((draft) => [draft.shotId, draft]))

  return baseShots.map((shot) => {
    const draft = draftByShotId.get(shot.id)
    if (!draft) {
      return shot
    }

    return {
      ...shot,
      narrativePurpose: draft.label.trim() || shot.narrativePurpose,
      shotType: draft.shotType.trim() || shot.shotType,
      shotSize: draft.shotSize.trim() || shot.shotSize,
      composition: draft.composition.trim() || shot.composition,
      camera: draft.camera.trim() || shot.camera,
      blocking: draft.actionText.trim() || shot.blocking,
      subject: draft.shotDescription.trim() || shot.subject,
      imagePromptBase: draft.visualDescription.trim() || shot.imagePromptBase,
      videoPromptBase: draft.visualDescription.trim() || shot.videoPromptBase,
    }
  })
}

export function buildPromptComposerEditorialNotes(draftShots: PipelineDraftShot[]) {
  return draftShots.map((draft) => ({
    shotId: draft.shotId,
    label: draft.label,
    actionText: draft.actionText,
    shotDescription: draft.shotDescription,
    directorNote: draft.directorNote,
    cameraNote: draft.cameraNote,
    visualDescription: draft.visualDescription,
  }))
}