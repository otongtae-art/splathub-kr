# 실제 프로덕트 전환 로드맵 — **고정비 $0 보장**

> 현재 상태: 데모 모드 (클라이언트 mock, 샘플 .spz 반환)
> 목표: 사용자 사진 → 실제 3D Gaussian Splat → 영구 저장 → 공유
> **절대 원칙: 어떤 단계에서도 카드 등록 금지. 평생 $0.**

---

## 🔒 $0 보장 메커니즘

```
모든 서비스 → Free tier 한도 내에서만 동작
한도 초과 → 자동으로 "오늘 할당량 소진, 내일 다시" 응답 반환
카드 등록 금지 → 초과하더라도 우리 지갑에서 나가는 돈 0원
```

| 서비스 | 무료 한도 | 초과 시 동작 |
|---|---|---|
| Vercel Hobby | 100GB 대역폭/월, 무제한 Functions | 자동 Pause (과금 없음) |
| Cloudflare R2 | 10GB 저장 + 무제한 egress | 업로드 거부 (카드 미등록 시) |
| Supabase Free | 500MB DB + 50k MAU + 1GB storage | Read-only 전환 (과금 없음) |
| HF Space ZeroGPU (free) | 일일 5분 GPU 공유 | 큐 대기 → 타임아웃 |
| Modal 신규 크레딧 | $30/월 (매월 자동 충전, 카드 불필요) | 크레딧 0 → 요청 거부 |
| Hugging Face Datasets | 공개 파일 **사실상 무제한** | N/A (R2 대체 스토리지) |
| Brush WebGPU | 사용자 PC GPU (우리 서버 무관) | 영구 무료 |

**이 표의 어떤 셀도 "카드 등록 시 과금 발생"을 포함하지 않는다.**

---

## 구성요소 체크리스트

| # | 레이어 | 현재 | 실제 프로덕트 | 비용 |
|---|---|---|---|---|
| 1 | 3D 변환 GPU | mock | **HF Space ZeroGPU free + Modal 크레딧 Ladder** | $0 |
| 2 | 파일 스토리지 | 브라우저 메모리 | **Cloudflare R2** (10GB 한도 내) | $0 |
| 3 | DB | 인메모리 | **Supabase Postgres** (500MB 한도 내) | $0 |
| 4 | 인증 | 없음 | **Supabase Auth** (이메일/Google/카카오) | $0 |
| 5 | 실시간 진행률 | setTimeout | **Supabase Realtime** | $0 |
| 6 | 결제 (Phase 2) | 없음 | Stripe Connect (pass-through) | $0 고정비 |

**월 고정비 총합: $0, 영구 보장.**

---

## 1. Supabase 연결 (DB + Auth) — 10분

1. https://supabase.com → GitHub으로 가입 (신용카드 입력 창 절대 나오지 않음)
2. "New project" 클릭 → 이름 `splathub`, 리전 `Seoul (ap-northeast-3)`
3. 2분 대기 후 Settings → API 에서 3개 키 복사:
   - `Project URL`
   - `anon public`
   - `service_role`

**Vercel 환경변수 등록**:
```bash
cd apps/web
vercel env add NEXT_PUBLIC_SUPABASE_URL production       # Project URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production  # anon
vercel env add SUPABASE_SERVICE_ROLE_KEY production      # service_role
```

**DB 스키마**:
```bash
cd ../..
npx supabase link --project-ref <your-project-ref>
npx supabase db push   # 00001_init.sql 실행
```

**⚠️ 카드 미등록 확인**: Supabase 대시보드 → Organization → Billing → Payment method에 **아무것도 등록하지 않기**. 500MB 초과하면 read-only로 전환되지만 과금 발생 안 함.

---

## 2. Cloudflare R2 연결 (파일 스토리지) — 10분

1. https://dash.cloudflare.com → 가입 (카드 없이 가능)
2. R2 메뉴 → "Create bucket" → 이름 `splathub-prod`
3. 버킷 → Settings → "Public access" 활성화 → Public URL 복사
4. API → "Create API Token" → R2 → "Object Read & Write" → 발급

**Vercel 환경변수**:
```bash
vercel env add R2_ACCOUNT_ID production           # https://dash.cloudflare.com/<account_id>
vercel env add R2_ACCESS_KEY_ID production
vercel env add R2_SECRET_ACCESS_KEY production
vercel env add R2_BUCKET production                # splathub-prod
vercel env add R2_PUBLIC_BASE production           # https://pub-XXXX.r2.dev
```

**CORS 정책** (버킷 → CORS policy):
```json
[{
  "AllowedOrigins": ["https://splathub.vercel.app", "http://localhost:3000"],
  "AllowedMethods": ["GET", "PUT", "HEAD"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3600
}]
```

