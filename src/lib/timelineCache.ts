import { deleteBlob, loadBlob, saveBlob } from "@/lib/fileStorage"

export type TimelineMediaQuality = "thumbnail" | "original"

export interface TimelinePrefetchShot {
  id: string
  thumbnailUrl: string | null
  originalUrl?: string | null
}

const MAX_MEMORY_ITEMS = 12

const memoryCache = new Map<string, string>()
const inFlightRequests = new Map<string, Promise<string | null>>()
const knownStorageKeys = new Set<string>()

function getMemoryKey(shotId: string, quality: TimelineMediaQuality) {
  return `${shotId}:${quality}`
}

function getStorageKey(shotId: string, quality: TimelineMediaQuality) {
  return `timeline:${shotId}:${quality}`
}

function touchMemoryEntry(key: string, objectUrl: string) {
  const previousUrl = memoryCache.get(key)

  if (previousUrl && previousUrl !== objectUrl) {
    URL.revokeObjectURL(previousUrl)
  }

  if (memoryCache.has(key)) {
    memoryCache.delete(key)
  }

  memoryCache.set(key, objectUrl)
  evictOverflow()
}

function getMemoryEntry(key: string) {
  const objectUrl = memoryCache.get(key)
  if (!objectUrl) return null

  memoryCache.delete(key)
  memoryCache.set(key, objectUrl)
  return objectUrl
}

function evictOverflow() {
  while (memoryCache.size > MAX_MEMORY_ITEMS) {
    const oldestEntry = memoryCache.entries().next().value
    if (!oldestEntry) return

    const [oldestKey, objectUrl] = oldestEntry
    memoryCache.delete(oldestKey)
    URL.revokeObjectURL(objectUrl)
  }
}

function removeMemoryEntry(key: string) {
  const objectUrl = memoryCache.get(key)
  if (!objectUrl) return

  memoryCache.delete(key)
  URL.revokeObjectURL(objectUrl)
}

async function loadPersistedMedia(shotId: string, quality: TimelineMediaQuality) {
  const key = getMemoryKey(shotId, quality)
  const storageKey = getStorageKey(shotId, quality)

  try {
    const objectUrl = await loadBlob(storageKey)
    if (!objectUrl) return null

    knownStorageKeys.add(storageKey)
    touchMemoryEntry(key, objectUrl)
    return objectUrl
  } catch {
    return null
  }
}

async function fetchAndPersistMedia(
  shotId: string,
  quality: TimelineMediaQuality,
  sourceUrl: string
) {
  try {
    const response = await fetch(sourceUrl)
    if (!response.ok) return null

    const blob = await response.blob()
    return putMedia(shotId, quality, blob)
  } catch {
    return null
  }
}

export async function getMedia(
  shotId: string,
  quality: TimelineMediaQuality,
  sourceUrl: string | null | undefined
): Promise<string | null> {
  const key = getMemoryKey(shotId, quality)
  const cachedUrl = getMemoryEntry(key)
  if (cachedUrl) return cachedUrl

  const existingRequest = inFlightRequests.get(key)
  if (existingRequest) return existingRequest

  const request = (async () => {
    const persistedUrl = await loadPersistedMedia(shotId, quality)
    if (persistedUrl) return persistedUrl

    if (!sourceUrl) return null
    return fetchAndPersistMedia(shotId, quality, sourceUrl)
  })()

  inFlightRequests.set(key, request)

  try {
    return await request
  } finally {
    inFlightRequests.delete(key)
  }
}

export async function putMedia(
  shotId: string,
  quality: TimelineMediaQuality,
  blob: Blob
): Promise<string> {
  const key = getMemoryKey(shotId, quality)
  const storageKey = getStorageKey(shotId, quality)
  const objectUrl = URL.createObjectURL(blob)

  touchMemoryEntry(key, objectUrl)
  knownStorageKeys.add(storageKey)

  try {
    await saveBlob(storageKey, blob)
  } catch {
    // Keep the memory cache usable even if IndexedDB is unavailable.
  }

  return objectUrl
}

export async function removeMedia(shotId: string): Promise<void> {
  const qualities: TimelineMediaQuality[] = ["thumbnail", "original"]

  await Promise.all(
    qualities.map(async (quality) => {
      const key = getMemoryKey(shotId, quality)
      const storageKey = getStorageKey(shotId, quality)

      removeMemoryEntry(key)
      knownStorageKeys.delete(storageKey)
      inFlightRequests.delete(key)

      try {
        await deleteBlob(storageKey)
      } catch {
        // Ignore storage deletion failures so cache cleanup remains best-effort.
      }
    })
  )
}

export function prefetchAhead(
  shots: TimelinePrefetchShot[],
  currentIndex: number,
  ahead = 3,
  behind = 1
): void {
  if (!Array.isArray(shots) || shots.length === 0) return

  const startIndex = Math.max(0, currentIndex - Math.max(0, behind))
  const endIndex = Math.min(shots.length - 1, currentIndex + Math.max(0, ahead))

  queueMicrotask(() => {
    for (let index = startIndex; index <= endIndex; index += 1) {
      if (index === currentIndex) continue

      const shot = shots[index]
      if (!shot) continue

      const sourceUrl = shot.thumbnailUrl ?? shot.originalUrl ?? null
      if (!sourceUrl) continue

      void getMedia(shot.id, "thumbnail", sourceUrl)
    }
  })
}

export function clearAllMedia(): void {
  for (const objectUrl of memoryCache.values()) {
    URL.revokeObjectURL(objectUrl)
  }

  memoryCache.clear()
  inFlightRequests.clear()

  const storageKeys = Array.from(knownStorageKeys)
  knownStorageKeys.clear()

  void Promise.all(
    storageKeys.map(async (storageKey) => {
      try {
        await deleteBlob(storageKey)
      } catch {
        // Ignore storage deletion failures during global cache reset.
      }
    })
  )
}