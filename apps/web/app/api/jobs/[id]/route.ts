/**
 * GET /api/jobs/:id
 *
 * Returns the current snapshot of a job. The /convert page polls this every
 * ~1.5s until `status` is a terminal one. M4 will add Supabase Realtime
 * broadcast so polling becomes a fallback path rather than the default.
 */

import { NextResponse } from 'next/server';
import { getJob } from '@/lib/store/memoryJobs';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(
    {
      id: job.id,
      status: job.status,
      progress: job.progress,
      worker_backend: job.worker_backend,
      result_model_id: job.result_model_id,
      error_code: job.error_code,
      error_message: job.error_message,
      started_at: job.started_at,
      completed_at: job.completed_at,
    },
    {
      headers: {
        'cache-control': 'no-store',
      },
    },
  );
}
