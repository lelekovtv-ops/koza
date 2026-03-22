import OpenAI from "openai"
import type { ResponseInput, ResponseInputMessageContentList, ResponseOutputItem, Tool } from "openai/resources/responses/responses"
import { NextResponse } from "next/server"

type ImageGenerationCall = Extract<ResponseOutputItem, { type: "image_generation_call" }>

export async function POST(req: Request) {
  try {
    const { prompt, referenceImages } = await req.json()

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const normalizedReferenceImages = Array.isArray(referenceImages)
      ? referenceImages.filter((entry): entry is string => typeof entry === "string" && entry.startsWith("data:"))
      : []

    if (normalizedReferenceImages.length > 0) {
      const content: ResponseInputMessageContentList = [
        { type: "input_text", text: prompt },
        ...normalizedReferenceImages.map((imageUrl) => ({
          type: "input_image" as const,
          image_url: imageUrl,
          detail: "high" as const,
        })),
      ]
      const input: ResponseInput = [{
        role: "user",
        content,
      }]
      const tools: Tool[] = [{
        type: "image_generation",
        action: "edit",
        input_fidelity: "high",
        quality: "medium",
        size: "1536x1024",
      }]

      const response = await openai.responses.create({
        model: "gpt-4.1",
        input,
        tools,
      })

      const imageCall = response.output.find(
        (entry): entry is ImageGenerationCall => entry.type === "image_generation_call"
      )

      if (imageCall?.result) {
        return new Response(Buffer.from(imageCall.result, "base64"), {
          headers: { "Content-Type": "image/png" },
        })
      }

      return NextResponse.json({ error: "No image" }, { status: 500 })
    }

    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      quality: "low",
      size: "1536x1024",
      n: 1,
    })

    const imageUrl = result.data?.[0]?.url
    const b64 = result.data?.[0]?.b64_json

    if (b64) {
      return new Response(Buffer.from(b64, "base64"), {
        headers: { "Content-Type": "image/png" },
      })
    }

    if (imageUrl) {
      const imgRes = await fetch(imageUrl)
      return new Response(await imgRes.arrayBuffer(), {
        headers: { "Content-Type": "image/png" },
      })
    }

    return NextResponse.json({ error: "No image" }, { status: 500 })
  } catch (error) {
    console.error("GPT Image error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}