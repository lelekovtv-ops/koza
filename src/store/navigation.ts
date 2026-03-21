import { create } from "zustand"

interface NavigationState {
  scrollToBlockId: string | null
  highlightBlockId: string | null
  requestScrollToBlock: (blockId: string) => void
  clearScrollRequest: () => void
  requestHighlightBlock: (blockId: string) => void
  clearHighlight: () => void
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
}))
