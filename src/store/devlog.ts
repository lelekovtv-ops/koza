import { create } from "zustand"

export type DevLogMeta = object

export type LogEntryType =
  | "breakdown_start"
  | "breakdown_prompt"
  | "breakdown_request"
  | "breakdown_response"
  | "breakdown_result"
  | "breakdown_scene_analysis"
  | "breakdown_action_split"
  | "breakdown_shot_plan"
  | "breakdown_continuity_memory"
  | "breakdown_continuity_risks"
  | "breakdown_continuity_enriched"
  | "breakdown_shot_relations"
  | "breakdown_prompt_compose"
  | "breakdown_error"
  | "image_start"
  | "image_prompt"
  | "image_bible_inject"
  | "image_style_inject"
  | "image_api_call"
  | "image_result"
  | "image_error"
  | "bible_sync"
  | "scene_parse"
  | "prompt_build"
  | "info"
  | "warning"
  | "error"

export interface LogEntry {
  id: string
  timestamp: number
  type: LogEntryType
  title: string
  details: string
  meta?: DevLogMeta
  group?: string
}

interface DevLogState {
  entries: LogEntry[]
  enabled: boolean
  maxEntries: number
  log: (entry: Omit<LogEntry, "id" | "timestamp">) => void
  clear: () => void
  setEnabled: (enabled: boolean) => void
}

const isDevMode = process.env.NODE_ENV === "development"

export const useDevLogStore = create<DevLogState>()((set, get) => ({
  entries: [],
  enabled: isDevMode,
  maxEntries: 500,

  log: (entry) => {
    if (!get().enabled) return

    const newEntry: LogEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    }

    set((state) => ({
      entries: [newEntry, ...state.entries].slice(0, state.maxEntries),
    }))

    console.log(`[KOZA ${entry.type}] ${entry.title}`, entry.meta || "")
  },

  clear: () => set({ entries: [] }),
  setEnabled: (enabled) => set({ enabled }),
}))

export const devlog = {
  info: (title: string, details: string = "", meta?: DevLogMeta) =>
    useDevLogStore.getState().log({ type: "info", title, details, meta }),
  warn: (title: string, details: string = "", meta?: DevLogMeta) =>
    useDevLogStore.getState().log({ type: "warning", title, details, meta }),
  error: (title: string, details: string = "", meta?: DevLogMeta) =>
    useDevLogStore.getState().log({ type: "error", title, details, meta }),
  breakdown: (
    type: LogEntryType,
    title: string,
    details: string,
    meta?: DevLogMeta,
    group?: string,
  ) => useDevLogStore.getState().log({ type, title, details, meta, group }),
  image: (
    type: LogEntryType,
    title: string,
    details: string,
    meta?: DevLogMeta,
    group?: string,
  ) => useDevLogStore.getState().log({ type, title, details, meta, group }),
}