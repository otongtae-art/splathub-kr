# Round 11 — 2026-04-25 KST

## 진단

R7 sharpness 필터는 **motion blur** 만 잡음. 하지만 photogrammetry 의 또 다른
실패 모드: **저조도 sensor noise**.

원리:
- 어두운 환경 → 카메라 자동 ISO 부스트
- ISO ↑ → 센서 노이즈 ↑
- 노이즈 = noisy feature points
- VGGT pose 추정 noisy → pointcloud layer 분리 → "monster"

기존 코드는 brightness 측정 안 함. 어두운 곳에서 찍어도 sharpness 가
적당히 높으면 "괜찮은 사진" 으로 통과 → 결과 monster.

## 개선

### 1. `lib/sharpness.ts` — `computeBrightness(canvas)` 신규
```ts
export function computeBrightness(source) {
  // 64px 다운스케일 (밝기 평균은 작은 해상도면 충분, ~1ms)
  // RGB → Rec.601 luma 평균 (0..255 범위)
}
```

해석:
- 일반 실내: 200+
- 어두운 실내: 50-100
- 거의 어둠: 30 미만

### 2. `Shot` 에 `brightness: number` 추가
- `captureShot` 에서 featureCanvas (객체 영역) 으로 측정
- 박스 안 영역만 → 검은 배경/그림자 영향 최소화

### 3. R8 toast 확장 — sharpness OR brightness
기존 `blurToast = { id, sharpness }`
→ 새 `blurToast = { id, isBlurry, isDark }`

조건:
- isBlurry = sharpness < 50
- isDark = brightness < 35
- 둘 중 하나 또는 둘 다면 toast 발사

UI 메시지:
- 흐림+어두움: "흐림 + 어두움 · 자동 제외 가능성 높음"
- 흐림만: "흐림 감지 · 자동 제외 가능성 높음"
- 어두움만: "어두움 — 조명 부족 · 센서 noise 증가 가능"

[지우기] 버튼은 그대로.

## 검증

- `npm run build` ✓
- `/capture` 11.2 → 11.5 kB (+0.3 kB)
- TS strict 통과
- 어두움 알림은 sharpness 가 운 좋게 통과해도 발동 → 사용자에게 환경 개선 유도

## 배포

✅ Git commit + push → Vercel 자동 배포

## R7 + R11 직교성

| Failure mode | R7 (sharpness) | R11 (brightness) |
|---|---|---|
| Motion blur | ✓ | (간접) |
| Defocus | ✓ | × |
| ISO noise (어두움) | × | ✓ |
| 검은 사진 | (sharpness 낮음) | ✓ |

R11 은 R7 의 사각지대를 덮음. 두 메트릭 동시 통과 = 명확히 좋은 입력.

## 다음 라운드 후보

- Auto-capture: 셔터 발사 시 햅틱 진동 (Vibration API) — 화면 안 봐도 알림
- VGGT 결과 confidence 시각화
- Multi-shot burst (셔터 1번에 3장 찍어 가장 sharp 한 장 유지)
- 미니맵에 "추천 다음 위치" (현재 빈 sector 중 가장 가까운 곳)
- HF Space env 활성화 도구 (R4 unblock)
