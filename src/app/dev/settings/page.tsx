"use client"

import Link from "next/link"
import { ArrowLeft, RotateCcw } from "lucide-react"
import { useBoardStore } from "@/store/board"
import { useBreakdownConfigStore } from "@/store/breakdownConfig"
import { useStoryboardStore } from "@/store/storyboard"
import { ALL_MODELS } from "@/lib/models"
import { STYLE_PRESETS, getProjectStylePresetId } from "@/lib/projectStyle"
// Old cinematic config types removed — using breakdownConfig store directly
import { useReEditConfigStore } from "@/store/reEditConfig"
import { useThemeStore, type AppTheme } from "@/store/theme"
import { useScriptStore, DEMO_SCRIPT_LIST } from "@/store/script"

/* ─── Tiny reusable pieces ─── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-white/40">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-white/70">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white/90 outline-none backdrop-blur-sm transition-colors hover:border-white/20 focus:border-white/30"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#1a1a1a]">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-white/70">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 rounded-full transition-colors ${value ? "bg-[#DCC7A3]/60" : "bg-white/10"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : ""}`}
        />
      </button>
    </div>
  )
}

function RangeRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-white/70">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step ?? 1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-28 accent-[#DCC7A3]"
        />
        <span className="w-8 text-right text-xs text-white/50">{value}</span>
      </div>
    </div>
  )
}

function ButtonGroupRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-white/70">{label}</span>
      <div className="flex gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${
              value === o.value
                ? "bg-white/10 text-white/90"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─── Main page ─── */

