'use client';

/**
 * JobProgress — 작업 상태 폴링 UI.
 *
 * M1: Supabase Realtime 이 아직 붙지 않았으므로 /api/jobs/:id 를 1.5초 간격으로
 * 폴링한다. M4 에서 Realtime broadcast 기반으로 교체하면 이 컴포넌트의 내부만
 * 바꾸고 외부 인터페이스(onDone, onError)는 그대로 유지.
 */

import { useEffect, useRef, useState } from 'react';
import { JOB_PROGRESS, TERMINAL_STATUSES } from '@splathub/shared';
import type { JobStatus } from '@splathub/shared/types';

type JobSnapshot = {
  id: string;
  status: JobStatus;
  progress: number;
  worker_backend: string | null;
  result_model_id: string | null;
  error_code: string | null;
  error_message: string | null;
};

type Props = {
  jobId: string;
  onDone?: (snapshot: JobSnapshot) => void;
  onError?: (snapshot: JobSnapshot) => void;
};

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: '대기 중',
  preprocessing: '사진 준비 중',
  pose_estimation: '각도 추정 중',
  training: '3D 생성 중',
  postprocessing: '후처리 중',
  uploading: '업로드 중',
  done: '완료',
  failed: '실패',
  canceled: '취소됨',
};

export default function JobProgress({ jobId, onDone, onError }: Props) {
  const [snap, setSnap] = useState<JobSnapshot | null>(null);
  const doneFiredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`status_${res.status}`);
        const next = (await res.json()) as JobSnapshot;
        if (cancelled) return;
        setSnap(next);
        if (TERMINAL_STATUSES.includes(next.status)) {
          if (!doneFiredRef.current) {
            doneFiredRef.current = true;
            if (next.status === 'done') onDone?.(next);
            else onError?.(next);
          }
          return; // 폴링 중단
        }
      } catch {
        // 일시적 오류는 조용히 무시하고 다음 tick에 재시도
      }
      timer = setTimeout(tick, 1500);
    }

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, onDone, onError]);

  if (!snap) {
    return (
      <div className="rounded-lg border border-ink-700 bg-ink-800/40 p-4 text-sm text-ink-300">
        작업 상태 확인 중…
      </div>
    );
  }

  const pct = Math.max(snap.progress, JOB_PROGRESS[snap.status] ?? 0);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-ink-700 bg-ink-800/40 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink-100">{STATUS_LABELS[snap.status]}</span>
        <span className="text-xs text-ink-400">
          {snap.worker_backend ?? ''} {pct}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-ink-900">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            snap.status === 'failed' ? 'bg-red-500' : 'bg-accent-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {snap.error_message && (
        <p className="text-xs text-red-300">
          {snap.error_code && <span className="mr-2 font-mono">{snap.error_code}</span>}
          {snap.error_message}
        </p>
      )}
    </div>
  );
}
