import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { getPresignedUploadUrl, getPublicUrl } from "@/lib/s3Client"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { projectId, filename, contentType } = await req.json()

    if (!projectId || !filename) {
      return NextResponse.json({ error: "projectId and filename required" }, { status: 400 })
    }

    const userId = (session.user as { id?: string }).id || "unknown"
    const key = `${userId}/${projectId}/${filename}`

    const uploadUrl = await getPresignedUploadUrl(key, contentType || "image/webp")
    const publicUrl = getPublicUrl(key)

    return NextResponse.json({ uploadUrl, publicUrl, key })
  } catch (err) {
    console.error("[upload]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
