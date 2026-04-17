/**
 * POST /api/jobs/:id/callback
 *
 * Webhook called by the GPU worker when a conversion finishes (or fails).
 * Authenticated via HMAC-SHA256 over the raw request body, using a shared
 * secret (`JOB_CALLBACK_SECRET`) known to both web app and worker. We verify
 * in constant time, then update the job and — in M4+ — broadcast via
 * Supabase Realtime.
 */

import { NextResponse } from 'next/server';
import { WorkerCallbackSchema, type WorkerCallbackPayload } from '@splathub/shared';
import { verify } from '@/lib/hmac';
import { required } from '@/lib/env';
import { applyCallback, getJob } from '@/lib/store/memoryJobs';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const signature = req.headers.get('x-splathub-signature') ?? '';
  const raw = await req.text();
  const secret = required('JOB_CALLBACK_SECRET');

  const ok = await verify(raw, signature, secret);
  if (!ok) return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });

  let parsed: WorkerCallbackPayload;
  try {
    parsed = WorkerCallbackSchema.parse(JSON.parse(raw));
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_payload', message: (e as Error).message },
      { status: 400 },
    );
  }

  // Guard against cross-job reuse of a signature — `:id` in the URL must match
  // the `job_id` inside the signed body.
  if (parsed.job_id !== id) {
    return NextResponse.json({ error: 'job_id_mismatch' }, { status: 400 });
  }

  const updated = applyCallback(parsed);
  return NextResponse.json({ ok: true, status: updated?.status });
}
