import type { CharacterEntry, LocationEntry } from "@/lib/bibleParser"
import type { PipelinePromptEntry } from "@/lib/pipeline/imageGenerator"

export interface PromptOptimizationComparison {
  shotId: string
  label: string
  rawPrompt: string
  optimizedPrompt: string
  removedSignals: string[]
  rawLength: number
  optimizedLength: number
  charsSaved: number
}

interface PromptOptimizerInput {
  rawPrompt: string
  promptEntry: PipelinePromptEntry
  characters: CharacterEntry[]
  locations: LocationEntry[]
  referencedLabels: string[]
}

const SECTION_HEADERS = [
  "KEY SHOT:",
  "ANCHOR SHOT:",
  "PRESERVE:",
  "CHANGE:",
  "PREPARE:",
  "DO NOT:",
  "Detail lock pass:",
  "Continuity guardrails:",
] as const

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = compactText(value)
      .toLowerCase()
      .replace(/^[-*]\s*/, "")
      .replace(/[.:;]+$/g, "")

    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    result.push(compactText(value))
  }

  return result
}

function extractLeadVisual(rawPrompt: string): string {
  const lines = splitLines(rawPrompt)
  const leadLines: string[] = []

  for (const line of lines) {
    if (SECTION_HEADERS.some((header) => line.startsWith(header))) {
      break
    }
    leadLines.push(line)
  }

  return compactText(leadLines.join(" "))
}

function collectSectionItems(rawPrompt: string, header: string): string[] {
  const lines = splitLines(rawPrompt)
  const startIndex = lines.findIndex((line) => line === header)

  if (startIndex === -1) {
    return []
  }

  const items: string[] = []

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (SECTION_HEADERS.some((sectionHeader) => sectionHeader !== header && line.startsWith(sectionHeader))) {
      break
    }
    items.push(line.replace(/^[-*]\s*/, "").trim())
  }

  return dedupeStrings(items)
}

function pickFirstMatch(values: string[], pattern: RegExp): string {
  return values.find((value) => pattern.test(value)) ?? ""
}

function pickMany(values: string[], pattern: RegExp, limit: number): string[] {
  return values.filter((value) => pattern.test(value)).slice(0, limit)
}

function buildCoreContinuitySummary(rawPrompt: string): string[] {
  const preserve = collectSectionItems(rawPrompt, "PRESERVE:")
  const change = collectSectionItems(rawPrompt, "CHANGE:")
  const prepare = collectSectionItems(rawPrompt, "PREPARE:")
  const doNot = collectSectionItems(rawPrompt, "DO NOT:")

  const keep = dedupeStrings([
    pickFirstMatch(preserve, /canonical|anchor/i),
    pickFirstMatch(preserve, /location:/i),
    pickFirstMatch(preserve, /lighting:/i),
    pickFirstMatch(preserve, /palette:/i),
    pickFirstMatch(preserve, /composition:/i),
    ...pickMany(preserve, /prop:/i, 2),
  ].filter(Boolean))

  const changeSummary = dedupeStrings([
    pickFirstMatch(change, /frame this|wide|close|medium|insert/i),
    pickFirstMatch(change, /camera treatment|camera/i),
    pickFirstMatch(change, /stage action|blocking|action as/i),
  ].filter(Boolean))

  const prepareSummary = dedupeStrings([
    pickFirstMatch(prepare, /handoff|next shot|next setup/i),
    pickFirstMatch(prepare, /leave the frame ready|prepare/i),
  ].filter(Boolean))

  const negativeSummary = dedupeStrings([
    pickFirstMatch(doNot, /location|relocate/i),
    pickFirstMatch(doNot, /screen direction/i),
    pickFirstMatch(doNot, /axis/i),
    pickFirstMatch(doNot, /continuity drift|continuity/i),
  ].filter(Boolean))

  const lines: string[] = []

  if (keep.length > 0) {
    lines.push(`Keep: ${keep.join(" | ")}.`)
  }

  if (changeSummary.length > 0) {
    lines.push(`Change only: ${changeSummary.join(" | ")}.`)
  }

  if (prepareSummary.length > 0) {
    lines.push(`Prepare: ${prepareSummary.join(" | ")}.`)
  }

  if (negativeSummary.length > 0) {
    lines.push(`Avoid: ${negativeSummary.join(" | ")}.`)
  }

  return lines
}

