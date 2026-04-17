#!/bin/bash
# HF Space 자동 배포 스크립트
# 사용법:
#   export HF_TOKEN=hf_xxx
#   bash deploy.sh YOUR_HF_USERNAME splathub-3d
#
# 스크립트가 하는 일:
#   1. HF에 빈 Space 생성 (이미 있으면 스킵)
#   2. 현재 디렉토리 내용을 Space git repo로 push
#   3. 배포 URL 출력
#
# 필요:
#   - huggingface_hub (pip install huggingface_hub)
#   - git, git-lfs
#   - HF_TOKEN 환경변수 (write 권한)

set -euo pipefail

USERNAME="${1:-}"
SPACE_NAME="${2:-splathub-3d}"

if [[ -z "$USERNAME" ]]; then
  echo "사용법: bash deploy.sh YOUR_HF_USERNAME [space_name]"
  exit 1
fi

if [[ -z "${HF_TOKEN:-}" ]]; then
  echo "Error: HF_TOKEN 환경변수가 필요합니다"
  echo "  https://huggingface.co/settings/tokens 에서 Write 권한 토큰 발급"
  echo "  export HF_TOKEN=hf_xxx"
  exit 1
fi

SPACE_ID="${USERNAME}/${SPACE_NAME}"
SPACE_URL="https://${USERNAME}-${SPACE_NAME//_/-}.hf.space"

echo "→ HF Space 생성/확인: $SPACE_ID"
python3 -c "
from huggingface_hub import HfApi, create_repo
api = HfApi(token='$HF_TOKEN')
try:
    create_repo(repo_id='$SPACE_ID', repo_type='space', space_sdk='gradio', token='$HF_TOKEN', exist_ok=True)
    print('  ✓ Space 존재 확인')
except Exception as e:
    print(f'  ! {e}')
    raise
"

echo "→ 파일 업로드"
python3 -c "
from huggingface_hub import HfApi
api = HfApi(token='$HF_TOKEN')
for f in ['app.py', 'requirements.txt', 'pre-requirements.txt', 'README.md']:
    try:
        api.upload_file(path_or_fileobj=f, path_in_repo=f, repo_id='$SPACE_ID', repo_type='space')
        print(f'  ✓ {f}')
    except Exception as e:
        print(f'  ! {f}: {e}')
"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ 배포 완료"
echo ""
echo "Space 대시보드: https://huggingface.co/spaces/$SPACE_ID"
echo "API URL: $SPACE_URL"
echo ""
echo "다음 단계 — Vercel에 환경변수 주입:"
echo "  cd apps/web"
echo "  vercel env add HF_SPACE_URL production"
echo "  → $SPACE_URL 붙여넣기"
echo "  vercel --prod --yes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
