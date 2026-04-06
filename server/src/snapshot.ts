import { query } from "./db.js"

/**
 * Load full project snapshot for initial sync on join.
 */
export async function getProjectSnapshot(projectId: string) {
  const [blocksRes, shotsRes, settingsRes, lastOpRes] = await Promise.all([
    query<{
      id: string; type: string; text: string; order: number;
      duration_ms: number | null; duration_src: string | null; meta: Record<string, unknown>
    }>(
      `SELECT id, type, text, "order", duration_ms, duration_src, meta
       FROM blocks WHERE project_id = $1 ORDER BY "order"`,
      [projectId],
    ),

    query<{
      id: string; scene_id: string | null; parent_block_id: string | null;
      order: number; duration: number; shot_size: string; camera_motion: string;
      caption: string; director_note: string; camera_note: string;
      image_prompt: string; video_prompt: string;
      thumbnail_url: string | null; original_url: string | null;
      meta: Record<string, unknown>
    }>(
      `SELECT id, scene_id, parent_block_id, "order", duration,
              shot_size, camera_motion, caption, director_note, camera_note,
              image_prompt, video_prompt, thumbnail_url, original_url, meta
       FROM shots WHERE project_id = $1 ORDER BY "order"`,
      [projectId],
    ),

    query<{ store_key: string; data: unknown }>(
      `SELECT store_key, data FROM project_settings WHERE project_id = $1`,
      [projectId],
    ),

    query<{ id: number }>(
      `SELECT id FROM operations WHERE project_id = $1 ORDER BY id DESC LIMIT 1`,
      [projectId],
    ),
  ])

  const settings: Record<string, unknown> = {}
  for (const row of settingsRes.rows) {
    settings[row.store_key] = row.data
  }

  return {
    blocks: blocksRes.rows.map((r) => ({
      id: r.id,
      type: r.type,
      text: r.text,
      order: r.order,
      durationMs: r.duration_ms,
      durationSource: r.duration_src,
      ...r.meta,
    })),
    shots: shotsRes.rows.map((r) => ({
      id: r.id,
      sceneId: r.scene_id,
      parentBlockId: r.parent_block_id,
      order: r.order,
      duration: r.duration,
      shotSize: r.shot_size,
      cameraMotion: r.camera_motion,
      caption: r.caption,
      directorNote: r.director_note,
      cameraNote: r.camera_note,
      imagePrompt: r.image_prompt,
      videoPrompt: r.video_prompt,
      thumbnailUrl: r.thumbnail_url,
      originalUrl: r.original_url,
      ...r.meta,
    })),
    settings,
    lastOpId: lastOpRes.rows[0]?.id ?? 0,
  }
}
