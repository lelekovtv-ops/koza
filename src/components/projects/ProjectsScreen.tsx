"use client"

/**
 * ProjectsScreen — DaVinci-style project manager.
 * Grid of project cards. New Project = inline naming.
 */

import { useState, useCallback, useRef, useEffect } from "react"
import { Plus, Trash2, Search, LayoutGrid, List, Download } from "lucide-react"
import { useProjectsStore } from "@/store/projects"
import { getAccentColors } from "@/lib/themeColors"
import { KozaLogo } from "@/components/ui/KozaLogo"
import { ProjectCard } from "./ProjectCard"

interface ProjectsScreenProps {
  onOpenProject: (id: string) => void
  onNewProject: () => void
}

export function ProjectsScreen({ onOpenProject, onNewProject }: ProjectsScreenProps) {
  const { projects, createProject, deleteProject } = useProjectsStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const nameInputRef = useRef<HTMLInputElement>(null)

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  // Focus input when creating
  useEffect(() => {
    if (isCreating && nameInputRef.current) {
      nameInputRef.current.focus()
    }
  }, [isCreating])

  const handleStartCreate = useCallback(() => {
    setNewName("")
    setIsCreating(true)
  }, [])

  const handleConfirmCreate = useCallback(() => {
    const name = newName.trim() || "Untitled Project"
    createProject(name)
    setIsCreating(false)
    setNewName("")
  }, [newName, createProject])

  const handleCancelCreate = useCallback(() => {
    setIsCreating(false)
    setNewName("")
  }, [])

  const handleCreateKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        handleConfirmCreate()
      } else if (e.key === "Escape") {
        handleCancelCreate()
      }
    },
    [handleConfirmCreate, handleCancelCreate],
  )

  const handleDelete = useCallback(() => {
    if (!selectedId) return
    const name = projects.find((p) => p.id === selectedId)?.name
    if (confirm(`Удалить проект "${name}"?`)) {
      deleteProject(selectedId)
      setSelectedId(null)
    }
  }, [selectedId, projects, deleteProject])

  const handleDoubleClick = useCallback(
    (id: string) => onOpenProject(id),
    [onOpenProject],
  )

  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id))
  }, [])

  return (
    <div
      className="fixed inset-0 z-[210] flex flex-col"
      style={{
        background: "linear-gradient(180deg, #0D0C0A 0%, #151311 50%, #0D0C0A 100%)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-8 pt-6 pb-4">
        <KozaLogo size="md" variant="default" className="text-white/20" />

        <div className="flex items-center gap-3">
          {projects.length > 0 && (
            <>
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="h-8 w-48 rounded-md bg-white/5 pl-8 pr-3 text-xs text-white/70 outline-none border border-white/8 focus:border-white/20 placeholder:text-white/20 transition-colors"
                />
              </div>

              <div className="flex gap-0.5 rounded-md bg-white/5 p-0.5">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`rounded p-1.5 transition-colors ${viewMode === "grid" ? "bg-white/10 text-white/60" : "text-white/20 hover:text-white/40"}`}
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`rounded p-1.5 transition-colors ${viewMode === "list" ? "bg-white/10 text-white/60" : "text-white/20 hover:text-white/40"}`}
                >
                  <List size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Projects label */}
      <div className="px-8 pb-3">
        <span className="text-[11px] font-medium tracking-[0.2em] text-white/25">
          PROJECTS
        </span>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto px-8 pb-4">
        {filtered.length === 0 && !isCreating ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-6">
              <KozaLogo size="lg" variant="default" className="text-white/8 mb-2" />
              <div className="flex gap-4">
                <button
                  onClick={handleStartCreate}
                  className="flex w-52 flex-col items-center gap-3 rounded-2xl p-8 transition-all border border-white/8 hover:border-[#D4A853]/30 hover:bg-[#D4A853]/5"
                >
                  <Plus className="h-8 w-8 text-[#D4A853]/50" />
                  <span className="text-sm font-medium text-white/50">New Project</span>
                </button>
                <button
                  className="flex w-52 flex-col items-center gap-3 rounded-2xl p-8 transition-all border border-white/8 hover:border-white/15 hover:bg-white/3 opacity-40 cursor-not-allowed"
                  title="Coming soon"
                >
                  <Download className="h-8 w-8 text-white/25" />
                  <span className="text-sm font-medium text-white/30">Import Project</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-5">
            {/* New project card (inline creation) */}
            {isCreating && (
              <div className="group">
                <div
                  className="relative aspect-video rounded-lg overflow-hidden flex flex-col items-center justify-center gap-3"
                  style={{
                    border: "2px solid rgba(212, 168, 83, 0.4)",
                    background: "rgba(212, 168, 83, 0.05)",
                  }}
                >
                  <Plus size={24} className="text-[#D4A853]/40" />
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={handleCreateKeyDown}
                    onBlur={handleConfirmCreate}
                    placeholder="Project name..."
                    className="w-[80%] bg-transparent border-b border-[#D4A853]/30 text-center text-sm text-white/80 outline-none placeholder:text-white/20 pb-1"
                  />
                </div>
                <div className="mt-2 px-0.5 text-[10px] text-[#D4A853]/50 text-center">
                  Enter — создать · Esc — отмена
                </div>
              </div>
            )}

            {/* New project button as card (always visible in grid) */}
            {!isCreating && (
              <button
                onClick={handleStartCreate}
                className="group aspect-video rounded-lg flex flex-col items-center justify-center gap-2 transition-all border-2 border-dashed border-white/8 hover:border-[#D4A853]/30 hover:bg-[#D4A853]/5"
              >
                <Plus size={28} className="text-white/15 group-hover:text-[#D4A853]/50 transition-colors" />
                <span className="text-[11px] text-white/20 group-hover:text-[#D4A853]/50 tracking-wider transition-colors">
                  NEW PROJECT
                </span>
              </button>
            )}

            {/* Existing projects */}
            {filtered.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isSelected={selectedId === project.id}
                onClick={() => handleSelect(project.id)}
                onDoubleClick={() => handleDoubleClick(project.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div
        className="flex items-center justify-between px-8 py-4 border-t border-white/5"
        style={{ background: "rgba(13, 12, 10, 0.8)" }}
      >
        <div className="text-xs text-white/20">
          {projects.length} {projects.length === 1 ? "project" : "projects"}
        </div>

        <div className="flex items-center gap-2">
          {selectedId && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-xs text-white/30 hover:bg-red-500/20 hover:text-red-400 transition-colors border border-white/5 hover:border-red-500/30"
            >
              <Trash2 size={12} />
              Delete
            </button>
          )}

          <button
            onClick={handleStartCreate}
            className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium tracking-wider transition-all border"
            style={{
              background: `linear-gradient(180deg, ${getAccentColors().glowGradient(0.15)} 0%, ${getAccentColors().glowGradient(0.08)} 100%)`,
              borderColor: getAccentColors().accent25,
              color: getAccentColors().accent,
            }}
          >
            <Plus size={13} />
            New Project
          </button>

          {selectedId && (
            <button
              onClick={() => onOpenProject(selectedId)}
              className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium tracking-wider transition-all border"
              style={{
                background: `linear-gradient(180deg, ${getAccentColors().glowGradient(0.25)} 0%, ${getAccentColors().glowGradient(0.12)} 100%)`,
                borderColor: getAccentColors().accent40,
                color: getAccentColors().accent,
              }}
            >
              Open
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
