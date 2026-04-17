/**
 * zod 스키마 — 클라이언트/서버 경계의 런타임 검증.
 * API 라우트는 반드시 request body를 이 스키마로 parse한 뒤 DB를 건드린다.
 */

import { z } from 'zod';
import { INPUT_LIMITS, LICENSES } from './constants';

// ───────────────────────── Presign ─────────────────────────
export const PresignRequestFileSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(INPUT_LIMITS.MAX_IMAGE_BYTES),
  mime: z.enum([
    ...INPUT_LIMITS.ALLOWED_IMAGE_MIMES,
    ...INPUT_LIMITS.ALLOWED_VIDEO_MIMES,
  ] as const),
});

export const PresignRequestSchema = z.object({
  files: z
    .array(PresignRequestFileSchema)
    .min(1)
    .max(INPUT_LIMITS.MAX_IMAGES + 1 /* +1 for video */),
});

export type PresignRequest = z.infer<typeof PresignRequestSchema>;

// ───────────────────────── Upload Complete ─────────────────────────
export const UploadCompleteSchema = z.object({
  upload_ids: z.array(z.string().uuid()).min(1).max(INPUT_LIMITS.MAX_IMAGES + 1),
});

// ───────────────────────── Create Job ─────────────────────────
export const CreateJobSchema = z.object({
  upload_ids: z.array(z.string().uuid()).min(INPUT_LIMITS.MIN_IMAGES).max(INPUT_LIMITS.MAX_IMAGES),
  kind: z.enum(['photo_to_splat', 'ply_upload_only']).default('photo_to_splat'),
  source: z.enum(['capture', 'upload', 'video']).optional(),
  quality: z.enum(['fast', 'high', 'ultra']).default('fast'),
});

export type CreateJobInput = z.infer<typeof CreateJobSchema>;

// ───────────────────────── Publish Model ─────────────────────────
export const PublishModelSchema = z.object({
  job_id: z.string().uuid(),
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  category: z.string().max(40).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  license: z.enum(LICENSES).default('cc-by-nc'),
  visibility: z.enum(['public', 'unlisted', 'private']).default('public'),
  allow_download: z.boolean().default(false),
  allow_embed: z.boolean().default(true),
});

export type PublishModelInput = z.infer<typeof PublishModelSchema>;

// ───────────────────────── Worker Callback (HMAC-signed) ─────────────────────────
export const WorkerCallbackSchema = z.object({
  job_id: z.string().uuid(),
  status: z.enum([
    'queued',
    'preprocessing',
    'pose_estimation',
    'training',
    'postprocessing',
    'uploading',
    'done',
    'failed',
    'canceled',
  ]),
  progress: z.number().int().min(0).max(100),
  result: z
    .object({
      spz_url: z.string().url(),
      ply_url: z.string().url().optional(),
      sog_url: z.string().url().optional(),
      thumbnail_url: z.string().url(),
      preview_urls: z.array(z.string().url()).max(8),
      gaussian_count: z.number().int().positive(),
      spz_size_bytes: z.number().int().positive(),
      ply_size_bytes: z.number().int().positive().optional(),
    })
    .optional(),
  error_code: z.string().max(64).optional(),
  error_message: z.string().max(500).optional(),
});

// ───────────────────────── Explore Query (query string) ─────────────────────────
export const ExploreQuerySchema = z.object({
  sort: z.enum(['trending', 'likes', 'new']).default('trending'),
  time: z.enum(['day', 'week', 'month', 'all']).default('week'),
  features: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',') : undefined))
    .pipe(z.array(z.enum(['downloadable', 'embedable'])).optional()),
  tag: z.string().max(40).optional(),
  q: z.string().max(120).optional(),
  cursor: z.string().max(80).optional(),
});
