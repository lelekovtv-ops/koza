"use client"

import { useState, useMemo, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft, Camera, Check, CheckCircle2, Circle, Clipboard, Clock,
  Copy, Film, Link2, MessageSquare, Palette, Share2, Sparkles,
  User, Users, Video, Clapperboard, MapPin, ChevronDown, ChevronRight,
  Package, Eye,
} from "lucide-react"
import { useTimelineStore } from "@/store/timeline"
import { useBibleStore } from "@/store/bible"
import { useScenesStore } from "@/store/scenes"
import { useBoardStore } from "@/store/board"
import { useNavigationStore } from "@/store/navigation"

// ─── Types ───

type Role = "all" | "operator" | "art" | "actors" | "producer"
type TaskStatus = "planned" | "in_progress" | "done"

interface ProductionTask {
  id: string
  sceneId: string
  shotId?: string
  role: Role
  title: string
  description: string
  status: TaskStatus
  assignee?: string
}

// ─── Role Config ───

const ROLES: { id: Role; label: string; icon: React.ReactNode; color: string; description: string }[] = [
  { id: "all", label: "Все", icon: <Users size={14} />, color: "#E5E0DB", description: "Общий вид производства" },
  { id: "operator", label: "Оператор", icon: <Camera size={14} />, color: "#67E8F9", description: "Раскадровка, техника, порядок съёмки" },
  { id: "art", label: "Художник", icon: <Palette size={14} />, color: "#86EFAC", description: "Референсы, локации, реквизит, костюмы" },
  { id: "actors", label: "Актёры", icon: <User size={14} />, color: "#FDE68A", description: "Сцены, диалоги, эмоции" },
  { id: "producer", label: "Продюсер", icon: <Clipboard size={14} />, color: "#F9A8D4", description: "Сроки, общий план, согласования" },
]

// ─── Task Generator (from existing data) ───

function generateTasks(
  scenes: { id: string; title: string }[],
  shots: { id: string; sceneId: string | null; label: string; shotSize: string; cameraMotion: string; cameraNote: string; directorNote: string; thumbnailUrl: string | null; notes: string }[],
  characters: { id: string; name: string; sceneIds: string[] }[],
  locations: { id: string; name: string; intExt: string; sceneIds: string[] }[],
): ProductionTask[] {
  const tasks: ProductionTask[] = []
  let idx = 0

  for (const scene of scenes) {
    const sceneShots = shots.filter((s) => s.sceneId === scene.id)
    const sceneChars = characters.filter((c) => c.sceneIds.includes(scene.id))
    const sceneLocs = locations.filter((l) => l.sceneIds.includes(scene.id))

    // Operator tasks
    if (sceneShots.length > 0) {
      tasks.push({
        id: `task-${idx++}`,
        sceneId: scene.id,
        role: "operator",
        title: `Раскадровка: ${scene.title}`,
        description: `${sceneShots.length} кадров. ${sceneShots.map((s) => `${s.shotSize || "?"} — ${s.cameraMotion || "статика"}`).join(", ")}`,
        status: sceneShots.every((s) => s.thumbnailUrl) ? "done" : sceneShots.some((s) => s.thumbnailUrl) ? "in_progress" : "planned",
      })
    }

    for (const shot of sceneShots) {
      if (shot.cameraNote) {
        tasks.push({
          id: `task-${idx++}`,
          sceneId: scene.id,
          shotId: shot.id,
          role: "operator",
          title: `${shot.shotSize || "Shot"}: ${shot.label}`,
          description: shot.cameraNote,
          status: shot.thumbnailUrl ? "done" : "planned",
        })
      }
    }

    // Art tasks
    for (const loc of sceneLocs) {
      tasks.push({
        id: `task-${idx++}`,
        sceneId: scene.id,
        role: "art",
        title: `Локация: ${loc.name}`,
        description: `${loc.intExt}. Подготовить площадку, декорации, реквизит.`,
        status: "planned",
      })
    }

    if (sceneChars.length > 0) {
      tasks.push({
        id: `task-${idx++}`,
        sceneId: scene.id,
        role: "art",
        title: `Костюмы: ${scene.title}`,
        description: `Персонажи: ${sceneChars.map((c) => c.name).join(", ")}`,
        status: "planned",
      })
    }

    // Actor tasks
    for (const char of sceneChars) {
      tasks.push({
        id: `task-${idx++}`,
        sceneId: scene.id,
        role: "actors",
        title: `${char.name}: ${scene.title}`,
        description: `Подготовка к сцене. ${sceneShots.length} кадров.`,
        status: "planned",
      })
    }

    // Producer tasks
    tasks.push({
      id: `task-${idx++}`,
      sceneId: scene.id,
      role: "producer",
      title: `Согласование: ${scene.title}`,
      description: `${sceneShots.length} кадров, ${sceneChars.length} персонажей, ${sceneLocs.length} локаций`,
      status: "planned",
    })
  }

  return tasks
}

