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
  const defaultText = DEMO_SCRIPTS["pandora"] ?? ""
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
  "pandora": `EXT. ПЛАНЕТА ЛЮМОС — СУМЕРКИ

Чужой мир. Небо — фиолетовое с тремя лунами. Джунгли из гигантских деревьев-кристаллов, стволы прозрачные, внутри течёт свет — голубой, розовый, золотой. Каждый шаг по земле вызывает волну биолюминесценции — как рябь на воде.

Сквозь заросли пробирается экспедиционный отряд. Четверо в лёгких экзоскелетах. Шлемы с дыхательными фильтрами.

Впереди — МАЙЯ ОРЛОВА (32, ксенобиолог, глаза жадные до всего нового). За ней — ДАНИЛ РАХИМОВ (40, командир, бывший военный, спокойный как камень).

МАЙЯ
(шёпотом, восторженно)
Дан, посмотри. Деревья реагируют на наш пульс. Они нас чувствуют.

ДАНИЛ
Они чувствуют тепло. Не романтизируй.

МАЙЯ
Температурный отклик не объясняет синхронизацию. Они светятся в такт моему сердцебиению. Именно моему.

Данил останавливается. Прислушивается. Деревья вокруг Майи действительно пульсируют — медленно, ровно, как дыхание спящего ребёнка. Вокруг остальных — тишина.

ДАНИЛ
(в рацию)
База, это Рахимов. Фиксируем избирательную биолюминесцентную реакцию. Объект реагирует на конкретного члена экипажа.

БАЗА (РАЦИЯ)
Принято. Продолжайте по маршруту. Не отклоняться.

INT. БАЗОВЫЙ ЛАГЕРЬ — ПОЗЖЕ

Купольная палатка. Портативная лаборатория. За прозрачными стенами — джунгли светятся в ночи, как город, которого нет.

Майя изучает образцы под микроскопом. Рядом — ЛУКАС НВЕКЕ (28, инженер, вечно чинит что-то). Он паяет плату, но косится на экран Майи.

ЛУКАС
И что там?

МАЙЯ
Грибница. По всей планете. Единая нейронная сеть. Эти деревья — не отдельные организмы. Это одно существо. Весь лес — один разум.

ЛУКАС
Ты хочешь сказать, что планета... думает?

МАЙЯ
Я хочу сказать, что она пытается с нами заговорить.

EXT. КРИСТАЛЬНАЯ ПОЛЯНА — НОЧЬ

Майя одна. Ушла из лагеря. Стоит посреди круга из деревьев. Биолюминесценция вокруг неё — ослепительная. Голубой свет поднимается от земли, как туман.

Она снимает перчатку. Касается ствола дерева голой рукой.

Вспышка.

INT. ВИДЕНИЕ — ВНЕ ВРЕМЕНИ

Майя видит планету с высоты. Миллионы лет за секунды. Как лес рос. Как первые споры стали сетью. Как сеть стала сознанием. Как сознание ждало — тысячелетиями — кого-то, с кем можно поговорить.

Одиночество. Космическое, бездонное. Целая планета, которая умеет думать, но которой не с кем поделиться ни одной мыслью.

И вот — они прилетели.

EXT. КРИСТАЛЬНАЯ ПОЛЯНА — ПРОДОЛЖЕНИЕ

Майя отпускает дерево. Слёзы на щеках. Тяжело дышит.

Данил стоит на краю поляны. Оружие наготове.

ДАНИЛ
Майя! Что произошло?

МАЙЯ
(голос дрожит)
Она одна, Дан. Целую вечность одна. И она так счастлива, что мы здесь.

Данил опускает оружие. Смотрит на деревья. Они все светятся — ярче, чем он когда-либо видел. Тепло. Не угрожающе.

ДАНИЛ
(тихо)
Что она хочет?

МАЙЯ
Чтобы мы остались.

Долгая пауза. Деревья пульсируют. Три луны отражаются в кристальных стволах.

ДАНИЛ
(в рацию)
База. Рахимов. Нам нужно поговорить. Ситуация... сложнее, чем мы думали.

(пауза)

Нет, не опасность. Наоборот. Нас приглашают.

EXT. ДЖУНГЛИ ЛЮМОСА — РАССВЕТ

Фиолетовое небо светлеет. Два солнца поднимаются. Лес медленно меняет цвет — от ночного голубого к утреннему золотому.

Майя идёт впереди. Без шлема. Дышит воздухом планеты. За ней — Данил, Лукас. Тоже без шлемов.

Деревья расступаются перед ними, создавая тропу. Биолюминесцентная дорожка ведёт вглубь леса.

МАЙЯ (ЗК)
В тот день мы перестали быть экспедицией. Мы стали первыми жителями мира, который ждал нас задолго до того, как мы научились летать.

ТИТР: «ЛЮМОС»`,

  "signal": `INT. СТАНЦИЯ МОНИТОРИНГА ГЛУБОКОГО КОСМОСА — НОЧЬ

Комната без окон под горой. Ряды мониторов заливают голубым светом голые бетонные стены. Стаканчики из-под кофе, обёртки от батончиков. Гул серверов.

ЕЛЕНА ВАСКЕС (34, острый взгляд, мятое поло с логотипом NASA) сидит одна за рабочей станцией. Наушники на голове. Она здесь уже несколько часов.

На экране — анализатор сигналов SETI. Плоские линии. Статика. Ничего. Как каждую ночь последние три года.

Тянется к кофе. Пусто. Вздыхает, снимает наушники—

СИГНАЛ.

Елена замирает. Смотрит на экран. Всплеск на осциллограмме. Потом ещё один. Потом — паттерн.

ЕЛЕНА
(шёпотом)
Не может быть.

Надевает наушники обратно. Сигнал чистый. Ритмичный. Безошибочно искусственный.

Берёт красный телефон.

ЕЛЕНА
Это Васкес, станция Голдстоун. Мне нужен директор Чен. Сейчас.

(пауза)

Да, я знаю который час. Скажите ему — у нас Сигнал.

РЕЗКАЯ СКЛЕЙКА:

INT. ШТАБ-КВАРТИРА NASA — КАБИНЕТ ДИРЕКТОРА — НОЧЬ

ДЖЕЙМС ЧЕН (58, седые волосы, очки для чтения) смотрит в экран ноутбука. Руки слегка дрожат. За ним, через панорамные окна, светится монумент Вашингтона.

Елена на видеозвонке, лицо в пикселях, но взгляд — горящий.

ЕЛЕНА
Повторяется каждые 47 секунд. Интервал — простое число. Частота водородной линии. Это не пульсар, Джеймс.

ЧЕН
Откуда идёт?

ЕЛЕНА
В том-то и дело. Не из космоса.

Долгая тишина.

ЧЕН
Что значит — не из космоса?

ЕЛЕНА
Сигнал идёт из-под дна океана. Тихоокеанская впадина. Глубина четыре тысячи метров.

Чен снимает очки. Трёт глаза. Надевает обратно.

ЧЕН
Я звоню президенту.

ПЕРЕХОД:

EXT. ТИХИЙ ОКЕАН — ДЕНЬ

С ВЫСОТЫ. Бесконечная синяя вода. Одинокое исследовательское судно «МЕРИДИАН» режет пологую волну.

ТИТР: "72 ЧАСА СПУСТЯ"

INT. «МЕРИДИАН» — ЛАБОРАТОРИЯ — ПРОДОЛЖЕНИЕ

Тесная, забитая оборудованием. Елена работает рядом с ДОКТОРОМ КОФИ АСАНТЕ (45, морской геолог, спокойная уверенность). На экранах — сонарные карты дна.

КОФИ
Ты понимаешь, что это меняет всё? Если там что-то рукотворное на такой глубине — оно старше любой известной цивилизации. Мы говорим о миллионах лет.

ЕЛЕНА
Я знаю, о чём мы говорим.

КОФИ
Правда? Потому что последние трое, кому я это рассказал, решили, что у меня нервный срыв.

Елена впервые улыбается. Улыбка меняет её лицо.

ЕЛЕНА
Кофи. Я три года слушала статику, надеясь именно на это. Я — последний человек, который решит, что ты сошёл с ума.

EXT. ТИХИЙ ОКЕАН — ПОЗЖЕ

«Меридиан» остановился. Краны опускают глубоководный аппарат «ОРФЕЙ» в воду. Его прожекторы прорезают темноту.

INT. «МЕРИДИАН» — ПУЛЬТ УПРАВЛЕНИЯ — ПРОДОЛЖЕНИЕ

Елена и Кофи смотрят в мониторы. Камеры аппарата показывают погружение: синий переходит в чёрный. Рыбы разбегаются от света.

СЧЁТЧИК ГЛУБИНЫ: 1 000 м... 2 000 м... 3 000 м...

КОФИ
Сигнал усиливается.

3 800 м. Дно океана. Ил. Камни. Древний осадок, не тронутый тысячелетиями.

А потом — что-то другое.

ЕЛЕНА
Боже мой.

На экране: идеальная геометрическая структура, вросшая в морское дно. Чёрная. Гладкая. Размером с футбольное поле. Не природная. Не возможная.

Она пульсирует слабым светом. Тот же ритм, что и сигнал.

КОФИ
(едва слышно)
Оно ждало.

Свет структуры усиливается. На каждом экране в комнате появляется одно и то же сообщение — не на одном из человеческих языков, но каким-то образом, невозможным образом, понятное:

МЫ СЛЫШАЛИ, ЧТО ВЫ НАС ИЩЕТЕ.

РЕЗКАЯ СКЛЕЙКА В ЧЁРНЫЙ.

ТИТР: «СИГНАЛ»`,

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
  { id: "pandora", label: "Люмос (Sci-Fi)" },
  { id: "signal", label: "Сигнал (Sci-Fi)" },
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
