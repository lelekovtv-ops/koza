import { create } from "zustand"
import type { LockInfo, PresenceInfo } from "@/lib/ws/types"
import { useBibleStore } from "./bible"

interface CollaborationState {
  // Connection
  connected: boolean
  authenticated: boolean
  setConnectionState: (connected: boolean, authenticated: boolean) => void

  // Online users
  onlineUsers: Map<string, string> // userId → name
  addUser: (userId: string, name: string) => void
  removeUser: (userId: string) => void

  // Presence (cursors)
  presence: PresenceInfo[]
  setPresence: (users: PresenceInfo[]) => void

  // Scene locks
  locks: LockInfo[]
  setLocks: (locks: LockInfo[]) => void
  addLock: (lock: LockInfo) => void
  removeLock: (sceneId: string) => void
  isSceneLocked: (sceneId: string, myUserId: string) => boolean
  getSceneLockOwner: (sceneId: string) => string | null

  // Lock denied feedback
  lockDenied: { sceneId: string; userName: string } | null
  setLockDenied: (sceneId: string, userName: string) => void
  clearLockDenied: () => void

  // Operation tracking
  lastOpId: number
  setLastOpId: (id: number) => void

  // Remote settings handler
  applyRemoteSettings: (key: string, data: unknown) => void
}

export const useCollaborationStore = create<CollaborationState>()((set, get) => ({
  connected: false,
  authenticated: false,
  setConnectionState: (connected, authenticated) => set({ connected, authenticated }),

  onlineUsers: new Map(),
  addUser: (userId, name) => set((s) => {
    const next = new Map(s.onlineUsers)
    next.set(userId, name)
    return { onlineUsers: next }
  }),
  removeUser: (userId) => set((s) => {
    const next = new Map(s.onlineUsers)
    next.delete(userId)
    return { onlineUsers: next }
  }),

  presence: [],
  setPresence: (users) => set({ presence: users }),

  locks: [],
  setLocks: (locks) => set({ locks }),
  addLock: (lock) => set((s) => ({
    locks: [...s.locks.filter((l) => l.sceneId !== lock.sceneId), lock],
  })),
  removeLock: (sceneId) => set((s) => ({
    locks: s.locks.filter((l) => l.sceneId !== sceneId),
  })),
  isSceneLocked: (sceneId, myUserId) => {
    const lock = get().locks.find((l) => l.sceneId === sceneId)
    return lock !== undefined && lock.userId !== myUserId
  },
  getSceneLockOwner: (sceneId) => {
    const lock = get().locks.find((l) => l.sceneId === sceneId)
    return lock?.userName ?? null
  },

  lockDenied: null,
  setLockDenied: (sceneId, userName) => {
    set({ lockDenied: { sceneId, userName } })
    // Auto-clear after 4 seconds
    setTimeout(() => {
      const current = get().lockDenied
      if (current?.sceneId === sceneId) {
        set({ lockDenied: null })
      }
    }, 4000)
  },
  clearLockDenied: () => set({ lockDenied: null }),

  lastOpId: 0,
  setLastOpId: (id) => set((s) => ({ lastOpId: Math.max(s.lastOpId, id) })),

  applyRemoteSettings: (key, data) => {
    // Route settings to appropriate stores
    switch (key) {
      case "bible":
        // Bible store would need a setFromRemote method
        // For now, we'll handle this when we integrate
        break
      case "voice":
      case "breakdown":
      case "screenplay_settings":
        // Same — will wire when we adapt each store
        break
      default:
        console.warn("[collab] Unknown settings key:", key)
    }
  },
}))
