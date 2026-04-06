import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "@/lib/safeStorage"
import { loadBlob } from "@/lib/fileStorage"
import { useDevLogStore } from "@/store/devlog"
import {
  type BibleReferenceImage,
  type CharacterEntry,
  type LocationEntry,
  type PropEntry,
  linkCharactersToScenes,
  parseCharacters,
  parseLocations,
  parseProps,
} from "@/lib/bibleParser"
import { type Scene } from "@/lib/sceneParser"
import { type Block } from "@/lib/screenplayFormat"

export interface DirectorProfile {
  name: string
  systemPrompt: string
}

export const BUILT_IN_DIRECTORS: DirectorProfile[] = [
  {
    name: "David Fincher",
    systemPrompt: `Ты — Дэвид Финчер + Эрик Мессершмидт. Тебе дают текст сцены, описание персонажей и локаций.

Сделай ПОЛНУЮ РАСКАДРОВКУ в стиле Финчера: 4-6 кадров. Для КАЖДОГО кадра напиши развёрнутое описание + промпт для генерации изображения.

═══ ФИНЧЕРОВСКИЕ ПРИНЦИПЫ ═══
- КАМЕРА НАБЛЮДАЕТ. Surveillance footage. Персонаж не знает что мы смотрим.
- ГЕОМЕТРИЯ. Предметы = улики на операционном столе.
- ОДИН ИСТОЧНИК СВЕТА. Жёсткая граница свет/тень. Причина света конкретная (щель двери, ТВ экран, лампа).
- ЦВЕТ БОЛЕЕТ. Steel blue тени. Sick yellow бумаги. Desaturated. Кожа — единственное тепло.
- ПЕРВЫЙ КАДР — самый нестандартный (bird's eye, через предмет, отражение).`,
  },
  {
    name: "Рекламный ролик",
    systemPrompt: `Ты — режиссёр рекламных роликов мирового уровня. Тебе дают текст сцены/концепт.

Сделай РАСКАДРОВКУ как для коммерческого ролика: 4-8 кадров. Каждый кадр — продающий, динамичный, визуально яркий.

═══ ПРИНЦИПЫ ═══
- ПРОДУКТ/ГЕРОЙ всегда в фокусе. Hero shot обязателен.
- ДИНАМИКА. Быстрая смена ракурсов. Ритм — энергичный.
- СВЕТ — глянцевый, красивый. Продуктовый свет: мягкий, обволакивающий.
- ЦВЕТ — насыщенный, бренд-палитра. Чистые тона, контраст.
- ЭМОЦИЯ — позитив, вдохновение, желание.
- ПЕРВЫЙ КАДР — attention grabber (2 секунды чтобы зацепить).`,
  },
  {
    name: "Андрей Тарковский",
    systemPrompt: `Ты — Андрей Тарковский. Тебе дают текст сцены.

Сделай РАСКАДРОВКУ в стиле Тарковского: 3-5 кадров. Длинные, созерцательные, наполненные смыслом.

═══ ПРИНЦИПЫ ТАРКОВСКОГО ═══
- ВРЕМЯ ТЕЧЁТ. Длинные планы. Камера не торопится. Зритель наблюдает.
- СТИХИИ. Вода, огонь, ветер, дождь — всегда присутствуют.
- ЗЕРКАЛА И ОТРАЖЕНИЯ. Двойственность реальности.
- СВЕТ — естественный. Из окна. Свечи. Никакого искусственного.
- ЦВЕТ — приглушённый, почти монохром. Сепия. Зелёные тени.
- ПРОСТРАНСТВО важнее персонажа. Комната, пейзаж, руины — главный герой.`,
  },
  {
    name: "Анимация",
    systemPrompt: `Ты — режиссёр анимационного фильма. Тебе дают текст сцены, персонажей и локации.

Сделай РАСКАДРОВКУ для анимации: 4-6 кадров. Яркая, эмоциональная, динамичная.

═══ ПРИНЦИПЫ АНИМАЦИИ ═══
- ЭМОЦИЯ В ПЕРВУЮ ОЧЕРЕДЬ. Каждый кадр существует чтобы зритель что-то ПОЧУВСТВОВАЛ.
- ЧЁТКАЯ ПОСТАНОВКА. Персонажи и предметы расположены для мгновенной читаемости.
- ДИНАМИЧЕСКИЕ РАКУРСЫ. Драматические нижние углы для силы, вид сверху для одиночества, голландский угол для хаоса.
- ЦВЕТ = ЭМОЦИЯ. Тёплые (золото/оранж) = безопасно/счастливо. Холодные (синий/бирюза) = грусть/одиночество.
- СВЕТ — персонаж. Rim light, объёмные лучи, драматические тени рассказывают историю.
- ПРОПСЫ КРИТИЧНЫ. Каждый предмет в руках персонажа — часть истории. Шкатулка, меч, письмо — должны быть ВИДНЫ.
- ПЕРСОНАЖИ ВЫРАЗИТЕЛЬНЫ. Большие глаза, утрированные жесты, чёткие силуэты.`,
  },
]

