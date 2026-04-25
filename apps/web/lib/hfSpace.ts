'use client';

/**
 * TRELLIS 호출 — Ladder of Free.
 *
 * 파이프라인:
 *   1순위: /api/hf-3d (Vercel proxy) → floerw HF Space
 *          → HF Space 내부에서 BiRefNet 로 배경 제거 → TRELLIS
 *   2순위: Modal endpoint (stjnstl 토큰) → microsoft/TRELLIS 직접 호출
 *
 * 배경 제거를 서버(HF Space)에서 하는 이유:
 *   TRELLIS 내부 rembg + U2Net(2020) 은 배경 halo 를 남기고 디퓨전 모델이
 *   halo 를 객체로 오인해 blob geometry 환각 → "괴물". 우리 HF Space 에서
 *   먼저 BiRefNet(2024, MIT) 으로 깨끗한 alpha 를 만들어 TRELLIS 에 넘겨
 *   TRELLIS 가 내장 U2Net 을 스킵하게 함.
 *
 *   브라우저 쪽 Transformers.js RMBG 는 custom model 이슈로 불안정 → 서버로
 *   일원화하는 게 더 robust.
 *
 * HF 쿼터 소진 시 자동으로 Modal 로 fallback.
 */

// HF Space URL — 브라우저에서 직접 호출 (Vercel 60초 timeout 우회).
// 우리 HF Space 에 CORS 열려있고 HF_TOKEN 은 Space 쪽 env 에서 주입됨.
const HF_SPACE_URL =
  process.env.NEXT_PUBLIC_HF_SPACE_URL ||
  'https://floerw-splathub-trellis-proxy.hf.space/api/convert';

// Modal fallback endpoint — public URL 이라 노출 OK. env override 가능.
// otongtae-art Modal 계정의 splathub-trellis-fallback 앱, stjnstl HF 토큰으로
// authenticated 호출 → floerw HF Space 와 독립된 daily quota 풀.
const MODAL_FALLBACK_URL =
  process.env.NEXT_PUBLIC_MODAL_FALLBACK_URL ||
  'https://otongtae-art--app.modal.run/convert';

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

/** Worker /api/config 응답 (round 47+48 활성화 후 사용 가능). */
export type WorkerConfig = {
  vggt_prediction_mode: string;
  vggt_conf_thres: number;
  /** R4 (Pointmap Branch) 활성화 여부 — UI 에 'Pointmap 모드' 배지 표시용 */
  r4_pointmap_active: boolean;
  env_overrides?: {
    VGGT_PREDICTION_MODE: string | null;
    VGGT_CONF_THRES: string | null;
  };
  /** R47 per-request override 지원 여부 — A/B 토글 표시 조건 */
  supports_per_request_override?: boolean;
};

/**
 * Worker /api/config 호출 (round 49). 신규 worker (R47+R48) 가 deploy 안 됐으면
 * 404 → null 반환. 호출자는 null 시 기존 동작 유지.
 */
