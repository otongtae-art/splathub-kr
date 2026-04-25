# Round 20 — 2026-04-25 KST

## 진단

R19 TRELLIS 폴백은 `shots[0]` (첫 사진) 을 무조건 사용. 그러나:
- TRELLIS.2 는 1장 generative AI — 입력 사진 품질이 결과 품질에 직접 영향
- shots[0] 가 흐릴 수 있음 (R7 가 통계 outlier 만 제외, shots[0] 자체는 통과)
- 사용자는 best photo 가 사용된다고 기대

→ 가장 sharp 한 shot 을 선택해야 TRELLIS 결과 품질 ↑.

## 개선

### 1. `CaptureMeta.sharpnessScores?: number[]`
- files 와 같은 순서, 같은 길이
- IndexedDB 에 저장됨

### 2. `proceedToTraining` (capture/page.tsx)
- kept array 의 sharpness 점수 추출:
  ```ts
  sharpnessScores: kept.map((s) => s.sharpness)
  ```

### 3. `tryTrellisFallback` (train/page.tsx)
- `meta.sharpnessScores` 가 있고 길이 일치하면 max 인덱스 검색
- 없으면 (구버전 호환) `shots[0]` 사용
- 콘솔: `picked shot[N] (sharpness=X of M scores)`

```ts
let bestIdx = 0, bestScore = -1;
for (let i = 0; i < scores.length; i++) {
  const s = scores[i] ?? 0;
  if (s > bestScore) { bestScore = s; bestIdx = i; }
}
photo = shots[bestIdx];
```

## 검증

- `npm run build` ✓
- `/capture/train` 11.4 → 11.5 kB (+0.1)
- TS strict 통과
- 구버전 IndexedDB 데이터 (sharpnessScores 없음) 와 호환

## 배포

✅ Git commit + push → Vercel 자동 배포

## R7 + R19 + R20 통합

| Round | 역할 |
|---|---|
| R7 | 흐림 자동 제외 (median * 0.4 outlier) |
| R19 | VGGT monster → TRELLIS 폴백 (shots[0] 사용) |
| R20 | TRELLIS 폴백이 가장 sharp 한 shot 선택 |

이제:
1. R7 가 흐림 outlier 제거
2. 남은 사진 중 가장 sharp 한 1장이 TRELLIS 입력
3. → AI generative 결과 품질 ↑

## 다음 라운드 후보

- 셔터 흰 플래시 오버레이 (시각 피드백)
- VGGT 결과 통계 시각화 (R5 stats 를 사용자에게 expose)
- HF Space env 활성화 도구 (R4 unblock)
- Capture 가 best shot index 시각화 (썸네일에 ★ 표시)
