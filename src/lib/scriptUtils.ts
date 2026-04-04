/**
 * Script block utilities — shared between router, workers, and page.
 */

export interface ScriptBlock {
  index: number
  title: string
  text: string      // full block text including [HEADER]
  startLine: number
}

export function parseScriptBlocks(script: string): ScriptBlock[] {
  if (!script.trim()) return []
  const lines = script.split("\n")
  const blocks: ScriptBlock[] = []
  let current: ScriptBlock | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\[.+\]/.test(line.trim())) {
      if (current) blocks.push(current)
      current = {
        index: blocks.length,
        title: line.trim().replace(/^\[|\]$/g, "").replace(/\s*[—\-–]\s*\d+.*/, "").trim(),
        text: line,
        startLine: i,
      }
    } else if (current) {
      current.text += "\n" + line
    } else {
      current = { index: 0, title: "INTRO", text: line, startLine: i }
    }
  }
  if (current) blocks.push(current)
  return blocks
}

export function replaceBlock(script: string, blockIndex: number, newBlockText: string): string {
  const blocks = parseScriptBlocks(script)
  if (blockIndex < 0 || blockIndex >= blocks.length) return script
  const newBlocks = blocks.map((b, i) => i === blockIndex ? newBlockText.trim() : b.text)
  return newBlocks.join("\n\n")
}

export function findRelevantBlock(blocks: ScriptBlock[], userText: string): number {
  const lower = userText.toLowerCase()

  // Direct block reference: "в блоке HOOK", "секцию ОТКРЫТИЕ", "block 2"
  for (const block of blocks) {
    if (lower.includes(block.title.toLowerCase())) return block.index
  }

  // Number reference: "первый блок", "второй", "блок 3"
  const numWords: Record<string, number> = {
    "перв": 0, "втор": 1, "трет": 2, "четвёрт": 3, "четверт": 3, "пят": 4, "шест": 5,
    "first": 0, "second": 1, "third": 2, "fourth": 3, "fifth": 4,
  }
  for (const [word, idx] of Object.entries(numWords)) {
    if (lower.includes(word) && idx < blocks.length) return idx
  }

  const numMatch = lower.match(/блок\s*(\d+)|block\s*(\d+)|секци[юя]\s*(\d+)/)
  if (numMatch) {
    const n = parseInt(numMatch[1] || numMatch[2] || numMatch[3]) - 1
    if (n >= 0 && n < blocks.length) return n
  }

  // Content match: check if user mentions content from a specific block
  for (const block of blocks) {
    const blockWords = block.text.toLowerCase().split(/\s+/).filter((w) => w.length > 4)
    const matches = blockWords.filter((w) => lower.includes(w))
    if (matches.length >= 2) return block.index
  }

  // Last resort: "последн" = last block, "начало/открытие" = first
  if (/последн|last|конец|финал|cta/i.test(lower)) return blocks.length - 1
  if (/начал|first|открыт|hook|intro/i.test(lower)) return 0

  return -1
}
