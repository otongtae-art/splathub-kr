---
title: SplatHub Worker (Free Tier)
emoji: 🧿
colorFrom: indigo
colorTo: pink
sdk: gradio
sdk_version: 5.5.0
app_file: app.py
pinned: false
short_description: Photo → 3D Gaussian Splat (.spz) — free tier worker
license: mit
hardware: zero-a10g
tags:
  - gaussian-splatting
  - 3d-reconstruction
  - photo-to-3d
---

# SplatHub Worker · Free Tier (HF Space ZeroGPU)

이 Space는 SplatHub-KR의 **1순위 무료 변환 워커**다. 상위 웹앱의
`/api/jobs` 가 이 Space의 Gradio/FastAPI endpoint를 호출한다.

## 파이프라인

1. **RMBG-1.4** — 배경 제거 (MIT, 상업 가능)
2. **VGGT-1B-Commercial** — pose · depth · point cloud 단 한번의 forward (<1s)
3. **FreeSplatter** — pose-free feed-forward 3D Gaussian 생성 (Apache 2.0)
4. **@playcanvas/splat-transform** — `.ply → .spz` 압축 (Node CLI를 subprocess로 호출)

## 배포

저장소 루트의 `.github/workflows/deploy-hf-space.yml` 가 `worker/hf-space/`
서브트리를 이 Space의 git remote로 force-push 한다.

로컬 개발:

```bash
cd worker/hf-space
pip install -r requirements.txt
GRADIO_SERVER_NAME=0.0.0.0 python app.py
```

## 환경변수

ZeroGPU는 Settings → Variables 에서 설정:

- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE`
- `JOB_CALLBACK_URL` — e.g. `https://splathub.pages.dev/api/jobs/{job_id}/callback`
- `JOB_CALLBACK_SECRET` — HMAC secret (웹앱의 .env.local과 동일)

## 라이선스 주의

- VGGT-1B-**Commercial** 가중치만 사용. 기본 VGGT-1B(비상업)는 CI에서 차단됨.
- RMBG-2.0 사용 금지 — RMBG-1.4 만.
- 자세한 구성요소 라이선스는 루트 `docs/LICENSE-NOTICES.md` 참조.
