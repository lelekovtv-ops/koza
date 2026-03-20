"use client"

import Image from "next/image"
import { Clapperboard, Loader2, MoreHorizontal, Plus, SendHorizonal } from "lucide-react"
import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { createStoryboardFrame, useStoryboardStore } from "@/store/storyboard"
import { useTimelineStore } from "@/store/timeline"
import { useScriptStore } from "@/store/script"
import { breakdownScene } from "@/lib/jenkins"

interface StoryboardPanelProps {
  isOpen: boolean
  isExpanded: boolean
  panelWidth: number
  backgroundColor: string
  onClose: () => void
  onToggleExpanded: () => void
}

const STORYBOARD_CARD_META = [
  { shot: "WIDE", motion: "Static", duration: "4.2s", caption: "Establishing valley frame" },
  { shot: "OVER SHOULDER", motion: "Pan Right", duration: "4.8s", caption: "Backpack silhouette reveal" },
  { shot: "CLOSE", motion: "Slight In", duration: "3.5s", caption: "Sunlit profile detail" },
  { shot: "WIDE", motion: "Push In", duration: "3.8s", caption: "Hero facing sunrise" },
  { shot: "WIDE", motion: "Static", duration: "4.2s", caption: "Rest beat on cliff" },
  { shot: "CLOSE", motion: "Slight In", duration: "3.5s", caption: "Tension in expression" },
  { shot: "WIDE", motion: "Push In", duration: "3.8s", caption: "Return to landscape" },
  { shot: "CLOSE", motion: "Track Around", duration: "3.2s", caption: "Orbit around subject" },
  { shot: "CLOSE", motion: "Static", duration: "3.4s", caption: "Downbeat introspection" },
  { shot: "WIDE", motion: "Drone In", duration: "5.5s", caption: "Aerial descent into valley" },
  { shot: "CLOSE", motion: "Track Around", duration: "3.2s", caption: "Shoulder line contour" },
  { shot: "MEDIUM", motion: "Pan Up", duration: "4.1s", caption: "Pack and horizon reveal" },
]

function getStoryboardCardMeta(index: number) {
  return STORYBOARD_CARD_META[index % STORYBOARD_CARD_META.length]
}

