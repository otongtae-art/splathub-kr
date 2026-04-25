# 자율 개선 루프 현황

**Start**: 2026-04-21 (KST)
**Round**: 3 (완료, 배포됨)
**Current deployed commit**: c2f31be

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

## 📋 Round 4 예정
- [ ] Auto-capture mode (10° 변화 시 자동 촬영)
- [ ] Optical flow 기반 rotate vs translate 구분
- [ ] orientation 기반 중복 프레임 필터링

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
