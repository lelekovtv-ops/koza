/**
 * Blob storage adapter — dual mode:
 * - Online + authenticated: upload to S3 (MinIO/B2/R2) via presigned URL
 * - Offline / not logged in: fallback to IndexedDB (existing fileStorage)
 *
 * Components call this instead of fileStorage directly.
 */

import { saveBlob, loadBlob, deleteBlob } from "./fileStorage"

/**
 * Save a blob — tries S3 first, falls back to IndexedDB.
 * Returns the URL to access the file.
 */
export async function saveBlobAdaptive(
  fileId: string,
  blob: Blob,
  projectId?: string,
): Promise<{ url: string; remote: boolean }> {
  // Try remote upload if we have a session
  if (projectId) {
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          filename: `${fileId}.webp`,
          contentType: blob.type || "image/webp",
        }),
      })

      if (res.ok) {
        const { uploadUrl, publicUrl } = await res.json()

        // Upload directly to S3
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          body: blob,
          headers: { "Content-Type": blob.type || "image/webp" },
        })

        if (uploadRes.ok) {
          return { url: publicUrl, remote: true }
        }
      }
    } catch {
      // Fall through to local storage
    }
  }

  // Fallback: save to IndexedDB
  await saveBlob(fileId, blob)
  const url = await loadBlob(fileId)
  return { url: url || "", remote: false }
}

/**
 * Load a blob URL — if it's a remote URL, return as-is.
 * If it's a local blob key, load from IndexedDB.
 */
export async function loadBlobAdaptive(
  urlOrKey: string,
): Promise<string | null> {
  // If it's already a URL (http/https), return directly
  if (urlOrKey.startsWith("http://") || urlOrKey.startsWith("https://")) {
    return urlOrKey
  }

  // If it's a blob: URL, return directly (still valid in this session)
  if (urlOrKey.startsWith("blob:")) {
    return urlOrKey
  }

  // Otherwise it's an IndexedDB key — load from local storage
  return loadBlob(urlOrKey)
}

/**
 * Delete a blob — from both local and remote if applicable.
 */
export async function deleteBlobAdaptive(
  fileId: string,
  remoteKey?: string,
): Promise<void> {
  // Delete local
  try {
    await deleteBlob(fileId)
  } catch {
    // ignore
  }

  // Delete remote if we have a key
  if (remoteKey) {
    try {
      await fetch(`/api/upload?key=${encodeURIComponent(remoteKey)}`, {
        method: "DELETE",
      })
    } catch {
      // ignore — cleanup is best-effort
    }
  }
}
