#!/usr/bin/env bash
# SuperSplat 에디터(apps/editor) 빌드 → apps/web/public/editor-app 복사.
#
# Vercel 배포 직전에 실행하거나 로컬 개발에서 한 번 실행.
# 에디터 소스는 git subtree 로 관리되므로 상위 저장소 커밋은 필요 없음.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EDITOR_DIR="$REPO_ROOT/apps/editor"
OUT_DIR="$REPO_ROOT/apps/web/public/editor-app"

echo "==> Building SuperSplat editor..."
cd "$EDITOR_DIR"

if [ ! -d node_modules ]; then
  echo "Installing editor deps..."
  npm install
fi

npm run build

echo "==> Copying dist -> apps/web/public/editor-app"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
cp -r "$EDITOR_DIR/dist/"* "$OUT_DIR/"

echo "==> Done. Editor served from /editor-app/"
