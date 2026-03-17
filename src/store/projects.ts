import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

interface ProjectsState {
  projects: Project[]
  activeProjectId: string | null
  createProject: (name: string) => string
  updateProjectName: (id: string, name: string) => void
  openProject: (id: string) => void
  deleteProject: (id: string) => void
  closeProject: () => void
  updateProjectTimestamp: (id: string) => void
}

const createProjectId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set) => ({
      projects: [],
      activeProjectId: null,
      createProject: (name) => {
        const now = Date.now()
        const project: Project = {
          id: createProjectId(),
          name: name.trim() || "Untitled Project",
          createdAt: now,
          updatedAt: now,
        }

        set((state) => ({
          projects: [project, ...state.projects],
          activeProjectId: project.id,
        }))

        return project.id
      },
      updateProjectName: (id, name) => {
        const normalized = name.trim()
        if (!normalized) return

        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === id
              ? {
                  ...project,
                  name: normalized,
                  updatedAt: Date.now(),
                }
              : project
          ),
        }))
      },
      openProject: (id) => {
        set((state) => {
          const exists = state.projects.some((project) => project.id === id)
          if (!exists) {
            return state
          }

          return {
            activeProjectId: id,
            projects: state.projects.map((project) =>
              project.id === id ? { ...project, updatedAt: Date.now() } : project
            ),
          }
        })
      },
      deleteProject: (id) => {
        set((state) => ({
          projects: state.projects.filter((project) => project.id !== id),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        }))
      },
      closeProject: () => set({ activeProjectId: null }),
      updateProjectTimestamp: (id) => {
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === id ? { ...project, updatedAt: Date.now() } : project
          ),
        }))
      },
    }),
    {
      name: "koza-projects",
    }
  )
)
