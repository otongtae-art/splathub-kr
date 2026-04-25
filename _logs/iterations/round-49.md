# Round 49 — 2026-04-25 KST

## 진단

R47/R48 worker 변경이 git 에 있음 (per-request override + /api/config 엔드포인트).
그러나 frontend 가 이를 활용 안 하면 worker 만의 발전이고, 사용자는 R4
활성화를 인지 못 함.

→ frontend 가 /api/config 호출하고, R4 활성 시 사용자에게 명시 표시.

## 개선

### 1. `lib/hfSpace.ts` — callConfig() 헬퍼 + WorkerConfig 타입

```ts
export type WorkerConfig = {
  vggt_prediction_mode: string;
  vggt_conf_thres: number;
  r4_pointmap_active: boolean;
  env_overrides?: { ... };
  supports_per_request_override?: boolean;  // R47 활성화 여부
};

export async function callConfig(): Promise<WorkerConfig | null> {
  try {
    const base = HF_SPACE_URL.replace(/\/api\/[^/]+$/, '');
    const res = await fetch(`${base}/api/config`, { cache: 'no-store' });
    if (!res.ok) return null;  // R47/R48 미배포 면 404 → null
    return await res.json();
  } catch {
    return null;  // 네트워크/CORS 실패 silent
  }
}
```

### 2. train/page.tsx — mount 시 호출 + 배지 표시
```tsx
const [workerConfig, setWorkerConfig] = useState<WorkerConfig | null>(null);

useEffect(() => {
  callConfig().then(setWorkerConfig);
}, []);

// 헤더 (VGGT view 만):
<span>VGGT · photogrammetry · {N}장</span>
{workerConfig?.r4_pointmap_active && (
  <span title="Pointmap Branch — view-consistent geometry"
        className="rounded bg-accent/20 px-1.5 py-0.5 ... text-accent">
    ✓ Pointmap
  </span>
)}
```

### 그래프(graceful) 동작
- R47/R48 worker 미배포 → /api/config 404 → workerConfig=null → 배지 안 뜸
- R47/R48 배포 + R4 활성 → 배지 표시 (사용자 안심 신호)
- R47/R48 배포 + R4 미활성 → 배지 안 뜸 (정직)

## 검증

- `npm run build` ✓
- `/capture/train` 14.4 → 14.7 kB (+0.3)
- TS strict 통과 (WorkerConfig 타입 import)
- silent fail — 네트워크 에러 시 기존 동작 유지

## 배포

✅ Git commit + push (frontend)
⏳ R47/R48 worker deploy 후 자동 활성화

## R4 + R47 + R48 + R49 한 번 deploy 으로 활성화되는 것

사용자가 deploy.ps1 한 번 실행 후:
1. **R4**: VGGT Pointmap Branch + conf_thres=3 → monster ↓
2. **R47**: per-request override → frontend 가 모드 강제 가능
3. **R48**: /api/config 엔드포인트 → R4 상태 expose
4. **R49**: frontend 가 자동 호출 → 사용자에게 '✓ Pointmap' 배지

→ 모든 라운드 효과가 한 번에 사용자에게 visible.

## 다음 라운드 후보

- Worker timeout/retry
- A/B 토글 (R47 supports_per_request_override 활용)
- Service worker
- 토글 트랜지션
