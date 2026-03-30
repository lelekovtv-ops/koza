import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "@/lib/safeStorage"

export type LucBessonProjectCharacterOverride = {
  name: string
  description: string
  appearancePrompt: string
  referenceImageTitles: string[]
}

export type LucBessonProjectLocationOverride = {
  name: string
  description: string
  appearancePrompt: string
  referenceImageTitles: string[]
}

export type LucBessonProjectShot = {
  shotId: string
  label: string
  actionText: string
  directorNote: string
  cameraNote: string
  visualDescription: string
  shotDescription: string
  imagePrompt: string
  selectedRefTitles: string[]
  maxRefCount: number
  refReason: string
}

export type LucBessonProjectProfile = {
  projectId: string
  sourceTemplateId: string
  appliedAt: number
  profileName: string
  sceneText: string
  stylePrompt: string
  directorVisionPrompt: string
  sceneBase: string
  lightLock: string
  styleLock: string
  validationNotes: string[]
  characterOverrides: LucBessonProjectCharacterOverride[]
  locationOverrides: LucBessonProjectLocationOverride[]
  shots: LucBessonProjectShot[]
}

interface ProjectProfilesState {
  lucBessonByProjectId: Record<string, LucBessonProjectProfile>
  setLucBessonProfile: (profile: LucBessonProjectProfile) => void
  clearLucBessonProfile: (projectId: string) => void
}

export const useProjectProfilesStore = create<ProjectProfilesState>()(
  persist(
    (set) => ({
      lucBessonByProjectId: {},
      setLucBessonProfile: (profile) => {
        set((state) => ({
          lucBessonByProjectId: {
            ...state.lucBessonByProjectId,
            [profile.projectId]: profile,
          },
        }))
      },
      clearLucBessonProfile: (projectId) => {
        set((state) => {
          const next = { ...state.lucBessonByProjectId }
          delete next[projectId]
          return { lucBessonByProjectId: next }
        })
      },
    }),
    {
      name: "koza-project-profiles-v1",
      storage: safeStorage,
    },
  ),
)