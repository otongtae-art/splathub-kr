---
title: SplatHub TRELLIS Proxy
emoji: 🧊
colorFrom: indigo
colorTo: purple
sdk: gradio
sdk_version: 4.44.1
app_file: app.py
pinned: false
short_description: Thin Python proxy → microsoft/TRELLIS (REST API for Vercel)
license: mit
---

# SplatHub → TRELLIS Thin Proxy

이 Space 는 `microsoft/TRELLIS` 를 호출하는 **얇은 Python wrapper**. Vercel 의
Node `@gradio/client` JS 가 Gradio 4 Space 와 호환성 이슈로 실제 에러를 숨기는
문제를 우회하기 위해 만듦.

## REST 엔드포인트

```
POST /api/convert    multipart { image: File } → model/gltf-binary
GET  /api/health     { status, target, has_token }
```

## 우리 웹앱에서 호출

```ts
const fd = new FormData();
fd.append('image', file);
const res = await fetch('https://floerw-splathub-trellis-proxy.hf.space/api/convert', {
  method: 'POST',
  body: fd,
});
if (!res.ok) throw new Error(await res.text());
const glbBytes = new Uint8Array(await res.arrayBuffer());
```

## 환경변수

Space Settings → Variables:
- `HF_TOKEN` — 필수. microsoft/TRELLIS 를 ZeroGPU 우선순위로 호출하기 위한 토큰.
