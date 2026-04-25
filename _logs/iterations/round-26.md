# Round 26 — 2026-04-25 KST

## 진단

R25 토글 추가했지만 다운로드 파일명은 여전히 `splathub-3d-{ts}.glb` —
사용자가 VGGT 와 TRELLIS 둘 다 다운로드하면 어느 것이 어느 것인지 구분 불가.

R15-R16 환경 체크는 카메라 시작 후 1초간 silent sample → 사용자는
"왜 아직 아무 일도 안 일어나지?" 헷갈림. 1초가 짧지만 첫 인상에는 어색.

## 개선

### 1. 다운로드 파일명 view 별 (R25 완성)
```ts
const prefix = activeView === 'trellis'
  ? 'splathub-trellis-ai'
  : 'splathub-vggt';
a.download = `${prefix}-${Date.now()}.glb`;
```

이제 사용자 다운로드 폴더에:
- `splathub-vggt-1709876543.glb` (실측)
- `splathub-trellis-ai-1709876789.glb` (AI 생성)

→ 파일 정리 / 비교 / 공유 시 출처 명확.

### 2. 환경 체크 진행 indicator (R15-R17 완성)
```jsx
{envCheck?.state === 'pending' && shots.length === 0 && (
  <div className="...top-20 absolute...">
    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
    <span>환경 체크 중 · 1초만 가만히</span>
  </div>
)}
```

UX 사이클 완성:
- 카메라 시작 → 즉시 "환경 체크 중" (1초)
- → ✓ "환경 OK" (2.5초) 또는 ⚠ banner
- → 사용자가 첫 셔터

silent wait → 명시적 progress.

## 검증

- `npm run build` ✓
- `/capture` 13.4 → 13.5 kB (+0.1)
- `/capture/train` 11.8 kB (변동 없음)
- TS strict 통과

## 배포

✅ Git commit + push → Vercel 자동 배포

## R15-R17 + R26 환경 체크 매트릭스 (완성)

| 단계 | 표시 | 시간 |
|---|---|---|
| 카메라 시작 직후 | "환경 체크 중 · 1초만 가만히" 펄싱 | ~1초 (R26) |
| 환경 OK | "✓ 환경 OK · 밝기 X · 특징점 Y" | 2.5초 (R17) |
| dim/textureless | banner + [무시] | 사용자 dismiss 까지 (R15+R16) |

## 다음 라운드 후보

- VGGT 통계 확장 패널 (debug/power user)
- 결과 페이지 사용 가이드 (downloaded GLB 어디서 열기)
- HF Space env 활성화 도구 (R4 unblock)
- 토글 시 화면 전환 트랜지션
