import { createShotMemory, type ShotMemory } from "@/lib/cinematic/shotMemory"
import { resolveBreakdownConfig, type BreakdownEngineConfig } from "@/lib/cinematic/config"
import type { ContinuityPromptBlocks, ShotKeyframeRole, ShotRelation, ShotSpec } from "@/types/cinematic"

export interface ContinuityRisk {
  shotId: string
  previousShotId: string | null
  severity: "low" | "medium" | "high"
  message: string
}

export interface ContinuitySupervisorResult {
  shots: ShotSpec[]
  memories: ShotMemory[]
  risks: ContinuityRisk[]
  relations: ShotRelation[]
}

const SHOT_SIZE_ORDER: Record<string, number> = {
  "EXTREME WIDE": 1,
  WIDE: 2,
  "MEDIUM WIDE": 3,
  "TWO SHOT": 3,
  MEDIUM: 4,
  "OVER SHOULDER": 4,
  "MEDIUM CLOSE-UP": 5,
  CLOSE: 6,
  "CLOSE-UP": 6,
  "EXTREME CLOSE-UP": 7,
  ECU: 7,
  INSERT: 8,
  POV: 5,
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function capitalizeSentence(value: string): string {
  if (!value) {
    return value
  }

  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

function sharedCharacters(previousShot: ShotSpec, currentShot: ShotSpec): string[] {
  const previousCharacters = new Set(previousShot.continuity.characterIds)
  return currentShot.continuity.characterIds.filter((characterId) => previousCharacters.has(characterId))
}

function sharedProps(previousShot: ShotSpec, currentShot: ShotSpec): string[] {
  const previousProps = new Set(previousShot.continuity.propIds.length > 0 ? previousShot.continuity.propIds : previousShot.props)
  return (currentShot.continuity.propIds.length > 0 ? currentShot.continuity.propIds : currentShot.props)
    .filter((propId) => previousProps.has(propId))
}

function normalizeShotSizeRank(shot: ShotSpec): number {
  const raw = [shot.shotSize, shot.shotType]
    .map((value) => value.trim().toUpperCase())
    .find(Boolean)

  return raw ? (SHOT_SIZE_ORDER[raw] ?? 0) : 0
}

function sharesPrimarySubject(previousShot: ShotSpec, currentShot: ShotSpec): boolean {
  const previousSubject = previousShot.subject.trim().toLowerCase()
  const currentSubject = currentShot.subject.trim().toLowerCase()

  if (!previousSubject || !currentSubject) {
    return false
  }

  return previousSubject === currentSubject || previousSubject.includes(currentSubject) || currentSubject.includes(previousSubject)
}

function looksLikeReaction(shot: ShotSpec): boolean {
  const text = [shot.narrativePurpose, shot.dramaticBeat, shot.subject, shot.blocking]
    .join(" ")
    .toLowerCase()
  return /reaction|reacts|listens|absorbs|processes|glance|response/.test(text)
}

function looksLikeReverse(previousShot: ShotSpec, currentShot: ShotSpec): boolean {
  const currentComposition = currentShot.composition.toLowerCase()
  const previousComposition = previousShot.composition.toLowerCase()

  if (currentComposition.includes("reverse") || previousComposition.includes("reverse")) {
    return true
  }

  return sharedCharacters(previousShot, currentShot).length > 0
    && Boolean(previousShot.continuity.screenDirection)
    && Boolean(currentShot.continuity.screenDirection)
    && previousShot.continuity.screenDirection !== currentShot.continuity.screenDirection
}

function looksLikeEstablish(previousShot: ShotSpec, currentShot: ShotSpec): boolean {
  return normalizeShotSizeRank(currentShot) <= 2
    && Boolean(currentShot.environment)
    && previousShot.continuity.locationId !== currentShot.continuity.locationId
}

function looksLikeInsert(currentShot: ShotSpec): boolean {
  return currentShot.shotType.trim().toUpperCase() === "INSERT"
    || currentShot.shotSize.trim().toUpperCase() === "INSERT"
    || currentShot.subject.trim().split(" ").length <= 4 && currentShot.props.length > 0 && normalizeShotSizeRank(currentShot) >= 7
}

function looksLikeMatchCut(previousShot: ShotSpec, currentShot: ShotSpec): boolean {
  return Boolean(previousShot.composition.trim()) && previousShot.composition.trim() === currentShot.composition.trim()
}

function looksLikeCutOnAction(previousShot: ShotSpec, currentShot: ShotSpec): boolean {
  return sharedCharacters(previousShot, currentShot).length > 0
    && Boolean(previousShot.blocking.trim())
    && Boolean(currentShot.blocking.trim())
    && previousShot.blocking.trim() !== currentShot.blocking.trim()
}

function hasLocationShift(previousShot: ShotSpec | null, currentShot: ShotSpec): boolean {
  return Boolean(
    previousShot
    && previousShot.continuity.locationId
    && currentShot.continuity.locationId
    && previousShot.continuity.locationId !== currentShot.continuity.locationId
  )
}

function hasTimeShift(previousShot: ShotSpec | null, currentShot: ShotSpec): boolean {
  return Boolean(
    previousShot
    && previousShot.continuity.timeOfDay
    && currentShot.continuity.timeOfDay
    && previousShot.continuity.timeOfDay !== currentShot.continuity.timeOfDay
  )
}

function hasSubjectShift(previousShot: ShotSpec | null, currentShot: ShotSpec): boolean {
  if (!previousShot) {
    return false
  }

  return !sharesPrimarySubject(previousShot, currentShot)
}

function hasCharacterShift(previousShot: ShotSpec | null, currentShot: ShotSpec): boolean {
  if (!previousShot) {
    return false
  }

  return sharedCharacters(previousShot, currentShot).length === 0
}

function isWideAnchorShot(shot: ShotSpec): boolean {
  return normalizeShotSizeRank(shot) > 0 && normalizeShotSizeRank(shot) <= 2
}

function deriveKeyframeState(
  previousShot: ShotSpec | null,
  currentShot: ShotSpec,
  index: number,
  config?: BreakdownEngineConfig,
  lastKeyShotId?: string | null,
): { role: ShotKeyframeRole; reason: string; anchorShotId: string | null } {
  if (index === 0) {
    return {
      role: "key",
      reason: "Opening key shot that establishes the canonical world state for the sequence.",
      anchorShotId: currentShot.id,
    }
  }

  if (looksLikeInsert(currentShot)) {
    return {
      role: "insert",
      reason: "Insert shot that must inherit identity and geography from the nearest key anchor.",
      anchorShotId: lastKeyShotId ?? previousShot?.id ?? null,
    }
  }

  const resolved = resolveBreakdownConfig(config)
  const majorShift = hasLocationShift(previousShot, currentShot)
    || hasTimeShift(previousShot, currentShot)
    || hasCharacterShift(previousShot, currentShot)
    || (hasSubjectShift(previousShot, currentShot) && isWideAnchorShot(currentShot))

  if (resolved.keyframePolicy === "every_major_shift" && (majorShift || isWideAnchorShot(currentShot))) {
    return {
      role: "key",
      reason: majorShift
        ? "Key shot created because the scene shifts in subject, geography, or continuity state."
        : "Key shot created to reset geography with a strong anchoring frame.",
      anchorShotId: currentShot.id,
    }
  }

  if (resolved.keyframePolicy === "story_turns" && majorShift) {
    return {
      role: "key",
      reason: "Key shot created at a story turn so later shots can inherit a stable visual anchor.",
      anchorShotId: currentShot.id,
    }
  }

  return {
    role: "secondary",
    reason: "Secondary coverage shot that should inherit the canonical world state instead of redefining it.",
    anchorShotId: lastKeyShotId ?? previousShot?.continuity.anchorShotId ?? previousShot?.id ?? null,
  }
}

export function deriveShotRelation(previousShot: ShotSpec, currentShot: ShotSpec): ShotRelation {
  const constraints = uniqueStrings([
    ...sharedCharacters(previousShot, currentShot).map((characterId) => `preserve character continuity for ${characterId}`),
    ...sharedProps(previousShot, currentShot).map((propId) => `keep ${propId} consistent across the cut`),
    previousShot.continuity.locationId && previousShot.continuity.locationId === currentShot.continuity.locationId
      ? `hold the same geography in ${currentShot.continuity.locationId}`
      : "",
    previousShot.continuity.screenDirection && previousShot.continuity.screenDirection === currentShot.continuity.screenDirection
      ? `maintain ${currentShot.continuity.screenDirection} screen direction`
      : "",
    previousShot.continuity.axisOfAction && previousShot.continuity.axisOfAction === currentShot.continuity.axisOfAction
      ? `stay on the ${currentShot.continuity.axisOfAction} axis`
      : "",
  ])

  const previousRank = normalizeShotSizeRank(previousShot)
  const currentRank = normalizeShotSizeRank(currentShot)
  if (sharesPrimarySubject(previousShot, currentShot) && currentRank > previousRank && previousRank > 0) {
    return {
      fromShotId: previousShot.id,
      toShotId: currentShot.id,
      relationType: "match_cut",
      relationIntent: "tension",
      reason: "Same subject continues into tighter framing, creating a push-in progression.",
      continuityConstraints: constraints,
    }
  }

  if (looksLikeInsert(currentShot)) {
    return {
      fromShotId: previousShot.id,
      toShotId: currentShot.id,
      relationType: "insert",
      relationIntent: "focus_shift",
      reason: "The cut isolates an object or detail while preserving the same action line.",
      continuityConstraints: constraints,
    }
  }

  if (looksLikeReverse(previousShot, currentShot)) {
    return {
      fromShotId: previousShot.id,
      toShotId: currentShot.id,
      relationType: "reverse",
      relationIntent: looksLikeReaction(currentShot) ? "reaction" : "reveal",
      reason: "The cut flips to the opposing angle while preserving shared dialogue geography.",
      continuityConstraints: constraints,
    }
  }

  if (looksLikeReaction(currentShot)) {
    return {
      fromShotId: previousShot.id,
      toShotId: currentShot.id,
      relationType: "reaction",
      relationIntent: "reaction",
      reason: "The next shot is framed as an emotional or observational response to the previous action.",
      continuityConstraints: constraints,
    }
  }

  if (looksLikeMatchCut(previousShot, currentShot)) {
    return {
      fromShotId: previousShot.id,
      toShotId: currentShot.id,
      relationType: "match_cut",
      relationIntent: "tension",
      reason: "The shots maintain closely matched composition and screen position across the cut.",
      continuityConstraints: constraints,
    }
  }

  if (looksLikeEstablish(previousShot, currentShot)) {
    return {
      fromShotId: previousShot.id,
      toShotId: currentShot.id,
      relationType: "establish",
      relationIntent: "geography",
      reason: "The cut re-establishes space or geography before coverage continues.",
      continuityConstraints: constraints,
    }
  }

  if (looksLikeCutOnAction(previousShot, currentShot)) {
    return {
      fromShotId: previousShot.id,
      toShotId: currentShot.id,
      relationType: "cut_on_action",
      relationIntent: "action_continuation",
      reason: "The edit continues an in-progress action across adjacent framings.",
      continuityConstraints: constraints,
    }
  }

  return {
    fromShotId: previousShot.id,
    toShotId: currentShot.id,
    relationType: "parallel",
    relationIntent: sharedCharacters(previousShot, currentShot).length > 0 ? "reveal" : "focus_shift",
    reason: "The cut maintains sequence flow without a tighter continuity-specific pattern.",
    continuityConstraints: constraints,
  }
}

function describeWardrobeAnchors(shot: ShotSpec): string[] {
  return Object.entries(shot.continuity.wardrobeState)
    .map(([characterId, state]) => `${characterId} wardrobe: ${state.trim()}`)
    .filter((entry) => !entry.endsWith(": "))
}

export function buildLockedAnchorsFromShot(shot: ShotSpec): string[] {
  return uniqueStrings([
    ...shot.continuity.lockedVisualAnchors,
    ...describeWardrobeAnchors(shot),
    ...shot.props.map((prop) => `prop: ${prop}`),
    shot.continuity.locationId ? `location: ${shot.continuity.locationId}` : "",
    shot.lighting ? `lighting: ${shot.lighting}` : "",
    shot.palette.length > 0 ? `palette: ${shot.palette.join(", ")}` : "",
    shot.composition ? `composition: ${shot.composition}` : "",
  ])
}

export function deriveCarryOverInstructions(previousShot: ShotSpec | null, currentShot: ShotSpec): string {
  if (!previousShot) {
    return "Establish the continuity baseline for this scene before coverage tightens."
  }

  const anchors: string[] = []
  const sharedCharacterIds = sharedCharacters(previousShot, currentShot)
  const sharedPropIds = sharedProps(previousShot, currentShot)

  if (sharedCharacterIds.length > 0) {
    anchors.push(`preserve ${sharedCharacterIds.join(", ")} as the same on-screen characters from the previous shot`)
  }

  if (sharedPropIds.length > 0) {
    anchors.push(`keep ${sharedPropIds.join(", ")} in the same continuity state`)
  }

  if (previousShot.continuity.locationId && previousShot.continuity.locationId === currentShot.continuity.locationId) {
    anchors.push(`hold the same location geography in ${currentShot.continuity.locationId}`)
  }

  if (previousShot.continuity.screenDirection && previousShot.continuity.screenDirection === currentShot.continuity.screenDirection) {
    anchors.push(`maintain ${currentShot.continuity.screenDirection} screen direction`)
  }

  if (previousShot.continuity.axisOfAction && previousShot.continuity.axisOfAction === currentShot.continuity.axisOfAction) {
    anchors.push(`stay on the same ${currentShot.continuity.axisOfAction} axis of action`)
  }

  if (previousShot.lighting && previousShot.lighting === currentShot.lighting) {
    anchors.push(`preserve the same lighting motivation`)
  }

  if (anchors.length === 0) {
    return "Carry forward the established continuity only where it still serves the next framing."
  }

  return `${anchors[0].charAt(0).toUpperCase()}${anchors[0].slice(1)}${anchors.length > 1 ? `, and ${anchors.slice(1).join(", ")}` : ""}.`
}

export function deriveSetupForNext(currentShot: ShotSpec, nextShot: ShotSpec | null): string {
  if (!nextShot) {
    return "Resolve the current beat cleanly without introducing new continuity obligations."
  }

  const setups: string[] = []
  const upcomingCharacters = sharedCharacters(currentShot, nextShot)
  const upcomingProps = sharedProps(currentShot, nextShot)

  if (upcomingCharacters.length > 0) {
    setups.push(`prepare continuity for ${upcomingCharacters.join(", ")} in the next shot`)
  }

  if (upcomingProps.length > 0) {
    setups.push(`hold ${upcomingProps.join(", ")} for the next setup`)
  }

  if (currentShot.continuity.locationId && currentShot.continuity.locationId === nextShot.continuity.locationId) {
    setups.push(`keep the same scene geography ready for the next frame`)
  }

  if (nextShot.shotType === "INSERT" || nextShot.shotSize === "INSERT") {
    setups.push(`prepare a clean visual path into the next insert shot`)
  }

  if (nextShot.continuity.screenDirection) {
    setups.push(`support ${nextShot.continuity.screenDirection} directional flow into the next shot`)
  }

  return setups.length > 0
    ? `${setups[0].charAt(0).toUpperCase()}${setups[0].slice(1)}${setups.length > 1 ? `, and ${setups.slice(1).join(", ")}` : ""}.`
    : "Leave the scene visually open enough for the next shot to redefine emphasis without breaking continuity."
}

function buildPromptBlocks(
  shot: ShotSpec,
  previousShot: ShotSpec | null,
  nextShot: ShotSpec | null,
  relation: ShotRelation | null,
  keyframeState: { role: ShotKeyframeRole; reason: string; anchorShotId: string | null },
  lockedAnchors: string[],
  carryOver: string,
  setupForNext: string,
  warnings: string[],
): ContinuityPromptBlocks {
  const preserve = uniqueStrings([
    keyframeState.role === "key"
      ? "Treat this shot as the canonical visual anchor for the surrounding sequence."
      : keyframeState.anchorShotId
        ? `Match the established world state from anchor shot ${keyframeState.anchorShotId}.`
        : "",
    ...lockedAnchors,
    carryOver,
    shot.continuity.screenDirection ? `Keep screen direction: ${shot.continuity.screenDirection}.` : "",
    shot.continuity.axisOfAction ? `Keep axis of action: ${shot.continuity.axisOfAction}.` : "",
    shot.continuity.eyeline ? `Keep eyeline logic: ${shot.continuity.eyeline}.` : "",
  ].map(capitalizeSentence))

  const change = uniqueStrings([
    keyframeState.reason,
    previousShot && previousShot.shotSize !== shot.shotSize ? `Change framing from ${previousShot.shotSize} to ${shot.shotSize}.` : shot.shotSize ? `Frame this as a ${shot.shotSize}.` : "",
    previousShot && previousShot.camera !== shot.camera ? `Adjust camera treatment to ${shot.camera}.` : shot.camera ? `Use camera treatment: ${shot.camera}.` : "",
    previousShot && previousShot.blocking !== shot.blocking ? `Advance blocking to ${shot.blocking}.` : shot.blocking ? `Stage action as ${shot.blocking}.` : "",
    relation ? relation.reason : "",
  ].map(capitalizeSentence))

  const prepare = uniqueStrings([
    setupForNext,
    nextShot ? `Prepare a clean handoff into shot ${nextShot.id}.` : "",
    nextShot?.subject ? `Leave the frame ready for the next emphasis on ${nextShot.subject}.` : "",
  ].map(capitalizeSentence))

  const doNot = uniqueStrings([
    shot.continuity.characterIds.length > 0 ? "Do not alter character identity, wardrobe logic, or casting cues." : "",
    shot.continuity.locationId ? `Do not relocate the scene away from ${shot.continuity.locationId} without explicit story motivation.` : "",
    shot.continuity.screenDirection ? "Do not flip screen direction unless the edit intentionally breaks continuity." : "",
    shot.continuity.axisOfAction ? "Do not break the axis of action." : "",
    warnings.length > 0 ? `Do not introduce any extra continuity breaks beyond these known risks: ${warnings.join("; ")}.` : "Do not introduce new unmotivated continuity drift.",
  ].map(capitalizeSentence))

  return {
    preserve,
    change,
    prepare,
    doNot,
  }
}

export function detectContinuityRisks(previousShot: ShotSpec | null, currentShot: ShotSpec): ContinuityRisk[] {
  if (!previousShot) {
    return []
  }

  const risks: ContinuityRisk[] = []
  const sharedCharacterIds = sharedCharacters(previousShot, currentShot)

  for (const characterId of sharedCharacterIds) {
    const previousWardrobe = previousShot.continuity.wardrobeState[characterId]
    const currentWardrobe = currentShot.continuity.wardrobeState[characterId]

    if (previousWardrobe && currentWardrobe && previousWardrobe !== currentWardrobe) {
      risks.push({
        shotId: currentShot.id,
        previousShotId: previousShot.id,
        severity: "high",
        message: `Wardrobe changed for ${characterId} between adjacent shots (${previousWardrobe} -> ${currentWardrobe}).`,
      })
    }
  }

  if (previousShot.continuity.locationId && currentShot.continuity.locationId && previousShot.continuity.locationId !== currentShot.continuity.locationId) {
    risks.push({
      shotId: currentShot.id,
      previousShotId: previousShot.id,
      severity: "medium",
      message: `Location changed from ${previousShot.continuity.locationId} to ${currentShot.continuity.locationId} across adjacent shots.`,
    })
  }

  if (previousShot.continuity.screenDirection && currentShot.continuity.screenDirection && previousShot.continuity.screenDirection !== currentShot.continuity.screenDirection) {
    risks.push({
      shotId: currentShot.id,
      previousShotId: previousShot.id,
      severity: "medium",
      message: `Screen direction flips from ${previousShot.continuity.screenDirection} to ${currentShot.continuity.screenDirection}.`,
    })
  }

  if (previousShot.continuity.axisOfAction && currentShot.continuity.axisOfAction && previousShot.continuity.axisOfAction !== currentShot.continuity.axisOfAction) {
    risks.push({
      shotId: currentShot.id,
      previousShotId: previousShot.id,
      severity: "high",
      message: `Axis of action shifts from ${previousShot.continuity.axisOfAction} to ${currentShot.continuity.axisOfAction}.`,
    })
  }

  if (previousShot.palette.length > 0 && currentShot.palette.length > 0) {
    const sharedPalette = currentShot.palette.filter((entry) => previousShot.palette.includes(entry))
    if (sharedPalette.length === 0) {
      risks.push({
        shotId: currentShot.id,
        previousShotId: previousShot.id,
        severity: "low",
        message: "Adjacent shots do not share any palette anchors.",
      })
    }
  }

  if (previousShot.lighting && currentShot.lighting && previousShot.lighting !== currentShot.lighting) {
    risks.push({
      shotId: currentShot.id,
      previousShotId: previousShot.id,
      severity: "low",
      message: `Lighting strategy changes from "${previousShot.lighting}" to "${currentShot.lighting}".`,
    })
  }

  return risks
}

export function superviseShotContinuity(shots: ShotSpec[], config?: BreakdownEngineConfig): ContinuitySupervisorResult {
  const risks: ContinuityRisk[] = []
  const relations: ShotRelation[] = []
  let lastKeyShotId: string | null = null
  const enrichedShots = shots.map((shot, index) => {
    const previousShot = index > 0 ? shots[index - 1] : null
    const nextShot = index < shots.length - 1 ? shots[index + 1] : null
    const shotRisks = detectContinuityRisks(previousShot, shot)
    risks.push(...shotRisks)

    const relation = previousShot ? deriveShotRelation(previousShot, shot) : null
    if (previousShot) {
      relations.push(relation)
    }

    const lockedVisualAnchors = buildLockedAnchorsFromShot(shot)
    const carryOverFromPrevious = deriveCarryOverInstructions(previousShot, shot)
    const setupForNext = deriveSetupForNext(shot, nextShot)
    const continuityWarnings = shotRisks.map((risk) => risk.message)
    const keyframeState = deriveKeyframeState(previousShot, shot, index, config, lastKeyShotId)
    if (keyframeState.role === "key") {
      lastKeyShotId = shot.id
    }

    const promptBlocks = buildPromptBlocks(
      shot,
      previousShot,
      nextShot,
      relation,
      keyframeState,
      lockedVisualAnchors,
      carryOverFromPrevious,
      setupForNext,
      continuityWarnings,
    )

    return {
      ...shot,
      continuity: {
        ...shot.continuity,
        lockedVisualAnchors,
        carryOverFromPrevious,
        setupForNext,
        continuityWarnings,
        keyframeRole: keyframeState.role,
        keyframeReason: keyframeState.reason,
        anchorShotId: keyframeState.anchorShotId,
        promptBlocks,
      },
    }
  })

  const memories = enrichedShots.map((shot) => createShotMemory(shot))

  return {
    shots: enrichedShots,
    memories,
    risks,
    relations,
  }
}