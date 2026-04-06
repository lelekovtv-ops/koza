/**
 * Emits operations to the WS server when local stores change.
 * Only emits when the change is LOCAL (not from remote).
 */

import { getWSClient } from "./client"
import type { Operation } from "./types"

/**
 * Send an operation to the server.
 * Call this from store methods when the change is user-initiated (not remote).
 */
export function emitOp(op: Operation) {
  const client = getWSClient()
  if (!client.connected) {
    // Queue for later — client handles offline queue
    client.sendOp(op)
    return
  }
  client.sendOp(op).catch((err) => {
    console.warn("[opEmitter] Op rejected:", err)
  })
}

/**
 * Check if an origin is local (should emit) or remote (should not emit).
 */
export function shouldEmit(origin?: string): boolean {
  return origin !== "remote" && origin !== "screenplay"
}
