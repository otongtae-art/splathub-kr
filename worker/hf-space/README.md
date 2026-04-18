---
title: SplatHub TRELLIS Proxy
emoji: 🧊
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
short_description: Thin Python proxy → microsoft/TRELLIS (REST API for Vercel)
license: mit
---

# SplatHub → TRELLIS Thin Proxy

`microsoft/TRELLIS` 를 호출하는 얇은 Python wrapper. Vercel 의 Node
`@gradio/client` JS 가 Gradio 4 Space 와 호환성 이슈로 실제 에러를 숨기는
문제를 우회하기 위해 Python gradio_client 로 호출.

## REST 엔드포인트

```
POST /api/convert    multipart { image: File } → model/gltf-binary
GET  /api/health     { status, target, has_token }
```

## Docker SDK 를 쓰는 이유

Gradio SDK 모드는 HF 가 자동으로 `demo.launch()` 를 호출해서 우리가
`mount_gradio_app()` 한 FastAPI 와 포트 충돌을 일으킴. Docker SDK 로
직접 `uvicorn app:app` 만 실행하도록 제어.

## 환경변수

Space Settings → Variables:
- `HF_TOKEN` — 필수. microsoft/TRELLIS 를 ZeroGPU 우선순위로 호출.
