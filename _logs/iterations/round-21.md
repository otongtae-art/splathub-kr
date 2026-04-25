# Round 21 — 2026-04-25 KST

## 진단

R20 가 train TRELLIS 폴백에서 best shot 자동 선택. 그러나 capture 화면에는
사용자가 "내 사진 중 best 가 어느 것인지" 시각화 없음:
- 어떤 사진이 가장 sharp 한지 모름
- TRELLIS 폴백 시 어떤 사진이 사용될지 사용자가 예측 불가
- 흐림 사진은 빨간 테두리로 시각화되지만 best 는 silent

## 개선

**Best shot ★ 마커** — 흐림 제외한 kept 사진 중 sharpness 최대 1장 강조.

### 1. `bestShotId` 계산
- shots.length >= 5 일 때만 (소수면 모두 비슷)
- blurryIds 제외 후 sharpness 최대 인덱스
- 비교적 cheap 한 O(n) 루프 (이미 sharpness 계산됨)

### 2. 썸네일 분기
- isBlurry → border-danger + opacity 60% + "흐림" 배지 (기존)
- isBest → border-accent + emerald shadow glow + "★ best" 배지 (신규)
- 일반 → border-white/20 (기존)

### 3. tooltip
- isBest 시 `title="최고 sharp · {score}"` → 호버로 점수 확인

## 검증

- `npm run build` ✓
- `/capture` 12.9 → 13 kB (+0.1)
- TS strict 통과
- 5장 미만이면 ★ 안 표시 (의미 없음)

## 배포

✅ Git commit + push → Vercel 자동 배포

## R7 + R20 + R21 통합

| Round | 시각화 |
|---|---|
| R7 (R8) | 흐림: 빨간 테두리 + opacity 60% |
| R21 | best: 초록 테두리 + glow + ★ |
| R20 (train) | best 자동으로 TRELLIS 입력 |

→ 사용자가 자신의 best/worst 사진 즉시 인지 + TRELLIS 폴백 시 사용될 사진
미리 알 수 있음.

## 다음 라운드 후보

- 셔터 흰 플래시 오버레이 (시각 피드백)
- VGGT 결과 통계 시각화 (R5 stats 패널)
- HF Space env 활성화 도구 (R4 unblock)
- iOS 용 Web Audio 셔터 사운드 (Vibration 미지원 보완)
