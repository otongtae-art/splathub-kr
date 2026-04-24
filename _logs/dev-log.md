# Dev Log (append-only)

각 행 포맷: `[ISO timestamp] [round N] [outcome] 1-line summary`

[2026-04-24T00:00+09:00] [final] [loop ended] 종료 조건 도달 (2026-04-22 05:30 KST 이후) — 자율 개선 루프 종료
[2026-04-21T14:45+09:00] [round 1] [deploying] Poisson mesh 서버 변환 + UX 기준 상향 (15→20, 12→36) + 카피 강화 — open3d HF Space 재빌드 중
[2026-04-21T15:55+09:00] [round 1.1] [pivot] Poisson mesh 타임아웃 (3분+) → 포기. Viewer point size 확대로 대체
[2026-04-21T15:57+09:00] [round 1.2] [deploying] MeshViewer PointsMaterial size=0.008 + DeviceMotion 가속도 누적
[2026-04-24T15:25+09:00] [round 2] [fix] 자율 루프 재활성화 (절대날짜 종료조건 제거) + VGGT anonymous fallback 추가 (쿼터 소진 대응)
