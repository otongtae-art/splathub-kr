# Round 23 — 2026-04-25 KST

## 진단

R14 햅틱 + R22 사운드 — 두 셔터 피드백 채널 완성. 그러나 둘 다 옵트인이거나
환경 의존적 (iOS Safari 햅틱 X, 사운드 토글 OFF 가능). 시각 피드백은
기존 FeatureFlash (특징점 점 애니메이션) 만 있는데 박스 영역에만 표시됨.

→ 화면 전체에 짧은 흰 플래시 = 즉시 인지 가능한 보편 시각 피드백.

## 개선

**Tailwind 의 기존 `animate-flash`** (800ms ease-out, opacity 1→0) 재사용.
state ID 갱신으로 div 재마운트 → 애니메이션 재실행 패턴.

### 1. State
```ts
const [shutterFlashId, setShutterFlashId] = useState<number>(0);
```

### 2. captureShot 트리거
```ts
setShutterFlashId(Date.now()); // ID 만 갱신
```

### 3. UI
```jsx
{shutterFlashId > 0 && (
  <div
    key={shutterFlashId}                      // ← key 갱신 → 재마운트 → animate 재실행
    className="pointer-events-none absolute inset-0 animate-flash bg-white"
    style={{ opacity: 0.55 }}                 // 너무 강하지 않게
  />
)}
```

이 패턴이 깔끔한 이유:
- timeout cleanup 불필요 (CSS 애니메이션이 forwards 로 끝까지 재생)
- 빠른 연속 셔터 시 새 ID → 새 마운트 → 즉시 재시작
- React state 단 1개

## 검증

- `npm run build` ✓
- `/capture` 13.4 kB (변동 없음 — key + 기존 class 재사용)
- TS strict 통과

## 배포

✅ Git commit + push → Vercel 자동 배포

## 셔터 피드백 트리오 (R14+R22+R23 완성)

| 채널 | Round | Android | iOS Safari | Desktop |
|---|---|---|---|---|
| 🔋 햅틱 | R14 | ✓ | × | × |
| 🔊 사운드 (옵션) | R22 | ✓ | ✓ | ✓ |
| ✨ 시각 플래시 | R23 | ✓ | ✓ | ✓ |

→ 모든 환경에서 최소 하나 이상의 즉시 피드백.

## 다음 라운드 후보

- VGGT 결과 통계 시각화 (R5 stats 확장 패널)
- 환경 사전 체크 진행 indicator (1초 sample 중 표시)
- HF Space env 활성화 도구 (R4 unblock)
- TRELLIS 폴백 결과에 'AI 생성' 라벨 표시 (실측 vs 생성 구분)
