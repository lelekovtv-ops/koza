import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "@/lib/safeStorage"
import { useProjectsStore } from "@/store/projects"
import {
  type Block,
  type FlowConfig,
  DEFAULT_FLOW,
  makeBlock,
  parseTextToBlocks,
  exportBlocksToText,
  insertBlockAfter,
  updateBlockText,
  changeBlockType,
  removeBlock,
  type BlockType,
} from "@/lib/screenplayFormat"
import type { ChangeOrigin, ShotGroup } from "@/lib/productionTypes"

type ScriptDocument = {
  scenario: string   // plain text (export from blocks, kept for compat)
  blocks: Block[]    // source of truth
  shotGroups: ShotGroup[]  // explicit shot groupings for storyboard/timeline
  title: string
  author: string
  draft: string
  date: string
  flow: FlowConfig   // per-project flow config
}

interface ScriptState extends ScriptDocument {
  activeProjectId: string | null
  projectScripts: Record<string, ScriptDocument>

  // ── Scenario (plain text, legacy compat) ──
  setScenario: (text: string) => void

  // ── Block operations (origin param for bidirectional sync loop prevention) ──
  setBlocks: (blocks: Block[], origin?: ChangeOrigin) => void
  addBlockAfter: (afterId: string, type: BlockType, origin?: ChangeOrigin) => void
  updateBlock: (id: string, text: string, origin?: ChangeOrigin) => void
  changeType: (id: string, type: BlockType, origin?: ChangeOrigin) => void
  deleteBlock: (id: string, origin?: ChangeOrigin) => void
  updateBlockProduction: (id: string, patch: Partial<Block>, origin?: ChangeOrigin) => void
  setFlow: (flow: Partial<FlowConfig>) => void

  // ── Shot groups ──
  setShotGroups: (groups: ShotGroup[]) => void
  addShotGroup: (group: ShotGroup) => void
  updateShotGroup: (id: string, patch: Partial<ShotGroup>) => void
  removeShotGroup: (id: string) => void

  // ── Demo scripts ──
  loadDemo: (id: string) => void

  // ── Metadata ──
  setTitle: (title: string) => void
  setAuthor: (author: string) => void
  setDraft: (draft: string) => void
  setDate: (date: string) => void

  // ── Project switching ──
  setActiveProject: (projectId: string | null) => void

  // ── Last change origin (for sync loop prevention) ──
  _lastOrigin: ChangeOrigin | undefined
}


const createDefaultScript = (): ScriptDocument => {
  const blocks = [makeBlock("action")]
  return {
    scenario: "",
    blocks,
    shotGroups: [],
    title: "",
    author: "",
    draft: "",
    date: new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    flow: DEFAULT_FLOW,
  }
}

// Sync blocks → scenario text on every block change
function syncScenario(blocks: Block[]): string {
  return exportBlocksToText(blocks)
}

function updateCurrentProjectScript(
  state: ScriptState,
  patch: Partial<ScriptDocument>
): Pick<ScriptState, "projectScripts"> {
  if (!state.activeProjectId) return { projectScripts: state.projectScripts }
  const current = state.projectScripts[state.activeProjectId] || createDefaultScript()
  return {
    projectScripts: {
      ...state.projectScripts,
      [state.activeProjectId]: { ...current, ...patch },
    },
  }
}

export const DEMO_SCRIPT_LIST: { id: string; label: string }[] = []

