'use client';

/**
 * 경량 feature point 검출기 — Shi-Tomasi/FAST 변형, 순수 JS.
 *
 * 목적: Polycam 스타일의 "사진 위 점 애니메이션" 시각 피드백.
 * 실제 SfM (Structure from Motion) 에 쓰는 것이 아니라 **UX 용**.
 * 서버 측 Brush 가 COLMAP/real 특징 검출을 수행함.
 *
 * 알고리즘:
 *   1. 이미지를 그레이스케일로 변환
 *   2. 다운스케일 (속도, ~256px long side)
 *   3. 각 픽셀마다 Shi-Tomasi 응답 계산 (gradient covariance 의 최소 eigenvalue)
 *   4. 비최대 억제 (non-maximum suppression)
 *   5. 상위 N 개 반환
 *
 * 성능 목표: 1920x1080 이미지에서 <100ms.
 */

export type FeaturePoint = {
  x: number; // 원본 해상도 좌표
  y: number;
  response: number; // 강도 (0..1 정규화)
};

const MAX_FEATURES = 150;
const PROCESSING_WIDTH = 256; // 처리 해상도 (다운스케일)
const NMS_RADIUS = 4; // 비최대 억제 반경 (픽셀, 처리 해상도 기준)

/**
 * Canvas/ImageData → feature points.
 */
export function detectFeatures(
  source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement | ImageData,
  options: { max?: number; width?: number } = {},
): FeaturePoint[] {
  const max = options.max ?? MAX_FEATURES;
  const procW = options.width ?? PROCESSING_WIDTH;

  // 1) 다운스케일 canvas 로 렌더
  let srcW: number, srcH: number;
  if (source instanceof ImageData) {
    srcW = source.width;
    srcH = source.height;
  } else if (source instanceof HTMLVideoElement) {
    srcW = source.videoWidth;
    srcH = source.videoHeight;
  } else {
    srcW = (source as HTMLCanvasElement | HTMLImageElement).width;
    srcH = (source as HTMLCanvasElement | HTMLImageElement).height;
  }

  if (!srcW || !srcH) return [];

  const scale = procW / srcW;
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  if (source instanceof ImageData) {
    // ImageData 는 직접 drawImage 불가 → 임시 canvas 경유
    const tmp = document.createElement('canvas');
    tmp.width = source.width;
    tmp.height = source.height;
    tmp.getContext('2d')?.putImageData(source, 0, 0);
    ctx.drawImage(tmp, 0, 0, w, h);
  } else {
    ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  }

  const imgData = ctx.getImageData(0, 0, w, h);
  const gray = toGrayscale(imgData.data, w, h);

  // 2) Sobel gradient (Ix, Iy)
  const { ix, iy } = sobel(gray, w, h);

  // 3) Shi-Tomasi response map
  const response = shiTomasi(ix, iy, w, h);

  // 4) Non-maximum suppression + top-K
  const peaks = extractPeaks(response, w, h, max);

  // 5) 원본 해상도로 역스케일
  return peaks.map((p) => ({
    x: p.x / scale,
    y: p.y / scale,
    response: p.response,
  }));
}

function toGrayscale(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    // Rec.601 luma
    out[j] = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  }
  return out;
}

function sobel(
  gray: Float32Array,
  w: number,
  h: number,
): { ix: Float32Array; iy: Float32Array } {
  const ix = new Float32Array(w * h);
  const iy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      // Sobel X
      ix[i] =
        -gray[i - w - 1]! - 2 * gray[i - 1]! - gray[i + w - 1]! +
        gray[i - w + 1]! + 2 * gray[i + 1]! + gray[i + w + 1]!;
      // Sobel Y
      iy[i] =
        -gray[i - w - 1]! - 2 * gray[i - w]! - gray[i - w + 1]! +
        gray[i + w - 1]! + 2 * gray[i + w]! + gray[i + w + 1]!;
    }
  }
  return { ix, iy };
}

