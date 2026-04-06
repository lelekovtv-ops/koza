import jwt from "jsonwebtoken"
import { query } from "./db.js"

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_in_production"

export interface TokenPayload {
  userId: string
  email: string
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload
    if (!decoded.userId || !decoded.email) return null
    return decoded
  } catch {
    return null
  }
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" })
}

/**
 * Check if user has access to a project and return their role.
 * Returns null if no access.
 */
export async function getUserProjectRole(
  userId: string,
  projectId: string,
): Promise<"owner" | "editor" | "viewer" | null> {
  // Check project_members first
  const memberResult = await query<{ role: string }>(
    `SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId],
  )
  if (memberResult.rows[0]) {
    return memberResult.rows[0].role as "owner" | "editor" | "viewer"
  }

  // Check if user is the project owner (auto-membership)
  const ownerResult = await query<{ id: string }>(
    `SELECT id FROM projects WHERE id = $1 AND owner_id = $2`,
    [projectId, userId],
  )
  if (ownerResult.rows[0]) {
    return "owner"
  }

  return null
}

/**
 * Check if user can write to a project (owner or editor).
 */
export async function canWrite(userId: string, projectId: string): Promise<boolean> {
  const role = await getUserProjectRole(userId, projectId)
  return role === "owner" || role === "editor"
}
