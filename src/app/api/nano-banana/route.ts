import { GoogleGenAI } from "@google/genai"
import { NextResponse } from "next/server"

type CandidatePart = {
  inlineData?: {
    mimeType?: string
    data?: string
  }
  text?: string
}

type ReferencePart = {
  inlineData: {
    mimeType: string
    data: string
  }
}

function parseDataUrl(dataUrl: string): ReferencePart | null {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/)
  if (!match) {
    return null
  }

  return {
    inlineData: {
      mimeType: match[1],
      data: match[2],
    },
  }
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export async function POST(req: Request) {
  try {
    const { prompt, model, referenceImages } = await req.json()

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

    const maxReferenceCount = modelId === "gemini-2.5-flash-image" ? 3 : 5

    const imageReferenceParts = Array.isArray(referenceImages)
      ? referenceImages
        .filter((entry): entry is string => typeof entry === "string" && entry.startsWith("data:"))
        .slice(0, maxReferenceCount)
        .map(parseDataUrl)
        .filter((entry): entry is ReferencePart => Boolean(entry))
      : []

    const contents = [
      prompt,
      ...imageReferenceParts,
    ]

    const response = await ai.models.generateContent({
      model: modelId,
      contents,
      config: {
        responseModalities: ["image"],
        imageConfig: {
          aspectRatio: "16:9",
          ...(modelId === "gemini-2.5-flash-image" ? {} : { imageSize: "2K" }),
        },
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