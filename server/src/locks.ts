import { query } from "./db.js"

const LOCK_DURATION_MINUTES = 5

/**
 * Try to acquire a scene lock.
 * Returns true if acquired, false if already locked by another user.
 */
export async function acquireLock(
  projectId: string,
  sceneId: string,
  userId: string,
): Promise<{ acquired: boolean; lockedBy?: string; lockedByName?: string }> {
  // Clean expired locks first
  await query(`SELECT cleanup_expired_locks()`)

  // Try to insert lock
  const result = await query<{ user_id: string }>(
    `INSERT INTO scene_locks (project_id, scene_id, user_id, expires_at)
     VALUES ($1, $2, $3, now() + interval '${LOCK_DURATION_MINUTES} minutes')
     ON CONFLICT (project_id, scene_id) DO NOTHING
     RETURNING user_id`,
    [projectId, sceneId, userId],
  )

  if (result.rows[0]) {
    return { acquired: true }
  }

  // Lock exists — check who owns it
  const existing = await query<{ user_id: string; name: string }>(
    `SELECT sl.user_id, u.name FROM scene_locks sl
     JOIN users u ON u.id = sl.user_id
     WHERE sl.project_id = $1 AND sl.scene_id = $2`,
    [projectId, sceneId],
  )

  const owner = existing.rows[0]
  if (!owner) {
    // Race condition — lock was cleaned between our insert and select. Retry.
    return acquireLock(projectId, sceneId, userId)
  }

  // Already own this lock — extend it
  if (owner.user_id === userId) {
    await extendLock(projectId, sceneId, userId)
    return { acquired: true }
  }

  return { acquired: false, lockedBy: owner.user_id, lockedByName: owner.name }
}

/**
 * Release a scene lock. Only the owner can release.
 */
export async function releaseLock(
  projectId: string,
  sceneId: string,
  userId: string,
): Promise<boolean> {
  const result = await query(
    `DELETE FROM scene_locks WHERE project_id = $1 AND scene_id = $2 AND user_id = $3`,
    [projectId, sceneId, userId],
  )
  return (result.rowCount ?? 0) > 0
}

/**
 * Extend lock expiry (called on each operation in the scene).
 */
export async function extendLock(
  projectId: string,
  sceneId: string,
  userId: string,
): Promise<void> {
  await query(
    `UPDATE scene_locks SET expires_at = now() + interval '${LOCK_DURATION_MINUTES} minutes'
     WHERE project_id = $1 AND scene_id = $2 AND user_id = $3`,
    [projectId, sceneId, userId],
  )
}

/**
 * Get all active locks for a project.
 */
export async function getProjectLocks(
  projectId: string,
): Promise<Array<{ sceneId: string; userId: string; userName: string; expiresAt: string }>> {
  await query(`SELECT cleanup_expired_locks()`)

  const result = await query<{
    scene_id: string
    user_id: string
    name: string
    expires_at: string
  }>(
    `SELECT sl.scene_id, sl.user_id, u.name, sl.expires_at
     FROM scene_locks sl
     JOIN users u ON u.id = sl.user_id
     WHERE sl.project_id = $1`,
    [projectId],
  )

  return result.rows.map((r) => ({
    sceneId: r.scene_id,
    userId: r.user_id,
    userName: r.name,
    expiresAt: r.expires_at,
  }))
}

/**
 * Release all locks held by a user (called on disconnect).
 */
export async function releaseAllUserLocks(
  projectId: string,
  userId: string,
): Promise<number> {
  const result = await query(
    `DELETE FROM scene_locks WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId],
  )
  return result.rowCount ?? 0
}
