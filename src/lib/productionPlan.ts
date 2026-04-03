/**
 * productionPlan.ts
 * PIECE — Production OS
 *
 * Берёт сегменты из segmentEngine и строит граф задач (jobs).
 * Каждый job знает: что делать, какой промт, какой API, от чего зависит.
 *
 * Использование:
 *   import { buildProductionPlan } from "@/lib/productionPlan"
 *   const plan = buildProductionPlan(segments, sections, bible)
 */

import type { Segment, Section } from "@/lib/segmentEngine"

// ─── Bible ───────────────────────────────────────────────────────────────────

export interface ProjectBible {
  title: string
  style: StylePreset
  characters: Character[]
  voiceId: string          // ElevenLabs voice ID
  lipSyncModel: LipSyncModel
  musicMood: string        // e.g. "cinematic tension", "lo-fi calm"
  aspectRatio: "16:9" | "9:16" | "1:1"
  colorGrade: string       // e.g. "vintage film", "clean neutral"
}

export interface StylePreset {
  id: string
  label: string
  // Ключевые слова для промтов изображений/видео
  visualKeywords: string[]
  // Ключевые слова которые НЕЛЬЗЯ использовать
  negativeKeywords: string[]
  // Референс для консистентности (URL или base64)
  referenceImageUrl?: string
  // Цветовая палитра для motion graphics
  palette: string[]
}

export interface Character {
  id: string
  name: string
  description: string           // внешность, одежда, возраст
  consistencyTags: string[]     // теги для LoRA / IP-Adapter
  voiceId?: string              // если отличается от дефолтного
}

export type LipSyncModel = "sync-labs" | "heygen" | "did" | "wav2lip"

// ─── Jobs ────────────────────────────────────────────────────────────────────

export type JobType =
  | "tts"          // Text → Speech (ElevenLabs)
  | "lipsync"      // Audio + frame → Lip-sync video
  | "video-gen"    // Text prompt → Video (Kling / Seedance / Runway)
  | "image-gen"    // Text prompt → Image (Flux / Midjourney)
  | "music-gen"    // Mood → Music (Suno / Udio / library)
  | "sfx"          // Event → Sound effect
  | "title-card"   // Text → Animated title overlay
  | "assemble"     // All assets → Final clip (FFmpeg / Remotion)

export type JobStatus =
  | "pending"
  | "running"
  | "done"
  | "error"
  | "skipped"

export interface BaseJob {
  id: string
  type: JobType
  segmentId: string
  sectionId: string
  status: JobStatus
  // IDs of jobs that must complete before this one starts
  dependsOn: string[]
  // Estimated duration of the output asset (ms)
  durationMs: number
  // Priority: lower = runs first (0 = critical path)
  priority: number
  createdAt: number
  startedAt?: number
  completedAt?: number
  error?: string
  // Path / URL of the output asset once done
  outputUrl?: string
}

// ── TTS ──
export interface TTSJob extends BaseJob {
  type: "tts"
  params: {
    text: string
    voiceId: string
    stability: number       // 0–1
    similarityBoost: number // 0–1
    speed: number           // 0.5–2.0
    model: "eleven_multilingual_v2" | "eleven_turbo_v2_5"
  }
}

// ── Lip Sync ──
export interface LipSyncJob extends BaseJob {
  type: "lipsync"
  params: {
    audioJobId: string      // ref to TTSJob
    videoJobId: string      // ref to VideoGenJob (talking head frame)
    model: LipSyncModel
    enhanceFace: boolean
  }
}

// ── Video Gen ──
export interface VideoGenJob extends BaseJob {
  type: "video-gen"
  params: {
    prompt: string
    negativePrompt: string
    api: VideoGenAPI
    aspectRatio: string
    fps: 24 | 25 | 30
    motionStrength: number  // 0–1
    cameraPreset?: CameraPreset
    referenceImageUrl?: string  // for IP consistency
    seedanceShotType?: string   // for Seedance
  }
}

export type VideoGenAPI = "kling-1.6" | "kling-2.0" | "seedance-1.0" | "runway-gen4" | "hailuo-02"

export type CameraPreset =
  | "static"
  | "slow-push-in"
  | "pull-back"
  | "orbit-left"
  | "handheld"
  | "crane-up"
  | "dutch-tilt"