**⚠️ 카드 미등록 확인**: Cloudflare → Billing 메뉴에 카드 등록하지 않기. **R2는 카드 없이 10GB까지 무료로 운영 가능** (egress 무제한).

**10GB 초과 시 자동 정리**:
```sql
-- GitHub Actions cron에서 매주 실행
-- 오래된 공개 모델을 HF Dataset으로 마이그레이션
-- 비공개 모델은 유료 전환 알림 후 삭제 경고
```

---

## 3. Hugging Face Space 배포 (GPU 엔진) — 20분

### 1순위: ZeroGPU Free Tier

1. https://huggingface.co → 가입 (카드 불필요)
2. Settings → Access Tokens → 토큰 발급 (`write` 권한)
3. VGGT-1B-Commercial 접근 신청: https://huggingface.co/facebook/VGGT-1B-Commercial → "Request access" (무료, 자동 승인)
4. Space 생성: https://huggingface.co/new-space
   - Name: `splat-worker-free`
   - SDK: Gradio
   - Hardware: **`Zero NVIDIA A10G` (무료 ZeroGPU)**
   - Visibility: Private (추천)

5. 로컬에서 배포:
```bash
cd worker/hf-space
pip install huggingface_hub
huggingface-cli login  # 토큰 입력
git init
git remote add hf https://huggingface.co/spaces/<username>/splat-worker-free
git add .
git commit -m "initial worker"
git push hf main
```

6. Space Settings → Variables 에 환경변수 추가:
```
HF_TOKEN=hf_xxx                                    # VGGT 가중치 다운로드용
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ...               # Step 2와 동일
JOB_CALLBACK_URL=https://splathub.vercel.app/api/jobs/{job_id}/callback
JOB_CALLBACK_SECRET=<openssl rand -hex 32>
```

**ZeroGPU Free Tier 제약**:
- 일일 GPU 사용 5분 제한 (유저 간 공유 풀)
- 요청 간 최소 5분 쿨다운
- `@spaces.GPU(duration=60)` 한 번 호출당 최대 60초

이 제약 때문에 Free tier만으로는 사용자가 많아지면 대기가 길어진다. → Ladder 2단 필요.

### 2순위: Modal $30 크레딧 (카드 미등록 유지)

1. https://modal.com → GitHub 가입 (카드 불필요)
2. 신규 가입 시 **매월 $30 크레딧 자동 충전** (별도 신청 없음)
3. **절대 카드 등록하지 말 것** — 크레딧 소진 시 자동으로 함수 실행 거부됨

배포:
```bash
cd worker/modal
pip install modal
modal token new   # 브라우저 OAuth
modal deploy app.py
```

**Vercel 환경변수**:
```bash
vercel env add MODAL_TOKEN_ID production
vercel env add MODAL_TOKEN_SECRET production
```

**소진 감지 & 차단 로직**:
```ts
// apps/web/lib/workers/modal.ts
async function checkModalCredits(): Promise<boolean> {
  // Modal API로 남은 크레딧 조회
  // < $1이면 false 반환 → /api/jobs 에서 "오늘 할당량 소진" 응답
}
```

### 3순위: 브라우저 WebGPU (Brush) — 영구 무료

- `/convert/local` 페이지에서 사용자 PC의 GPU로 직접 학습
- 우리 서버 비용 0, 사용자 한 명당 모델 1개 생성
- 품질은 낮지만 서버 소진 시 대체 수단
- M3 마일스톤에서 Brush WASM 번들 임베드

---

## 4. Vercel 환경변수 등록 + 코드 전환 — 10분

모든 환경변수 등록 후 기존 mock 플로우를 실제로 전환:

**Vercel 대시보드에서 일괄 설정** (또는 CLI):
```bash
cd apps/web
vercel env add HF_SPACE_URL production            # https://<username>-splat-worker-free.hf.space
vercel env add HF_API_TOKEN production            # HF 토큰
vercel env add JOB_CALLBACK_SECRET production     # Space와 동일
```

**코드 전환 3줄 변경**:

`apps/web/components/upload/PhotoDropzone.tsx`:
```tsx
// 수정 전 (mock)
const id = startMockJob({ thumbnailUrl });

// 수정 후 (real)
const { uploads } = await fetch('/api/upload/presign', { method: 'POST', body: JSON.stringify({ files: items.map(i => ({ name: i.file.name, size: i.file.size, mime: i.file.type })) }) }).then(r => r.json());
await Promise.all(uploads.map((u, idx) => fetch(u.url, { method: 'PUT', headers: u.headers, body: items[idx].file })));
const { job_id } = await fetch('/api/jobs', { method: 'POST', body: JSON.stringify({ upload_ids: uploads.map(u => u.upload_id), kind: 'photo_to_splat' }) }).then(r => r.json());
onJobCreated(job_id, thumbnailUrl);
```

