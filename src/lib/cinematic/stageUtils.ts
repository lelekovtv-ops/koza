/**
 * Shared utilities for AI pipeline stages.
 * Kept minimal after old pipeline cleanup.
 */

export function extractJsonObject(text: string): string {
  const match = text.match(/\{[\s\S]*\}/)
  return match ? match[0] : text
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
