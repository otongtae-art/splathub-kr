/**
 * Hugging Face Space (Gradio) invocation — 1st priority worker in the Ladder.
 *
 * The Space exposes `predict(images: File[], job_id: str, callback_url: str)` and
 * returns a `.spz` file plus a JSON summary. We call it via the Gradio HTTP API
 * directly (no `@gradio/client` dependency to keep the bundle lean on Edge).
 *
 * M1 invariant: this is a fire-and-forget trigger — the Space POSTs back the
 * real status via `JOB_CALLBACK_URL`. This function only reports whether the
 * *submission* succeeded, not whether the conversion itself succeeded.
 */

import { optional, publicOrigin, required } from '@/lib/env';

export type HfSubmitInput = {
  jobId: string;
  imageUrls: string[]; // publicly fetchable URLs (R2 presigned GET)
};

export type HfSubmitResult = {
  event_id: string;
  callback_url: string;
};

export async function submitToHfSpace(input: HfSubmitInput): Promise<HfSubmitResult> {
  const base = required('HF_SPACE_URL').replace(/\/+$/, '');
  const token = optional('HF_API_TOKEN');
  const callback_url = `${publicOrigin().replace(/\/+$/, '')}/api/jobs/${input.jobId}/callback`;

  // Gradio 5.x uses /call/<fn_name> to initiate an async job and return an event_id.
  // The Space's `predict` function signature is (files, job_id, callback_url).
  const res = await fetch(`${base}/call/predict`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      data: [
        // Gradio expects `meta` objects for remote file references.
        input.imageUrls.map((url) => ({ path: url, url, meta: { _type: 'gradio.FileData' } })),
        input.jobId,
        callback_url,
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`hf_space_submit_failed status=${res.status} body=${await res.text()}`);
  }
  const json = (await res.json()) as { event_id?: string };
  if (!json.event_id) {
    throw new Error('hf_space_submit_no_event_id');
  }
  return { event_id: json.event_id, callback_url };
}
