# Round 7 — 2026-04-25 KST

## 진단

핸드헬드 모바일 촬영 → 모션 블러 빈번 (특히 셔터 누르는 순간 흔들림).
흐릿한 사진은 feature point 가 noisy → VGGT 카메라 포즈 추정에서 엉뚱한
위치 잡음 → pointcloud layer 분리 → "monster". 한 장만 심하게 흐려도
전체 reconstruction 이 망가지는 경우 多.

기존 코드는 모든 shot 을 그대로 VGGT 에 보냄. 흐림 검사 없음.

Round 6 까지의 입력 개선 (분포 균등화) 와 직교적으로, **개별 사진 품질**
필터가 필요.

## 개선

### 1. `apps/web/lib/sharpness.ts` (신규)
- `computeSharpness(canvas)`:
  - 그레이스케일 256px 다운스케일
  - 3x3 Laplacian 컨볼루션 (∇²)
  - 결과의 분산 (variance) 반환
  - Pech-Pacheco 2000, 마이크로스코피 autofocus 표준
- `classifyBlurry(scores)`:
  - 모든 shot 의 sharpness 분포 분석
  - threshold = max(median * 0.4, 30) — 동적 + 절대 floor
  - 어두운 환경 등 모두 낮을 때는 안 자르고, outlier 만 잘라냄
  - 성능: 256px → ~5ms

### 2. `Shot` 타입에 `sharpness: number` 추가
- `captureShot` 에서 featureCanvas (박스 영역) 로 측정 → 객체 기준
  (배경 흐림은 무시, photogrammetry 에서 객체 부분만 중요)

### 3. 썸네일 시각 indicator
- `blurryIds` Set 으로 흐림 판정된 shot 추적
- 썸네일: 흐림이면 `border-danger` + opacity 60% + 하단 "흐림" 배지
- 스트립 아래 "흐림 N장 — 학습 시 자동 제외 (한도 30%)" 안내

### 4. `proceedToTraining` — VGGT 호출 전 자동 제외
- 흐림 후보 식별 → 정렬 → 최대 30% 만 제거 (사진 부족 방지)
- 제외된 수는 `meta.droppedBlurry` 로 IndexedDB 저장
- 콘솔: "dropped N blurry shots before VGGT (kept M)"

### 5. `captureStore.ts` — `CaptureMeta.droppedBlurry?: number` 필드 추가

### 6. `train/page.tsx` — 메타 표시
- "🌀 흐림 N장 자동 제외" 표시 (amber)
- 기존 "12구간" → "36구간" 도 함께 수정 (round 1 SECTORS 변경 미반영)

## 검증

- `npm run build` ✓
- `/capture` 9.9 → 10.6 kB (+0.7 kB, sharpness 모듈)
- `/capture/train` 10.8 → 10.9 kB (+0.1 kB)
- TS strict noUncheckedIndexedAccess 통과 (?? 0 패턴)

## 배포

✅ Git commit + push → Vercel 자동 배포

## Round 4–7 통합

| Round | 단계 | 효과 |
|---|---|---|
| 4 (대기) | 처리 | VGGT Pointmap Branch — view-consistent geometry |
| 5 (배포) | 출력 | viewer outlier trim + 자가진단 |
| 6 (배포) | 입력 (분포) | 미니맵 sector guidance |
| 7 (배포) | 입력 (개별 품질) | sharpness 필터 |

전체 파이프라인 4단 보강 — monster 발생률 누적 감소.

## 다음 라운드 후보

- Auto-capture mode (10° + 정지 시 자동 셔터, R6 미니맵 + R7 sharpness 와 결합)
- HF Space env var (`VGGT_PREDICTION_MODE=Pointmap Branch`) 설정 도구 제공
- 캡처 직후 즉시 흐림 경고 ("이 사진 흐립니다 — 다시 찍을까요?")
- VGGT 결과에 사용된 사진 인덱스 포함 → train 페이지에서 어떤 사진이 활용됐는지
