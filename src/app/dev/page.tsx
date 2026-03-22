"use client"

import { ArrowDownToLine, ArrowLeft, Trash2 } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { Fragment, Suspense, useMemo, useState } from "react"
import type { LogEntry, LogEntryType } from "@/store/devlog"
import { useDevLogStore } from "@/store/devlog"

type FilterKey = "all" | "breakdown" | "image" | "bible" | "errors"

type GroupedBlock = {
  id: string
  group: string | null
  entries: LogEntry[]
  newestTimestamp: number
}

const PIPELINE_TYPES: LogEntryType[] = [
  "breakdown_start",
  "breakdown_prompt",
  "breakdown_request",
  "breakdown_response",
  "breakdown_result",
  "breakdown_error",
  "image_start",
  "image_prompt",
  "image_bible_inject",
  "image_style_inject",
  "image_api_call",
  "image_result",
  "image_error",
  "bible_sync",
  "scene_parse",
  "prompt_build",
]

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "breakdown", label: "Breakdown" },
  { key: "image", label: "Image" },
  { key: "bible", label: "Bible" },
  { key: "errors", label: "Errors" },
]

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp)
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp)
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }

  return `${(durationMs / 1000).toFixed(1)}s`
}

function isEntryVisible(entry: LogEntry, filter: FilterKey): boolean {
  if (filter === "all") return true
  if (filter === "breakdown") return entry.type.startsWith("breakdown_")
  if (filter === "image") return entry.type.startsWith("image_") || entry.type === "prompt_build"
  if (filter === "bible") return entry.type === "bible_sync" || entry.type === "scene_parse"
  return entry.type.includes("error") || entry.type === "warning" || entry.type === "error"
}

function isPipelineEntry(entry: LogEntry): boolean {
  return PIPELINE_TYPES.includes(entry.type)
}

function colorByType(type: LogEntryType): string {
  if (type.startsWith("breakdown_")) return "bg-[#D4A853]"
  if (type.startsWith("image_") || type === "prompt_build") return "bg-[#4A7C6F]"
  if (type === "bible_sync" || type === "scene_parse") return "bg-[#7C4A6F]"
  if (type === "warning") return "bg-[#7C6F4A]"
  if (type.includes("error") || type === "error") return "bg-[#7C4A4A]"
  return "bg-white/30"
}

function badgeByType(type: LogEntryType): string {
  if (type.startsWith("breakdown_")) return "bg-[#D4A853]/15 text-[#D4A853]"
  if (type.startsWith("image_") || type === "prompt_build") return "bg-[#4A7C6F]/15 text-[#78B3A2]"
  if (type === "bible_sync" || type === "scene_parse") return "bg-[#7C4A6F]/15 text-[#C58DB2]"
  if (type === "warning") return "bg-[#7C6F4A]/15 text-[#D9C57C]"
  if (type.includes("error") || type === "error") return "bg-[#7C4A4A]/15 text-[#E0A5A5]"
  return "bg-white/5 text-white/50"
}

function buildGroupSummary(entries: LogEntry[]): string {
  const ordered = [...entries].sort((left, right) => left.timestamp - right.timestamp)
  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  const shotCount = ordered.find((entry) => typeof entry.meta?.shotCount === "number")?.meta?.shotCount as number | undefined
  const timing = ordered.find((entry) => typeof entry.meta?.timing === "number")?.meta?.timing as number | undefined
  const derivedTiming = timing ?? Math.max(0, last.timestamp - first.timestamp)
  const sceneId = ordered.find((entry) => typeof entry.meta?.sceneId === "string")?.meta?.sceneId as string | undefined
  const shotId = ordered.find((entry) => typeof entry.meta?.shotId === "string")?.meta?.shotId as string | undefined
  const prefix = first.type.startsWith("breakdown_")
    ? `Breakdown ${sceneId ?? first.title}`
    : first.type.startsWith("image_")
      ? `Generate ${shotId ?? first.title}`
      : first.title

  const parts = [`${ordered.length} steps`]

  if (typeof shotCount === "number") {
    parts.push(`${shotCount} shots`)
  }

  if (derivedTiming > 0) {
    parts.push(formatDuration(derivedTiming))
  }

  return `${prefix}: ${parts.join(", ")}`
}

function sanitizeFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "koza-devlog"
}

function formatEntryDocument(entry: LogEntry): string {
  const metaSection = entry.meta && Object.keys(entry.meta).length > 0
    ? `\n## Meta\n\n${Object.entries(entry.meta)
      .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
      .join("\n")}`
    : ""

  const detailsSection = entry.details
    ? `\n## Details\n\n\`\`\`\n${entry.details}\n\`\`\``
    : ""

  return `# KOZA Operation Log\n\n## Entry\n\n- Timestamp: ${formatDateTime(entry.timestamp)}\n- Type: ${entry.type}\n- Title: ${entry.title}\n- Group: ${entry.group || "none"}${metaSection}${detailsSection}\n`
}

function formatGroupDocument(entries: LogEntry[]): string {
  const ordered = [...entries].sort((left, right) => left.timestamp - right.timestamp)
  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  const durationMs = Math.max(0, last.timestamp - first.timestamp)
  const summary = buildGroupSummary(ordered)

  const sections = ordered.map((entry, index) => {
    const metaSection = entry.meta && Object.keys(entry.meta).length > 0
      ? Object.entries(entry.meta)
        .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
        .join("\n")
      : "- none"

    const details = entry.details || "No details"

    return `## Step ${index + 1} — ${entry.title}\n\n- Timestamp: ${formatDateTime(entry.timestamp)}\n- Type: ${entry.type}\n- Group: ${entry.group || "none"}\n\n### Meta\n\n${metaSection}\n\n### Details\n\n\`\`\`\n${details}\n\`\`\``
  })

  return `# KOZA Operation Log\n\n## Summary\n\n- Operation: ${summary}\n- Started: ${formatDateTime(first.timestamp)}\n- Finished: ${formatDateTime(last.timestamp)}\n- Duration: ${formatDuration(durationMs)}\n- Entries: ${ordered.length}\n- Group: ${first.group || "none"}\n\n${sections.join("\n\n")}`
}

function formatFullPipelineDocument(entries: LogEntry[]): string {
  const ordered = [...entries].sort((left, right) => left.timestamp - right.timestamp)

  if (ordered.length === 0) {
    return "# KOZA Full Pipeline Log\n\nNo pipeline entries recorded.\n"
  }

  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  const grouped = new Map<string, LogEntry[]>()

  for (const entry of ordered) {
    const key = entry.group || `single-${entry.id}`
    const next = grouped.get(key) ?? []
    next.push(entry)
    grouped.set(key, next)
  }

  const sections = Array.from(grouped.entries()).map(([key, blockEntries], index) => {
    const groupTitle = blockEntries[0]?.group
      ? buildGroupSummary(blockEntries)
      : blockEntries[0]?.title || key

    const steps = blockEntries.map((entry, stepIndex) => {
      const metaSection = entry.meta && Object.keys(entry.meta).length > 0
        ? Object.entries(entry.meta)
          .map(([metaKey, metaValue]) => `- ${metaKey}: ${JSON.stringify(metaValue)}`)
          .join("\n")
        : "- none"

      return `### ${index + 1}.${stepIndex + 1} ${entry.title}\n\n- Timestamp: ${formatDateTime(entry.timestamp)}\n- Type: ${entry.type}\n\n#### Meta\n\n${metaSection}\n\n#### Details\n\n\`\`\`\n${entry.details || "No details"}\n\`\`\``
    })

    return `## Block ${index + 1} — ${groupTitle}\n\n- Group: ${blockEntries[0]?.group || "none"}\n- Entries: ${blockEntries.length}\n\n${steps.join("\n\n")}`
  })

  return `# KOZA Full Pipeline Log\n\n## Summary\n\n- Started: ${formatDateTime(first.timestamp)}\n- Finished: ${formatDateTime(last.timestamp)}\n- Duration: ${formatDuration(Math.max(0, last.timestamp - first.timestamp))}\n- Total entries: ${ordered.length}\n- Blocks: ${grouped.size}\n\n${sections.join("\n\n")}`
}

