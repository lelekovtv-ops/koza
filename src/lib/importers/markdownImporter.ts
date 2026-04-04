/**
 * Markdown Importer — strips markdown formatting before screenplay parsing.
 *
 * Handles text pasted from ChatGPT, Claude, or any markdown source.
 * Converts markdown to plain text that parseTextToBlocks can handle.
 */

/** Strip markdown formatting, preserving screenplay structure. */
export function stripMarkdown(raw: string): string {
  let text = raw

  // Remove code fences (```screenplay ... ```)
  text = text.replace(/```[\w]*\n?([\s\S]*?)```/g, "$1")

  // Remove bold/italic markers
  text = text.replace(/\*\*\*(.*?)\*\*\*/g, "$1")
  text = text.replace(/\*\*(.*?)\*\*/g, "$1")
  text = text.replace(/\*(.*?)\*/g, "$1")
  text = text.replace(/__(.*?)__/g, "$1")
  text = text.replace(/_(.*?)_/g, "$1")

  // Remove markdown headers (## Scene 1 → Scene 1)
  text = text.replace(/^#{1,6}\s+/gm, "")

  // Remove markdown links [text](url) → text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")

  // Remove inline code
  text = text.replace(/`([^`]+)`/g, "$1")

  // Remove blockquotes
  text = text.replace(/^>\s?/gm, "")

  // Remove horizontal rules
  text = text.replace(/^[-*_]{3,}\s*$/gm, "")

  // Remove bullet/numbered list markers (keep text)
  text = text.replace(/^[\s]*[-*+]\s+/gm, "")
  text = text.replace(/^[\s]*\d+\.\s+/gm, "")

  // Collapse excessive blank lines
  text = text.replace(/\n{4,}/g, "\n\n\n")

  return text.trim()
}
