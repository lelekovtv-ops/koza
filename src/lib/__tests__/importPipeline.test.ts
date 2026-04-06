import { describe, it, expect } from "vitest"
import { detectFormat, importFromText } from "@/lib/importPipeline"
import { stripMarkdown } from "@/lib/importers/markdownImporter"
import { parseFdxToText } from "@/lib/importers/fdxImporter"

// ─── Format Detection ────────────────────────────────────────

describe("detectFormat", () => {
  it("detects FDX from XML declaration", () => {
    expect(detectFormat('<?xml version="1.0"?><FinalDraft>')).toBe("fdx")
  })

  it("detects FDX from FinalDraft tag", () => {
    expect(detectFormat("<FinalDraft><Content></Content></FinalDraft>")).toBe("fdx")
  })

  it("detects markdown from headers + bold", () => {
    expect(detectFormat("## Scene 1\n**JOHN** enters.\n- Item")).toBe("markdown")
  })

  it("detects plaintext for Fountain screenplay", () => {
    expect(detectFormat("INT. OFFICE - DAY\n\nJohn enters the room.")).toBe("plaintext")
  })

  it("detects plaintext for YouTube sections", () => {
    expect(detectFormat("[HOOK — 3 сек]\nТИТР: Заголовок")).toBe("plaintext")
  })

  it("single markdown pattern is not enough (need 2+)", () => {
    expect(detectFormat("## Just a header\nSome text")).toBe("plaintext")
  })
})

// ─── Markdown Importer ───────────────────────────────────────

describe("stripMarkdown", () => {
  it("removes bold markers", () => {
    expect(stripMarkdown("**hello** world")).toBe("hello world")
  })

  it("removes italic markers", () => {
    expect(stripMarkdown("*hello* world")).toBe("hello world")
  })

  it("removes code fences", () => {
    expect(stripMarkdown("```\nINT. OFFICE\n```")).toBe("INT. OFFICE")
  })

  it("removes language-tagged code fences", () => {
    expect(stripMarkdown("```screenplay\nINT. OFFICE\n```")).toBe("INT. OFFICE")
  })

  it("removes markdown headers", () => {
    expect(stripMarkdown("## Scene 1")).toBe("Scene 1")
  })

  it("removes links preserving text", () => {
    expect(stripMarkdown("[click here](http://example.com)")).toBe("click here")
  })

  it("removes blockquotes", () => {
    expect(stripMarkdown("> quoted text")).toBe("quoted text")
  })

  it("removes bullet lists", () => {
    expect(stripMarkdown("- item one\n- item two")).toBe("item one\nitem two")
  })

  it("removes numbered lists", () => {
    expect(stripMarkdown("1. first\n2. second")).toBe("first\nsecond")
  })

  it("collapses excessive blank lines", () => {
    expect(stripMarkdown("a\n\n\n\n\n\nb")).toBe("a\n\n\nb")
  })

  it("handles complex ChatGPT output", () => {
    const input = `## Scene 1: The Office

**INT. OFFICE - DAY**

> John enters the room.

\`\`\`
JOHN
Hello there.
\`\`\`

- He sits down.
- He opens his laptop.`

    const result = stripMarkdown(input)
    expect(result).toContain("Scene 1: The Office")
    expect(result).toContain("INT. OFFICE - DAY")
    expect(result).toContain("JOHN")
    expect(result).toContain("Hello there.")
    expect(result).not.toContain("**")
    expect(result).not.toContain("```")
    expect(result).not.toContain(">")
  })
})

// ─── FDX Importer ────────────────────────────────────────────

describe("parseFdxToText", () => {
  it("parses basic FDX with scene heading and action", () => {
    const fdx = `<?xml version="1.0"?>
<FinalDraft>
  <Content>
    <Paragraph Type="Scene Heading"><Text>INT. OFFICE - DAY</Text></Paragraph>
    <Paragraph Type="Action"><Text>John enters the room.</Text></Paragraph>
  </Content>
</FinalDraft>`

    const text = parseFdxToText(fdx)
    expect(text).toContain("INT. OFFICE - DAY")
    expect(text).toContain("John enters the room.")
  })

  it("parses character and dialogue", () => {
    const fdx = `<Content>
    <Paragraph Type="Character"><Text>JOHN</Text></Paragraph>
    <Paragraph Type="Dialogue"><Text>Hello there.</Text></Paragraph>
  </Content>`

    const text = parseFdxToText(fdx)
    expect(text).toContain("JOHN")
    expect(text).toContain("Hello there.")
  })

  it("parses parenthetical with parens", () => {
    const fdx = `<Content>
    <Paragraph Type="Parenthetical"><Text>beat</Text></Paragraph>
  </Content>`

    const text = parseFdxToText(fdx)
    expect(text).toContain("(beat)")
  })

  it("handles empty paragraphs", () => {
    const fdx = `<Content>
    <Paragraph Type="Action"><Text></Text></Paragraph>
    <Paragraph Type="Action"><Text>Something happens.</Text></Paragraph>
  </Content>`

    const text = parseFdxToText(fdx)
    expect(text).toContain("Something happens.")
  })
})

// ─── Full Pipeline ───────────────────────────────────────────

describe("importFromText", () => {
  it("imports plain Fountain screenplay", () => {
    const result = importFromText("INT. OFFICE - DAY\n\nJohn enters.\n\nJOHN\nHello.")
    expect(result.format).toBe("plaintext")
    expect(result.blocks.length).toBeGreaterThan(0)
    expect(result.blocks[0].type).toBe("scene_heading")
  })

  it("imports YouTube section format", () => {
    const result = importFromText("[HOOK — 3 сек]\nТИТР: Заголовок\nГОЛОС: Привет мир")
    expect(result.format).toBe("plaintext")
    expect(result.blocks.length).toBeGreaterThan(0)
  })

  it("imports markdown and strips formatting", () => {
    const result = importFromText("## Scene 1\n**INT. OFFICE - DAY**\n- John enters.\n- He sits down.")
    expect(result.format).toBe("markdown")
    expect(result.blocks.length).toBeGreaterThan(0)
  })

  it("enriches blocks with durationMs", () => {
    const result = importFromText("INT. OFFICE - DAY\n\nJohn looks around.\n\nJOHN\nHello.")
    for (const block of result.blocks) {
      expect(block.durationMs).toBeGreaterThan(0)
      expect(block.durationSource).toBe("auto")
    }
  })

  it("handles empty input", () => {
    const result = importFromText("")
    expect(result.blocks.length).toBe(0)
    expect(result.format).toBe("plaintext")
  })
})
