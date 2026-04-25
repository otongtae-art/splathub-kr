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
[2026-04-25T00:28+09:00] [round 7] [deployed] Sharpness 필터 — Laplacian variance (lib/sharpness.ts) 로 각 shot 선명도 측정, median*0.4 미만+abs<30 이면 흐림 판정. 썸네일 빨간 테두리+'흐림' 배지, VGGT 호출 전 자동 제외 (한도 30%), train 페이지에 '흐림 N장 자동 제외' 표시. 입력 노이즈 제거 → VGGT 포즈 추정 안정화. commit d0183f6 → Vercel rollout
[2026-04-25T00:38+09:00] [round 8] [deployed] 즉시 흐림 경고 toast — sharpness<50 (절대 임계값) 이면 captureShot 직후 화면 상단에 3.5초 동안 '흐림 감지 · 자동 제외 가능성 높음 [지우기]' 표시. 사용자가 다음 사진 찍기 전에 인지/재촬영 결정. round 7 의 reactive 필터를 proactive UX 로 보강. commit 1ed3a94
[2026-04-25T00:46+09:00] [round 9] [deployed] Auto-capture mode (모바일 자이로) — 토글 ON 시 빈 섹터 진입할 때마다 자동 셔터 (800ms debounce). 셔터 버튼 emerald glow + pulse. 사용자는 물체 주변 걷기만 하면 됨 → 균등 분포 + UX 친화. R6 sector guidance + R7 sharpness + R8 toast 와 결합 — 입력 파이프라인 최종 자동화. commit 979cad2
[2026-04-25T00:54+09:00] [round 10] [deployed] Auto-capture motion gate — DeviceMotion EWMA (α=0.25, ~200ms 윈도우) > 0.4 m/s² 면 셔터 보류, '📷 카메라 안정 대기 중' 표시. R9 가 흔들리는 도중 발사하던 상황 방지 → motion blur 사진 발생률 ↓. R7 보다 앞단에서 차단. commit d3a0934
[2026-04-25T01:02+09:00] [round 11] [deploying] 어두움 검사 추가 — computeBrightness (64px luma 평균, ~1ms). brightness<35 시 R8 toast 가 '어두움 — 조명 부족' 메시지로 발사 (또는 '흐림+어두움'). R7 sharpness 가 못 잡는 sensor noise 차원의 입력 품질 보강 → low-light 환경 photogrammetry 실패 사전 감지
