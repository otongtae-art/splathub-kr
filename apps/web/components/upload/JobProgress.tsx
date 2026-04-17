'use client';

/**
 * JobProgress — 변환 작업 진행률 표시.
 * 폴링 기반 (M4에서 Supabase Realtime으로 교체).
 * taste-skill 원칙: 단일 accent, 스켈레톤 스타일, 이모지 없음.
 */

import { useEffect, useRef, useState } from 'react';
import { JOB_PROGRESS, TERMINAL_STATUSES } from '@/lib/shared';
import type { JobStatus } from '@/lib/shared/types';

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
  queued: '대기',
  preprocessing: '사진 준비',
  pose_estimation: '각도 추정',
  training: '3D 생성',
  postprocessing: '후처리',
  uploading: '업로드',
  done: '완료',
  failed: '실패',
  canceled: '취소',
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
          return;
        }
      } catch {
        // retry on next tick
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
      <div className="flex items-center gap-3 rounded-lg border border-base-100 bg-base-50 p-4 text-sm text-base-500">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        작업 상태 확인 중
      </div>
    );
  }

  const pct = Math.max(snap.progress, JOB_PROGRESS[snap.status] ?? 0);
  const isError = snap.status === 'failed';

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-base-100 bg-base-50 p-4 animate-fade-in">
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          {!isError && snap.status !== 'done' && (
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          )}
          <span className="text-sm font-medium text-base-800">
            {STATUS_LABELS[snap.status]}
          </span>
        </div>
        <span className="font-mono text-xs text-base-500">
          {snap.worker_backend && <span className="mr-2">{snap.worker_backend}</span>}
          {pct.toString().padStart(3, ' ')}%
        </span>
      </div>

      <div className="relative h-0.5 w-full overflow-hidden rounded-full bg-base-200">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out-expo ${
            isError ? 'bg-danger' : 'bg-accent'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {snap.error_message && (
        <p className="text-xs text-danger">
          {snap.error_code && (
            <span className="mr-2 font-mono text-danger/70">{snap.error_code}</span>
          )}
          {snap.error_message}
        </p>
      )}
    </div>
  );
}
