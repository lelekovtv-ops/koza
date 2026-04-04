import {
  createRow,
  recalcTimings,
  getTotalDurationMs,
  textToRundown,
  durationFromText,
  formatTimecode,
  rowHeightPx,
  createCarWashDemo,
  MIN_DURATION_MS,
  DEFAULT_PX_PER_SEC,
  MIN_ROW_H,
} from "../rundownEngine"

describe("rundownEngine", () => {
  describe("durationFromText", () => {
    it("returns MIN_DURATION_MS for empty text", () => {
      expect(durationFromText("")).toBe(MIN_DURATION_MS)
    })

    it("calculates duration from word count at 155 WPM", () => {
      // 10 words at 155 WPM = ~3.87s + 300ms padding
      const text = "one two three four five six seven eight nine ten"
      const dur = durationFromText(text)
      expect(dur).toBeGreaterThan(3000)
      expect(dur).toBeLessThan(5000)
    })
  })

  describe("formatTimecode", () => {
    it("formats 0ms", () => {
      expect(formatTimecode(0)).toBe("0:00")
    })

    it("formats seconds", () => {
      expect(formatTimecode(5000)).toBe("0:05")
    })

    it("formats minutes", () => {
      expect(formatTimecode(65000)).toBe("1:05")
    })
  })

  describe("rowHeightPx", () => {
    it("respects MIN_ROW_H", () => {
      expect(rowHeightPx(100, DEFAULT_PX_PER_SEC)).toBe(MIN_ROW_H)
    })

    it("scales duration to pixels", () => {
      // 5 seconds at 15px/sec = 75px
      expect(rowHeightPx(5000, 15)).toBe(75)
    })
  })

  describe("createRow", () => {
    it("creates a row with auto duration from voice", () => {
      const row = createRow(1, "", "This is a test sentence with several words")
      expect(row.index).toBe(1)
      expect(row.durationMs).toBeGreaterThan(MIN_DURATION_MS)
      expect(row.voice).toBe("This is a test sentence with several words")
    })

    it("uses explicit duration when provided", () => {
      const row = createRow(1, "visual", "voice", "", "", 5000)
      expect(row.durationMs).toBe(5000)
    })
  })

  describe("recalcTimings", () => {
    it("sets sequential startMs", () => {
      const rows = [
        createRow(1, "", "", "", "", 3000),
        createRow(2, "", "", "", "", 2000),
        createRow(3, "", "", "", "", 5000),
      ]
      const result = recalcTimings(rows)
      expect(result[0].startMs).toBe(0)
      expect(result[1].startMs).toBe(3000)
      expect(result[2].startMs).toBe(5000)
    })

    it("reindexes rows", () => {
      const rows = [
        createRow(5, "", "", "", "", 1000),
        createRow(9, "", "", "", "", 1000),
      ]
      const result = recalcTimings(rows)
      expect(result[0].index).toBe(1)
      expect(result[1].index).toBe(2)
    })

    it("handles empty array", () => {
      expect(recalcTimings([])).toEqual([])
    })
  })

  describe("getTotalDurationMs", () => {
    it("returns 0 for empty", () => {
      expect(getTotalDurationMs([])).toBe(0)
    })

    it("returns sum of all durations", () => {
      const rows = recalcTimings([
        createRow(1, "", "", "", "", 3000),
        createRow(2, "", "", "", "", 2000),
      ])
      expect(getTotalDurationMs(rows)).toBe(5000)
    })
  })

  describe("textToRundown", () => {
    it("splits by double newlines", () => {
      const text = "First paragraph\n\nSecond paragraph\n\nThird paragraph"
      const rows = textToRundown(text)
      expect(rows).toHaveLength(3)
      expect(rows[0].voice).toBe("First paragraph")
      expect(rows[1].voice).toBe("Second paragraph")
      expect(rows[2].voice).toBe("Third paragraph")
    })

    it("sets sequential timings", () => {
      const text = "One\n\nTwo\n\nThree"
      const rows = textToRundown(text)
      expect(rows[0].startMs).toBe(0)
      expect(rows[1].startMs).toBe(rows[0].durationMs)
    })

    it("handles empty text", () => {
      expect(textToRundown("")).toEqual([])
    })
  })

  describe("createCarWashDemo", () => {
    it("creates 7 rows", () => {
      const demo = createCarWashDemo()
      expect(demo).toHaveLength(7)
    })

    it("has sequential timings", () => {
      const demo = createCarWashDemo()
      for (let i = 1; i < demo.length; i++) {
        expect(demo[i].startMs).toBe(demo[i - 1].startMs + demo[i - 1].durationMs)
      }
    })

    it("total duration is 28 seconds", () => {
      const demo = createCarWashDemo()
      expect(getTotalDurationMs(demo)).toBe(28000)
    })
  })
})
