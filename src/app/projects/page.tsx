"use client"

import { useRouter } from "next/navigation"
import { useCallback } from "react"
import { useProjectsStore } from "@/store/projects"
import { useScriptStore } from "@/store/script"
import { useTimelineStore } from "@/store/timeline"
import { ProjectsScreen } from "@/components/projects/ProjectsScreen"

export default function ProjectsPage() {
  const router = useRouter()
  const { createProject, openProject } = useProjectsStore()
  const setActiveScriptProject = useScriptStore((s) => s.setActiveProject)
  const setActiveTimelineProject = useTimelineStore((s) => s.setActiveProject)

  const handleOpenProject = useCallback((id: string) => {
    openProject(id)
    setActiveScriptProject(id)
    setActiveTimelineProject(id)
    router.push("/")
  }, [openProject, setActiveScriptProject, setActiveTimelineProject, router])

  const handleNewProject = useCallback(() => {
    const id = createProject(`Project ${useProjectsStore.getState().projects.length + 1}`)
    setActiveScriptProject(id)
    setActiveTimelineProject(id)
    router.push("/")
  }, [createProject, setActiveScriptProject, setActiveTimelineProject, router])

  return (
    <ProjectsScreen
      onOpenProject={handleOpenProject}
      onNewProject={handleNewProject}
    />
  )
}
