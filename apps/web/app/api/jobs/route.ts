/**
 * POST /api/jobs
 *
 * Creates a new conversion job and dispatches it down the Worker Ladder
 * (HF Space → Modal → Replicate → client Brush). The client-side `/convert`
 * page polls /api/jobs/:id to render progress, and the Ladder's HF Space
 * worker POSTs back to /api/jobs/:id/callback when it finishes.
 *
 * M1 invariant: DB is an in-memory Map. Quota enforcement and Supabase RLS
 * land in M4.
 */

import { NextResponse } from 'next/server';
import { CreateJobSchema } from '@/lib/shared';
import { publicUrlFor } from '@/lib/r2';
import { createJob, updateJob } from '@/lib/store/memoryJobs';
import { getUploads } from '@/lib/store/memoryUploads';
import { dispatchJob } from '@/lib/workers';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = CreateJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Sanity check: every referenced upload must exist. In M4 this becomes
  // an RLS-scoped Supabase SELECT; for now, it protects the in-memory store.
  const uploads = getUploads(input.upload_ids);
  if (uploads.length !== input.upload_ids.length) {
    return NextResponse.json({ error: 'unknown_upload_ids' }, { status: 400 });
  }

  const job = createJob({
    owner_id: null,
    input_upload_ids: input.upload_ids,
    source: input.source ?? null,
  });

  // Dispatch — on success, patch the job with which backend accepted it.
  try {
    const result = await dispatchJob({
      jobId: job.id,
      imageUrls: uploads.map((u) => publicUrlFor(u.r2_key)),
    });
    updateJob(job.id, {
      status: 'preprocessing',
      worker_backend: result.backend,
      worker_job_id: result.worker_job_id,
      started_at: new Date().toISOString(),
    });
  } catch (err) {
    updateJob(job.id, {
      status: 'failed',
      error_code: 'dispatch_failed',
      error_message: (err as Error).message,
      completed_at: new Date().toISOString(),
    });
    return NextResponse.json(
      {
        job_id: job.id,
        status: 'failed',
        error: 'dispatch_failed',
        message: (err as Error).message,
      },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      job_id: job.id,
      status: 'preprocessing',
      estimated_seconds: 60,
      quota_remaining_today: 5, // M4에서 실제 usage_logs 집계로 교체
    },
    { status: 201 },
  );
}
