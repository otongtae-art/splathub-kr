# Round 34 — 2026-04-25 KST

## 진단

R9 auto-capture 가 빈 섹터마다 자동 셔터 발사. 그러나 30장 (TARGET_SHOTS)
달성 후에도 사용자가 직접 '학습' 버튼 눌러야 학습 페이지로 이동.

문제:
- Auto-capture 사용 시 사용자는 폰을 들고 걷는 중 → 화면 안 보고 있음
- 학습 버튼 클릭 시점을 놓침 → 31, 32, 33장 계속 찍힘 (sectorsCovered 가
  중복 sector 무시해도 발생 가능)
- 진짜 hands-free 가 아님

## 개선

**자동 학습 토글** + **5초 countdown** (취소 가능).

### 1. State
```ts
autoTrainOnTarget: boolean
autoTrainCountdown: number | null  // null=inactive, 0..5 = countdown
```

### 2. useEffect 3단계
```ts
// 트리거: shots.length >= TARGET_SHOTS && 토글 ON && countdown 비활성
// → setAutoTrainCountdown(5)

// 데크리먼트: 1초마다 countdown - 1

// 발사: countdown === 0 → setAutoTrainCountdown(null) + setAutoTrainOnTarget(false)
//                       + proceedToTraining()
```

1회성 트리거 — 한 번 발사 후 토글 자동 OFF (재발동 방지).

### 3. UI
**토글** (셔터사운드 옆, 자이로 무관 항상 표시):
```
📚 자동 학습 — 30장 채우면 5초 후 자동 이동 [ ]
```

**Countdown banner** (top-32, accent border, prominent):
```
┌─────────────────────────────────────┐
│ 5  자동 학습 시작 중                  │
│    30장 도달 — 곧 학습 페이지로 이동  │
│                              [취소] │
└─────────────────────────────────────┘
```
- 큰 숫자 (font-mono 2xl) accent 색
- [취소] 클릭 시 countdown=null + 토글 OFF (다시 토글해야 재발동)

## 검증

- `npm run build` ✓
- `/capture` 14 → 14.3 kB (+0.3)
- TS strict 통과
- Edge case: 토글 OFF → countdown 즉시 클리어
- 1회성 — 학습 후 다시 페이지 와도 재발동 안 됨

## 배포

✅ Git commit + push → Vercel 자동 배포

## R9 + R10 + R12 + R34 — 진정한 hands-free 시나리오

1. 사용자: 환경 OK 확인 (R15-R17)
2. 자동 촬영 ON (R9) + 자동 학습 ON (R34)
3. 폰을 객체 쪽으로 향한 채 한 바퀴 걸음
4. App 이 빈 섹터마다 자동 셔터 (R9), 흔들림 시 대기 (R10)
5. 매 셔터에 burst 3장 → sharp 1장 채택 (R12)
6. 30장 도달 → "5초 후 자동 학습" 진동 + 카운트다운 표시
7. 사용자 잘못된 시점이라 [취소] 또는 그대로 두면 학습
8. 학습 페이지 → 결과 자동 표시

→ 사용자 액션: 시작 토글 + 걷기. 끝.

## 다음 라운드 후보

- 자동 학습 시 햅틱 진동 (R14 활용)
- VGGT 통계 확장 패널
- 토글 트랜지션
- Auto-capture + auto-train 사용 가이드 inline tutorial
