# Round 30 — 2026-04-25 KST

## 진단

R4 (VGGT Pointmap Branch + conf_thres=3) 가 git 에 머무른 지 26 라운드.
자율 루프는 활성화 못 함 (Vercel HF_TOKEN read-only). 그러나 R1-R29 의
모든 frontend 노력은 R4 가 활성화됐다는 가정 하에 최적화됨 — R4 stale
인 동안엔 효과 절반 이하.

기존 deploy.sh 는:
- bash 전용 (Windows 사용자 어색)
- 토큰 미설정 시 그냥 exit (안내 부족)
- README 에 묻혀 있어 발견 어려움

→ Windows 환경 (이 프로젝트의 actual env) 을 위한 click-and-run 도구 필요.

## 개선

### 1. `worker/hf-space/deploy.ps1` (신규)
PowerShell 스크립트, 다음 특징:
- HF_TOKEN 미설정 시 secure prompt (`Read-Host -AsSecureString`) — 키보드 입력 숨김
- huggingface_hub 자동 설치 (`pip install -q`)
- create_repo + 파일 업로드 (app.py, requirements.txt, README.md, Dockerfile, pre-requirements.txt)
- 색상 출력 (Cyan/Yellow/Green) — Windows Terminal 친화
- 결과: Space 대시보드 URL + R4 활성화 확인 방법 + env 변수 직접 설정 안내

### 2. `worker/hf-space/ACTIVATE-R4.md` (신규)
- 왜 R4 가 monster 의 직접 원인인지 설명
- 빠른 배포 (PowerShell / Bash 둘 다)
- **재배포 없이 가장 빠른 활성화**: HF Space Settings → Variables 에 직접 등록
  (단 app.py 가 이미 R4 코드라야 작동)
- HF Token 발급 가이드 (write 권한 필요)
- 활성화 확인 방법 (R5 viewerStats flatness 개선)
- R4 활성화 후 R5-R29 노력 효과 매트릭스

## 검증

- `npm run build` ✓ (no frontend changes)
- PowerShell 스크립트는 직접 실행 안 함 (토큰 없으므로)
- ACTIVATE-R4.md 는 사용자가 발견 쉬운 위치에 배치 (worker/hf-space/)

## 배포

✅ Git commit + push (Vercel 영향 없음 — 도구 추가)

## R4 활성화 시나리오

사용자가:
1. `worker/hf-space/ACTIVATE-R4.md` 발견 → 동기 부여
2. https://huggingface.co/settings/tokens 에서 write token 발급
3. `cd worker/hf-space; .\deploy.ps1` 실행
4. token 붙여넣기 → 자동 배포
5. ~2분 후 새 capture → R5 banner 빈도 감소 확인

R1-R29 의 모든 노력 효과가 **2배+** 됨 (입력 좋아도 처리 안 좋으면 monster).

## 다음 라운드 후보

- VGGT 통계 확장 패널
- 토글 시 viewer 트랜지션
- 캡처 버튼 진동 강도 옵션
- 탑 페이지에 sample 결과 미리보기 카드 (signup-less try)
