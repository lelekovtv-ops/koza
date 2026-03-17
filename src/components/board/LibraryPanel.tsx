'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import NextImage from 'next/image'
import {
  BookOpen,
  File,
  FileText,
  Film,
  FolderOpen,
  Music,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { deleteBlob, saveBlob } from '@/lib/fileStorage'
import { useBoardStore } from '@/store/board'
import { type LibraryFile, useLibraryStore } from '@/store/library'

interface LibraryPanelProps {
  projectId: string | null
  hidden?: boolean
}

const ACCEPT_TYPES = 'image/*,video/*,audio/*,.pdf,.txt,.fdx,.fountain'

function createFileId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function detectLibraryType(file: File): LibraryFile['type'] {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  if (
    file.type.includes('pdf') ||
    file.type.includes('text') ||
    file.name.endsWith('.fdx') ||
    file.name.endsWith('.fountain')
  ) {
    return 'document'
  }

  return 'other'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

async function createImageThumbnail(file: File): Promise<string | undefined> {
  try {
    const sourceUrl = URL.createObjectURL(file)
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to load image for thumbnail'))
      img.src = sourceUrl
    })

    const maxSize = 200
    const ratio = Math.min(maxSize / image.width, maxSize / image.height, 1)
    const width = Math.max(1, Math.round(image.width * ratio))
    const height = Math.max(1, Math.round(image.height * ratio))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      URL.revokeObjectURL(sourceUrl)
      return undefined
    }

    ctx.drawImage(image, 0, 0, width, height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
    URL.revokeObjectURL(sourceUrl)
    return dataUrl
  } catch {
    return undefined
  }
}

function FileTypeIcon({ type }: { type: LibraryFile['type'] }) {
  if (type === 'video') return <Film className='h-8 w-8 text-[#7A7269]' />
  if (type === 'audio') return <Music className='h-8 w-8 text-[#7A7269]' />
  if (type === 'document') return <FileText className='h-8 w-8 text-[#7A7269]' />
  return <File className='h-8 w-8 text-[#7A7269]' />
}

