# 무료 GPU 서버 10분 설정 가이드

## 결과

설정 완료 후 사용자가 사진 1장만 올려도 **NVIDIA H200 GPU에서 TripoSR이 돌아 실제 객체 모양의 3D mesh(.glb)** 가 생성됩니다. 브라우저 프리뷰 품질이 아니라 **진짜 3D**입니다.

- 모델: [TripoSR (MIT)](https://github.com/VAST-AI-Research/TripoSR)
- GPU: HF Spaces ZeroGPU (NVIDIA H200, 70GB VRAM)
- 비용: **영구 $0**
- 처리: 한 장당 3-5초

---

## 단계 1 — Hugging Face 계정 (2분)

1. https://huggingface.co → **Sign Up** (이메일만, 카드 불필요)
2. 이메일 확인
3. Profile → **Settings** → **Access Tokens** → **New token**
   - Name: `splathub-deploy`
   - Type: **Write**
   - Create → 토큰 복사 (`hf_xxx...`)

---

## 단계 2 — Space 자동 배포 (5분)

로컬에서 프로젝트 루트로 이동:

```bash
cd worker/hf-space
pip install huggingface_hub   # 아직 없으면

export HF_TOKEN=hf_xxx  # 발급받은 토큰
bash deploy.sh YOUR_HF_USERNAME splathub-3d
```

스크립트가 자동으로:
1. HF에 빈 Space 생성
2. `app.py`, `requirements.txt`, `pre-requirements.txt`, `README.md` 업로드
3. Space URL 출력

출력 예시:
```
✓ 배포 완료

Space 대시보드: https://huggingface.co/spaces/YOUR_HF_USERNAME/splathub-3d
API URL: https://YOUR_HF_USERNAME-splathub-3d.hf.space
```

**⚠️ 첫 빌드는 5-10분 걸립니다** — HF가 TripoSR 의존성을 컴파일하고 모델 가중치를 캐시합니다. Space 대시보드에서 로그 모니터링 가능.

빌드가 끝나면 **Running** 상태가 되고 Gradio UI가 열립니다. 브라우저에서 직접 이미지 하나 올려 테스트해 보세요.

---

## 단계 3 — Vercel 환경변수 주입 (1분)

```bash
cd apps/web
vercel env add NEXT_PUBLIC_HF_SPACE_URL production
# → https://YOUR_HF_USERNAME-splathub-3d.hf.space 붙여넣기

vercel --prod --yes
```

Vercel이 재배포되면 **이후 모든 변환이 자동으로 HF Space로 라우팅**되어 진짜 3D가 생성됩니다.

---

## 확인

https://splathub.vercel.app 에서:

1. 사진 1장 업로드
2. 콘솔에 찍히는 로그:
   ```
   [mockFlow] using hf_space backend
   [hfSpace] uploading image to ...
   [hfSpace] predict event_id=xxx
   [hfSpace] heartbeat ... (H200 GPU 추론 중)
   [hfSpace] complete, glb size=1234567
   [MeshViewer] GLB loaded
   ```
3. 뷰어에 **실제 텍스처 입힌 3D mesh** 가 렌더링됨 (원통 껍데기 아님)

---

## 제한 & 폴백

### HF Space Free 계정 quota
- 하루 몇 분 GPU 사용 (정확한 수치는 [HF 문서](https://huggingface.co/docs/hub/en/spaces-zerogpu) 참조)
- quota 소진 시 Gradio에서 자동으로 큐 대기
- 완전히 못 돌릴 때 → 우리 앱이 자동으로 브라우저 fallback 으로 전환

### 더 많이 쓰고 싶다면
- HF PRO: $9/월 → 25분 H200/일, 8배 quota
- 아직도 브라우저 fallback 은 유지 — PRO 결제 없이도 계속 동작

### Space 가 sleeping 상태일 때
- HF 무료 Space 는 **48시간 미사용 시 sleeping** → 첫 호출에 20-30초 wakeup 추가
- 이후 호출은 즉시

---

## 라이선스 (100% 상업 사용 가능)

우리 파이프라인의 모든 구성요소:
- **TripoSR** — MIT (Stability AI / VAST-AI Research)
- **RMBG-1.4** — MIT (briaai)
- **Gradio** — Apache 2.0
- **HF Transformers** — Apache 2.0

비상업(CC BY-NC)인 RMBG-2.0, Splatt3R, graphdeco 3DGS 원본은 **의도적으로 제외**.

---

## 문제 해결

### Space 빌드 실패 (`onnxruntime` 에러 등)
`requirements.txt` 와 `pre-requirements.txt`가 올바르게 업로드됐는지 확인. HF Space 에는 `pre-requirements.txt` 로 GitHub 패키지를 먼저 설치.

### 변환이 너무 느림 (30초 이상)
- 첫 호출은 모델 가중치 다운로드로 느림 — 두 번째부터 정상
- Space 가 sleeping 상태였을 수 있음 — wakeup 대기

### "서버 변환 실패 → 브라우저 변환으로 전환" 메시지
- HF Space 가 일시 다운 또는 quota 소진
- 브라우저 fallback 이 자동 동작하므로 작업 중단 안 됨
- quota 는 24시간 후 자동 리셋
