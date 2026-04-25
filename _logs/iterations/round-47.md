# Round 47 — 2026-04-25 KST

## 진단

R4 (Pointmap Branch + conf_thres=3) 가 26 라운드째 backend 활성화 대기.
사용자가 HF Space env 변수 설정 또는 deploy.ps1 실행해야 적용.

또한 frontend (Vercel) 도 deploy 한도 (100/day) 도달로 신규 변경 즉시
배포 어려움.

전략: **다음 manual deploy 한 번으로 R4 + 추가 worker 개선 모두 활성화**
되도록 worker 코드 풍성하게.

## 개선

**`/api/vggt` 엔드포인트에 per-request override** 추가 — env 변수 설정
없이도 frontend 가 호출 시 `prediction_mode` / `conf_thres` 를 form param
으로 직접 지정 가능.

### 1. `convert_images_to_glb_vggt(image_paths, prediction_mode_override=None, conf_thres_override=None)`
인자 우선순위: **인자 > env > 기본값**

```python
prediction_mode = (
    prediction_mode_override
    if prediction_mode_override
    else os.getenv("VGGT_PREDICTION_MODE", "Pointmap Branch")
)
conf_thres = (
    conf_thres_override
    if conf_thres_override is not None
    else float(os.getenv("VGGT_CONF_THRES", "3"))
)
```

### 2. `/api/vggt` Form 파라미터 노출
```python
@api.post("/api/vggt")
async def vggt_endpoint(
    images: list[UploadFile] = File(...),
    prediction_mode: str | None = Form(default=None),
    conf_thres: float | None = Form(default=None),
):
    ...
    glb_path = convert_images_to_glb_vggt(
        tmp_paths,
        prediction_mode_override=prediction_mode,
        conf_thres_override=conf_thres,
    )
```

`Form` import 추가 (fastapi).

### 3. 사용 시나리오
```bash
# 기본 (env 또는 default)
curl ... -F "images=@a.jpg" -F "images=@b.jpg"

# 명시적 Pointmap (env 미설정 환경에서도 R4 활성)
curl ... -F "images=@a.jpg" -F "images=@b.jpg" \
         -F "prediction_mode=Pointmap Branch" -F "conf_thres=3"

# Depthmap 비교
curl ... ... -F "prediction_mode=Depthmap and Camera Branch"
```

## 검증

- Python AST parse ✓
- Frontend npm build ✓ (영향 없음 — 호환 필드 추가만)
- R4 + R47 + 다른 worker 개선이 한 번의 deploy.ps1 실행으로 동시 활성화

## 배포

✅ Git commit + push (worker 변경, Vercel 영향 없음)
⏳ HF Space 수동 redeploy 필요 (deploy.ps1 + R4 와 함께)

## 향후 활용

R47 활성화 후 (deploy.ps1 실행), 다음 frontend 라운드에서:
- callVggt 호출 시 `prediction_mode='Pointmap Branch'` 명시
- env 의존 없이 R4 효과 보장
- A/B 토글 ('Pointmap' vs 'Depthmap') 으로 사용자가 두 모드 비교

## 다음 라운드 후보

- Worker `/api/config` 엔드포인트 (현재 활성 모드 expose)
- Service worker (offline)
- 토글 트랜지션
- 워커 timeout/retry 로직 강화
