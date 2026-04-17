---
title: SplatHub Worker (3D Mesh)
emoji: 🧊
colorFrom: indigo
colorTo: purple
sdk: gradio
sdk_version: 5.5.0
app_file: app.py
pinned: false
short_description: Single image → 3D textured mesh (.glb) — free GPU
license: mit
hardware: zero-a10g
tags:
  - image-to-3d
  - mesh-reconstruction
  - triposr
---

# SplatHub Worker — Single Image → 3D Mesh

HF Spaces **ZeroGPU (NVIDIA H200, 무료)** 에서 돌아가는 실제 3D 재구성 파이프라인.

사진 1장을 올리면 **실제 객체 모양의 3D textured mesh (.glb)** 가 생성됩니다.

## 파이프라인

| 단계 | 모델 | 라이선스 |
|---|---|---|
| 1. 배경 제거 | RMBG-1.4 | MIT |
| 2. Single-image 3D 생성 | TripoSR | MIT |
| 3. 텍스처 추출 | TripoSR 내장 | MIT |

출력: `.glb` (Three.js, Blender, Unity, Godot 모두 열림)

## 웹앱에서 호출

```ts
// splathub/apps/web/lib/workers/hf-space.ts
import { Client } from '@gradio/client';

const client = await Client.connect('YOUR_USERNAME/splathub-3d');
const result = await client.predict('/predict', {
  image: imageFile,
  remove_bg: true,
});
// result.data[0] 는 .glb 파일 URL
```

## 배포 방법

상세한 한국어 가이드: [`docs/FREE-GPU-SETUP.md`](../../docs/FREE-GPU-SETUP.md)

요약:
1. https://huggingface.co 무료 가입
2. Settings → Access Tokens → Write 권한 토큰 발급
3. 로컬에서:
   ```bash
   cd worker/hf-space
   export HF_TOKEN=hf_xxx
   bash deploy.sh YOUR_USERNAME splathub-3d
   ```
4. `https://YOUR_USERNAME-splathub-3d.hf.space` 가 생성됨
5. Vercel 환경변수 `HF_SPACE_URL` 에 이 URL 입력

## 라이선스 주의

TripoSR, RMBG-1.4 모두 MIT 라이선스 — **상업 사용 가능**. 어떤 비상업 모델도
이 파이프라인에 포함되지 않음.
