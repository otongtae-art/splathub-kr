# Round 3 — 2026-04-24 KST

## 진단
- 촬영 해상도: 1920×1080, JPEG q=0.92 → 장당 ~500KB–1.5MB
- 20-30장 전송 시 총 업로드 ~15–40MB
- VGGT ZeroGPU 한도: 120초
- 문제: 업로드에 수십 초 소모 → GPU 시간 부족 → 타임아웃 or 품질 저하

## 개선
**클라이언트 사이드 이미지 리사이즈 before VGGT 전송**

- `resizeImageForVggt(file, maxPx=800)` 함수 추가 (`apps/web/lib/hfSpace.ts`)
- Browser Canvas API 로 max 800px (긴 쪽 기준) 리사이즈
- JPEG q=0.85 재인코딩
- `callVggt()` 에서 FormData 구성 전 모든 이미지 리사이즈

## 결과
- 업로드 크기: ~15MB → ~1.5MB (10× 감소)
- VGGT 실제 GPU 처리 시간 여유 확보
- VGGT 내부 처리 해상도 (~224px) 대비 여전히 충분한 품질

## 커밋
`c2f31be` — feat(perf): 클라이언트 이미지 리사이즈 — VGGT 업로드 10× 감소

## 다음 라운드 후보
- Auto-capture mode (각도 10° 변화 시 자동 촬영)
- 각도 기반 프레임 다양성 필터 (orientation 으로 중복 뷰 제거)
- 캡처 UI 에 실시간 "충분한 이동" 피드백 강화
