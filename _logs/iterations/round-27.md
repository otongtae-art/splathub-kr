# Round 27 — 2026-04-25 KST

## 진단

R26 까지 사용자가 .glb 다운로드는 잘 함. 그러나 이후 "이 파일을 어디서
열어요?" 가 비기술 사용자 흔한 의문 — 결과물은 받았는데 활용 못 함.

이전엔 이 정보가 어디에도 없었음 (FAQ 에 일부 있지만 다운로드 시점이
아니라 발견 어려움).

## 개선

**다운로드 후 사용 가이드 toast** — 첫 다운로드 시 bottom-center 에 표시.

### 1. State + sessionStorage
```ts
const [showDownloadGuide, setShowDownloadGuide] = useState(false);
```

downloadGlb 호출 후:
```ts
const seen = sessionStorage.getItem('splathub:dl-guide-seen');
if (!seen) {
  setShowDownloadGuide(true);
  sessionStorage.setItem('splathub:dl-guide-seen', '1');
}
```

→ 한 세션에 1회만 표시 (반복 다운로드 시 spam 방지).

### 2. Toast UI (viewer 위 absolute, dismissible)
```jsx
<div className="absolute bottom-4 left-1/2 ...">
  <div className="border border-accent/40 bg-black/90 ...">
    📂 다운로드 완료 · 사용 방법
    빠른 미리보기: <a href="https://gltf-viewer.donmccurdy.com/">
      gltf-viewer.donmccurdy.com
    </a> 에 .glb 끌어 놓기.
    Blender/Unity/Three.js 도 .glb import 직접 지원.
    [✕]
  </div>
</div>
```

특징:
- gltf-viewer.donmccurdy.com 외부 링크 (인기 무료 .glb 뷰어)
- Blender/Unity/Three.js 언급 — 사용자가 자기 도구 알 수 있게
- ✕ 버튼으로 dismiss 가능
- viewer 영역 안에 absolute 배치 → 헤더/footer 안 침해

## 검증

- `npm run build` ✓
- `/capture/train` 11.8 → 12.2 kB (+0.4)
- TS strict 통과
- sessionStorage 차단 환경 (try-catch) 안전

## 배포

✅ Git commit + push → Vercel 자동 배포

## R5 + R19 + R24 + R25 + R26 + R27 — 결과 페이지 사이클

| 시점 | UX |
|---|---|
| VGGT 결과 도착 | viewer + 헤더 source 라벨 (R24) |
| Monster 의심 | banner [TRELLIS] [다시 촬영] (R5/R19) |
| TRELLIS 호출 후 | 토글 [VGGT][TRELLIS] 추가 (R25) |
| 다운로드 클릭 | view 별 파일명 (R26) + 사용 가이드 toast (R27) |

→ 결과 → 비교 → 다운로드 → 활용까지 풀 사이클 안내 완성.

## 다음 라운드 후보

- VGGT 통계 확장 패널
- 토글 시 viewer 화면 전환 트랜지션
- HF Space env 활성화 도구 (R4 unblock)
- Capture 에 '이전 세션 결과 보기' 링크 (IndexedDB 에 보관된 세션)
