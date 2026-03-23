import type {
  DirectorPreset,
  CinematographerPreset,
  PipelineConfig,
  PipelineStageId,
  PresetApplyMode,
  PresetDropType,
} from "@/types/pipeline"
import { VALID_DIRECTOR_DROP_TARGETS, VALID_DP_DROP_TARGETS } from "@/types/pipeline"

// ─── Drop validation ────────────────────────────────────────

export function isValidDropTarget(
  presetType: PresetDropType,
  targetNodeId: PipelineStageId | "canvas",
): boolean {
  if (targetNodeId === "canvas") return true
  const nodeId: PipelineStageId = targetNodeId

  switch (presetType) {
    case "director":
      return VALID_DIRECTOR_DROP_TARGETS.includes(nodeId)
    case "cinematographer":
      return VALID_DP_DROP_TARGETS.includes(nodeId)
    case "config":
      return false
  }
}

// ─── Field lock helpers ─────────────────────────────────────

function isFieldLocked(lockedFields: string[], fieldPath: string): boolean {
  return lockedFields.includes(fieldPath)
}

// ─── Merge: Director Preset ─────────────────────────────────

export function mergeDirectorPreset(
  current: DirectorPreset,
  incoming: DirectorPreset,
  lockedFields: string[],
  mode: PresetApplyMode = "merge",
): DirectorPreset {
  if (mode === "replace") {
    // Replace still respects locks
    const result = { ...incoming }
    if (isFieldLocked(lockedFields, "directorPreset.dramaticDensity")) {
      result.dramaticDensity = current.dramaticDensity
    }
    if (isFieldLocked(lockedFields, "directorPreset.pacingStyle")) {
      result.pacingStyle = current.pacingStyle
    }
    if (isFieldLocked(lockedFields, "directorPreset.emotionalFocus")) {
      result.emotionalFocus = current.emotionalFocus
    }
    if (isFieldLocked(lockedFields, "directorPreset.keyframePolicy")) {
      result.keyframePolicy = current.keyframePolicy
    }
    if (isFieldLocked(lockedFields, "directorPreset.actorDirection")) {
      result.actorDirection = current.actorDirection
    }
    if (isFieldLocked(lockedFields, "directorPreset.shotCountRange")) {
      result.shotCountRange = current.shotCountRange
    }
    return result
  }

  // Merge mode: incoming overwrites except locked fields
  return {
    id: incoming.id,
    name: incoming.name,
    description: incoming.description,
    builtIn: incoming.builtIn,
    dramaticDensity: isFieldLocked(lockedFields, "directorPreset.dramaticDensity")
      ? current.dramaticDensity
      : incoming.dramaticDensity,
    pacingStyle: isFieldLocked(lockedFields, "directorPreset.pacingStyle")
      ? current.pacingStyle
      : incoming.pacingStyle,
    emotionalFocus: isFieldLocked(lockedFields, "directorPreset.emotionalFocus")
      ? current.emotionalFocus
      : incoming.emotionalFocus,
    keyframePolicy: isFieldLocked(lockedFields, "directorPreset.keyframePolicy")
      ? current.keyframePolicy
      : incoming.keyframePolicy,
    actorDirection: isFieldLocked(lockedFields, "directorPreset.actorDirection")
      ? current.actorDirection
      : incoming.actorDirection,
    shotCountRange: isFieldLocked(lockedFields, "directorPreset.shotCountRange")
      ? current.shotCountRange
      : incoming.shotCountRange,
  }
}

// ─── Merge: Cinematographer Preset ──────────────────────────

