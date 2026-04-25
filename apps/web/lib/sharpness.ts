'use client';

/**
 * 이미지 sharpness (선명도) 추정 — Laplacian variance 방식.
 *
 * 왜 sharpness 가 photogrammetry 품질에 중요한가:
 *   흐릿한 사진은 feature point 가 noisy → VGGT 가 카메라 포즈 추정에서
 *   엉뚱한 위치를 잡음 → pointcloud 가 layer 로 분리 ("monster"). 한 장만
 *   심하게 흐려도 전체 reconstruction 이 망가짐.
 *
 * 알고리즘 (Pech-Pacheco et al. 2000, "Diatom autofocusing in brightfield
 * microscopy"):
 *   1. 그레이스케일 다운스케일 (256px, 속도)
 *   2. 3x3 Laplacian 컨볼루션 (∇²)
 *   3. 결과의 분산 (variance) = sharpness score
 *   - sharp 이미지: 강한 edge → 큰 variance
 *   - blurry 이미지: 약한 edge → 작은 variance
 *
 * 결과 해석:
 *   - 600px 다운스케일 기준 sharp ≈ 200~2000, blurry ≈ <30
 *   - 동일 카메라/조명 내에서 상대 비교가 더 robust →
 *     이 함수는 raw score 만 반환, 임계값은 호출 측이 median 기반으로 결정
 *
 * 성능: 256px 그레이스케일 → ~5ms on M1 Air.
 */

const PROCESSING_WIDTH = 256;

export function computeSharpness(
  source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement,
): number {
  let srcW: number;
  let srcH: number;
  if (source instanceof HTMLVideoElement) {
    srcW = source.videoWidth;
    srcH = source.videoHeight;
  } else {
    srcW = (source as HTMLCanvasElement | HTMLImageElement).width;
    srcH = (source as HTMLCanvasElement | HTMLImageElement).height;
  }
  if (!srcW || !srcH) return 0;

  const scale = PROCESSING_WIDTH / srcW;
  const w = Math.max(8, Math.round(srcW * scale));
  const h = Math.max(8, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  // 그레이스케일 (Rec.601 luma, 단일 패스)
  const gray = new Float32Array(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] =
      0.299 * (data[i] ?? 0) +
      0.587 * (data[i + 1] ?? 0) +
      0.114 * (data[i + 2] ?? 0);
  }

  // 3x3 Laplacian: 중앙 -4, 4-방향 +1, 모서리 0
  // |  0  1  0 |
  // |  1 -4  1 |
  // |  0  1  0 |
  // mean & variance 를 1패스로
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap =
        (gray[i - w] ?? 0) +
        (gray[i - 1] ?? 0) +
        (gray[i + 1] ?? 0) +
        (gray[i + w] ?? 0) -
        4 * (gray[i] ?? 0);
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  return Math.max(0, variance);
}

/**
 * 평균 luma (밝기) 계산 — 어두운 사진 자동 감지.
 *
 * 왜 밝기가 photogrammetry 품질에 중요한가:
 *   어두운 환경 → 센서가 ISO 자동 부스트 → noise 증가 → feature point
 *   가 noisy → VGGT pose 추정 부정확 → pointcloud layer 분리. R7
 *   sharpness 필터는 motion blur 만 잡을 뿐, sensor noise 는 못 잡음.
 *
 * 결과 범위: 0..255 (RGB luma 평균). 일반 실내 200+, 어두운 실내 50-100,
 * 거의 어둠 30 미만.
 */
export function computeBrightness(
  source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement,
): number {
  let srcW: number;
  let srcH: number;
  if (source instanceof HTMLVideoElement) {
    srcW = source.videoWidth;
    srcH = source.videoHeight;
  } else {
    srcW = (source as HTMLCanvasElement | HTMLImageElement).width;
    srcH = (source as HTMLCanvasElement | HTMLImageElement).height;
  }
  if (!srcW || !srcH) return 0;

  // 64px 다운스케일이면 평균 brightness 에 충분 (~1ms)
  const scale = 64 / srcW;
  const w = Math.max(8, Math.round(srcW * scale));
  const h = Math.max(8, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const luma =
      0.299 * (data[i] ?? 0) +
      0.587 * (data[i + 1] ?? 0) +
      0.114 * (data[i + 2] ?? 0);
    sum += luma;
    n++;
  }
  return n > 0 ? sum / n : 0;
}

/**
 * 여러 sharpness score 중 흐림 임계값을 동적 계산.
 *
 * 로직: median 의 40% 미만 + 절대값 30 미만 두 조건 동시 만족 시 흐림.
 * - 어두운 환경 전체 촬영처럼 모두 낮은 경우 한두 장만 더 낮다고 흐림 처리 안 됨
 * - 한 장만 모션 블러로 튄 경우 감지
 */
export function classifyBlurry(scores: number[]): {
  threshold: number;
  blurryIndices: number[];
} {
  if (scores.length === 0) return { threshold: 0, blurryIndices: [] };
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const threshold = Math.max(median * 0.4, 30);
  const blurryIndices: number[] = [];
  for (let i = 0; i < scores.length; i++) {
    if ((scores[i] ?? 0) < threshold) blurryIndices.push(i);
  }
  return { threshold, blurryIndices };
}
