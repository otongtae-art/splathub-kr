'use client';

/**
 * TRELLIS 호출 — Ladder of Free.
 *
 * 1순위: /api/hf-3d (Vercel proxy) → floerw HF Space → 인증 토큰, 빠름
 * 2순위: NEXT_PUBLIC_MODAL_FALLBACK_URL → Modal → microsoft/TRELLIS (익명)
 *
 * HF 쿼터 소진 시 자동으로 Modal 로 fallback. 사용자는 "쿼터 다 썼어" 대신
 * "조금 느리지만 계속 동작" 을 경험.
 */

const MODAL_FALLBACK_URL = process.env.NEXT_PUBLIC_MODAL_FALLBACK_URL || '';

export function isHfSpaceConfigured(): boolean {
  return true;
}

export function getHfSpaceUrl(): string | null {
  return '/api/hf-3d';
}

export type HfSpaceResult = {
  bytes: Uint8Array;
  fileType: 'glb';
  backend: 'hf-space' | 'modal-fallback';
};

type ProgressCb = (frac: number, label?: string) => void;

/**
 * 파일을 base64 로 변환 — Modal endpoint 에 JSON body 로 보낼 때 필요.
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // data:image/jpeg;base64,XXXX → XXXX 만
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * HF 에러 메시지에서 "쿼터 소진" 패턴 감지.
 */
function isQuotaExhaustedError(msg: string): boolean {
  return /quota|ZeroGPU|daily.*quota|subscribe\/pro|No GPU was available/i.test(msg);
}

/**
 * 1순위: HF Space (Vercel 경유, 인증됨).
 */
async function tryHfSpace(
  image: File,
  onProgress?: ProgressCb,
): Promise<HfSpaceResult> {
  onProgress?.(0.05, 'HF Space 호출');

  const fd = new FormData();
  fd.append('image', image);

  const res = await fetch('/api/hf-3d', {
    method: 'POST',
    body: fd,
  });

  if (!res.ok) {
    let msg = `status_${res.status}`;
    try {
      const ej = await res.json();
      if (ej?.error === 'gpu_busy') {
        msg = 'gpu_busy';
      } else if (ej?.message) {
        msg = ej.message;
      }
    } catch {
      /* json parse 실패 — raw 메시지 그대로 */
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

  return { bytes, fileType: 'glb', backend: 'hf-space' };
}

/**
 * 2순위: Modal fallback (익명).
 */
async function tryModalFallback(
  image: File,
  onProgress?: ProgressCb,
): Promise<HfSpaceResult> {
  if (!MODAL_FALLBACK_URL) {
    throw new Error('Modal fallback URL not configured');
  }

  onProgress?.(0.1, 'Modal 백업 경로로 재시도');

  // Modal fastapi_endpoint 는 query/body 로 image_b64 를 받음
  const b64 = await fileToBase64(image);

  onProgress?.(0.15, 'Modal 에 요청 전송');

  // Modal fastapi_endpoint 는 JSON body 로 {image_b64: "..."} 받음.
  const res = await fetch(MODAL_FALLBACK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_b64: b64 }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Modal ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    ok: boolean;
    glb_b64?: string;
    size?: number;
    error?: string;
    backend?: string;
  };

  if (!json.ok || !json.glb_b64) {
    throw new Error(json.error || 'Modal returned no glb');
  }

  onProgress?.(0.95, '.glb 수신 (Modal)');

  // Base64 → Uint8Array
  const binStr = atob(json.glb_b64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

  onProgress?.(1, '완료');
  console.info(`[hfSpace] Modal fallback success: ${bytes.byteLength} bytes`);

  return { bytes, fileType: 'glb', backend: 'modal-fallback' };
}

/**
 * 단일 이미지 → 3D GLB. 1순위 실패 시 2순위 자동 fallback.
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

  // 가짜 진행률 — 서버가 스트리밍 안 주니까 UX 용 애니메이션.
  let lastLabel = 'GPU 추론 대기';
  const startTs = Date.now();
  const fakeProgressTimer = setInterval(() => {
    const elapsed = Date.now() - startTs;
    const p = Math.min(0.85, 0.1 + (1 - Math.exp(-elapsed / 20000)) * 0.75);
    let label = lastLabel;
    if (elapsed < 3000) label = '이미지 전처리';
    else if (elapsed < 8000) label = 'GPU 큐 진입';
    else if (elapsed < 25000) label = 'H200 GPU 추론 중';
    else if (elapsed < 55000) label = '텍스처 추출 중';
    else label = 'GPU 큐 대기 (백업 경로)';
    lastLabel = label;
    onProgress?.(p, label);
  }, 1000);

  try {
    // 1순위
    try {
      const result = await tryHfSpace(image, onProgress);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 쿼터 소진 or 5xx 일 때만 fallback. 400 류는 그대로 올림.
      if (!isQuotaExhaustedError(msg) && !/502|503|504|gpu_busy/.test(msg)) {
        throw err;
      }
      if (!MODAL_FALLBACK_URL) {
        throw new Error(
          'HF 쿼터 소진됐지만 Modal 백업이 설정되지 않았습니다. 내일 다시 시도해주세요.',
        );
      }
      console.warn('[hfSpace] primary failed, trying Modal fallback:', msg);
      return await tryModalFallback(image, onProgress);
    }
  } finally {
    clearInterval(fakeProgressTimer);
  }
}
