'use client';

/**
 * Generic React Error Boundary — round 35.
 *
 * 사용처: Three.js / WebGL 등 외부 라이브러리가 크래시할 가능성 있는
 * 컴포넌트 (MeshViewer 등) 를 감싸 부모 페이지 white-screen 방지.
 *
 * Next.js 14+ 의 error.tsx 와는 별도 — 이건 컴포넌트 단위 boundary,
 * error.tsx 는 라우트 단위.
 */

import { Component, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** 에러 발생 시 보여줄 fallback. 함수면 (error) => ReactNode. */
  fallback?: ReactNode | ((error: Error) => ReactNode);
  /** 에러 발생 시 호출할 콜백 (telemetry 등). */
  onError?: (error: Error) => void;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error): void {
    console.error('[ErrorBoundary] caught:', error);
    try {
      this.props.onError?.(error);
    } catch {
      /* onError 자체가 throw 해도 상위로 전파 안 함 */
    }
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      const { fallback } = this.props;
      if (typeof fallback === 'function') {
        return fallback(this.state.error);
      }
      if (fallback) return fallback;
      // 기본 fallback — 최소한의 정보 + 새로고침 버튼
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm font-medium text-base-900">예기치 못한 오류</p>
          <p className="max-w-sm text-xs text-base-500">
            {this.state.error.message || 'Unknown error'}
          </p>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') window.location.reload();
            }}
            className="tactile mt-2 rounded-md border border-base-200 bg-base-50 px-3 py-1.5 text-xs text-base-700 hover:border-base-300"
          >
            페이지 새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
