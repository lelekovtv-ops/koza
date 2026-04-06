import { describe, it, expect } from "vitest"
import type {
  ProductionVisual,
  BlockModifier,
  ShotGroup,
  ChangeOrigin,
  SyncEvent,
  SyncEventType,
} from "@/lib/productionTypes"
import type { Block } from "@/lib/screenplayFormat"

describe("Production Types", () => {
  it("Block accepts optional production fields", () => {
    const block: Block = {
      id: "b1",
      type: "action",
      text: "John enters.",
    }
    // All production fields should be optional
    expect(block.durationMs).toBeUndefined()
    expect(block.visual).toBeUndefined()
    expect(block.modifier).toBeUndefined()
    expect(block.locked).toBeUndefined()
  })

  it("Block with production fields", () => {
    const visual: ProductionVisual = {
      thumbnailUrl: null,
      thumbnailBlobKey: null,
      originalUrl: null,
      originalBlobKey: null,
      imagePrompt: "A man entering an office",
      videoPrompt: "",
      shotSize: "MEDIUM",
      cameraMotion: "Static",
      generationHistory: [],
      activeHistoryIndex: null,
      type: "image",
    }

    const modifier: BlockModifier = {
      type: "ai-avatar",
      templateId: "tmpl-1",
      canvasData: null,
      params: { character: "John" },
    }

    const block: Block = {
      id: "b1",
      type: "action",
      text: "John enters.",
      durationMs: 3000,
      durationSource: "manual",
      visual,
      modifier,
      locked: true,
      shotGroupId: "sg-1",
      voiceClipId: null,
      sfxHints: ["door opening"],
    }

    expect(block.durationMs).toBe(3000)
    expect(block.durationSource).toBe("manual")
    expect(block.visual?.shotSize).toBe("MEDIUM")
    expect(block.modifier?.type).toBe("ai-avatar")
    expect(block.locked).toBe(true)
  })

  it("ShotGroup type is well-formed", () => {
    const group: ShotGroup = {
      id: "sg-1",
      sceneId: "s-1",
      blockIds: ["b1", "b2"],
      primaryBlockId: "b1",
      type: "dialogue",
      startMs: 5000,
      durationMs: 3000,
      order: 0,
      visual: null,
      label: "John's entrance",
      speaker: "JOHN",
      locked: false,
      autoSynced: true,
    }
    expect(group.blockIds).toHaveLength(2)
    expect(group.type).toBe("dialogue")
  })

  it("ChangeOrigin covers all sources", () => {
    const origins: ChangeOrigin[] = ["screenplay", "storyboard", "timeline", "voice", "system"]
    expect(origins).toHaveLength(5)
  })

  it("SyncEvent is well-formed", () => {
    const event: SyncEvent = {
      origin: "timeline",
      type: "duration-change",
      blockId: "b1",
      payload: { durationMs: 5000 },
      timestamp: Date.now(),
    }
    expect(event.origin).toBe("timeline")
    expect(event.type).toBe("duration-change")
  })

  it("SyncEventType covers all event types", () => {
    const types: SyncEventType[] = [
      "block-text", "block-add", "block-remove", "block-type", "block-production",
      "duration-change", "shot-add", "shot-remove", "shot-reorder",
      "voice-text", "voice-duration",
    ]
    expect(types).toHaveLength(11)
  })
})
