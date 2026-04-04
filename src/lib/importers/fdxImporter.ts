/**
 * FDX Importer — parses Final Draft XML (.fdx) files.
 *
 * FDX is XML-based. Key elements:
 *   <Content>
 *     <Paragraph Type="Scene Heading">
 *       <Text>INT. OFFICE - DAY</Text>
 *     </Paragraph>
 *     <Paragraph Type="Action">
 *       <Text>John enters the room.</Text>
 *     </Paragraph>
 *     ...
 *   </Content>
 *
 * We extract text from each Paragraph, map Type to BlockType.
 */

/** FDX paragraph type → our block format prefix/text */
const FDX_TYPE_MAP: Record<string, string> = {
  "Scene Heading": "SCENE_HEADING",
  "Action": "ACTION",
  "Character": "CHARACTER",
  "Dialogue": "DIALOGUE",
  "Parenthetical": "PARENTHETICAL",
  "Transition": "TRANSITION",
  "Shot": "SHOT",
  // Aliases
  "General": "ACTION",
  "Singing": "DIALOGUE",
}

/**
 * Parse FDX XML string → plain text that parseTextToBlocks can handle.
 * Uses DOMParser (browser) or regex fallback.
 */
export function parseFdxToText(xml: string): string {
  const lines: string[] = []

  // Try DOMParser (browser environment)
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(xml, "text/xml")
    const paragraphs = doc.querySelectorAll("Paragraph")

    for (const p of paragraphs) {
      const fdxType = p.getAttribute("Type") || "Action"
      const textParts: string[] = []
      for (const t of p.querySelectorAll("Text")) {
        textParts.push(t.textContent || "")
      }
      const text = textParts.join("").trim()
      if (!text) {
        lines.push("")
        continue
      }

      const mapped = FDX_TYPE_MAP[fdxType] || "ACTION"

      switch (mapped) {
        case "SCENE_HEADING":
          lines.push("")
          lines.push(text.toUpperCase())
          break
        case "CHARACTER":
          lines.push("")
          lines.push(text.toUpperCase())
          break
        case "PARENTHETICAL":
          lines.push(text.startsWith("(") ? text : `(${text})`)
          break
        case "DIALOGUE":
          lines.push(text)
          break
        case "TRANSITION":
          lines.push("")
          lines.push(text.toUpperCase())
          break
        case "ACTION":
        default:
          lines.push(text)
          break
      }
    }
  } else {
    // Regex fallback for SSR/Node
    const paragraphRegex = /<Paragraph[^>]*Type="([^"]*)"[^>]*>([\s\S]*?)<\/Paragraph>/g
    const textRegex = /<Text[^>]*>([\s\S]*?)<\/Text>/g

    let match: RegExpExecArray | null
    while ((match = paragraphRegex.exec(xml)) !== null) {
      const fdxType = match[1]
      const content = match[2]
      const textParts: string[] = []
      let textMatch: RegExpExecArray | null
      while ((textMatch = textRegex.exec(content)) !== null) {
        textParts.push(textMatch[1])
      }
      textRegex.lastIndex = 0

      const text = textParts.join("").replace(/<[^>]+>/g, "").trim()
      if (!text) {
        lines.push("")
        continue
      }

      const mapped = FDX_TYPE_MAP[fdxType] || "ACTION"
      if (mapped === "SCENE_HEADING" || mapped === "CHARACTER" || mapped === "TRANSITION") {
        lines.push("")
        lines.push(text.toUpperCase())
      } else if (mapped === "PARENTHETICAL") {
        lines.push(text.startsWith("(") ? text : `(${text})`)
      } else {
        lines.push(text)
      }
    }
  }

  return lines.join("\n").trim()
}
