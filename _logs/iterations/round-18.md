# Round 18 — 2026-04-25 KST

## 진단

R7 sharpness 필터가 흐림 사진을 학습 시점에 자동 제외 (count 만 표시).
하지만 사용자는 어떤 사진이 잘렸는지 모름:
- 정말 흐린 사진이었는지 검증 불가
- 다음 촬영 시 무엇을 개선해야 할지 모름

→ 투명성 부족. 자동 알고리즘이 사용자 사진을 "잘랐다" 는데 보여주지 않음.

## 개선

**Dropped 사진을 IndexedDB 에 별도 저장 + train 페이지 collapsible 미리보기**

### 1. `captureStore.ts`
- `CaptureRecord.droppedFiles?: File[]` 추가
- `saveCaptures(files, meta, droppedFiles?)` 새 optional 파라미터
- `loadCaptures` 가 `droppedFiles?` 도 함께 반환

### 2. `capture/page.tsx` proceedToTraining
- 기존: dropped 카운트만 meta 에 저장
- 변경: dropped Blob → File 변환 후 saveCaptures 의 3번째 인자로 전달

### 3. `capture/train/page.tsx`
- 새 state: `droppedShots: File[] | null`
- IndexedDB 로드 시 함께 로드
- ready 단계 메인 영역에 collapsible:
```jsx
<details>
  <summary>🌀 흐림 자동 제외 N장 보기</summary>
  <div className="grid grid-cols-5 sm:grid-cols-8 gap-1">
    {droppedShots.map(f => <img src={URL.createObjectURL(f)} ... />)}
  </div>
  <p className="text-[10px]">
    sharpness 낮은 사진은 VGGT 카메라 포즈 추정 방해 → 자동 제외.
    안정된 손으로 다시 찍으면 다음엔 모두 활용됨.
  </p>
</details>
```

기본 collapsed → 사용자 호기심 시 펼쳐 봄.

## 검증

- `npm run build` ✓
- `/capture` 12.9 kB (변동 없음 — capture 측 변화는 사소한 file array)
- `/capture/train` 10.9 → 11.2 kB (+0.3, details + grid)
- TS strict 통과
- IndexedDB 추가 저장 비용: dropped 평균 ~3-5장 × 0.5MB = ~3MB (무시 가능)

## 배포

✅ Git commit + push → Vercel 자동 배포

## R7 + R18 효과

| 단계 | R7 (이전) | R18 (현재) |
|---|---|---|
| 흐림 카운트 | meta.droppedBlurry 숫자 | 동일 + collapsible 미리보기 |
| Transparency | low (숫자만) | high (사진 직접 확인 가능) |
| 학습 가치 | 알고리즘 동작 불명 | 사용자가 흐림 패턴 학습 → 다음 촬영 개선 |

## 다음 라운드 후보

- 셔터 흰 플래시 오버레이 (시각 피드백)
- 결과 monster 시 TRELLIS.2 (1장 AI) 폴백 옵션 — 세션 구제
- VGGT 결과 별 sharpness/feature 통계 시각화
- HF Space env 활성화 도구 (R4 unblock)
