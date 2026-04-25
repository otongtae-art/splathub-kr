# Round 51 — 2026-04-25 KST

## 진단

R47 worker 가 `/api/vggt` 에 `prediction_mode` / `conf_thres` form param
override 추가. R49 frontend 가 `/api/config` 호출해 R4 활성화 표시.
그러나 frontend `callVggt` 가 **실제 호출 시 mode 명시 안 함** → R47
배포돼도 env 미설정이면 default depthmap.

→ Frontend 가 form 에 mode 명시 → R47 + R4 deploy 후 env 의존 zero.

## 개선

`apps/web/lib/hfSpace.ts` `callVggt()` 의 FormData 에 명시 추가.

```ts
const fd = new FormData();
for (const img of resized) {
  fd.append('images', img);
}
// round 51 추가:
fd.append('prediction_mode', 'Pointmap Branch');
fd.append('conf_thres', '3');
```

### Backward compatibility
- **R47 미배포 worker**: form 필드 ignore (FastAPI 가 unknown field 무시) → 기존 default 사용 (Depthmap 50)
- **R47 배포 + R4 코드**: form override 우선 → Pointmap Branch 강제 ✓
- **R47 배포 + 사용자가 env 로 다른 mode 설정**: form override 가 env 보다 우선 → 항상 Pointmap

→ 어떤 worker 상태에서도 안전.

## 검증

- `npm run build` ✓
- `/capture/train` 14.7 kB (변동 없음 — 2 줄 추가)
- TS strict 통과
- 호환성: R47 미배포 환경에서 form 필드 무시 (FastAPI 정상 동작)

## 배포

✅ Git commit + push (frontend)
⏳ R47 worker deploy 후 자동 활성화

## R4 + R47 + R49 + R51 통합 효과

사용자가 `worker/hf-space/deploy.ps1` 한 번 실행 후:
1. **R4**: VGGT 코드에 Pointmap Branch / conf_thres=3 default
2. **R47**: per-request override 가능 (env 없이도 frontend 가 명시)
3. **R49**: frontend 가 /api/config 호출해 r4_pointmap_active 표시
4. **R51**: frontend 가 callVggt 시 form 에 명시 → 항상 Pointmap 강제

→ env 변수 설정 불필요. 사용자가 deploy.ps1 만 실행하면 R4 모든 효과 받음.

## 다음 라운드 후보

- A/B 토글 (R47 활용해 'Pointmap vs Depthmap' 사용자 비교)
- Service worker (offline)
- 토글 트랜지션
- VGGT 결과 metadata embed (.glb 옆 JSON sidecar)
