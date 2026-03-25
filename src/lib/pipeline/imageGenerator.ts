import { convertReferenceImagesToDataUrls, getShotGenerationReferenceImages } from "@/lib/imageGenerationReferences"
import type { CharacterEntry, LocationEntry } from "@/lib/bibleParser"
import { optimizeGenerationPromptDetailed, type PromptOptimizationComparison } from "@/lib/pipeline/promptOptimizer"
import type { TimelineShot } from "@/store/timeline"
import { useBibleStore } from "@/store/bible"
import { usePipelineStore } from "@/store/pipeline"
import type { KeyframeRole, NormalizedRunResult, ShotExecutionEntry } from "@/types/pipeline"

export type ImageGenModel = "gpt-image" | "nano-banana" | "nano-banana-2" | "nano-banana-pro"

export interface ImageGenRequest {
  shotId: string
  prompt: string
  model: ImageGenModel
  referenceImages?: string[]
}

interface ImageGenerationRetryInput {
  sceneId: string
  promptEntry: PipelinePromptEntry
  optimization: PromptOptimizationComparison
  model: ImageGenModel
  referenceImages?: string[]
}

export interface ImageGenResult {
  shotId: string
  imageUrl: string
  model: ImageGenModel
  durationMs: number
  prompt: string
}

export interface PipelinePromptEntry {
  shotId: string
  label: string
  prompt: string
  executionOrder: number
  keyframeRole: KeyframeRole
  referenceShotIds: string[]
  shotSize: string
  cameraMotion: string
  notes: string
  visualDescription: string
  characterIds: string[]
  locationId: string | null
  continuitySummary: string
}

