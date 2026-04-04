import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { PanelId } from "./panels"

// ─── Types ──────────────────────────────────────────────────

export interface GeneratedImage {
  id: string
  prompt: string
  url: string        // blob URL (current session) or base64 (persisted)
  base64?: string    // for persistence
  timestamp: number
  blockTitle?: string
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  text: string
  timestamp?: number
}

export interface PieceSession {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  scriptText: string
  messages: ChatMessage[]
  images: GeneratedImage[]
  activePanel: PanelId | null
  openPanels: PanelId[]
}

// ─── Store ──────────────────────────────────────────────────

interface PieceSessionStore {
  sessions: PieceSession[]
  activeSessionId: string | null

  // Getters
  activeSession: () => PieceSession | null

  // Session management
  createSession: (name?: string) => string
  openSession: (id: string) => void
  deleteSession: (id: string) => void
  renameSession: (id: string, name: string) => void

  // Update active session
  setScript: (text: string) => void
  addMessage: (msg: ChatMessage) => void
  addImage: (img: GeneratedImage) => void
  setActivePanel: (panel: PanelId | null) => void
  setOpenPanels: (panels: PanelId[]) => void
}

export const usePieceSessionStore = create<PieceSessionStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,

      activeSession: () => {
        const { sessions, activeSessionId } = get()
        return sessions.find((s) => s.id === activeSessionId) ?? null
      },

      createSession: (name) => {
        const id = `session-${Date.now()}`
        const session: PieceSession = {
          id,
          name: name || `Session ${new Date().toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          scriptText: "",
          messages: [],
          images: [],
          activePanel: null,
          openPanels: [],
        }
        set((s) => ({
          sessions: [session, ...s.sessions],
          activeSessionId: id,
        }))
        return id
      },

      openSession: (id) => set({ activeSessionId: id }),

      deleteSession: (id) =>
        set((s) => ({
          sessions: s.sessions.filter((ss) => ss.id !== id),
          activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
        })),

      renameSession: (id, name) =>
        set((s) => ({
          sessions: s.sessions.map((ss) => (ss.id === id ? { ...ss, name, updatedAt: Date.now() } : ss)),
        })),

      setScript: (text) =>
        set((s) => ({
          sessions: s.sessions.map((ss) =>
            ss.id === s.activeSessionId ? { ...ss, scriptText: text, updatedAt: Date.now() } : ss,
          ),
        })),

      addMessage: (msg) =>
        set((s) => ({
          sessions: s.sessions.map((ss) =>
            ss.id === s.activeSessionId
              ? { ...ss, messages: [...ss.messages, { ...msg, timestamp: Date.now() }], updatedAt: Date.now() }
              : ss,
          ),
        })),

      addImage: (img) =>
        set((s) => ({
          sessions: s.sessions.map((ss) =>
            ss.id === s.activeSessionId
              ? { ...ss, images: [img, ...ss.images], updatedAt: Date.now() }
              : ss,
          ),
        })),

      setActivePanel: (panel) =>
        set((s) => ({
          sessions: s.sessions.map((ss) =>
            ss.id === s.activeSessionId ? { ...ss, activePanel: panel, updatedAt: Date.now() } : ss,
          ),
        })),

      setOpenPanels: (panels) =>
        set((s) => ({
          sessions: s.sessions.map((ss) =>
            ss.id === s.activeSessionId ? { ...ss, openPanels: panels, updatedAt: Date.now() } : ss,
          ),
        })),
    }),
    {
      name: "piece-sessions",
      partialize: (state) => ({
        sessions: state.sessions.map((s) => ({
          ...s,
          // Don't persist blob URLs — only base64
          images: s.images.map((img) => ({ ...img, url: img.base64 ? "" : img.url })),
        })),
        activeSessionId: state.activeSessionId,
      }),
    },
  ),
)
