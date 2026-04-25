# 자율 개선 루프 현황

**Start**: 2026-04-21 (KST)
**Round**: 48 (worker only)
**Current deployed commit**: a4c4f3b (R46 까지 frontend 배포) / `04a763b @ HF Space` (backend R4+R47+R48 대기)

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

## 🎯 Round 17 구현된 것 (Vercel 자동배포)
18. **환경 OK ✓ 배지** (`apps/web/app/capture/page.tsx`)
    - R15+R16 가 issues 없을 때 silent pass 였음 → 명시적 피드백 추가
    - "✓ 환경 OK · 밝기 X · 특징점 Y" 2.5초 표시
    - **사용자가 시스템이 검사했음을 인지 → 신뢰성 ↑**

## 🎯 Round 18 구현된 것 (Vercel 자동배포)
19. **Dropped 사진 미리보기** (`apps/web/lib/captureStore.ts`, `app/capture/train/page.tsx`)
    - droppedFiles[] 를 IndexedDB 에 별도 저장
    - train 페이지에 collapsible "<details> 🌀 흐림 N장 보기" 추가
    - **사용자가 무엇이 필터됐는지 직접 확인 → 다음 촬영 개선 인사이트**

## 🎯 Round 19 구현된 것 (Vercel 자동배포)
20. **TRELLIS.2 monster 폴백** (`apps/web/app/capture/train/page.tsx`)
    - VGGT 결과가 monster (R5 휴리스틱) 시 banner 에 '🪄 TRELLIS.2 (1장 AI)' 버튼
    - 클릭 → callHfSpace(shots[0]) → glbBytes 교체 → viewer 에 AI 결과 표시
    - **세션 구제 — 60초 VGGT 낭비 후 빈 손 → AI generative 3D 결과**

## 🎯 Round 20 구현된 것 (Vercel 자동배포)
21. **Sharpness 메타 → train 전달** (`apps/web/lib/captureStore.ts`, `app/capture/page.tsx`, `app/capture/train/page.tsx`)
    - `CaptureMeta.sharpnessScores?: number[]` 추가
    - capture 가 kept files 의 sharpness 점수 IndexedDB 에 저장
    - train R19 TRELLIS 폴백이 가장 sharp 한 shot 자동 선택
    - **R19 가 첫 사진(아무거나) → 가장 sharp 한 1장으로 → AI 결과 품질 ↑**

## 🎯 Round 21 구현된 것 (Vercel 자동배포)
22. **Best shot ★ 마커** (`apps/web/app/capture/page.tsx`)
    - 5장 이상 시 흐림 제외한 kept 사진 중 sharpness 최대 1장에 ★ best 배지
    - emerald 테두리 + glow shadow + tooltip ("최고 sharp · 점수")
    - **사용자가 자신의 best/worst 사진 즉시 인지 + R20 TRELLIS 폴백 사용 사진 미리 시각화**

## 🎯 Round 22 구현된 것 (Vercel 자동배포)
23. **셔터 사운드 (iOS 보완)** (`apps/web/lib/haptics.ts`, `app/capture/page.tsx`)
    - Web Audio API 1500Hz 50ms tick (모든 브라우저 동작, iOS 포함)
    - 토글 ON 시 user gesture 안에서 AudioContext unlock
    - default OFF (opt-in)
    - **R14 햅틱이 안 되는 iOS Safari 환경에서 셔터 인지 가능**

## 🎯 Round 23 구현된 것 (Vercel 자동배포)
24. **셔터 흰 플래시 오버레이** (`apps/web/app/capture/page.tsx`)
    - 기존 `animate-flash` Tailwind keyframe 재사용
    - key prop=Date.now() 갱신 → div 재마운트 → 애니메이션 재실행
    - opacity 0.55 흰색 → 투명 (800ms ease-out)
    - **R14 햅틱 + R22 사운드 + R23 시각 = 셔터 피드백 트리오 완성 (모든 환경 최소 1채널)**

## 🎯 Round 24 구현된 것 (Vercel 자동배포)
25. **TRELLIS 'AI 생성' 라벨** (`apps/web/app/capture/train/page.tsx`)
    - R19 폴백 활성화 시 헤더에 amber 'AI 생성' 배지 + 'TRELLIS.2 · 1장 기반 (실측 X)'
    - 기본 (VGGT): 'VGGT · photogrammetry · {N}장' + viewer stats
    - **결과 출처 명확 — 사용자가 photogrammetry vs AI 생성 혼동 방지**

