import OpenAI from "openai"
import type {
  ResponseInput,
  ResponseInputImage,
  ResponseInputMessageContentList,
  ResponseInputText,
  Tool,
} from "openai/resources/responses/responses"
import { NextResponse } from "next/server"

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
        { type: "input_text", text: prompt } as ResponseInputText,
      ]

      normalizedReferenceImages.forEach((imageUrl) => {
        content.push({
          type: "input_image",
          image_url: imageUrl,
          detail: "high",
        } as ResponseInputImage)
      })

      const input = [{
        role: "user",
        content,
      }] as ResponseInput
      const tools: Tool[] = [{
        type: "image_generation",
        action: "edit",
        input_fidelity: "high",
        quality: "medium",
        size: "1536x1024",
      }]

      const response = await openai.responses.create({
        model: "gpt-4.1",
        input: input as any,
        tools,
      })

      const imageCall = response.output.find((entry: any) => entry.type === "image_generation_call" && entry.result) as any
      const imageResult = imageCall?.result as string | undefined

      if (imageResult) {
        return new Response(Buffer.from(imageResult, "base64"), {
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