// ─── Components ───

function StatusBadge({ status, onClick }: { status: TaskStatus; onClick?: () => void }) {
  const config = {
    planned: { icon: <Circle size={14} />, label: "План", bg: "bg-white/5", text: "text-white/40" },
    in_progress: { icon: <Clock size={14} />, label: "В работе", bg: "bg-amber-500/10", text: "text-amber-300" },
    done: { icon: <CheckCircle2 size={14} />, label: "Готово", bg: "bg-emerald-500/10", text: "text-emerald-300" },
  }[status]

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors hover:brightness-125 ${config.bg} ${config.text}`}
    >
      {config.icon}
      {config.label}
    </button>
  )
}

function TaskCard({ task, onStatusChange }: { task: ProductionTask; onStatusChange: (status: TaskStatus) => void }) {
  const nextStatus: TaskStatus = task.status === "planned" ? "in_progress" : task.status === "in_progress" ? "done" : "planned"
  const roleConfig = ROLES.find((r) => r.id === task.role)

  return (
    <div className="group flex items-start gap-3 rounded-xl border border-white/6 bg-white/[0.02] p-3.5 transition-colors hover:bg-white/[0.04]">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${roleConfig?.color}15`, color: roleConfig?.color }}>
        {roleConfig?.icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-white/85">{task.title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-white/35">{task.description}</p>
      </div>
      <StatusBadge status={task.status} onClick={() => onStatusChange(nextStatus)} />
    </div>
  )
}

