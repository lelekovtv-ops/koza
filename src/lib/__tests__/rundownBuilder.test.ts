import { describe, it, expect } from "vitest"
import { buildRundownEntries, reconcileRundownEntries } from "../rundownBuilder"
import type { BuilderBlockInput, BuilderSceneInput } from "../rundownBuilder"

function makeBlock(id: string, type: string, text: string): BuilderBlockInput {
  return { id, type, text }
}

const DEMO_BLOCKS: BuilderBlockInput[] = [
  makeBlock("b1", "scene_heading", "INT. CAFE — DAY"),
  makeBlock("b2", "action", "A man sits at a table reading a newspaper."),
  makeBlock("b3", "character", "JOHN"),
  makeBlock("b4", "dialogue", "Good morning."),
  makeBlock("b5", "character", "MARY"),
  makeBlock("b6", "dialogue", "Hello John, how are you?"),
  makeBlock("b7", "action", "John folds the newspaper and looks up."),
  makeBlock("b8", "transition", "CUT TO:"),
  makeBlock("b9", "scene_heading", "EXT. PARK — DAY"),
  makeBlock("b10", "action", "Birds chirp in the morning sun."),
]

const DEMO_SCENES: BuilderSceneInput[] = [
  { id: "scene-b1", blockIds: ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"], title: "INT. CAFE — DAY" },
  { id: "scene-b9", blockIds: ["b9", "b10"], title: "EXT. PARK — DAY" },
]

describe("rundownBuilder", () => {
  describe("buildRundownEntries", () => {
    it("creates entries from blocks", () => {
      const entries = buildRundownEntries(DEMO_BLOCKS, DEMO_SCENES)
      expect(entries.length).toBeGreaterThan(0)
    })

    it("creates establishing shot for first action in scene", () => {
      const entries = buildRundownEntries(DEMO_BLOCKS, DEMO_SCENES)
      const first = entries[0]
      expect(first.entryType).toBe("establishing")
      expect(first.parentBlockId).toBe("b2")
    })

    it("creates dialogue entries with speaker", () => {
      const entries = buildRundownEntries(DEMO_BLOCKS, DEMO_SCENES)
      const dialogues = entries.filter((e) => e.entryType === "dialogue")
      expect(dialogues.length).toBe(2)
      expect(dialogues[0].speaker).toBe("JOHN")
      expect(dialogues[1].speaker).toBe("MARY")
    })

    it("creates action entries", () => {
      const entries = buildRundownEntries(DEMO_BLOCKS, DEMO_SCENES)
      const actions = entries.filter((e) => e.entryType === "action")
      expect(actions.length).toBeGreaterThanOrEqual(1)
    })

    it("creates transition entries", () => {
      const entries = buildRundownEntries(DEMO_BLOCKS, DEMO_SCENES)
      const transitions = entries.filter((e) => e.entryType === "transition")
      expect(transitions.length).toBe(1)
    })

    it("does NOT create entries for scene_heading", () => {
      const entries = buildRundownEntries(DEMO_BLOCKS, DEMO_SCENES)
      const headings = entries.filter((e) => e.parentBlockId === "b1" || e.parentBlockId === "b9")
      // b1 and b9 are scene_heading — they shouldn't have entries directly
      // b10 (action under b9) should have establishing shot
      const b9Entries = entries.filter((e) => e.parentBlockId === "b9")
      expect(b9Entries.length).toBe(0) // scene_heading doesn't create entry
    })

    it("second scene starts with establishing shot", () => {
      const entries = buildRundownEntries(DEMO_BLOCKS, DEMO_SCENES)
      const b10Entry = entries.find((e) => e.parentBlockId === "b10")
      expect(b10Entry?.entryType).toBe("establishing")
    })

    it("all entries have parentBlockId set", () => {
      const entries = buildRundownEntries(DEMO_BLOCKS, DEMO_SCENES)
      for (const entry of entries) {
        expect(entry.parentBlockId).toBeTruthy()
      }
    })

    it("all entries are autoSynced", () => {
      const entries = buildRundownEntries(DEMO_BLOCKS, DEMO_SCENES)
      for (const entry of entries) {
        expect(entry.autoSynced).toBe(true)
      }
    })

    it("all entries have positive duration", () => {
      const entries = buildRundownEntries(DEMO_BLOCKS, DEMO_SCENES)
      for (const entry of entries) {
        expect(entry.estimatedDurationMs).toBeGreaterThan(0)
      }
    })

    it("handles empty blocks", () => {
      const entries = buildRundownEntries([], [])
      expect(entries).toEqual([])
    })

    it("handles orphan dialogue (no character)", () => {
      const blocks = [
        makeBlock("b1", "scene_heading", "INT. ROOM"),
        makeBlock("b2", "dialogue", "Hello world"),
      ]
      const scenes = [{ id: "s1", blockIds: ["b1", "b2"], title: "INT. ROOM" }]
      const entries = buildRundownEntries(blocks, scenes)
      expect(entries.length).toBe(1)
      expect(entries[0].entryType).toBe("action") // orphan dialogue → action
    })

    it("detects V.O. from character extension", () => {
      const blocks = [
        makeBlock("b1", "scene_heading", "INT. ROOM"),
        makeBlock("b2", "action", "Empty room."),
        makeBlock("b3", "character", "NARRATOR (V.O.)"),
        makeBlock("b4", "dialogue", "It was a dark night."),
      ]
      const scenes = [{ id: "s1", blockIds: ["b1", "b2", "b3", "b4"], title: "INT. ROOM" }]
      const entries = buildRundownEntries(blocks, scenes)
      const voEntry = entries.find((e) => e.entryType === "dialogue")
      expect(voEntry?.isVO).toBe(true)
      expect(voEntry?.speaker).toBe("NARRATOR")
    })
  })

  describe("reconcileRundownEntries", () => {
    it("preserves locked entries", () => {
      const newEntries = buildRundownEntries(DEMO_BLOCKS, DEMO_SCENES)
      const existing = [
        ...newEntries,
        {
          ...newEntries[0],
          id: "locked-entry",
          locked: true,
          autoSynced: false,
          directorNote: "Keep this!",
        },
      ]

      const result = reconcileRundownEntries(
        buildRundownEntries(DEMO_BLOCKS.slice(0, 5), DEMO_SCENES),
        existing,
      )

      const locked = result.find((e) => e.id === "locked-entry")
      expect(locked).toBeDefined()
      expect(locked?.directorNote).toBe("Keep this!")
    })

    it("preserves visual data from existing entries", () => {
      const newEntries = buildRundownEntries(DEMO_BLOCKS, DEMO_SCENES)
      const existing = newEntries.map((e, i) =>
        i === 0
          ? { ...e, visual: { thumbnailUrl: "test.jpg", thumbnailBlobKey: null, originalUrl: null, originalBlobKey: null, imagePrompt: "", videoPrompt: "", shotSize: "", cameraMotion: "", generationHistory: [], activeHistoryIndex: null, type: "image" as const } }
          : e,
      )

      const result = reconcileRundownEntries(newEntries, existing)
      const first = result.find((e) => e.parentBlockId === newEntries[0].parentBlockId)
      expect(first?.visual?.thumbnailUrl).toBe("test.jpg")
    })
  })
})