export function buildPromptOptimizationPreview(
  sceneId: string,
  promptEntry: PipelinePromptEntry,
  allPromptEntries: PipelinePromptEntry[],
  characters: CharacterEntry[],
  locations: LocationEntry[],
): PromptOptimizationComparison {
  const timelineShot = createPipelineTimelineShot(sceneId, promptEntry)
  const shotCharacters = resolvePromptCharacters(promptEntry, timelineShot, characters)
  const shotLocations = resolvePromptLocations(promptEntry, sceneId, timelineShot, locations)
  const referencedEntries = promptEntry.referenceShotIds
    .map((shotId) => allPromptEntries.find((entry) => entry.shotId === shotId))
    .filter((entry): entry is PipelinePromptEntry => Boolean(entry))
  const detailLockLines = buildDetailLockInstructions(promptEntry, shotCharacters, shotLocations)
  const rawPrompt = buildContinuityAwarePrompt(promptEntry, referencedEntries, detailLockLines)

  return optimizeGenerationPromptDetailed({
    rawPrompt,
    promptEntry,
    characters: shotCharacters,
    locations: shotLocations,
    referencedLabels: referencedEntries.map((entry) => entry.label),
  })
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function getStringArray(value: unknown): string[] {
  return getArray(value).map((item) => getString(item)).filter(Boolean)
}

function resolvePromptCharacters(
  promptEntry: PipelinePromptEntry,
  timelineShot: TimelineShot,
  characters: CharacterEntry[],
): CharacterEntry[] {
  const byId = promptEntry.characterIds
    .map((characterId) => characters.find((entry) => entry.id === characterId))
    .filter((entry): entry is CharacterEntry => Boolean(entry))

  if (byId.length > 0) {
    return byId
  }

  const shotText = [
    timelineShot.label,
    timelineShot.caption,
    timelineShot.notes,
    timelineShot.imagePrompt,
    timelineShot.visualDescription,
  ].join(" ").toLowerCase()

  return characters.filter((character) => {
    const name = character.name.trim().toLowerCase()
    return Boolean(name) && shotText.includes(name)
  })
}

function resolvePromptLocation(
  promptEntry: PipelinePromptEntry,
  sceneId: string,
  locations: LocationEntry[],
): LocationEntry | null {
  if (promptEntry.locationId) {
    const byId = locations.find((location) => location.id === promptEntry.locationId)
    if (byId) {
      return byId
    }
  }

  return locations.find((location) => location.sceneIds.includes(sceneId)) ?? null
}

function resolvePromptLocations(
  promptEntry: PipelinePromptEntry,
  sceneId: string,
  timelineShot: TimelineShot,
  locations: LocationEntry[],
): LocationEntry[] {
  const shotText = [
    timelineShot.label,
    timelineShot.caption,
    timelineShot.notes,
    timelineShot.imagePrompt,
    timelineShot.visualDescription,
    promptEntry.continuitySummary,
  ].join(" ").toLowerCase()

  const primary = resolvePromptLocation(promptEntry, sceneId, locations)
  const mentioned = locations.filter((location) => {
    const candidates = [location.name, location.fullHeading]
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)

    return candidates.some((candidate) => shotText.includes(candidate))
  })

  return [primary, ...mentioned]
    .filter((location): location is LocationEntry => Boolean(location))
    .filter((location, index, all) => all.findIndex((entry) => entry.id === location.id) === index)
    .slice(0, 2)
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function anonymizeCharacterNames(text: string, characters: CharacterEntry[]): string {
  let nextText = text

  for (const character of characters) {
    const name = compactText(character.name)
    if (!name) {
      continue
    }

    const namePattern = new RegExp(escapeRegExp(name), "giu")
    nextText = nextText.replace(namePattern, "the character")
  }

  return nextText
}

function sanitizeCameraFacingLanguage(text: string): string {
  return text
    .replace(/looking\s+(?:straight\s+)?at\s+(?:the\s+)?camera/giu, "gaze directed slightly off-camera")
    .replace(/looking\s+into\s+(?:the\s+)?camera/giu, "gaze directed slightly off-camera")
    .replace(/looking\s+into\s+(?:the\s+)?lens/giu, "gaze directed slightly off-camera")
    .replace(/looking\s+directly\s+at\s+(?:the\s+)?viewer/giu, "gaze directed slightly off-camera")
    .replace(/looking\s+directly\s+at\s+(?:the\s+)?lens/giu, "gaze directed slightly off-camera")
}

function sanitizeVisibleTextLanguage(text: string): string {
  return text
    .replace(/\bno text\b/giu, "no visible text or lettering")
    .replace(/name\s+patches?/giu, "visible name patches")
}

function sanitizeGenerationText(text: string, characters: CharacterEntry[]): string {
  return sanitizeVisibleTextLanguage(
    sanitizeCameraFacingLanguage(
      anonymizeCharacterNames(text, characters),
    ),
  )
}

function buildCharacterDetailLock(character: CharacterEntry): string {
  const canon = sanitizeGenerationText(compactText(character.appearancePrompt || character.description), [character])
  if (!canon) {
    return `The recurring character: preserve exact face shape, hairstyle, hair volume, hairline, beard/mustache shape, age impression, wardrobe silhouette, and any recurring accessories from references.`
  }

  return `The recurring character: ${canon}. Preserve exact hairstyle, hair length, hair texture, beard/mustache shape, facial proportions, wardrobe silhouette, and recurring accessories exactly as established.`
}

function buildLocationDetailLock(location: LocationEntry): string {
  const canon = compactText(location.appearancePrompt || location.description)
  const timeOfDay = compactText(location.timeOfDay)

  if (!canon && !timeOfDay) {
    return `${location.name}: preserve the same room geometry, window layout, practical lights, weather cues, and environmental wear from references.`
  }

  const parts = [canon, timeOfDay ? `time of day: ${timeOfDay}` : ""].filter(Boolean)
  return `${location.name}: ${parts.join("; ")}. Preserve exact geometry, light sources, window orientation, and atmosphere.`
}

function buildDetailLockInstructions(
  promptEntry: PipelinePromptEntry,
  characters: CharacterEntry[],
  locations: LocationEntry[],
): string[] {
  const lines = [
    "Detail lock pass:",
    "- Treat reference images as canon for face, hairstyle, beard, costume, props, and set dressing.",
    "- Do not redesign hair shape, hair length, beard density, face proportions, clothing cut, or accessories between shots.",
    "- If the shot changes angle or distance, keep the same subject details and only transform viewpoint/camera blocking.",
    "- Never render visible letters, names, logos, monograms, patches, or printed text on wardrobe, props, vehicles, or environment unless the shot explicitly requires it.",
    "- Keep gaze motivated inside the scene. Do not have the subject look into the camera unless the shot explicitly requires direct address or a POV reflection setup.",
  ]

  if (characters.length > 0) {
    lines.push(`- Character canon: ${characters.map(buildCharacterDetailLock).join(" | ")}`)
  }

  if (locations[0]) {
    lines.push(`- Primary environment canon: ${buildLocationDetailLock(locations[0])}`)
  }

  if (locations.length > 1) {
    lines.push(`- Secondary environment anchors for windows, background, reflections, or exterior glimpses: ${locations.slice(1).map(buildLocationDetailLock).join(" | ")}`)
  }

  return lines
}

function getShotExecutionLookup(result: NormalizedRunResult | null): Map<string, ShotExecutionEntry> {
  return new Map((result?.imagePlan.orderedShots ?? []).map((shot) => [shot.shotId, shot]))
}

function getContinuitySummary(result: NormalizedRunResult | null, shotId: string): string {
  const continuity = getRecord(result?.continuity)
  if (!continuity) {
    return ""
  }

  const memories = getArray(continuity.memories)
  const relations = getArray(continuity.relations)
  const risks = getArray(continuity.risks)
  const items = [...memories, ...relations, ...risks]

  const relatedRecords = items
    .map((item) => getRecord(item))
    .filter((record): record is Record<string, unknown> => Boolean(record))
    .filter((record) => {
      const relatedShotIds = [
        getString(record.shotId),
        getString(record.toShotId),
        getString(record.fromShotId),
      ].filter(Boolean)
      return relatedShotIds.includes(shotId)
    })

  const fragments = relatedRecords.flatMap((record) => [
    getString(record.summary),
    getString(record.description),
    getString(record.continuityNote),
    getString(record.carryOver),
    getString(record.lighting),
    getString(record.lightingState),
    getString(record.palette),
    getString(record.timeOfDay),
    getString(record.reason),
  ]).filter(Boolean)

  return Array.from(new Set(fragments)).slice(0, 4).join(" | ")
}

async function convertUrlsToDataUrls(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map(async (url) => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to load generated reference image: ${response.status}`)
    }

    const blob = await response.blob()

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result)
          return
        }

        reject(new Error("Failed to encode generated reference image"))
      }
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read generated reference image"))
      reader.readAsDataURL(blob)
    })
  }))
}

function buildContinuityAwarePrompt(
  promptEntry: PipelinePromptEntry,
  referencedEntries: PipelinePromptEntry[],
  detailLockLines: string[],
): string {
  const continuityLines = [
    "Continuity guardrails:",
    "- Preserve the exact same character identity, hair, facial hair, wardrobe, props, and location geometry established by the reference images.",
    "- Match the same motivated lighting setup, practical sources, color temperature, neon hue balance, shadow direction, contrast ratio, and exposure roll-off unless this shot explicitly calls for a lighting change.",
    "- Keep palette and atmosphere continuity; only change framing, blocking, and camera intent requested for this specific shot.",
    "- Do not restage the scene with a new light source or different time of day.",
  ]

  if (referencedEntries.length > 0) {
    continuityLines.push(`- Reference anchors: ${referencedEntries.map((entry) => sanitizeGenerationText(entry.label, [])).join(", ")}.`)
  }

  if (promptEntry.continuitySummary) {
    continuityLines.push(`- Continuity notes: ${sanitizeGenerationText(promptEntry.continuitySummary, [])}.`)
  }

  if (promptEntry.notes) {
    continuityLines.push(`- Shot-specific continuity note: ${sanitizeGenerationText(promptEntry.notes, [])}.`)
  }

  return `${sanitizeGenerationText(promptEntry.prompt, [])}\n\n${detailLockLines.join("\n")}\n\n${continuityLines.join("\n")}`
}

function createPipelineTimelineShot(sceneId: string, promptEntry: PipelinePromptEntry): TimelineShot {
  return {
    id: promptEntry.shotId,
    order: 0,
    duration: 3000,
    type: "image",
    thumbnailUrl: null,
    originalUrl: null,
    thumbnailBlobKey: null,
    originalBlobKey: null,
    sceneId,
    label: promptEntry.label,
    notes: promptEntry.notes,
    shotSize: promptEntry.shotSize,
    cameraMotion: promptEntry.cameraMotion,
    caption: promptEntry.label,
    directorNote: "",
    cameraNote: "",
    videoPrompt: "",
    imagePrompt: promptEntry.prompt,
    visualDescription: promptEntry.visualDescription,
    svg: "",
    blockRange: null,
    locked: false,
    sourceText: promptEntry.prompt,
  }
}

export function extractPipelinePromptEntries(
  result: Pick<NormalizedRunResult, "promptPackages" | "imagePlan" | "continuity"> | null,
): PipelinePromptEntry[] {
  const executionLookup = getShotExecutionLookup(result as NormalizedRunResult | null)

  return getArray(result?.promptPackages)
    .map((item, index) => {
      const record = getRecord(item)
      const shotId = getString(record?.shotId) || `shot-${index + 1}`
      const execution = executionLookup.get(shotId)
      return {
        shotId,
        label: getString(record?.label) || `Shot ${index + 1}`,
        prompt: getString(record?.imagePrompt),
        executionOrder: execution?.executionOrder ?? index,
        keyframeRole: execution?.keyframeRole ?? "secondary",
        referenceShotIds: execution?.referenceShotIds ?? [],
        shotSize: getString(record?.shotSize),
        cameraMotion: getString(record?.cameraMotion),
        notes: getString(record?.notes),
        visualDescription: getString(record?.visualDescription),
        characterIds: getStringArray(record?.characterIds),
        locationId: getString(record?.locationId) || null,
        continuitySummary: getContinuitySummary(result as NormalizedRunResult | null, shotId),
      }
    })
    .filter((item) => item.prompt)
    .sort((a, b) => a.executionOrder - b.executionOrder)
}

export async function generateShotImage(request: ImageGenRequest): Promise<ImageGenResult> {
  const startedAt = Date.now()
  const endpoint = request.model === "gpt-image" ? "/api/gpt-image" : "/api/nano-banana"

  const body = request.model === "gpt-image"
    ? { prompt: request.prompt, referenceImages: request.referenceImages }
    : { prompt: request.prompt, model: request.model, referenceImages: request.referenceImages }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    let details = ""

    try {
      const contentType = response.headers.get("content-type") || ""
      if (contentType.includes("application/json")) {
        const payload = await response.json() as { error?: string; details?: string }
        details = [payload.error, payload.details].filter(Boolean).join(" | ")
      } else {
        details = (await response.text()).trim()
      }
    } catch {
      details = ""
    }

    throw new Error(details ? `Image generation failed: ${response.status} - ${details}` : `Image generation failed: ${response.status}`)
  }

  const blob = await response.blob()
  const imageUrl = URL.createObjectURL(blob)

  return {
    shotId: request.shotId,
    imageUrl,
    model: request.model,
    durationMs: Date.now() - startedAt,
    prompt: request.prompt,
  }
}

function buildRetryPrompt(input: ImageGenerationRetryInput): string {
  const normalized = input.optimization.optimizedPrompt
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join("\n\n")

  return normalized.length > 1200 ? `${normalized.slice(0, 1200).trimEnd()}...` : normalized
}

export async function generatePipelineShotImage(
  sceneId: string,
  promptEntry: PipelinePromptEntry,
  model: ImageGenModel,
): Promise<ImageGenResult> {
  const { characters, locations } = useBibleStore.getState()
  const { imageGenResults, normalizedResult } = usePipelineStore.getState()
  const timelineShot = createPipelineTimelineShot(sceneId, promptEntry)
  const shotCharacters = resolvePromptCharacters(promptEntry, timelineShot, characters)
  const shotLocations = resolvePromptLocations(promptEntry, sceneId, timelineShot, locations)
  const allPromptEntries = extractPipelinePromptEntries(normalizedResult)
  const referencedEntries = promptEntry.referenceShotIds
    .map((shotId) => allPromptEntries.find((entry) => entry.shotId === shotId))
    .filter((entry): entry is PipelinePromptEntry => Boolean(entry))
  const optimization = buildPromptOptimizationPreview(sceneId, promptEntry, allPromptEntries, characters, locations)

  const generatedReferenceUrls = promptEntry.referenceShotIds
    .map((shotId) => imageGenResults[shotId]?.imageUrl)
    .filter((url): url is string => Boolean(url))

  let referenceImages: string[] | undefined
  try {
    const references = getShotGenerationReferenceImages(timelineShot, characters, locations)
    const bibleReferenceImages = references.length > 0
      ? await convertReferenceImagesToDataUrls(references)
      : []
    const generatedReferenceImages = generatedReferenceUrls.length > 0
      ? await convertUrlsToDataUrls(generatedReferenceUrls)
      : []

    referenceImages = [...generatedReferenceImages, ...bibleReferenceImages]
  } catch {
    referenceImages = undefined
  }

  try {
    return await generateShotImage({
      shotId: promptEntry.shotId,
      prompt: optimization.optimizedPrompt,
      model,
      referenceImages,
    })
  } catch (primaryError) {
    const retryPrompt = buildRetryPrompt({
      sceneId,
      promptEntry,
      optimization,
      model,
      referenceImages,
    })

    try {
      return await generateShotImage({
        shotId: promptEntry.shotId,
        prompt: retryPrompt,
        model,
        referenceImages: undefined,
      })
    } catch (retryError) {
      const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError)
      const retryMessage = retryError instanceof Error ? retryError.message : String(retryError)

      throw new Error(`Primary attempt failed: ${primaryMessage}. Retry without references also failed: ${retryMessage}`)
    }
  }
}