# Round 6 — 2026-04-25 KST

## 진단

기존 미니맵(`AngleMap3D`)은 **이미 촬영한 각도** 만 표시. 사용자는
"10/36 섹터" 라는 숫자는 보지만 **어느 26개 섹터가 비어 있는지** 모름.
결과: 사용자가 무작위로 카메라를 회전시켜 빈 구간이 채워지길 기대 →
일부 구간만 중복 촬영, 일부는 비어 있음 → photo 분포 불균등 → VGGT 가
일부 각도만 보고 평면 추정 → "monster".

기존 코드 ([apps/web/app/capture/page.tsx:746](apps/web/app/capture/page.tsx:746))
는 shots.orientation 만 점으로 그림. 빈 섹터 정보 없음.

## 개선

### 1. `AngleMap3D` 시그니처 확장
- `sectorsCovered: Set<number>` — 어느 섹터가 채워졌는지
- `liveAlpha: number | null` — 현재 카메라가 향한 방향 (실시간)

### 2. 36 섹터 ring 추가 (적도 평면)
- 각 섹터 중심에 작은 점 (r=1.0)
- covered → 초록 dim (`rgba(16,185,129,0.55)`)
- missing → 빨강 dim (`rgba(239,68,68,0.42)`)
- 적도 ellipse ratio (12/35) 에 맞춰 y 좌표 압축 → 3D 구체처럼 보임

### 3. "you are here" 라이브 인디케이터
- 부모에 `liveAlpha` state 추가, `currentOrientationRef.current.alpha` 를 5Hz 폴링
  (60Hz event 마다 setState 하면 전체 리렌더 폭주 → 200ms throttle)
- 미니맵 외곽에 흰 점 + 중앙→방향 점선 (현재 향한 방향 시각화)

### 4. 기존 shot 점은 그대로 유지
- 빨강/초록 ring 위에 더 큰 (r=1.8) 초록 점으로 overlay
- beta 도 반영해 적도 위/아래 표시

## 검증

- `npm run build` ✓
- `/capture` 번들: 9.64 kB → 9.9 kB (+0.26 kB) — 합리적
- `/capture/train` 영향 없음

## 배포

✅ Git commit + push → Vercel 자동 배포

## 임팩트

사용자가 미니맵을 보면 즉시:
- 빨간 점이 모인 방향 = "여기로 더 이동해야 함"
- 흰 점 ('you are here') 이 빨간 점들 사이에 있으면 = "지금 빈 구간을 보고 있다, 셔터 찍어!"

이전: "10/36 — 무엇을 더 해야하지?"
이후: "내가 빨간 점 5개 있는 쪽을 보고 있네 → 셔터"

→ photo 분포 균등화 → VGGT 가 모든 각도 보고 추정 → 평면 layer 줄어듦.

## Round 4–6 통합 효과

- Round 4 (배포 대기): VGGT Pointmap Branch — pointcloud 자체 품질 ↑
- Round 5 (배포됨): viewer outlier trim + monster 자가진단 — 결과 잘 보여주고 실패 인지
- Round 6 (배포됨): 미니맵 가이드 — 입력 photo 분포 개선 → 실패 자체 줄임

3단 보강: **입력(R6) → 처리(R4) → 출력(R5)** 전 파이프라인.

## 다음 라운드 후보

- Auto-capture mode (orientation 변화 10° + 정지 시 자동 셔터)
- 미니맵 클릭/탭 시 그 섹터 가이드 (예: "북동쪽 30° 방향으로 2 걸음")
- Sharpness 필터 — 흐릿한 사진 자동 제외
- VGGT-X (sparse-view splat) 통합 (worker 변경, R4 배포 후)
