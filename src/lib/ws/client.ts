/**
 * WebSocket client for KOZA collaborative editing.
 * Handles connection, reconnection, auth, and message routing.
 */

import type { ClientMessage, ServerMessage, Operation } from "./types"

type MessageHandler = (msg: ServerMessage) => void

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000]
const HEARTBEAT_INTERVAL = 30_000

export class KozaWSClient {
  private ws: WebSocket | null = null
  private url: string
  private token: string | null = null
  private projectId: string | null = null
  private lastSeenOp = 0
  private handlers = new Set<MessageHandler>()
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private _connected = false
  private _authenticated = false
  private offlineQueue: Operation[] = []
  private pendingOps = new Map<number, { resolve: () => void; reject: (err: string) => void }>()
  private opSeq = 0

  constructor(url?: string) {
    this.url = url || this.getDefaultUrl()
  }

  private getDefaultUrl(): string {
    if (typeof window === "undefined") return "ws://localhost:8080"
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
    return `${proto}//${window.location.hostname}:8080`
  }

  // ── Connection state ──

  get connected() { return this._connected }
  get authenticated() { return this._authenticated }
  get queueSize() { return this.offlineQueue.length }

  // ── Connect ──

  connect(token: string, projectId?: string) {
    this.token = token
    if (projectId) this.projectId = projectId
    this.doConnect()
  }

  private doConnect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return
    }

    try {
      this.ws = new WebSocket(this.url)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this._connected = true
      this.reconnectAttempt = 0
      this.startHeartbeat()

      // Authenticate
      if (this.token) {
        this.send({ type: "auth", token: this.token })
      }
    }

    this.ws.onmessage = (event) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      this.handleMessage(msg)
    }

    this.ws.onclose = () => {
      this._connected = false
      this._authenticated = false
      this.stopHeartbeat()
      this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      // onclose will fire after this
    }
  }

  private handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "auth:ok":
        this._authenticated = true
        // Auto-join project if set
        if (this.projectId) {
          this.send({ type: "join", projectId: this.projectId, lastSeenOp: this.lastSeenOp })
        }
        break

      case "auth:error":
        this._authenticated = false
        console.error("[ws] Auth failed:", msg.message)
        break

      case "snapshot":
        this.lastSeenOp = msg.data.lastOpId
        break

      case "op":
        this.lastSeenOp = Math.max(this.lastSeenOp, msg.opId)
        break

      case "op:ack": {
        const pending = this.pendingOps.get(msg.opId)
        if (pending) {
          pending.resolve()
          this.pendingOps.delete(msg.opId)
        }
        break
      }

      case "op:reject": {
        // Reject oldest pending op
        const first = this.pendingOps.entries().next()
        if (!first.done) {
          first.value[1].reject(msg.error)
          this.pendingOps.delete(first.value[0])
        }
        break
      }
    }

    // Broadcast to all handlers
    for (const handler of this.handlers) {
      try {
        handler(msg)
      } catch (err) {
        console.error("[ws] Handler error:", err)
      }
    }
  }

  // ── Send ──

  private send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  // ── Operations ──

  sendOp(op: Operation): Promise<void> {
    if (!this._connected || !this._authenticated) {
      this.offlineQueue.push(op)
      return Promise.resolve()
    }

    this.send({ type: "op", op })

    return new Promise((resolve, reject) => {
      const seq = ++this.opSeq
      this.pendingOps.set(seq, { resolve, reject })

      // Timeout after 10s
      setTimeout(() => {
        if (this.pendingOps.has(seq)) {
          this.pendingOps.delete(seq)
          reject("Operation timed out")
        }
      }, 10_000)
    })
  }

  // ── Project ──

  joinProject(projectId: string) {
    this.projectId = projectId
    if (this._authenticated) {
      this.send({ type: "join", projectId, lastSeenOp: this.lastSeenOp })
    }
  }

  leaveProject() {
    this.send({ type: "leave" })
    this.projectId = null
  }

  // ── Locks ──

  lockScene(sceneId: string) {
    this.send({ type: "lock", sceneId })
  }

  unlockScene(sceneId: string) {
    this.send({ type: "unlock", sceneId })
  }

  // ── Presence ──

  sendPresence(cursor: { sceneId?: string; blockId?: string; view: string }) {
    this.send({ type: "presence", cursor })
  }

  // ── Handlers ──

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  // ── Reconnect ──

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)]
    this.reconnectAttempt++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.doConnect()
    }, delay)
  }

  // ── Heartbeat ──

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send("ping")
      }
    }, HEARTBEAT_INTERVAL)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  // ── Flush offline queue ──

  flushQueue() {
    if (!this._connected || !this._authenticated) return
    const ops = [...this.offlineQueue]
    this.offlineQueue = []
    for (const op of ops) {
      this.sendOp(op)
    }
  }

  // ── Disconnect ──

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.stopHeartbeat()
    this.ws?.close()
    this.ws = null
    this._connected = false
    this._authenticated = false
  }
}

// ── Singleton ──

let instance: KozaWSClient | null = null

export function getWSClient(): KozaWSClient {
  if (!instance) {
    instance = new KozaWSClient()
  }
  return instance
}
