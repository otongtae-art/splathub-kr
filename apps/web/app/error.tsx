'use client';

/**
 * Next.js App Router 의 라우트 단위 error boundary — round 37.
 *
 * R35/R36 의 컴포넌트 단위 ErrorBoundary 가 못 잡는 영역 (route render
 * 자체, layout 렌더 중 throw 등) 까지 커버. 모든 페이지의 catch-all 폴백.
 *
 * Next.js 가 자동으로 boundary 처리. 사용자에게 white screen 대신
 * 친근한 fallback + reset/홈 버튼 제공.
 */

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 콘솔 로깅 (telemetry 가 있다면 여기에 전송)
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-2xl">
        ⚠
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-base-900">
        문제가 발생했습니다
      </h1>
      <p className="max-w-sm text-sm text-base-500">
        예기치 못한 오류로 페이지를 로드하지 못했습니다.
      </p>
      {error.message && (
        <p className="max-w-sm break-all rounded-md border border-base-200 bg-base-50 px-3 py-2 text-[11px] font-mono text-base-600">
          {error.message}
        </p>
      )}
      {error.digest && (
        <p className="font-mono text-[10px] text-base-400">
          ID: {error.digest}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="tactile rounded-md bg-accent px-4 py-2 text-sm font-medium text-base-0 transition-colors hover:bg-accent-bright"
        >
          다시 시도
        </button>
        <a
          href="/"
          className="tactile rounded-md border border-base-200 bg-base-50 px-4 py-2 text-sm text-base-700 transition-colors hover:border-base-300"
        >
          홈으로
        </a>
      </div>
    </main>
  );
}
