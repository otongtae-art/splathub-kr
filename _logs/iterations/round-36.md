# Round 36 — 2026-04-25 KST

## 진단

R35 가 train 페이지의 MeshViewer 만 ErrorBoundary 로 wrap. 그러나
같은 WebGL 크래시 위험이 다른 3개 viewer 사이트에도 있음:
- `/` (home dashboard) — MeshViewer or ViewerShell
- `/m/[slug]` — ViewerShell (sample 모델 표시)
- `/convert` — ViewerShell (변환 결과)

이 페이지들에서 WebGL crash 시 여전히 white screen → 일관성 부족.

## 개선

**ErrorBoundary 패턴을 모든 viewer 사이트에 일관 적용**.

### 1. `apps/web/app/page.tsx` (home)
```jsx
<ErrorBoundary fallback={<ViewerErrorFallback />}>
  {currentModel.glbBytes
    ? <MeshViewer fileBytes={...} />
    : <ViewerShell url={...} />
  }
</ErrorBoundary>
```

### 2. `apps/web/app/m/[slug]/page.tsx` (sample 모델 페이지)
- Server component 안에서 ErrorBoundary 사용 — Next.js 가 client boundary
  자동 처리. 내부 ViewerShell wrap.

### 3. `apps/web/app/convert/page.tsx` (변환 결과)
- 결과 미리보기 ViewerShell 을 wrap.

### Fallback UI 일관성
모든 사이트 공통 패턴:
```
3D 뷰어 오류 (danger)
Chrome 134+ 권장. {context-specific 안내}
```
context:
- home: "다른 모델 시도하거나 새로고침"
- /m/[slug]: "새로고침하거나 다른 모델을 시도해보세요"
- /convert: "새로고침 후 다시 시도해주세요"
- /capture/train (R35): "[.glb 다운로드만] [페이지 새로고침]" — 결과 보존

## 검증

- `npm run build` ✓
- `/` 사이즈는 변동 없음 (10kB)
- `/m/[slug]` 2.07 → 2.47 kB (+0.4)
- `/convert` 2.1 → 2.23 kB (+0.13)
- TS strict 통과
- Server vs Client component 호환 — Next.js 자동 boundary 처리

## 배포

✅ Git commit + push → Vercel 자동 배포

## 영향 범위

이전 (R35): 1개 viewer 보호 (capture/train)
이후 (R36): **4개 viewer 모두 보호** (capture/train + home + sample + convert)

WebGL/GLB 파싱 크래시가 어느 페이지에서 일어나도 사용자에게 white screen
대신 actionable fallback 표시.

## 다음 라운드 후보

- 자동 학습 햅틱 진동
- VGGT 통계 확장 패널
- 토글 트랜지션
- 페이지 단위 error.tsx (Next.js 14+ 기능, 라우트 단위 + ErrorBoundary 보완)
