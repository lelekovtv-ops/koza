import type { NormalizedRunResult } from "@/types/pipeline"

function getArrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

function getAnalysisCounts(analysis: unknown): { beatCount: number; characterCount: number } {
  if (!analysis || typeof analysis !== "object") {
    return { beatCount: 0, characterCount: 0 }
  }

  const record = analysis as Record<string, unknown>
  return {
    beatCount: getArrayLength(record.dramaticBeats),
    characterCount: getArrayLength(record.characterPresence),
  }
}

function getContinuityCounts(continuity: unknown): { memoryCount: number; relationCount: number } {
  if (!continuity || typeof continuity !== "object") {
    return { memoryCount: 0, relationCount: 0 }
  }

  const record = continuity as Record<string, unknown>
  return {
    memoryCount: getArrayLength(record.memories),
    relationCount: getArrayLength(record.relations),
  }
}

function getCreativeIdeaCount(value: unknown): number {
  if (!value || typeof value !== "object") {
    return 0
  }

  return getArrayLength((value as Record<string, unknown>).sceneIdeas)
}

function getCensorApprovedCount(value: unknown): number {
  if (!value || typeof value !== "object") {
    return 0
  }

  return getArrayLength((value as Record<string, unknown>).approvedDirections)
}

function formatKeyframeSummary(result: NormalizedRunResult): string {
  const counts = result.imagePlan.orderedShots.reduce(
    (summary, shot) => {
      summary[shot.keyframeRole] += 1
      return summary
    },
    { key: 0, secondary: 0, insert: 0 },
  )

  return `${counts.key} key, ${counts.secondary} secondary, ${counts.insert} insert`
}

export function buildPipelineEdgeLabels(result: NormalizedRunResult): Record<string, string> {
  const { beatCount, characterCount } = getAnalysisCounts(result.analysis)
  const { memoryCount, relationCount } = getContinuityCounts(result.continuity)
  const actionCount = getArrayLength(result.actionSplit)
  const creativeIdeaCount = getCreativeIdeaCount((result as unknown as Record<string, unknown>).creativePlan)
  const approvedCount = getCensorApprovedCount((result as unknown as Record<string, unknown>).censorReport)
  const promptCount = getArrayLength(result.promptPackages) || result.imagePlan.orderedShots.length

  return {
    "e-scene-analyst": `${beatCount} beats, ${characterCount} characters`,
    "e-analyst-splitter": `${beatCount} dramatic beats`,
    "e-splitter-context": `${actionCount} actions`,
    "e-context-creative": `${actionCount} routed context`,
    "e-creative-censor": `${creativeIdeaCount} ideas`,
    "e-censor-planner": `${approvedCount} approved directions`,
    "e-planner-continuity": `${result.shotCount} shots (${formatKeyframeSummary(result)})`,
    "e-continuity-composer": `${memoryCount} memories, ${relationCount} relations`,
    "e-composer-optimizer": `${promptCount} raw prompts`,
    "e-optimizer-image": `${promptCount} optimized prompts`,
  }
}