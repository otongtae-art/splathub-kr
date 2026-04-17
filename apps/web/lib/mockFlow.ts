'use client';

/**
 * 클라이언트 사이드 mock 변환 플로우.
 *
 * Vercel 서버리스 환경에서는 파일시스템 쓰기가 제한되고 setTimeout 기반
 * 지연도 동작하지 않는다. 실제 HF Space GPU 워커가 연결되기 전까지는
 * 모든 데모 흐름을 브라우저 안에서 처리한다.
 *
 * 이 파일이 서버 fetch를 대체:
 *   - 파일은 URL.createObjectURL로 메모리에만 보관
 *   - job은 EventEmitter로 상태를 단계별로 방출
 *   - 결과는 샘플 .spz를 가리키되, 썸네일은 실제 업로드 첫 장 사용
 */

import type { JobStatus } from './shared/types';

export type MockJobSnapshot = {
  id: string;
  status: JobStatus;
  progress: number;
  worker_backend: string | null;
  result_model_id: string | null;
  error_code: string | null;
  error_message: string | null;
  /** 업로드된 첫 사진 URL — 뷰어 진입 전 썸네일로 사용 */
  thumbnail_url: string | null;
};

type Listener = (snap: MockJobSnapshot) => void;

const jobs = new Map<string, MockJobSnapshot>();
const listeners = new Map<string, Set<Listener>>();

function randomId(): string {
  return `mock-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function emit(id: string, patch: Partial<MockJobSnapshot>) {
  const prev = jobs.get(id);
  if (!prev) return;
  const next = { ...prev, ...patch };
  jobs.set(id, next);
  listeners.get(id)?.forEach((fn) => fn(next));
}

/**
 * 새 mock 작업을 등록하고 단계별 상태 전환을 예약한다.
 * 반환된 jobId를 JobProgress에 전달.
 */
export function startMockJob(options: { thumbnailUrl: string | null }): string {
  const id = randomId();
  const initial: MockJobSnapshot = {
    id,
    status: 'queued',
    progress: 0,
    worker_backend: 'mock',
    result_model_id: null,
    error_code: null,
    error_message: null,
    thumbnail_url: options.thumbnailUrl,
  };
  jobs.set(id, initial);
  listeners.set(id, new Set());

  // 단계별 전환 — 실제 엔진 연결 시 이 배열을 HF Space 폴링 결과로 대체
  const steps: Array<{ delay: number; status: JobStatus; progress: number }> = [
    { delay: 200, status: 'preprocessing', progress: 10 },
    { delay: 900, status: 'pose_estimation', progress: 30 },
    { delay: 1800, status: 'training', progress: 65 },
    { delay: 2700, status: 'postprocessing', progress: 90 },
    { delay: 3400, status: 'done', progress: 100 },
  ];
  for (const step of steps) {
    setTimeout(() => {
      const patch: Partial<MockJobSnapshot> = {
        status: step.status,
        progress: step.progress,
      };
      if (step.status === 'done') patch.result_model_id = `model-${id}`;
      emit(id, patch);
    }, step.delay);
  }

  return id;
}

export function subscribeMockJob(id: string, listener: Listener): () => void {
  const snap = jobs.get(id);
  if (snap) listener(snap); // 초기 상태 즉시 전달
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
