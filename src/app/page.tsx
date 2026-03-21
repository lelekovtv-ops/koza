'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Plus, FolderOpen, ArrowLeft } from "lucide-react";
import { useProjectsStore } from '@/store/projects'
import { useScriptStore } from '@/store/script'
import { useTimelineStore } from '@/store/timeline'
import { KozaLogo } from "@/components/ui/KozaLogo";

const Canvas = dynamic(() => import('@/components/board/Canvas'), { ssr: false })

export default function Home() {
  const { projects, activeProjectId, createProject, openProject, closeProject } = useProjectsStore()
  const setActiveScriptProject = useScriptStore((state) => state.setActiveProject)
  const setActiveTimelineProject = useTimelineStore((state) => state.setActiveProject)
  const [view, setView] = useState<'start' | 'board'>(activeProjectId ? 'board' : 'start')

  useEffect(() => {
    setActiveScriptProject(activeProjectId)
    setActiveTimelineProject(activeProjectId)
  }, [activeProjectId, setActiveScriptProject, setActiveTimelineProject])

  const handleNewProject = () => {
    const id = createProject(`Project ${projects.length + 1}`)
    setActiveScriptProject(id)
    setActiveTimelineProject(id)
    setView('board')
  }

  const handleOpenProject = (id: string) => {
    openProject(id)
    setActiveScriptProject(id)
    setActiveTimelineProject(id)
    setView('board')
  }

  const handleBackToStart = () => {
    closeProject()
    setActiveScriptProject(null)
    setActiveTimelineProject(null)
    setView('start')
  }

  if (view === 'board') {
    return <Canvas onBack={handleBackToStart} />
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <KozaLogo size="lg" variant="default" showTagline className="text-[#2D2A26]" />

      <div className="mt-12 flex gap-6">
        <button
          onClick={handleNewProject}
          className="group flex w-48 flex-col items-center gap-3 rounded-2xl border border-[#E5E0DB] bg-white p-8 shadow-sm transition-all hover:border-[#C8C2BA] hover:shadow-md"
        >
          <Plus className="h-8 w-8 text-[#2D2A26]" />
          <span className="text-sm font-medium text-[#2D2A26]">
            New Project
          </span>
        </button>

        <button
          onClick={() => {
            if (projects.length > 0) {
              handleOpenProject(projects[0].id)
            }
          }}
          className="group flex w-48 flex-col items-center gap-3 rounded-2xl border border-[#E5E0DB] bg-white p-8 shadow-sm transition-all hover:border-[#C8C2BA] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
          disabled={projects.length === 0}
        >
          <FolderOpen className="h-8 w-8 text-[#2D2A26]" />
          <span className="text-sm font-medium text-[#2D2A26]">
            Open Project
          </span>
        </button>
      </div>

      {projects.length > 0 && (
        <div className="mt-6 w-full max-w-105 rounded-xl border border-[#E5E0DB] bg-white/70 p-3">
          <p className="px-2 pb-2 text-xs uppercase tracking-[0.14em] text-[#8A8279]">Recent Projects</p>
          <div className="space-y-1">
            {projects.slice(0, 5).map((project) => (
              <button
                key={project.id}
                onClick={() => handleOpenProject(project.id)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#F4EEE7]"
              >
                <span className="text-sm text-[#2D2A26]">{project.name}</span>
                <span className="text-xs text-[#9C948B]">{new Date(project.updatedAt).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <a
        href="http://localhost:3001"
        className="mt-10 flex items-center gap-2 text-sm text-[#8A8279] transition-colors hover:text-[#2D2A26]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to old project (v1)
      </a>
    </div>
  );
}
