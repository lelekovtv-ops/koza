const DB_NAME = 'koza-files'
const STORE_NAME = 'blobs'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment'))
  }

  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
  })

  return dbPromise
}

export async function saveBlob(fileId: string, blob: Blob): Promise<void> {
  const db = await openDb()

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(blob, fileId)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Failed to save blob'))
    tx.onabort = () => reject(tx.error ?? new Error('Blob save transaction aborted'))
  })
}

export async function trySaveBlob(fileId: string, blob: Blob): Promise<boolean> {
  try {
    await saveBlob(fileId, blob)
    return true
  } catch {
    return false
  }
}

export async function loadBlob(fileId: string): Promise<string | null> {
  const db = await openDb()

  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(fileId)

    request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error('Failed to load blob'))
  })

  if (!blob) return null
  return URL.createObjectURL(blob)
}

export async function deleteBlob(fileId: string): Promise<void> {
  const db = await openDb()

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(fileId)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Failed to delete blob'))
    tx.onabort = () => reject(tx.error ?? new Error('Blob delete transaction aborted'))
  })
}

export async function restoreAllBlobs(fileIds: string[]): Promise<Map<string, string>> {
  const restored = new Map<string, string>()

  await Promise.all(
    fileIds.map(async (fileId) => {
      try {
        const url = await loadBlob(fileId)
        if (url) restored.set(fileId, url)
      } catch {
        // Ignore missing/invalid records and continue restoring others.
      }
    })
  )

  return restored
}
