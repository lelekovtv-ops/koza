import "dotenv/config"
import { createServer } from "http"
import { WebSocketServer, WebSocket } from "ws"
import { verifyToken, canWrite, type TokenPayload } from "./auth.js"
import { applyOperation, getOperationsSince, type Operation } from "./operations.js"
import { acquireLock, releaseLock, releaseAllUserLocks, getProjectLocks } from "./locks.js"
import { getProjectSnapshot } from "./snapshot.js"
import { pool } from "./db.js"

const PORT = parseInt(process.env.PORT || "8080", 10)

// ── Types ──

interface ClientState {
  ws: WebSocket
  user: TokenPayload
  projectId: string | null
}

type ClientMessage =
  | { type: "auth"; token: string }
  | { type: "join"; projectId: string; lastSeenOp?: number }
  | { type: "leave" }
  | { type: "op"; op: Operation }
  | { type: "lock"; sceneId: string }
  | { type: "unlock"; sceneId: string }
  | { type: "presence"; cursor: { sceneId?: string; blockId?: string; view: string } }

type ServerMessage =
  | { type: "auth:ok"; userId: string; email: string }
  | { type: "auth:error"; message: string }
  | { type: "snapshot"; data: Awaited<ReturnType<typeof getProjectSnapshot>>; locks: Awaited<ReturnType<typeof getProjectLocks>>; presence: PresenceInfo[] }
  | { type: "op"; opId: number; op: Operation; userId: string }
  | { type: "op:ack"; opId: number }
  | { type: "op:reject"; error: string }
  | { type: "lock:ok"; sceneId: string }
  | { type: "lock:denied"; sceneId: string; userName: string }
  | { type: "lock:acquired"; sceneId: string; userId: string; userName: string }
  | { type: "lock:released"; sceneId: string }
  | { type: "presence:update"; users: PresenceInfo[] }
  | { type: "user:joined"; userId: string; name: string }
  | { type: "user:left"; userId: string }
  | { type: "error"; message: string }

interface PresenceInfo {
  userId: string
  name: string
  cursor: { sceneId?: string; blockId?: string; view: string }
}

// ── State ──

const clients = new Map<WebSocket, ClientState>()
const presence = new Map<string, { name: string; cursor: PresenceInfo["cursor"] }>()  // userId → presence

// ── Helpers ──

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

function broadcastToProject(projectId: string, msg: ServerMessage, excludeWs?: WebSocket) {
  for (const [ws, state] of clients) {
    if (state.projectId === projectId && ws !== excludeWs) {
      send(ws, msg)
    }
  }
}

function getPresenceList(projectId: string): PresenceInfo[] {
  const list: PresenceInfo[] = []
  for (const [, state] of clients) {
    if (state.projectId === projectId) {
      const p = presence.get(state.user.userId)
      list.push({
        userId: state.user.userId,
        name: p?.name || state.user.email,
        cursor: p?.cursor || { view: "unknown" },
      })
    }
  }
  return list
}

// ── Server ──

const httpServer = createServer((req, res) => {
  // Health check endpoint
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ status: "ok", clients: clients.size }))
    return
  }
  res.writeHead(404)
  res.end()
})

const wss = new WebSocketServer({ server: httpServer })