export function StoryboardPanel({
  isOpen,
  isExpanded,
  panelWidth,
  backgroundColor,
  onClose,
  onToggleExpanded,
}: StoryboardPanelProps) {
  const resolvedPanelWidth = isExpanded ? "100vw" : `${panelWidth}px`
  const frames = useStoryboardStore((state) => state.frames)
  const insertFrameAt = useStoryboardStore((state) => state.insertFrameAt)
  const moveFrameToIndex = useStoryboardStore((state) => state.moveFrameToIndex)
  const [recentInsertedFrameId, setRecentInsertedFrameId] = useState<string | null>(null)
  const [draggedFrameId, setDraggedFrameId] = useState<string | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const cardScale = 90
  const timelineShots = useTimelineStore((state) => state.shots)
  const addShot = useTimelineStore((state) => state.addShot)
  const scenario = useScriptStore((state) => state.scenario)
  const [jenkinsLoading, setJenkinsLoading] = useState(false)

  const parseDuration = useCallback((raw: string) => {
    const match = raw.match(/([\d.]+)\s*s/)
    return match ? Math.round(parseFloat(match[1]) * 1000) : 3000
  }, [])

  const addFrameToTimeline = useCallback(
    (frame: { id: string }, index: number) => {
      if (timelineShots.some((s) => s.id === frame.id)) return
      const meta = getStoryboardCardMeta(index)
      addShot({
        id: frame.id,
        duration: parseDuration(meta.duration),
        type: "image",
        label: `${meta.shot} — ${meta.caption}`,
        notes: meta.motion,
      })
    },
    [timelineShots, addShot, parseDuration],
  )

  const sendAllToTimeline = useCallback(() => {
    frames.forEach((frame, index) => addFrameToTimeline(frame, index))
  }, [frames, addFrameToTimeline])

  const handleJenkinsBreakdown = useCallback(async () => {
    const text = scenario.trim()
    if (!text || jenkinsLoading) return
    setJenkinsLoading(true)
    try {
      const { shots: jenkinsShots } = await breakdownScene(text)
      for (const shot of jenkinsShots) {
        addShot({
          duration: shot.duration,
          type: shot.type,
          label: shot.label,
          notes: shot.notes,
        })
      }
    } catch (error) {
      console.error("Jenkins breakdown error:", error)
    } finally {
      setJenkinsLoading(false)
    }
  }, [scenario, jenkinsLoading, addShot])

  const nextFrame = useMemo(() => createStoryboardFrame(frames.length, `preview-${frames.length}`), [frames.length])

  useEffect(() => {
    if (!recentInsertedFrameId) return

    const timer = window.setTimeout(() => {
      setRecentInsertedFrameId(null)
    }, 650)

    return () => window.clearTimeout(timer)
  }, [recentInsertedFrameId])

  const handleInsertFrameAt = (index: number) => {
    const insertedFrameId = insertFrameAt(index)
    setRecentInsertedFrameId(insertedFrameId)
    setDropTargetIndex(null)
  }

  const handleDragStart = (frameId: string) => {
    setDraggedFrameId(frameId)
  }

  const handleDragEnd = () => {
    setDraggedFrameId(null)
    setDropTargetIndex(null)
  }

  const handleDropAtIndex = (index: number) => {
    if (!draggedFrameId) return
    moveFrameToIndex(draggedFrameId, index)
    setDraggedFrameId(null)
    setDropTargetIndex(null)
  }

  const minCardWidth = isExpanded
    ? Math.round(248 + ((cardScale - 72) / 32) * 74)
    : Math.round(224 + ((cardScale - 72) / 32) * 30)
  const cardGap = isExpanded ? 14 : 12
  const sceneTitle = "SCENE 03 - Lonely man in mountains"
  const panelChrome = backgroundColor === "#0B0C10"
    ? "linear-gradient(180deg, rgba(16,18,24,0.98) 0%, rgba(12,13,18,0.98) 100%)"
    : `linear-gradient(180deg, ${backgroundColor} 0%, #0E1016 100%)`

  return (
    <aside
      aria-hidden={!isOpen}
      className="absolute inset-y-0 right-0 z-3 overflow-hidden transition-[width,transform,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{
        width: isOpen ? resolvedPanelWidth : 0,
        minWidth: isOpen ? resolvedPanelWidth : 0,
        height: "100%",
        opacity: isOpen ? 1 : 0,
        transform: isOpen ? "translateX(0)" : "translateX(108%)",
        pointerEvents: isOpen ? "auto" : "none",
      }}
    >
      <div
        className="relative flex h-full w-full flex-col overflow-hidden border-l border-white/10"
        style={{
          height: "100%",
          background: panelChrome,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-3 text-[#E5E0DB]">
          <div className="min-w-0 pr-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#8D919B]">Scene Engine</p>
            <p className="mt-1 truncate text-[16px] font-medium tracking-[0.01em] text-[#E7E3DC]">{sceneTitle}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleJenkinsBreakdown}
              disabled={jenkinsLoading || !scenario.trim()}
              className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/8 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[#E5E0DB] transition-colors hover:bg-amber-500/16 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Jenkins shot breakdown"
            >
              {jenkinsLoading ? <Loader2 size={12} className="animate-spin" /> : <Clapperboard size={12} />}
              {jenkinsLoading ? "Breaking down…" : "Jenkins Breakdown"}
            </button>
            <button
              type="button"
              onClick={sendAllToTimeline}
              className="flex items-center gap-1.5 rounded-md border border-white/12 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[#E5E0DB] transition-colors hover:bg-white/6"
              aria-label="Send all shots to timeline"
            >
              <SendHorizonal size={12} />
              Send all to Timeline
            </button>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#BDAF9F] transition-colors hover:bg-white/6 hover:text-white"
              aria-label="More storyboard actions"
            >
              <MoreHorizontal size={16} />
            </button>
            <button
              type="button"
              onClick={onToggleExpanded}
              className="rounded-md border border-white/12 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[#E5E0DB] transition-colors hover:bg-white/6"
            >
              {isExpanded ? "Split view" : "Expand"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-white/12 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[#E5E0DB] transition-colors hover:bg-white/6"
            >
              Close
            </button>
          </div>
        </div>

        <div className="border-b border-white/6 px-4 py-3 text-[#E5E0DB]">
          <div className="flex items-center gap-2 text-[#9FA4AE]">
            <span className="rounded-md border border-white/8 bg-white/3 px-2 py-1 text-[10px] uppercase tracking-[0.16em]">Shots</span>
            <span className="rounded-md border border-white/8 bg-white/2 px-2 py-1 text-[10px] uppercase tracking-[0.16em]">Frames {frames.length}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4" style={{ overscrollBehaviorY: "contain" }}>
          <div
            className="grid min-h-full"
            style={{
              gap: cardGap,
              gridTemplateColumns: isExpanded
                ? `repeat(auto-fill, minmax(${minCardWidth}px, 1fr))`
                : "minmax(0, 1fr)",
              alignContent: "start",
              transition: "gap 240ms ease, grid-template-columns 240ms ease",
            }}
          >
            {frames.map((frame, index) => (
              <Fragment key={frame.id}>
                <div
                  className={`group relative overflow-hidden rounded-[14px] border border-white/6 bg-[#111317] p-2 shadow-[0_20px_45px_rgba(0,0,0,0.28)] transition-all duration-200 ${recentInsertedFrameId === frame.id ? "storyboard-card-enter" : ""} ${dropTargetIndex === index || dropTargetIndex === index + 1 ? "border-[#D8C4A5]/40 shadow-[0_0_0_1px_rgba(216,196,165,0.18),0_20px_45px_rgba(0,0,0,0.34)]" : "hover:-translate-y-px hover:border-white/10 hover:bg-[#14171C]"}`}
                  draggable
                  onDragStart={() => handleDragStart(frame.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(event) => {
                    event.preventDefault()
                    if (!draggedFrameId || draggedFrameId === frame.id) return
                    setDropTargetIndex(index + (event.nativeEvent.offsetX > event.currentTarget.clientWidth / 2 ? 1 : 0))
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    handleDropAtIndex(index + (event.nativeEvent.offsetX > event.currentTarget.clientWidth / 2 ? 1 : 0))
                  }}
                  style={{
                    opacity: draggedFrameId === frame.id ? 0.46 : 1,
                    transition: "box-shadow 240ms ease, transform 240ms ease, border-color 240ms ease, background-color 240ms ease",
                  }}
                >
                  <div className="relative flex h-full flex-col text-[#E5E0DB]">
                    <div className="relative overflow-hidden rounded-[10px] border border-white/8 bg-[#0E1014] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" style={{ aspectRatio: "16 / 8.7" }}>
                      <Image
                        src={frame.svg}
                        alt={`${getStoryboardCardMeta(index).shot} frame preview`}
                        width={320}
                        height={320}
                        unoptimized
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        draggable={false}
                      />
                      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,10,14,0.04)_0%,rgba(8,10,14,0.12)_52%,rgba(8,10,14,0.34)_100%)]" />
                      <div className="absolute left-2 top-2 rounded-md border border-white/10 bg-black/30 px-1.5 py-1 text-[9px] uppercase tracking-[0.18em] text-[#EAE2D7] backdrop-blur-sm">
                        Shot {String(index + 1).padStart(2, "0")}
                      </div>
                    </div>

                    <div className="mt-2 flex items-start justify-between gap-3 px-0.5 pb-0.5 pt-0.5 text-[#D7CDC1]">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] uppercase tracking-[0.08em] text-[#ECE5D8]">
                          {getStoryboardCardMeta(index).shot}
                          <span className="mx-1.5 text-white/20">-</span>
                          <span className="normal-case tracking-normal text-[#B9AEA0]">{getStoryboardCardMeta(index).motion}</span>
                          <span className="mx-1.5 text-white/20">-</span>
                          <span className="normal-case tracking-normal text-[#B9AEA0]">{getStoryboardCardMeta(index).duration}</span>
                        </p>
                        <p className="mt-1 truncate text-[10px] text-[#7F8590]">{getStoryboardCardMeta(index).caption}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => addFrameToTimeline(frame, index)}
                          className={`flex h-6 items-center gap-1 rounded-md px-1.5 text-[9px] uppercase tracking-[0.12em] transition-colors ${
                            timelineShots.some((s) => s.id === frame.id)
                              ? "text-[#5A5F6A] cursor-default"
                              : "text-[#7F8590] hover:bg-white/5 hover:text-white"
                          }`}
                          disabled={timelineShots.some((s) => s.id === frame.id)}
                          aria-label={`Add shot ${index + 1} to timeline`}
                        >
                          <SendHorizonal size={10} />
                          {timelineShots.some((s) => s.id === frame.id) ? "Added" : "Timeline"}
                        </button>
                        <button
                          type="button"
                          className="flex h-6 w-6 items-center justify-center rounded-md text-[#7F8590] transition-colors hover:bg-white/5 hover:text-white"
                          aria-label={`More actions for shot ${index + 1}`}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </Fragment>
            ))}

            <button
              type="button"
              onClick={() => handleInsertFrameAt(frames.length)}
              className={`flex min-h-29 items-center justify-center rounded-[14px] border border-dashed px-4 py-5 text-[#D7CDC1] transition-colors hover:bg-[#171A20] hover:text-white ${dropTargetIndex === frames.length ? "border-[#D8C4A5]/55 bg-[#171A20]" : "border-white/10 bg-[#12151A]"}`}
              onDragOver={(event) => {
                event.preventDefault()
                if (draggedFrameId) setDropTargetIndex(frames.length)
              }}
              onDragLeave={() => {
                if (dropTargetIndex === frames.length) setDropTargetIndex(null)
              }}
              onDrop={(event) => {
                event.preventDefault()
                handleDropAtIndex(frames.length)
              }}
              style={{
                transition: "background-color 180ms ease, color 180ms ease, border-color 180ms ease",
              }}
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/3 text-[#E7E3DC]">
                  <Plus size={15} />
                </span>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#E7E3DC]">Add Shot</p>
                  <p className="mt-1 text-[10px] text-[#7F8590]">Insert {nextFrame.title.toLowerCase()} to the sequence</p>
                </div>
              </div>
            </button>
          </div>
        </div>

        <style jsx>{`
          .storyboard-card-enter {
            animation: storyboard-card-enter 420ms cubic-bezier(0.22, 1, 0.36, 1);
          }

          @keyframes storyboard-card-enter {
            0% {
              opacity: 0;
              transform: translateY(10px) scale(0.97);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}</style>
      </div>
    </aside>
  )
}