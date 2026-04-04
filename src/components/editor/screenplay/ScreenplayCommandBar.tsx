"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  BookOpen,
  Eye,
  EyeOff,
  Maximize,
  Moon,
  Columns2,
  FileText,
  ScrollText,
  Sun,
  Volume2,
  VolumeOff,
  Palette,
  Search,
  Settings,
  ZoomIn,
} from "lucide-react"
import {
  useScreenplaySettings,
  PAPER_THEMES,
  type PaperTheme,
  type PageViewMode,
} from "@/store/screenplaySettings"

interface CommandItem {
  id: string
  label: string
  shortLabel?: string
  icon: React.ReactNode
  action: () => void
  rightLabel?: string
  active?: boolean
  group: string
}

export function ScreenplayCommandBar() {
  const settings = useScreenplaySettings()
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus input on open
  useEffect(() => {
    if (settings.commandBarOpen) {
      setQuery("")
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [settings.commandBarOpen])

  // Global shortcut: Cmd+/ to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault()
        settings.toggleCommandBar()
      }
      if (e.key === "Escape" && settings.commandBarOpen) {
        e.preventDefault()
        settings.setCommandBarOpen(false)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [settings.commandBarOpen, settings])

  // Click outside to close
  useEffect(() => {
    if (!settings.commandBarOpen) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        settings.setCommandBarOpen(false)
      }
    }
    window.addEventListener("mousedown", handler)
    return () => window.removeEventListener("mousedown", handler)
  }, [settings.commandBarOpen, settings])

  const viewModeLabels: Record<PageViewMode, string> = {
    single: "Single Page",
    spread: "Two Pages",
    fullscreen: "Fullscreen",
    scroll: "Scroll",
  }

  const commands: CommandItem[] = useMemo(() => [
    {
      id: "focus",
      label: "Focus Mode",
      icon: settings.focusMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />,
      action: () => { settings.toggleFocusMode(); settings.setCommandBarOpen(false) },
      rightLabel: settings.focusMode ? "ON" : "OFF",
      active: settings.focusMode,
      group: "Mode",
    },
    {
      id: "markers",
      label: "Bible Markers",
      icon: <BookOpen className="h-4 w-4" />,
      action: () => { settings.toggleBibleMarkers(); settings.setCommandBarOpen(false) },
      rightLabel: settings.bibleMarkers ? "ON" : "OFF",
      active: settings.bibleMarkers,
      group: "Mode",
    },
    {
      id: "sound",
      label: "Typewriter Sound",
      icon: settings.typewriterSound ? <Volume2 className="h-4 w-4" /> : <VolumeOff className="h-4 w-4" />,
      action: () => { settings.toggleTypewriterSound(); settings.setCommandBarOpen(false) },
      rightLabel: settings.typewriterSound ? "ON" : "OFF",
      active: settings.typewriterSound,
      group: "Mode",
    },
    // View modes
    {
      id: "view-single",
      label: "Single Page",
      icon: <FileText className="h-4 w-4" />,
      action: () => { settings.setViewMode("single"); settings.setCommandBarOpen(false) },
      active: settings.viewMode === "single",
      group: "View",
    },
    {
      id: "view-spread",
      label: "Two Pages (Spread)",
      icon: <Columns2 className="h-4 w-4" />,
      action: () => { settings.setViewMode("spread"); settings.setCommandBarOpen(false) },
      active: settings.viewMode === "spread",
      group: "View",
    },
    {
      id: "view-fullscreen",
      label: "Fullscreen Page",
      icon: <Maximize className="h-4 w-4" />,
      action: () => { settings.setViewMode("fullscreen"); settings.setCommandBarOpen(false) },
      active: settings.viewMode === "fullscreen",
      group: "View",
    },
    {
      id: "view-scroll",
      label: "Continuous Scroll",
      icon: <ScrollText className="h-4 w-4" />,
      action: () => { settings.setViewMode("scroll"); settings.setCommandBarOpen(false) },
      active: settings.viewMode === "scroll",
      group: "View",
    },
    // Paper themes
    ...Object.entries(PAPER_THEMES).map(([key, theme]) => ({
      id: `paper-${key}`,
      label: theme.label,
      icon: <Palette className="h-4 w-4" />,
      action: () => { settings.setPaperTheme(key as PaperTheme); settings.setCommandBarOpen(false) },
      active: settings.paperTheme === key,
      group: "Paper",
      rightLabel: undefined as string | undefined,
    })),
  ], [settings])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q),
    )
  }, [commands, query])

  const groups = useMemo(() => {
    const map = new Map<string, CommandItem[]>()
    for (const item of filtered) {
      const list = map.get(item.group) || []
      list.push(item)
      map.set(item.group, list)
    }
    return map
  }, [filtered])

  const [selectedIdx, setSelectedIdx] = useState(0)

  useEffect(() => setSelectedIdx(0), [query])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === "Enter" && filtered[selectedIdx]) {
        e.preventDefault()
        filtered[selectedIdx].action()
      }
    },
    [filtered, selectedIdx],
  )

  if (!settings.commandBarOpen) return null

  let flatIdx = -1

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        paddingBottom: 80,
        backgroundColor: "rgba(0,0,0,0.3)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        ref={panelRef}
        style={{
          width: 420,
          maxHeight: "60vh",
          borderRadius: 14,
          backgroundColor: "rgba(24, 24, 24, 0.95)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <Search className="h-4 w-4 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#fff",
              fontSize: 14,
              fontFamily: "system-ui, sans-serif",
              caretColor: "#D4A853",
            }}
          />
          <span
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.2)",
              fontFamily: "system-ui, sans-serif",
              letterSpacing: "0.05em",
            }}
          >
            ESC
          </span>
        </div>

        {/* Commands list */}
        <div style={{ overflowY: "auto", padding: "6px 0" }}>
          {Array.from(groups).map(([group, items]) => (
            <div key={group}>
              <div
                style={{
                  padding: "8px 16px 4px",
                  fontSize: 9,
                  fontFamily: "system-ui, sans-serif",
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  color: "rgba(255,255,255,0.2)",
                }}
              >
                {group}
              </div>
              {items.map((item) => {
                flatIdx++
                const isSelected = flatIdx === selectedIdx
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIdx(flatIdx)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "8px 16px",
                      border: "none",
                      background: isSelected ? "rgba(212, 168, 83, 0.1)" : "transparent",
                      color: item.active ? "#D4A853" : "rgba(255,255,255,0.7)",
                      fontSize: 13,
                      fontFamily: "system-ui, sans-serif",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background 0.1s",
                    }}
                  >
                    <span style={{ opacity: item.active ? 1 : 0.5, flexShrink: 0 }}>{item.icon}</span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.rightLabel && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: item.active ? "#D4A853" : "rgba(255,255,255,0.25)",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {item.rightLabel}
                      </span>
                    )}
                    {item.active && !item.rightLabel && (
                      <span style={{ fontSize: 10, color: "#D4A853" }}>
                        ●
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: "20px 16px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13, fontFamily: "system-ui, sans-serif" }}>
              No commands found
            </div>
          )}
        </div>

        {/* Zoom slider at bottom */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 16px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <ZoomIn className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
          <input
            type="range"
            min={50}
            max={150}
            value={settings.zoom}
            onChange={(e) => settings.setZoom(Number(e.target.value))}
            style={{ flex: 1, accentColor: "#D4A853", height: 4 }}
          />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "monospace", minWidth: 32, textAlign: "right" }}>
            {settings.zoom}%
          </span>
        </div>
      </div>
    </div>
  )
}

/** Tiny trigger dot in the corner */
export function CommandBarTrigger() {
  const { commandBarOpen, setCommandBarOpen } = useScreenplaySettings()

  if (commandBarOpen) return null

  return (
    <button
      type="button"
      onClick={() => setCommandBarOpen(true)}
      title="Editor settings (Cmd+/)"
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 50,
        width: 28,
        height: 28,
        borderRadius: "50%",
        border: "none",
        background: "rgba(255,255,255,0.04)",
        color: "rgba(255,255,255,0.15)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.2s",
        fontSize: 14,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.08)"
        e.currentTarget.style.color = "rgba(255,255,255,0.5)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.04)"
        e.currentTarget.style.color = "rgba(255,255,255,0.15)"
      }}
    >
      <Settings className="h-3.5 w-3.5" />
    </button>
  )
}
