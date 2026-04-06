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
  removeShotFromBlock: (shotId: string) => void
  reorderShotInBlock: (shotId: string, newOrder: number) => void
  updateShot: (shotId: string, patch: Partial<Shot>) => void

  // ── Shot groups (used by breakdown enrichment) ──
  setShotGroups: (groups: ShotGroup[]) => void

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
  const defaultText = DEMO_SCRIPTS["signal"] ?? ""
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
  "signal": `FADE IN:

INT. DEEP SPACE MONITORING STATION — NIGHT

A windowless room buried under a mountain. Banks of monitors cast blue light on bare concrete walls. Coffee cups and energy bar wrappers everywhere. The hum of servers.

ELENA VASQUEZ (34, sharp eyes, rumpled NASA polo) sits alone at a workstation. Headphones on. She's been here for hours.

On her screen: the SETI signal analyzer. Flat lines. Static. Nothing. Like every night for the past three years.

She reaches for her coffee. Empty. She sighs, pulls off her headphones—

A PING.

Elena freezes. Looks at the screen. A spike in the waveform. Then another. Then a pattern.

ELENA
(whisper)
No way.

She puts the headphones back on. The signal is clear. Rhythmic. Unmistakably artificial.

She picks up the red phone.

ELENA (CONT'D)
This is Vasquez at Goldstone. I need Director Chen. Now.

(beat)

Yes, I know what time it is. Tell him we have a Signal.

SMASH CUT TO:

INT. NASA HEADQUARTERS — DIRECTOR'S OFFICE — NIGHT

JAMES CHEN (58, silver hair, reading glasses) stares at a laptop screen. His hand trembles slightly. Behind him, through floor-to-ceiling windows, the Washington Monument glows.

Elena is on video call, her face pixelated but intense.

ELENA (ON SCREEN)
It's repeating every 47 seconds. Prime number interval. Hydrogen line frequency. This isn't a pulsar, James.

CHEN
Where's it coming from?

ELENA (ON SCREEN)
That's the thing. It's not coming from space.

A long silence.

CHEN
What do you mean?

ELENA (ON SCREEN)
The signal is coming from beneath the ocean floor. Pacific basin. 4,000 meters down.

Chen takes off his glasses. Rubs his eyes. Puts them back on.

CHEN
I'm calling the President.

CUT TO:

EXT. PACIFIC OCEAN — DAY

AERIAL SHOT. Endless blue water. A single research vessel, the MERIDIAN, cuts through gentle swells.

SUPER: "72 HOURS LATER"

INT. MERIDIAN — RESEARCH LAB — CONTINUOUS

Cramped, packed with equipment. Elena works alongside DR. KOFI ASANTE (45, marine geologist, calm presence). Screens show sonar maps of the ocean floor.

KOFI
You understand this changes everything, right? If there's something manufactured at that depth — it predates any known civilization. We're talking millions of years.

ELENA
I know what we're talking about.

KOFI
Do you? Because the last three people I told this to thought I was having a breakdown.

Elena smiles for the first time. It transforms her face.

ELENA
Kofi. I've spent three years listening to static, hoping for exactly this. I'm the last person who'll think you're crazy.

EXT. PACIFIC OCEAN — LATER

The Meridian has stopped. Equipment cranes lower a deep-sea ROV — ORPHEUS — into the water. Its lights pierce the darkness as it descends.

INT. MERIDIAN — ROV CONTROL ROOM — CONTINUOUS

Elena and Kofi watch the monitors. The ROV's cameras show the descent: blue fading to black. Fish scatter in the lights.

DEPTH COUNTER: 1,000m... 2,000m... 3,000m...

KOFI
Signal's getting stronger.

3,800m. The ocean floor appears. Mud. Rocks. Ancient sediment undisturbed for millennia.

Then — something else.

ELENA
Oh my God.

On the screen: a perfect geometric structure embedded in the seabed. Black. Smooth. The size of a football field. Not natural. Not possible.

It's pulsing with faint light. The same rhythm as the signal.

KOFI
(barely audible)
It's been waiting.

The structure's light intensifies. On every screen in the room, the same message appears — not in any human language, but somehow, impossibly, understood:

WE HEARD YOU WERE LOOKING FOR US.

SMASH CUT TO BLACK.

TITLE CARD: "SIGNAL"

FADE OUT.`,

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
  { id: "signal", label: "Signal (Sci-Fi Short)" },
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

      // ── Shot groups (used by breakdown enrichment) ──
      setShotGroups: (shotGroups) => {
        set((state) => ({
          shotGroups,
          ...updateCurrentProjectScript(state, { shotGroups }),
        }))
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
