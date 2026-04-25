# Round 4 — 2026-04-25 KST

## 진단 (general-purpose 서브에이전트)

VGGT 결과가 "monster" (평면 레이어, 객체 인식 실패) 로 나오는 구조적 원인:

`worker/hf-space/app.py:438` 에서 `prediction_mode="Depthmap and Camera Branch"` 사용 중.

이 모드는 per-image depth map 을 추정한 뒤 추정된 카메라 포즈로 unproject 해서
3D 공간에 재구성. 핸드헬드 촬영(좁은 baseline + 노이즈 포즈)에서는 각 뷰의
depth 가 noisy 포즈로 unproject 되면서 **disconnected planar layer** 가 쌓임.
→ 이게 "monster / 평면 레이어" 의 직접 원인.

추가로 `conf_thres=50` 은 너무 공격적이라 ~80% 의 point 가 잘려나가서
sparse pointcloud 처럼 보임. 공식 VGGT Space 기본값은 `3`.

## 개선

**Pointmap Branch** 로 전환. VGGT 의 직접 3D pointmap head 를 사용해
모든 뷰를 공유 3D 공간으로 한 번에 회귀 → view-consistent geometry.

```python
# worker/hf-space/app.py:430~448
prediction_mode = os.getenv("VGGT_PREDICTION_MODE", "Pointmap Branch")
conf_thres = float(os.getenv("VGGT_CONF_THRES", "3"))

recon_result = client.predict(
    target_dir=target_dir,
    conf_thres=conf_thres,
    ...
    prediction_mode=prediction_mode,
    api_name="/gradio_demo",
)
```

## 검증

- `python -m ast` syntax check ✓
- `npm run build` (apps/web) ✓ — 영향 없음 (백엔드 only)
- 리스크: Pointmap 이 Depthmap 보다 약간 느림 (~5-10% ZeroGPU 시간 ↑). 120s 한도 내.

## 배포 상태

- ✅ Git commit (이 PR)
- ❌ HF Space 자동 push: Vercel HF_TOKEN 이 read-only scope 라 401.
  Clone 은 성공했지만 push 시 인증 실패.
- 🔧 **사용자 액션 필요**:
  ```bash
  export HF_TOKEN=hf_xxx  # write 권한
  cd worker/hf-space && bash deploy.sh floerw splathub-trellis-proxy
  ```

또는 Space Settings 에서 변수 `VGGT_PREDICTION_MODE=Pointmap Branch`,
`VGGT_CONF_THRES=3` 직접 설정 + Restart 만으로도 활성화 가능.
(현재 코드는 환경변수 미설정 시 옛 default 인 Depthmap+50 으로 작동)

## 다음 라운드 후보

- Pointmap 결과를 받았을 때 viewer 가 자동으로 카메라 거리/FOV 조정 (현재 일부 모델이 카메라 밖에 위치)
- Auto-capture mode (orientation 변화 10° 마다 자동 셔터)
- VGGT-X (sparse-view splat 출력) 통합 — pointcloud 없이 바로 .splat
- TRELLIS.2 + VGGT 결과 비교 토글 (사용자가 두 가지 보고 선택)
