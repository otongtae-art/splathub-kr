'use client';

/**
 * Hugging Face 공개 Space API 호출 — TRELLIS (Microsoft, SOTA image-to-3D).
 *
 * 전략: 우리 자체 Space 를 빌드·관리하는 대신 이미 검증된 공개 Space 의
 * Gradio API 를 브라우저에서 직접 호출한다. 비용 0 원 + 빌드 에러 0.
 *
 * 레퍼런스:
 *   - TRELLIS (Microsoft 2024): https://github.com/microsoft/TRELLIS
 *   - Public Space: https://huggingface.co/spaces/JeffreyXiang/TRELLIS
 *   - API endpoint: https://microsoft-trellis.hf.space
 *   - @gradio/client v2 API
 *
 * 4-step 파이프라인 (Gradio API schema 기준):
 *   1. /start_session          세션 생성
 *   2. /preprocess_image       이미지 업로드 + 전처리 (배경 제거 포함)
 *   3. /image_to_3d            3D 에셋 생성 (preview video 반환)
 *   4. /extract_glb            .glb mesh 추출
 *
 * 기본 config (권장):
 *   - seed: 0 (randomize)
 *   - ss_guidance_strength: 7.5
 *   - ss_sampling_steps: 12
 *   - slat_guidance_strength: 3.0
 *   - slat_sampling_steps: 12
 *   - mesh_simplify: 0.95
 *   - texture_size: 1024
 */

// gradio client 공개 Space 기본. env 로 override 가능 (privatefork 등 시나리오).
const DEFAULT_SPACE = 'JeffreyXiang/TRELLIS';

export function getHfSpaceUrl(): string | null {
  // 사용자가 fork 한 Space 를 쓰고 싶을 때만 override.
  // 미설정이면 공개 TRELLIS 호출.
  return process.env.NEXT_PUBLIC_HF_SPACE_ID || DEFAULT_SPACE;
}

export type HfSpaceResult = {
  bytes: Uint8Array;
  fileType: 'glb';
};

type ProgressCb = (frac: number, label?: string) => void;

/**
 * 단일 이미지 → 3D GLB mesh 변환.
 * @param image 사용자 업로드 File (JPEG/PNG/HEIC)
 */
export async function callHfSpace(
  image: File,
  options: {
    removeBg?: boolean; // TRELLIS 는 preprocess 에서 자동 배경 제거
    onProgress?: ProgressCb;
    /** mesh decimation ratio (0.9-0.98, 기본 0.95) */
    meshSimplify?: number;
    /** texture 해상도 512-2048 */
    textureSize?: number;
  } = {},
): Promise<HfSpaceResult> {
  const { onProgress } = options;
  const meshSimplify = options.meshSimplify ?? 0.95;
  const textureSize = options.textureSize ?? 1024;
  const spaceId = getHfSpaceUrl() ?? DEFAULT_SPACE;

  onProgress?.(0.02, `HF Space 연결 중 (${spaceId})`);

  // @gradio/client 를 dynamic import — 서버 번들에 포함되지 않도록
  const { Client } = await import('@gradio/client');
  const client = await Client.connect(spaceId);

  onProgress?.(0.1, '세션 생성');
  await client.predict('/start_session', {});

  onProgress?.(0.2, '이미지 전처리 (배경 제거 포함)');
  const preprocessRes = await client.predict('/preprocess_image', { image });
  const preprocessedImage = extractFilepath(preprocessRes);
  if (!preprocessedImage) {
    throw new Error('preprocess failed — no image returned');
  }

  onProgress?.(0.3, 'GPU 추론 중 (H200 ZeroGPU, 30-60초 소요)');
  // /image_to_3d 는 시간이 오래 걸린다. Gradio queue 대기 포함.
  const i23dRes = await client.predict('/image_to_3d', {
    image: preprocessedImage,
    multiimages: [],
    seed: 0,
    ss_guidance_strength: 7.5,
    ss_sampling_steps: 12,
    slat_guidance_strength: 3.0,
    slat_sampling_steps: 12,
    multiimage_algo: 'stochastic',
  });
  // i23dRes 는 video preview — 3D 에셋이 내부 state 에 저장됨
  void i23dRes;

  onProgress?.(0.85, '.glb mesh 추출');
  const extractRes = await client.predict('/extract_glb', {
    mesh_simplify: meshSimplify,
    texture_size: textureSize,
  });

  // extractRes.data = [extracted_glbgaussian(filepath), download_glb(filepath)]
  const glbFilepath = extractDownloadGlb(extractRes);
  if (!glbFilepath) {
    throw new Error('extract_glb failed — no glb path returned');
  }

  onProgress?.(0.93, '.glb 다운로드');

  // Gradio 가 반환한 filepath 는 Space URL 의 /file= 경로로 fetch 가능
  const spaceOrigin = `https://${spaceId.replace('/', '-').toLowerCase()}.hf.space`;
  const glbUrl = glbFilepath.startsWith('http')
    ? glbFilepath
    : `${spaceOrigin}/gradio_api/file=${glbFilepath}`;

  const glbRes = await fetch(glbUrl);
  if (!glbRes.ok) throw new Error(`glb fetch failed ${glbRes.status}`);
  const bytes = new Uint8Array(await glbRes.arrayBuffer());

  onProgress?.(1, '완료');
  console.info(`[hfSpace] TRELLIS glb size=${bytes.byteLength} bytes`);

  return { bytes, fileType: 'glb' };
}

// ───────────────────────── Gradio 응답 파서 ─────────────────────────

type GradioResp = { data?: unknown };

function extractFilepath(resp: GradioResp | unknown): { path: string; url?: string; orig_name?: string } | null {
  const r = resp as GradioResp;
  const data = r?.data as unknown;
  // gradio v5: { data: [ { path, url, orig_name } ] }
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    if (first && typeof first === 'object' && 'path' in first) {
      return first as { path: string; url?: string; orig_name?: string };
    }
    if (typeof first === 'string') {
      return { path: first };
    }
  }
  return null;
}

function extractDownloadGlb(resp: GradioResp | unknown): string | null {
  const r = resp as GradioResp;
  const data = r?.data as unknown;
  if (!Array.isArray(data)) return null;
  // 반환 순서: [extracted_glbgaussian, download_glb]
  // 둘 다 filepath. download_glb 를 우선 선택 (실제 .glb 파일)
  for (let i = data.length - 1; i >= 0; i--) {
    const item = data[i];
    if (item && typeof item === 'object' && 'path' in item) {
      const it = item as { path: string; url?: string };
      if (it.path.endsWith('.glb') || it.url?.endsWith('.glb')) {
        return it.url || it.path;
      }
    } else if (typeof item === 'string' && item.endsWith('.glb')) {
      return item;
    }
  }
  // fallback: 마지막 항목
  const last = data[data.length - 1];
  if (last && typeof last === 'object' && 'path' in last) {
    return (last as { url?: string; path: string }).url || (last as { path: string }).path;
  }
  return typeof last === 'string' ? last : null;
}
