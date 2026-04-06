import { describe, it, expect } from "vitest"
import { buildVoiceClipsFromRundown, groupClipsBySpeaker, getSpeakersFromRundown } from "../voiceFromRundown"
import { createRundownEntry } from "../rundownTypes"
import type { RundownEntry } from "../rundownTypes"

const ENTRIES: RundownEntry[] = [
  createRundownEntry({
    id: "e1", parentBlockId: "b1", entryType: "establishing",
    order: 0, estimatedDurationMs: 3000, caption: "Man sits",
  }),
  createRundownEntry({
    id: "e2", parentBlockId: "b2", entryType: "dialogue",
    order: 1, estimatedDurationMs: 2000, speaker: "JOHN", caption: "Good morning.", isVO: false,
  }),
  createRundownEntry({
    id: "e3", parentBlockId: "b3", entryType: "action",
    order: 2, estimatedDurationMs: 4000, caption: "He walks",
  }),
  createRundownEntry({
    id: "e4", parentBlockId: "b4", entryType: "dialogue",
    order: 3, estimatedDurationMs: 2500, speaker: "NARRATOR", caption: "It was a dark night.", isVO: true,
  }),
  createRundownEntry({
    id: "e5", parentBlockId: "b5", entryType: "dialogue",
    order: 4, estimatedDurationMs: 1500, speaker: "JOHN", caption: "Goodbye.",
  }),
]

describe("voiceFromRundown", () => {
  describe("buildVoiceClipsFromRundown", () => {
    it("creates clips for dialogue entries", () => {
      const clips = buildVoiceClipsFromRundown(ENTRIES)
      expect(clips.length).toBe(3) // JOHN, NARRATOR, JOHN
    })

    it("sets correct track for VO", () => {
      const clips = buildVoiceClipsFromRundown(ENTRIES)
      const narrator = clips.find((c) => c.speaker === "NARRATOR")
      expect(narrator?.track).toBe("vo")
      expect(narrator?.isVO).toBe(true)
    })

    it("sets correct track for dialogue", () => {
      const clips = buildVoiceClipsFromRundown(ENTRIES)
      const john = clips.find((c) => c.speaker === "JOHN")
      expect(john?.track).toBe("dialogue")
      expect(john?.isVO).toBe(false)
    })

    it("computes correct startMs positions", () => {
      const clips = buildVoiceClipsFromRundown(ENTRIES)
      // e1=3000, e2=2000 (clip at 3000), e3=4000, e4=2500 (clip at 9000), e5=1500 (clip at 11500)
      expect(clips[0].startMs).toBe(3000) // JOHN after establishing
      expect(clips[1].startMs).toBe(9000) // NARRATOR after action
      expect(clips[2].startMs).toBe(11500) // JOHN after narrator
    })

    it("handles empty entries", () => {
      expect(buildVoiceClipsFromRundown([])).toEqual([])
    })

    it("handles no dialogue entries", () => {
      const actionOnly = [
        createRundownEntry({ id: "a1", parentBlockId: "b1", entryType: "action", estimatedDurationMs: 3000 }),
      ]
      expect(buildVoiceClipsFromRundown(actionOnly)).toEqual([])
    })
  })

  describe("groupClipsBySpeaker", () => {
    it("groups clips by speaker", () => {
      const clips = buildVoiceClipsFromRundown(ENTRIES)
      const groups = groupClipsBySpeaker(clips)
      expect(groups.size).toBe(2) // JOHN, NARRATOR
      expect(groups.get("JOHN")?.length).toBe(2)
      expect(groups.get("NARRATOR")?.length).toBe(1)
    })
  })

  describe("getSpeakersFromRundown", () => {
    it("returns unique sorted speakers", () => {
      const speakers = getSpeakersFromRundown(ENTRIES)
      expect(speakers).toEqual(["JOHN", "NARRATOR"])
    })
  })
})