/** Per-project Bible data */
interface BibleDocument {
  characters: CharacterEntry[]
  locations: LocationEntry[]
  props: PropEntry[]
  storyHistory: string
  directorVision: string
  directorProfile: DirectorProfile
  /** Custom prompt for Ambient Focus Mode background generation */
  ambientPrompt: string
}

function createDefaultBible(): BibleDocument {
  return {
    characters: [],
    locations: [],
    props: [],
    storyHistory: "",
    directorVision: "",
    directorProfile: { ...BUILT_IN_DIRECTORS[0] },
    ambientPrompt: "",
  }
}

interface BibleState extends BibleDocument {
  activeProjectId: string | null
  projectBibles: Record<string, BibleDocument>
  updateFromScreenplay: (blocks: Block[], scenes: Scene[]) => void
  updateCharacter: (id: string, patch: Partial<CharacterEntry>) => void
  updateLocation: (id: string, patch: Partial<LocationEntry>) => void
  updateProp: (id: string, patch: Partial<PropEntry>) => void
  addProp: (prop: PropEntry) => void
  removeCharacter: (id: string) => void
  removeLocation: (id: string) => void
  removeProp: (id: string) => void
  removeUnusedEntries: () => { chars: number; locs: number; props: number }
  updateStoryHistory: (value: string) => void
  updateDirectorVision: (value: string) => void
  updateAmbientPrompt: (value: string) => void
  setDirectorProfile: (profile: DirectorProfile) => void
  setActiveProject: (projectId: string | null) => void
}

function updateCurrentProjectBible(
  state: BibleState,
  patch: Partial<BibleDocument>,
): Pick<BibleState, "projectBibles"> {
  if (!state.activeProjectId) return { projectBibles: state.projectBibles }
  const current = state.projectBibles[state.activeProjectId] || createDefaultBible()
  return {
    projectBibles: {
      ...state.projectBibles,
      [state.activeProjectId]: { ...current, ...patch },
    },
  }
}

export const GENERATED_CANONICAL_IMAGE_ID = "__generated_primary__"

type LegacyReferenceFields = {
  referenceImages?: BibleReferenceImage[]
  referenceImageUrl?: string | null
  referenceBlobKey?: string | null
  canonicalImageId?: string | null
}

function resolveCanonicalImageId(
  entry: LegacyReferenceFields | null | undefined,
  referenceImages: BibleReferenceImage[],
  generatedUrl?: string | null,
): string | null {
  if (entry?.canonicalImageId === GENERATED_CANONICAL_IMAGE_ID && generatedUrl) {
    return GENERATED_CANONICAL_IMAGE_ID
  }

  if (entry?.canonicalImageId && referenceImages.some((image) => image.id === entry.canonicalImageId)) {
    return entry.canonicalImageId
  }

  if (generatedUrl) {
    return GENERATED_CANONICAL_IMAGE_ID
  }

  return referenceImages[0]?.id ?? null
}

