"use client"

import dynamic from "next/dynamic"

const Timeline = dynamic(() => import("@/components/timeline/Timeline"), {
  ssr: false,
})

export default function TimelinePanel({ active }: { active: boolean }) {
  if (!active) return null

  return (
    <div className="h-full w-full">
      <Timeline />
    </div>
  )
}
