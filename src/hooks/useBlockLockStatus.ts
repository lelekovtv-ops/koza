"use client"

import { useMemo } from "react"
import { useTimelineStore } from "@/store/timeline"
import { useScriptStore } from "@/store/script"

export interface BlockLockInfo {
  locked: boolean
  shotCount: number
  shotIds: string[]
}

/**
 * Returns a Map<blockId, BlockLockInfo> for all blocks that are covered
 * by at least one locked shot's blockRange.
 */
export function useBlockLockStatus(): Map<string, BlockLockInfo> {
  const shots = useTimelineStore((s) => s.shots)
  const blocks = useScriptStore((s) => s.blocks)

  return useMemo(() => {
    const map = new Map<string, BlockLockInfo>()

    for (const shot of shots) {
      if (!shot.locked || !shot.blockRange) continue
      const [startId, endId] = shot.blockRange

      const startIdx = blocks.findIndex((b) => b.id === startId)
      const endIdx = blocks.findIndex((b) => b.id === endId)
      if (startIdx < 0 || endIdx < 0) continue

      const lo = Math.min(startIdx, endIdx)
      const hi = Math.max(startIdx, endIdx)

      for (let i = lo; i <= hi; i++) {
        const blockId = blocks[i].id
        const existing = map.get(blockId)
        if (existing) {
          existing.shotCount++
          existing.shotIds.push(shot.id)
        } else {
          map.set(blockId, { locked: true, shotCount: 1, shotIds: [shot.id] })
        }
      }
    }

    return map
  }, [shots, blocks])
}
