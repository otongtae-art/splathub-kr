# Round 40 — 2026-04-25 KST

## 진단

R39 PWA install prompt 는 `beforeinstallprompt` 에 의존 — Android Chrome
등에서만 발사됨. **iOS Safari 는 이 이벤트 미지원** (Apple 정책) → iOS
사용자에겐 R38-R39 의 PWA 가치 (홈 화면 추가, 풀스크린) 가 표시 안 됨.

iOS 사용자는 SplatHub 의 capture 사용자 비중 큼 (iPhone 카메라 우수).
이들에게도 PWA 안내 필요.

## 개선

R39 의 `usePWAInstall().isIOS` 활용해 iOS 전용 안내 추가.

### 조건
```tsx
{pwa.isIOS && !pwa.canInstall && !pwa.installed && !pwa.dismissed && (
  <iOS hint />
)}
```
- `isIOS` true: iPhone/iPad
- `!canInstall`: Android prompt 안 뜸 (iOS 면 절대 안 뜨므로 redundant 하지만 명시)
- `!installed`: 이미 standalone 안 됨
- `!dismissed`: sessionStorage 미클릭

### UI
```
📱 iPhone — 홈 화면에 추가
   Safari 하단 ⎋ 공유 버튼 → '홈 화면에 추가'.
   풀스크린 + 1탭 접근.                                [✕]
```
- `⎋` 유니코드로 iOS 공유 버튼 시각 표현
- `'홈 화면에 추가'` 강조 (Safari 메뉴 텍스트 일치)
- [추가] 버튼 없음 (iOS 는 자동 설치 불가)
- [✕] 만 — sessionStorage dismiss

### Stack 동작
다운로드 가이드 + Android prompt + iOS hint 가 같은 toast 안에서 stack:
- Android Chrome 사용자: 가이드 + Android prompt
- iOS Safari 사용자: 가이드 + iOS hint
- 데스크톱: 가이드만 (PWA 안 뜸)

각각 border-t 로 시각 구분.

## 검증

- `npm run build` ✓
- `/capture/train` 14 → 14.1 kB (+0.1)
- TS strict 통과
- iOS 감지 정확성: ua 매칭 (`/iPad|iPhone|iPod/.test(ua) && !MSStream`)

## 배포

✅ Git commit + push → Vercel 자동 배포

## R38 + R39 + R40 — PWA 완성

| 환경 | 안내 |
|---|---|
| Android Chrome | beforeinstallprompt → '추가' 버튼 (R39) |
| iOS Safari | 수동 안내 'Safari 공유 → 홈 화면에 추가' (R40) |
| 이미 설치 | 안 보임 |
| Desktop Chrome | beforeinstallprompt 가능 (드물게) → R39 |
| Desktop Safari | hidden (PWA 채널 약함) |

## 다음 라운드 후보

- Service worker (offline asset caching, background sync)
- VGGT 통계 확장 패널
- 토글 트랜지션
- Capture 시 자이로/카메라 권한 안내 더 친근하게
