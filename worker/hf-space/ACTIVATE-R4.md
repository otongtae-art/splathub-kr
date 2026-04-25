# R4 활성화 가이드 — VGGT Pointmap Branch (monster 의 직접 원인 fix)

## 왜 이걸 해야 하나

`worker/hf-space/app.py:430` 에 R4 fix 가 git 에 들어 있지만 HF Space 가
재배포되지 않으면 활성화 안 됨.

R4 핵심:
- 기존: `prediction_mode='Depthmap and Camera Branch'`, `conf_thres=50`
- 신규: `prediction_mode='Pointmap Branch'`, `conf_thres=3`

Depthmap 모드는 per-view depth 를 noisy 카메라 포즈로 unproject → 평면
layer 분리 = "monster" 의 직접 원인. Pointmap Branch 는 모든 뷰를 공유
3D 공간으로 직접 회귀 → view-consistent geometry. conf_thres 50 은 너무
공격적이라 ~80% 점이 잘려 sparse 하게 보임 (공식 Space 기본값은 3).

자율 개선 루프는 자동 배포 못 함 (Vercel HF_TOKEN 이 read-only). 수동
배포가 유일한 활성화 방법.

## 빠른 배포 (Windows PowerShell)

```powershell
cd worker\hf-space
.\deploy.ps1
# → 안 가지고 있으면 'HF token: ' 입력 prompt
```

## 빠른 배포 (Linux/Mac/WSL/git-bash)

```bash
cd worker/hf-space
export HF_TOKEN=hf_xxx_write_token
bash deploy.sh floerw splathub-trellis-proxy
```

## 가장 빠른 활성화 (재배포 없이)

R4 코드는 환경변수로 override 가능. 새 배포 없이도 HF Space Settings
에서 두 변수만 추가하면 됨:

1. https://huggingface.co/spaces/floerw/splathub-trellis-proxy/settings 열기
2. "Variables and secrets" → "New variable":
   - 이름: `VGGT_PREDICTION_MODE`
   - 값: `Pointmap Branch`
3. 또 다른 variable 추가:
   - 이름: `VGGT_CONF_THRES`
   - 값: `3`
4. "Restart this Space" 버튼 클릭 → ~30초 후 활성

⚠️ 단, app.py 가 이미 두 변수를 읽도록 배포되어 있어야 함 (R4 코드).
   현재 HF Space 의 app.py 가 옛 버전(commit 04a763b)이라면 위 env 변수
   설정해도 무시됨 → deploy.ps1 / deploy.sh 로 먼저 코드 push 필요.

## HF Token 발급 방법

1. https://huggingface.co/settings/tokens
2. "New token" → 권한:
   - Type: **Write** (또는 Fine-grained 토큰의 'Repository: Write')
3. token 문자열 복사 (`hf_...` 로 시작)

## 활성화 확인

배포 후 ~1분 뒤 다음 호출:

```bash
curl https://floerw-splathub-trellis-proxy.hf.space/api/health
```

새 사진 → /capture/train → VGGT 호출 → R5 viewer 통계 패널에서:
- `flatness` 가 0.15 미만이던 것이 0.3+ 로 개선
- `retainedCount` 증가
- monster banner 빈도 감소

## R4 가 풀리면 어떤 라운드들이 더 효과 있게 동작하나

| Round | 효과 |
|---|---|
| R5 viewer trim | trim 후에도 충분한 점 → 더 깨끗한 surface |
| R6/R13 sector guide | 좋은 입력 → 좋은 출력 |
| R7-R12 입력 품질 | photogrammetry 가 그 입력을 제대로 활용 |
| R19 monster 폴백 | 발동 빈도 자체가 줄어듦 |

R1-R29 는 모두 R4 가 활성화됐다는 가정 하에 최적화. R4 가 stale 인 동안
은 모든 노력의 효과가 절반 이하.
