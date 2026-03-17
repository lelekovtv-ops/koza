import { create } from "zustand"
import { persist } from "zustand/middleware"
import { useProjectsStore } from "@/store/projects"

type ScriptDocument = {
  scenario: string
  title: string
  author: string
  draft: string
  date: string
}

interface ScriptState extends ScriptDocument {
  activeProjectId: string | null
  projectScripts: Record<string, ScriptDocument>
  setScenario: (text: string) => void
  setTitle: (title: string) => void
  setAuthor: (author: string) => void
  setDraft: (draft: string) => void
  setDate: (date: string) => void
  setActiveProject: (projectId: string | null) => void
}

const createDefaultScript = (): ScriptDocument => ({
  scenario: "",
  title: "UNTITLED",
  author: "",
  draft: "First Draft",
  date: new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }),
})

const updateCurrentProjectScript = (
  state: ScriptState,
  patch: Partial<ScriptDocument>
): Pick<ScriptState, "projectScripts"> => {
  if (!state.activeProjectId) {
    return { projectScripts: state.projectScripts }
  }

  const current = state.projectScripts[state.activeProjectId] || createDefaultScript()

  return {
    projectScripts: {
      ...state.projectScripts,
      [state.activeProjectId]: {
        ...current,
        ...patch,
      },
    },
  }
}

export const useScriptStore = create<ScriptState>()(
  persist(
    (set) => ({
      ...createDefaultScript(),
      activeProjectId: null,
      projectScripts: {},
      setScenario: (scenario) =>
        set((state) => ({
          scenario,
          ...updateCurrentProjectScript(state, { scenario }),
        })),
      setTitle: (title) =>
        set((state) => {
          const normalizedTitle = title.trim()

          if (state.activeProjectId && normalizedTitle && normalizedTitle !== "UNTITLED") {
            useProjectsStore.getState().updateProjectName(state.activeProjectId, normalizedTitle)
          }

          return {
            title,
            ...updateCurrentProjectScript(state, { title }),
          }
        }),
      setAuthor: (author) =>
        set((state) => ({
          author,
          ...updateCurrentProjectScript(state, { author }),
        })),
      setDraft: (draft) =>
        set((state) => ({
          draft,
          ...updateCurrentProjectScript(state, { draft }),
        })),
      setDate: (date) =>
        set((state) => ({
          date,
          ...updateCurrentProjectScript(state, { date }),
        })),
      setActiveProject: (projectId) =>
        set((state) => {
          if (!projectId) {
            return {
              activeProjectId: null,
              ...createDefaultScript(),
            }
          }

          const projectScript = state.projectScripts[projectId] || createDefaultScript()

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
    {
      name: "koza-script",
    }
  )
)
