"use client"

/**
 * ZoneMinimap — миникарта зон поверх canvas.
 * Показывает 4 зоны, подсвечивает активную.
 * Клик = камера прыгает в зону.
 */

import { useZonesStore, ZONES, type ZoneId } from "@/store/zones"

interface ZoneMinimapProps {
  onNavigate: (zoneId: ZoneId) => void
}

export function ZoneMinimap({ onNavigate }: ZoneMinimapProps) {
  const activeZone = useZonesStore((s) => s.activeZone)

  return (
    <div className="absolute bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      <div
        className="grid grid-cols-2 grid-rows-2 gap-[2px] p-1 rounded-lg bg-black/30 backdrop-blur-md border border-white/10"
        style={{ width: 72, height: 44 }}
      >
        {ZONES.map((zone) => {
          const isActive = zone.id === activeZone
          return (
            <button
              key={zone.id}
              onClick={() => onNavigate(zone.id)}
              className="rounded-[3px] transition-all duration-300 relative"
              style={{
                background: isActive ? `${zone.color}50` : `${zone.color}15`,
                boxShadow: isActive ? `0 0 8px ${zone.color}30` : "none",
              }}
              title={`${zone.id}. ${zone.label}`}
            >
              <span
                className="absolute inset-0 flex items-center justify-center text-[8px] font-mono"
                style={{
                  color: isActive ? zone.color : `${zone.color}60`,
                  opacity: isActive ? 1 : 0.6,
                }}
              >
                {zone.id}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
