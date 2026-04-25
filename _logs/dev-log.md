# Dev Log (append-only)

각 행 포맷: `[ISO timestamp] [round N] [outcome] 1-line summary`

[2026-04-24T00:00+09:00] [final] [loop ended] 종료 조건 도달 (2026-04-22 05:30 KST 이후) — 자율 개선 루프 종료
[2026-04-21T14:45+09:00] [round 1] [deploying] Poisson mesh 서버 변환 + UX 기준 상향 (15→20, 12→36) + 카피 강화 — open3d HF Space 재빌드 중
[2026-04-21T15:55+09:00] [round 1.1] [pivot] Poisson mesh 타임아웃 (3분+) → 포기. Viewer point size 확대로 대체
[2026-04-21T15:57+09:00] [round 1.2] [deploying] MeshViewer PointsMaterial size=0.008 + DeviceMotion 가속도 누적
[2026-04-24T15:25+09:00] [round 2] [fix] 자율 루프 재활성화 (절대날짜 종료조건 제거) + VGGT anonymous fallback 추가 (쿼터 소진 대응)
[2026-04-24T16:05+09:00] [round 3] [deployed] 클라이언트 이미지 리사이즈 (max 800px) — VGGT 업로드 ~10× 감소 (15MB→1.5MB), ZeroGPU 시간 절약 — commit c2f31be
[2026-04-25T00:00+09:00] [round 3.5] [deployed] OG 동적 이미지 + 메타 강화 + 홈 hero 재정립 — commit 5654b59
[2026-04-25T00:01+09:00] [round 4] [git-only] VGGT prediction_mode "Pointmap Branch" + conf_thres 50→3 — '평면 layer monster' 의 직접 원인 (Depthmap unprojection × noisy 핸드헬드 포즈) 제거. env override 가능. **HF Space 수동 재배포 필요** (Vercel HF_TOKEN 이 read-only 라 push 실패)
[2026-04-25T00:09+09:00] [round 5] [deployed] Viewer outlier trim (5–95% percentile) + auto-fit on trimmed bbox + monster 진단 배너 (flatness<15% or pts<5k → '다시 찍기' CTA). round 4 와 직교적. commit c20f551 → Vercel 자동배포 ✓ (/capture/train 200)
[2026-04-25T00:18+09:00] [round 6] [deployed] 미니맵 enhancement — 36섹터 ring (covered=초록, missing=빨강 dim) + 'you are here' live alpha 화살표 (5Hz 폴링). 사용자가 어느 방향이 빈지 즉시 인지 → 무작위 회전 대신 빈 섹터로 이동 → photo 분포 균등화 → monster 발생률 ↓. commit 6cb4735 → Vercel rollout
