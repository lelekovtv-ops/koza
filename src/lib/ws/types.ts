// ── Shared types between client and server ──

export type Operation =
  // Blocks
  | { type: "block.create"; blockId: string; afterId: string | null; blockType: string; text?: string }
  | { type: "block.update"; blockId: string; text: string }
  | { type: "block.delete"; blockId: string }
  | { type: "block.changeType"; blockId: string; blockType: string }
  | { type: "block.reorder"; blockId: string; newOrder: number }
  | { type: "block.updateMeta"; blockId: string; meta: Record<string, unknown> }
  // Shots
  | { type: "shot.create"; shotId: string; sceneId: string; parentBlockId?: string; data: Record<string, unknown> }
  | { type: "shot.update"; shotId: string; patch: Record<string, unknown> }
  | { type: "shot.delete"; shotId: string }
  | { type: "shot.reorder"; shotId: string; newOrder: number }
  // Settings (JSONB replace)
  | { type: "settings.set"; key: string; data: unknown }

export interface PresenceInfo {
  userId: string
  name: string
  cursor: { sceneId?: string; blockId?: string; view: string }
}

export interface LockInfo {
  sceneId: string
  userId: string
  userName: string
  expiresAt: string
}

export interface ProjectSnapshot {
  blocks: Array<{
    id: string
    type: string
    text: string
    order: number
    durationMs?: number | null
    durationSource?: string | null
    [key: string]: unknown
  }>
  shots: Array<{
    id: string
    sceneId: string | null
    parentBlockId: string | null
    order: number
    duration: number
    shotSize: string
    cameraMotion: string
    caption: string
    directorNote: string
    cameraNote: string
    imagePrompt: string
    videoPrompt: string
    thumbnailUrl: string | null
    originalUrl: string | null
    [key: string]: unknown
  }>
  settings: Record<string, unknown>
  lastOpId: number
}

// ── Messages ──

export type ClientMessage =
  | { type: "auth"; token: string }
  | { type: "join"; projectId: string; lastSeenOp?: number }
  | { type: "leave" }
  | { type: "op"; op: Operation }
  | { type: "lock"; sceneId: string }
  | { type: "unlock"; sceneId: string }
  | { type: "presence"; cursor: { sceneId?: string; blockId?: string; view: string } }

export type ServerMessage =
  | { type: "auth:ok"; userId: string; email: string }
  | { type: "auth:error"; message: string }
  | { type: "snapshot"; data: ProjectSnapshot; locks: LockInfo[]; presence: PresenceInfo[] }
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
