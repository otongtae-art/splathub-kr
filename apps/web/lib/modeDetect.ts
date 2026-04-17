'use client';

/**
 * 자동 모드 판별 — depth map 분포만 보고 "객체"인지 "공간"인지 추정.
 *
 * 이론적 배경 (U-V disparity + depth histogram 연구 기반):
 *   - 객체 촬영 (object-centric): 대상이 프레임 중앙에 차지하고 배경은
 *     대부분 멀리 있음 → 중앙 영역 depth <<< 주변부 depth.
 *     histogram 은 보통 unimodal 에 가깝고 중앙값이 가까운 편.
 *   - 공간 촬영 (scene-centric): 실내 공간을 바라봄. 벽·바닥·천장·가구가
 *     depth 범위 전반에 걸쳐 분포 → multimodal 혹은 균등 분포.
 *     중앙 vs 주변 depth 차이가 작음.
 *
 * 레퍼런스:
 *   - U-V disparity analysis for depth segmentation
 *     https://www.sciencedirect.com/science/article/abs/pii/S1047320320301541
 *   - Unimodal vs multimodal histogram characterization
 *     https://www.oreateai.com/blog/understanding-unimodal-and-bimodal-histograms-a-visual-guide
 */

import type { DepthResult } from './depth';

export type ModeDetectionScore = {
  /** 0 = 확실한 공간, 1 = 확실한 객체 */
  objectScore: number;
  /** 중앙 영역의 평균 depth (0..1) */
  centerMeanDepth: number;
  /** 전체 평균 depth */
  overallMeanDepth: number;
  /** depth histogram의 peak 개수 (multimodal 판별) */
  peaks: number;
  /** 최종 판정 */
  mode: 'object' | 'scene';
  /** 확신도 0..1, 0.5에 가까울수록 모호 */
  confidence: number;
};

/**
 * 단일 depth map을 보고 점수를 낸다.
 *
 * 판정 규칙:
 *   - center_mean - overall_mean < -0.08 (중앙이 훨씬 가까움) → object 점수 +
 *   - histogram peak 수 1개 → object 점수 +
 *   - histogram peak 수 ≥ 2 → scene 점수 +
 *   - depth 전체 variance 높음 → scene 점수 +
 */
export function scoreDepthMap(depth: DepthResult): ModeDetectionScore {
  const { depth: d, width, height } = depth;

  // 중앙 50% 영역
  const x0 = Math.floor(width * 0.25);
  const x1 = Math.ceil(width * 0.75);
  const y0 = Math.floor(height * 0.25);
  const y1 = Math.ceil(height * 0.75);

  let centerSum = 0;
  let centerCount = 0;
  let overallSum = 0;
  let overallCount = 0;
  let overallSqSum = 0;
  const bins = new Uint32Array(32); // histogram 32 bins
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = d[y * width + x]!;
      overallSum += v;
      overallSqSum += v * v;
      overallCount++;
      const bin = Math.min(31, Math.max(0, Math.floor(v * 32)));
      bins[bin]!++;
      if (x >= x0 && x < x1 && y >= y0 && y < y1) {
        centerSum += v;
        centerCount++;
      }
    }
  }

  const overallMean = overallSum / Math.max(1, overallCount);
  const centerMean = centerSum / Math.max(1, centerCount);
  const overallVar =
    overallSqSum / Math.max(1, overallCount) - overallMean * overallMean;

  // Peak detection in histogram (간단한 local max 검출)
  const peaks = countPeaks(bins, 3);

  // Scoring — 경험적 heuristic
  let score = 0.5;
  // 중앙이 배경보다 뚜렷하게 가까움 → object
  const centerDelta = centerMean - overallMean; // 음수면 중앙이 더 가까움
  if (centerDelta < -0.1) score += 0.25;
  else if (centerDelta < -0.05) score += 0.12;
  else if (centerDelta > 0.05) score -= 0.1;

  // Peak 수
  if (peaks <= 1) score += 0.15;
  else if (peaks >= 3) score -= 0.2;

  // variance — 너무 크면 scene (공간은 가까운+먼 것이 모두 있음)
  if (overallVar > 0.08) score -= 0.15;
  else if (overallVar < 0.03) score += 0.1;

  const clamped = Math.max(0, Math.min(1, score));
  const mode = clamped >= 0.5 ? 'object' : 'scene';
  const confidence = Math.abs(clamped - 0.5) * 2; // 0.5에서 멀수록 확신

  return {
    objectScore: clamped,
    centerMeanDepth: centerMean,
    overallMeanDepth: overallMean,
    peaks,
    mode,
    confidence,
  };
}

/**
 * 여러 depth map 의 점수를 평균내 최종 모드 결정.
 * 이미지 하나씩만 보면 오판 가능성 있어 다수결 + 평균.
 */
export function decideMode(scores: ModeDetectionScore[]): {
  mode: 'object' | 'scene';
  confidence: number;
} {
  if (scores.length === 0) return { mode: 'object', confidence: 0 };
  const avgObjectScore =
    scores.reduce((a, s) => a + s.objectScore, 0) / scores.length;
  const avgConfidence =
    scores.reduce((a, s) => a + s.confidence, 0) / scores.length;
  return {
    mode: avgObjectScore >= 0.5 ? 'object' : 'scene',
    confidence: avgConfidence,
  };
}

/**
 * 1D histogram에서 local maxima 수 세기.
 * window 기반 — 해당 위치가 앞뒤 window 픽셀보다 모두 크고 전체 max의 20% 이상이면 peak.
 */
function countPeaks(bins: Uint32Array, window: number): number {
  const n = bins.length;
  let globalMax = 0;
  for (let i = 0; i < n; i++) if (bins[i]! > globalMax) globalMax = bins[i]!;
  const minPeakHeight = globalMax * 0.2;
  let peaks = 0;
  for (let i = 0; i < n; i++) {
    if (bins[i]! < minPeakHeight) continue;
    let isLocalMax = true;
    for (let j = -window; j <= window; j++) {
      if (j === 0) continue;
      const k = i + j;
      if (k < 0 || k >= n) continue;
      if (bins[k]! > bins[i]!) {
        isLocalMax = false;
        break;
      }
    }
    if (isLocalMax) peaks++;
  }
  return peaks;
}