export default function LibraryPanel({ projectId, hidden = false }: LibraryPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [dragCounter, setDragCounter] = useState(0)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const theme = useBoardStore((state) => state.theme)
  const files = useLibraryStore((state) => state.files)
  const isOpen = useLibraryStore((state) => state.isOpen)
  const searchQuery = useLibraryStore((state) => state.searchQuery)
  const addFiles = useLibraryStore((state) => state.addFiles)
  const removeFile = useLibraryStore((state) => state.removeFile)
  const setSearchQuery = useLibraryStore((state) => state.setSearchQuery)
  const setOpen = useLibraryStore((state) => state.setOpen)

  const isDark = (theme as string) === 'dark'
  const isDragOver = dragCounter > 0

  useEffect(() => {
    if (!hidden) return
    setOpen(false)
  }, [hidden, setOpen])

  useEffect(() => {
    if (!isOpen) return

    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current) return
      if (panelRef.current.contains(event.target as Node)) return
      setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [isOpen, setOpen])

  const processFiles = useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return

      const now = Date.now()
      const targetProjectId = projectId ?? 'global'

      const prepared = await Promise.all(
        incoming.map(async (file) => {
          const id = createFileId()
          const objectUrl = URL.createObjectURL(file)
          const type = detectLibraryType(file)
          const thumbnailUrl = type === 'image' ? await createImageThumbnail(file) : undefined

          try {
            await saveBlob(id, file)
          } catch {
            // Keep metadata in store even if IndexedDB write fails.
          }

          return {
            id,
            name: file.name,
            type,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            url: objectUrl,
            thumbnailUrl,
            createdAt: now,
            updatedAt: now,
            tags: [],
            projectId: targetProjectId,
            folder: '/',
            origin: 'uploaded' as const,
          }
        })
      )

      addFiles(prepared)
    },
    [addFiles, projectId]
  )

  const handleFilePicker = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? [])
    await processFiles(selected)
    event.target.value = ''
  }

  const handleDeleteFile = async (file: LibraryFile) => {
    removeFile(file.id)

    if (file.url.startsWith('blob:')) {
      URL.revokeObjectURL(file.url)
    }
    if (file.thumbnailUrl && file.thumbnailUrl.startsWith('blob:')) {
      URL.revokeObjectURL(file.thumbnailUrl)
    }

    try {
      await deleteBlob(file.id)
    } catch {
      // Ignore delete failures, metadata was already removed.
    }
  }

  const filteredFiles = useMemo(() => {
    const scoped = files.filter((file) => (projectId ? file.projectId === projectId : true))
    const q = searchQuery.trim().toLowerCase()
    if (!q) return scoped
    return scoped.filter((file) => file.name.toLowerCase().includes(q))
  }, [files, projectId, searchQuery])

  if (hidden) return null

  return (
    <>
      <input
        ref={inputRef}
        type='file'
        multiple
        accept={ACCEPT_TYPES}
        onChange={(event) => {
          void handleFilePicker(event)
        }}
        className='hidden'
      />

      <div className='pointer-events-none fixed inset-y-0 left-0 z-40 w-[360px]'>
        <div
          ref={panelRef}
          className={`pointer-events-auto h-full w-[360px] transform border-r backdrop-blur-xl transition-transform duration-300 ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          } ${
            isDark ? 'border-gray-800/80 bg-gray-950/90' : 'border-gray-200/70 bg-white/90'
          }`}
          onDragEnter={(event) => {
            event.preventDefault()
            setDragCounter((value) => value + 1)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            setDragCounter((value) => Math.max(0, value - 1))
          }}
          onDrop={(event) => {
            event.preventDefault()
            setDragCounter(0)
            const dropped = Array.from(event.dataTransfer.files)
            void processFiles(dropped)
          }}
        >
          <div className='relative flex h-full flex-col'>
            <div className='border-b border-black/5 px-4 pb-4 pt-4'>
              <div className='mb-3 flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <BookOpen className='h-5 w-5 text-blue-500' />
                  <h2 className={`text-base font-semibold ${isDark ? 'text-gray-100' : 'text-[#2D2A26]'}`}>
                    Библиотека
                  </h2>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className={`rounded-lg p-1.5 transition-colors ${
                    isDark ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-100' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                  title='Закрыть библиотеку'
                  aria-label='Закрыть библиотеку'
                >
                  <X className='h-4 w-4' />
                </button>
              </div>

              <div className='relative mb-3'>
                <Search className={`pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder='Поиск файлов...'
                  className={`w-full rounded-lg border py-2 pl-8 pr-3 text-sm outline-none transition-colors ${
                    isDark
                      ? 'border-gray-700 bg-gray-900 text-gray-100 placeholder:text-gray-500 focus:border-blue-500'
                      : 'border-gray-200 bg-white text-[#2D2A26] placeholder:text-gray-400 focus:border-blue-400'
                  }`}
                />
              </div>

              <button
                onClick={() => inputRef.current?.click()}
                className='inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-600'
              >
                <Upload className='h-4 w-4' />
                Загрузить
              </button>
            </div>

            <div className='relative flex-1 overflow-y-auto p-4'>
              {filteredFiles.length === 0 ? (
                <div className={`mt-12 rounded-2xl border border-dashed p-8 text-center ${isDark ? 'border-gray-700 text-gray-300' : 'border-gray-300 text-[#7A7269]'}`}>
                  <FolderOpen className='mx-auto mb-3 h-10 w-10 opacity-70' />
                  <p className='text-sm font-medium'>Библиотека пуста</p>
                  <p className='mt-2 text-xs opacity-80'>Перетащите файлы или нажмите «Загрузить»</p>
                  <button
                    onClick={() => inputRef.current?.click()}
                    className='mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-600'
                  >
                    <Upload className='h-3.5 w-3.5' />
                    Загрузить
                  </button>
                </div>
              ) : (
                <div className='grid grid-cols-2 gap-3'>
                  {filteredFiles.map((file) => {
                    const canPreviewImage = file.type === 'image' && Boolean(file.url)

                    return (
                      <div
                        key={file.id}
                        className={`group overflow-hidden rounded-xl border transition ${
                          isDark
                            ? 'border-gray-800 bg-gray-900/80 hover:border-gray-700'
                            : 'border-gray-200 bg-white/80 hover:border-gray-300'
                        }`}
                      >
                        <div
                          className={`relative flex h-24 items-center justify-center ${
                            isDark ? 'bg-gray-900' : 'bg-[#F7F4EF]'
                          }`}
                        >
                          {canPreviewImage ? (
                            <button
                              className='relative h-full w-full'
                              onClick={() => setPreviewImage(file.url || null)}
                              title='Открыть изображение'
                            >
                              <NextImage
                                src={file.thumbnailUrl || file.url}
                                alt={file.name}
                                fill
                                unoptimized
                                sizes='(max-width: 768px) 50vw, 160px'
                                className='object-cover'
                              />
                            </button>
                          ) : (
                            <FileTypeIcon type={file.type} />
                          )}

                          <button
                            onClick={() => {
                              void handleDeleteFile(file)
                            }}
                            className='absolute right-1.5 top-1.5 rounded-md bg-black/65 p-1 text-white opacity-0 transition group-hover:opacity-100 hover:bg-red-500'
                            title='Удалить файл'
                            aria-label='Удалить файл'
                          >
                            <Trash2 className='h-3.5 w-3.5' />
                          </button>
                        </div>

                        <div className='px-2.5 py-2'>
                          <p className={`truncate text-xs font-medium ${isDark ? 'text-gray-100' : 'text-[#2D2A26]'}`}>
                            {file.name}
                          </p>
                          <p className={`mt-0.5 text-[11px] ${isDark ? 'text-gray-400' : 'text-[#8A8279]'}`}>
                            {formatSize(file.size)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {isDragOver && (
              <div className='pointer-events-none absolute inset-4 rounded-2xl border-2 border-dashed border-blue-500/80 bg-blue-500/10 backdrop-blur-sm'>
                <div className='flex h-full items-center justify-center'>
                  <p className='text-sm font-medium text-blue-600'>Перетащите файлы сюда</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {previewImage && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm'
          onClick={() => setPreviewImage(null)}
        >
          <button
            className='absolute right-5 top-5 rounded-lg bg-black/55 p-2 text-white transition hover:bg-black/75'
            onClick={() => setPreviewImage(null)}
            aria-label='Закрыть просмотр'
          >
            <X className='h-5 w-5' />
          </button>
          <NextImage
            src={previewImage}
            alt='Preview'
            width={1600}
            height={900}
            unoptimized
            className='max-h-[90vh] max-w-[90vw] rounded-xl object-contain'
          />
        </div>
      )}

      {/* TODO: drag to canvas — создать ноду из файла */}
      {/* TODO: ambient illustrations → auto-add to library */}
    </>
  )
}
