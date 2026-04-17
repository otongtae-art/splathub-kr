/**
 * 공유 도메인 타입.
 * DB 스키마 (apps/web/db/schema.ts Drizzle) 및 API 응답 (apps/web/app/api/**) 의 공통 계약.
 */

import type { JobStatus, LicenseCode, SplatFormat, WorkerBackend } from './constants';

// ───────────────────────── User / Profile ─────────────────────────
export type UserTier = 'free' | 'pro' | 'enterprise';

export interface Profile {
  id: string; // UUID, auth.users.id
  handle: string; // [a-z0-9_]{3,30}
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  tier: UserTier;
  credits_balance: number; // Phase 2에만 사용
  created_at: string; // ISO 8601
  updated_at: string;
}

// ───────────────────────── Upload ─────────────────────────
export interface Upload {
  id: string;
  owner_id: string;
  r2_key: string;
  mime: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  uploaded_at: string;
}

// ───────────────────────── Job ─────────────────────────
export type JobKind = 'photo_to_splat' | 'ply_upload_only';
export type JobQuality = 'fast' | 'high' | 'ultra';
export type JobSource = 'capture' | 'upload' | 'video';

export interface Job {
  id: string;
  owner_id: string;
  kind: JobKind;
  tier: UserTier;
  quality: JobQuality;
  source: JobSource | null;
  input_upload_ids: string[];
  status: JobStatus;
  progress: number; // 0-100
  worker_backend: WorkerBackend | null;
  worker_job_id: string | null;
  result_model_id: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// ───────────────────────── Model ─────────────────────────
export type ModelVisibility = 'public' | 'unlisted' | 'private';

export interface Model {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  tags: string[];
  license: LicenseCode;
  visibility: ModelVisibility;
  tier: 'free' | 'pro';

  // Phase 2 컬럼 — v1엔 null 또는 0
  price_krw: number;
  listing_type: 'free' | 'paid';
  allow_commercial: boolean;

  // 파일 URL
  ply_url: string | null; // v1은 Phase 2 유료 학습 결과에서만 생성
  spz_url: string; // 항상 존재 (v1 생성 결과)
  sog_url: string | null;
  thumbnail_url: string;
  preview_urls: string[];

  // 크기·통계
  ply_size_bytes: number | null;
  spz_size_bytes: number;
  gaussian_count: number | null;
  view_count: number;
  like_count: number;
  download_count: number;

  // 허용 플래그
  allow_download: boolean;
  allow_embed: boolean;

  source_job_id: string | null;
  created_at: string;
  updated_at: string;
}

// ───────────────────────── Upload Presign Response ─────────────────────────
export interface PresignedUploadTarget {
  upload_id: string;
  r2_key: string;
  url: string; // presigned PUT
  headers: Record<string, string>;
  expires_in: number; // seconds
}

// ───────────────────────── Job 생성 응답 ─────────────────────────
export interface CreateJobResponse {
  job_id: string;
  status: JobStatus;
  estimated_seconds: number;
  quota_remaining_today: number;
}

// ───────────────────────── Worker Callback Payload ─────────────────────────
export interface WorkerCallbackPayload {
  job_id: string;
  status: Extract<JobStatus, 'done' | 'failed'> | JobStatus;
  progress: number;
  result?: {
    spz_url: string;
    ply_url?: string;
    sog_url?: string;
    thumbnail_url: string;
    preview_urls: string[];
    gaussian_count: number;
    spz_size_bytes: number;
    ply_size_bytes?: number;
  };
  error_code?: string;
  error_message?: string;
}

// ───────────────────────── Explore Query ─────────────────────────
export interface ExploreQuery {
  sort?: 'trending' | 'likes' | 'new';
  time?: 'day' | 'week' | 'month' | 'all';
  features?: ('downloadable' | 'embedable')[];
  tag?: string;
  q?: string;
  cursor?: string;
}

// ───────────────────────── 뷰어 props ─────────────────────────
export type ViewerQuality = 'auto' | 'low' | 'high';

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

export type { JobStatus, LicenseCode, SplatFormat, UserTier as ProfileTier, WorkerBackend };
