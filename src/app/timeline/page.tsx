"use client"

import { useTimelineStore } from "@/store/timeline"

export default function TimelinePage() {
  const shots = useTimelineStore((state) => state.shots)
  const addShot = useTimelineStore((state) => state.addShot)
  const clearTimeline = useTimelineStore((state) => state.clearTimeline)

  const handleAddShot = () => {
    addShot({
      label: `Test Shot ${shots.length + 1}`,
      duration: 3000,
    })
  }

  return (
    <main className="min-h-screen bg-[#0E0D0B] px-6 py-10 text-white">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">KOZA Timeline (dev)</h1>
          <p className="text-sm text-white/70">Shots count: {shots.length}</p>
        </header>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleAddShot}
            className="rounded-md border border-white/15 bg-white/10 px-4 py-2 text-sm transition-colors hover:bg-white/16"
          >
            Add test shot
          </button>
          <button
            type="button"
            onClick={clearTimeline}
            className="rounded-md border border-white/15 bg-transparent px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/8 hover:text-white"
          >
            Clear
          </button>
        </div>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 text-xs uppercase tracking-[0.18em] text-white/45">Shots</div>
          {shots.length === 0 ? (
            <div className="text-sm text-white/55">No shots yet.</div>
          ) : (
            <ul className="flex flex-col gap-3">
              {shots.map((shot) => (
                <li key={shot.id} className="rounded-lg border border-white/10 bg-black/20 px-4 py-3">
                  <div className="text-xs text-white/45">{shot.id}</div>
                  <div className="mt-1 text-base font-medium">{shot.label}</div>
                  <div className="mt-1 text-sm text-white/65">Duration: {shot.duration} ms</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}