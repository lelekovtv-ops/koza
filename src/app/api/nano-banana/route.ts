import { GoogleGenAI } from "@google/genai"
import { NextResponse } from "next/server"

type CandidatePart = {
  inlineData?: {
    mimeType?: string
    data?: string
  }
  text?: string
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export async function POST(req: Request) {
  try {
    const { prompt, model } = await req.json()

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 })
    }

    const apiKey = process.env.GOOGLE_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "GOOGLE_API_KEY not configured" }, { status: 500 })
    }

    const ai = new GoogleGenAI({ apiKey })

    let modelId = "gemini-2.5-flash-image"
    if (model === "nano-banana-2") modelId = "gemini-3.1-flash-image-preview"
    else if (model === "nano-banana-pro") modelId = "gemini-3-pro-image-preview"
    else if (model === "nano-banana") modelId = "gemini-2.5-flash-image"

    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseModalities: ["image", "text"],
      },
    })

    const parts = response.candidates?.[0]?.content?.parts as CandidatePart[] | undefined
    const imagePart = parts?.find((part) => part.inlineData?.mimeType?.startsWith("image/"))

    if (imagePart?.inlineData?.data) {
      const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64")

      return new Response(imageBuffer, {
        headers: {
          "Content-Type": imagePart.inlineData.mimeType || "image/png",
          "Cache-Control": "public, max-age=31536000",
        },
      })
    }

    const textPart = parts?.find((part) => part.text)
    return NextResponse.json(
      {
        error: "No image generated",
        details: textPart?.text || `Model ${modelId} returned no image parts`,
      },
      { status: 500 }
    )
  } catch (error) {
    console.error("Nano Banana error:", error)
    return NextResponse.json(
      { error: "Image generation failed", details: getErrorMessage(error) },
      { status: 500 }
    )
  }
}