function getReferenceImages(entry?: LegacyReferenceFields | null): BibleReferenceImage[] {
  if (!entry) {
    return []
  }

  if (Array.isArray(entry.referenceImages)) {
    return entry.referenceImages
      .filter((image) => image && image.blobKey)
      .map((image) => ({
        id: image.id,
        url: image.url,
        blobKey: image.blobKey,
      }))
  }

  if (entry.referenceImageUrl && entry.referenceBlobKey) {
    return [{
      id: entry.referenceBlobKey,
      url: entry.referenceImageUrl,
      blobKey: entry.referenceBlobKey,
    }]
  }

  return []
}

async function restoreReferenceImages(referenceImages: BibleReferenceImage[]): Promise<BibleReferenceImage[]> {
  return Promise.all(referenceImages.map(async (image) => ({
    ...image,
    url: await loadBlob(image.blobKey).catch(() => image.url) ?? image.url,
  })))
}

async function restorePrimaryImage(blobKey: string | null, fallbackUrl: string | null): Promise<string | null> {
  if (!blobKey) {
    return fallbackUrl
  }

  return await loadBlob(blobKey).catch(() => fallbackUrl) ?? fallbackUrl
}

const TRANSITION_NAMES_RE = /^(FADE|CUT|DISSOLVE|WIPE|IRIS|SMASH|MATCH|JUMP|FREEZE|ЗАТЕМНЕНИЕ|ПЕРЕХОД|НАПЛЫВ|ВЫТЕСНЕНИЕ|СТОП)\b/i

function mergeCharacters(existing: CharacterEntry[], parsed: CharacterEntry[]): CharacterEntry[] {
  const existingById = new Map(existing.map((entry) => [entry.id, entry]))
  const parsedById = new Map(parsed.map((entry) => [entry.id, entry]))
  const ids = new Set([...existingById.keys(), ...parsedById.keys()])
  // Clean out transition-like entries that slipped through
  for (const id of ids) {
    const name = existingById.get(id)?.name || parsedById.get(id)?.name || ""
    if (TRANSITION_NAMES_RE.test(name) || /\bTO:?\s*$/i.test(name) || /\b(IN|OUT)[.:]?\s*$/i.test(name)) {
      ids.delete(id)
    }
  }

  return Array.from(ids).map((id) => {
    const current = existingById.get(id)
    const next = parsedById.get(id)
    const currentReferences = getReferenceImages(current)
    const nextReferences = getReferenceImages(next)

    if (!next && current) {
      return {
        ...current,
        sceneIds: [],
        dialogueCount: 0,
        voice: current.voice,
      }
    }

    return {
      id,
      name: next?.name ?? current?.name ?? "",
      description: current?.description ?? next?.description ?? "",
      referenceImages: currentReferences.length > 0 ? currentReferences : nextReferences,
      canonicalImageId: resolveCanonicalImageId(
        current ?? next,
        currentReferences.length > 0 ? currentReferences : nextReferences,
        current?.generatedPortraitUrl ?? next?.generatedPortraitUrl ?? null,
      ),
      generatedPortraitUrl: current?.generatedPortraitUrl ?? next?.generatedPortraitUrl ?? null,
      portraitBlobKey: current?.portraitBlobKey ?? next?.portraitBlobKey ?? null,
      appearancePrompt: current?.appearancePrompt ?? next?.appearancePrompt ?? "",
      sceneIds: next?.sceneIds ?? current?.sceneIds ?? [],
      dialogueCount: next?.dialogueCount ?? current?.dialogueCount ?? 0,
      voice: current?.voice ?? next?.voice,
    }
  }).sort((left, right) => right.dialogueCount - left.dialogueCount || left.name.localeCompare(right.name, "ru"))
}

