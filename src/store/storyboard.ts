import { create } from "zustand"
import { persist } from "zustand/middleware"

export type StoryboardFrame = {
  id: string
  title: string
  note: string
  svg: string
}

let storyboardFrameIdCounter = 0

function createStoryboardFrameId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  storyboardFrameIdCounter += 1
  return `storyboard-frame-${storyboardFrameIdCounter}`
}

function buildSketchSvg(seed: number) {
  const horizon = 96 + (seed % 4) * 6
  const sunX = 226 + (seed % 5) * 10
  const sunY = 34 + (seed % 3) * 7
  const figureX = 86 + (seed % 6) * 24
  const figureY = 122 + (seed % 4) * 6
  const ridgeOffset = 6 + (seed % 5) * 4
  const rightPeak = 242 + (seed % 4) * 10

  const raw = `
    <svg width="320" height="180" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sky-${seed}" x1="160" y1="0" x2="160" y2="180" gradientUnits="userSpaceOnUse">
          <stop stop-color="#191C25"/>
          <stop offset="0.28" stop-color="#5E4B44"/>
          <stop offset="0.62" stop-color="#A07149"/>
          <stop offset="1" stop-color="#241E1B"/>
        </linearGradient>
        <linearGradient id="ground-${seed}" x1="160" y1="96" x2="160" y2="180" gradientUnits="userSpaceOnUse">
          <stop stop-color="#4E4338"/>
          <stop offset="0.54" stop-color="#2C241F"/>
          <stop offset="1" stop-color="#171411"/>
        </linearGradient>
        <radialGradient id="sun-${seed}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${sunX} ${sunY}) rotate(90) scale(64 86)">
          <stop stop-color="#FFF2CF" stop-opacity="0.95"/>
          <stop offset="0.42" stop-color="#FFD59A" stop-opacity="0.72"/>
          <stop offset="1" stop-color="#FFB66E" stop-opacity="0"/>
        </radialGradient>
        <filter id="blur-${seed}" x="-20" y="-20" width="360" height="220" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feGaussianBlur stdDeviation="12"/>
        </filter>
      </defs>
      <rect x="0" y="0" width="320" height="180" rx="22" fill="url(#sky-${seed})"/>
      <rect x="0" y="0" width="320" height="180" rx="22" fill="url(#sun-${seed})"/>
      <g filter="url(#blur-${seed})" opacity="0.44">
        <ellipse cx="${sunX - 18}" cy="${sunY + 30}" rx="88" ry="30" fill="#FFD59A"/>
      </g>
      <path d="M0 ${horizon + 12}C24 ${horizon - 2} 42 ${horizon - 8} 68 ${horizon - 20}C96 ${horizon - 34} 120 ${horizon - 24} 138 ${horizon - 14}C164 ${horizon} 180 ${horizon - 10} 198 ${horizon - 24}C220 ${horizon - 44} 242 ${horizon - 48} 320 ${horizon - 10}V180H0Z" fill="#2A2F37" opacity="0.82"/>
      <path d="M0 ${horizon + 24}C34 ${horizon + 8} 54 ${horizon + 2} 84 ${horizon - 10}C112 ${horizon - 20} 146 ${horizon - 4} 176 ${horizon + 8}C202 ${horizon + 18} ${rightPeak} ${horizon + 8} 320 ${horizon - 6}V180H0Z" fill="#4A423D" opacity="0.88"/>
      <path d="M0 ${horizon + 44}C42 ${horizon + 26} 88 ${horizon + 32} 122 ${horizon + 20}C162 ${horizon + 6} 188 ${horizon + 14} 218 ${horizon + 26}C252 ${horizon + 40} 286 ${horizon + 34} 320 ${horizon + 18}V180H0Z" fill="url(#ground-${seed})"/>
      <path d="M0 ${horizon + 18}C34 ${horizon + 8} 70 ${horizon + 20} 108 ${horizon + 14}C146 ${horizon + 8} 192 ${horizon - 6} 232 ${horizon + 10}C270 ${horizon + 26} 292 ${horizon + 32} 320 ${horizon + 20}" stroke="#EAC18A" stroke-opacity="0.26" stroke-width="1.2"/>
      <path d="M32 ${horizon + 50}C78 ${horizon + 32} 112 ${horizon + 34} 144 ${horizon + 50}C182 ${horizon + 70} 228 ${horizon + 74} 278 ${horizon + 54}" stroke="#D7A871" stroke-opacity="0.26" stroke-width="1.1"/>
      <path d="M${figureX - 30} ${figureY + 16}C${figureX - 8} ${figureY - 8} ${figureX + 14} ${figureY - 10} ${figureX + 40} ${figureY + 10}" stroke="#0F1114" stroke-opacity="0.92" stroke-width="3.6" stroke-linecap="round"/>
      <circle cx="${figureX}" cy="${figureY}" r="12" fill="#16181B"/>
      <path d="M${figureX} ${figureY + 12}V${figureY + 42}" stroke="#16181B" stroke-width="7.2" stroke-linecap="round"/>
      <path d="M${figureX - 18} ${figureY + 58}L${figureX - 4} ${figureY + 36}L${figureX + 18} ${figureY + 60}" stroke="#16181B" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M${figureX - 16} ${figureY + 20}L${figureX + 18} ${figureY + 16}" stroke="#16181B" stroke-width="5.2" stroke-linecap="round"/>
      <path d="M${figureX - 40} ${figureY + 42}C${figureX - 6} ${figureY + 28} ${figureX + 28} ${figureY + 28} ${figureX + 58} ${figureY + 44}" stroke="#F0D3A2" stroke-opacity="0.18" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M0 ${horizon + 58}C32 ${horizon + 46} 68 ${horizon + 50} 106 ${horizon + 64}C148 ${horizon + 80} 182 ${horizon + 82} 232 ${horizon + 70}C266 ${horizon + 62} 290 ${horizon + 62} 320 ${horizon + 68}" stroke="#0F1114" stroke-opacity="0.48" stroke-width="1.8"/>
      <path d="M18 ${horizon + 40 + ridgeOffset}L28 ${horizon + 16 + ridgeOffset}L44 ${horizon + 34 + ridgeOffset}L58 ${horizon + 8 + ridgeOffset}L76 ${horizon + 30 + ridgeOffset}" stroke="#1B1F26" stroke-opacity="0.52" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M254 ${horizon + 30}L266 ${horizon + 6}L282 ${horizon + 20}L296 ${horizon + 0}L310 ${horizon + 16}" stroke="#1B1F26" stroke-opacity="0.42" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(raw)}`
}