// ── Image Gen ──
export interface ImageGenJob extends BaseJob {
  type: "image-gen"
  params: {
    prompt: string
    negativePrompt: string
    api: "flux-1.1-pro" | "midjourney-v7" | "ideogram-v3" | "flux-kontext"
    width: number
    height: number
    steps: number
    referenceImageUrl?: string
  }
}

// ── Music Gen ──
export interface MusicGenJob extends BaseJob {
  type: "music-gen"
  params: {
    prompt: string           // mood description
    api: "suno-v4" | "udio-v2" | "library-search"
    durationSec: number
    instrumental: boolean
    bpmHint?: number
    tags: string[]
  }
}

// ── SFX ──
export interface SFXJob extends BaseJob {
  type: "sfx"
  params: {
    event: string            // "camera click", "whoosh", "impact"
    api: "elevenlabs-sfx" | "freesound" | "zapsplat"
    durationSec: number
  }
}

// ── Title Card ──
export interface TitleCardJob extends BaseJob {
  type: "title-card"
  params: {
    text: string
    style: "lower-third" | "full-screen" | "kinetic" | "subtitle"
    font?: string
    color?: string
    animationIn: "fade" | "slide-up" | "typewriter"
    animationOut: "fade" | "slide-down" | "cut"
    durationSec: number
    api: "remotion" | "motion-canvas" | "ffmpeg-drawtext"
  }
}

// ── Assemble ──
export interface AssembleJob extends BaseJob {
  type: "assemble"
  params: {
    timeline: AssembleTrack[]
    outputFormat: "mp4" | "mov" | "webm"
    resolution: "1920x1080" | "1080x1920" | "1080x1080"
    fps: 24 | 25 | 30
    audioBitrate: "192k" | "320k"
    videoBitrate: "8M" | "15M" | "25M"
    colorGrade?: string
    api: "ffmpeg" | "remotion" | "creatomate"
  }
}

export interface AssembleTrack {
  trackType: "video" | "audio" | "overlay"
  items: AssembleItem[]
}

export interface AssembleItem {
  jobId: string
  startMs: number
  durationMs: number
  volume?: number    // for audio tracks (0–1)
  opacity?: number   // for overlay tracks (0–1)
  fadeIn?: number    // ms
  fadeOut?: number   // ms
}

export type ProductionJob =
  | TTSJob
  | LipSyncJob
  | VideoGenJob
  | ImageGenJob
  | MusicGenJob
  | SFXJob
  | TitleCardJob
  | AssembleJob

// ─── Production Plan ─────────────────────────────────────────────────────────

export interface ProductionPlan {
  id: string
  pieceId: string
  createdAt: number
  bible: ProjectBible
  jobs: ProductionJob[]
  // Derived: jobs grouped by section for UI
  jobsBySection: Map<string, ProductionJob[]>
  // Estimated total generation time (seconds)
  estimatedTimeSec: number
  // Critical path: jobs that block final assembly
  criticalPath: string[]
}

// ─── Prompt Builders ─────────────────────────────────────────────────────────

function buildVideoPrompt(
  segment: Segment,
  section: Section,
  bible: ProjectBible,
  shotType: "talking-head" | "broll"
): { prompt: string; negativePrompt: string; camera: CameraPreset } {
  const styleKw = bible.style.visualKeywords.join(", ")
  const negKw = bible.style.negativeKeywords.join(", ")

  if (shotType === "talking-head") {
    // Find character from bible
    const char = bible.characters[0]
    const charDesc = char
      ? `${char.description}, ${char.consistencyTags.join(", ")}`
      : "professional presenter"

    const prompt = [
      `${charDesc}`,
      `speaking directly to camera, medium close-up portrait`,
      `${styleKw}`,
      `cinematic lighting, shallow depth of field`,
      `${section.title.toLowerCase()} emotional tone`,
    ].join(", ")

    const negativePrompt = [
      negKw,
      "multiple people, looking away, blinking, mouth closed",
      "text, watermark, logo",
    ].join(", ")

    return { prompt, negativePrompt, camera: "static" }
  }

  // B-roll
  const content = segment.content
  const prompt = [
    content,
    styleKw,
    "cinematic, dynamic composition",
    `${section.title.toLowerCase()} atmosphere`,
    bible.aspectRatio === "9:16" ? "vertical framing" : "widescreen framing",
  ].join(", ")

  const negativePrompt = [negKw, "text overlay, watermark, people talking to camera"].join(", ")

  return { prompt, negativePrompt, camera: "slow-push-in" }
}

