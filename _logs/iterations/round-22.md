# Round 22 — 2026-04-25 KST

## 진단

R14 의 햅틱 피드백은 iOS Safari 미지원 (Apple 정책). iPhone 사용자는
auto-capture 시 폰 화면 안 보면 셔터 작동 인지 불가 → Android 사용자
대비 UX 격차.

## 개선

**Web Audio shutter tick** — 셔터 발사 시 짧은 'click' 사운드. iOS 포함
모든 브라우저 동작.

### 1. `lib/haptics.ts` 확장
```ts
let audioCtx: AudioContext | null = null;
let audioEnabled = false;

export function enableShutterSound(): boolean {
  // user gesture 안에서 AudioContext 생성 + iOS unlock (resume)
}
export function disableShutterSound(): void;
export function playShutterSound(): void;
  // 1500Hz sine 50ms exp decay (gain 0.08 → 0.001)
```

iOS 정책: AudioContext 는 user gesture 안에서 생성/unlock 해야 함.
토글 ON 클릭이 user gesture → 그때 enableShutterSound() 호출 → 이후
auto-capture 셔터에서도 재생 가능.

### 2. capture/page.tsx
- State: `shutterAudio: boolean` (default false — opt-in, 사용자가 원할 때만)
- Toggle UI: '🔊 셔터 사운드 — 진동 미지원 기기 (iPhone) 보완'
  - onChange 시 enableShutterSound() / disableShutterSound() 호출
- captureShot 시 playShutterSound() 무조건 호출 (내부 gating)

### 3. 안전장치
- audioEnabled=false 면 silent
- AudioContext suspended 면 resume 시도 후 이번 셔터 skip
- try-catch 로 모든 에러 무시 (오래된 브라우저 호환)

## 검증

- `npm run build` ✓
- `/capture` 13 → 13.4 kB (+0.4, Web Audio 로직)
- TS strict 통과
- 토글 OFF 면 zero overhead

## 배포

✅ Git commit + push → Vercel 자동 배포

## 셔터 피드백 매트릭스 (R14 + R22)

| 환경 | 햅틱 (R14) | 사운드 (R22) |
|---|---|---|
| Android Chrome | ✓ 동작 | 토글 ON 시 |
| iOS Safari | × 미지원 | **토글 ON 시 (보완)** |
| Desktop | × 무관 | 토글 ON 시 |

## 다음 라운드 후보

- 셔터 흰 플래시 오버레이 (시각 피드백 — 햅틱/사운드 트리오 완성)
- VGGT 결과 통계 시각화 (R5 stats 패널)
- HF Space env 활성화 도구 (R4 unblock)
- 환경 사전 체크 진행 indicator (1초 sample 중 표시)
