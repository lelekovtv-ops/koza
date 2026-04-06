"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { X, ChevronDown, ChevronRight, Trash2, Eye, EyeOff, ArrowDown, Bug, GripHorizontal } from "lucide-react"
import { useDevLogStore } from "@/store/devlog"
import { usePathname, useRouter } from "next/navigation"
import { getAccentColors } from "@/lib/themeColors"
import type { LogEntry, LogEntryType } from "@/store/devlog"

/* ─── Russian labels for pipeline stages ─── */

const STAGE_LABELS: Record<string, string> = {
  breakdown_start: "Запуск разбивки сцены",
  breakdown_prompt: "Системный промпт для этапа",
  breakdown_request: "Запрос к модели",
  breakdown_response: "Ответ от модели",
  breakdown_result: "Результат этапа",
  breakdown_scene_analysis: "Анализ сцены",
  breakdown_action_split: "Разбивка действий",
  breakdown_context_router: "Маршрутизация контекста",
  breakdown_creative_plan: "Креативный план",
  breakdown_censor: "Цензурная проверка",
  breakdown_shot_plan: "Планирование кадров",
  breakdown_continuity_memory: "Память непрерывности",
  breakdown_continuity_risks: "Риски непрерывности",
  breakdown_continuity_enriched: "Обогащение кадров",
  breakdown_shot_relations: "Связи между кадрами",
  breakdown_prompt_compose: "Компоновка промпта",
  breakdown_error: "Ошибка разбивки",
  image_start: "Запуск генерации изображения",
  image_prompt: "Промпт для генерации",
  image_bible_inject: "Инъекция персонажей из Библии",
  image_style_inject: "Применение визуального стиля",
  image_api_call: "Вызов API генерации",
  image_result: "Результат генерации",
  image_error: "Ошибка генерации",
  bible_sync: "Синхронизация Библии",
  scene_parse: "Парсинг сцены",
  prompt_build: "Построение промпта",
  info: "Информация",
  warning: "Предупреждение",
  error: "Ошибка",
}

const STAGE_DESCRIPTIONS: Record<string, string> = {
  breakdown_start: "Система начинает разбивку текста сцены на кадры (shots)",
  breakdown_prompt: "Формируется системный промпт для ИИ-модели — направляющие правила для анализа",
  breakdown_request: "Текст сценария отправляется модели для анализа",
  breakdown_response: "Получен сырой ответ от модели (JSON с кадрами)",
  breakdown_scene_analysis: "Scene Analyst анализирует сцену: определяет биты, эмоции, персонажей",
  breakdown_action_split: "Action Splitter разбивает сцену на действия / движения",
  breakdown_context_router: "Context Router определяет тип сцены и выбирает стратегию",
  breakdown_creative_plan: "Creative Planner создает художественный план съемки",
  breakdown_censor: "Цензор проверяет контент на допустимость",
  breakdown_shot_plan: "Shot Planner создает конкретный список кадров с параметрами",
  breakdown_continuity_memory: "Система запоминает визуальные детали для непрерывности",
  breakdown_continuity_risks: "Обнаружены возможные нарушения непрерывности",
  breakdown_continuity_enriched: "Кадры обогащены данными непрерывности",
  breakdown_shot_relations: "Определены связи между кадрами (переходы, ритм)",
  breakdown_prompt_compose: "Финальная компоновка текстового промпта для изображения",
  breakdown_error: "Произошла ошибка на одном из этапов разбивки",
  image_start: "Запущен процесс генерации изображения для кадра",
  image_prompt: "Сформирован финальный промпт для генерации картинки",
  image_bible_inject: "Из Библии подтянуты референсы персонажей (лица, внешность)",
  image_style_inject: "Добавлен визуальный стиль проекта (Film Noir, Color Noir и т.д.)",
  image_api_call: "Промпт + референсы отправлены на API генерации (nano-banana / gpt-image)",
  image_result: "Изображение успешно сгенерировано и сохранено",
  image_error: "Ошибка при генерации изображения",
  bible_sync: "Библия персонажей и локаций синхронизирована со сценарием",
  scene_parse: "Текст сценария разобран на сцены и блоки",
  prompt_build: "Построен промпт из данных кадра + Библии + стиля",
}

function typeColor(type: LogEntryType): string {
  if (type.startsWith("breakdown_")) return type.includes("error") ? "#E57373" : "#DCC7A3"
  if (type.startsWith("image_")) return type.includes("error") ? "#E57373" : "#81C784"
  if (type === "bible_sync" || type === "scene_parse") return "#CE93D8"
  if (type === "error") return "#E57373"
  if (type === "warning") return "#FFB74D"
  return "#90A4AE"
}

