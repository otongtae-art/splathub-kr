'use client';

/**
 * 클라이언트 사이드 "작업 상태" EventEmitter.
 *
 * 실제 3D Splat 생성(lib/gen3d.ts)을 구동하면서 상태 전환 이벤트를 JobProgress
 * 컴포넌트로 스트리밍한다. 파일 이름은 역사적 이유로 mockFlow지만 더 이상 mock이
 * 아니다 — 실제 사용자 사진에서 .ply 를 생성하고 Blob URL 을 결과로 돌려준다.
 *
 * HF Space + VGGT/FreeSplatter 서버 엔진으로 업그레이드할 경우 `runGeneration`
 * 구현만 교체하면 됨.
 */

import type { JobStatus } from './shared/types';
import { generateSplatFromPhotos } from './gen3d';

export type MockJobSnapshot = {
  id: string;
  status: JobStatus;
  progress: number;
  worker_backend: string | null;
  result_model_id: string | null;
  /** 샘플 .spz 경로 등 URL 기반 결과 */
  result_ply_url: string | null;
  /**
   * 클라이언트에서 생성된 .ply 바이트. Spark.js의 `fileBytes` 옵션에 직접
   * 전달해 Blob URL 포맷 감지 실패를 피한다.
   */
  result_ply_bytes: Uint8Array | null;
  error_code: string | null;
  error_message: string | null;
  thumbnail_url: string | null;
};

type Listener = (snap: MockJobSnapshot) => void;

const jobs = new Map<string, MockJobSnapshot>();
const listeners = new Map<string, Set<Listener>>();

function randomId(): string {
  return `job-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function emit(id: string, patch: Partial<MockJobSnapshot>) {
  const prev = jobs.get(id);
  if (!prev) return;
  const next = { ...prev, ...patch };
  jobs.set(id, next);
  listeners.get(id)?.forEach((fn) => fn(next));
}

/**
 * 새 작업을 시작. 실제 3D 생성 파이프라인을 구동하고 상태 변화를 emit.
 */
export function startMockJob(options: {
  thumbnailUrl: string | null;
  files?: File[];
}): string {
  const id = randomId();
  const initial: MockJobSnapshot = {
    id,
    status: 'queued',
    progress: 0,
    worker_backend: 'browser_gen3d',
    result_model_id: null,
    result_ply_url: null,
    result_ply_bytes: null,
    error_code: null,
    error_message: null,
    thumbnail_url: options.thumbnailUrl,
  };
  jobs.set(id, initial);
  listeners.set(id, new Set());

  // 파일이 있으면 실제 생성, 없으면 데모(샘플)
  if (options.files && options.files.length > 0) {
    runGeneration(id, options.files).catch((err) => {
      console.error('[gen3d] failed', err);
      emit(id, {
        status: 'failed',
        progress: 0,
        error_code: 'generation_failed',
        error_message: err instanceof Error ? err.message : String(err),
      });
    });
  } else {
    // 파일 없을 때 — 샘플 .spz 사용
    setTimeout(() => {
      emit(id, {
        status: 'done',
        progress: 100,
        result_model_id: `model-${id}`,
        result_ply_url: '/samples/butterfly.spz',
      });
    }, 1200);
  }

  return id;
}

/**
 * 실제 생성 구동 — 상태를 단계별로 방출하며 gen3d 실행.
 */
async function runGeneration(id: string, files: File[]): Promise<void> {
  emit(id, { status: 'preprocessing', progress: 10 });
  await tick();

  emit(id, { status: 'pose_estimation', progress: 25 });
  await tick();

  emit(id, { status: 'training', progress: 40 });

  const plyBytes = await generateSplatFromPhotos(files, {
    onProgress: (frac) => {
      // 40% ~ 85% 구간을 생성 진행률로 매핑
      const pct = Math.round(40 + frac * 45);
      emit(id, { status: 'training', progress: pct });
    },
  });

  emit(id, { status: 'postprocessing', progress: 90 });
  await tick();

  emit(id, {
    status: 'done',
    progress: 100,
    result_model_id: `model-${id}`,
    // 바이트 배열을 viewer에 직접 전달 — Blob URL 포맷 감지 실패 회피
    result_ply_bytes: plyBytes,
  });
}

function tick(ms = 60): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function subscribeMockJob(id: string, listener: Listener): () => void {
  const snap = jobs.get(id);
  if (snap) listener(snap);
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
  };
}

export function getMockJob(id: string): MockJobSnapshot | undefined {
  return jobs.get(id);
}
