/**
 * Reinhard Color Transfer — перенос цветовой палитры с reference на target.
 * Работает в LAB цветовом пространстве.
 * Быстро, детерминированно, без AI.
 */

// ── RGB ↔ LAB conversion ──

function srgbToLinear(c: number): number {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function linearToSrgb(c: number): number {
  c = Math.max(0, Math.min(1, c))
  return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255)
}

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  // RGB → XYZ (D65)
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)

  let x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047
  let y = (0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb) / 1.00000
  let z = (0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb) / 1.08883

  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
  x = f(x)
  y = f(y)
  z = f(z)

  return [
    116 * y - 16,       // L: 0-100
    500 * (x - y),      // a: -128 to 127
    200 * (y - z),      // b: -128 to 127
  ]
}

function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const y = (L + 16) / 116
  const x = a / 500 + y
  const z = y - b / 200

  const finv = (t: number) => t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787

  const xr = 0.95047 * finv(x)
  const yr = 1.00000 * finv(y)
  const zr = 1.08883 * finv(z)

  const lr = 3.2404542 * xr - 1.5371385 * yr - 0.4985314 * zr
  const lg = -0.9692660 * xr + 1.8760108 * yr + 0.0415560 * zr
  const lb = 0.0556434 * xr - 0.2040259 * yr + 1.0572252 * zr

  return [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)]
}

// ── Stats ──

interface ChannelStats {
  mean: number
  std: number
}

function computeLabStats(data: Uint8ClampedArray, width: number, height: number): [ChannelStats, ChannelStats, ChannelStats] {
  const n = width * height
  let sumL = 0, sumA = 0, sumB = 0

  const labData = new Float32Array(n * 3)

  for (let i = 0; i < n; i++) {
    const idx = i * 4
    const [L, a, b] = rgbToLab(data[idx], data[idx + 1], data[idx + 2])
    labData[i * 3] = L
    labData[i * 3 + 1] = a
    labData[i * 3 + 2] = b
    sumL += L
    sumA += a
    sumB += b
  }

  const meanL = sumL / n
  const meanA = sumA / n
  const meanB = sumB / n

  let varL = 0, varA = 0, varB = 0
  for (let i = 0; i < n; i++) {
    const dL = labData[i * 3] - meanL
    const dA = labData[i * 3 + 1] - meanA
    const dB = labData[i * 3 + 2] - meanB
    varL += dL * dL
    varA += dA * dA
    varB += dB * dB
  }

  return [
    { mean: meanL, std: Math.sqrt(varL / n) || 1 },
    { mean: meanA, std: Math.sqrt(varA / n) || 1 },
    { mean: meanB, std: Math.sqrt(varB / n) || 1 },
  ]
}

// ── Color Transfer ──

/**
 * Apply Reinhard color transfer: match target image colors to reference.
 * @param targetCanvas - canvas with the image to recolor
 * @param referenceCanvas - canvas with the reference color palette
 * @param strength - 0 to 1, how much to apply (1 = full transfer, 0.5 = blend)
 */
export function applyColorTransfer(
  targetCanvas: HTMLCanvasElement,
  referenceCanvas: HTMLCanvasElement,
  strength: number = 0.85,
): void {
  const tw = targetCanvas.width
  const th = targetCanvas.height
  const tCtx = targetCanvas.getContext("2d")!
  const tData = tCtx.getImageData(0, 0, tw, th)

  const rw = referenceCanvas.width
  const rh = referenceCanvas.height
  const rCtx = referenceCanvas.getContext("2d")!
  const rData = rCtx.getImageData(0, 0, rw, rh)

  // Compute LAB stats for both
  const [tL, tA, tB] = computeLabStats(tData.data, tw, th)
  const [rL, rA, rB] = computeLabStats(rData.data, rw, rh)

  // Transfer: for each pixel, shift LAB values
  const n = tw * th
  for (let i = 0; i < n; i++) {
    const idx = i * 4
    const [L, a, b] = rgbToLab(tData.data[idx], tData.data[idx + 1], tData.data[idx + 2])

    // Reinhard transfer per channel
    let newL = ((L - tL.mean) * (rL.std / tL.std)) + rL.mean
    let newA = ((a - tA.mean) * (rA.std / tA.std)) + rA.mean
    let newB = ((b - tB.mean) * (rB.std / tB.std)) + rB.mean

    // Blend with original based on strength
    newL = L + (newL - L) * strength
    newA = a + (newA - a) * strength
    newB = b + (newB - b) * strength

    // Clamp
    newL = Math.max(0, Math.min(100, newL))
    newA = Math.max(-128, Math.min(127, newA))
    newB = Math.max(-128, Math.min(127, newB))

    const [nr, ng, nb] = labToRgb(newL, newA, newB)
    tData.data[idx] = nr
    tData.data[idx + 1] = ng
    tData.data[idx + 2] = nb
    // alpha stays
  }

  tCtx.putImageData(tData, 0, 0)
}

/**
 * Load image URL into a canvas.
 */
export function imageUrlToCanvas(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext("2d")!.drawImage(img, 0, 0)
      resolve(canvas)
    }
    img.onerror = reject
    img.src = url
  })
}