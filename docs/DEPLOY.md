# 배포 & 아카이빙 가이드

## 0. git 초기 상태

저장소는 이미 `git init` + 첫 아카이빙 커밋이 완료된 상태입니다.

```bash
# 확인
git log --oneline
# 예: 8629e51 init: SplatHub-KR M1 skeleton — photo→3D Gaussian Splat platform
```

로컬 git user는 자리표시자(`SplatHub <splathub@example.com>`)로 설정돼 있습니다.
본인 정보로 바꾸려면:

```bash
git config --local user.name  "Your Name"
git config --local user.email "you@example.com"
```

향후 커밋부터 이 정보가 적용됩니다.

## 1. GitHub 원격 저장소 만들기

### GitHub CLI 가 있다면

```bash
cd /path/to/splathub
gh repo create splathub-kr --private --source=. --remote=origin --push
```

`--private` 대신 `--public` 을 원하면 공개. 기본 브랜치는 `main`.

### 웹 UI로 만든다면

1. https://github.com/new 에서 저장소를 생성 (저장소 이름 예: `splathub-kr`)
   - **체크 해제**: README, .gitignore, LICENSE 추가 (이미 저장소에 있습니다)
2. 생성 후 안내에 따라 remote 연결:

```bash
cd /path/to/splathub
git remote add origin https://github.com/<OWNER>/splathub-kr.git
git push -u origin main
```

## 2. 서브모듈/서브트리 관리 (추후)

- `apps/editor/` (SuperSplat MIT fork)는 M6 에서 git subtree로 연결합니다:
  ```bash
  git subtree add --prefix=apps/editor https://github.com/playcanvas/supersplat.git main --squash
  ```
- `worker/hf-space/`는 M1-5 에서 Hugging Face Space로 subtree push 합니다:
  ```bash
  git subtree push --prefix=worker/hf-space hf main
  ```
  (`hf` 원격은 `https://USER:TOKEN@huggingface.co/spaces/OWNER/splat-worker-free`)

## 3. GitHub Actions 파이프라인 (M2 이후)

- `.github/workflows/ci.yml`: lint + typecheck + build
- `.github/workflows/deploy-hf-space.yml`: `worker/hf-space/` subtree → HF Space
- `.github/workflows/db-heartbeat.yml`: 매일 Supabase heartbeat 쿼리
- `.github/workflows/cost-check.yml`: 매일 GPU/스토리지 비용 합산 감시

## 4. Cloudflare Pages 배포

1. Cloudflare 대시보드 → Workers & Pages → Create → Pages → Connect to Git
2. 저장소 선택 후:
   - Framework preset: Next.js
   - Build command: `pnpm --filter @splathub/web build`
   - Build output directory: `apps/web/.next`
   - Root directory: `/`
3. Environment variables는 `apps/web/.env.example` 참조. 최소 v1:
   - `HF_SPACE_URL`, `JOB_CALLBACK_SECRET`, `R2_*`

## 5. Hugging Face Space 배포

1. https://huggingface.co/new-space — Gradio SDK, Free 계정 (ZeroGPU 미적용 상태로 먼저 테스트)
2. 로컬 저장소에서 Space remote 추가:
   ```bash
   git remote add hf https://USER:$HF_TOKEN@huggingface.co/spaces/<OWNER>/splat-worker-free
   git subtree push --prefix=worker/hf-space hf main
   ```
3. Space Settings → Variables 에서 R2 키와 `JOB_CALLBACK_SECRET` 등록

## 6. 체크리스트 (v1 beta 런칭)

- [ ] GitHub 원격 저장소 생성 + `git push -u origin main`
- [ ] HF Space 생성 + `worker/hf-space/` subtree push
- [ ] Cloudflare R2 버킷 + API 토큰 발급
- [ ] Cloudflare Pages 프로젝트 생성 + 환경변수 설정
- [ ] Supabase 프로젝트 생성 (M4 이전엔 옵션)
- [ ] `JOB_CALLBACK_SECRET` 32바이트 hex 생성 후 양쪽에 동기화
  ```bash
  openssl rand -hex 32
  ```
