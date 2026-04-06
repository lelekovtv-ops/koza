/**
 * SyncBus — lightweight event emitter for bidirectional sync.
 *
 * Coordinates changes between screenplay, storyboard, timeline, and voice.
 * Each subscriber checks `event.origin` to skip events from its own origin,
 * preventing infinite sync loops.
 *
 * This is NOT a Zustand store — it's a singleton event bus.
 */

import type { SyncEvent, ChangeOrigin, SyncEventType } from "./productionTypes"

type SyncHandler = (event: SyncEvent) => void

class SyncBusImpl {
  private handlers = new Set<SyncHandler>()

  /** Subscribe to sync events. Returns unsubscribe function. */
  on(handler: SyncHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  /** Unsubscribe a handler. */
  off(handler: SyncHandler): void {
    this.handlers.delete(handler)
  }

  /** Emit a sync event to all subscribers. */
  emit(event: SyncEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event)
      } catch (err) {
        console.error("[SyncBus] handler error:", err)
      }
    }
  }

  /** Helper to create and emit an event. */
  dispatch(
    origin: ChangeOrigin,
    type: SyncEventType,
    payload: Record<string, unknown> = {},
    ids?: { blockId?: string; shotId?: string; shotGroupId?: string }
  ): void {
    this.emit({
      origin,
      type,
      blockId: ids?.blockId,
      shotId: ids?.shotId,
      shotGroupId: ids?.shotGroupId,
      payload,
      timestamp: Date.now(),
    })
  }

  /** Remove all handlers (useful for testing). */
  clear(): void {
    this.handlers.clear()
  }
}

/** Singleton SyncBus instance. */
export const syncBus = new SyncBusImpl()
