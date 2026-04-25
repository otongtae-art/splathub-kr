'use client';

/**
 * Service Worker 자동 등록 — round 52.
 *
 * /sw.js (public/sw.js, 라운드 52 신규) 를 mount 시 등록.
 * 브라우저 미지원 / localhost 등은 silent 무시.
 *
 * 영향:
 *   - 첫 방문: 등록만 (다음 방문부터 캐시 효과)
 *   - 반복 방문: cache hit 으로 빠른 로딩
 *   - 네트워크 끊김: HTML cache fallback (graceful)
 */

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // 개발 환경 (next dev) 에서는 SW 등록 skip — HMR 충돌 방지
    if (process.env.NODE_ENV !== 'production') return;

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.info('[sw] registered:', reg.scope);
        })
        .catch((err) => {
          console.warn('[sw] register failed:', err);
        });
    };

    if (document.readyState === 'complete') {
      onLoad();
    } else {
      window.addEventListener('load', onLoad, { once: true });
    }
  }, []);

  return null;
}
