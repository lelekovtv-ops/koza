"use client"

import { useCallback } from "react"
import { X } from "lucide-react"
import { useBlockCanvasStore } from "@/store/blockCanvas"
import { getNodeDef } from "@/lib/canvas/nodeRegistry"
import type { Node } from "@xyflow/react"

interface NodeSidebarProps {
  node: Node
  onClose: () => void
}

export function NodeSidebar({ node, onClose }: NodeSidebarProps) {
  const updateNodeData = useBlockCanvasStore((s) => s.updateNodeData)
  const def = getNodeDef(node.type || "")

  const update = useCallback(
    (key: string, value: unknown) => {
      updateNodeData(node.id, { [key]: value })
    },
    [node.id, updateNodeData],
  )

  if (!def) return null

  const data = node.data as Record<string, unknown>

  return (
    <div className="absolute right-0 top-0 bottom-0 z-20 w-72 border-l border-white/[0.06] bg-[#14151A]/95 backdrop-blur-md overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: def.color }} />
          <span className="text-[11px] font-medium text-white/70">{def.label}</span>
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-white/25 hover:bg-white/5 hover:text-white/50"
        >
          <X size={12} />
        </button>
      </div>

      {/* Parameters */}
      <div className="p-4 space-y-4">
        {/* Node type info */}
        <div>
          <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/20 mb-1">Type</div>
          <div className="text-[10px] text-white/40">{def.category} / {def.type}</div>
        </div>

        {/* Ports info */}
        {def.inputs.length > 0 && (
          <div>
            <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/20 mb-1">Inputs</div>
            {def.inputs.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5 py-0.5">
                <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `var(--port-${p.dataType}, #6B7280)` }} />
                <span className="text-[10px] text-white/40">{p.label}</span>
                <span className="text-[8px] text-white/15 ml-auto">{p.dataType}</span>
              </div>
            ))}
          </div>
        )}

        {def.outputs.length > 0 && (
          <div>
            <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/20 mb-1">Outputs</div>
            {def.outputs.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5 py-0.5">
                <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `var(--port-${p.dataType}, #6B7280)` }} />
                <span className="text-[10px] text-white/40">{p.label}</span>
                <span className="text-[8px] text-white/15 ml-auto">{p.dataType}</span>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-white/[0.04] pt-3">
          <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/20 mb-2">Parameters</div>

          {/* Dynamic parameter editors based on node type */}
          {renderParams(def.type, data, update)}
        </div>
      </div>
    </div>
  )
}

// ─── Parameter Renderers ────────────────────────────────────

function renderParams(
  type: string,
  data: Record<string, unknown>,
  update: (key: string, value: unknown) => void,
) {
  switch (type) {
    case "imageGen":
      return (
        <div className="space-y-3">
          <ParamSelect
            label="Model"
            value={data.model as string}
            options={["nano-banana", "nano-banana-2", "nano-banana-pro", "gpt-image"]}
            onChange={(v) => update("model", v)}
          />
        </div>
      )

    case "videoGen":
      return (
        <div className="space-y-3">
          <ParamSelect
            label="Model"
            value={data.model as string}
            options={["video-gen-1"]}
            onChange={(v) => update("model", v)}
          />
        </div>
      )

    case "styleInput":
      return (
        <div className="space-y-3">
          <ParamToggle
            label="Enabled"
            value={data.enabled as boolean}
            onChange={(v) => update("enabled", v)}
          />
          <ParamText
            label="Style Prompt"
            value={data.stylePrompt as string}
            onChange={(v) => update("stylePrompt", v)}
            multiline
          />
        </div>
      )

    case "promptEditor":
      return (
        <div className="space-y-3">
          <ParamText
            label="Prompt"
            value={data.editedPrompt as string}
            onChange={(v) => update("editedPrompt", v)}
            multiline
          />
          <ParamToggle
            label="Use Edited"
            value={data.useEdited as boolean}
            onChange={(v) => update("useEdited", v)}
          />
        </div>
      )

    case "shotOutput":
    case "output":
      return (
        <div className="space-y-3">
          <ParamNumber
            label="Duration (ms)"
            value={data.duration as number}
            onChange={(v) => update("duration", v)}
            min={100}
            max={60000}
            step={100}
          />
        </div>
      )

    case "compare":
      return (
        <div className="space-y-3">
          <ParamSelect
            label="Mode"
            value={data.mode as string}
            options={["slider", "toggle"]}
            onChange={(v) => update("mode", v)}
          />
        </div>
      )

    case "stickyNote":
      return (
        <ParamText
          label="Text"
          value={data.text as string}
          onChange={(v) => update("text", v)}
          multiline
        />
      )

    default:
      return <div className="text-[10px] text-white/20 italic">No editable parameters</div>
  }
}

// ─── Param widgets ──────────────────────────────────────────

function ParamSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-[9px] text-white/30 mb-1">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-[10px] text-white/60 outline-none"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function ParamToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[9px] text-white/30">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`h-5 w-9 rounded-full transition-colors ${value ? "bg-[#D4A853]/40" : "bg-white/10"}`}
      >
        <div className={`h-3.5 w-3.5 rounded-full bg-white/80 transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </div>
  )
}

function ParamText({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <div>
      <div className="text-[9px] text-white/30 mb-1">{label}</div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 text-[10px] text-white/60 font-mono outline-none focus:border-white/15"
          rows={4}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-[10px] text-white/60 outline-none focus:border-white/15"
        />
      )}
    </div>
  )
}

function ParamNumber({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <div>
      <div className="text-[9px] text-white/30 mb-1">{label}</div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-[10px] text-white/60 outline-none focus:border-white/15"
      />
    </div>
  )
}
