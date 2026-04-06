import { describe, it, expect } from "vitest"
import {
  getChildren,
  getTopLevel,
  hasChildren,
  getEffectiveEntries,
  recalculateParentDurations,
  flattenForTimeline,
  getTotalDuration,
  getEntryAtTime,
} from "../rundownHierarchy"
import { createRundownEntry } from "../rundownTypes"
import type { RundownEntry } from "../rundownTypes"

function makeEntry(overrides: Partial<RundownEntry> & { id: string; parentBlockId: string; entryType: RundownEntry["entryType"] }): RundownEntry {
  return createRundownEntry(overrides)
}

// Flat entries (no hierarchy)
const FLAT_ENTRIES: RundownEntry[] = [
  makeEntry({ id: "e1", parentBlockId: "b1", entryType: "establishing", order: 0, estimatedDurationMs: 3000, caption: "Man sits" }),
  makeEntry({ id: "e2", parentBlockId: "b2", entryType: "dialogue", order: 1, estimatedDurationMs: 2000, speaker: "JOHN", caption: "Hello" }),
  makeEntry({ id: "e3", parentBlockId: "b3", entryType: "action", order: 2, estimatedDurationMs: 4000, caption: "He walks" }),
]

// Hierarchical entries (e3 split into sub-shots)
const HIERARCHY_ENTRIES: RundownEntry[] = [
  makeEntry({ id: "e1", parentBlockId: "b1", entryType: "establishing", order: 0, estimatedDurationMs: 3000 }),
  makeEntry({ id: "e2", parentBlockId: "b2", entryType: "dialogue", order: 1, estimatedDurationMs: 2000, speaker: "JOHN", caption: "Hello" }),
  makeEntry({ id: "e3", parentBlockId: "b3", entryType: "heading", order: 2, estimatedDurationMs: 4000 }),
  makeEntry({ id: "e3a", parentBlockId: "b3", parentEntryId: "e3", entryType: "action", order: 0, estimatedDurationMs: 2000, caption: "Wide shot" }),
  makeEntry({ id: "e3b", parentBlockId: "b3", parentEntryId: "e3", entryType: "action", order: 1, estimatedDurationMs: 2000, caption: "Close up" }),
]

describe("rundownHierarchy", () => {
  describe("getChildren", () => {
    it("returns children sorted by order", () => {
      const children = getChildren(HIERARCHY_ENTRIES, "e3")
      expect(children.map((c) => c.id)).toEqual(["e3a", "e3b"])
    })

    it("returns empty for leaf entries", () => {
      expect(getChildren(HIERARCHY_ENTRIES, "e1")).toEqual([])
    })
  })

  describe("getTopLevel", () => {
    it("returns entries without parentEntryId", () => {
      const top = getTopLevel(HIERARCHY_ENTRIES)
      expect(top.map((e) => e.id)).toEqual(["e1", "e2", "e3"])
    })
  })

  describe("hasChildren", () => {
    it("true for heading with children", () => {
      expect(hasChildren(HIERARCHY_ENTRIES, "e3")).toBe(true)
    })

    it("false for leaf", () => {
      expect(hasChildren(HIERARCHY_ENTRIES, "e1")).toBe(false)
    })
  })

  describe("getEffectiveEntries", () => {
    it("returns all entries when flat", () => {
      const effective = getEffectiveEntries(FLAT_ENTRIES)
      expect(effective.length).toBe(3)
    })

    it("replaces heading with children", () => {
      const effective = getEffectiveEntries(HIERARCHY_ENTRIES)
      expect(effective.map((e) => e.id)).toEqual(["e1", "e2", "e3a", "e3b"])
    })

    it("handles empty", () => {
      expect(getEffectiveEntries([])).toEqual([])
    })
  })

  describe("recalculateParentDurations", () => {
    it("sets parent duration to sum of children", () => {
      const result = recalculateParentDurations(HIERARCHY_ENTRIES)
      const heading = result.find((e) => e.id === "e3")
      expect(heading?.estimatedDurationMs).toBe(4000) // 2000 + 2000
    })

    it("no-op for flat entries", () => {
      const result = recalculateParentDurations(FLAT_ENTRIES)
      expect(result).toEqual(FLAT_ENTRIES)
    })
  })

  describe("flattenForTimeline", () => {
    it("produces visual positions for all entries", () => {
      const positions = flattenForTimeline(FLAT_ENTRIES)
      const visual = positions.filter((p) => p.track === "visual")
      expect(visual.length).toBe(3)
    })

    it("produces voice + titles for dialogue", () => {
      const positions = flattenForTimeline(FLAT_ENTRIES)
      const voice = positions.filter((p) => p.track === "voice")
      const titles = positions.filter((p) => p.track === "titles")
      expect(voice.length).toBe(1)
      expect(titles.length).toBe(1)
    })

    it("startMs is sequential", () => {
      const positions = flattenForTimeline(FLAT_ENTRIES)
      const visual = positions.filter((p) => p.track === "visual")
      expect(visual[0].startMs).toBe(0)
      expect(visual[1].startMs).toBe(3000)
      expect(visual[2].startMs).toBe(5000)
    })

    it("replaces heading with children in timeline", () => {
      const positions = flattenForTimeline(HIERARCHY_ENTRIES)
      const visual = positions.filter((p) => p.track === "visual")
      expect(visual.map((p) => p.entryId)).toEqual(["e1", "e2", "e3a", "e3b"])
    })

    it("total duration correct", () => {
      const positions = flattenForTimeline(FLAT_ENTRIES)
      const visual = positions.filter((p) => p.track === "visual")
      const last = visual[visual.length - 1]
      expect(last.endMs).toBe(9000) // 3000 + 2000 + 4000
    })
  })

  describe("getTotalDuration", () => {
    it("sums effective entry durations", () => {
      expect(getTotalDuration(FLAT_ENTRIES)).toBe(9000)
    })

    it("uses children for headings", () => {
      expect(getTotalDuration(HIERARCHY_ENTRIES)).toBe(9000) // 3000 + 2000 + 2000 + 2000
    })
  })

  describe("getEntryAtTime", () => {
    it("finds entry at start", () => {
      expect(getEntryAtTime(FLAT_ENTRIES, 0)?.id).toBe("e1")
    })

    it("finds entry in middle", () => {
      expect(getEntryAtTime(FLAT_ENTRIES, 3500)?.id).toBe("e2")
    })

    it("finds last entry", () => {
      expect(getEntryAtTime(FLAT_ENTRIES, 6000)?.id).toBe("e3")
    })

    it("returns null past end", () => {
      expect(getEntryAtTime(FLAT_ENTRIES, 99999)).toBeNull()
    })

    it("finds sub-shot in hierarchy", () => {
      expect(getEntryAtTime(HIERARCHY_ENTRIES, 5500)?.id).toBe("e3a")
    })
  })
})
