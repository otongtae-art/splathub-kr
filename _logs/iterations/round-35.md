# Round 35 — 2026-04-25 KST

## 진단

MeshViewer 는 Three.js + WebGL — 외부 라이브러리 + GPU 의존:
- WebGL context lost (메모리 부족, GPU 오류)
- GLB 파싱 실패 (corrupted bytes, unsupported extension)
- 사파리 구버전 호환성 이슈

위 중 하나만 throw 해도 React 가 페이지 전체 unmount → **white screen**.
사용자는 결과 다운로드도 못 함, 다시 학습도 못 함.

## 개선

**Generic React Error Boundary 컴포넌트** + train 페이지 적용.

### 1. `components/ErrorBoundary.tsx` (신규)
```tsx
class ErrorBoundary extends Component<Props, State> {
  static getDerivedStateFromError(error)  // catch
  componentDidCatch(error)                 // log + onError callback
  render() {
    if (hasError) return fallback (function 또는 JSX) ?? 기본 UI
    return children
  }
}
```

기본 fallback:
- 에러 메시지 + [페이지 새로고침]

### 2. train/page.tsx 에 적용
```jsx
<ErrorBoundary
  fallback={(err) => (
    <div>
      3D 뷰어 오류
      {err.message}
      Chrome 134+ 권장. 메모리 부족 시 다른 탭 닫고 재시도.
      [.glb 다운로드만]   [페이지 새로고침]
    </div>
  )}
>
  <MeshViewer ... />
</ErrorBoundary>
```

핵심: **[.glb 다운로드만]** 버튼 — 뷰어 못 봐도 다운로드는 가능.
사용자가 결과 잃지 않게.

## 검증

- `npm run build` ✓
- `/capture/train` 12.8 → 13.3 kB (+0.5)
- TS strict 통과
- ErrorBoundary 는 only renders children when no error → zero overhead

## 배포

✅ Git commit + push → Vercel 자동 배포

## 영향 범위

이전:
- WebGL crash → white screen → 사용자 confused, 결과 손실

이후:
- WebGL crash → fallback UI 표시 → 다운로드 + 재로드 옵션
- 콘솔에 [ErrorBoundary] caught: ... 로깅 (디버깅용)

## 다음 라운드 후보

- 자동 학습 시 햅틱 진동
- VGGT 통계 확장 패널
- 토글 트랜지션
- ErrorBoundary 를 home page (/) 의 ViewerShell 에도 적용
