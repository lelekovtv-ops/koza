import { generateText } from "ai"
import { anthropic } from "@ai-sdk/anthropic"

export async function POST(req: Request) {
  try {
    const { description } = await req.json()

    if (!description || typeof description !== "string") {
      return new Response("Missing description", { status: 400 })
    }

    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      system:
        "You are a cinematic storyboard prompt engineer. Given a shot description, produce a single improved DALL-E image prompt (max 180 words). Output ONLY the prompt text, no explanation.",
      prompt: description,
    })

    return Response.json({ prompt: text.trim() })
  } catch (error) {
    console.error("ambient-prompt error:", error)
    return new Response(`Error: ${String(error)}`, { status: 500 })
  }
}