export default function DevSettingsPage() {
  // Board store
  const theme = useBoardStore((s) => s.theme)
  const setTheme = useBoardStore((s) => s.setTheme)
  const selectedChatModel = useBoardStore((s) => s.selectedChatModel)
  const setSelectedChatModel = useBoardStore((s) => s.setSelectedChatModel)
  const selectedImageGenModel = useBoardStore((s) => s.selectedImageGenModel)
  const setSelectedImageGenModel = useBoardStore((s) => s.setSelectedImageGenModel)
  const selectedVideoModel = useBoardStore((s) => s.selectedVideoModel)
  const setSelectedVideoModel = useBoardStore((s) => s.setSelectedVideoModel)
  const projectStyle = useBoardStore((s) => s.projectStyle)
  const setProjectStyle = useBoardStore((s) => s.setProjectStyle)

  // Breakdown config store (simplified)
  const autoPromptBuild = useBreakdownConfigStore((s) => s.autoPromptBuild)
  const setAutoPromptBuild = useBreakdownConfigStore((s) => s.setAutoPromptBuild)
  const breakdownSpeed = useBreakdownConfigStore((s) => s.breakdownSpeed)
  const setBreakdownSpeed = useBreakdownConfigStore((s) => s.setBreakdownSpeed)
  const qualityModel = useBreakdownConfigStore((s) => s.qualityModel)
  const setQualityModel = useBreakdownConfigStore((s) => s.setQualityModel)
  const structuralModel = useBreakdownConfigStore((s) => s.structuralModel)
  const setStructuralModel = useBreakdownConfigStore((s) => s.setStructuralModel)

  // Re-Edit config store
  const reEdit = useReEditConfigStore((s) => s.config)
  const setReEdit = useReEditConfigStore((s) => s.setConfig)
  const resetReEdit = useReEditConfigStore((s) => s.resetConfig)

  // Storyboard store
  const cardScale = useStoryboardStore((s) => s.cardScale)
  const setCardScale = useStoryboardStore((s) => s.setCardScale)

  // Derived
  const currentStylePreset = getProjectStylePresetId(projectStyle)

  const textModels = ALL_MODELS.filter((m) => m.category === "text")
  const videoModels = ALL_MODELS.filter((m) => m.category === "video")

  const IMAGE_GEN_OPTIONS = [
    { value: "nano-banana-2", label: "Nano Banana 2 (Gemini Flash)" },
    { value: "nano-banana-pro", label: "Nano Banana Pro" },
    { value: "nano-banana", label: "Nano Banana (classic)" },
    { value: "gpt-image", label: "GPT Image (OpenAI)" },
  ]

  const handleStylePresetChange = (presetId: string) => {
    const preset = STYLE_PRESETS.find((p) => p.id === presetId)
    if (preset && preset.id !== "custom") {
      setProjectStyle(preset.prompt)
    }
  }

  const bdGlobal = {} as Record<string, string>
  const resetBdGlobal = () => {}
  const updateBd = (key: string, value: string) => {
    // Old breakdown config removed
  }

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-white/[0.06] bg-[#0e0e0e]/80 px-6 py-4 backdrop-blur-xl">
        <Link
          href="/dev"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-sm font-medium text-white/90">Developer Settings</h1>
          <p className="text-[11px] text-white/30">Engine configuration &amp; model parameters</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-6 py-8">

        {/* ─── Models ─── */}
        <Section title="Models">
          <SelectRow
            label="Chat / Analysis"
            value={selectedChatModel}
            onChange={setSelectedChatModel}
            options={textModels.map((m) => ({ value: m.id, label: `${m.name} — ${m.provider}` }))}
          />
          <SelectRow
            label="Image Generation"
            value={selectedImageGenModel}
            onChange={setSelectedImageGenModel}
            options={IMAGE_GEN_OPTIONS}
          />
          <SelectRow
            label="Video Generation"
            value={selectedVideoModel}
            onChange={setSelectedVideoModel}
            options={videoModels.map((m) => ({ value: m.id, label: `${m.name} — ${m.provider}` }))}
          />
        </Section>

        {/* ─── Visual Style ─── */}
        <Section title="Visual Style">
          <SelectRow
            label="Style Preset"
            value={currentStylePreset}
            onChange={handleStylePresetChange}
            options={STYLE_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
          />
          <div>
            <label className="mb-1.5 block text-sm text-white/70">Style Prompt</label>
            <textarea
              value={projectStyle}
              onChange={(e) => setProjectStyle(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/90 placeholder-white/20 outline-none transition-colors hover:border-white/20 focus:border-white/30"
              placeholder="Describe visual style..."
            />
          </div>
        </Section>

        {/* ─── Breakdown Engine ─── */}
        <Section title="Breakdown Engine">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.12em] text-white/30">Скорость и модели пайплайна</span>
            <button
              type="button"
              onClick={resetBdGlobal}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-white/40 transition-colors hover:bg-white/5 hover:text-white/60"
            >
              <RotateCcw size={11} />
              Reset
            </button>
          </div>

          <ButtonGroupRow
            label="Скорость"
            value={breakdownSpeed}
            onChange={setBreakdownSpeed}
            options={[
              { value: "fast", label: "⚡ Fast" },
              { value: "balanced", label: "⚖ Balanced" },
              { value: "quality", label: "✦ Quality" },
            ]}
          />
          <SelectRow
            label="Модель (креативные стадии)"
            value={qualityModel}
            onChange={setQualityModel}
            options={[
              { value: "gpt-4o", label: "GPT-4o" },
              { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
              { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
              { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
            ]}
          />
          <SelectRow
            label="Модель (структурные стадии)"
            value={structuralModel}
            onChange={setStructuralModel}
            options={[
              { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (быстрая)" },
              { value: "gpt-4o", label: "GPT-4o" },
              { value: "gpt-4o-mini", label: "GPT-4o Mini" },
              { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
            ]}
          />

          <div className="my-2 border-t border-white/[0.06]" />

          <ButtonGroupRow
            label="Shot Density"
            value={bdGlobal.shotDensity}
            onChange={(v) => updateBd("shotDensity", v)}
            options={[
              { value: "lean", label: "Lean" },
              { value: "balanced", label: "Balanced" },
              { value: "dense", label: "Dense" },
            ]}
          />
          <ButtonGroupRow
            label="Continuity"
            value={bdGlobal.continuityStrictness}
            onChange={(v) => updateBd("continuityStrictness", v)}
            options={[
              { value: "flexible", label: "Flexible" },
              { value: "standard", label: "Standard" },
              { value: "strict", label: "Strict" },
            ]}
          />
          <ButtonGroupRow
            label="Text Richness"
            value={bdGlobal.textRichness}
            onChange={(v) => updateBd("textRichness", v)}
            options={[
              { value: "simple", label: "Simple" },
              { value: "rich", label: "Rich" },
              { value: "lush", label: "Lush" },
            ]}
          />
          <ButtonGroupRow
            label="Relation Mode"
            value={bdGlobal.relationMode}
            onChange={(v) => updateBd("relationMode", v)}
            options={[
              { value: "minimal", label: "Minimal" },
              { value: "balanced", label: "Balanced" },
              { value: "explicit", label: "Explicit" },
            ]}
          />
          <ButtonGroupRow
            label="Fallback Mode"
            value={bdGlobal.fallbackMode}
            onChange={(v) => updateBd("fallbackMode", v)}
            options={[
              { value: "balanced", label: "Balanced" },
              { value: "prefer_speed", label: "Speed" },
              { value: "fail_fast", label: "Fail Fast" },
            ]}
          />
          <ButtonGroupRow
            label="Keyframe Policy"
            value={bdGlobal.keyframePolicy}
            onChange={(v) => updateBd("keyframePolicy", v)}
            options={[
              { value: "opening_anchor", label: "Opening" },
              { value: "story_turns", label: "Story Turns" },
              { value: "every_major_shift", label: "Every Shift" },
            ]}
          />
          <ToggleRow
            label="Auto-build prompts after breakdown"
            value={autoPromptBuild}
            onChange={setAutoPromptBuild}
          />
        </Section>

        {/* ─── Shot Re-Edit ─── */}
        <Section title="Shot Re-Edit">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.12em] text-white/30">Edit generated photos by instruction</span>
            <button
              type="button"
              onClick={resetReEdit}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-white/40 transition-colors hover:bg-white/5 hover:text-white/60"
            >
              <RotateCcw size={11} />
              Reset
            </button>
          </div>

          <SelectRow
            label="Model"
            value={reEdit.model}
            onChange={(v) => setReEdit({ model: v as typeof reEdit.model })}
            options={[
              { value: "auto", label: "Auto (follow Image Gen)" },
              ...IMAGE_GEN_OPTIONS,
            ]}
          />
          <RangeRow
            label="Max Reference Images"
            value={reEdit.maxReferenceImages}
            min={1}
            max={5}
            onChange={(v) => setReEdit({ maxReferenceImages: v })}
          />
          <ToggleRow
            label="Include current shot image"
            value={reEdit.includeCurrentImage}
            onChange={(v) => setReEdit({ includeCurrentImage: v })}
          />
          <ToggleRow
            label="Include Bible character refs"
            value={reEdit.includeBibleRefs}
            onChange={(v) => setReEdit({ includeBibleRefs: v })}
          />
          <ToggleRow
            label="Save to Library"
            value={reEdit.saveToLibrary}
            onChange={(v) => setReEdit({ saveToLibrary: v })}
          />
          <div>
            <label className="mb-1.5 block text-sm text-white/70">Custom Rules</label>
            <textarea
              value={reEdit.customRules}
              onChange={(e) => setReEdit({ customRules: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/90 placeholder-white/20 outline-none transition-colors hover:border-white/20 focus:border-white/30"
              placeholder="Additional rules for re-edit prompt (e.g. 'Always keep camera at eye level')..."
            />
          </div>
        </Section>

        {/* ─── UI / Display ─── */}
        <Section title="Interface">
          <ButtonGroupRow
            label="App Theme"
            value={useThemeStore.getState().theme}
            onChange={(v) => useThemeStore.getState().setTheme(v as AppTheme)}
            options={[
              { value: "cinematic", label: "🎬 Cinematic" },
              { value: "synthwave", label: "🌆 Synthwave" },
              { value: "architect", label: "📐 Architect" },
            ]}
          />
          <ButtonGroupRow
            label="Editor Theme"
            value={theme}
            onChange={setTheme as (v: string) => void}
            options={[
              { value: "sepia", label: "Sepia" },
              { value: "light", label: "Light" },
            ]}
          />
          <RangeRow
            label="Card Scale"
            value={cardScale}
            min={72}
            max={104}
            onChange={setCardScale}
          />
        </Section>

        {/* ─── Danger Zone ─── */}
        <Section title="Storage">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-white/70">LocalStorage Keys</span>
              <p className="text-[11px] text-white/30">koza-board, koza-breakdown-config-v1, koza-storyboard-v2</p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (confirm("Reset ALL settings to defaults? This cannot be undone.")) {
                  resetBdGlobal()
                  setCardScale(90)
                  setProjectStyle("Film noir, high contrast black and white, dramatic chiaroscuro lighting, deep shadows")
                  setSelectedChatModel("gpt-4o-mini")
                  setSelectedImageGenModel("nano-banana-2")
                  setSelectedVideoModel("veo-2")
                  setTheme("sepia")
                }
              }}
              className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-red-400/70 transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
              Reset All
            </button>
          </div>
        </Section>

        {/* ─── Reset All Data ─── */}
        <Section title="Reset All Data">
          <p className="text-[11px] text-white/30 mb-3">Clear all projects, scripts, Bible, timeline, voice data from localStorage. Start completely fresh.</p>
          <button
            type="button"
            onClick={() => {
              if (confirm("Are you sure? This will delete ALL data including projects, scripts, Bible, timeline, and voice clips. This cannot be undone.")) {
                const keys = Object.keys(localStorage).filter((k) => k.startsWith("koza-") || k.startsWith("piece-"))
                for (const k of keys) localStorage.removeItem(k)
                window.location.reload()
              }
            }}
            className="rounded-lg border border-red-500/30 bg-red-500/8 px-4 py-2.5 text-[12px] uppercase tracking-[0.12em] text-red-400 transition-colors hover:bg-red-500/15 hover:text-red-300"
          >
            Clear All Data & Reload
          </button>
        </Section>

      </main>
    </div>
  )
}
