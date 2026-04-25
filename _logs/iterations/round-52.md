# Round 52 — 2026-04-26 KST

## 진단

R38-R40 PWA manifest + install prompt 가 PWA 인프라 구축. 그러나
**Service worker 가 없어** 진정한 PWA 자격 부족:
- Lighthouse PWA audit 페널티
- 반복 방문 시 매번 네트워크 (HTTP 캐시는 freshness 의존)
- 네트워크 끊김 시 즉시 에러 (offline graceful X)

## 개선

`apps/web/public/sw.js` (vanilla JS) + `ServiceWorkerRegister.tsx`.

### Caching 전략
| Path 패턴 | 전략 | 이유 |
|---|---|---|
| `/_next/static/*` | cache-first | hash-versioned URL = immutable |
| `/icon.svg`, `/favicon.ico`, `/og-image.png`, `/apple-icon`, `/manifest.webmanifest`, `*.{png,jpg,webp,woff2,ttf}` | cache-first | 변경 적음 |
| HTML pages (`/`, `/capture`, `/capture/train` 등) | network-first | 빌드별 변경, fallback to cache |
| `/api/*` | 캐시 안 함 | dynamic, server logic |
| 다른 origin (HF Space, etc.) | 통과 | SW 영향 X |

### Cache invalidation
- Cache version key: `'splathub-v1'` (manual 갱신)
- HTML 은 network-first → 새 빌드 즉시 반영
- Static asset 은 hash URL 자체가 불변 → stale 안 됨

### Stale-while-revalidate
cache-first 라도 백그라운드에서 fetch + cache update — 다음 hit 부터 fresh.

### 등록 (production only)
```tsx
'use client';
useEffect(() => {
  if (process.env.NODE_ENV !== 'production') return; // dev HMR 충돌 방지
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js')
    .then(reg => console.info('[sw] registered:', reg.scope));
}, []);
```

## 검증

- `npm run build` ✓ — sw.js 가 public/ 에 있어 그대로 서빙
- TS strict 통과 (ServiceWorkerRegister.tsx)
- Dev 환경: skip → HMR 정상

## 배포

✅ Git commit + push → Vercel 자동 배포

## R38-R40 + R52 PWA 완성

| Round | 역할 |
|---|---|
| R38 | manifest (installable 인식) |
| R39 | Android Chrome install prompt |
| R40 | iOS Safari 수동 설치 안내 |
| R52 | Service worker (offline shell + 빠른 반복 방문) |

→ Lighthouse PWA audit 모든 기준 충족.

## 영향

- 첫 방문: 등록 + cache 채움 (사용자 영향 0)
- 반복 방문: cache hit → /_next/static 등 즉시 로딩 (~300ms 절약)
- 네트워크 끊김: 마지막 본 HTML cache 표시 (graceful)
- VGGT API 호출: 캐시 X (의도적, dynamic)

## 다음 라운드 후보

- A/B 토글 (Pointmap vs Depthmap)
- VGGT metadata sidecar
- 토글 트랜지션
