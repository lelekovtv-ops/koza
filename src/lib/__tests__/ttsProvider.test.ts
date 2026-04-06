import { describe, it, expect } from "vitest"
import type { TtsRequest, TtsResult, TtsProviderType } from "@/lib/ttsProvider"

describe("TTS Provider types", () => {
  it("TtsRequest is well-formed", () => {
    const req: TtsRequest = {
      text: "Hello world",
      lang: "en-US",
      voiceId: "voice-123",
      speed: 1.2,
      pitch: 1.0,
    }
    expect(req.text).toBe("Hello world")
    expect(req.lang).toBe("en-US")
  })

  it("TtsRequest minimal (only required fields)", () => {
    const req: TtsRequest = { text: "Привет", lang: "ru-RU" }
    expect(req.voiceId).toBeUndefined()
    expect(req.speed).toBeUndefined()
  })

  it("TtsResult is well-formed", () => {
    const result: TtsResult = {
      audioBlob: new Blob(["test"], { type: "audio/mp3" }),
      durationMs: 3000,
      provider: "elevenlabs",
    }
    expect(result.durationMs).toBe(3000)
    expect(result.provider).toBe("elevenlabs")
  })

  it("provider types cover all options", () => {
    const types: TtsProviderType[] = ["web-speech", "elevenlabs"]
    expect(types).toHaveLength(2)
  })

  it("ElevenLabs request with voice settings", () => {
    const req: TtsRequest = {
      text: "Dramatic narration",
      lang: "en-US",
      voiceId: "21m00Tcm4TlvDq8ikWAM",
      speed: 0.9,
      stability: 0.7,
      emotion: "dramatic",
    }
    expect(req.stability).toBe(0.7)
    expect(req.emotion).toBe("dramatic")
  })
})
