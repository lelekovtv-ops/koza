import type { Descendant } from "slate"
import type { ScreenplayElementType } from "./screenplayTypes"
import type { BlockType } from "./screenplayFormat"
import { generateBlockId } from "./screenplayTypes"
import { parseTextToBlocks } from "./screenplayFormat"

/**
 * Deserialize plain text → Slate Descendant[].
 * Использует parseTextToBlocks из screenplayFormat для определения типов.
 * @param initialPrevType — тип блока перед точкой вставки (для контекста)
 */
export function deserializeFromText(text: string, initialPrevType?: BlockType | null): Descendant[] {
  if (!text || !text.trim()) {
    return [{
      type: "action" as ScreenplayElementType,
      id: generateBlockId(),
      children: [{ text: "" }],
    }]
  }

  const blocks = parseTextToBlocks(text, initialPrevType)

  return blocks.map(block => ({
    type: block.type as ScreenplayElementType,
    id: block.id || generateBlockId(),
    children: [{ text: block.text }],
  }))
}
