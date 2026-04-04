"use client"

/**
 * BOARD — рабочий стол сценариста.
 * Canvas с тулбаром: стикеры, текст, картинки, лист A4.
 * Отдельная страница от SCRIPTWRITER (который сразу открывает редактор).
 */

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useProjectsStore } from "@/store/projects"
import { useScriptStore } from "@/store/script"
import { useTimelineStore } from "@/store/timeline"
import { useRouter } from "next/navigation"

const Canvas = dynamic(() => import("@/components/board/Canvas"), { ssr: false })

export default function BoardPage() {
  const router = useRouter()
  const { activeProjectId, projects, openProject } = useProjectsStore()
  const setActiveScriptProject = useScriptStore((s) => s.setActiveProject)
  const setActiveTimelineProject = useTimelineStore((s) => s.setActiveProject)

  // If no project open, open the first one (or redirect to home)
  useEffect(() => {
    if (!activeProjectId && projects.length > 0) {
      const id = projects[0].id
      openProject(id)
      setActiveScriptProject(id)
      setActiveTimelineProject(id)
    } else if (!activeProjectId && projects.length === 0) {
      router.push("/")
    }
  }, [activeProjectId, projects, openProject, setActiveScriptProject, setActiveTimelineProject, router])

  const handleBack = () => {
    router.push("/")
  }

  if (!activeProjectId) return null

  return <Canvas onBack={handleBack} />
}
