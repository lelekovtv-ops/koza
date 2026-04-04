"use client"

/**
 * ZoneArrows — стрелки навигации по краям экрана.
 * Показываются только когда есть соседняя зона в этом направлении.
 */

import { useZonesStore, getNeighbor, getZoneConfig, ZONES, type ZoneId } from "@/store/zones"
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react"

interface ZoneArrowsProps {
  onNavigate: (zoneId: ZoneId) => void
}

export function ZoneArrows({ onNavigate }: ZoneArrowsProps) {
  const activeZone = useZonesStore((s) => s.activeZone)

  const left = getNeighbor(activeZone, "left")
  const right = getNeighbor(activeZone, "right")
  const up = getNeighbor(activeZone, "up")
  const down = getNeighbor(activeZone, "down")

  return (
    <>
      {left && (
        <ArrowButton
          direction="left"
          zoneId={left}
          onClick={() => onNavigate(left)}
          className="left-3 top-1/2 -translate-y-1/2"
          icon={<ChevronLeft size={18} />}
        />
      )}
      {right && (
        <ArrowButton
          direction="right"
          zoneId={right}
          onClick={() => onNavigate(right)}
          className="right-3 top-1/2 -translate-y-1/2"
          icon={<ChevronRight size={18} />}
        />
      )}
      {up && (
        <ArrowButton
          direction="up"
          zoneId={up}
          onClick={() => onNavigate(up)}
          className="top-16 left-1/2 -translate-x-1/2"
          icon={<ChevronUp size={18} />}
        />
      )}
      {down && (
        <ArrowButton
          direction="down"
          zoneId={down}
          onClick={() => onNavigate(down)}
          className="bottom-3 left-1/2 -translate-x-1/2"
          icon={<ChevronDown size={18} />}
        />
      )}
    </>
  )
}

function ArrowButton({
  zoneId,
  onClick,
  className,
  icon,
}: {
  direction: string
  zoneId: ZoneId
  onClick: () => void
  className: string
  icon: React.ReactNode
}) {
  const zone = getZoneConfig(zoneId)

  return (
    <button
      onClick={onClick}
      className={`absolute z-50 flex items-center gap-2 px-3 py-2 rounded-full
        bg-black/20 hover:bg-black/40 backdrop-blur-sm
        border border-white/10 hover:border-white/20
        transition-all duration-200 cursor-pointer group
        ${className}`}
      title={`→ ${zone.label}`}
    >
      <span className="text-white/40 group-hover:text-white/70 transition-colors">
        {icon}
      </span>
      <span
        className="text-[10px] font-medium tracking-[0.15em] opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{ color: zone.color }}
      >
        {zone.label}
      </span>
    </button>
  )
}
