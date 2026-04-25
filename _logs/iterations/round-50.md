# Round 50 — 2026-04-25 KST 🎯 50라운드 마일스톤

## 진단

R32 frontend classifyVggtError() 가 5종 에러 분류 + 사용자 advice 제공.
그러나 worker side 에서 transient 에러 (502/503/504, timeout, connection
glitch) 가 발생하면 단일 실패로 사용자에게 전달. HF Space 가 cold start
+ GPU 큐 일시 폭주로 흔히 502/503 반환 — 5초 후 같은 호출이 성공하는
경우 多.

→ Worker side 에서 transient 에러 자동 재시도 → 사용자 노출 ↓.

## 개선

### 1. `_is_transient_error(e)` 헬퍼
```python
def _is_transient_error(e: Exception) -> bool:
    msg = str(e).lower()
    if any(s in msg for s in ('502','503','504','gateway','timeout',
                              'timed out','connection','reset','temporarily')):
        return True
    if 'quota' in msg or 'rate limit' in msg or '429' in msg:
        return False  # 영구
    if 'permission' in msg or '401' in msg or '403' in msg:
        return False  # 영구
    return False
```

### 2. `_with_retry(fn, label, max_attempts=2)` 헬퍼
```python
def _with_retry(fn, *, label, max_attempts=2):
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except Exception as e:
            if attempt >= max_attempts or not _is_transient_error(e):
                raise
            backoff = 1 if attempt == 1 else 3
            logger.warning(f"[{label}] attempt {attempt} failed... retrying in {backoff}s")
            time.sleep(backoff)
```

지수 backoff: 1s, 3s. 첫 시도 + 1 retry = 총 2회.

### 3. VGGT upload + recon 양쪽 wrap
```python
upload_result = _with_retry(
    lambda: client.predict(input_video=None, input_images=[...], api_name="..."),
    label="vggt-upload",
)
# (...)
recon_result = _with_retry(
    lambda: client.predict(target_dir=target_dir, ..., api_name="/gradio_demo"),
    label="vggt-recon",
)
```

## 검증

- Python AST parse ✓
- Worker only — Vercel 영향 없음
- 영구 에러 (quota, permission) 는 즉시 raise — 무한 retry 방지

## 배포

✅ Git commit + push (worker)
⏳ HF Space 수동 deploy.ps1 시 R4 + R47 + R48 + R50 동시 활성화

## 50 라운드 회고

- R1-R3: Poisson mesh 시도 → 실패 → 클라이언트 리사이즈
- R4 (대기): Pointmap Branch (monster fix 의 root cause)
- R5: viewer outlier trim + 자가진단
- R6, R13, R31: 미니맵 / 추천 / 샘플 링크
- R7-R12, R14-R17, R20-R22, R44-R45: 입력 품질 + UX 폴리시
- R18, R19, R24, R25, R32: 결과 페이지 회복 경로
- R26, R27, R28, R29, R34: 다운로드 / 세션 / 자동 학습
- R30: R4 활성화 도구 (deploy.ps1, ACTIVATE-R4.md)
- R33, R35-R37: mobile/reliability/error boundary
- R38-R40: PWA (manifest + install prompts)
- R41-R43: 카메라 권한 + iOS DeviceMotion
- R46: VGGT 통계 패널
- R47-R49: Worker per-request override + /api/config + frontend 배지
- R50: Worker timeout/retry

50 라운드 동안 모든 frontend 입력/출력 / 회복 경로 / UX 폴리시가 거의 다 처리됨.
남은 큰 미활성: **R4 (HF Space deploy)** — 사용자 액션 필요.

## 다음 라운드 후보

- A/B 토글 (Pointmap vs Depthmap, R47 활용 + R48 config 표시)
- Service worker (offline)
- 토글 트랜지션
- Frontend 가 callVggt 시 prediction_mode='Pointmap Branch' 명시 (R47 활용)
