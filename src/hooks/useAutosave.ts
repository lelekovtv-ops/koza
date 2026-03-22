"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useProjectsStore } from "@/store/projects"
import { useScriptStore } from "@/store/script"

type AutosaveStatus = "idle" | "saving" | "saved"

interface UseAutosaveResult {
  status: AutosaveStatus
  visible: boolean
}

export function useAutosave(enabled = true): UseAutosaveResult {
  const activeProjectId = useScriptStore((state) => state.activeProjectId)
  const scenario = useScriptStore((state) => state.scenario)
  const title = useScriptStore((state) => state.title)
  const author = useScriptStore((state) => state.author)
  const draft = useScriptStore((state) => state.draft)
  const date = useScriptStore((state) => state.date)

  const [status, setStatus] = useState<AutosaveStatus>("idle")
  const [visible, setVisible] = useState(false)
  const hasMountedRef = useRef(false)
  const showTimerRef = useRef<number | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const hideTimerRef = useRef<number | null>(null)

  const clearTimer = useCallback((timerRef: React.MutableRefObject<number | null>) => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const clearPendingTimers = useCallback(() => {
    clearTimer(showTimerRef)
    clearTimer(saveTimerRef)
    clearTimer(hideTimerRef)
  }, [clearTimer])

  useEffect(() => {
    clearPendingTimers()

    if (!enabled) {
      return
    }

    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }

    showTimerRef.current = window.setTimeout(() => {
      setStatus("saving")
      setVisible(true)
    }, 0)

    saveTimerRef.current = window.setTimeout(() => {
      const current = useScriptStore.getState()
      const projectId = current.activeProjectId

      if (projectId) {
        const payload = {
          scenario: current.scenario,
          title: current.title,
          author: current.author,
          draft: current.draft,
          date: current.date,
          updatedAt: Date.now(),
        }
        localStorage.setItem(`koza-script-autosave:${projectId}`, JSON.stringify(payload))
        useProjectsStore.getState().updateProjectTimestamp(projectId)
      }

      setStatus("saved")
      hideTimerRef.current = window.setTimeout(() => {
        setVisible(false)
        setStatus("idle")
      }, 2000)
    }, 2000)

    return clearPendingTimers
  }, [enabled, activeProjectId, scenario, title, author, draft, date, clearPendingTimers])

  useEffect(() => {
    return clearPendingTimers
  }, [clearPendingTimers])

  return {
    status: enabled ? status : "idle",
    visible: enabled ? visible : false,
  }
}
