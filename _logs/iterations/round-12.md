# Round 12 — 2026-04-25 KST

## 진단

R7 (sharpness 학습 시 자동 제외) + R10 (motion gate) + R11 (어두움 toast)
까지 입력 품질 안전망 강화했지만, 핸드헬드는 여전히 흐림 발생.

Apple Object Capture / Polycam 의 패턴: **셔터 1번 → 3 프레임 burst →
가장 sharp 한 1장 채택**. 같은 순간의 미세하게 다른 3장 중 가장 좋은
것을 자동 선택해 사용자에게 부담 없이 품질 향상.

## 개선

### 1. `captureShot` 시그니처 확장
```ts
captureShot(opts: { burst?: boolean } = {})
```
- burst=true: 3 프레임 70ms 간격, sharpness 최대 채택
- burst=false: 단일 프레임 (manual shutter 응답성 유지)

### 2. 헬퍼 `captureOneFrame`
- full-res canvas + 박스 영역 thumb 동시 생성
- closure 안에 vw/vh/cropX/cropY 캡처

### 3. burst 루프
```ts
for (let i = 0; i < FRAME_COUNT; i++) {
  if (i > 0) await new Promise(r => setTimeout(r, FRAME_INTERVAL));
  const frame = captureOneFrame();
  const s = computeSharpness(frame.thumb);
  if (s > bestSharpness) { bestSharpness = s; bestFrame = frame; }
}
```

### 4. 채택 프레임으로 후속 처리
- features = detectFeatures(bestFrame.thumb)
- sharpness = bestSharpness (이미 계산됨)
- brightness = computeBrightness(bestFrame.thumb)
- blob = bestFrame.full.toBlob('image/jpeg', 0.92)

### 5. Auto-capture 만 burst 활성화
```ts
void captureShot({ burst: true });  // round 12 변경
```
Manual shutter 는 그대로 단일 (응답성).

### 6. UI 변경
- 토글 라벨: "🎬 자동 촬영 — 빈 섹터 진입 시 3장 burst (sharp 1장 채택)"
- Manual onClick 버그 수정: `onClick={captureShot}` → `onClick={() => captureShot()}`
  (원래 click event 가 첫 인자로 전달되던 문제)

## 검증

- `npm run build` ✓
- `/capture` 11.5 → 11.7 kB (+0.2)
- TS strict 통과
- 70ms × 3 = 210ms + 처리 ≈ 250ms 추가 latency (auto 만)

## 배포

✅ Git commit + push → Vercel 자동 배포

## R7-R12 입력 품질 누적 효과

| Round | 시점 | 메커니즘 |
|---|---|---|
| R7 | 학습 시 | 통계적 outlier 자동 제외 (median*0.4) |
| R8 | 촬영 직후 | 흐림 toast (sharpness<50) |
| R10 | 촬영 직전 | motion gate (auto-capture 흔들림 방지) |
| R11 | 촬영 직후 | 어두움 toast (brightness<35) |
| R12 | 촬영 시점 | burst 3장 → sharp 1장 (Apple 패턴) |

각 단계가 흐림/저품질 입력을 점진적으로 차단/개선.

## 다음 라운드 후보

- 햅틱 진동 (Vibration API) — 자동 셔터 발사 시 진동
- 미니맵에 '추천 다음 위치' 화살표 (현재 위치에서 가장 가까운 빈 sector 방향)
- 결과 페이지에 R7 dropped 사진 미리보기 (디버깅 / 사용자 학습)
- Manual 셔터에도 burst 옵션 토글 (사용자 선택)
- HF Space env 활성화 도구 (R4 unblock)
