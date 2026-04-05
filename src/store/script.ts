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
import type { ChangeOrigin, Shot, ShotGroup } from "@/lib/productionTypes"

type ScriptDocument = {
  scenario: string   // plain text (export from blocks, kept for compat)
  blocks: Block[]    // source of truth
  shots: Shot[]      // child shots belonging to blocks (parentBlockId)
  /** @deprecated Use shots[] instead */
  shotGroups: ShotGroup[]
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

  // ── Shots (parent-child with blocks) ──
  setShots: (shots: Shot[]) => void
  addShotToBlock: (parentBlockId: string, partial: Partial<Shot>) => string
  removeShotFromBlock: (shotId: string) => void
  reorderShotInBlock: (shotId: string, newOrder: number) => void
  updateShot: (shotId: string, patch: Partial<Shot>) => void
  clearBlockContent: (blockId: string) => void

  // ── Shot groups (deprecated) ──
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
  const defaultText = DEMO_SCRIPTS["slonik"] ?? ""
  const blocks = defaultText ? parseTextToBlocks(defaultText) : [makeBlock("action")]
  return {
    scenario: defaultText ? exportBlocksToText(blocks) : "",
    blocks,
    shots: [],
    shotGroups: [],
    title: defaultText ? "Слоник ищет маму" : "",
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

export const DEMO_SCRIPTS: Record<string, string> = {
  "slonik": `INT. СЛОНОВЬЯ ФЕРМА — УТРО

Рассвет. Золотой свет заливает просторный загон с высокими деревьями. Слонихи лениво жуют сено. Маленький СЛОНИК (3 года, большие уши, пыльные коленки) бегает между ног взрослых.

Слоник замечает бабочку — яркую, синюю. Он тянется к ней хоботом. Бабочка улетает. Слоник бежит за ней.

Бабочка ведёт его дальше и дальше. Слоник пролезает под забором. Не замечает.

EXT. САВАННА — УТРО

Слоник останавливается. Бабочки нет. Вокруг — бесконечная трава выше его головы. Тишина. Он оборачивается — забора не видно.

СЛОНИК
(тихо)
Мама?

Нет ответа. Только ветер.

СЛОНИК
(громче, голос дрожит)
Мама! Мама, ты где?!

Слоник бежит назад. Но всё выглядит одинаково. Трава. Деревья. Нет забора. Нет мамы.

Слоник садится. Опускает хобот. Большие глаза — мокрые.

EXT. ВОДОПОЙ — ДЕНЬ

Слоник бредёт, опустив голову. Натыкается на лужу. Пьёт жадно. В отражении видит себя — маленького, одинокого.

Рядом у воды — ЧЕРЕПАХА. Старая, панцирь в трещинах. Смотрит на слоника.

ЧЕРЕПАХА
Ты чей?

СЛОНИК
Мамин. Но я потерялся.

ЧЕРЕПАХА
Хм. Большие ходят к реке на закате. Каждый день. Иди на запад — туда, где солнце красное.

Черепаха медленно уползает. Слоник смотрит на солнце. Оно высоко. До заката далеко.

EXT. ВЫСОКАЯ ТРАВА — ДЕНЬ

Слоник идёт через траву. Шуршание. Он замирает. Из травы высовывается СУРИКАТ — маленький, нервный, стоит столбиком.

СУРИКАТ
Стой! Кто идёт? Пароль!

СЛОНИК
Какой пароль? Я ищу маму.

СУРИКАТ
(подозрительно)
Все так говорят. А потом — бам! — гиены.

Из травы появляются ещё ТРИ СУРИКАТА. Они обнюхивают слоника. Один залезает ему на голову.

СУРИКАТ
Ладно, не гиена. Слишком круглый. Куда идёшь?

СЛОНИК
К реке. Черепаха сказала — мама там будет на закате.

СУРИКАТ
Река — опасно. Там крокодилы. Мы проводим до холма. Дальше — сам.

EXT. ХОЛМ — ПРЕДЗАКАТНОЕ ВРЕМЯ

Сурикаты машут с вершины холма. Слоник спускается один. Перед ним — широкая река. Золотой свет. Красиво и страшно.

На другом берегу — СЛОНЫ. Целое стадо. Они пьют воду. Но мамы среди них слоник не видит.

Слоник заходит в воду. Неглубоко. Потом глубже. Течение сильное. Он барахтается. Хоботом вверх — дышит.

СЛОНИК
(задыхаясь)
Мама...

EXT. РЕКА — НЕПРЕРЫВНО

Из воды поднимается тёмная спина. БЕГЕМОТ. Огромный. Слоник испуганно замирает на его спине.

БЕГЕМОТ
(бурчит)
Опять детёныш. Третий за неделю.

Бегемот, не торопясь, плывёт к другому берегу. Слоник вцепился в его шкуру. Не дышит от страха.

Бегемот причаливает. Слоник скатывается на берег.

БЕГЕМОТ
Не благодари. Просто не приходи больше.

EXT. ДРУГОЙ БЕРЕГ РЕКИ — ЗАКАТ

Слоник бежит к стаду. Слоны оборачиваются. Огромные. Незнакомые. Слоник останавливается. Не его семья.

Он снова один. Закат догорает. Темнеет.

СЛОНИК
(шёпотом)
Мама...

И тут — звук. Низкий, далёкий гул. Инфразвук. Слоник поднимает уши. Он знает этот звук. МАМА.

Звук идёт из-за деревьев. Слоник бежит. Быстрее. Ещё быстрее. Ветки бьют по ушам.

EXT. ПОЛЯНА У БАОБАБА — СУМЕРКИ

МАМА-СЛОНИХА стоит под гигантским баобабом. Хоботом ощупывает землю. Ищет. Рядом два РАБОТНИКА ФЕРМЫ с фонариками.

Слоник выбегает из кустов.

СЛОНИК
МАМА!!!

Мама-слониха разворачивается. Звук — глубокий, вибрирующий. Она узнала.

Она бежит к нему. Земля дрожит. Она обхватывает его хоботом. Прижимает. Слоник исчезает в её ногах.

Тишина. Только дыхание.

РАБОТНИК ФЕРМЫ
(по рации)
Нашли. Оба целы.

Мама-слониха не отпускает. Слоник закрыл глаза. Его хобот обвивает её ногу. Он дома.

FADE OUT.`,
}

export const DEMO_SCRIPT_LIST: { id: string; label: string }[] = [
  { id: "slonik", label: "Слоник ищет маму" },
]

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

      // ── Demo scripts ──
      loadDemo: (id) => {
        const text = DEMO_SCRIPTS[id]
        if (!text) return
        const blocks = parseTextToBlocks(text)
        const scenario = syncScenario(blocks)
        set((state) => ({
          blocks,
          scenario,
          shots: [],
          shotGroups: [],
          ...updateCurrentProjectScript(state, { blocks, scenario, shots: [], shotGroups: [] }),
        }))
      },

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
          // Cascade: remove all child shots belonging to this block
          const shots = state.shots.filter((s) => s.parentBlockId !== id)
          return {
            blocks: finalBlocks,
            shots,
            scenario,
            _lastOrigin: origin,
            ...updateCurrentProjectScript(state, { blocks: finalBlocks, shots, scenario }),
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

      // ── Shots (parent-child with blocks) ──
      setShots: (shots) => {
        set((state) => ({
          shots,
          ...updateCurrentProjectScript(state, { shots }),
        }))
      },

      addShotToBlock: (parentBlockId, partial) => {
        const id = `shot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        set((state) => {
          const siblings = state.shots.filter((s) => s.parentBlockId === parentBlockId)
          const newShot: Shot = {
            id,
            parentBlockId,
            order: siblings.length,
            label: partial.label ?? `Shot ${siblings.length + 1}`,
            caption: partial.caption ?? "",
            sourceText: partial.sourceText ?? "",
            shotSize: partial.shotSize ?? "",
            cameraMotion: partial.cameraMotion ?? "",
            directorNote: partial.directorNote ?? "",
            cameraNote: partial.cameraNote ?? "",
            imagePrompt: partial.imagePrompt ?? "",
            videoPrompt: partial.videoPrompt ?? "",
            visualDescription: partial.visualDescription ?? "",
            durationMs: partial.durationMs ?? 2000,
            visual: partial.visual ?? null,
            locked: partial.locked ?? false,
            autoSynced: partial.autoSynced ?? true,
            speaker: partial.speaker ?? null,
            type: partial.type ?? "action",
          }
          const shots = [...state.shots, newShot]
          return {
            shots,
            ...updateCurrentProjectScript(state, { shots }),
          }
        })
        return id
      },

      removeShotFromBlock: (shotId) => {
        set((state) => {
          const shot = state.shots.find((s) => s.id === shotId)
          if (!shot) return state
          // Remove shot, then renormalize order for siblings
          const remaining = state.shots.filter((s) => s.id !== shotId)
          const shots = remaining.map((s) => {
            if (s.parentBlockId !== shot.parentBlockId) return s
            const siblingsOrdered = remaining
              .filter((r) => r.parentBlockId === shot.parentBlockId)
              .sort((a, b) => a.order - b.order)
            const newOrder = siblingsOrdered.findIndex((r) => r.id === s.id)
            return newOrder !== s.order ? { ...s, order: newOrder } : s
          })
          return {
            shots,
            ...updateCurrentProjectScript(state, { shots }),
          }
        })
      },

      reorderShotInBlock: (shotId, newOrder) => {
        set((state) => {
          const shot = state.shots.find((s) => s.id === shotId)
          if (!shot) return state
          const siblings = state.shots
            .filter((s) => s.parentBlockId === shot.parentBlockId)
            .sort((a, b) => a.order - b.order)
          const oldOrder = siblings.findIndex((s) => s.id === shotId)
          if (oldOrder === -1 || oldOrder === newOrder) return state
          // Remove and reinsert
          const reordered = [...siblings]
          const [moved] = reordered.splice(oldOrder, 1)
          reordered.splice(newOrder, 0, moved)
          // Build updated shots with renormalized orders
          const reorderedIds = new Map(reordered.map((s, i) => [s.id, i]))
          const shots = state.shots.map((s) => {
            const idx = reorderedIds.get(s.id)
            return idx !== undefined ? { ...s, order: idx } : s
          })
          return {
            shots,
            ...updateCurrentProjectScript(state, { shots }),
          }
        })
      },

      updateShot: (shotId, patch) => {
        set((state) => {
          const shots = state.shots.map((s) =>
            s.id === shotId ? { ...s, ...patch, id: s.id, parentBlockId: s.parentBlockId } : s
          )
          return {
            shots,
            ...updateCurrentProjectScript(state, { shots }),
          }
        })
      },

      clearBlockContent: (blockId) => {
        set((state) => {
          // Remove all child shots
          const shots = state.shots.filter((s) => s.parentBlockId !== blockId)
          // Clear production fields on the block
          const blocks = state.blocks.map((b) =>
            b.id === blockId
              ? {
                  ...b,
                  visual: undefined,
                  voiceClipId: undefined,
                  sfxHints: undefined,
                  shotGroupId: undefined,
                  modifier: undefined,
                  durationMs: undefined,
                  durationSource: undefined,
                }
              : b
          )
          return {
            blocks,
            shots,
            ...updateCurrentProjectScript(state, { blocks, shots }),
          }
        })
      },

      // ── Shot groups (deprecated) ──
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
          // Migrate old projects that don't have shots
          if (!projectScript.shots) {
            projectScript.shots = []
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

/** Get shots for a specific block (standalone selector to avoid circular reference) */
export function getShotsForBlock(blockId: string): Shot[] {
  return useScriptStore
    .getState()
    .shots.filter((s) => s.parentBlockId === blockId)
    .sort((a, b) => a.order - b.order)
}
