# 자율 개선 루프 현황

**Start**: 2026-04-21 (KST)
**Round**: 16 (배포 중)
**Current deployed commit**: db0926a (+round 16 진행 중) / `04a763b @ HF Space` (backend, round 4 대기)

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

## 🎯 Round 6 구현된 것 (Vercel 자동배포)
7. **미니맵 sector guidance** (`apps/web/app/capture/page.tsx`)
   - 36 섹터 ring: covered=초록 dim, missing=빨강 dim → 어디 비었는지 즉시 인지
   - "you are here" live alpha 화살표 (5Hz 폴링) → 지금 빈 구간 보고 있는지 시각화
   - 기존 shot 점은 r=1.8 초록으로 ring 위 overlay, beta 도 반영
   - **입력 photo 분포 균등화 → VGGT 평면 layer 회귀 줄임**

## 🎯 Round 4–6 통합 효과 — 3단 보강
- Round 4 (대기): VGGT Pointmap Branch — pointcloud **처리** 품질 ↑
- Round 5 (배포): viewer outlier trim + monster 자가진단 — **출력** 잘 보여줌 + 실패 인지
- Round 6 (배포): 미니맵 가이드 — **입력** photo 분포 개선

## 🎯 Round 7 구현된 것 (Vercel 자동배포)
8. **Sharpness 필터** (`apps/web/lib/sharpness.ts` 신규)
   - Laplacian variance (Pech-Pacheco 2000) — 256px 다운스케일, ~5ms
   - 동적 threshold: max(median*0.4, 30) — outlier 만 자르고 어두운 환경 보호
   - 썸네일: 흐림이면 빨간 테두리 + opacity 60% + "흐림" 배지
   - VGGT 호출 전 자동 제외 (한도 30%, 사진 부족 방지)
   - train 페이지에 "🌀 흐림 N장 자동 제외" 표시
   - **개별 사진 품질 필터 — VGGT 포즈 추정 안정화**

## 🎯 Round 8 구현된 것 (Vercel 자동배포)
9. **즉시 흐림 경고 toast** (`apps/web/app/capture/page.tsx`)
   - sharpness < 50 (절대 임계값) → captureShot 직후 화면 상단에 3.5초 toast
   - "⚠ 흐림 감지 · 자동 제외 가능성 높음 [지우기]"
   - [지우기] → removeShot(id) — 다음 사진 찍기 전 즉시 재촬영 결정
   - **Round 7 reactive 필터를 proactive UX 로 보강**

## 🎯 Round 9 구현된 것 (Vercel 자동배포)
10. **Auto-capture mode** (`apps/web/app/capture/page.tsx`)
    - 토글 ON → 빈 섹터 진입할 때마다 자동 셔터 (자이로 모바일만)
    - 800ms debounce + sector 전환 감지 + sectorsCovered 검사
    - 셔터 버튼: emerald glow + pulse 애니메이션
    - **R6 (분포 가이드) + R7/R8 (품질 필터) 와 결합 → 사용자는 한 손으로 폰 들고 걷기만 하면 됨**

## 🎯 Round 4–9 입력→출력 전 파이프라인
- R4 (대기): 처리 — VGGT Pointmap Branch
- R5 (배포): 출력 — viewer outlier trim + 자가진단
- R6 (배포): 입력 분포 — 미니맵 sector guidance
- R7 (배포): 입력 품질 reactive — sharpness 자동 제외
- R8 (배포): 입력 품질 proactive — 즉시 흐림 toast
- R9 (배포): 입력 마찰 — auto-capture mode

## 🎯 Round 10 구현된 것 (Vercel 자동배포)
11. **Auto-capture motion gate** (`apps/web/app/capture/page.tsx`)
    - DeviceMotion EWMA (α=0.25, ~200ms 윈도우) — `recentMotionRef`
    - 자동 셔터 직전 게이트: `recentMotionRef > 0.4 m/s²` 면 보류
    - "📷 카메라 안정 대기 중 — 잠시 멈춰주세요" amber 표시
    - **R9 가 흔들림 도중 발사하던 motion blur 문제 해결**
    - R7 sharpness 필터보다 앞단에서 차단 → 흐림 사진 자체가 적게 발생

## 🎯 Round 11 구현된 것 (Vercel 자동배포)
12. **어두움 검사 + toast 확장** (`apps/web/lib/sharpness.ts`, `app/capture/page.tsx`)
    - `computeBrightness(canvas)` — 64px luma 평균 (~1ms)
    - brightness<35 시 R8 toast 가 '어두움 — 조명 부족' 메시지로 발사
    - sharpness<50 + brightness<35 둘 다 → '흐림 + 어두움' 메시지
    - **R7 (motion blur) 의 사각지대인 ISO noise 입력 품질 보강**

## 🎯 Round 12 구현된 것 (Vercel 자동배포)
13. **Multi-shot burst (auto-capture)** (`apps/web/app/capture/page.tsx`)
    - Auto-capture 빈 섹터 진입 → 3프레임 70ms 간격 → sharpness 최대 채택
    - Apple Object Capture 패턴
    - Manual shutter 는 단일 프레임 (응답성 유지)
    - 토글 라벨: "🎬 자동 촬영 — 빈 섹터 진입 시 3장 burst (sharp 1장 채택)"
    - **사용자 부담 0, 흐림 사진 발생률 대폭 감소**

## 🎯 Round 13 구현된 것 (Vercel 자동배포)
14. **미니맵 추천 다음 sector 강조** (`apps/web/app/capture/page.tsx`)
    - currentAlpha 기준 양방향 가장 가까운 빈 sector 1개 검색
    - 풀 빨강 + r=1.8 + animate-pulse → "여기로 가세요" 직관적 인지
    - 채울 때마다 다음 가까운 빈 곳으로 자동 이동
    - **R6 의 모든-동일-dim → 추천-1개-강조 로 전환**

## 🎯 Round 14 구현된 것 (Vercel 자동배포)
15. **햅틱 + manual burst 토글** (`apps/web/lib/haptics.ts` 신규, `app/capture/page.tsx`)
    - shutterHaptic(30ms) — 모든 captureShot
    - warningHaptic(더블탭) — 흐림/어두움 toast 시
    - manual 셔터 '✨ 3장 burst' 토글 (Auto OFF 일 때만 표시)
    - **모든 사용자가 burst 품질 선택 가능 + 화면 안 보고도 셔터/경고 인지**

## 🎯 Round 15 구현된 것 (Vercel 자동배포)
16. **환경 사전 체크** (`apps/web/app/capture/page.tsx`)
    - 카메라 시작 직후 1초간 brightness 5회 sample
    - 평균 < 60 시 banner: "💡 환경이 어둡습니다 (밝기 X) — 더 밝은 곳 권장"
    - shots>0 또는 [무시] 클릭 시 자동 숨김
    - **사용자가 20+ 사진 투자 전에 환경 개선 결정 → R11 toast 보다 먼저 발동**

## 🎯 Round 16 구현된 것 (Vercel 자동배포)
17. **환경 사전 체크 + feature density** (`apps/web/app/capture/page.tsx`)
    - R15 brightness 위에 detectFeatures (200px, max 80) 5회 sample 추가
    - avg<20 features → 'low_texture' issue
    - 메시지 분기: dim/low_texture/둘 다
    - **Photogrammetry 본질적 실패 모드 (textureless wall) 사전 감지**

## 📋 Round 17 예정
- [ ] 결과 페이지 R7 dropped 사진 미리보기
- [ ] 셔터 흰 플래시 오버레이
- [ ] 환경 ok 시 작은 ✓ 표시
- [ ] HF Space env 활성화 도구

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
