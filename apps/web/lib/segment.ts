'use client';

/**
 * 객체 분할(foreground matting) — TRELLIS 괴물 문제 해결의 핵심.
 *
 * ═══ 왜 필요한가 ═══════════════════════════════════════════════════════
 * microsoft/TRELLIS 내부 전처리는 rembg + U2Net(2020) 을 사용한다.
 * U2Net 은 배경 halo 를 남기고 hair/edge 를 놓쳐서, TRELLIS 디퓨전 모델이
 * halo 를 객체로 오인하고 blob geometry 를 환각 생성 → "괴물" 결과물.
 *
 * TRELLIS 소스 코드 원문:
 *   "If the image has alpha channel, it will be used as the mask.
 *    Otherwise, we use rembg."
 *
 * 따라서 우리가 브라우저에서 깨끗한 alpha 가 있는 RGBA PNG 를 보내면
 * TRELLIS 는 rembg 를 건너뛰고 우리 mask 를 그대로 씀 → 품질 대폭 향상.
 *
 * ═══ 모델 선택 ═════════════════════════════════════════════════════════
 * briaai/RMBG-1.4: ISNet 기반, CC-BY-NC 라이선스 (상업 금지).
 *   - v1 무료 베타에는 적합 (우리 기본 라이선스도 CC-BY-NC).
 *   - Phase 2 마켓플레이스 오픈 시 BiRefNet (MIT) 으로 교체 필요.
 *   - @huggingface/transformers 공식 지원, Transformers.js docs 의 표준 예시.
 *
 * ═══ 성능 ═════════════════════════════════════════════════════════════
 * - 첫 호출: ~100MB ONNX 다운로드 + WebGPU/WASM 컴파일 (~5-10s)
 *   - 이후 IndexedDB 캐시되어 0.5s 이내 로드
 * - 추론: WebGPU 500ms-1s / WASM 2-4s (1024x1024 입력)
 *
 * ═══ 참고 ═════════════════════════════════════════════════════════════
 * - https://huggingface.co/briaai/RMBG-1.4
 * - https://github.com/addyosmani/bg-remove (reference implementation)
 * - https://github.com/microsoft/TRELLIS/blob/main/trellis/pipelines/trellis_image_to_3d.py
 */

import type { PreTrainedModel, Processor } from '@huggingface/transformers';

type SegmentProgress = {
  stage: 'downloading' | 'loading' | 'ready' | 'segmenting';
  progress: number;
  file?: string;
};

let cachedModel: PreTrainedModel | null = null;
let cachedProcessor: Processor | null = null;
let loadPromise: Promise<[PreTrainedModel, Processor]> | null = null;

async function loadSegmenter(
  onProgress?: (p: SegmentProgress) => void,
): Promise<[PreTrainedModel, Processor]> {
  if (cachedModel && cachedProcessor) return [cachedModel, cachedProcessor];
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { AutoModel, AutoProcessor, env } = await import('@huggingface/transformers');

    env.allowLocalModels = false;
    env.allowRemoteModels = true;

    const hasWebGPU =
      typeof navigator !== 'undefined' &&
      'gpu' in navigator &&
      !!(navigator as Navigator & { gpu?: unknown }).gpu;
    const device: 'webgpu' | 'wasm' = hasWebGPU ? 'webgpu' : 'wasm';

    console.info(`[segment] loading RMBG-1.4 on ${device}`);

    const progressCallback = (progress: unknown) => {
      const data = progress as {
        status?: string;
        progress?: number;
        file?: string;
      };
      if (data.status === 'progress' && typeof data.progress === 'number') {
        onProgress?.({
          stage: 'downloading',
          progress: data.progress / 100,
          file: data.file,
        });
      } else if (data.status === 'ready') {
        onProgress?.({ stage: 'ready', progress: 1 });
      }
    };

    // transformers.js 의 config 타입이 엄격해서 any 캐스팅 필요.
    // RMBG-1.4 는 custom 모델이라 공식 예제 그대로 따름.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (await (AutoModel as any).from_pretrained('briaai/RMBG-1.4', {
      config: { model_type: 'custom' },
      device,
      progress_callback: progressCallback,
    })) as unknown as PreTrainedModel;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processor = (await (AutoProcessor as any).from_pretrained('briaai/RMBG-1.4', {
      // RMBG-1.4 의 권장 preprocessing (model card 참조)
      config: {
        do_normalize: true,
        do_pad: false,
        do_rescale: true,
        do_resize: true,
        image_mean: [0.5, 0.5, 0.5],
        feature_extractor_type: 'ImageFeatureExtractor',
        image_std: [1, 1, 1],
        resample: 2,
        rescale_factor: 0.00392156862745098,
        size: { width: 1024, height: 1024 },
      },
    })) as unknown as Processor;

    cachedModel = model;
    cachedProcessor = processor;
    console.info('[segment] model ready');
    return [model, processor];
  })();

  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw err;
  }
}

