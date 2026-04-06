import { query, getClient } from "./db.js"

// ── Operation types ──

export type Operation =
  // Blocks
  | { type: "block.create"; blockId: string; afterId: string | null; blockType: string; text?: string }
  | { type: "block.update"; blockId: string; text: string }
  | { type: "block.delete"; blockId: string }
  | { type: "block.changeType"; blockId: string; blockType: string }
  | { type: "block.reorder"; blockId: string; newOrder: number }
  | { type: "block.updateMeta"; blockId: string; meta: Record<string, unknown> }
  // Shots
  | { type: "shot.create"; shotId: string; sceneId: string; parentBlockId?: string; data: Record<string, unknown> }
  | { type: "shot.update"; shotId: string; patch: Record<string, unknown> }
  | { type: "shot.delete"; shotId: string }
  | { type: "shot.reorder"; shotId: string; newOrder: number }
  // Settings (JSONB replace)
  | { type: "settings.set"; key: string; data: unknown }

// ── Apply operation to DB ──

export async function applyOperation(
  projectId: string,
  userId: string,
  op: Operation,
): Promise<{ success: boolean; error?: string; opId?: number }> {
  const client = await getClient()

  try {
    await client.query("BEGIN")

    // Log operation
    const logResult = await client.query<{ id: number }>(
      `INSERT INTO operations (project_id, user_id, type, entity_id, payload)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [projectId, userId, op.type, getEntityId(op), JSON.stringify(op)],
    )
    const opId = logResult.rows[0].id

    // Apply to data tables
    switch (op.type) {
      case "block.create": {
        // Shift order of blocks after insertion point
        if (op.afterId) {
          const afterBlock = await client.query<{ order: number }>(
            `SELECT "order" FROM blocks WHERE project_id = $1 AND id = $2`,
            [projectId, op.afterId],
          )
          const afterOrder = afterBlock.rows[0]?.order ?? -1
          await client.query(
            `UPDATE blocks SET "order" = "order" + 1 WHERE project_id = $1 AND "order" > $2`,
            [projectId, afterOrder],
          )
          await client.query(
            `INSERT INTO blocks (id, project_id, type, text, "order")
             VALUES ($1, $2, $3, $4, $5)`,
            [op.blockId, projectId, op.blockType, op.text ?? "", afterOrder + 1],
          )
        } else {
          await client.query(
            `INSERT INTO blocks (id, project_id, type, text, "order")
             VALUES ($1, $2, $3, $4, 0)`,
            [op.blockId, projectId, op.blockType, op.text ?? ""],
          )
        }
        break
      }

      case "block.update": {
        await client.query(
          `UPDATE blocks SET text = $1, updated_at = now() WHERE project_id = $2 AND id = $3`,
          [op.text, projectId, op.blockId],
        )
        break
      }

      case "block.delete": {
        await client.query(
          `DELETE FROM blocks WHERE project_id = $1 AND id = $2`,
          [projectId, op.blockId],
        )
        break
      }

      case "block.changeType": {
        await client.query(
          `UPDATE blocks SET type = $1, updated_at = now() WHERE project_id = $2 AND id = $3`,
          [op.blockType, projectId, op.blockId],
        )
        break
      }

      case "block.reorder": {
        await client.query(
          `UPDATE blocks SET "order" = $1, updated_at = now() WHERE project_id = $2 AND id = $3`,
          [op.newOrder, projectId, op.blockId],
        )
        break
      }

      case "block.updateMeta": {
        await client.query(
          `UPDATE blocks SET meta = meta || $1::jsonb, updated_at = now() WHERE project_id = $2 AND id = $3`,
          [JSON.stringify(op.meta), projectId, op.blockId],
        )
        break
      }

      case "shot.create": {
        const d = op.data
        await client.query(
          `INSERT INTO shots (id, project_id, scene_id, parent_block_id, "order",
            duration, shot_size, camera_motion, caption, director_note, camera_note,
            image_prompt, video_prompt, thumbnail_url, original_url, meta)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [
            op.shotId, projectId, op.sceneId, op.parentBlockId ?? null,
            (d.order as number) ?? 0,
            (d.duration as number) ?? 3000,
            (d.shotSize as string) ?? "",
            (d.cameraMotion as string) ?? "",
            (d.caption as string) ?? "",
            (d.directorNote as string) ?? "",
            (d.cameraNote as string) ?? "",
            (d.imagePrompt as string) ?? "",
            (d.videoPrompt as string) ?? "",
            (d.thumbnailUrl as string) ?? null,
            (d.originalUrl as string) ?? null,
            JSON.stringify(d.meta ?? {}),
          ],
        )
        break
      }

      case "shot.update": {
        const sets: string[] = []
        const vals: unknown[] = []
        let idx = 1

        const fieldMap: Record<string, string> = {
          shotSize: "shot_size",
          cameraMotion: "camera_motion",
          directorNote: "director_note",
          cameraNote: "camera_note",
          imagePrompt: "image_prompt",
          videoPrompt: "video_prompt",
          thumbnailUrl: "thumbnail_url",
          originalUrl: "original_url",
          parentBlockId: "parent_block_id",
          sceneId: "scene_id",
        }

        for (const [key, value] of Object.entries(op.patch)) {
          const col = fieldMap[key] || key
          sets.push(`"${col}" = $${idx}`)
          vals.push(value)
          idx++
        }

        if (sets.length > 0) {
          sets.push(`updated_at = now()`)
          vals.push(projectId, op.shotId)
          await client.query(
            `UPDATE shots SET ${sets.join(", ")} WHERE project_id = $${idx} AND id = $${idx + 1}`,
            vals,
          )
        }
        break
      }

      case "shot.delete": {
        await client.query(
          `DELETE FROM shots WHERE project_id = $1 AND id = $2`,
          [projectId, op.shotId],
        )
        break
      }

      case "shot.reorder": {
        await client.query(
          `UPDATE shots SET "order" = $1, updated_at = now() WHERE project_id = $2 AND id = $3`,
          [op.newOrder, projectId, op.shotId],
        )
        break
      }

      case "settings.set": {
        await client.query(
          `INSERT INTO project_settings (project_id, store_key, data, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (project_id, store_key) DO UPDATE SET data = $3, updated_at = now()`,
          [projectId, op.key, JSON.stringify(op.data)],
        )
        break
      }
    }

    await client.query("COMMIT")
    return { success: true, opId }
  } catch (err) {
    await client.query("ROLLBACK")
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error(`[op] Failed to apply ${op.type}:`, message)
    return { success: false, error: message }
  } finally {
    client.release()
  }
}

// ── Load missed operations for reconnect ──

export async function getOperationsSince(
  projectId: string,
  afterId: number,
): Promise<Array<{ id: number; userId: string; op: Operation; createdAt: string }>> {
  const result = await query<{
    id: number
    user_id: string
    payload: Operation
    created_at: string
  }>(
    `SELECT id, user_id, payload, created_at
     FROM operations
     WHERE project_id = $1 AND id > $2
     ORDER BY id`,
    [projectId, afterId],
  )
  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    op: row.payload,
    createdAt: row.created_at,
  }))
}

// ── Helpers ──

function getEntityId(op: Operation): string | null {
  if ("blockId" in op) return op.blockId
  if ("shotId" in op) return op.shotId
  if ("key" in op) return op.key
  return null
}
