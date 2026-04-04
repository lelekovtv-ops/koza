import { useEffect } from "react"
import { useScriptStore } from "@/store/script"
import { useScenesStore } from "@/store/scenes"
import { useBibleStore } from "@/store/bible"
import { useDialogueStore, extractDialogueLines } from "@/store/dialogue"

export function useSceneSync() {
  const blocks = useScriptStore((s) => s.blocks)
  const updateScenes = useScenesStore((s) => s.updateScenes)
  const scenes = useScenesStore((s) => s.scenes)
  const updateFromScreenplay = useBibleStore((s) => s.updateFromScreenplay)
  const characters = useBibleStore((s) => s.characters)
  const setDialogueLines = useDialogueStore((s) => s.setLines)

  useEffect(() => {
    updateScenes(blocks)
  }, [blocks, updateScenes])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      updateFromScreenplay(blocks, scenes)
    }, 2000)

    return () => window.clearTimeout(timer)
  }, [blocks, scenes, updateFromScreenplay])

  // Extract dialogue lines from screenplay
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (blocks.length === 0 || scenes.length === 0) return

      const charNameToId = new Map(
        characters.map((c) => [c.name.toUpperCase(), c.id]),
      )

      const lines = extractDialogueLines(blocks, scenes, charNameToId)
      setDialogueLines(lines)
    }, 2500) // slightly after Bible update

    return () => window.clearTimeout(timer)
  }, [blocks, scenes, characters, setDialogueLines])
}
