# Round 37 — 2026-04-25 KST

## 진단

R35/R36 의 컴포넌트 단위 ErrorBoundary 는 viewer 만 보호. 그러나
다음 영역은 못 잡음:
- Route render 자체에서 throw (e.g., layout 렌더 중 JSON 파싱 실패)
- Next.js client-side hydration 단계 에러
- async useEffect 내부 처리 안 한 promise rejection (일부)

→ 라우트 단위 catch-all 필요.

또한 R34 자동 학습 countdown 시작 시 사용자에게 햅틱 알림 없음 —
auto-capture 로 폰 들고 걷는 사용자는 화면 안 보고 있어 5초 카운트다운
시작도 모를 수 있음.

## 개선

### 1. `apps/web/app/error.tsx` (Next.js App Router 라우트 boundary)
```tsx
'use client';
export default function GlobalError({ error, reset }) {
  return (
    <main>
      ⚠ 문제가 발생했습니다
      예기치 못한 오류로 페이지를 로드하지 못했습니다.
      [에러 메시지] [디지스트 ID]
      [다시 시도]  [홈으로]
    </main>
  );
}
```

특징:
- `error.digest` 표시 (Next.js 가 server error 식별자 부여 → 로그 추적 용이)
- `reset()` 호출 시 segment 재마운트 → 일부 에러는 즉시 회복
- 홈으로 fallback 도 함께

R35/R36 ErrorBoundary 와 직교적:
| 레벨 | 잡는 영역 | 사용처 |
|---|---|---|
| ErrorBoundary (R35-R36) | 컴포넌트 subtree | viewer (Three.js crash) |
| error.tsx (R37) | 라우트 segment | 그 외 모든 render error |

### 2. R34 countdown 시작 시 warningHaptic
```ts
useEffect(() => {
  if (!autoTrainOnTarget || done || autoTrainCountdown !== null) return;
  if (shots.length < TARGET_SHOTS) return;
  setAutoTrainCountdown(5);
  warningHaptic(); // ← 추가 (R14 [20,50,20] 더블탭)
}, [...]);
```

R14 warningHaptic 은 흐림 toast 와 같은 패턴. 사용자가 이미 학습된
"중요 알림 = 더블탭 진동" 매핑 활용.

## 검증

- `npm run build` ✓
- `/capture` 14.3 kB (변동 없음 — 한 줄 추가)
- error.tsx 는 별도 chunk 로 빌드됨 (Next.js 자동)
- TS strict 통과

## 배포

✅ Git commit + push → Vercel 자동 배포

## 보호 매트릭스 (R35 + R36 + R37)

| 에러 위치 | 처리 |
|---|---|
| Three.js / WebGL crash in MeshViewer/ViewerShell | ErrorBoundary fallback |
| GLB 파싱 실패 | ErrorBoundary fallback |
| Route segment render 자체 throw | error.tsx [다시 시도][홈으로] |
| Layout render error | error.tsx (root catch-all) |
| 그 외 무엇이든 | error.tsx |

이제 어떤 종류의 에러든 사용자에게 actionable fallback. White screen 0.

## 다음 라운드 후보

- VGGT 통계 확장 패널
- 토글 트랜지션
- 자동 학습 countdown 매 초 진동 (작은 tick) — 너무 시끄러우면 skip
- Service worker / PWA (offline 지원)