export const useScriptStore = create<ScriptState>()(
  persist(
    (set) => ({
      ...createDefaultScript(),
      activeProjectId: null,
      projectScripts: {},
      _lastOrigin: undefined as ChangeOrigin | undefined,

      // ── Scenario (plain text import) ──
      setScenario: (text) => {
        const blocks = parseTextToBlocks(text)
        const scenario = syncScenario(blocks)
        set((state) => ({
          scenario,
          blocks,
          ...updateCurrentProjectScript(state, { scenario, blocks }),
        }))
      },

      // ── Demo scripts (deprecated — kept for compat) ──
      loadDemo: () => {},

      // ── Block operations ──
      setBlocks: (blocks, origin) => {
        const scenario = syncScenario(blocks)
        set((state) => ({
          blocks,
          scenario,
          _lastOrigin: origin,
          ...updateCurrentProjectScript(state, { blocks, scenario }),
        }))
      },

      addBlockAfter: (afterId, type, origin) => {
        const newBlock = makeBlock(type)
        set((state) => {
          const blocks = insertBlockAfter(state.blocks, afterId, newBlock)
          const scenario = syncScenario(blocks)
          return {
            blocks,
            scenario,
            _lastOrigin: origin,
            ...updateCurrentProjectScript(state, { blocks, scenario }),
          }
        })
        return newBlock.id
      },

      updateBlock: (id, text, origin) => {
        set((state) => {
          const blocks = updateBlockText(state.blocks, id, text)
          const scenario = syncScenario(blocks)
          return {
            blocks,
            scenario,
            _lastOrigin: origin,
            ...updateCurrentProjectScript(state, { blocks, scenario }),
          }
        })
      },

      changeType: (id, type, origin) => {
        set((state) => {
          const blocks = changeBlockType(state.blocks, id, type)
          const scenario = syncScenario(blocks)
          return {
            blocks,
            scenario,
            _lastOrigin: origin,
            ...updateCurrentProjectScript(state, { blocks, scenario }),
          }
        })
      },

      deleteBlock: (id, origin) => {
        set((state) => {
          const blocks = removeBlock(state.blocks, id)
          const finalBlocks = blocks.length === 0 ? [makeBlock("action")] : blocks
          const scenario = syncScenario(finalBlocks)
          return {
            blocks: finalBlocks,
            scenario,
            _lastOrigin: origin,
            ...updateCurrentProjectScript(state, { blocks: finalBlocks, scenario }),
          }
        })
      },

      updateBlockProduction: (id, patch, origin) => {
        set((state) => {
          const blocks = state.blocks.map((b) =>
            b.id === id ? { ...b, ...patch, id: b.id, type: b.type, text: b.text } : b
          )
          return {
            blocks,
            _lastOrigin: origin,
            ...updateCurrentProjectScript(state, { blocks }),
          }
        })
      },

      // ── Shot groups ──
      setShotGroups: (shotGroups) => {
        set((state) => ({
          shotGroups,
          ...updateCurrentProjectScript(state, { shotGroups }),
        }))
      },

      addShotGroup: (group) => {
        set((state) => {
          const shotGroups = [...state.shotGroups, group]
          return {
            shotGroups,
            ...updateCurrentProjectScript(state, { shotGroups }),
          }
        })
      },

      updateShotGroup: (id, patch) => {
        set((state) => {
          const shotGroups = state.shotGroups.map((g) =>
            g.id === id ? { ...g, ...patch } : g
          )
          return {
            shotGroups,
            ...updateCurrentProjectScript(state, { shotGroups }),
          }
        })
      },

      removeShotGroup: (id) => {
        set((state) => {
          const shotGroups = state.shotGroups.filter((g) => g.id !== id)
          return {
            shotGroups,
            ...updateCurrentProjectScript(state, { shotGroups }),
          }
        })
      },

      setFlow: (flowPatch) => {
        set((state) => {
          const flow = { ...state.flow, ...flowPatch }
          return {
            flow,
            ...updateCurrentProjectScript(state, { flow }),
          }
        })
      },

      // ── Metadata ──
      setTitle: (title) =>
        set((state) => {
          const normalized = title.trim()
          if (state.activeProjectId && normalized && normalized !== "UNTITLED") {
            useProjectsStore.getState().updateProjectName?.(state.activeProjectId, normalized)
          }
          return { title, ...updateCurrentProjectScript(state, { title }) }
        }),

      setAuthor: (author) =>
        set((state) => ({ author, ...updateCurrentProjectScript(state, { author }) })),

      setDraft: (draft) =>
        set((state) => ({ draft, ...updateCurrentProjectScript(state, { draft }) })),

      setDate: (date) =>
        set((state) => ({ date, ...updateCurrentProjectScript(state, { date }) })),

      // ── Project switching ──
      setActiveProject: (projectId) =>
        set((state) => {
          if (!projectId) return { activeProjectId: null, ...createDefaultScript() }
          const projectScript = state.projectScripts[projectId] || createDefaultScript()
          // Migrate old projects that have scenario but no blocks
          if (projectScript.scenario && (!projectScript.blocks || projectScript.blocks.length === 0)) {
            projectScript.blocks = parseTextToBlocks(projectScript.scenario)
          }
          // Migrate old projects that don't have shotGroups
          if (!projectScript.shotGroups) {
            projectScript.shotGroups = []
          }
          return {
            activeProjectId: projectId,
            ...projectScript,
            projectScripts: state.projectScripts[projectId]
              ? state.projectScripts
              : {
                  ...state.projectScripts,
                  [projectId]: projectScript,
                },
          }
        }),
    }),
    { name: "koza-script", storage: safeStorage }
  )
)
