/**
 * In-memory job store — M1 only.
 *
 * Real persistence lands in M4 with Supabase (see apps/web/db/schema.ts). Until
 * then, we keep a process-local Map so the /convert page can poll status
 * without needing a database. This store intentionally does NOT survive
 * restarts — that is acceptable for local development and the beta preview.
 *
 * Replacing this module with a Supabase-backed implementation should require
 * changing only imports in /api/jobs/route.ts and /api/jobs/[id]/*.
 */

import { randomUUID } from 'crypto';
import type {
  Job,
  JobStatus,
  UserTier,
  WorkerCallbackPayload,
} from '@/lib/shared/types';

export type CreatedJob = Job;

type CreateInput = {
  owner_id: string | null;
  input_upload_ids: string[];
  source: 'capture' | 'upload' | 'video' | null;
};

const store = new Map<string, Job>();

export function createJob(input: CreateInput): CreatedJob {
  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    owner_id: input.owner_id ?? 'anonymous',
    kind: 'photo_to_splat',
    tier: 'free' as UserTier,
    quality: 'fast',
    source: input.source,
    input_upload_ids: input.input_upload_ids,
    status: 'queued',
    progress: 0,
    worker_backend: null,
    worker_job_id: null,
    result_model_id: null,
    error_code: null,
    error_message: null,
    started_at: null,
    completed_at: null,
    created_at: now,
  };
  store.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return store.get(id);
}

export function updateJob(
  id: string,
  patch: Partial<
    Pick<
      Job,
      | 'status'
      | 'progress'
      | 'worker_backend'
      | 'worker_job_id'
      | 'result_model_id'
      | 'error_code'
      | 'error_message'
      | 'started_at'
      | 'completed_at'
    >
  >,
): Job | undefined {
  const prev = store.get(id);
  if (!prev) return undefined;
  const next: Job = { ...prev, ...patch };
  store.set(id, next);
  return next;
}

/** Worker callback handler — applies a WorkerCallbackPayload to the store. */
export function applyCallback(payload: WorkerCallbackPayload): Job | undefined {
  const patch: Parameters<typeof updateJob>[1] = {
    status: payload.status as JobStatus,
    progress: payload.progress,
  };
  if (payload.status === 'done') {
    patch.completed_at = new Date().toISOString();
  }
  if (payload.error_code) patch.error_code = payload.error_code;
  if (payload.error_message) patch.error_message = payload.error_message;
  return updateJob(payload.job_id, patch);
}

/** Tiny helper used by the /convert page to render the latest snapshot. */
export function listJobsForOwner(ownerId: string): Job[] {
  const out: Job[] = [];
  for (const job of store.values()) {
    if (job.owner_id === ownerId) out.push(job);
  }
  return out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
