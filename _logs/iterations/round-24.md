# Round 24 — 2026-04-25 KST

## 진단

R19 TRELLIS 폴백 후 viewer 가 보여주는 모델은 **AI generative** 결과 (1장
기반 상상). 그러나 헤더 라벨은 여전히 'VGGT · photogrammetry · 20장' →
사용자가 결과 출처를 혼동:
- "내가 20장 찍었는데 결과는 이게 다인가?" (사실은 AI 가 1장 만든 것)
- "이게 실측인가? AI 생성인가?" 구분 불가
- 신뢰성/진실성 측면 — 사용자에게 정직한 표시 필요

## 개선

**헤더에 source 명시 + 'AI 생성' 배지** — trellisState === 'done' 일 때.

### 1. UI 분기 (`train/page.tsx` header)
```jsx
{trellisState === 'done' ? (
  <span>
    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-700">
      AI 생성
    </span>
    <span>TRELLIS.2 · 1장 기반 (실측 X)</span>
  </span>
) : (
  <span>VGGT · photogrammetry · {N}장</span>
)}
```

### 2. viewerStats 표시도 분기
- VGGT 결과: stats 표시 (kept/flatness)
- TRELLIS 결과: 의미 없는 stats 라 hidden (R5 trim/flatness 휴리스틱은 photogrammetry pointcloud 전용)

### 3. R19 monster banner 와의 상호작용
- TRELLIS 후 viewerStats=null → monsterSuspect=false → banner 사라짐
- 새 stats (TRELLIS GLB 가 mesh 면 trimPointcloudOutliers 안 탐) 가 와도 banner 의 [TRELLIS] 버튼은 trellisState='done' 이라 안 뜸 (다시 촬영 링크는 유지)

## 검증

- `npm run build` ✓
- `/capture/train` 11.5 → 11.6 kB (+0.1)
- TS strict 통과

## 배포

✅ Git commit + push → Vercel 자동 배포

## R19 + R24

| 시점 | 헤더 라벨 |
|---|---|
| VGGT 성공 | "VGGT · photogrammetry · 20장" + stats |
| VGGT monster, TRELLIS 미사용 | 동일 + 노란 banner |
| TRELLIS 성공 | "[AI 생성] TRELLIS.2 · 1장 기반 (실측 X)" |

→ 사용자가 결과 출처를 항상 명확히 인지.

## 다음 라운드 후보

- VGGT 결과 통계 시각화 (R5 stats 확장 패널)
- 환경 사전 체크 진행 indicator
- TRELLIS 폴백 확인 다이얼로그 (실측 결과 사라짐 경고)
- HF Space env 활성화 도구 (R4 unblock)