wss.on("connection", (ws) => {
  const state: ClientState = {
    ws,
    user: null as unknown as TokenPayload,
    projectId: null,
  }
  clients.set(ws, state)

  ws.on("message", async (raw) => {
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      send(ws, { type: "error", message: "Invalid JSON" })
      return
    }

    // ── Auth ──
    if (msg.type === "auth") {
      const payload = verifyToken(msg.token)
      if (!payload) {
        send(ws, { type: "auth:error", message: "Invalid token" })
        return
      }
      state.user = payload
      send(ws, { type: "auth:ok", userId: payload.userId, email: payload.email })
      return
    }

    // All other messages require auth
    if (!state.user) {
      send(ws, { type: "error", message: "Not authenticated" })
      return
    }

    // ── Join project ──
    if (msg.type === "join") {
      const hasAccess = await canWrite(state.user.userId, msg.projectId)
        || (await import("./auth.js")).getUserProjectRole(state.user.userId, msg.projectId) !== null

      if (!hasAccess) {
        send(ws, { type: "error", message: "No access to this project" })
        return
      }

      state.projectId = msg.projectId

      // Send snapshot
      const [snapshot, locks] = await Promise.all([
        getProjectSnapshot(msg.projectId),
        getProjectLocks(msg.projectId),
      ])

      // If client has lastSeenOp, also send missed operations
      if (msg.lastSeenOp && msg.lastSeenOp < snapshot.lastOpId) {
        const missed = await getOperationsSince(msg.projectId, msg.lastSeenOp)
        for (const op of missed) {
          send(ws, { type: "op", opId: op.id, op: op.op, userId: op.userId })
        }
      }

      const presenceList = getPresenceList(msg.projectId)
      send(ws, { type: "snapshot", data: snapshot, locks, presence: presenceList })

      // Notify others
      broadcastToProject(msg.projectId, {
        type: "user:joined",
        userId: state.user.userId,
        name: state.user.email,
      }, ws)
      return
    }

    // ── Leave project ──
    if (msg.type === "leave") {
      if (state.projectId) {
        await releaseAllUserLocks(state.projectId, state.user.userId)
        broadcastToProject(state.projectId, { type: "user:left", userId: state.user.userId }, ws)
        state.projectId = null
      }
      return
    }

    // Remaining messages require active project
    if (!state.projectId) {
      send(ws, { type: "error", message: "Not in a project" })
      return
    }

    // ── Operation ──
    if (msg.type === "op") {
      const writeAccess = await canWrite(state.user.userId, state.projectId)
      if (!writeAccess) {
        send(ws, { type: "op:reject", error: "No write access" })
        return
      }

      const result = await applyOperation(state.projectId, state.user.userId, msg.op)

      if (result.success && result.opId) {
        send(ws, { type: "op:ack", opId: result.opId })
        broadcastToProject(state.projectId, {
          type: "op",
          opId: result.opId,
          op: msg.op,
          userId: state.user.userId,
        }, ws)
      } else {
        send(ws, { type: "op:reject", error: result.error || "Operation failed" })
      }
      return
    }

    // ── Lock ──
    if (msg.type === "lock") {
      const result = await acquireLock(state.projectId, msg.sceneId, state.user.userId)
      if (result.acquired) {
        send(ws, { type: "lock:ok", sceneId: msg.sceneId })
        broadcastToProject(state.projectId, {
          type: "lock:acquired",
          sceneId: msg.sceneId,
          userId: state.user.userId,
          userName: state.user.email,
        }, ws)
      } else {
        send(ws, {
          type: "lock:denied",
          sceneId: msg.sceneId,
          userName: result.lockedByName || "Unknown",
        })
      }
      return
    }

    // ── Unlock ──
    if (msg.type === "unlock") {
      const released = await releaseLock(state.projectId, msg.sceneId, state.user.userId)
      if (released) {
        broadcastToProject(state.projectId, {
          type: "lock:released",
          sceneId: msg.sceneId,
        })
      }
      return
    }

    // ── Presence ──
    if (msg.type === "presence") {
      presence.set(state.user.userId, {
        name: state.user.email,
        cursor: msg.cursor,
      })
      broadcastToProject(state.projectId, {
        type: "presence:update",
        users: getPresenceList(state.projectId),
      }, ws)
      return
    }
  })

  ws.on("close", async () => {
    const closedState = clients.get(ws)
    if (closedState?.projectId && closedState.user) {
      await releaseAllUserLocks(closedState.projectId, closedState.user.userId)
      presence.delete(closedState.user.userId)
      broadcastToProject(closedState.projectId, {
        type: "user:left",
        userId: closedState.user.userId,
      })
      broadcastToProject(closedState.projectId, {
        type: "presence:update",
        users: getPresenceList(closedState.projectId),
      })
    }
    clients.delete(ws)
  })

  ws.on("error", (err) => {
    console.error("[ws] Client error:", err.message)
  })
})

// ── Lock cleanup interval ──
setInterval(async () => {
  try {
    await pool.query("SELECT cleanup_expired_locks()")
  } catch {
    // ignore
  }
}, 60_000)

// ── Start ──
httpServer.listen(PORT, () => {
  console.log(`[koza-ws] WebSocket server running on port ${PORT}`)
})
