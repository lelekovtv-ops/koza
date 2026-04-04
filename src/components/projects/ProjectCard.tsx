"use client"

/**
 * ProjectCard — карточка проекта в сетке.
 * Hover: стек превью-картинок меняется (как в DaVinci).
 * Клик = выбор, двойной клик = открыть.
 */

import { useState, useCallback, useRef, useEffect } from "react"
import { Film } from "lucide-react"
import type { Project } from "@/store/projects"

interface ProjectCardProps {
  project: Project
  isSelected: boolean
  onClick: () => void
  onDoubleClick: () => void
}

// Placeholder colors for projects without images
const PLACEHOLDER_GRADIENTS = [
  "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
  "linear-gradient(135deg, #2d1b2e 0%, #1e1233 50%, #0d1137 100%)",
  "linear-gradient(135deg, #1b2e1e 0%, #122e1a 50%, #0d3712 100%)",
  "linear-gradient(135deg, #2e2a1b 0%, #332e12 50%, #37300d 100%)",
  "linear-gradient(135deg, #2e1b1b 0%, #331212 50%, #370d0d 100%)",
  "linear-gradient(135deg, #1b2e2e 0%, #123333 50%, #0d3737 100%)",
]

function getGradient(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  }
  return PLACEHOLDER_GRADIENTS[Math.abs(hash) % PLACEHOLDER_GRADIENTS.length]
}

export function ProjectCard({ project, isSelected, onClick, onDoubleClick }: ProjectCardProps) {
  const [hovered, setHovered] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // TODO: In the future, pull actual preview images from project data
  // For now, show a placeholder with project initial
  const previewCount = 0 // Will come from project.previews.length

  // Hover cycling through preview images
  useEffect(() => {
    if (hovered && previewCount > 1) {
      intervalRef.current = setInterval(() => {
        setPreviewIndex((i) => (i + 1) % previewCount)
      }, 800)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
      setPreviewIndex(0)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [hovered, previewCount])

  const timeAgo = getTimeAgo(project.updatedAt)

  return (
    <div
      className="group cursor-pointer"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thumbnail */}
      <div
        className="relative aspect-video rounded-lg overflow-hidden transition-all duration-200"
        style={{
          border: isSelected
            ? "2px solid rgba(212, 168, 83, 0.6)"
            : "2px solid transparent",
          boxShadow: isSelected
            ? "0 0 20px rgba(212, 168, 83, 0.15)"
            : hovered
              ? "0 4px 20px rgba(0,0,0,0.4)"
              : "0 2px 8px rgba(0,0,0,0.2)",
          transform: hovered ? "translateY(-2px)" : "none",
        }}
      >
        {/* Placeholder background */}
        <div
          className="absolute inset-0"
          style={{ background: getGradient(project.id) }}
        />

        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Film size={32} className="text-white/10" />
        </div>

        {/* Hover overlay */}
        <div
          className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200"
        />

        {/* Selection check */}
        {isSelected && (
          <div className="absolute top-2 left-2 w-5 h-5 rounded bg-[#D4A853] flex items-center justify-center">
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}

        {/* Preview dots (for when we have images) */}
        {previewCount > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {Array.from({ length: Math.min(previewCount, 5) }).map((_, i) => (
              <div
                key={i}
                className="w-1 h-1 rounded-full transition-colors"
                style={{
                  background: i === previewIndex ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.25)",
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Project name */}
      <div className="mt-2 px-0.5">
        <div
          className="text-xs font-medium truncate transition-colors"
          style={{
            color: isSelected ? "#D4A853" : "rgba(255,255,255,0.5)",
          }}
        >
          {project.name}
        </div>
        <div className="text-[10px] text-white/20 mt-0.5">
          {timeAgo}
        </div>
      </div>
    </div>
  )
}

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}