## 🎯 Round 25 구현된 것 (Vercel 자동배포)
26. **VGGT/TRELLIS 결과 토글** (`apps/web/app/capture/train/page.tsx`)
    - vggtBytes/trellisBytes 별도 보관, activeView 'vggt' | 'trellis'
    - 헤더에 [VGGT(실측)] [TRELLIS(AI)] 토글 (둘 다 있을 때)
    - monster banner 는 VGGT 모드에서만
    - **R19 가 데이터 덮어쓰던 것 → 두 결과 비교 가능**

## 🎯 Round 26 구현된 것 (Vercel 자동배포)
27. **다운로드 파일명 view 별 + 환경 체크 진행 indicator** (`apps/web/app/capture/train/page.tsx`, `apps/web/app/capture/page.tsx`)
    - 다운로드 파일명: `splathub-vggt-{ts}.glb` / `splathub-trellis-ai-{ts}.glb`
    - 카메라 시작 후 1초 환경 체크 동안 "환경 체크 중 · 1초만 가만히" 펄싱 점
    - **R25 토글 + R15-R17 환경 체크 두 feature 모두 사이클 완성**

## 🎯 Round 27 구현된 것 (Vercel 자동배포)
28. **다운로드 후 사용 가이드 toast** (`apps/web/app/capture/train/page.tsx`)
    - 첫 다운로드 시 viewer 위 bottom-center 에 toast: "📂 다운로드 완료 · gltf-viewer.donmccurdy.com 에 .glb 끌어 놓기"
    - sessionStorage 로 1세션 1회만 (반복 spam 방지)
    - dismissible (✕)
    - **사용자 'now what?' 의문 해결 — 다운로드 → 활용 안내**

## 🎯 Round 28 구현된 것 (Vercel 자동배포)
29. **이전 세션 이어가기 banner** (`apps/web/app/capture/page.tsx`)
    - mount 시 IDB 24h 내 세션 자동 감지
    - 카메라 시작 전 화면에 "📂 이전 세션 발견 · N장 / X분 전. [이어가기]" 배너
    - dismissible (✕)
    - **브라우저 닫고 돌아온 사용자 노력 낭비 방지**

## 🎯 Round 29 구현된 것 (Vercel 자동배포)
30. **이전 세션 banner thumbnail** (`apps/web/app/capture/page.tsx`)
    - R28 banner 에 첫 사진 48×48 thumbnail 추가
    - URL.createObjectURL + cleanup
    - **사용자가 어떤 세션인지 시각적 즉시 인지**

## 🎯 Round 30 구현된 것 (도구 추가, Vercel 영향 없음)
31. **R4 활성화 도구** (`worker/hf-space/deploy.ps1`, `ACTIVATE-R4.md`)
    - PowerShell 스크립트: 토큰 secure prompt + 자동 huggingface_hub 설치 + 색상 출력
    - `ACTIVATE-R4.md`: 왜 / 어떻게 / 빠른 우회 (env 변수만) / 토큰 발급 가이드
    - **자율 루프가 못 했던 R4 활성화 경로 사용자에게 명확 제공**
    - R4 풀리면 R1-R29 노력 효과 2배+

## 🎯 Round 31 구현된 것 (Vercel 자동배포)
32. **홈페이지 사이드바 샘플 결과 링크** (`apps/web/app/page.tsx`)
    - '내 모델' 0개일 때 '예시 결과 보기 →' 버튼 + 보조 설명
    - `/m/sample-butterfly` 직링크
    - **새 방문자가 capture 시작 전 expectation 형성 → 클릭 의도 ↑**

## 🎯 Round 32 구현된 것 (Vercel 자동배포)
33. **VGGT 실패 에러 분류 + TRELLIS 폴백** (`apps/web/app/capture/train/page.tsx`)
    - `classifyVggtError()`: quota/timeout/OOM/network/aborted 5종 분류
    - 각 분류마다 actionable advice 표시 (제목 + 해결 방법)
    - VGGT 완전 실패 케이스에도 TRELLIS 폴백 버튼 (R19 monster 와 통합)
    - **거의 모든 실패 경로에서 사용자 결과물 1개 이상 받을 수 있음**

