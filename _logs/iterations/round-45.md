# Round 45 — 2026-04-25 KST

## 진단

R44 가 🚀 hands-free 프리셋 추가 — 그러나 첫 방문자에겐 그냥 또 하나의
버튼으로 보임. "이게 추천 옵션이다" 라는 신호 없음.

UI 친밀한 개발자/파워유저는 발견하지만, 일반 사용자는 4-5개 토글/버튼
중에 어느 게 권장인지 학습하기 전에 manual 사용 → R9-R34 가치 미실현.

## 개선

**첫 방문자에게 ✨ 추천 배지 + pulse glow** — localStorage 영구 추적.

### 1. State + detection
```ts
const [isFirstVisit, setIsFirstVisit] = useState(false);

useEffect(() => {
  const seen = localStorage.getItem('splathub:capture-seen');
  if (!seen) setIsFirstVisit(true);
}, []);
```

### 2. R44 버튼에 조건부 강조
```jsx
<button
  className={
    isFirstVisit
      ? 'animate-pulse border-accent ... shadow-[0_0_12px_rgba(16,185,129,0.4)]'
      : 'border-accent/40 ...'
  }
>
  {isFirstVisit && (
    <span className="rounded bg-accent/30 px-1 ... ✨ 추천</span>
  )}
  🚀 hands-free 모드 ...
</button>
```

### 3. Dismiss 트리거
- R44 hands-free 버튼 클릭 → mark seen
- 첫 captureShot 호출 → mark seen (manual 사용자도)

```ts
if (isFirstVisit) {
  setIsFirstVisit(false);
  localStorage.setItem('splathub:capture-seen', '1');
}
```

→ 한 번 사용한 사용자는 다시 안 봄.

## 검증

- `npm run build` ✓
- `/capture` 15.2 → 15.4 kB (+0.2)
- TS strict 통과
- localStorage 차단 환경 try-catch 안전

## 배포

✅ Git commit + push → Vercel 자동 배포

## 사용자 시나리오

이전 (R44):
1. 카메라 시작
2. 4개 버튼 (🚀 + 3 토글) 중 어느 거 누를지 학습
3. 상당 비율이 manual 로 시작 → R9-R34 가치 못 받음

이후 (R45):
1. 카메라 시작
2. 🚀 버튼만 ✨ + pulse + glow → "여기 누르세요" 시각 유도
3. 클릭 → hands-free 즉시 활성화
4. 다음 세션엔 배지 안 뜸 (이미 학습됨)

## 다음 라운드 후보

- VGGT 통계 확장 패널
- Service worker (offline)
- 토글 트랜지션
- '⚡ 빠른 모드' 프리셋 (manual + 즉시 응답성, hands-free 의 반대)
