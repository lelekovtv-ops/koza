import type { TimelineShot } from "@/store/timeline"

const NOTES = [
  "Wide establishing",
  "Close-up reaction",
  "Over-the-shoulder",
  "Medium two-shot",
  "Low angle hero",
  "Tracking dolly in",
  "Handheld POV",
  "Static master",
  "Push-in on detail",
  "Crane down reveal",
  "Whip pan transition",
  "Rack focus foreground",
  "Silhouette backlit",
  "Dutch angle tension",
  "Aerial drone sweep",
]

const SCENE_GROUP_MIN = 3
const SCENE_GROUP_MAX = 5

export function generateDemoShots(count: number): Omit<TimelineShot, "id">[] {
  const shots: Omit<TimelineShot, "id">[] = []

  let sceneNum = 1
  let shotInScene = 0
  let shotsLeftInScene = randomInt(SCENE_GROUP_MIN, SCENE_GROUP_MAX)
  const sceneId = () => `scene-${sceneNum}`

  for (let i = 0; i < count; i++) {
    if (shotInScene >= shotsLeftInScene) {
      sceneNum++
      shotInScene = 0
      shotsLeftInScene = randomInt(SCENE_GROUP_MIN, SCENE_GROUP_MAX)
    }

    const suffix = String.fromCharCode(65 + shotInScene) // A, B, C...
    shots.push({
      order: i,
      duration: randomInt(1500, 6000),
      type: i % 2 === 0 ? "image" : "video",
      thumbnailUrl: null,
      originalUrl: null,
      thumbnailBlobKey: null,
      originalBlobKey: null,
      sceneId: sceneId(),
      label: `Shot ${sceneNum}${suffix}`,
      notes: NOTES[randomInt(0, NOTES.length - 1)],
      shotSize: "",
      cameraMotion: "",
      caption: "",
      directorNote: "",
      cameraNote: "",
      videoPrompt: "",
      imagePrompt: "",
      visualDescription: "",
      svg: "",
      blockRange: null,
      locked: false,
      sourceText: "",
    })

    shotInScene++
  }

  return shots
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