function typeBadgeBg(type: LogEntryType): string {
  if (type.startsWith("breakdown_")) return type.includes("error") ? "bg-red-500/15" : "bg-[#DCC7A3]/15"
  if (type.startsWith("image_")) return type.includes("error") ? "bg-red-500/15" : "bg-green-500/15"
  if (type === "bible_sync" || type === "scene_parse") return "bg-purple-500/15"
  if (type === "error") return "bg-red-500/15"
  if (type === "warning") return "bg-orange-500/15"
  return "bg-white/10"
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 1000) return "только что"
  if (diff < 60000) return `${Math.floor(diff / 1000)}с назад`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}м назад`
  return formatTimestamp(ts)
}

/* ─── Single log entry row ─── */

function EntryRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const color = typeColor(entry.type)
  const label = STAGE_LABELS[entry.type] || entry.type
  const desc = STAGE_DESCRIPTIONS[entry.type]

  let parsedDetails: object | null = null
  if (entry.details) {
    try { parsedDetails = JSON.parse(entry.details) } catch { /* plain text */ }
  }

  return (
    <div className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 px-4 py-2.5 text-left"
      >
        <span className="mt-0.5 flex-shrink-0 text-white/30">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${typeBadgeBg(entry.type)}`} style={{ color }}>{label}</span>
            <span className="text-[10px] text-white/25">{formatRelativeTime(entry.timestamp)}</span>
          </div>
          <p className="mt-0.5 truncate text-[12px] text-white/60">{entry.title}</p>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.03] bg-white/[0.015] px-4 py-3 pl-12">
          {desc && <p className="mb-2 text-[11px] leading-relaxed text-white/40 italic">{desc}</p>}
          <div className="mb-2">
            <span className="text-[10px] uppercase tracking-wider text-white/25">Заголовок</span>
            <p className="mt-0.5 text-[12px] text-white/70">{entry.title}</p>
          </div>
          {entry.details && (
            <div className="mb-2">
              <span className="text-[10px] uppercase tracking-wider text-white/25">Детали</span>
              {parsedDetails ? (
                <pre className="mt-1 max-h-[300px] overflow-auto rounded-lg border border-white/[0.06] bg-black/30 p-2 text-[11px] leading-relaxed text-white/60">
                  {JSON.stringify(parsedDetails, null, 2)}
                </pre>
              ) : (
                <pre className="mt-1 max-h-[300px] overflow-auto whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/30 p-2 text-[11px] leading-relaxed text-white/60">
                  {entry.details.length > 3000 ? entry.details.slice(0, 3000) + "\n\n… (обрезано)" : entry.details}
                </pre>
              )}
            </div>
          )}
          {entry.meta && Object.keys(entry.meta).length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-white/25">Мета-данные</span>
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(entry.meta).map(([key, val]) => (
                  <div key={key} className="flex items-baseline gap-2">
                    <span className="text-[11px] text-white/30">{key}:</span>
                    <span className="text-[11px] text-white/60">{typeof val === "object" ? JSON.stringify(val) : String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {entry.group && <div className="mt-2 text-[10px] text-white/20">Группа: {entry.group}</div>}
          <div className="mt-1 text-[10px] text-white/20">{formatTimestamp(entry.timestamp)}</div>
        </div>
      )}
    </div>
  )
}

/* ─── Group header ─── */

function GroupBlock({ groupId, entries }: { groupId: string; entries: LogEntry[] }) {
  const [collapsed, setCollapsed] = useState(false)
  const firstEntry = entries[entries.length - 1]
  const hasError = entries.some((e) => e.type.includes("error"))
  const stageCount = new Set(entries.map((e) => e.type)).size

  let groupLabel = groupId
  if (groupId.startsWith("breakdown-")) groupLabel = "Разбивка сцены"
  else if (groupId.startsWith("image-")) groupLabel = "Генерация изображения"

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2 border-b border-white/[0.06] bg-white/[0.03] px-4 py-2 text-left"
      >
        <span className="text-white/30">{collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</span>
        <span className={`h-1.5 w-1.5 rounded-full ${hasError ? "bg-red-400" : "bg-[#DCC7A3]/60"}`} />
        <span className="text-[11px] font-medium text-white/50">{groupLabel}</span>
        <span className="text-[10px] text-white/20">{entries.length} шагов · {stageCount} этапов</span>
        <span className="ml-auto text-[10px] text-white/20">{formatRelativeTime(firstEntry.timestamp)}</span>
      </button>
      {!collapsed && entries.map((e) => <EntryRow key={e.id} entry={e} />)}
    </div>
  )
}