`apps/web/components/upload/JobProgress.tsx`:
```tsx
// 수정 전 (mock)
const unsubscribe = subscribeMockJob(jobId, setSnap);

// 수정 후 (real — Supabase Realtime 또는 폴링)
useEffect(() => {
  const timer = setInterval(async () => {
    const res = await fetch(`/api/jobs/${jobId}`);
    const data = await res.json();
    setSnap(data);
    if (['done', 'failed'].includes(data.status)) clearInterval(timer);
  }, 1500);
  return () => clearInterval(timer);
}, [jobId]);
```

배포:
```bash
git add -A
git commit -m "feat: real GPU engine — mock 해제"
git push origin main
# Vercel 자동 재배포
```

---

## 5. 테스트 시나리오

```bash
# 로컬
cp apps/web/.env.example apps/web/.env.local
# .env.local에 Step 1-3의 환경변수 모두 채우기
cd apps/web
npm run dev

# 브라우저
open http://localhost:3000
# 실제 사진 3장 업로드 → 30-90초 대기 → 진짜 3D 모델
```

---

## 6. 비용 모니터링 자동화

`.github/workflows/cost-monitor.yml` (매일 실행, public repo 무료):

```yaml
name: Cost monitor
on:
  schedule: [{ cron: '0 9 * * *' }]  # 매일 09:00 KST
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Supabase 사용량 체크
        run: |
          USAGE=$(curl -s -H "Authorization: Bearer ${{ secrets.SUPABASE_TOKEN }}" \
            https://api.supabase.com/v1/projects/<ref>/usage | jq '.db_size')
          if [ "$USAGE" -gt 400000000 ]; then  # 400MB (500MB 한도의 80%)
            echo "::warning::Supabase DB 80% 도달"
          fi

      - name: R2 저장량 체크
        run: |
          SIZE=$(aws s3 ls s3://splathub-prod --recursive --endpoint-url ${{ secrets.R2_ENDPOINT }} --summarize | grep Total | awk '{print $3}')
          if [ "$SIZE" -gt 8000000000 ]; then  # 8GB
            echo "::warning::R2 80% 도달 → 오래된 모델 HF Dataset으로 이전"
            # TODO: 이전 스크립트 실행
          fi

      - name: Modal 크레딧 체크
        run: |
          BAL=$(curl -s -H "Authorization: Bearer ${{ secrets.MODAL_TOKEN }}" \
            https://api.modal.com/billing/balance | jq '.remaining_usd')
          if [ "$(echo "$BAL < 5" | bc)" = "1" ]; then
            echo "::warning::Modal 크레딧 <$5 → 월말까지 ZeroGPU로만 운영"
          fi
```

---

## 7. 문제 해결

### "Modal 크레딧 소진 후 카드 요청"
- **절대 등록하지 말 것.** Modal은 카드 미등록 시 자동으로 함수 실행을 중단한다.
- `/api/jobs`에서 Modal 호출 전 잔액 확인 → 낮으면 HF Space로 fallback → 둘 다 실패면 사용자에게 "오늘 할당량 소진" 메시지

### "Supabase 500MB 초과"
- 오래된 비공개 모델 정리 cron 추가
- 공개 모델은 HF Dataset (무제한)으로 메타데이터 포함 이전
- 그래도 한도 도달 시 신규 업로드 거부 (과금 절대 발생 안 함)

### "HF Space ZeroGPU 큐 대기 길어짐"
- Modal 크레딧이 있으면 자동 fallback (Ladder 2순위)
- 둘 다 안 되면 `/convert/local` (Brush WebGPU) 유도

### "트래픽 폭증으로 Vercel Hobby 100GB 초과"
- Vercel이 자동으로 프로젝트를 "Paused" 상태로 전환 (과금 없음)
- 복구 방법: 월초까지 대기 OR GitHub Actions로 정적 HTML 프리빌드를 Cloudflare Pages로 미러

---

## 8. Phase 2 전환 기준 (여전히 $0 고정비 유지)

무료 베타가 포화 상태에 도달하면 마켓플레이스를 엽니다. 이때도 **우리 지갑에서 나가는 돈은 0**:

- Stripe Connect Express: **월 고정비 $0**, 결제 발생 시 2.9% + $0.30 수수료만 (사용자 결제에서 자동 차감)
- Toss Payments: 월 고정비 $0, 한국 카드 3% 수수료만
- GPU 비용: 유료 사용자 결제 금액 ≥ GPU 사용 비용 → **pass-through**, 절대 손실 구조 아님

전환 조건:
1. 무료 사용자 1000명 달성
2. Supabase/R2가 Pro($25+$5)로 올라갈 시점
3. 마켓플레이스 매출로 Pro 비용을 한 달 안에 커버 가능

그전까지는 **지금 이 $0 구조 그대로 운영**.
