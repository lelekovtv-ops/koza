'use client'

import { BookOpen } from 'lucide-react'
import { useBoardStore } from '@/store/board'
import { useLibraryStore } from '@/store/library'

export default function LibraryButton() {
  const theme = useBoardStore((state) => state.theme)
  const isOpen = useLibraryStore((state) => state.isOpen)
  const toggleOpen = useLibraryStore((state) => state.toggleOpen)
  const filesCount = useLibraryStore((state) => state.files.length)

  const isDark = (theme as string) === 'dark'
  const badgeText = filesCount > 99 ? '99+' : `${filesCount}`

  return (
    <button
      onClick={toggleOpen}
      className={`absolute left-4 top-16 z-40 flex h-10 w-10 items-center justify-center rounded-xl border shadow-lg shadow-black/5 backdrop-blur transition-all duration-200 hover:scale-[1.05] ${
        isDark
          ? 'border-gray-700/50 bg-gray-900/70 text-gray-300 hover:bg-gray-900/85'
          : 'border-gray-200/50 bg-white/70 text-gray-600 hover:bg-white/85'
      } ${isOpen ? 'border-blue-500/30 text-blue-500' : ''}`}
      title='Открыть библиотеку'
      aria-label='Открыть библиотеку'
    >
      <BookOpen className='h-5 w-5' />
      {filesCount > 0 && (
        <span className='absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-semibold leading-none text-white'>
          {badgeText}
        </span>
      )}
    </button>
  )
}
