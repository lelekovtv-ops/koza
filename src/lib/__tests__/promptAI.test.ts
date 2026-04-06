import { describe, it, expect } from "vitest"

/**
 * promptAI.ts exports async functions that call fetch("/api/chat").
 * We test the pure logic: buildContextBlock (internal helper).
 * Since it's not exported, we test it indirectly through the module's behavior.
 *
 * For now we test the context composition by importing and calling
 * the module with a mocked fetch — verifying the prompt structure.
 */

// We need to access buildContextBlock which is not exported.
// Strategy: test the exported functions with a mocked fetch,
// then verify the request body contains expected context.

const capturedRequests: { body: string }[] = []

// Mock global fetch before importing the module
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  const body = typeof init?.body === "string" ? init.body : ""
  capturedRequests.push({ body })
  return new Response("mocked prompt response", { status: 200 })
}

// Now import (uses our mocked fetch)
const { buildImagePromptWithAI } = await import("@/lib/promptAI")

describe("promptAI — context composition", () => {
  it("includes character names in the prompt", async () => {
    capturedRequests.length = 0

    await buildImagePromptWithAI({
      caption: "Андрей входит в комнату",
      characters: [
        { id: "andrey", name: "АНДРЕЙ", description: "", referenceImages: [], canonicalImageId: null, generatedPortraitUrl: null, portraitBlobKey: null, appearancePrompt: "tall man, dark hair", sceneIds: [], dialogueCount: 0 },
      ],
      locations: [],
      props: [],
      projectStyle: "Cinematic",
    })

    expect(capturedRequests).toHaveLength(1)
    const body = capturedRequests[0].body
    expect(body).toContain("АНДРЕЙ")
    expect(body).toContain("tall man, dark hair")
  })

  it("includes location in the prompt", async () => {
    capturedRequests.length = 0

    await buildImagePromptWithAI({
      caption: "Действие",
      characters: [],
      locations: [
        { id: "kitchen", name: "КУХНЯ", fullHeading: "INT. КУХНЯ — ДЕНЬ", intExt: "INT", timeOfDay: "ДЕНЬ", description: "", referenceImages: [], canonicalImageId: null, generatedImageUrl: null, imageBlobKey: null, appearancePrompt: "modern kitchen", sceneIds: [] },
      ],
      props: [],
      projectStyle: "Film Noir",
    })

    const body = capturedRequests[0].body
    expect(body).toContain("КУХНЯ")
    expect(body).toContain("modern kitchen")
    // Style is no longer included in LLM context (applied at generation time)
    expect(body).not.toContain("Film Noir")
  })

  it("includes props in the prompt", async () => {
    capturedRequests.length = 0

    await buildImagePromptWithAI({
      caption: "Действие",
      characters: [],
      locations: [],
      props: [
        { id: "gun", name: "Пистолет", description: "", sceneIds: [], referenceImages: [], canonicalImageId: null, generatedImageUrl: null, imageBlobKey: null, appearancePrompt: "black Beretta" },
      ],
      projectStyle: "Cinematic",
    })

    const body = capturedRequests[0].body
    expect(body).toContain("Пистолет")
    expect(body).toContain("black Beretta")
  })

  it("excludes bible entries by excludedBibleIds", async () => {
    capturedRequests.length = 0

    await buildImagePromptWithAI({
      caption: "Действие",
      characters: [
        { id: "andrey", name: "АНДРЕЙ", description: "", referenceImages: [], canonicalImageId: null, generatedPortraitUrl: null, portraitBlobKey: null, appearancePrompt: "tall man", sceneIds: [], dialogueCount: 0 },
        { id: "maria", name: "МАРИЯ", description: "", referenceImages: [], canonicalImageId: null, generatedPortraitUrl: null, portraitBlobKey: null, appearancePrompt: "blonde woman", sceneIds: [], dialogueCount: 0 },
      ],
      locations: [
        { id: "park", name: "ПАРК", fullHeading: "EXT. ПАРК", intExt: "EXT", timeOfDay: "", description: "", referenceImages: [], canonicalImageId: null, generatedImageUrl: null, imageBlobKey: null, appearancePrompt: "city park", sceneIds: [] },
      ],
      props: [
        { id: "phone", name: "Телефон", description: "", sceneIds: [], referenceImages: [], canonicalImageId: null, generatedImageUrl: null, imageBlobKey: null, appearancePrompt: "iPhone" },
      ],
      projectStyle: "Cinematic",
      excludedBibleIds: ["char-andrey", "loc-park", "prop-phone"],
    })

    const body = capturedRequests[0].body
    // АНДРЕЙ, ПАРК, Телефон should be excluded
    expect(body).not.toContain("АНДРЕЙ")
    expect(body).not.toContain("ПАРК")
    expect(body).not.toContain("Телефон")
    // МАРИЯ should still be included
    expect(body).toContain("МАРИЯ")
  })

  it("includes scene title and shot metadata", async () => {
    capturedRequests.length = 0

    await buildImagePromptWithAI({
      sceneTitle: "INT. КУХНЯ — УТРО",
      caption: "Андрей пьёт кофе",
      shotSize: "MEDIUM CLOSE-UP",
      cameraMotion: "DOLLY IN",
      directorNote: "Тёплое утро",
      cameraNote: "35mm, shallow DOF",
      characters: [],
      locations: [],
      props: [],
      projectStyle: "Cinematic",
    })

    const body = capturedRequests[0].body
    expect(body).toContain("INT. КУХНЯ — УТРО")
    expect(body).toContain("MEDIUM CLOSE-UP")
    expect(body).toContain("DOLLY IN")
    expect(body).toContain("Тёплое утро")
    expect(body).toContain("35mm, shallow DOF")
  })

  it("uses caption as fallback instruction", async () => {
    capturedRequests.length = 0

    await buildImagePromptWithAI({
      caption: "Мария смотрит в окно",
      characters: [],
      locations: [],
      props: [],
      projectStyle: "Cinematic",
    })

    const body = capturedRequests[0].body
    expect(body).toContain("Мария смотрит в окно")
  })
})
