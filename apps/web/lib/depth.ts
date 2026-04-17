'use client';

/**
 * Monocular depth estimation 래퍼 — transformers.js + Depth Anything V2 Small.
 *
 * 레퍼런스:
 *  - https://huggingface.co/onnx-community/depth-anything-v2-small (Apache 2.0)
 *  - https://huggingface.co/docs/transformers.js/en/guides/webgpu
 *
 * 모델 크기 ~50MB — 첫 호출 시 브라우저 IndexedDB에 캐시됨.
 * 이후 호출은 디스크 캐시에서 즉시 로드.
 */

import type { DepthEstimationPipeline } from '@huggingface/transformers';

type PipelineFn = typeof import('@huggingface/transformers').pipeline;

let cachedPipeline: DepthEstimationPipeline | null = null;
let pipelineLoadPromise: Promise<DepthEstimationPipeline> | null = null;

export type DepthProgress = {
  /** 'downloading' | 'loading' | 'ready' | 'inferring' */
  stage: string;
  /** 0..1, 다운로드 진행률 */
  progress: number;
  /** 바이트 단위 (있을 때만) */
  loaded?: number;
  total?: number;
  file?: string;
};

/**
 * 파이프라인을 한 번만 로드하고 캐시. WebGPU 지원 환경에서는 GPU 사용,
 * 아니면 WASM fallback.
 */
export async function getDepthPipeline(
  onProgress?: (p: DepthProgress) => void,
): Promise<DepthEstimationPipeline> {
  if (cachedPipeline) return cachedPipeline;
  if (pipelineLoadPromise) return pipelineLoadPromise;

  pipelineLoadPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');

    // remote 모델만 사용 (로컬 파일 불필요)
    env.allowLocalModels = false;
    env.allowRemoteModels = true;

    // WebGPU 가용성 감지
    const hasWebGPU =
      typeof navigator !== 'undefined' &&
      'gpu' in navigator &&
      !!(navigator as Navigator & { gpu?: unknown }).gpu;

    const device: 'webgpu' | 'wasm' = hasWebGPU ? 'webgpu' : 'wasm';
    console.info(`[depth] loading Depth Anything V2 Small on ${device}`);

    const p = (await (pipeline as PipelineFn)(
      'depth-estimation',
      'onnx-community/depth-anything-v2-small',
      {
        device,
        progress_callback: (progress: unknown) => {
          const data = progress as {
            status?: string;
            progress?: number;
            loaded?: number;
            total?: number;
            file?: string;
          };
          if (data.status === 'progress' && typeof data.progress === 'number') {
            onProgress?.({
              stage: 'downloading',
              progress: data.progress / 100,
              loaded: data.loaded,
              total: data.total,
              file: data.file,
            });
          } else if (data.status === 'ready') {
            onProgress?.({ stage: 'ready', progress: 1 });
          } else if (data.status) {
            onProgress?.({ stage: data.status, progress: 0 });
          }
        },
      },
    )) as unknown as DepthEstimationPipeline;

    cachedPipeline = p;
    console.info('[depth] pipeline ready');
    return p;
  })();

  try {
    return await pipelineLoadPromise;
  } catch (err) {
    pipelineLoadPromise = null; // 재시도 허용
    throw err;
  }
}

export type DepthResult = {
  /** 예측 depth 맵 (0..1 정규화) */
  depth: Float32Array;
  /** depth 맵 해상도 */
  width: number;
  height: number;
  /** 원본 이미지 해상도 */
  originalWidth: number;
  originalHeight: number;
};

/**
 * 단일 이미지에서 depth 맵 추정.
 * 반환: depth 값이 가까울수록 작은 값, 멀수록 큰 값인 일반화된 depth.
 * (Depth Anything V2는 inverse depth를 출력하므로 여기서 1 - normalized 로 반전)
 */
export async function estimateDepth(
  imageElement: HTMLImageElement | HTMLCanvasElement | string,
  onProgress?: (p: DepthProgress) => void,
): Promise<DepthResult> {
  const pipe = await getDepthPipeline(onProgress);
  onProgress?.({ stage: 'inferring', progress: 0 });

  // transformers.js는 HTMLImageElement, Canvas, URL 문자열 모두 받음
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = imageElement as any;
  const out = (await (pipe as unknown as (x: unknown) => Promise<unknown>)(raw)) as {
    predicted_depth?: { data: Float32Array; dims: number[] };
    depth?: { width: number; height: number; data: Uint8Array };
  };

  // predicted_depth: raw float, depth: PNG-ready image
  let width: number;
  let height: number;
  let data: Float32Array;

  if (out.predicted_depth) {
    const dims = out.predicted_depth.dims; // [1, H, W] or [H, W]
    height = dims[dims.length - 2]!;
    width = dims[dims.length - 1]!;
    data = out.predicted_depth.data;
  } else if (out.depth) {
    width = out.depth.width;
    height = out.depth.height;
    // uint8 → float32 normalized
    data = new Float32Array(out.depth.data.length);
    for (let i = 0; i < out.depth.data.length; i++) {
      data[i] = out.depth.data[i]! / 255;
    }
  } else {
    throw new Error('depth pipeline returned unexpected shape');
  }

  // normalize 0..1 (Depth Anything V2는 inverse depth 이므로 반전해서 거리로)
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const normalized = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    // inverse depth → depth: 1 - normalized
    normalized[i] = 1 - (data[i]! - min) / range;
  }

  onProgress?.({ stage: 'ready', progress: 1 });

  let originalWidth = width;
  let originalHeight = height;
  if (imageElement instanceof HTMLImageElement) {
    originalWidth = imageElement.naturalWidth;
    originalHeight = imageElement.naturalHeight;
  } else if (imageElement instanceof HTMLCanvasElement) {
    originalWidth = imageElement.width;
    originalHeight = imageElement.height;
  }

  return { depth: normalized, width, height, originalWidth, originalHeight };
}