/* ─── Filter tabs ─── */

type FilterKey = "all" | "breakdown" | "image" | "other"

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Всё" },
  { key: "breakdown", label: "Разбивка" },
  { key: "image", label: "Генерация" },
  { key: "other", label: "Другое" },
]

function matchesFilter(e: LogEntry, f: FilterKey): boolean {
  if (f === "all") return true
  if (f === "breakdown") return e.type.startsWith("breakdown_")
  if (f === "image") return e.type.startsWith("image_") || e.type === "prompt_build"
  return !e.type.startsWith("breakdown_") && !e.type.startsWith("image_")
}

/* ─── Draggable hook ─── */

function useDraggable(initialPos: { x: number; y: number }) {
  const [pos, setPos] = useState(initialPos)
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y }

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      setPos({ x: dragRef.current.originX + dx, y: dragRef.current.originY + dy })
    }

    const onUp = () => {
      dragRef.current = null
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }, [pos])

  return { pos, onMouseDown, setPos }
}

/* ─── Main Inspector + DEV Button (combined) ─── */

export function DevInspector() {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<FilterKey>("all")
  const [autoScroll, setAutoScroll] = useState(true)
  const entries = useDevLogStore((s) => s.entries)
  const enabled = useDevLogStore((s) => s.enabled)
  const setEnabled = useDevLogStore((s) => s.setEnabled)
  const clear = useDevLogStore((s) => s.clear)
  const listRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(entries.length)
  const router = useRouter()
  const pathname = usePathname()
  const hasErrors = entries.some((e) => e.type.includes("error"))

  // Draggable toggle button — position set after mount to avoid hydration mismatch
  const [mounted, setMounted] = useState(false)
  const { pos: btnPos, onMouseDown: onBtnDrag, setPos: setBtnPos } = useDraggable({ x: 0, y: 0 })
  useEffect(() => {
    setBtnPos({ x: window.innerWidth - 120, y: window.innerHeight - 48 })
    setMounted(true)
  }, [])

  useEffect(() => {
    if (autoScroll && entries.length > prevCountRef.current && listRef.current) {
      listRef.current.scrollTop = 0
    }
    prevCountRef.current = entries.length
  }, [entries.length, autoScroll])

  const filtered = entries.filter((e) => matchesFilter(e, filter))

  const grouped = useCallback(() => {
    const groups: { id: string; entries: LogEntry[] }[] = []
    const seen = new Map<string, number>()
    const result: Array<{ type: "group"; id: string; entries: LogEntry[] } | { type: "entry"; entry: LogEntry }> = []

    for (const entry of filtered) {
      if (entry.group) {
        const idx = seen.get(entry.group)
        if (idx !== undefined) {
          groups[idx].entries.push(entry)
        } else {
          seen.set(entry.group, groups.length)
          groups.push({ id: entry.group, entries: [entry] })
        }
      }
    }

    const allItems = [
      ...groups.map((g) => ({ kind: "g" as const, ts: g.entries[0].timestamp, data: g })),
      ...filtered.filter((e) => !e.group).map((e) => ({ kind: "e" as const, ts: e.timestamp, data: e })),
    ].sort((a, b) => b.ts - a.ts)

    for (const item of allItems) {
      if (item.kind === "g") result.push({ type: "group", ...(item.data as { id: string; entries: LogEntry[] }) })
      else result.push({ type: "entry", entry: item.data as LogEntry })
    }
    return result
  }, [filtered])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "I") { e.preventDefault(); setOpen((p) => !p) }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const items = grouped()

  if (process.env.NODE_ENV !== "development") return null

  return (
    <>
      {/* Draggable floating button: Inspector + DEV */}
      <div
        className="fixed z-[9998] flex items-center gap-0.5 rounded-2xl px-1.5 py-1 transition-opacity duration-300"
        style={{
          left: btnPos.x,
          top: btnPos.y,
          transform: "translate(-50%, -50%)",
          opacity: mounted ? 1 : 0,
          background: "linear-gradient(135deg, rgba(20,18,16,0.92) 0%, rgba(30,26,22,0.88) 100%)",
          backdropFilter: "blur(20px) saturate(1.5)",
          border: `1px solid ${getAccentColors().accent15}`,
          boxShadow: `0 4px 24px rgba(0,0,0,0.5), 0 0 1px ${getAccentColors().accent20}, inset 0 1px 0 rgba(255,255,255,0.04)`,
        }}
      >
        {/* Drag handle */}
        <div
          onMouseDown={onBtnDrag}
          className="flex items-center justify-center w-7 h-7 cursor-grab active:cursor-grabbing rounded-lg hover:bg-white/5 transition-colors"
        >
          <GripHorizontal size={11} className="text-[#D4A853]/30" />
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-white/8" />

        {/* Inspector button */}
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10px] font-semibold tracking-[0.15em] transition-all ${
            open
              ? "bg-[#D4A853]/20 text-[#D4A853] shadow-[0_0_12px_rgba(212,168,83,0.15)]"
              : "text-white/35 hover:text-[#D4A853]/70 hover:bg-[#D4A853]/8"
          }`}
        >
          <Eye size={11} />
          INSPECTOR
          {entries.length > 0 && (
            <span
              className="min-w-[18px] text-center rounded-full px-1.5 py-0.5 text-[8px] font-bold"
              style={{
                background: open ? getAccentColors().accent25 : "rgba(255,255,255,0.08)",
                color: open ? getAccentColors().accent : "rgba(255,255,255,0.4)",
              }}
            >
              {entries.length}
            </span>
          )}
        </button>

        {/* Divider */}
        <div className="w-px h-4 bg-white/8" />

        {/* DEV button */}
        {pathname !== "/dev" && (
          <button
            onClick={() => router.push(`/dev?from=${encodeURIComponent(pathname)}`)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10px] font-semibold tracking-[0.15em] transition-all ${
              hasErrors
                ? "text-red-400 hover:bg-red-500/10"
                : "text-white/35 hover:text-emerald-400/70 hover:bg-emerald-500/8"
            }`}
          >
            <Bug size={11} />
            DEV
            {entries.length > 0 && (
              <span
                className="min-w-[18px] text-center rounded-full px-1.5 py-0.5 text-[8px] font-bold"
                style={{
                  background: hasErrors ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)",
                  color: hasErrors ? "#f87171" : "rgba(255,255,255,0.4)",
                }}
              >
                {entries.length > 99 ? "99+" : entries.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Panel */}
      {open && (
        <div
          className="fixed inset-x-0 bottom-0 z-[9999] flex flex-col border-t border-white/[0.08] bg-[#0a0a0a]/95 backdrop-blur-2xl"
          style={{ height: "75vh", animation: "inspectorSlideUp 0.3s cubic-bezier(0.16,1,0.3,1)" }}
        >
          <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-3">
            <div className="flex items-center gap-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Pipeline Inspector</h2>
              <div className="flex gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={`rounded-md px-2.5 py-1 text-[10px] transition-colors ${filter === f.key ? "bg-white/10 text-white/80" : "text-white/30 hover:text-white/50"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-white/20">{filtered.length} записей</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setEnabled(!enabled)} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] uppercase tracking-[0.1em] transition-colors ${enabled ? "bg-green-500/10 text-green-400/70" : "bg-white/5 text-white/30"}`}>
                {enabled ? <Eye size={11} /> : <EyeOff size={11} />}
                {enabled ? "Запись вкл" : "Запись выкл"}
              </button>
              <button type="button" onClick={() => setAutoScroll(!autoScroll)} className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] transition-colors ${autoScroll ? "bg-[#DCC7A3]/10 text-[#DCC7A3]/70" : "bg-white/5 text-white/30"}`}>
                <ArrowDown size={11} />Авто
              </button>
              <button type="button" onClick={clear} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] text-white/30 transition-colors hover:bg-white/5 hover:text-white/50">
                <Trash2 size={11} />Очистить
              </button>
              <button type="button" onClick={() => setOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/5 hover:text-white/60">
                <X size={14} />
              </button>
            </div>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-white/20">
                <Eye size={32} className="opacity-30" />
                <p className="text-sm">Нет событий</p>
                <p className="text-[11px]">{enabled ? "Запустите разбивку или генерацию — события появятся здесь" : "Включите запись (кнопка «Запись вкл»)"}</p>
              </div>
            ) : (
              items.map((item, i) =>
                item.type === "group" ? <GroupBlock key={item.id} groupId={item.id} entries={item.entries} /> : <EntryRow key={item.entry.id} entry={item.entry} />
              )
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes inspectorSlideUp {
          from { transform: translateY(100%); opacity: 0.8 }
          to { transform: translateY(0); opacity: 1 }
        }
      `}</style>
    </>
  )
}
