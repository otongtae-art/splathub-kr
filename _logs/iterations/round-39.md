# Round 39 — 2026-04-25 KST

## 진단

R38 PWA manifest 배포로 브라우저가 SplatHub 를 installable 로 인식.
Chrome 은 자동으로 주소창 옆 "설치" 아이콘 표시. 그러나 사용자가
의식적으로 누르는 빈도 낮음 → PWA 가치 (R38 설명한 풀스크린 capture)
미실현.

명시적 in-app prompt 가 필요한 시점:
- 사용자가 SplatHub 의 가치를 막 체험한 직후 (성공적인 학습 결과)
- 다음 사용을 상상할 수 있는 순간

→ train 페이지 result view 가 적합.

## 개선

### 1. `lib/usePWAInstall.ts` (신규)
React hook 으로 install prompt 관리:
```ts
const { canInstall, installed, isIOS, dismissed, install, dismiss } = usePWAInstall();
```

내부:
- `beforeinstallprompt` 이벤트 가로채서 `e.preventDefault()` + 저장
- 이미 설치됨 (`display-mode: standalone` 또는 iOS legacy `standalone`) 감지
- iOS Safari 감지 (별도 안내 가능 — Apple 미지원)
- `appinstalled` 이벤트로 설치 완료 추적
- sessionStorage 로 dismiss 영구 (1세션)
- `install()`: prompt 호출 + outcome 반환

### 2. train/page.tsx 통합
R27 다운로드 guide toast 와 같은 위치 (bottom)에 stack:

```jsx
{(showDownloadGuide || (canInstall && !installed && !dismissed)) && (
  <div>
    {showDownloadGuide && (
      <div>📂 다운로드 완료 · 사용 방법 ... [✕]</div>
    )}
    {canInstall && !installed && !dismissed && (
      <div className={showDownloadGuide ? 'border-t pt-2' : ''}>
        📱 홈 화면에 추가 — 다음 촬영 시 native 앱처럼 풀스크린 + 1탭 접근
        [추가] [✕]
      </div>
    )}
  </div>
)}
```

특징:
- 두 안내가 동시 노출 가능 (border-t 로 구분)
- [추가] 클릭 → `pwa.install()` → 브라우저 native dialog
- [✕] dismiss 1회만 (sessionStorage)
- 설치된 사용자에겐 안 보임 (`installed`)
- iOS 사용자에겐 별도 안내 가능 (현재 round 에선 hidden — 추후 라운드)

## 검증

- `npm run build` ✓
- `/capture/train` 13.3 → 14 kB (+0.7, hook + UI)
- TS strict 통과
- iOS Safari 에서 noop (silent — 이벤트 발사 안 함)
- 이미 설치된 사용자에겐 zero overhead

## 배포

✅ Git commit + push → Vercel 자동 배포

## R38 + R39

| Round | 역할 |
|---|---|
| R38 | PWA manifest 정의 (브라우저가 installable 인식) |
| R39 | 사용자에게 install 버튼 명시적 노출 (성공 모멘트) |

→ PWA 채택률 ↑ → 다음 사용 시 풀스크린 capture 경험.

## 다음 라운드 후보

- iOS 사용자에게 'Safari 공유 → 홈 화면에 추가' 안내
- Service worker (offline asset caching)
- VGGT 통계 확장 패널
- 토글 트랜지션
