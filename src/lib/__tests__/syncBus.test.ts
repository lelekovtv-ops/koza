import { describe, it, expect, vi, beforeEach } from "vitest"
import { syncBus } from "@/lib/syncBus"

beforeEach(() => {
  syncBus.clear()
})

describe("SyncBus", () => {
  it("emits events to subscribers", () => {
    const handler = vi.fn()
    syncBus.on(handler)

    syncBus.dispatch("screenplay", "block-text", { text: "hello" }, { blockId: "b1" })

    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0][0]).toMatchObject({
      origin: "screenplay",
      type: "block-text",
      blockId: "b1",
      payload: { text: "hello" },
    })
  })

  it("unsubscribe via returned function", () => {
    const handler = vi.fn()
    const unsub = syncBus.on(handler)
    unsub()

    syncBus.dispatch("timeline", "duration-change", {})
    expect(handler).not.toHaveBeenCalled()
  })

  it("unsubscribe via off()", () => {
    const handler = vi.fn()
    syncBus.on(handler)
    syncBus.off(handler)

    syncBus.dispatch("timeline", "duration-change", {})
    expect(handler).not.toHaveBeenCalled()
  })

  it("multiple subscribers receive events", () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    syncBus.on(h1)
    syncBus.on(h2)

    syncBus.dispatch("voice", "voice-text", {})

    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })

  it("handler errors don't break other handlers", () => {
    const errorHandler = vi.fn(() => { throw new Error("boom") })
    const okHandler = vi.fn()
    syncBus.on(errorHandler)
    syncBus.on(okHandler)

    // Should not throw
    syncBus.dispatch("system", "block-add", {})

    expect(errorHandler).toHaveBeenCalledOnce()
    expect(okHandler).toHaveBeenCalledOnce()
  })

  it("clear() removes all handlers", () => {
    const handler = vi.fn()
    syncBus.on(handler)
    syncBus.clear()

    syncBus.dispatch("screenplay", "block-text", {})
    expect(handler).not.toHaveBeenCalled()
  })

  it("dispatch sets timestamp", () => {
    const handler = vi.fn()
    syncBus.on(handler)

    const before = Date.now()
    syncBus.dispatch("timeline", "shot-add", {})
    const after = Date.now()

    const event = handler.mock.calls[0][0]
    expect(event.timestamp).toBeGreaterThanOrEqual(before)
    expect(event.timestamp).toBeLessThanOrEqual(after)
  })

  it("origin-based filtering works in handler", () => {
    const results: string[] = []

    syncBus.on((event) => {
      if (event.origin === "screenplay") return // skip own origin
      results.push(`${event.origin}:${event.type}`)
    })

    syncBus.dispatch("screenplay", "block-text", {})
    syncBus.dispatch("timeline", "duration-change", {})
    syncBus.dispatch("voice", "voice-text", {})

    expect(results).toEqual(["timeline:duration-change", "voice:voice-text"])
  })
})
