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
    formatList("Персонажи", continuity.characterIds),
    formatList("Костюм", Object.entries(continuity.wardrobeState).map(([characterId, state]) => `${characterId}=${state}`)),
    formatList("Реквизит", continuity.propIds),
    continuity.locationId ? `Локационный якорь: ${continuity.locationId}` : null,
    continuity.timeOfDay ? `Время суток: ${continuity.timeOfDay}` : null,
    continuity.screenDirection ? `Экранное направление: ${continuity.screenDirection}` : null,
    continuity.eyeline ? `Линия взгляда: ${continuity.eyeline}` : null,
    continuity.axisOfAction ? `Ось действия: ${continuity.axisOfAction}` : null,
    continuity.carryOverFromPrevious ? `Переход из прошлого кадра: ${continuity.carryOverFromPrevious}` : null,
    continuity.setupForNext ? `Подготовка следующего кадра: ${continuity.setupForNext}` : null,
    formatList("Зафиксированные якоря", continuity.lockedVisualAnchors),
  ])
}

function buildLegacyLabel(spec: ShotSpec): string {
  const primary = compactLines([spec.narrativePurpose, spec.dramaticBeat, spec.subject])[0]
  if (primary) {
    return primary
  }

  const technical = compactLines([spec.shotSize, spec.shotType]).join(" ")
  return technical || `Кадр ${spec.order + 1}`
}

function buildLegacyCaption(spec: ShotSpec): string {
  return compactLines([spec.subject, spec.environment])[0] ?? buildLegacyLabel(spec)
}

function buildLegacyNotes(spec: ShotSpec): string {
  return compactLines([
    spec.dramaticBeat ? `Бит: ${spec.dramaticBeat}` : null,
    spec.composition ? `Композиция: ${spec.composition}` : null,
    spec.blocking ? `Действие: ${spec.blocking}` : null,
    spec.environment ? `Среда: ${spec.environment}` : null,
    spec.lighting ? `Свет: ${spec.lighting}` : null,
    formatList("Палитра", spec.palette),
    formatList("Реквизит", spec.props),
    ...formatContinuity(spec),
  ]).join("\n")
}

function buildLegacyDirectorNote(spec: ShotSpec): string {
  return compactLines([
    spec.narrativePurpose,
    spec.transitionIn ? `Вход в кадр: ${spec.transitionIn}` : null,
    spec.transitionOut ? `Выход из кадра: ${spec.transitionOut}` : null,
  ]).join("\n")
}

function buildLegacyCameraNote(spec: ShotSpec): string {
  return compactLines([
    spec.shotType ? `Тип: ${spec.shotType}` : null,
    spec.composition ? `Композиция: ${spec.composition}` : null,
    spec.camera ? `Оператор: ${spec.camera}` : null,
  ]).join("\n")
}

function buildLegacyVisualDescription(spec: ShotSpec): string {
  return compactLines([
    spec.subject,
    spec.environment,
    spec.blocking,
    spec.lighting,
    formatList("Палитра", spec.palette),
    formatList("Реквизит", spec.props),
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