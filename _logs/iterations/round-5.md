# Round 5 — 2026-04-25 KST

## 진단 (general-purpose 서브에이전트)

Round 4 의 백엔드 fix (Pointmap Branch + conf_thres=3) 가 HF Space 수동 배포 대기 상태.
이번 라운드는 **백엔드 변경 없이도 즉시 효과 보는 프론트엔드 개선** 으로 직교적 보강.

VGGT 결과의 흔한 user-facing 실패 두 가지:
1. **Outlier 점이 멀리 튀어** → `Box3.setFromObject(model)` bbox 폭주 → auto-fit 카메라가
   너무 멀어져 진짜 객체가 viewport 안에 작은 점으로만 보이거나 사라짐 → "빈 화면 monster"
2. **결과가 평면적** (한 방향만 촬영해서) → 사용자가 알아채지 못하고 다시 안 찍음

## 개선

### 1. `MeshViewer.tsx` — outlier trim + smart auto-fit
- 새 함수 `trimPointcloudOutliers(points)`:
  - centroid 계산 → 각 점의 거리² 계산
  - sort 후 [5%, 95%] percentile 만 유지하는 새 BufferGeometry 로 in-place 교체
  - color/normal attribute 도 같이 슬라이스 (vertexColors 유지)
  - return: `{ retained, bbox }`
- auto-fit: pointcloud 면 trimmed bbox, mesh 면 기존 model bbox 사용
- distance 계수 1.4 → 1.6 (outlier trim 후엔 진짜 객체 크기라 약간 여유)

### 2. `MeshViewer.tsx` — `onStats` 콜백
- 새 export type `ViewerStats = { pointsCount, retainedCount, bboxDim, depthSpread, flatness }`
- new Props.onStats 가 있으면 trimmed bbox 통계 emit
- ref 패턴으로 부모의 함수 재참조에도 useEffect 재실행 방지

### 3. `capture/train/page.tsx` — 진단 배너 + 헤더 메타
- `viewerStats` state 받아 done 단계에서:
  - 헤더에 `{retainedCount}pts · 평탄도 {flatness*100}%` 표시 (작게)
  - `flatness < 15%` OR `retainedCount < 5000` 시 상단에 노란 배너:
    > "결과가 평면적이거나 sparse 합니다 — 깊이 X% — 다시 촬영하기 →"

## 검증

- `npm run build` ✓ 성공 (TS strict noUncheckedIndexedAccess 대응 완료)
- 번들 사이즈: capture/train 10.5 kB → 10.8 kB (+0.3 kB, 합리적)
- mesh 로드 (TripoSR/TRELLIS) 는 영향 없음 (Points 만 필터)
- 점 50k 기준 percentile sort O(n log n) ≈ 즉시

## 배포

- ✅ Git commit + push → Vercel 자동 배포

## Round 4 와의 관계

직교적 보강:
- Round 4 (백엔드, 배포 대기) — VGGT 가 Pointmap Branch 로 더 좋은 pointcloud 생성
- Round 5 (프론트, 즉시 배포) — 어떤 pointcloud 가 와도 viewer 가 잘 보여주고 monster 자가진단

Round 4 가 활성화되면 monster 발생률 자체가 줄고, Round 5 는 그래도 발생한 monster 를 사용자가 즉시 인지하도록 보장.

## 다음 라운드 후보

- Auto-capture mode (orientation 변화 10° 시 자동 셔터 → 균등 분포)
- 촬영 중 실시간 각도 분포 시각화 (어느 섹터 부족한지 색상 표시)
- 결과 헤더의 "평탄도" 클릭 시 측정 정보 expand (디버깅 / 사용자 학습)
- VGGT-X (sparse-view splat) 통합 검토 (worker 변경, HF Space 배포 후)