## 🎯 Round 33 구현된 것 (Vercel 자동배포)
34. **Mobile-friendly viewer stats** (`apps/web/app/capture/train/page.tsx`)
    - `hidden sm:inline` 으로 mobile 에서 안 보이던 viewer 통계 약식 표시
    - mobile: '12k·28%' / desktop: '12,547pts · 평탄도 28%'
    - tooltip 에 정확 수치 + 의미 설명
    - **모바일 (capture 주 채널) 사용자도 결과 품질 즉시 인지**

## 🎯 Round 34 구현된 것 (Vercel 자동배포)
35. **자동 학습 이동 옵션** (`apps/web/app/capture/page.tsx`)
    - 토글 ON 시 30장 도달 → 5초 countdown banner + 취소 버튼
    - countdown=0 → proceedToTraining() 자동 호출
    - 1회성 트리거 (한 번 발사 후 토글 자동 OFF)
    - **R9 auto-capture + R34 = 진정한 hands-free (시작 토글 + 걷기 만)**

## 🎯 Round 35 구현된 것 (Vercel 자동배포)
36. **MeshViewer ErrorBoundary** (`apps/web/components/ErrorBoundary.tsx` 신규, `app/capture/train/page.tsx`)
    - Generic React class component (getDerivedStateFromError + componentDidCatch)
    - train 페이지 viewer 감싸 Three.js/WebGL 크래시 시 white-screen 방지
    - Fallback: "3D 뷰어 오류 / Chrome 134+ 권장 / [.glb 다운로드만] [새로고침]"
    - **사용자가 뷰어 못 봐도 결과 잃지 않게**

## 🎯 Round 36 구현된 것 (Vercel 자동배포)
37. **ErrorBoundary 모든 viewer 사이트 적용** (`apps/web/app/page.tsx`, `app/m/[slug]/page.tsx`, `app/convert/page.tsx`)
    - R35 패턴을 home + sample 모델 + convert 결과 viewer 모두 wrap
    - 일관된 fallback UI ("3D 뷰어 오류 / Chrome 134+ 권장")
    - **4개 viewer 모두 보호 — 어디서 WebGL crash 해도 white screen 안 남**

## 🎯 Round 37 구현된 것 (Vercel 자동배포)
38. **App-level error.tsx + R34 countdown 햅틱** (`apps/web/app/error.tsx` 신규, `app/capture/page.tsx`)
    - Next.js App Router 라우트 boundary 추가 (R35-R36 컴포넌트 boundary 와 직교적)
    - GlobalError component: '⚠ 문제 발생 / [다시 시도] [홈으로]' + digest ID
    - R34 countdown 시작 시 warningHaptic() — 화면 안 보고 있어도 인지
    - **모든 종류의 에러에 actionable fallback (white screen 0)**

## 🎯 Round 38 구현된 것 (Vercel 자동배포)
39. **PWA manifest** (`apps/web/app/manifest.ts` 신규)
    - Next.js 14 라우트 핸들러로 `/manifest.webmanifest` 자동 노출
    - standalone display + portrait + start_url=/capture
    - shortcuts: [촬영 시작] [예시 모델]
    - icons: icon.svg + favicon.ico + apple-icon
    - **모바일 사용자가 홈 화면에 추가 → 풀스크린 native 앱 같은 capture 경험**

## 🎯 Round 39 구현된 것 (Vercel 자동배포)
40. **PWA install prompt UI** (`apps/web/lib/usePWAInstall.ts` 신규, `app/capture/train/page.tsx`)
    - usePWAInstall hook (beforeinstallprompt 가로채기 + sessionStorage dismiss + iOS 감지 + appinstalled 추적)
    - train 페이지 result view 에 '📱 홈 화면에 추가 [추가][✕]' 안내
    - R27 다운로드 가이드 toast 와 같은 위치 stack (조건부 결합)
    - **PWA 채택률 ↑ — 사용자 성공 모멘트에 install 명시적 노출**

## 🎯 Round 40 구현된 것 (Vercel 자동배포)
41. **iOS PWA 안내** (`apps/web/app/capture/train/page.tsx`)
    - R39 hook 의 isIOS 활용
    - iOS Safari 사용자에게 'iPhone — Safari ⎋ 공유 → 홈 화면에 추가' 별도 안내
    - R39 (Android prompt) + R40 (iOS 수동) = PWA 설치 cross-platform 완성