function SceneCallSheet({
  scene,
  shots,
  characters,
  locations,
  expanded,
  onToggle,
}: {
  scene: { id: string; title: string; color: string }
  shots: { id: string; sceneId: string | null; label: string; shotSize: string; cameraMotion: string; thumbnailUrl: string | null }[]
  characters: { id: string; name: string; appearancePrompt: string; generatedPortraitUrl: string | null; sceneIds: string[] }[]
  locations: { id: string; name: string; intExt: string; appearancePrompt: string; generatedImageUrl: string | null; sceneIds: string[] }[]
  expanded: boolean
  onToggle: () => void
}) {
  const sceneShots = shots.filter((s) => s.sceneId === scene.id)
  const sceneChars = characters.filter((c) => c.sceneIds.includes(scene.id))
  const sceneLocs = locations.filter((l) => l.sceneIds.includes(scene.id))

  return (
    <div className="overflow-hidden rounded-xl border border-white/6 bg-white/[0.02]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
      >
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: scene.color }} />
        <span className="flex-1 text-[13px] text-white/80">{scene.title}</span>
        <span className="text-[10px] text-white/30">{sceneShots.length} кадров · {sceneChars.length} перс. · {sceneLocs.length} лок.</span>
        {expanded ? <ChevronDown size={14} className="text-white/30" /> : <ChevronRight size={14} className="text-white/30" />}
      </button>

      {expanded && (
        <div className="border-t border-white/5 px-4 py-3 space-y-4">
          {/* Shots grid */}
          {sceneShots.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-white/25">Раскадровка</p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                {sceneShots.map((shot, i) => (
                  <div key={shot.id} className="overflow-hidden rounded-lg border border-white/8">
                    <div className="relative bg-[#0E1014]" style={{ aspectRatio: "16/9" }}>
                      {shot.thumbnailUrl ? (
                        <Image src={shot.thumbnailUrl} alt="" fill unoptimized className="object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[9px] text-white/15">{i + 1}</div>
                      )}
                    </div>
                    <div className="px-1.5 py-1">
                      <p className="truncate text-[9px] text-white/50">{shot.shotSize || "Shot"} · {shot.cameraMotion || "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Characters */}
          {sceneChars.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-white/25">Персонажи</p>
              <div className="flex flex-wrap gap-2">
                {sceneChars.map((char) => (
                  <div key={char.id} className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-1.5">
                    {char.generatedPortraitUrl ? (
                      <Image src={char.generatedPortraitUrl} alt="" width={24} height={24} unoptimized className="h-6 w-6 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/15 text-[9px] text-sky-300">{char.name[0]}</div>
                    )}
                    <span className="text-[12px] text-white/70">{char.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Locations */}
          {sceneLocs.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-white/25">Локации</p>
              <div className="flex flex-wrap gap-2">
                {sceneLocs.map((loc) => (
                  <div key={loc.id} className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-1.5">
                    {loc.generatedImageUrl ? (
                      <Image src={loc.generatedImageUrl} alt="" width={24} height={24} unoptimized className="h-6 w-6 rounded object-cover" />
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded bg-emerald-500/15 text-[9px] text-emerald-300"><MapPin size={10} /></div>
                    )}
                    <span className="text-[12px] text-white/70">{loc.name}</span>
                    <span className="text-[10px] text-white/25">{loc.intExt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Share Panel ───

function SharePanel({ role }: { role: Role }) {
  const [copied, setCopied] = useState(false)
  const roleConfig = ROLES.find((r) => r.id === role)
  const mockLink = `koza.app/share/${role}-${Date.now().toString(36)}`

  const handleCopy = () => {
    navigator.clipboard.writeText(mockLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Share2 size={14} className="text-white/40" />
        <span className="text-[12px] text-white/60">Поделиться с {roleConfig?.label || "командой"}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] text-white/50 truncate">
          {mockLink}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-lg bg-[#D4A853]/20 border border-[#D4A853]/30 px-3 py-2 text-[11px] text-[#E6C887] transition-colors hover:bg-[#D4A853]/30"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
      <p className="mt-2 text-[10px] text-white/25">Получатель увидит только задачи для роли "{roleConfig?.label}". Только чтение + комментарии.</p>
    </div>
  )
}

// ─── Stats ───

function StatsBar({ tasks }: { tasks: ProductionTask[] }) {
  const planned = tasks.filter((t) => t.status === "planned").length
  const inProgress = tasks.filter((t) => t.status === "in_progress").length
  const done = tasks.filter((t) => t.status === "done").length
  const total = tasks.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="flex items-center gap-4 rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3">
      <div className="flex-1">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] text-white/40">Прогресс производства</span>
          <span className="text-[13px] font-medium text-white/70">{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
          <div className="h-full rounded-full bg-[#D4A853] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="flex gap-3 text-[11px]">
        <span className="text-white/30">{planned} план</span>
        <span className="text-amber-300/60">{inProgress} в работе</span>
        <span className="text-emerald-300/60">{done} готово</span>
      </div>
    </div>
  )
}

// ─── Main Page ───

export default function ProductionPage() {
  const shots = useTimelineStore((s) => s.shots)
  const scenes = useScenesStore((s) => s.scenes)
  const characters = useBibleStore((s) => s.characters)
  const locations = useBibleStore((s) => s.locations)

  const activeRole = useNavigationStore((s) => s.productionRole) as Role
  const setActiveRole = useNavigationStore((s) => s.setProductionRole)
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set())
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({})

  const allTasks = useMemo(
    () => generateTasks(scenes, shots as never, characters, locations),
    [scenes, shots, characters, locations],
  )

  const tasks = useMemo(() => {
    return allTasks
      .map((t) => ({ ...t, status: taskStatuses[t.id] || t.status }))
      .filter((t) => activeRole === "all" || t.role === activeRole)
  }, [allTasks, activeRole, taskStatuses])

  const handleStatusChange = useCallback((taskId: string, status: TaskStatus) => {
    setTaskStatuses((prev) => ({ ...prev, [taskId]: status }))
  }, [])

  const toggleScene = useCallback((sceneId: string) => {
    setExpandedScenes((prev) => {
      const next = new Set(prev)
      next.has(sceneId) ? next.delete(sceneId) : next.add(sceneId)
      return next
    })
  }, [])

  const tasksByScene = useMemo(() => {
    const map = new Map<string, ProductionTask[]>()
    for (const task of tasks) {
      const list = map.get(task.sceneId) || []
      list.push(task)
      map.set(task.sceneId, list)
    }
    return map
  }, [tasks])

  return (
    <div className="min-h-screen bg-[#0B0C10] text-white">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#0B0C10]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
          <Link
            href="/"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/50 transition-colors hover:bg-white/5"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="flex-1">
            <h1 className="text-sm font-medium text-white/90">Production</h1>
            <p className="text-[11px] text-white/30">{scenes.length} сцен · {shots.length} кадров · {characters.length} персонажей</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-white/50 transition-colors hover:bg-white/5">
              <MessageSquare size={12} />
              Jenkins Bot
            </button>
          </div>
        </div>

        {/* Role tabs */}
        <div className="mx-auto flex max-w-6xl gap-1 px-6 pb-3">
          {ROLES.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => setActiveRole(role.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] transition-colors ${
                activeRole === role.id
                  ? "bg-white/10 text-white"
                  : "text-white/35 hover:text-white/55 hover:bg-white/[0.03]"
              }`}
            >
              {role.icon}
              {role.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6 space-y-6">
        {/* Stats */}
        <StatsBar tasks={tasks} />

        {/* Share panel */}
        {activeRole !== "all" && <SharePanel role={activeRole} />}

        {/* Call Sheets (scene-based view) */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[11px] uppercase tracking-[0.16em] text-white/30">
              {activeRole === "all" ? "Сцены и материалы" : `Call Sheet: ${ROLES.find((r) => r.id === activeRole)?.label}`}
            </h2>
          </div>

          <div className="space-y-2">
            {scenes.map((scene) => (
              <SceneCallSheet
                key={scene.id}
                scene={scene}
                shots={shots}
                characters={characters as never}
                locations={locations as never}
                expanded={expandedScenes.has(scene.id)}
                onToggle={() => toggleScene(scene.id)}
              />
            ))}
          </div>
        </div>

        {/* Task Board */}
        <div>
          <h2 className="mb-3 text-[11px] uppercase tracking-[0.16em] text-white/30">Задачи</h2>

          {scenes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Clapperboard size={32} className="mb-3 text-white/10" />
              <p className="text-[13px] text-white/30">Нет сцен. Напишите сценарий и запустите брейкдаун.</p>
              <Link href="/" className="mt-3 text-[12px] text-[#D4A853]/60 hover:text-[#D4A853] transition-colors">
                ← Вернуться в студию
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {scenes.map((scene) => {
                const sceneTasks = tasksByScene.get(scene.id)
                if (!sceneTasks?.length) return null

                return (
                  <div key={scene.id}>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: scene.color }} />
                      <span className="text-[11px] text-white/40">{scene.title}</span>
                      <span className="text-[10px] text-white/20">{sceneTasks.length} задач</span>
                    </div>
                    <div className="space-y-1.5">
                      {sceneTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onStatusChange={(status) => handleStatusChange(task.id, status)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
