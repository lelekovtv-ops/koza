/**
 * Import Pipeline — unified entry point for importing scripts from any source.
 *
 * Detects format, preprocesses, parses to Block[], and enriches.
 *
 * Supported inputs:
 * - Plain text (Fountain, YouTube sections, Cyrillic screenplay)
 * - Markdown (from ChatGPT/Claude)
 * - FDX (Final Draft XML)
 * - Raw paste from any source
 */

import { type Block, parseTextToBlocks } from "./screenplayFormat"
import { stripMarkdown } from "./importers/markdownImporter"
import { parseFdxToText } from "./importers/fdxImporter"
import { enrichBlocks, estimateBlockDurationMs } from "./blockEnricher"
import { parseScenes } from "@/lib/sceneParser"

// ─── Format Detection ────────────────────────────────────────

export type ImportFormat = "fdx" | "markdown" | "plaintext"

/** Detect the format of input text. */
export function detectFormat(raw: string): ImportFormat {
  const trimmed = raw.trim()

  // FDX: starts with XML declaration or has <FinalDraft> root
  if (
    trimmed.startsWith("<?xml") ||
    trimmed.includes("<FinalDraft") ||
    trimmed.includes("<Content>")
  ) {
    return "fdx"
  }

  // Markdown: has markdown-specific patterns
  const mdPatterns = [
    /^#{1,6}\s+/m,           // ## Headers
    /\*\*[^*]+\*\*/,          // **bold**
    /```[\s\S]*?```/,          // code fences
    /^\s*[-*+]\s+/m,          // bullet lists
    /^\s*\d+\.\s+/m,          // numbered lists
    /\[([^\]]+)\]\([^)]+\)/,  // [links](url)
  ]
  const mdScore = mdPatterns.filter((p) => p.test(trimmed)).length
  if (mdScore >= 2) return "markdown"

  return "plaintext"
}

// ─── Import Pipeline ─────────────────────────────────────────

export interface ImportResult {
  blocks: Block[]
  format: ImportFormat
  title: string | null
}

/**
 * Import text from any format → Block[] with production fields.
 *
 * Pipeline: detect → preprocess → parse → enrich
 */
export function importFromText(raw: string): ImportResult {
  const format = detectFormat(raw)

  // Step 1: Convert to plain screenplay text
  let text: string
  switch (format) {
    case "fdx":
      text = parseFdxToText(raw)
      break
    case "markdown":
      text = stripMarkdown(raw)
      break
    case "plaintext":
    default:
      text = raw
      break
  }

  // Step 2: Parse to blocks
  const blocks = parseTextToBlocks(text)

  // Step 3: Enrich with production fields (duration, etc.)
  const scenes = parseScenes(blocks)
  const enriched = enrichBlocks(blocks, scenes)

  // Step 4: Try to extract title
  const title = extractTitle(enriched, text)

  return { blocks: enriched, format, title }
}

/**
 * Import from a File object (for drag-drop / file picker).
 */
export async function importFromFile(file: File): Promise<ImportResult> {
  const text = await file.text()
  return importFromText(text)
}

// ─── Helpers ─────────────────────────────────────────────────

function extractTitle(blocks: Block[], raw: string): string | null {
  // Try first scene heading
  const heading = blocks.find((b) => b.type === "scene_heading")
  if (heading) {
    // For section format: [HOOK — 3 сек] → use first meaningful section
    const match = heading.text.match(/^\[(.+?)(?:\s*[—-]\s*\d+)?\]$/)
    if (match) return null // Section headers aren't titles
    return heading.text
  }

  // Try first line of raw text
  const firstLine = raw.trim().split("\n")[0]?.trim()
  if (firstLine && firstLine.length < 80) return firstLine

  return null
}
