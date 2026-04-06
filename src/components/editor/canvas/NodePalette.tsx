"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Search, X, FileText, ImageIcon, Film, Volume2, BookOpen, Palette, Cpu, Pencil, Sparkles, Video, Download, Eye, GitBranch, StickyNote, Columns } from "lucide-react"
import { getNodesByCategory, NODE_REGISTRY } from "@/lib/canvas/nodeRegistry"
import type { NodeCategory, NodeTypeDefinition } from "@/lib/canvas/canvasTypes"

const CATEGORY_LABELS: Record<NodeCategory, string> = {
  source: "Source",
  reference: "Reference",
  processing: "Processing",
  generation: "Generation",
  output: "Output",
  helper: "Helper",
}

const CATEGORY_ORDER: NodeCategory[] = [
  "source", "reference", "processing", "generation", "output", "helper",
]

const NODE_ICONS: Record<string, typeof FileText> = {
  blockText: FileText,
  imageImport: ImageIcon,
  videoImport: Film,
  audioImport: Volume2,
  bibleRef: BookOpen,
  styleInput: Palette,
  promptBuilder: Cpu,
  promptEditor: Pencil,
  imageGen: Sparkles,
  videoGen: Video,
  shotOutput: Download,
  preview: Eye,
  router: GitBranch,
  stickyNote: StickyNote,
  compare: Columns,
}

interface NodePaletteProps {
  position: { x: number; y: number }
  canvasPosition: { x: number; y: number }
  onAdd: (type: string, position: { x: number; y: number }) => void
  onClose: () => void
}

export function NodePalette({ position, canvasPosition, onAdd, onClose }: NodePaletteProps) {
  const [search, setSearch] = useState("")
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  const grouped = getNodesByCategory()
  const lowerSearch = search.toLowerCase()

  // Flatten visible nodes for keyboard nav
  const flatNodes: NodeTypeDefinition[] = []
  for (const cat of CATEGORY_ORDER) {
    for (const def of grouped[cat]) {
      if (!search || def.label.toLowerCase().includes(lowerSearch) || def.type.toLowerCase().includes(lowerSearch)) {
        flatNodes.push(def)
      }
    }
  }

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIdx((i) => Math.min(i + 1, flatNodes.length - 1))
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIdx((i) => Math.max(i - 1, 0))
      }
      if (e.key === "Enter" && flatNodes[selectedIdx]) {
        e.preventDefault()
        onAdd(flatNodes[selectedIdx].type, canvasPosition)
        onClose()
      }
      // Escape handled by BlockCanvas parent
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [flatNodes, selectedIdx, onAdd, canvasPosition, onClose])

  // Reset selection on search change
  useEffect(() => { setSelectedIdx(0) }, [search])

  const handleAdd = useCallback((type: string) => {
    onAdd(type, canvasPosition)
    onClose()
  }, [onAdd, canvasPosition, onClose])

  let flatIdx = 0

  return (
    <div
      ref={panelRef}
      className="fixed z-[300] w-60 rounded-2xl border border-white/[0.08] bg-[#111215]/95 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden"
      style={{ left: position.x, top: position.y }}
    >
      {/* Search */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
        <Search size={12} className="text-white/25 shrink-0" />
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search nodes..."
          className="flex-1 bg-transparent text-[11px] text-white/70 placeholder:text-white/20 outline-none"
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-white/20 hover:text-white/40">
            <X size={10} />
          </button>
        )}
      </div>

      {/* Categories */}
      <div className="max-h-80 overflow-y-auto p-1.5">
        {CATEGORY_ORDER.map((cat) => {
          const nodes = grouped[cat].filter(
            (def) => !search || def.label.toLowerCase().includes(lowerSearch) || def.type.toLowerCase().includes(lowerSearch),
          )
          if (nodes.length === 0) return null
          return (
            <div key={cat} className="mb-1.5">
              <div className="px-2 py-1 text-[8px] font-bold uppercase tracking-[0.2em] text-white/20">
                {CATEGORY_LABELS[cat]}
              </div>
              {nodes.map((def) => {
                const thisIdx = flatIdx++
                const isSelected = thisIdx === selectedIdx
                const Icon = NODE_ICONS[def.type] || FileText
                return (
                  <button
                    key={def.type}
                    onClick={() => handleAdd(def.type)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${isSelected ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"}`}
                  >
                    <div
                      className="flex h-6 w-6 items-center justify-center rounded-lg shrink-0"
                      style={{ backgroundColor: def.color + "15", color: def.color }}
                    >
                      <Icon size={12} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-[11px] block ${isSelected ? "text-white/90" : "text-white/60"}`}>
                        {def.label}
                      </span>
                      <span className="text-[8px] text-white/20">{def.inputs.length} in / {def.outputs.length} out</span>
                    </div>
                    {def.hasRunButton && (
                      <span className="text-[7px] rounded bg-[#D4A853]/15 px-1.5 py-0.5 text-[#D4A853]/60 uppercase font-bold">Gen</span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
        {flatNodes.length === 0 && (
          <div className="py-6 text-center text-[10px] text-white/20">No matching nodes</div>
        )}
      </div>

      {/* Footer hint */}
      <div className="border-t border-white/[0.04] px-3 py-1.5 flex items-center gap-3 text-[8px] text-white/15">
        <span>arrows to navigate</span>
        <span>enter to add</span>
        <span>esc to close</span>
      </div>
    </div>
  )
}
