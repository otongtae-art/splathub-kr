'use client';

/**
 * ViewerShell — GaussianSplatViewer의 레이아웃 래퍼.
 * taste-skill: 단일 accent, 스켈레톤 로더, 이모지 없음.
 */

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import type { CameraPose, ViewerQuality } from '@/lib/shared/types';

const GaussianSplatViewer = dynamic(() => import('./GaussianSplatViewer'), {
  ssr: false,
  loading: () => <ViewerSkeleton />,
});

type Props = {
  url: string;
  title?: string;
  subtitle?: string;
  autoRotate?: boolean;
  initialCamera?: CameraPose;
  quality?: ViewerQuality;
  minimal?: boolean;
};

export default function ViewerShell({
  url,
  title,
  subtitle,
  autoRotate = false,
  initialCamera,
  quality = 'auto',
  minimal = false,
}: Props) {
  const [errored, setErrored] = useState(false);

  const onError = useCallback((err: Error) => {
    console.error('[ViewerShell] viewer error', err);
    setErrored(true);
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-base-0">
      {!minimal && (title || subtitle) && (
        <header className="flex flex-wrap items-baseline gap-2 border-b border-base-100 px-5 py-3">
          {title && (
            <h1 className="text-base font-medium tracking-tight text-base-900">
              {title}
            </h1>
          )}
          {subtitle && <span className="text-xs text-base-500">{subtitle}</span>}
        </header>
      )}
      <div className="relative flex-1">
        {errored ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-medium text-base-800">
              뷰어를 초기화할 수 없습니다
            </p>
            <p className="max-w-md text-xs text-base-500">
              브라우저가 WebGL을 지원하지 않거나 모델 파일이 손상됐을 수 있습니다.
              최신 Chrome / Edge에서 다시 시도해 주세요.
            </p>
          </div>
        ) : (
          <GaussianSplatViewer
            url={url}
            autoRotate={autoRotate}
            initialCamera={initialCamera}
            quality={quality}
            onError={onError}
          />
        )}
      </div>
    </div>
  );
}

function ViewerSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-base-500">
      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
      뷰어 준비 중
    </div>
  );
}