function triggerDownload(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = fileName
  link.click()

  URL.revokeObjectURL(url)
}

function groupEntries(entries: LogEntry[]): GroupedBlock[] {
  const ordered = [...entries]
  const groups = new Map<string, LogEntry[]>()
  const blocks: GroupedBlock[] = []
  const seenGroups = new Set<string>()

  for (const entry of ordered) {
    if (entry.group) {
      const next = groups.get(entry.group) ?? []
      next.push(entry)
      groups.set(entry.group, next)

      if (!seenGroups.has(entry.group)) {
        seenGroups.add(entry.group)
        blocks.push({
          id: entry.group,
          group: entry.group,
          entries: [],
          newestTimestamp: entry.timestamp,
        })
      }

      continue
    }

    blocks.push({
      id: entry.id,
      group: null,
      entries: [entry],
      newestTimestamp: entry.timestamp,
    })
  }

  return blocks.map((block) => {
    if (!block.group) {
      return block
    }

    const groupedEntries = [...(groups.get(block.group) ?? [])].sort((left, right) => left.timestamp - right.timestamp)
    return {
      ...block,
      entries: groupedEntries,
      newestTimestamp: Math.max(...groupedEntries.map((entry) => entry.timestamp)),
    }
  })
}

function LogCard({
  entry,
  expanded,
  onToggle,
  onDownload,
}: {
  entry: LogEntry
  expanded: boolean
  onToggle: () => void
  onDownload?: () => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/8">
      <div
        className="flex cursor-pointer items-center gap-3 bg-white/2 px-3 py-2"
        onClick={onToggle}
      >
        <div className={`h-2 w-2 rounded-full ${colorByType(entry.type)}`} />
        <span className="w-20 font-mono text-[10px] text-white/30">{formatTime(entry.timestamp)}</span>
        <span className={`rounded px-1.5 py-0.5 text-[9px] uppercase ${badgeByType(entry.type)}`}>
          {entry.type.replaceAll("_", " ")}
        </span>
        <span className="flex-1 truncate text-[12px] text-white/80">{entry.title}</span>
        {entry.meta?.timing && (
          <span className="text-[9px] text-white/30">{entry.meta.timing}ms</span>
        )}
        {entry.meta?.model && (
          <span className="text-[9px] text-[#D4A853]/60">{String(entry.meta.model)}</span>
        )}
        {onDownload && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onDownload()
            }}
            className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] text-white/45 transition hover:text-white/75"
          >
            <span className="inline-flex items-center gap-1">
              <ArrowDownToLine className="h-3 w-3" />
              Download
            </span>
          </button>
        )}
        <span className="text-white/20">{expanded ? "▾" : "▸"}</span>
      </div>

      {expanded && (
        <div className="border-t border-white/5 px-3 py-2">
          <pre className="max-h-100 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-white/40">
            {entry.details || "No details"}
          </pre>
          {entry.meta && Object.keys(entry.meta).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(entry.meta).map(([key, value]) => (
                <span key={key} className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-white/30">
                  {key}: {JSON.stringify(value)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DevConsoleContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get("from") || "/"
  const entries = useDevLogStore((state) => state.entries)
  const clear = useDevLogStore((state) => state.clear)
  const enabled = useDevLogStore((state) => state.enabled)
  const setEnabled = useDevLogStore((state) => state.setEnabled)
  const [filter, setFilter] = useState<FilterKey>("all")
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({})

  const visibleEntries = useMemo(
    () => entries.filter((entry) => isEntryVisible(entry, filter)),
    [entries, filter],
  )

  const pipelineEntries = useMemo(
    () => entries.filter((entry) => isPipelineEntry(entry)),
    [entries],
  )

  const blocks = useMemo(() => groupEntries(visibleEntries), [visibleEntries])

  const downloadEntry = (entry: LogEntry) => {
    const fileName = `${sanitizeFileName(entry.group || entry.title || entry.type)}-${entry.id}.md`
    triggerDownload(fileName, formatEntryDocument(entry))
  }

  const downloadGroup = (block: GroupedBlock) => {
    if (block.entries.length === 0) return

    const leadEntry = block.entries[0]
    const fileName = `${sanitizeFileName(block.group || leadEntry.title || leadEntry.type)}.md`
    triggerDownload(fileName, formatGroupDocument(block.entries))
  }

  const downloadFullPipelineLog = () => {
    triggerDownload("koza-full-pipeline-log.md", formatFullPipelineDocument(pipelineEntries))
  }

  return (
    <main className="min-h-screen bg-[#0E0D0B] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(from)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-3 py-2 text-sm text-white/70 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div>
              <h1 className="text-lg font-semibold tracking-[0.24em] text-white/90">KOZA DEV CONSOLE</h1>
              <p className="text-xs text-white/35">System breakdown, image generation, prompt and sync logs</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={downloadFullPipelineLog}
              className="inline-flex items-center gap-2 rounded-full border border-[#D4A853]/25 bg-[#D4A853]/10 px-3 py-2 text-sm text-[#E8C778] transition hover:bg-[#D4A853]/15"
            >
              <ArrowDownToLine className="h-4 w-4" />
              Export Full Log
            </button>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`rounded-full border px-3 py-2 text-[11px] uppercase tracking-[0.16em] transition ${
                enabled
                  ? "border-[#4A7C6F]/40 bg-[#4A7C6F]/15 text-[#9DCCBF]"
                  : "border-white/10 bg-white/4 text-white/45"
              }`}
            >
              {enabled ? "Logging On" : "Logging Off"}
            </button>
            <button
              onClick={clear}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-3 py-2 text-sm text-white/65 transition hover:text-white"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 py-4">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition ${
                filter === item.key
                  ? "border-white/20 bg-white/10 text-white"
                  : "border-white/8 bg-white/3 text-white/35 hover:text-white/70"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="h-[calc(100vh-148px)] overflow-y-auto pr-1">
            {blocks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/2 px-6 py-10 text-center text-sm text-white/35">
                No logs yet.
              </div>
            ) : (
              <div className="space-y-3 pb-8">
                {blocks.map((block) => {
                  if (!block.group) {
                    const entry = block.entries[0]
                    return (
                      <LogCard
                        key={entry.id}
                        entry={entry}
                        expanded={Boolean(expandedEntries[entry.id])}
                        onDownload={() => downloadEntry(entry)}
                        onToggle={() => setExpandedEntries((current) => ({
                          ...current,
                          [entry.id]: !current[entry.id],
                        }))}
                      />
                    )
                  }

                  const expanded = expandedGroups[block.id] ?? true
                  const leadType = block.entries[0]?.type ?? "info"

                  return (
                    <div key={block.id} className="rounded-xl border border-white/8 bg-white/1.5">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setExpandedGroups((current) => ({
                            ...current,
                            [block.id]: !expanded,
                          }))}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <div className={`h-2.5 w-2.5 rounded-full ${colorByType(leadType)}`} />
                          <span className="font-mono text-[10px] text-white/30">{formatTime(block.newestTimestamp)}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[9px] uppercase ${badgeByType(leadType)}`}>
                            {block.entries.length} entries
                          </span>
                          <span className="flex-1 truncate text-[12px] text-white/85">{buildGroupSummary(block.entries)}</span>
                          <span className="text-white/20">{expanded ? "▾" : "▸"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadGroup(block)}
                          className="shrink-0 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/50 transition hover:text-white/80"
                        >
                          <span className="inline-flex items-center gap-1">
                            <ArrowDownToLine className="h-3 w-3" />
                            Download
                          </span>
                        </button>
                      </div>

                      {expanded && (
                        <div className="space-y-2 border-t border-white/5 px-2 pb-2 pt-2">
                          {block.entries.map((entry) => (
                            <Fragment key={entry.id}>
                              <LogCard
                                entry={entry}
                                expanded={Boolean(expandedEntries[entry.id])}
                                onDownload={() => downloadEntry(entry)}
                                onToggle={() => setExpandedEntries((current) => ({
                                  ...current,
                                  [entry.id]: !current[entry.id],
                                }))}
                              />
                            </Fragment>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

export default function DevConsolePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#0E0D0B] text-white" />}>
      <DevConsoleContent />
    </Suspense>
  )
}