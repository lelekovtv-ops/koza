export type ShotDensity = "lean" | "balanced" | "dense"
export type ContinuityStrictness = "flexible" | "standard" | "strict"
export type TextRichness = "simple" | "rich" | "lush"
export type RelationMode = "minimal" | "balanced" | "explicit"
export type FallbackMode = "balanced" | "prefer_speed" | "fail_fast"
export type KeyframePolicy = "opening_anchor" | "story_turns" | "every_major_shift"

export interface BreakdownEngineConfig {
  shotDensity: ShotDensity
  continuityStrictness: ContinuityStrictness
  textRichness: TextRichness
  relationMode: RelationMode
  fallbackMode: FallbackMode
  keyframePolicy: KeyframePolicy
}

export const DEFAULT_BREAKDOWN_ENGINE_CONFIG: BreakdownEngineConfig = {
  shotDensity: "balanced",
  continuityStrictness: "standard",
  textRichness: "rich",
  relationMode: "balanced",
  fallbackMode: "balanced",
  keyframePolicy: "story_turns",
}

export function resolveBreakdownConfig(config?: Partial<BreakdownEngineConfig>): BreakdownEngineConfig {
  return {
    shotDensity: config?.shotDensity ?? DEFAULT_BREAKDOWN_ENGINE_CONFIG.shotDensity,
    continuityStrictness: config?.continuityStrictness ?? DEFAULT_BREAKDOWN_ENGINE_CONFIG.continuityStrictness,
    textRichness: config?.textRichness ?? DEFAULT_BREAKDOWN_ENGINE_CONFIG.textRichness,
    relationMode: config?.relationMode ?? DEFAULT_BREAKDOWN_ENGINE_CONFIG.relationMode,
    fallbackMode: config?.fallbackMode ?? DEFAULT_BREAKDOWN_ENGINE_CONFIG.fallbackMode,
    keyframePolicy: config?.keyframePolicy ?? DEFAULT_BREAKDOWN_ENGINE_CONFIG.keyframePolicy,
  }
}

export function buildBreakdownConfigPrompt(config?: Partial<BreakdownEngineConfig>): string {
  const resolved = resolveBreakdownConfig(config)

  return `ENGINE SETTINGS:
- Shot density: ${resolved.shotDensity}
- Continuity strictness: ${resolved.continuityStrictness}
- Text richness: ${resolved.textRichness}
- Relation mode: ${resolved.relationMode}
- Fallback mode: ${resolved.fallbackMode}
- Keyframe policy: ${resolved.keyframePolicy}`
}

export function getShotDensityMultiplier(config?: Partial<BreakdownEngineConfig>): number {
  const resolved = resolveBreakdownConfig(config)

  switch (resolved.shotDensity) {
    case "lean":
      return 0.75
    case "dense":
      return 1.35
    default:
      return 1
  }
}

export function getContinuityWarningLimit(config?: Partial<BreakdownEngineConfig>): number {
  const resolved = resolveBreakdownConfig(config)

  switch (resolved.continuityStrictness) {
    case "flexible":
      return 2
    case "strict":
      return 6
    default:
      return 4
  }
}

export function shouldAllowLocalFallback(config?: Partial<BreakdownEngineConfig>): boolean {
  return resolveBreakdownConfig(config).fallbackMode !== "fail_fast"
}

export function simplifyText(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) {
    return ""
  }

  const sentence = trimmed.match(/^[^.?!]+[.?!]?/u)?.[0]?.trim()
  return sentence || trimmed
}

export function enrichText(text: string, extra: string, richness: TextRichness): string {
  const trimmed = text.trim()

  if (!trimmed) {
    return richness === "lush" ? extra.trim() : ""
  }

  if (richness === "simple") {
    return simplifyText(trimmed)
  }

  if (richness === "lush" && extra.trim() && !trimmed.toLowerCase().includes(extra.trim().toLowerCase())) {
    const suffix = trimmed.endsWith(".") ? "" : "."
    return `${trimmed}${suffix} ${extra.trim()}`
  }

  return trimmed
}