# Round 48 — 2026-04-25 KST

## 진단

R47 가 per-request override 추가 → 다음 deploy 시 R4 효과 frontend 가
강제 가능. 그러나 frontend 가 server side mode 를 모르므로:
- 사용자에게 "현재 Pointmap (R4) 사용 중" 표시 불가
- A/B 비교 토글에 default mode 가 뭔지 표기 불가
- R4 deploy 됐는지 frontend 가 자가 검증 불가

## 개선

`/api/config` GET 엔드포인트 — 현재 worker 설정 expose.

### 응답
```json
{
  "vggt_prediction_mode": "Pointmap Branch",
  "vggt_conf_thres": 3.0,
  "r4_pointmap_active": true,
  "env_overrides": {
    "VGGT_PREDICTION_MODE": null,  // env 미설정 시 null, 코드 기본값 사용
    "VGGT_CONF_THRES": null
  },
  "supports_per_request_override": true   // R47 활성화 여부
}
```

### 활용 (향후 frontend 라운드)
1. 모니터링: `r4_pointmap_active === true` 면 사용자에게 "✓ Pointmap 모드"
   표시
2. A/B 토글: default 와 함께 "Pointmap (현재) | Depthmap (비교)" 명시
3. 진단: `supports_per_request_override === false` 면 R47 미배포 → 모드
   강제 안 됨
4. 디버그: env 변수가 코드 기본값을 override 했는지 확인

### 코드
```python
@api.get("/api/config")
def config():
    env_mode = os.getenv("VGGT_PREDICTION_MODE")
    env_conf = os.getenv("VGGT_CONF_THRES")
    effective_mode = env_mode or "Pointmap Branch"
    effective_conf = float(env_conf) if env_conf else 3.0
    return {
        "vggt_prediction_mode": effective_mode,
        "vggt_conf_thres": effective_conf,
        "r4_pointmap_active": effective_mode == "Pointmap Branch",
        "env_overrides": {...},
        "supports_per_request_override": True,
    }
```

## 검증

- Python AST parse ✓
- worker only — Vercel 영향 없음

## 배포

✅ Git commit + push (worker)
⏳ HF Space 수동 deploy.ps1 실행 시 R4 + R47 + R48 동시 활성화

## 향후 활용 (frontend 다음 라운드)

```ts
// callConfig() 헬퍼 추가
const cfg = await fetch(`${HF_SPACE_URL}/api/config`).then(r => r.json());
if (cfg.r4_pointmap_active) {
  // 사용자에게 'Pointmap 모드 (실측 향상)' 배지
}
if (!cfg.supports_per_request_override) {
  // R47 미배포 — 모드 토글 hidden
}
```

## 다음 라운드 후보

- Worker timeout/retry 강화
- Frontend callConfig() 추가
- Service worker
- 토글 트랜지션
