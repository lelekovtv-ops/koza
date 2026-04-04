import { describe, it, expect } from "vitest"
import {
  composePrompt,
  stripStyleFromComposedPrompt,
  recomposeWithStyle,
  BUILT_IN_STYLES,
  type StyleModifier,
} from "@/lib/styleLayer"

const makeStyle = (id: string, prompt: string, enabled = true): StyleModifier => ({
  id,
  name: id,
  prompt,
  enabled,
})

describe("composePrompt", () => {
  it("content only when no style", () => {
    const result = composePrompt("Office worker at desk, tired", null)
    expect(result).toContain("Office worker at desk, tired")
    expect(result).toContain("16:9")
    expect(result).not.toContain("Style:")
  })

  it("content only when style disabled", () => {
    const style = makeStyle("anime", "Anime style, cel shading", false)
    const result = composePrompt("Office worker at desk", style)
    expect(result).not.toContain("Style:")
    expect(result).not.toContain("Anime")
  })

  it("content + style when enabled", () => {
    const style = makeStyle("anime", "Anime style, cel shading", true)
    const result = composePrompt("Office worker at desk", style)
    expect(result).toContain("Office worker at desk")
    expect(result).toContain("Style: Anime style, cel shading.")
    expect(result).toContain("16:9")
  })

  it("empty content returns empty", () => {
    expect(composePrompt("", null)).toBe("")
    expect(composePrompt("  ", null)).toBe("")
  })
})

describe("stripStyleFromComposedPrompt", () => {
  it("removes Style: line", () => {
    const composed = "Office worker at desk\nStyle: Anime style. 16:9. No text, no watermark."
    const stripped = stripStyleFromComposedPrompt(composed)
    expect(stripped).toBe("Office worker at desk")
  })

  it("removes 16:9 suffix", () => {
    const composed = "A man walks. 16:9. No text."
    const stripped = stripStyleFromComposedPrompt(composed)
    expect(stripped).toBe("A man walks.")
  })

  it("handles content without style", () => {
    const content = "A man walks through rain"
    expect(stripStyleFromComposedPrompt(content)).toBe("A man walks through rain")
  })
})

describe("recomposeWithStyle", () => {
  it("swaps style on existing prompt", () => {
    const original = "Office worker\nStyle: Anime style. 16:9. No text, no watermark."
    const newStyle = makeStyle("noir", "Film noir, black and white")
    const result = recomposeWithStyle(original, newStyle)
    expect(result).toContain("Office worker")
    expect(result).toContain("Style: Film noir, black and white.")
    expect(result).not.toContain("Anime")
  })

  it("removes style when null", () => {
    const original = "Office worker\nStyle: Anime style. 16:9. No text, no watermark."
    const result = recomposeWithStyle(original, null)
    expect(result).toContain("Office worker")
    expect(result).not.toContain("Style:")
    expect(result).not.toContain("Anime")
  })

  it("adds style to unstyled prompt", () => {
    const original = "Office worker. 16:9. No text."
    const style = makeStyle("watercolor", "Watercolor painting")
    const result = recomposeWithStyle(original, style)
    expect(result).toContain("Office worker")
    expect(result).toContain("Style: Watercolor painting.")
  })
})

describe("BUILT_IN_STYLES", () => {
  it("has at least 5 styles", () => {
    expect(BUILT_IN_STYLES.length).toBeGreaterThanOrEqual(5)
  })

  it("each style has id, name, prompt", () => {
    for (const style of BUILT_IN_STYLES) {
      expect(style.id).toBeTruthy()
      expect(style.name).toBeTruthy()
      expect(style.prompt).toBeTruthy()
    }
  })

  it("includes realistic and anime", () => {
    expect(BUILT_IN_STYLES.find((s) => s.id === "realistic")).toBeDefined()
    expect(BUILT_IN_STYLES.find((s) => s.id === "anime")).toBeDefined()
  })

  it("includes murakami", () => {
    expect(BUILT_IN_STYLES.find((s) => s.id === "murakami")).toBeDefined()
  })
})