## 🎯 Round 41 구현된 것 (Vercel 자동배포)
42. **카메라 권한 거부 actionable 복구** (`apps/web/app/capture/page.tsx`)
    - 5종 에러 분류 (NotAllowed/NotFound/NotReadable/Overconstrained/그 외)
    - 브라우저별 (iOS/Firefox/일반) 복구 안내 — 자물쇠/카메라 아이콘/설정 앱
    - whitespace-pre-line 줄바꿈 보존, [다시 시도] + [페이지 새로고침] 버튼
    - **사용자 회복 경로 명확 — 권한 거부 후 포기 ↓**

## 🎯 Round 42 구현된 것 — BUG FIX (Vercel 자동배포)
43. **iOS 13+ DeviceMotion/Orientation 권한 요청** (`apps/web/app/capture/page.tsx`)
    - `startCamera()` 안에서 `requestPermission()` 명시 호출 (user gesture)
    - 이전: silent 무시되어 R6/R9/R10/R13/R34 모두 iOS Safari 에서 비활성
    - 이후: iOS prompt → 허용 → 모든 자동화 기능 작동
    - **iPhone 사용자 (capture 주 채널) 의 큰 UX 손실 회복**

## 🎯 Round 43 구현된 것 (Vercel 자동배포)
44. **iOS 자이로 권한 거부 안내** (`apps/web/app/capture/page.tsx`)
    - motionPermission 4-state (unknown/granted/denied/unsupported) 추적
    - denied 시 카메라 화면 우상단 banner: "📐 자이로 권한 거부됨 — 자동 촬영/미니맵/자동 학습 비활성. iOS 설정 → Safari → 동작과 방향 → 허용"
    - 기존 PC 모드 칩과 mutex (중복 안내 방지)
    - **R42 거부 케이스에 명시 회복 안내 — 사용자 혼란 ↓**

## 🎯 Round 44 구현된 것 (Vercel 자동배포)
45. **🚀 hands-free 모드 프리셋** (`apps/web/app/capture/page.tsx`)
    - 자동 촬영 토글 위에 1-클릭 프리셋 버튼
    - 자동 촬영(R9) + 사운드(R22) + 자동 학습(R34) 3개를 한 번에 ON
    - 셋 다 켜져 있으면 버튼 숨김
    - user gesture 안에서 enableShutterSound() 호출 (iOS unlock)
    - **3 클릭 → 1 클릭, 학습 비용 ↓, hands-free 채택률 ↑**

## 🎯 Round 45 구현된 것 (Vercel 자동배포)
46. **첫 방문자 ✨ 추천 배지** (`apps/web/app/capture/page.tsx`)
    - localStorage 'splathub:capture-seen' 안 있으면 R44 hands-free 버튼에 pulse + glow + '✨ 추천' 배지
    - 클릭 또는 첫 captureShot 시 영구 dismiss
    - **첫 방문자가 hands-free 모드 발견률 ↑ → R9-R34 자동화 가치 실현**

## 🎯 Round 46 구현된 것 (Vercel 자동배포)
47. **VGGT 통계 확장 패널 (📊 자세히)** (`apps/web/app/capture/train/page.tsx`)
    - 결과 화면 우상단 details element
    - 풀 metrics: 원본/유지 점, bbox max/min, 평탄도%, 각도 커버, 흐림 제외 수
    - 해석 안내: '평탄도 < 15% = monster 의심, 30%+ = 정상'
    - **사용자 자가 진단 + 개선 방향 결정 가능**

## 🎯 Round 47 구현된 것 (worker only, HF Space 수동 deploy 대기)
48. **/api/vggt per-request prediction_mode 오버라이드** (`worker/hf-space/app.py`)
    - Form 파라미터 `prediction_mode`, `conf_thres` 추가
    - 우선순위: 인자 > env > 기본 (Pointmap Branch / 3)
    - **R4 backend 기능을 env 변수 설정 없이 per-request 활성화 가능**
    - 다음 deploy.ps1 실행 시 R4 + R47 동시 활성화

## 🎯 Round 48 구현된 것 (worker only, HF Space 수동 deploy 대기)
49. **/api/config 엔드포인트 추가** (`worker/hf-space/app.py`)
    - vggt_prediction_mode, vggt_conf_thres, r4_pointmap_active, env_overrides, supports_per_request_override
    - Frontend 가 R4 활성화 + R47 활성화 자가 검증 가능
    - **사용자에게 'Pointmap 모드 (실측 향상)' 배지 표시 등 후속 라운드 기반**

## 📋 Round 49 예정
- [ ] Worker timeout/retry
- [ ] Frontend callConfig() (R47/R48 배포 후)
- [ ] Service worker

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
