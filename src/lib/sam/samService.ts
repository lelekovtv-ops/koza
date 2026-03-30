/**
 * SAM (Segment Anything) browser service using SlimSAM + ONNX Runtime Web.
 *
 * Flow:
 * 1. loadModels() — loads encoder + decoder ONNX models (once, cached)
 * 2. setImage(imageUrl) — runs encoder on image, produces embedding (~2-3s)
 * 3. segment(x, y) — runs decoder with click point, returns mask (~50ms)
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — use wasm-only build to avoid jsep module loading issues
import * as ort from "onnxruntime-web/wasm"

const ENCODER_PATH = "/models/sam/onnx/vision_encoder_quantized.onnx"
const DECODER_PATH = "/models/sam/onnx/prompt_encoder_mask_decoder_quantized.onnx"
const MODEL_INPUT_SIZE = 1024

let encoderSession: ort.InferenceSession | null = null
let decoderSession: ort.InferenceSession | null = null
let imageEmbedding: ort.Tensor | null = null
let encoderPositionalEmbedding: ort.Tensor | null = null
let encoderOutputs: Record<string, ort.Tensor> = {}
let currentImageSize = { w: 0, h: 0 }
let loading = false

export type SAMStatus = "idle" | "loading-models" | "encoding-image" | "ready"

type StatusListener = (status: SAMStatus) => void
const listeners = new Set<StatusListener>()
let currentStatus: SAMStatus = "idle"

function setStatus(s: SAMStatus) {
  currentStatus = s
  for (const l of listeners) l(s)
}

export function onStatusChange(fn: StatusListener): () => void {
  listeners.add(fn)
  fn(currentStatus)
  return () => { listeners.delete(fn) }
}

export function getStatus(): SAMStatus {
  return currentStatus
}

// ── Load models ──

export async function loadModels(): Promise<void> {
  if (encoderSession && decoderSession) return
  if (loading) return
  loading = true
  setStatus("loading-models")

  try {
    // Configure ONNX Runtime for WASM
    ort.env.wasm.wasmPaths = "/"
    ort.env.wasm.numThreads = 1
    ort.env.wasm.simd = true

    const [enc, dec] = await Promise.all([
      ort.InferenceSession.create(ENCODER_PATH, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      }),
      ort.InferenceSession.create(DECODER_PATH, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      }),
    ])

    encoderSession = enc
    decoderSession = dec
    setStatus("idle")
  } catch (err) {
    console.error("[SAM] Failed to load models:", err)
    setStatus("idle")
    throw err
  } finally {
    loading = false
  }
}

// ── Encode image ──

export async function setImage(imageUrl: string): Promise<void> {
  if (!encoderSession) await loadModels()
  if (!encoderSession) throw new Error("SAM encoder not loaded")

  setStatus("encoding-image")

  try {
    // Load image to canvas
    const img = new Image()
    img.crossOrigin = "anonymous"
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error("Failed to load image"))
      img.src = imageUrl
    })

    currentImageSize = { w: img.naturalWidth, h: img.naturalHeight }

    // Resize to MODEL_INPUT_SIZE maintaining aspect ratio, pad with zeros
    const canvas = document.createElement("canvas")
    canvas.width = MODEL_INPUT_SIZE
    canvas.height = MODEL_INPUT_SIZE
    const ctx = canvas.getContext("2d")!
    ctx.fillStyle = "black"
    ctx.fillRect(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)

    const scale = MODEL_INPUT_SIZE / Math.max(img.naturalWidth, img.naturalHeight)
    const sw = Math.round(img.naturalWidth * scale)
    const sh = Math.round(img.naturalHeight * scale)
    ctx.drawImage(img, 0, 0, sw, sh)

    // Extract pixel data and convert to float32 CHW format with normalization
    const imageData = ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)
    const pixels = imageData.data
    const n = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE
    const float32 = new Float32Array(3 * n)

    // ImageNet normalization
    const mean = [123.675, 116.28, 103.53]
    const std = [58.395, 57.12, 57.375]

    for (let i = 0; i < n; i++) {
      float32[i] = (pixels[i * 4] - mean[0]) / std[0]           // R
      float32[n + i] = (pixels[i * 4 + 1] - mean[1]) / std[1]   // G
      float32[2 * n + i] = (pixels[i * 4 + 2] - mean[2]) / std[2] // B
    }

    const inputTensor = new ort.Tensor("float32", float32, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE])

    const result = await encoderSession.run({ pixel_values: inputTensor })

    // Store all encoder outputs — decoder may need multiple
    const outputKeys = Object.keys(result)
    console.log("[SAM] Encoder outputs:", outputKeys.map((k) => `${k}: ${result[k].dims}`))
    encoderOutputs = result as Record<string, ort.Tensor>

    // Find image embedding and positional embedding
    const embeddingKey = outputKeys.find((k) => k === "image_embeddings") || outputKeys.find((k) => k.includes("embedding")) || outputKeys[0]
    imageEmbedding = result[embeddingKey]

    const posKey = outputKeys.find((k) => k === "image_positional_embeddings" || k.includes("positional"))
    encoderPositionalEmbedding = posKey ? result[posKey] : null

    setStatus("ready")
  } catch (err) {
    console.error("[SAM] Encoding error:", err)
    setStatus("idle")
    throw err
  }
}

// ── Segment at point ──

export interface SAMResult {
  mask: Uint8Array // binary mask, 1 byte per pixel (0 or 255)
  width: number
  height: number
  score: number
}

export async function segment(clickX: number, clickY: number): Promise<SAMResult | null> {
  if (!decoderSession || !imageEmbedding) return null

  try {
    const scale = MODEL_INPUT_SIZE / Math.max(currentImageSize.w, currentImageSize.h)
    const px = clickX * scale
    const py = clickY * scale

    // input_points: [1, 1, 2] — one point
    const pointCoords = new Float32Array([px, py])
    const pointLabels = new Float32Array([1]) // 1 = foreground

    const inputNames = decoderSession.inputNames
    console.log("[SAM] Decoder inputs:", inputNames, "Encoder outputs available:", Object.keys(encoderOutputs))

    // Build feeds dynamically based on model's expected inputs
    const feeds: Record<string, ort.Tensor> = {}

    for (const name of inputNames) {
      if (name === "image_embeddings") {
        feeds[name] = imageEmbedding
      } else if (name === "image_positional_embeddings") {
        if (encoderPositionalEmbedding) {
          feeds[name] = encoderPositionalEmbedding
        } else if (encoderOutputs[name]) {
          feeds[name] = encoderOutputs[name]
        }
      } else if (name === "input_points") {
        feeds[name] = new ort.Tensor("float32", pointCoords, [1, 1, 1, 2])
      } else if (name === "input_labels") {
        feeds[name] = new ort.Tensor("int64", new BigInt64Array([BigInt(1)]), [1, 1, 1])
      } else if (name === "has_mask_input") {
        feeds[name] = new ort.Tensor("float32", new Float32Array([0]), [1])
      } else if (name === "mask_input") {
        feeds[name] = new ort.Tensor("float32", new Float32Array(256 * 256).fill(0), [1, 1, 256, 256])
      } else if (name === "orig_im_size") {
        feeds[name] = new ort.Tensor("float32", new Float32Array([currentImageSize.h, currentImageSize.w]), [2])
      } else if (name === "input_image_size") {
        feeds[name] = new ort.Tensor("float32", new Float32Array([MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]), [2])
      }
    }

    // Fill any missing inputs from encoder outputs
    for (const name of inputNames) {
      if (!feeds[name] && encoderOutputs[name]) {
        feeds[name] = encoderOutputs[name]
      }
    }

    console.log("[SAM] Decoder feeds:", Object.keys(feeds), "missing:", inputNames.filter((n) => !feeds[n]))
    const result = await decoderSession.run(feeds)

    // Extract mask
    const outputKeys = Object.keys(result)
    const maskKey = outputKeys.find((k) => k.includes("mask")) || outputKeys[0]
    const scoreKey = outputKeys.find((k) => k.includes("score") || k.includes("iou"))
    const maskData = result[maskKey].data as Float32Array
    const scores = scoreKey ? result[scoreKey].data as Float32Array : new Float32Array([0.9])

    // Find best mask (highest score)
    let bestIdx = 0
    let bestScore = scores[0]
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] > bestScore) { bestScore = scores[i]; bestIdx = i }
    }

    // Mask shape might be [1, N, H, W] — extract the best one
    const maskDims = result[maskKey].dims
    const maskH = Number(maskDims[maskDims.length - 2])
    const maskW = Number(maskDims[maskDims.length - 1])
    const maskSize = maskH * maskW
    const offset = bestIdx * maskSize

    // Convert mask from decoder resolution to original image resolution
    // The encoder padded the image to MODEL_INPUT_SIZE x MODEL_INPUT_SIZE
    // The actual image occupies scale * originalW x scale * originalH in that space
    // The mask is at maskW x maskH resolution, mapping to that same padded space
    const binaryMask = new Uint8Array(currentImageSize.w * currentImageSize.h)

    // How many mask pixels correspond to the actual image area (not padding)
    const imgInMaskW = (currentImageSize.w * scale * maskW) / MODEL_INPUT_SIZE
    const imgInMaskH = (currentImageSize.h * scale * maskH) / MODEL_INPUT_SIZE

    console.log("[SAM] Mask dims:", maskW, "x", maskH, "Image:", currentImageSize.w, "x", currentImageSize.h, "scale:", scale, "imgInMask:", imgInMaskW, "x", imgInMaskH)

    for (let y = 0; y < currentImageSize.h; y++) {
      for (let x = 0; x < currentImageSize.w; x++) {
        // Map original pixel to mask pixel (within the non-padded region)
        const mx = Math.min(Math.floor((x / currentImageSize.w) * imgInMaskW), maskW - 1)
        const my = Math.min(Math.floor((y / currentImageSize.h) * imgInMaskH), maskH - 1)
        const val = maskData[offset + my * maskW + mx]
        binaryMask[y * currentImageSize.w + x] = val > 0 ? 255 : 0
      }
    }

    return {
      mask: binaryMask,
      width: currentImageSize.w,
      height: currentImageSize.h,
      score: bestScore,
    }
  } catch (err) {
    console.error("[SAM] Segmentation error:", err)
    return null
  }
}

// ── Render mask as smooth overlay canvas ──

function blurMask(mask: Uint8Array, width: number, height: number, radius: number): Float32Array {
  // Simple box blur for smoothing mask edges
  const result = new Float32Array(width * height)
  const temp = new Float32Array(width * height)

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    let sum = 0
    for (let x = 0; x < radius; x++) sum += mask[y * width + x]
    for (let x = 0; x < width; x++) {
      if (x + radius < width) sum += mask[y * width + x + radius]
      if (x - radius >= 0) sum -= mask[y * width + x - radius]
      temp[y * width + x] = sum / (2 * radius + 1)
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    let sum = 0
    for (let y = 0; y < radius; y++) sum += temp[y * width + x]
    for (let y = 0; y < height; y++) {
      if (y + radius < height) sum += temp[(y + radius) * width + x]
      if (y - radius >= 0) sum -= temp[(y - radius) * width + x]
      result[y * width + x] = sum / (2 * radius + 1)
    }
  }

  return result
}

export function renderMaskOverlay(
  mask: Uint8Array,
  width: number,
  height: number,
  color = [212, 168, 83], // gold
): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")!

  // Blur the mask for smooth edges
  const blurRadius = Math.max(2, Math.round(Math.min(width, height) / 150))
  const smoothed = blurMask(mask, width, height, blurRadius)

  // Render with soft edges — alpha based on smoothed distance from edge
  const imageData = ctx.createImageData(width, height)
  const data = imageData.data

  for (let i = 0; i < smoothed.length; i++) {
    const val = smoothed[i] / 255
    if (val > 0.01) {
      // Soft fill — more transparent in center, more visible at edges
      const edgeFactor = Math.min(1, val * 4) // ramp up at edges
      const fillAlpha = val > 0.5 ? 0.25 : edgeFactor * 0.5 // inner = subtle, edge = visible

      data[i * 4] = color[0]
      data[i * 4 + 1] = color[1]
      data[i * 4 + 2] = color[2]
      data[i * 4 + 3] = Math.round(fillAlpha * 255)
    }
  }

  ctx.putImageData(imageData, 0, 0)

  // Draw glowing edge contour
  ctx.globalCompositeOperation = "source-over"
  const edgeCanvas = document.createElement("canvas")
  edgeCanvas.width = width
  edgeCanvas.height = height
  const edgeCtx = edgeCanvas.getContext("2d")!
  const edgeData = edgeCtx.createImageData(width, height)
  const ed = edgeData.data

  // Detect edges — pixels where smoothed transitions from low to high
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const c = smoothed[idx]
      const l = smoothed[idx - 1]
      const r = smoothed[idx + 1]
      const t = smoothed[(y - 1) * width + x]
      const b = smoothed[(y + 1) * width + x]
      const gradient = Math.abs(c - l) + Math.abs(c - r) + Math.abs(c - t) + Math.abs(c - b)
      if (gradient > 30) {
        const intensity = Math.min(1, gradient / 120)
        ed[idx * 4] = 255
        ed[idx * 4 + 1] = 220
        ed[idx * 4 + 2] = 150
        ed[idx * 4 + 3] = Math.round(intensity * 200)
      }
    }
  }

  edgeCtx.putImageData(edgeData, 0, 0)
  // Blur the edge for glow effect
  ctx.filter = `blur(${Math.max(1, blurRadius)}px)`
  ctx.drawImage(edgeCanvas, 0, 0)
  ctx.filter = "none"
  ctx.drawImage(edgeCanvas, 0, 0) // sharp edge on top of glow

  return canvas
}

// ── Extract masked region as description text for LLM ──

export function getMaskBoundingBox(mask: Uint8Array, width: number, height: number): { x: number; y: number; w: number; h: number } {
  let minX = width, minY = height, maxX = 0, maxY = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

export function cropMaskedRegion(imageUrl: string, mask: Uint8Array, width: number, height: number): Promise<string> {
  const bbox = getMaskBoundingBox(mask, width, height)

  return new Promise((resolve) => {
    const img = new window.Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = bbox.w
      canvas.height = bbox.h
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h)
      resolve(canvas.toDataURL("image/jpeg", 0.8))
    }
    img.src = imageUrl
  })
}
