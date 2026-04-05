/**
 * Rundown Store — the central authority for structure, timing, and visuals.
 *
 * Screenplay (scriptStore) = textual truth.
 * Rundown (this store) = structural truth for timeline + storyboard.
 *
 * Timeline and storyboard are VIEWS that read from this store.
 */

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "@/lib/safeStorage"
import type { RundownEntry } from "@/lib/rundownTypes"
import { createRundownEntry, makeRundownEntryId } from "@/lib/rundownTypes"
import { buildRundownEntries, reconcileRundownEntries } from "@/lib/rundownBuilder"
import type { BuilderBlockInput, BuilderSceneInput } from "@/lib/rundownBuilder"
import { getEffectiveDuration } from "@/lib/durationEngine"

// ─── State ───────────────────────────────────────────────────

interface RundownState {
  entries: RundownEntry[]
  selectedEntryId: string | null

  // Per-project storage
  activeProjectId: string | null
  projectRundowns: Record<string, RundownEntry[]>

  // ─── Rebuild from screenplay ─────────────────────────────
  rebuildFromBlocks: (blocks: BuilderBlockInput[], scenes: BuilderSceneInput[]) => void

  // ─── CRUD ────────────────────────────────────────────────
  updateEntry: (entryId: string, patch: Partial<RundownEntry>) => void
  deleteEntry: (entryId: string) => void
  reorderEntry: (entryId: string, newOrder: number) => void

  // ─── Duration ────────────────────────────────────────────
  setManualDuration: (entryId: string, ms: number) => void
  setDisplayDuration: (entryId: string, ms: number | null) => void
  setMediaDuration: (entryId: string, ms: number) => void

  // ─── Sub-Shot Hierarchy ──────────────────────────────────
  splitEntry: (entryId: string, subShots: Partial<RundownEntry>[]) => void
  mergeSubShots: (parentEntryId: string) => void

  // ─── Selection ───────────────────────────────────────────
  selectEntry: (id: string | null) => void

  // ─── Project switching ───────────────────────────────────
  setActiveProject: (projectId: string | null) => void
}

// ─── Store ───────────────────────────────────────────────────

