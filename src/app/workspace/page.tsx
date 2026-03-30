"use client"

import { StoryboardPanel } from "@/components/editor/screenplay/StoryboardPanel"
import { useRouter } from "next/navigation"
import { useCallback } from "react"
import { useSceneSync } from "@/hooks/useSceneSync"

export default function WorkspacePage() {
  const router = useRouter()
  useSceneSync()

  const handleClose = useCallback(() => {
    router.push("/")
  }, [router])

  return (
    <div className="fixed inset-0 top-[56px] overflow-hidden bg-[#1A1916]">
      <StoryboardPanel
        isOpen
        isExpanded
        panelWidth={0}
        backgroundColor="#1A1916"
        onClose={handleClose}
        onToggleExpanded={handleClose}
      />
    </div>
  )
}