/**
 * 입력 파일에서 객체만 분리한 RGBA PNG File 을 반환.
 *
 * 추가로 TRELLIS 가 선호하는 구도로 정리:
 *   1. alpha mask 에서 bounding box 계산
 *   2. 1.2x 패딩 적용
 *   3. 1024x1024 정사각 transparent canvas 에 중앙 배치
 *
 * 이렇게 반환된 PNG 를 그대로 HF Space / Modal 에 보내면 TRELLIS 는
 * 내장 U2Net 을 건너뛰고 우리 alpha 를 사용 → 객체만 깔끔하게 재구성.
 */
export async function segmentAndCenterImage(
  file: File,
  options: {
    targetSize?: number; // 기본 1024
    paddingRatio?: number; // 기본 1.2 (TRELLIS 권장)
    onProgress?: (p: SegmentProgress) => void;
  } = {},
): Promise<File> {
  const { targetSize = 1024, paddingRatio = 1.2, onProgress } = options;

  // 1) 모델 로드
  const [model, processor] = await loadSegmenter(onProgress);

  // 2) 이미지 로드
  const { RawImage } = await import('@huggingface/transformers');
  const imageUrl = URL.createObjectURL(file);
  let rawImage: { width: number; height: number; toCanvas: () => HTMLCanvasElement };
  try {
    rawImage = (await RawImage.fromURL(imageUrl)) as unknown as typeof rawImage;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }

  onProgress?.({ stage: 'segmenting', progress: 0.3 });

  // 3) 전처리 + 추론
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { pixel_values } = await (processor as any)(rawImage);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { output } = await (model as any)({ input: pixel_values });

  onProgress?.({ stage: 'segmenting', progress: 0.7 });

  // 4) 출력을 원본 해상도로 resize → mask (Uint8)
  const maskTensor = output[0].mul(255).to('uint8');
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const maskImage = (await (RawImage as unknown as {
    fromTensor(t: unknown): { resize(w: number, h: number): any };
  }).fromTensor(maskTensor)).resize(rawImage.width, rawImage.height);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // 5) 원본 canvas 에 alpha mask 주입
  const srcCanvas = rawImage.toCanvas();
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) throw new Error('canvas ctx failed');
  const srcData = srcCtx.getImageData(0, 0, rawImage.width, rawImage.height);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maskData = (maskImage as any).data as Uint8Array;

  for (let i = 0; i < maskData.length; i++) {
    srcData.data[4 * i + 3] = maskData[i]!; // alpha channel
  }

  // 6) alpha bounding box 계산 (객체만 감싸는 박스)
  const bbox = computeAlphaBoundingBox(
    srcData.data,
    rawImage.width,
    rawImage.height,
  );

  // 7) 1.2x 패딩 적용 후 정사각 canvas 에 중앙 배치
  const outCanvas = buildCenteredSquare(
    srcData,
    rawImage.width,
    rawImage.height,
    bbox,
    paddingRatio,
    targetSize,
  );

  onProgress?.({ stage: 'segmenting', progress: 1 });

  // 8) PNG blob → File
  const blob = await new Promise<Blob>((resolve, reject) => {
    outCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png',
    );
  });

  const outName = file.name.replace(/\.[^.]+$/, '') + '_segmented.png';
  return new File([blob], outName, { type: 'image/png' });
}

/**
 * Alpha > threshold 픽셀의 bounding box 계산.
 */
function computeAlphaBoundingBox(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  threshold = 16,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let found = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3]!;
      if (a > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        found = true;
      }
    }
  }
  if (!found) return { minX: 0, minY: 0, maxX: w - 1, maxY: h - 1 };
  return { minX, minY, maxX, maxY };
}

/**
 * bbox 를 paddingRatio 로 확장해서 정사각 canvas (targetSize×targetSize) 에
 * 투명 배경 + 객체 중앙 배치로 리샘플.
 */
function buildCenteredSquare(
  src: ImageData,
  srcW: number,
  srcH: number,
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  paddingRatio: number,
  targetSize: number,
): HTMLCanvasElement {
  const bboxW = bbox.maxX - bbox.minX + 1;
  const bboxH = bbox.maxY - bbox.minY + 1;
  const bboxSize = Math.max(bboxW, bboxH);
  const paddedSize = bboxSize * paddingRatio;

  // bbox 중심
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;

  // 크롭 영역
  const cropX = cx - paddedSize / 2;
  const cropY = cy - paddedSize / 2;

  // 1. 일단 src 를 Canvas 에 그림
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) throw new Error('canvas ctx failed');
  srcCtx.putImageData(src, 0, 0);

  // 2. 투명 정사각 canvas 생성
  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetSize;
  outCanvas.height = targetSize;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) throw new Error('canvas ctx failed');
  outCtx.clearRect(0, 0, targetSize, targetSize);

  // 3. 크롭 영역을 그대로 targetSize 로 스케일해서 그림
  // (drawImage 의 음수 srcX/srcY 영역은 자동으로 투명 처리됨)
  outCtx.drawImage(
    srcCanvas,
    cropX,
    cropY,
    paddedSize,
    paddedSize,
    0,
    0,
    targetSize,
    targetSize,
  );

  return outCanvas;
}

/** 테스트 편의용 — canvas 결과를 직접 확인하고 싶을 때 */
export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}