export async function callConfig(): Promise<WorkerConfig | null> {
  try {
    // HF_SPACE_URL 은 /api/convert 형태라 base 추출 후 /api/config
    const base = HF_SPACE_URL.replace(/\/api\/[^/]+$/, '');
    const res = await fetch(`${base}/api/config`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as WorkerConfig;
  } catch {
    return null; // 네트워크/CORS 등 실패는 silent
  }
}

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
 * 1순위: HF Space 직접 호출 (Vercel 60초 timeout 우회).
 * BiRefNet 첫 로드 + TRELLIS = 최대 100초 이상 걸릴 수 있음.
 */
async function tryHfSpace(
  image: File,
  onProgress?: ProgressCb,
): Promise<HfSpaceResult> {
  onProgress?.(0.05, 'HF Space 호출');

  const fd = new FormData();
  fd.append('image', image);

  const res = await fetch(HF_SPACE_URL, {
    method: 'POST',
    body: fd,
  });

  if (!res.ok) {
    let msg = `status_${res.status}`;
    try {
      const ej = await res.json();
      // HF Space 가 반환하는 에러 구조: {detail: {error: "...", trace: "..."}}
      if (ej?.detail?.error) {
        msg = ej.detail.error;
      } else if (ej?.error) {
        msg = ej.error;
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
 * 브라우저 Canvas 로 이미지를 maxPx 이하로 리사이즈.
 * 1920×1080 → 800×450: 파일 크기 ~10× 감소.
 * VGGT 는 내부적으로 저해상도로 처리하므로 품질 손실 없음.
 */
async function resizeImageForVggt(file: File, maxPx = 800): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      if (scale >= 1) { resolve(file); return; }
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], file.name, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.85,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/**
 * 여러 장 사진 → VGGT photogrammetry → .glb.
 *
 * Meta VGGT (CVPR 2025 Best Paper) 를 우리 HF Space wrapper 를 통해 호출.
 * 브라우저 → HF Space 직접 (CORS OK, Vercel 60s timeout 우회).
 * 10장 사진 ~30초, 20장 ~40초. 비용 $0 (ZeroGPU 무료 티어).
 */
export async function callVggt(
  images: File[],
  options: {
    onProgress?: ProgressCb;
  } = {},
): Promise<HfSpaceResult> {
  const { onProgress } = options;

  if (images.length < 2) {
    throw new Error('VGGT 는 최소 2장의 사진이 필요합니다');
  }
  if (images.length > 30) {
    throw new Error(`최대 30장까지. 현재 ${images.length}장.`);
  }

  onProgress?.(0.05, `이미지 최적화 중 (${images.length}장)`);

  // 1920×1080 → max 800px 리사이즈: 업로드 ~10× 감소, ZeroGPU 시간 절약.
  const resized = await Promise.all(images.map((img) => resizeImageForVggt(img, 800)));
  const origMB = images.reduce((s, f) => s + f.size, 0) / 1024 / 1024;
  const resizedMB = resized.reduce((s, f) => s + f.size, 0) / 1024 / 1024;
  console.info(
    `[vggt] resized: ${origMB.toFixed(1)}MB → ${resizedMB.toFixed(1)}MB (${images.length}장)`,
  );

  onProgress?.(0.08, `VGGT 호출 (${images.length}장)`);

  const fd = new FormData();
  for (const img of resized) {
    fd.append('images', img);
  }

  // VGGT 는 시간이 좀 걸리므로 fake progress 타이머
  const startTs = Date.now();
  const timer = setInterval(() => {
    const elapsed = Date.now() - startTs;
    const p = Math.min(0.85, 0.1 + (1 - Math.exp(-elapsed / 15000)) * 0.75);
    let label = '사진 업로드 중';
    if (elapsed < 5000) label = '사진 업로드 중';
    else if (elapsed < 15000) label = 'VGGT 분석 중 (카메라 포즈 추정)';
    else if (elapsed < 35000) label = 'VGGT 재구성 중 (pointcloud 생성)';
    else label = 'GLB 패키징 중';
    onProgress?.(p, label);
  }, 1000);

  try {
    // VGGT 는 HF Space 에서 본문이 클 수 있음 — /api/vggt 는 우리 HF Space 의
    // FastAPI 엔드포인트. CORS 열려있어 브라우저가 직접 호출 가능.
    const vggtUrl = HF_SPACE_URL.replace('/api/convert', '/api/vggt');
    const res = await fetch(vggtUrl, {
      method: 'POST',
      body: fd,
    });

    if (!res.ok) {
      let msg = `VGGT status_${res.status}`;
      try {
        const ej = await res.json();
        if (ej?.detail?.error) msg = ej.detail.error;
        else if (ej?.message) msg = ej.message;
      } catch {}
      throw new Error(msg);
    }

    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    onProgress?.(1, '완료');
    console.info(
      `[hfSpace] VGGT success: ${bytes.byteLength} bytes (${images.length} images)`,
    );
    return { bytes, fileType: 'glb', backend: 'hf-space' };
  } finally {
    clearInterval(timer);
  }
}


/**
 * 단일 이미지 → 3D GLB. 객체 분할 전처리 + 1순위 HF Space / 2순위 Modal fallback.
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

  // 배경 제거는 이제 서버(HF Space) 에서 수행. 브라우저는 원본 그대로 전송.
  // 가짜 진행률 — 서버가 스트리밍 안 주니까 UX 용 애니메이션.
  let lastLabel = 'GPU 추론 대기';
  const startTs = Date.now();
  const fakeProgressTimer = setInterval(() => {
    const elapsed = Date.now() - startTs;
    const p = Math.min(0.85, 0.1 + (1 - Math.exp(-elapsed / 20000)) * 0.75);
    let label = lastLabel;
    if (elapsed < 3000) label = '서버에 이미지 전송';
    else if (elapsed < 8000) label = '객체 분할 (BiRefNet)';
    else if (elapsed < 15000) label = 'GPU 큐 진입';
    else if (elapsed < 40000) label = 'H200 GPU 3D 재구성';
    else if (elapsed < 60000) label = '텍스처 추출 중';
    else label = 'GPU 큐 대기 (백업 경로)';
    lastLabel = label;
    onProgress?.(p, label);
  }, 1000);

  try {
    // 1순위 — HF Space (내부에서 BiRefNet + TRELLIS)
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
