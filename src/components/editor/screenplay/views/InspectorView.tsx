"use client"

import Image from "next/image"
import { BookOpen, Camera, Clapperboard, Film, Image as ImageIcon } from "lucide-react"
import type { TimelineShot } from "@/store/timeline"
import type { CharacterEntry, LocationEntry, PropEntry } from "@/lib/bibleParser"
import { buildImagePrompt, buildVideoPrompt, getReferencedBibleEntries } from "@/lib/promptBuilder"
import { EditableDuration } from "../StoryboardShared"

type EditableShotField = "caption" | "directorNote" | "cameraNote" | "imagePrompt" | "videoPrompt"

interface InspectorViewProps {
  shots: TimelineShot[]
  expandedShotId: string | null
  onToggleExpand: (shotId: string) => void
  editingShotField: { shotId: string; field: EditableShotField } | null
  editingShotDraft: string
  onStartEdit: (shot: TimelineShot, field: EditableShotField, value: string) => void
  onCommitEdit: (shotId: string) => void
  onDraftChange: (value: string) => void
  onUpdateShot: (shotId: string, patch: Partial<TimelineShot>) => void
  characters: CharacterEntry[]
  locations: LocationEntry[]
  bibleProps: PropEntry[]
  projectStyle: string
}

export function InspectorView({
  shots,
  expandedShotId,
  onToggleExpand,
  editingShotField,
  editingShotDraft,
  onStartEdit,
  onCommitEdit,
  onDraftChange,
  onUpdateShot,
  characters,
  locations,
  bibleProps,
  projectStyle,
}: InspectorViewProps) {
  if (shots.length === 0) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center py-16 text-center">
        <BookOpen size={28} className="mb-3 text-white/15" />
        <p className="text-[12px] text-[#7F8590]">No shots to inspect yet.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {shots.map((shot, index) => {
        const isExpanded = expandedShotId === shot.id
        const resolvedShot = editingShotField?.shotId === shot.id
          ? { ...shot, [editingShotField.field]: editingShotDraft }
          : shot
        const imagePrompt = resolvedShot.imagePrompt || buildImagePrompt(resolvedShot, characters, locations, projectStyle, bibleProps)
        const videoPrompt = resolvedShot.videoPrompt || buildVideoPrompt(resolvedShot, characters, locations, projectStyle, bibleProps)
        const refs = getReferencedBibleEntries(resolvedShot, characters, locations)
        const previewSrc = shot.thumbnailUrl || shot.svg || null

        return (
          <div
            key={shot.id}
            className={`mb-2 overflow-hidden rounded-xl border transition-colors ${isExpanded ? "border-white/15 bg-white/3" : "border-white/8 bg-white/2 hover:bg-white/4"}`}
          >
            <button
              type="button"
              onClick={() => onToggleExpand(shot.id)}
              className="flex w-full items-center gap-3 px-3 py-3 text-left"
            >
              <div className="relative h-9 w-16 overflow-hidden rounded-md border border-white/8 bg-white/3">
                {previewSrc ? (
                  <Image src={previewSrc} alt="" fill unoptimized className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-[0.16em] text-white/25">
                    No Img
                  </div>
                )}
              </div>
              <div className="w-8 shrink-0 text-[16px] font-medium tracking-[0.14em] text-[#E7E3DC]">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[#E7E3DC]">
                  {shot.label || `Shot ${index + 1}`}
                </p>
                <p className="mt-1 flex items-center gap-1 truncate text-[10px] text-white/35">
                  {shot.shotSize || "WIDE"} · {shot.cameraMotion || "Static"} · <EditableDuration durationMs={shot.duration} onChange={(ms) => onUpdateShot(shot.id, { duration: ms })} />
                </p>
              </div>
              <div className={`shrink-0 text-[16px] text-white/40 transition-transform ${isExpanded ? "rotate-90" : "rotate-0"}`}>
                ▸
              </div>
            </button>

            {isExpanded ? (
              <div className="grid gap-3 border-t border-white/8 px-3 pb-3 pt-2">
                <section className="grid gap-1.5">
                  <div className="flex items-center gap-2">
                    <BookOpen size={12} className="text-white/35" />
                    <p className="text-[10px] uppercase tracking-wider text-white/30">Литературный</p>
                  </div>
                  {editingShotField?.shotId === shot.id && editingShotField.field === "caption" ? (
                    <textarea
                      autoFocus
                      rows={4}
                      value={editingShotDraft}
                      onChange={(event) => onDraftChange(event.target.value)}
                      onBlur={() => onCommitEdit(shot.id)}
                      className="w-full resize-y rounded-lg bg-white/3 p-3 text-[13px] text-white/80 outline-none ring-1 ring-inset ring-white/10"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onStartEdit(shot, "caption", shot.caption || "")}
                      className="w-full rounded-lg bg-white/3 p-3 text-left text-[13px] text-white/80 transition-colors hover:bg-white/4"
                    >
                      <span className="whitespace-pre-wrap">{resolvedShot.caption || shot.label || "Нет описания кадра."}</span>
                    </button>
                  )}
                </section>

                <section className="grid gap-1.5">
                  <div className="flex items-center gap-2">
                    <Clapperboard size={12} className="text-white/35" />
                    <p className="text-[10px] uppercase tracking-wider text-white/30">Режиссёрский</p>
                  </div>
                  {editingShotField?.shotId === shot.id && editingShotField.field === "directorNote" ? (
                    <textarea
                      autoFocus
                      rows={4}
                      value={editingShotDraft}
                      onChange={(event) => onDraftChange(event.target.value)}
                      onBlur={() => onCommitEdit(shot.id)}
                      className="w-full resize-y rounded-lg bg-white/3 p-3 text-[12px] leading-5 text-white/60 outline-none ring-1 ring-inset ring-white/10"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onStartEdit(shot, "directorNote", shot.directorNote || "")}
                      className="w-full rounded-lg bg-white/3 p-3 text-left text-[12px] leading-5 text-white/60 transition-colors hover:bg-white/4"
                    >
                      <span className="whitespace-pre-wrap">{resolvedShot.directorNote || "Нет режиссёрской заметки."}</span>
                    </button>
                  )}
                </section>

                <section className="grid gap-1.5">
                  <div className="flex items-center gap-2">
                    <Camera size={12} className="text-amber-400/70" />
                    <p className="text-[10px] uppercase tracking-wider text-white/30">Операторский</p>
                  </div>
                  {editingShotField?.shotId === shot.id && editingShotField.field === "cameraNote" ? (
                    <textarea
                      autoFocus
                      rows={5}
                      value={editingShotDraft}
                      onChange={(event) => onDraftChange(event.target.value)}
                      onBlur={() => onCommitEdit(shot.id)}
                      className="w-full resize-y rounded-lg bg-white/3 p-3 font-mono text-[12px] leading-5 text-amber-400/70 outline-none ring-1 ring-inset ring-white/10"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onStartEdit(shot, "cameraNote", shot.cameraNote || "")}
                      className="w-full rounded-lg bg-white/3 p-3 text-left font-mono text-[12px] leading-5 text-amber-400/70 transition-colors hover:bg-white/4"
                    >
                      <span className="whitespace-pre-wrap">{resolvedShot.cameraNote || "Нет операторской заметки."}</span>
                    </button>
                  )}
                </section>

                <section className="grid gap-1.5">
                  <div className="flex items-center gap-2">
                    <ImageIcon size={12} className="text-white/35" />
                    <p className="text-[10px] uppercase tracking-wider text-white/30">Промпт картинки</p>
                    <span className="rounded-full border border-[#D4A853]/35 bg-[#D4A853]/12 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-[#E8D7B2]">EN</span>
                  </div>
                  {editingShotField?.shotId === shot.id && editingShotField.field === "imagePrompt" ? (
                    <textarea
                      autoFocus
                      rows={7}
                      value={editingShotDraft}
                      onChange={(event) => onDraftChange(event.target.value)}
                      onBlur={() => onCommitEdit(shot.id)}
                      className="w-full resize-y rounded-lg bg-white/2 p-3 font-mono text-[11px] leading-5 text-white/40 outline-none ring-1 ring-inset ring-white/10"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onStartEdit(shot, "imagePrompt", shot.imagePrompt || imagePrompt)}
                      className="w-full rounded-lg bg-white/2 p-3 text-left font-mono text-[11px] leading-5 text-white/40 transition-colors hover:bg-white/4"
                    >
                      <span className="whitespace-pre-wrap">{imagePrompt}</span>
                    </button>
                  )}
                </section>

                <section className="grid gap-1.5 opacity-60">
                  <div className="flex items-center gap-2">
                    <Film size={12} className="text-white/35" />
                    <p className="text-[10px] uppercase tracking-wider text-white/30">Промпт видео</p>
                    <span className="rounded-full border border-[#D4A853]/35 bg-[#D4A853]/12 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-[#E8D7B2]">EN</span>
                    <span className="rounded-full border border-white/12 bg-white/4 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-white/40">будущее</span>
                  </div>
                  {editingShotField?.shotId === shot.id && editingShotField.field === "videoPrompt" ? (
                    <textarea
                      autoFocus
                      rows={6}
                      value={editingShotDraft}
                      onChange={(event) => onDraftChange(event.target.value)}
                      onBlur={() => onCommitEdit(shot.id)}
                      className="w-full resize-y rounded-lg bg-white/2 p-3 font-mono text-[11px] leading-5 text-white/30 outline-none ring-1 ring-inset ring-white/10"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onStartEdit(shot, "videoPrompt", shot.videoPrompt || videoPrompt)}
                      className="w-full rounded-lg bg-white/2 p-3 text-left font-mono text-[11px] leading-5 text-white/30 transition-colors hover:bg-white/4"
                    >
                      <span className="whitespace-pre-wrap">{videoPrompt}</span>
                    </button>
                  )}
                </section>

                <section className="grid gap-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-white/30">Библия — референсы</p>
                  <div className="grid gap-2 rounded-lg bg-white/3 p-3">
                    {refs.characters.length === 0 && !refs.location ? (
                      <p className="text-[12px] text-white/35">Нет связанных bible entries для этого шота.</p>
                    ) : null}

                    {refs.characters.map((character) => (
                      <div key={character.id} className="flex items-center gap-3">
                        <div className="relative h-8 w-8 overflow-hidden rounded-md border border-white/10 bg-white/4">
                          {character.generatedPortraitUrl ? (
                            <Image src={character.generatedPortraitUrl} alt={character.name} fill unoptimized className="object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-[0.14em] text-white/25">
                              {character.name.slice(0, 2)}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-[12px] text-[#E7E3DC]">{character.name}</p>
                          <p className="text-[11px] text-white/35">portrait · ref ×{character.referenceImages.length}</p>
                        </div>
                      </div>
                    ))}

                    {refs.location ? (
                      <div className="flex items-center gap-3">
                        <div className="relative h-8 w-8 overflow-hidden rounded-md border border-white/10 bg-white/4">
                          {refs.location.generatedImageUrl ? (
                            <Image src={refs.location.generatedImageUrl} alt={refs.location.name} fill unoptimized className="object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-[0.14em] text-white/25">
                              LOC
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-[12px] text-[#E7E3DC]">{refs.location.name}</p>
                          <p className="text-[11px] text-white/35">{refs.location.intExt} · ref ×{refs.location.referenceImages.length}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
