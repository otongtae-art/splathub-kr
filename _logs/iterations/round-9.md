# Round 9 — 2026-04-25 KST

## 진단

R6–R8 의 입력 개선:
- R6: 빈 섹터를 시각화 (사용자가 어디로 가야 할지 알게 됨)
- R7: 흐린 사진 자동 제외 (학습 시점)
- R8: 흐림 즉시 toast (촬영 시점)

남은 마찰: **사용자가 셔터를 매번 눌러야 함**. 물체 주변을 걸으면서
한 손엔 폰, 한 손은 셔터. 정신 분산 → 카메라 흔들림 → 흐림 사진
또는 부정확한 각도. 또한 사용자가 "이 정도면 충분히 움직였나?" 매번
판단해야 함 → 일부 섹터 누락.

## 개선

**자동 촬영 모드** — 빈 섹터 진입 시 자동 셔터.

### 1. State + refs
- `autoCapture: boolean` — 토글 (default OFF, opt-in)
- `prevSectorRef` — 직전 sector 추적
- `lastAutoShotAtRef` — 마지막 자동 shot 시각 (debounce)

### 2. Trigger 로직 (useEffect on `liveAlpha`)
조건 (모두 만족 시 자동 captureShot):
- `autoCapture` ON
- 카메라 활성, done 아님
- `liveAlpha != null` (자이로 사용 가능)
- 마지막 자동 shot 으로부터 800ms 경과 (debounce)
- 현재 alpha 의 sector ≠ prevSector (sector 전환 발생)
- 새 sector 가 아직 안 채워짐 (또는 첫 shot)

토글 시 `prevSectorRef.current = null` 리셋 → 토글하자마자 첫 자동 shot 가능.

### 3. UI
- 셔터 버튼: autoCapture ON 시 `border-accent` + `shadow emerald glow` + `animate-pulse`
- 카메라 아이콘 색상도 accent 로 변경
- 토글 체크박스 아래에 "🎬 자동 촬영 — 빈 섹터에 들어가면 자동 셔터"
- `hasGyro` 가 false 면 토글 자체를 숨김 (PC 모드는 alpha 없으므로 의미 없음)

### 4. 안전장치
- 800ms debounce — 같은 자리 중복 발사 방지
- sector 전환만 트리거 — 정지하면 안 찍음
- sectorsCovered 검사 — 이미 채워진 섹터 재촬영 안 함
- captureShot 자체는 `useCallback` 그대로 — 흐림 toast/sharpness 측정 등 동일

## 검증

- `npm run build` ✓
- `/capture` 10.8 → 11.1 kB (+0.3 kB)
- TS strict 통과

## 배포

✅ Git commit + push → Vercel 자동 배포

## R6–R9 결합 시나리오

이상적 사용 flow:
1. 사용자가 "🎬 자동 촬영" 토글 ON
2. 폰을 객체 쪽으로 향한 채 천천히 한 바퀴 걸음
3. 미니맵의 빨간 점 (R6) 으로 빈 섹터 시각화
4. 새 섹터 진입할 때마다 자동 셔터 (R9)
5. 흐림 사진은 즉시 toast (R8) → 사용자 [지우기] 가능
6. 학습 진입 시 통계 outlier 흐림 자동 제외 (R7)
7. 결과는 viewer trim + 자가진단 (R5)

→ 사용자 마찰 최소화 + 입력 품질 + 분포 + 출력 모두 개선.

## 다음 라운드 후보

- HF Space env var 활성화 도구/가이드 (R4 unblock)
- 셔터 버튼에 실시간 sharpness meter (찍기 전 미리보기)
- Auto-capture 시 "정지 감지" 추가 — 카메라가 흔들리면 안 찍음 (motion threshold)
- VGGT 결과 confidence 시각화 (어느 부분이 신뢰할만한지)
