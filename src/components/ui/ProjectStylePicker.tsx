"use client"

import { STYLE_PRESETS, getProjectStylePresetId } from "@/lib/projectStyle"

interface ProjectStylePickerProps {
  projectStyle: string
  setProjectStyle: (style: string) => void
}

export function ProjectStylePicker({ projectStyle, setProjectStyle }: ProjectStylePickerProps) {
  const selectedPresetId = getProjectStylePresetId(projectStyle)

  return (
    <div className="flex items-start gap-2">
      <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1">
        <span className="px-1 text-[8px] uppercase tracking-wider text-white/30">Style:</span>
        <select
          value={selectedPresetId}
          onChange={(event) => {
            const preset = STYLE_PRESETS.find((entry) => entry.id === event.target.value)
            setProjectStyle(preset?.id === "custom" ? "" : (preset?.prompt ?? ""))
          }}
          className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[9px] text-white/60 outline-none"
        >
          {STYLE_PRESETS.map((stylePreset) => (
            <option key={stylePreset.id} value={stylePreset.id} className="bg-[#1a1d24] text-white">
              {stylePreset.label}
            </option>
          ))}
        </select>
      </div>

      {selectedPresetId === "custom" ? (
        <textarea
          value={projectStyle}
          onChange={(event) => setProjectStyle(event.target.value)}
          rows={2}
          placeholder="Custom visual style..."
          className="min-h-13 w-52 resize-none rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/70 outline-none placeholder:text-white/30"
        />
      ) : null}
    </div>
  )
}