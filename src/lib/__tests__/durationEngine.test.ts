import { describe, it, expect } from "vitest"
import {
  wordCount,
  dialogueDurationMs,
  actionDurationMs,
  estimateBlockDurationMs,
  getEffectiveDuration,
  computeGapMs,
  DIALOGUE_WPM,
  ACTION_WPM,
  HEADING_MS,
  TRANSITION_MS,
  MIN_BLOCK_MS,
  MIN_ACTION_MS,
  MAX_ACTION_MS,
} from "../durationEngine"

describe("durationEngine", () => {
  describe("wordCount", () => {
    it("counts words", () => {
      expect(wordCount("hello world")).toBe(2)
      expect(wordCount("  one  two  three  ")).toBe(3)
      expect(wordCount("")).toBe(0)
      expect(wordCount("   ")).toBe(0)
    })
  })

  describe("dialogueDurationMs", () => {
    it("calculates from WPM", () => {
      // 155 words = 1 minute = 60000ms + 300ms pause
      const dur = dialogueDurationMs("word ".repeat(155).trim())
      expect(dur).toBeCloseTo(60300, -2)
    })

    it("respects minimum", () => {
      expect(dialogueDurationMs("hi")).toBeGreaterThanOrEqual(MIN_BLOCK_MS)
    })
  })

  describe("actionDurationMs", () => {
    it("calculates from WPM", () => {
      // 10 words at 120 WPM = 5s
      const dur = actionDurationMs("word ".repeat(10).trim())
      expect(dur).toBeCloseTo(5000, -2)
    })

    it("respects min/max", () => {
      expect(actionDurationMs("short")).toBeGreaterThanOrEqual(MIN_ACTION_MS)
      expect(actionDurationMs("word ".repeat(500).trim())).toBeLessThanOrEqual(MAX_ACTION_MS)
    })
  })

  describe("estimateBlockDurationMs", () => {
    it("scene_heading = HEADING_MS", () => {
      expect(estimateBlockDurationMs("scene_heading", "INT. CAFE")).toBe(HEADING_MS)
    })

    it("transition = TRANSITION_MS", () => {
      expect(estimateBlockDurationMs("transition", "CUT TO:")).toBe(TRANSITION_MS)
    })

    it("dialogue uses dialogueDuration", () => {
      const text = "Hello, how are you doing today?"
      expect(estimateBlockDurationMs("dialogue", text)).toBe(dialogueDurationMs(text))
    })

    it("action uses actionDuration", () => {
      const text = "He walks across the room slowly."
      expect(estimateBlockDurationMs("action", text)).toBe(actionDurationMs(text))
    })

    it("empty text returns 0 for non-structural types", () => {
      expect(estimateBlockDurationMs("action", "")).toBe(0)
      expect(estimateBlockDurationMs("dialogue", "")).toBe(0)
    })
  })

  describe("getEffectiveDuration", () => {
    it("uses estimated when no overrides", () => {
      expect(getEffectiveDuration({ estimatedDurationMs: 5000 })).toBe(5000)
    })

    it("manual overrides estimated", () => {
      expect(getEffectiveDuration({
        estimatedDurationMs: 5000,
        manualDurationMs: 3000,
      })).toBe(3000)
    })

    it("display overrides manual and estimated", () => {
      expect(getEffectiveDuration({
        estimatedDurationMs: 5000,
        manualDurationMs: 3000,
        displayDurationMs: 7000,
      })).toBe(7000)
    })

    it("null overrides are skipped", () => {
      expect(getEffectiveDuration({
        estimatedDurationMs: 5000,
        manualDurationMs: null,
        displayDurationMs: null,
      })).toBe(5000)
    })
  })

  describe("computeGapMs", () => {
    it("returns 0 when no media", () => {
      expect(computeGapMs({ estimatedDurationMs: 5000 })).toBe(0)
    })

    it("returns gap when media shorter than effective", () => {
      expect(computeGapMs({
        estimatedDurationMs: 7000,
        mediaDurationMs: 5000,
      })).toBe(2000)
    })

    it("returns 0 when media equals effective", () => {
      expect(computeGapMs({
        estimatedDurationMs: 5000,
        mediaDurationMs: 5000,
      })).toBe(0)
    })

    it("returns 0 when media longer than effective", () => {
      expect(computeGapMs({
        estimatedDurationMs: 5000,
        mediaDurationMs: 8000,
      })).toBe(0)
    })
  })
})
