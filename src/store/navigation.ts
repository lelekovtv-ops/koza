import { create } from "zustand"

export type StoryboardViewMode = "scenes" | "board" | "list" | "inspector" | "director" | "prompt"
export type BibleTab = "characters" | "locations" | "props"
export type ProductionRole = "all" | "operator" | "art" | "actors" | "producer"

interface NavigationState {
  scrollToBlockId: string | null
  highlightBlockId: string | null
  studioPanelRequested: boolean
  storyboardViewMode: StoryboardViewMode
  bibleTab: BibleTab
  productionRole: ProductionRole
  openShotStudioId: string | null
  requestScrollToBlock: (blockId: string) => void
  clearScrollRequest: () => void
  requestHighlightBlock: (blockId: string) => void
  clearHighlight: () => void
  requestStudioPanel: () => void
  clearStudioPanelRequest: () => void
  setStoryboardViewMode: (mode: StoryboardViewMode) => void
  setBibleTab: (tab: BibleTab) => void
  setProductionRole: (role: ProductionRole) => void
  setOpenShotStudioId: (id: string | null) => void
}

export const useNavigationStore = create<NavigationState>()((set) => ({
  scrollToBlockId: null,
  highlightBlockId: null,

  requestScrollToBlock: (blockId) => {
    set({ scrollToBlockId: blockId })
  },

  clearScrollRequest: () => {
    set({ scrollToBlockId: null })
  },

  requestHighlightBlock: (blockId) => {
    set({ highlightBlockId: blockId })
    // Auto-clear highlight after 2 seconds
    setTimeout(() => {
      set((state) => (state.highlightBlockId === blockId ? { highlightBlockId: null } : state))
    }, 2000)
  },

  clearHighlight: () => {
    set({ highlightBlockId: null })
  },

  storyboardViewMode: "scenes",
  setStoryboardViewMode: (mode) => set({ storyboardViewMode: mode }),

  bibleTab: "characters",
  setBibleTab: (tab) => set({ bibleTab: tab }),

  productionRole: "all",
  setProductionRole: (role) => set({ productionRole: role }),

  openShotStudioId: null,
  setOpenShotStudioId: (id) => set({ openShotStudioId: id }),

  studioPanelRequested: false,
  requestStudioPanel: () => {
    set({ studioPanelRequested: true })
  },
  clearStudioPanelRequest: () => {
    set({ studioPanelRequested: false })
  },
}))