function buildImagePrompt(
  segment: Segment,
  section: Section,
  bible: ProjectBible
): { prompt: string; negativePrompt: string } {
  const styleKw = bible.style.visualKeywords.join(", ")
  const negKw = bible.style.negativeKeywords.join(", ")

  const prompt = [
    segment.content,
    styleKw,
    "high quality, detailed, cinematic composition",
    `${section.title.toLowerCase()} mood`,
  ].join(", ")

  return {
    prompt,
    negativePrompt: [negKw, "text, watermark, low quality, blurry"].join(", "),
  }
}

function buildMusicPrompt(section: Section, bible: ProjectBible): string {
  const baseMood = bible.musicMood
  const sectionMood = section.title.toLowerCase()
  return `${baseMood}, ${sectionMood} energy, instrumental, ${bible.style.visualKeywords.slice(0, 2).join(", ")}`
}

// ─── Main Builder ─────────────────────────────────────────────────────────────

let _jobCounter = 0
function jobId(type: JobType, segId: string): string {
  return `${type}-${segId}-${++_jobCounter}`
}

export function buildProductionPlan(
  segments: Segment[],
  sections: Section[],
  bible: ProjectBible,
  pieceId = "piece-" + Date.now()
): ProductionPlan {
  _jobCounter = 0
  const jobs: ProductionJob[] = []
  const jobsBySection = new Map<string, ProductionJob[]>()
  const assembleVideoItems: AssembleItem[] = []
  const assembleAudioItems: AssembleItem[] = []
  const assembleOverlayItems: AssembleItem[] = []

  // Helper
  const addJob = (job: ProductionJob) => {
    jobs.push(job)
    const bucket = jobsBySection.get(job.sectionId) ?? []
    bucket.push(job)
    jobsBySection.set(job.sectionId, bucket)
  }

  // Track which TTS + VideoGen job covers each section (for lipsync)
  const sectionTTSJobId = new Map<string, string>()
  const sectionTalkingHeadJobId = new Map<string, string>()
  const sectionMusicJobId = new Map<string, string>()

  for (const section of sections) {
    const sectionSegs = segments.filter((s) => s.sectionId === section.id)
    const secStart = sectionSegs.length > 0 ? Math.min(...sectionSegs.map((s) => s.startMs)) : 0
    const secEnd = sectionSegs.length > 0 ? Math.max(...sectionSegs.map((s) => s.startMs + s.durationMs)) : 0
    const secDur = Math.max(1000, secEnd - secStart)

    // ── 1. TTS: all ГОЛОС lines in section → one TTS job ──
    const voiceSegs = sectionSegs.filter((s) => s.track === "voice")
    if (voiceSegs.length > 0) {
      const fullText = voiceSegs.map((s) => s.content).join(" ")
      const ttsJob: TTSJob = {
        id: jobId("tts", section.id),
        type: "tts",
        segmentId: voiceSegs[0].id,
        sectionId: section.id,
        status: "pending",
        dependsOn: [],
        durationMs: voiceSegs.reduce((a, s) => a + s.durationMs, 0),
        priority: 0, // highest — blocks lipsync
        createdAt: Date.now(),
        params: {
          text: fullText,
          voiceId: bible.voiceId,
          stability: 0.5,
          similarityBoost: 0.8,
          speed: 1.0,
          model: "eleven_multilingual_v2",
        },
      }
      addJob(ttsJob)
      sectionTTSJobId.set(section.id, ttsJob.id)

      // Add TTS audio to assembly audio track
      assembleAudioItems.push({
        jobId: ttsJob.id,
        startMs: secStart,
        durationMs: ttsJob.durationMs,
        volume: 1.0,
        fadeIn: 50,
        fadeOut: 100,
      })
    }

    // ── 2. Talking Head video job (setup-a segment) ──
    const setupSeg = sectionSegs.find((s) => s.role === "setup-a")
    if (setupSeg) {
      const { prompt, negativePrompt, camera } = buildVideoPrompt(
        setupSeg, section, bible, "talking-head"
      )
      const vJob: VideoGenJob = {
        id: jobId("video-gen", setupSeg.id),
        type: "video-gen",
        segmentId: setupSeg.id,
        sectionId: section.id,
        status: "pending",
        dependsOn: [],
        durationMs: secDur,
        priority: 0,
        createdAt: Date.now(),
        params: {
          prompt,
          negativePrompt,
          api: "kling-2.0",
          aspectRatio: bible.aspectRatio,
          fps: 25,
          motionStrength: 0.4,
          cameraPreset: camera,
          referenceImageUrl: bible.style.referenceImageUrl,
        },
      }
      addJob(vJob)
      sectionTalkingHeadJobId.set(section.id, vJob.id)

      // ── 3. Lip Sync job (depends on TTS + talking head) ──
      const ttsId = sectionTTSJobId.get(section.id)
      if (ttsId) {
        const lsJob: LipSyncJob = {
          id: jobId("lipsync", setupSeg.id),
          type: "lipsync",
          segmentId: setupSeg.id,
          sectionId: section.id,
          status: "pending",
          dependsOn: [ttsId, vJob.id],
          durationMs: secDur,
          priority: 1,
          createdAt: Date.now(),
          params: {
            audioJobId: ttsId,
            videoJobId: vJob.id,
            model: bible.lipSyncModel,
            enhanceFace: true,
          },
        }
        addJob(lsJob)

        // Assembly: use lipsync output as main video track for this section
        assembleVideoItems.push({
          jobId: lsJob.id,
          startMs: secStart,
          durationMs: secDur,
          fadeIn: 0,
          fadeOut: 0,
        })
      }
    }

    // ── 4. B-roll / ГРАФИКА segments → Video or Image gen ──
    const brollSegs = sectionSegs.filter((s) => s.track === "visual-b")
    for (const seg of brollSegs) {
      // Decide: if content mentions photo/archive/схема → image, else video
      const isStatic = /фото|архив|схем|карт|граф|poster|map|diagram/i.test(seg.content)

      if (isStatic) {
        const { prompt, negativePrompt } = buildImagePrompt(seg, section, bible)
        const imgJob: ImageGenJob = {
          id: jobId("image-gen", seg.id),
          type: "image-gen",
          segmentId: seg.id,
          sectionId: section.id,
          status: "pending",
          dependsOn: [],
          durationMs: seg.durationMs,
          priority: 2,
          createdAt: Date.now(),
          params: {
            prompt,
            negativePrompt,
            api: "flux-1.1-pro",
            width: bible.aspectRatio === "9:16" ? 1080 : 1920,
            height: bible.aspectRatio === "9:16" ? 1920 : 1080,
            steps: 28,
            referenceImageUrl: bible.style.referenceImageUrl,
          },
        }
        addJob(imgJob)
        // B-roll overlaps the talking head section
        assembleVideoItems.push({
          jobId: imgJob.id,
          startMs: secStart,
          durationMs: seg.durationMs,
          opacity: 1.0,
          fadeIn: 200,
          fadeOut: 200,
        })
      } else {
        const { prompt, negativePrompt, camera } = buildVideoPrompt(seg, section, bible, "broll")
        const bJob: VideoGenJob = {
          id: jobId("video-gen", seg.id),
          type: "video-gen",
          segmentId: seg.id,
          sectionId: section.id,
          status: "pending",
          dependsOn: [],
          durationMs: seg.durationMs,
          priority: 2,
          createdAt: Date.now(),
          params: {
            prompt,
            negativePrompt,
            api: "seedance-1.0",
            aspectRatio: bible.aspectRatio,
            fps: 25,
            motionStrength: 0.6,
            cameraPreset: camera,
          },
        }
        addJob(bJob)
        assembleVideoItems.push({
          jobId: bJob.id,
          startMs: secStart,
          durationMs: seg.durationMs,
          fadeIn: 150,
          fadeOut: 150,
        })
      }
    }

    // ── 5. Title cards / ТИТР ──
    const titleSegs = sectionSegs.filter((s) => s.track === "titles")
    for (const seg of titleSegs) {
      const isLowerThird = seg.content.length < 40 && !seg.content.includes("—")
      const titleJob: TitleCardJob = {
        id: jobId("title-card", seg.id),
        type: "title-card",
        segmentId: seg.id,
        sectionId: section.id,
        status: "pending",
        dependsOn: [],
        durationMs: seg.durationMs,
        priority: 3,
        createdAt: Date.now(),
        params: {
          text: seg.content,
          style: isLowerThird ? "lower-third" : "full-screen",
          color: bible.style.palette[0] ?? "#FFFFFF",
          animationIn: isLowerThird ? "slide-up" : "fade",
          animationOut: isLowerThird ? "slide-down" : "fade",
          durationSec: seg.durationMs / 1000,
          api: "remotion",
        },
      }
      addJob(titleJob)
      assembleOverlayItems.push({
        jobId: titleJob.id,
        startMs: secStart,
        durationMs: seg.durationMs,
        opacity: 1.0,
        fadeIn: 100,
        fadeOut: 100,
      })
    }

    // ── 6. Music / МУЗЫКА — one per section ──
    const musicSegs = sectionSegs.filter((s) => s.track === "music")
    for (const seg of musicSegs) {
      const musicJob: MusicGenJob = {
        id: jobId("music-gen", seg.id),
        type: "music-gen",
        segmentId: seg.id,
        sectionId: section.id,
        status: "pending",
        dependsOn: [],
        durationMs: seg.durationMs,
        priority: 3,
        createdAt: Date.now(),
        params: {
          prompt: buildMusicPrompt(section, bible),
          api: "suno-v4",
          durationSec: Math.ceil(seg.durationMs / 1000) + 2,
          instrumental: true,
          tags: [bible.musicMood, section.title.toLowerCase()],
        },
      }
      addJob(musicJob)
      sectionMusicJobId.set(section.id, musicJob.id)
      assembleAudioItems.push({
        jobId: musicJob.id,
        startMs: secStart,
        durationMs: seg.durationMs,
        volume: 0.15, // ducked under voice
        fadeIn: 500,
        fadeOut: 1000,
      })
    }

    // ── 7. Intro/outro SFX for key sections ──
    if (section.title.toLowerCase().includes("хук") || section.title.toLowerCase().includes("hook")) {
      const sfxJob: SFXJob = {
        id: jobId("sfx", section.id),
        type: "sfx",
        segmentId: section.id,
        sectionId: section.id,
        status: "pending",
        dependsOn: [],
        durationMs: 800,
        priority: 4,
        createdAt: Date.now(),
        params: {
          event: "tension sting, low bass hit",
          api: "elevenlabs-sfx",
          durationSec: 0.8,
        },
      }
      addJob(sfxJob)
      assembleAudioItems.push({
        jobId: sfxJob.id,
        startMs: secStart,
        durationMs: 800,
        volume: 0.6,
        fadeIn: 0,
        fadeOut: 300,
      })
    }
  }

  // ── 8. Final Assemble job (depends on ALL other jobs) ──
  const allJobIds = jobs.map((j) => j.id)
  const assembleJob: AssembleJob = {
    id: jobId("assemble", "final"),
    type: "assemble",
    segmentId: "final",
    sectionId: "final",
    status: "pending",
    dependsOn: allJobIds,
    durationMs: segments.reduce((max, s) => Math.max(max, s.startMs + s.durationMs), 0),
    priority: 99,
    createdAt: Date.now(),
    params: {
      timeline: [
        { trackType: "video", items: assembleVideoItems.sort((a, b) => a.startMs - b.startMs) },
        { trackType: "audio", items: assembleAudioItems.sort((a, b) => a.startMs - b.startMs) },
        { trackType: "overlay", items: assembleOverlayItems.sort((a, b) => a.startMs - b.startMs) },
      ],
      outputFormat: "mp4",
      resolution: bible.aspectRatio === "9:16" ? "1080x1920" : "1920x1080",
      fps: 25,
      audioBitrate: "320k",
      videoBitrate: "15M",
      colorGrade: bible.colorGrade,
      api: "remotion",
    },
  }
  addJob(assembleJob)

  // ── Critical path: TTS → LipSync → Assemble ──
  const criticalPath = [
    ...Array.from(sectionTTSJobId.values()),
    ...jobs.filter((j) => j.type === "lipsync").map((j) => j.id),
    assembleJob.id,
  ]

  // ── Estimated time (rough parallel estimate) ──
  // TTS ~5s/section, VideoGen ~120s/job, LipSync ~60s/job, Image ~20s/job
  const estimateSec = (type: JobType): number => {
    switch (type) {
      case "tts": return 5
      case "video-gen": return 120
      case "lipsync": return 60
      case "image-gen": return 20
      case "music-gen": return 30
      case "sfx": return 5
      case "title-card": return 10
      case "assemble": return 30
    }
  }

  // Parallel: max of critical path
  const criticalSec = criticalPath.reduce((sum, id) => {
    const j = jobs.find((x) => x.id === id)
    return sum + (j ? estimateSec(j.type) : 0)
  }, 0)

  return {
    id: "plan-" + Date.now(),
    pieceId,
    createdAt: Date.now(),
    bible,
    jobs,
    jobsBySection,
    estimatedTimeSec: criticalSec,
    criticalPath,
  }
}