function mergeLocations(existing: LocationEntry[], parsed: LocationEntry[]): LocationEntry[] {
  const existingById = new Map(existing.map((entry) => [entry.id, entry]))
  const parsedById = new Map(parsed.map((entry) => [entry.id, entry]))
  const ids = new Set([...existingById.keys(), ...parsedById.keys()])

  return Array.from(ids).map((id) => {
    const current = existingById.get(id)
    const next = parsedById.get(id)
    const currentReferences = getReferenceImages(current)
    const nextReferences = getReferenceImages(next)

    if (!next && current) {
      return {
        ...current,
        sceneIds: [],
      }
    }

    return {
      id,
      name: next?.name ?? current?.name ?? "",
      fullHeading: next?.fullHeading ?? current?.fullHeading ?? "",
      intExt: next?.intExt ?? current?.intExt ?? "INT",
      timeOfDay: next?.timeOfDay ?? current?.timeOfDay ?? "",
      description: current?.description ?? next?.description ?? "",
      referenceImages: currentReferences.length > 0 ? currentReferences : nextReferences,
      canonicalImageId: resolveCanonicalImageId(
        current ?? next,
        currentReferences.length > 0 ? currentReferences : nextReferences,
        current?.generatedImageUrl ?? next?.generatedImageUrl ?? null,
      ),
      generatedImageUrl: current?.generatedImageUrl ?? next?.generatedImageUrl ?? null,
      imageBlobKey: current?.imageBlobKey ?? next?.imageBlobKey ?? null,
      appearancePrompt: current?.appearancePrompt ?? next?.appearancePrompt ?? "",
      sceneIds: next?.sceneIds ?? current?.sceneIds ?? [],
    }
  }).sort((left, right) => left.name.localeCompare(right.name, "ru"))
}

