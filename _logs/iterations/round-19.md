# Round 19 — 2026-04-25 KST

## 진단

R5 monster banner 는 사용자에게 "결과가 평면적이거나 sparse" 알리고
"다시 촬영하기" 링크 제공. 하지만 사용자 입장에선:
- 60초 VGGT 호출 + 20+ 장 촬영 노력이 모두 낭비
- 다시 촬영해도 같은 환경/장비면 또 monster 가능
- "지금 당장 무언가 결과물 갖고 싶다" 는 욕구 불충족

해결: TRELLIS.2 (1장 generative AI) 폴백 옵션 제공 — 이미 찍은 사진 중
1장으로 generative 3D 생성. 실측은 아니지만 사용자에게 "결과물" 을 줌.

## 개선

### 1. State
```ts
trellisState: 'idle' | 'loading' | 'done' | 'error'
trellisError: string | null
trellisProgress: { frac: number; label: string }
```

### 2. tryTrellisFallback
- shots[0] (첫 사진) 사용
  - sharpness 정보가 train 페이지엔 없음 → 단순 첫 번째
  - future: capture → train 으로 sharpness 메타 넘기면 best 선택 가능
- callHfSpace(photo, { onProgress })
- 성공 시 setGlbBytes(result.bytes) → VGGT 결과 → TRELLIS 결과 교체
- setViewerStats(null) → R5 monster banner 도 함께 사라짐 (재측정 필요)

### 3. UI — Monster banner 에 버튼 추가
```jsx
{trellisState === 'idle' && (
  <button onClick={tryTrellisFallback}>🪄 TRELLIS.2 (1장 AI)</button>
)}
{trellisState === 'loading' && <span>{frac*100}% {label}</span>}
{trellisState === 'error' && <span title={error}>✗ TRELLIS 실패</span>}
```
- '다시 촬영하기' 링크 옆에 배치 → 두 가지 회복 경로 동시 노출

## 검증

- `npm run build` ✓
- `/capture/train` 11.2 → 11.4 kB (+0.2)
- TS strict 통과
- `callHfSpace` 는 기존 함수 재사용 — 새 의존성 없음

## 배포

✅ Git commit + push → Vercel 자동 배포

## 회복 경로 매트릭스

| 시나리오 | 사용자 액션 | 결과 |
|---|---|---|
| VGGT 결과 OK | (그대로 사용) | photogrammetry 3D |
| VGGT monster, 시간 충분 | 다시 촬영하기 → /capture | 새 photogrammetry 시도 |
| VGGT monster, 즉시 결과 원함 | 🪄 TRELLIS 클릭 | AI generative 3D (1장 기반) |

세션 구제 — 사용자 노력 낭비 ↓.

## 향후 개선

- Capture 시 sharpness 를 IndexedDB 에 저장 → train 에서 최고 sharpness shot 선택
- TRELLIS 결과를 별개 view 로 보여주고 toggle (현재는 교체)
- Burst 통합 — TRELLIS 도 3장 시도해 best 채택

## 다음 라운드 후보

- 셔터 흰 플래시 오버레이
- VGGT 결과 통계 시각화
- HF Space env 활성화 도구 (R4 unblock)
- Capture sharpness 메타 → train 으로 전달