function buildCharacterCanon(characters: CharacterEntry[]): string {
  if (characters.length === 0) {
    return ""
  }

  return `Character canon: keep the same identity, hair, facial hair, wardrobe silhouette, and accessories from references.`
}

function buildLocationCanon(locations: LocationEntry[]): string {
  if (locations.length === 0) {
    return ""
  }

  const primary = locations[0]
  const secondary = locations[1]
  const parts = [
    `Primary environment: ${primary.name}. Preserve geometry, window orientation, practical light logic, and atmosphere.`,
    secondary ? `Secondary anchor for windows/background/reflections: ${secondary.name}.` : "",
  ].filter(Boolean)

  return parts.join(" ")
}

function buildReferenceSummary(referencedLabels: string[]): string {
  if (referencedLabels.length === 0) {
    return ""
  }

  return `Reference anchors: ${referencedLabels.slice(0, 2).join(", ")}.`
}

function buildShotSummary(promptEntry: PipelinePromptEntry): string[] {
  return dedupeStrings([
    promptEntry.shotSize ? `Shot size: ${promptEntry.shotSize}.` : "",
    promptEntry.cameraMotion ? `Camera: ${promptEntry.cameraMotion}.` : "",
    promptEntry.visualDescription ? `Visual focus: ${compactText(promptEntry.visualDescription)}.` : "",
    promptEntry.continuitySummary ? `Continuity: ${compactText(promptEntry.continuitySummary)}.` : "",
  ].filter(Boolean))
}

function trimLength(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  const shortened = value.slice(0, maxLength)
  const lastSentenceBreak = Math.max(shortened.lastIndexOf(". "), shortened.lastIndexOf(" | "))
  if (lastSentenceBreak > maxLength * 0.6) {
    return shortened.slice(0, lastSentenceBreak + 1).trim()
  }

  return `${shortened.trimEnd()}...`
}

function normalizeComparableText(value: string): string {
  return compactText(value)
    .toLowerCase()
    .replace(/[.:;]+$/g, "")
}

function buildRemovedSignals(rawPrompt: string, optimizedPrompt: string): string[] {
  const optimizedNormalized = normalizeComparableText(optimizedPrompt)

  return dedupeStrings(
    splitLines(rawPrompt)
      .filter((line) => !SECTION_HEADERS.includes(line as typeof SECTION_HEADERS[number]))
      .map((line) => line.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean)
      .filter((line) => !optimizedNormalized.includes(normalizeComparableText(line))),
  ).slice(0, 12)
}

export function optimizeGenerationPrompt(input: PromptOptimizerInput): string {
  const leadVisual = extractLeadVisual(input.rawPrompt) || compactText(input.promptEntry.prompt)
  const sections = dedupeStrings([
    leadVisual,
    ...buildShotSummary(input.promptEntry),
    ...buildCoreContinuitySummary(input.rawPrompt),
    buildCharacterCanon(input.characters),
    buildLocationCanon(input.locations),
    buildReferenceSummary(input.referencedLabels),
    "Guardrails: no visible text or logos, no unmotivated continuity drift, no new light source or time-of-day change.",
  ].filter(Boolean))

  return trimLength(sections.join("\n\n"), 2400)
}

export function optimizeGenerationPromptDetailed(input: PromptOptimizerInput): PromptOptimizationComparison {
  const optimizedPrompt = optimizeGenerationPrompt(input)

  return {
    shotId: input.promptEntry.shotId,
    label: input.promptEntry.label,
    rawPrompt: input.rawPrompt,
    optimizedPrompt,
    removedSignals: buildRemovedSignals(input.rawPrompt, optimizedPrompt),
    rawLength: input.rawPrompt.length,
    optimizedLength: optimizedPrompt.length,
    charsSaved: Math.max(0, input.rawPrompt.length - optimizedPrompt.length),
  }
}