'use client';

/**
 * TRELLIS 서버 프록시 호출 — /api/hf-3d 경로로 .glb 바이너리 수신.
 *
 * 예전에는 브라우저에서 직접 Hugging Face Space 를 호출했으나 익명 요청은
 * GPU queue 에서 drop 되어서 서버로 프록시. 서버가 인증 토큰(HF_TOKEN env)을
 * 붙여 요청 → ZeroGPU 우선순위 확보.
 */

export function isHfSpaceConfigured(): boolean {
  // 클라이언트에서는 서버 env 확인 불가. 항상 활성화된 것으로 간주.
  // 서버 측에서 HF_TOKEN 누락 시 500 반환하면 그때 에러 처리.
  return true;
}

/** 레거시 호환용 — 기존 호출부가 getHfSpaceUrl 을 체크 */
export function getHfSpaceUrl(): string | null {
  return '/api/hf-3d';
}

export type HfSpaceResult = {
  bytes: Uint8Array;
  fileType: 'glb';
};

type ProgressCb = (frac: number, label?: string) => void;

/**
 * 단일 이미지 → 3D GLB. Vercel 서버 route 를 통해 TRELLIS 호출.
 */
export async function callHfSpace(
  image: File,
  options: {
    removeBg?: boolean;
    meshSimplify?: number;
    textureSize?: number;
    onProgress?: ProgressCb;
  } = {},
): Promise<HfSpaceResult> {
  const { onProgress } = options;
  onProgress?.(0.05, '서버에 이미지 전송');

  const fd = new FormData();
  fd.append('image', image);
  if (options.meshSimplify) fd.append('meshSimplify', String(options.meshSimplify));
  if (options.textureSize) fd.append('textureSize', String(options.textureSize));

  // 진행률은 서버가 하는 일을 추측해서 표시 — 실제 진행률 streaming 은
  // /api/hf-3d 가 fetch response 로 한 번에 돌려주므로 불가능.
  // UX 용으로 중간 단계 표시.
  const fakeProgressTimer = setInterval(() => {
    // 10% → 최대 85% 까지 서서히 증가 (서버 응답 전까지)
    const now = Date.now();
    const elapsed = now - startTs;
    // 60초 기준으로 85%까지 비선형 증가
    const p = Math.min(0.85, 0.1 + (1 - Math.exp(-elapsed / 20000)) * 0.75);
    let label = 'GPU 추론 대기';
    if (elapsed < 3000) label = '이미지 전처리';
    else if (elapsed < 8000) label = 'GPU 큐 진입';
    else if (elapsed < 25000) label = 'H200 GPU 추론 중';
    else label = '텍스처 추출 중';
    onProgress?.(p, label);
  }, 1000);
  const startTs = Date.now();

  try {
    const res = await fetch('/api/hf-3d', {
      method: 'POST',
      body: fd,
    });
    clearInterval(fakeProgressTimer);

    if (!res.ok) {
      let msg = `status_${res.status}`;
      try {
        const ej = await res.json();
        if (ej?.error === 'gpu_busy') {
          msg = 'GPU 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.';
        } else if (ej?.message) {
          msg = ej.message;
        }
      } catch {
        /* body 가 json 아닐 수 있음 */
      }
      throw new Error(msg);
    }

    onProgress?.(0.95, '.glb 수신');
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);

    onProgress?.(1, '완료');
    const elapsedMs = res.headers.get('x-trellis-elapsed-ms');
    console.info(
      `[hfSpace] TRELLIS success: ${bytes.byteLength} bytes${elapsedMs ? `, ${elapsedMs}ms` : ''}`,
    );

    return { bytes, fileType: 'glb' };
  } catch (err) {
    clearInterval(fakeProgressTimer);
    throw err;
  }
}
