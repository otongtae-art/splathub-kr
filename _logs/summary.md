# 자율 개선 루프 현황

**Start**: 2026-04-21 (KST)
**Round**: 5 (배포 중)
**Current deployed commit**: 43bcd9c (frontend, +round 5 진행 중) / `04a763b @ HF Space` (backend, round 4 대기)

## 🎯 Round 1 구현된 것
1. **Poisson surface reconstruction** (worker/hf-space/app.py)
   - VGGT pointcloud → open3d Poisson mesh
   - CPU ~5-10초, density 하위 5% 제거
   - 시각적 "부유 점" 문제 해결

2. **UX 기준 상향** (apps/web/app/capture/page.tsx)
   - MIN_SHOTS 15 → 20
   - SECTORS 12(30°) → 36(10°)
   - MIN_SECTORS_WITH_GYRO 18 (180° 커버)

3. **카피 강화**
   - "물체를 들지도, 돌리지도 마세요"
   - 올바른/잘못된 방법 2-card 비교
   - 촬영 중 실시간 "카메라 이동 부족" 경고

## 🎯 Round 3 구현된 것
4. **클라이언트 이미지 리사이즈** (`apps/web/lib/hfSpace.ts`)
   - `resizeImageForVggt(file, maxPx=800)` — Browser Canvas API
   - 1920×1080 → max 800px, JPEG q=0.85
   - 20장 기준 ~15MB → ~1.5MB (10× 감소)
   - ZeroGPU 120s 중 업로드 시간 절약 → GPU 처리 시간 확보

## 🎯 Round 4 구현된 것 (배포 대기)
5. **VGGT prediction_mode → "Pointmap Branch"** (`worker/hf-space/app.py:430`)
   - `Depthmap and Camera Branch` → `Pointmap Branch` (모든 뷰 → 공유 3D 공간 직접 회귀)
   - `conf_thres 50 → 3` (공식 Space 기본값)
   - `VGGT_PREDICTION_MODE`, `VGGT_CONF_THRES` env 노출 → tuning 가능
   - **"평면 layer monster" 의 직접 원인 (per-view depth × noisy 핸드헬드 포즈) 제거**
   - ⚠️ HF Space 수동 배포 필요 (`bash worker/hf-space/deploy.sh floerw splathub-trellis-proxy`)
   - 또는 HF Space Settings 에서 위 두 env 만 설정해도 즉시 활성화

## 🎯 Round 5 구현된 것 (Vercel 자동배포)
6. **Viewer outlier trim + monster 자가진단** (`apps/web/components/viewer/MeshViewer.tsx`, `app/capture/train/page.tsx`)
   - VGGT pointcloud 5–95 percentile 거리 trim → noise 점 제거
   - trimmed bbox 기준 카메라 auto-fit (이전엔 outlier 가 bbox 폭주 → "빈 화면")
   - `onStats` 콜백으로 `{retainedCount, bboxDim, depthSpread, flatness}` emit
   - done 페이지 헤더에 점 수/평탄도 표시 + flatness<15% 또는 pts<5k 시 노란 진단 배너 + "다시 찍기"
   - **Round 4 (백엔드, 배포 대기) 와 직교적 보강**

## 📋 Round 6 예정
- [ ] Auto-capture mode (10° 변화 시 자동 촬영)
- [ ] 촬영 중 실시간 각도 분포 시각화 (섹터 색상)
- [ ] VGGT-X (sparse-view splat) 통합 검토

## 📈 품질 경로
| 경로 | 상태 | 비용 |
|---|---|---|
| VGGT + Poisson mesh | 🟡 배포 중 | $0 |
| TRELLIS.2 | ✅ | $0 |
| Brush WebGPU | ✅ | $0 |

## 🚧 블로커 / 남은 과제
- VGGT-X 가 pointcloud→splat 품질 대폭 향상 (2025-09)
- AR 지면 링 (WebXR) 이 rotate-vs-translate 근본 해결
- 모바일에서 실시간 optical flow 계산 비용 검증 필요
