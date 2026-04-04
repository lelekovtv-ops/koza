"use client"

import { StoryboardPanel } from "@/components/editor/screenplay/StoryboardPanel"
import { useRouter } from "next/navigation"
import { useCallback, useRef, useState } from "react"
import { useSyncOrchestrator } from "@/hooks/useSyncOrchestrator"
import { useProjectsStore } from "@/store/projects"
import { useScriptStore } from "@/store/script"
import { useTimelineStore } from "@/store/timeline"
import { useBibleStore } from "@/store/bible"
import { importFromFile } from "@/lib/importPipeline"
import { FilePlus2, FolderOpen, Upload, Trash2, Clock, PenLine, ArrowRight } from "lucide-react"
import { exportBlocksToText, parseTextToBlocks } from "@/lib/screenplayFormat"

export default function StudioPage() {
  const router = useRouter()
  const projects = useProjectsStore((s) => s.projects)
  const activeProjectId = useProjectsStore((s) => s.activeProjectId)
  const createProject = useProjectsStore((s) => s.createProject)
  const openProject = useProjectsStore((s) => s.openProject)
  const deleteProject = useProjectsStore((s) => s.deleteProject)
  const closeProject = useProjectsStore((s) => s.closeProject)
  const setActiveScriptProject = useScriptStore((s) => s.setActiveProject)
  const setActiveTimelineProject = useTimelineStore((s) => s.setActiveProject)
  const setActiveBibleProject = useBibleStore((s) => s.setActiveProject)
  const blocks = useScriptStore((s) => s.blocks)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteText, setPasteText] = useState("")

  // Is the project "empty"? (only default empty action block)
  const isEmpty = !activeProjectId || (blocks.length <= 1 && !blocks[0]?.text?.trim())

  // Check if Scriptwriter has content (scratchpad = root state when no project active)
  const scratchpadHasContent = useScriptStore((s) => {
    // Root blocks (not project-specific) have content
    const rootBlocks = s.blocks
    if (s.activeProjectId) return false // currently in a project, can't read scratchpad
    return rootBlocks.length > 1 || (rootBlocks.length === 1 && !!rootBlocks[0]?.text?.trim())
  })

  const activateProject = useCallback((id: string) => {
    openProject(id)
    setActiveScriptProject(id)
    setActiveTimelineProject(id)
    setActiveBibleProject(id)
  }, [openProject, setActiveScriptProject, setActiveTimelineProject, setActiveBibleProject])

  const handleCreate = useCallback(() => {
    const id = createProject("Untitled PIECE")
    setActiveScriptProject(id)
    setActiveTimelineProject(id)
    setActiveBibleProject(id)
  }, [createProject, setActiveScriptProject, setActiveTimelineProject, setActiveBibleProject])

  const handleImport = useCallback(async (file: File) => {
    const result = await importFromFile(file)
    const name = result.title || file.name.replace(/\.\w+$/, "") || "Imported PIECE"
    const id = createProject(name)
    setActiveScriptProject(id)
    setActiveTimelineProject(id)
    setActiveBibleProject(id)
    useScriptStore.getState().setBlocks(result.blocks)
    if (result.title) useScriptStore.getState().setTitle(result.title)
  }, [createProject, setActiveScriptProject, setActiveTimelineProject, setActiveBibleProject])

  const handleImportFromScriptwriter = useCallback(() => {
    // Read scratchpad blocks from root state (activeProjectId must be null)
    const state = useScriptStore.getState()
    // Temporarily switch to null to read scratchpad
    const prevProjectId = state.activeProjectId
    if (prevProjectId) state.setActiveProject(null)
    const scratchpadBlocks = useScriptStore.getState().blocks
    const scratchpadTitle = useScriptStore.getState().title
    // Restore
    if (prevProjectId) state.setActiveProject(prevProjectId)

    if (scratchpadBlocks.length === 0) return

    const name = scratchpadTitle?.trim() || "From Scriptwriter"
    const id = createProject(name)
    setActiveScriptProject(id)
    setActiveTimelineProject(id)
    setActiveBibleProject(id)
    // Copy scratchpad blocks into the new project
    useScriptStore.getState().setBlocks(scratchpadBlocks)
    if (scratchpadTitle) useScriptStore.getState().setTitle(scratchpadTitle)
  }, [createProject, setActiveScriptProject, setActiveTimelineProject, setActiveBibleProject])

  const handlePasteSubmit = useCallback(() => {
    if (!pasteText.trim()) return
    const imported = parseTextToBlocks(pasteText)
    const name = "Pasted PIECE"
    const id = createProject(name)
    setActiveScriptProject(id)
    setActiveTimelineProject(id)
    setActiveBibleProject(id)
    useScriptStore.getState().setBlocks(imported)
    setPasteMode(false)
    setPasteText("")
  }, [pasteText, createProject, setActiveScriptProject, setActiveTimelineProject, setActiveBibleProject])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleImport(file)
  }, [handleImport])

  const handleClose = useCallback(() => {
    closeProject()
    setActiveScriptProject(null)
    setActiveTimelineProject(null)
    setActiveBibleProject(null)
  }, [closeProject, setActiveScriptProject, setActiveTimelineProject, setActiveBibleProject])

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm("Delete this PIECE?")) deleteProject(id)
  }, [deleteProject])

  const formatDate = (ts: number) => {
    const diff = Date.now() - ts
    if (diff < 60_000) return "Just now"
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
    return new Date(ts).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
  }

  useSyncOrchestrator()

  return (
    <div className="fixed inset-0 top-[56px] overflow-hidden bg-[#1A1916]">
      {/* StoryboardPanel always mounted */}
      <StoryboardPanel
        isOpen
        isExpanded
        panelWidth={0}
        backgroundColor="#1A1916"
        onClose={() => router.push("/")}
        onToggleExpanded={() => router.push("/")}
      />

      {/* Landing overlay — shown when no content */}
      {isEmpty && (
        <div
          className="absolute inset-0 z-[100] flex items-center justify-center bg-[#0B0C10]/95 backdrop-blur-md"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {/* Drop zone */}
          {dragOver && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="rounded-2xl border-2 border-dashed border-[#D4A853]/40 bg-[#D4A853]/5 px-16 py-12 text-center">
                <Upload size={40} className="mx-auto mb-3 text-[#D4A853]/60" />
                <p className="text-lg text-[#D4A853]/80">Drop screenplay file</p>
                <p className="mt-1 text-sm text-white/30">.txt, .fountain, .fdx</p>
              </div>
            </div>
          )}

          <div className="w-full max-w-lg px-6">
            {/* Logo */}
            <div className="mb-10 text-center">
              <h1 className="text-xl font-light tracking-[0.3em] text-white/70">P I E C E</h1>
              <p className="mt-2 text-[11px] tracking-[0.15em] text-white/20">CREATIVE PRODUCTION STUDIO</p>
            </div>

            {/* Actions */}
            <div className="mb-6 grid grid-cols-3 gap-3">
              {/* New blank */}
              <button
                onClick={handleCreate}
                className="group flex flex-col items-center gap-2.5 rounded-2xl border border-[#D4A853]/12 bg-[#D4A853]/[0.02] p-5 transition-all hover:border-[#D4A853]/25 hover:bg-[#D4A853]/[0.05] hover:shadow-[0_0_30px_rgba(212,168,83,0.06)]"
              >
                <FilePlus2 size={22} className="text-[#D4A853]/40 group-hover:text-[#D4A853]/70" />
                <span className="text-[10px] font-medium tracking-[0.15em] text-white/60 group-hover:text-white/85">NEW PIECE</span>
              </button>

              {/* From Scriptwriter */}
              <button
                onClick={handleImportFromScriptwriter}
                className="group flex flex-col items-center gap-2.5 rounded-2xl border border-emerald-500/12 bg-emerald-500/[0.02] p-5 transition-all hover:border-emerald-500/25 hover:bg-emerald-500/[0.05]"
              >
                <PenLine size={22} className="text-emerald-400/40 group-hover:text-emerald-400/70" />
                <span className="text-[10px] font-medium tracking-[0.15em] text-white/60 group-hover:text-white/85">SCRIPTWRITER</span>
              </button>

              {/* Import file */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="group flex flex-col items-center gap-2.5 rounded-2xl border border-white/6 bg-white/[0.01] p-5 transition-all hover:border-white/12 hover:bg-white/[0.03]"
              >
                <Upload size={22} className="text-white/25 group-hover:text-white/50" />
                <span className="text-[10px] font-medium tracking-[0.15em] text-white/60 group-hover:text-white/85">IMPORT FILE</span>
              </button>
              <input ref={fileInputRef} type="file" accept=".txt,.fountain,.fdx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = "" }} />
            </div>

            {/* Paste area */}
            {!pasteMode ? (
              <button
                onClick={() => setPasteMode(true)}
                className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/8 py-3 text-[11px] tracking-[0.1em] text-white/25 transition-all hover:border-white/15 hover:text-white/40"
              >
                Paste screenplay text from ChatGPT, document, or anywhere
              </button>
            ) : (
              <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Paste your screenplay text here..."
                  autoFocus
                  className="h-32 w-full resize-none rounded-lg bg-transparent text-sm text-white/70 outline-none placeholder:text-white/15"
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    onClick={() => { setPasteMode(false); setPasteText("") }}
                    className="rounded-lg px-3 py-1.5 text-[11px] text-white/30 hover:text-white/50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePasteSubmit}
                    disabled={!pasteText.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-[#D4A853]/15 px-4 py-1.5 text-[11px] font-medium tracking-[0.1em] text-[#D4A853] transition-all hover:bg-[#D4A853]/25 disabled:opacity-30"
                  >
                    Create PIECE <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            )}

            {/* Recent */}
            {projects.length > 0 && (
              <div>
                <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/20">Recent</p>
                <div className="max-h-48 space-y-1.5 overflow-auto">
                  {projects
                    .sort((a, b) => b.updatedAt - a.updatedAt)
                    .slice(0, 8)
                    .map((p) => (
                      <button
                        key={p.id}
                        onClick={() => activateProject(p.id)}
                        className="group flex w-full items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.015] px-4 py-3 text-left transition-all hover:border-white/10 hover:bg-white/[0.03]"
                      >
                        <FolderOpen size={14} className="shrink-0 text-white/15 group-hover:text-[#D4A853]/40" />
                        <span className="flex-1 truncate text-[12px] text-white/55 group-hover:text-white/80">{p.name}</span>
                        <span className="flex items-center gap-1 text-[10px] text-white/15">
                          <Clock size={9} />{formatDate(p.updatedAt)}
                        </span>
                        <button
                          onClick={(e) => handleDelete(p.id, e)}
                          className="shrink-0 rounded p-1 text-white/0 transition-all hover:bg-red-500/10 hover:text-red-400/50 group-hover:text-white/10"
                        >
                          <Trash2 size={12} />
                        </button>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
