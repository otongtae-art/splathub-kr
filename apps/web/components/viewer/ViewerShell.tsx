'use client';

/**
 * ViewerShell — GaussianSplatViewer를 감싸는 레이아웃 + 상단 메타 + 에러 처리.
 * /m/[slug] 와 /embed/[id] 가 동일한 쉘을 쓰도록 분리해 중복 코드 방지.
 */

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import type { CameraPose, ViewerQuality } from '@/lib/shared/types';

// SSR 시 Three.js/WebGL 초기화가 깨지므로 클라이언트 렌더링 전용.
const GaussianSplatViewer = dynamic(() => import('./GaussianSplatViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-ink-400">
      뷰어 준비 중…
    </div>
  ),
});

type Props = {
  url: string;
  title?: string;
  subtitle?: string;
  autoRotate?: boolean;
  initialCamera?: CameraPose;
  quality?: ViewerQuality;
  /** 임베드 모드일 때 상단 메타를 숨김 */
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
    // 상위(부모 페이지)에서 retry 버튼을 붙일 수 있도록 상태만 기록.
    // M3 이후 onError 시 job 상태를 다시 polling 해 "작업이 실패했습니다" 메시지 표시.
    console.error('[ViewerShell] viewer error', err);
    setErrored(true);
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-ink-900">
      {!minimal && (title || subtitle) && (
        <header className="flex flex-wrap items-baseline gap-2 border-b border-ink-800 px-4 py-3">
          {title && <h1 className="text-lg font-semibold text-ink-50">{title}</h1>}
          {subtitle && <span className="text-sm text-ink-400">{subtitle}</span>}
        </header>
      )}
      <div className="relative flex-1">
        {errored ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-semibold text-ink-100">뷰어를 초기화할 수 없습니다</p>
            <p className="max-w-md text-xs text-ink-400">
              브라우저가 WebGL을 지원하지 않거나, 모델 파일이 손상됐을 수 있습니다.
              최신 Chrome/Edge에서 다시 시도해 주세요.
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
