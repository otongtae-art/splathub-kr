# Round 13 — 2026-04-25 KST

## 진단

R6 (sector ring) 은 모든 빈 sector 를 동일한 dim 빨강으로 표시 → 사용자가
"여기 빈 곳 있다" 는 알지만 어디부터 채워야 효율적인지 모름. 무작위로
이동하다 보면 가까운 빈 곳을 놓치고 멀리 가서 360° 돌아 채우는 비효율
패턴 발생.

## 개선

**현재 위치 기준 가장 가까운 빈 sector 1개를 강조** (양방향 동시 검색,
시계/반시계 중 더 가까운 쪽).

### 1. 부모에서 nextSector 계산
```ts
let nextSector: number | null = null;
if (liveAlpha != null && sectorsCovered.size < SECTORS) {
  const cur = Math.floor(liveAlpha / SECTOR_ANGLE) % SECTORS;
  for (let dist = 0; dist <= SECTORS / 2; dist++) {
    const cw = (cur + dist) % SECTORS;
    const ccw = (cur - dist + SECTORS) % SECTORS;
    if (!sectorsCovered.has(cw)) { nextSector = cw; break; }
    if (!sectorsCovered.has(ccw)) { nextSector = ccw; break; }
  }
}
```
- dist=0 부터 시작 → 현재 sector 가 비었으면 그것을 추천
- 양방향 동시 → bias 없이 가장 가까운 쪽
- 모든 sector 채워졌으면 null (강조 안 함)

### 2. AngleMap3D 시그니처 확장
- 새 prop `nextSector: number | null`
- liveAlpha=null 또는 hasGyro=false 시 부모가 null 전달

### 3. 섹터 렌더링 분기
- covered → 초록 dim
- missing & not next → 빨강 dim (기존)
- **missing & next → r=1.8 (1.0 → 1.8) + opacity 95% + animate-pulse**

시각: 사용자가 미니맵 보면 빨간 점들 중 하나가 더 크고 깜빡임 → "여기로
가세요" 직관적 인지.

## 검증

- `npm run build` ✓
- `/capture` 11.7 → 11.8 kB (+0.1)
- TS strict 통과
- Edge case: 모든 sector 채워진 상태 → nextSector=null → 강조 없음 ✓
- 자이로 없는 PC 모드 → liveAlpha=null → nextSector=null ✓

## 배포

✅ Git commit + push → Vercel 자동 배포

## R6 + R13 효과 비교

| 단계 | R6 (이전) | R13 (현재) |
|---|---|---|
| 빈 sector 표시 | 모두 동일 dim 빨강 | dim 빨강 + 추천 1개 강조 |
| 사용자 인지 | "어디든 이동해야" | "여기로 가세요" |
| 이동 효율 | 무작위 패턴 발생 | 가장 가까운 쪽 우선 |

가장 가까운 sector 채우면 추천이 다음 가까운 빈 곳으로 이동 → 자연스러운
연속 채움 패턴 유도.

## 다음 라운드 후보

- 햅틱 진동 (Vibration API) — 자동/수동 셔터 시
- 결과 페이지에 R7 dropped 사진 미리보기 (디버깅 / 사용자 학습)
- Manual 셔터에도 burst 토글 (사용자 선택)
- VGGT 결과 confidence 시각화 (worker 변경 필요)
- HF Space env 활성화 도구 (R4 unblock)