export function createStoryboardFrame(index: number, id: string = createStoryboardFrameId()): StoryboardFrame {
  return {
    id,
    title: `Frame ${index + 1}`,
    note: index % 2 === 0 ? "Wide establishing beat" : "Character reaction beat",
    svg: buildSketchSvg(index + 1),
  }
}

function renumberFrames(items: StoryboardFrame[]) {
  return items.map((frame, index) => ({
    ...frame,
    title: `Frame ${index + 1}`,
  }))
}

function createDefaultFrames(): StoryboardFrame[] {
  return []
}

interface StoryboardState {
  frames: StoryboardFrame[]
  cardScale: number
  insertFrameAt: (index: number) => string
  moveFrameToIndex: (frameId: string, targetIndex: number) => void
  setCardScale: (value: number) => void
  resetStoryboard: () => void
}

export const useStoryboardStore = create<StoryboardState>()(
  persist(
    (set) => ({
      frames: createDefaultFrames(),
      cardScale: 90,
      insertFrameAt: (index) => {
        const insertedFrame = createStoryboardFrame(index)
        set((state) => {
          const nextItems = [...state.frames]
          nextItems.splice(index, 0, insertedFrame)
          return { frames: renumberFrames(nextItems) }
        })
        return insertedFrame.id
      },
      moveFrameToIndex: (frameId, targetIndex) => {
        set((state) => {
          const currentIndex = state.frames.findIndex((frame) => frame.id === frameId)
          if (currentIndex === -1) return state

          const maxTargetIndex = state.frames.length
          const boundedIndex = Math.max(0, Math.min(targetIndex, maxTargetIndex))
          const adjustedIndex = currentIndex < boundedIndex ? boundedIndex - 1 : boundedIndex
          if (currentIndex === adjustedIndex) return state

          const nextItems = [...state.frames]
          const [movedFrame] = nextItems.splice(currentIndex, 1)
          nextItems.splice(adjustedIndex, 0, movedFrame)

          return { frames: renumberFrames(nextItems) }
        })
      },
      setCardScale: (value) => {
        const normalized = Math.min(104, Math.max(72, value))
        set({ cardScale: normalized })
      },
      resetStoryboard: () => set({ frames: createDefaultFrames(), cardScale: 90 }),
    }),
    {
      name: "koza-storyboard",
      version: 2,
      migrate: (persisted: unknown, version: number) => {
        if (version < 2) {
          const state = persisted as Record<string, unknown>
          if (state) state.frames = []
        }
        return persisted
      },
    }
  )
)