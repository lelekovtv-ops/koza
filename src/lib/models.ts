export type ModelCategory = "text" | "image" | "video"

export type AIModel = {
  id: string
  name: string
  provider: string
  category: ModelCategory
  color: string
  capabilities: string[]
}

export const DEFAULT_TEXT_MODEL_ID = "claude-sonnet-4-20250514"

export const ALL_MODELS: AIModel[] = [
  // Text models
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "Anthropic", category: "text", color: "#d97706", capabilities: ["chat", "analysis", "code"] },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", category: "text", color: "#10b981", capabilities: ["chat", "analysis", "code"] },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "Google", category: "text", color: "#3b82f6", capabilities: ["chat", "analysis"] },

  // Image models
  { id: "dall-e-3", name: "DALL-E 3", provider: "OpenAI", category: "image", color: "#10b981", capabilities: ["text-to-image"] },
  { id: "midjourney-v6", name: "Midjourney v6", provider: "Midjourney", category: "image", color: "#6366f1", capabilities: ["text-to-image"] },
  { id: "stable-diffusion-xl", name: "SDXL", provider: "Stability AI", category: "image", color: "#a855f7", capabilities: ["text-to-image", "image-to-image"] },
  { id: "flux-1.1-pro", name: "Flux 1.1 Pro", provider: "Black Forest Labs", category: "image", color: "#ec4899", capabilities: ["text-to-image"] },
  { id: "imagen-4", name: "Imagen 4", provider: "Google", category: "image", color: "#3b82f6", capabilities: ["text-to-image"] },
  { id: "gpt-image", name: "GPT Image", provider: "OpenAI", category: "image", color: "#10b981", capabilities: ["text-to-image", "image-to-image"] },
  { id: "nano-banana", name: "Nano Banana", provider: "Nano Banana", category: "image", color: "#facc15", capabilities: ["text-to-image"] },
  { id: "nano-banana-2", name: "Nano Banana 2", provider: "Nano Banana", category: "image", color: "#eab308", capabilities: ["text-to-image"] },
  { id: "nano-banana-pro", name: "Nano Banana Pro", provider: "Nano Banana", category: "image", color: "#ca8a04", capabilities: ["text-to-image"] },

  // Video models
  { id: "kling-3.0", name: "Kling 3.0", provider: "Kuaishou", category: "video", color: "#3b82f6", capabilities: ["text-to-video", "image-to-video"] },
  { id: "kling-omni", name: "Kling Omni", provider: "Kuaishou", category: "video", color: "#60a5fa", capabilities: ["text-to-video", "image-to-video"] },
  { id: "seedance-1.0", name: "Seedance 1.0", provider: "ByteDance", category: "video", color: "#10b981", capabilities: ["text-to-video", "image-to-video"] },
  { id: "sora", name: "Sora", provider: "OpenAI", category: "video", color: "#f59e0b", capabilities: ["text-to-video"] },
  { id: "runway-gen4", name: "Runway Gen-4", provider: "Runway", category: "video", color: "#ef4444", capabilities: ["text-to-video", "image-to-video"] },
  { id: "pika-2.0", name: "Pika 2.0", provider: "Pika", category: "video", color: "#ec4899", capabilities: ["text-to-video", "image-to-video"] },
  { id: "luma-dream-machine", name: "Luma Dream Machine", provider: "Luma AI", category: "video", color: "#8b5cf6", capabilities: ["text-to-video", "image-to-video"] },
  { id: "veo-3", name: "Veo 3", provider: "Google", category: "video", color: "#06b6d4", capabilities: ["text-to-video"] },
  { id: "hailuo-minimax", name: "Hailuo MiniMax", provider: "MiniMax", category: "video", color: "#f97316", capabilities: ["text-to-video", "image-to-video"] },
  { id: "wan-2.1", name: "Wan 2.1", provider: "Alibaba", category: "video", color: "#84cc16", capabilities: ["text-to-video", "image-to-video"] },
]

export const getModelsByCategory = (cat: ModelCategory) => ALL_MODELS.filter((m) => m.category === cat)
export const getModelById = (id: string) => ALL_MODELS.find((m) => m.id === id)

export type Model = (typeof ALL_MODELS)[number]