// ─── Job Runner (interface stub) ─────────────────────────────────────────────
// Реализуется отдельно для каждого API. Здесь только типы.

export interface JobRunner<T extends ProductionJob = ProductionJob> {
  type: JobType
  // Запустить job, вернуть URL результата
  run(job: T, onProgress?: (pct: number) => void): Promise<string>
  // Проверить статус (для polling)
  poll?(jobId: string): Promise<{ status: JobStatus; url?: string }>
}

// ─── Plan utilities ───────────────────────────────────────────────────────────

/** Все jobs готовые к запуску (все зависимости done) */
export function getReadyJobs(plan: ProductionPlan): ProductionJob[] {
  const doneIds = new Set(plan.jobs.filter((j) => j.status === "done").map((j) => j.id))
  return plan.jobs.filter(
    (j) =>
      j.status === "pending" &&
      j.dependsOn.every((dep) => doneIds.has(dep))
  )
}

/** Прогресс плана (0–1) */
export function getPlanProgress(plan: ProductionPlan): number {
  const done = plan.jobs.filter((j) => j.status === "done").length
  return done / plan.jobs.length
}

/** Jobs сгруппированные по типу для dashboard */
export function getJobsByType(plan: ProductionPlan): Map<JobType, ProductionJob[]> {
  const map = new Map<JobType, ProductionJob[]>()
  for (const job of plan.jobs) {
    const arr = map.get(job.type) ?? []
    arr.push(job)
    map.set(job.type, arr)
  }
  return map
}

