# Round 46 — 2026-04-25 KST

## 진단

R5 viewerStats 는 풍부한 정보 포함 (pointsCount, retainedCount, bboxDim,
depthSpread, flatness) 하지만 헤더에는 약식 (12k·28%) 만 표시. 사용자가
결과를 깊게 진단하려면 콘솔 (개발자 도구) 열어야 함 — 일반 사용자는 못 함.

특히 monster 의심 시 "왜?" 알고 싶어함:
- 평탄도가 정확히 얼마?
- bbox 가 0.3m 인 게 정상인가?
- 각도 36개 중 몇 개 커버됐는지?
- 흐림 자동 제외된 사진 수?

## 개선

**📊 자세히 expandable details panel** — 결과 화면 우상단 (viewer 위 absolute).

### 표시 metrics
| 항목 | 값 형식 |
|---|---|
| 원본 점 | `25,341` |
| 유지 (5-95%) | `22,807` |
| bbox max | `0.85 m` |
| bbox min (depth) | `0.13 m` |
| 평탄도 | `15.3 %` |
| 각도 커버 | `28/36 (78%)` |
| 사진 (흐림 제외) | `25 (3 drop)` |

### 해석 안내
하단에 1줄: **"평탄도 < 15% = 평면 layer 의심 (monster). 30%+ = 정상 객체."**

→ 사용자가 통계를 본 후 자가 진단 + 개선 방향 결정.

### 조건
- `viewerStats !== null` (mesh 로드 후)
- `activeView === 'vggt'` (TRELLIS 결과는 R5 휴리스틱 무관)

### UI
- `<details>` 접기/펼치기 (기본 접힘)
- summary: `📊 자세히` (작은 버튼 형태)
- 펼치면 grid 2-col font-mono 깔끔 표시
- 우상단 absolute (viewer 가리지 않게)

## 검증

- `npm run build` ✓
- `/capture/train` 14.1 → 14.4 kB (+0.3)
- TS strict 통과
- TRELLIS 모드 시 자동 숨김

## 배포

✅ Git commit + push → Vercel 자동 배포

## 사용자 시나리오

이전:
1. 결과 도착 → header 에 "12k·28%" (모바일) 만 표시
2. monster 의심 → "왜?" 모름 → 다시 촬영 또는 포기

이후:
1. 결과 도착 → header + 우상단 [📊 자세히]
2. 클릭 → 풀 metrics + 해석 ("평탄도 28% 는 정상 범위")
3. 정확한 자가 진단 후 결정

## 다음 라운드 후보

- Service worker (offline)
- 토글 트랜지션
- VGGT vs TRELLIS 결과 stats 비교 패널
- 결과 다운로드 metadata embedded JSON (.glb 옆에 .json)
