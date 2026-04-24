# Round 1 — 2026-04-21 KST 초기 진단 기반 대형 리팩토링

## 에이전트 결론 (4개 중 3개)

### Agent A: VGGT 자체 정상
- 실제 데이터셋 테스트: 725k points, Z/X=1.05 (정상 volumetric)
- 우리 코드에 버그 없음
- 근본 원인: 사용자가 카메라를 **이동시키지 않음** (회전만)

### Agent B: VGGT-X 발견 (2025-09)
- https://github.com/Linketic/VGGT-X
- VGGT 의 평면/flat output 문제를 정확히 해결
- AnySplat: 원샷 image→splat
- 결론: browser-only 는 ceiling 있음. 근본적으로 서버 reconstruction 필요.

### Agent C: UX 기준 미달
- 15장 → 24장 이상 (Polycam 최소 20, Apple 20-30)
- 12섹터(30°) → 36섹터(10°) — 24° 이상은 실패 구간
- Auto-capture + AR 지면 원형이 표준
- Top-5 변경 제안

## Round 1 작업 리스트 (우선순위)

P0 (즉시):
- [ ] 최소 사진 15장 → 24장
- [ ] 섹터 12 → 36 (10° 간격)
- [ ] 메인 복사: "객체 들지 말고, 돌리지 말고, 주변을 걸어라"
- [ ] Translation 검증 — alpha range 만으로 부족, 새 체크 추가
- [ ] 카메라 실제 이동 여부 안내 배너

P1 (이번 세션):
- [ ] Auto-capture 모드 (alpha delta 10° 바뀌면 자동 촬영)
- [ ] Feature parallax 감지 (rotate vs translate 구분)

P2 (다음 라운드):
- [ ] VGGT-X HF Space 배포
- [ ] AR 지면 링 (WebXR or three.js)
