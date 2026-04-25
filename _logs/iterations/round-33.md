# Round 33 — 2026-04-25 KST

## 진단

R5 viewerStats (kept points + flatness) 는 monster 의심 판단 + 사용자
확인 정보. 그러나 헤더에 `hidden sm:inline` → 모바일에서 안 보임.

문제: SplatHub 의 capture 주 채널은 모바일 (자이로 + 카메라). 즉 결과
보는 것도 모바일 → 정작 stats 가 가장 필요한 환경에서 hidden.

## 개선

**Mobile 약식 + Desktop 풀 라벨 분리** + tooltip.

```jsx
<span title="Pointcloud: X points / 평탄도(flatness) Y% — depth/width 비율">
  <span className="sm:hidden">  {/* mobile */}
    {Math.round(retainedCount/1000)}k · {flatness*100}%
  </span>
  <span className="hidden sm:inline">  {/* desktop */}
    {retainedCount.toLocaleString()}pts · 평탄도 {flatness*100}%
  </span>
</span>
```

특징:
- mobile: '12k·28%' 매우 짧음, 정보 밀도 ↑
- desktop: 기존 풀 라벨 유지
- tooltip 에 정확한 수치 + 의미 설명 (호버 시)
- 활성 view 가 'vggt' 일 때만 (TRELLIS 는 R5 휴리스틱 무관)

## 검증

- `npm run build` ✓
- `/capture/train` 12.7 → 12.8 kB (+0.1)
- TS strict 통과

## 배포

✅ Git commit + push → Vercel 자동 배포

## 모바일 vs Desktop 헤더 비교

이전:
- mobile: [VGGT][TRELLIS] [.glb 다운로드]   (stats 없음)
- desktop: [VGGT][TRELLIS] 12,547pts · 평탄도 28% [.glb 다운로드]

이후:
- mobile: [VGGT][TRELLIS] 12k·28% [.glb 다운로드]
- desktop: [VGGT][TRELLIS] 12,547pts · 평탄도 28% [.glb 다운로드]

→ mobile 사용자도 monster 정도 즉시 확인 가능.

## 다음 라운드 후보

- VGGT 통계 확장 패널 (debug power user)
- 토글 트랜지션
- 공유 링크 동적 OG image
- Capture 종료 후 자동 학습 페이지 이동 옵션 (현재 명시적 클릭 필요)
