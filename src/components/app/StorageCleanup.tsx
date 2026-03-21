"use client"

import { useEffect } from "react"

export function StorageCleanup() {
  useEffect(() => {
    const cleaned = localStorage.getItem("koza-cleaned-v2")
    if (cleaned) return

    localStorage.removeItem("koza-timeline")
    localStorage.removeItem("koza-storyboard")
    localStorage.setItem("koza-cleaned-v2", "true")
  }, [])

  return null
}