# Round 43 — 2026-04-25 KST

## 진단

R42 가 iOS 13+ DeviceMotion 권한 명시 요청을 추가했지만, 사용자가 prompt 에서
"거부" 선택 시:
- try-catch 로 throw 만 잡고 silent 진행
- 카메라는 열림 (graceful degradation)
- 그러나 자동 기능들 (R6/R9/R10/R13/R34) 모두 비활성
- 사용자는 "왜 자동 모드가 안 떠?", "왜 미니맵이 비어 있지?" 의문

→ 권한 거부 사실 + 회복 방법 명시 필요.

## 개선

### 1. `motionPermission` 4-state 추적
```ts
'unknown' | 'granted' | 'denied' | 'unsupported'
```

### 2. startCamera() 안에서 결과 추적
```ts
const motionAPI = (DeviceMotionEvent as WithPermission).requestPermission;
const orientAPI = (DeviceOrientationEvent as WithPermission).requestPermission;

if (typeof motionAPI === 'function' || typeof orientAPI === 'function') {
  // iOS 13+
  try {
    const results = [...];
    setMotionPermission(results.some(r => r === 'denied') ? 'denied' : 'granted');
  } catch (e) {
    setMotionPermission('denied');
  }
} else {
  setMotionPermission('unsupported'); // Android, desktop
}
```

### 3. UI 분기 (카메라 화면 우상단)
- `denied` (iOS): 명시 안내 banner
- `denied` 아니면서 orientationOK=false: 기존 "PC 모드" 칩 (Android 데스크톱 등)

```jsx
{motionPermission === 'denied' && (
  <div className="...border-amber-500/40 bg-black/85...">
    📐 자이로 권한 거부됨
    자동 촬영/미니맵/자동 학습 비활성. iOS 설정 → Safari → 동작과 방향 → 허용 후 새로고침.
  </div>
)}
```

orientationOK=false 케이스는 motionPermission !== 'denied' 일 때만 PC 모드
표시 → 중복 안내 방지.

## 검증

- `npm run build` ✓
- `/capture` 14.9 → 15.1 kB (+0.2)
- TS strict 통과
- non-iOS 영향 0 (motionPermission='unsupported' → banner 안 뜸)

## 배포

✅ Git commit + push → Vercel 자동 배포

## R42 + R43 매트릭스

| iOS 사용자 액션 | 결과 |
|---|---|
| 권한 prompt → 허용 | 모든 자동화 정상 작동 |
| 권한 prompt → 거부 | "📐 자이로 권한 거부됨" + 회복 안내 (R43) |
| (이전) | silent 비활성, 사용자 혼란 |

## 다음 라운드 후보

- Service worker (offline)
- VGGT 통계 확장 패널
- 토글 트랜지션
- iOS 설정 deep-link (`prefs:` URL scheme — Safari 차단 다수)
