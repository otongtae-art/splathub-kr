# Round 44 — 2026-04-25 KST

## 진단

`/capture` 하단에 토글 4개 누적:
1. 🎬 자동 촬영 (R9)
2. ✨ 3장 burst (R14, manual 전용)
3. 🔊 셔터 사운드 (R22)
4. 📚 자동 학습 (R34)

진정한 hands-free 경험을 원하는 사용자는 4개 중 3개를 켜야 함:
- 자동 촬영 ON (auto 모드면 burst 자동 적용 → manualBurst 무관)
- 사운드 ON (화면 안 보고 셔터 인지)
- 자동 학습 ON (30장 도달 자동 이동)

→ 매 세션 3번 클릭 + iOS 사용자는 각 토글이 무엇인지 학습 비용.

## 개선

**`🚀 hands-free 모드` 프리셋 버튼** — 자동 촬영 토글 위에 배치, 1-클릭으로 3개 ON.

### 조건
```ts
hasGyro && !(autoCapture && shutterAudio && autoTrainOnTarget)
```
- 자이로 있을 때만 (PC 모드는 의미 없음)
- 이미 모두 켜져 있으면 버튼 숨김 (정보 노이즈 X)

### 동작
```ts
onClick: {
  setAutoCapture(true);
  prevSectorRef.current = null;       // R9 즉시 첫 shot 가능
  setAutoWaiting(false);
  setShutterAudio(true);
  enableShutterSound();               // user gesture 안에서 iOS unlock (R22)
  setAutoTrainOnTarget(true);         // R34
}
```

### UI
```
┌─────────────────────────────────────────────────────────┐
│ 🚀 hands-free 모드 — 자동 촬영 + 사운드 + 자동 학습 한 번에 │
└─────────────────────────────────────────────────────────┘
[🎬 자동 촬영]
[🔊 셔터 사운드]
[📚 자동 학습]
```

3개 모두 ON 후엔 프리셋 버튼 사라지고 토글들만 남음 (개별 OFF 가능).

## 검증

- `npm run build` ✓
- `/capture` 15.1 → 15.2 kB (+0.1)
- TS strict 통과
- iOS: enableShutterSound() 가 onClick 안에 있어 AudioContext unlock 정상

## 배포

✅ Git commit + push → Vercel 자동 배포

## 사용 시나리오

이전:
1. `/capture` → 카메라 시작
2. 토글 영역 스크롤 → 🎬 클릭
3. 다음 토글 → 🔊 클릭 (이게 뭐지?)
4. 다음 토글 → 📚 클릭 (5초 후 자동 이동?)
5. 폰 들고 걷기

이후:
1. `/capture` → 카메라 시작
2. 🚀 클릭 → 3개 모두 ON (사용자에게 explicit "이게 hands-free 다")
3. 폰 들고 걷기

→ 학습 비용 ↓, 채택률 ↑.

## 다음 라운드 후보

- VGGT 통계 확장 패널
- Service worker (offline)
- 토글 트랜지션
- 프리셋: '⚡ 빠른 모드' (manual + 사운드만, 다른 토글 끄기)
