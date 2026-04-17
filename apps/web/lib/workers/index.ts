/**
 * Worker Ladder dispatcher — tries backends in order defined by WORKER_LADDER.
 *
 * M1: only HF Space is implemented. M3 adds Modal + Replicate + client_brush.
 * The interface is stable so later milestones can plug in without touching
 * `/api/jobs/route.ts`.
 */

import { WORKER_LADDER, type WorkerBackend } from '@/lib/shared';
import { submitToHfSpace } from './hf';

export type DispatchInput = {
  jobId: string;
  imageUrls: string[];
};

export type DispatchResult = {
  backend: WorkerBackend;
  worker_job_id: string;
  callback_url: string;
};

export type DispatchError = {
  backend: WorkerBackend;
  error: unknown;
};

/**
 * Submits the job to the first backend that accepts it. Throws if every
 * backend in the ladder rejects.
 */
export async function dispatchJob(input: DispatchInput): Promise<DispatchResult> {
  const errors: DispatchError[] = [];
  for (const backend of WORKER_LADDER) {
    try {
      switch (backend) {
        case 'hf_space': {
          const out = await submitToHfSpace(input);
          return { backend, worker_job_id: out.event_id, callback_url: out.callback_url };
        }
        case 'modal': {
          // M3: implement Modal client.
          throw new Error('modal_not_implemented');
        }
        case 'replicate': {
          // M3: implement Replicate client.
          throw new Error('replicate_not_implemented');
        }
        case 'client_brush': {
          // Client-side fallback — the API tells the browser to route the user
          // to /convert/local instead of running server-side work.
          throw new Error('client_brush_not_server_side');
        }
      }
    } catch (err) {
      errors.push({ backend, error: err });
      continue;
    }
  }
  const summary = errors
    .map((e) => `${e.backend}: ${(e.error as Error)?.message ?? e.error}`)
    .join('; ');
  throw new Error(`all_workers_failed: ${summary}`);
}
