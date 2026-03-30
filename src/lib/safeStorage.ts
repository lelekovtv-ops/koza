/**
 * Safe localStorage wrapper that handles QuotaExceededError.
 * Falls back gracefully — never crashes the app.
 */
import { createJSONStorage, type StateStorage } from "zustand/middleware"

const safeLocalStorage: StateStorage = {
  getItem(name: string): string | null {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },

  setItem(name: string, value: string): void {
    try {
      localStorage.setItem(name, value)
    } catch (err) {
      if (err instanceof DOMException && err.name === "QuotaExceededError") {
        console.warn(`[safeStorage] Quota exceeded for "${name}" (${(value.length / 1024).toFixed(0)}KB). Cleaning up...`)

        // Strategy: remove largest non-essential keys first
        const keysToTry = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key) keysToTry.push({ key, size: (localStorage.getItem(key) || "").length })
        }
        keysToTry.sort((a, b) => b.size - a.size)

        // Remove up to 3 largest keys (except the one we're trying to write)
        let freed = 0
        for (const entry of keysToTry) {
          if (entry.key === name) continue
          if (freed >= 3) break
          console.warn(`[safeStorage] Removing "${entry.key}" (${(entry.size / 1024).toFixed(0)}KB)`)
          localStorage.removeItem(entry.key)
          freed++
        }

        // Retry
        try {
          localStorage.setItem(name, value)
        } catch {
          console.error(`[safeStorage] Still over quota after cleanup. Skipping save for "${name}".`)
        }
      }
    }
  },

  removeItem(name: string): void {
    try {
      localStorage.removeItem(name)
    } catch {}
  },
}

export const safeStorage = createJSONStorage(() => safeLocalStorage)