export const useBibleStore = create<BibleState>()(
  persist(
    (set) => ({
      ...createDefaultBible(),
      activeProjectId: null,
      projectBibles: {},
      updateFromScreenplay: (blocks, scenes) => {
        const characters = linkCharactersToScenes(parseCharacters(blocks), blocks, scenes)
        const locations = parseLocations(blocks, scenes)

        set((state) => {
          const merged = {
            characters: mergeCharacters(state.characters, characters),
            locations: mergeLocations(state.locations, locations),
            props: parseProps(blocks, scenes, state.props),
          }
          return {
            ...merged,
            ...updateCurrentProjectBible(state, merged),
          }
        })

        useDevLogStore.getState().log({
          type: "bible_sync",
          title: "Bible sync",
          details: JSON.stringify({
            characters: characters.map((entry) => entry.name),
            locations: locations.map((entry) => entry.name),
          }, null, 2),
          meta: {
            blockCount: blocks.length,
            sceneCount: scenes.length,
            characterCount: characters.length,
            locationCount: locations.length,
          },
        })
      },
      updateCharacter: (id, patch) => {
        set((state) => {
          const characters = state.characters.map((entry) => (
            entry.id === id ? { ...entry, ...patch, id: entry.id } : entry
          ))
          return { characters, ...updateCurrentProjectBible(state, { characters }) }
        })
      },
      updateLocation: (id, patch) => {
        set((state) => {
          const locations = state.locations.map((entry) => (
            entry.id === id ? { ...entry, ...patch, id: entry.id } : entry
          ))
          return { locations, ...updateCurrentProjectBible(state, { locations }) }
        })
      },
      updateProp: (id, patch) => {
        set((state) => {
          const props = state.props.map((entry) => (
            entry.id === id ? { ...entry, ...patch, id: entry.id } : entry
          ))
          return { props, ...updateCurrentProjectBible(state, { props }) }
        })
      },
      addProp: (prop) => {
        set((state) => {
          if (state.props.some((p) => p.id === prop.id)) return state
          const props = [...state.props, prop].sort((a, b) => a.name.localeCompare(b.name, "ru"))
          return { props, ...updateCurrentProjectBible(state, { props }) }
        })
      },
      removeCharacter: (id) => {
        set((state) => {
          const characters = state.characters.filter((c) => c.id !== id)
          return { characters, ...updateCurrentProjectBible(state, { characters }) }
        })
      },
      removeLocation: (id) => {
        set((state) => {
          const locations = state.locations.filter((l) => l.id !== id)
          return { locations, ...updateCurrentProjectBible(state, { locations }) }
        })
      },
      removeProp: (id) => {
        set((state) => {
          const props = state.props.filter((p) => p.id !== id)
          return { props, ...updateCurrentProjectBible(state, { props }) }
        })
      },
      removeUnusedEntries: () => {
        let removed = { chars: 0, locs: 0, props: 0 }
        useBibleStore.setState((state) => {
          const characters = state.characters.filter((c) => {
            if (c.sceneIds.length === 0 && c.dialogueCount === 0) { removed.chars++; return false }
            return true
          })
          const locations = state.locations.filter((l) => {
            if (l.sceneIds.length === 0) { removed.locs++; return false }
            return true
          })
          const props = state.props.filter((p) => {
            if (p.sceneIds.length === 0) { removed.props++; return false }
            return true
          })
          return { characters, locations, props, ...updateCurrentProjectBible(state, { characters, locations, props }) }
        })
        return removed
      },
      updateStoryHistory: (value) => {
        set((state) => ({
          storyHistory: value,
          ...updateCurrentProjectBible(state, { storyHistory: value }),
        }))
      },
      updateDirectorVision: (value) => {
        set((state) => ({
          directorVision: value,
          ...updateCurrentProjectBible(state, { directorVision: value }),
        }))
      },
      updateAmbientPrompt: (value) => {
        set((state) => ({
          ambientPrompt: value,
          ...updateCurrentProjectBible(state, { ambientPrompt: value }),
        }))
      },
      setDirectorProfile: (profile) => {
        set((state) => ({
          directorProfile: { ...profile },
          ...updateCurrentProjectBible(state, { directorProfile: { ...profile } }),
        }))
      },
      setActiveProject: (projectId) => {
        set((state) => {
          // Save current project's bible before switching
          const savedBibles = state.activeProjectId
            ? {
                ...state.projectBibles,
                [state.activeProjectId]: {
                  characters: state.characters,
                  locations: state.locations,
                  props: state.props,
                  storyHistory: state.storyHistory,
                  directorVision: state.directorVision,
                  directorProfile: state.directorProfile,
                  ambientPrompt: state.ambientPrompt,
                },
              }
            : state.projectBibles

          if (!projectId) {
            return { activeProjectId: null, ...createDefaultBible(), projectBibles: savedBibles }
          }

          // Load target project's bible or create fresh one
          const projectBible = savedBibles[projectId] || createDefaultBible()
          return {
            activeProjectId: projectId,
            ...projectBible,
            projectBibles: savedBibles[projectId]
              ? savedBibles
              : { ...savedBibles, [projectId]: projectBible },
          }
        })
      },
    }),
    {
      name: "koza-bible-v2",
      storage: safeStorage,
      partialize: (state) => ({
        activeProjectId: state.activeProjectId,
        projectBibles: state.projectBibles,
        // Also persist current active state for quick load
        characters: state.characters,
        locations: state.locations,
        props: state.props,
        storyHistory: state.storyHistory,
        directorVision: state.directorVision,
        directorProfile: state.directorProfile,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return

        void Promise.all([
          Promise.all(state.characters.map(async (entry) => ({
            ...entry,
            referenceImages: await restoreReferenceImages(getReferenceImages(entry)),
            generatedPortraitUrl: await restorePrimaryImage(entry.portraitBlobKey, entry.generatedPortraitUrl),
          }))),
          Promise.all(state.locations.map(async (entry) => ({
            ...entry,
            referenceImages: await restoreReferenceImages(getReferenceImages(entry)),
            generatedImageUrl: await restorePrimaryImage(entry.imageBlobKey, entry.generatedImageUrl),
          }))),
          Promise.all((state.props ?? []).map(async (entry) => ({
            ...entry,
            referenceImages: await restoreReferenceImages(getReferenceImages(entry)),
            generatedImageUrl: await restorePrimaryImage(entry.imageBlobKey, entry.generatedImageUrl),
          }))),
        ]).then(([characters, locations, props]) => {
          useBibleStore.setState({
            characters,
            locations,
            props,
            storyHistory: state.storyHistory ?? "",
            directorVision: state.directorVision ?? "",
            directorProfile: state.directorProfile ?? { ...BUILT_IN_DIRECTORS[0] },
          })
        })
      },
    },
  ),
)