import type { PipelineConfig } from "@/types/pipeline"

export interface PipelineConfigExportPayload {
  version: 1
  exportedAt: number
  config: PipelineConfig
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

export function clonePipelineConfig(config: PipelineConfig): PipelineConfig {
  return structuredClone(config)
}

export function createConfigExportPayload(config: PipelineConfig): PipelineConfigExportPayload {
  return {
    version: 1,
    exportedAt: Date.now(),
    config: clonePipelineConfig(config),
  }
}

export function serializeConfigExport(config: PipelineConfig): string {
  return JSON.stringify(createConfigExportPayload(config), null, 2)
}

function isPipelineConfig(value: unknown): value is PipelineConfig {
  if (!isRecord(value)) return false
  if (typeof value.id !== "string" || typeof value.name !== "string") return false
  if (!Array.isArray(value.stageModels) || !Array.isArray(value.lockedFields)) return false
  if (!isRecord(value.directorPreset) || !isRecord(value.cinematographerPreset)) return false
  return true
}

export function parseImportedConfigPayload(rawText: string): PipelineConfig {
  const parsed = JSON.parse(rawText) as unknown

  if (isRecord(parsed) && isPipelineConfig(parsed.config)) {
    return clonePipelineConfig(parsed.config)
  }

  if (isPipelineConfig(parsed)) {
    return clonePipelineConfig(parsed)
  }

  throw new Error("Invalid pipeline config file")
}

export function arePipelineConfigsEqual(a: PipelineConfig | null, b: PipelineConfig | null): boolean {
  if (!a || !b) return false
  return JSON.stringify(a) === JSON.stringify(b)
}