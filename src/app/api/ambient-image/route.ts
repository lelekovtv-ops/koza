import { experimental_generateImage as generateImage } from "ai"
import { openai } from "@ai-sdk/openai"

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json()

    if (!prompt || typeof prompt !== "string") {
      return new Response("Missing prompt", { status: 400 })
    }

    const { image } = await generateImage({
      model: openai.image("dall-e-3"),
      prompt,
      size: "1792x1024",
    })

    const buffer = Buffer.from(image.base64, "base64")

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(buffer.length),
      },
    })
  } catch (error) {
    console.error("ambient-image error:", error)
    return new Response(`Error: ${String(error)}`, { status: 500 })
  }
}
