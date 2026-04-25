# Round 28 — 2026-04-25 KST

## 진단

R3 부터 IndexedDB 에 capture 세션이 영속화됨 — 브라우저 닫고 돌아와도
데이터 살아 있음. 그러나 `/capture` 자체에선 이를 알리지 않음:
- 사용자가 20장 찍고 학습 페이지 안 가고 브라우저 닫음
- 다시 와서 `/capture` 열면 새로 시작해야 한다고 생각함
- IDB 에는 그 20장 그대로 남아 있는데 활용 안 됨

→ 사용자 노력 낭비.

## 개선

**`/capture` mount 시 IDB 최근 세션 자동 감지** + 이어가기 배너.

### 1. State
```ts
pastSession: { id, count, minutesAgo } | null
pastSessionDismissed: boolean
```

### 2. useEffect (mount 1회)
```ts
const sid = getLatestSessionId();
if (sid) {
  const data = await loadCaptures(sid);
  if (data?.files.length > 0) {
    const ageMin = (Date.now() - data.meta.timestamp) / 60000;
    if (ageMin <= 24 * 60) {  // 24시간 이내
      setPastSession({ id: sid, count: data.files.length, minutesAgo: ... });
    }
  }
}
```

24시간 컷 — captureStore 의 pruneOldCaptures 와 일치.

### 3. UI (카메라 시작 전 landing 영역)
```jsx
{pastSession && !pastSessionDismissed && (
  <div className="...border-accent/30 bg-accent/[0.05]...">
    📂 이전 세션 발견 · {count}장
    {minutesAgo}분 전 촬영. 학습 페이지로 이어가시겠어요?
    [이어가기]  [✕]
  </div>
)}
```

- accent 색상 테두리 — 친근, 위협적이지 않음
- [이어가기] 클릭 → /capture/train 직접 이동 (기존 IDB 세션 사용)
- [✕] dismiss → 새로 시작 의도 인정

## 검증

- `npm run build` ✓
- `/capture` 13.5 → 13.9 kB (+0.4)
- TS strict 통과
- IDB 차단 환경 try-catch 안전

## 배포

✅ Git commit + push → Vercel 자동 배포

## 시나리오

1. 사용자 /capture → 20장 촬영 → 갑자기 전화 와서 브라우저 닫음
2. 30분 후 /capture 다시 열음
3. 'Camera 시작' 버튼 위에 banner: '📂 이전 세션 발견 · 20장, 30분 전. [이어가기]'
4. 클릭 → /capture/train → 기존 20장으로 학습
5. 노력 낭비 0

(대안: ✕ 클릭 → 무시하고 새 촬영)

## 다음 라운드 후보

- VGGT 통계 확장 패널
- 토글 시 viewer 화면 전환 트랜지션
- 이전 세션 banner 에 미리보기 thumbnail 1장 (시각적 확인)
- HF Space env 활성화 도구 (R4 unblock)
