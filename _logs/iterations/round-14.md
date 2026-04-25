# Round 14 — 2026-04-25 KST

## 진단

R12 burst 는 auto-capture 만 활성화. Manual shutter 사용자는 R7+R10+R11
의 안전망은 받지만 burst 의 sharp 채택 효과는 못 받음. 또한 auto 든
manual 이든 셔터 발사 시 시각 피드백 (점 애니메이션) 외에 촉각/음향
피드백 없음 — 화면 안 보면 셔터가 작동했는지 모름.

## 개선

### 1. `lib/haptics.ts` (신규)
```ts
export function shutterHaptic(durationMs = 30) // 셔터 발사 진동
export function warningHaptic()                // 흐림/어두움 더블 탭 진동
```
- `navigator.vibrate` 가 없는 환경 (iOS Safari, desktop) 은 typeof check 로 silent
- try-catch 로 모든 에러 무시
- Android Chrome 실제 동작, iOS Safari 무시 (Apple 정책)

### 2. captureShot 에 shutterHaptic 호출
- 함수 시작 직후 (frame capture 전) 30ms 진동
- Auto/Manual 모두 적용 — 사용자가 화면 안 보고 폰 들고 걸어도 셔터 인지

### 3. Toast 발사 시 warningHaptic
- 흐림/어두움 toast 가 뜰 때 [20, 50, 20] 더블 탭 패턴
- 셔터 (30ms 단발) 와 명확히 구분 → "이번 사진 문제 있음" 신호

### 4. Manual 셔터 burst 토글 (`manualBurst: boolean`)
- Auto-capture OFF 일 때만 표시
- 라벨: "✨ 3장 burst — 셔터 1번에 3장 → sharp 1장 (250ms 더 걸림)"
- 기본 OFF (응답성 우선)
- 토글 ON → onClick={() => captureShot({ burst: true })}

이제 모든 사용자가 burst 의 품질 이득을 선택 가능.

## 검증

- `npm run build` ✓
- `/capture` 11.8 → 12 kB (+0.2)
- TS strict 통과
- 진동 미지원 환경에서도 무해 (try-catch 보호)

## 배포

✅ Git commit + push → Vercel 자동 배포

## R12 + R14 결합

| 모드 | Round | 주체 | 효과 |
|---|---|---|---|
| Auto | R12 | 자동 발사 | 자동 burst (사용자 인지 X) |
| Manual + manualBurst=ON | R14 | 사용자 선택 | 자동과 동일 burst 품질 |
| Manual + manualBurst=OFF | (기존) | 사용자 선택 | 즉시 단일 발사 (응답성) |

햅틱은 모든 모드에서 동작 → 화면 안 보고도 fire 인지 + 흐림 알림 인지.

## 다음 라운드 후보

- 결과 페이지에 R7 dropped 사진 미리보기
- VGGT 결과 confidence 시각화 (worker 변경 필요)
- 캡처 시작 전 환경 사전 체크 (밝기 측정 + 권장 위치 안내)
- HF Space env 활성화 도구 (R4 unblock)
- 셔터 발사 시 흰 플래시 오버레이 (시각 피드백 추가)
