# Round 10 — 2026-04-25 KST

## 진단

R9 (auto-capture) 의 결함: sector 전환만 보고 발사 → 사용자가 빠르게 걷는
중에 sector 가 바뀌면 즉시 셔터 → motion blur 사진 양산. R7 sharpness
필터가 학습 시점에 잡지만, 그 전에 안 찍는 게 더 좋음.

기존 `motionAccumRef` 는 누적값 (촬영 시 reset) 이라 "지금 흔들리는가"
판단에 부적합.

## 개선

**Motion gate** — 자동 셔터 발사 직전 카메라 안정성 확인.

### 1. `recentMotionRef` 추가 (EWMA)
```ts
recentMotionRef.current = 0.75 * recentMotionRef.current + 0.25 * linear;
```
- α=0.25 → ~3 sample (150-200ms) 윈도우 평균
- 자연 감쇠: 멈추면 빠르게 0 으로 수렴
- 기존 motionAccumRef (촬영 시 reset) 와 직교적

### 2. Auto-capture useEffect 에 게이트 추가
- 모든 기존 조건 통과 후 마지막에:
  ```
  if (recentMotionRef.current > 0.4) {
    prevSectorRef.current = null; // 다음 tick 에 재평가
    setAutoWaiting(true);
    return;
  }
  setAutoWaiting(false);
  ```
- 0.4 m/s² 임계값 — steady 한 손 노이즈 (~0.2) 와 walking jolt (~1.0) 의 중간

### 3. 시각 피드백
- `autoWaiting` state — true 면 토글 아래에 표시:
  > 📷 카메라 안정 대기 중 — 잠시 멈춰주세요
- amber 색상 + animate-pulse → 사용자 인지 + 행동 유도
- 토글 OFF 시 + autoCapture 변경 시 모두 reset

### 4. 토글 시 reset 강화
- prevSectorRef.current = null
- setAutoWaiting(false)
- 깔끔한 상태 전환

## 검증

- `npm run build` ✓
- `/capture` 11.1 → 11.2 kB (+0.1 kB)
- TS strict 통과

## 배포

✅ Git commit + push → Vercel 자동 배포

## R9 + R10 결합

이상적 R10 사용:
1. 사용자 토글 ON, 객체 주변 천천히 걷기
2. 새 sector 진입 → R9 가 발사 트리거
3. R10 motion gate 가 "안정?" 검사
4. 만약 흔들림 → "잠시 멈춰주세요" 안내, 사용자 잠깐 정지
5. 안정되면 즉시 셔터 (다음 tick 에 통과)

→ 사용자에게 "멈추는 행동" 을 자연스럽게 유도 — 모바일 핸드헬드의 핵심 문제 해결.

## 다음 라운드 후보

- HF Space env var 활성화 도구 (R4 unblock)
- 셔터 버튼에 실시간 sharpness meter (찍기 전 미리보기)
- VGGT 결과 confidence 시각화
- Auto-capture: gentle haptic (Vibration API) 셔터 발사 시
- Auto-capture: progress 카운트다운 ("3, 2, 1, 찰칵") 옵션
