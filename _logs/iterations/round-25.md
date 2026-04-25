# Round 25 — 2026-04-25 KST

## 진단

R19 TRELLIS 폴백은 setGlbBytes(result.bytes) 로 VGGT 결과를 **덮어쓰기**.
사용자 입장에서:
- 한 번 TRELLIS 클릭하면 VGGT 결과가 사라짐 → 비교 불가
- "TRELLIS 가 더 좋은가? VGGT 가 더 좋은가?" 직접 봐야 알 수 있는데 지금은 안 됨
- TRELLIS 가 별로면 다시 돌아갈 길 없음 (재학습 필요)

R24 라벨이 출처 표시는 했지만 데이터 손실은 그대로.

## 개선

**vggtBytes / trellisBytes 분리 보관 + 토글로 전환**

### 1. State
```ts
vggtBytes: Uint8Array | null      // VGGT photogrammetry 결과 (보존)
trellisBytes: Uint8Array | null   // TRELLIS AI 결과
activeView: 'vggt' | 'trellis'    // 현재 viewer 가 보여주는 것
```

### 2. tryTrellisFallback 개선
```ts
// 현재 VGGT 결과를 별도 보관
if (glbBytes && !vggtBytes) setVggtBytes(glbBytes);

// TRELLIS 호출 후
setTrellisBytes(result.bytes);
setGlbBytes(result.bytes);     // viewer 에 표시
setActiveView('trellis');
```

### 3. 헤더 토글 UI
- 둘 다 있을 때:
  ```
  [VGGT (실측)] [TRELLIS (AI)]
  ```
  - active 버튼: accent (VGGT) / amber (TRELLIS)
  - inactive: base-50 hover
  - 클릭 시 setGlbBytes(해당 bytes) + setActiveView + setViewerStats(null)
- TRELLIS 만 (VGGT 손실 없는 경우): R24 라벨
- VGGT 만 (기본): "VGGT · photogrammetry · 20장"

### 4. monster banner 조건
- 기존: `viewerStats !== null && (flatness || sparse)`
- 변경: `activeView === 'vggt' && (...)` — TRELLIS mesh 에는 R5 휴리스틱 적용 안 됨

## 검증

- `npm run build` ✓
- `/capture/train` 11.6 → 11.8 kB (+0.2)
- TS strict 통과

## 배포

✅ Git commit + push → Vercel 자동 배포

## R19 + R24 + R25

| 단계 | 동작 |
|---|---|
| R19 | VGGT monster → TRELLIS 호출 (결과 덮어쓰기) |
| R24 | 헤더 라벨로 출처 명시 |
| R25 | 두 결과 보존 + 토글 비교 |

이제 사용자가:
1. VGGT 결과 봄 → monster 의심
2. TRELLIS 클릭 → AI 결과 표시 (VGGT 보존)
3. [VGGT (실측)] 클릭 → VGGT 다시 봄
4. [TRELLIS (AI)] 클릭 → AI 다시 봄
5. 둘 비교 후 다운로드 결정

## 다음 라운드 후보

- 다운로드 버튼이 활성 view 명시 (현재는 generic '.glb 다운로드')
- VGGT 통계 확장 패널
- 환경 사전 체크 진행 indicator
- HF Space env 활성화 도구 (R4 unblock)