/** Обновить статус конкретного job и вернуть новый план */
export function updateJobStatus(
  plan: ProductionPlan,
  jobId: string,
  status: JobStatus,
  outputUrl?: string
): ProductionPlan {
  return {
    ...plan,
    jobs: plan.jobs.map((j) =>
      j.id === jobId
        ? {
            ...j,
            status,
            outputUrl: outputUrl ?? j.outputUrl,
            startedAt: status === "running" ? Date.now() : j.startedAt,
            completedAt: status === "done" || status === "error" ? Date.now() : j.completedAt,
          }
        : j
    ),
  }
}

// ─── Default Bible ────────────────────────────────────────────────────────────

export const DEFAULT_BIBLE: ProjectBible = {
  title: "My Piece",
  style: {
    id: "cinematic-dark",
    label: "Cinematic Dark",
    visualKeywords: [
      "cinematic", "dramatic lighting", "film grain",
      "anamorphic lens flare", "color graded", "high contrast",
    ],
    negativeKeywords: [
      "cartoon", "anime", "illustration", "3d render",
      "low quality", "blurry", "watermark",
    ],
    palette: ["#D4A853", "#1A1A1A", "#F5F3EF", "#E05C5C"],
  },
  characters: [
    {
      id: "host",
      name: "Host",
      description: "professional male presenter, 35-45, smart casual attire, neutral background",
      consistencyTags: ["consistent face", "same outfit", "studio lighting"],
    },
  ],
  voiceId: "21m00Tcm4TlvDq8ikWAM", // ElevenLabs Rachel (replace with your ID)
  lipSyncModel: "sync-labs",
  musicMood: "cinematic, atmospheric, subtle tension",
  aspectRatio: "16:9",
  colorGrade: "cinematic warm shadows, lifted blacks",
}
