import { streamText } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import { google } from "@ai-sdk/google"
import { openai } from "@ai-sdk/openai"
import { DEFAULT_TEXT_MODEL_ID } from "@/lib/models"

const hasConfiguredKey = (value: string | undefined, prefix: string, placeholder?: string) => {
  const normalized = value?.trim()

  if (!normalized || !normalized.startsWith(prefix)) return false
  if (placeholder && normalized === placeholder) return false

  return true
}

const getModel = (modelId: string) => {
  if (modelId.startsWith("claude")) return anthropic(modelId)
  if (modelId.startsWith("gemini")) return google(modelId)
  if (modelId.startsWith("gpt")) return openai(modelId)
  return anthropic(DEFAULT_TEXT_MODEL_ID)
}

const KOZA_DEFAULT_SYSTEM = [
  "You are KOZA, an AI video production copilot.",
  "Respond like a senior creative producer working inside a shot-based editing workspace.",
  "Prioritize concise outputs that are directly usable for script beats, references, image prompts, video prompts, and edit decisions.",
].join(" ")

export async function POST(req: Request) {
  try {
    const { messages, modelId, system, workspace } = await req.json()
    const resolvedModelId = modelId || DEFAULT_TEXT_MODEL_ID
    const resolvedSystem = system || (workspace === "nova" ? KOZA_DEFAULT_SYSTEM : undefined)

    if (resolvedModelId.startsWith("claude") && !hasConfiguredKey(process.env.ANTHROPIC_API_KEY, "sk-ant-")) {
      return new Response("ANTHROPIC_API_KEY is missing or does not look like an Anthropic key.", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      })
    }

    if (resolvedModelId.startsWith("gpt") && !hasConfiguredKey(process.env.OPENAI_API_KEY, "sk-", "sk-your-openai-key-here")) {
      return new Response("OPENAI_API_KEY is missing or does not look like an OpenAI key.", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      })
    }

    const result = streamText({
      model: getModel(resolvedModelId),
      system: resolvedSystem,
      messages,
    })

    return result.toTextStreamResponse()
  } catch (error) {
    console.error("API Error:", error)
    return new Response(`Error: ${String(error)}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    })
  }
}
