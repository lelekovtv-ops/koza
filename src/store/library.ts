import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { restoreAllBlobs } from '@/lib/fileStorage'

export type LibraryFile = {
  id: string
  name: string
  type: 'image' | 'video' | 'audio' | 'document' | 'other'
  mimeType: string
  size: number
  url: string
  thumbnailUrl?: string
  createdAt: number
  updatedAt: number
  tags: string[]
  projectId: string
  folder: string
  origin: 'uploaded' | 'generated'
}

type PersistedLibraryFile = Omit<LibraryFile, 'url' | 'thumbnailUrl'>

interface LibraryState {
  files: LibraryFile[]
  isOpen: boolean
  searchQuery: string
  addFile: (file: LibraryFile) => void
  addFiles: (files: LibraryFile[]) => void
  removeFile: (id: string) => void
  updateFile: (id: string, updates: Partial<LibraryFile>) => void
  setOpen: (open: boolean) => void
  toggleOpen: () => void
  setSearchQuery: (q: string) => void
  getFilesByProject: (projectId: string) => LibraryFile[]
  clearProject: (projectId: string) => void
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      files: [],
      isOpen: false,
      searchQuery: '',
      addFile: (file) => {
        set((state) => ({ files: [file, ...state.files] }))
      },
      addFiles: (files) => {
        set((state) => {
          if (files.length === 0) return state

          const byId = new Map(state.files.map((file) => [file.id, file]))
          for (const file of files) {
            byId.set(file.id, file)
          }

          return { files: Array.from(byId.values()) }
        })
      },
      removeFile: (id) => {
        set((state) => ({ files: state.files.filter((file) => file.id !== id) }))
      },
      updateFile: (id, updates) => {
        set((state) => ({
          files: state.files.map((file) =>
            file.id === id
              ? {
                  ...file,
                  ...updates,
                  updatedAt: Date.now(),
                }
              : file
          ),
        }))
      },
      setOpen: (open) => set({ isOpen: open }),
      toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
      setSearchQuery: (q) => set({ searchQuery: q }),
      getFilesByProject: (projectId) => {
        return get().files.filter((file) => file.projectId === projectId)
      },
      clearProject: (projectId) => {
        set((state) => ({ files: state.files.filter((file) => file.projectId !== projectId) }))
      },
    }),
    {
      name: 'koza-library',
      partialize: (state) => {
        const persistedFiles: PersistedLibraryFile[] = state.files.map((file) => ({
          id: file.id,
          name: file.name,
          type: file.type,
          mimeType: file.mimeType,
          size: file.size,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
          tags: file.tags,
          projectId: file.projectId,
          folder: file.folder,
          origin: file.origin,
        }))

        return {
          files: persistedFiles,
          isOpen: state.isOpen,
          searchQuery: state.searchQuery,
        }
      },
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return

        const fileIds = state.files.map((file) => file.id)
        if (fileIds.length === 0) return

        void restoreAllBlobs(fileIds).then((restoredUrls) => {
          useLibraryStore.setState((current) => ({
            files: current.files.map((file) => {
              const restoredUrl = restoredUrls.get(file.id)
              if (!restoredUrl) {
                return { ...file, url: '', thumbnailUrl: undefined }
              }

              return {
                ...file,
                url: restoredUrl,
                thumbnailUrl: file.type === 'image' ? restoredUrl : file.thumbnailUrl,
              }
            }),
          }))
        })
      },
    }
  )
)
