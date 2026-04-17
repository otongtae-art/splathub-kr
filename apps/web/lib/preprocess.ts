'use client';

/**
 * 사진 품질 보정 모듈 — 사용자가 카메라를 들고 찍을 때 생기는 문제를 보정.
 *
 * 두 가지 기능:
 *   1. Laplacian variance 기반 블러 검출 → 흐린 사진 자동 제외
 *   2. Luminance histogram equalization → 노출 차이가 큰 사진들을 정규화
 *
 * 둘 다 순수 Canvas 2D + 타입드 어레이 로 구현. 외부 라이브러리 불필요.
 *
 * 레퍼런스:
 *   - https://theailearner.com/2021/10/30/blur-detection-using-the-variance-of-the-laplacian-method/
 *   - https://medium.com/revolut/canvas-based-javascript-blur-detection-b92ab1075acf
 *   - https://en.wikipedia.org/wiki/Histogram_equalization
 *   - https://scikit-image.org/docs/dev/auto_examples/color_exposure/plot_equalize.html
 */

// Laplacian 3x3 커널
const LAPLACIAN_KERNEL = [0, 1, 0, 1, -4, 1, 0, 1, 0];

// 저해상도 스마트폰 카메라 기준 블러 임계값. 이 값 미만이면 흐림 판정.
// 600 DPI 스캔: 200+ / 스마트폰 카메라: 60~120 권장.
// Revolut Tech 기사 기준으로 80이 실용적 기본값.
const BLUR_VARIANCE_THRESHOLD = 80;

export type QualityMetrics = {
  blurVariance: number;
  meanLuma: number;
  /** 판정: 이 사진을 버릴지 말지 */
  isBlurry: boolean;
  /** 너무 어둡거나 밝은지 */
  isBadlyExposed: boolean;
};

/**
 * 품질 측정 + 보정된 Canvas 반환.
 * - 흐린 이미지: `isBlurry = true` 리턴 (호출자가 제외 여부 결정)
 * - 노출 불균형: 자동으로 luminance histogram 적용된 Canvas 반환
 */
export async function preprocessImage(
  file: File,
  maxWidth: number = 512,
): Promise<{ canvas: HTMLCanvasElement; metrics: QualityMetrics }> {
  const img = await loadImage(file);
  const canvas = drawToCanvas(img, maxWidth);

  const metrics = measureQuality(canvas);
  if (metrics.isBadlyExposed) {
    applyHistogramEqualization(canvas);
  }

  return { canvas, metrics };
}

/**
 * 블러 감지 + 노출 측정. Canvas 원본은 건드리지 않음.
 */
export function measureQuality(canvas: HTMLCanvasElement): QualityMetrics {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d context failed');
  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // 1) 그레이스케일
  const gray = new Uint8ClampedArray(width * height);
  let sumLuma = 0;
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const l = Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!);
    gray[j] = l;
    sumLuma += l;
  }
  const meanLuma = sumLuma / gray.length;

  // 2) Laplacian 컨볼루션
  const lap = convolve3x3(gray, width, height, LAPLACIAN_KERNEL);

  // 3) variance 계산
  let lapMean = 0;
  for (let i = 0; i < lap.length; i++) lapMean += lap[i]!;
  lapMean /= lap.length;
  let lapVar = 0;
  for (let i = 0; i < lap.length; i++) {
    const d = lap[i]! - lapMean;
    lapVar += d * d;
  }
  lapVar /= lap.length;

  return {
    blurVariance: lapVar,
    meanLuma,
    isBlurry: lapVar < BLUR_VARIANCE_THRESHOLD,
    // 너무 어둡(<40) 또는 너무 밝(>215) 으면 노출 불균형
    isBadlyExposed: meanLuma < 40 || meanLuma > 215,
  };
}

/**
 * 3x3 컨볼루션 — 경계는 원본 유지 (Sobel/Laplacian 용).
 */
function convolve3x3(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  kernel: number[],
): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sum = 0;
      let ki = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          sum += src[(y + ky) * w + (x + kx)]! * kernel[ki++]!;
        }
      }
      out[y * w + x] = sum;
    }
  }
  return out;
}

/**
 * Luminance 채널에 histogram equalization 적용 (색은 유지).
 * YUV 변환 → Y에만 CDF 매핑 → RGB 복원.
 */
export function applyHistogramEqualization(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const N = width * height;

  // 1. 각 픽셀 Y(luminance) 히스토그램
  const hist = new Uint32Array(256);
  const yBuf = new Uint8ClampedArray(N);
  const cbBuf = new Float32Array(N);
  const crBuf = new Float32Array(N);

  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
    const yi = Math.max(0, Math.min(255, Math.round(y)));
    hist[yi] = (hist[yi] ?? 0) + 1;
    yBuf[j] = yi;
    cbBuf[j] = cb;
    crBuf[j] = cr;
  }

  // 2. CDF (누적 분포)
  const cdf = new Uint32Array(256);
  let running = 0;
  for (let i = 0; i < 256; i++) {
    running += hist[i]!;
    cdf[i] = running;
  }

  // 3. CDF를 0..255로 스케일해 lookup table
  let cdfMin = 0;
  for (let i = 0; i < 256; i++) {
    if (cdf[i]! > 0) {
      cdfMin = cdf[i]!;
      break;
    }
  }
  const denom = N - cdfMin || 1;
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.round(((cdf[i]! - cdfMin) / denom) * 255);
  }

  // 4. Y에 LUT 적용 후 RGB 복원
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const yNew = lut[yBuf[j]!]!;
    const cb = cbBuf[j]!;
    const cr = crBuf[j]!;
    const r = yNew + 1.402 * cr;
    const g = yNew - 0.344136 * cb - 0.714136 * cr;
    const b = yNew + 1.772 * cb;
    data[i] = clamp255(r);
    data[i + 1] = clamp255(g);
    data[i + 2] = clamp255(b);
  }
  ctx.putImageData(imgData, 0, 0);
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function drawToCanvas(img: HTMLImageElement, maxWidth: number): HTMLCanvasElement {
  const w = Math.min(img.naturalWidth, maxWidth);
  const h = Math.round((img.naturalHeight * w) / img.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas ctx failed');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
