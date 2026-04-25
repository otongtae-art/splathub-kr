# Round 17 — 2026-04-25 KST

## 진단

R15+R16 환경 사전 체크는 **issues 있을 때만** banner 표시. 환경 ok 면
silent pass — 사용자는 시스템이 검사했는지 모름. 작동 신뢰성 인지 부족.

## 개선

**환경 OK ✓ 배지** — 검사 통과 시 2.5초 동안 명시적 피드백.

### 1. State
- `envOkVisible: boolean` (기본 false)

### 2. useEffect
- envCheck.state === 'ready' && issues.length === 0 일 때
- setEnvOkVisible(true), 2.5초 후 false

### 3. UI (top-center, 카메라 화면 위)
```
✓ 환경 OK · 밝기 145 · 특징점 67
```
- accent border + bg-black/85 + animate-fade-in
- pointer-events-none → 사용자 액션 차단 안 함
- shots.length === 0 일 때만 (촬영 시작되면 이미 사라짐)

## 검증

- `npm run build` ✓
- `/capture` 12.7 → 12.9 kB (+0.2)
- TS strict 통과

## 배포

✅ Git commit + push → Vercel 자동 배포

## R15+R16+R17 환경 체크 매트릭스 (완성)

| 환경 | banner | ✓ 배지 |
|---|---|---|
| 정상 (밝음 + 질감) | × | ✓ (2.5초) |
| 어두움만 | 💡 dim | × |
| 단색 벽만 | 🎨 textureless | × |
| 둘 다 | 환경 부적합 | × |

이제 사용자가 어떤 경우든 시스템이 환경을 검사했음을 인지.

## 다음 라운드 후보

- 결과 페이지 R7 dropped 사진 미리보기 (collapsible)
- 셔터 흰 플래시 오버레이 (시각 피드백)
- 환경 banner 유무 관계없이 작은 환경 status 칩 (밝기/특징점 수치 항상 표시)
- HF Space env 활성화 도구 (R4 unblock)
