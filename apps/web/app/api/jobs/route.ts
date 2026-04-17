/**
 * POST /api/jobs
 *
 * Dev 모드: HF Space 호출 없이 3초 후 자동 완료 (mock 변환).
 * Prod 모드: Worker Ladder (HF Space → Modal → Replicate → client Brush).
 */

import { NextResponse } from 'next/server';
import { CreateJobSchema } from '@/lib/shared';
import { createJob, updateJob } from '@/lib/store/memoryJobs';
import { getUploads } from '@/lib/store/memoryUploads';

export const runtime = 'nodejs';

const IS_DEV = process.env.NODE_ENV !== 'production';

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

  const uploads = getUploads(input.upload_ids);
  if (uploads.length !== input.upload_ids.length) {
    return NextResponse.json({ error: 'unknown_upload_ids' }, { status: 400 });
  }

  const job = createJob({
    owner_id: null,
    input_upload_ids: input.upload_ids,
    source: input.source ?? null,
  });

  if (IS_DEV) {
    // Mock 변환: 3초에 걸쳐 단계별 진행
    mockConversion(job.id, uploads.map(u => u.r2_key));
    updateJob(job.id, {
      status: 'preprocessing',
      worker_backend: 'hf_space',
      worker_job_id: `mock-${job.id}`,
      started_at: new Date().toISOString(),
    });
  } else {
    // Prod: Worker Ladder dispatch
    try {
      const { dispatchJob } = await import('@/lib/workers');
      const { publicUrlFor } = await import('@/lib/r2');
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
        { job_id: job.id, status: 'failed', error: (err as Error).message },
        { status: 502 },
      );
    }
  }

  return NextResponse.json(
    {
      job_id: job.id,
      status: 'preprocessing',
      estimated_seconds: IS_DEV ? 5 : 60,
      quota_remaining_today: 5,
    },
    { status: 201 },
  );
}

/**
 * Mock 변환 — dev에서 HF Space 없이 파이프라인 단계를 시뮬레이션.
 * 업로드된 첫 사진의 URL을 썸네일로, 샘플 .spz를 결과로 사용.
 */
function mockConversion(jobId: string, uploadKeys: string[]) {
  const steps: Array<{ delay: number; status: string; progress: number }> = [
    { delay: 800, status: 'pose_estimation', progress: 25 },
    { delay: 1500, status: 'training', progress: 60 },
    { delay: 2500, status: 'postprocessing', progress: 85 },
    { delay: 3200, status: 'done', progress: 100 },
  ];

  for (const step of steps) {
    setTimeout(() => {
      const patch: Record<string, unknown> = {
        status: step.status,
        progress: step.progress,
      };
      if (step.status === 'done') {
        patch.completed_at = new Date().toISOString();
        // 첫 업로드 이미지를 썸네일로 사용
        const firstKey = uploadKeys[0] || '';
        const thumbUrl = firstKey.startsWith('local/')
          ? `/api/uploads/${firstKey.replace('local/', '')}`
          : '/samples/bonsai.jpg';
        patch.result_model_id = `mock-model-${jobId}`;
        // result_thumbnail_url 등은 별도 store에 저장해야 하지만
        // M1 단계에서는 대시보드가 직접 spz_url을 매핑
      }
      updateJob(jobId, patch as Parameters<typeof updateJob>[1]);
    }, step.delay);
  }
}
