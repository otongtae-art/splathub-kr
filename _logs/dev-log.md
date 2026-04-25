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
[2026-04-25T01:02+09:00] [round 11] [deployed] 어두움 검사 추가 — computeBrightness (64px luma 평균, ~1ms). brightness<35 시 R8 toast 가 '어두움 — 조명 부족' 메시지로 발사 (또는 '흐림+어두움'). R7 sharpness 가 못 잡는 sensor noise 차원의 입력 품질 보강 → low-light 환경 photogrammetry 실패 사전 감지. commit 28b3bd5
[2026-04-25T01:10+09:00] [round 12] [deployed] Multi-shot burst (auto-capture 만) — 빈 섹터 진입 시 3프레임 70ms 간격 캡처, sharpness 가장 높은 프레임 채택. Apple Object Capture 패턴. 250ms 추가 지연이지만 사용자가 셔터 안 누르므로 인지 X. Manual shutter 는 단일 (현재 응답성 유지). 흐림 사진 발생률 대폭 감소. commit fe8462a
[2026-04-25T01:18+09:00] [round 13] [deployed] 미니맵 추천 다음 sector 강조 — currentAlpha 기준 양방향 가장 가까운 빈 sector 1개를 풀 빨강 + 1.8r + animate-pulse 로 강조. 사용자가 어디로 이동해야 가장 효율적인지 즉시 인지 (R6 가 모든 빈 sector 동일 dim 으로 보여주던 것 → 추천 1개 강조). commit 2b67c25
[2026-04-25T01:26+09:00] [round 14] [deployed] 햅틱 피드백 + manual 셔터 burst 토글 — lib/haptics.ts (shutterHaptic 30ms / warningHaptic 더블 탭). 모든 captureShot 에 진동, 흐림/어두움 toast 시 더블탭. Manual 셔터에 '✨ 3장 burst' 토글 (auto 와 별개). Android Chrome 만 실제 동작, 그 외 silent. commit b989326
[2026-04-25T01:35+09:00] [round 15] [deployed] 환경 사전 체크 — 카메라 시작 후 1초간 brightness 5회 sample, 평균<60 시 'dim' banner ('💡 환경이 어둡습니다 (밝기 X) — 더 밝은 곳 권장'). 사용자가 20+ 사진 투자 전에 환경 개선 결정. shots>0 이면 skip (재실행 안 함), [무시] 버튼으로 dismiss. commit db0926a
[2026-04-25T01:43+09:00] [round 16] [deployed] 환경 사전 체크에 feature density 추가 — detectFeatures 5회 sample, 평균<20 면 'low_texture' issue. dim/low_texture/둘 다 분기 메시지 ('🎨 질감 부족 — 단색 벽 photogrammetry 작동 불가'). textureless 는 photogrammetry 의 본질적 실패 모드. commit 6f9da4e
[2026-04-25T01:50+09:00] [round 17] [deployed] 환경 OK ✓ 배지 (2.5초) — R15+R16 가 이전엔 silent pass 였음. 이제 명시적 '✓ 환경 OK · 밝기 X · 특징점 Y' 표시 → 사용자가 시스템이 검사했음을 인지 + 안심. commit d83ccd7
[2026-04-25T01:58+09:00] [round 18] [deployed] R7 dropped 사진 미리보기 — captureStore 가 droppedFiles[] 도 IndexedDB 에 별도 저장, train 페이지에 collapsible '<details> 흐림 N장 보기' 로 노출. 사용자가 무엇이 필터됐는지 시각적으로 확인 → 다음 촬영 개선 인사이트. commit 3cda38d
[2026-04-25T02:06+09:00] [round 19] [deployed] TRELLIS.2 monster 폴백 — VGGT 결과가 monster (R5 휴리스틱) 일 때 banner 에 '🪄 TRELLIS.2 (1장 AI)' 버튼 추가. 클릭 시 첫 사진을 generative AI 로 변환 → 세션 구제 (사용자가 60초 VGGT 낭비 후 빈 손으로 가는 대신 무언가 받음). commit 94f447b
[2026-04-25T02:14+09:00] [round 20] [deployed] Sharpness 메타 → train 전달 — capture 가 sharpnessScores[] 를 IndexedDB CaptureMeta 에 저장. R19 TRELLIS 폴백이 가장 sharp 한 shot 자동 선택 (이전엔 첫 사진 무조건). best photo 1장 → 더 좋은 AI 생성 결과. commit 4022610
[2026-04-25T02:22+09:00] [round 21] [deployed] Best shot ★ 마커 — 5장 이상 촬영 시 흐림 제외한 kept 사진 중 sharpness 최대 1장에 ★ best 배지 + emerald 테두리/glow. 사용자가 자신의 베스트 사진 즉시 인지 (R20 TRELLIS 폴백이 사용할 사진 시각화). commit eee4806
[2026-04-25T02:30+09:00] [round 22] [deployed] 셔터 사운드 (iOS 보완) — Web Audio API 로 1500Hz 50ms tick 합성. 토글 옵트인 (default OFF), AudioContext 는 토글 ON 시 user gesture 안에서 생성/unlock. R14 햅틱이 안 되는 iOS Safari 등 환경에서 셔터 인지 가능. commit a5a557d
[2026-04-25T02:38+09:00] [round 23] [deployed] 셔터 흰 플래시 오버레이 — key=Date.now() 갱신으로 div 재마운트 → 기존 animate-flash (800ms) 재실행. opacity 0.55 흰색 → 투명. R14 햅틱 + R22 사운드와 트리오 완성, 모든 환경 동작 시각 피드백. commit 9fdbd9b
[2026-04-25T02:46+09:00] [round 24] [deployed] TRELLIS 'AI 생성' 라벨 — R19 폴백이 활성화되어 viewer 가 photogrammetry 가 아닌 AI 결과를 보여줄 때, 헤더에 amber 'AI 생성' 배지 + 'TRELLIS.2 · 1장 기반 (실측 X)' 텍스트. 사용자가 결과 출처를 명확히 인지 → 신뢰성/진실성. commit 536c800
[2026-04-25T02:54+09:00] [round 25] [deployed] VGGT/TRELLIS 결과 토글 — R19 폴백이 VGGT 결과를 덮어쓰던 것을 vggtBytes/trellisBytes 별도 보관으로 변경. 헤더에 [VGGT(실측)] [TRELLIS(AI)] 토글 추가, 사용자가 두 결과 비교 가능. monster banner 는 VGGT 모드에서만 표시. commit 59dccd4
[2026-04-25T03:02+09:00] [round 26] [deployed] 다운로드 파일명 view 별 + 환경 체크 진행 indicator — 다운로드 파일명이 'splathub-vggt-{ts}.glb' / 'splathub-trellis-ai-{ts}.glb' 로 활성 view 반영. 카메라 시작 후 1초 환경 체크 동안 '환경 체크 중 · 1초만 가만히' 펄싱 점 표시 → silent wait 제거. commit cf52747
[2026-04-25T03:10+09:00] [round 27] [deploying] 다운로드 후 사용 가이드 toast — 첫 다운로드 시 bottom-center 에 '📂 다운로드 완료 · 사용 방법: gltf-viewer.donmccurdy.com 에 .glb 끌어놓기. Blender/Unity/Three.js 도 직접 import' 표시. sessionStorage 로 1세션 1회만
