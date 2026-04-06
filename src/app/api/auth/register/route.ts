import { NextResponse } from "next/server"
import bcryptjs from "bcryptjs"
import { dbQuery } from "@/lib/serverDb"

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Check if user exists
    const existing = await dbQuery(
      `SELECT id FROM users WHERE email = $1`,
      [normalizedEmail],
    )
    if (existing.rows[0]) {
      return NextResponse.json({ error: "User already exists" }, { status: 409 })
    }

    // Hash password and create user
    const hash = await bcryptjs.hash(password, 12)
    const result = await dbQuery<{ id: string; email: string; name: string }>(
      `INSERT INTO users (email, password, name) VALUES ($1, $2, $3)
       RETURNING id, email, name`,
      [normalizedEmail, hash, (name || "").trim() || normalizedEmail.split("@")[0]],
    )

    const user = result.rows[0]

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
    })
  } catch (err) {
    console.error("[register]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
