# SplatHub-KR

> 웹캠·카메라 한 번으로 3D Gaussian Splat 만들기

**🚀 라이브 플랫폼**: [splathub.vercel.app](https://splathub.vercel.app)

사진이나 웹캠으로 찍은 영상을 **브라우저에서 바로** 3D Gaussian Splat(`.ply` / `.spz` / `.sog`)으로 변환하고, 뷰어에서 즉시 확인·공유할 수 있는 한국어 무료 커뮤니티.

레퍼런스: [superspl.at](https://superspl.at) / [playcanvas/supersplat](https://github.com/playcanvas/supersplat) (MIT)

## 주요 라우트

| URL | 기능 |
|---|---|
| [`/`](https://splathub.vercel.app) | 대시보드 — 사진 업로드 → 3D 변환 → 뷰어 |
| [`/capture`](https://splathub.vercel.app/capture) | 웹캠/카메라 실시간 캡처 |
| [`/convert`](https://splathub.vercel.app/convert) | 파일 업로드 변환 |
| [`/explore`](https://splathub.vercel.app/explore) | 모델 탐색 갤러리 |
| [`/marketplace`](https://splathub.vercel.app/marketplace) | 유료 마켓플레이스 (Phase 2) |
| [`/login`](https://splathub.vercel.app/login) | 로그인 / 회원가입 |
| [`/m/sample-butterfly`](https://splathub.vercel.app/m/sample-butterfly) | 샘플 3D 모델 뷰어 |

## 핵심 원칙

- **월 고정 운영비 $0** — 모든 인프라는 무료 영구 tier 또는 사용량 기반 pass-through
- **변환 엔진이 제품의 심장** — 웹캠 캡처 → 변환 → 뷰어의 E2E 속도·품질이 최우선 KPI
- **Ladder of Free GPU** — HF Space ZeroGPU → Modal $30 크레딧 → Replicate on-demand → 클라이언트 WebGPU(Brush) 4중 폴백
- **결제 없음(v1)** — 커뮤니티 안정화 뒤 Phase 2에서 마켓플레이스(20% 수수료) 개시

## 모노레포 구조

```
splathub/
├── apps/
│   ├── web/                 Next.js 15 (Cloudflare Pages)
│   └── editor/              SuperSplat MIT fork (iframe 임베드)
├── worker/
│   ├── hf-space/            Gradio + VGGT-Commercial + FreeSplatter (1순위 무료 GPU)
│   ├── modal/               Modal $30 크레딧 (2순위)
│   └── replicate/           Phase 2 유료 gsplat 학습
├── packages/
│   └── shared/              공유 TypeScript 타입 / zod 스키마
├── infra/                   CORS·마이그레이션·heartbeat 스크립트
└── docs/                    ARCHITECTURE / DEPLOY / LICENSE-NOTICES
```

## 개발 시작

```bash
pnpm install
pnpm dev        # apps/web (http://localhost:3000)
```

## 상세 계획

전체 아키텍처·마일스톤·검증 방법은 `docs/ARCHITECTURE.md`. 인프라 설정은 `docs/DEPLOY.md`. Third-party attribution은 `docs/LICENSE-NOTICES.md`.

## 라이선스

MIT © 2026 SplatHub-KR contributors. 제3자 구성요소는 `LICENSE` 파일의 attribution 섹션 참조.
