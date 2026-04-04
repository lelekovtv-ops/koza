/**
 * KOZA Zone Navigation Store
 *
 * 4 зоны на одном бесконечном canvas ReactFlow.
 * Каждая зона = область с фиксированными координатами.
 * Камера прыгает между зонами (fitView).
 * Зум-аут = видишь все 4 стола.
 *
 *   ┌─────────┐           ┌─────────┐
 *   │ 1 WRITE │           │ 2 BOARD │
 *   │  (0,0)  │           │ (3000,0)│
 *   └─────────┘           └─────────┘
 *
 *   ┌─────────┐           ┌─────────┐
 *   │ 3 PROD  │           │ 4 MEDIA │
 *   │(0,2000) │           │(3000,2k)│
 *   └─────────┘           └─────────┘
 */

import { create } from "zustand"
import { persist } from "zustand/middleware"

export type ZoneId = 1 | 2 | 3 | 4

export interface ZoneConfig {
  id: ZoneId
  key: string
  label: string
  icon: string
  color: string
  description: string
  /** Center position on canvas */
  x: number
  y: number
  /** Zone boundary size (16:9) */
  width: number
  height: number
}

const ZONE_W = 2200
const ZONE_H = 1240 // ~16:9
const GAP = 800

export const ZONES: ZoneConfig[] = [
  {
    id: 1,
    key: "write",
    label: "WRITE",
    icon: "PenTool",
    color: "#D4A853",
    description: "Сценарий, Bible, раскадровка",
    x: 0,
    y: 0,
    width: ZONE_W,
    height: ZONE_H,
  },
  {
    id: 2,
    key: "board",
    label: "BOARD",
    icon: "LayoutDashboard",
    color: "#7C9FA6",
    description: "Визуальная доска, стикеры, связи",
    x: ZONE_W + GAP,
    y: 0,
    width: ZONE_W,
    height: ZONE_H,
  },
  {
    id: 3,
    key: "production",
    label: "PRODUCTION",
    icon: "Calendar",
    color: "#8B7355",
    description: "Календарь, задачи, call sheets",
    x: 0,
    y: ZONE_H + GAP,
    width: ZONE_W,
    height: ZONE_H,
  },
  {
    id: 4,
    key: "media",
    label: "MEDIA",
    icon: "Music",
    color: "#6B8E6B",
    description: "Плеер, референсы, транскрипция",
    x: ZONE_W + GAP,
    y: ZONE_H + GAP,
    width: ZONE_W,
    height: ZONE_H,
  },
]

interface ZonesState {
  activeZone: ZoneId
  setActiveZone: (zone: ZoneId) => void
}

export function getZoneConfig(id: ZoneId): ZoneConfig {
  return ZONES.find((z) => z.id === id)!
}

export function getNeighbor(current: ZoneId, direction: "left" | "right" | "up" | "down"): ZoneId | null {
  const zone = getZoneConfig(current)
  const cx = zone.x
  const cy = zone.y

  switch (direction) {
    case "left":
      return ZONES.find((z) => z.x < cx && z.y === cy)?.id ?? null
    case "right":
      return ZONES.find((z) => z.x > cx && z.y === cy)?.id ?? null
    case "up":
      return ZONES.find((z) => z.y < cy && z.x === cx)?.id ?? null
    case "down":
      return ZONES.find((z) => z.y > cy && z.x === cx)?.id ?? null
  }
}

export const useZonesStore = create<ZonesState>()(
  persist(
    (set) => ({
      activeZone: 1,
      setActiveZone: (zone) => set({ activeZone: zone }),
    }),
    {
      name: "koza-zones",
      version: 1,
    },
  ),
)
