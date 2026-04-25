# Round 15 — 2026-04-25 KST

## 진단

R11 brightness 검사는 **각 사진 별** per-shot 처리 — 사용자가 어둡다는 걸
20장 다 찍고 학습 페이지 진입한 뒤에야 (또는 toast 가 띄엄띄엄 뜨면서)
인지. 하지만 20장 모두 어두우면 환경 자체가 photogrammetry 부적합.

→ 카메라 켠 직후 **1초간 환경 sample** 하면, 사용자가 첫 셔터 누르기 전에
"이 곳은 너무 어둡다" 알 수 있음 → 더 밝은 곳으로 이동 결정.

## 개선

### 1. State
```ts
envCheck: { state: 'pending' | 'ok' | 'dim'; avgBrightness: number } | null
envBannerDismissed: boolean
```

### 2. useEffect (cameraActive 시작 시)
- shots.length === 0 일 때만 실행 (이미 촬영 시작되면 skip)
- envCheck 가 이미 완료(ok/dim) 면 skip
- 200ms × 5회 sample → 1.1초 후 평균 계산
- avg < 60 → 'dim' (R11 의 per-shot 35 보다 너그럽게 — 환경 자체는
  50-100 어두운 실내 정도면 미리 경고)
- avg >= 60 → 'ok' (배너 안 뜸)

### 3. Banner UI
조건: `envCheck?.state === 'dim' && !envBannerDismissed && shots.length === 0`

```
💡 환경이 어둡습니다 (밝기 47)
   어두운 곳에서는 카메라 ISO 노이즈 ↑ → photogrammetry 품질 ↓.
   더 밝은 곳에서 촬영을 권장합니다.                         [무시]
```

위치: 카메라 화면 상단 (top-20), 좌우 max-w-md 가운데.
[무시] 클릭 → envBannerDismissed=true → 영구 숨김 (이번 세션).

### 4. 자동 사라짐 조건
- 사용자가 첫 사진 찍으면 (shots.length > 0) 자동 숨김
- [무시] 클릭 시 영구 숨김
- 환경이 ok 면 처음부터 안 뜸

## 검증

- `npm run build` ✓
- `/capture` 12 → 12.4 kB (+0.4)
- TS strict 통과
- envCheck dependency 에서 제외 (state setter 호출이 effect 재실행 트리거 → 무한 루프 방지)

## 배포

✅ Git commit + push → Vercel 자동 배포

## R11 + R15 결합

| Round | 시점 | 임계값 | 효과 |
|---|---|---|---|
| R15 | 카메라 시작 직후 (1초) | brightness < 60 | 사전 환경 경고 (banner) |
| R11 | 각 사진 직후 | brightness < 35 | 개별 사진 경고 (toast) |

R15 가 먼저 발동 → 환경 자체 개선 유도. R15 무시 후 진행 시에도 R11 이
각 사진별 검증. 두 단계로 사용자가 "환경 부적합" 을 인지할 기회 ↑.

## 다음 라운드 후보

- 결과 페이지 R7 dropped 사진 미리보기
- 셔터 발사 시 흰 플래시 오버레이
- 환경 사전 체크에 feature density 추가 (textureless wall 감지)
- HF Space env 활성화 도구 (R4 unblock)
