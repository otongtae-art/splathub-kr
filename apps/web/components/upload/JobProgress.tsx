'use client';

/**
 * JobProgress — 변환 작업 진행률 표시.
 *
 * mockFlow의 클라이언트 사이드 이벤트를 구독한다. 실제 HF Space 워커 연결 시
 * 이 파일의 useEffect 내부만 `/api/jobs/:id` 폴링으로 교체하면 됨.
 */

import { useEffect, useRef, useState } from 'react';
import { JOB_PROGRESS, TERMINAL_STATUSES } from '@/lib/shared';
import type { JobStatus } from '@/lib/shared/types';
import { subscribeMockJob, type MockJobSnapshot } from '@/lib/mockFlow';

type Props = {
  jobId: string;
  onDone?: (snapshot: MockJobSnapshot) => void;
  onError?: (snapshot: MockJobSnapshot) => void;
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
  const [snap, setSnap] = useState<MockJobSnapshot | null>(null);
  const doneFiredRef = useRef(false);

  useEffect(() => {
    doneFiredRef.current = false;
    const unsubscribe = subscribeMockJob(jobId, (next) => {
      setSnap(next);
      if (TERMINAL_STATUSES.includes(next.status) && !doneFiredRef.current) {
        doneFiredRef.current = true;
        if (next.status === 'done') onDone?.(next);
        else onError?.(next);
      }
    });
    return unsubscribe;
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
