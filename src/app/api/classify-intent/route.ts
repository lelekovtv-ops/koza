import { generateText } from "ai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { anthropic } from "@ai-sdk/anthropic"
import { INTENT_CLASSIFY_PROMPT } from "@/lib/intentParser"

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
})

export async function POST(req: Request) {
  try {
    const { input, system: customSystem } = await req.json()
    if (!input || typeof input !== "string") {
      return new Response("chat", { headers: { "Content-Type": "text/plain" } })
    }

    const hasAnthropic = !!process.env.ANTHROPIC_API_KEY

    const model = hasAnthropic
      ? anthropic("claude-haiku-4-5-20251001")
      : null

    if (!model) {
      return new Response("chat", { headers: { "Content-Type": "text/plain" } })
    }

    const { text } = await generateText({
      model,
      system: customSystem || INTENT_CLASSIFY_PROMPT,
      messages: [{ role: "user", content: input }],
      temperature: 0,
    })

    const result = text.trim().toLowerCase().replace(/[^a-z_]/g, "")
    console.log(`[classify-intent] "${input}" → "${result}"`)
    return new Response(result, {
      headers: { "Content-Type": "text/plain" },
    })
  } catch (e) {
    console.error("[classify-intent] error:", e)
    return new Response("chat", { headers: { "Content-Type": "text/plain" } })
  }
}
