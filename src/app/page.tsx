'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useProjectsStore } from '@/store/projects'
import { useScriptStore } from '@/store/script'
import { useTimelineStore } from '@/store/timeline'
import { useBibleStore } from '@/store/bible'
import { useDialogueStore } from '@/store/dialogue'
import { useVoiceTrackStore } from '@/store/voiceTrack'
import { useThemeStore } from '@/store/theme'
import { ProjectsScreen } from '@/components/projects/ProjectsScreen'

const ScriptWriterOverlay = dynamic(
  () => import('@/components/editor/ScriptWriterOverlay'),
  { ssr: false }
)
const BoardAssistant = dynamic(
  () => import('@/components/board/BoardAssistant'),
  { ssr: false }
)

export default function Home() {
  const { projects, activeProjectId, createProject, openProject, closeProject } = useProjectsStore()
  const setActiveScriptProject = useScriptStore((s) => s.setActiveProject)
  const setActiveTimelineProject = useTimelineStore((s) => s.setActiveProject)
  const setActiveBibleProject = useBibleStore((s) => s.setActiveProject)
  const setActiveDialogueProject = useDialogueStore((s) => s.setActiveProject)
  const setActiveVoiceTrackProject = useVoiceTrackStore((s) => s.setActiveProject)

  const appTheme = useThemeStore((s) => s.theme)
  const pageBg = appTheme === "architect" ? "#080808" : appTheme === "synthwave" ? "#0a0614" : "#FAF6F1"
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    // One-time reset: clear old script data and projects
    const resetKey = "koza-fresh-start-v7"
    if (!localStorage.getItem(resetKey)) {
      localStorage.removeItem("koza-projects")
      localStorage.removeItem("koza-script")
      localStorage.removeItem("koza-zones")
      localStorage.removeItem("koza-dialogue-v1")
      localStorage.removeItem("koza-voice-track-v1")
      localStorage.setItem(resetKey, "1")
      window.location.reload()
      return
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    setActiveScriptProject(activeProjectId)
    setActiveTimelineProject(activeProjectId)
    setActiveBibleProject(activeProjectId)
    setActiveDialogueProject(activeProjectId)
    setActiveVoiceTrackProject(activeProjectId)
  }, [activeProjectId, setActiveScriptProject, setActiveTimelineProject, setActiveBibleProject, setActiveDialogueProject, setActiveVoiceTrackProject])

  const handleNewProject = () => {
    const id = createProject(`Project ${projects.length + 1}`)
    setActiveScriptProject(id)
    setActiveTimelineProject(id)
    setActiveBibleProject(id)
    setActiveDialogueProject(id)
    setActiveVoiceTrackProject(id)
  }

  const handleOpenProject = (id: string) => {
    openProject(id)
    setActiveScriptProject(id)
    setActiveTimelineProject(id)
    setActiveBibleProject(id)
    setActiveDialogueProject(id)
    setActiveVoiceTrackProject(id)
  }

  const handleBack = () => {
    closeProject()
    setActiveScriptProject(null)
    setActiveTimelineProject(null)
    setActiveBibleProject(null)
    setActiveDialogueProject(null)
    setActiveVoiceTrackProject(null)
  }

  if (!hydrated) return null

  // Project open → Scriptwriter editor
  if (activeProjectId) {
    return (
      <div className="relative h-screen w-screen" style={{ backgroundColor: pageBg }}>
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: appTheme === "architect"
              ? 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)'
              : appTheme === "synthwave"
                ? 'radial-gradient(circle, rgba(255,45,149,0.15) 1px, transparent 1px)'
                : 'radial-gradient(circle, rgba(141, 126, 109, 0.45) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        <ScriptWriterOverlay
          active
          type="new"
          initialRect={null}
          onCloseStart={handleBack}
          onCloseComplete={handleBack}
        />
        <BoardAssistant />
      </div>
    )
  }

  // No project → Projects screen
  return (
    <ProjectsScreen
      onOpenProject={handleOpenProject}
      onNewProject={handleNewProject}
    />
  )
}
