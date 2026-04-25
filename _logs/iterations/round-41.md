# Round 41 — 2026-04-25 KST

## 진단

`/capture` 페이지의 startCamera() 에러 처리:
- `NotAllowed` → "카메라 접근이 거부되었습니다. 브라우저 설정에서 허용해주세요"
- `NotFound` → "카메라를 찾을 수 없습니다"
- 그 외 → `카메라 오류: ${msg}`

문제:
- 사용자에게 **HOW** 가 없음 — "브라우저 설정에서 어떻게 허용?"
- 브라우저 별 절차가 다름 (Chrome 자물쇠 vs iOS 설정 앱 vs Firefox 카메라 아이콘)
- "다른 앱에서 사용 중" 같은 흔한 케이스 (Zoom 등) 미처리

## 개선

### 1. 5종 에러 분류
```ts
NotAllowed/Permission → 권한 거부
NotFound → 디바이스 없음
NotReadable/TrackStart → 다른 앱 점유 (Zoom 등)
OverconstrainedError → 해상도 미지원
그 외 → generic
```

### 2. 브라우저별 복구 안내 (NotAllowed 케이스)
```ts
const ua = navigator.userAgent;
const isIOS = /iPad|iPhone|iPod/.test(ua);
const isFirefox = /Firefox/.test(ua);

const tip = isIOS
  ? '설정 앱 → Safari → 카메라 → "허용" 으로 변경 후 페이지 새로고침'
  : isFirefox
    ? '주소창의 카메라 아이콘 클릭 → "차단 해제" 후 다시 시도'
    : '주소창의 🔒 자물쇠 → 사이트 권한 → 카메라 "허용" 후 새로고침';
```

### 3. UI 개선
- `whitespace-pre-line` 으로 \n 줄바꿈 보존 → 다단 메시지 깔끔
- max-w-md 로 너무 좁게 안 잘림
- [다시 시도] (기존) + [페이지 새로고침] 버튼 추가
  → 권한 변경 후 새로고침이 필요한 경우 (대부분)

### 4. NotReadable / OverconstrainedError 케이스 추가
- "Zoom, Teams, 카메라 앱 등을 닫고 다시 시도" — 흔한 desktop 케이스
- "1920×1080 미지원 — 다른 카메라" — 구형 webcam

## 검증

- `npm run build` ✓
- `/capture` 14.3 → 14.8 kB (+0.5)
- TS strict 통과
- 브라우저 감지: ua 매칭 (정확도 충분, edge case 는 generic 메시지로 fallback)

## 배포

✅ Git commit + push → Vercel 자동 배포

## 사용자 시나리오

이전:
1. 카메라 시작 → 권한 거부
2. "카메라 접근이 거부되었습니다. 브라우저 설정에서 허용해주세요"
3. 사용자: "어떻게...?" → 포기 또는 검색

이후:
1. 카메라 시작 → 권한 거부
2. "📷 카메라 권한이 거부됨
    주소창의 🔒 자물쇠 → 사이트 권한 → 카메라 '허용' 후 새로고침
    허용 후 [다시 시도] 버튼 누르세요."
3. [페이지 새로고침] 버튼으로 빠른 회복

## 다음 라운드 후보

- VGGT 통계 확장 패널
- Service worker (offline)
- 토글 트랜지션
- 자이로 권한 요청 (iOS 13+) — DeviceMotion permission
