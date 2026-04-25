# Round 42 — 2026-04-25 KST

## 진단 (BUG)

iOS 13+ Safari 부터 Apple 정책으로 `DeviceMotion` / `DeviceOrientation`
이벤트는 **명시적 사용자 권한** 필요. `requestPermission()` 안 호출하면
이벤트 listener 등록되어도 silent 무시.

기존 코드:
```ts
useEffect(() => {
  if (!cameraActive) return;
  window.addEventListener('deviceorientation', handler);  // ← iOS 무시
  ...
});
```

영향:
- **R6 미니맵 sector 표시**: alpha 못 받음 → 빈 ring
- **R9 auto-capture**: liveAlpha=null → 안 발사
- **R10 motion gate**: motionAccumRef 안 올라감
- **R13 추천 next sector**: hasGyro=false → null
- **R34 자동 학습**: hasGyro 조건 불만족
- **PC 모드 표시**: orientationOK 영원히 false → 항상 PC 모드

iOS 사용자는 R6, R9, R10, R13, R34 모든 자동화 기능 못 씀!
SplatHub 의 capture 사용자 비중 큰 iPhone 에서 큰 UX 손실.

## 개선

`startCamera()` 안에서 권한 명시 요청. user gesture (버튼 클릭) 안에 있어야
iOS 가 prompt 표시.

```ts
type WithPermission = {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

if (typeof DeviceMotionEvent !== 'undefined') {
  const perm = (DeviceMotionEvent as unknown as WithPermission).requestPermission;
  if (typeof perm === 'function') {
    try { await perm(); } catch (e) { console.warn(...); }
  }
}
// (DeviceOrientationEvent 도 동일)
```

특징:
- `typeof requestPermission === 'function'` 체크 — non-iOS 는 noop
- try-catch — 사용자가 거부해도 카메라는 열림 (graceful degradation)
- `await` 로 prompt 가 dismiss 될 때까지 대기 (그 후 카메라 prompt)

권한 부여 후 기존 useEffect listeners 가 정상 작동.

## 검증

- `npm run build` ✓
- `/capture` 14.8 → 14.9 kB (+0.1)
- TS strict 통과
- Non-iOS 영향 0 (requestPermission 없으면 skip)

## 배포

✅ Git commit + push → Vercel 자동 배포

## 영향 매트릭스

| 환경 | 이전 | 이후 |
|---|---|---|
| iOS Safari (자이로) | silent 비활성 | prompt → 사용자 허용 → 정상 |
| iOS Safari (거부) | silent 비활성 | 명시 거부 후 PC 모드 동작 (graceful) |
| Android Chrome | 정상 | 정상 (no change) |
| Desktop | PC 모드 | PC 모드 (no change) |

iOS 사용자에게 R6/R9/R10/R13/R34 자동화 기능 제공 → 사용자 만족도 ↑.

## 다음 라운드 후보

- iOS 권한 거부 시 명시 안내 ("자이로 권한 필요 — 자동 모드 사용 위해")
- Service worker (offline)
- VGGT 통계 확장 패널
- 토글 트랜지션
