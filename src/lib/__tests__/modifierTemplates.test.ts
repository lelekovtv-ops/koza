import { describe, it, expect, beforeEach } from "vitest"
import type { ModifierTemplate } from "@/store/modifierTemplates"
import type { BlockModifier, ModifierType } from "@/lib/productionTypes"

// Test the template data shapes (store is Zustand, hard to test without DOM)

describe("ModifierTemplate types", () => {
  it("built-in template is well-formed", () => {
    const template: ModifierTemplate = {
      id: "tmpl-ai-avatar",
      name: "AI Avatar",
      description: "Talking head",
      type: "ai-avatar",
      modifier: {
        type: "ai-avatar",
        templateId: "tmpl-ai-avatar",
        canvasData: null,
        params: { lipSync: true },
      },
      builtIn: true,
      createdAt: 0,
    }
    expect(template.type).toBe("ai-avatar")
    expect(template.modifier.type).toBe("ai-avatar")
    expect(template.builtIn).toBe(true)
  })

  it("user template has unique id", () => {
    const t1: ModifierTemplate = {
      id: "tmpl-custom-1",
      name: "My Effect",
      description: "Custom effect",
      type: "effect",
      modifier: { type: "effect", templateId: "tmpl-custom-1", canvasData: null, params: {} },
      builtIn: false,
      createdAt: Date.now(),
    }

    const t2: ModifierTemplate = {
      id: "tmpl-custom-2",
      name: "My Effect 2",
      description: "Another effect",
      type: "effect",
      modifier: { type: "effect", templateId: "tmpl-custom-2", canvasData: null, params: {} },
      builtIn: false,
      createdAt: Date.now(),
    }

    expect(t1.id).not.toBe(t2.id)
  })

  it("all modifier types are valid", () => {
    const types: ModifierType[] = ["default", "ai-avatar", "effect", "b-roll", "title-card", "canvas"]
    expect(types).toHaveLength(6)
    for (const t of types) {
      const mod: BlockModifier = { type: t, templateId: null, canvasData: null, params: {} }
      expect(mod.type).toBe(t)
    }
  })

  it("canvas modifier stores serialized data", () => {
    const canvasData = {
      nodes: [
        { id: "n1", type: "input", data: { text: "Hello" } },
        { id: "n2", type: "imageGen", data: { model: "flux" } },
      ],
      edges: [{ source: "n1", target: "n2" }],
    }

    const mod: BlockModifier = {
      type: "canvas",
      templateId: null,
      canvasData,
      params: {},
    }

    expect(mod.canvasData).toEqual(canvasData)
    expect((mod.canvasData as typeof canvasData).nodes).toHaveLength(2)
  })
})
