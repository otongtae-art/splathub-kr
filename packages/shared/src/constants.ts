/**
 * 전역 상수 — 클라이언트·서버·워커 모두 공유.
 * 값을 변경할 땐 반드시 docs/ARCHITECTURE.md 의 제약과 정합성 확인.
 */

// ───────────────────────── 입력 제약 ─────────────────────────
export const INPUT_LIMITS = {
  /** 사진 한 장당 최대 크기 (무료 티어) */
  MAX_IMAGE_BYTES: 10 * 1024 * 1024, // 10 MB
  /** 한 작업당 총 입력 바이트 */
  MAX_TOTAL_BYTES: 30 * 1024 * 1024, // 30 MB
  /** 사진 장수 최소 */
  MIN_IMAGES: 1,
  /** 사진 장수 최대 (무료 티어) */
  MAX_IMAGES: 5,
  /** 영상 최대 길이 (초) */
  MAX_VIDEO_SECONDS: 20,
  /** 영상 프레임 샘플링 수 */
  VIDEO_SAMPLE_FRAMES: 10,
  /** 서버사이드 다운사이즈 해상도 (무료 티어) */
  SERVER_RESIZE_PX: 512,
  /** 허용 이미지 MIME */
  ALLOWED_IMAGE_MIMES: ['image/jpeg', 'image/png', 'image/heic', 'image/heif'] as const,
  /** 허용 영상 MIME */
  ALLOWED_VIDEO_MIMES: ['video/mp4', 'video/quicktime'] as const,
} as const;

// ───────────────────────── 할당량 ─────────────────────────
export const QUOTAS = {
  /** 무료 티어 하루 변환 건수 */
  FREE_DAILY_JOBS: 5,
  /** 실패 시 할당량 복원 여부 */
  REFUND_ON_FAILURE: true,
} as const;

// ───────────────────────── 캡처 UX ─────────────────────────
export const CAPTURE = {
  /** 가이드 모드 원형 인디케이터 구간 수 */
  GUIDE_SEGMENTS: 12,
  /** 최소 자동 전송 장수 (품질 통과분) */
  MIN_AUTO_SUBMIT: 8,
  /** 최대 캡처 장수 */
  MAX_CAPTURE: 30,
  /** Laplacian variance blur 임계값 (이하이면 흐림) */
  BLUR_THRESHOLD: 100,
  /** pHash 유사도 임계값 (이상이면 중복 제거) */
  PHASH_SIMILARITY_DROP: 0.95,
  /** 카메라 기본 해상도 */
  VIDEO_CONSTRAINTS: {
    facingMode: 'environment' as const,
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
} as const;

// ───────────────────────── Worker 백엔드 우선순위 ─────────────────────────
export type WorkerBackend = 'hf_space' | 'modal' | 'replicate' | 'client_brush';
export const WORKER_LADDER: readonly WorkerBackend[] = [
  'hf_space',
  'modal',
  'replicate',
  'client_brush',
] as const;

// ───────────────────────── Job 상태 ─────────────────────────
export type JobStatus =
  | 'queued'
  | 'preprocessing'
  | 'pose_estimation'
  | 'training'
  | 'postprocessing'
  | 'uploading'
  | 'done'
  | 'failed'
  | 'canceled';

export const TERMINAL_STATUSES: readonly JobStatus[] = ['done', 'failed', 'canceled'] as const;

export const JOB_PROGRESS: Record<JobStatus, number> = {
  queued: 0,
  preprocessing: 10,
  pose_estimation: 25,
  training: 60,
  postprocessing: 85,
  uploading: 95,
  done: 100,
  failed: 100,
  canceled: 100,
};

// ───────────────────────── 라이선스 ─────────────────────────
export const LICENSES = ['cc-by-nc', 'cc-by', 'cc0', 'proprietary'] as const;
export type LicenseCode = (typeof LICENSES)[number];
export const DEFAULT_LICENSE: LicenseCode = 'cc-by-nc';

// ───────────────────────── Splat 포맷 ─────────────────────────
export const SPLAT_FORMATS = ['ply', 'spz', 'sog', 'splat'] as const;
export type SplatFormat = (typeof SPLAT_FORMATS)[number];

/** v1은 .spz만 다운로드 허용 */
export const DOWNLOADABLE_FORMATS_V1: readonly SplatFormat[] = ['spz'] as const;