function shiTomasi(
  ix: Float32Array,
  iy: Float32Array,
  w: number,
  h: number,
): Float32Array {
  const WINDOW = 2; // 5x5 박스 윈도우
  const out = new Float32Array(w * h);
  for (let y = WINDOW; y < h - WINDOW; y++) {
    for (let x = WINDOW; x < w - WINDOW; x++) {
      let sxx = 0;
      let syy = 0;
      let sxy = 0;
      for (let dy = -WINDOW; dy <= WINDOW; dy++) {
        for (let dx = -WINDOW; dx <= WINDOW; dx++) {
          const i = (y + dy) * w + (x + dx);
          const gx = ix[i]!;
          const gy = iy[i]!;
          sxx += gx * gx;
          syy += gy * gy;
          sxy += gx * gy;
        }
      }
      // 최소 eigenvalue
      const trace = sxx + syy;
      const det = sxx * syy - sxy * sxy;
      const disc = Math.max(0, trace * trace / 4 - det);
      const lambdaMin = trace / 2 - Math.sqrt(disc);
      out[y * w + x] = lambdaMin;
    }
  }
  return out;
}

function extractPeaks(
  response: Float32Array,
  w: number,
  h: number,
  maxPeaks: number,
): FeaturePoint[] {
  // 먼저 임계값으로 필터 (max 응답의 10%)
  let maxR = 0;
  for (let i = 0; i < response.length; i++) {
    if (response[i]! > maxR) maxR = response[i]!;
  }
  if (maxR === 0) return [];
  const threshold = maxR * 0.1; // 5% → 10% 로 상향, 약한 edge 제거

  const candidates: { i: number; r: number }[] = [];
  for (let i = 0; i < response.length; i++) {
    if (response[i]! >= threshold) {
      candidates.push({ i, r: response[i]! });
    }
  }

  candidates.sort((a, b) => b.r - a.r);

  // Non-maximum suppression
  const selected: FeaturePoint[] = [];
  const taken = new Uint8Array(w * h);

  for (const c of candidates) {
    if (selected.length >= maxPeaks * 3) break; // density filter 전 3배수 확보
    const y = Math.floor(c.i / w);
    const x = c.i % w;

    let collides = false;
    for (let dy = -NMS_RADIUS; dy <= NMS_RADIUS && !collides; dy++) {
      for (let dx = -NMS_RADIUS; dx <= NMS_RADIUS && !collides; dx++) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
        if (taken[ny * w + nx]) collides = true;
      }
    }
    if (collides) continue;

    taken[c.i] = 1;
    selected.push({
      x,
      y,
      response: c.r / maxR,
    });
  }

  // Density 필터 — 주변에 다른 특징점이 많은 점만 유지 (객체는 보통 밀집,
  // 배경 노이즈는 흩어짐).
  const filtered = filterByDensity(selected, w, maxPeaks);
  return filtered;
}

/**
 * Density-based filtering — 각 점의 K-nearest-neighbor 거리가 작은 상위만 유지.
 * 객체 표면은 특징점이 밀집, 배경 노이즈는 흩어진다는 휴리스틱.
 */
function filterByDensity(
  points: FeaturePoint[],
  procW: number,
  maxKeep: number,
): FeaturePoint[] {
  if (points.length <= maxKeep) return points;

  const K = 5; // 각 점에 대해 5번째 가까운 이웃까지
  // 각 점의 K-th nearest neighbor 거리 (작을수록 밀집)
  const scored = points.map((p) => {
    const dists: number[] = [];
    for (const q of points) {
      if (q === p) continue;
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      dists.push(Math.sqrt(dx * dx + dy * dy));
    }
    dists.sort((a, b) => a - b);
    const kthDist = dists[K - 1] ?? 1e9;
    // 스코어 = response / (kthDist 정규화) — 밀집 + 강한 점 우선
    const normDist = kthDist / procW; // 0..1
    return { p, score: p.response / (normDist + 0.05) };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxKeep).map((s) => s.p);
}

/**
 * 이미지들이 충분히 겹치는지 체크 (naive: orientation 각도 차이만).
 * 실제 overlap 계산은 서버가 수행 — 여기선 단순 UX 경고용.
 */
export function estimateOrientationOverlap(
  orientations: { alpha: number; beta: number; gamma: number }[],
): { minGapDeg: number; maxGapDeg: number } {
  if (orientations.length < 2) {
    return { minGapDeg: 0, maxGapDeg: 360 };
  }
  const alphas = orientations.map((o) => o.alpha).sort((a, b) => a - b);
  let minGap = 360;
  let maxGap = 0;
  for (let i = 0; i < alphas.length; i++) {
    const next = alphas[(i + 1) % alphas.length]!;
    const curr = alphas[i]!;
    const gap = (next - curr + 360) % 360;
    if (gap < minGap) minGap = gap;
    if (gap > maxGap) maxGap = gap;
  }
  return { minGapDeg: minGap, maxGapDeg: maxGap };
}
