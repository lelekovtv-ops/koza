import type { BreakdownDetailedResult } from "@/lib/jenkins"
import type {
  PipelineConfig,
  ShotExecutionEntry,
  KeyframeRole,
  ReferenceStrategy,
} from "@/types/pipeline"

/**
 * Deterministic shot ordering helper.
 *
 * Assigns keyframeRole to each shot and computes optimal generation order
 * based on the configured referenceStrategy:
 *
 * - "none": shots generated in script order
 * - "previous_shot": shots generated in script order, each refs the previous
 * - "keyframe_cascade": key shots first, then secondary anchored to nearest key,
 *   then inserts last
 */
export function buildShotExecutionPlan(
  raw: BreakdownDetailedResult,
  config: PipelineConfig,
): ShotExecutionEntry[] {
  const strategy = config.referenceStrategy
  const shotPlan = raw.shotPlan ?? []
  const promptPackages = raw.promptPackages ?? []

  if (shotPlan.length === 0) return []

  // Build prompt lookup
  const promptById = new Map(
    promptPackages.map((pp) => [pp.shotId, pp]),
  )

  // Assign keyframe roles based on director keyframePolicy + shot properties
  const roles = assignKeyframeRoles(raw, config)

  // Build execution entries
  const entries: ShotExecutionEntry[] = shotPlan.map((shot, i) => {
    const composed = promptById.get(shot.id)
    return {
      shotId: shot.id,
      label: composed?.label ?? `Shot ${i + 1}`,
      order: shot.order,
      executionOrder: 0, // will be assigned below
      keyframeRole: roles.get(shot.id) ?? "secondary",
      referenceStrategy: strategy,
      referenceShotIds: [],
      promptPreview: composed?.imagePrompt?.slice(0, 120) ?? shot.imagePromptBase?.slice(0, 120) ?? "",
    }
  })

  // Sort by strategy and assign execution order + references
  return applyExecutionOrder(entries, strategy)
}

function assignKeyframeRoles(
  raw: BreakdownDetailedResult,
  config: PipelineConfig,
): Map<string, KeyframeRole> {
  const roles = new Map<string, KeyframeRole>()
  const shotPlan = raw.shotPlan ?? []
  const policy = config.directorPreset.keyframePolicy

  if (shotPlan.length === 0) return roles

  // First shot is always a key shot
  if (shotPlan[0]) {
    roles.set(shotPlan[0].id, "key")
  }

  for (let i = 1; i < shotPlan.length; i++) {
    const shot = shotPlan[i]
    const prev = shotPlan[i - 1]

    if (policy === "every_major_shift") {
      // Every shot that changes dramatic beat or environment is a key
      const envChanged = shot.environment !== prev.environment
      const beatChanged = shot.dramaticBeat !== prev.dramaticBeat
      roles.set(shot.id, envChanged || beatChanged ? "key" : "secondary")
    } else if (policy === "story_turns") {
      // Key on dramatic beat changes only
      const beatChanged = shot.dramaticBeat !== prev.dramaticBeat
      roles.set(shot.id, beatChanged ? "key" : "secondary")
    } else {
      // opening_anchor: only first shot is key, rest secondary
      roles.set(shot.id, "secondary")
    }
  }

  // Mark insert-type shots (reaction, insert relations)
  const relations = raw.continuity?.relations ?? []
  for (const rel of relations) {
    if (rel.relationType === "insert" || rel.relationType === "reaction") {
      const current = roles.get(rel.toShotId)
      if (current !== "key") {
        roles.set(rel.toShotId, "insert")
      }
    }
  }

  return roles
}

function applyExecutionOrder(
  entries: ShotExecutionEntry[],
  strategy: ReferenceStrategy,
): ShotExecutionEntry[] {
  if (strategy === "none") {
    // Script order, no references
    return entries.map((e, i) => ({
      ...e,
      executionOrder: i,
      referenceShotIds: [],
    }))
  }

  if (strategy === "previous_shot") {
    // Script order, each shot references the previous
    return entries.map((e, i) => ({
      ...e,
      executionOrder: i,
      referenceShotIds: i > 0 ? [entries[i - 1].shotId] : [],
    }))
  }

  // keyframe_cascade: key shots first, secondary anchored to nearest key, inserts last
  const keyShots = entries.filter((e) => e.keyframeRole === "key")
  const secondaryShots = entries.filter((e) => e.keyframeRole === "secondary")
  const insertShots = entries.filter((e) => e.keyframeRole === "insert")

  const ordered: ShotExecutionEntry[] = []
  let execOrder = 0

  // Phase 1: key shots in script order
  for (const shot of keyShots) {
    ordered.push({
      ...shot,
      executionOrder: execOrder++,
      referenceShotIds: ordered.length > 0 ? [ordered[ordered.length - 1].shotId] : [],
    })
  }

  // Phase 2: secondary shots, each anchored to nearest preceding key
  for (const shot of secondaryShots) {
    const nearestKey = findNearestPrecedingKey(shot, keyShots)
    ordered.push({
      ...shot,
      executionOrder: execOrder++,
      referenceShotIds: nearestKey ? [nearestKey.shotId] : [],
    })
  }

  // Phase 3: inserts, anchored to their script-order predecessor
  for (const shot of insertShots) {
    const preceding = entries.filter((e) => e.order < shot.order)
    const nearest = preceding.length > 0 ? preceding[preceding.length - 1] : null
    ordered.push({
      ...shot,
      executionOrder: execOrder++,
      referenceShotIds: nearest ? [nearest.shotId] : [],
    })
  }

  return ordered
}

function findNearestPrecedingKey(
  shot: ShotExecutionEntry,
  keyShots: ShotExecutionEntry[],
): ShotExecutionEntry | null {
  let nearest: ShotExecutionEntry | null = null
  for (const key of keyShots) {
    if (key.order <= shot.order) {
      nearest = key
    }
  }
  return nearest
}
