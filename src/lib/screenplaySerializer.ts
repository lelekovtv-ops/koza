import type { Descendant } from "slate"
import type { ScreenplayElementType } from "./screenplayTypes"
import { generateBlockId } from "./screenplayTypes"
import { parseTextToBlocks } from "./screenplayFormat"

/**
 * Deserialize plain text → Slate Descendant[].
 * Использует parseTextToBlocks из screenplayFormat для определения типов.
 */
export function deserializeFromText(text: string): Descendant[] {
  if (!text || !text.trim()) {
    return [{
      type: "action" as ScreenplayElementType,
      id: generateBlockId(),
      children: [{ text: "" }],
    }]
  }

  const blocks = parseTextToBlocks(text)

  return blocks.map(block => ({
    type: block.type as ScreenplayElementType,
    id: block.id || generateBlockId(),
    children: [{ text: block.text }],
  }))
}