export const useRundownStore = create<RundownState>()(
  persist(
    (set, get) => ({
      entries: [],
      selectedEntryId: null,
      activeProjectId: null,
      projectRundowns: {},

      // ─── Rebuild from screenplay ─────────────────────────
      rebuildFromBlocks: (blocks, scenes) => {
        const state = get()
        const newEntries = buildRundownEntries(blocks, scenes)
        const reconciled = reconcileRundownEntries(newEntries, state.entries)
        set({ entries: reconciled })
      },

      // ─── CRUD ────────────────────────────────────────────
      updateEntry: (entryId, patch) => {
        set((state) => ({
          entries: state.entries.map((e) =>
            e.id === entryId ? { ...e, ...patch, id: entryId, parentBlockId: e.parentBlockId } : e,
          ),
        }))
      },

      deleteEntry: (entryId) => {
        set((state) => {
          // Also delete all children of this entry
          const toDelete = new Set([entryId])
          for (const e of state.entries) {
            if (e.parentEntryId === entryId) toDelete.add(e.id)
          }

          const remaining = state.entries.filter((e) => !toDelete.has(e.id))

          // If the deleted entry had a parentEntryId, recalculate parent duration
          const deleted = state.entries.find((e) => e.id === entryId)
          if (deleted?.parentEntryId) {
            const parentId = deleted.parentEntryId
            const siblings = remaining.filter((e) => e.parentEntryId === parentId)
            if (siblings.length === 0) {
              // No more children — parent reverts from heading to its original type
              return {
                entries: remaining.map((e) =>
                  e.id === parentId
                    ? { ...e, entryType: "action" as const }
                    : e,
                ),
                selectedEntryId: state.selectedEntryId === entryId ? null : state.selectedEntryId,
              }
            }
            // Renormalize order
            let order = 0
            return {
              entries: remaining.map((e) =>
                e.parentEntryId === parentId
                  ? { ...e, order: order++ }
                  : e,
              ),
              selectedEntryId: state.selectedEntryId === entryId ? null : state.selectedEntryId,
            }
          }

          return {
            entries: remaining,
            selectedEntryId: state.selectedEntryId === entryId ? null : state.selectedEntryId,
          }
        })
      },

      reorderEntry: (entryId, newOrder) => {
        set((state) => {
          const entry = state.entries.find((e) => e.id === entryId)
          if (!entry) return state

          // Reorder among siblings (same parentEntryId level)
          const siblings = state.entries
            .filter((e) => e.parentEntryId === entry.parentEntryId)
            .sort((a, b) => a.order - b.order)

          const oldIndex = siblings.findIndex((e) => e.id === entryId)
          if (oldIndex === -1 || newOrder === oldIndex) return state

          siblings.splice(oldIndex, 1)
          siblings.splice(newOrder, 0, entry)

          const reordered = new Map(siblings.map((e, i) => [e.id, i]))

          return {
            entries: state.entries.map((e) =>
              reordered.has(e.id) ? { ...e, order: reordered.get(e.id)! } : e,
            ),
          }
        })
      },

      // ─── Duration ────────────────────────────────────────
      setManualDuration: (entryId, ms) => {
        set((state) => ({
          entries: state.entries.map((e) =>
            e.id === entryId ? { ...e, manualDurationMs: ms } : e,
          ),
        }))
      },

      setDisplayDuration: (entryId, ms) => {
        set((state) => ({
          entries: state.entries.map((e) =>
            e.id === entryId ? { ...e, displayDurationMs: ms } : e,
          ),
        }))
      },

      setMediaDuration: (entryId, ms) => {
        set((state) => ({
          entries: state.entries.map((e) =>
            e.id === entryId ? { ...e, mediaDurationMs: ms } : e,
          ),
        }))
      },

      // ─── Sub-Shot Hierarchy ──────────────────────────────
      splitEntry: (entryId, subShots) => {
        set((state) => {
          const parent = state.entries.find((e) => e.id === entryId)
          if (!parent || parent.entryType === "heading") return state

          const parentEffective = getEffectiveDuration(parent)

          // Create children
          const children: RundownEntry[] = subShots.map((partial, i) => {
            const duration = partial.estimatedDurationMs ??
              Math.round(parentEffective / subShots.length)

            return createRundownEntry({
              ...partial,
              parentBlockId: parent.parentBlockId,
              parentEntryId: parent.id,
              entryType: partial.entryType ?? "action",
              order: i,
              estimatedDurationMs: duration,
              caption: partial.caption ?? parent.caption,
              sourceText: partial.sourceText ?? parent.sourceText,
              autoSynced: false,
            })
          })

          // Parent becomes heading
          return {
            entries: [
              ...state.entries.map((e) =>
                e.id === entryId ? { ...e, entryType: "heading" as const } : e,
              ),
              ...children,
            ],
          }
        })
      },

      mergeSubShots: (parentEntryId) => {
        set((state) => {
          const parent = state.entries.find((e) => e.id === parentEntryId)
          if (!parent || parent.entryType !== "heading") return state

          // Remove all children
          const children = state.entries.filter((e) => e.parentEntryId === parentEntryId)
          const childIds = new Set(children.map((e) => e.id))

          return {
            entries: state.entries
              .filter((e) => !childIds.has(e.id))
              .map((e) =>
                e.id === parentEntryId ? { ...e, entryType: "action" as const } : e,
              ),
          }
        })
      },

      // ─── Selection ───────────────────────────────────────
      selectEntry: (id) => set({ selectedEntryId: id }),

      // ─── Project switching ───────────────────────────────
      setActiveProject: (projectId) => {
        const state = get()

        // Save current entries to current project
        if (state.activeProjectId) {
          const updated = { ...state.projectRundowns }
          updated[state.activeProjectId] = state.entries
          set({ projectRundowns: updated })
        }

        // Load entries for new project
        const entries = projectId ? state.projectRundowns[projectId] ?? [] : []
        set({ activeProjectId: projectId, entries, selectedEntryId: null })
      },
    }),
    {
      name: "koza-rundown-store",
      storage: safeStorage,
      partialize: (state) => ({
        entries: state.entries,
        activeProjectId: state.activeProjectId,
        projectRundowns: state.projectRundowns,
      }),
    },
  ),
)

// ─── Selectors ───────────────────────────────────────────────

/** Get top-level entries (no parent) */
export function getTopLevelEntries(): RundownEntry[] {
  return useRundownStore.getState().entries.filter((e) => e.parentEntryId === null)
}

/** Get children of an entry */
export function getChildEntries(parentEntryId: string): RundownEntry[] {
  return useRundownStore
    .getState()
    .entries.filter((e) => e.parentEntryId === parentEntryId)
    .sort((a, b) => a.order - b.order)
}

/** Get entries for a specific block */
export function getEntriesForBlock(blockId: string): RundownEntry[] {
  return useRundownStore
    .getState()
    .entries.filter((e) => e.parentBlockId === blockId)
    .sort((a, b) => a.order - b.order)
}

/** Get leaf entries (entries that actually render on timeline) */
export function getLeafEntries(): RundownEntry[] {
  const entries = useRundownStore.getState().entries
  const parentIds = new Set(entries.filter((e) => e.entryType === "heading").map((e) => e.id))

  return entries
    .filter((e) => e.entryType !== "heading" || !parentIds.has(e.id))
    .filter((e) => {
      // If parent is a heading, this is a leaf (sub-shot)
      if (e.parentEntryId) return true
      // If top-level and not a heading, this is a leaf
      return e.entryType !== "heading"
    })
    .sort((a, b) => a.order - b.order)
}
