# Round 38 — 2026-04-25 KST

## 진단

SplatHub 의 capture 주 채널은 모바일 (자이로 + 카메라). 그러나 사용자는
매번 브라우저 열고 splathub.vercel.app URL 입력 또는 즐겨찾기에서 로드 →
브라우저 chrome (주소창, 탭, 하단 nav) 차지로 카메라 영역 ↓.

PWA (Progressive Web App) manifest 로:
- "홈 화면에 추가" 가능 → native app 같은 아이콘
- standalone 디스플레이 → 브라우저 chrome 숨김 → 카메라 영역 100%
- 단축 액션 → 즉시 /capture 로 이동
- iOS 도 add-to-home-screen 지원

## 개선

`apps/web/app/manifest.ts` (Next.js 14+ 라우트 핸들러).

### 구성
```ts
{
  name: 'SplatHub — 사진으로 진짜 3D',
  short_name: 'SplatHub',
  start_url: '/capture',           // 홈 화면 아이콘 클릭 시 즉시 capture
  display: 'standalone',           // 풀스크린, 카메라 영역 ↑
  orientation: 'portrait',         // 모바일 capture 자연스러운 방향
  background_color: '#0e1011',     // OLED 검정
  theme_color: '#0e1011',
  lang: 'ko',
  categories: ['photo', 'graphics', 'productivity'],
  icons: [
    /icon.svg (any),
    /favicon.ico (16-48px),
    /apple-icon (180x180 PNG, iOS 우선)
  ],
  shortcuts: [
    { name: '촬영 시작', url: '/capture' },
    { name: '예시 모델', url: '/m/sample-butterfly' },
  ],
}
```

### Next.js 자동 처리
- `/manifest.webmanifest` 라우트 자동 생성 (build output 확인)
- `<link rel="manifest" href="/manifest.webmanifest">` 자동 head 주입

## 검증

- `npm run build` ✓
- `/manifest.webmanifest` 158 B (라우트 등록 확인)
- TS strict 통과 (MetadataRoute.Manifest 타입 일치)
- shortcuts 는 Android Chrome 만 지원 (iOS 무시, harmless)

## 배포

✅ Git commit + push → Vercel 자동 배포

## 사용자 시나리오

### Android (Chrome / Edge)
1. splathub.vercel.app 방문
2. 브라우저 메뉴 → "홈 화면에 추가" (자동 prompt 가능)
3. 홈 화면에 SplatHub 아이콘 (icon.svg 또는 192/512 PNG)
4. 클릭 → 풀스크린 standalone, 즉시 /capture
5. 길게 누르기 → 단축 액션 [촬영 시작] / [예시 모델]

### iOS (Safari)
1. 공유 → 홈 화면에 추가
2. apple-icon (180x180 PNG) 사용
3. 클릭 → standalone, /capture

## 다음 라운드 후보

- Service worker 추가 — offline asset caching, 더 나은 PWA
- VGGT 통계 확장 패널
- 토글 트랜지션
- PWA install prompt UI ('홈 화면에 추가하시겠어요?' beforeinstallprompt 활용)
