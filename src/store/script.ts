import { create } from "zustand"
import { persist } from "zustand/middleware"
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

type ScriptDocument = {
  scenario: string   // plain text (export from blocks, kept for compat)
  blocks: Block[]    // source of truth
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

  // ── Block operations ──
  setBlocks: (blocks: Block[]) => void
  addBlockAfter: (afterId: string, type: BlockType) => void
  updateBlock: (id: string, text: string) => void
  changeType: (id: string, type: BlockType) => void
  deleteBlock: (id: string) => void
  setFlow: (flow: Partial<FlowConfig>) => void

  // ── Metadata ──
  setTitle: (title: string) => void
  setAuthor: (author: string) => void
  setDraft: (draft: string) => void
  setDate: (date: string) => void

  // ── Project switching ──
  setActiveProject: (projectId: string | null) => void
}

const DEMO_SCREENPLAY = `INT. КВАРТИРА БОРИСА — НОЧЬ

Тесная комната. Единственный источник света — мерцающий экран старого телевизора. БОРИС (55) сидит за столом, перебирая документы. Пепельница полная. Руки дрожат.

На стене — фотографии. Женщина, ребёнок. Выцветшие.

БОРИС
(шёпотом)
Они не должны были узнать.

Борис встаёт. Подходит к окну. Отодвигает штору. Свет фар скользит по стене.

EXT. УЛИЦА У ДОМА БОРИСА — НОЧЬ

Чёрный автомобиль класса люкс медленно подъезжает к старому дому. Останавливается. Двигатель глохнет. Тишина.

Дверь открывается. Из машины выходит НЕЗНАКОМЕЦ (40). Дорогое пальто. Лицо скрыто тенью. Хлопает дверью — звук разносится по пустой улице.

INT. КВАРТИРА БОРИСА — НОЧЬ

Борис вздрагивает от звука. Отступает от окна. Лицо бледнеет.

БОРИС
Нет. Нет-нет-нет.

Борис бросается к шкафу. Начинает лихорадочно собирать вещи в старую сумку. Роняет что-то — звук разбитого стекла.

Останавливается. Смотрит на разбитую рамку с фотографией на полу.

БОРИС
(тихо, себе)
Прости.

Поднимает фотографию. Засовывает в карман пиджака.

EXT. ПОДЪЕЗД — НОЧЬ

Незнакомец подходит к двери подъезда. Достаёт телефон.

НЕЗНАКОМЕЦ
(в телефон)
Я на месте. Он дома.

Пауза.

НЕЗНАКОМЕЦ
Понял. Без следов.

Убирает телефон. Открывает дверь подъезда.

INT. ЛЕСТНИЧНАЯ КЛЕТКА — НОЧЬ

Гулкие шаги по бетонным ступеням. Камера следует за Незнакомцем снизу вверх. Тусклая лампочка раскачивается.

INT. КВАРТИРА БОРИСА — НОЧЬ

Борис слышит шаги на лестнице. Замирает. Сумка в руке.

Смотрит на дверь. Смотрит на окно. Четвёртый этаж.

Шаги всё ближе.

Борис тихо подходит к двери. Прислушивается. Шаги останавливаются.

Тишина.

Стук в дверь. Три раза. Медленно.`

const createDefaultScript = (): ScriptDocument => {
  const defaultBlocks = parseTextToBlocks(DEMO_SCREENPLAY)
  return {
    scenario: exportBlocksToText(defaultBlocks),
    blocks: defaultBlocks,
    title: "НЕЗНАКОМЕЦ",
    author: "KOZA AI",
    draft: "First Draft",
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

export const useScriptStore = create<ScriptState>()(
  persist(
    (set, get) => ({
      ...createDefaultScript(),
      activeProjectId: null,
      projectScripts: {},

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

      // ── Block operations ──
      setBlocks: (blocks) => {
        const scenario = syncScenario(blocks)
        set((state) => ({
          blocks,
          scenario,
          ...updateCurrentProjectScript(state, { blocks, scenario }),
        }))
      },

      addBlockAfter: (afterId, type) => {
        const newBlock = makeBlock(type)
        set((state) => {
          const blocks = insertBlockAfter(state.blocks, afterId, newBlock)
          const scenario = syncScenario(blocks)
          return {
            blocks,
            scenario,
            ...updateCurrentProjectScript(state, { blocks, scenario }),
          }
        })
        return newBlock.id
      },

      updateBlock: (id, text) => {
        set((state) => {
          const blocks = updateBlockText(state.blocks, id, text)
          const scenario = syncScenario(blocks)
          return {
            blocks,
            scenario,
            ...updateCurrentProjectScript(state, { blocks, scenario }),
          }
        })
      },

      changeType: (id, type) => {
        set((state) => {
          const blocks = changeBlockType(state.blocks, id, type)
          const scenario = syncScenario(blocks)
          return {
            blocks,
            scenario,
            ...updateCurrentProjectScript(state, { blocks, scenario }),
          }
        })
      },

      deleteBlock: (id) => {
        set((state) => {
          const blocks = removeBlock(state.blocks, id)
          const finalBlocks = blocks.length === 0 ? [makeBlock("action")] : blocks
          const scenario = syncScenario(finalBlocks)
          return {
            blocks: finalBlocks,
            scenario,
            ...updateCurrentProjectScript(state, { blocks: finalBlocks, scenario }),
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
    { name: "koza-script" }
  )
)