export function mergeCinematographerPreset(
  current: CinematographerPreset,
  incoming: CinematographerPreset,
  lockedFields: string[],
  mode: PresetApplyMode = "merge",
): CinematographerPreset {
  if (mode === "replace") {
    const result = { ...incoming }
    if (isFieldLocked(lockedFields, "cinematographerPreset.lensPreference")) {
      result.lensPreference = current.lensPreference
    }
    if (isFieldLocked(lockedFields, "cinematographerPreset.lightingPhilosophy")) {
      result.lightingPhilosophy = current.lightingPhilosophy
    }
    if (isFieldLocked(lockedFields, "cinematographerPreset.continuityStrictness")) {
      result.continuityStrictness = current.continuityStrictness
    }
    if (isFieldLocked(lockedFields, "cinematographerPreset.textRichness")) {
      result.textRichness = current.textRichness
    }
    if (isFieldLocked(lockedFields, "cinematographerPreset.relationMode")) {
      result.relationMode = current.relationMode
    }
    if (isFieldLocked(lockedFields, "cinematographerPreset.colorPalette")) {
      result.colorPalette = current.colorPalette
    }
    if (isFieldLocked(lockedFields, "cinematographerPreset.cameraMovement")) {
      result.cameraMovement = current.cameraMovement
    }
    if (isFieldLocked(lockedFields, "cinematographerPreset.compositionRules")) {
      result.compositionRules = current.compositionRules
    }
    if (isFieldLocked(lockedFields, "cinematographerPreset.defaultShotSize")) {
      result.defaultShotSize = current.defaultShotSize
    }
    return result
  }

  return {
    id: incoming.id,
    name: incoming.name,
    description: incoming.description,
    builtIn: incoming.builtIn,
    defaultShotSize: isFieldLocked(lockedFields, "cinematographerPreset.defaultShotSize")
      ? current.defaultShotSize
      : incoming.defaultShotSize,
    lensPreference: isFieldLocked(lockedFields, "cinematographerPreset.lensPreference")
      ? current.lensPreference
      : incoming.lensPreference,
    lightingPhilosophy: isFieldLocked(lockedFields, "cinematographerPreset.lightingPhilosophy")
      ? current.lightingPhilosophy
      : incoming.lightingPhilosophy,
    compositionRules: isFieldLocked(lockedFields, "cinematographerPreset.compositionRules")
      ? current.compositionRules
      : incoming.compositionRules,
    colorPalette: isFieldLocked(lockedFields, "cinematographerPreset.colorPalette")
      ? current.colorPalette
      : incoming.colorPalette,
    cameraMovement: isFieldLocked(lockedFields, "cinematographerPreset.cameraMovement")
      ? current.cameraMovement
      : incoming.cameraMovement,
    continuityStrictness: isFieldLocked(lockedFields, "cinematographerPreset.continuityStrictness")
      ? current.continuityStrictness
      : incoming.continuityStrictness,
    textRichness: isFieldLocked(lockedFields, "cinematographerPreset.textRichness")
      ? current.textRichness
      : incoming.textRichness,
    relationMode: isFieldLocked(lockedFields, "cinematographerPreset.relationMode")
      ? current.relationMode
      : incoming.relationMode,
  }
}

// ─── Merge: Full Pipeline Config ────────────────────────────

export function mergePipelineConfig(
  current: PipelineConfig,
  incoming: PipelineConfig,
  mode: PresetApplyMode = "merge",
): PipelineConfig {
  const locked = current.lockedFields
  return {
    ...current,
    id: current.id,
    name: current.name,
    directorPreset: mergeDirectorPreset(current.directorPreset, incoming.directorPreset, locked, mode),
    cinematographerPreset: mergeCinematographerPreset(current.cinematographerPreset, incoming.cinematographerPreset, locked, mode),
    stageModels: incoming.stageModels,
    fallbackMode: incoming.fallbackMode,
    stylePrompt: incoming.stylePrompt,
    language: incoming.language,
    lockedFields: current.lockedFields,
    referenceStrategy: incoming.referenceStrategy,
  }
}

// ─── Lockable field registry ────────────────────────────────

export const LOCKABLE_DIRECTOR_FIELDS = [
  "directorPreset.dramaticDensity",
  "directorPreset.pacingStyle",
  "directorPreset.emotionalFocus",
  "directorPreset.keyframePolicy",
  "directorPreset.actorDirection",
  "directorPreset.shotCountRange",
] as const

export const LOCKABLE_DP_FIELDS = [
  "cinematographerPreset.defaultShotSize",
  "cinematographerPreset.lensPreference",
  "cinematographerPreset.lightingPhilosophy",
  "cinematographerPreset.compositionRules",
  "cinematographerPreset.colorPalette",
  "cinematographerPreset.cameraMovement",
  "cinematographerPreset.continuityStrictness",
  "cinematographerPreset.textRichness",
  "cinematographerPreset.relationMode",
] as const

export const ALL_LOCKABLE_FIELDS = [...LOCKABLE_DIRECTOR_FIELDS, ...LOCKABLE_DP_FIELDS]

export function getFieldDisplayName(fieldPath: string): string {
  const map: Record<string, string> = {
    "directorPreset.dramaticDensity": "Драматическая плотность",
    "directorPreset.pacingStyle": "Стиль темпа",
    "directorPreset.emotionalFocus": "Эмоциональный фокус",
    "directorPreset.keyframePolicy": "Политика ключ. кадров",
    "directorPreset.actorDirection": "Актёрская режиссура",
    "directorPreset.shotCountRange": "Диапазон кадров",
    "cinematographerPreset.defaultShotSize": "Размер кадра по умолч.",
    "cinematographerPreset.lensPreference": "Предпочтение оптики",
    "cinematographerPreset.lightingPhilosophy": "Философия света",
    "cinematographerPreset.compositionRules": "Правила композиции",
    "cinematographerPreset.colorPalette": "Цветовая палитра",
    "cinematographerPreset.cameraMovement": "Движение камеры",
    "cinematographerPreset.continuityStrictness": "Строгость непрерывности",
    "cinematographerPreset.textRichness": "Текстовое богатство",
    "cinematographerPreset.relationMode": "Режим связей",
  }
  return map[fieldPath] ?? fieldPath
}
