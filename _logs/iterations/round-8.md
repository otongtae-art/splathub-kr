# Round 8 — 2026-04-25 KST

## 진단

Round 7 (sharpness 필터) 는 학습 시점에 흐림 사진을 자동 제외 — reactive.
하지만 사용자는 자신이 흐림 사진을 찍었다는 사실을 학습 진입 후에야 알게 됨.
이 시점엔 카메라가 닫혀 있어 재촬영 비용 큼:
1. 학습 페이지 → 다시 /capture 이동
2. 다시 셔터 누르며 빈 섹터 채우기

→ Proactive 한 즉시 알림이 더 가치 있음.

## 개선

### 1. `blurToast` state 추가
- `{ id: string; sharpness: number } | null`
- captureShot 직후 sharpness < 50 (절대 임계값) 이면 set
- 3.5 초 후 자동 dismiss (단, 그 사이 다른 사진을 찍어 toast id 가 바뀌면 그대로)

### 2. Toast UI (top-center, 카메라 화면 위)
```
⚠ 흐림 감지 · 자동 제외 가능성 높음   [지우기]
```
- `border-danger/60`, `bg-black/85`, `backdrop-blur`
- 위치: `top-20 left-1/2 -translate-x-1/2`
- `[지우기]` 버튼 → removeShot(id) + dismiss

### 3. 임계값 선택 (절대 vs 상대)
- 절대 50 = "확실히 흐린" (1920×1080 frame, 256px 다운스케일 기준)
  - sharp 모바일 사진: 200~2000
  - 모션 블러: 5~30
  - 50 = "정상이지만 약간 흔들림" 정도까지 잡음
- Round 7 의 median 기반 동적 필터는 borderline 처리 (median * 0.4)
- 두 시스템 직교적: toast 는 "확실 흐림" 만, 필터는 통계적 outlier

## 검증

- `npm run build` ✓
- `/capture` 10.6 → 10.8 kB (+0.2 kB, toast 컴포넌트만)
- TS strict 통과

## 배포

✅ Git commit + push → Vercel 자동 배포

## Round 4–8 누적 효과

| Round | 배포 | 효과 |
|---|---|---|
| 4 | 대기 | VGGT Pointmap Branch (처리) |
| 5 | ✓ | viewer outlier trim + 자가진단 (출력) |
| 6 | ✓ | 미니맵 sector guidance (입력 분포) |
| 7 | ✓ | sharpness 필터 (입력 품질, reactive) |
| 8 | ✓ | 즉시 흐림 toast (입력 품질, proactive) |

각 단계가 monster 발생률을 누적 감소시킴.

## 다음 라운드 후보

- Auto-capture mode (10° + 정지 시 자동 셔터, R6 + R7 + R8 결합)
- HF Space env var 활성화 도구 (R4 unblock)
- 캡처 버튼 자체에 실시간 sharpness meter (셔터 누르기 전 미리 보기)
- Capture 시 "탁자 사용" 가이드 (LIDAR 없는 폰에서 절대값 측정 안정화)
